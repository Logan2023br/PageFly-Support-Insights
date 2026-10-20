import { NextResponse, type NextRequest } from "next/server";
import { readCurrentUser } from "@/lib/auth/current";
import { aiConfigured } from "@/lib/ai/insights";
import { checkRange, deletePack, packId, readPack, startPack } from "@/lib/insight-pack/generate";
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

/**
 * Admin tạo Insight Pack cho khoảng [from, to]. Pack lưu vĩnh viễn: nếu khoảng này đã có pack (đang tạo hoặc xong)
 * thì trả về pack đó, không gọi AI lại (không tốn thêm tiền). Chỉ tạo lại khi pack cũ bị lỗi hoặc đã bị xoá.
 */
export async function POST(request: NextRequest) {
  const user = await readCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Chỉ admin được tạo Insight Pack" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { from?: string; to?: string };
  const from = body.from ?? "";
  const to = body.to ?? "";
  const bad = checkRange(from, to);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  const existing = await readPack(packId(from, to));
  if (existing && existing.status !== "error") return NextResponse.json({ id: existing.id, label: existing.label, existing: true });
  if (!aiConfigured()) return NextResponse.json({ error: "Chưa cấu hình ANTHROPIC_API_KEY" }, { status: 503 });
  if (!kvWritable()) return NextResponse.json({ error: "Chưa có Redis để lưu" }, { status: 503 });
  const pack = await startPack({ from, to, auto: false, createdBy: user.username });
  return NextResponse.json({ id: pack.id, label: pack.label, existing: false });
}

export async function DELETE(request: NextRequest) {
  const user = await readCurrentUser();
  if (user?.role !== "admin") return NextResponse.json({ error: "Chỉ admin được xoá" }, { status: 403 });
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Thiếu id" }, { status: 400 });
  await deletePack(id);
  return NextResponse.json({ ok: true });
}
