"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { buttonClass } from "@/components/ui";

export function CopyField({ value, mono = true }: { value: string; mono?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-stretch gap-2">
      <code className={`pf-scroll flex min-w-0 flex-1 items-center overflow-x-auto whitespace-nowrap rounded-[12px] border border-pf-border bg-pf-bg-deep px-3 py-2 text-[12.5px] text-pf-violet ${mono ? "font-mono" : ""}`}>{value}</code>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }}
        className={buttonClass("ghost", "sm", "h-auto shrink-0")}
      >
        {done ? <Check size={14} className="text-pf-success" /> : <Copy size={14} strokeWidth={1.75} />}
        {done ? "Đã copy" : "Copy"}
      </button>
    </div>
  );
}
