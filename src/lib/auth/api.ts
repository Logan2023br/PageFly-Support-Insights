import "server-only";
import { NextResponse } from "next/server";
import { readCurrentUser } from "./current";

/** Dùng ở đầu route handler: trả 401 JSON (không chuyển hướng) khi chưa đăng nhập hoặc tài khoản đã bị xoá. */
export async function apiGuard(): Promise<NextResponse | null> {
  return (await readCurrentUser()) ? null : NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
}
