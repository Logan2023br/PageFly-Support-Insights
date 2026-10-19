// Phân tích "issue lặp lại" — thuần, dùng được ở server và test.
// Issue = 1 vấn đề cụ thể (nhóm do AI gom từ issue_summary). Lặp lại = cùng issue xuất hiện từ 2 ticket trở lên trong khoảng đã lọc.
import { addDays, diffDays } from "@/lib/data/parse";
import type { IssueItem, Ticket } from "@/lib/data/types";

export interface IssueGroup {
  id: string;
  category: string;
  title: string;
  createdAt: number;
}

export interface IssueGroups {
  groups: Record<string, IssueGroup>;
  /** ticket id → group id */
  assign: Record<string, string>;
  updatedAt: number;
}

/** Category không phải vấn đề cụ thể (khách chưa nêu vấn đề / nội bộ) — không tính issue lặp lại. */
export const EXCLUDED_CATEGORIES = ["Unclear/Internal"];

/** Một issue con kèm ticket chứa nó. */
export interface TicketIssue {
  item: IssueItem;
  ticket: Ticket;
}

/** Các issue con của ticket được đưa vào phân tích (bỏ Unclear/Internal). Một ticket có thể có nhiều issue (cột issues_all). */
export function groupableItems(t: Ticket): TicketIssue[] {
  return t.derived.issues.filter((i) => i.summary && !EXCLUDED_CATEGORIES.includes(i.category ?? "")).map((item) => ({ item, ticket: t }));
}

/** Số ticket tối thiểu để một issue được tính là lặp lại. */
export const REPEAT_MIN = 2;

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9à-ỹ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Khi AI chưa gom: chỉ issue có tóm tắt giống hệt nhau (cùng category) mới coi là cùng issue. */
export function fallbackKey(item: IssueItem): string {
  return `auto:${item.category ?? "Khác"}|${norm(item.summary)}`;
}

export function groupOf(x: TicketIssue, g: IssueGroups): { id: string; title: string; category: string; ai: boolean } {
  // Ticket gom theo cách cũ (1 ticket = 1 issue) vẫn dùng được kết quả gom cũ.
  const id = g.assign[x.item.key] ?? (x.item.legacy ? g.assign[x.ticket.id] : undefined);
  const grp = id ? g.groups[id] : undefined;
  if (grp) return { id: grp.id, title: grp.title, category: x.item.category ?? grp.category, ai: true };
  return { id: fallbackKey(x.item), title: x.item.summary, category: x.item.category ?? "Khác", ai: false };
}

/** Issue con chưa xong: theo trạng thái trong issues_all, thiếu thì theo resolution của ticket. */
export const itemOpen = (x: TicketIssue) => (x.item.status ? x.item.status.toLowerCase() !== "xong" : !x.ticket.derived.resolved);

export interface RepeatIssue {
  id: string;
  title: string;
  category: string;
  /** Các lần issue xuất hiện (mỗi lần = 1 issue con trong 1 ticket), mới nhất trước. */
  items: TicketIssue[];
  /** Ticket khác nhau chứa issue này. */
  tickets: Ticket[];
  stores: number;
  /** Số store gặp lại chính issue này từ 2 lần trở lên trong kỳ. */
  storesAgain: number;
  /** Lần đầu issue này xuất hiện (toàn bộ dữ liệu) — để biết issue cũ quay lại hay mới phát sinh. */
  firstSeen: string | null;
  lastSeen: string | null;
  /** Đã có trước khoảng đang xem. */
  existedBefore: boolean;
  unresolved: number;
  devTickets: number;
  churn: number;
  topRoot: string | null;
}

export interface RepeatStore {
  domain: string;
  name: string | null;
  plan: string | null;
  price: number | null;
  tickets: number;
  issues: { id: string; title: string; count: number }[];
  /** Gặp lại cùng 1 issue từ 2 lần trở lên. */
  sameIssueAgain: boolean;
  churn: boolean;
  lastAt: number | null;
  lastUrl: string | null;
}

