// Số liệu "đóng băng" của một báo cáo kỳ đã kết thúc — dùng để vẽ PDF lưu trữ.
import type { Ticket } from "@/lib/data/types";
import { formatDuration, formatVnDate } from "@/lib/data/parse";
import { actionItems } from "@/lib/alerts";
import { countBy, formatDelta, formatValue, judge, type AlertLevel, type Tone } from "@/lib/metrics/compute";
import { people, perfMetric, type PerfRole } from "@/lib/metrics/performance";
import { inPeriod } from "@/lib/query";
import { devBacklog, HEADLINES, reviewFunnel, ROWS, storesWhere, TEAMS, type ReportTeam } from "@/lib/reports";
import { previousOf, type ArchivePeriod } from "./periods";

export interface SnapshotMetric {
  label: string;
  current: string;
  previous: string;
  delta: string | null;
  tone: Tone;
  alert: AlertLevel;
}

export interface SnapshotTable {
  title: string;
  note?: string;
  columns: string[];
  rows: string[][];
  /** Tỷ lệ độ rộng cột (tổng tuỳ ý). */
  widths?: number[];
}

export interface ReportSnapshot {
  team: ReportTeam;
  teamTitle: string;
  audience: string;
  period: ArchivePeriod;
  previous: ArchivePeriod;
  generatedAt: number;
  /** true = tạo theo lịch, false = người dùng tự tạo. */
  auto?: boolean;
  /** false = chỉ số liệu kỳ này, không có cột / phần so sánh với kỳ trước. */
  compare: boolean;
  sourceLabel: string;
  totals: { tickets: number; stores: number; prevTickets: number };
  headline: SnapshotMetric[];
  sections: { title: string; metrics: SnapshotMetric[] }[];
  tables: SnapshotTable[];
}

