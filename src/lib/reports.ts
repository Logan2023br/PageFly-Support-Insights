import { addDays, dayKeyStart, formatDuration, formatVnDate, vnDayKey, VN_OFFSET_MS } from "@/lib/data/parse";
import type { Ticket } from "@/lib/data/types";
import { CATEGORY_ISSUE } from "@/lib/schema/fields";
import { countBy, formatValue, judge, type Comparison } from "@/lib/metrics/compute";
import { metric, type MetricFormat, type Polarity } from "@/lib/metrics/defs";
import { flStats, picStats } from "@/lib/metrics/people";
import { inPeriod, type Period } from "@/lib/query";

export type ReportTeam = "cs" | "dev" | "marketing";
export type ReportGrain = "week" | "month" | "quarter" | "all";

export const TEAMS: Record<ReportTeam, { title: string; description: string; audience: string }> = {
  cs: { title: "CS Team", description: "Hiệu suất FL/TS, tốc độ phản hồi, chất lượng xử lý, review.", audience: "CS lead, Shift lead" },
  dev: { title: "Dev Team", description: "Nhóm lỗi, issue lặp lại, backlog chờ Dev, trang và nguyên nhân gốc.", audience: "Dev lead, PO" },
  marketing: { title: "Marketing Team", description: "Review, churn, upsell, góp ý & yêu cầu tính năng, Partner/3rd App.", audience: "Marketing, Partner" },
};

export const GRAIN_LABELS: Record<ReportGrain, string> = { week: "Tuần", month: "Tháng", quarter: "Quý", all: "Toàn bộ" };

export interface ReportRowDef {
  key: string;
  label: string;
  section: string;
  format: MetricFormat;
  polarity: Polarity;
  compute: (ts: Ticket[]) => number | null;
}

const fromMetric = (key: string, section: string, label?: string): ReportRowDef => {
  const m = metric(key);
  return { key, label: label ?? m.label, section, format: m.format, polarity: m.polarity, compute: m.compute };
};
const countRow = (key: string, label: string, section: string, match: (t: Ticket) => boolean, polarity: Polarity = "down-good"): ReportRowDef => ({
  key,
  label,
  section,
  format: "count",
  polarity,
  compute: (ts) => ts.filter(match).length,
});

const ROWS: Record<ReportTeam, ReportRowDef[]> = {
  cs: [
    fromMetric("total", "Khối lượng"),
    fromMetric("issue", "Khối lượng"),
    fromMetric("feedback", "Khối lượng"),
    fromMetric("improve", "Khối lượng"),
    fromMetric("fl_self", "Phân luồng"),
    fromMetric("fl_self_rate", "Phân luồng"),
    fromMetric("ts_handled", "Phân luồng"),
    fromMetric("dev_needed", "Phân luồng"),
    fromMetric("first_reply", "Tốc độ"),
    fromMetric("first_reply_median", "Tốc độ"),
    fromMetric("max_reply", "Tốc độ"),
    fromMetric("handle_time", "Tốc độ"),
    fromMetric("ticket_time", "Tốc độ"),
    fromMetric("resolved_rate", "Chất lượng"),
    fromMetric("unresolved_shift", "Chất lượng"),
    fromMetric("csat_good", "Chất lượng"),
    fromMetric("solution_bad", "Chất lượng"),
    fromMetric("mood_worsened", "Chất lượng"),
    fromMetric("angry", "Chất lượng"),
    countRow("pic_need_improve", "PIC bị đánh giá cần cải thiện", "Chất lượng", (t) => /cần cải thiện/i.test(t.review_pic ?? "")),
    fromMetric("review_asked_rate", "Review"),
    fromMetric("review_forgot", "Review"),
    fromMetric("new_reviews", "Review"),
  ],
  dev: [
    fromMetric("issue", "Tổng quan"),
    fromMetric("dev_needed", "Tổng quan"),
    fromMetric("dev_note", "Tổng quan", "Issue lặp lại (dev_note)"),
    countRow("wait_dev", "Đang đợi dev check", "Tổng quan", (t) => t.resolution === "Đợi dev check"),
    countRow("need_dev_note", "Ticket cần dev note", "Tổng quan", (t) => t.resolution === "Ticket cần dev note"),
    countRow("dev_urgent", "Issue cần Dev mức Urgent", "Tổng quan", (t) => t.derived.handler === "Dev" && t.priority === "Urgent"),
    countRow("bug_rootcause_app", "Nguyên nhân do app bug", "Tổng quan", (t) => /app bug|lỗi app|pagefly/i.test(t.root_cause ?? "")),
    {
      key: "dev_handle",
      label: "Thời gian handle ticket Dev (TB)",
      section: "Tổng quan",
      format: "duration",
      polarity: "down-good",
      compute: (ts) => {
        const v = ts.filter((t) => t.derived.handler === "Dev" && t.total_time_handle != null).map((t) => t.total_time_handle!);
        return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
      },
    },
    ...CATEGORY_ISSUE.map((c) => countRow(`area_${c}`, `Issue ${c}`, "Theo nhóm issue", (t) => t.category_ticket === "Issue" && t.category_issue === c)),
  ],
  marketing: [
    fromMetric("total", "Tổng quan"),
    fromMetric("stores", "Tổng quan"),
    fromMetric("new_reviews", "Review"),
    fromMetric("review_asked_rate", "Review"),
    fromMetric("review_forgot", "Review"),
    countRow("crisp5", "Crisp 5 sao", "Review", (t) => t.derived.crispStars === 5, "up-good"),
    fromMetric("churn", "Giữ chân"),
    fromMetric("uninstalled", "Giữ chân"),
    fromMetric("revenue_at_risk", "Giữ chân"),
    fromMetric("refund", "Giữ chân"),
    fromMetric("upsell", "Tăng trưởng"),
    fromMetric("feedback", "Tiếng nói khách hàng"),
    fromMetric("improve", "Tiếng nói khách hàng"),
    fromMetric("marketing", "Tiếng nói khách hàng"),
    fromMetric("partner", "Partner"),
    countRow("third_party", "Issue liên quan 3rd App", "Partner", (t) => t.category_issue === "3rd App"),
  ],
};

