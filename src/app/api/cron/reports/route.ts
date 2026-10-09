import { NextResponse, type NextRequest } from "next/server";
import { vnDayKey } from "@/lib/data/parse";
import { dueGrains } from "@/lib/archive/periods";
import { generateArchive } from "@/lib/archive/store";

export const maxDuration = 60;

/**
 * Vercel Cron gọi mỗi ngày lúc 18:00 UTC = 01:00 giờ VN (xem vercel.json).
 * Thứ 2 → báo cáo tuần trước; ngày 1 → tháng trước; 1/1, 1/4, 1/7, 1/10 → quý trước; 1/1 → năm trước.
 * Xác thực bằng CRON_SECRET (Vercel tự gửi header Authorization: Bearer <CRON_SECRET>).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Chưa cấu hình CRON_SECRET" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Không có quyền" }, { status: 401 });

  const today = vnDayKey(Date.now());
  const grains = dueGrains(today);
  const results = [];
  for (const g of grains) results.push(await generateArchive(g, { auto: true }));
  return NextResponse.json({ today, grains, results });
}
