import { Suspense } from "react";
import { Download, ListFilter } from "lucide-react";
import { earliestDay, getDataset } from "@/lib/data";
import { buildCompare, buildDashboard, metricTrend } from "@/lib/dashboard";
import { bucketSeries, type DayPoint } from "@/lib/metrics/compute";
import { METRIC_BY_KEY } from "@/lib/metrics/defs";
import { ticketSummary } from "@/lib/metrics/summaries";
import { hrefWith, parseQuery, periodLabel, RANGE_LABELS, selectTickets, type SearchParams } from "@/lib/query";
import { aiConfigured } from "@/lib/ai/insights";
import { FilterBar } from "@/components/filters/filter-bar";
import { KpiMain, KpiMore, MetricGlossary } from "@/components/dashboard/kpi-grid";
import { ActionPanel } from "@/components/dashboard/action-panel";
import { actionItems } from "@/lib/alerts";
import { SummaryBlocks } from "@/components/dashboard/summary-blocks";
import { TrendChart, VolumeChart } from "@/components/charts/charts";
import { BarList } from "@/components/charts/bar-list";
import { MiniTable } from "@/components/tickets/mini-table";
import { AiPanel } from "@/components/ai/ai-panel";
import { CompareView } from "@/components/compare/compare-view";
import { ButtonLink, InlineError, InlineNote, PageHeader, PageSkeleton, Panel, PanelTitle } from "@/components/ui";

