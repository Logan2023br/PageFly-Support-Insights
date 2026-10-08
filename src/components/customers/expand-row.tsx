"use client";

import type { ReactNode } from "react";
import { cx } from "@/components/ui";
import { useUrlState } from "@/components/filters/use-url-state";

/** Dòng khách bấm để mở/đóng danh sách các lần liên hệ (giữ trên URL: ?open=domain). Bấm vào link bên trong thì đi link như thường. */
export function ExpandRow({ domain, open, children }: { domain: string; open: boolean; children: ReactNode }) {
  const { update } = useUrlState();
  const toggle = () => update({ open: open ? null : domain, ticket: null }, { replace: true });
  return (
    <tr
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a,button")) return;
        toggle();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      }}
      tabIndex={0}
      aria-expanded={open}
      className={cx(
        "cursor-pointer border-b border-pf-border/60 text-[12.5px] outline-none last:border-0 focus-visible:bg-pf-card",
        open ? "bg-pf-primary/[.08]" : "hover:bg-pf-card/60",
      )}
    >
      {children}
    </tr>
  );
}
