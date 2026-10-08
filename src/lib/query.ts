// Trạng thái bộ lọc sống trên URL để mọi màn hình chia sẻ được bằng link.
import { CATEGORY_TICKET, FIELD_BY_KEY } from "@/lib/schema/fields";
import { addDays, diffDays, formatVnDate, vnDayKey } from "@/lib/data/parse";
import type { Ticket } from "@/lib/data/types";
import { METRIC_BY_KEY } from "@/lib/metrics/defs";

export type RangePreset = "today" | "7d" | "30d" | "90d" | "all" | "custom";
export type CatFilter = "all" | (typeof CATEGORY_TICKET)[number];

export interface Period {
  from: string;
  to: string;
}

export interface Query {
  range: RangePreset;
  period: Period;
  /** Kỳ so sánh: mặc định là khoảng liền trước có cùng số ngày. */
  prev: Period | null;
  cat: CatFilter;
  q: string;
  facets: Record<string, string[]>;
  /** Lọc theo chỉ số (ô KPI) — vd. metric=churn. */
  metric: string | null;
}

export type SearchParams = Record<string, string | string[] | undefined>;

const PRESET_DAYS: Record<Exclude<RangePreset, "all" | "custom">, number> = { today: 1, "7d": 7, "30d": 30, "90d": 90 };

export const RANGE_LABELS: Record<RangePreset, string> = {
  today: "Hôm nay",
  "7d": "7 ngày",
  "30d": "30 ngày",
  "90d": "90 ngày",
  all: "Toàn bộ",
  custom: "Tuỳ chọn",
};

/** Facet được phép lọc (key trường hoặc trường suy ra). */
export const FACET_KEYS = [
  "category_issue",
  "page_issue",
  "priority",
  "team_owner",
  "handler",
  "resolution",
  "mood_label_cx",
  "csat",
  "feedback_cx_solution",
  "churn_risk",
  "escalated",
  "type_issue",
  "review_verdict",
  "review_asked_status",
  "upsell",
  "attention",
  "triggered_by",
  "name_pic",
  "shift",
  "shift_lead",
  "pagefly_plan",
  "shopify_plan",
  "root_cause",
] as const;
export type FacetKey = (typeof FACET_KEYS)[number];

export const FACET_LABELS: Record<FacetKey, string> = {
  category_issue: "Nhóm issue",
  page_issue: "Trang",
  priority: "Ưu tiên",
  team_owner: "Team phụ trách",
  handler: "Bậc xử lý",
  resolution: "Kết quả",
  mood_label_cx: "Mood",
  csat: "CSAT",
  feedback_cx_solution: "Phản hồi solution",
  churn_risk: "Churn risk",
  escalated: "Chuyển TS",
  type_issue: "Loại xử lý",
  review_verdict: "Mời review",
  review_asked_status: "Hỏi review",
  upsell: "Upsell",
  attention: "Cần chú ý",
  triggered_by: "FL",
  name_pic: "PIC",
  shift: "Ca",
  shift_lead: "Shift lead",
  pagefly_plan: "Plan PageFly",
  shopify_plan: "Plan Shopify",
  root_cause: "Nguyên nhân",
};

export const EMPTY_VALUE = "(trống)";

const REVIEW_ASKED_LABEL: Record<Ticket["derived"]["reviewAsked"], string> = {
  already: "Đã có review",
  asked: "FL đã hỏi",
  forgot: "FL quên hỏi",
  not_suitable: "Không phù hợp",
  unknown: "Chưa rõ",
};
const HANDLER_LABEL = { FL: "FL tự xử lý", TS: "TS xử lý", Dev: "Cần Dev" } as const;

const yesNo = (b: boolean | null) => (b == null ? EMPTY_VALUE : b ? "Yes" : "No");

