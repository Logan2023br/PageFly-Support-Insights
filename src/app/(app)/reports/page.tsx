import Link from "next/link";
import { ArrowUpRight, Code2, Headset, Megaphone, type LucideIcon } from "lucide-react";
import { TEAMS, type ReportTeam } from "@/lib/reports";
import { PageHeader, Panel } from "@/components/ui";

const ICONS: Record<ReportTeam, LucideIcon> = { cs: Headset, dev: Code2, marketing: Megaphone };

export default function ReportsPage() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <PageHeader eyebrow="Support Insights" title="Báo cáo" subtitle="Báo cáo theo team, xem theo tuần · tháng · quý · toàn bộ. Mỗi báo cáo xuất được ra Excel và có kho PDF lưu theo kỳ ở cuối trang team." />
      <div className="grid gap-3 md:grid-cols-3">
        {(Object.keys(TEAMS) as ReportTeam[]).map((team) => {
          const Icon = ICONS[team];
          return (
            <Link key={team} href={`/reports/${team}`} className="group">
              <Panel className="relative h-full overflow-hidden p-5 transition-colors duration-150 group-hover:border-pf-primary-hi/50">
                <div className="flex items-start justify-between">
                  <span className="grid size-10 place-items-center rounded-[12px] border border-pf-primary-hi/40 bg-pf-primary/14 text-pf-violet">
                    <Icon size={18} strokeWidth={1.75} />
                  </span>
                  <ArrowUpRight size={16} strokeWidth={1.75} className="text-pf-faint transition-colors group-hover:text-pf-primary-hi" />
                </div>
                <h2 className="mt-4 font-display text-[19px] font-semibold tracking-[-0.02em] text-white">{TEAMS[team].title}</h2>
                <p className="mt-1 text-[12.5px] leading-relaxed text-pf-muted">{TEAMS[team].description}</p>
                <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-pf-faint">Dành cho: {TEAMS[team].audience}</p>
              </Panel>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