const pct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const short = (s: string | null | undefined, n = 90) => (!s ? "—" : s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function buildSnapshot(all: Ticket[], team: ReportTeam, period: ArchivePeriod, today: string, sourceLabel: string, compare = true): ReportSnapshot {
  const previous = previousOf(period);
  const cur = all.filter((t) => inPeriod(t, period));
  const prev = all.filter((t) => inPeriod(t, previous));

  const metrics = ROWS[team].map((def) => {
    const c = def.compute(cur);
    const p = def.compute(prev);
    const j = judge({ key: def.key, label: def.label, format: def.format, polarity: def.polarity, current: c, previous: p, sample: { current: cur.length, previous: prev.length } });
    const m: SnapshotMetric = {
      label: def.label,
      current: formatValue(c, def.format),
      previous: formatValue(p, def.format),
      delta: j.delta != null ? formatDelta(j.delta, def.format) : null,
      tone: j.tone,
      alert: j.alert,
    };
    return { key: def.key, section: def.section, m };
  });
  const sections = [...new Set(metrics.map((x) => x.section))].map((title) => ({ title, metrics: metrics.filter((x) => x.section === title).map((x) => x.m) }));
  const headline = HEADLINES[team].map((k) => metrics.find((x) => x.key === k)?.m).filter((m): m is SnapshotMetric => m != null);

  return {
    team,
    teamTitle: TEAMS[team].title,
    audience: TEAMS[team].audience,
    period,
    previous,
    generatedAt: Date.now(),
    compare,
    sourceLabel,
    totals: { tickets: cur.length, stores: new Set(cur.map((t) => t.store_domain).filter(Boolean)).size, prevTickets: prev.length },
    headline,
    sections,
    tables: team === "cs" ? csTables(cur, prev, period) : team === "dev" ? devTables(all, cur, today) : marketingTables(cur),
  };
}

function peopleTable(role: PerfRole, cur: Ticket[], prev: Ticket[], period: ArchivePeriod, cols: string[]): SnapshotTable {
  const rows = people(cur, prev, role, period, "week").sort((a, b) => (b.score.score ?? -1) - (a.score.score ?? -1));
  return {
    title: role === "fl" ? "Hiệu suất Front-line" : "Hiệu suất Technical",
    note: "Xếp theo Điểm chất lượng (0–100). Người dưới 5 ticket: điểm chưa đủ tin cậy.",
    columns: [role === "fl" ? "FL" : "TS", "Điểm", "Ticket", ...cols.map((k) => perfMetric(k).label)],
    widths: [2.2, 0.8, 0.8, ...cols.map(() => 1.2)],
    rows: rows.map((r) => [
      r.name,
      r.score.score == null ? "—" : String(Math.round(r.score.score)),
      String(r.tickets),
      ...cols.map((k) => {
        const v = r.metrics[k];
        const f = perfMetric(k).format;
        return v == null ? "—" : f === "pct" ? pct(v) : f === "duration" ? formatDuration(v) : f === "score5" ? `${v.toFixed(1)}/5` : String(Math.round(v));
      }),
    ]),
  };
}

function csTables(cur: Ticket[], prev: Ticket[], period: ArchivePeriod): SnapshotTable[] {
  const actions = actionItems(cur);
  const missed = cur.filter((t) => t.derived.reviewMissed);
  return [
    peopleTable("fl", cur, prev, period, ["first_reply", "resolved_rate", "csat_avg", "review_asked_rate", "review_missed"]),
    peopleTable("ts", cur, prev, period, ["join_wait", "handle_ts", "resolved_rate", "csat_avg"]),
    {
      title: `Ticket cần xử lý · ${actions.length}`,
      note: "Churn chưa xong, khách Angry/Frustrated, hết ca chưa xong, solution chưa ổn, đợi TS/Dev, CSAT 1–2.",
      columns: ["Khách contact", "Store", "FL", "Lý do", "Issue"],
      widths: [1.1, 1.4, 1.3, 2, 2.6],
      rows: actions.slice(0, 30).map(({ ticket: t, reasons }) => [formatVnDate(t.derived.at), t.store_name ?? t.store_domain ?? "—", t.triggered_by ?? "—", reasons.map((r) => r.label).join(", "), short(t.issue_summary)]),
    },
    {
      title: `Đủ điều kiện mời review nhưng chưa hỏi · ${missed.length}`,
      columns: ["Khách contact", "FL", "Store", "Issue"],
      widths: [1.1, 1.4, 1.6, 3.4],
      rows: missed.map((t) => [formatVnDate(t.derived.at), t.triggered_by ?? "—", t.store_name ?? t.store_domain ?? "—", short(t.issue_summary)]),
    },
  ];
}

function devTables(all: Ticket[], cur: Ticket[], today: string): SnapshotTable[] {
  const issues = cur.filter((t) => t.category_ticket === "Issue");
  const backlog = devBacklog(all, today);
  const dev = cur.filter((t) => t.derived.handler === "Dev");
  const bucketRows = (b: ReturnType<typeof countBy>) => b.map((x) => [x.key, String(x.count), pct(x.share)]);
  return [
    {
      title: `Backlog đang chờ Dev (lúc tạo báo cáo) · ${backlog.length}`,
      columns: ["Chờ", "Store", "Nhóm", "FL", "Kết quả", "Issue"],
      widths: [0.8, 1.5, 1, 1.4, 1.3, 3],
      rows: backlog.slice(0, 40).map(({ ticket: t, ageDays }) => [`${ageDays ?? "—"} ngày`, t.store_name ?? t.store_domain ?? "—", t.category_issue ?? "—", t.triggered_by ?? "—", t.resolution ?? "—", short(t.issue_summary)]),
    },
    { title: "Issue theo khu vực", columns: ["Khu vực", "Issue", "Tỷ trọng"], widths: [3, 1, 1], rows: bucketRows(countBy(issues, (t) => t.derived.issueArea)) },
    { title: "Issue theo nhóm chi tiết", columns: ["Nhóm", "Issue", "Tỷ trọng"], widths: [3, 1, 1], rows: bucketRows(countBy(issues, (t) => t.category_issue)) },
    { title: "Nguyên nhân gốc", columns: ["Nguyên nhân", "Issue", "Tỷ trọng"], widths: [3, 1, 1], rows: bucketRows(countBy(issues, (t) => t.root_cause)) },
    { title: "Trang gặp vấn đề", columns: ["Trang", "Issue", "Tỷ trọng"], widths: [3, 1, 1], rows: bucketRows(countBy(issues, (t) => t.page_issue)) },
    {
      title: `Ticket cần Dev trong kỳ · ${dev.length}`,
      columns: ["Khách contact", "Store", "Nhóm", "Kết quả", "Issue"],
      widths: [1.1, 1.5, 1, 1.4, 3.4],
      rows: dev.map((t) => [formatVnDate(t.derived.at), t.store_name ?? t.store_domain ?? "—", t.category_issue ?? "—", t.resolution ?? "—", short(t.issue_summary)]),
    },
  ];
}

function marketingTables(cur: Ticket[]): SnapshotTable[] {
  const churn = storesWhere(cur, (t) => t.churn_risk === true);
  const upsell = storesWhere(cur, (t) => t.derived.upsell && !t.churn_risk);
  const f = reviewFunnel(cur);
  const voice = (cat: "Improve" | "Feedback") => countBy(cur.filter((t) => t.category_ticket === cat), (t) => t.issue_summary).map((b) => [short(b.key, 120), String(b.count)]);
  const plan = (t: Ticket) => `${t.pagefly_plan ?? "—"}${t.pagefly_price != null ? ` · $${t.pagefly_price}` : ""}`;
  return [
    {
      title: `Store có nguy cơ rời bỏ · ${churn.length}`,
      note: `Doanh thu plan rủi ro: ${formatValue(churn.reduce((s, t) => s + (t.pagefly_price ?? 0), 0), "money")}/tháng`,
      columns: ["Store", "Plan", "Gỡ app", "Vấn đề", "Hành động tiếp theo"],
      widths: [1.5, 1.3, 0.9, 2.2, 2.4],
      rows: churn.map((t) => [t.store_name ?? t.store_domain ?? "—", plan(t), t.time_uninstall ? formatVnDate(t.time_uninstall) : "Chưa", short(t.issue_summary, 70), short(t.next_action, 80)]),
    },
    {
      title: `Cơ hội upsell · ${upsell.length} store`,
      columns: ["Store", "Plan", "FL", "Gợi ý upsell"],
      widths: [1.5, 1.3, 1.3, 3.6],
      rows: upsell.map((t) => [t.store_name ?? t.store_domain ?? "—", plan(t), t.triggered_by ?? "—", short(t.upsell_signal, 120)]),
    },
    {
      title: "Phễu mời review",
      columns: ["Bước", "Số ticket", "Tỷ lệ"],
      widths: [3, 1, 1],
      rows: [
        ["Đủ điều kiện mời review (QUALIFIED)", String(f.qualified), "100%"],
        ["FL đã hỏi review", String(f.asked), f.qualified ? pct(f.asked / f.qualified) : "—"],
        ["Khách đã có review từ trước", String(f.already), f.qualified ? pct(f.already / f.qualified) : "—"],
        ["Bỏ lỡ: chưa hỏi", String(f.missed), f.qualified ? pct(f.missed / f.qualified) : "—"],
        ["Review mới ghi nhận sau support", String(f.newReviews), ""],
      ],
    },
    { title: "Yêu cầu tính năng (Improve)", columns: ["Yêu cầu", "Số lần"], widths: [5, 1], rows: voice("Improve") },
    { title: "Góp ý (Feedback)", columns: ["Góp ý", "Số lần"], widths: [5, 1], rows: voice("Feedback") },
    {
      title: "Issue với app bên thứ 3",
      columns: ["Tóm tắt", "Số ticket"],
      widths: [5, 1],
      rows: countBy(cur.filter((t) => t.category_issue === "3rd App"), (t) => t.issue_summary).map((b) => [short(b.key, 120), String(b.count)]),
    },
  ];
}
