import type { Ticket } from "@/lib/data/types";
import { missingOf } from "@/lib/data/availability";

export type Polarity = "up-good" | "down-good" | "neutral";
export type MetricFormat = "count" | "pct" | "duration" | "money" | "score5";
export type MetricGroup = "volume" | "routing" | "quality" | "customer";

export interface MetricDef {
  key: string;
  label: string;
  group: MetricGroup;
  format: MetricFormat;
  polarity: Polarity;
  hint: string;
  /** Tăng là báo động ngay (churn, angry, urgent...). */
  critical?: boolean;
  /** Ticket "thuộc" chỉ số — dùng để đếm và để drill-down khi bấm vào ô. */
  match?: (t: Ticket) => boolean;
  compute: (ts: Ticket[]) => number | null;
  /** Cột sheet cần có để chỉ số có nghĩa. Thiếu cột → giá trị null ("—"), không hiện 0 gây hiểu nhầm. */
  requires?: string[];
}

export const GROUP_TITLES: Record<MetricGroup, string> = {
  volume: "Khối lượng",
  routing: "Phân luồng xử lý",
  quality: "Chất lượng support",
  customer: "Khách hàng & kinh doanh",
};

const count = (match: (t: Ticket) => boolean) => (ts: Ticket[]) => ts.filter(match).length;

function rate(num: (t: Ticket) => boolean, base: (t: Ticket) => boolean) {
  return (ts: Ticket[]) => {
    const b = ts.filter(base);
    return b.length ? b.filter(num).length / b.length : null;
  };
}

function avg(sel: (t: Ticket) => number | null) {
  return (ts: Ticket[]) => {
    const vals = ts.map(sel).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  };
}

function median(sel: (t: Ticket) => number | null) {
  return (ts: Ticket[]) => {
    const vals = ts
      .map(sel)
      .filter((v): v is number => v != null)
      .sort((a, b) => a - b);
    if (!vals.length) return null;
    const mid = Math.floor(vals.length / 2);
    return vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
  };
}

const isIssue = (t: Ticket) => t.category_ticket === "Issue";
const isRefund = (t: Ticket) => t.category_issue === "Refund" || t.team_owner === "Billing/Refund";
const isFreeService = (t: Ticket) => t.category_issue === "Free service" || t.team_owner === "Free service";

