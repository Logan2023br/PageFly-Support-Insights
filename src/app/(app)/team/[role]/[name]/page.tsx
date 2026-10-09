import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ThumbsDown, ThumbsUp } from "lucide-react";
import { earliestDay, getDataset } from "@/lib/data";
import { countBy, formatDelta, judge } from "@/lib/metrics/compute";
import { autoGrain, GRAIN_LABEL, MIN_SAMPLE, people, perfMetric, peopleOf, qualityScore, ROLE_LABELS, ROLE_METRICS, series, ticketsOf, type Grain, type PerfRole } from "@/lib/metrics/performance";
import { hrefWith, parseQuery, periodLabel, selectTickets, type SearchParams } from "@/lib/query";
import { FilterBar } from "@/components/filters/filter-bar";
import { TrendChart } from "@/components/charts/charts";
import { BarList } from "@/components/charts/bar-list";
import { MiniTable } from "@/components/tickets/mini-table";
import { ChipLinks, fmtPerf, ScoreBadge, ScoreBreakdown } from "@/components/perf/perf-ui";
import { ReviewMissedPanel } from "@/components/perf/review-missed";
import { ButtonLink, cx, Delta, Empty, InlineNote, PageHeader, PageSkeleton, Panel, PanelTitle } from "@/components/ui";

