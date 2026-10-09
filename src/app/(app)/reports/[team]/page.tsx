import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronDown, ChevronLeft, Download, ExternalLink, Hourglass, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { getDataset } from "@/lib/data";
import type { Ticket } from "@/lib/data/types";
import { formatVnDate, vnDayKey } from "@/lib/data/parse";
import { countBy, formatDelta, formatValue } from "@/lib/metrics/compute";
import { MIN_SAMPLE, people, perfMetric, type PerfRole } from "@/lib/metrics/performance";
import { actionItems } from "@/lib/alerts";
import { buildReport, devBacklog, GRAIN_LABELS, reviewFunnel, storesWhere, TEAMS, type Report, type ReportGrain, type ReportRow, type ReportTeam } from "@/lib/reports";
import { hrefWith } from "@/lib/query";
import { AiPanel } from "@/components/ai/ai-panel";
import { PeriodTrend } from "@/components/charts/charts";
import { BarList } from "@/components/charts/bar-list";
import { ActionPanel } from "@/components/dashboard/action-panel";
import { ReviewMissedPanel } from "@/components/perf/review-missed";
import { fmtPerf, ScoreBadge } from "@/components/perf/perf-ui";
import { resolutionTone } from "@/components/tickets/mini-table";
import { AlertBadge, Badge, buttonClass, cx, Delta, Empty, PageHeader, PageSkeleton, Panel, PanelTitle, Skeleton } from "@/components/ui";
import { ArchiveSection } from "@/components/reports/archive-section";
import { ScrollToArchive } from "@/components/reports/scroll-to-archive";

