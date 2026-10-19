import Link from "next/link";
import { ChevronDown, ExternalLink, Info, Repeat2, Sparkles, Store } from "lucide-react";
import { formatVnDate } from "@/lib/data/parse";
import { bucketDaily, itemOpen, REPEAT_MIN, type RepeatAnalysis, type RepeatIssue, type TicketIssue } from "@/lib/repeat/analysis";
import { RepeatDailyChart } from "@/components/charts/charts";
import { BarList } from "@/components/charts/bar-list";
import { Badge, cx, Empty, Panel, PanelTitle } from "@/components/ui";

export type RepeatView = "tickets" | "stores";

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
const money = (v: number) => `$${Math.round(v).toLocaleString("vi-VN")}`;
const dm = (k: string | null) => (k ? `${k.slice(8, 10)}/${k.slice(5, 7)}` : "—");

/**
 * Issue lặp lại trong khoảng đang lọc: 2 ô lớn (ticket / khách) — bấm để mở phân tích chi tiết.
 * `hrefFor(patch)` tạo link giữ nguyên bộ lọc hiện tại.
 */
export function RepeatIssues({
  a,
  view,
  category,
  periodLabel,
  hrefFor,
  grouping,
}: {
  a: RepeatAnalysis;
  view: RepeatView | null;
  category: string | null;
  periodLabel: string;
  hrefFor: (patch: Record<string, string | null>) => string;
  /** Còn bao nhiêu ticket AI chưa gom nhóm. */
  grouping: number;
}) {
  const activeCat = view === "tickets" ? (category && a.categories.some((c) => c.category === category) ? category : (a.categories[0]?.category ?? null)) : null;

  return (
    <section id="issue-lap-lai" className="grid scroll-mt-6 gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-display text-[16px] font-semibold text-white">
            <Repeat2 size={17} strokeWidth={1.75} className="text-pf-primary-hi" /> Issue lặp lại
            <span className="group/rinfo relative">
              <Info size={13} strokeWidth={1.75} className="text-pf-faint group-hover/rinfo:text-pf-primary-hi" />
              <span className="pointer-events-none invisible absolute bottom-full left-0 z-40 mb-2 w-[min(340px,calc(100vw-48px))] rounded-[12px] border border-pf-border bg-pf-bg-deep px-3 py-2.5 text-[11.5px] font-normal leading-relaxed text-pf-body opacity-0 shadow-pf-float transition-opacity group-hover/rinfo:visible group-hover/rinfo:opacity-100">
                <span className="mb-1 block font-semibold text-white">Cách tính</span>
                Một ticket có thể có nhiều issue (cột issues_all). AI đọc từng issue và gom các issue cùng một vấn đề cụ thể, ví dụ &ldquo;Page vượt 256KB nên không publish được&rdquo;. Issue xuất hiện ở từ {REPEAT_MIN} ticket trở lên trong khoảng đang lọc là <b className="text-white">issue lặp lại</b>. Không tính nhóm Unclear/Internal (khách chưa nêu vấn đề).
              </span>
            </span>
          </h2>
          <p className="mt-0.5 text-[12px] text-pf-muted">
            {periodLabel} · {a.issueItems} issue trong {a.issueTickets} ticket, gom thành {a.distinctIssues} issue khác nhau, {a.repeatIssues} issue lặp lại
          </p>
        </div>
        {grouping > 0 && (
          <span className="inline-flex items-center gap-1.5 text-[11.5px] text-pf-violet">
            <Sparkles size={12} strokeWidth={1.75} /> AI đang gom nhóm {grouping} issue mới, số liệu sẽ cập nhật sau ít phút
          </span>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <BigTile
          href={hrefFor({ rep: view === "tickets" ? null : "tickets", rcat: null })}
          active={view === "tickets"}
          label="Ticket có issue lặp lại"
          value={a.repeatTickets}
          unit="ticket"
          parts={[`${a.repeatIssues} issue`, `${a.repeatCategories} category`]}
          foot={`${pct(a.repeatTickets, a.issueTickets)} trong ${a.issueTickets} ticket có issue`}
          share={a.issueTickets ? a.repeatTickets / a.issueTickets : 0}
        />
        <BigTile
          href={hrefFor({ rep: view === "stores" ? null : "stores", rcat: null })}
          active={view === "stores"}
          label="Khách gặp issue lặp lại"
          value={a.stores}
          unit="store"
          parts={[`${a.storesAgain} store gặp lại cùng issue`, `${a.paidStores} store trả phí · ${money(a.monthlyRevenue)}/tháng`]}
          foot={`${pct(a.stores, a.issueStores)} trong ${a.issueStores} store có issue${a.churnStores ? ` · ${a.churnStores} store có churn risk` : ""}`}
          share={a.issueStores ? a.stores / a.issueStores : 0}
        />
      </div>

      {view === "tickets" && <TicketsView a={a} activeCat={activeCat} hrefFor={hrefFor} />}
      {view === "stores" && <StoresView a={a} />}
    </section>
  );
}

function BigTile({ href, active, label, value, unit, parts, foot, share }: { href: string; active: boolean; label: string; value: number; unit: string; parts: string[]; foot: string; share: number }) {
  return (
    <Link
      href={`${href}#issue-lap-lai`}
      scroll={false}
      aria-expanded={active}
      className={cx("relative block rounded-[20px] border bg-pf-card p-4 shadow-pf-card transition-colors duration-150 sm:p-5", active ? "border-pf-primary-hi/60 bg-pf-primary/[.07]" : "border-pf-border hover:border-pf-border-hi")}
    >
      <div className="flex items-center justify-between gap-2 text-[12.5px] font-semibold text-pf-muted">
        {label}
        <ChevronDown size={15} strokeWidth={1.75} className={cx("text-pf-faint transition-transform duration-200", active && "rotate-180 text-pf-primary-hi")} />
      </div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="tabular font-display text-[34px] font-semibold leading-none text-white">{value}</span>
        <span className="text-[13px] text-pf-muted">{unit}</span>
        <span className="flex flex-wrap gap-1.5">
          {parts.map((p) => (
            <span key={p} className="rounded-full border border-pf-border bg-white/[.03] px-2 py-0.5 text-[11.5px] font-semibold text-pf-body">
              {p}
            </span>
          ))}
        </span>
      </div>
      <div className="mt-3 h-[4px] rounded-full bg-pf-bg-deep">
        <div className="h-full rounded-full bg-pf-primary" style={{ width: `${Math.round(share * 100)}%` }} />
      </div>
      <div className="mt-1.5 text-[11.5px] text-pf-faint">{foot}</div>
    </Link>
  );
}

function TicketsView({ a, activeCat, hrefFor }: { a: RepeatAnalysis; activeCat: string | null; hrefFor: (patch: Record<string, string | null>) => string }) {
  if (!a.issues.length) return <Panel className="p-5"><Empty text="Không có issue nào lặp lại trong khoảng này." /></Panel>;
  const issues = a.issues.filter((i) => i.category === activeCat);
  const top = a.issues.slice(0, 8).map((i) => ({ key: i.title, count: i.tickets.length, share: a.repeatTickets ? i.tickets.length / a.repeatTickets : 0 }));
  return (
    <Panel className="grid gap-4 p-4 sm:p-5">
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="rounded-[16px] border border-pf-border bg-white/[.02] p-3.5">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-pf-faint">Ticket Issue theo ngày · phần lặp lại</div>
          <RepeatDailyChart data={bucketDaily(a.daily)} />
        </div>
        <div className="rounded-[16px] border border-pf-border bg-white/[.02] p-3.5">
          <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-pf-faint">Issue lặp lại nhiều nhất</div>
          <BarList items={top} max={8} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(240px,1fr)_minmax(0,2.2fr)]">
        <div>
          <div className="mb-2 flex items-baseline justify-between text-[11px] font-semibold uppercase tracking-[0.08em] text-pf-faint">
            <span>Category · {a.categories.length}</span>
            <span>issue · ticket</span>
          </div>
          <ul className="grid gap-1">
            {a.categories.map((c) => {
              const on = c.category === activeCat;
              return (
                <li key={c.category}>
                  <Link
                    href={`${hrefFor({ rep: "tickets", rcat: c.category })}#repeat-detail`}
                    scroll={false}
                    aria-current={on || undefined}
                    className={cx("block rounded-[12px] border px-3 py-2 transition-colors", on ? "border-pf-primary-hi/50 bg-pf-primary/[.12]" : "border-transparent hover:bg-white/[.03]")}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={cx("truncate text-[12.5px]", on ? "font-semibold text-white" : "text-pf-body")}>{c.category}</span>
                      <span className="tabular shrink-0 text-[12px] text-pf-muted">
                        {c.issues} · <b className="text-white">{c.tickets}</b>
                      </span>
                    </div>
                    <div className="mt-1.5 h-[3px] rounded-full bg-pf-bg-deep">
                      <div className="h-full rounded-full bg-pf-primary" style={{ width: `${(c.tickets / a.categories[0].tickets) * 100}%` }} />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        <div id="repeat-detail" className="scroll-mt-6">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[13.5px] font-semibold text-white">{activeCat}</h3>
            <span className="text-[11.5px] text-pf-muted">
              {issues.length} issue lặp lại · {issues.reduce((s, i) => s + i.tickets.length, 0)} ticket · bấm vào issue để xem ticket
            </span>
          </div>
          <div className="grid gap-2">
            {issues.map((i, idx) => (
              <IssueCard key={i.id} i={i} open={idx === 0} />
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function IssueCard({ i, open }: { i: RepeatIssue; open: boolean }) {
  return (
    <details open={open} className="group rounded-[14px] border border-pf-border bg-white/[.02] open:border-pf-border-hi">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-3 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold leading-snug text-white">{i.title}</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge tone="violet">{i.tickets.length} ticket</Badge>
            <Badge>{i.stores} store</Badge>
            {i.storesAgain > 0 && <Badge tone="danger">{i.storesAgain} store gặp lại</Badge>}
            {i.existedBefore ? <Badge tone="warn" title={`Lần đầu gặp ${formatVnDate(i.firstSeen)}`}>Có từ {dm(i.firstSeen)}</Badge> : <Badge>Mới trong kỳ</Badge>}
            {i.unresolved > 0 && <Badge tone="warn">{i.unresolved} chưa xong</Badge>}
            {i.devTickets > 0 && <Badge tone="danger">{i.devTickets} cần Dev</Badge>}
            {i.churn > 0 && <Badge tone="danger">{i.churn} churn risk</Badge>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-[11.5px] text-pf-faint">
          <span className="hidden sm:inline">{i.topRoot ? `Nguyên nhân: ${i.topRoot}` : ""}</span>
          <span>gần nhất {dm(i.lastSeen)}</span>
          <ChevronDown size={14} strokeWidth={1.75} className="transition-transform group-open:rotate-180" />
        </div>
      </summary>
      <div className="pf-scroll overflow-x-auto border-t border-pf-border">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr className="text-[10.5px] uppercase tracking-[0.06em] text-pf-faint">
              {["Khách contact", "Store", "FL", "Trạng thái issue", "Khách nói", ""].map((h, k) => (
                <th key={k} className="px-3 py-2 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {i.items.map((x) => (
              <TicketRow key={x.item.key} x={x} />
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function TicketRow({ x }: { x: TicketIssue }) {
  const t = x.ticket;
  const open = itemOpen(x);
  return (
    <tr className="border-t border-pf-border/60 text-[12px] hover:bg-pf-card/60">
      <td className="whitespace-nowrap px-3 py-2 text-pf-muted">{formatVnDate(t.derived.at)}</td>
      <td className="px-3 py-2">
        {t.store_domain ? (
          <Link href={`/customers/${encodeURIComponent(t.store_domain)}`} className="font-semibold text-white hover:underline">
            {t.store_name ?? t.store_domain}
          </Link>
        ) : (
          <span className="text-pf-faint">—</span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-pf-body">{t.triggered_by ?? "—"}</td>
      <td className="whitespace-nowrap px-3 py-2">
        <span className={open ? "text-pf-warn" : "text-pf-success"}>{x.item.status ?? t.resolution ?? "—"}</span>
      </td>
      <td className="max-w-[360px] px-3 py-2 text-pf-muted">
        <span className="line-clamp-2">{x.item.summary}</span>
        {t.derived.issues.length > 1 && <span className="text-[11px] text-pf-faint">ticket có {t.derived.issues.length} issue</span>}
      </td>
      <td className="px-3 py-2 text-right">
        {t.ticket_url && (
          <a href={t.ticket_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 whitespace-nowrap text-[11.5px] text-pf-primary-hi hover:underline">
            Crisp <ExternalLink size={11} strokeWidth={1.75} />
          </a>
        )}
      </td>
    </tr>
  );
}

function StoresView({ a }: { a: RepeatAnalysis }) {
  if (!a.storeList.length) return <Panel className="p-5"><Empty text="Không có khách nào gặp issue lặp lại trong khoảng này." /></Panel>;
  const byPlan = new Map<string, number>();
  for (const s of a.storeList) byPlan.set(s.plan ?? "(chưa rõ)", (byPlan.get(s.plan ?? "(chưa rõ)") ?? 0) + 1);
  const plans = [...byPlan].sort((x, y) => y[1] - x[1]).map(([key, count]) => ({ key, count, share: count / a.storeList.length }));
  const byCat = a.categories.map((c) => ({ key: c.category, count: c.stores, share: a.stores ? c.stores / a.stores : 0 })).sort((x, y) => y.count - x.count);
  return (
    <Panel className="grid gap-4 p-4 sm:p-5">
      <PanelTitle
        icon={Store}
        title={`${a.stores} khách gặp issue lặp lại`}
        note={`Store có ít nhất 1 ticket thuộc issue lặp lại. "Gặp lại" = cùng store gặp lại đúng issue đó từ 2 lần trở lên — nên ưu tiên liên hệ chủ động.`}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-[16px] border border-pf-border bg-white/[.02] p-3.5">
          <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-pf-faint">Số store theo category</div>
          <BarList items={byCat} max={8} />
        </div>
        <div className="rounded-[16px] border border-pf-border bg-white/[.02] p-3.5">
          <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-pf-faint">Số store theo plan PageFly</div>
          <BarList items={plans} max={8} />
        </div>
      </div>
      <div className="pf-scroll max-h-[560px] overflow-auto rounded-[14px] border border-pf-border">
        <table className="w-full min-w-[820px] border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-pf-bg-alt">
            <tr className="border-b border-pf-border text-[11px] uppercase tracking-[0.06em] text-pf-faint">
              {["Store", "Plan", "Ticket", "Issue đã gặp", "Liên hệ gần nhất", ""].map((h, k) => (
                <th key={k} className="whitespace-nowrap px-3 py-2.5 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {a.storeList.map((s) => (
              <tr key={s.domain} className="border-b border-pf-border/60 text-[12.5px] last:border-0 hover:bg-pf-card/60">
                <td className="px-3 py-2.5 align-top">
                  <Link href={`/customers/${encodeURIComponent(s.domain)}`} className="grid gap-0.5 hover:underline">
                    <span className="font-semibold text-white">{s.name ?? s.domain}</span>
                    <span className="text-[11px] text-pf-faint">{s.domain}</span>
                  </Link>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {s.sameIssueAgain && <Badge tone="danger">Gặp lại cùng issue</Badge>}
                    {s.churn && <Badge tone="danger">Churn risk</Badge>}
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 align-top text-pf-body">
                  {s.plan ?? "—"}
                  {s.price != null ? <span className="text-pf-faint"> · {money(s.price)}</span> : null}
                </td>
                <td className="tabular px-3 py-2.5 align-top font-semibold text-white">{s.tickets}</td>
                <td className="px-3 py-2.5 align-top">
                  <ul className="grid gap-0.5">
                    {s.issues.map((x) => (
                      <li key={x.id} className="text-[12px] text-pf-body">
                        {x.title}
                        {x.count > 1 && <b className="ml-1 text-pf-danger">×{x.count}</b>}
                      </li>
                    ))}
                  </ul>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 align-top text-pf-muted">{formatVnDate(s.lastAt)}</td>
                <td className="px-3 py-2.5 text-right align-top">
                  {s.lastUrl && (
                    <a href={s.lastUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 whitespace-nowrap text-[11.5px] text-pf-primary-hi hover:underline">
                      Crisp <ExternalLink size={11} strokeWidth={1.75} />
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
