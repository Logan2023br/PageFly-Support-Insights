import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession, type Role } from "./session";
import { ENV_ADMIN_ID, envAdmin, findUser } from "./users";

export interface CurrentUser {
  id: string;
  username: string;
  role: Role;
  isEnvAdmin: boolean;
}

/** Người đang đăng nhập, hoặc null. Kiểm tra cả việc tài khoản còn tồn tại (bị xoá → đăng xuất). */
export async function readCurrentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const s = await verifySession(token);
  if (!s) return null;
  if (s.uid === ENV_ADMIN_ID) {
    const admin = envAdmin();
    return admin && admin.username === s.u ? { id: ENV_ADMIN_ID, username: admin.username, role: "admin", isEnvAdmin: true } : null;
  }
  const u = await findUser(s.uid).catch(() => undefined);
  if (!u) return null;
  return { id: u.id, username: u.username, role: u.role, isEnvAdmin: false };
}

export async function requireUser(): Promise<CurrentUser> {
  const u = await readCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const u = await requireUser();
  if (u.role !== "admin") redirect("/");
  return u;
}
