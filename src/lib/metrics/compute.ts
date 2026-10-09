import { formatDuration } from "@/lib/data/parse";
import type { Ticket } from "@/lib/data/types";
import { addDays, diffDays } from "@/lib/data/parse";
import { CATEGORY_TICKET } from "@/lib/schema/fields";
import type { Period } from "@/lib/query";
import { METRICS, type MetricDef, type MetricFormat } from "./defs";
import { missingOf } from "@/lib/data/availability";

// ── Định dạng ─────────────────────────────────────────────────────────

const nf = new Intl.NumberFormat("vi-VN");

export function formatValue(v: number | null | undefined, format: MetricFormat): string {
  if (v == null || !Number.isFinite(v)) return "—";
  switch (format) {
    case "pct":
      return `${(v * 100).toFixed(1).replace(".0", "")}%`;
    case "duration":
      return formatDuration(v);
    case "money":
      return `$${nf.format(Math.round(v))}`;
    case "score5":
      return `${v.toFixed(1)}/5`;
    default:
      return nf.format(Math.round(v));
  }
}

export function formatDelta(delta: number, format: MetricFormat): string {
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "±";
  const abs = Math.abs(delta);
  if (format === "pct") return `${sign}${(abs * 100).toFixed(1).replace(".0", "")} điểm %`;
  if (format === "duration") return `${sign}${formatDuration(abs)}`;
  if (format === "money") return `${sign}$${nf.format(Math.round(abs))}`;
  if (format === "score5") return `${sign}${abs.toFixed(1)}`;
  return `${sign}${nf.format(Math.round(abs))}`;
}

// ── Gom nhóm ─────────────────────────────────────────────────────────

export interface Bucket {
  key: string;
  count: number;
  share: number;
}

export function countBy(ts: Ticket[], keyFn: (t: Ticket) => string | string[] | null | undefined, opts: { includeEmpty?: boolean } = {}): Bucket[] {
  const m = new Map<string, number>();
  for (const t of ts) {
    const raw = keyFn(t);
    const keys = Array.isArray(raw) ? raw : [raw];
    for (const k of keys) {
      if (k == null || k === "") {
        if (opts.includeEmpty) m.set("(trống)", (m.get("(trống)") ?? 0) + 1);
        continue;
      }
      m.set(k, (m.get(k) ?? 0) + 1);
    }
  }
  const total = ts.length || 1;
  return [...m.entries()].map(([key, c]) => ({ key, count: c, share: c / total })).sort((a, b) => b.count - a.count);
}

/** Đếm danh sách giá trị bất kỳ (bỏ null/rỗng) thành Bucket[] sắp giảm dần. */
export function tally(values: (string | null | undefined)[]): Bucket[] {
  const m = new Map<string, number>();
  for (const v of values) if (v) m.set(v, (m.get(v) ?? 0) + 1);
  const total = values.length || 1;
  return [...m.entries()].map(([key, count]) => ({ key, count, share: count / total })).sort((a, b) => b.count - a.count);
}

export interface DayPoint {
  day: string;
  total: number;
  Feedback: number;
  Issue: number;
  Improve: number;
}

export function dailySeries(ts: Ticket[], p: Period): DayPoint[] {
  const n = diffDays(p.from, p.to) + 1;
  const points: DayPoint[] = Array.from({ length: n }, (_, i) => ({ day: addDays(p.from, i), total: 0, Feedback: 0, Issue: 0, Improve: 0 }));
  const idx = new Map(points.map((pt, i) => [pt.day, i]));
  for (const t of ts) {
    const i = t.derived.dayKey ? idx.get(t.derived.dayKey) : undefined;
    if (i == null) continue;
    points[i].total++;
    if ((CATEGORY_TICKET as readonly string[]).includes(t.category_ticket ?? "")) points[i][t.category_ticket as "Feedback"]++;
  }
  return points;
}

