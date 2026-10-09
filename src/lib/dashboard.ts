import type { Ticket } from "@/lib/data/types";
import { missingOf } from "@/lib/data/availability";
import { compareBreakdown, compareMetrics, countBy, dailySeries, formatValue, sortByAlert, type Comparison } from "@/lib/metrics/compute";
import { GROUP_TITLES, METRICS, type MetricDef, type MetricGroup } from "@/lib/metrics/defs";
import { customerSummary, flSummary, ticketSummary } from "@/lib/metrics/summaries";
import { inPeriod, periodLabel, selectTickets, type Period, type Query } from "@/lib/query";
import { addDays, diffDays } from "@/lib/data/parse";

/** Ô KPI chính (kèm biểu đồ đường so với kỳ trước) theo từng tab. */
export const MAIN_TILES: Record<Query["cat"], string[]> = {
  all: ["total", "stores", "resolved_rate", "first_reply_median", "csat_avg", "fl_self_rate", "churn", "upsell"],
  Issue: ["issue", "stores", "resolved_rate", "first_reply_median", "fl_self_rate", "dev_needed", "churn", "unresolved_shift"],
  Feedback: ["feedback", "stores", "csat_avg", "upsell", "churn", "review_missed"],
  Improve: ["improve", "stores", "upsell", "churn", "csat_avg", "dev_needed"],
};

/** Chỉ số khác (gom theo nhóm, mở rộng khi cần). Ẩn chỉ số trùng tab: Feedback/Issue/Improve chỉ hiện ở tab All. */
function moreTiles(cat: Query["cat"]): string[] {
  const main = new Set(MAIN_TILES[cat]);
  const volume = cat === "all" ? ["feedback", "issue", "improve"] : [];
  return METRICS.filter((m) => !main.has(m.key) && (m.group !== "volume" || volume.includes(m.key))).map((m) => m.key);
}

export interface Tile {
  def: Pick<MetricDef, "key" | "label" | "format" | "hint" | "polarity">;
  value: string;
  raw: number | null;
  share: number | null;
  drillable: boolean;
  change: Comparison | null;
  /** Cột sheet còn thiếu khiến chỉ số chưa tính được. */
  missing: string[];
  /** Số store khác nhau trong các ticket của chỉ số (để phân biệt đơn vị ticket / store). */
  stores: number | null;
  /** Giá trị theo ngày (hoặc tuần) của kỳ này và kỳ trước, căn theo thứ tự mốc. */
  trend?: TrendPoint[];
}

export interface TrendPoint {
  label: string;
  prevLabel: string | null;
  cur: number | null;
  prev: number | null;
}

/** Cắt kỳ thành các mốc ngày (gộp tuần nếu > 45 ngày) để vẽ biểu đồ đường của từng chỉ số. */
function slices(p: Period): Period[] {
  const n = diffDays(p.from, p.to) + 1;
  const size = n > 45 ? 7 : 1;
  const out: Period[] = [];
  for (let i = 0; i < n; i += size) out.push({ from: addDays(p.from, i), to: addDays(p.from, Math.min(n - 1, i + size - 1)) });
  return out;
}

export function metricTrend(def: MetricDef, cur: Ticket[], prev: Ticket[], q: Query): TrendPoint[] {
  const curSlices = slices(q.period);
  const prevSlices = q.prev ? slices(q.prev) : [];
  const valueIn = (ts: Ticket[], p: Period) => {
    const sub = ts.filter((t) => inPeriod(t, p));
    // Tỷ lệ / thời gian / điểm của mốc không có ticket = trống (không phải 0).
    return sub.length || def.format === "count" ? def.compute(sub) : null;
  };
  return curSlices.map((p, i) => ({
    label: p.from,
    prevLabel: prevSlices[i]?.from ?? null,
    cur: valueIn(cur, p),
    prev: prevSlices[i] ? valueIn(prev, prevSlices[i]) : null,
  }));
}

