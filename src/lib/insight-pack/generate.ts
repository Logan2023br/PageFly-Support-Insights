import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { loadDataset } from "@/lib/data";
import { addDays, vnDayKey } from "@/lib/data/parse";
import { weekStart } from "@/lib/reports";
import { readGroups } from "@/lib/repeat/groups";
import { kv } from "@/lib/store/kv";
import { buildFacts } from "./facts";
import { AREAS, PRIORITIES, type Insight, type InsightPack, type PackFocus, type PackIndexEntry, type PackPart } from "./types";

// Insight Pack mỗi tuần: code tính kho bằng chứng → gửi 5 mảng phân tích qua Message Batches API (chạy bất đồng bộ,
// không bị giới hạn thời gian hàm của Vercel) → khi xong: kiểm tra dẫn chứng → AI gộp insight trùng → lưu.

// Mọi tính năng AI dùng chung 1 model (mặc định Claude Haiku 4.5), đổi bằng biến ANTHROPIC_MODEL.
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5";
const INDEX = "insightpack:index";
const recKey = (id: string) => `insightpack:${id}`;
export const FOCUSES: PackFocus[] = ["bug", "product", "support", "revenue", "overview"];
const RANK = { critical: 0, high: 1, medium: 2, low: 3 } as const;
/** Quá lâu vẫn "đang tạo" → coi là lỗi để tạo lại được. */
const STUCK_MS = 26 * 3600 * 1000; // batch tối đa 24h

const FOCUS_BRIEF: Record<PackFocus, { areas: string[]; brief: string }> = {
  bug: {
    areas: ["bug", "product"],
    brief:
      "Lỗi sản phẩm cần Dev sửa và thứ tự ưu tiên: issue lặp lại nhiều store gặp, lỗi gây churn / chặn publish / chặn bán hàng (ATC, checkout), lỗi đang chờ Dev lâu, lỗi tăng so với tuần trước. Với mỗi lỗi: ảnh hưởng (bao nhiêu store, plan nào, doanh thu), dấu hiệu nguyên nhân kỹ thuật từ tóm tắt ticket, đề xuất sửa cụ thể hoặc workaround tạm cho CS.",
  },
  product: {
    areas: ["product", "docs"],
    brief:
      "Phát triển sản phẩm: giới hạn / thiếu tính năng khiến khách phải liên hệ (vd giới hạn Shopify 256KB, theme, app bên thứ 3), yêu cầu tính năng lặp lại, chỗ UX gây nhầm, câu hỏi how-to lặp lại có thể giải bằng tài liệu / tooltip / onboarding / cảnh báo trong app / Flymate AI. Đề xuất thay đổi sản phẩm cụ thể và ước tính số ticket giảm được.",
  },
  support: {
    areas: ["support", "team", "docs"],
    brief:
      "Quy trình support và đội ngũ: tốc độ phản hồi theo ca / giờ (thiếu người lúc cao điểm?), tỷ lệ resolved, ticket hết ca chưa xong, chuyển TS/Dev có cần thiết không, FL/TS cần kèm cặp (chỉ ra người, dựa trên số), macro / câu trả lời mẫu cho issue lặp lại, mood khách xấu đi vì đâu, CSAT thấp ở loại ticket nào. Đề xuất thay đổi quy trình, lịch ca, đào tạo cụ thể.",
  },
  revenue: {
    areas: ["revenue", "customer", "review"],
    brief:
      "Khách hàng và doanh thu: store churn risk (plan, doanh thu, lý do) và cách giữ chân, cơ hội upsell đang bị bỏ lỡ, nhóm khách (plan, tenure, Shopify plan, quốc gia) gặp nhiều vấn đề, phễu mời review (bỏ lỡ bao nhiêu, FL nào), góp ý / feedback của khách. Đề xuất hành động cụ thể cho CS / Marketing / Partner kèm danh sách store cần liên hệ.",
  },
  overview: {
    areas: ["data", "customer", "support", "product"],
    brief:
      "Góc nhìn tổng quan cả tuần: thay đổi lớn nhất so với tuần trước và 8 tuần, bất thường, mối liên hệ giữa các mảng (vd lỗi X → churn Y → review thấp), rủi ro sắp tới, chất lượng dữ liệu recap (thiếu cột, ghi sai). Viết thêm headline (1 câu) và summary (3-5 câu) tóm tắt tuần. Không lặp lại insight chi tiết thuộc các mảng lỗi / sản phẩm / support / doanh thu — chỉ insight xuyên suốt.",
  },
};

