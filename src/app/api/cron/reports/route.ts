import { NextResponse, type NextRequest } from "next/server";
import { aiConfigured } from "@/lib/ai/insights";
import { collectRunning, packWeek, readPack, startPack } from "@/lib/insight-pack/generate";
import { vnDayKey } from "@/lib/data/parse";
import { dueGrains } from "@/lib/archive/periods";
import { generateArchive } from "@/lib/archive/store";
import { loadDataset } from "@/lib/data";
import { ensureGroups } from "@/lib/repeat/groups";

export const maxDuration = 300;

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
  // Gom nhóm issue cho ticket mới (phục vụ phần Issue lặp lại).
  const grouping = await ensureGroups((await loadDataset({ force: true })).tickets, { maxBatches: 2 }).catch((e) => ({ error: String(e) }));
  const results = [];
  for (const g of grains) results.push(await generateArchive(g, { auto: true }));
  // Thu kết quả các Insight Pack đang chạy; thứ 2: tạo pack của tuần trước (chạy ngầm qua Message Batches).
  await collectRunning().catch(() => undefined);
  let pack: string | null = null;
  if (grains.includes("week") && aiConfigured()) {
    const w = packWeek("last", today);
    const existing = await readPack(`${w.from}_${w.to}`);
    if (!existing || existing.status === "error") {
      pack = (await startPack({ which: "last", auto: true, createdBy: "Hệ thống" })).id;
    }
  }
  return NextResponse.json({ today, grains, results, grouping, pack });
}
