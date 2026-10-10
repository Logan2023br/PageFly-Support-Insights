"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, CalendarRange, Download, Eye, FilePlus2, Info, Loader2, Search, Trash2, X } from "lucide-react";
import type { ArchiveEntry } from "@/lib/archive/store";
import { ARCHIVE_GRAIN_LABEL, ARCHIVE_GRAINS, type ArchiveGrain } from "@/lib/archive/grains";
import { addDays, diffDays } from "@/lib/data/parse";
import { cx } from "@/components/ui";

const TEAM_LABEL = { cs: "CS Team", dev: "Dev Team", marketing: "Marketing Team" } as const;
type Team = keyof typeof TEAM_LABEL;
type Tab = "auto" | "custom";

function fmtTime(ms: number) {
  const iso = new Date(ms + 7 * 3600_000).toISOString();
  return `${iso.slice(11, 16)} ${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}
const dmy = (k: string) => k.split("-").reverse().join("/");
/** Báo cáo theo tuần/tháng/quý/năm nằm ở tab Tự động; khoảng ngày tự chọn nằm ở tab Tự tạo. */
const tabOf = (e: ArchiveEntry): Tab => (e.grain === "custom" ? "custom" : "auto");

async function post(body: object): Promise<{ ok: boolean; data: { error?: string; created?: string[]; period?: { label: string }; entry?: ArchiveEntry } }> {
  try {
    const res = await fetch("/api/reports/archive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: res.ok, data: await res.json() };
  } catch {
    return { ok: false, data: { error: "Lỗi mạng, thử lại sau." } };
  }
}

const inputCls = "h-8 rounded-[10px] border border-pf-border bg-pf-bg-deep px-2 text-[12px] text-pf-body [color-scheme:dark]";

/**
 * Kho báo cáo PDF của 1 team, 2 tab:
 * - Tự động: hệ thống tạo theo tuần / tháng / quý / năm, cùng lúc cho cả 3 team.
 * - Tự tạo: người dùng chọn khoảng ngày (tuỳ chọn so sánh với kỳ trước), chỉ tạo cho team này.
 */
export function ReportArchive({
  entries: allEntries,
  latest,
  isAdmin,
  username,
  team,
  today,
  writable,
}: {
  entries: ArchiveEntry[];
  /** Kỳ đã kết thúc gần nhất của từng loại và có đang thiếu báo cáo tự động không. */
  latest: Record<ArchiveGrain, { label: string; missing: boolean }>;
  isAdmin: boolean;
  username: string;
  team: Team;
  today: string;
  writable: boolean;
}) {
  const router = useRouter();
  const entries = useMemo(() => allEntries.filter((e) => e.team === team), [allEntries, team]);
  const [tab, setTab] = useState<Tab>("auto");
  const [grain, setGrain] = useState<ArchiveGrain | "all">("all");
  const [year, setYear] = useState<string>("all");
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // Form tạo báo cáo tự tạo
  const [formOpen, setFormOpen] = useState(false);
  const [from, setFrom] = useState(addDays(today, -6));
  const [to, setTo] = useState(today);
  const [compare, setCompare] = useState(true);
  // Admin tạo bù báo cáo tự động

  const tabEntries = useMemo(() => entries.filter((e) => tabOf(e) === tab), [entries, tab]);
  const years = useMemo(() => [...new Set(tabEntries.map((e) => e.year))].sort((a, b) => b - a), [tabEntries]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return tabEntries
      .filter(
        (e) =>
          (tab === "custom" || grain === "all" || e.grain === grain) &&
          (year === "all" || String(e.year) === year) &&
          (!needle || `${e.label} ${dmy(e.from)} ${dmy(e.to)} ${e.grain === "custom" ? "tự tạo" : ARCHIVE_GRAIN_LABEL[e.grain]} ${e.createdBy ?? ""}`.toLowerCase().includes(needle)),
      )
      .sort((a, b) => (tab === "custom" ? b.createdAt - a.createdAt : b.from.localeCompare(a.from)));
  }, [tabEntries, tab, grain, year, q]);
  const grainCounts = useMemo(() => Object.fromEntries(ARCHIVE_GRAINS.map((g) => [g, entries.filter((e) => e.grain === g).length])), [entries]);
  const tabCounts = { auto: entries.filter((e) => tabOf(e) === "auto").length, custom: entries.filter((e) => tabOf(e) === "custom").length };

  const validRange = from && to && from <= to && to <= today && diffDays(from, to) <= 366;
  const len = validRange ? diffDays(from, to) + 1 : 0;
  const prevFrom = validRange ? addDays(from, -len) : "";
  const prevTo = validRange ? addDays(from, -1) : "";

  const switchTab = (t: Tab) => {
    setTab(t);
    setYear("all");
    setQ("");
    setMsg(null);
  };
  const preset = (f: string, t: string) => {
    setFrom(f);
    setTo(t);
  };
  const monthStart = `${today.slice(0, 8)}01`;
  const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = thứ 2
  const presets: [string, string, string][] = [
    ["7 ngày qua", addDays(today, -6), today],
    ["Tuần này", addDays(today, -dow), today],
    ["Tuần trước", addDays(today, -dow - 7), addDays(today, -dow - 1)],
    ["Tháng này", monthStart, today],
    ["30 ngày qua", addDays(today, -29), today],
  ];

  const createCustom = () =>
    start(async () => {
      const { ok, data } = await post({ team, from, to, compare });
      setMsg(ok ? `Đã tạo báo cáo ${data.entry?.label}${compare ? " (có so sánh kỳ trước)" : ""}.` : (data.error ?? "Không tạo được báo cáo"));
      if (ok) setFormOpen(false);
      router.refresh();
    });
  // "Tạo lại" gắn với loại kỳ đang chọn (Tuần/Tháng/Quý/Năm): chỉ bật khi kỳ đã kết thúc gần nhất của loại đó chưa có báo cáo.
  const regen = grain === "all" ? null : latest[grain];
  const createAuto = () =>
    start(async () => {
      if (grain === "all") return;
      const { ok, data } = await post({ grain });
      setMsg(!ok ? (data.error ?? "Không tạo được báo cáo") : data.created?.length ? `Đã tạo lại báo cáo tự động ${data.period?.label} (${data.created.length} team còn thiếu).` : `${data.period?.label} đã có đủ báo cáo.`);
      router.refresh();
    });
  const remove = (id: string) =>
    start(async () => {
      const res = await fetch(`/api/reports/archive/${encodeURIComponent(id)}`, { method: "DELETE" });
      setMsg(res.ok ? "Đã xoá báo cáo." : "Không xoá được báo cáo.");
      router.refresh();
    });

  return (
    <section id="kho-bao-cao" className="scroll-mt-6 rounded-[20px] border border-pf-border bg-pf-card p-4 shadow-pf-card sm:p-5">
      <div className="mb-3 grid justify-items-start gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-[16px] font-semibold text-white">
            <Archive size={17} strokeWidth={1.75} className="text-pf-primary-hi" /> Kho báo cáo PDF · {TEAM_LABEL[team]}
          </h2>
          <p className="mt-0.5 text-[12px] text-pf-muted">
            {tab === "auto"
              ? "Hệ thống tự tạo lúc 01:00 sáng cho cả 3 team: thứ 2 → tuần trước (00:00 thứ 2 – 23:59 chủ nhật) · ngày 1 → tháng trước · đầu quý → quý trước · 1/1 → năm trước."
              : `Báo cáo do người dùng tự chọn khoảng ngày — chỉ tạo cho ${TEAM_LABEL[team]}, các team khác không bị tạo theo.`}
          </p>
        </div>
        <div className="flex gap-1 rounded-xl border border-pf-border bg-white/[.02] p-1" role="tablist">
          {(
            [
              ["auto", "Báo cáo tự động", "Hệ thống tự tạo theo lịch, cùng lúc cho cả 3 team (CS, Dev, Marketing):", [
                  ["Tuần", "01:00 sáng thứ 2", "00:00 thứ 2 – 23:59 chủ nhật tuần trước"],
                  ["Tháng", "01:00 sáng ngày 1", "00:00 ngày 1 – 23:59 ngày cuối tháng trước"],
                  ["Quý", "01:00 sáng ngày 1/1, 1/4, 1/7, 1/10", "00:00 ngày đầu – 23:59 ngày cuối quý trước"],
                  ["Năm", "01:00 sáng ngày 1/1", "00:00 1/1 – 23:59 31/12 năm trước"],
                  "Giờ Việt Nam · luôn có phần so sánh với kỳ liền trước",
                ]],
              ["custom", "Báo cáo tự tạo", "Bạn tự chọn khoảng ngày để tạo báo cáo PDF:", ["Chỉ tạo cho team đang xem, team khác không bị tạo theo", "Tuỳ chọn so sánh với khoảng cùng số ngày ngay trước đó", "Ai cũng tạo được; người tạo hoặc admin mới xoá được", "Hữu ích khi cần báo cáo cho sự kiện, đợt release, khoảng bất kỳ"]],
            ] as const
          ).map(([t, label, intro, points]) => (
            <span key={t} className="group/tab relative">
              <button
                type="button"
                role="tab"
                aria-selected={tab === t}
                aria-describedby={`tip-${t}`}
                onClick={() => switchTab(t)}
                className={cx("inline-flex items-center gap-1.5 rounded-[9px] px-3.5 py-1.5 text-[12.5px] font-semibold", tab === t ? "bg-pf-primary/14 text-white ring-1 ring-pf-primary-hi/40" : "text-pf-muted hover:text-pf-text")}
              >
                {label} <span className="text-pf-faint">{tabCounts[t]}</span>
                <Info size={12} strokeWidth={1.75} className="text-pf-faint" />
              </button>
              <span
                id={`tip-${t}`}
                role="tooltip"
                className="pointer-events-none invisible absolute bottom-full left-0 z-40 mb-2 w-[min(360px,calc(100vw-48px))] rounded-[12px] border border-pf-border bg-pf-bg-deep px-3 py-2.5 text-[11.5px] font-normal leading-relaxed text-pf-body opacity-0 shadow-pf-float transition-opacity group-hover/tab:visible group-hover/tab:opacity-100 group-has-[:focus-visible]/tab:visible group-has-[:focus-visible]/tab:opacity-100"
              >
                <span className="mb-1 block font-semibold text-white">{label}</span>
                {intro}
                <span className="mt-1 grid gap-0.5">
                  {points.map((x) =>
                    typeof x === "string" ? (
                      <span key={x} className="flex gap-1.5">
                        <span className="text-pf-primary-hi">•</span>
                        {x}
                      </span>
                    ) : (
                      <span key={x[0]} className="flex gap-1.5">
                        <span className="text-pf-primary-hi">•</span>
                        <span>
                          <span className="font-semibold text-white">{x[0]}</span>
                          <span className="block">Tạo lúc: {x[1]}</span>
                          <span className="block text-pf-muted">Số liệu: {x[2]}</span>
                        </span>
                      </span>
                    ),
                  )}
                </span>
              </span>
            </span>
          ))}
        </div>
      </div>

      {!writable && <p className="mb-3 rounded-[12px] border border-pf-warn/30 bg-pf-warn/[.06] px-3 py-2 text-[12px] text-pf-warn">Chưa có Redis nên chưa lưu được báo cáo.</p>}

      {tab === "custom" &&
        (formOpen ? (
          <div className="mb-3 rounded-[14px] border border-pf-primary-hi/30 bg-pf-primary/[.05] p-3.5">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-white">
                <CalendarRange size={14} strokeWidth={1.75} className="text-pf-primary-hi" /> Tạo báo cáo {TEAM_LABEL[team]}
              </h3>
              <button type="button" onClick={() => setFormOpen(false)} aria-label="Đóng" className="rounded-md p-1 text-pf-faint hover:text-pf-text">
                <X size={14} />
              </button>
            </div>
            <div className="mb-2.5 flex flex-wrap gap-1.5">
              {presets.map(([label, f, t]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => preset(f, t)}
                  className={cx("rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold", from === f && to === t ? "border-pf-primary-hi/60 bg-pf-primary/15 text-white" : "border-pf-border text-pf-muted hover:text-pf-text")}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="grid gap-1 text-[11.5px] font-semibold text-pf-muted">
                Từ ngày
                <input type="date" value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
              </label>
              <label className="grid gap-1 text-[11.5px] font-semibold text-pf-muted">
                Đến ngày
                <input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} className={inputCls} />
              </label>
              <label className="flex h-8 items-center gap-2 text-[12.5px] text-pf-body">
                <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} className="size-4 accent-pf-primary" />
                So sánh với kỳ trước
              </label>
            </div>
            <p className="mt-2 text-[11.5px] text-pf-muted">
              {!validRange
                ? "Khoảng ngày chưa hợp lệ (ngày bắt đầu ≤ ngày kết thúc ≤ hôm nay, tối đa 1 năm)."
                : compare
                  ? `${len} ngày · ${dmy(from)} – ${dmy(to)}, so sánh với ${len} ngày liền trước (${dmy(prevFrom)} – ${dmy(prevTo)}). PDF có thêm phần "So sánh với kỳ trước" và cột kỳ trước / thay đổi.`
                  : `${len} ngày · ${dmy(from)} – ${dmy(to)}. PDF chỉ có số liệu của khoảng này, không so sánh.`}
            </p>
            <div className="mt-3 flex gap-2">
              <button type="button" disabled={pending || !writable || !validRange} onClick={createCustom} className="inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-pf-primary px-3 text-[12px] font-semibold text-white disabled:opacity-50">
                {pending ? <Loader2 size={13} className="animate-spin" /> : <FilePlus2 size={13} strokeWidth={1.75} />} Tạo báo cáo
              </button>
              <button type="button" onClick={() => setFormOpen(false)} className="inline-flex h-8 items-center rounded-[10px] border border-pf-border px-3 text-[12px] font-semibold text-pf-body hover:border-pf-border-hi">
                Huỷ
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={!writable}
            onClick={() => {
              setFormOpen(true);
              setMsg(null);
            }}
            className="mb-3 inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-pf-primary px-3 text-[12px] font-semibold text-white disabled:opacity-50"
          >
            <FilePlus2 size={13} strokeWidth={1.75} /> Tạo báo cáo mới
          </button>
        ))}

      {msg && <p className="mb-3 text-[12px] text-pf-primary-hi">{msg}</p>}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {tab === "auto" && (
          <div className="flex gap-1 rounded-xl border border-pf-border bg-white/[.02] p-1">
            {(["all", ...ARCHIVE_GRAINS] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGrain(g)}
                className={cx("rounded-[9px] px-3 py-1 text-[12px] font-semibold", grain === g ? "bg-pf-primary/14 text-white ring-1 ring-pf-primary-hi/40" : "text-pf-muted hover:text-pf-text")}
              >
                {g === "all" ? "Tất cả" : ARCHIVE_GRAIN_LABEL[g]}
                {g !== "all" && <span className="ml-1 text-pf-faint">{grainCounts[g]}</span>}
              </button>
            ))}
          </div>
        )}
        <select value={year} onChange={(e) => setYear(e.target.value)} className={inputCls} aria-label="Năm">
          <option value="all">Mọi năm</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <label className="flex h-8 min-w-[200px] flex-1 items-center gap-2 rounded-[10px] border border-pf-border bg-pf-bg-deep px-2.5 sm:max-w-[320px]">
          <Search size={13} strokeWidth={1.75} className="text-pf-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tab === "auto" ? "Tìm: Tuần 41, Tháng 10/2026, Quý 3, 05/10…" : "Tìm: 01/10, 10/2026, người tạo…"}
            className="w-full bg-transparent text-[12px] text-pf-text outline-none placeholder:text-pf-faint"
          />
        </label>
        {tab === "auto" && isAdmin && (
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <span className={cx("text-[11.5px]", regen?.missing ? "text-pf-warn" : "text-pf-muted")}>
              {regen ? `${regen.label}: ${regen.missing ? "chưa có báo cáo" : "đã có báo cáo"}` : "Chọn Tuần / Tháng / Quý / Năm để tạo lại"}
            </span>
            <button
              type="button"
              disabled={pending || !writable || !regen?.missing}
              onClick={createAuto}
              title={!regen ? "Chọn loại kỳ trước" : regen.missing ? `${regen.label} chưa có báo cáo tự động (lịch tự động có thể bị lỗi) — bấm để tạo lại cho cả 3 team` : `${regen.label} đã có báo cáo tự động, không cần tạo lại`}
              className="inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-pf-primary px-3 text-[12px] font-semibold text-white disabled:bg-transparent disabled:text-pf-faint disabled:ring-1 disabled:ring-pf-border"
            >
              {pending ? <Loader2 size={13} className="animate-spin" /> : null} Tạo lại
            </button>
          </div>
        )}
      </div>

      {shown.length ? (
        <div className="pf-scroll max-h-[480px] overflow-auto rounded-[14px] border border-pf-border">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-pf-bg-alt">
              <tr className="border-b border-pf-border text-[11px] uppercase tracking-[0.06em] text-pf-faint">
                {(tab === "auto" ? ["Kỳ báo cáo", "Loại", "Ticket", "Tạo lúc", ""] : ["Khoảng ngày", "So sánh", "Người tạo", "Ticket", "Tạo lúc", ""]).map((h, i) => (
                  <th key={i} className="whitespace-nowrap px-3 py-2.5 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => {
                const canDelete = isAdmin || (!e.auto && e.createdBy === username);
                return (
                  <tr key={e.id} className="border-b border-pf-border/60 text-[12.5px] last:border-0 hover:bg-pf-card/60">
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-white">{e.label}</div>
                      {tab === "auto" ? (
                        <div className="text-[11px] text-pf-faint">
                          {dmy(e.from)} – {dmy(e.to)}
                        </div>
                      ) : (
                        <div className="text-[11px] text-pf-faint">{diffDays(e.from, e.to) + 1} ngày</div>
                      )}
                    </td>
                    {tab === "auto" ? (
                      <td className="px-3 py-2.5 text-pf-body">{e.grain === "custom" ? "Tự tạo" : ARCHIVE_GRAIN_LABEL[e.grain]}</td>
                    ) : (
                      <>
                        <td className="px-3 py-2.5 text-pf-body">{e.compare ? "Có" : "Không"}</td>
                        <td className="px-3 py-2.5 text-pf-body">{e.createdBy ?? "—"}</td>
                      </>
                    )}
                    <td className="tabular px-3 py-2.5 text-pf-body">{e.tickets}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[11.5px] text-pf-muted">
                      <span className="tabular">{fmtTime(e.createdAt)}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right">
                      <a href={`/api/reports/archive/${encodeURIComponent(e.id)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-[9px] px-2 py-1 text-[12px] font-semibold text-pf-primary-hi hover:bg-pf-card">
                        <Eye size={13} strokeWidth={1.75} /> Xem
                      </a>
                      <a href={`/api/reports/archive/${encodeURIComponent(e.id)}?download=1`} className="inline-flex items-center gap-1 rounded-[9px] px-2 py-1 text-[12px] font-semibold text-pf-body hover:bg-pf-card">
                        <Download size={13} strokeWidth={1.75} /> Tải
                      </a>
                      {canDelete && (
                        <button type="button" disabled={pending} onClick={() => remove(e.id)} title="Xoá báo cáo" aria-label={`Xoá ${e.label}`} className="inline-flex items-center rounded-[9px] px-1.5 py-1 text-pf-faint hover:bg-pf-card hover:text-pf-danger disabled:opacity-50">
                          <Trash2 size={13} strokeWidth={1.75} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-[14px] border border-dashed border-pf-border px-4 py-8 text-center text-[12.5px] text-pf-muted">
          {tabEntries.length
            ? "Không có báo cáo khớp bộ lọc."
            : tab === "auto"
              ? "Chưa có báo cáo tự động nào. Báo cáo tuần đầu tiên sẽ được tạo lúc 01:00 sáng thứ 2 tới."
              : 'Chưa có báo cáo tự tạo nào. Bấm "Tạo báo cáo mới" để chọn khoảng ngày.'}
        </p>
      )}
    </section>
  );
}
