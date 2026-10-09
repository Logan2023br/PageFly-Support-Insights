import { connection } from "next/server";
import { requireUser } from "@/lib/auth/current";
import { ARCHIVE_GRAINS, lastClosed } from "@/lib/archive/periods";
import { archiveId, listArchive } from "@/lib/archive/store";
import { vnDayKey } from "@/lib/data/parse";
import { kvWritable } from "@/lib/store/kv";
import { TEAMS, type ReportTeam } from "@/lib/reports";
import { ReportArchive } from "./report-archive";

const vnToday = () => vnDayKey(Date.now());

/** Đọc mục lục kho báo cáo ở server rồi giao cho phần lọc / tìm kiếm / tự tạo phía client. */
export async function ArchiveSection({ team }: { team: ReportTeam }) {
  await connection();
  const user = await requireUser();
  const entries = await listArchive().catch(() => []);
  const today = vnToday();
  // Kỳ đã kết thúc gần nhất của từng loại: còn thiếu báo cáo tự động của team nào không (vd cron lỗi) → cho phép "Tạo lại".
  const ids = new Set(entries.map((e) => e.id));
  const latest = Object.fromEntries(
    ARCHIVE_GRAINS.map((g) => {
      const p = lastClosed(g, today);
      return [g, { label: p.label, missing: (Object.keys(TEAMS) as ReportTeam[]).some((t) => !ids.has(archiveId(t, g, p.from))) }];
    }),
  ) as Record<(typeof ARCHIVE_GRAINS)[number], { label: string; missing: boolean }>;
  return <ReportArchive key={team} entries={entries} latest={latest} isAdmin={user.role === "admin"} username={user.username} team={team} today={today} writable={kvWritable()} />;
}