export const METRICS: MetricDef[] = [
  // ── Khối lượng ──
  { key: "total", label: "Tổng ticket", group: "volume", format: "count", polarity: "neutral", hint: "Số ticket (Feedback + Issue + Improve) có lúc khách contact nằm trong kỳ. Một session recap nhiều lần chỉ tính 1.", match: () => true, compute: (ts) => ts.length },
  { key: "feedback", label: "Feedback", group: "volume", format: "count", polarity: "neutral", hint: "Những góp ý của khách.", match: (t) => t.category_ticket === "Feedback", compute: count((t) => t.category_ticket === "Feedback") },
  { key: "issue", label: "Issue", group: "volume", format: "count", polarity: "down-good", hint: "Vấn đề khách gặp phải.", match: isIssue, compute: count(isIssue) },
  { key: "improve", label: "Improve", group: "volume", format: "count", polarity: "neutral", hint: "Chức năng khách muốn có.", match: (t) => t.category_ticket === "Improve", compute: count((t) => t.category_ticket === "Improve") },

  // ── Phân luồng ──
  { key: "fl_self", label: "Issue FL tự xử lý", group: "routing", format: "count", polarity: "neutral", hint: "Issue không chuyển TS, không cần Dev.", match: (t) => isIssue(t) && t.derived.handler === "FL", compute: count((t) => isIssue(t) && t.derived.handler === "FL") },
  { key: "ts_handled", label: "Issue TS xử lý", group: "routing", format: "count", polarity: "down-good", hint: "Issue có TS tham gia, không cần Dev.", match: (t) => isIssue(t) && t.derived.handler === "TS", compute: count((t) => isIssue(t) && t.derived.handler === "TS") },
  { key: "dev_needed", label: "Issue cần Dev", group: "routing", format: "count", polarity: "down-good", hint: "Role có Dev, đợi dev check, cần dev note hoặc team phụ trách là Dev.", match: (t) => t.derived.handler === "Dev", compute: count((t) => t.derived.handler === "Dev") },
  { key: "refund", label: "Refund", group: "routing", format: "count", polarity: "down-good", critical: true, hint: "Nhóm issue = Refund (hoặc team phụ trách = Billing/Refund).", match: isRefund, compute: count(isRefund) },
  { key: "marketing", label: "Chuyển Marketing", group: "routing", format: "count", polarity: "neutral", hint: "Team phụ trách = Marketing.", match: (t) => t.team_owner === "Marketing", compute: count((t) => t.team_owner === "Marketing") },
  { key: "partner", label: "Chuyển Partner", group: "routing", format: "count", polarity: "neutral", hint: "Team phụ trách = Partner.", match: (t) => t.team_owner === "Partner", compute: count((t) => t.team_owner === "Partner") },
  { key: "free_service", label: "Free service", group: "routing", format: "count", polarity: "neutral", hint: "Nhóm issue = Free service (hoặc team phụ trách = Free service).", match: isFreeService, compute: count(isFreeService) },
  { key: "fl_self_rate", label: "Tỷ lệ FL tự xử lý", group: "routing", format: "pct", polarity: "up-good", hint: "= Issue FL tự xử lý (không chuyển TS, không cần Dev) ÷ tổng Issue.", compute: rate((t) => t.derived.handler === "FL", isIssue) },

  // ── Chất lượng ──
  { key: "resolved_rate", label: "Tỷ lệ resolved", group: "quality", format: "pct", polarity: "up-good", hint: "= Ticket \"Đã resolved\" ÷ ticket có ghi kết quả xử lý. Ticket \"Chờ khách phản hồi\" vẫn nằm trong mẫu số.", compute: rate((t) => t.derived.resolved, (t) => t.resolution != null) },
  { key: "waiting_customer", label: "Chờ khách phản hồi", group: "quality", format: "count", polarity: "neutral", hint: "Bên mình đã xử lý xong phần việc, đang chờ khách trả lời. Không tính là tồn của support.", match: (t) => t.resolution === "Chờ khách phản hồi", compute: count((t) => t.resolution === "Chờ khách phản hồi") },
  { key: "unresolved_shift", label: "Hết ca chưa xong", group: "quality", format: "count", polarity: "down-good", hint: "Hai bên còn đang trao đổi nhưng FL hết ca, ticket chưa xong (tồn thật của support).", match: (t) => t.resolution === "Hết ca vẫn chưa giải quyết", compute: count((t) => t.resolution === "Hết ca vẫn chưa giải quyết") },
  { key: "first_reply", label: "Phản hồi đầu (TB)", group: "quality", format: "duration", polarity: "down-good", hint: "= Trung bình (lúc PIC trả lời đầu tiên − lúc khách contact). Dễ bị kéo lên bởi vài ca rất chậm.", compute: avg((t) => t.derived.firstReplySec) },
  { key: "first_reply_median", label: "Phản hồi đầu (trung vị)", group: "quality", format: "duration", polarity: "down-good", hint: "= Trung vị (lúc PIC trả lời đầu tiên − lúc khách contact): xếp các ca từ nhanh đến chậm, lấy ca ở giữa. Phản ánh trải nghiệm của đa số khách.", compute: median((t) => t.derived.firstReplySec) },
  { key: "handle_time", label: "Thời gian handle (trung vị)", group: "quality", format: "duration", polarity: "down-good", hint: "Trung vị thời gian handle (TS nếu có TS, ngược lại FL). Dùng trung vị vì vài ticket kéo dài nhiều ngày làm trung bình bị lệch.", compute: median((t) => t.total_time_handle) },
  { key: "ticket_time", label: "Tổng thời gian ticket (trung vị)", group: "quality", format: "duration", polarity: "down-good", hint: "Trung vị total_time_ticket (ít bị ảnh hưởng bởi ticket kéo dài nhiều ngày).", compute: median((t) => t.total_time_ticket) },
  { key: "max_reply", label: "Chờ lâu nhất (trung vị)", group: "quality", format: "duration", polarity: "down-good", hint: "Trung vị time_pic_max_reply (ít bị ảnh hưởng bởi hội thoại khách quay lại sau nhiều ngày).", compute: median((t) => t.time_pic_max_reply) },
  { key: "handle_fl", label: "Handle FL (trung vị)", group: "quality", format: "duration", polarity: "down-good", hint: "Trung vị total_time_handle_fl: từ lúc FL tìm ra và gửi solution đến khi khách đồng ý, gồm cả phần FL nhắn thêm khi solution của TS chưa fix xong.", compute: median((t) => t.total_time_handle_fl) },
  { key: "handle_ts", label: "Handle TS (trung vị)", group: "quality", format: "duration", polarity: "down-good", hint: "Trung vị total_time_handle_ts: thời gian TS làm ra và gửi solution (chỉ ticket có TS).", compute: median((t) => t.total_time_handle_ts) },
  { key: "csat_avg", label: "CSAT trung bình (1–5)", group: "quality", format: "score5", polarity: "up-good", hint: "= Tổng điểm csat ÷ số ticket có điểm. Điểm csat mỗi ticket (1–5) do Recap Tool chấm khi đọc hội thoại: 5 rất hài lòng · 4 hài lòng · 3 bình thường · 2 không hài lòng · 1 rất không hài lòng. Ticket chưa có điểm không tính.", compute: avg((t) => t.derived.csatScore) },
  { key: "csat_good", label: "CSAT tốt", group: "quality", format: "pct", polarity: "up-good", hint: "= Ticket có csat = 5 (Tốt) ÷ ticket có điểm csat.", compute: rate((t) => t.csat === "Tốt", (t) => t.csat != null) },
  { key: "solution_bad", label: "Solution chưa ổn", group: "quality", format: "count", polarity: "down-good", hint: "Khách phản hồi Tệ hoặc Chưa fix cần kiểm tra lại.", match: (t) => t.feedback_cx_solution === "Tệ" || t.feedback_cx_solution === "Chưa fix cần kiểm tra lại", compute: count((t) => t.feedback_cx_solution === "Tệ" || t.feedback_cx_solution === "Chưa fix cần kiểm tra lại") },
  { key: "mood_worsened", label: "Mood xấu đi", group: "quality", format: "count", polarity: "down-good", critical: true, hint: "Mood cuối tệ hơn mood lúc mới contact.", match: (t) => t.derived.moodWorsened, compute: count((t) => t.derived.moodWorsened) },
  { key: "angry", label: "Khách Angry", group: "quality", format: "count", polarity: "down-good", critical: true, hint: "Mood cuối = Angry.", match: (t) => t.derived.moodEnd === "Angry", compute: count((t) => t.derived.moodEnd === "Angry") },

  // ── Khách hàng ──
  { key: "urgent", label: "Case Urgent", group: "customer", format: "count", polarity: "down-good", critical: true, hint: "Mức ưu tiên = Urgent.", match: (t) => t.priority === "Urgent", compute: count((t) => t.priority === "Urgent") },
  { key: "churn", label: "Churn risk (ticket)", group: "customer", format: "count", polarity: "down-good", critical: true, hint: "Số ticket có churn_risk = yes. Số store bên cạnh = số store khác nhau trong các ticket đó.", match: (t) => t.churn_risk === true, compute: count((t) => t.churn_risk === true) },
  { key: "uninstalled", label: "Đã gỡ app", group: "customer", format: "count", polarity: "down-good", critical: true, hint: "Ticket có ngày gỡ app.", match: (t) => t.time_uninstall != null, compute: count((t) => t.time_uninstall != null) },
  {
    key: "revenue_at_risk",
    label: "Doanh thu rủi ro",
    group: "customer",
    format: "money",
    polarity: "down-good",
    hint: "Tổng giá plan/tháng của các store (không trùng) đang churn risk.",
    compute: (ts) => {
      const stores = new Map<string, number>();
      for (const t of ts) if (t.churn_risk && t.store_domain) stores.set(t.store_domain, t.pagefly_price ?? 0);
      return [...stores.values()].reduce((s, v) => s + v, 0);
    },
  },
  { key: "upsell", label: "Cơ hội upsell (ticket)", group: "customer", format: "count", polarity: "up-good", hint: "Số ticket có ghi tín hiệu upsell (upsell_signal khác trống / \"Không\"). Số store bên cạnh = số store khác nhau.", match: (t) => t.derived.upsell, compute: count((t) => t.derived.upsell) },
  { key: "dev_note", label: "Ticket dev_note", group: "customer", format: "count", polarity: "down-good", hint: "Issue lặp lại đã có dev note.", match: (t) => t.type_issue === "dev_note", compute: count((t) => t.type_issue === "dev_note") },
  { key: "review_asked_rate", label: "Tỷ lệ hỏi review", group: "customer", format: "pct", polarity: "up-good", hint: "FL đã hỏi / (đã hỏi + quên hỏi) trên khách chưa có review.", compute: rate((t) => t.derived.reviewAsked === "asked", (t) => t.derived.reviewAsked === "asked" || t.derived.reviewAsked === "forgot") },
  { key: "review_forgot", label: "Quên hỏi review", group: "customer", format: "count", polarity: "down-good", hint: "Khách vui vẻ nhưng FL quên hỏi.", match: (t) => t.derived.reviewAsked === "forgot", compute: count((t) => t.derived.reviewAsked === "forgot") },
  { key: "review_missed", label: "Đủ ĐK mời review nhưng chưa hỏi", group: "customer", format: "count", polarity: "down-good", hint: "review_verdict = QUALIFIED nhưng FL chưa hỏi và khách chưa có review.", match: (t) => t.derived.reviewMissed, compute: count((t) => t.derived.reviewMissed) },
  { key: "new_reviews", label: "Review mới sau support", group: "customer", format: "count", polarity: "up-good", hint: "app_review ghi \"sau khi support\".", match: (t) => t.derived.reviewAfterSupport, compute: count((t) => t.derived.reviewAfterSupport) },
  {
    key: "stores",
    label: "Tổng store",
    group: "customer",
    format: "count",
    polarity: "neutral",
    hint: "Số store khác nhau (không trùng) đã contact trong kỳ. Ticket không ghi store_domain không được tính.",
    // Ticket "thuộc" chỉ số = ticket có ghi store; bấm ô để xem danh sách store.
    match: (t) => t.store_domain != null,
    compute: (ts) => new Set(ts.map((t) => t.store_domain).filter(Boolean)).size,
  },
];

