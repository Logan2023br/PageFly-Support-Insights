"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";

export const SERIES = {
  Feedback: "#3987e5",
  Issue: "#d95926",
  Improve: "#199e70",
} as const;
const SURFACE = "#120d22";
const AXIS = "rgba(231,228,245,0.38)";
const GRID = "rgba(255,255,255,0.06)";

const fmtDay = (key: string) => {
  const [, m, d] = key.split("→")[0].split("-");
  return `${d}/${m}`;
};

function Tip({ active, payload, label, fmtLabel }: Partial<TooltipContentProps<number, string>> & { fmtLabel?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (Number(p.value) || 0), 0);
  return (
    <div className="min-w-[160px] rounded-[12px] border border-pf-border bg-pf-bg-deep px-3 py-2.5 text-[11.5px] shadow-pf-float">
      <div className="mb-1.5 font-semibold text-pf-text">{fmtLabel ? fmtLabel(String(label)) : String(label)}</div>
      <div className="grid gap-1">
        {payload.map((p) => (
          <div key={String(p.dataKey)} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-pf-muted">
              <span className="size-2 rounded-full" style={{ background: p.color }} />
              {p.name}
            </span>
            <span className="tabular font-semibold text-pf-text">{p.value}</span>
          </div>
        ))}
        {payload.length > 1 && (
          <div className="mt-1 flex justify-between border-t border-pf-border pt-1 text-pf-muted">
            <span>Tổng</span>
            <span className="tabular font-semibold text-pf-text">{total}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-3 text-[11.5px] text-pf-muted">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          {i.dashed ? <span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: i.color }} /> : <span className="size-2.5 rounded-[3px]" style={{ background: i.color }} />}
          {i.label}
        </span>
      ))}
    </div>
  );
}

export interface VolumePoint {
  label: string;
  Feedback: number;
  Issue: number;
  Improve: number;
}

