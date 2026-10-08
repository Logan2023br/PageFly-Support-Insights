import Link from "next/link";
import type { Ticket } from "@/lib/data/types";
import { FIELD_BY_KEY } from "@/lib/schema/fields";
import { TicketCell } from "@/components/tickets/ticket-cell";
import { cx } from "@/components/ui";

/** Cột giống bảng Chi tiết (bộ "Gọn"), bỏ cột store vì đang xem trong một store. */
export const CONTACT_COLUMNS = [
  "recap_at_vn",
  "triggered_by",
  "category_ticket",
  "category_issue",
  "issue_summary",
  "priority",
  "role_pic",
  "resolution",
  "mood_label_cx_end_to_end",
  "csat",
  "churn_risk",
  "upsell_signal",
  "next_action",
  "ticket_url",
];

/** Bảng các lần liên hệ của một khách, nhúng ngay dưới dòng khách. */
export function ContactRows({ tickets, inScope, hrefFor }: { tickets: Ticket[]; inScope: Set<string>; hrefFor: (t: Ticket) => string }) {
  return (
    <div className="pf-scroll max-h-[560px] overflow-auto rounded-[14px] border border-pf-border bg-pf-bg-deep/60">
      <table className="w-full border-collapse text-left" style={{ minWidth: CONTACT_COLUMNS.length * 130 }}>
        <thead className="sticky top-0 z-10 bg-pf-bg-deep">
          <tr className="border-b border-pf-border text-[10.5px] uppercase tracking-[0.06em] text-pf-faint">
            <th className="px-3 py-2.5 font-semibold">#</th>
            {CONTACT_COLUMNS.map((k) => (
              <th key={k} className="whitespace-nowrap px-3 py-2.5 font-semibold" title={FIELD_BY_KEY[k]?.description}>
                {FIELD_BY_KEY[k]?.label ?? k}
              </th>
            ))}
            <th className="sticky right-0 bg-pf-bg-deep px-3 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {tickets.map((t, i) => (
            <tr key={t.id} className={cx("border-b border-pf-border/50 text-[12px] last:border-0", !inScope.has(t.id) && "opacity-55")}>
              <td className="tabular px-3 py-2.5 align-top text-pf-faint">{tickets.length - i}</td>
              {CONTACT_COLUMNS.map((k) => (
                <td key={k} className={cx("px-3 py-2.5 align-top text-pf-body", k === "issue_summary" && "min-w-[260px]")}>
                  <TicketCell t={t} field={k} />
                </td>
              ))}
              <td className="sticky right-0 bg-pf-bg-deep px-2 py-2 align-top shadow-[-12px_0_12px_-12px_rgba(0,0,0,0.9)]">
                <Link href={hrefFor(t)} scroll={false} className="rounded-[8px] px-2 py-1 text-[11.5px] font-semibold text-pf-muted hover:bg-pf-bg hover:text-white">
                  Xem
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
