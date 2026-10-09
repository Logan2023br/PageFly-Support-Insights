"use client";

import { AlertTriangle, CheckCircle2, Info, Loader2, RefreshCw, Sparkles, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { Insight, InsightKind } from "@/lib/ai/insights";
import { Badge, buttonClass, cx, InlineError, Panel, Skeleton } from "@/components/ui";

type State =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "loading"; startedAt?: number }
  | { status: "error"; message: string }
  | { status: "done"; insight: Insight; model: string; finishedAt?: number; stale: boolean };

interface JobResponse {
  job: { status: "running" | "done" | "error"; startedAt: number; finishedAt?: number; insight?: Insight; model?: string; error?: string } | null;
  stale: boolean;
  error?: string;
}

function toState(r: JobResponse): State {
  const j = r.job;
  if (!j) return { status: "idle" };
  if (j.status === "running") return { status: "loading", startedAt: j.startedAt };
  if (j.status === "error" || !j.insight) return { status: "error", message: j.error ?? "Không phân tích được" };
  return { status: "done", insight: j.insight, model: j.model ?? "", finishedAt: j.finishedAt, stale: r.stale };
}

async function request(kind: InsightKind, params: Record<string, string>, start: boolean): Promise<State> {
  try {
    const res = start
      ? await fetch("/api/insights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, params }) })
      : await fetch(`/api/insights?kind=${encodeURIComponent(kind)}&params=${encodeURIComponent(JSON.stringify(params))}`, { cache: "no-store" });
    const json = (await res.json()) as JobResponse;
    if (!res.ok) return { status: "error", message: json.error ?? `HTTP ${res.status}` };
    return toState(json);
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Lỗi không xác định" };
  }
}

/**
 * Phân tích AI chạy ngầm ở server và lưu theo từng tài khoản + bộ lọc (kind + params):
 * rời trang / đăng xuất rồi quay lại vẫn thấy kết quả. Đang chạy → hỏi lại mỗi 3s;
 * đã xong → mỗi 30s kiểm tra số liệu có đổi không để báo kết quả đã cũ.
 * `auto`: chưa từng phân tích thì tự bắt đầu.
 */
export function useInsight(kind: InsightKind, params: Record<string, string>, auto = false) {
  const key = JSON.stringify([kind, params]);
  const [entry, setEntry] = useState<{ key: string; state: State } | null>(null);
  const state: State = entry?.key === key ? entry.state : { status: "checking" };

  const run = useCallback(async () => {
    setEntry({ key, state: { status: "loading", startedAt: Date.now() } });
    const next = await request(kind, params, true);
    setEntry((cur) => (cur?.key === key ? { key, state: next } : cur));
    // key gói cả kind lẫn params
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Lần đầu (và khi đổi bộ lọc): đọc kết quả đã lưu.
  useEffect(() => {
    let cancelled = false;
    request(kind, params, false).then((next) => {
      if (cancelled) return;
      if (auto && next.status === "idle") {
        run();
        return;
      }
      setEntry({ key, state: next });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, auto]);

  // Đang chạy: hỏi lại nhanh. Đã xong: kiểm tra số liệu mới theo nhịp tải lại dữ liệu (30s).
  const status = state.status;
  useEffect(() => {
    if (status !== "loading" && status !== "done") return;
    const id = setInterval(
      () => {
        request(kind, params, false).then((next) => setEntry((cur) => (cur?.key === key && next.status !== "idle" ? { key, state: next } : cur)));
      },
      status === "loading" ? 3000 : 30000,
    );
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, status]);

  return { state, run };
}

function fmtClock(ms?: number) {
  if (!ms) return "";
  const iso = new Date(ms + 7 * 3600_000).toISOString();
  return `${iso.slice(11, 16)} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
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
  if (state.status === "checking")
    return (
      <div className="grid gap-2">
        <Skeleton className="h-5 w-1/2" />
      </div>
    );
  if (state.status === "loading")
    return (
      <div className="grid gap-2">
        <p className="flex items-center gap-2 text-[12.5px] text-pf-muted">
          <Loader2 size={14} className="animate-spin text-pf-primary-hi" /> Đang phân tích ngầm{state.startedAt ? ` (bắt đầu ${fmtClock(state.startedAt)})` : ""} — có thể rời trang hoặc đăng xuất, quay lại sẽ thấy kết quả.
        </p>
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
      {state.stale && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-pf-warn/35 bg-pf-warn/[.07] px-3 py-2">
          <p className="flex items-center gap-1.5 text-[12.5px] text-pf-warn">
            <AlertTriangle size={14} strokeWidth={1.75} /> Số liệu đã cập nhật kể từ lần phân tích lúc {fmtClock(state.finishedAt)} — nhận định bên dưới có thể đã cũ.
          </p>
          <button type="button" onClick={onRun} className={buttonClass("primary", "sm")}>
            <RefreshCw size={13} strokeWidth={1.75} /> Phân tích lại
          </button>
        </div>
      )}
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
          {state.finishedAt ? ` · phân tích lúc ${fmtClock(state.finishedAt)}` : ""} · AI có thể sai, đối chiếu số liệu trước khi quyết định.
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
        {state.status === "done" && state.stale && <Badge tone="warn">Có số liệu mới</Badge>}
        {state.status === "loading" && <Badge tone="violet">Đang chạy</Badge>}
      </div>
      <InsightView state={state} onRun={run} />
    </Panel>
  );
}