/** "2026-10-09" → "09/10". */
const fmtDayKey = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`;

const SCOPE_KEYS = ["range", "from", "to", "cat"] as const;

function scopeParams(sp: SearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of SCOPE_KEYS) {
    const v = sp[k];
    if (typeof v === "string" && v) out[k] = v;
  }
  return out;
}

export default function Page(props: PageProps<"/">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Dashboard searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Dashboard({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const ds = await getDataset();
  const q = parseQuery(sp, { earliestDay: earliestDay(ds) });
  const d = buildDashboard(ds.tickets, q);
  const scope = scopeParams(sp);
  const ticketsHref = (extra: Record<string, string>) => hrefWith("/tickets", scope, extra);

  const counts = { all: 0, Feedback: 0, Issue: 0, Improve: 0 } as Record<string, number>;
  for (const t of selectTickets(ds.tickets, { ...q, cat: "all" })) {
    counts.all++;
    if (t.category_ticket && t.category_ticket in counts) counts[t.category_ticket]++;
  }

  const tileKey = typeof sp.tile === "string" && METRIC_BY_KEY[sp.tile]?.match ? sp.tile : null;
  const drill = tileKey ? d.cur.filter(METRIC_BY_KEY[tileKey].match!) : null;
  const prevLabel = q.prev ? periodLabel(q.prev) : null;
  const drillTrend = tileKey ? metricTrend(METRIC_BY_KEY[tileKey], d.cur, d.prev, q) : null;
  const series = bucketSeries(d.series);
  const compareOpen = sp.compare === "1" && q.prev;
  const cmp = compareOpen ? buildCompare(ds.tickets, q) : null;
  const toLine = (pts: DayPoint[]) => pts.map((p) => ({ day: p.day, v: p.total }));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <PageHeader
        eyebrow="Support Insights"
        title="Thống kê"
        subtitle={`${RANGE_LABELS[q.range]} · ${periodLabel(q.period)}${prevLabel ? ` · kỳ so sánh ${prevLabel}` : ""}`}
        actions={
          <>
            <ButtonLink href={ticketsHref({})} variant="ghost">
              <ListFilter size={14} strokeWidth={1.75} /> Mở danh sách
            </ButtonLink>
            <a href={hrefWith("/api/export", scope, { kind: "tickets" })} className="inline-flex h-8 items-center gap-1.5 rounded-[12px] border border-pf-border px-3 text-[12.5px] font-semibold text-pf-body transition-colors hover:border-pf-border-hi hover:bg-pf-card">
              <Download size={14} strokeWidth={1.75} /> Xuất Excel
            </a>
          </>
        }
      />

      {ds.error && <InlineError>Không tải được dữ liệu mới: {ds.error}. Đang hiển thị bản gần nhất.</InlineError>}
      {ds.source === "mock" && (
        <InlineNote tone="violet">
          Đang dùng <b>dữ liệu giả lập</b> đúng hợp đồng cột (sheet thật chưa có đủ cột). Đặt <code>SHEET_ID</code> và <code>DATA_SOURCE=sheet</code> trong <code>.env.local</code> để chuyển sang sheet thật.
        </InlineNote>
      )}

      <FilterBar range={q.range} from={q.period.from} to={q.period.to} cat={q.cat} periodLabel={periodLabel(q.period)} prevLabel={prevLabel} counts={counts} />

      <KpiMain rows={d.main} selected={tileKey} prevLabel={prevLabel} hrefFor={(key) => hrefWith("/", sp, { tile: key })} />

      {drill && tileKey && (
        <Panel className="p-4 sm:p-5">
          <PanelTitle
            title={`${METRIC_BY_KEY[tileKey].label} · ${drill.length} ticket · ${new Set(drill.map((t) => t.store_domain).filter(Boolean)).size} store`}
            note={METRIC_BY_KEY[tileKey].hint}
            right={
              <ButtonLink href={ticketsHref({ metric: tileKey })} variant="ghost">
                Xem đầy đủ trong Chi tiết
              </ButtonLink>
            }
          />
          <div className="mb-4 rounded-[16px] border border-pf-border bg-white/[.02] p-3.5">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-pf-faint">Bản tóm tắt</div>
            <ul className="grid gap-1">
              {ticketSummary(drill, q.period).lines.map((l, i) => (
                <li key={i} className="text-[12.5px] leading-relaxed text-pf-body">
                  {l.text}
                </li>
              ))}
            </ul>
          </div>
          {drillTrend && (
            <div className="mb-4 rounded-[16px] border border-pf-border bg-white/[.02] p-3.5">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-pf-faint">
                Theo {drillTrend.length < d.series.length ? "tuần" : "ngày"}: {periodLabel(q.period)}
                {q.prev ? ` so với ${periodLabel(q.prev)}` : ""}
              </div>
              <TrendChart
                data={drillTrend.map((p) => ({ label: fmtDayKey(p.label), cur: p.cur, prev: p.prev, prevDay: p.prevLabel ? fmtDayKey(p.prevLabel) : null }))}
                series={[
                  { key: "cur", label: `Kỳ này (${periodLabel(q.period)})`, color: "#9a6bff" },
                  ...(q.prev ? [{ key: "prev", label: `Kỳ trước (${periodLabel(q.prev)})`, color: "rgba(231,228,245,0.55)", dashed: true }] : []),
                ]}
                format={METRIC_BY_KEY[tileKey].format}
                height={220}
              />
            </div>
          )}
          <MiniTable tickets={drill} hrefFor={(t) => ticketsHref({ metric: tileKey, ticket: t.id })} />
          {drill.length > 25 && <p className="mt-3 text-[11.5px] text-pf-faint">Hiển thị 25/{drill.length} ticket mới nhất.</p>}
        </Panel>
      )}

      <KpiMore groups={d.moreGroups} selected={tileKey} prevLabel={prevLabel} hrefFor={(key) => hrefWith("/", sp, { tile: key })} open={Boolean(tileKey && !d.main.flat().some((t) => t.def.key === tileKey))} />

      <ActionPanel items={actionItems(d.cur)} hrefFor={(id) => ticketsHref({ f_attention: "Yes", ticket: id })} allHref={ticketsHref({ f_attention: "Yes" })} />

      <SummaryBlocks blocks={d.summaries} hrefFor={(f) => ticketsHref(f)} />

      <AiPanel kind="overview" params={scope} title="Nhận định AI cho khoảng thời gian này" />

      <div className="grid gap-3 xl:grid-cols-[1.6fr_1fr]">
        <Panel className="p-4 sm:p-5">
          <PanelTitle title="Ticket theo ngày" note={series.length < d.series.length ? "Đã gộp theo tuần vì khoảng thời gian dài" : "Feedback · Issue · Improve"} />
          <VolumeChart data={series} keys={q.cat === "all" ? ["Issue", "Feedback", "Improve"] : [q.cat]} />
        </Panel>
        <Panel className="p-4 sm:p-5">
          <PanelTitle title="Nhóm issue" note="Bấm để xem danh sách" />
          <BarList items={d.breakdowns.category_issue} hrefFor={(k) => ticketsHref({ cat: "Issue", f_category_issue: k })} emptyText="Không có issue" />
        </Panel>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Panel className="p-4 sm:p-5">
          <PanelTitle title="Nguyên nhân gốc" />
          <BarList items={d.breakdowns.root_cause} hrefFor={(k) => ticketsHref({ f_root_cause: k })} />
        </Panel>
        <Panel className="p-4 sm:p-5">
          <PanelTitle title="Trang gặp vấn đề" />
          <BarList items={d.breakdowns.page_issue} hrefFor={(k) => ticketsHref({ cat: "Issue", f_page_issue: k })} />
        </Panel>
        <Panel className="p-4 sm:p-5">
          <PanelTitle title="Kết quả xử lý" />
          <BarList items={d.breakdowns.resolution} hrefFor={(k) => ticketsHref({ f_resolution: k })} />
        </Panel>
        <Panel className="p-4 sm:p-5">
          <PanelTitle title="Mood khách: đầu → cuối" />
          <BarList items={d.breakdowns.mood_flow} />
        </Panel>
        <Panel className="p-4 sm:p-5">
          <PanelTitle title="Team phụ trách" />
          <BarList items={d.breakdowns.team_owner} hrefFor={(k) => ticketsHref({ f_team_owner: k })} />
        </Panel>
        <Panel className="p-4 sm:p-5">
          <PanelTitle title="Theo ca" />
          <BarList items={d.breakdowns.shift} hrefFor={(k) => ticketsHref({ f_shift: k })} />
        </Panel>
        {(q.cat === "all" || q.cat === "Improve") && (
          <Panel className="p-4 sm:p-5">
            <PanelTitle title="Khách muốn có (Improve)" />
            <BarList items={d.breakdowns.improve} emptyText="Chưa có yêu cầu tính năng" />
          </Panel>
        )}
        {(q.cat === "all" || q.cat === "Feedback") && (
          <Panel className="p-4 sm:p-5">
            <PanelTitle title="Góp ý (Feedback)" />
            <BarList items={d.breakdowns.feedback} emptyText="Chưa có góp ý" />
          </Panel>
        )}
      </div>

      <MetricGlossary />

      {cmp && q.prev && (
        <CompareView
          periodLabel={periodLabel(q.period)}
          prevLabel={periodLabel(q.prev)}
          prevFrom={q.prev.from}
          prevTo={q.prev.to}
          metrics={cmp.metrics}
          byIssue={cmp.byIssue}
          byCategory={cmp.byCategory}
          byRoot={cmp.byRoot}
          current={toLine(cmp.series)}
          previous={toLine(cmp.prevSeries)}
          params={{ ...scope, ...(typeof sp.cfrom === "string" ? { cfrom: sp.cfrom } : {}), ...(typeof sp.cto === "string" ? { cto: sp.cto } : {}) }}
          aiEnabled={aiConfigured()}
        />
      )}
    </div>
  );
}
