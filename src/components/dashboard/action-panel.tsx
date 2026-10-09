import Link from "next/link";
import { ExternalLink, Siren } from "lucide-react";
import type { ActionItem } from "@/lib/alerts";
import { formatVnDateTime } from "@/lib/data/parse";
import { Badge, ButtonLink, cx, Panel, PanelTitle } from "@/components/ui";

/** Khung "Cần xử lý ngay": ticket churn / Angry / hết ca chưa xong / solution chưa ổn / đợi TS-Dev... */
export function ActionPanel({ items, hrefFor, allHref, limit = 8 }: { items: ActionItem[]; hrefFor: (id: string) => string; allHref: string; limit?: number }) {
  const critical = items.filter((i) => i.level === "critical").length;
  return (
    <Panel className={cx("p-4 sm:p-5", critical > 0 && "border-pf-danger/30")}>
      <PanelTitle
        title={`Cần xử lý ngay · ${items.length} ticket`}
        icon={Siren}
        note={items.length ? `${critical} nghiêm trọng · ${items.length - critical} cần theo dõi` : "Không có ticket nào cần xử lý trong khoảng này"}
        right={
          items.length > limit ? (
            <ButtonLink href={allHref} variant="ghost">
              Xem tất cả
            </ButtonLink>
          ) : undefined
        }
      />
      {items.length > 0 && (
        <ul className="grid gap-2 md:grid-cols-2">
          {items.slice(0, limit).map(({ ticket: t, reasons, level }) => (
            <li key={t.id} className={cx("rounded-[14px] border px-3.5 py-3", level === "critical" ? "border-pf-danger/30 bg-pf-danger/[.05]" : "border-pf-border bg-white/[.02]")}>
              <div className="flex items-start justify-between gap-3">
                <Link href={hrefFor(t.id)} className="min-w-0 text-[12.5px] font-semibold text-white hover:underline">
                  <span className="block truncate">{t.store_name ?? t.store_domain ?? "Store chưa rõ"}</span>
                </Link>
                <span className="tabular shrink-0 text-[11px] text-pf-faint">{formatVnDateTime(t.derived.at)}</span>
              </div>
              <p className="mt-0.5 line-clamp-1 text-[12px] text-pf-muted">{t.issue_summary ?? "—"}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {reasons.map((r) => (
                  <Badge key={r.key} tone={r.level === "critical" ? "danger" : "warn"}>
                    {r.label}
                  </Badge>
                ))}
                <span className="ml-auto flex items-center gap-2 text-[11px] text-pf-faint">
                  FL {t.triggered_by ?? "—"}
                  {t.ticket_url && (
                    <a href={t.ticket_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-pf-primary-hi hover:underline">
                      Crisp <ExternalLink size={11} strokeWidth={1.75} />
                    </a>
                  )}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
