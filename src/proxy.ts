import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";

/**
 * Chặn mọi trang và API khi chưa đăng nhập (kiểm tra chữ ký cookie).
 * Việc tài khoản còn tồn tại / quyền admin được kiểm tra thêm ở server (lib/auth/current.ts).
 */
export async function proxy(request: NextRequest) {
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" && !search ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Bỏ qua trang đăng nhập, file tĩnh, các endpoint MCP / OAuth (tự kiểm tra bằng token OAuth) và cron (kiểm tra CRON_SECRET).
  matcher: ["/((?!login|api/mcp|api/oauth|api/cron|\\.well-known|_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|svg|jpg|jpeg|ico|webp|txt)$).*)"],
};
