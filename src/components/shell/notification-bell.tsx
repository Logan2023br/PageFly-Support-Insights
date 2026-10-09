"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, ExternalLink, TrendingUp } from "lucide-react";
import type { Notification } from "@/lib/alerts";
import { cx } from "@/components/ui";

const SECONDS = Math.max(15, Number(process.env.NEXT_PUBLIC_AUTO_REFRESH_SECONDS ?? 30));
const SEEN_KEY = "pf_notif_seen";

// Danh sách đã xem lưu trên trình duyệt của từng người (chỉ là tiện ích hiển thị, mất cũng không sao).
function readSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
function writeSeen(ids: Set<string>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...ids].slice(-400)));
  } catch {
    /* bỏ qua: chế độ riêng tư / bị chặn lưu trữ */
  }
}

async function fetchNotifications(): Promise<Notification[] | null> {
  try {
    const res = await fetch("/api/notifications", { cache: "no-store" });
    if (!res.ok) return null;
    return ((await res.json()) as { items: Notification[] }).items;
  } catch {
    return null; // mạng lỗi: giữ danh sách cũ
  }
}

/** "HH:mm dd/MM" theo giờ Việt Nam. */
function timeOf(ms: number) {
  const iso = new Date(ms + 7 * 3600_000).toISOString();
  return `${iso.slice(11, 16)} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** Chuông góc phải: ticket mới cần xử lý + chỉ số báo động. Tự kiểm tra lại mỗi 30 giây. */
export function NotificationBell() {
  const [items, setItems] = useState<Notification[]>([]);
  const [seen, setSeen] = useState<Set<string>>(() => (typeof window === "undefined" ? new Set() : readSeen()));
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const run = () => {
      if (document.visibilityState === "visible") void fetchNotifications().then((next) => next && setItems(next));
    };
    run();
    const id = setInterval(run, SECONDS * 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const unread = items.filter((i) => !seen.has(i.id));
  const critical = unread.some((i) => i.level === "critical");
  const markAll = () => {
    const next = new Set([...seen, ...items.map((i) => i.id)]);
    setSeen(next);
    writeSeen(next);
  };
  const markOne = (id: string) => {
    const next = new Set([...seen, id]);
    setSeen(next);
    writeSeen(next);
  };

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Thông báo${unread.length ? `, ${unread.length} chưa xem` : ""}`}
        aria-expanded={open}
        className={cx("relative grid size-9 place-items-center rounded-[12px] border bg-pf-card text-pf-body transition-colors hover:border-pf-border-hi hover:text-white", open ? "border-pf-primary-hi/60" : "border-pf-border")}
      >
        <Bell size={16} strokeWidth={1.75} />
        {unread.length > 0 && (
          <span className={cx("tabular absolute -right-1.5 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10.5px] font-bold text-white", critical ? "bg-pf-danger" : "bg-pf-primary")}>
            {unread.length > 99 ? "99+" : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(400px,calc(100vw-32px))] overflow-hidden rounded-[16px] border border-pf-border bg-pf-bg-deep shadow-pf-float">
          <div className="flex items-center justify-between gap-2 border-b border-pf-border px-4 py-3">
            <div>
              <div className="text-[13px] font-semibold text-white">Thông báo</div>
              <div className="text-[11px] text-pf-faint">Ticket cần xử lý (3 ngày) · chỉ số báo động (7 ngày)</div>
            </div>
            {unread.length > 0 && (
              <button type="button" onClick={markAll} className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-[9px] px-2 py-1 text-[11.5px] font-semibold text-pf-primary-hi hover:bg-pf-card">
                <CheckCheck size={13} strokeWidth={1.75} /> Đã xem hết
              </button>
            )}
          </div>
          <ul className="pf-scroll max-h-[min(480px,70vh)] overflow-y-auto">
            {items.length === 0 && <li className="px-4 py-8 text-center text-[12.5px] text-pf-muted">Không có gì cần chú ý.</li>}
            {items.map((n) => {
              const isNew = !seen.has(n.id);
              return (
                <li key={n.id} className={cx("border-b border-pf-border/60 last:border-0", isNew && "bg-pf-primary/[.06]")}>
                  <div className="flex gap-3 px-4 py-3">
                    <span className={cx("mt-1 size-2 shrink-0 rounded-full", n.level === "critical" ? "bg-pf-danger" : "bg-pf-warn", !isNew && "opacity-30")} />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={n.href}
                        onClick={() => {
                          markOne(n.id);
                          setOpen(false);
                        }}
                        className="flex items-center gap-1.5 text-[12.5px] font-semibold text-white hover:underline"
                      >
                        {n.kind === "metric" && <TrendingUp size={13} strokeWidth={1.75} className="shrink-0 text-pf-danger" />}
                        <span className="truncate">{n.title}</span>
                      </Link>
                      <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-pf-muted">{n.detail}</p>
                      <div className="mt-1 flex items-center gap-3 text-[11px] text-pf-faint">
                        {n.kind === "ticket" && <span className="tabular">{timeOf(n.at)}</span>}
                        {n.crisp && (
                          <a href={n.crisp} target="_blank" rel="noreferrer" onClick={() => markOne(n.id)} className="inline-flex items-center gap-1 text-pf-primary-hi hover:underline">
                            Crisp <ExternalLink size={11} strokeWidth={1.75} />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
