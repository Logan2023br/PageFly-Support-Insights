import { CORS, OAuthError, registerClient } from "@/lib/oauth/server";
import { kvWritable } from "@/lib/store/kv";

// Dynamic Client Registration (RFC 7591) cho client MCP đời cũ. Client mới dùng Client ID Metadata Document.
export async function POST(req: Request) {
  if (!kvWritable()) {
    return Response.json({ error: "temporarily_unavailable", error_description: "Máy chủ chưa cấu hình nơi lưu (Upstash Redis)" }, { status: 503, headers: CORS });
  }
  try {
    const c = await registerClient(await req.json().catch(() => ({})));
    return Response.json(
      {
        client_id: c.client_id,
        client_id_issued_at: Math.floor(c.createdAt / 1000),
        client_name: c.client_name,
        redirect_uris: c.redirect_uris,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      },
      { status: 201, headers: CORS },
    );
  } catch (e) {
    const err = e instanceof OAuthError ? e : new OAuthError("invalid_client_metadata", "Không đăng ký được client");
    return Response.json({ error: err.code, error_description: err.message }, { status: err.status, headers: CORS });
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
