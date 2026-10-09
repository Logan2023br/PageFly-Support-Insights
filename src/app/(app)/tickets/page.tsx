import { Suspense } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { earliestDay, getDataset } from "@/lib/data";
import type { Ticket } from "@/lib/data/types";
import { METRIC_BY_KEY } from "@/lib/metrics/defs";
import { EMPTY_VALUE, FACET_KEYS, FACET_LABELS, facetValues, hrefWith, inPeriod, matchesFilters, parseQuery, periodLabel, type FacetKey, type SearchParams } from "@/lib/query";
import { FIELDS, FIELD_BY_KEY, type FieldGroup } from "@/lib/schema/fields";
import { sortTickets } from "@/lib/sort";
import { FilterBar } from "@/components/filters/filter-bar";
import { ColumnPresets, FacetBar, SearchBox, type FacetDef } from "@/components/tickets/facet-bar";
import { TicketCell } from "@/components/tickets/ticket-cell";
import { TicketDrawer } from "@/components/tickets/ticket-drawer";
import { Badge, buttonClass, cx, Empty, PageHeader, PageSkeleton, Panel } from "@/components/ui";

const PAGE_SIZE = 50;

const PRESETS: [string, string][] = [
  ["compact", "Gọn"],
  ["basic", "Cơ bản"],
  ["customer", "Khách hàng"],
  ["ticket", "Ticket"],
  ["handling", "Xử lý"],
  ["all", `Tất cả ${FIELDS.length} cột`],
];

const COMPACT = ["recap_at_vn", "triggered_by", "store_domain", "category_ticket", "category_issue", "issue_summary", "priority", "role_pic", "resolution", "mood_label_cx_end_to_end", "csat", "churn_risk", "ticket_url"];

function columnsFor(preset: string): string[] {
  if (preset === "all") return FIELDS.map((f) => f.key);
  if (preset in { basic: 1, customer: 1, ticket: 1, handling: 1 }) {
    const group = FIELDS.filter((f) => f.group === (preset as FieldGroup)).map((f) => f.key);
    return ["recap_at_vn", "store_domain", "issue_summary", ...group.filter((k) => !["recap_at_vn", "store_domain", "issue_summary"].includes(k))];
  }
  return COMPACT;
}

const VISIBLE_FACETS: FacetKey[] = [
  "category_issue",
  "priority",
  "handler",
  "team_owner",
  "resolution",
  "mood_label_cx",
  "csat",
  "churn_risk",
  "attention",
  "upsell",
  "review_asked_status",
  "triggered_by",
  "name_pic",
  "shift",
  "shift_lead",
  "page_issue",
  "type_issue",
  "escalated",
  "feedback_cx_solution",
  "review_verdict",
  "pagefly_plan",
  "shopify_plan",
  "root_cause",
];

