import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { createHash } from "node:crypto";
import { z } from "zod";

export const InsightSchema = z.object({
  headline: z.string().describe("Một câu kết luận quan trọng nhất, tối đa 30 từ."),
  insights: z
    .array(
      z.object({
        title: z.string().describe("Tiêu đề ngắn, tối đa 10 từ."),
        detail: z.string().describe("Giải thích 1-3 câu, có số liệu cụ thể lấy từ dữ liệu và nguyên nhân có thể."),
        severity: z.enum(["critical", "warning", "info", "positive"]),
      }),
    )
    .describe("3-6 nhận định, xếp theo mức độ quan trọng."),
  metricNotes: z
    .array(z.object({ key: z.string().describe("key chỉ số/nhóm trong dữ liệu"), comment: z.string().describe("Nhận định 1-2 câu cho chỉ số này.") }))
    .describe("Nhận định riêng cho từng chỉ số có alert (chỉ khi dữ liệu có comparisons). Mảng rỗng nếu không có."),
  actions: z.array(z.object({ owner: z.string().describe("CS / Dev / Marketing / Partner / Shift lead / tên người"), action: z.string() })).describe("2-5 hành động cụ thể nên làm tiếp."),
});
export type Insight = z.infer<typeof InsightSchema>;

export type InsightKind = "overview" | "compare" | "report-cs" | "report-dev" | "report-marketing";

const SYSTEM = `Bạn là chuyên gia phân tích dữ liệu customer support của PageFly (app page builder trên Shopify, ~150 nhân sự).
Người đọc: lead các team CS, Dev, Marketing, Partner. Viết tiếng Việt, ngắn gọn, đi thẳng vào vấn đề.

Quy tắc bắt buộc:
- CHỈ dùng số liệu có trong dữ liệu JSON được cung cấp. Không tự đếm lại, không bịa số, không suy diễn số mới.
- Mỗi nhận định phải trích ít nhất một con số cụ thể từ dữ liệu.
- Khi dữ liệu có "comparisons", ưu tiên các mục có alert "critical" rồi "warning"; giải thích vì sao đáng lo dựa vào "evidence" và ticket mẫu (ví dụ: tăng 4 case kèm khách đòi gỡ app là đáng báo động).
- Phân biệt rõ nguyên nhân do sản phẩm (bug, giới hạn tính năng) và do quy trình support (phản hồi chậm, giải thích chưa rõ).
- Hành động phải cụ thể, giao đúng team.`;

const TASK: Record<InsightKind, string> = {
  overview: "Phân tích tổng quan khoảng thời gian đã chọn: điểm nóng, rủi ro, cơ hội.",
  compare: "So sánh kỳ hiện tại với kỳ trước. Viết metricNotes cho TỪNG mục có alert trong comparisons và breakdowns (dùng đúng key).",
  "report-cs": "Viết nhận định báo cáo cho team CS: hiệu suất FL/TS, tốc độ phản hồi, chất lượng, review.",
  "report-dev": "Viết nhận định báo cáo cho team Dev: nhóm lỗi nổi bật, lỗi lặp lại (dev_note), backlog chờ dev, ưu tiên fix.",
  "report-marketing": "Viết nhận định báo cáo cho team Marketing/Partner: review, churn, upsell, góp ý và yêu cầu tính năng, app bên thứ 3.",
};

interface CacheEntry {
  at: number;
  value: Insight;
}
const g = globalThis as unknown as { __pfAiCache?: Map<string, CacheEntry>; __pfAiInflight?: Map<string, Promise<Insight>> };
const cache = (g.__pfAiCache ??= new Map());
// Yêu cầu trùng đang chờ (vd. 2 người mở cùng Compare) dùng chung 1 lần gọi API.
const inflight = (g.__pfAiInflight ??= new Map());
const TTL = 6 * 3600 * 1000;

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export class AiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export async function generateInsight(kind: InsightKind, facts: unknown): Promise<{ insight: Insight; cached: boolean; model: string }> {
  const model = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5";
  const payload = JSON.stringify(facts);
  const key = createHash("sha256").update(`${model}|${kind}|${payload}`).digest("hex");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return { insight: hit.value, cached: true, model };

  if (!aiConfigured()) throw new AiError("Chưa cấu hình ANTHROPIC_API_KEY trong .env.local", 503);

  const pending = inflight.get(key);
  if (pending) return { insight: await pending, cached: true, model };
  const promise = callModel(model, kind, payload);
  inflight.set(key, promise);
  try {
    const insight = await promise;
    cache.set(key, { at: Date.now(), value: insight });
    return { insight, cached: false, model };
  } finally {
    inflight.delete(key);
  }
}

async function callModel(model: string, kind: InsightKind, payload: string): Promise<Insight> {
  const client = new Anthropic();
  try {
    const response = await client.messages.parse({
      model,
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{ role: "user", content: `${TASK[kind]}\n\nDữ liệu (JSON):\n${payload}` }],
      output_config: { format: zodOutputFormat(InsightSchema) },
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) {
      throw new AiError("AI không trả về kết quả hợp lệ, thử lại sau.", 502);
    }
    return response.parsed_output;
  } catch (err) {
    if (err instanceof AiError) throw err;
    if (err instanceof Anthropic.AuthenticationError) throw new AiError("API key Anthropic không hợp lệ.", 401);
    if (err instanceof Anthropic.RateLimitError) throw new AiError("Vượt giới hạn gọi AI, thử lại sau ít phút.", 429);
    if (err instanceof Anthropic.APIConnectionError) throw new AiError("Không kết nối được tới Anthropic API.", 502);
    if (err instanceof Anthropic.APIError) throw new AiError(`Lỗi Anthropic API (${err.status}): ${err.message}`, 502);
    throw new AiError(err instanceof Error ? err.message : "Lỗi không xác định", 500);
  }
}
