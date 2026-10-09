import { CORS, exchangeCode, OAuthError, refresh } from "@/lib/oauth/server";

async function params(req: Request): Promise<URLSearchParams> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) return new URLSearchParams(Object.entries((await req.json()) as Record<string, string>));
  return new URLSearchParams(await req.text());
}

export async function POST(req: Request) {
  const headers = { ...CORS, "Cache-Control": "no-store", Pragma: "no-cache" };
  try {
    const p = await params(req);
    const clientId = p.get("client_id") ?? "";
    const grantType = p.get("grant_type");
    if (grantType === "authorization_code") {
      const t = await exchangeCode({ code: p.get("code") ?? "", redirectUri: p.get("redirect_uri") ?? "", verifier: p.get("code_verifier") ?? "", clientId });
      return Response.json(t, { headers });
    }
    if (grantType === "refresh_token") {
      return Response.json(await refresh({ refreshToken: p.get("refresh_token") ?? "", clientId }), { headers });
    }
    throw new OAuthError("unsupported_grant_type", "Chỉ hỗ trợ authorization_code và refresh_token");
  } catch (e) {
    const err = e instanceof OAuthError ? e : new OAuthError("server_error", "Lỗi máy chủ", 500);
    return Response.json({ error: err.code, error_description: err.message }, { status: err.status, headers });
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
