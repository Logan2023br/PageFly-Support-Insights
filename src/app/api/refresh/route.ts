import { apiGuard } from "@/lib/auth/api";
import { NextResponse } from "next/server";
import { getDataset } from "@/lib/data";

export async function POST() {
  const denied = await apiGuard();
  if (denied) return denied;
  const ds = await getDataset({ force: true });
  return NextResponse.json({ loadedAt: ds.loadedAt, tickets: ds.tickets.length, error: ds.error ?? null });
}
