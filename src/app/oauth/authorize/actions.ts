"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current";
import { issueCode } from "@/lib/oauth/server";
import { kvWritable } from "@/lib/store/kv";
import { parseAuthRequest } from "./request";

/** Người dùng bấm Cho phép / Từ chối. Tham số được kiểm tra lại ở server, không tin form. */
export async function decide(form: FormData) {
  const user = await requireUser();
  const sp = Object.fromEntries(new URLSearchParams(String(form.get("query") ?? "")).entries());
  const parsed = await parseAuthRequest(sp);
  if ("pageError" in parsed) redirect(`/oauth/authorize?${String(form.get("query") ?? "")}`);
  if ("redirectError" in parsed) redirect(parsed.redirectError);
  const { client, redirectUri, state, challenge, scope, resource } = parsed.ok;

  const url = new URL(redirectUri);
  if (form.get("decision") !== "allow") {
    url.searchParams.set("error", "access_denied");
    url.searchParams.set("error_description", "Người dùng từ chối kết nối");
  } else if (!kvWritable()) {
    url.searchParams.set("error", "server_error");
    url.searchParams.set("error_description", "Máy chủ chưa cấu hình nơi lưu (Upstash Redis)");
  } else {
    const code = await issueCode({ clientId: client.client_id, redirectUri, challenge, userId: user.id, username: user.username, scope, resource });
    url.searchParams.set("code", code);
    const h = await headers();
    const host = process.env.PUBLIC_URL?.replace(/\/$/, "") ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
    url.searchParams.set("iss", host);
  }
  if (state) url.searchParams.set("state", state);
  redirect(url.toString());
}