const InsightOut = z.object({
  title: z.string().describe("Tiêu đề hành động được, cụ thể, tối đa 16 từ (vd 'Thêm cảnh báo 256KB trong editor trước khi publish')."),
  area: z.enum(AREAS),
  priority: z.enum(PRIORITIES).describe("critical = mất tiền / mất khách ngay; high = ảnh hưởng nhiều store; medium; low."),
  confidence: z.enum(["high", "medium", "low"]).describe("Mức chắc chắn dựa trên lượng dữ liệu (ít ticket / kỳ so sánh <10 ticket → low)."),
  summary: z.string().describe("1-2 câu: vấn đề + đề xuất chính."),
  problem: z.string().describe("Vấn đề thực tế, có số liệu từ kho bằng chứng."),
  rootCause: z.string().describe("Nguyên nhân gốc (hoặc giả thuyết có căn cứ) — giải thích vì sao từ bằng chứng."),
  evidence: z.array(z.object({ factId: z.string().describe("id CHÍNH XÁC trong kho bằng chứng"), observation: z.string().describe("Điều bằng chứng này cho thấy, trích số liệu của nó.") })).describe("2-6 bằng chứng."),
  ticketIds: z.array(z.string()).describe("id ticket minh hoạ (lấy đúng id trong danh sách ticket), 0-12."),
  solution: z.array(z.object({ step: z.string(), owner: z.string().describe("CS / FL / TS / Shift lead / Dev / Product / Marketing / Partner / tên người"), effort: z.enum(["S", "M", "L"]) })).describe("2-6 bước giải pháp cụ thể, làm được ngay."),
  impact: z.object({
    metric: z.string().describe("Chỉ số sẽ thay đổi."),
    estimate: z.string().describe("Ước tính định lượng, vd 'giảm ~15-20 ticket/tháng', 'giữ ~$300/tháng doanh thu'."),
    basis: z.string().describe("Cách ước tính: phép tính từ số liệu trong kho và giả định rõ ràng."),
  }),
  measure: z.object({ factId: z.string().describe("id bằng chứng dùng để theo dõi kết quả (rỗng nếu không có)"), target: z.string().describe("Mục tiêu đo được sau 2-4 tuần.") }),
  charts: z.array(z.string()).describe("1-3 factId có series hoặc rows để vẽ biểu đồ minh hoạ."),
  tags: z.array(z.string()).describe("2-5 từ khoá ngắn (category, tính năng, team)."),
});
const PartOut = z.object({
  headline: z.string().describe("Chỉ dùng ở mảng tổng quan; mảng khác để rỗng."),
  summary: z.string().describe("Chỉ dùng ở mảng tổng quan; mảng khác để rỗng."),
  insights: z.array(InsightOut).describe("Không giới hạn số lượng — mọi insight có giá trị thật, không trùng nhau, có bằng chứng."),
});

const SYSTEM = `Bạn là nhóm chuyên gia (Head of Product, Head of Support, Customer Success, Growth) phân tích dữ liệu support hằng tuần của PageFly — app page builder trên Shopify (khách là chủ store Shopify; support qua Crisp; FL = front-line trả lời đầu, TS = technical support, Dev = lập trình viên).
Nhiệm vụ: tìm INSIGHT thật sự giúp công ty cải tiến — mỗi insight là một phát hiện + giải pháp làm được, không phải đọc lại chỉ số.

Quy tắc bắt buộc về dữ liệu (rất quan trọng):
- Chỉ dùng dữ liệu trong "Kho bằng chứng" và "Ticket tuần này". Mọi con số bạn viết phải có trong kho, hoặc tính trực tiếp từ số trong kho (ghi phép tính ở impact.basis). Không bịa số, không suy diễn số liệu không có.
- evidence[].factId, measure.factId, charts[] phải là id có thật trong kho (chép y nguyên). ticketIds phải là id có trong danh sách ticket.
- Khi kỳ so sánh có ít dữ liệu (dưới 10 ticket) thì không kết luận xu hướng tăng/giảm; nói rõ và hạ confidence.
- Phân biệt rõ đâu là sự thật trong dữ liệu, đâu là giả thuyết.

Quy tắc về chất lượng insight:
- Mỗi insight phải trả lời: chuyện gì đang xảy ra (có số) → vì sao (nguyên nhân, bằng chứng) → làm gì cụ thể (ai làm, mức công sức) → được gì (ước tính định lượng + cơ sở) → đo thế nào (chỉ số + mục tiêu).
- Ưu tiên insight có tác động lớn: mất doanh thu, mất khách, nhiều store gặp lại, tốn nhiều thời gian support, chặn khách bán hàng.
- Đọc kỹ nội dung từng ticket (issue, next, upsell, fb) để tìm mẫu hình mà chỉ số không thấy được.
- Không giới hạn số lượng insight, nhưng không viết insight trùng nhau hay chung chung ("cần cải thiện chất lượng"). Một insight tốt cụ thể tới mức đội có thể bắt tay làm ngay thứ 2.
- Viết tiếng Việt tự nhiên, ngắn gọn, giữ thuật ngữ PageFly/Shopify (publish, section, theme, ATC, slot, plan…).`;

