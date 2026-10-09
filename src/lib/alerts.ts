// Ticket cần xử lý ngay + thông báo (chuông). Một bộ luật dùng chung cho cả trang Thống kê và chuông.
import type { Ticket } from "@/lib/data/types";
import { addDays } from "@/lib/data/parse";
import { compareMetrics } from "@/lib/metrics/compute";
import { METRICS } from "@/lib/metrics/defs";
import { formatValue } from "@/lib/metrics/compute";
import { inPeriod, previousPeriod, type Period } from "@/lib/query";

import { actionReasons, type ActionLevel, type ActionReason } from "@/lib/data/attention";

export { actionReasons, type ActionLevel, type ActionReason };

export interface ActionItem {
  ticket: Ticket;
  reasons: ActionReason[];
  level: ActionLevel;
}

/** Ticket cần xử lý, nặng trước rồi mới nhất trước. */
export function actionItems(ts: Ticket[]): ActionItem[] {
  return ts
    .map((ticket) => {
      const reasons = actionReasons(ticket);
      return { ticket, reasons, level: reasons.some((r) => r.level === "critical") ? "critical" : "warning" } as ActionItem;
    })
    .filter((i) => i.reasons.length)
    .sort((a, b) => (a.level === b.level ? (b.ticket.recap_at_vn ?? 0) - (a.ticket.recap_at_vn ?? 0) : a.level === "critical" ? -1 : 1));
}

// ── Chuông thông báo ─────────────────────────────────────────────────

export interface Notification {
  id: string;
  /** Thời điểm recap (ms) — client so với mốc "đã xem" để đếm thông báo mới. */
  at: number;
  kind: "ticket" | "metric";
  level: ActionLevel;
  title: string;
  detail: string;
  href: string;
  crisp?: string | null;
}

/** Thông báo: ticket cần xử lý trong 3 ngày gần nhất + chỉ số báo động của 7 ngày gần nhất so với 7 ngày trước. */
export function buildNotifications(all: Ticket[], today: string, loadedAt: number): Notification[] {
  const recent = all.filter((t) => inPeriod(t, { from: addDays(today, -2), to: today }));
  const tickets: Notification[] = actionItems(recent)
    .slice(0, 30)
    .map(({ ticket: t, reasons, level }) => ({
      id: `t:${t.id}`,
      at: t.derived.at ?? 0,
      kind: "ticket",
      level,
      title: `${t.store_name ?? t.store_domain ?? "Store ?"} · ${t.triggered_by ?? "—"}`,
      detail: `${reasons.map((r) => r.label).join(" · ")} — ${t.issue_summary ?? ""}`,
      href: `/tickets?range=7d&ticket=${encodeURIComponent(t.id)}`,
      crisp: t.ticket_url,
    }));

  const week: Period = { from: addDays(today, -6), to: today };
  const cur = all.filter((t) => inPeriod(t, week));
  const prev = all.filter((t) => inPeriod(t, previousPeriod(week)));
  // Bỏ chỉ số khối lượng (số ticket tăng chưa chắc là vấn đề) — chỉ báo các chỉ số chất lượng / khách hàng.
  const metrics: Notification[] = compareMetrics(cur, prev, METRICS.filter((m) => m.group !== "volume"))
    .filter((c) => c.alert)
    .map((c) => ({
      id: `m:${c.key}:${today}:${formatValue(c.current, c.format)}`,
      // Báo động chỉ số gắn với lần tải dữ liệu gần nhất có thay đổi giá trị (id đổi khi giá trị đổi).
      at: loadedAt,
      kind: "metric",
      level: c.alert!,
      title: `${c.label}: ${formatValue(c.current, c.format)} (7 ngày)`,
      detail: c.note,
      href: `/?range=7d&compare=1`,
    }));

  return [...metrics, ...tickets];
}
