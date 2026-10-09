import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ChevronLeft, ExternalLink, HeartPulse, Rocket } from "lucide-react";
import { getDataset } from "@/lib/data";
import { formatDuration, formatVnDate, formatVnDateTime } from "@/lib/data/parse";
import { buildCustomers, SEGMENTS } from "@/lib/customers";
import { countBy } from "@/lib/metrics/compute";
import { hrefWith } from "@/lib/query";
import { BarList } from "@/components/charts/bar-list";
import { CAT_TONE, MOOD_TONE, PRIORITY_TONE, resolutionTone } from "@/components/tickets/mini-table";
import { Badge, ButtonLink, cx, PageHeader, PageSkeleton, Panel, PanelTitle } from "@/components/ui";

export default function Page(props: PageProps<"/customers/[domain]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CustomerDetail params={props.params} />
    </Suspense>
  );
}

async function CustomerDetail({ params }: { params: Promise<{ domain: string }> }) {
  const domain = decodeURIComponent((await params).domain);
  const ds = await getDataset();
  const tickets = ds.tickets.filter((t) => t.store_domain === domain);
  if (!tickets.length) notFound();
  const c = buildCustomers(ds.tickets, tickets, "0000-00-00", ds.loadedAt)[0];
  const seg = SEGMENTS[c.segment];
  const healthColor = c.health >= 75 ? "text-pf-success" : c.health >= 50 ? "text-pf-warn" : "text-pf-danger";

  const profile: [string, string][] = [
    ["Domain", c.domain],
    ["Plan PageFly", c.plan ?? "—"],
    ["Giá plan", c.price != null ? `$${c.price}/tháng` : "—"],
    ["Plan Shopify", c.shopifyPlan ?? "—"],
    ["Loại khách", c.typeUser ?? "—"],
    ["Quốc gia", c.country ?? "—"],
    ["Múi giờ", c.timezone ?? "—"],
    ["Slot tối đa", c.maxSlot == null ? "—" : c.maxSlot === Infinity ? "Không giới hạn" : String(c.maxSlot)],
    ["Tổng số trang", c.totalPages != null ? String(c.totalPages) : "—"],
    ["Trang đã publish", c.pagesPublished != null ? `${c.pagesPublished}${c.maxSlot && c.maxSlot !== Infinity ? ` / ${c.maxSlot} slot` : ""}` : "—"],
    ["Section đã publish", c.sectionsPublished != null ? String(c.sectionsPublished) : "—"],
    ["Mã giảm giá", c.discountCode ?? "—"],
    ["Thời gian dùng app", c.tenure ?? "—"],
    ["Ngày cài app", c.installAt ? formatVnDate(c.installAt) : "—"],
    ["Ngày gỡ app", c.uninstallAt ? formatVnDate(c.uninstallAt) : "Chưa gỡ"],
    ["Review App Store", c.appReview ?? "—"],
    ["Review Crisp", c.crispReview ?? "—"],
  ];

  const stats: [string, string, string?][] = [
    ["Tổng lần liên hệ", String(c.history.length)],
    ["Lần đầu", c.firstContact ? formatVnDate(c.firstContact) : "—"],
    ["Gần nhất", c.lastContact ? formatVnDate(c.lastContact) : "—"],
    ["Cách nhau TB", c.avgDaysBetween != null ? `${c.avgDaysBetween.toFixed(1)} ngày` : "—"],
    ["Chưa giải quyết", String(c.unresolved), c.unresolved ? "text-pf-warn" : undefined],
    ["Lần khách Angry", String(c.angry), c.angry ? "text-pf-danger" : undefined],
  ];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <PageHeader
        eyebrow={
          <Link href="/customers" className="inline-flex items-center gap-1 hover:text-pf-violet">
            <ChevronLeft size={12} /> Khách hàng
          </Link>
        }
        title={c.name ?? c.domain}
        subtitle={`${c.domain} · ${c.plan ?? "plan không rõ"}${c.price != null ? ` · $${c.price}/tháng` : ""}`}
        actions={
          <>
            <Badge tone={seg.tone}>{seg.label}</Badge>
            <ButtonLink href={hrefWith("/tickets", {}, { range: "all", q: c.domain })} variant="ghost">
              Xem trong Chi tiết
            </ButtonLink>
          </>
        }
      />

      <div className="grid gap-3 xl:grid-cols-[1fr_1.4fr]">
        <Panel className="p-4 sm:p-5">
          <PanelTitle title="Sức khoẻ khách" icon={HeartPulse} note={seg.hint} />
          <div className="flex items-end gap-2">
            <span className={cx("tabular font-display text-[40px] font-bold leading-none tracking-[-0.03em]", healthColor)}>{c.health}</span>
            <span className="pb-1 text-[12px] text-pf-faint">/ 100</span>
          </div>
          <div className="mt-3 h-[3px] rounded-full bg-pf-bg-deep">
            <div className={cx("h-full rounded-full", c.health >= 75 ? "bg-pf-success" : c.health >= 50 ? "bg-pf-warn" : "bg-pf-danger")} style={{ width: `${c.health}%` }} />
          </div>
          <ul className="mt-4 grid gap-1.5">
            {c.factors.length ? (
              c.factors.map((f) => (
                <li key={f.label} className="flex justify-between gap-3 text-[12.5px]">
                  <span className="text-pf-body">{f.label}</span>
                  <span className={cx("tabular font-semibold", f.points < 0 ? "text-pf-danger" : "text-pf-success")}>
                    {f.points > 0 ? "+" : ""}
                    {f.points}
                  </span>
                </li>
              ))
            ) : (
              <li className="text-[12.5px] text-pf-muted">Không có yếu tố rủi ro nào.</li>
            )}
          </ul>
          <p className="mt-3 text-[11px] text-pf-faint">Bắt đầu từ 100, trừ/cộng theo các yếu tố trên.</p>
        </Panel>

        <Panel className="p-4 sm:p-5">
          <PanelTitle title="Hồ sơ store" note="Lấy từ lần ghi gần nhất có dữ liệu" />
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {profile.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[130px_1fr] gap-2 text-[12.5px]">
                <dt className="text-pf-muted">{k}</dt>
                <dd className="min-w-0 break-words text-pf-body">{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {stats.map(([k, v, tone]) => (
          <Panel key={k} className="p-4">
            <div className="text-[12px] font-semibold text-pf-muted">{k}</div>
            <div className={cx("tabular mt-2 font-display text-[20px] font-bold leading-none tracking-[-0.02em]", tone ?? "text-white")}>{v}</div>
          </Panel>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Panel className="p-4 sm:p-5">
          <PanelTitle title="Cơ hội upsell" icon={Rocket} />
          {c.upsell ? (
            <p className="text-[13px] leading-relaxed text-pf-body">{c.upsell}</p>
          ) : (
            <p className="text-[12.5px] text-pf-muted">Chưa có tín hiệu upsell trong 3 lần liên hệ gần nhất.</p>
          )}
          {c.upsell && c.segment !== "upsell" && <p className="mt-2 text-[11.5px] text-pf-warn">Khách đang ở nhóm “{seg.label}”, nên xử lý xong vấn đề trước khi đề xuất nâng cấp.</p>}
        </Panel>
        <Panel className="p-4 sm:p-5">
          <PanelTitle title="Việc cần làm tiếp" icon={AlertTriangle} note="next_action của lần liên hệ gần nhất" />
          <p className="text-[13px] leading-relaxed text-pf-body">{c.last.next_action ?? "—"}</p>
          {c.churn && <p className="mt-2 text-[12px] font-semibold text-pf-danger">Lần liên hệ cuối có churn risk.</p>}
        </Panel>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Panel className="p-4 sm:p-5">
          <PanelTitle title="Loại ticket" />
          <BarList items={countBy(c.history, (t) => t.category_ticket)} />
        </Panel>
        <Panel className="p-4 sm:p-5">
          <PanelTitle title="Nhóm issue" />
          <BarList items={countBy(c.history, (t) => t.category_issue)} />
        </Panel>
        <Panel className="p-4 sm:p-5">
          <PanelTitle title="Người đã hỗ trợ" />
          <BarList items={countBy(c.history, (t) => t.name_pic.length ? t.name_pic : t.triggered_by)} />
        </Panel>
      </div>

      <Panel className="p-4 sm:p-5">
        <PanelTitle title={`Lịch sử liên hệ · ${c.history.length} lần`} note="Mới nhất ở trên. Mỗi lần là một session Crisp." />
        <ol className="relative grid gap-3 border-l border-pf-border pl-5">
          {c.history.map((t, i) => (
            <li key={t.id} className="relative">
              <span className={cx("absolute -left-[26px] top-3 size-2.5 rounded-full ring-4 ring-pf-bg", i === 0 ? "bg-pf-primary-hi" : "bg-pf-border-hi")} />
              <div className="rounded-[14px] border border-pf-border bg-white/[.02] p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="tabular text-[12px] font-semibold text-white">{formatVnDateTime(t.recap_at_vn)}</span>
                    {t.category_ticket && <Badge tone={CAT_TONE[t.category_ticket] ?? "neutral"}>{t.category_ticket}</Badge>}
                    {t.category_issue && <Badge>{t.category_issue}</Badge>}
                    {t.priority && t.priority !== "Normal" && <Badge tone={PRIORITY_TONE[t.priority]}>{t.priority}</Badge>}
                    {t.derived.recapCount > 1 && <span className="text-[11px] text-pf-faint">recap {t.derived.recapCount} lần</span>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Link href={hrefWith("/tickets", {}, { range: "all", ticket: t.id, q: c.domain })} className="rounded-[8px] px-2 py-1 text-[11.5px] font-semibold text-pf-muted hover:bg-pf-bg-deep hover:text-white">
                      Chi tiết
                    </Link>
                    {t.ticket_url && (
                      <a href={t.ticket_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-[8px] px-2 py-1 text-[11.5px] font-semibold text-pf-primary-hi hover:bg-pf-bg-deep">
                        Crisp <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-[13px] text-pf-body">{t.issue_summary ?? "—"}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-pf-muted">
                  <span>
                    PIC: <span className="text-pf-body">{t.name_pic.join(", ") || t.triggered_by || "—"}</span>
                    {t.role_pic.length > 0 && <span className="text-pf-faint"> ({t.role_pic.join(" → ")})</span>}
                  </span>
                  <span className="flex items-center gap-1">Kết thúc: {t.resolution ? <Badge tone={resolutionTone(t.resolution)}>{t.resolution}</Badge> : "—"}</span>
                  {t.derived.moodEnd && (
                    <span className="flex items-center gap-1">
                      Mood: <Badge tone={MOOD_TONE[t.derived.moodEnd]}>{t.derived.moodStart && t.derived.moodStart !== t.derived.moodEnd ? `${t.derived.moodStart} → ${t.derived.moodEnd}` : t.derived.moodEnd}</Badge>
                    </span>
                  )}
                  {t.csat && <span>CSAT: <span className="text-pf-body">{t.csat}</span></span>}
                  {t.total_time_handle != null && <span>Handle: <span className="tabular text-pf-body">{formatDuration(t.total_time_handle)}</span></span>}
                  {t.churn_risk && <Badge tone="danger">Churn risk</Badge>}
                  {t.derived.upsell && <Badge tone="violet">Upsell</Badge>}
                </div>
                {(t.review_ticket || t.root_cause) && (
                  <p className="mt-2 text-[11.5px] leading-relaxed text-pf-faint">
                    {t.root_cause && <>Nguyên nhân: {t.root_cause}. </>}
                    {t.review_ticket}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}
