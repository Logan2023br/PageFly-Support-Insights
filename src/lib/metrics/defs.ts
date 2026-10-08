import type { Ticket } from "@/lib/data/types";

export type Polarity = "up-good" | "down-good" | "neutral";
export type MetricFormat = "count" | "pct" | "duration" | "money";
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

export const METRICS: MetricDef[] = [
  // ── Khối lượng ──
  { key: "total", label: "Tổng ticket", group: "volume", format: "count", polarity: "neutral", hint: "Tất cả ticket Feedback, Issue và Improve.", match: () => true, compute: (ts) => ts.length },
  { key: "feedback", label: "Feedback", group: "volume", format: "count", polarity: "neutral", hint: "Những góp ý của khách.", match: (t) => t.category_ticket === "Feedback", compute: count((t) => t.category_ticket === "Feedback") },
  { key: "issue", label: "Issue", group: "volume", format: "count", polarity: "down-good", hint: "Vấn đề khách gặp phải.", match: isIssue, compute: count(isIssue) },
  { key: "improve", label: "Improve", group: "volume", format: "count", polarity: "neutral", hint: "Chức năng khách muốn có.", match: (t) => t.category_ticket === "Improve", compute: count((t) => t.category_ticket === "Improve") },

  // ── Phân luồng ──
  { key: "fl_self", label: "Issue FL tự xử lý", group: "routing", format: "count", polarity: "neutral", hint: "Issue không chuyển TS, không cần Dev.", match: (t) => isIssue(t) && t.derived.handler === "FL", compute: count((t) => isIssue(t) && t.derived.handler === "FL") },
  { key: "ts_handled", label: "Issue TS xử lý", group: "routing", format: "count", polarity: "down-good", hint: "Issue có TS tham gia, không cần Dev.", match: (t) => isIssue(t) && t.derived.handler === "TS", compute: count((t) => isIssue(t) && t.derived.handler === "TS") },
  { key: "dev_needed", label: "Issue cần Dev", group: "routing", format: "count", polarity: "down-good", hint: "Role có Dev, đợi dev check, cần dev note hoặc team phụ trách là Dev.", match: (t) => t.derived.handler === "Dev", compute: count((t) => t.derived.handler === "Dev") },
  { key: "refund", label: "Refund", group: "routing", format: "count", polarity: "down-good", critical: true, hint: "Team phụ trách = Billing/Refund.", match: (t) => t.team_owner === "Billing/Refund", compute: count((t) => t.team_owner === "Billing/Refund") },
  { key: "marketing", label: "Chuyển Marketing", group: "routing", format: "count", polarity: "neutral", hint: "Team phụ trách = Marketing.", match: (t) => t.team_owner === "Marketing", compute: count((t) => t.team_owner === "Marketing") },
  { key: "partner", label: "Chuyển Partner", group: "routing", format: "count", polarity: "neutral", hint: "Team phụ trách = Partner.", match: (t) => t.team_owner === "Partner", compute: count((t) => t.team_owner === "Partner") },
  { key: "free_service", label: "Free service", group: "routing", format: "count", polarity: "neutral", hint: "Team phụ trách = Free service.", match: (t) => t.team_owner === "Free service", compute: count((t) => t.team_owner === "Free service") },
  { key: "fl_self_rate", label: "Tỷ lệ FL tự xử lý", group: "routing", format: "pct", polarity: "up-good", hint: "Issue FL tự xử lý / tổng Issue.", compute: rate((t) => t.derived.handler === "FL", isIssue) },

  // ── Chất lượng ──
  { key: "resolved_rate", label: "Tỷ lệ resolved", group: "quality", format: "pct", polarity: "up-good", hint: "Kết quả = Đã resolved / tổng ticket có kết quả.", compute: rate((t) => t.derived.resolved, (t) => t.resolution != null) },
  { key: "unresolved_shift", label: "Hết ca chưa xong", group: "quality", format: "count", polarity: "down-good", hint: "Kết quả = Hết ca vẫn chưa giải quyết.", match: (t) => t.resolution === "Hết ca vẫn chưa giải quyết", compute: count((t) => t.resolution === "Hết ca vẫn chưa giải quyết") },
  { key: "first_reply", label: "Phản hồi đầu (TB)", group: "quality", format: "duration", polarity: "down-good", hint: "Trung bình (PIC phản hồi lúc − Khách contact lúc).", compute: avg((t) => t.derived.firstReplySec) },
  { key: "first_reply_median", label: "Phản hồi đầu (trung vị)", group: "quality", format: "duration", polarity: "down-good", hint: "Trung vị thời gian phản hồi đầu, ít bị ảnh hưởng bởi ca bất thường.", compute: median((t) => t.derived.firstReplySec) },
  { key: "handle_time", label: "Thời gian handle (TB)", group: "quality", format: "duration", polarity: "down-good", hint: "Trung bình total_time_handle.", compute: avg((t) => t.total_time_handle) },
  { key: "ticket_time", label: "Tổng thời gian ticket (TB)", group: "quality", format: "duration", polarity: "down-good", hint: "Trung bình total_time_ticket.", compute: avg((t) => t.total_time_ticket) },
  { key: "max_reply", label: "Chờ lâu nhất (TB)", group: "quality", format: "duration", polarity: "down-good", hint: "Trung bình time_pic_max_reply.", compute: avg((t) => t.time_pic_max_reply) },
  { key: "csat_good", label: "CSAT tốt", group: "quality", format: "pct", polarity: "up-good", hint: "CSAT = Tốt / tổng ticket có CSAT.", compute: rate((t) => t.csat === "Tốt", (t) => t.csat != null) },
  { key: "solution_bad", label: "Solution chưa ổn", group: "quality", format: "count", polarity: "down-good", hint: "Khách phản hồi Tệ hoặc Chưa fix cần kiểm tra lại.", match: (t) => t.feedback_cx_solution === "Tệ" || t.feedback_cx_solution === "Chưa fix cần kiểm tra lại", compute: count((t) => t.feedback_cx_solution === "Tệ" || t.feedback_cx_solution === "Chưa fix cần kiểm tra lại") },
  { key: "mood_worsened", label: "Mood xấu đi", group: "quality", format: "count", polarity: "down-good", critical: true, hint: "Mood cuối tệ hơn mood lúc mới contact.", match: (t) => t.derived.moodWorsened, compute: count((t) => t.derived.moodWorsened) },
  { key: "angry", label: "Khách Angry", group: "quality", format: "count", polarity: "down-good", critical: true, hint: "Mood cuối = Angry.", match: (t) => t.derived.moodEnd === "Angry", compute: count((t) => t.derived.moodEnd === "Angry") },

  // ── Khách hàng ──
  { key: "urgent", label: "Case Urgent", group: "customer", format: "count", polarity: "down-good", critical: true, hint: "Mức ưu tiên = Urgent.", match: (t) => t.priority === "Urgent", compute: count((t) => t.priority === "Urgent") },
  { key: "churn", label: "Churn risk", group: "customer", format: "count", polarity: "down-good", critical: true, hint: "churn_risk = Yes.", match: (t) => t.churn_risk === true, compute: count((t) => t.churn_risk === true) },
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
  { key: "upsell", label: "Cơ hội upsell", group: "customer", format: "count", polarity: "up-good", hint: "Có tín hiệu upsell.", match: (t) => t.derived.upsell, compute: count((t) => t.derived.upsell) },
  { key: "dev_note", label: "Ticket dev_note", group: "customer", format: "count", polarity: "down-good", hint: "Issue lặp lại đã có dev note.", match: (t) => t.type_issue === "dev_note", compute: count((t) => t.type_issue === "dev_note") },
  { key: "review_asked_rate", label: "Tỷ lệ hỏi review", group: "customer", format: "pct", polarity: "up-good", hint: "FL đã hỏi / (đã hỏi + quên hỏi) trên khách chưa có review.", compute: rate((t) => t.derived.reviewAsked === "asked", (t) => t.derived.reviewAsked === "asked" || t.derived.reviewAsked === "forgot") },
  { key: "review_forgot", label: "Quên hỏi review", group: "customer", format: "count", polarity: "down-good", hint: "Khách vui vẻ nhưng FL quên hỏi.", match: (t) => t.derived.reviewAsked === "forgot", compute: count((t) => t.derived.reviewAsked === "forgot") },
  { key: "new_reviews", label: "Review mới sau support", group: "customer", format: "count", polarity: "up-good", hint: "app_review ghi \"sau khi support\".", match: (t) => t.derived.reviewAfterSupport, compute: count((t) => t.derived.reviewAfterSupport) },
  {
    key: "stores",
    label: "Store liên hệ",
    group: "customer",
    format: "count",
    polarity: "neutral",
    hint: "Số store khác nhau đã contact.",
    compute: (ts) => new Set(ts.map((t) => t.store_domain).filter(Boolean)).size,
  },
];

export const METRIC_BY_KEY: Record<string, MetricDef> = Object.fromEntries(METRICS.map((m) => [m.key, m]));

export function metric(key: string): MetricDef {
  const m = METRIC_BY_KEY[key];
  if (!m) throw new Error(`Unknown metric ${key}`);
  return m;
}
