import { connection } from "next/server";
import { requireUser } from "@/lib/auth/current";
import { listArchive } from "@/lib/archive/store";
import { kvWritable } from "@/lib/store/kv";
import type { ReportTeam } from "@/lib/reports";
import { ReportArchive } from "./report-archive";

/** Đọc mục lục kho báo cáo ở server rồi giao cho phần lọc / tìm kiếm phía client. */
export async function ArchiveSection({ team }: { team?: ReportTeam }) {
  await connection();
  const user = await requireUser();
  const entries = await listArchive().catch(() => []);
  return <ReportArchive entries={entries} isAdmin={user.role === "admin"} team={team} writable={kvWritable()} />;
}