// ---------- Lưu trữ ----------

export async function listPacks(): Promise<PackIndexEntry[]> {
  const list = (await kv().get<PackIndexEntry[]>(INDEX).catch(() => null)) ?? [];
  return list.sort((a, b) => b.from.localeCompare(a.from) || b.createdAt - a.createdAt);
}

export async function readPack(id: string, opts: { collect?: boolean } = {}): Promise<InsightPack | null> {
  if (opts.collect) await collectPack(id).catch(() => undefined);
  const p = await kv().get<InsightPack>(recKey(id)).catch(() => null);
  if (p?.status === "running" && Date.now() - p.createdAt > STUCK_MS) return { ...p, status: "error", error: "Quá lâu chưa có kết quả, bấm tạo lại." };
  return p;
}

async function upsertIndex(p: InsightPack) {
  const store = kv();
  const list = (await store.get<PackIndexEntry[]>(INDEX)) ?? [];
  const entry: PackIndexEntry = {
    id: p.id,
    from: p.from,
    to: p.to,
    label: p.label,
    status: p.status,
    createdAt: p.createdAt,
    count: p.insights.length,
    critical: p.insights.filter((i) => i.priority === "critical").length,
    high: p.insights.filter((i) => i.priority === "high").length,
    auto: p.auto,
  };
  await store.set(INDEX, [...list.filter((e) => e.id !== p.id), entry]);
}

export async function deletePack(id: string) {
  const store = kv();
  const list = (await store.get<PackIndexEntry[]>(INDEX)) ?? [];
  await store.set(INDEX, list.filter((e) => e.id !== id));
  await store.del(recKey(id));
}

// ---------- Kỳ ----------

/** Tuần đã kết thúc gần nhất (thứ 2 → chủ nhật) hoặc tuần đang chạy tới hôm nay. */
export function packWeek(which: "last" | "current", today = vnDayKey(Date.now())): { from: string; to: string; label: string } {
  const mon = weekStart(today);
  const from = which === "last" ? addDays(mon, -7) : mon;
  const to = which === "last" ? addDays(from, 6) : today;
  const dmy = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`;
  return { from, to, label: `Tuần ${dmy(from)} – ${dmy(to)}/${to.slice(0, 4)}${which === "current" ? " (đến hôm nay)" : ""}` };
}

// ---------- Tạo ----------

export async function startPack(opts: { which: "last" | "current"; auto: boolean; createdBy: string }): Promise<InsightPack> {
  const today = vnDayKey(Date.now());
  const w = packWeek(opts.which, today);
  const ds = await loadDataset({ force: true });
  const groups = await readGroups();
  const bundle = buildFacts(ds.tickets, w.from, w.to, groups, today);
  const id = `${w.from}_${w.to}`;
  const pack: InsightPack = {
    id,
    from: w.from,
    to: w.to,
    label: w.label,
    status: "running",
    auto: opts.auto,
    createdAt: Date.now(),
    createdBy: opts.createdBy,
    model: MODEL,
    totals: bundle.totals,
    facts: bundle.facts,
    tickets: bundle.tickets,
    insights: [],
    parts: Object.fromEntries(FOCUSES.map((f) => [f, { status: "running" }])),
  };
  pack.batchId = await submitBatch(pack, bundle.digest);
  const store = kv();
  await store.set(recKey(id), pack);
  await upsertIndex(pack);
  return pack;
}

function catalog(p: InsightPack): string {
  const facts = Object.values(p.facts).map((f) => ({
    id: f.id,
    label: f.label,
    note: f.note,
    value: f.value,
    prev: f.prev,
    delta: f.delta,
    rows: f.rows?.slice(0, 25).map((r) => [r.key, r.display ?? r.value, r.extra].filter((x) => x != null && x !== "")),
    weekly: f.series?.map((s) => `${s.label}:${s.v == null ? "—" : Math.round(s.v * 100) / 100}`).join(" "),
    tickets: f.ticketIds?.length ? f.ticketIds : undefined,
  }));
  return JSON.stringify(facts);
}

function partRequest(p: InsightPack, digest: unknown[], focus: PackFocus): Anthropic.Messages.MessageCreateParamsNonStreaming {
  const b = FOCUS_BRIEF[focus];
  const fmt = zodOutputFormat(PartOut);
  return {
    model: MODEL,
    max_tokens: 64000,
    // Haiku 4.5 dùng thinking theo ngân sách token (không có adaptive / effort).
    thinking: { type: "enabled", budget_tokens: 16000 },
    output_config: { format: { type: fmt.type, schema: fmt.schema } },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Tuần phân tích: ${p.label} (${p.from} → ${p.to}). Tuần này: ${p.totals.tickets} ticket, ${p.totals.issues} ticket Issue, ${p.totals.stores} store. Chuỗi "weekly" là 8 tuần, tuần cuối là tuần này.\n\n## Kho bằng chứng (JSON)\n${catalog(p)}\n\n## Ticket tuần này (JSON)\n${JSON.stringify(digest)}`,
            cache_control: { type: "ephemeral" },
          },
          { type: "text", text: `## Mảng bạn phụ trách: ${b.brief}\nChỉ dùng area trong: ${b.areas.join(", ")}. Hãy làm hết mình: rà toàn bộ kho bằng chứng và từng ticket, viết mọi insight có giá trị cho mảng này.` },
        ],
      },
    ],
  };
}

