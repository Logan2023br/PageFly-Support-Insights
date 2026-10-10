import { NextResponse, type NextRequest } from "next/server";
import { vnDayKey } from "@/lib/data/parse";
import { dueGrains } from "@/lib/archive/periods";
import { generateArchive } from "@/lib/archive/store";

export const maxDuration = 60;

/**
 * Vercel Cron (xem vercel.json):
 * Mỗi ngày 18:00 UTC = 01:00 giờ VN → thứ 2: tuần trước (00:00 thứ 2 – 23:59 chủ nhật); ngày 1: tháng trước;
 * 1/1, 1/4, 1/7, 1/10: quý trước; 1/1: năm trước. `?only=week` / `?only=rest` để chạy riêng (nếu cần tách lịch).
 * Xác thực bằng CRON_SECRET (Vercel tự gửi header Authorization: Bearer <CRON_SECRET>).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Chưa cấu hình CRON_SECRET" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Không có quyền" }, { status: 401 });

  const today = vnDayKey(Date.now());
  const only = request.nextUrl.searchParams.get("only");
  const grains = dueGrains(today).filter((g) => (only === "week" ? g === "week" : only === "rest" ? g !== "week" : true));
  const results = [];
  for (const g of grains) results.push(await generateArchive(g, { auto: true }));
  return NextResponse.json({ today, grains, results });
}
