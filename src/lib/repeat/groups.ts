import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Ticket } from "@/lib/data/types";
import { kv } from "@/lib/store/kv";
import { aiConfigured } from "@/lib/ai/insights";
import { fallbackKey, isGroupable, type IssueGroups } from "./analysis";

// "Issue" = một vấn đề cụ thể (vd "Page vượt 256KB, không publish được"), gom từ issue_summary viết tự do.
// AI (Claude Haiku) gán từng ticket Issue vào 1 nhóm; kết quả lưu KV, chỉ ticket mới mới phải gán.

const KEY = "issues:groups:v1";
const LOCK = "issues:groups:lock";
const BATCH = 60;
const MAX_BATCHES_PER_RUN = 12;

const EMPTY: IssueGroups = { groups: {}, assign: {}, updatedAt: 0 };

export async function readGroups(): Promise<IssueGroups> {
  return (await kv().get<IssueGroups>(KEY).catch(() => null)) ?? EMPTY;
}

/** Ticket Issue có tóm tắt nhưng chưa được gán nhóm. */
export function pending(tickets: Ticket[], g: IssueGroups): Ticket[] {
  return tickets.filter((t) => isGroupable(t) && !g.assign[t.id]);
}

const Out = z.object({
  newGroups: z
    .array(
      z.object({
        key: z.string().describe('Khoá tạm, vd "n1", "n2".'),
        category: z.string().describe("category_issue của nhóm (đúng như dữ liệu)."),
        title: z.string().describe("Tên issue tiếng Việt, ngắn gọn 4-10 từ, mô tả đúng vấn đề kỹ thuật/nhu cầu, không nhắc tên store."),
      }),
    )
    .describe("Nhóm mới cần tạo (chỉ khi không nhóm cũ nào khớp)."),
  items: z.array(z.object({ ref: z.number().describe("Số thứ tự ticket trong danh sách."), group: z.string().describe("id nhóm cũ hoặc key nhóm mới.") })),
});

const SYSTEM = `Bạn gom các ticket support của PageFly (app page builder trên Shopify) thành các "issue": mỗi issue là MỘT vấn đề cụ thể, có cùng triệu chứng, mà nhiều khách có thể gặp lại.
Quy tắc (rất quan trọng, ưu tiên CHÍNH XÁC hơn gom được nhiều):
- Hai ticket cùng issue CHỈ KHI cùng triệu chứng cụ thể và cùng nguyên nhân/giới hạn, dù cách viết khác nhau. Ví dụ "page exceeds 256KB limit" và "cannot publish, page size too large" là cùng issue.
- KHÔNG gom theo chủ đề chung. "Không publish được vì vượt 256KB", "publish báo lỗi Liquid", "publish xong live không cập nhật" là 3 issue khác nhau. "Countdown không chạy" khác "màu swatch bị trống".
- Phân vân thì tạo nhóm riêng. Nhóm chỉ có 1 ticket là bình thường.
- Gán vào nhóm cũ chỉ khi khớp đúng triệu chứng.
- Tên nhóm tiếng Việt, cụ thể như một dòng mô tả lỗi: nêu triệu chứng + phạm vi, ví dụ "Page vượt 256KB nên không publish được", "Nút Add to cart không phản hồi trên live". Tránh tên chung chung như "Lỗi hiển thị", "Vấn đề publish".
- Giữ category_issue của ticket cho nhóm.`;

async function assignBatch(batch: Ticket[], g: IssueGroups): Promise<void> {
  const cats = new Set(batch.map((t) => t.category_issue ?? "Khác"));
  const existing = Object.values(g.groups)
    .filter((x) => cats.has(x.category))
    .slice(0, 400)
    .map((x) => ({ id: x.id, category: x.category, title: x.title }));
  const items = batch.map((t, i) => ({ ref: i, category: t.category_issue ?? "Khác", page: t.page_issue, summary: t.issue_summary }));
  const client = new Anthropic();
  const res = await client.messages.parse({
    // Gom nhóm cần chính xác hơn nhận định → model mạnh hơn; chạy ít (chỉ ticket mới).
    model: process.env.ANTHROPIC_GROUP_MODEL ?? "claude-sonnet-5-5",
    max_tokens: 12000,
    system: SYSTEM,
    messages: [{ role: "user", content: `Nhóm đã có (JSON):\n${JSON.stringify(existing)}\n\nTicket cần gán (JSON):\n${JSON.stringify(items)}` }],
    output_config: { format: zodOutputFormat(Out) },
  });
  const out = res.parsed_output;
  if (!out) throw new Error("AI không trả về kết quả phân nhóm");
  const now = Date.now();
  const keyToId = new Map<string, string>();
  for (const n of out.newGroups) {
    const id = `g${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    keyToId.set(n.key, id);
    g.groups[id] = { id, category: n.category, title: n.title.trim(), createdAt: now };
  }
  for (const it of out.items) {
    const t = batch[it.ref];
    if (!t) continue;
    const id = keyToId.get(it.group) ?? (g.groups[it.group] ? it.group : null);
    if (id) g.assign[t.id] = id;
  }
  // AI bỏ sót ticket nào thì tạo nhóm riêng cho ticket đó, để lần sau không phải gán lại mãi.
  for (const t of batch) {
    if (g.assign[t.id]) continue;
    const id = `g${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    g.groups[id] = { id, category: t.category_issue ?? "Khác", title: (t.issue_summary ?? "").slice(0, 90), createdAt: now };
    g.assign[t.id] = id;
  }
}

/**
 * Gán nhóm cho ticket Issue mới (tối đa vài batch mỗi lần chạy). Có khoá để không chạy chồng.
 * Gọi ngầm (after()) khi mở trang Thống kê và trong cron hằng ngày.
 */
export async function ensureGroups(tickets: Ticket[], opts: { maxBatches?: number } = {}): Promise<{ assigned: number; remaining: number }> {
  if (!aiConfigured()) return { assigned: 0, remaining: 0 };
  const store = kv();
  let g = await readGroups();
  let todo = pending(tickets, g);
  if (!todo.length) return { assigned: 0, remaining: 0 };
  if (await store.get(LOCK)) return { assigned: 0, remaining: todo.length };
  await store.set(LOCK, Date.now(), 180);
  let assigned = 0;
  try {
    // Gom theo từng category: AI thấy cả category cùng lúc nên nhóm nhất quán hơn.
    const byCat = new Map<string, Ticket[]>();
    for (const t of [...todo].sort((a, b) => (a.derived.at ?? 0) - (b.derived.at ?? 0))) {
      const k = t.category_issue ?? "Khác";
      byCat.set(k, [...(byCat.get(k) ?? []), t]);
    }
    const batches = [...byCat.values()].flatMap((ts) => Array.from({ length: Math.ceil(ts.length / BATCH) }, (_, i) => ts.slice(i * BATCH, (i + 1) * BATCH)));
    for (const batch of batches.slice(0, opts.maxBatches ?? MAX_BATCHES_PER_RUN)) {
      g = await readGroups();
      await assignBatch(batch, g);
      g.updatedAt = Date.now();
      await store.set(KEY, g);
      assigned += batch.length;
    }
    todo = pending(tickets, g);
  } finally {
    await store.del(LOCK);
  }
  return { assigned, remaining: todo.length };
}

export { fallbackKey };