// ── Kỳ báo cáo ────────────────────────────────────────────────────────

export interface ReportPeriod extends Period {
  label: string;
}

function weekStart(key: string): string {
  const dow = new Date(dayKeyStart(key) + VN_OFFSET_MS).getUTCDay(); // 0 = CN
  return addDays(key, -((dow + 6) % 7));
}

function monthOf(key: string) {
  return { y: +key.slice(0, 4), m: +key.slice(5, 7) };
}
const pad = (n: number) => String(n).padStart(2, "0");
const lastDayOfMonth = (y: number, m: number) => vnDayKey(Date.UTC(y, m, 1) - VN_OFFSET_MS - 86400000);

export function reportPeriods(grain: ReportGrain, today: string, earliest: string): ReportPeriod[] {
  const out: ReportPeriod[] = [];
  if (grain === "week") {
    let start = weekStart(today);
    for (let i = 0; i < 8; i++) {
      const end = addDays(start, 6);
      out.unshift({ from: start, to: end, label: `${formatVnDate(start).slice(0, 5)}–${formatVnDate(end).slice(0, 5)}` });
      start = addDays(start, -7);
    }
  } else if (grain === "month") {
    let { y, m } = monthOf(today);
    for (let i = 0; i < 6; i++) {
      out.unshift({ from: `${y}-${pad(m)}-01`, to: lastDayOfMonth(y, m), label: `T${m}/${y}` });
      m--;
      if (m === 0) {
        m = 12;
        y--;
      }
    }
  } else {
    const start = monthOf(today);
    let y = start.y;
    let q = Math.ceil(start.m / 3);
    const n = grain === "quarter" ? 4 : 12;
    for (let i = 0; i < n; i++) {
      const startM = (q - 1) * 3 + 1;
      const p = { from: `${y}-${pad(startM)}-01`, to: lastDayOfMonth(y, startM + 2), label: `Q${q}/${y}` };
      if (grain === "all" && p.to < earliest) break;
      out.unshift(p);
      q--;
      if (q === 0) {
        q = 4;
        y--;
      }
    }
  }
  return out;
}

// ── Dựng báo cáo ──────────────────────────────────────────────────────

export interface ReportRow {
  def: Pick<ReportRowDef, "key" | "label" | "section" | "format" | "polarity">;
  values: (number | null)[];
  total: number | null;
  change: Comparison;
}

export interface ReportTable {
  key: string;
  title: string;
  columns: string[];
  rows: (string | number)[][];
}

