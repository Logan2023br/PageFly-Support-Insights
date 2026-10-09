"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current";
import { listGrants, revokeGrant } from "@/lib/oauth/server";

/** Thu hồi kết nối: chủ kết nối hoặc admin. Token đang dùng hết hiệu lực ngay. */
export async function revokeConnection(form: FormData) {
  const me = await requireUser();
  const id = String(form.get("id") ?? "");
  const grant = (await listGrants()).find((g) => g.id === id);
  if (!grant) return;
  if (grant.userId !== me.id && me.role !== "admin") return;
  await revokeGrant(id);
  revalidatePath("/connect");
}
