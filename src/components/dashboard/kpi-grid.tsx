import Link from "next/link";
import { ChevronDown } from "lucide-react";
import type { Tile } from "@/lib/dashboard";
import { formatDelta } from "@/lib/metrics/compute";
import { cx, Delta } from "@/components/ui";

export function KpiGrid({ rows, selected, hrefFor, prevLabel }: { rows: Tile[][]; selected: string | null; hrefFor: (key: string | null) => string; prevLabel: string | null }) {
  return (
    <div className="grid gap-3">
      {rows.map((row, i) => (
        <div key={i} className={cx("grid gap-3 sm:grid-cols-2", row.length >= 6 ? "xl:grid-cols-6" : "xl:grid-cols-4")}>
          {row.map((tile) => (
            <KpiTile key={tile.def.key} tile={tile} active={selected === tile.def.key} href={tile.drillable ? hrefFor(selected === tile.def.key ? null : tile.def.key) : undefined} prevLabel={prevLabel} />
          ))}
        </div>
      ))}
    </div>
  );
}

function KpiTile({ tile, active, href, prevLabel }: { tile: Tile; active: boolean; href?: string; prevLabel: string | null }) {
  const c = tile.change;
  const bad = c?.alert != null;
  const body = (
    <>
      <div className="flex items-center justify-between gap-2 text-[12px] font-semibold text-pf-muted">
        <span className="truncate">{tile.def.label}</span>
        {href && <ChevronDown size={14} strokeWidth={1.75} className={cx("shrink-0 text-pf-faint transition-transform duration-200", active && "rotate-180 text-pf-primary-hi")} />}
      </div>
      <div className="tabular mt-2 font-display text-[28px] font-bold leading-none tracking-[-0.03em] text-white">{tile.value}</div>
      <div className="mt-2 flex min-h-[18px] flex-wrap items-center gap-x-2 text-[11.5px] text-pf-muted">
        {c && c.delta != null ? (
          <>
            <Delta delta={c.delta} tone={c.tone} text={formatDelta(c.delta, tile.def.format)} />
            <span className="text-pf-faint">vs kỳ trước</span>
          </>
        ) : tile.share != null && tile.def.format === "count" ? (
          <span>{Math.round(tile.share * 100)}% tổng ticket</span>
        ) : (
          <span className="text-pf-faint">{prevLabel ? "Kỳ trước chưa có dữ liệu" : tile.def.hint}</span>
        )}
      </div>
      {tile.share != null && (
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-pf-bg-deep">
          <div className={cx("h-full", bad ? "bg-pf-danger" : "bg-pf-primary")} style={{ width: `${Math.min(100, tile.share * 100)}%` }} />
        </div>
      )}
    </>
  );
  const cls = cx(
    "relative block overflow-hidden rounded-[20px] border bg-pf-card p-4 shadow-pf-card transition-colors duration-150",
    active ? "border-pf-primary-hi/70 bg-pf-primary/[.08]" : bad ? "border-pf-danger/35" : "border-pf-border",
    href && !active && "hover:border-pf-primary-hi/50",
  );
  return href ? (
    <Link href={href} scroll={false} className={cls} title={tile.def.hint}>
      {body}
    </Link>
  ) : (
    <div className={cls} title={tile.def.hint}>
      {body}
    </div>
  );
}
