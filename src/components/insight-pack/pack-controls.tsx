"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, Trash2 } from "lucide-react";
import { FOCUS_LABEL, type InsightPack, type PackIndexEntry } from "@/lib/insight-pack/types";
import { cx } from "@/components/ui";

const selectCls = "h-8 rounded-[10px] border border-pf-border bg-pf-bg-deep px-2 text-[12px] text-pf-body";

/** Chọn tuần + (admin) tạo / xoá pack. */
export function PackControls({ list, selected, isAdmin }: { list: PackIndexEntry[]; selected: string | null; isAdmin: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const create = (which: "last" | "current") =>
    start(async () => {
      const res = await fetch("/api/insight-pack", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ which }) });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !data.id) return setMsg(data.error ?? "Không tạo được");
      setMsg(null);
      router.push(`/insights?pack=${encodeURIComponent(data.id)}`);
      router.refresh();
    });
  const remove = () =>
    selected &&
    start(async () => {
      await fetch(`/api/insight-pack?id=${encodeURIComponent(selected)}`, { method: "DELETE" });
      router.push("/insights");
      router.refresh();
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {list.length > 0 && (
        <select value={selected ?? ""} onChange={(e) => router.push(`/insights?pack=${encodeURIComponent(e.target.value)}`)} aria-label="Chọn tuần" className={selectCls}>
          {list.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
              {e.status === "running" ? " · đang tạo" : e.status === "error" ? " · lỗi" : ` · ${e.count} insight`}
            </option>
          ))}
        </select>
      )}
      {isAdmin && (
        <>
          <button type="button" disabled={pending} onClick={() => create("last")} className="inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-pf-primary px-3 text-[12px] font-semibold text-white disabled:opacity-50" title="Phân tích tuần đã kết thúc gần nhất (thứ 2 – chủ nhật). Tạo lại sẽ ghi đè bản cũ.">
            {pending ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} strokeWidth={1.75} />} Tạo pack tuần trước
          </button>
          <button type="button" disabled={pending} onClick={() => create("current")} className="inline-flex h-8 items-center rounded-[10px] border border-pf-border px-3 text-[12px] font-semibold text-pf-body hover:border-pf-border-hi disabled:opacity-50" title="Phân tích từ thứ 2 tuần này đến hôm nay">
            Tuần này (đến nay)
          </button>
          {selected && (
            <button type="button" disabled={pending} onClick={remove} title="Xoá pack này" aria-label="Xoá pack" className="grid size-8 place-items-center rounded-[10px] border border-pf-border text-pf-faint hover:text-pf-danger disabled:opacity-50">
              <Trash2 size={13} strokeWidth={1.75} />
            </button>
          )}
        </>
      )}
      {msg && <span className="text-[12px] text-pf-danger">{msg}</span>}
    </div>
  );
}

async function fetchStatus(id: string) {
  try {
    const res = await fetch(`/api/insight-pack?id=${encodeURIComponent(id)}`, { cache: "no-store" });
    return (await res.json()) as { status?: string; progress?: { done: number; total: number } };
  } catch {
    return {};
  }
}

/** Pack đang tạo: hiện tiến độ, cứ 20 giây hỏi lại; xong thì tải lại trang. */
export function PackRunning({ pack }: { pack: InsightPack }) {
  const router = useRouter();
  const [progress, setProgress] = useState(pack.progress);
  useEffect(() => {
    const t = setInterval(() => {
      fetchStatus(pack.id).then((s) => {
        if (s.progress) setProgress(s.progress);
        if (s.status && s.status !== "running") router.refresh();
      });
    }, 20000);
    return () => clearInterval(t);
  }, [pack.id, router]);
  const done = progress?.done ?? 0;
  const total = progress?.total ?? 5;
  return (
    <div className="rounded-[20px] border border-pf-primary-hi/30 bg-pf-primary/[.06] p-5">
      <div className="flex items-center gap-2 text-[14px] font-semibold text-white">
        <Loader2 size={16} className="animate-spin text-pf-primary-hi" /> AI đang phân tích {pack.label}
      </div>
      <p className="mt-1 text-[12.5px] leading-relaxed text-pf-muted">
        Đã tính xong {Object.keys(pack.facts).length} nhóm bằng chứng từ {pack.totals.tickets} ticket. 5 mảng phân tích ({Object.values(FOCUS_LABEL).join(", ")}) đang chạy ngầm — thường mất 5–30 phút. Có thể rời trang; trang tự cập nhật khi xong.
      </p>
      <div className="mt-3 h-[5px] rounded-full bg-pf-bg-deep">
        <div className={cx("h-full rounded-full bg-pf-primary transition-[width]")} style={{ width: `${Math.max(6, (done / total) * 100)}%` }} />
      </div>
      <div className="mt-1 text-[11.5px] text-pf-faint">
        {done}/{total} mảng xong
      </div>
    </div>
  );
}
