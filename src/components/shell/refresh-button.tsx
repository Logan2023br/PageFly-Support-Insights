"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { buttonClass, cx } from "@/components/ui";

export function RefreshButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  const loading = busy || pending;

  async function refresh() {
    setBusy(true);
    try {
      await fetch("/api/refresh", { method: "POST" });
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={refresh} disabled={loading} className={buttonClass("ghost", "sm", "w-full")}>
      <RefreshCw size={13} strokeWidth={1.75} className={cx(loading && "animate-spin")} />
      {loading ? "Đang đồng bộ…" : "Đồng bộ ngay"}
    </button>
  );
}