/** Gộp chuỗi ngày thành tuần nếu khoảng dài để biểu đồ không quá dày. */
export function bucketSeries(points: DayPoint[], maxBars = 45): (DayPoint & { label: string })[] {
  if (points.length <= maxBars) return points.map((p) => ({ ...p, label: p.day }));
  const size = Math.ceil(points.length / maxBars);
  const out: (DayPoint & { label: string })[] = [];
  for (let i = 0; i < points.length; i += size) {
    const chunk = points.slice(i, i + size);
    out.push({
      day: chunk[0].day,
      label: `${chunk[0].day}→${chunk[chunk.length - 1].day}`,
      total: chunk.reduce((s, p) => s + p.total, 0),
      Feedback: chunk.reduce((s, p) => s + p.Feedback, 0),
      Issue: chunk.reduce((s, p) => s + p.Issue, 0),
      Improve: chunk.reduce((s, p) => s + p.Improve, 0),
    });
  }
  return out;
}

// ── So sánh kỳ & báo động ────────────────────────────────────────────

export type Tone = "good" | "bad" | "neutral";
export type AlertLevel = "critical" | "warning" | null;

export interface Comparison {
  key: string;
  label: string;
  format: MetricFormat;
  current: number | null;
  previous: number | null;
  delta: number | null;
  pct: number | null;
  tone: Tone;
  alert: AlertLevel;
  note: string;
  evidence: string[];
}

export interface CompareInput {
  key: string;
  label: string;
  format: MetricFormat;
  polarity: MetricDef["polarity"];
  critical?: boolean;
  current: number | null;
  previous: number | null;
  /** Ticket kỳ hiện tại thuộc chỉ số, để lấy bằng chứng. */
  subset?: Ticket[];
  /** Số ticket mỗi kỳ. Ít hơn MIN_ALERT_SAMPLE thì tỷ lệ / thời gian / điểm không báo động (dễ báo động giả). */
  sample?: { current: number; previous: number };
}

/** Cỡ mẫu tối thiểu (số ticket mỗi kỳ) để một chỉ số tỷ lệ / thời gian / điểm được phép báo động. */
export const MIN_ALERT_SAMPLE = 10;

/**
 * Luật báo động (chỉnh ở đây):
 *  - count: xấu đi ≥20% và ≥3 case → warning; ≥50% và ≥5 case, hoặc chỉ số critical tăng ≥2 → critical.
 *  - pct: xấu đi ≥5 điểm % → warning; ≥10 điểm % → critical.
 *  - duration/money: xấu đi ≥15% → warning; ≥40% → critical.
 *  - Tỷ lệ / thời gian / điểm chỉ báo động khi mỗi kỳ có ≥ MIN_ALERT_SAMPLE ticket.
 */
export function judge(input: CompareInput): Comparison {
  const { current, previous, format, polarity } = input;
  const base: Comparison = {
    key: input.key,
    label: input.label,
    format,
    current,
    previous,
    delta: null,
    pct: null,
    tone: "neutral",
    alert: null,
    note: "",
    evidence: evidenceFor(input.subset ?? []),
  };
  if (current == null) return { ...base, note: "Chưa có dữ liệu kỳ này." };
  // Kỳ trước không có ticket nào (vd. trước khi sheet bắt đầu ghi) → không có mốc để so, không báo động.
  if (input.sample && input.sample.previous === 0) return { ...base, note: "Kỳ trước chưa có ticket nào để so sánh." };
  if (previous == null) return { ...base, note: "Kỳ trước chưa có dữ liệu để so sánh." };

  const delta = current - previous;
  const pct = previous !== 0 ? delta / Math.abs(previous) : current === 0 ? 0 : null;
  const worse = polarity === "down-good" ? delta > 0 : polarity === "up-good" ? delta < 0 : false;
  const better = polarity === "down-good" ? delta < 0 : polarity === "up-good" ? delta > 0 : false;
  const tone: Tone = worse ? "bad" : better ? "good" : "neutral";
  const abs = Math.abs(delta);
  const absPct = pct == null ? Infinity : Math.abs(pct);

  let alert: AlertLevel = null;
  if (worse) {
    if (format === "count") {
      if ((input.critical && abs >= 2) || (absPct >= 0.5 && abs >= 5)) alert = "critical";
      else if (absPct >= 0.2 && abs >= 3) alert = "warning";
    } else if (format === "pct") {
      if (abs >= 0.1) alert = "critical";
      else if (abs >= 0.05) alert = "warning";
    } else if (format === "score5") {
      if (abs >= 0.6) alert = "critical";
      else if (abs >= 0.3) alert = "warning";
    } else {
      if (absPct >= 0.4) alert = "critical";
      else if (absPct >= 0.15) alert = "warning";
    }
  }
  const small = format !== "count" && input.sample != null && Math.min(input.sample.current, input.sample.previous) < MIN_ALERT_SAMPLE;
  if (small) alert = null;

  const verb = delta === 0 ? "Không đổi" : delta > 0 ? "Tăng" : "Giảm";
  const pctText = pct == null || !Number.isFinite(pct) ? "" : ` (${delta >= 0 ? "+" : "−"}${Math.round(Math.abs(pct) * 100)}%)`;
  const head =
    delta === 0
      ? `Không đổi so với kỳ trước (${formatValue(previous, format)}).`
      : `${verb} ${formatDelta(delta, format).replace(/^[+−±]/, "")}${pctText}: ${formatValue(previous, format)} → ${formatValue(current, format)}.`;
  const verdict =
    alert === "critical"
      ? " Đáng báo động."
      : alert === "warning"
        ? " Cần theo dõi."
        : small && worse
          ? ` Ít dữ liệu (${Math.min(input.sample!.current, input.sample!.previous)} ticket) nên chưa báo động.`
          : tone === "good"
            ? " Chiều hướng tốt."
            : "";
  const ev = alert && base.evidence.length ? ` ${base.evidence.join("; ")}.` : "";
  return { ...base, delta, pct, tone, alert, note: `${head}${verdict}${ev}` };
}

