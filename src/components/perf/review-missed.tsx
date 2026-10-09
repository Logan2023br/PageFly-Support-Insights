import Link from "next/link";
import { ExternalLink, Star } from "lucide-react";
import type { Ticket } from "@/lib/data/types";
import { formatVnDateTime } from "@/lib/data/parse";
import { Empty, Panel, PanelTitle } from "@/components/ui";

/**
 * Ticket có review_verdict = QUALIFIED nhưng FL chưa hỏi review (và khách chưa có review).
 * `groupByFl`: trang Đội ngũ gom theo FL; trang từng người thì liệt kê thẳng.
 */
export function ReviewMissedPanel({ tickets, hrefFor, personHref, groupByFl }: { tickets: Ticket[]; hrefFor: (t: Ticket) => string; personHref?: (name: string) => string; groupByFl?: boolean }) {
  const missed = tickets.filter((t) => t.derived.reviewMissed);
  const qualified = tickets.filter((t) => t.review_verdict === "QUALIFIED").length;
  const byFl = new Map<string, Ticket[]>();
  for (const t of missed) {
    const k = t.triggered_by ?? "(chưa rõ FL)";
    byFl.set(k, [...(byFl.get(k) ?? []), t]);
  }
  const groups: [string, Ticket[]][] = groupByFl ? [...byFl].sort((a, b) => b[1].length - a[1].length) : [["", missed]];
  return (
    <Panel className="p-4 sm:p-5">
      <PanelTitle
        icon={Star}
        title={`Đủ điều kiện mời review nhưng chưa hỏi · ${missed.length}`}
        note={qualified ? `${missed.length}/${qualified} ticket QUALIFIED chưa được hỏi review. Nên nhắc FL quay lại mời review khi khách còn vui.` : "Chưa có ticket QUALIFIED trong khoảng này."}
      />
      {missed.length ? (
        <div className="pf-scroll grid max-h-[420px] gap-3 overflow-y-auto">
          {groups.map(([fl, list]) => (
            <div key={fl || "all"} className="grid gap-1.5">
              {groupByFl && (
                <div className="flex items-center justify-between text-[12px]">
                  {personHref && fl !== "(chưa rõ FL)" ? (
                    <Link href={personHref(fl)} className="font-semibold text-white hover:underline">
                      {fl}
                    </Link>
                  ) : (
                    <span className="font-semibold text-white">{fl}</span>
                  )}
                  <span className="tabular text-pf-warn">{list.length} chưa hỏi</span>
                </div>
              )}
              <ul className="grid gap-1.5">
                {list.map((t) => (
                  <li key={t.id} className="flex items-start justify-between gap-3 rounded-[12px] border border-pf-border px-3 py-2 text-[12px]">
                    <div className="min-w-0">
                      <Link href={hrefFor(t)} className="block truncate font-semibold text-pf-body hover:text-white hover:underline">
                        {t.store_name ?? t.store_domain ?? "—"} · {t.issue_summary ?? "—"}
                      </Link>
                      <div className="mt-0.5 text-[11px] text-pf-faint">
                        {formatVnDateTime(t.derived.at)} · {t.review_asked ?? "chưa ghi"} {t.review_ticket ? `· ${t.review_ticket}` : ""}
                      </div>
                    </div>
                    {t.ticket_url && (
                      <a href={t.ticket_url} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-pf-primary-hi hover:underline">
                        Crisp <ExternalLink size={11} strokeWidth={1.75} />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <Empty text="Không có ticket nào bị bỏ lỡ mời review." />
      )}
    </Panel>
  );
}