/** Cột sheet mà từng chỉ số phụ thuộc. */
const REQUIRES: Record<string, string[]> = {
  marketing: ["team_owner"],
  partner: ["team_owner"],
  urgent: ["priority"],
  mood_worsened: ["mood_label_cx_end_to_end"],
  angry: ["mood_label_cx"],
  resolved_rate: ["resolution"],
  unresolved_shift: ["resolution"],
  waiting_customer: ["resolution"],
  review_missed: ["review_verdict", "review_asked"],
  first_reply: ["time_cx_contact", "time_pic_reply"],
  first_reply_median: ["time_cx_contact", "time_pic_reply"],
  handle_time: ["total_time_handle_fl"],
  handle_fl: ["total_time_handle_fl"],
  handle_ts: ["total_time_handle_ts"],
  ticket_time: ["total_time_ticket"],
  max_reply: ["time_pic_max_reply"],
  csat_avg: ["csat"],
  csat_good: ["csat"],
  solution_bad: ["feedback_cx_solution"],
  churn: ["churn_risk"],
  uninstalled: ["time_uninstall"],
  revenue_at_risk: ["churn_risk", "pagefly_price"],
  upsell: ["upsell_signal"],
  dev_note: ["type_issue"],
  review_asked_rate: ["review_asked"],
  review_forgot: ["review_asked"],
  new_reviews: ["app_review"],
};

for (const m of METRICS) {
  m.requires = REQUIRES[m.key];
  if (!m.requires) continue;
  const raw = m.compute;
  m.compute = (ts) => (missingOf(m.requires).length ? null : raw(ts));
}

export const METRIC_BY_KEY: Record<string, MetricDef> = Object.fromEntries(METRICS.map((m) => [m.key, m]));

export function metric(key: string): MetricDef {
  const m = METRIC_BY_KEY[key];
  if (!m) throw new Error(`Unknown metric ${key}`);
  return m;
}