/** Bằng chứng rút từ ticket: churn, angry, đòi gỡ app, urgent, nhóm issue nổi bật. */
export function evidenceFor(ts: Ticket[]): string[] {
  if (!ts.length) return [];
  const out: string[] = [];
  const churn = ts.filter((t) => t.churn_risk).length;
  const uninstall = ts.filter((t) => t.time_uninstall != null).length;
  const angry = ts.filter((t) => t.derived.moodEnd === "Angry").length;
  const urgent = ts.filter((t) => t.priority === "Urgent").length;
  if (uninstall) out.push(`${uninstall} khách đã gỡ app`);
  if (churn) out.push(`${churn} case churn risk`);
  if (angry) out.push(`${angry} khách Angry`);
  if (urgent) out.push(`${urgent} case Urgent`);
  return out;
}

export function compareMetrics(cur: Ticket[], prev: Ticket[], defs: MetricDef[] = METRICS): Comparison[] {
  return defs.map((d) => {
    const miss = missingOf(d.requires);
    if (miss.length) {
      return { ...judge({ key: d.key, label: d.label, format: d.format, polarity: d.polarity, current: null, previous: null }), note: `Sheet chưa có cột ${miss.join(", ")}.` };
    }
    return judge({
      key: d.key,
      label: d.label,
      format: d.format,
      polarity: d.polarity,
      critical: d.critical,
      current: d.compute(cur),
      previous: d.compute(prev),
      subset: d.match ? cur.filter(d.match) : undefined,
      sample: { current: cur.length, previous: prev.length },
    });
  });
}

/** So sánh theo từng giá trị của một chiều (vd. nhóm issue): "Flymate 12 vs 10". */
export function compareBreakdown(cur: Ticket[], prev: Ticket[], keyFn: (t: Ticket) => string | null, labelPrefix = ""): Comparison[] {
  const keys = new Set<string>();
  for (const t of [...cur, ...prev]) {
    const k = keyFn(t);
    if (k) keys.add(k);
  }
  return [...keys]
    .map((k) => {
      const c = cur.filter((t) => keyFn(t) === k);
      const p = prev.filter((t) => keyFn(t) === k);
      return judge({ key: k, label: `${labelPrefix}${k}`, format: "count", polarity: "down-good", current: c.length, previous: p.length, subset: c });
    })
    .sort((a, b) => (b.current ?? 0) - (a.current ?? 0));
}

export const ALERT_RANK: Record<string, number> = { critical: 2, warning: 1 };
export function sortByAlert(rows: Comparison[]): Comparison[] {
  return [...rows].sort((a, b) => (ALERT_RANK[b.alert ?? ""] ?? 0) - (ALERT_RANK[a.alert ?? ""] ?? 0));
}
