import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { earliestDay, loadDataset } from "@/lib/data";
import type { Dataset, Ticket } from "@/lib/data/types";
import { formatVnDate, vnDayKey } from "@/lib/data/parse";
import { buildCompare, buildDashboard } from "@/lib/dashboard";
import { buildCustomers, SEGMENTS, type Segment } from "@/lib/customers";
import { formatValue, type Comparison } from "@/lib/metrics/compute";
import { MIN_SAMPLE, people, perfMetric, qualityScore, ROLE_METRICS, ticketsOf, type PerfRole } from "@/lib/metrics/performance";
import { FACET_KEYS, parseQuery, periodLabel, selectTickets, type SearchParams } from "@/lib/query";
import { buildReport, reportFacts, type ReportGrain, type ReportTeam } from "@/lib/reports";
import { FIELDS } from "@/lib/schema/fields";
import { sortTickets } from "@/lib/sort";
import { cellText } from "@/lib/ticket-format";

// ── Tham số chung ───────────────────────────────────────────────────

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Định dạng YYYY-MM-DD");
const period = {
  range: z.enum(["today", "7d", "30d", "90d", "all"]).optional().describe("Khoảng thời gian có sẵn. Mặc định 7d. Bỏ qua khi dùng from/to."),
  from: day.optional().describe("Ngày bắt đầu (giờ VN), dùng cùng to."),
  to: day.optional().describe("Ngày kết thúc, mặc định hôm nay."),
  category: z.enum(["Feedback", "Issue", "Improve"]).optional().describe("Chỉ lấy một loại ticket."),
};
type PeriodArgs = { range?: string; from?: string; to?: string; category?: string };

function toParams(a: PeriodArgs, extra: Record<string, string | undefined> = {}): SearchParams {
  const sp: SearchParams = {};
  if (a.from) {
    sp.range = "custom";
    sp.from = a.from;
    if (a.to) sp.to = a.to;
  } else if (a.range) sp.range = a.range;
  if (a.category) sp.cat = a.category;
  for (const [k, v] of Object.entries(extra)) if (v) sp[k] = v;
  return sp;
}

const json = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }] });
const fail = (message: string) => ({ content: [{ type: "text" as const, text: message }], isError: true });

const slimCmp = (c: Comparison) => ({
  key: c.key,
  label: c.label,
  current: formatValue(c.current, c.format),
  previous: formatValue(c.previous, c.format),
  change: c.delta == null ? null : formatValue(c.delta, c.format),
  alert: c.alert,
  tone: c.tone,
  note: c.note,
});

const ticketRow = (t: Ticket) => ({
  id: t.id,
  recap_at: cellText(t, "recap_at_vn"),
  store: t.store_name ?? t.store_domain,
  store_domain: t.store_domain,
  category: t.category_ticket,
  area: t.category_issue,
  summary: t.issue_summary,
  fl: t.triggered_by,
  pic: t.name_pic.join(", ") || null,
  roles: t.role_pic.join(", ") || null,
  priority: t.priority,
  resolution: t.resolution,
  mood: t.mood_label_cx_end_to_end ?? t.mood_label_cx,
  csat: t.csat,
  churn_risk: t.churn_risk,
  upsell: t.derived.upsell ? t.upsell_signal : null,
  root_cause: t.root_cause,
  url: t.ticket_url,
});

async function data(): Promise<Dataset> {
  return loadDataset();
}

// ── Đăng ký công cụ ─────────────────────────────────────────────────

