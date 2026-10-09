import { authServerMetadata, CORS, issuerFrom } from "@/lib/oauth/server";

export async function GET(req: Request) {
  return Response.json(authServerMetadata(issuerFrom(req)), { headers: { ...CORS, "Cache-Control": "public, max-age=3600" } });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
