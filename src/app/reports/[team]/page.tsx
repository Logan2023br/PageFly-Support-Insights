import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Download } from "lucide-react";
import { getDataset } from "@/lib/data";
import { vnDayKey } from "@/lib/data/parse";
import { formatDelta, formatValue } from "@/lib/metrics/compute";
import { buildReport, GRAIN_LABELS, TEAMS, type ReportGrain, type ReportTeam } from "@/lib/reports";
import { AiPanel } from "@/components/ai/ai-panel";
import { AlertBadge, buttonClass, cx, Delta, Empty, PageHeader, PageSkeleton, Panel, PanelTitle } from "@/components/ui";

export default function Page(props: PageProps<"/reports/[team]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Report params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Report({ params, searchParams }: { params: Promise<{ team: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { team } = await params;
  if (!(team in TEAMS)) notFound();
  const sp = await searchParams;
  const grain = (typeof sp.grain === "string" && sp.grain in GRAIN_LABELS ? sp.grain : "week") as ReportGrain;
  const ds = await getDataset();
  const report = buildReport(ds.tickets, team as ReportTeam, grain, vnDayKey(ds.loadedAt));
  const sections = [...new Set(report.rows.map((r) => r.def.section))];
  const alerts = report.rows.filter((r) => r.change.alert);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <PageHeader
        eyebrow={
          <Link href="/reports" className="inline-flex items-center gap-1 hover:text-pf-violet">
            <ChevronLeft size={12} /> Báo cáo
          </Link>
        }
        title={`Báo cáo ${TEAMS[team as ReportTeam].title}`}
        subtitle={`${TEAMS[team as ReportTeam].description} · ${report.periods[0].label} → ${report.periods.at(-1)!.label}`}
        actions={
          <a href={`/api/export?kind=report&team=${team}&grain=${grain}`} className={buttonClass("primary", "sm")}>
            <Download size={14} strokeWidth={1.75} /> Xuất Excel
          </a>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex w-fit gap-1 rounded-xl border border-pf-border bg-white/[.02] p-1">
          {(Object.keys(GRAIN_LABELS) as ReportGrain[]).map((g) => (
            <Link
              key={g}
              href={`/reports/${team}?grain=${g}`}
              scroll={false}
              className={cx("rounded-[9px] px-3.5 py-1.5 text-[12.5px] font-semibold", grain === g ? "bg-pf-primary/14 text-white ring-1 ring-pf-primary-hi/40" : "text-pf-muted hover:text-pf-text")}
            >
              {GRAIN_LABELS[g]}
            </Link>
          ))}
        </div>
        <p className="text-[12px] text-pf-muted">
          {report.compared ? `Thay đổi: ${report.compared.current} so với ${report.compared.previous}` : "Chưa đủ kỳ để so sánh"} ·{" "}
          <span className={alerts.length ? "font-semibold text-pf-danger" : ""}>{alerts.length} chỉ số cần chú ý</span>
        </p>
      </div>

      <Panel className="overflow-hidden">
        <div className="pf-scroll overflow-x-auto">
          <table className="w-full border-collapse text-left" style={{ minWidth: 520 + report.periods.length * 110 }}>
            <thead>
              <tr className="border-b border-pf-border text-[11px] uppercase tracking-[0.06em] text-pf-faint">
                <th className="sticky left-0 z-10 bg-pf-bg-alt px-4 py-3 font-semibold">Chỉ số</th>
                {report.periods.map((p, i) => (
                  <th key={p.from} className={cx("whitespace-nowrap px-3 py-3 text-right font-semibold", i === report.periods.length - 1 && "text-pf-violet")}>
                    {p.label}
                  </th>
                ))}
                <th className="whitespace-nowrap px-3 py-3 text-right font-semibold">Tổng kỳ</th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold">Thay đổi</th>
              </tr>
            </thead>
            {sections.map((section) => (
              <tbody key={section}>
                <tr className="border-b border-pf-border bg-white/[.02]">
                  <td colSpan={report.periods.length + 3} className="sticky left-0 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-pf-primary-hi">
                    {section}
                  </td>
                </tr>
                {report.rows
                  .filter((r) => r.def.section === section)
                  .map((r) => (
                    <tr key={r.def.key} className={cx("border-b border-pf-border/60 text-[12.5px] hover:bg-pf-card/60", r.change.alert === "critical" && "bg-pf-danger/[.04]")}>
                      <td className="sticky left-0 z-10 bg-pf-bg-alt px-4 py-2.5 font-semibold text-white">{r.def.label}</td>
                      {r.values.map((v, i) => (
                        <td key={i} className={cx("tabular whitespace-nowrap px-3 py-2.5 text-right", i === r.values.length - 1 ? "font-semibold text-white" : "text-pf-body")}>
                          {formatValue(v, r.def.format)}
                        </td>
                      ))}
                      <td className="tabular whitespace-nowrap px-3 py-2.5 text-right text-pf-muted">{formatValue(r.total, r.def.format)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <span className="flex items-center gap-2" title={r.change.note}>
                          {r.change.delta != null ? <Delta delta={r.change.delta} tone={r.change.tone} text={formatDelta(r.change.delta, r.def.format)} /> : <span className="text-pf-faint">—</span>}
                          <AlertBadge level={r.change.alert} />
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            ))}
          </table>
        </div>
      </Panel>

      <AiPanel kind={`report-${team}` as "report-cs"} params={{ grain }} title={`Nhận định AI cho báo cáo ${TEAMS[team as ReportTeam].title}`} />

      <div className="grid gap-3 xl:grid-cols-2">
        {report.tables.map((table) => (
          <Panel key={table.key} className={cx("p-4 sm:p-5", table.columns.length > 7 && "xl:col-span-2")}>
            <PanelTitle title={table.title} note={`${table.rows.length} dòng`} />
            {table.rows.length ? (
              <div className="pf-scroll max-h-[420px] overflow-auto">
                <table className="w-full border-collapse text-left">
                  <thead className="sticky top-0 bg-pf-bg-alt">
                    <tr className="border-b border-pf-border text-[11px] uppercase tracking-[0.06em] text-pf-faint">
                      {table.columns.map((c, i) => (
                        <th key={c} className={cx("whitespace-nowrap px-3 py-2.5 font-semibold", i > 0 && "text-right")}>
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row, ri) => (
                      <tr key={ri} className="border-b border-pf-border/60 text-[12.5px] last:border-0 hover:bg-pf-card/60">
                        {row.map((cell, ci) => (
                          <td key={ci} className={cx("px-3 py-2.5 align-top", ci === 0 ? "font-semibold text-white" : "tabular text-right text-pf-body")}>
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty text="Kỳ này chưa có dữ liệu." />
            )}
          </Panel>
        ))}
      </div>
    </div>
  );
}
