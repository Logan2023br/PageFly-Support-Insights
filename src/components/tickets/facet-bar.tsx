"use client";

import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui";
import { useUrlState } from "@/components/filters/use-url-state";

export interface FacetOption {
  value: string;
  count: number;
}
export interface FacetDef {
  key: string;
  label: string;
  options: FacetOption[];
  selected: string[];
}

export function SearchBox({ initial, placeholder = "Tìm theo tóm tắt, store, FL, session, nguyên nhân…" }: { initial: string; placeholder?: string }) {
  const { update } = useUrlState();
  const [value, setValue] = useState(initial);
  // Giữ update mới nhất trong ref: update đổi danh tính mỗi lần URL đổi, nếu đưa vào deps
  // thì effect sẽ chạy lại sau mỗi lần điều hướng và tạo vòng lặp tải lại vô hạn.
  const updateRef = useRef(update);
  useEffect(() => {
    updateRef.current = update;
  }, [update]);
  const lastSent = useRef(initial);

  useEffect(() => {
    if (value === lastSent.current) return;
    const id = setTimeout(() => {
      lastSent.current = value;
      updateRef.current({ q: value || null, page: null }, { replace: true });
    }, 300);
    return () => clearTimeout(id);
  }, [value]);

  return (
    <div className="relative min-w-[220px] flex-1">
      <Search size={15} strokeWidth={1.75} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-pf-faint" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-[12px] border border-pf-border bg-pf-bg-deep pl-9 pr-3 text-[13px] text-pf-text outline-none placeholder:text-pf-faint focus:border-pf-primary-hi"
      />
    </div>
  );
}

export function FacetBar({ facets }: { facets: FacetDef[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap gap-1.5">
      {facets.map((f) => (
        <FacetDropdown key={f.key} facet={f} open={open === f.key} onOpen={(v) => setOpen(v ? f.key : null)} />
      ))}
    </div>
  );
}

function FacetDropdown({ facet, open, onOpen }: { facet: FacetDef; open: boolean; onOpen: (v: boolean) => void }) {
  const { update } = useUrlState();
  const ref = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState("");
  const active = facet.selected.length > 0;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpen]);

  const toggle = (value: string) => {
    const next = facet.selected.includes(value) ? facet.selected.filter((v) => v !== value) : [...facet.selected, value];
    update({ [`f_${facet.key}`]: next.length ? next.join("|") : null, page: null });
  };
  const options = facet.options.filter((o) => !filter || o.value.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => onOpen(!open)}
        className={cx(
          "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors duration-150",
          active ? "border-pf-primary-hi bg-pf-primary text-white" : "border-pf-border text-pf-muted hover:border-pf-primary-hi/50 hover:text-pf-text",
        )}
      >
        {facet.label}
        {active && <span className="tabular ml-0.5 text-white/75">{facet.selected.length}</span>}
        <ChevronDown size={13} strokeWidth={1.75} className={cx("transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-40 w-[280px] rounded-[14px] border border-pf-border bg-pf-bg-deep p-2 shadow-pf-float">
          {facet.options.length > 8 && (
            <input
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Lọc giá trị…"
              className="mb-1.5 h-8 w-full rounded-[10px] border border-pf-border bg-pf-bg px-2.5 text-[12px] text-pf-text outline-none placeholder:text-pf-faint focus:border-pf-primary-hi"
            />
          )}
          <ul className="pf-scroll grid max-h-[300px] gap-0.5 overflow-y-auto">
            {options.map((o) => {
              const checked = facet.selected.includes(o.value);
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    onClick={() => toggle(o.value)}
                    className={cx("flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[12.5px] hover:bg-pf-card-hi", checked ? "text-white" : "text-pf-body")}
                  >
                    <span className={cx("grid size-4 shrink-0 place-items-center rounded-[5px] border", checked ? "border-pf-primary-hi bg-pf-primary" : "border-pf-border-hi")}>{checked && <Check size={11} strokeWidth={2.5} />}</span>
                    <span className="flex-1 truncate">{o.value}</span>
                    <span className="tabular text-[11px] text-pf-faint">{o.count}</span>
                  </button>
                </li>
              );
            })}
            {!options.length && <li className="px-2 py-3 text-center text-[12px] text-pf-faint">Không có giá trị</li>}
          </ul>
          {active && (
            <button type="button" onClick={() => update({ [`f_${facet.key}`]: null, page: null })} className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-[8px] py-1.5 text-[12px] text-pf-faint hover:text-pf-text">
              <X size={12} /> Bỏ chọn
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function ColumnPresets({ value, presets }: { value: string; presets: [string, string][] }) {
  const { update } = useUrlState();
  return (
    <div className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl border border-pf-border bg-white/[.02] p-1">
      {presets.map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => update({ cols: key === "compact" ? null : key })}
          className={cx("whitespace-nowrap rounded-[9px] px-3 py-1 text-[12px] font-semibold", value === key ? "bg-pf-primary/14 text-white ring-1 ring-pf-primary-hi/40" : "text-pf-muted hover:text-pf-text")}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
