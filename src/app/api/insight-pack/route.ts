import { NextResponse, type NextRequest } from "next/server";
import { readCurrentUser } from "@/lib/auth/current";
import { aiConfigured } from "@/lib/ai/insights";
import { deletePack, packWeek, readPack, startPack } from "@/lib/insight-pack/generate";
import { kvWritable } from "@/lib/store/kv";

export const maxDuration = 300;

/** Trạng thái một pack (để trang tự cập nhật khi đang tạo). */
export async function GET(request: NextRequest) {
  if (!(await readCurrentUser())) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id");
  const p = id ? await readPack(id, { collect: true }) : null;
  if (!p) return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });
  return NextResponse.json({ status: p.status, parts: p.parts, progress: p.progress, count: p.insights.length, error: p.error });
}

/** Admin tạo (lại) Insight Pack: tuần trước hoặc tuần này đến hôm nay. Phân tích chạy ngầm qua Message Batches. */
export async function POST(request: NextRequest) {
  const user = await readCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Chỉ admin được tạo Insight Pack" }, { status: 403 });
  if (!aiConfigured()) return NextResponse.json({ error: "Chưa cấu hình ANTHROPIC_API_KEY" }, { status: 503 });
  if (!kvWritable()) return NextResponse.json({ error: "Chưa có Redis để lưu" }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { which?: string };
  const which = body.which === "current" ? "current" : "last";
  const w = packWeek(which);
  const existing = await readPack(`${w.from}_${w.to}`);
  if (existing?.status === "running") return NextResponse.json({ error: "Pack này đang được tạo" }, { status: 409 });
  const pack = await startPack({ which, auto: false, createdBy: user.username });
  return NextResponse.json({ id: pack.id, label: pack.label });
}

export async function DELETE(request: NextRequest) {
  const user = await readCurrentUser();
  if (user?.role !== "admin") return NextResponse.json({ error: "Chỉ admin được xoá" }, { status: 403 });
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Thiếu id" }, { status: 400 });
  await deletePack(id);
  return NextResponse.json({ ok: true });
}
