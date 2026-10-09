import { CORS, issuerFrom, SCOPE } from "@/lib/oauth/server";

// RFC 9728: /.well-known/oauth-protected-resource và /.well-known/oauth-protected-resource/api/mcp
export async function GET(req: Request) {
  const issuer = issuerFrom(req);
  return Response.json(
    {
      resource: `${issuer}/api/mcp`,
      authorization_servers: [issuer],
      scopes_supported: [SCOPE],
      bearer_methods_supported: ["header"],
      resource_name: "PageFly Support Insights",
    },
    { headers: { ...CORS, "Cache-Control": "public, max-age=3600" } },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
