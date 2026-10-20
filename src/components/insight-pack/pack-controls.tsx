"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarRange, Eye, Loader2, Sparkles, Trash2, X } from "lucide-react";
import { FOCUS_LABEL, PACK_MAX_DAYS, packId, type InsightPack, type PackIndexEntry } from "@/lib/insight-pack/types";
import { addDays, diffDays } from "@/lib/data/parse";
import { cx } from "@/components/ui";

const selectCls = "h-8 max-w-[260px] rounded-[10px] border border-pf-border bg-pf-bg-deep px-2 text-[12px] text-pf-body";
const inputCls = "h-8 rounded-[10px] border border-pf-border bg-pf-bg-deep px-2 text-[12px] text-pf-body [color-scheme:dark]";
const dmy = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}/${k.slice(0, 4)}`;

const entryText = (e: PackIndexEntry) => `${e.label}${e.status === "running" ? " · đang tạo" : e.status === "error" ? " · lỗi" : ` · ${e.count} insight`}`;

/** Chọn pack đã lưu + (admin) mở form tạo / xoá pack. */
export function PackControls({ list, selected, isAdmin, newHref }: { list: PackIndexEntry[]; selected: string | null; isAdmin: boolean; newHref: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const remove = () =>
    selected &&
    confirmDelete() &&
    start(async () => {
      await fetch(`/api/insight-pack?id=${encodeURIComponent(selected)}`, { method: "DELETE" });
      router.push("/insights");
      router.refresh();
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {list.length > 0 && (
        <select value={selected ?? ""} onChange={(e) => router.push(`/insights?pack=${encodeURIComponent(e.target.value)}`)} aria-label="Pack đã lưu" title="Các pack đã tạo được lưu lại; mở lại không tốn phí AI" className={selectCls}>
          {list.map((e) => (
            <option key={e.id} value={e.id}>
              {entryText(e)}
            </option>
          ))}
        </select>
      )}
      {isAdmin && (
        <>
          <Link href={newHref} scroll={false} className="inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-pf-primary px-3 text-[12px] font-semibold text-white">
            <Sparkles size={13} strokeWidth={1.75} /> Tạo Insight Pack
          </Link>
          {selected && (
            <button type="button" disabled={pending} onClick={remove} title="Xoá pack này (muốn phân tích lại khoảng này thì phải tạo lại và tốn phí AI)" aria-label="Xoá pack" className="grid size-8 place-items-center rounded-[10px] border border-pf-border text-pf-faint hover:text-pf-danger disabled:opacity-50">
              <Trash2 size={13} strokeWidth={1.75} />
            </button>
          )}
        </>
      )}
    </div>
  );
}

// Xoá là thao tác hiếm và mất tiền khi muốn có lại, nên hỏi xác nhận.
const confirmDelete = () => typeof window !== "undefined" && window.confirm("Xoá pack này? Muốn có lại phải tạo lại và tốn phí AI.");

/**
 * Form tạo pack: chọn khoảng ngày trước rồi mới tạo. Mỗi khoảng chỉ có một pack lưu vĩnh viễn —
 * nếu khoảng đã có pack thì chỉ cho mở bản đã lưu, không gọi AI lại.
 */
export function PackCreate({ list, today, closeHref }: { list: PackIndexEntry[]; today: string; closeHref: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = thứ 2
  const lastMon = addDays(today, -dow - 7);
  const monthStart = `${today.slice(0, 8)}01`;
  const prevMonthEnd = addDays(monthStart, -1);
  const presets: [string, string, string][] = [
    ["Tuần trước", lastMon, addDays(lastMon, 6)],
    ["Tuần này (đến hôm nay)", addDays(today, -dow), today],
    ["7 ngày qua", addDays(today, -6), today],
    ["Tháng trước", `${prevMonthEnd.slice(0, 8)}01`, prevMonthEnd],
    ["Tháng này (đến hôm nay)", monthStart, today],
    ["30 ngày qua", addDays(today, -29), today],
  ];
  const [from, setFrom] = useState(presets[0][1]);
  const [to, setTo] = useState(presets[0][2]);
  const len = from && to ? diffDays(from, to) + 1 : 0;
  const valid = Boolean(from && to) && from <= to && to <= today && len <= PACK_MAX_DAYS;
  const existing = valid ? list.find((e) => e.id === packId(from, to)) : undefined;
  const saved = existing && existing.status !== "error" ? existing : undefined;

  const create = () =>
    start(async () => {
      const res = await fetch("/api/insight-pack", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from, to }) });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !data.id) return setMsg(data.error ?? "Không tạo được");
      router.push(`/insights?pack=${encodeURIComponent(data.id)}`);
      router.refresh();
    });

  return (
    <div className="rounded-[20px] border border-pf-primary-hi/30 bg-pf-primary/[.05] p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[14px] font-semibold text-white">
          <CalendarRange size={15} strokeWidth={1.75} className="text-pf-primary-hi" /> Tạo Insight Pack
        </h3>
        <Link href={closeHref} scroll={false} aria-label="Đóng" className="rounded-md p-1 text-pf-faint hover:text-pf-text">
          <X size={15} />
        </Link>
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {presets.map(([label, f, t]) => {
          const has = list.some((e) => e.id === packId(f, t) && e.status !== "error");
          return (
            <button
              key={label}
              type="button"
              onClick={() => {
                setFrom(f);
                setTo(t);
                setMsg(null);
              }}
              className={cx("rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold", from === f && to === t ? "border-pf-primary-hi/60 bg-pf-primary/15 text-white" : "border-pf-border text-pf-muted hover:text-pf-text")}
            >
              {label}
              {has && <span className="ml-1 text-pf-success">· đã có</span>}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-[11.5px] font-semibold text-pf-muted">
          Từ ngày
          <input type="date" value={from} max={to || today} onChange={(e) => (setFrom(e.target.value), setMsg(null))} className={inputCls} />
        </label>
        <label className="grid gap-1 text-[11.5px] font-semibold text-pf-muted">
          Đến ngày
          <input type="date" value={to} min={from} max={today} onChange={(e) => (setTo(e.target.value), setMsg(null))} className={inputCls} />
        </label>
      </div>
      <p className="mt-2.5 text-[12px] leading-relaxed text-pf-muted">
        {!valid
          ? `Khoảng ngày chưa hợp lệ (ngày bắt đầu ≤ ngày kết thúc ≤ hôm nay, tối đa ${PACK_MAX_DAYS} ngày).`
          : `${len} ngày · ${dmy(from)} – ${dmy(to)}. So sánh với ${len} ngày liền trước (${dmy(addDays(from, -len))} – ${dmy(addDays(from, -1))}) và xu hướng 8 kỳ.${to === today ? " Hôm nay chưa hết ngày: pack chỉ tính ticket tới lúc tạo, sau đó không tự cập nhật." : ""}`}
      </p>
      {saved ? (
        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          <Link href={`/insights?pack=${encodeURIComponent(saved.id)}`} className="inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-pf-primary px-3 text-[12px] font-semibold text-white">
            <Eye size={13} strokeWidth={1.75} /> Mở pack đã lưu
          </Link>
          <span className="text-[12px] text-pf-success">Khoảng này đã có pack ({saved.status === "running" ? "đang tạo" : `${saved.count} insight`}) — mở lại không tốn phí.</span>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          <button type="button" disabled={pending || !valid} onClick={create} className="inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-pf-primary px-3 text-[12px] font-semibold text-white disabled:opacity-50">
            {pending ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} strokeWidth={1.75} />} {existing ? "Tạo lại (bản trước bị lỗi)" : "Tạo pack"}
          </button>
          <span className="text-[11.5px] text-pf-faint">Khoảng $0.5–0.7 tiền AI (Haiku) · chạy ngầm 5–30 phút · tạo một lần rồi lưu lại, xem lại không tốn phí.</span>
        </div>
      )}
      {msg && <p className="mt-2 text-[12px] text-pf-danger">{msg}</p>}
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
