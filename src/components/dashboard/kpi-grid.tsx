import Link from "next/link";
import { ChevronDown, Info } from "lucide-react";
import type { Tile } from "@/lib/dashboard";
import { GROUP_TITLES, METRICS, type MetricGroup } from "@/lib/metrics/defs";
import { formatDelta } from "@/lib/metrics/compute";
import { AlertBadge, cx, Delta } from "@/components/ui";

type HrefFor = (key: string | null) => string;

/** Ô KPI chính, xếp theo hàng (4–5 ô mỗi hàng). Bấm ô để xem tóm tắt + biểu đồ 2 kỳ bên dưới. */
export function KpiMain({ rows, selected, hrefFor, prevLabel }: { rows: Tile[][]; selected: string | null; hrefFor: HrefFor; prevLabel: string | null }) {
  const cols: Record<number, string> = { 4: "xl:grid-cols-4", 5: "lg:grid-cols-3 xl:grid-cols-5", 6: "lg:grid-cols-3 xl:grid-cols-6" };
  return (
    <div className="grid gap-3">
      {rows.map((row, i) => (
        <div key={i} className={cx("grid gap-3 sm:grid-cols-2", cols[row.length] ?? "xl:grid-cols-4")}>
          {row.map((tile) => (
            <KpiTile key={tile.def.key} tile={tile} active={selected === tile.def.key} href={tile.drillable ? hrefFor(selected === tile.def.key ? null : tile.def.key) : undefined} prevLabel={prevLabel} large />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Các chỉ số còn lại, gom theo nhóm, thu gọn mặc định. */
export function KpiMore({ groups, selected, hrefFor, prevLabel, open }: { groups: { title: string; tiles: Tile[] }[]; selected: string | null; hrefFor: HrefFor; prevLabel: string | null; open?: boolean }) {
  const alerts = groups.flatMap((g) => g.tiles).filter((t) => t.change?.alert).length;
  const count = groups.reduce((s, g) => s + g.tiles.length, 0);
  return (
    <details className="group rounded-[20px] border border-pf-border bg-pf-card/50" open={open}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="text-[13px] font-semibold text-white">
          Chỉ số khác <span className="font-normal text-pf-muted">· {count} chỉ số</span>
          {alerts > 0 && <span className="ml-2 font-semibold text-pf-danger">{alerts} cần chú ý</span>}
        </span>
        <ChevronDown size={16} strokeWidth={1.75} className="text-pf-faint transition-transform group-open:rotate-180" />
      </summary>
      <div className="grid gap-4 border-t border-pf-border p-4">
        {groups.map((g) => (
          <div key={g.title} className="grid gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-pf-faint">{g.title}</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
              {g.tiles.map((tile) => (
                <KpiTile key={tile.def.key} tile={tile} active={selected === tile.def.key} href={tile.drillable ? hrefFor(selected === tile.def.key ? null : tile.def.key) : undefined} prevLabel={prevLabel} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

function KpiTile({ tile, active, href, prevLabel, large }: { tile: Tile; active: boolean; href?: string; prevLabel: string | null; large?: boolean }) {
  const c = tile.change;
  const bad = c?.alert != null;
  const footer = (
    <div className="mt-2 flex min-h-[18px] flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-pf-muted">
      {tile.missing.length ? (
        <span className="text-pf-warn" title={`Thêm cột ${tile.missing.join(", ")} vào sheet để có chỉ số này`}>
          Sheet chưa có cột {tile.missing.join(", ")}
        </span>
      ) : c && c.delta != null ? (
        <>
          <Delta delta={c.delta} tone={c.tone} text={formatDelta(c.delta, tile.def.format)} />
          <span className="text-pf-faint">vs kỳ trước</span>
          <AlertBadge level={c.alert} />
        </>
      ) : (
        <span className="text-pf-faint">{prevLabel ? "Kỳ trước chưa có dữ liệu" : tile.def.hint}</span>
      )}
      {tile.stores != null && <span className="text-pf-faint">· {tile.stores} store</span>}
      {tile.stores == null && tile.share != null && tile.def.format === "count" && tile.def.key !== "total" && tile.def.key !== "stores" && <span className="text-pf-faint">· {Math.round(tile.share * 100)}% ticket</span>}
    </div>
  );
  const body = (
    <>
      <div className="flex items-center justify-between gap-2 text-[12px] font-semibold text-pf-muted">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="leading-snug">{tile.def.label}</span>
          {/* Khung chú thích neo theo ô (không theo icon) để không thò ra ngoài mép trang. */}
          <span className="group/info shrink-0" aria-label={`Cách tính: ${tile.def.hint}`}>
            <Info size={13} strokeWidth={1.75} className="text-pf-faint group-hover/info:text-pf-primary-hi" />
            <span className="pointer-events-none invisible absolute inset-x-3 top-11 z-40 rounded-[10px] border border-pf-border bg-pf-bg-deep px-3 py-2 text-[11.5px] font-normal leading-relaxed text-pf-body opacity-0 shadow-pf-float transition-opacity group-hover/info:visible group-hover/info:opacity-100">
              <span className="mb-0.5 block font-semibold text-white">Cách tính</span>
              {tile.def.hint}
            </span>
          </span>
        </span>
        {href && <ChevronDown size={14} strokeWidth={1.75} className={cx("shrink-0 text-pf-faint transition-transform duration-200", active && "rotate-180 text-pf-primary-hi")} />}
      </div>
      <div className={cx("tabular mt-2 font-display font-bold leading-none tracking-[-0.03em] text-white", large ? "text-[28px]" : "text-[24px]")}>{tile.value}</div>
      {footer}
    </>
  );
  const cls = cx(
    "relative block rounded-[20px] border bg-pf-card p-4 shadow-pf-card transition-colors duration-150",
    active ? "border-pf-primary-hi/70 bg-pf-primary/[.08]" : bad ? "border-pf-danger/35" : "border-pf-border",
    href && !active && "hover:border-pf-primary-hi/50",
  );
  return href ? (
    <Link href={href} scroll={false} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>
      {body}
    </div>
  );
}

/** Bảng giải thích công thức tất cả chỉ số, để người đọc hiểu số được tính thế nào. */
export function MetricGlossary() {
  return (
    <details className="group rounded-[20px] border border-pf-border bg-pf-card/50">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2 text-[13px] font-semibold text-white">
          <Info size={15} strokeWidth={1.75} className="text-pf-primary-hi" /> Cách tính các chỉ số
          <span className="font-normal text-pf-muted">· {METRICS.length} chỉ số</span>
        </span>
        <ChevronDown size={16} strokeWidth={1.75} className="text-pf-faint transition-transform group-open:rotate-180" />
      </summary>
      <div className="grid gap-5 border-t border-pf-border p-4 lg:grid-cols-2">
        {(Object.keys(GROUP_TITLES) as MetricGroup[]).map((g) => (
          <div key={g}>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-pf-faint">{GROUP_TITLES[g]}</div>
            <dl className="grid gap-2">
              {METRICS.filter((m) => m.group === g).map((m) => (
                <div key={m.key} className="grid gap-0.5 rounded-[12px] border border-pf-border/70 px-3 py-2">
                  <dt className="text-[12.5px] font-semibold text-white">{m.label}</dt>
                  <dd className="text-[12px] leading-relaxed text-pf-muted">{m.hint}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </details>
  );
}
