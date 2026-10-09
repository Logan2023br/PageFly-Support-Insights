"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_DAYS, signSession } from "@/lib/auth/session";
import { ENV_ADMIN_ID, envAdmin, findByUsername, safeEqual, touchLogin, verifyPassword } from "@/lib/auth/users";

export interface LoginState {
  error?: string;
  username?: string;
}

// Chống dò mật khẩu: sai 5 lần trong 10 phút → khoá 10 phút (theo username + IP, trong bộ nhớ instance).
const g = globalThis as unknown as { __pfLoginFails?: Map<string, { n: number; first: number }> };
const fails = (g.__pfLoginFails ??= new Map());
const WINDOW = 10 * 60 * 1000;
const MAX_FAILS = 5;

function safeNext(next: unknown): string {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/login") ? n : "/";
}

export async function loginAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  const username = String(form.get("username") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!username || !password) return { error: "Nhập username và mật khẩu.", username };

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const key = `${username.toLowerCase()}|${ip}`;
  const f = fails.get(key);
  if (f && Date.now() - f.first < WINDOW && f.n >= MAX_FAILS) {
    const mins = Math.ceil((WINDOW - (Date.now() - f.first)) / 60000);
    return { error: `Sai quá ${MAX_FAILS} lần. Thử lại sau ${mins} phút.`, username };
  }

  let session: { uid: string; u: string; r: "admin" | "member" } | null = null;
  const admin = envAdmin();
  if (admin && admin.username.toLowerCase() === username.toLowerCase() && safeEqual(password, admin.password)) {
    session = { uid: ENV_ADMIN_ID, u: admin.username, r: "admin" };
  } else {
    let user;
    try {
      user = await findByUsername(username);
    } catch {
      return { error: "Không đọc được danh sách tài khoản. Kiểm tra cấu hình lưu trữ.", username };
    }
    if (user && (await verifyPassword(password, user.passwordHash))) {
      session = { uid: user.id, u: user.username, r: user.role };
      await touchLogin(user.id);
    }
  }

  if (!session) {
    const cur = f && Date.now() - f.first < WINDOW ? f : { n: 0, first: Date.now() };
    fails.set(key, { n: cur.n + 1, first: cur.first });
    return { error: "Sai username hoặc mật khẩu.", username };
  }

  fails.delete(key);
  (await cookies()).set(SESSION_COOKIE, await signSession(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
  redirect(safeNext(form.get("next")));
}

export async function logoutAction() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
