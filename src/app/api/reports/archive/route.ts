import { NextResponse, type NextRequest } from "next/server";
import { readCurrentUser } from "@/lib/auth/current";
import { ARCHIVE_GRAINS, type ArchiveGrain } from "@/lib/archive/periods";
import { generateArchive } from "@/lib/archive/store";
import { kvWritable } from "@/lib/store/kv";

export const maxDuration = 60;

/** Admin tạo ngay báo cáo của kỳ đã kết thúc gần nhất (cả 3 team). `force` = tạo lại nếu đã có. */
export async function POST(request: NextRequest) {
  const user = await readCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Chỉ admin được tạo báo cáo" }, { status: 403 });
  if (!kvWritable()) return NextResponse.json({ error: "Chưa có Redis để lưu báo cáo" }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { grain?: string; force?: boolean };
  const grain = ARCHIVE_GRAINS.includes(body.grain as ArchiveGrain) ? (body.grain as ArchiveGrain) : "week";
  const result = await generateArchive(grain, { auto: false, force: body.force === true });
  return NextResponse.json(result);
}
