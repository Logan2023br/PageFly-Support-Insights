import type { Ticket } from "@/lib/data/types";
import { compareBreakdown, compareMetrics, countBy, dailySeries, formatValue, sortByAlert, type Comparison } from "@/lib/metrics/compute";
import { METRICS, type MetricDef } from "@/lib/metrics/defs";
import { customerSummary, flSummary, ticketSummary } from "@/lib/metrics/summaries";
import { periodLabel, selectTickets, type Query } from "@/lib/query";

/** Ô KPI hiển thị theo từng tab Tất cả / Feedback / Issue / Improve. */
export const TILE_SETS: Record<Query["cat"], string[][]> = {
  all: [
    ["total", "feedback", "issue", "improve"],
    ["fl_self", "ts_handled", "dev_needed", "refund", "marketing", "partner"],
    ["resolved_rate", "first_reply", "csat_good", "angry", "churn", "upsell"],
  ],
  Feedback: [
    ["feedback", "stores", "marketing", "upsell"],
    ["csat_good", "angry", "churn", "new_reviews"],
  ],
  Issue: [
    ["issue", "fl_self", "ts_handled", "dev_needed"],
    ["urgent", "dev_note", "refund", "partner", "unresolved_shift", "solution_bad"],
    ["resolved_rate", "first_reply", "handle_time", "mood_worsened", "angry", "churn"],
  ],
  Improve: [
    ["improve", "stores", "upsell", "churn"],
    ["dev_needed", "marketing", "csat_good", "new_reviews"],
  ],
};

export interface Tile {
  def: Pick<MetricDef, "key" | "label" | "format" | "hint" | "polarity">;
  value: string;
  raw: number | null;
  share: number | null;
  drillable: boolean;
  change: Comparison | null;
}

export function buildDashboard(all: Ticket[], q: Query) {
  const cur = selectTickets(all, q);
  const prev = q.prev ? selectTickets(all, q, q.prev) : [];
  const total = cur.length;

  const comparisons = q.prev ? compareMetrics(cur, prev) : [];
  const cmpByKey = new Map(comparisons.map((c) => [c.key, c]));

  const tiles: Tile[][] = TILE_SETS[q.cat].map((row) =>
    row.map((key) => {
      const def = METRICS.find((m) => m.key === key)!;
      const raw = def.compute(cur);
      return {
        def: { key: def.key, label: def.label, format: def.format, hint: def.hint, polarity: def.polarity },
        value: formatValue(raw, def.format),
        raw,
        share: def.format === "count" && def.match && total ? (raw ?? 0) / total : def.format === "pct" ? raw : null,
        drillable: Boolean(def.match),
        change: cmpByKey.get(key) ?? null,
      };
    }),
  );

  const issues = cur.filter((t) => t.category_ticket === "Issue");
  return {
    cur,
    prev,
    tiles,
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
      mood_flow: countBy(cur, (t) => (t.derived.moodStart && t.derived.moodEnd ? `${t.derived.moodStart} → ${t.derived.moodEnd}` : null)),
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
    kpis: d.tiles.flat().map((t) => ({ label: t.def.label, value: t.value, vsPrevious: t.change?.note ?? null })),
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
