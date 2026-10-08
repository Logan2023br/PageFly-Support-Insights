"use client";

import { GitCompareArrows, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Comparison } from "@/lib/metrics/compute";
import { formatDelta, formatValue } from "@/lib/metrics/compute";
import { CompareLineChart } from "@/components/charts/charts";
import { InsightView, useInsight } from "@/components/ai/ai-panel";
import { useUrlState } from "@/components/filters/use-url-state";
import { AlertBadge, buttonClass, cx, Delta, Panel } from "@/components/ui";

export interface CompareViewProps {
  periodLabel: string;
  prevLabel: string;
  prevFrom: string;
  prevTo: string;
  metrics: Comparison[];
  byIssue: Comparison[];
  byCategory: Comparison[];
  byRoot: Comparison[];
  current: { day: string; v: number }[];
  previous: { day: string; v: number }[];
  params: Record<string, string>;
  aiEnabled: boolean;
}

const TABS = [
  ["metrics", "Chỉ số"],
  ["byIssue", "Theo nhóm issue"],
  ["byCategory", "Theo loại ticket"],
  ["byRoot", "Theo nguyên nhân"],
] as const;

export function CompareView(props: CompareViewProps) {
  const { update } = useUrlState();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("metrics");
  const [onlyNotable, setOnlyNotable] = useState(false);
  const [custom, setCustom] = useState({ from: props.prevFrom, to: props.prevTo });
  const aiParams = useMemo(() => ({ ...props.params, compare: "" }), [props.params]);
  const { state, run } = useInsight("compare", aiParams, props.aiEnabled);

  const notes = useMemo(() => {
    const m = new Map<string, string>();
    if (state.status === "done") for (const n of state.insight.metricNotes) m.set(n.key, n.comment);
    return m;
  }, [state]);

  const updateRef = useRef(update);
  useEffect(() => {
    updateRef.current = update;
  }, [update]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && updateRef.current({ compare: null });
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, []);

  const alerts = [...props.metrics, ...props.byIssue].filter((r) => r.alert);
  const rows = (props[tab] as Comparison[]).filter((r) => !onlyNotable || r.alert || r.tone !== "neutral");

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-3 backdrop-blur-sm sm:p-6" onClick={() => update({ compare: null })}>
      <div className="relative w-full max-w-[1180px]" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal aria-label="So sánh kỳ">
        <Panel className="bg-pf-bg-alt p-4 shadow-pf-float sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-pf-border pb-4">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-pf-primary-hi">
                <GitCompareArrows size={13} strokeWidth={1.75} /> Compare
              </div>
              <h2 className="mt-1 font-display text-[20px] font-bold tracking-[-0.02em] text-white">
                {props.periodLabel} <span className="text-pf-muted">so với</span> {props.prevLabel}
              </h2>
              <p className="mt-1 text-[12.5px] text-pf-muted">
                {alerts.length ? (
                  <>
                    <span className="font-semibold text-pf-danger">{alerts.filter((a) => a.alert === "critical").length} báo động</span> ·{" "}
                    <span className="font-semibold text-pf-warn">{alerts.filter((a) => a.alert === "warning").length} cần theo dõi</span>
                  </>
                ) : (
                  "Không có chỉ số nào vượt ngưỡng báo động."
                )}
              </p>
            </div>
            <div className="flex items-end gap-2">
              <form
                className="hidden items-end gap-1.5 sm:flex"
                onSubmit={(e) => {
                  e.preventDefault();
                  update({ cfrom: custom.from, cto: custom.to });
                }}
              >
                <label className="grid gap-1 text-[11px] font-semibold text-pf-muted">
                  Kỳ so sánh
                  <span className="flex gap-1">
                    <input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="h-8 rounded-[10px] border border-pf-border bg-pf-bg-deep px-2 text-[12px] text-pf-text outline-none focus:border-pf-primary-hi" />
                    <input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="h-8 rounded-[10px] border border-pf-border bg-pf-bg-deep px-2 text-[12px] text-pf-text outline-none focus:border-pf-primary-hi" />
                  </span>
                </label>
                <button type="submit" className={buttonClass("ghost", "sm")}>
                  Đổi
                </button>
              </form>
              <button type="button" onClick={() => update({ compare: null })} className={buttonClass("quiet", "sm", "size-8 px-0")} aria-label="Đóng">
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="grid gap-4 pt-4 lg:grid-cols-[1.1fr_1fr]">
            <div>
              <div className="mb-2 text-[12px] font-semibold text-pf-muted">Số ticket theo ngày</div>
              <CompareLineChart current={props.current} previous={props.previous} currentLabel={`Kỳ này · ${props.periodLabel}`} previousLabel={`Kỳ trước · ${props.prevLabel}`} />
            </div>
            <div className="pf-scroll max-h-[340px] overflow-y-auto rounded-[16px] border border-pf-border bg-white/[.02] p-3.5">
              <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-pf-violet">
                <Sparkles size={13} strokeWidth={1.75} /> Nhận định AI
              </div>
              {props.aiEnabled ? (
                <InsightView state={state} onRun={run} compact />
              ) : (
                <p className="text-[12.5px] text-pf-muted">Thêm ANTHROPIC_API_KEY vào .env.local để bật nhận định AI. Nhận định theo luật vẫn hiển thị ở bảng bên dưới.</p>
              )}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl border border-pf-border bg-white/[.02] p-1">
              {TABS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={cx("whitespace-nowrap rounded-[9px] px-3 py-1.5 text-[12.5px] font-semibold", tab === key ? "bg-pf-primary/14 text-white ring-1 ring-pf-primary-hi/40" : "text-pf-muted hover:text-pf-text")}
                >
                  {label}
                  <span className="ml-1.5 opacity-70">{(props[key] as Comparison[]).filter((r) => r.alert).length || ""}</span>
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-[12px] text-pf-muted">
              <input type="checkbox" checked={onlyNotable} onChange={(e) => setOnlyNotable(e.target.checked)} className="accent-pf-primary" />
              Chỉ hiện thay đổi đáng chú ý
            </label>
          </div>

          <div className="pf-scroll mt-3 overflow-x-auto rounded-[16px] border border-pf-border">
            <table className="w-full min-w-[880px] border-collapse text-left">
              <thead>
                <tr className="border-b border-pf-border text-[11px] uppercase tracking-[0.06em] text-pf-faint">
                  <th className="px-4 py-3 font-semibold">Chỉ số</th>
                  <th className="px-4 py-3 text-right font-semibold">Kỳ này</th>
                  <th className="px-4 py-3 text-right font-semibold">Kỳ trước</th>
                  <th className="px-4 py-3 font-semibold">Thay đổi</th>
                  <th className="px-4 py-3 font-semibold">Đánh giá</th>
                  <th className="w-[44%] px-4 py-3 font-semibold">Nhận định</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const ai = notes.get(r.key) ?? notes.get(r.label);
                  return (
                    <tr key={r.key} className={cx("border-b border-pf-border/60 text-[12.5px] last:border-0", r.alert === "critical" && "bg-pf-danger/[.05]")}>
                      <td className="px-4 py-3 align-top font-semibold text-white">{r.label}</td>
                      <td className="tabular px-4 py-3 text-right align-top font-semibold text-white">{formatValue(r.current, r.format)}</td>
                      <td className="tabular px-4 py-3 text-right align-top text-pf-muted">{formatValue(r.previous, r.format)}</td>
                      <td className="whitespace-nowrap px-4 py-3 align-top">
                        {r.delta != null ? (
                          <span className="grid gap-0.5">
                            <Delta delta={r.delta} tone={r.tone} text={formatDelta(r.delta, r.format)} />
                            {r.pct != null && Number.isFinite(r.pct) && r.delta !== 0 && <span className="tabular text-[11px] text-pf-faint">{`${r.pct > 0 ? "+" : "−"}${Math.round(Math.abs(r.pct) * 100)}%`}</span>}
                          </span>
                        ) : (
                          <span className="text-pf-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        {r.alert ? <AlertBadge level={r.alert} /> : r.tone === "good" ? <span className="text-[11.5px] font-semibold text-pf-success">Tốt</span> : <span className="text-pf-faint">—</span>}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <p className="text-[12px] leading-relaxed text-pf-muted">{r.note}</p>
                        {ai && (
                          <p className="mt-1.5 flex gap-1.5 text-[12px] leading-relaxed text-pf-violet">
                            <Sparkles size={12} strokeWidth={1.75} className="mt-[3px] shrink-0" />
                            {ai}
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!rows.length && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-[13px] text-pf-muted">
                      Không có thay đổi đáng chú ý.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}