export default function Page(props: PageProps<"/team/[role]/[name]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Person params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Person({ params, searchParams }: { params: Promise<{ role: string; name: string }>; searchParams: Promise<SearchParams> }) {
  const { role: roleParam, name: rawName } = await params;
  if (roleParam !== "fl" && roleParam !== "ts") notFound();
  const role = roleParam as PerfRole;
  const name = decodeURIComponent(rawName);
  const sp = await searchParams;
  const ds = await getDataset();
  const q = parseQuery(sp, { earliestDay: earliestDay(ds) });

  const teamCur = ticketsOf(selectTickets(ds.tickets, q), role);
  const teamPrev = q.prev ? ticketsOf(selectTickets(ds.tickets, q, q.prev), role) : [];
  const mine = teamCur.filter((t) => peopleOf(t, role).includes(name));
  const minePrev = teamPrev.filter((t) => peopleOf(t, role).includes(name));
  const everExists = ticketsOf(ds.tickets, role, name).length > 0;
  if (!everExists) notFound();

  const grain = (["day", "week", "month"].includes(String(sp.grain)) ? sp.grain : autoGrain(q.period)) as Grain;
  const metricKey = ROLE_METRICS[role].includes(String(sp.metric)) ? String(sp.metric) : "score";
  const metric = perfMetric(metricKey);

  const score = qualityScore(mine, role);
  const teamScore = qualityScore(teamCur, role);
  const prevScore = minePrev.length ? qualityScore(minePrev, role).score : null;

  const ranking = people(teamCur, teamPrev, role, q.period, grain)
    .filter((r) => r.tickets >= MIN_SAMPLE)
    .sort((a, b) => (b.score.score ?? -1) - (a.score.score ?? -1));
  const rank = ranking.findIndex((r) => r.name === name);

  const mySeries = series(mine, q.period, grain, metricKey, role);
  const teamSeries = series(teamCur, q.period, grain, metricKey, role);
  const chartData = mySeries.map((pt, i) => ({ label: pt.label, me: pt.sample ? pt.value : null, team: teamSeries[i].value, sample: pt.sample }));

  const kpis = ROLE_METRICS[role].map((k) => {
    const m = perfMetric(k);
    const c = m.compute(mine, role);
    const p = minePrev.length ? m.compute(minePrev, role) : null;
    const t = m.compute(teamCur, role);
    return { m, value: c, team: t, change: judge({ key: k, label: m.label, format: m.format === "score" ? "count" : m.format, polarity: m.polarity, current: c, previous: p }) };
  });

  const parts = score.parts.filter((p) => p.score != null);
  const vsTeam = parts
    .map((p) => ({ ...p, diff: p.score! - (teamScore.parts.find((x) => x.key === p.key)?.score ?? p.score!) }))
    .sort((a, b) => b.diff - a.diff);
  const strengths = vsTeam.filter((p) => p.diff >= 3).slice(0, 3);
  const weaknesses = [...vsTeam].reverse().filter((p) => p.diff <= -3).slice(0, 3);

  const notes = mine.filter((t) => t.review_pic && role === "fl");
  const needImprove = notes.filter((t) => /cần cải thiện|chậm|chưa rõ/i.test(t.review_pic!));
  const scope = Object.fromEntries(["range", "from", "to", "cat"].flatMap((k) => (typeof sp[k] === "string" ? [[k, sp[k] as string]] : [])));
  const ticketsHref = hrefWith("/tickets", scope, role === "fl" ? { f_triggered_by: name } : { f_name_pic: name });
  const self = `/team/${role}/${encodeURIComponent(name)}`;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <PageHeader
        eyebrow={
          <Link href={hrefWith("/team", scope, { role: role === "fl" ? null : role })} className="inline-flex items-center gap-1 hover:text-pf-violet">
            <ChevronLeft size={12} /> Đội ngũ · {ROLE_LABELS[role].title}
          </Link>
        }
        title={name}
        subtitle={`${ROLE_LABELS[role].title} · ${periodLabel(q.period)} · ${mine.length} ticket${rank >= 0 ? ` · hạng ${rank + 1}/${ranking.length}` : ""}`}
        actions={
          <ButtonLink href={ticketsHref} variant="ghost">
            Xem tất cả ticket
          </ButtonLink>
        }
      />
      <FilterBar range={q.range} from={q.period.from} to={q.period.to} cat={q.cat} periodLabel={periodLabel(q.period)} prevLabel={null} showCompare={false} />

      {mine.length < MIN_SAMPLE && <InlineNote>Chỉ có {mine.length} ticket trong khoảng này, điểm và xếp hạng chưa đủ tin cậy. Thử chọn khoảng thời gian dài hơn.</InlineNote>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.2fr_repeat(4,1fr)]">
        <Panel className="relative overflow-hidden p-4">
          <div className="text-[12px] font-semibold text-pf-muted">Điểm chất lượng</div>
          <div className="mt-2 flex items-end gap-2">
            <ScoreBadge value={score.score} size="lg" />
            <span className="pb-0.5 text-[12px] text-pf-faint">/ 100 · team {teamScore.score == null ? "—" : Math.round(teamScore.score)}</span>
          </div>
          <div className="mt-2 text-[11.5px]">
            {score.score != null && prevScore != null ? (
              <span className="flex items-center gap-1.5">
                <Delta delta={score.score - prevScore} tone={score.score >= prevScore ? "good" : "bad"} text={`${Math.abs(Math.round(score.score - prevScore))} điểm`} />
                <span className="text-pf-faint">vs kỳ trước ({Math.round(prevScore)})</span>
              </span>
            ) : (
              <span className="text-pf-faint">Kỳ trước chưa có dữ liệu</span>
            )}
          </div>
        </Panel>
        {kpis
          .filter((k) => k.m.key !== "score")
          .slice(0, 4)
          .map(({ m, value, team, change }) => (
            <Panel key={m.key} className="p-4">
              <div className="text-[12px] font-semibold text-pf-muted">{m.label}</div>
              <div className="tabular mt-2 font-display text-[24px] font-bold leading-none tracking-[-0.03em] text-white">{fmtPerf(value, m.format)}</div>
              <div className="mt-2 grid gap-0.5 text-[11.5px]">
                {change.delta != null && <Delta delta={change.delta} tone={change.tone} text={formatDelta(change.delta, m.format === "score" ? "count" : m.format)} />}
                <span className="text-pf-faint">Team: {fmtPerf(team, m.format)}</span>
              </div>
            </Panel>
          ))}
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.6fr_1fr]">
        <Panel className="p-4 sm:p-5">
          <PanelTitle
            title={`${metric.label} theo ${GRAIN_LABEL[grain].toLowerCase()}: ${name} vs trung bình team`}
            note="Điểm có xu hướng đi lên là tiến bộ. Mốc không có ticket bị bỏ trống."
            right={<ChipLinks active={grain} items={(["day", "week", "month"] as Grain[]).map((g) => ({ key: g, label: GRAIN_LABEL[g], href: hrefWith(self, sp, { grain: g }) }))} />}
          />
          <div className="mb-3">
            <ChipLinks active={metricKey} items={ROLE_METRICS[role].map((k) => ({ key: k, label: perfMetric(k).label, href: hrefWith(self, sp, { metric: k === "score" ? null : k }) }))} />
          </div>
          <TrendChart
            data={chartData}
            series={[
              { key: "me", label: name, color: "#9a6bff" },
              { key: "team", label: `Trung bình team ${ROLE_LABELS[role].short}`, color: "rgba(231,228,245,0.55)", dashed: true },
            ]}
            format={metric.format}
            sampleKey="sample"
          />
        </Panel>
        <Panel className="p-4 sm:p-5">
          <PanelTitle title="Thành phần điểm" note="So với trung bình team" />
          <ScoreBreakdown result={score} team={teamScore} />
        </Panel>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Panel className="p-4 sm:p-5">
          <PanelTitle title="Điểm mạnh" icon={ThumbsUp} note="Thành phần cao hơn trung bình team ≥ 3 điểm" />
          {strengths.length ? (
            <ul className="grid gap-2">
              {strengths.map((s) => (
                <li key={s.key} className="flex items-center justify-between text-[12.5px]">
                  <span className="text-pf-body">{s.label}</span>
                  <span className="tabular font-semibold text-pf-success">+{Math.round(s.diff)} điểm so với team</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12.5px] text-pf-muted">Chưa có thành phần nào nổi trội so với team.</p>
          )}
        </Panel>
        <Panel className="p-4 sm:p-5">
          <PanelTitle title="Cần cải thiện" icon={ThumbsDown} note="Thành phần thấp hơn trung bình team ≥ 3 điểm" />
          {weaknesses.length ? (
            <ul className="grid gap-2">
              {weaknesses.map((s) => (
                <li key={s.key} className="flex items-center justify-between text-[12.5px]">
                  <span className="text-pf-body">{s.label}</span>
                  <span className="tabular font-semibold text-pf-danger">{Math.round(s.diff)} điểm so với team</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12.5px] text-pf-muted">Không có thành phần nào thấp hơn team đáng kể.</p>
          )}
        </Panel>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Panel className="p-4 sm:p-5">
          <PanelTitle title="Nhóm issue đã xử lý" />
          <BarList items={countBy(mine, (t) => t.category_issue)} />
        </Panel>
        <Panel className="p-4 sm:p-5">
          <PanelTitle title="Kết quả xử lý" />
          <BarList items={countBy(mine, (t) => t.resolution)} />
        </Panel>
        <Panel className="p-4 sm:p-5">
          <PanelTitle title="Mood khách: đầu → cuối" />
          <BarList items={countBy(mine, (t) => (t.derived.moodStart && t.derived.moodEnd ? `${t.derived.moodStart} → ${t.derived.moodEnd}` : t.derived.moodEnd))} />
        </Panel>
      </div>

      {role === "fl" && (
        <Panel className="p-4 sm:p-5">
          <PanelTitle title={`Nhận xét về PIC (review_pic) · ${notes.length}`} note={needImprove.length ? `${needImprove.length} nhận xét có ý cần cải thiện` : "Từ cột review_pic trong sheet"} />
          {notes.length ? (
            <ul className="pf-scroll grid max-h-[320px] gap-2 overflow-y-auto">
              {notes.slice(0, 40).map((t) => (
                <li key={t.id} className={cx("rounded-[12px] border px-3 py-2 text-[12.5px]", needImprove.includes(t) ? "border-pf-warn/35 bg-pf-warn/[.06]" : "border-pf-border")}>
                  <div className="text-pf-body">{t.review_pic}</div>
                  <Link href={hrefWith("/tickets", scope, { ticket: t.id, range: "all" })} className="mt-0.5 block text-[11px] text-pf-faint hover:text-pf-muted">
                    {t.issue_summary}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty text="Sheet chưa có cột review_pic hoặc chưa có nhận xét trong khoảng này." />
          )}
        </Panel>
      )}

      {role === "fl" && <ReviewMissedPanel tickets={mine} hrefFor={(t) => hrefWith("/tickets", scope, { metric: "review_missed", f_triggered_by: name, ticket: t.id })} />}

      <Panel className="p-4 sm:p-5">
        <PanelTitle
          title={`Ticket gần nhất · ${mine.length}`}
          right={
            <ButtonLink href={ticketsHref} variant="ghost">
              Mở trong Chi tiết
            </ButtonLink>
          }
        />
        <MiniTable tickets={mine} hrefFor={(t) => hrefWith("/tickets", scope, { ticket: t.id, ...(role === "fl" ? { f_triggered_by: name } : { f_name_pic: name }) })} limit={20} />
      </Panel>
    </div>
  );
}
