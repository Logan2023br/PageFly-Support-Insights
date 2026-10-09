"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, Download, Eye, FilePlus2, Loader2, Search, Trash2 } from "lucide-react";
import type { ArchiveEntry } from "@/lib/archive/store";
import { ARCHIVE_GRAIN_LABEL, ARCHIVE_GRAINS, type ArchiveGrain } from "@/lib/archive/grains";
import { cx } from "@/components/ui";

const TEAM_LABEL = { cs: "CS Team", dev: "Dev Team", marketing: "Marketing Team" } as const;
type Team = keyof typeof TEAM_LABEL;

function fmtTime(ms: number) {
  const iso = new Date(ms + 7 * 3600_000).toISOString();
  return `${iso.slice(11, 16)} ${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}
const dmy = (k: string) => k.split("-").reverse().join("/");

async function postGenerate(grain: ArchiveGrain, force: boolean): Promise<string> {
  try {
    const res = await fetch("/api/reports/archive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grain, force }) });
    const data = (await res.json()) as { error?: string; created?: string[]; skipped?: string[]; period?: { label: string } };
    if (!res.ok) return data.error ?? "Không tạo được báo cáo";
    return data.created?.length ? `Đã tạo ${data.created.length} báo cáo ${data.period?.label}.` : `${data.period?.label} đã có đủ báo cáo (bấm "Tạo lại" để cập nhật).`;
  } catch {
    return "Lỗi mạng, thử lại sau.";
  }
}

/** Kho báo cáo PDF tự tạo (tuần / tháng / quý / năm) cho 3 team, có lọc và tìm kiếm. */
export function ReportArchive({ entries, isAdmin, team: fixedTeam, writable }: { entries: ArchiveEntry[]; isAdmin: boolean; team?: Team; writable: boolean }) {
  const router = useRouter();
  const [grain, setGrain] = useState<ArchiveGrain | "all">("all");
  const [team, setTeam] = useState<Team | "all">(fixedTeam ?? "all");
  const [year, setYear] = useState<string>("all");
  const [q, setQ] = useState("");
  const [genGrain, setGenGrain] = useState<ArchiveGrain>("week");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const years = useMemo(() => [...new Set(entries.map((e) => e.year))].sort((a, b) => b - a), [entries]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entries.filter(
      (e) =>
        (grain === "all" || e.grain === grain) &&
        (team === "all" || e.team === team) &&
        (year === "all" || String(e.year) === year) &&
        (!needle || `${e.label} ${dmy(e.from)} ${dmy(e.to)} ${TEAM_LABEL[e.team]} ${ARCHIVE_GRAIN_LABEL[e.grain]}`.toLowerCase().includes(needle)),
    );
  }, [entries, grain, team, year, q]);
  const counts = useMemo(() => Object.fromEntries(ARCHIVE_GRAINS.map((g) => [g, entries.filter((e) => (team === "all" || e.team === team) && e.grain === g).length])), [entries, team]);

  const generate = (force: boolean) =>
    start(async () => {
      setMsg(await postGenerate(genGrain, force));
      router.refresh();
    });
  const remove = (id: string) =>
    start(async () => {
      const res = await fetch(`/api/reports/archive/${encodeURIComponent(id)}`, { method: "DELETE" });
      setMsg(res.ok ? "Đã xoá báo cáo." : "Không xoá được báo cáo.");
      router.refresh();
    });

  return (
    <section className="rounded-[20px] border border-pf-border bg-pf-card p-4 shadow-pf-card sm:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-[16px] font-semibold text-white">
            <Archive size={17} strokeWidth={1.75} className="text-pf-primary-hi" /> Kho báo cáo PDF
          </h2>
          <p className="mt-0.5 text-[12px] text-pf-muted">
            Tự tạo lúc 01:00 sáng: thứ 2 → báo cáo tuần trước · ngày 1 → tháng trước · đầu quý → quý trước · 1/1 → năm trước. Mỗi kỳ có đủ 3 team CS, Dev, Marketing.
          </p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-1.5">
            <select value={genGrain} onChange={(e) => setGenGrain(e.target.value as ArchiveGrain)} className="h-8 rounded-[10px] border border-pf-border bg-pf-bg-deep px-2 text-[12px] text-pf-body" aria-label="Loại báo cáo cần tạo">
              {ARCHIVE_GRAINS.map((g) => (
                <option key={g} value={g}>
                  {ARCHIVE_GRAIN_LABEL[g]} gần nhất
                </option>
              ))}
            </select>
            <button type="button" disabled={pending || !writable} onClick={() => generate(false)} className="inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-pf-primary px-3 text-[12px] font-semibold text-white disabled:opacity-50">
              {pending ? <Loader2 size={13} className="animate-spin" /> : <FilePlus2 size={13} strokeWidth={1.75} />} Tạo ngay
            </button>
            <button type="button" disabled={pending || !writable} onClick={() => generate(true)} className="inline-flex h-8 items-center rounded-[10px] border border-pf-border px-3 text-[12px] font-semibold text-pf-body hover:border-pf-border-hi disabled:opacity-50" title="Tạo lại với dữ liệu mới nhất, ghi đè bản cũ">
              Tạo lại
            </button>
          </div>
        )}
      </div>

      {!writable && <p className="mb-3 rounded-[12px] border border-pf-warn/30 bg-pf-warn/[.06] px-3 py-2 text-[12px] text-pf-warn">Chưa có Redis nên chưa lưu được báo cáo.</p>}
      {msg && <p className="mb-3 text-[12px] text-pf-primary-hi">{msg}</p>}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl border border-pf-border bg-white/[.02] p-1">
          {(["all", ...ARCHIVE_GRAINS] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGrain(g)}
              className={cx("rounded-[9px] px-3 py-1 text-[12px] font-semibold", grain === g ? "bg-pf-primary/14 text-white ring-1 ring-pf-primary-hi/40" : "text-pf-muted hover:text-pf-text")}
            >
              {g === "all" ? "Tất cả" : ARCHIVE_GRAIN_LABEL[g]}
              {g !== "all" && <span className="ml-1 text-pf-faint">{counts[g]}</span>}
            </button>
          ))}
        </div>
        {!fixedTeam && (
          <select value={team} onChange={(e) => setTeam(e.target.value as Team | "all")} className="h-8 rounded-[10px] border border-pf-border bg-pf-bg-deep px-2 text-[12px] text-pf-body" aria-label="Team">
            <option value="all">Cả 3 team</option>
            {(Object.keys(TEAM_LABEL) as Team[]).map((t) => (
              <option key={t} value={t}>
                {TEAM_LABEL[t]}
              </option>
            ))}
          </select>
        )}
        <select value={year} onChange={(e) => setYear(e.target.value)} className="h-8 rounded-[10px] border border-pf-border bg-pf-bg-deep px-2 text-[12px] text-pf-body" aria-label="Năm">
          <option value="all">Mọi năm</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <label className="flex h-8 min-w-[200px] flex-1 items-center gap-2 rounded-[10px] border border-pf-border bg-pf-bg-deep px-2.5 sm:max-w-[320px]">
          <Search size={13} strokeWidth={1.75} className="text-pf-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm: Tuần 41, Tháng 10/2026, Quý 3, 05/10…" className="w-full bg-transparent text-[12px] text-pf-text outline-none placeholder:text-pf-faint" />
        </label>
      </div>

      {shown.length ? (
        <div className="pf-scroll max-h-[480px] overflow-auto rounded-[14px] border border-pf-border">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-pf-bg-alt">
              <tr className="border-b border-pf-border text-[11px] uppercase tracking-[0.06em] text-pf-faint">
                {["Kỳ báo cáo", "Loại", "Team", "Ticket", "Tạo lúc", ""].map((h, i) => (
                  <th key={i} className="whitespace-nowrap px-3 py-2.5 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.id} className="border-b border-pf-border/60 text-[12.5px] last:border-0 hover:bg-pf-card/60">
                  <td className="px-3 py-2.5">
                    <div className="font-semibold text-white">{e.label}</div>
                    <div className="text-[11px] text-pf-faint">
                      {dmy(e.from)} – {dmy(e.to)}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-pf-body">{ARCHIVE_GRAIN_LABEL[e.grain]}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-pf-body">{TEAM_LABEL[e.team]}</td>
                  <td className="tabular px-3 py-2.5 text-pf-body">{e.tickets}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[11.5px] text-pf-muted">
                    <span className="tabular">{fmtTime(e.createdAt)}</span> · {e.auto ? "tự động" : "thủ công"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">
                    <a href={`/api/reports/archive/${encodeURIComponent(e.id)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-[9px] px-2 py-1 text-[12px] font-semibold text-pf-primary-hi hover:bg-pf-card">
                      <Eye size={13} strokeWidth={1.75} /> Xem
                    </a>
                    <a href={`/api/reports/archive/${encodeURIComponent(e.id)}?download=1`} className="inline-flex items-center gap-1 rounded-[9px] px-2 py-1 text-[12px] font-semibold text-pf-body hover:bg-pf-card">
                      <Download size={13} strokeWidth={1.75} /> Tải
                    </a>
                    {isAdmin && (
                      <button type="button" disabled={pending} onClick={() => remove(e.id)} title="Xoá báo cáo" aria-label={`Xoá ${e.label} ${TEAM_LABEL[e.team]}`} className="inline-flex items-center rounded-[9px] px-1.5 py-1 text-pf-faint hover:bg-pf-card hover:text-pf-danger disabled:opacity-50">
                        <Trash2 size={13} strokeWidth={1.75} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-[14px] border border-dashed border-pf-border px-4 py-8 text-center text-[12.5px] text-pf-muted">
          {entries.length ? "Không có báo cáo khớp bộ lọc." : "Chưa có báo cáo nào. Báo cáo đầu tiên sẽ được tạo lúc 01:00 sáng thứ 2 tới."}
        </p>
      )}
    </section>
  );
}
