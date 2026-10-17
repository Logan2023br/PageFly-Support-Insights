// Phân tích "issue lặp lại" — thuần, dùng được ở server và test.
// Issue = 1 vấn đề cụ thể (nhóm do AI gom từ issue_summary). Lặp lại = cùng issue xuất hiện từ 2 ticket trở lên trong khoảng đã lọc.
import { addDays, diffDays } from "@/lib/data/parse";
import type { Ticket } from "@/lib/data/types";

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

/** Ticket được đưa vào phân tích issue lặp lại. */
export function isGroupable(t: Ticket): boolean {
  return t.category_ticket === "Issue" && Boolean(t.issue_summary) && !EXCLUDED_CATEGORIES.includes(t.category_issue ?? "");
}

/** Số ticket tối thiểu để một issue được tính là lặp lại. */
export const REPEAT_MIN = 2;

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9à-ỹ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Khi AI chưa gom: chỉ ticket có tóm tắt giống hệt nhau (cùng category) mới coi là cùng issue. */
export function fallbackKey(t: Ticket): string {
  return `auto:${t.category_issue ?? "Khác"}|${norm(t.issue_summary ?? "")}`;
}

export function groupOf(t: Ticket, g: IssueGroups): { id: string; title: string; category: string; ai: boolean } {
  const id = g.assign[t.id];
  const grp = id ? g.groups[id] : undefined;
  if (grp) return { id: grp.id, title: grp.title, category: t.category_issue ?? grp.category, ai: true };
  return { id: fallbackKey(t), title: t.issue_summary ?? "(không có tóm tắt)", category: t.category_issue ?? "Khác", ai: false };
}

export interface RepeatIssue {
  id: string;
  title: string;
  category: string;
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
  /** Ticket Issue trong kỳ (mẫu số). */
  issueTickets: number;
  issueStores: number;
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
  /** Số ticket Issue chưa được AI gom nhóm (đang dùng gom tạm theo tóm tắt giống hệt). */
  ungrouped: number;
}

function topOf(values: (string | null)[]): string | null {
  const m = new Map<string, number>();
  for (const v of values) if (v) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export function analyzeRepeats(all: Ticket[], cur: Ticket[], g: IssueGroups, period: { from: string; to: string }): RepeatAnalysis {
  const isIssue = isGroupable;
  const issueTs = cur.filter(isIssue);

  const byGroup = new Map<string, { title: string; category: string; tickets: Ticket[] }>();
  let ungrouped = 0;
  for (const t of issueTs) {
    const grp = groupOf(t, g);
    if (!grp.ai) ungrouped++;
    const e = byGroup.get(grp.id) ?? { title: grp.title, category: grp.category, tickets: [] };
    e.tickets.push(t);
    byGroup.set(grp.id, e);
  }

  // Lần đầu / gần nhất của mỗi issue trên toàn bộ dữ liệu.
  const seen = new Map<string, { first: string; last: string }>();
  for (const t of all) {
    if (!isIssue(t) || !t.derived.dayKey) continue;
    const id = groupOf(t, g).id;
    if (!byGroup.has(id)) continue;
    const s = seen.get(id);
    if (!s) seen.set(id, { first: t.derived.dayKey, last: t.derived.dayKey });
    else {
      if (t.derived.dayKey < s.first) s.first = t.derived.dayKey;
      if (t.derived.dayKey > s.last) s.last = t.derived.dayKey;
    }
  }

  const issues: RepeatIssue[] = [];
  for (const [id, e] of byGroup) {
    if (e.tickets.length < REPEAT_MIN) continue;
    const perStore = new Map<string, number>();
    for (const t of e.tickets) if (t.store_domain) perStore.set(t.store_domain, (perStore.get(t.store_domain) ?? 0) + 1);
    const tickets = [...e.tickets].sort((a, b) => (b.derived.at ?? 0) - (a.derived.at ?? 0));
    const s = seen.get(id);
    issues.push({
      id,
      title: e.title,
      category: e.category,
      tickets,
      stores: perStore.size,
      storesAgain: [...perStore.values()].filter((n) => n >= 2).length,
      firstSeen: s?.first ?? null,
      lastSeen: tickets[0]?.derived.dayKey ?? null,
      existedBefore: Boolean(s && s.first < period.from),
      unresolved: tickets.filter((t) => !t.derived.resolved).length,
      devTickets: tickets.filter((t) => t.derived.handler === "Dev").length,
      churn: tickets.filter((t) => t.churn_risk === true).length,
      topRoot: topOf(tickets.map((t) => t.root_cause)),
    });
  }
  issues.sort((a, b) => b.tickets.length - a.tickets.length || b.stores - a.stores || a.title.localeCompare(b.title));

  const repeatSet = new Set(issues.flatMap((i) => i.tickets.map((t) => t.id)));
  const repeatTs = issueTs.filter((t) => repeatSet.has(t.id));

  const catMap = new Map<string, { issues: number; tickets: number; stores: Set<string> }>();
  for (const i of issues) {
    const c = catMap.get(i.category) ?? { issues: 0, tickets: 0, stores: new Set<string>() };
    c.issues++;
    c.tickets += i.tickets.length;
    for (const t of i.tickets) if (t.store_domain) c.stores.add(t.store_domain);
    catMap.set(i.category, c);
  }
  const categories = [...catMap].map(([category, c]) => ({ category, issues: c.issues, tickets: c.tickets, stores: c.stores.size })).sort((a, b) => b.tickets - a.tickets || b.issues - a.issues);

  const storeMap = new Map<string, RepeatStore & { _issues: Map<string, { title: string; count: number }> }>();
  for (const i of issues) {
    for (const t of i.tickets) {
      if (!t.store_domain) continue;
      const s =
        storeMap.get(t.store_domain) ??
        ({ domain: t.store_domain, name: t.store_name, plan: t.pagefly_plan, price: t.pagefly_price, tickets: 0, issues: [], sameIssueAgain: false, churn: false, lastAt: null, lastUrl: null, _issues: new Map() } as RepeatStore & { _issues: Map<string, { title: string; count: number }> });
      s.tickets++;
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
    .map(({ _issues, ...s }) => {
      const list = [..._issues].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.count - a.count);
      return { ...s, issues: list, sameIssueAgain: list.some((x) => x.count >= 2) };
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
