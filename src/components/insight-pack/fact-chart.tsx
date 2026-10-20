"use client";

import { TrendChart } from "@/components/charts/charts";
import type { PackFact } from "@/lib/insight-pack/types";

/** Vẽ một bằng chứng: chuỗi 8 kỳ → biểu đồ đường; bảng xếp hạng → thanh ngang. Số liệu lấy từ kho (code tính), không từ AI. */
export function FactChart({ fact, height = 200 }: { fact: PackFact; height?: number }) {
  return (
    <div className="rounded-[16px] border border-pf-border bg-white/[.02] p-3.5">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[12.5px] font-semibold text-white">{fact.label}</span>
        {fact.value && (
          <span className="text-[11.5px] text-pf-muted">
            <b className="text-white">{fact.value}</b>
            {fact.prev ? ` · trước ${fact.prev}` : ""}
          </span>
        )}
      </div>
      {fact.series?.length ? (
        <TrendChart data={fact.series.map((s) => ({ label: s.label, v: s.v }))} series={[{ key: "v", label: fact.label, color: "#9a6bff" }]} format={fact.seriesFormat ?? "count"} height={height} />
      ) : (
        <FactRows fact={fact} max={10} />
      )}
      {fact.series?.length ? <p className="mt-1.5 text-[11px] text-pf-faint">8 kỳ liên tiếp cùng độ dài, mốc cuối là kỳ của pack (ghi theo ngày bắt đầu mỗi kỳ).</p> : null}
    </div>
  );
}

export function FactRows({ fact, max = 8 }: { fact: PackFact; max?: number }) {
  const rows = (fact.rows ?? []).slice(0, max);
  if (!rows.length) return <p className="text-[12px] text-pf-faint">Không có dữ liệu.</p>;
  const peak = Math.max(...rows.map((r) => Math.abs(r.value)), 1);
  return (
    <ul className="grid gap-2">
      {rows.map((r, i) => (
        <li key={`${r.key}-${i}`}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 text-[12px] leading-snug text-pf-body">{r.key}</span>
            <span className="tabular shrink-0 text-[12px] font-semibold text-white">{r.display ?? r.value}</span>
          </div>
          {r.extra && <div className="text-[11px] leading-snug text-pf-faint">{r.extra}</div>}
          <div className="mt-1 h-[3px] rounded-full bg-pf-bg-deep">
            <div className="h-full rounded-full bg-pf-primary" style={{ width: `${(Math.abs(r.value) / peak) * 100}%` }} />
          </div>
        </li>
      ))}
      {(fact.rows?.length ?? 0) > max && <li className="text-[11px] text-pf-faint">+ {(fact.rows?.length ?? 0) - max} dòng khác</li>}
    </ul>
  );
}