export interface RepeatAnalysis {
  /** Ticket có ít nhất 1 issue được phân tích (mẫu số). */
  issueTickets: number;
  issueStores: number;
  /** Tổng số issue con trong kỳ. */
  issueItems: number;
  repeatTickets: number;
  repeatIssues: number;
  repeatCategories: number;
  /** Số issue khác nhau trong kỳ (cả lặp và không lặp). */
  distinctIssues: number;
  stores: number;
  storesAgain: number;
  paidStores: number;
  monthlyRevenue: number;
  churnStores: number;
  categories: { category: string; issues: number; tickets: number; stores: number }[];
  issues: RepeatIssue[];
  storeList: RepeatStore[];
  daily: { label: string; repeat: number; single: number }[];
  /** Số issue con chưa được AI gom nhóm (đang dùng gom tạm theo tóm tắt giống hệt). */
  ungrouped: number;
}

function topOf(values: (string | null)[]): string | null {
  const m = new Map<string, number>();
  for (const v of values) if (v) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

const uniqTickets = (xs: TicketIssue[]) => [...new Map(xs.map((x) => [x.ticket.id, x.ticket])).values()];

export function analyzeRepeats(all: Ticket[], cur: Ticket[], g: IssueGroups, period: { from: string; to: string }): RepeatAnalysis {
  const items = cur.flatMap(groupableItems);
  const issueTs = uniqTickets(items);

  const byGroup = new Map<string, { title: string; category: string; items: TicketIssue[] }>();
  let ungrouped = 0;
  for (const x of items) {
    const grp = groupOf(x, g);
    if (!grp.ai) ungrouped++;
    const e = byGroup.get(grp.id) ?? { title: grp.title, category: grp.category, items: [] };
    e.items.push(x);
    byGroup.set(grp.id, e);
  }

  // Lần đầu / gần nhất của mỗi issue trên toàn bộ dữ liệu.
  const seen = new Map<string, { first: string; last: string }>();
  for (const t of all) {
    if (!t.derived.dayKey) continue;
    for (const x of groupableItems(t)) {
      const id = groupOf(x, g).id;
      if (!byGroup.has(id)) continue;
      const s = seen.get(id);
      if (!s) seen.set(id, { first: t.derived.dayKey, last: t.derived.dayKey });
      else {
        if (t.derived.dayKey < s.first) s.first = t.derived.dayKey;
        if (t.derived.dayKey > s.last) s.last = t.derived.dayKey;
      }
    }
  }

  const issues: RepeatIssue[] = [];
  for (const [id, e] of byGroup) {
    const tickets = uniqTickets(e.items).sort((a, b) => (b.derived.at ?? 0) - (a.derived.at ?? 0));
    if (tickets.length < REPEAT_MIN) continue;
    const perStore = new Map<string, number>();
    for (const t of tickets) if (t.store_domain) perStore.set(t.store_domain, (perStore.get(t.store_domain) ?? 0) + 1);
    const s = seen.get(id);
    issues.push({
      id,
      title: e.title,
      category: e.category,
      items: [...e.items].sort((a, b) => (b.ticket.derived.at ?? 0) - (a.ticket.derived.at ?? 0)),
      tickets,
      stores: perStore.size,
      storesAgain: [...perStore.values()].filter((n) => n >= 2).length,
      firstSeen: s?.first ?? null,
      lastSeen: tickets[0]?.derived.dayKey ?? null,
      existedBefore: Boolean(s && s.first < period.from),
      unresolved: e.items.filter(itemOpen).length,
      devTickets: e.items.filter((x) => /dev/i.test(x.item.status ?? "") || (!x.item.status && x.ticket.derived.handler === "Dev")).length,
      churn: tickets.filter((t) => t.churn_risk === true).length,
      topRoot: topOf(tickets.map((t) => t.root_cause)),
    });
  }
  issues.sort((a, b) => b.tickets.length - a.tickets.length || b.stores - a.stores || a.title.localeCompare(b.title));

  const repeatSet = new Set(issues.flatMap((i) => i.tickets.map((t) => t.id)));
  const repeatTs = issueTs.filter((t) => repeatSet.has(t.id));

  const catMap = new Map<string, { issues: number; tickets: Set<string>; stores: Set<string> }>();
  for (const i of issues) {
    const c = catMap.get(i.category) ?? { issues: 0, tickets: new Set<string>(), stores: new Set<string>() };
    c.issues++;
    for (const t of i.tickets) {
      c.tickets.add(t.id);
      if (t.store_domain) c.stores.add(t.store_domain);
    }
    catMap.set(i.category, c);
  }
  const categories = [...catMap].map(([category, c]) => ({ category, issues: c.issues, tickets: c.tickets.size, stores: c.stores.size })).sort((a, b) => b.tickets - a.tickets || b.issues - a.issues);

  type StoreAcc = RepeatStore & { _issues: Map<string, { title: string; count: number }>; _tickets: Set<string> };
  const storeMap = new Map<string, StoreAcc>();
  for (const i of issues) {
    for (const t of i.tickets) {
      if (!t.store_domain) continue;
      const s: StoreAcc =
        storeMap.get(t.store_domain) ??
        { domain: t.store_domain, name: t.store_name, plan: t.pagefly_plan, price: t.pagefly_price, tickets: 0, issues: [], sameIssueAgain: false, churn: false, lastAt: null, lastUrl: null, _issues: new Map(), _tickets: new Set() };
      s._tickets.add(t.id);
      const e = s._issues.get(i.id) ?? { title: i.title, count: 0 };
      e.count++;
      s._issues.set(i.id, e);
      if (t.churn_risk === true) s.churn = true;
      if ((t.derived.at ?? 0) >= (s.lastAt ?? 0)) {
        s.lastAt = t.derived.at;
        s.lastUrl = t.ticket_url;
        s.name = t.store_name ?? s.name;
        s.plan = t.pagefly_plan ?? s.plan;
        s.price = t.pagefly_price ?? s.price;
      }
      storeMap.set(t.store_domain, s);
    }
  }
  const storeList: RepeatStore[] = [...storeMap.values()]
    .map(({ _issues, _tickets, ...s }) => {
      const list = [..._issues].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.count - a.count);
      return { ...s, tickets: _tickets.size, issues: list, sameIssueAgain: list.some((x) => x.count >= 2) };
    })
    .sort((a, b) => Number(b.sameIssueAgain) - Number(a.sameIssueAgain) || b.tickets - a.tickets || (b.price ?? 0) - (a.price ?? 0));

  const n = diffDays(period.from, period.to) + 1;
  const daily = Array.from({ length: Math.max(0, n) }, (_, i) => ({ label: addDays(period.from, i), repeat: 0, single: 0 }));
  const idx = new Map(daily.map((d, i) => [d.label, i]));
  for (const t of issueTs) {
    const i = t.derived.dayKey ? idx.get(t.derived.dayKey) : undefined;
    if (i == null) continue;
    if (repeatSet.has(t.id)) daily[i].repeat++;
    else daily[i].single++;
  }

  const paid = storeList.filter((s) => (s.price ?? 0) > 0);
  return {
    issueTickets: issueTs.length,
    issueStores: new Set(issueTs.map((t) => t.store_domain).filter(Boolean)).size,
    issueItems: items.length,
    repeatTickets: repeatTs.length,
    repeatIssues: issues.length,
    repeatCategories: categories.length,
    distinctIssues: byGroup.size,
    stores: storeList.length,
    storesAgain: storeList.filter((s) => s.sameIssueAgain).length,
    paidStores: paid.length,
    monthlyRevenue: paid.reduce((s, x) => s + (x.price ?? 0), 0),
    churnStores: storeList.filter((s) => s.churn).length,
    categories,
    issues,
    storeList,
    daily,
    ungrouped,
  };
}

/** Gộp theo tuần khi khoảng dài (giữ biểu đồ dễ đọc). */
export function bucketDaily(daily: RepeatAnalysis["daily"], maxBars = 45): { label: string; repeat: number; single: number }[] {
  if (daily.length <= maxBars) return daily;
  const size = Math.ceil(daily.length / maxBars);
  const out: { label: string; repeat: number; single: number }[] = [];
  for (let i = 0; i < daily.length; i += size) {
    const chunk = daily.slice(i, i + size);
    out.push({ label: `${chunk[0].label}→${chunk[chunk.length - 1].label}`, repeat: chunk.reduce((s, d) => s + d.repeat, 0), single: chunk.reduce((s, d) => s + d.single, 0) });
  }
  return out;
}
