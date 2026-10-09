import { NextResponse, type NextRequest } from "next/server";
import { readCurrentUser } from "@/lib/auth/current";
import { deleteArchive, readArchivePdf } from "@/lib/archive/store";

/** Xem (inline) hoặc tải (?download=1) file PDF đã lưu. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/reports/archive/[id]">) {
  if (!(await readCurrentUser())) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const { id } = await ctx.params;
  const found = await readArchivePdf(id);
  if (!found) return NextResponse.json({ error: "Không tìm thấy báo cáo" }, { status: 404 });
  const name = `pagefly-${id}.pdf`;
  const disposition = request.nextUrl.searchParams.get("download") ? "attachment" : "inline";
  return new NextResponse(new Uint8Array(found.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${name}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/reports/archive/[id]">) {
  const user = await readCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Chỉ admin được xoá" }, { status: 403 });
  const { id } = await ctx.params;
  return (await deleteArchive(id)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });
}
