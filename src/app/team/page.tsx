import { Suspense } from "react";
import Link from "next/link";
import { Cpu, Headset } from "lucide-react";
import { earliestDay, getDataset } from "@/lib/data";
import { judge, formatDelta } from "@/lib/metrics/compute";
import {
  autoGrain,
  GRAIN_LABEL,
  MIN_SAMPLE,
  people,
  perfMetric,
  qualityScore,
  ROLE_LABELS,
  ROLE_METRICS,
  scoreComponents,
  series,
  ticketsOf,
  type Grain,
  type PerfRole,
} from "@/lib/metrics/performance";
import { hrefWith, parseQuery, periodLabel, selectTickets, type SearchParams } from "@/lib/query";
import { FilterBar } from "@/components/filters/filter-bar";
import { TrendChart } from "@/components/charts/charts";
import { ChipLinks, fmtPerf, ScoreBadge, ScoreBreakdown, Sparkline } from "@/components/perf/perf-ui";
import { cx, Delta, Empty, PageHeader, PageSkeleton, Panel, PanelTitle } from "@/components/ui";

export default function Page(props: PageProps<"/team">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Team searchParams={props.searchParams} />
    </Suspense>
  );
}

const ROLE_ICON = { fl: Headset, ts: Cpu };

async function Team({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const role: PerfRole = sp.role === "ts" ? "ts" : "fl";
  const ds = await getDataset();
  const q = parseQuery(sp, { earliestDay: earliestDay(ds) });
  const cur = ticketsOf(selectTickets(ds.tickets, q), role);
  const prev = q.prev ? ticketsOf(selectTickets(ds.tickets, q, q.prev), role) : [];
  const grain = (["day", "week", "month"].includes(String(sp.grain)) ? sp.grain : autoGrain(q.period)) as Grain;
  const metricKey = ROLE_METRICS[role].includes(String(sp.metric)) ? String(sp.metric) : "score";
  const metric = perfMetric(metricKey);

  const teamScore = qualityScore(cur, role);
  const prevTeamScore = prev.length ? qualityScore(prev, role).score : null;
  const rows = people(cur, prev, role, q.period, grain);
  const ranked = [...rows].sort((a, b) => {
    const ra = a.tickets >= MIN_SAMPLE ? 1 : 0;
    const rb = b.tickets >= MIN_SAMPLE ? 1 : 0;
    return rb - ra || (b.score.score ?? -1) - (a.score.score ?? -1);
  });
  const trend = series(cur, q.period, grain, metricKey, role);
  const prevTrend = q.prev ? series(prev, q.prev, grain, metricKey, role) : [];
  const chartData = trend.map((pt, i) => ({ label: pt.label, team: pt.value, prev: prevTrend[i]?.value ?? null, sample: pt.sample }));

  const kpis = ["score", ...ROLE_METRICS[role].filter((k) => k !== "score" && k !== "tickets").slice(0, 4)].map((k) => {
    const m = perfMetric(k);
    const c = m.compute(cur, role);
    const p = prev.length ? m.compute(prev, role) : null;
    const fmt = m.format === "score" ? "count" : m.format;
    return { m, value: c, change: judge({ key: k, label: m.label, format: fmt, polarity: m.polarity, current: c, previous: p }) };
  });

  const scope = Object.fromEntries(["range", "from", "to", "cat"].flatMap((k) => (typeof sp[k] === "string" ? [[k, sp[k] as string]] : [])));
  const personHref = (name: string) => hrefWith(`/team/${role}/${encodeURIComponent(name)}`, scope, {});
  const metricsCols = ROLE_METRICS[role].filter((k) => k !== "score" && k !== "tickets");

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <PageHeader eyebrow="Support Insights" title="Đội ngũ" subtitle={`Đánh giá hiệu suất ${ROLE_LABELS[role].title} · ${periodLabel(q.period)}`} />

      <div className="grid gap-3 sm:grid-cols-2 lg:max-w-[640px]">
        {(["fl", "ts"] as PerfRole[]).map((r) => {
          const Icon = ROLE_ICON[r];
          const active = r === role;
          return (
            <Link
              key={r}
              href={hrefWith("/team", sp, { role: r === "fl" ? null : r, metric: null })}
              scroll={false}
              className={cx(
                "flex items-center gap-3 rounded-[16px] border p-3.5 transition-colors duration-150",
                active ? "border-pf-primary-hi/60 bg-pf-primary/14" : "border-pf-border bg-pf-card hover:border-pf-primary-hi/40",
              )}
            >
              <span className={cx("grid size-9 place-items-center rounded-[12px]", active ? "bg-pf-primary text-white" : "border border-pf-border text-pf-muted")}>
                <Icon size={17} strokeWidth={1.75} />
              </span>
              <span>
                <span className={cx("block font-display text-[15px] font-semibold", active ? "text-white" : "text-pf-body")}>{ROLE_LABELS[r].title}</span>
                <span className="block text-[11.5px] text-pf-muted">{r === "fl" ? "Người trực tiếp chat với khách" : "Kỹ thuật xử lý ticket được chuyển lên"}</span>
              </span>
            </Link>
          );
        })}
      </div>

      <FilterBar range={q.range} from={q.period.from} to={q.period.to} cat={q.cat} periodLabel={periodLabel(q.period)} prevLabel={null} showCompare={false} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {kpis.map(({ m, value, change }) => (
          <Panel key={m.key} className="p-4">
            <div className="text-[12px] font-semibold text-pf-muted">{m.key === "score" ? `Điểm chất lượng ${ROLE_LABELS[role].short}` : m.label}</div>
            <div className="mt-2">{m.key === "score" ? <ScoreBadge value={value} size="lg" /> : <span className="tabular font-display text-[28px] font-bold leading-none tracking-[-0.03em] text-white">{fmtPerf(value, m.format)}</span>}</div>
            <div className="mt-2 min-h-[18px] text-[11.5px]">
              {change.delta != null ? (
                <span className="flex items-center gap-1.5">
                  <Delta delta={change.delta} tone={change.tone} text={m.format === "score" ? `${change.delta > 0 ? "+" : "−"}${Math.abs(Math.round(change.delta))} điểm` : formatDelta(change.delta, m.format)} />
                  <span className="text-pf-faint">vs kỳ trước</span>
                </span>
              ) : (
                <span className="text-pf-faint">Kỳ trước chưa có dữ liệu</span>
              )}
            </div>
          </Panel>
        ))}
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.6fr_1fr]">
        <Panel className="p-4 sm:p-5">
          <PanelTitle
            title={`${metric.label} của cả team ${ROLE_LABELS[role].short} theo ${GRAIN_LABEL[grain].toLowerCase()}`}
            note={`Gộp toàn bộ ticket của ${ROLE_LABELS[role].title}. Đường đứt nét = cùng mốc ở kỳ trước.`}
            right={<ChipLinks active={grain} items={(["day", "week", "month"] as Grain[]).map((g) => ({ key: g, label: GRAIN_LABEL[g], href: hrefWith("/team", sp, { grain: g }) }))} />}
          />
          <div className="mb-3">
            <ChipLinks active={metricKey} items={ROLE_METRICS[role].map((k) => ({ key: k, label: perfMetric(k).label, href: hrefWith("/team", sp, { metric: k === "score" ? null : k }) }))} />
          </div>
          <TrendChart
            data={chartData}
            series={[
              { key: "team", label: `Kỳ này · team ${ROLE_LABELS[role].short}`, color: "#9a6bff" },
              ...(q.prev ? [{ key: "prev", label: "Kỳ trước", color: "rgba(231,228,245,0.5)", dashed: true }] : []),
            ]}
            format={metric.format}
            sampleKey="sample"
          />
        </Panel>
        <Panel className="p-4 sm:p-5">
          <PanelTitle title="Điểm chất lượng được tính thế nào" note={`Điểm team: ${teamScore.score == null ? "—" : Math.round(teamScore.score)}${prevTeamScore != null ? ` (kỳ trước ${Math.round(prevTeamScore)})` : ""}`} />
          <ScoreBreakdown result={teamScore} />
        </Panel>
      </div>

      <Panel className="overflow-hidden">
        <div className="px-4 pt-4 sm:px-5">
          <PanelTitle
            title={`Xếp hạng ${ROLE_LABELS[role].title} (${rows.length} người)`}
            note={`Xếp theo Điểm chất lượng; người có dưới ${MIN_SAMPLE} ticket xếp cuối vì chưa đủ mẫu. Bấm tên để xem chi tiết. ${ROLE_LABELS[role].who}.`}
          />
        </div>
        {ranked.length ? (
          <div className="pf-scroll overflow-x-auto">
            <table className="w-full min-w-[1080px] border-collapse text-left">
              <thead>
                <tr className="border-y border-pf-border text-[11px] uppercase tracking-[0.06em] text-pf-faint">
                  <th className="px-3 py-3 font-semibold">#</th>
                  <th className="px-3 py-3 font-semibold">{ROLE_LABELS[role].title}</th>
                  <th className="px-3 py-3 text-right font-semibold">Điểm</th>
                  <th className="px-3 py-3 font-semibold">Xu hướng điểm</th>
                  <th className="px-3 py-3 text-right font-semibold">Ticket</th>
                  {metricsCols.map((k) => (
                    <th key={k} className="whitespace-nowrap px-3 py-3 text-right font-semibold">
                      {perfMetric(k).label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ranked.map((r, i) => {
                  const small = r.tickets < MIN_SAMPLE;
                  const d = r.score.score != null && r.prevScore != null ? r.score.score - r.prevScore : null;
                  return (
                    <tr key={r.name} className={cx("border-b border-pf-border/60 text-[12.5px] last:border-0 hover:bg-pf-card/60", small && "opacity-55")}>
                      <td className="tabular px-3 py-2.5 text-pf-faint">{small ? "–" : i + 1}</td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <Link href={personHref(r.name)} className="font-semibold text-white hover:underline">
                          {r.name}
                        </Link>
                        {small && <span className="ml-1.5 text-[11px] text-pf-faint">ít mẫu</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right">
                        <ScoreBadge value={r.score.score} />
                        {d != null && (
                          <span className="ml-1.5">
                            <Delta delta={d} tone={d > 0 ? "good" : d < 0 ? "bad" : "neutral"} text={`${Math.abs(Math.round(d))}`} size="xs" />
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <Sparkline values={r.trend} />
                      </td>
                      <td className="tabular px-3 py-2.5 text-right text-pf-body">{r.tickets}</td>
                      {metricsCols.map((k) => (
                        <td key={k} className="tabular whitespace-nowrap px-3 py-2.5 text-right text-pf-body">
                          {fmtPerf(r.metrics[k], perfMetric(k).format)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text={`Không có ticket ${ROLE_LABELS[role].title} trong khoảng này.`} />
        )}
      </Panel>

      <p className="text-[11.5px] text-pf-faint">
        Thành phần điểm {ROLE_LABELS[role].short}: {scoreComponents(role).map((c) => `${c.label} ${c.weight}%`).join(" · ")}. Thành phần chưa có dữ liệu (sheet thiếu cột) được bỏ qua và chia lại trọng số.
      </p>
    </div>
  );
}
