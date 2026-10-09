import { Suspense } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Fragment } from "react";
import { earliestDay, getDataset } from "@/lib/data";
import { formatVnDate } from "@/lib/data/parse";
import type { Ticket } from "@/lib/data/types";
import { buildCustomers, contactBucket, region, SEGMENTS, tenureBucket, type Customer, type Segment } from "@/lib/customers";
import { formatDelta, judge, tally } from "@/lib/metrics/compute";
import { autoGrain, buckets, GRAIN_LABEL, type Grain } from "@/lib/metrics/performance";
import { hrefWith, parseQuery, periodLabel, selectTickets, type SearchParams } from "@/lib/query";
import { FilterBar } from "@/components/filters/filter-bar";
import { SearchBox } from "@/components/tickets/facet-bar";
import { TrendChart } from "@/components/charts/charts";
import { BarList } from "@/components/charts/bar-list";
import { ChipLinks } from "@/components/perf/perf-ui";
import { MOOD_TONE, resolutionTone } from "@/components/tickets/mini-table";
import { TicketDrawer } from "@/components/tickets/ticket-drawer";
import { ExpandRow } from "@/components/customers/expand-row";
import { ContactRows } from "@/components/customers/contact-rows";
import { RevenueBreakdown } from "@/components/customers/revenue-breakdown";
import { Badge, buttonClass, cx, Delta, Empty, PageHeader, PageSkeleton, Panel, PanelTitle } from "@/components/ui";

const PAGE_SIZE = 50;
type SortKey = "contacts" | "health" | "last" | "price";
const SORTS: Record<SortKey, (c: Customer) => number> = {
  contacts: (c) => c.tickets.length,
  health: (c) => c.health,
  last: (c) => c.last.recap_at_vn ?? 0,
  price: (c) => c.price ?? -1,
};

type KpiKey = "stores" | "new" | "repeat" | "risk" | "revenue_risk" | "upsell" | "paid" | "revenue";
/** Bấm ô KPI → lọc danh sách khách theo đúng nhóm store đã tạo ra con số. */
const KPI_MATCH: Record<KpiKey, (c: Customer) => boolean> = {
  stores: () => true,
  new: (c) => c.isNew,
  repeat: (c) => c.tickets.length >= 2,
  risk: (c) => c.segment === "risk",
  revenue_risk: (c) => c.segment === "risk",
  upsell: (c) => c.segment === "upsell",
  paid: (c) => (c.price ?? 0) > 0,
  revenue: () => true,
};

function slotBucket(c: Customer): string | null {
  if (c.maxSlot === Infinity) return "Không giới hạn slot";
  if (c.pagesPublished == null || !c.maxSlot) return null;
  const r = c.pagesPublished / c.maxSlot;
  return r >= 1 ? "Đã dùng hết slot" : r >= 0.8 ? "Dùng ≥ 80% slot" : r >= 0.5 ? "Dùng 50–79% slot" : "Dùng < 50% slot";
}

/** Các chiều phân bố; bấm một dòng → lọc danh sách (?d_<key>=giá trị). */
const DIMS = {
  contacts: { title: "Số lần liên hệ / store", of: (c: Customer) => contactBucket(c.tickets.length), empty: "Không có dữ liệu" },
  plan: { title: "Plan PageFly", of: (c: Customer) => c.plan, empty: "Không có dữ liệu" },
  shopify: { title: "Plan Shopify", of: (c: Customer) => c.shopifyPlan, empty: "Sheet chưa có dữ liệu plan Shopify" },
  tenure: { title: "Thời gian dùng app", of: (c: Customer) => tenureBucket(c.tenure), empty: "Không có dữ liệu" },
  country: { title: "Quốc gia", of: (c: Customer) => c.country, empty: "Sheet chưa có dữ liệu quốc gia" },
  slot: { title: "Mức dùng slot", of: slotBucket, empty: "Sheet chưa có dữ liệu slot / trang" },
  region: { title: "Khu vực (theo múi giờ)", of: (c: Customer) => region(c.timezone), empty: "Sheet chưa có cột timezone" },
} as const;
type DimKey = keyof typeof DIMS;
const LIST_ANCHOR = "#danh-sach-khach";

