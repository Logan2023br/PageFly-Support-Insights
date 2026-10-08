"use client";

import { CalendarRange, GitCompareArrows, Loader2 } from "lucide-react";
import { useState } from "react";
import { buttonClass, cx } from "@/components/ui";
import { useUrlState } from "./use-url-state";

const RANGES = [
  ["today", "Hôm nay"],
  ["7d", "7 ngày"],
  ["30d", "30 ngày"],
  ["90d", "90 ngày"],
  ["all", "Toàn bộ"],
] as const;

const CATS = [
  ["all", "Tất cả"],
  ["Feedback", "Feedback"],
  ["Issue", "Issue"],
  ["Improve", "Improve"],
] as const;

export interface FilterBarProps {
  range: string;
  from: string;
  to: string;
  cat: string;
  periodLabel: string;
  prevLabel: string | null;
  counts?: Record<string, number>;
  showCat?: boolean;
  showCompare?: boolean;
}

export function FilterBar({ range, from, to, cat, periodLabel, prevLabel, counts, showCat = true, showCompare = true }: FilterBarProps) {
  const { update, pending } = useUrlState();
  const [customOpen, setCustomOpen] = useState(range === "custom");
  const [draft, setDraft] = useState({ from, to });

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {RANGES.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setCustomOpen(false);
                update({ range: key, from: null, to: null, cfrom: null, cto: null, page: null });
              }}
              className={cx(
                "rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors duration-150",
                range === key ? "border-pf-primary-hi bg-pf-primary text-white" : "border-pf-border text-pf-muted hover:border-pf-primary-hi/50 hover:text-pf-text",
              )}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCustomOpen((v) => !v)}
            className={cx(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors duration-150",
              range === "custom" ? "border-pf-primary-hi bg-pf-primary text-white" : "border-pf-border text-pf-muted hover:border-pf-primary-hi/50 hover:text-pf-text",
            )}
          >
            <CalendarRange size={13} strokeWidth={1.75} /> Tuỳ chọn
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {pending && <Loader2 size={15} className="animate-spin text-pf-muted" aria-label="Đang tải" />}
          <span className="tabular text-[12px] text-pf-muted">{periodLabel}</span>
          {showCompare && prevLabel && (
            <button type="button" onClick={() => update({ compare: "1" })} className={buttonClass("primary", "sm")} title={`So với ${prevLabel}`}>
              <GitCompareArrows size={14} strokeWidth={1.75} /> Compare
            </button>
          )}
        </div>
      </div>

      {customOpen && (
        <form
          className="flex flex-wrap items-end gap-2 rounded-[16px] border border-pf-border bg-pf-card p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.from && draft.to) update({ range: "custom", from: draft.from, to: draft.to, cfrom: null, cto: null, page: null });
          }}
        >
          <label className="grid gap-1.5 text-[12px] font-semibold text-pf-body">
            Từ ngày
            <input type="date" value={draft.from} max={draft.to} onChange={(e) => setDraft({ ...draft, from: e.target.value })} className="h-9 rounded-[12px] border border-pf-border bg-pf-bg-deep px-3 text-[13px] text-pf-text outline-none focus:border-pf-primary-hi" />
          </label>
          <label className="grid gap-1.5 text-[12px] font-semibold text-pf-body">
            Đến ngày
            <input type="date" value={draft.to} min={draft.from} onChange={(e) => setDraft({ ...draft, to: e.target.value })} className="h-9 rounded-[12px] border border-pf-border bg-pf-bg-deep px-3 text-[13px] text-pf-text outline-none focus:border-pf-primary-hi" />
          </label>
          <button type="submit" className={buttonClass("primary", "sm", "h-9")}>
            Áp dụng
          </button>
          <p className="basis-full text-[11.5px] text-pf-faint">Compare sẽ tự so với khoảng liền trước có cùng số ngày (vd. 20–23 so với 16–19).</p>
        </form>
      )}

      {showCat && (
        <div className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl border border-pf-border bg-white/[.02] p-1">
          {CATS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => update({ cat: key === "all" ? null : key, tile: null, page: null })}
              className={cx(
                "whitespace-nowrap rounded-[9px] px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors duration-150",
                cat === key ? "bg-pf-primary/14 text-white ring-1 ring-pf-primary-hi/40" : "text-pf-muted hover:text-pf-text",
              )}
            >
              {label}
              {counts && <span className="tabular ml-1.5 opacity-70">{(counts[key] ?? 0).toLocaleString("vi-VN")}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
