"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/current";
import type { Role } from "@/lib/auth/session";
import { createUser, deleteUser, storeWritable, updateUser, validatePassword, validateUsername } from "@/lib/auth/users";
import { revokeUserGrants } from "@/lib/oauth/server";

export interface ActionState {
  ok?: string;
  error?: string;
}

const role = (v: FormDataEntryValue | null): Role => (v === "admin" ? "admin" : "member");

function guardStore(): string | null {
  return storeWritable() ? null : "Chưa cấu hình nơi lưu tài khoản trên Vercel (Upstash Redis). Xem hướng dẫn trong README.";
}

// Mọi action đều tự kiểm tra quyền admin ở server, không tin dữ liệu từ trình duyệt.

export async function createAccount(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const blocked = guardStore();
  if (blocked) return { error: blocked };
  const username = String(form.get("username") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const err = validateUsername(username) ?? validatePassword(password);
  if (err) return { error: err };
  try {
    await createUser(username, password, role(form.get("role")));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Không tạo được tài khoản." };
  }
  revalidatePath("/accounts");
  return { ok: `Đã tạo tài khoản ${username}.` };
}

export async function changePassword(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const blocked = guardStore();
  if (blocked) return { error: blocked };
  const id = String(form.get("id") ?? "");
  const password = String(form.get("password") ?? "");
  const err = validatePassword(password);
  if (err) return { error: err };
  try {
    await updateUser(id, { password });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Không đổi được mật khẩu." };
  }
  revalidatePath("/accounts");
  return { ok: "Đã đổi mật khẩu." };
}

export async function changeRole(_prev: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  const blocked = guardStore();
  if (blocked) return { error: blocked };
  const id = String(form.get("id") ?? "");
  if (id === me.id) return { error: "Không tự đổi quyền của chính mình." };
  try {
    await updateUser(id, { role: role(form.get("role")) });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Không đổi được quyền." };
  }
  revalidatePath("/accounts");
  return { ok: "Đã đổi quyền." };
}

export async function removeAccount(_prev: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  const blocked = guardStore();
  if (blocked) return { error: blocked };
  const id = String(form.get("id") ?? "");
  if (id === me.id) return { error: "Không thể tự xoá tài khoản đang đăng nhập." };
  try {
    await deleteUser(id);
    await revokeUserGrants(id); // xoá luôn các kết nối Claude của tài khoản này
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Không xoá được tài khoản." };
  }
  revalidatePath("/accounts");
  return { ok: "Đã xoá tài khoản." };
}