/** Cột chồng theo ngày: Feedback / Issue / Improve. */
export function VolumeChart({ data, keys = ["Issue", "Feedback", "Improve"] }: { data: VolumePoint[]; keys?: ("Feedback" | "Issue" | "Improve")[] }) {
  return (
    <div className="grid gap-2">
      <Legend items={keys.map((k) => ({ label: k, color: SERIES[k] }))} />
      <div className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 640, height: 240 }}>
          <BarChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" tickFormatter={fmtDay} tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={14} />
            <YAxis allowDecimals={false} tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
            <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<Tip fmtLabel={(l) => l.split("→").map((x) => fmtDay(x)).join(" – ")} />} />
            {keys.map((k, i) => (
              <Bar key={k} dataKey={k} name={k} stackId="v" fill={SERIES[k]} stroke={SURFACE} strokeWidth={1} radius={i === keys.length - 1 ? [4, 4, 0, 0] : 0} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Kỳ hiện tại vs kỳ trước, căn theo thứ tự ngày (ngày 1, ngày 2, ...). */
export function CompareLineChart({ current, previous, currentLabel, previousLabel }: { current: { day: string; v: number }[]; previous: { day: string; v: number }[]; currentLabel: string; previousLabel: string }) {
  const data = current.map((c, i) => ({ idx: i + 1, cur: c.v, prev: previous[i]?.v ?? null, curDay: c.day, prevDay: previous[i]?.day }));
  return (
    <div className="grid gap-2">
      <Legend
        items={[
          { label: currentLabel, color: "#9a6bff" },
          { label: previousLabel, color: "rgba(231,228,245,0.55)", dashed: true },
        ]}
      />
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 640, height: 240 }}>
          <LineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="idx" tickFormatter={(i) => (data[i - 1] ? fmtDay(data[i - 1].curDay) : "")} tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={14} />
            <YAxis allowDecimals={false} tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
            <Tooltip
              cursor={{ stroke: "rgba(255,255,255,0.2)" }}
              content={
                <Tip
                  fmtLabel={(l) => {
                    const row = data[Number(l) - 1];
                    return row ? `${fmtDay(row.curDay)} vs ${row.prevDay ? fmtDay(row.prevDay) : "—"}` : "";
                  }}
                />
              }
            />
            <Line type="monotone" dataKey="prev" name="Kỳ trước" stroke="rgba(231,228,245,0.55)" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="cur" name="Kỳ này" stroke="#9a6bff" strokeWidth={2} dot={{ r: 3, fill: "#9a6bff", stroke: SURFACE, strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export type TrendFormat = "count" | "pct" | "duration" | "money" | "score" | "score5";

function fmtTrend(v: number | null | undefined, f: TrendFormat, axis = false): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (f === "pct") return `${Math.round(v * 100)}%`;
  if (f === "score") return axis ? String(Math.round(v)) : `${Math.round(v)} điểm`;
  if (f === "money") return `$${Math.round(v)}`;
  if (f === "score5") return v.toFixed(1);
  if (f === "duration") {
    if (v >= 3600) return `${(v / 3600).toFixed(1).replace(".0", "")}h`;
    if (v >= 60) return `${Math.round(v / 60)}m`;
    return `${Math.round(v)}s`;
  }
  return String(Math.round(v * 10) / 10);
}

export interface TrendSeries {
  key: string;
  label: string;
  color: string;
  dashed?: boolean;
}

/** Biểu đồ đường theo mốc thời gian, nhiều series (vd. một người vs trung bình team). */
export function TrendChart({
  data,
  series,
  format,
  height = 240,
  sampleKey,
}: {
  data: Record<string, string | number | null>[];
  series: TrendSeries[];
  format: TrendFormat;
  height?: number;
  /** Key chứa số ticket của mốc, hiện trong tooltip để biết mốc nào ít mẫu. */
  sampleKey?: string;
}) {
  const domain: [number, number] | undefined = format === "score" ? [0, 100] : format === "pct" ? [0, 1] : format === "score5" ? [1, 5] : undefined;
  return (
    <div className="grid gap-2">
      {series.length > 1 && <Legend items={series.map((s) => ({ label: s.label, color: s.color, dashed: s.dashed }))} />}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 640, height }}>
          <LineChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={16} />
            <YAxis domain={domain} tickFormatter={(v) => fmtTrend(v, format, true)} tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} width={52} />
            <Tooltip
              cursor={{ stroke: "rgba(255,255,255,0.2)" }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as Record<string, number | null>;
                return (
                  <div className="min-w-[180px] rounded-[12px] border border-pf-border bg-pf-bg-deep px-3 py-2.5 text-[11.5px] shadow-pf-float">
                    <div className="mb-1.5 font-semibold text-pf-text">
                      {String(label)}
                      {row.prevDay != null && <span className="font-normal text-pf-muted"> vs {String(row.prevDay)}</span>}
                    </div>
                    {payload.map((p) => (
                      <div key={String(p.dataKey)} className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-1.5 text-pf-muted">
                          <span className="size-2 rounded-full" style={{ background: p.color }} />
                          {p.name}
                        </span>
                        <span className="tabular font-semibold text-pf-text">{fmtTrend(p.value as number, format)}</span>
                      </div>
                    ))}
                    {sampleKey && row[sampleKey] != null && <div className="mt-1 border-t border-pf-border pt-1 text-pf-faint">{row[sampleKey]} ticket trong mốc này</div>}
                  </div>
                );
              }}
            />
            {series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2}
                strokeDasharray={s.dashed ? "5 4" : undefined}
                dot={s.dashed ? false : { r: 3, fill: s.color, stroke: SURFACE, strokeWidth: 2 }}
                activeDot={{ r: 5 }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Biểu đồ đường nhỏ trong ô KPI: kỳ này (tím) vs kỳ trước (đứt nét), căn theo thứ tự mốc. */
export function KpiTrend({
  data,
  format,
}: {
  data: { label: string; prevLabel: string | null; cur: number | null; prev: number | null }[];
  format: TrendFormat;
}) {
  if (data.filter((d) => d.cur != null).length < 2) return <div className="grid h-[64px] place-items-center text-[11px] text-pf-faint">Chưa đủ mốc để vẽ xu hướng</div>;
  const domain: [number, number] | undefined = format === "pct" ? [0, 1] : format === "score5" ? [1, 5] : undefined;
  return (
    <div className="h-[64px]">
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 240, height: 64 }}>
        <LineChart data={data} margin={{ top: 6, right: 4, left: 4, bottom: 2 }}>
          <YAxis hide domain={domain ?? ["auto", "auto"]} />
          <XAxis dataKey="label" hide />
          <Tooltip
            cursor={{ stroke: "rgba(255,255,255,0.18)" }}
            wrapperStyle={{ zIndex: 30 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as (typeof data)[number];
              return (
                <div className="min-w-[150px] rounded-[10px] border border-pf-border bg-pf-bg-deep px-2.5 py-2 text-[11px] shadow-pf-float">
                  <div className="flex justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-pf-muted">
                      <span className="size-2 rounded-full bg-[#9a6bff]" />
                      {fmtDay(row.label)}
                    </span>
                    <span className="tabular font-semibold text-pf-text">{fmtTrend(row.cur, format)}</span>
                  </div>
                  {row.prevLabel && (
                    <div className="mt-0.5 flex justify-between gap-3">
                      <span className="flex items-center gap-1.5 text-pf-muted">
                        <span className="h-0 w-2.5 border-t-2 border-dashed border-[rgba(231,228,245,0.55)]" />
                        {fmtDay(row.prevLabel)}
                      </span>
                      <span className="tabular text-pf-body">{fmtTrend(row.prev, format)}</span>
                    </div>
                  )}
                </div>
              );
            }}
          />
          <Line type="monotone" dataKey="prev" stroke="rgba(231,228,245,0.45)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls isAnimationActive={false} />
          <Line type="monotone" dataKey="cur" stroke="#9a6bff" strokeWidth={2} dot={false} activeDot={{ r: 3.5, stroke: SURFACE, strokeWidth: 2 }} connectNulls isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Đường xu hướng nhỏ qua các kỳ báo cáo (tuần / tháng / quý). Điểm `highlight` là kỳ đang xem. */
export function PeriodTrend({ data, format, highlight }: { data: { label: string; v: number | null }[]; format: TrendFormat; highlight?: number }) {
  if (data.filter((d) => d.v != null).length < 2) return <div className="grid h-[56px] place-items-center text-[11px] text-pf-faint">Chưa đủ kỳ để vẽ xu hướng</div>;
  const domain: [number, number] | undefined = format === "pct" ? [0, 1] : format === "score5" ? [1, 5] : undefined;
  return (
    <div className="h-[56px]">
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 240, height: 56 }}>
        <LineChart data={data} margin={{ top: 6, right: 4, left: 4, bottom: 2 }}>
          <YAxis hide domain={domain ?? ["auto", "auto"]} />
          <XAxis dataKey="label" hide />
          <Tooltip
            cursor={{ stroke: "rgba(255,255,255,0.18)" }}
            wrapperStyle={{ zIndex: 30 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as (typeof data)[number];
              return (
                <div className="rounded-[10px] border border-pf-border bg-pf-bg-deep px-2.5 py-1.5 text-[11px] shadow-pf-float">
                  <span className="text-pf-muted">{row.label}: </span>
                  <span className="tabular font-semibold text-pf-text">{fmtTrend(row.v, format)}</span>
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="v"
            stroke="#9a6bff"
            strokeWidth={2}
            connectNulls
            isAnimationActive={false}
            dot={(p: { cx?: number; cy?: number; index?: number }) =>
              p.index === highlight && p.cx != null && p.cy != null ? <circle key="hl" cx={p.cx} cy={p.cy} r={3.5} fill="#9a6bff" stroke={SURFACE} strokeWidth={2} /> : <g key={`d${p.index}`} />
            }
            activeDot={{ r: 3.5, stroke: SURFACE, strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