export function registerInsightTools(server: McpServer) {
  const ro = { readOnlyHint: true, openWorldHint: false };

  server.registerTool(
    "get_overview",
    {
      title: "Tổng quan support",
      description:
        "Tổng quan ticket support PageFly trong một khoảng thời gian: các chỉ số KPI (kèm so với kỳ trước), bản tóm tắt ticket / FL / khách hàng, nhóm issue và nguyên nhân hàng đầu. Dùng đầu tiên khi được hỏi tình hình support.",
      inputSchema: z.object(period),
      annotations: ro,
    },
    async (a) => {
      const ds = await data();
      const q = parseQuery(toParams(a), { earliestDay: earliestDay(ds), now: ds.loadedAt });
      const d = buildDashboard(ds.tickets, q);
      return json({
        period: periodLabel(q.period),
        previousPeriod: q.prev ? periodLabel(q.prev) : null,
        category: q.cat,
        tickets: d.cur.length,
        kpis: [...d.main, ...d.moreGroups.flatMap((g) => g.tiles)].map((t) => ({ key: t.def.key, label: t.def.label, value: t.value, distinctStores: t.stores, vsPrevious: t.change ? slimCmp(t.change) : null })),
        summaries: d.summaries.map((s) => ({ title: s.title, lines: s.lines.map((l) => l.text) })),
        topIssueAreas: d.breakdowns.category_issue.slice(0, 10),
        topRootCauses: d.breakdowns.root_cause.slice(0, 10),
        resolution: d.breakdowns.resolution,
        dataSource: ds.sourceLabel,
        dataLoadedAt: new Date(ds.loadedAt).toISOString(),
      });
    },
  );

  server.registerTool(
    "compare_periods",
    {
      title: "So sánh kỳ",
      description:
        "So sánh khoảng thời gian chọn với kỳ liền trước cùng số ngày (hoặc kỳ tự chọn compare_from/compare_to). Trả về từng chỉ số tăng/giảm, mức báo động (critical/warning) theo luật của web và biến động theo nhóm issue, loại ticket, nguyên nhân.",
      inputSchema: z.object({
        ...period,
        compare_from: day.optional().describe("Tự chọn kỳ so sánh: ngày bắt đầu"),
        compare_to: day.optional().describe("Tự chọn kỳ so sánh: ngày kết thúc"),
        only_alerts: z.boolean().optional().describe("Chỉ trả các mục có báo động"),
      }),
      annotations: ro,
    },
    async (a) => {
      const ds = await data();
      const q = parseQuery(toParams(a, { cfrom: a.compare_from, cto: a.compare_to }), { earliestDay: earliestDay(ds), now: ds.loadedAt });
      if (!q.prev) return fail("Khoảng 'all' không có kỳ để so sánh.");
      const c = buildCompare(ds.tickets, q);
      const pick = (rows: Comparison[]) => (a.only_alerts ? rows.filter((r) => r.alert) : rows).map(slimCmp);
      return json({
        period: periodLabel(q.period),
        previousPeriod: periodLabel(q.prev),
        metrics: pick(c.metrics),
        byIssueArea: pick(c.byIssue),
        byCategory: pick(c.byCategory),
        byRootCause: pick(c.byRoot),
      });
    },
  );

  server.registerTool(
    "search_tickets",
    {
      title: "Tìm ticket",
      description:
        "Tìm ticket theo từ khoá và bộ lọc. filters là map tên trường → danh sách giá trị, ví dụ {\"priority\":[\"Urgent\"],\"category_issue\":[\"Flymate\"],\"churn_risk\":[\"Yes\"]}. Trả về danh sách rút gọn; dùng get_ticket để xem đủ 49 trường.",
      inputSchema: z.object({
        ...period,
        query: z.string().optional().describe("Từ khoá: tóm tắt issue, store, tên FL, session, nguyên nhân…"),
        filters: z.record(z.string(), z.array(z.string())).optional().describe(`Bộ lọc. Khoá hợp lệ: ${FACET_KEYS.join(", ")}`),
        sort: z.string().optional().describe("Trường sắp xếp, mặc định recap_at_vn"),
        order: z.enum(["asc", "desc"]).optional(),
        limit: z.number().int().min(1).max(100).optional().describe("Mặc định 30, tối đa 100"),
        offset: z.number().int().min(0).optional(),
      }),
      annotations: ro,
    },
    async (a) => {
      const ds = await data();
      const extra: Record<string, string> = { q: a.query ?? "" };
      for (const [k, v] of Object.entries(a.filters ?? {})) if ((FACET_KEYS as readonly string[]).includes(k)) extra[`f_${k}`] = v.join("|");
      const q = parseQuery(toParams(a, extra), { earliestDay: earliestDay(ds), now: ds.loadedAt });
      const all = sortTickets(selectTickets(ds.tickets, q), a.sort, a.order ?? "desc");
      const offset = a.offset ?? 0;
      const limit = a.limit ?? 30;
      return json({ period: periodLabel(q.period), total: all.length, offset, returned: Math.min(limit, Math.max(0, all.length - offset)), tickets: all.slice(offset, offset + limit).map(ticketRow) });
    },
  );

  server.registerTool(
    "get_ticket",
    {
      title: "Chi tiết ticket",
      description: "Toàn bộ các trường của một ticket theo id (session_id) lấy từ search_tickets / get_customer.",
      inputSchema: z.object({ id: z.string().describe("id / session_id của ticket") }),
      annotations: ro,
    },
    async ({ id }) => {
      const ds = await data();
      const t = ds.tickets.find((x) => x.id === id || x.session_id === id);
      if (!t) return fail(`Không tìm thấy ticket ${id}`);
      return json({
        id: t.id,
        fields: Object.fromEntries(FIELDS.map((f) => [f.key, cellText(t, f.key) || null])),
        derived: { handler: t.derived.handler, firstReplySec: t.derived.firstReplySec, moodWorsened: t.derived.moodWorsened, attention: t.derived.attention, recapCount: t.derived.recapCount },
      });
    },
  );

  server.registerTool(
    "list_customers",
    {
      title: "Danh sách khách hàng",
      description:
        "Khách (theo store) đã liên hệ trong khoảng: số lần liên hệ, trạng thái lần cuối, điểm sức khoẻ 0–100, nhóm (risk = Nguy cơ cao, care = Cần chăm sóc, upsell = Tiềm năng upsell, stable = Ổn định), tín hiệu upsell.",
      inputSchema: z.object({
        ...period,
        segment: z.enum(["risk", "care", "upsell", "stable", "repeat", "uninstalled"]).optional(),
        query: z.string().optional().describe("Tìm theo tên / domain / plan"),
        sort: z.enum(["contacts", "health", "last", "price"]).optional().describe("Mặc định contacts (nhiều nhất trước); health sắp tăng dần (tệ nhất trước)"),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      annotations: ro,
    },
    async (a) => {
      const ds = await data();
      const q = parseQuery(toParams(a), { earliestDay: earliestDay(ds), now: ds.loadedAt });
      let list = buildCustomers(ds.tickets, selectTickets(ds.tickets, { ...q, q: "" }), q.period.from, ds.loadedAt);
      if (a.segment === "repeat") list = list.filter((c) => c.tickets.length >= 2);
      else if (a.segment === "uninstalled") list = list.filter((c) => c.uninstallAt != null);
      else if (a.segment) list = list.filter((c) => c.segment === a.segment);
      if (a.query) {
        const s = a.query.toLowerCase();
        list = list.filter((c) => [c.domain, c.name, c.plan].some((v) => v?.toLowerCase().includes(s)));
      }
      const sort = a.sort ?? "contacts";
      list.sort((x, y) =>
        sort === "health" ? x.health - y.health : sort === "last" ? (y.last.recap_at_vn ?? 0) - (x.last.recap_at_vn ?? 0) : sort === "price" ? (y.price ?? -1) - (x.price ?? -1) : y.tickets.length - x.tickets.length,
      );
      return json({
        period: periodLabel(q.period),
        total: list.length,
        segments: Object.fromEntries((Object.keys(SEGMENTS) as Segment[]).map((s) => [s, SEGMENTS[s].label])),
        customers: list.slice(0, a.limit ?? 30).map((c) => ({
          domain: c.domain,
          name: c.name,
          plan: c.plan,
          price: c.price,
          contactsInPeriod: c.tickets.length,
          contactsAllTime: c.history.length,
          lastContact: c.lastContact ? formatVnDate(c.lastContact) : null,
          lastResolution: c.last.resolution,
          lastMood: c.last.derived.moodEnd,
          lastSummary: c.last.issue_summary,
          health: c.health,
          segment: c.segment,
          churn: c.churn,
          upsell: c.upsell,
        })),
      });
    },
  );

  server.registerTool(
    "get_customer",
    {
      title: "Hồ sơ khách hàng",
      description: "Hồ sơ một store: thông tin plan, điểm sức khoẻ kèm lý do, upsell, việc cần làm tiếp và lịch sử mọi lần liên hệ (mới nhất trước).",
      inputSchema: z.object({ domain: z.string().describe("store_domain, vd. abc.myshopify.com") }),
      annotations: ro,
    },
    async ({ domain }) => {
      const ds = await data();
      const tickets = ds.tickets.filter((t) => t.store_domain === domain.trim().toLowerCase() || t.store_domain === domain);
      if (!tickets.length) return fail(`Không có khách ${domain}`);
      const c = buildCustomers(ds.tickets, tickets, "0000-00-00", ds.loadedAt)[0];
      return json({
        domain: c.domain,
        name: c.name,
        plan: c.plan,
        price: c.price,
        shopifyPlan: c.shopifyPlan,
        timezone: c.timezone,
        country: c.country,
        typeUser: c.typeUser,
        tenure: c.tenure,
        maxSlot: c.maxSlot === Infinity ? "unlimited" : c.maxSlot,
        totalPages: c.totalPages,
        pagesPublished: c.pagesPublished,
        sectionsPublished: c.sectionsPublished,
        discountCode: c.discountCode,
        uninstalled: c.uninstallAt != null,
        appReview: c.appReview,
        health: c.health,
        healthFactors: c.factors,
        segment: SEGMENTS[c.segment].label,
        upsell: c.upsell,
        nextAction: c.last.next_action,
        contacts: c.history.length,
        avgDaysBetweenContacts: c.avgDaysBetween,
        history: c.history.map(ticketRow),
      });
    },
  );

  server.registerTool(
    "team_performance",
    {
      title: "Hiệu suất đội",
      description:
        "Xếp hạng Front-line (fl) hoặc Technical (ts) theo Điểm chất lượng 0–100 (thành phần có trọng số, bỏ thành phần thiếu dữ liệu) kèm các chỉ số chính và điểm kỳ trước. Người có dưới 5 ticket đánh dấu small_sample.",
      inputSchema: z.object({ role: z.enum(["fl", "ts"]), ...period }),
      annotations: ro,
    },
    async (a) => {
      const ds = await data();
      const role = a.role as PerfRole;
      const q = parseQuery(toParams(a), { earliestDay: earliestDay(ds), now: ds.loadedAt });
      const cur = ticketsOf(selectTickets(ds.tickets, q), role);
      const prev = q.prev ? ticketsOf(selectTickets(ds.tickets, q, q.prev), role) : [];
      const rows = people(cur, prev, role, q.period, "week").sort((x, y) => (y.score.score ?? -1) - (x.score.score ?? -1));
      const team = qualityScore(cur, role);
      return json({
        period: periodLabel(q.period),
        teamScore: team.score == null ? null : Math.round(team.score),
        scoreComponents: team.parts.map((p) => ({ label: p.label, weight: p.weight, rule: p.rule, teamScore: p.score == null ? null : Math.round(p.score) })),
        people: rows.map((r) => ({
          name: r.name,
          tickets: r.tickets,
          small_sample: r.tickets < MIN_SAMPLE,
          score: r.score.score == null ? null : Math.round(r.score.score),
          previousScore: r.prevScore == null ? null : Math.round(r.prevScore),
          metrics: Object.fromEntries(ROLE_METRICS[role].filter((k) => k !== "score").map((k) => [perfMetric(k).label, r.metrics[k] == null ? null : formatValue(r.metrics[k], perfMetric(k).format === "score" ? "count" : (perfMetric(k).format as "count"))])),
        })),
      });
    },
  );

  server.registerTool(
    "get_report",
    {
      title: "Báo cáo theo team",
      description: "Báo cáo CS / Dev / Marketing theo tuần, tháng, quý hoặc toàn bộ: bảng chỉ số qua các kỳ, thay đổi giữa 2 kỳ đã đủ ngày gần nhất và các bảng danh sách (FL, lỗi cần Dev, upsell, churn…).",
      inputSchema: z.object({ team: z.enum(["cs", "dev", "marketing"]), grain: z.enum(["week", "month", "quarter", "all"]).optional() }),
      annotations: ro,
    },
    async ({ team, grain }) => {
      const ds = await data();
      return json(reportFacts(buildReport(ds.tickets, team as ReportTeam, (grain ?? "week") as ReportGrain, vnDayKey(ds.loadedAt))));
    },
  );

  server.registerTool(
    "data_quality",
    {
      title: "Chất lượng dữ liệu",
      description: "Tình trạng dữ liệu sheet: cột thiếu so với hợp đồng cột, số lỗi/cảnh báo theo trường, số recap trùng session đã gộp, tên nhân sự đã gộp. Dùng khi số liệu có vẻ lạ.",
      inputSchema: z.object({}),
      annotations: ro,
    },
    async () => {
      const ds = await data();
      const byField: Record<string, number> = {};
      for (const i of ds.issues) byField[i.field] = (byField[i.field] ?? 0) + 1;
      return json({
        source: ds.sourceLabel,
        loadedAt: new Date(ds.loadedAt).toISOString(),
        rows: ds.rawRowCount,
        tickets: ds.tickets.length,
        mergedDuplicateRecaps: ds.duplicates,
        missingColumns: ds.missingHeaders,
        unknownColumns: ds.unknownHeaders,
        issuesByField: byField,
        nameMerges: ds.nameMerges,
        error: ds.error ?? null,
      });
    },
  );

  server.registerTool(
    "get_schema",
    {
      title: "Hợp đồng cột",
      description: "Danh sách các trường của một ticket: tên, nhóm, kiểu, giá trị hợp lệ, mô tả. Dùng để hiểu ý nghĩa trường và giá trị khi lọc.",
      inputSchema: z.object({}),
      annotations: ro,
    },
    async () => json(FIELDS.map((f) => ({ key: f.key, label: f.label, group: f.group, kind: f.kind, values: f.values ?? null, description: f.description }))),
  );
}

export const SERVER_INSTRUCTIONS = `PageFly Support Insights: dữ liệu ticket support của PageFly (app page builder Shopify), đọc từ sheet Recap.
- Mọi con số do server tính, khớp với web. Thời gian theo giờ Việt Nam.
- Bắt đầu bằng get_overview; dùng compare_periods để biết tăng/giảm và báo động; search_tickets → get_ticket để xem ví dụ cụ thể.
- Khách hàng: list_customers → get_customer. Nhân sự: team_performance (fl = Front-line, ts = Technical). Báo cáo: get_report.
- Nếu số liệu lạ hoặc thiếu, kiểm tra data_quality (sheet có thể chưa đủ cột).`;