/** Giá trị facet của một ticket (luôn trả mảng để hỗ trợ trường nhiều giá trị). */
export function facetValues(t: Ticket, key: FacetKey): string[] {
  switch (key) {
    case "handler":
      return [HANDLER_LABEL[t.derived.handler]];
    case "review_asked_status":
      return [REVIEW_ASKED_LABEL[t.derived.reviewAsked]];
    case "upsell":
      return [t.derived.upsell ? "Yes" : "No"];
    case "attention":
      return [t.derived.attention ? "Yes" : "No"];
    case "churn_risk":
    case "escalated":
      return [yesNo(t[key])];
    case "name_pic":
      return t.name_pic.length ? t.name_pic : [EMPTY_VALUE];
    default: {
      const v = t[key];
      return [v == null || v === "" ? EMPTY_VALUE : String(v)];
    }
  }
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function previousPeriod(p: Period): Period {
  const len = diffDays(p.from, p.to) + 1;
  return { from: addDays(p.from, -len), to: addDays(p.from, -1) };
}

export function parseQuery(sp: SearchParams, opts: { earliestDay?: string; now?: number } = {}): Query {
  const today = vnDayKey(opts.now ?? Date.now());
  let range = (first(sp.range) ?? "7d") as RangePreset;
  if (!(range in RANGE_LABELS)) range = "7d";

  let period: Period;
  const from = first(sp.from);
  const to = first(sp.to);
  if (range === "custom" && from && DAY_RE.test(from)) {
    const end = to && DAY_RE.test(to) ? to : today;
    period = from <= end ? { from, to: end } : { from: end, to: from };
  } else if (range === "all") {
    period = { from: opts.earliestDay ?? addDays(today, -365), to: today };
  } else {
    if (range === "custom") range = "7d";
    const n = PRESET_DAYS[range as keyof typeof PRESET_DAYS];
    period = { from: addDays(today, -(n - 1)), to: today };
  }

  let prev: Period | null = range === "all" ? null : previousPeriod(period);
  const cfrom = first(sp.cfrom);
  const cto = first(sp.cto);
  if (cfrom && cto && DAY_RE.test(cfrom) && DAY_RE.test(cto) && range !== "all") {
    prev = cfrom <= cto ? { from: cfrom, to: cto } : { from: cto, to: cfrom };
  }

  const catRaw = first(sp.cat);
  const cat: CatFilter = (CATEGORY_TICKET as readonly string[]).includes(catRaw ?? "") ? (catRaw as CatFilter) : "all";

  const facets: Record<string, string[]> = {};
  for (const key of FACET_KEYS) {
    const v = first(sp[`f_${key}`]);
    if (v) facets[key] = v.split("|").filter(Boolean);
  }

  const metricKey = first(sp.metric);
  const metric = metricKey && METRIC_BY_KEY[metricKey]?.match ? metricKey : null;

  return { range, period, prev, cat, q: (first(sp.q) ?? "").trim(), facets, metric };
}

export function inPeriod(t: Ticket, p: Period): boolean {
  const k = t.derived.dayKey;
  return k != null && k >= p.from && k <= p.to;
}

export function matchesFilters(t: Ticket, q: Pick<Query, "cat" | "facets" | "q"> & { metric?: string | null }): boolean {
  if (q.cat !== "all" && t.category_ticket !== q.cat) return false;
  if (q.metric && !METRIC_BY_KEY[q.metric]?.match?.(t)) return false;
  for (const [key, values] of Object.entries(q.facets)) {
    if (!values.length) continue;
    const tv = facetValues(t, key as FacetKey);
    if (!tv.some((v) => values.includes(v))) return false;
  }
  if (q.q) {
    const needle = q.q.toLowerCase();
    const hay = [t.issue_summary, t.store_domain, t.store_name, t.triggered_by, t.name_pic.join(" "), t.session_id, t.root_cause, t.review_ticket, t.next_action]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!hay.includes(needle)) return false;
  }
  return true;
}

export function selectTickets(all: Ticket[], q: Query, period: Period | null = q.period): Ticket[] {
  if (!period) return [];
  return all.filter((t) => inPeriod(t, period) && matchesFilters(t, q));
}

export function periodLabel(p: Period): string {
  return p.from === p.to ? formatVnDate(p.from) : `${formatVnDate(p.from)} – ${formatVnDate(p.to)}`;
}

export function periodDays(p: Period): number {
  return diffDays(p.from, p.to) + 1;
}

/** Ghép URL giữ nguyên tham số hiện tại, ghi đè các khoá trong `patch` (undefined/"" = xoá). */
export function hrefWith(path: string, sp: SearchParams, patch: Record<string, string | undefined | null>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const val = first(v);
    if (val != null && val !== "") params.set(k, val);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v == null || v === "") params.delete(k);
    else params.set(k, v);
  }
  const s = params.toString();
  return s ? `${path}?${s}` : path;
}

export function fieldLabel(key: string): string {
  return FIELD_BY_KEY[key]?.label ?? FACET_LABELS[key as FacetKey] ?? key;
}
