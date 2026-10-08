import Link from "next/link";
import { ExternalLink, X } from "lucide-react";
import type { Ticket } from "@/lib/data/types";
import { formatDuration } from "@/lib/data/parse";
import { FIELDS, GROUP_LABELS, type FieldGroup } from "@/lib/schema/fields";
import { Badge, buttonClass } from "@/components/ui";
import { TicketCell } from "./ticket-cell";

const HANDLER = { FL: "FL tự xử lý", TS: "TS xử lý", Dev: "Cần Dev" };

export function TicketDrawer({ t, closeHref, related }: { t: Ticket; closeHref: string; related: { href: string; label: string; count: number } | null }) {
  const groups = Object.keys(GROUP_LABELS) as FieldGroup[];
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <Link href={closeHref} scroll={false} aria-label="Đóng" className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" />
      <aside className="pf-scroll relative h-full w-full max-w-[560px] overflow-y-auto border-l border-pf-border bg-pf-bg-alt shadow-pf-float" role="dialog" aria-modal>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-pf-border bg-pf-bg-alt/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <TicketCell t={t} field="category_ticket" />
              {t.category_issue && <Badge>{t.category_issue}</Badge>}
              {t.priority && <TicketCell t={t} field="priority" />}
              <Badge tone="violet">{HANDLER[t.derived.handler]}</Badge>
              {t.churn_risk && <Badge tone="danger">Churn risk</Badge>}
            </div>
            <h2 className="mt-2 font-display text-[17px] font-semibold leading-snug tracking-[-0.02em] text-white">{t.issue_summary ?? "Không có tóm tắt"}</h2>
            <p className="mt-1 text-[12px] text-pf-muted">
              {t.store_name ?? t.store_domain ?? "—"} · hàng {t.row} trong sheet{t.derived.recapCount > 1 ? ` · đã recap ${t.derived.recapCount} lần` : ""}
            </p>
          </div>
          <div className="flex shrink-0 gap-1.5">
            {t.ticket_url && (
              <a href={t.ticket_url} target="_blank" rel="noreferrer" className={buttonClass("primary", "sm")}>
                Crisp <ExternalLink size={13} strokeWidth={1.75} />
              </a>
            )}
            <Link href={closeHref} scroll={false} className={buttonClass("quiet", "sm", "size-8 px-0")} aria-label="Đóng">
              <X size={16} />
            </Link>
          </div>
        </div>

        <div className="grid gap-4 px-5 py-4">
          <div className="grid grid-cols-3 gap-2">
            {[
              ["Phản hồi đầu", formatDuration(t.derived.firstReplySec)],
              ["Handle", formatDuration(t.total_time_handle)],
              ["Chờ lâu nhất", formatDuration(t.time_pic_max_reply)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-[14px] border border-pf-border bg-pf-card p-3">
                <div className="text-[11px] font-semibold text-pf-muted">{k}</div>
                <div className="tabular mt-1 font-display text-[18px] font-bold text-white">{v}</div>
              </div>
            ))}
          </div>

          {related && related.count > 1 && (
            <Link href={related.href} className="rounded-[12px] border border-pf-warn/35 bg-pf-warn/[.07] px-3.5 py-2.5 text-[12.5px] text-pf-body hover:border-pf-warn/60">
              Store này đã liên hệ <b className="text-pf-warn">{related.count} lần</b> trong dữ liệu. Xem tất cả →
            </Link>
          )}

          {groups.map((g) => (
            <section key={g}>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-pf-faint">{GROUP_LABELS[g]}</h3>
              <dl className="grid overflow-hidden rounded-[14px] border border-pf-border">
                {FIELDS.filter((f) => f.group === g).map((f) => (
                  <div key={f.key} className="grid grid-cols-[150px_1fr] gap-3 border-b border-pf-border/60 px-3 py-2 text-[12.5px] last:border-0">
                    <dt className="text-pf-muted" title={f.description}>
                      {f.label}
                    </dt>
                    <dd className="min-w-0 break-words text-pf-body">
                      <TicketCell t={t} field={f.key} full />
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </aside>
    </div>
  );
}