export default function Page(props: PageProps<"/tickets">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Tickets searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Tickets({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const ds = await getDataset();
  const q = parseQuery(sp, { earliestDay: earliestDay(ds) });
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);

  const inRange = ds.tickets.filter((t) => inPeriod(t, q.period));
  const rows = inRange.filter((t) => matchesFilters(t, q));

  // Facet: đếm theo các bộ lọc khác (bỏ chính facet đó) để số luôn đúng khi chọn nhiều giá trị.
  const facets: FacetDef[] = VISIBLE_FACETS.map((key) => {
    const others = { ...q, facets: Object.fromEntries(Object.entries(q.facets).filter(([k]) => k !== key)) };
    const counts = new Map<string, number>();
    for (const t of inRange) {
      if (!matchesFilters(t, others)) continue;
      for (const v of facetValues(t, key)) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    const selected = q.facets[key] ?? [];
    for (const s of selected) if (!counts.has(s)) counts.set(s, 0);
    const options = [...counts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => (a.value === EMPTY_VALUE ? 1 : b.value === EMPTY_VALUE ? -1 : b.count - a.count));
    return { key, label: FACET_LABELS[key], options, selected };
  });

  const sort = str("sort") ?? "recap_at_vn";
  const dir = str("dir") === "asc" ? "asc" : "desc";
  const sorted = sortTickets(rows, sort, dir);
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number(str("page") ?? 1) || 1));
  const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const preset = str("cols") ?? "compact";
  const cols = columnsFor(preset);

  const selectedId = str("ticket");
  const selected: Ticket | undefined = selectedId ? ds.tickets.find((t) => t.id === selectedId) : undefined;
  const storeCount = selected?.store_domain ? ds.tickets.filter((t) => t.store_domain === selected.store_domain).length : 0;

  const activeFilters: { label: string; clear: Record<string, null> }[] = [
    ...(q.metric ? [{ label: `Chỉ số: ${METRIC_BY_KEY[q.metric].label}`, clear: { metric: null } }] : []),
    ...(q.q ? [{ label: `Tìm: "${q.q}"`, clear: { q: null } }] : []),
    ...Object.entries(q.facets).map(([k, v]) => ({ label: `${FACET_LABELS[k as FacetKey]}: ${v.join(", ")}`, clear: { [`f_${k}`]: null } as Record<string, null> })),
  ];
  const clearAll = Object.fromEntries([["metric", null], ["q", null], ["page", null], ...FACET_KEYS.map((k) => [`f_${k}`, null])]);
  const exportBase = { ...Object.fromEntries(Object.entries(sp).filter(([, v]) => typeof v === "string")), kind: "tickets" } as Record<string, string>;
  delete exportBase.ticket;
  delete exportBase.page;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <PageHeader
        eyebrow="Support Insights"
        title="Chi tiết ticket"
        subtitle={`${periodLabel(q.period)} · ${rows.length.toLocaleString("vi-VN")} ticket khớp bộ lọc`}
        actions={
          <>
            <a href={hrefWith("/api/export", exportBase, { format: "xlsx" })} className={buttonClass("ghost", "sm")}>
              <Download size={14} strokeWidth={1.75} /> Excel
            </a>
            <a href={hrefWith("/api/export", exportBase, { format: "csv" })} className={buttonClass("ghost", "sm")}>
              <Download size={14} strokeWidth={1.75} /> CSV
            </a>
          </>
        }
      />

      <FilterBar range={q.range} from={q.period.from} to={q.period.to} cat={q.cat} periodLabel={periodLabel(q.period)} prevLabel={null} showCompare={false} />

      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchBox initial={q.q} />
          <ColumnPresets value={preset} presets={PRESETS} />
          <span className="tabular text-[12px] text-pf-muted">{rows.length.toLocaleString("vi-VN")} kết quả</span>
        </div>
        <FacetBar facets={facets} />
        {activeFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {activeFilters.map((f) => (
              <Link key={f.label} href={hrefWith("/tickets", sp, { ...f.clear, page: null })} className="inline-flex items-center gap-1 rounded-full border border-pf-primary-hi/40 bg-pf-primary/14 px-2.5 py-1 text-[11.5px] font-semibold text-pf-violet hover:text-white">
                {f.label} <X size={12} />
              </Link>
            ))}
            <Link href={hrefWith("/tickets", sp, clearAll)} className="ml-1 text-[12px] text-pf-faint underline-offset-2 hover:underline">
              Xoá tất cả
            </Link>
          </div>
        )}
      </div>

      <Panel className="overflow-hidden">
        {pageRows.length ? (
          <div className="pf-scroll overflow-x-auto">
            <table className="w-full border-collapse text-left" style={{ minWidth: Math.max(960, cols.length * 140) }}>
              <thead>
                <tr className="border-b border-pf-border">
                  {cols.map((key) => {
                    const activeSort = sort === key;
                    const nextDir = activeSort && dir === "desc" ? "asc" : "desc";
                    return (
                      <th key={key} className="whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-pf-faint">
                        <Link href={hrefWith("/tickets", sp, { sort: key, dir: nextDir, page: null })} scroll={false} className={cx("inline-flex items-center gap-1 hover:text-pf-text", activeSort && "text-pf-text")} title={FIELD_BY_KEY[key]?.description}>
                          {FIELD_BY_KEY[key]?.label ?? key}
                          {activeSort && (dir === "desc" ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
                        </Link>
                      </th>
                    );
                  })}
                  <th className="sticky right-0 bg-pf-bg-alt px-4 py-3 shadow-[-12px_0_12px_-12px_rgba(0,0,0,0.9)]" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((t) => (
                  <tr key={t.id} className={cx("border-b border-pf-border/60 text-[12.5px] last:border-0 hover:bg-pf-card/60", t.id === selectedId && "bg-pf-primary/[.08]")}>
                    {cols.map((key) => (
                      <td key={key} className="px-4 py-3 align-top text-pf-body">
                        <TicketCell t={t} field={key} />
                      </td>
                    ))}
                    <td className="sticky right-0 bg-pf-bg-alt px-3 py-2.5 align-top shadow-[-12px_0_12px_-12px_rgba(0,0,0,0.9)]">
                      <Link href={hrefWith("/tickets", sp, { ticket: t.id })} scroll={false} className="rounded-[8px] px-2 py-1 text-[11.5px] font-semibold text-pf-muted hover:bg-pf-bg-deep hover:text-white">
                        Xem
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text="Không có ticket nào khớp bộ lọc. Thử nới khoảng thời gian hoặc bỏ bớt bộ lọc." />
        )}
      </Panel>

      {pages > 1 && (
        <nav className="flex items-center justify-between text-[12px] text-pf-muted">
          <span className="tabular">
            Trang {page}/{pages} · {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sorted.length)} / {sorted.length}
          </span>
          <div className="flex gap-1.5">
            <Link aria-disabled={page <= 1} href={hrefWith("/tickets", sp, { page: String(page - 1) })} className={buttonClass("ghost", "sm", page <= 1 && "pointer-events-none opacity-40")}>
              <ChevronLeft size={14} /> Trước
            </Link>
            <Link aria-disabled={page >= pages} href={hrefWith("/tickets", sp, { page: String(page + 1) })} className={buttonClass("ghost", "sm", page >= pages && "pointer-events-none opacity-40")}>
              Sau <ChevronRight size={14} />
            </Link>
          </div>
        </nav>
      )}

      {selected && (
        <TicketDrawer
          t={selected}
          closeHref={hrefWith("/tickets", sp, { ticket: null })}
          related={selected.store_domain ? { count: storeCount, label: selected.store_domain, href: `/customers/${encodeURIComponent(selected.store_domain)}` } : null}
        />
      )}
      {selectedId && !selected && <Badge tone="danger">Không tìm thấy ticket {selectedId}</Badge>}
    </div>
  );
}
