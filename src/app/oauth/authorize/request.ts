import "server-only";
import { getClient, OAuthError, redirectAllowed, SCOPE, type OAuthClient } from "@/lib/oauth/server";

export interface AuthRequest {
  client: OAuthClient;
  redirectUri: string;
  state: string | null;
  challenge: string;
  scope: string;
  resource: string | null;
}

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * Kiểm tra yêu cầu cấp quyền. Lỗi trước khi xác minh redirect_uri thì hiện trên trang (không redirect),
 * lỗi sau đó trả về client qua redirect_uri theo chuẩn OAuth.
 */
export async function parseAuthRequest(sp: Params): Promise<{ ok: AuthRequest } | { pageError: string } | { redirectError: string }> {
  let client: OAuthClient;
  try {
    client = await getClient(one(sp.client_id));
  } catch (e) {
    return { pageError: e instanceof OAuthError ? e.message : "client_id không hợp lệ" };
  }
  const redirectUri = one(sp.redirect_uri) || (client.redirect_uris.length === 1 ? client.redirect_uris[0] : "");
  if (!redirectUri || !redirectAllowed(client, redirectUri)) return { pageError: "redirect_uri không khớp với client đã đăng ký" };

  const state = one(sp.state) || null;
  const err = (code: string, desc: string) => {
    const u = new URL(redirectUri);
    u.searchParams.set("error", code);
    u.searchParams.set("error_description", desc);
    if (state) u.searchParams.set("state", state);
    return { redirectError: u.toString() };
  };
  if (one(sp.response_type) !== "code") return err("unsupported_response_type", "Chỉ hỗ trợ response_type=code");
  const challenge = one(sp.code_challenge);
  if (!challenge || one(sp.code_challenge_method) !== "S256") return err("invalid_request", "Bắt buộc PKCE với code_challenge_method=S256");
  const scope = one(sp.scope) || SCOPE;
  return { ok: { client, redirectUri, state, challenge, scope, resource: one(sp.resource) || null } };
}
