// Kho bằng chứng của Insight Pack: mọi con số do code tính từ dữ liệu thật.
// AI chỉ đọc kho này và dẫn chứng bằng id; web vẽ biểu đồ / hiện số từ đây chứ không lấy số AI viết.
import { addDays, formatDuration, VN_OFFSET_MS } from "@/lib/data/parse";
import type { Ticket } from "@/lib/data/types";
import { countBy, formatDelta, formatValue, judge } from "@/lib/metrics/compute";
import { METRICS } from "@/lib/metrics/defs";
import { people } from "@/lib/metrics/performance";
import { devBacklog, reviewFunnel } from "@/lib/reports";
import { groupableItems, groupOf, itemOpen, type IssueGroups, type TicketIssue } from "@/lib/repeat/analysis";
import type { PackFact, PackTicket } from "./types";
import { feedbackText, isFeedback } from "@/lib/data/category";

const WEEKS = 8;
const inRange = (t: Ticket, from: string, to: string) => t.derived.dayKey != null && t.derived.dayKey >= from && t.derived.dayKey <= to;
const dm = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`;
const short = (s: string | null | undefined, n: number) => (!s ? "" : s.length > n ? `${s.slice(0, n - 1)}…` : s);

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

export interface FactBundle {
  facts: Record<string, PackFact>;
  tickets: Record<string, PackTicket>;
  /** Danh sách ticket của tuần, dạng gọn để AI đọc nội dung từng ca. */
  digest: Record<string, unknown>[];
  totals: { tickets: number; issues: number; stores: number };
}

/** Kho bằng chứng cho tuần [from, to] (thứ 2 → chủ nhật), kèm 8 tuần lịch sử để thấy xu hướng. */
export function buildFacts(all: Ticket[], from: string, to: string, groups: IssueGroups, today: string): FactBundle {
  const weeks = Array.from({ length: WEEKS }, (_, i) => {
    const f = addDays(from, -7 * (WEEKS - 1 - i));
    return { from: f, to: addDays(f, 6), label: dm(f) };
  });
  const byWeek = weeks.map((w) => all.filter((t) => inRange(t, w.from, w.to)));
  const cur = byWeek[WEEKS - 1];
  const prev = byWeek[WEEKS - 2];
  const last4 = all.filter((t) => inRange(t, weeks[WEEKS - 4].from, to));
  const facts: Record<string, PackFact> = {};
  const add = (f: PackFact) => {
    facts[f.id] = f;
  };
  const weekly = (fn: (ts: Ticket[]) => number | null) => weeks.map((w, i) => ({ label: w.label, v: fn(byWeek[i]) }));

  // 1) Mọi chỉ số trong bộ chỉ số chuẩn: tuần này, tuần trước, 8 tuần.
  for (const def of METRICS) {
    const c = def.compute(cur);
    const p = def.compute(prev);
    if (c == null && p == null) continue;
    const j = judge({ key: def.key, label: def.label, format: def.format, polarity: def.polarity, critical: def.critical, current: c, previous: p, sample: { current: cur.length, previous: prev.length } });
    add({
      id: `metric:${def.key}`,
      label: def.label,
      note: def.hint,
      value: formatValue(c, def.format),
      prev: formatValue(p, def.format),
      delta: j.delta != null ? formatDelta(j.delta, def.format) : undefined,
      tone: j.tone === "good" ? "good" : j.tone === "bad" ? "bad" : "neutral",
      series: weekly((ts) => def.compute(ts)),
      seriesFormat: def.format,
      ticketIds: def.match ? cur.filter(def.match).slice(0, 12).map((t) => t.id) : undefined,
    });
  }

  // 2) Category issue: số ticket, chưa xong, cần Dev, churn, CSAT, nguyên nhân / trang chính.
  const issuesCur = cur.filter((t) => t.category_ticket === "Issue");
  const catRows = countBy(issuesCur, (t) => t.category_issue).map((b) => {
    const ts = issuesCur.filter((t) => t.category_issue === b.key);
    const prevN = prev.filter((t) => t.category_ticket === "Issue" && t.category_issue === b.key).length;
    return { key: b.key, value: b.count, display: `${b.count} ticket`, extra: `tuần trước ${prevN} · chưa resolved ${ts.filter((t) => !t.derived.resolved).length} · cần Dev ${ts.filter((t) => t.derived.handler === "Dev").length}` };
  });
  add({ id: "breakdown:category_issue", label: "Ticket Issue theo category (tuần này)", note: "Số ticket Issue của mỗi category_issue trong tuần.", rows: catRows });
  for (const b of countBy(last4.filter((t) => t.category_ticket === "Issue"), (t) => t.category_issue)) {
    const ts = issuesCur.filter((t) => t.category_issue === b.key);
    const pN = prev.filter((t) => t.category_ticket === "Issue" && t.category_issue === b.key).length;
    const csat = avg(ts.map((t) => t.derived.csatScore).filter((x): x is number => x != null));
    const handle = median(ts.map((t) => t.total_time_ticket).filter((x): x is number => x != null));
    add({
      id: `category:${b.key}`,
      label: `Category ${b.key}`,
      note: `Ticket Issue thuộc category ${b.key}. 4 tuần gần nhất: ${b.count} ticket.`,
      value: `${ts.length} ticket`,
      prev: `${pN} ticket`,
      delta: `${ts.length - pN >= 0 ? "+" : ""}${ts.length - pN}`,
      tone: ts.length > pN ? "bad" : ts.length < pN ? "good" : "neutral",
      series: weekly((w) => w.filter((t) => t.category_ticket === "Issue" && t.category_issue === b.key).length),
      seriesFormat: "count",
      rows: [
        { key: "Chưa resolved", value: ts.filter((t) => !t.derived.resolved).length },
        { key: "Cần Dev", value: ts.filter((t) => t.derived.handler === "Dev").length },
        { key: "TS xử lý", value: ts.filter((t) => t.derived.handler === "TS").length },
        { key: "Churn risk", value: ts.filter((t) => t.churn_risk === true).length },
        { key: "Khách Angry/Frustrated", value: ts.filter((t) => t.derived.moodEnd === "Angry" || t.derived.moodEnd === "Frustrated").length },
      ],
      ticketIds: ts.slice(0, 15).map((t) => t.id),
      ...(csat != null || handle != null ? { note: `Ticket Issue thuộc category ${b.key}. 4 tuần: ${b.count} ticket. CSAT TB tuần này ${csat != null ? csat.toFixed(1) : "—"}/5 · thời gian ticket (trung vị) ${handle != null ? formatDuration(handle) : "—"}.` } : {}),
    });
  }

  // 3) Issue lặp lại (nhóm AI gom): 4 tuần gần nhất.
  const byGroup = new Map<string, { title: string; category: string; items: TicketIssue[] }>();
  for (const x of last4.flatMap(groupableItems)) {
    const g = groupOf(x, groups);
    const e = byGroup.get(g.id) ?? { title: g.title, category: g.category, items: [] };
    e.items.push(x);
    byGroup.set(g.id, e);
  }
  const ticketsOf = (xs: TicketIssue[]) => [...new Map(xs.map((x) => [x.ticket.id, x.ticket])).values()];
  const repeated = [...byGroup]
    .map(([id, e]) => [id, { ...e, ts: ticketsOf(e.items) }] as const)
    .filter(([, e]) => e.ts.length >= 2)
    .sort((a, b) => b[1].ts.length - a[1].ts.length)
    .slice(0, 40);
  add({
    id: "breakdown:repeat_issues",
    label: "Issue lặp lại nhiều nhất (4 tuần)",
    note: "Issue (AI gom các issue con cùng vấn đề cụ thể, từ cột issues_all) xuất hiện ở từ 2 ticket trở lên trong 4 tuần gần nhất.",
    rows: repeated.slice(0, 20).map(([, e]) => ({ key: e.title, value: e.ts.length, display: `${e.ts.length} ticket`, extra: `${e.category} · ${new Set(e.ts.map((t) => t.store_domain).filter(Boolean)).size} store` })),
  });
  for (const [id, e] of repeated) {
    const wk = e.ts.filter((t) => inRange(t, from, to)).length;
    const pk = e.ts.filter((t) => inRange(t, weeks[WEEKS - 2].from, weeks[WEEKS - 2].to)).length;
    const sorted = [...e.ts].sort((a, b) => (b.derived.at ?? 0) - (a.derived.at ?? 0));
    add({
      id: `issue:${id}`,
      label: e.title,
      note: `Issue lặp lại thuộc ${e.category}. 4 tuần: ${e.ts.length} ticket từ ${new Set(e.ts.map((t) => t.store_domain).filter(Boolean)).size} store; chưa xong ${e.items.filter(itemOpen).length}; cần Dev ${e.items.filter((x) => /dev/i.test(x.item.status ?? "")).length}; churn risk ${e.ts.filter((t) => t.churn_risk === true).length}.`,
      value: `${wk} ticket tuần này`,
      prev: `${pk} ticket tuần trước`,
      series: weekly((w) => w.filter((t) => groupableItems(t).some((x) => groupOf(x, groups).id === id)).length),
      seriesFormat: "count",
      rows: countBy(e.ts, (t) => t.root_cause).map((b) => ({ key: `Nguyên nhân: ${b.key}`, value: b.count })),
      ticketIds: sorted.slice(0, 15).map((t) => t.id),
    });
  }

  // 4) Phân bố khác của tuần.
  const dist = (id: string, label: string, note: string, ts: Ticket[], fn: (t: Ticket) => string | null | undefined) =>
    add({ id, label, note, rows: countBy(ts, fn).slice(0, 15).map((b) => ({ key: b.key, value: b.count, display: `${b.count} (${Math.round(b.share * 100)}%)` })) });
  dist("breakdown:root_cause", "Nguyên nhân gốc (tuần này)", "root_cause của ticket trong tuần.", cur, (t) => t.root_cause);
  dist("breakdown:page_issue", "Trang gặp vấn đề (tuần này)", "page_issue của ticket Issue trong tuần.", issuesCur, (t) => t.page_issue);
  dist("breakdown:resolution", "Kết quả xử lý (tuần này)", "resolution của ticket trong tuần.", cur, (t) => t.resolution);
  dist("breakdown:handler", "Bậc xử lý cao nhất (tuần này)", "FL tự xử lý / TS / Dev.", cur, (t) => t.derived.handler);
  dist("breakdown:plan_issue", "Ticket Issue theo plan PageFly (tuần này)", "Plan của store có ticket Issue.", issuesCur, (t) => t.pagefly_plan);
  dist("breakdown:type_user", "Loại khách (tuần này)", "Khách vãng lai / khách đã sử dụng.", cur, (t) => t.type_user);
  dist("breakdown:tenure", "Thời gian dùng app (tuần này)", "tenure của store.", cur, (t) => t.tenure);
  dist("breakdown:shopify_plan", "Shopify plan (tuần này)", "Plan Shopify của store.", cur, (t) => t.shopify_plan);
  dist("breakdown:country", "Quốc gia (tuần này)", "country của store.", cur, (t) => t.country);
  dist("breakdown:mood_flow", "Mood khách đầu → cuối (tuần này)", "Mood lúc đầu → lúc kết thúc.", cur, (t) => (t.derived.moodStart && t.derived.moodEnd ? `${t.derived.moodStart} → ${t.derived.moodEnd}` : null));
  dist("breakdown:feedback_solution", "Khách phản hồi về solution (tuần này)", "feedback_cx_solution.", cur, (t) => t.feedback_cx_solution);

  // 5) Theo ca và giờ: khối lượng + phản hồi đầu (trung vị).
  const shiftRows = countBy(cur, (t) => t.shift).map((b) => {
    const fr = median(cur.filter((t) => t.shift === b.key).map((t) => t.derived.firstReplySec).filter((x): x is number => x != null));
    return { key: b.key, value: b.count, display: `${b.count} ticket`, extra: `phản hồi đầu (trung vị) ${fr != null ? formatDuration(fr) : "—"}` };
  });
  add({ id: "breakdown:shift", label: "Ticket và tốc độ phản hồi theo ca (tuần này)", note: "Số ticket mỗi ca và thời gian phản hồi đầu (trung vị).", rows: shiftRows });
  const hours = Array.from({ length: 24 }, (_, h) => ({ key: `${String(h).padStart(2, "0")}h`, value: 0 }));
  for (const t of cur) if (t.time_cx_contact != null) hours[new Date(t.time_cx_contact + VN_OFFSET_MS).getUTCHours()].value++;
  add({ id: "breakdown:hour", label: "Khách liên hệ theo giờ trong ngày (giờ VN, tuần này)", note: "Giờ khách contact (time_cx_contact).", rows: hours });

  // 6) Đội ngũ.
  const period = { from, to };
  for (const role of ["fl", "ts"] as const) {
    const rows = people(cur, prev, role, period, "week").sort((a, b) => (b.score.score ?? -1) - (a.score.score ?? -1));
    add({
      id: `people:${role}`,
      label: role === "fl" ? "Hiệu suất Front-line (tuần này)" : "Hiệu suất Technical support (tuần này)",
      note: "Điểm chất lượng 0–100 (dưới 5 ticket chưa đủ tin cậy) · số ticket · phản hồi đầu · tỷ lệ resolved · CSAT · mời review bỏ lỡ.",
      rows: rows.map((r) => ({
        key: r.name,
        value: Math.round(r.score.score ?? 0),
        display: r.score.score == null ? "—" : `${Math.round(r.score.score)} điểm`,
        extra: `${r.tickets} ticket · phản hồi đầu ${r.metrics.first_reply != null ? formatDuration(r.metrics.first_reply) : "—"} · resolved ${r.metrics.resolved_rate != null ? `${Math.round(r.metrics.resolved_rate * 100)}%` : "—"} · CSAT ${r.metrics.csat_avg != null ? r.metrics.csat_avg.toFixed(1) : "—"} · bỏ lỡ review ${r.metrics.review_missed ?? "—"}`,
      })),
    });
  }

  // 7) Khách hàng & doanh thu.
  const storeRows = (match: (t: Ticket) => boolean) => {
    const m = new Map<string, Ticket>();
    for (const t of cur) if (match(t) && t.store_domain) m.set(t.store_domain, t);
    return [...m.values()].sort((a, b) => (b.pagefly_price ?? 0) - (a.pagefly_price ?? 0));
  };
  const churn = storeRows((t) => t.churn_risk === true);
  add({
    id: "stores:churn",
    label: "Store có nguy cơ rời bỏ (tuần này)",
    note: `Store có ticket churn_risk = Yes. Tổng giá plan: $${churn.reduce((s, t) => s + (t.pagefly_price ?? 0), 0)}/tháng.`,
    value: `${churn.length} store`,
    rows: churn.slice(0, 25).map((t) => ({ key: t.store_name ?? t.store_domain ?? "?", value: t.pagefly_price ?? 0, display: `${t.pagefly_plan ?? "—"} · $${t.pagefly_price ?? 0}`, extra: `${short(t.issue_summary, 90)}${t.time_uninstall ? " · đã gỡ app" : ""}` })),
    ticketIds: churn.slice(0, 15).map((t) => t.id),
  });
  const upsell = storeRows((t) => t.derived.upsell && !t.churn_risk);
  add({
    id: "stores:upsell",
    label: "Cơ hội upsell (tuần này)",
    note: "Store có upsell_signal và không có churn risk.",
    value: `${upsell.length} store`,
    rows: upsell.slice(0, 25).map((t) => ({ key: t.store_name ?? t.store_domain ?? "?", value: t.pagefly_price ?? 0, display: `${t.pagefly_plan ?? "—"} · $${t.pagefly_price ?? 0}`, extra: short(t.upsell_signal, 110) })),
    ticketIds: upsell.slice(0, 15).map((t) => t.id),
  });

  // 8) Review.
  const f = reviewFunnel(cur);
  add({
    id: "review:funnel",
    label: "Phễu mời review (tuần này)",
    note: "QUALIFIED = Recap Tool đánh giá đủ điều kiện mời review.",
    rows: [
      { key: "Đủ điều kiện mời review", value: f.qualified },
      { key: "FL đã hỏi review", value: f.asked, display: `${f.asked} (${pct(f.asked, f.qualified)})` },
      { key: "Khách đã có review từ trước", value: f.already },
      { key: "Bỏ lỡ: chưa hỏi", value: f.missed, display: `${f.missed} (${pct(f.missed, f.qualified)})` },
      { key: "Review mới sau support", value: f.newReviews },
    ],
    ticketIds: cur.filter((t) => t.derived.reviewMissed).slice(0, 15).map((t) => t.id),
  });
  add({ id: "review:missed_by_fl", label: "Mời review bị bỏ lỡ theo FL (tuần này)", note: "Ticket QUALIFIED nhưng FL chưa hỏi.", rows: countBy(cur.filter((t) => t.derived.reviewMissed), (t) => t.triggered_by).map((b) => ({ key: b.key, value: b.count })) });

  // 9) Tiếng nói khách hàng.
  const voice = (id: string, label: string, ts: Ticket[], text: (t: Ticket) => string | null = (t) => t.issue_summary) =>
    add({ id, label, note: "Tóm tắt nội dung (issue_summary; với feedback form là nội dung form) và số lần xuất hiện.", value: `${ts.length} ticket`, rows: countBy(ts, text).slice(0, 25).map((b) => ({ key: short(b.key, 140), value: b.count })), ticketIds: ts.slice(0, 15).map((t) => t.id) });
  voice("voice:improve", "Yêu cầu tính năng (Improve, 4 tuần)", last4.filter((t) => t.category_ticket === "Improve" || t.root_cause === "feature-request"));
  voice("voice:feedback", "Góp ý (Feedback, 4 tuần)", last4.filter(isFeedback), feedbackText);
  voice("voice:3rd_app", "Issue với app bên thứ 3 (4 tuần)", last4.filter((t) => t.category_issue === "3rd App" || t.root_cause === "third-party-app"));
  voice("voice:how_to", "Câu hỏi cách dùng / khách chưa biết (4 tuần)", last4.filter((t) => t.category_issue === "Consultation/How-to" || t.root_cause === "customer-knowledge"));

  // 10) Backlog chờ Dev và ca kéo dài.
  const backlog = devBacklog(all, today);
  add({
    id: "dev:backlog",
    label: "Ticket đang chờ TS/Dev check (lúc tạo pack)",
    note: "resolution = Đợi TS check / Đợi dev check / Ticket cần dev note, kèm số ngày đã chờ.",
    value: `${backlog.length} ticket`,
    rows: backlog.slice(0, 25).map(({ ticket: t, ageDays }) => ({ key: short(t.issue_summary, 100), value: ageDays ?? 0, display: `${ageDays ?? "—"} ngày`, extra: `${t.category_issue ?? "—"} · ${t.store_name ?? t.store_domain ?? "—"}` })),
    ticketIds: backlog.slice(0, 15).map((b) => b.ticket.id),
  });
  const slow = [...cur].filter((t) => t.total_time_ticket != null).sort((a, b) => (b.total_time_ticket ?? 0) - (a.total_time_ticket ?? 0)).slice(0, 12);
  add({ id: "tickets:slowest", label: "Ticket kéo dài nhất (tuần này)", note: "total_time_ticket dài nhất.", rows: slow.map((t) => ({ key: short(t.issue_summary, 100), value: Math.round((t.total_time_ticket ?? 0) / 60), display: formatDuration(t.total_time_ticket), extra: `${t.resolution ?? "—"} · ${t.triggered_by ?? "—"}` })), ticketIds: slow.map((t) => t.id) });
  const angry = cur.filter((t) => t.derived.moodEnd === "Angry" || t.derived.moodEnd === "Frustrated" || t.derived.moodWorsened);
  add({ id: "tickets:negative_mood", label: "Ticket khách bực / mood xấu đi (tuần này)", note: "Mood cuối Angry/Frustrated hoặc mood xấu đi trong lúc support.", value: `${angry.length} ticket`, rows: angry.slice(0, 20).map((t) => ({ key: short(t.issue_summary, 100), value: 1, display: `${t.derived.moodStart ?? "?"} → ${t.derived.moodEnd ?? "?"}`, extra: t.resolution ?? "" })), ticketIds: angry.slice(0, 15).map((t) => t.id) });

  // Ticket gọn để hiển thị (mọi ticket được nhắc tới) + digest cho AI.
  const tickets: Record<string, PackTicket> = {};
  const pt = (t: Ticket): PackTicket => ({ id: t.id, day: t.derived.dayKey, store: t.store_name, domain: t.store_domain, plan: t.pagefly_plan, category: t.category_ticket, categoryIssue: t.category_issue, summary: t.issue_summary, resolution: t.resolution, fl: t.triggered_by, url: t.ticket_url });
  const known = new Map(all.map((t) => [t.id, t]));
  for (const t of last4) tickets[t.id] = pt(t);
  for (const fct of Object.values(facts)) for (const id of fct.ticketIds ?? []) if (!tickets[id] && known.has(id)) tickets[id] = pt(known.get(id)!);

  const digest = cur.map((t) => ({
    id: t.id,
    day: t.derived.dayKey,
    store: t.store_name ?? t.store_domain ?? undefined,
    cat: t.category_ticket,
    ci: t.category_issue,
    page: t.page_issue,
    issue: short(t.issue_summary, 160),
    issues: t.derived.issues.length > 1 ? t.derived.issues.map((i) => `${i.category ?? "?"}: ${short(i.summary, 70)}${i.status ? ` [${i.status}]` : ""}`) : undefined,
    grp: groupableItems(t).map((x) => groupOf(x, groups).title).join(" | ") || undefined,
    avgReply: t.avg_reply_time != null ? formatDuration(t.avg_reply_time) : undefined,
    form: short(t.feedback_form, 140) || undefined,
    root: t.root_cause,
    res: t.resolution,
    by: t.derived.handler,
    fl: t.triggered_by,
    plan: t.pagefly_plan,
    price: t.pagefly_price,
    user: t.type_user,
    tenure: t.tenure,
    firstReply: t.derived.firstReplySec != null ? formatDuration(t.derived.firstReplySec) : undefined,
    total: t.total_time_ticket != null ? formatDuration(t.total_time_ticket) : undefined,
    csat: t.derived.csatScore ?? undefined,
    mood: t.derived.moodStart || t.derived.moodEnd ? `${t.derived.moodStart ?? "?"}→${t.derived.moodEnd ?? "?"}` : undefined,
    fb: t.feedback_cx_solution ?? undefined,
    churn: t.churn_risk || undefined,
    upsell: short(t.upsell_signal, 120) || undefined,
    next: short(t.next_action, 140) || undefined,
    review: t.review_verdict ?? undefined,
  }));

  return {
    facts,
    tickets,
    digest,
    totals: { tickets: cur.length, issues: issuesCur.length, stores: new Set(cur.map((t) => t.store_domain).filter(Boolean)).size },
  };
}
