import Link from "next/link";
import { Calculator, ExternalLink } from "lucide-react";
import { SEGMENTS, type Customer } from "@/lib/customers";
import { Badge, Panel, PanelTitle } from "@/components/ui";

const money = (v: number) => `$${Math.round(v).toLocaleString("vi-VN")}`;

/**
 * Bản tính doanh thu từ những store nào: tổng theo plan + từng store (plan, giá, lý do).
 * `mode` = "risk": doanh thu có thể mất (store Nguy cơ cao); "served": doanh thu của các store đã liên hệ.
 */
export function RevenueBreakdown({ customers, mode, custHref }: { customers: Customer[]; mode: "risk" | "served"; custHref: (domain: string) => string }) {
  const rows = [...customers].sort((a, b) => (b.price ?? 0) - (a.price ?? 0) || b.tickets.length - a.tickets.length);
  const total = rows.reduce((s, c) => s + (c.price ?? 0), 0);
  const paid = rows.filter((c) => (c.price ?? 0) > 0);
  const unknown = rows.filter((c) => c.price == null).length;

  const byPlan = new Map<string, { stores: number; total: number; prices: Set<number> }>();
  for (const c of rows) {
    const k = c.plan ?? "(chưa rõ plan)";
    const e = byPlan.get(k) ?? { stores: 0, total: 0, prices: new Set<number>() };
    e.stores++;
    e.total += c.price ?? 0;
    if (c.price != null) e.prices.add(c.price);
    byPlan.set(k, e);
  }
  const plans = [...byPlan.entries()].sort((a, b) => b[1].total - a[1].total || b[1].stores - a[1].stores);

  return (
    <Panel className="p-4 sm:p-5">
      <PanelTitle
        icon={Calculator}
        title={mode === "risk" ? `Doanh thu có thể mất: ${money(total)}/tháng ≈ ${money(total * 12)}/năm` : `Doanh thu đang phục vụ: ${money(total)}/tháng ≈ ${money(total * 12)}/năm`}
        note={
          mode === "risk"
            ? `Cộng giá plan/tháng (lần ghi gần nhất) của ${rows.length} store nhóm Nguy cơ cao — ${SEGMENTS.risk.hint.toLowerCase()}. ${paid.length} store trả phí, ${rows.length - paid.length} store miễn phí ($0)${unknown ? `, ${unknown} store chưa ghi giá` : ""}.`
            : `Cộng giá plan/tháng (lần ghi gần nhất) của ${rows.length} store đã liên hệ trong khoảng. ${paid.length} store trả phí, ${rows.length - paid.length} store miễn phí ($0)${unknown ? `, ${unknown} store chưa ghi giá` : ""}.`
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)]">
        <div className="overflow-hidden rounded-[14px] border border-pf-border">
          <table className="w-full border-collapse text-left">
            <thead className="bg-pf-bg-alt">
              <tr className="border-b border-pf-border text-[11px] uppercase tracking-[0.06em] text-pf-faint">
                <th className="px-3 py-2.5 font-semibold">Plan</th>
                <th className="px-3 py-2.5 text-right font-semibold">Giá/tháng</th>
                <th className="px-3 py-2.5 text-right font-semibold">Store</th>
                <th className="px-3 py-2.5 text-right font-semibold">Cộng/tháng</th>
              </tr>
            </thead>
            <tbody>
              {plans.map(([plan, e]) => (
                <tr key={plan} className="border-b border-pf-border/60 text-[12.5px]">
                  <td className="px-3 py-2 font-semibold text-white">{plan}</td>
                  <td className="tabular px-3 py-2 text-right text-pf-muted">{e.prices.size ? [...e.prices].map(money).join(" / ") : "—"}</td>
                  <td className="tabular px-3 py-2 text-right text-pf-body">× {e.stores}</td>
                  <td className="tabular px-3 py-2 text-right font-semibold text-white">{money(e.total)}</td>
                </tr>
              ))}
              <tr className="bg-pf-primary/[.08] text-[12.5px]">
                <td className="px-3 py-2.5 font-semibold text-white">Tổng</td>
                <td />
                <td className="tabular px-3 py-2.5 text-right font-semibold text-white">{rows.length}</td>
                <td className={mode === "risk" ? "tabular px-3 py-2.5 text-right font-bold text-pf-danger" : "tabular px-3 py-2.5 text-right font-bold text-white"}>{money(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="pf-scroll max-h-[420px] overflow-auto rounded-[14px] border border-pf-border">
          <table className="w-full min-w-[620px] border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-pf-bg-alt">
              <tr className="border-b border-pf-border text-[11px] uppercase tracking-[0.06em] text-pf-faint">
                <th className="px-3 py-2.5 font-semibold">Store</th>
                <th className="px-3 py-2.5 font-semibold">Plan</th>
                <th className="px-3 py-2.5 text-right font-semibold">Giá/tháng</th>
                <th className="px-3 py-2.5 font-semibold">{mode === "risk" ? "Vì sao rủi ro" : "Tình trạng"}</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.domain} className="border-b border-pf-border/60 text-[12.5px] last:border-0 hover:bg-pf-card/60">
                  <td className="px-3 py-2 align-top">
                    <Link href={custHref(c.domain)} className="grid gap-0.5 hover:underline">
                      <span className="font-semibold text-white">{c.name ?? c.domain}</span>
                      <span className="text-[11px] text-pf-faint">{c.domain}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-2 align-top text-pf-body">{c.plan ?? "—"}</td>
                  <td className="tabular px-3 py-2 text-right align-top font-semibold text-white">{c.price != null ? money(c.price) : "—"}</td>
                  <td className="px-3 py-2 align-top">
                    {mode === "risk" ? (
                      <div className="flex flex-wrap gap-1">
                        {c.churn && <Badge tone="danger">Churn risk</Badge>}
                        {c.uninstallAt != null && <Badge tone="danger">Đã gỡ app</Badge>}
                        {c.health < 50 && <Badge tone="warn">Sức khoẻ {c.health}</Badge>}
                        <span className="line-clamp-1 w-full text-[11px] text-pf-faint">{c.last.issue_summary}</span>
                      </div>
                    ) : (
                      <Badge tone={SEGMENTS[c.segment].tone}>{SEGMENTS[c.segment].label}</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
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
      </div>
    </Panel>
  );
}
