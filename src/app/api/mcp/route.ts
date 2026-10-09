import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { registerInsightTools, SERVER_INSTRUCTIONS } from "@/lib/mcp/tools";
import { SCOPE, verifyAccessToken } from "@/lib/oauth/server";

// Server MCP chỉ đọc. Mọi request phải có access token OAuth hợp lệ (cấp qua /oauth/authorize).
const handler = createMcpHandler((server) => registerInsightTools(server), {
  serverInfo: { name: "pagefly-support-insights", version: "1.0.0" },
  instructions: SERVER_INSTRUCTIONS,
});

const authed = withMcpAuth(
  handler,
  async (_req, bearer) => {
    if (!bearer) return undefined;
    const who = await verifyAccessToken(bearer);
    if (!who) return undefined;
    return { token: bearer, clientId: who.clientId, scopes: who.scope.split(" "), extra: { userId: who.userId, username: who.username, role: who.role } };
  },
  { required: true, requiredScopes: [SCOPE], resourceMetadataPath: "/.well-known/oauth-protected-resource/api/mcp" },
);

export { authed as GET, authed as POST, authed as DELETE };
export const maxDuration = 60;