export function buildDashboard(all: Ticket[], q: Query) {
  const cur = selectTickets(all, q);
  const prev = q.prev ? selectTickets(all, q, q.prev) : [];
  const total = cur.length;

  const comparisons = q.prev ? compareMetrics(cur, prev) : [];
  const cmpByKey = new Map(comparisons.map((c) => [c.key, c]));

  const tile = (key: string, withTrend: boolean): Tile => {
    const def = METRICS.find((m) => m.key === key)!;
    const raw = def.compute(cur);
    const missing = missingOf(def.requires);
    const matched = def.match && def.format === "count" && !missing.length ? cur.filter(def.match) : null;
    return {
      def: { key: def.key, label: def.label, format: def.format, hint: def.hint, polarity: def.polarity },
      value: formatValue(raw, def.format),
      raw,
      share: def.format === "count" && def.match && total ? (raw ?? 0) / total : def.format === "pct" ? raw : null,
      drillable: Boolean(def.match) && !missing.length,
      change: cmpByKey.get(key) ?? null,
      missing,
      stores: matched ? new Set(matched.map((t) => t.store_domain).filter(Boolean)).size : null,
      trend: withTrend && !missing.length ? metricTrend(def, cur, prev, q) : undefined,
    };
  };
  const main = MAIN_TILES[q.cat].map((k) => tile(k, true));
  // Chỉ số khác: bỏ ô thiếu cột (đã liệt kê ở trang Chất lượng dữ liệu), gom theo nhóm.
  const more = moreTiles(q.cat)
    .map((k) => tile(k, false))
    .filter((t) => !t.missing.length);
  const moreGroups = (Object.keys(GROUP_TITLES) as MetricGroup[])
    .map((g) => ({ title: GROUP_TITLES[g], tiles: more.filter((t) => METRICS.find((m) => m.key === t.def.key)!.group === g) }))
    .filter((g) => g.tiles.length);

  const issues = cur.filter((t) => t.category_ticket === "Issue");
  return {
    cur,
    prev,
    main,
    moreGroups,
    comparisons,
    series: dailySeries(cur, q.period),
    prevSeries: q.prev ? dailySeries(prev, q.prev) : [],
    breakdowns: {
      category_issue: countBy(issues, (t) => t.category_issue),
      root_cause: countBy(q.cat === "all" ? issues : cur, (t) => t.root_cause),
      page_issue: countBy(issues, (t) => t.page_issue),
      resolution: countBy(cur, (t) => t.resolution),
      team_owner: countBy(cur, (t) => t.team_owner),
      shift: countBy(cur, (t) => t.shift),
      mood_flow: countBy(cur, (t) => (t.derived.moodStart && t.derived.moodEnd ? (t.derived.moodStart === t.derived.moodEnd ? `${t.derived.moodEnd} (giữ nguyên)` : `${t.derived.moodStart} → ${t.derived.moodEnd}`) : null)),
      improve: countBy(
        cur.filter((t) => t.category_ticket === "Improve"),
        (t) => t.issue_summary,
      ),
      feedback: countBy(
        cur.filter((t) => t.category_ticket === "Feedback"),
        (t) => t.issue_summary,
      ),
    },
    summaries: [ticketSummary(cur, q.period), flSummary(cur), customerSummary(cur)],
  };
}

export function buildCompare(all: Ticket[], q: Query) {
  const cur = selectTickets(all, q);
  const prev = q.prev ? selectTickets(all, q, q.prev) : [];
  const issueKey = (t: Ticket) => (t.category_ticket === "Issue" ? t.category_issue : null);
  return {
    cur,
    prev,
    metrics: sortByAlert(compareMetrics(cur, prev)),
    byIssue: compareBreakdown(cur, prev, issueKey, "Issue "),
    byCategory: compareBreakdown(cur, prev, (t) => t.category_ticket as string | null),
    byRoot: compareBreakdown(cur, prev, (t) => t.root_cause).slice(0, 10),
    series: dailySeries(cur, q.period),
    prevSeries: q.prev ? dailySeries(prev, q.prev) : [],
  };
}

const ticketBrief = (t: Ticket) => ({
  summary: t.issue_summary,
  category: t.category_ticket,
  area: t.category_issue,
  priority: t.priority,
  mood: t.mood_label_cx_end_to_end ?? t.mood_label_cx,
  root_cause: t.root_cause,
  resolution: t.resolution,
  churn_risk: t.churn_risk,
  uninstalled: t.time_uninstall != null,
  review_pic: t.review_pic,
  fl: t.triggered_by,
});

const slimCmp = (c: Comparison) => ({
  key: c.key,
  label: c.label,
  current: formatValue(c.current, c.format),
  previous: formatValue(c.previous, c.format),
  alert: c.alert,
  tone: c.tone,
  note: c.note,
});

export function overviewFacts(all: Ticket[], q: Query) {
  const d = buildDashboard(all, q);
  return {
    period: periodLabel(q.period),
    segment: q.cat,
    filters: q.facets,
    kpis: [...d.main, ...d.moreGroups.flatMap((g) => g.tiles)].map((t) => ({ label: t.def.label, value: t.value, stores: t.stores, vsPrevious: t.change?.note ?? null })),
    summaries: d.summaries.map((s) => ({ title: s.title, lines: s.lines.map((l) => l.text) })),
    topIssueAreas: d.breakdowns.category_issue.slice(0, 8),
    topRootCauses: d.breakdowns.root_cause.slice(0, 8),
    attentionTickets: d.cur
      .filter((t) => t.derived.attention)
      .slice(0, 20)
      .map(ticketBrief),
  };
}

export function compareFacts(all: Ticket[], q: Query) {
  const c = buildCompare(all, q);
  const alertedIssues = c.byIssue.filter((r) => r.alert);
  return {
    period: periodLabel(q.period),
    previousPeriod: q.prev ? periodLabel(q.prev) : null,
    segment: q.cat,
    comparisons: c.metrics.filter((m) => m.alert || m.tone !== "neutral").map(slimCmp),
    breakdowns: [...c.byIssue, ...c.byCategory].map(slimCmp),
    sampleTickets: Object.fromEntries(
      alertedIssues.map((r) => [
        r.key,
        c.cur
          .filter((t) => `Issue ${t.category_issue}` === r.label)
          .sort((a, b) => Number(b.derived.attention) - Number(a.derived.attention))
          .slice(0, 6)
          .map(ticketBrief),
      ]),
    ),
  };
}
