import Link from "next/link";
import { formatValue } from "@/lib/metrics/compute";
import type { PerfMetric, ScoreResult } from "@/lib/metrics/performance";
import { cx } from "@/components/ui";

export function fmtPerf(v: number | null | undefined, format: PerfMetric["format"]): string {
  if (format === "score") return v == null ? "—" : String(Math.round(v));
  return formatValue(v ?? null, format);
}

export function scoreTone(v: number | null): string {
  if (v == null) return "text-pf-muted";
  if (v >= 80) return "text-pf-success";
  if (v >= 60) return "text-pf-warn";
  return "text-pf-danger";
}

export function ScoreBadge({ value, size = "md" }: { value: number | null; size?: "md" | "lg" }) {
  return <span className={cx("tabular font-display font-bold tracking-[-0.03em]", scoreTone(value), size === "lg" ? "text-[30px] leading-none" : "text-[15px]")}>{value == null ? "—" : Math.round(value)}</span>;
}

/** Sparkline SVG thuần (render server), giá trị null làm đứt đoạn. */
export function Sparkline({ values, width = 96, height = 26, domain = [0, 100] }: { values: (number | null)[]; width?: number; height?: number; domain?: [number, number] }) {
  if (values.filter((v) => v != null).length < 2) return <span className="text-[11px] text-pf-faint">chưa đủ dữ liệu</span>;
  const [lo, hi] = domain;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const y = (v: number) => height - 2 - ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo || 1)) * (height - 4);
  const segments: string[] = [];
  let cur = "";
  values.forEach((v, i) => {
    if (v == null) {
      if (cur) segments.push(cur);
      cur = "";
      return;
    }
    cur += `${cur ? "L" : "M"}${(i * step).toFixed(1)},${y(v).toFixed(1)}`;
  });
  if (cur) segments.push(cur);
  const lastIdx = values.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0).at(-1)!;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      {segments.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="#9a6bff" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      ))}
      <circle cx={lastIdx * step} cy={y(values[lastIdx]!)} r={2.5} fill="#9a6bff" />
    </svg>
  );
}

/** Bảng thành phần điểm: trọng số, giá trị gốc, điểm (và so với team nếu có). */
export function ScoreBreakdown({ result, team }: { result: ScoreResult; team?: ScoreResult }) {
  return (
    <div className="grid gap-2.5">
      {result.parts.map((p) => {
        const t = team?.parts.find((x) => x.key === p.key);
        return (
          <div key={p.key}>
            <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
              <span className={p.score == null ? "text-pf-faint" : "text-pf-body"} title={p.rule}>
                {p.label} <span className="text-[11px] text-pf-faint">· {p.weight}%</span>
              </span>
              <span className="flex items-baseline gap-2">
                <span className="tabular text-[11px] text-pf-faint">{p.raw == null ? "chưa có dữ liệu" : fmtPerf(p.raw, p.rawFormat === "count" ? "score" : p.rawFormat)}</span>
                <span className={cx("tabular text-[12.5px] font-semibold", scoreTone(p.score))}>{p.score == null ? "—" : Math.round(p.score)}</span>
              </span>
            </div>
            <div className="relative mt-1.5 h-[3px] rounded-full bg-pf-bg-deep">
              {p.score != null && <div className="h-full rounded-full bg-pf-primary" style={{ width: `${p.score}%` }} />}
              {t?.score != null && <div className="absolute -top-[3px] h-[9px] w-[2px] rounded bg-pf-body/70" style={{ left: `${t.score}%` }} title={`Trung bình team: ${Math.round(t.score)}`} />}
            </div>
            <p className="mt-1 text-[11px] text-pf-faint">{p.rule}</p>
          </div>
        );
      })}
      <p className="text-[11.5px] text-pf-muted">
        Dựa trên {result.coverage.used}/{result.coverage.total} thành phần có dữ liệu · {result.sample} ticket
        {team && " · vạch trắng = trung bình team"}
      </p>
    </div>
  );
}

export function ChipLinks({ items, active }: { items: { key: string; label: string; href: string }[]; active: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          scroll={false}
          className={cx(
            "rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors duration-150",
            active === i.key ? "border-pf-primary-hi/60 bg-pf-primary/18 text-white" : "border-pf-border text-pf-muted hover:border-pf-primary-hi/50 hover:text-pf-text",
          )}
        >
          {i.label}
        </Link>
      ))}
    </div>
  );
}
