"use client";

import { AlertTriangle, CheckCircle2, Info, Sparkles, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { Insight, InsightKind } from "@/lib/ai/insights";
import { Badge, buttonClass, cx, InlineError, Panel, Skeleton } from "@/components/ui";

type State = { status: "idle" } | { status: "loading" } | { status: "error"; message: string } | { status: "done"; insight: Insight; cached: boolean; model: string };

async function fetchInsight(kind: InsightKind, params: Record<string, string>): Promise<State> {
  try {
    const res = await fetch("/api/insights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, params }) });
    const json = await res.json();
    if (!res.ok) return { status: "error", message: json.error ?? `HTTP ${res.status}` };
    return { status: "done", ...json };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Lỗi không xác định" };
  }
}

/** Kết quả gắn với khoá (kind + params): đổi bộ lọc thì kết quả cũ tự bỏ đi. */
export function useInsight(kind: InsightKind, params: Record<string, string>, auto = false) {
  const key = JSON.stringify([kind, params]);
  const [entry, setEntry] = useState<{ key: string; state: State } | null>(null);

  const run = useCallback(async () => {
    setEntry({ key, state: { status: "loading" } });
    const state = await fetchInsight(kind, params);
    setEntry((cur) => (cur?.key === key ? { key, state } : cur));
    // key gói cả kind lẫn params
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!auto) return;
    let cancelled = false;
    fetchInsight(kind, params).then((state) => !cancelled && setEntry({ key, state }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, auto]);

  const state: State = entry?.key === key ? entry.state : auto ? { status: "loading" } : { status: "idle" };
  return { state, run };
}

const SEVERITY = {
  critical: { tone: "danger" as const, icon: AlertTriangle, label: "Báo động" },
  warning: { tone: "warn" as const, icon: AlertTriangle, label: "Theo dõi" },
  info: { tone: "neutral" as const, icon: Info, label: "Thông tin" },
  positive: { tone: "success" as const, icon: TrendingUp, label: "Tích cực" },
};

export function InsightView({ state, onRun, compact }: { state: State; onRun: () => void; compact?: boolean }) {
  if (state.status === "idle")
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] text-pf-muted">Số liệu đã tính sẵn bằng code. AI (Claude Haiku) chỉ đọc số liệu này để viết nhận định, giải thích nguyên nhân và đề xuất việc cần làm.</p>
        <button type="button" onClick={onRun} className={buttonClass("primary", "sm")}>
          <Sparkles size={14} strokeWidth={1.75} /> Phân tích bằng AI
        </button>
      </div>
    );
  if (state.status === "loading")
    return (
      <div className="grid gap-2">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    );
  if (state.status === "error")
    return (
      <div className="grid gap-2">
        <InlineError>{state.message}</InlineError>
        <button type="button" onClick={onRun} className={buttonClass("ghost", "sm", "w-fit")}>
          Thử lại
        </button>
      </div>
    );

  const { insight } = state;
  return (
    <div className="grid gap-3">
      <p className="font-display text-[15px] font-semibold leading-snug tracking-[-0.01em] text-white">{insight.headline}</p>
      <div className={cx("grid gap-2", !compact && "md:grid-cols-2")}>
        {insight.insights.map((it, i) => {
          const s = SEVERITY[it.severity];
          return (
            <div key={i} className="rounded-[14px] border border-pf-border bg-white/[.02] p-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-[12.5px] font-semibold text-pf-text">{it.title}</span>
                <Badge tone={s.tone}>
                  <s.icon size={11} strokeWidth={2} /> {s.label}
                </Badge>
              </div>
              <p className="text-[12px] leading-relaxed text-pf-muted">{it.detail}</p>
            </div>
          );
        })}
      </div>
      {insight.actions.length > 0 && (
        <div className="rounded-[14px] border border-pf-primary-hi/30 bg-pf-primary/[.07] p-3">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-pf-violet">Việc nên làm</div>
          <ul className="grid gap-1">
            {insight.actions.map((a, i) => (
              <li key={i} className="flex gap-2 text-[12.5px] text-pf-body">
                <CheckCircle2 size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-pf-primary-hi" />
                <span>
                  <span className="font-semibold text-white">{a.owner}:</span> {a.action}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex items-center justify-between text-[11px] text-pf-faint">
        <span>
          {state.model}
          {state.cached ? " · kết quả cache" : ""} · AI có thể sai, đối chiếu số liệu trước khi quyết định.
        </span>
        <button type="button" onClick={onRun} className="underline-offset-2 hover:text-pf-muted hover:underline">
          Phân tích lại
        </button>
      </div>
    </div>
  );
}

export function AiPanel({ kind, params, title = "Nhận định AI" }: { kind: InsightKind; params: Record<string, string>; title?: string }) {
  const { state, run } = useInsight(kind, params);
  return (
    <Panel className="p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid size-6 place-items-center rounded-[8px] bg-pf-primary/20 text-pf-violet">
          <Sparkles size={13} strokeWidth={1.75} />
        </span>
        <h2 className="text-[13.5px] font-semibold text-pf-text">{title}</h2>
      </div>
      <InsightView state={state} onRun={run} />
    </Panel>
  );
}
