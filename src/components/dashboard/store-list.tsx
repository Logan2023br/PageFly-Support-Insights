import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { SEGMENTS, type Customer } from "@/lib/customers";
import { formatVnDate } from "@/lib/data/parse";
import { Badge, Empty } from "@/components/ui";

/** Danh sách store trong khung drill-down của ô "Tổng store": nhiều ticket nhất lên đầu. */
export function StoreList({ customers, limit = 50 }: { customers: Customer[]; limit?: number }) {
  if (!customers.length) return <Empty text="Không có store nào trong khoảng này." />;
  const rows = [...customers].sort((a, b) => b.tickets.length - a.tickets.length || (b.price ?? 0) - (a.price ?? 0));
  return (
    <div className="pf-scroll overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse text-left">
        <thead>
          <tr className="border-b border-pf-border text-[11px] uppercase tracking-[0.06em] text-pf-faint">
            {["Store", "Plan", "Quốc gia", "Ticket trong kỳ", "Lần đầu liên hệ", "Liên hệ gần nhất", "Tình trạng", ""].map((h, i) => (
              <th key={i} className="whitespace-nowrap px-3 py-2.5 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, limit).map((c) => (
            <tr key={c.domain} className="border-b border-pf-border/60 text-[12.5px] last:border-0 hover:bg-pf-card/60">
              <td className="px-3 py-2.5 align-top">
                <Link href={`/customers/${encodeURIComponent(c.domain)}`} className="grid gap-0.5 hover:underline">
                  <span className="font-semibold text-white">{c.name ?? c.domain}</span>
                  <span className="text-[11px] text-pf-faint">{c.domain}</span>
                </Link>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 align-top text-pf-body">
                {c.plan ?? "—"}
                {c.price != null && <span className="text-pf-faint"> · ${c.price}</span>}
              </td>
              <td className="px-3 py-2.5 align-top text-pf-body">{c.country ?? "—"}</td>
              <td className="tabular px-3 py-2.5 align-top font-semibold text-white">{c.tickets.length}</td>
              <td className="whitespace-nowrap px-3 py-2.5 align-top text-pf-body">
                {c.firstContact ? formatVnDate(c.firstContact) : "—"}
                {c.isNew && (
                  <span className="ml-1.5">
                    <Badge tone="violet">Mới</Badge>
                  </span>
                )}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 align-top text-pf-body">{c.lastContact ? formatVnDate(c.lastContact) : "—"}</td>
              <td className="px-3 py-2.5 align-top">
                <div className="flex flex-wrap gap-1">
                  <Badge tone={SEGMENTS[c.segment].tone}>{SEGMENTS[c.segment].label}</Badge>
                  {c.churn && <Badge tone="danger">Churn risk</Badge>}
                  {c.upsell && <Badge tone="success">Upsell</Badge>}
                </div>
              </td>
              <td className="px-3 py-2.5 align-top">
                {c.last.ticket_url && (
                  <a href={c.last.ticket_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 whitespace-nowrap text-[11.5px] text-pf-primary-hi hover:underline">
                    Crisp <ExternalLink size={11} strokeWidth={1.75} />
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