/** Gửi 5 mảng phân tích thành 1 batch. */
async function submitBatch(p: InsightPack, digest: unknown[]): Promise<string> {
  const client = new Anthropic();
  const batch = await client.messages.batches.create({ requests: FOCUSES.map((f) => ({ custom_id: f, params: partRequest(p, digest, f) })) });
  return batch.id;
}

/**
 * Kiểm tra batch của pack đang tạo; xong thì lấy kết quả, kiểm tra dẫn chứng, gộp trùng và lưu.
 * Gọi khi có người mở / hỏi trạng thái pack và trong cron hằng ngày. Có khoá để không xử lý chồng.
 */
export async function collectPack(id: string): Promise<void> {
  const store = kv();
  const p = await store.get<InsightPack>(recKey(id));
  if (!p || p.status !== "running" || !p.batchId) return;
  const lock = `${recKey(id)}:lock`;
  if (await store.get(lock)) return;
  await store.set(lock, Date.now(), 280);
  try {
    const client = new Anthropic();
    const batch = await client.messages.batches.retrieve(p.batchId);
    if (batch.processing_status !== "ended") {
      const c = batch.request_counts;
      p.progress = { done: c.succeeded + c.errored + c.canceled + c.expired, total: FOCUSES.length };
      await store.set(recKey(id), p);
      return;
    }
    const parts: Partial<Record<PackFocus, PackPart>> = {};
    for await (const r of await client.messages.batches.results(p.batchId)) {
      const focus = r.custom_id as PackFocus;
      if (r.result.type !== "succeeded") {
        parts[focus] = { status: "error", error: r.result.type === "errored" ? "Lỗi khi AI phân tích" : r.result.type === "expired" ? "Hết hạn xử lý" : "Đã huỷ" };
        continue;
      }
      const msg = r.result.message;
      const text = msg.content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("");
      let parsed: z.infer<typeof PartOut> | null = null;
      try {
        const res = PartOut.safeParse(JSON.parse(text));
        parsed = res.success ? res.data : null;
      } catch {}
      parts[focus] = parsed
        ? { status: "done", insights: validate(parsed.insights, p, focus), headline: parsed.headline || undefined, summary: parsed.summary || undefined }
        : { status: "error", error: msg.stop_reason === "refusal" ? "AI từ chối phân tích" : msg.stop_reason === "max_tokens" ? "Kết quả quá dài, bị cắt" : "AI không trả về đúng định dạng" };
    }
    const ok = FOCUSES.filter((f) => parts[f]?.status === "done");
    const merged = ok.flatMap((f) => parts[f]!.insights ?? []);
    p.insights = (await dedupe(merged)).sort((a, b) => RANK[a.priority] - RANK[b.priority] || a.area.localeCompare(b.area));
    p.parts = Object.fromEntries(FOCUSES.map((f) => [f, { status: parts[f]?.status ?? "error", error: parts[f]?.error, count: parts[f]?.insights?.length }]));
    p.headline = parts.overview?.headline;
    p.summary = parts.overview?.summary;
    p.status = ok.length ? "done" : "error";
    p.error = ok.length ? undefined : (FOCUSES.map((f) => parts[f]?.error).find(Boolean) ?? "Không có kết quả");
    p.finishedAt = Date.now();
    await store.set(recKey(id), p);
    await upsertIndex(p);
  } catch (err) {
    // Lỗi tạm thời (mạng, API): để lần kiểm tra sau thử lại.
    console.error("collectPack", err instanceof Error ? err.message : err);
  } finally {
    await store.del(lock);
  }
}