export default function Page(props: PageProps<"/customers">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Customers searchParams={props.searchParams} />
    </Suspense>
  );
}

function healthTone(v: number) {
  return v >= 75 ? "text-pf-success" : v >= 50 ? "text-pf-warn" : "text-pf-danger";
}

function distinctStores(ts: Ticket[]) {
  return new Set(ts.map((t) => t.store_domain).filter(Boolean)).size;
}

async function Customers({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const ds = await getDataset();
  const q = parseQuery(sp, { earliestDay: earliestDay(ds) });
  const cur = selectTickets(ds.tickets, { ...q, q: "" });
  const prev = q.prev ? selectTickets(ds.tickets, { ...q, q: "" }, q.prev) : [];
  const customers = buildCustomers(ds.tickets, cur, q.period.from, ds.loadedAt);
  const prevCustomers = q.prev ? buildCustomers(ds.tickets, prev, q.prev.from, ds.loadedAt) : [];

  // KPI
  const kpi = (key: KpiKey, label: string, current: number | null, previous: number | null, format: "count" | "pct" | "money", polarity: "up-good" | "down-good" | "neutral", hint: string) => ({
    key,
    label,
    hint,
    format,
    change: judge({ key: label, label, format, polarity, current, previous: q.prev ? previous : null }),
  });
  const share = (list: Customer[], f: (c: Customer) => boolean) => (list.length ? list.filter(f).length / list.length : null);
  const sumPrice = (list: Customer[], f: (c: Customer) => boolean = () => true) => list.filter(f).reduce((s, c) => s + (c.price ?? 0), 0);
  const kpis = [
    kpi("stores", "Store liên hệ", customers.length, prevCustomers.length, "count", "neutral", "Số store khác nhau có ít nhất 1 ticket trong khoảng"),
    kpi("new", "Khách lần đầu liên hệ", customers.filter((c) => c.isNew).length, prevCustomers.filter((c) => c.isNew).length, "count", "neutral", "Lần liên hệ đầu tiên trong toàn bộ dữ liệu rơi vào khoảng này"),
    kpi("repeat", "Tỷ lệ liên hệ lặp lại", share(customers, (c) => c.tickets.length >= 2), share(prevCustomers, (c) => c.tickets.length >= 2), "pct", "down-good", "% store liên hệ từ 2 lần trở lên trong khoảng"),
    kpi("risk", "Nguy cơ cao", customers.filter((c) => c.segment === "risk").length, prevCustomers.filter((c) => c.segment === "risk").length, "count", "down-good", SEGMENTS.risk.hint),
    kpi("revenue_risk", "Doanh thu rủi ro /tháng", sumPrice(customers, (c) => c.segment === "risk"), sumPrice(prevCustomers, (c) => c.segment === "risk"), "money", "down-good", "Tổng giá plan của store nhóm Nguy cơ cao"),
    kpi("upsell", "Tiềm năng upsell", customers.filter((c) => c.segment === "upsell").length, prevCustomers.filter((c) => c.segment === "upsell").length, "count", "up-good", SEGMENTS.upsell.hint),
    kpi("paid", "Store trả phí", share(customers, (c) => (c.price ?? 0) > 0), share(prevCustomers, (c) => (c.price ?? 0) > 0), "pct", "neutral", "% store có giá plan > 0"),
    kpi("revenue", "Doanh thu đang phục vụ /tháng", sumPrice(customers), sumPrice(prevCustomers), "money", "neutral", "Tổng giá plan của các store đã liên hệ"),
  ];

  // Biểu đồ theo thời gian
  const grain = (["day", "week", "month"].includes(String(sp.grain)) ? sp.grain : autoGrain(q.period)) as Grain;
  const firstSeen = new Map<string, string>();
  for (const t of ds.tickets) {
    if (!t.store_domain || !t.derived.dayKey) continue;
    const f = firstSeen.get(t.store_domain);
    if (!f || t.derived.dayKey < f) firstSeen.set(t.store_domain, t.derived.dayKey);
  }
  const trend = buckets(q.period, grain).map((b) => {
    const inB = cur.filter((t) => t.derived.dayKey! >= b.from && t.derived.dayKey! <= b.to);
    const domains = new Set(inB.map((t) => t.store_domain).filter(Boolean) as string[]);
    return {
      label: b.label,
      stores: domains.size,
      fresh: [...domains].filter((d) => (firstSeen.get(d) ?? "") >= b.from).length,
      churn: distinctStores(inB.filter((t) => t.churn_risk)),
      repeat: [...domains].filter((d) => inB.filter((t) => t.store_domain === d).length >= 2).length,
    };
  });

  const segCounts = Object.fromEntries((Object.keys(SEGMENTS) as Segment[]).map((s) => [s, customers.filter((c) => c.segment === s).length]));
  const toBuckets = (list: Customer[], key: (c: Customer) => string | null) => tally(list.map(key));

  // Danh sách
  const seg = typeof sp.seg === "string" ? sp.seg : "all";
  const search = (typeof sp.q === "string" ? sp.q : "").toLowerCase();
  const kpiKey = typeof sp.kpi === "string" && sp.kpi in KPI_MATCH ? (sp.kpi as KpiKey) : null;
  const dimFilters = (Object.keys(DIMS) as DimKey[]).flatMap((k) => (typeof sp[`d_${k}`] === "string" ? [[k, sp[`d_${k}`] as string] as const] : []));
  let list = customers.filter((c) => {
    if (seg === "repeat" && c.tickets.length < 2) return false;
    if (seg === "uninstalled" && c.uninstallAt == null) return false;
    if (seg in SEGMENTS && c.segment !== seg) return false;
    if (kpiKey && !KPI_MATCH[kpiKey](c)) return false;
    for (const [k, v] of dimFilters) if (DIMS[k].of(c) !== v) return false;
    if (search && ![c.domain, c.name, c.plan].some((v) => v?.toLowerCase().includes(search))) return false;
    return true;
  });
  const sort = (typeof sp.sort === "string" && sp.sort in SORTS ? sp.sort : kpiKey === "revenue" || kpiKey === "revenue_risk" ? "price" : "contacts") as SortKey;
  const dir = sp.dir === "asc" ? 1 : -1;
  list = [...list].sort((a, b) => (SORTS[sort](a) - SORTS[sort](b)) * dir || b.tickets.length - a.tickets.length);
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number(sp.page ?? 1) || 1));
  const rows = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const scope = Object.fromEntries(["range", "from", "to", "cat"].flatMap((k) => (typeof sp[k] === "string" ? [[k, sp[k] as string]] : [])));
  const openDomain = typeof sp.open === "string" ? sp.open : null;
  const selectedId = typeof sp.ticket === "string" ? sp.ticket : null;
  const selected = selectedId ? ds.tickets.find((t) => t.id === selectedId) : undefined;
  const custHref = (d: string) => hrefWith(`/customers/${encodeURIComponent(d)}`, scope, {});
  const sortHead = (key: SortKey, label: string) => (
    <Link href={hrefWith("/customers", sp, { sort: key, dir: sort === key && dir === -1 ? "asc" : null, page: null })} scroll={false} className={cx("inline-flex items-center gap-1 hover:text-pf-text", sort === key && "text-pf-text")}>
      {label}
      {sort === key && (dir === -1 ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
    </Link>
  );

  const SEG_TABS: [string, string, number][] = [
    ["all", "Tất cả", customers.length],
    ...(Object.keys(SEGMENTS) as Segment[]).map((s) => [s, SEGMENTS[s].label, segCounts[s]] as [string, string, number]),
    ["repeat", "Liên hệ ≥ 2 lần", customers.filter((c) => c.tickets.length >= 2).length],
    ["uninstalled", "Đã gỡ app", customers.filter((c) => c.uninstallAt != null).length],
  ];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <PageHeader eyebrow="Support Insights" title="Khách hàng" subtitle={`Mỗi store là một khách · ${periodLabel(q.period)}`} />
      <FilterBar range={q.range} from={q.period.from} to={q.period.to} cat={q.cat} periodLabel={periodLabel(q.period)} prevLabel={null} showCompare={false} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <Link
            key={k.label}
            href={hrefWith("/customers", sp, { kpi: kpiKey === k.key ? null : k.key, seg: null, page: null }) + LIST_ANCHOR}
            title={k.hint}
            className={cx("block rounded-[20px] border bg-pf-card p-4 shadow-pf-card transition-colors", kpiKey === k.key ? "border-pf-primary-hi/70 bg-pf-primary/[.08]" : "border-pf-border hover:border-pf-primary-hi/50")}
          >
            <div className="text-[12px] font-semibold text-pf-muted">{k.label}</div>
            <div className="tabular mt-2 font-display text-[28px] font-bold leading-none tracking-[-0.03em] text-white">
              {k.format === "pct" ? (k.change.current == null ? "—" : `${Math.round(k.change.current * 100)}%`) : k.format === "money" ? `$${Math.round(k.change.current ?? 0).toLocaleString("vi-VN")}` : (k.change.current ?? 0).toLocaleString("vi-VN")}
            </div>
            <div className="mt-2 min-h-[18px] text-[11.5px]">
              {k.change.delta != null ? (
                <span className="flex items-center gap-1.5">
                  <Delta delta={k.change.delta} tone={k.change.tone} text={formatDelta(k.change.delta, k.format)} />
                  <span className="text-pf-faint">vs kỳ trước</span>
                </span>
              ) : (
                <span className="text-pf-faint">{k.hint}</span>
              )}
            </div>
          </Link>
        ))}
      </div>

      <Panel className="p-4 sm:p-5">
        <PanelTitle
          title={`Khách liên hệ theo ${GRAIN_LABEL[grain].toLowerCase()}`}
          note="Số store khác nhau liên hệ trong mỗi mốc: tổng, khách mới, khách liên hệ ≥ 2 lần trong mốc, khách có churn risk."
          right={<ChipLinks active={grain} items={(["day", "week", "month"] as Grain[]).map((g) => ({ key: g, label: GRAIN_LABEL[g], href: hrefWith("/customers", sp, { grain: g }) }))} />}
        />
        <TrendChart
          data={trend}
          format="count"
          series={[
            { key: "stores", label: "Store liên hệ", color: "#9a6bff" },
            { key: "fresh", label: "Khách mới", color: "#3987e5" },
            { key: "repeat", label: "Liên hệ ≥ 2 lần", color: "#d95926" },
            { key: "churn", label: "Churn risk", color: "#ff6b81", dashed: true },
          ]}
        />
      </Panel>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Panel className="p-4 sm:p-5">
          <PanelTitle title="Nhóm khách" note="Theo điểm sức khoẻ và tín hiệu" />
          <BarList items={(Object.keys(SEGMENTS) as Segment[]).map((s) => ({ key: SEGMENTS[s].label, count: segCounts[s], share: customers.length ? segCounts[s] / customers.length : 0 }))} hrefFor={(k) => hrefWith("/customers", sp, { seg: (Object.keys(SEGMENTS) as Segment[]).find((s) => SEGMENTS[s].label === k), kpi: null, page: null }) + LIST_ANCHOR} active={seg in SEGMENTS ? SEGMENTS[seg as Segment].label : undefined} />
        </Panel>
        {(Object.keys(DIMS) as DimKey[]).map((k) => {
          const items = toBuckets(customers, DIMS[k].of);
          return (
            <Panel key={k} className="p-4 sm:p-5">
              <PanelTitle title={DIMS[k].title} />
              <BarList
                items={k === "contacts" ? items.sort((a, b) => a.key.localeCompare(b.key, "vi", { numeric: true })) : items}
                hrefFor={(v) => hrefWith("/customers", sp, { [`d_${k}`]: sp[`d_${k}`] === v ? null : v, page: null }) + LIST_ANCHOR}
                active={typeof sp[`d_${k}`] === "string" ? (sp[`d_${k}`] as string) : undefined}
                emptyText={DIMS[k].empty}
              />
            </Panel>
          );
        })}
      </div>

      {/* Điểm neo: bấm ô KPI / biểu đồ → cuộn tới đây (bản tính doanh thu nếu có, rồi danh sách). */}
      <div id="danh-sach-khach" className="-mb-5 scroll-mt-4" />
      {(kpiKey === "revenue_risk" || kpiKey === "revenue") && <RevenueBreakdown customers={list} mode={kpiKey === "revenue_risk" ? "risk" : "served"} custHref={custHref} />}

      <Panel className="overflow-hidden">
        <div className="grid gap-3 px-4 pt-4 sm:px-5">
          <PanelTitle title={`Danh sách khách · ${list.length}`} note="Bấm vào một dòng để xem ngay các lần khách đã liên hệ (đủ cột như trang Chi tiết). Bấm “Xem” để mở đầy đủ mọi trường." />
          {(kpiKey || dimFilters.length > 0) && (
            <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
              <span className="text-pf-faint">Đang lọc:</span>
              {kpiKey && (
                <Link href={hrefWith("/customers", sp, { kpi: null, page: null })} scroll={false} className="inline-flex items-center gap-1 rounded-full border border-pf-primary-hi/50 bg-pf-primary/14 px-2.5 py-1 font-semibold text-white hover:border-pf-primary-hi">
                  {kpis.find((k) => k.key === kpiKey)?.label} <X size={12} />
                </Link>
              )}
              {dimFilters.map(([k, v]) => (
                <Link key={k} href={hrefWith("/customers", sp, { [`d_${k}`]: null, page: null })} scroll={false} className="inline-flex items-center gap-1 rounded-full border border-pf-primary-hi/50 bg-pf-primary/14 px-2.5 py-1 font-semibold text-white hover:border-pf-primary-hi">
                  {DIMS[k].title}: {v} <X size={12} />
                </Link>
              ))}
              <Link
                href={hrefWith("/customers", sp, { kpi: null, page: null, ...Object.fromEntries((Object.keys(DIMS) as DimKey[]).map((k) => [`d_${k}`, null])) })}
                scroll={false}
                className="px-1.5 font-semibold text-pf-primary-hi hover:underline"
              >
                Xoá lọc
              </Link>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <SearchBox initial={typeof sp.q === "string" ? sp.q : ""} placeholder="Tìm store, domain, plan…" />
          </div>
          <div className="flex flex-wrap gap-1.5 pb-3">
            {SEG_TABS.map(([key, label, n]) => (
              <Link
                key={key}
                href={hrefWith("/customers", sp, { seg: key === "all" ? null : key, kpi: null, page: null })}
                scroll={false}
                className={cx(
                  "rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors",
                  seg === key ? "border-pf-primary-hi bg-pf-primary text-white" : "border-pf-border text-pf-muted hover:border-pf-primary-hi/50 hover:text-pf-text",
                )}
              >
                {label}
                <span className={cx("tabular ml-1.5", seg === key ? "text-white/75" : "text-pf-faint")}>{n}</span>
              </Link>
            ))}
          </div>
        </div>
        {rows.length ? (
          <div className="pf-scroll @container overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse text-left">
              <thead>
                <tr className="border-y border-pf-border text-[11px] uppercase tracking-[0.06em] text-pf-faint">
                  <th className="px-4 py-3 font-semibold">Store</th>
                  <th className="px-3 py-3 font-semibold">{sortHead("price", "Plan")}</th>
                  <th className="px-3 py-3 text-right font-semibold">{sortHead("contacts", "Liên hệ")}</th>
                  <th className="px-3 py-3 font-semibold">{sortHead("last", "Gần nhất")}</th>
                  <th className="px-3 py-3 font-semibold">Kết thúc lần cuối</th>
                  <th className="px-3 py-3 font-semibold">{sortHead("health", "Sức khoẻ")}</th>
                  <th className="px-3 py-3 font-semibold">Upsell</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <Fragment key={c.domain}>
                  <ExpandRow domain={c.domain} open={openDomain === c.domain}>
                    <td className="px-4 py-2.5 align-top">
                      <div className="flex items-start gap-2">
                        <ChevronDown size={15} strokeWidth={1.75} className={cx("mt-0.5 shrink-0 text-pf-faint transition-transform duration-200", openDomain === c.domain && "rotate-180 text-pf-primary-hi")} />
                        <div className="grid gap-0.5">
                          <span className="font-semibold text-white">{c.name ?? c.domain}</span>
                          <span className="text-[11px] text-pf-faint">{c.domain}</span>
                          <Link href={custHref(c.domain)} className="text-[11px] font-semibold text-pf-primary-hi hover:underline">
                            Hồ sơ khách →
                          </Link>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <div className="text-pf-body">{c.plan ?? "—"}</div>
                      <div className="tabular text-[11px] text-pf-faint">{c.price != null ? `$${c.price}/tháng` : ""}</div>
                    </td>
                    <td className="tabular px-3 py-2.5 text-right align-top">
                      <span className={cx("font-semibold", c.tickets.length >= 3 ? "text-pf-warn" : "text-white")}>{c.tickets.length}</span>
                      <div className="text-[11px] text-pf-faint">{c.history.length} toàn bộ</div>
                    </td>
                    <td className="tabular whitespace-nowrap px-3 py-2.5 align-top text-pf-muted">{c.lastContact ? formatVnDate(c.lastContact) : "—"}</td>
                    <td className="px-3 py-2.5 align-top">
                      <div className="flex flex-wrap gap-1">
                        {c.last.resolution && <Badge tone={resolutionTone(c.last.resolution)}>{c.last.resolution}</Badge>}
                        {c.last.derived.moodEnd && <Badge tone={MOOD_TONE[c.last.derived.moodEnd]}>{c.last.derived.moodEnd}</Badge>}
                        {c.churn && <Badge tone="danger">Churn</Badge>}
                        {c.uninstallAt != null && <Badge tone="danger">Đã gỡ</Badge>}
                      </div>
                      <div className="mt-1 line-clamp-1 max-w-[280px] text-[11px] text-pf-faint">{c.last.issue_summary}</div>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <div className="flex items-center gap-2">
                        <span className={cx("tabular font-display text-[15px] font-bold", healthTone(c.health))}>{c.health}</span>
                        <Badge tone={SEGMENTS[c.segment].tone}>{SEGMENTS[c.segment].label}</Badge>
                      </div>
                    </td>
                    <td className="max-w-[240px] px-3 py-2.5 align-top text-[11.5px] text-pf-muted">
                      <span className="line-clamp-2">{c.upsell ?? "—"}</span>
                    </td>
                  </ExpandRow>
                  {openDomain === c.domain && (
                    <tr className="border-b border-pf-border/60 bg-pf-primary/[.04]">
                      <td colSpan={7} className="p-0">
                        {/* Ghim trái + rộng bằng khung nhìn: chỉ bảng lịch sử tự cuộn, header và dòng khách đứng yên */}
                        <div className="sticky left-0 w-[100cqw] px-4 pb-4 pt-1">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[12px] text-pf-muted">
                          <span>
                            <b className="text-white">{c.history.length}</b> lần liên hệ (mới nhất trước) · {c.tickets.length} trong khoảng đang xem, các lần ngoài khoảng được làm mờ
                          </span>
                          <Link href={custHref(c.domain)} className="font-semibold text-pf-primary-hi hover:underline">
                            Xem hồ sơ & lịch sử đầy đủ →
                          </Link>
                        </div>
                        <ContactRows tickets={c.history} inScope={new Set(c.tickets.map((t) => t.id))} hrefFor={(t) => hrefWith("/customers", sp, { ticket: t.id })} />
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text="Không có khách nào khớp bộ lọc." />
        )}
      </Panel>

      {selected && (
        <TicketDrawer
          t={selected}
          closeHref={hrefWith("/customers", sp, { ticket: null })}
          related={selected.store_domain ? { count: ds.tickets.filter((t) => t.store_domain === selected.store_domain).length, label: selected.store_domain, href: custHref(selected.store_domain) } : null}
        />
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-between text-[12px] text-pf-muted">
          <span className="tabular">
            Trang {page}/{pages}
          </span>
          <div className="flex gap-1.5">
            <Link href={hrefWith("/customers", sp, { page: String(page - 1) })} className={buttonClass("ghost", "sm", page <= 1 && "pointer-events-none opacity-40")}>
              <ChevronLeft size={14} /> Trước
            </Link>
            <Link href={hrefWith("/customers", sp, { page: String(page + 1) })} className={buttonClass("ghost", "sm", page >= pages && "pointer-events-none opacity-40")}>
              Sau <ChevronRight size={14} />
            </Link>
          </div>
        </nav>
      )}
    </div>
  );
}
