// Đánh giá hiệu suất Front-line / Technical: Điểm chất lượng 0–100 ghép từ các thành phần có trọng số.
// Thành phần nào thiếu dữ liệu thì bỏ qua và chia lại trọng số, để sheet thiếu cột vẫn chấm được.
import type { Ticket } from "@/lib/data/types";
import { addDays, dayKeyStart, diffDays, formatVnDate, VN_OFFSET_MS } from "@/lib/data/parse";
import type { Period } from "@/lib/query";
import type { MetricFormat, Polarity } from "./defs";

export type PerfRole = "fl" | "ts";

export const ROLE_LABELS: Record<PerfRole, { title: string; short: string; who: string }> = {
  fl: { title: "Front-line", short: "FL", who: "Người note recap (triggered_by)" },
  ts: { title: "Technical", short: "TS", who: "PIC có vai trò TS trong name_pic / role_pic (sheet cũ: cột ts)" },
};

/** Tối thiểu số ticket để điểm của một người / một mốc thời gian được coi là đáng tin. */
export const MIN_SAMPLE = 5;

// ── Thang điểm ──────────────────────────────────────────────────────

/** Nội suy tuyến tính: ≤ good → 100, ≥ bad → 0. */
const linear = (v: number, good: number, bad: number) => Math.max(0, Math.min(100, ((bad - v) / (bad - good)) * 100));
const avg = (vals: (number | null | undefined)[]) => {
  const v = vals.filter((x): x is number => x != null && Number.isFinite(x));
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
};
/** Trung vị: dùng cho thời gian vì vài ticket kéo dài nhiều ngày làm trung bình lệch. */
const median = (vals: (number | null | undefined)[]) => {
  const v = vals.filter((x): x is number => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const rate = (ts: Ticket[], num: (t: Ticket) => boolean, base: (t: Ticket) => boolean) => {
  const b = ts.filter(base);
  return b.length ? b.filter(num).length / b.length : null;
};

const MOOD_POINTS: Record<string, number> = { Excited: 100, Happy: 100, Neutral: 75, Worried: 40, Frustrated: 20, Angry: 0 };

/** Tên các TS tham gia ticket (ghép name_pic với role_pic theo thứ tự; một ticket có thể có nhiều TS). */
export function tsNames(t: Ticket): string[] {
  if (!t.derived.roles.includes("TS")) return [];
  if (t.name_pic.length === t.role_pic.length) return t.name_pic.filter((_, i) => t.role_pic[i] === "TS");
  const last = t.name_pic[t.name_pic.length - 1];
  return last ? [last] : [];
}

/** Những người "sở hữu" ticket theo vai trò: FL = người note recap; TS = mọi TS tham gia. */
export function peopleOf(t: Ticket, role: PerfRole): string[] {
  if (role === "fl") return t.triggered_by ? [t.triggered_by] : [];
  return tsNames(t);
}

export function ticketsOf(all: Ticket[], role: PerfRole, name?: string): Ticket[] {
  return all.filter((t) => {
    const p = peopleOf(t, role);
    return p.length > 0 && (name == null || p.includes(name));
  });
}

// ── Thành phần điểm ─────────────────────────────────────────────────

export interface ScoreComponent {
  key: string;
  label: string;
  weight: number;
  /** Cách quy đổi ra điểm, hiển thị cho người xem. */
  rule: string;
  rawFormat: MetricFormat;
  raw: (ts: Ticket[]) => number | null;
  score: (raw: number) => number;
}

const COMPONENTS: Record<PerfRole, ScoreComponent[]> = {
  fl: [
    {
      key: "first_reply",
      label: "Tốc độ phản hồi đầu",
      weight: 25,
      rule: "Trung vị phản hồi đầu: ≤ 2 phút = 100 điểm, ≥ 15 phút = 0",
      rawFormat: "duration",
      raw: (ts) => median(ts.map((t) => t.derived.firstReplySec)),
      score: (v) => linear(v, 120, 900),
    },
    {
      key: "resolved_rate",
      label: "Tỷ lệ resolved",
      weight: 20,
      rule: "% ticket có kết quả = Đã resolved",
      rawFormat: "pct",
      raw: (ts) => rate(ts, (t) => t.derived.resolved, (t) => t.resolution != null),
      score: (v) => v * 100,
    },
    {
      key: "csat",
      label: "CSAT",
      weight: 20,
      rule: "CSAT trung bình thang 1–5: 5 = 100 điểm, 1 = 0",
      rawFormat: "score5",
      raw: (ts) => avg(ts.map((t) => t.derived.csatScore)),
      score: (v) => ((v - 1) / 4) * 100,
    },
    {
      key: "mood_end",
      label: "Mood khách lúc kết thúc",
      weight: 15,
      rule: "Excited/Happy 100 · Neutral 75 · Frustrated 20 · Angry 0",
      rawFormat: "count",
      raw: (ts) => avg(ts.map((t) => (t.derived.moodEnd ? MOOD_POINTS[t.derived.moodEnd] : null))),
      score: (v) => v,
    },
    {
      key: "self_rate",
      label: "Tự xử lý issue",
      weight: 10,
      rule: "% issue không phải chuyển TS / Dev",
      rawFormat: "pct",
      raw: (ts) => rate(ts, (t) => t.derived.handler === "FL", (t) => t.category_ticket === "Issue"),
      score: (v) => v * 100,
    },
    {
      key: "review_asked",
      label: "Hỏi review đúng lúc",
      weight: 10,
      rule: "Đã hỏi / (đã hỏi + quên hỏi) khi khách vui vẻ",
      rawFormat: "pct",
      raw: (ts) => rate(ts, (t) => t.derived.reviewAsked === "asked", (t) => t.derived.reviewAsked === "asked" || t.derived.reviewAsked === "forgot"),
      score: (v) => v * 100,
    },
  ],
  ts: [
    {
      key: "join_wait",
      label: "Khách chờ TS join",
      weight: 25,
      rule: "Trung vị thời gian khách chờ TS join: ≤ 10 phút = 100 điểm, ≥ 60 phút = 0",
      rawFormat: "duration",
      raw: (ts) => median(ts.map((t) => t.derived.supportWaitSec)),
      score: (v) => linear(v, 600, 3600),
    },
    {
      key: "resolved_rate",
      label: "Tỷ lệ resolved",
      weight: 25,
      rule: "% ticket có kết quả = Đã resolved",
      rawFormat: "pct",
      raw: (ts) => rate(ts, (t) => t.derived.resolved, (t) => t.resolution != null),
      score: (v) => v * 100,
    },
    {
      key: "handle_time",
      label: "Thời gian handle",
      weight: 20,
      rule: "Trung vị thời gian handle của TS (total_time_handle_ts): ≤ 30 phút = 100 điểm, ≥ 4 giờ = 0",
      rawFormat: "duration",
      raw: (ts) => median(ts.map((t) => t.total_time_handle_ts ?? t.total_time_handle)),
      score: (v) => linear(v, 1800, 14400),
    },
    {
      key: "csat",
      label: "CSAT",
      weight: 15,
      rule: "CSAT trung bình thang 1–5: 5 = 100 điểm, 1 = 0",
      rawFormat: "score5",
      raw: (ts) => avg(ts.map((t) => t.derived.csatScore)),
      score: (v) => ((v - 1) / 4) * 100,
    },
    {
      key: "mood_end",
      label: "Mood khách lúc kết thúc",
      weight: 15,
      rule: "Excited/Happy 100 · Neutral 75 · Frustrated 20 · Angry 0",
      rawFormat: "count",
      raw: (ts) => avg(ts.map((t) => (t.derived.moodEnd ? MOOD_POINTS[t.derived.moodEnd] : null))),
      score: (v) => v,
    },
  ],
};

export function scoreComponents(role: PerfRole) {
  return COMPONENTS[role];
}

export interface ScoreResult {
  score: number | null;
  /** Số thành phần có dữ liệu / tổng thành phần. */
  coverage: { used: number; total: number };
  parts: { key: string; label: string; weight: number; rule: string; raw: number | null; rawFormat: MetricFormat; score: number | null }[];
  sample: number;
}

export function qualityScore(ts: Ticket[], role: PerfRole): ScoreResult {
  const parts = COMPONENTS[role].map((c) => {
    const raw = ts.length ? c.raw(ts) : null;
    return { key: c.key, label: c.label, weight: c.weight, rule: c.rule, raw, rawFormat: c.rawFormat, score: raw == null ? null : c.score(raw) };
  });
  const used = parts.filter((p) => p.score != null);
  const w = used.reduce((s, p) => s + p.weight, 0);
  const score = w ? used.reduce((s, p) => s + p.score! * p.weight, 0) / w : null;
  return { score, coverage: { used: used.length, total: parts.length }, parts, sample: ts.length };
}

// ── Chỉ số hiệu suất (cho biểu đồ đường & bảng) ─────────────────────

export interface PerfMetric {
  key: string;
  label: string;
  format: MetricFormat | "score";
  polarity: Polarity;
  compute: (ts: Ticket[], role: PerfRole) => number | null;
}

export const PERF_METRICS: PerfMetric[] = [
  { key: "score", label: "Điểm chất lượng", format: "score", polarity: "up-good", compute: (ts, role) => qualityScore(ts, role).score },
  { key: "tickets", label: "Số ticket", format: "count", polarity: "neutral", compute: (ts) => ts.length },
  { key: "resolved_rate", label: "Tỷ lệ resolved", format: "pct", polarity: "up-good", compute: (ts) => rate(ts, (t) => t.derived.resolved, (t) => t.resolution != null) },
  { key: "first_reply", label: "Phản hồi đầu (trung vị)", format: "duration", polarity: "down-good", compute: (ts) => median(ts.map((t) => t.derived.firstReplySec)) },
  { key: "join_wait", label: "Khách chờ TS join (trung vị)", format: "duration", polarity: "down-good", compute: (ts) => median(ts.map((t) => t.derived.supportWaitSec)) },
  { key: "handle_time", label: "Thời gian handle (trung vị)", format: "duration", polarity: "down-good", compute: (ts) => median(ts.map((t) => t.total_time_handle)) },
  { key: "handle_fl", label: "Handle FL (trung vị)", format: "duration", polarity: "down-good", compute: (ts) => median(ts.map((t) => t.total_time_handle_fl)) },
  { key: "handle_ts", label: "Handle TS (trung vị)", format: "duration", polarity: "down-good", compute: (ts) => median(ts.map((t) => t.total_time_handle_ts)) },
  { key: "csat_avg", label: "CSAT TB (1–5)", format: "score5", polarity: "up-good", compute: (ts) => avg(ts.map((t) => t.derived.csatScore)) },
  { key: "csat_good", label: "CSAT tốt", format: "pct", polarity: "up-good", compute: (ts) => rate(ts, (t) => t.csat === "Tốt", (t) => t.csat != null) },
  { key: "self_rate", label: "Tự xử lý issue", format: "pct", polarity: "up-good", compute: (ts) => rate(ts, (t) => t.derived.handler === "FL", (t) => t.category_ticket === "Issue") },
  { key: "angry_rate", label: "Tỷ lệ khách Angry", format: "pct", polarity: "down-good", compute: (ts) => rate(ts, (t) => t.derived.moodEnd === "Angry", (t) => t.derived.moodEnd != null) },
  { key: "worsened_rate", label: "Tỷ lệ mood xấu đi", format: "pct", polarity: "down-good", compute: (ts) => rate(ts, (t) => t.derived.moodWorsened, (t) => t.derived.moodStart != null) },
  {
    key: "review_asked_rate",
    label: "Tỷ lệ hỏi review",
    format: "pct",
    polarity: "up-good",
    compute: (ts) => rate(ts, (t) => t.derived.reviewAsked === "asked", (t) => t.derived.reviewAsked === "asked" || t.derived.reviewAsked === "forgot"),
  },
  { key: "review_missed", label: "Đủ ĐK review chưa hỏi", format: "count", polarity: "down-good", compute: (ts) => ts.filter((t) => t.derived.reviewMissed).length },
];

export const ROLE_METRICS: Record<PerfRole, string[]> = {
  fl: ["score", "tickets", "first_reply", "handle_fl", "resolved_rate", "csat_avg", "self_rate", "review_asked_rate", "review_missed", "angry_rate", "worsened_rate"],
  ts: ["score", "tickets", "join_wait", "handle_ts", "resolved_rate", "csat_avg", "angry_rate", "worsened_rate"],
};

export function perfMetric(key: string): PerfMetric {
  return PERF_METRICS.find((m) => m.key === key) ?? PERF_METRICS[0];
}

// ── Chuỗi thời gian ─────────────────────────────────────────────────

export type Grain = "day" | "week" | "month";
export const GRAIN_LABEL: Record<Grain, string> = { day: "Ngày", week: "Tuần", month: "Tháng" };

export function autoGrain(p: Period): Grain {
  const n = diffDays(p.from, p.to) + 1;
  return n <= 31 ? "day" : n <= 140 ? "week" : "month";
}

export interface Bucket {
  from: string;
  to: string;
  label: string;
}

function weekStart(key: string): string {
  const dow = new Date(dayKeyStart(key) + VN_OFFSET_MS).getUTCDay();
  return addDays(key, -((dow + 6) % 7));
}

export function buckets(p: Period, grain: Grain): Bucket[] {
  const out: Bucket[] = [];
  let cur = grain === "week" ? weekStart(p.from) : grain === "month" ? `${p.from.slice(0, 7)}-01` : p.from;
  while (cur <= p.to) {
    let end: string;
    if (grain === "day") end = cur;
    else if (grain === "week") end = addDays(cur, 6);
    else {
      const [y, m] = cur.split("-").map(Number);
      const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
      end = addDays(next, -1);
    }
    const from = cur < p.from ? p.from : cur;
    const to = end > p.to ? p.to : end;
    const label = grain === "month" ? `T${Number(cur.slice(5, 7))}/${cur.slice(2, 4)}` : grain === "week" ? `${formatVnDate(from).slice(0, 5)}` : formatVnDate(cur).slice(0, 5);
    out.push({ from, to, label });
    cur = addDays(end, 1);
  }
  return out;
}

export interface SeriesPoint {
  label: string;
  from: string;
  to: string;
  value: number | null;
  sample: number;
}

/** Giá trị chỉ số theo từng mốc. Mốc có ít hơn MIN_SAMPLE ticket vẫn trả giá trị nhưng gắn sample để UI làm mờ. */
export function series(ts: Ticket[], p: Period, grain: Grain, metricKey: string, role: PerfRole): SeriesPoint[] {
  const m = perfMetric(metricKey);
  return buckets(p, grain).map((b) => {
    const inB = ts.filter((t) => t.derived.dayKey != null && t.derived.dayKey >= b.from && t.derived.dayKey <= b.to);
    return { label: b.label, from: b.from, to: b.to, value: inB.length ? m.compute(inB, role) : null, sample: inB.length };
  });
}

// ── Thống kê một người ──────────────────────────────────────────────

export interface PersonRow {
  name: string;
  tickets: number;
  score: ScoreResult;
  prevScore: number | null;
  metrics: Record<string, number | null>;
  trend: (number | null)[];
}

export function people(cur: Ticket[], prev: Ticket[], role: PerfRole, p: Period, grain: Grain): PersonRow[] {
  const names = new Map<string, Ticket[]>();
  for (const t of cur) {
    for (const n of peopleOf(t, role)) {
      if (!names.has(n)) names.set(n, []);
      names.get(n)!.push(t);
    }
  }
  return [...names.entries()]
    .map(([name, list]) => {
      const prevList = prev.filter((t) => peopleOf(t, role).includes(name));
      return {
        name,
        tickets: list.length,
        score: qualityScore(list, role),
        prevScore: prevList.length >= MIN_SAMPLE ? qualityScore(prevList, role).score : null,
        metrics: Object.fromEntries(ROLE_METRICS[role].map((k) => [k, perfMetric(k).compute(list, role)])),
        // Sparkline: theo tuần khi khoảng > 14 ngày để mỗi điểm có đủ mẫu, bỏ mốc < 3 ticket.
        trend: series(list, p, diffDays(p.from, p.to) > 14 && grain === "day" ? "week" : grain, "score", role).map((s) => (s.sample >= 3 ? s.value : null)),
      };
    })
    .sort((a, b) => b.tickets - a.tickets);
}