export interface Report {
  team: ReportTeam;
  grain: ReportGrain;
  periods: ReportPeriod[];
  rows: ReportRow[];
  tables: ReportTable[];
  /** Kỳ gần nhất dùng cho các bảng chi tiết. */
  focus: ReportPeriod;
  /** Cột "Thay đổi" so sánh 2 kỳ đã đủ ngày gần nhất (kỳ đang chạy chưa đủ để so). */
  compared: { current: string; previous: string } | null;
}

const fmtPct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

export function buildReport(all: Ticket[], team: ReportTeam, grain: ReportGrain, today: string): Report {
  const earliest = all.reduce((min, t) => (t.derived.dayKey && t.derived.dayKey < min ? t.derived.dayKey : min), today);
  const periods = reportPeriods(grain, today, earliest).map((p) => (p.to > today ? { ...p, label: `${p.label} (đến nay)` } : p));
  const buckets = periods.map((p) => all.filter((t) => inPeriod(t, p)));
  const whole = all.filter((t) => inPeriod(t, { from: periods[0].from, to: periods[periods.length - 1].to }));

  const lastComplete = periods[periods.length - 1].to > today ? periods.length - 2 : periods.length - 1;
  const rows: ReportRow[] = ROWS[team].map((def) => {
    const values = buckets.map((b) => def.compute(b));
    return {
      def: { key: def.key, label: def.label, section: def.section, format: def.format, polarity: def.polarity },
      values,
      total: def.compute(whole),
      change: judge({
        key: def.key,
        label: def.label,
        format: def.format,
        polarity: def.polarity,
        current: lastComplete >= 0 ? values[lastComplete] : null,
        previous: lastComplete >= 1 ? values[lastComplete - 1] : null,
      }),
    };
  });

  // Kỳ gần nhất có dữ liệu (kỳ hiện tại có thể mới bắt đầu).
  const focus = periods[periods.length - 1];
  const focusTickets = buckets[buckets.length - 1];
  const tables: ReportTable[] = [];

  if (team === "cs") {
    tables.push({
      key: "fl",
      title: `Hiệu suất FL · ${focus.label}`,
      columns: ["FL", "Ticket", "Ca", "Tự xử lý", "Chuyển TS/Dev", "Resolved", "Phản hồi đầu TB", "Chờ lâu nhất TB", "CSAT tốt", "Angry", "Hỏi review", "Quên hỏi", "Cần cải thiện"],
      rows: flStats(focusTickets).map((s) => [
        s.name,
        s.tickets,
        s.shifts,
        fmtPct(s.selfRate),
        s.escalated,
        fmtPct(s.resolvedRate),
        formatDuration(s.firstReplyAvg),
        formatDuration(s.maxReplyAvg),
        fmtPct(s.csatGood),
        s.angry,
        s.reviewAsked,
        s.reviewForgot,
        s.needImprove,
      ]),
    });
    tables.push({
      key: "ts",
      title: `Hiệu suất TS · ${focus.label}`,
      columns: ["TS", "Ticket", "Resolved", "Khách chờ TS join (TB)", "Handle TB", "Còn mở", "Angry"],
      rows: picStats(focusTickets, "TS").map((s) => [s.name, s.tickets, fmtPct(s.resolvedRate), formatDuration(s.joinWaitAvg), formatDuration(s.handleAvg), s.pending, s.angry]),
    });
  }

  if (team === "dev") {
    const dev = focusTickets.filter((t) => t.derived.handler === "Dev");
    tables.push({
      key: "dev_top",
      title: `Lỗi cần Dev nhiều nhất · ${focus.label}`,
      columns: ["Tóm tắt issue", "Nhóm", "Số ticket", "dev_note", "Urgent", "Store bị ảnh hưởng"],
      rows: countBy(dev, (t) => t.issue_summary)
        .slice(0, 15)
        .map((b) => {
          const list = dev.filter((t) => t.issue_summary === b.key);
          return [b.key, list[0]?.category_issue ?? "—", b.count, list.filter((t) => t.type_issue === "dev_note").length, list.filter((t) => t.priority === "Urgent").length, new Set(list.map((t) => t.store_domain)).size];
        }),
    });
    const issues = focusTickets.filter((t) => t.category_ticket === "Issue");
    tables.push({
      key: "pages",
      title: `Trang gặp vấn đề · ${focus.label}`,
      columns: ["Trang", "Issue", "Tỷ trọng"],
      rows: countBy(issues, (t) => t.page_issue).map((b) => [b.key, b.count, `${Math.round(b.share * 100)}%`]),
    });
    tables.push({
      key: "roots",
      title: `Nguyên nhân gốc · ${focus.label}`,
      columns: ["Nguyên nhân", "Issue", "Tỷ trọng"],
      rows: countBy(issues, (t) => t.root_cause).map((b) => [b.key, b.count, `${Math.round(b.share * 100)}%`]),
    });
    tables.push({
      key: "dev_pic",
      title: `Dev tham gia · ${focus.label}`,
      columns: ["Dev", "Ticket", "Resolved", "Khách chờ Dev join (TB)", "Handle TB", "Còn mở"],
      rows: picStats(focusTickets, "Dev").map((s) => [s.name, s.tickets, fmtPct(s.resolvedRate), formatDuration(s.joinWaitAvg), formatDuration(s.handleAvg), s.pending]),
    });
  }

  if (team === "marketing") {
    const storeRow = (t: Ticket) => [t.store_name ?? "—", t.store_domain ?? "—", t.pagefly_plan ?? "—", t.pagefly_price ?? "—"];
    tables.push({
      key: "upsell",
      title: `Cơ hội upsell · ${focus.label}`,
      columns: ["Store", "Domain", "Plan", "Giá ($)", "Gợi ý upsell", "FL"],
      rows: focusTickets.filter((t) => t.derived.upsell && !t.churn_risk).map((t) => [...storeRow(t), t.upsell_signal ?? "", t.triggered_by ?? ""]),
    });
    tables.push({
      key: "churn",
      title: `Store có nguy cơ rời bỏ · ${focus.label}`,
      columns: ["Store", "Domain", "Plan", "Giá ($)", "Đã gỡ app", "Issue", "Hành động tiếp theo"],
      rows: focusTickets
        .filter((t) => t.churn_risk)
        .map((t) => [...storeRow(t), t.time_uninstall ? formatVnDate(t.time_uninstall) : "Chưa", t.issue_summary ?? "", t.next_action ?? ""]),
    });
    tables.push({
      key: "improve",
      title: `Yêu cầu tính năng (Improve) · ${focus.label}`,
      columns: ["Yêu cầu", "Số khách", "Plan trả phí"],
      rows: countBy(
        focusTickets.filter((t) => t.category_ticket === "Improve"),
        (t) => t.issue_summary,
      ).map((b) => [b.key, b.count, focusTickets.filter((t) => t.category_ticket === "Improve" && t.issue_summary === b.key && (t.pagefly_price ?? 0) > 0).length]),
    });
    tables.push({
      key: "feedback",
      title: `Góp ý (Feedback) · ${focus.label}`,
      columns: ["Góp ý", "Số lần", "Cần chú ý"],
      rows: countBy(
        focusTickets.filter((t) => t.category_ticket === "Feedback"),
        (t) => t.issue_summary,
      ).map((b) => [b.key, b.count, focusTickets.filter((t) => t.category_ticket === "Feedback" && t.issue_summary === b.key && t.derived.attention).length]),
    });
    tables.push({
      key: "third_party",
      title: `Issue với app bên thứ 3 (Partner) · ${focus.label}`,
      columns: ["Tóm tắt", "Số ticket", "Chuyển Partner"],
      rows: countBy(
        focusTickets.filter((t) => t.category_issue === "3rd App"),
        (t) => t.issue_summary,
      ).map((b) => [b.key, b.count, focusTickets.filter((t) => t.category_issue === "3rd App" && t.issue_summary === b.key && t.team_owner === "Partner").length]),
    });
  }

  const compared = lastComplete >= 1 ? { current: periods[lastComplete].label, previous: periods[lastComplete - 1].label } : null;
  return { team, grain, periods, rows, tables, focus, compared };
}

export function reportFacts(r: Report) {
  return {
    team: TEAMS[r.team].title,
    grain: GRAIN_LABELS[r.grain],
    periods: r.periods.map((p) => p.label),
    changeCompares: r.compared,
    comparisons: r.rows.map((row) => ({
      key: row.def.key,
      label: row.def.label,
      values: row.values.map((v) => formatValue(v, row.def.format)),
      latestVsPrevious: row.change.note,
      alert: row.change.alert,
    })),
    tables: r.tables.map((t) => ({ title: t.title, columns: t.columns, rows: t.rows.slice(0, 12) })),
  };
}