/** Kiểm tra mọi pack đang tạo (dùng trong cron). */
export async function collectRunning(): Promise<void> {
  for (const e of await listPacks()) if (e.status === "running") await collectPack(e.id);
}

const Dedupe = z.object({
  groups: z.array(z.object({ keep: z.string().describe("id insight giữ lại (đầy đủ, cụ thể nhất)"), drop: z.array(z.string()).describe("id các insight trùng ý sẽ gộp vào") })),
});

/** Các mảng có thể viết trùng ý nhau: AI chỉ ra nhóm trùng, code gộp dẫn chứng / ticket vào bản giữ lại. */
async function dedupe(list: Insight[]): Promise<Insight[]> {
  if (list.length < 2) return list;
  try {
    const client = new Anthropic();
    const res = await client.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      output_config: { format: zodOutputFormat(Dedupe) },
      system: "Bạn rà danh sách insight do nhiều nhóm viết độc lập và tìm các insight TRÙNG Ý: cùng vấn đề VÀ cùng giải pháp chính (vd hai insight cùng đề xuất thêm cảnh báo 256KB trong editor). Chỉ gộp khi thật sự trùng; hai insight cùng chủ đề nhưng giải pháp khác (vd làm tài liệu vs sửa sản phẩm) thì KHÔNG gộp. Với mỗi nhóm trùng, giữ insight đầy đủ, cụ thể nhất.",
      messages: [{ role: "user", content: JSON.stringify(list.map((i) => ({ id: i.id, area: i.area, title: i.title, summary: i.summary, solution: i.solution.map((x) => x.step) }))) }],
    });
    const groups = res.parsed_output?.groups ?? [];
    const byId = new Map(list.map((i) => [i.id, i]));
    const dropped = new Set<string>();
    for (const g of groups) {
      const keep = byId.get(g.keep);
      if (!keep || dropped.has(g.keep)) continue;
      for (const d of g.drop) {
        const other = byId.get(d);
        if (!other || d === g.keep || dropped.has(d)) continue;
        dropped.add(d);
        keep.ticketIds = [...new Set([...keep.ticketIds, ...other.ticketIds])].slice(0, 15);
        for (const e of other.evidence) if (!keep.evidence.some((x) => x.factId === e.factId)) keep.evidence.push(e);
        keep.tags = [...new Set([...keep.tags, ...other.tags])].slice(0, 6);
        if (RANK[other.priority] < RANK[keep.priority]) keep.priority = other.priority;
      }
    }
    return list.filter((i) => !dropped.has(i.id));
  } catch {
    return list;
  }
}

/** Chỉ giữ dẫn chứng / ticket / biểu đồ có thật trong kho. Insight không còn bằng chứng nào thì bỏ. */
function validate(list: z.infer<typeof InsightOut>[], p: InsightPack, focus: PackFocus): Insight[] {
  const out: Insight[] = [];
  list.forEach((it, i) => {
    const evidence = it.evidence.filter((e) => p.facts[e.factId]);
    if (!evidence.length) return;
    const chartable = (id: string) => Boolean(p.facts[id]?.series?.length || p.facts[id]?.rows?.length);
    let charts = it.charts.filter(chartable);
    if (!charts.length) charts = evidence.map((e) => e.factId).filter(chartable).slice(0, 1);
    out.push({
      ...it,
      id: `${focus}-${i + 1}`,
      evidence,
      ticketIds: [...new Set(it.ticketIds)].filter((x) => p.tickets[x]),
      charts: [...new Set(charts)].slice(0, 3),
      measure: { factId: p.facts[it.measure.factId] ? it.measure.factId : null, target: it.measure.target },
    });
  });
  return out;
}


