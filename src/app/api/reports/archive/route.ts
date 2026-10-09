import { NextResponse, type NextRequest } from "next/server";
import { readCurrentUser } from "@/lib/auth/current";
import { diffDays, vnDayKey } from "@/lib/data/parse";
import { ARCHIVE_GRAINS, type ArchiveGrain } from "@/lib/archive/periods";
import { generateArchive, generateCustom } from "@/lib/archive/store";
import { TEAMS, type ReportTeam } from "@/lib/reports";
import { kvWritable } from "@/lib/store/kv";

export const maxDuration = 60;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * - `{ team, from, to, compare }`: báo cáo tự tạo cho riêng 1 team, khoảng ngày tự chọn (mọi người dùng).
 * - `{ grain, force }`: admin tạo bù báo cáo tự động của kỳ đã kết thúc gần nhất (cả 3 team).
 */
export async function POST(request: NextRequest) {
  const user = await readCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!kvWritable()) return NextResponse.json({ error: "Chưa có Redis để lưu báo cáo" }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { grain?: string; force?: boolean; team?: string; from?: string; to?: string; compare?: boolean };

  if (body.team !== undefined) {
    if (!(body.team in TEAMS)) return NextResponse.json({ error: "Team không hợp lệ" }, { status: 400 });
    const { from, to } = body;
    if (!from || !to || !DAY.test(from) || !DAY.test(to)) return NextResponse.json({ error: "Chọn ngày bắt đầu và ngày kết thúc" }, { status: 400 });
    if (from > to) return NextResponse.json({ error: "Ngày bắt đầu phải trước ngày kết thúc" }, { status: 400 });
    if (to > vnDayKey(Date.now())) return NextResponse.json({ error: "Ngày kết thúc không được sau hôm nay" }, { status: 400 });
    if (diffDays(from, to) > 366) return NextResponse.json({ error: "Khoảng tối đa 1 năm" }, { status: 400 });
    const entry = await generateCustom(body.team as ReportTeam, from, to, { compare: body.compare === true, createdBy: user.username });
    return NextResponse.json({ entry });
  }

  if (user.role !== "admin") return NextResponse.json({ error: "Chỉ admin được tạo báo cáo tự động" }, { status: 403 });
  const grain = ARCHIVE_GRAINS.includes(body.grain as ArchiveGrain) ? (body.grain as ArchiveGrain) : "week";
  const result = await generateArchive(grain, { auto: true, force: body.force === true });
  return NextResponse.json(result);
}