export default function Page(props: PageProps<"/reports/[team]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ReportPage params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

const ticketHref = (t: Ticket) => `/tickets?range=all&ticket=${encodeURIComponent(t.id)}`;

async function ReportPage({ params, searchParams }: { params: Promise<{ team: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { team: teamParam } = await params;
  if (!(teamParam in TEAMS)) notFound();
  const team = teamParam as ReportTeam;
  const sp = await searchParams;
  const grain = (typeof sp.grain === "string" && sp.grain in GRAIN_LABELS ? sp.grain : "week") as ReportGrain;
  const ds = await getDataset();
  const today = vnDayKey(ds.loadedAt);
  const report = buildReport(ds.tickets, team, grain, today);
  const alerts = report.rows.filter((r) => r.change.alert);
  // Phạm vi cho link sang trang Chi tiết / Đội ngũ: đúng kỳ gần nhất của báo cáo.
  const scope = { range: "custom", from: report.focus.from, to: report.focus.to > today ? today : report.focus.to };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <PageHeader
        eyebrow={
          <Link href="/reports" className="inline-flex items-center gap-1 hover:text-pf-violet">
            <ChevronLeft size={12} /> Báo cáo
          </Link>
        }
        title={`Báo cáo ${TEAMS[team].title}`}
        subtitle={`${TEAMS[team].description} · Dành cho ${TEAMS[team].audience}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <ScrollToArchive />
            <a href={`/api/export?kind=report&team=${team}&grain=${grain}`} className={buttonClass("primary", "sm")}>
              <Download size={14} strokeWidth={1.75} /> Xuất Excel
            </a>
          </div>
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
          {report.compared ? `So sánh: ${report.compared.current} với ${report.compared.previous}` : "Chưa đủ kỳ để so sánh"} ·{" "}
          <span className={alerts.length ? "font-semibold text-pf-danger" : ""}>{alerts.length} chỉ số cần chú ý</span>
        </p>
      </div>

      <HeadlineCards report={report} />

      {team === "cs" && <CsSections report={report} all={ds.tickets} scope={scope} />}
      {team === "dev" && <DevSections report={report} all={ds.tickets} today={today} scope={scope} />}
      {team === "marketing" && <MarketingSections report={report} scope={scope} />}

      <AiPanel kind={`report-${team}` as "report-cs"} params={{ grain }} title={`Nhận định AI cho báo cáo ${TEAMS[team].title}`} />

      <MetricsTable report={report} />

      <Suspense fallback={<Skeleton className="h-[260px] rounded-[20px]" />}>
        <ArchiveSection team={team} />
      </Suspense>
    </div>
  );
}

// ── Thẻ chỉ số chính ────────────────────────────────────────────────

function HeadlineCards({ report }: { report: Report }) {
  const i = report.headlineIndex;
  const period = report.periods[i];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
      {report.headline.map((row) => (
        <HeadlineCard key={row.def.key} row={row} index={i} periodLabel={period.label} report={report} />
      ))}
    </div>
  );
}

function HeadlineCard({ row, index, periodLabel, report }: { row: ReportRow; index: number; periodLabel: string; report: Report }) {
  const c = row.change;
  return (
    <Panel className={cx("p-4", c.alert === "critical" && "border-pf-danger/35")}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[12px] font-semibold text-pf-muted">{row.def.label}</span>
        <AlertBadge level={c.alert} />
      </div>
      <div className="tabular mt-2 font-display text-[26px] font-bold leading-none tracking-[-0.03em] text-white">{formatValue(row.values[index], row.def.format)}</div>
      <div className="mt-1.5 flex min-h-[18px] flex-wrap items-center gap-x-1.5 text-[11.5px]">
        {c.delta != null ? <Delta delta={c.delta} tone={c.tone} text={formatDelta(c.delta, row.def.format)} /> : null}
        <span className="text-pf-faint">{c.delta != null ? `${periodLabel} vs kỳ trước` : `${periodLabel} · kỳ trước chưa có dữ liệu`}</span>
      </div>
      <div className="-mx-1 mt-1.5">
        <PeriodTrend data={report.periods.map((p, k) => ({ label: p.label, v: row.values[k] }))} format={row.def.format} highlight={index} />
      </div>
    </Panel>
  );
}

// ── CS ───────────────────────────────────────────────────────────────

function CsSections({ report, all, scope }: { report: Report; all: Ticket[]; scope: Record<string, string> }) {
  const p = report.focus;
  const idx = report.periods.length - 1;
  const prevPeriod = idx > 0 ? report.periods[idx - 1] : null;
  const prev = prevPeriod ? all.filter((t) => t.derived.dayKey && t.derived.dayKey >= prevPeriod.from && t.derived.dayKey <= prevPeriod.to) : [];
  const cur = report.focusTickets;
  return (
    <>
      <SectionTitle title={`Hiệu suất đội ngũ · ${p.label}`} note="Xếp theo Điểm chất lượng. Bấm tên để xem chi tiết người đó trong Đội ngũ." />
      <div className="grid gap-3">
        <PeopleTable role="fl" cur={cur} prev={prev} report={report} scope={scope} cols={["first_reply", "resolved_rate", "csat_avg", "review_asked_rate", "review_missed"]} />
        <PeopleTable role="ts" cur={cur} prev={prev} report={report} scope={scope} cols={["join_wait", "handle_ts", "resolved_rate", "csat_avg"]} />
      </div>
      <SectionTitle title={`Cần theo dõi · ${p.label}`} />
      <div className="grid gap-3 xl:grid-cols-2">
        <ActionPanel items={actionItems(cur)} hrefFor={(id) => `/tickets?range=all&ticket=${encodeURIComponent(id)}`} allHref={hrefWith("/tickets", scope, { f_attention: "Yes" })} limit={6} />
        <ReviewMissedPanel tickets={cur} groupByFl hrefFor={ticketHref} personHref={(n) => hrefWith(`/team/fl/${encodeURIComponent(n)}`, scope, {})} />
      </div>
    </>
  );
}

function PeopleTable({ role, cur, prev, report, scope, cols }: { role: PerfRole; cur: Ticket[]; prev: Ticket[]; report: Report; scope: Record<string, string>; cols: string[] }) {
  const rows = people(cur, prev, role, report.focus, "week").sort((a, b) => Number(b.tickets >= MIN_SAMPLE) - Number(a.tickets >= MIN_SAMPLE) || (b.score.score ?? -1) - (a.score.score ?? -1));
  const title = role === "fl" ? "Front-line" : "Technical";
  return (
    <Panel className="overflow-hidden">
      <div className="px-4 pt-4 sm:px-5">
        <PanelTitle title={`${title} · ${rows.length} người`} right={<Link href={hrefWith("/team", scope, role === "ts" ? { role: "ts" } : {})} className="text-[12px] font-semibold text-pf-primary-hi hover:underline">Mở Đội ngũ</Link>} />
      </div>
      {rows.length ? (
        <DataTable
          minWidth={520}
          head={[title, "Điểm", "Ticket", ...cols.map((k) => perfMetric(k).label)]}
          rows={rows.map((r) => [
            <Link key="n" href={hrefWith(`/team/${role}/${encodeURIComponent(r.name)}`, scope, {})} className={cx("font-semibold text-white hover:underline", r.tickets < MIN_SAMPLE && "opacity-60")}>
              {r.name}
            </Link>,
            <ScoreBadge key="s" value={r.score.score} />,
            r.tickets,
            ...cols.map((k) => fmtPerf(r.metrics[k], perfMetric(k).format)),
          ])}
        />
      ) : (
        <Empty text="Kỳ này chưa có dữ liệu." />
      )}
    </Panel>
  );
}

// ── Dev ──────────────────────────────────────────────────────────────

function DevSections({ report, all, today, scope }: { report: Report; all: Ticket[]; today: string; scope: Record<string, string> }) {
  const backlog = devBacklog(all, today);
  const cur = report.focusTickets;
  const issues = cur.filter((t) => t.category_ticket === "Issue");
  const top = report.tables.find((t) => t.key === "dev_top");
  const devPic = report.tables.find((t) => t.key === "dev_pic");
  return (
    <>
      <SectionTitle title={`Backlog đang chờ Dev · ${backlog.length} ticket`} note="Toàn bộ ticket đang Đợi dev check / Ticket cần dev note, cũ nhất lên đầu (không phụ thuộc kỳ)." />
      <Panel className="overflow-hidden">
        {backlog.length ? (
          <DataTable
            minWidth={860}
            head={["Chờ", "Store", "Issue", "Nhóm", "FL", "Kết quả", ""]}
            rows={backlog.slice(0, 40).map(({ ticket: t, ageDays }) => [
              <span key="a" className={cx("tabular inline-flex items-center gap-1 font-semibold", (ageDays ?? 0) >= 7 ? "text-pf-danger" : (ageDays ?? 0) >= 3 ? "text-pf-warn" : "text-pf-body")}>
                <Hourglass size={12} strokeWidth={1.75} /> {ageDays ?? "—"} ngày
              </span>,
              <span key="s" className="font-semibold text-white">{t.store_name ?? t.store_domain ?? "—"}</span>,
              <Link key="i" href={ticketHref(t)} className="line-clamp-2 max-w-[340px] text-pf-body hover:text-white hover:underline">
                {t.issue_summary ?? "—"}
              </Link>,
              t.category_issue ?? "—",
              t.triggered_by ?? "—",
              <Badge key="r" tone={resolutionTone(t.resolution)}>{t.resolution}</Badge>,
              <CrispLink key="c" url={t.ticket_url} />,
            ])}
          />
        ) : (
          <Empty text="Không có ticket nào đang chờ Dev." />
        )}
      </Panel>

      <SectionTitle title={`Lỗi theo khu vực · ${report.focus.label}`} note={`${issues.length} issue trong kỳ. Bấm để mở danh sách.`} />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Panel className="p-4 sm:p-5">
          <PanelTitle title="Khu vực issue" />
          <BarList items={countBy(issues, (t) => t.derived.issueArea)} hrefFor={(k) => hrefWith("/tickets", scope, { cat: "Issue", f_issue_area: k })} emptyText="Không có issue" />
        </Panel>
        <Panel className="p-4 sm:p-5">
          <PanelTitle title="Nhóm issue chi tiết" />
          <BarList items={countBy(issues, (t) => t.category_issue).slice(0, 12)} hrefFor={(k) => hrefWith("/tickets", scope, { cat: "Issue", f_category_issue: k })} emptyText="Không có issue" />
        </Panel>
        <Panel className="p-4 sm:p-5">
          <PanelTitle title="Nguyên nhân gốc" />
          <BarList items={countBy(issues, (t) => t.root_cause)} hrefFor={(k) => hrefWith("/tickets", scope, { cat: "Issue", f_root_cause: k })} emptyText="Không có issue" />
        </Panel>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.6fr_1fr]">
        {top && <TablePanel title={top.title} columns={top.columns} rows={top.rows} />}
        <Panel className="p-4 sm:p-5">
          <PanelTitle title="Trang gặp vấn đề" />
          <BarList items={countBy(issues, (t) => t.page_issue)} hrefFor={(k) => hrefWith("/tickets", scope, { cat: "Issue", f_page_issue: k })} emptyText="Không có issue" />
        </Panel>
      </div>
      {devPic && devPic.rows.length > 0 && <TablePanel title={devPic.title} columns={devPic.columns} rows={devPic.rows} />}
    </>
  );
}

// ── Marketing ────────────────────────────────────────────────────────

function MarketingSections({ report, scope }: { report: Report; scope: Record<string, string> }) {
  const cur = report.focusTickets;
  const churn = storesWhere(cur, (t) => t.churn_risk === true);
  const upsell = storesWhere(cur, (t) => t.derived.upsell && !t.churn_risk);
  const funnel = reviewFunnel(cur);
  const improve = report.tables.find((t) => t.key === "improve");
  const feedback = report.tables.find((t) => t.key === "feedback");
  const third = report.tables.find((t) => t.key === "third_party");
  const contacted = storesWhere(cur, () => true);
  const atRisk = churn.reduce((s, t) => s + (t.pagefly_price ?? 0), 0);

  return (
    <>
      <SectionTitle title={`Giữ chân & tăng trưởng · ${report.focus.label}`} note="Đếm theo store (không trùng), lấy ticket gần nhất của mỗi store." />
      <div className="grid gap-3 xl:grid-cols-2">
        <Panel className="overflow-hidden">
          <div className="px-4 pt-4 sm:px-5">
            <PanelTitle icon={TrendingDown} title={`Store có nguy cơ rời bỏ · ${churn.length}`} note={churn.length ? `Doanh thu plan rủi ro ${formatValue(atRisk, "money")}/tháng` : undefined} right={<Link href={hrefWith("/tickets", scope, { metric: "churn" })} className="text-[12px] font-semibold text-pf-primary-hi hover:underline">Xem ticket</Link>} />
          </div>
          {churn.length ? (
            <DataTable
              minWidth={620}
              head={["Store", "Plan", "Vấn đề", "Hành động tiếp theo", ""]}
              rows={churn.map((t) => [
                <StoreCell key="s" t={t} />,
                <PlanCell key="p" t={t} />,
                <span key="i" className="line-clamp-2 max-w-[220px]">{t.issue_summary ?? "—"}</span>,
                <span key="n" className="line-clamp-2 max-w-[220px] text-pf-muted">{t.next_action ?? "—"}</span>,
                <CrispLink key="c" url={t.ticket_url} />,
              ])}
            />
          ) : (
            <Empty text="Không có store nào có churn risk trong kỳ." />
          )}
        </Panel>
        <Panel className="overflow-hidden">
          <div className="px-4 pt-4 sm:px-5">
            <PanelTitle icon={TrendingUp} title={`Cơ hội upsell · ${upsell.length} store`} note="Không tính store đang có churn risk" right={<Link href={hrefWith("/tickets", scope, { metric: "upsell" })} className="text-[12px] font-semibold text-pf-primary-hi hover:underline">Xem ticket</Link>} />
          </div>
          {upsell.length ? (
            <DataTable
              minWidth={560}
              head={["Store", "Plan", "Gợi ý upsell", "FL", ""]}
              rows={upsell.map((t) => [<StoreCell key="s" t={t} />, <PlanCell key="p" t={t} />, <span key="u" className="line-clamp-2 max-w-[260px]">{t.upsell_signal ?? "—"}</span>, t.triggered_by ?? "—", <CrispLink key="c" url={t.ticket_url} />])}
            />
          ) : (
            <Empty text="Chưa có cơ hội upsell trong kỳ." />
          )}
        </Panel>
      </div>

      <SectionTitle title={`Review · ${report.focus.label}`} />
      <div className="grid gap-3 xl:grid-cols-[1fr_1.4fr]">
        <Panel className="p-4 sm:p-5">
          <PanelTitle icon={Sparkles} title="Phễu mời review" note="Từ ticket đủ điều kiện (review_verdict = QUALIFIED)" />
          <Funnel
            steps={[
              { label: "Đủ điều kiện mời review", value: funnel.qualified, tone: "violet" },
              { label: "FL đã hỏi review", value: funnel.asked, tone: "success" },
              { label: "Khách đã có review từ trước", value: funnel.already, tone: "neutral" },
              { label: "Bỏ lỡ: chưa hỏi", value: funnel.missed, tone: "danger" },
            ]}
            base={funnel.qualified}
          />
          <p className="mt-3 text-[11.5px] text-pf-faint">Review mới ghi nhận sau support: {funnel.newReviews}</p>
        </Panel>
        <ReviewMissedPanel tickets={cur} groupByFl hrefFor={ticketHref} personHref={(n) => hrefWith(`/team/fl/${encodeURIComponent(n)}`, scope, {})} />
      </div>

      <SectionTitle title={`Tiếng nói khách hàng · ${report.focus.label}`} />
      <div className="grid gap-3 xl:grid-cols-2">
        {improve && <TablePanel title={improve.title} columns={improve.columns} rows={improve.rows} />}
        {feedback && <TablePanel title={feedback.title} columns={feedback.columns} rows={feedback.rows} />}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {third && <TablePanel title={third.title} columns={third.columns} rows={third.rows} />}
        <Panel className="p-4 sm:p-5">
          <PanelTitle title={`Plan của store liên hệ · ${contacted.length}`} />
          <BarList items={countBy(contacted, (t) => t.pagefly_plan)} emptyText="Chưa có dữ liệu" />
        </Panel>
        <Panel className="p-4 sm:p-5">
          <PanelTitle title="Quốc gia" />
          <BarList items={countBy(contacted, (t) => t.country).slice(0, 10)} emptyText="Chưa có dữ liệu quốc gia" />
        </Panel>
      </div>
    </>
  );
}

function Funnel({ steps, base }: { steps: { label: string; value: number; tone: "violet" | "success" | "neutral" | "danger" }[]; base: number }) {
  const color = { violet: "bg-pf-primary", success: "bg-pf-success", neutral: "bg-pf-muted/60", danger: "bg-pf-danger" };
  return (
    <ul className="grid gap-2.5">
      {steps.map((s) => (
        <li key={s.label} className="grid gap-1">
          <div className="flex justify-between text-[12px]">
            <span className="text-pf-body">{s.label}</span>
            <span className="tabular font-semibold text-white">
              {s.value}
              {base > 0 && s.label !== steps[0].label && <span className="ml-1 font-normal text-pf-faint">({Math.round((s.value / base) * 100)}%)</span>}
            </span>
          </div>
          <div className="h-2 rounded-full bg-pf-bg-deep">
            <div className={cx("h-full rounded-full", color[s.tone])} style={{ width: `${base ? Math.max(2, (s.value / base) * 100) : 0}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── Bảng số liệu đầy đủ theo kỳ ─────────────────────────────────────

function MetricsTable({ report }: { report: Report }) {
  const sections = [...new Set(report.rows.map((r) => r.def.section))];
  return (
    <details className="group rounded-[20px] border border-pf-border bg-pf-card/50">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="text-[13px] font-semibold text-white">
          Bảng số liệu đầy đủ theo kỳ <span className="font-normal text-pf-muted">· {report.rows.length} chỉ số · giống file Excel</span>
        </span>
        <ChevronDown size={16} strokeWidth={1.75} className="text-pf-faint transition-transform group-open:rotate-180" />
      </summary>
      <div className="pf-scroll overflow-x-auto border-t border-pf-border">
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
    </details>
  );
}

// ── Thành phần dùng chung ───────────────────────────────────────────

function SectionTitle({ title, note }: { title: string; note?: string }) {
  return (
    <div className="-mb-2 mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <h2 className="font-display text-[16px] font-semibold tracking-[-0.01em] text-white">{title}</h2>
      {note && <p className="text-[12px] text-pf-muted">{note}</p>}
    </div>
  );
}

function DataTable({ head, rows, minWidth }: { head: string[]; rows: ReactNode[][]; minWidth: number }) {
  return (
    <div className="pf-scroll max-h-[460px] overflow-auto">
      <table className="w-full border-collapse text-left" style={{ minWidth }}>
        <thead className="sticky top-0 z-10 bg-pf-bg-alt">
          <tr className="border-y border-pf-border text-[11px] uppercase tracking-[0.06em] text-pf-faint">
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-3 py-2.5 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-pf-border/60 text-[12.5px] last:border-0 hover:bg-pf-card/60">
              {row.map((cell, ci) => (
                <td key={ci} className="tabular px-3 py-2.5 align-top text-pf-body">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TablePanel({ title, columns, rows }: { title: string; columns: string[]; rows: (string | number)[][] }) {
  return (
    <Panel className="overflow-hidden">
      <div className="px-4 pt-4 sm:px-5">
        <PanelTitle title={title} note={`${rows.length} dòng`} />
      </div>
      {rows.length ? <DataTable minWidth={Math.max(360, columns.length * 110)} head={columns} rows={rows} /> : <Empty text="Kỳ này chưa có dữ liệu." />}
    </Panel>
  );
}

function StoreCell({ t }: { t: Ticket }) {
  return (
    <Link href={`/customers/${encodeURIComponent(t.store_domain ?? "")}`} className="grid gap-0.5 hover:underline">
      <span className="font-semibold text-white">{t.store_name ?? t.store_domain}</span>
      <span className="text-[11px] text-pf-faint">{t.time_uninstall ? `Đã gỡ app ${formatVnDate(t.time_uninstall)}` : t.store_domain}</span>
    </Link>
  );
}

function PlanCell({ t }: { t: Ticket }) {
  return (
    <span className="whitespace-nowrap">
      {t.pagefly_plan ?? "—"}
      {t.pagefly_price != null && <span className="text-pf-faint"> · ${t.pagefly_price}</span>}
    </span>
  );
}

function CrispLink({ url }: { url: string | null }) {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 whitespace-nowrap text-[11.5px] text-pf-primary-hi hover:underline">
      Crisp <ExternalLink size={11} strokeWidth={1.75} />
    </a>
  );
}
