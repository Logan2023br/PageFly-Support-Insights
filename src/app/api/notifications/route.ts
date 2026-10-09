import { NextResponse } from "next/server";
import { apiGuard } from "@/lib/auth/api";
import { getDataset } from "@/lib/data";
import { vnDayKey } from "@/lib/data/parse";
import { buildNotifications } from "@/lib/alerts";

export async function GET() {
  const denied = await apiGuard();
  if (denied) return denied;
  const ds = await getDataset();
  return NextResponse.json({ loadedAt: ds.loadedAt, items: buildNotifications(ds.tickets, vnDayKey(Date.now()), ds.loadedAt) });
}
