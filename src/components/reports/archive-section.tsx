import { connection } from "next/server";
import { requireUser } from "@/lib/auth/current";
import { listArchive } from "@/lib/archive/store";
import { vnDayKey } from "@/lib/data/parse";
import { kvWritable } from "@/lib/store/kv";
import type { ReportTeam } from "@/lib/reports";
import { ReportArchive } from "./report-archive";

const vnToday = () => vnDayKey(Date.now());

/** Đọc mục lục kho báo cáo ở server rồi giao cho phần lọc / tìm kiếm / tự tạo phía client. */
export async function ArchiveSection({ team }: { team: ReportTeam }) {
  await connection();
  const user = await requireUser();
  const entries = await listArchive().catch(() => []);
  return <ReportArchive key={team} entries={entries} isAdmin={user.role === "admin"} username={user.username} team={team} today={vnToday()} writable={kvWritable()} />;
}
