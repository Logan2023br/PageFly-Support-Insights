import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { kv } from "@/lib/store/kv";
import type { Role } from "@/lib/auth/session";
import { ENV_ADMIN_ID, envAdmin, findUser } from "@/lib/auth/users";

// Máy chủ cấp quyền OAuth 2.1 tối giản cho MCP: public client + PKCE S256,
// client đăng ký bằng Client ID Metadata Document (URL https) hoặc Dynamic Client Registration.

export const SCOPE = "insights:read";
const ACCESS_TTL = 3600; // 1 giờ
const REFRESH_TTL = 30 * 86400; // 30 ngày
const CODE_TTL = 300; // 5 phút

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const token = (bytes = 32) => randomBytes(bytes).toString("base64url");

export class OAuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

// ── Client ──────────────────────────────────────────────────────────

export interface OAuthClient {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  logo_uri?: string;
  client_uri?: string;
  kind: "dcr" | "cimd";
  createdAt: number;
}

const isLoopback = (u: URL) => u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);

/** https, loopback http (app chạy local) hoặc scheme riêng của app (vd. claude://, cursor://). */
function validRedirect(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.hash) return false;
    if (u.protocol === "https:" || isLoopback(u)) return true;
    const scheme = u.protocol.slice(0, -1);
    return /^[a-z][a-z0-9+.-]*$/.test(scheme) && !["http", "javascript", "data", "file", "vbscript", "blob"].includes(scheme);
  } catch {
    return false;
  }
}

/** So khớp redirect_uri; loopback cho phép đổi cổng (RFC 8252). */
export function redirectAllowed(client: OAuthClient, redirectUri: string): boolean {
  if (client.redirect_uris.includes(redirectUri)) return true;
  try {
    const r = new URL(redirectUri);
    if (!isLoopback(r)) return false;
    return client.redirect_uris.some((x) => {
      const c = new URL(x);
      return isLoopback(c) && c.hostname === r.hostname && c.pathname === r.pathname;
    });
  } catch {
    return false;
  }
}

export async function registerClient(body: unknown): Promise<OAuthClient> {
  const b = (body ?? {}) as Record<string, unknown>;
  const uris = Array.isArray(b.redirect_uris) ? b.redirect_uris.filter((x): x is string => typeof x === "string") : [];
  if (!uris.length || uris.length > 10 || !uris.every(validRedirect)) throw new OAuthError("invalid_redirect_uri", "redirect_uris không hợp lệ");
  const client: OAuthClient = {
    client_id: `pf_${randomUUID().replace(/-/g, "")}`,
    client_name: typeof b.client_name === "string" ? b.client_name.slice(0, 100) : "MCP client",
    redirect_uris: uris,
    logo_uri: typeof b.logo_uri === "string" ? b.logo_uri : undefined,
    client_uri: typeof b.client_uri === "string" ? b.client_uri : undefined,
    kind: "dcr",
    createdAt: Date.now(),
  };
  await kv().set(`pf:oc:${client.client_id}`, client);
  return client;
}

/** Tải Client ID Metadata Document: chỉ https, không IP nội bộ, tối đa 64KB, 5 giây. */
async function fetchCimd(clientId: string): Promise<OAuthClient> {
  const u = new URL(clientId);
  if (u.protocol !== "https:" || u.username || u.password || u.hash) throw new OAuthError("invalid_client", "client_id phải là URL https");
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(u.hostname) || /^\d+\.\d+\.\d+\.\d+$/.test(u.hostname) || u.hostname.includes(":")) {
    throw new OAuthError("invalid_client", "Không chấp nhận client_id trỏ tới địa chỉ nội bộ / IP");
  }
  const cached = await kv().get<OAuthClient>(`pf:cimd:${sha(clientId)}`);
  if (cached) return cached;
  const res = await fetch(clientId, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(5000), redirect: "error", cache: "no-store" });
  if (!res.ok) throw new OAuthError("invalid_client", `Không tải được metadata client (HTTP ${res.status})`);
  const text = await res.text();
  if (text.length > 65536) throw new OAuthError("invalid_client", "Metadata client quá lớn");
  const m = JSON.parse(text) as Record<string, unknown>;
  if (m.client_id !== clientId) throw new OAuthError("invalid_client", "client_id trong metadata không khớp URL");
  const uris = Array.isArray(m.redirect_uris) ? m.redirect_uris.filter((x): x is string => typeof x === "string" && validRedirect(x)) : [];
  if (!uris.length) throw new OAuthError("invalid_client", "Metadata client thiếu redirect_uris");
  const client: OAuthClient = {
    client_id: clientId,
    client_name: typeof m.client_name === "string" ? m.client_name.slice(0, 100) : u.hostname,
    redirect_uris: uris,
    logo_uri: typeof m.logo_uri === "string" ? m.logo_uri : undefined,
    client_uri: typeof m.client_uri === "string" ? m.client_uri : undefined,
    kind: "cimd",
    createdAt: Date.now(),
  };
  await kv().set(`pf:cimd:${sha(clientId)}`, client, 3600);
  return client;
}

export async function getClient(clientId: string): Promise<OAuthClient> {
  if (!clientId) throw new OAuthError("invalid_client", "Thiếu client_id");
  if (clientId.startsWith("https://")) return fetchCimd(clientId);
  const c = await kv().get<OAuthClient>(`pf:oc:${clientId}`);
  if (!c) throw new OAuthError("invalid_client", "Client chưa đăng ký", 401);
  return c;
}

// ── Kết nối (grant) ─────────────────────────────────────────────────

export interface Grant {
  id: string;
  userId: string;
  username: string;
  clientId: string;
  clientName: string;
  scope: string;
  createdAt: number;
  lastUsedAt: number | null;
}

const GRANTS = "pf:grants";

export async function listGrants(): Promise<Grant[]> {
  return (await kv().get<Grant[]>(GRANTS)) ?? [];
}

async function saveGrants(grants: Grant[]) {
  await kv().set(GRANTS, grants);
}

export async function revokeGrant(id: string): Promise<void> {
  await saveGrants((await listGrants()).filter((g) => g.id !== id));
}

/** Xoá mọi kết nối của một tài khoản (khi tài khoản bị xoá). */
export async function revokeUserGrants(userId: string): Promise<void> {
  await saveGrants((await listGrants()).filter((g) => g.userId !== userId));
}

// ── Authorization code + PKCE ───────────────────────────────────────

interface CodeRecord {
  clientId: string;
  redirectUri: string;
  challenge: string;
  userId: string;
  username: string;
  scope: string;
  resource: string | null;
}

export async function issueCode(rec: CodeRecord): Promise<string> {
  const code = token();
  await kv().set(`pf:code:${sha(code)}`, rec, CODE_TTL);
  return code;
}

interface AccessRecord {
  grantId: string;
  userId: string;
  clientId: string;
  scope: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}

async function issueTokens(grantId: string, userId: string, clientId: string, scope: string): Promise<TokenResponse> {
  const access = token();
  const refresh = token();
  const rec: AccessRecord = { grantId, userId, clientId, scope };
  await kv().set(`pf:at:${sha(access)}`, rec, ACCESS_TTL);
  await kv().set(`pf:rt:${sha(refresh)}`, rec, REFRESH_TTL);
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL, refresh_token: refresh, scope };
}

export async function exchangeCode(p: { code: string; redirectUri: string; verifier: string; clientId: string }): Promise<TokenResponse> {
  const key = `pf:code:${sha(p.code)}`;
  const rec = await kv().get<CodeRecord>(key);
  await kv().del(key); // dùng một lần
  if (!rec) throw new OAuthError("invalid_grant", "Mã cấp quyền không hợp lệ hoặc đã hết hạn");
  if (rec.clientId !== p.clientId) throw new OAuthError("invalid_grant", "client_id không khớp");
  if (rec.redirectUri !== p.redirectUri) throw new OAuthError("invalid_grant", "redirect_uri không khớp");
  if (!p.verifier || createHash("sha256").update(p.verifier).digest("base64url") !== rec.challenge) throw new OAuthError("invalid_grant", "code_verifier sai");

  const client = await getClient(rec.clientId);
  const grants = await listGrants();
  // Một client trên một tài khoản = một kết nối (kết nối lại thì cập nhật kết nối cũ).
  let grant = grants.find((g) => g.userId === rec.userId && g.clientId === rec.clientId);
  if (!grant) {
    grant = { id: randomUUID(), userId: rec.userId, username: rec.username, clientId: rec.clientId, clientName: client.client_name, scope: rec.scope, createdAt: Date.now(), lastUsedAt: null };
    grants.push(grant);
    await saveGrants(grants);
  }
  return issueTokens(grant.id, rec.userId, rec.clientId, rec.scope);
}

export async function refresh(p: { refreshToken: string; clientId: string }): Promise<TokenResponse> {
  const key = `pf:rt:${sha(p.refreshToken)}`;
  const rec = await kv().get<AccessRecord>(key);
  if (!rec) throw new OAuthError("invalid_grant", "Refresh token không hợp lệ hoặc đã hết hạn");
  if (rec.clientId !== p.clientId) throw new OAuthError("invalid_grant", "client_id không khớp");
  await kv().del(key); // xoay vòng refresh token
  if (!(await listGrants()).some((g) => g.id === rec.grantId)) throw new OAuthError("invalid_grant", "Kết nối đã bị thu hồi");
  if (!(await principal(rec.userId))) throw new OAuthError("invalid_grant", "Tài khoản không còn tồn tại");
  return issueTokens(rec.grantId, rec.userId, rec.clientId, rec.scope);
}

// ── Kiểm tra access token (dùng ở /api/mcp) ─────────────────────────

export interface Principal {
  userId: string;
  username: string;
  role: Role;
}

async function principal(userId: string): Promise<Principal | null> {
  if (userId === ENV_ADMIN_ID) {
    const a = envAdmin();
    return a ? { userId, username: a.username, role: "admin" } : null;
  }
  const u = await findUser(userId).catch(() => undefined);
  return u ? { userId: u.id, username: u.username, role: u.role } : null;
}

export async function verifyAccessToken(accessToken: string): Promise<(Principal & { clientId: string; scope: string; grantId: string }) | null> {
  const rec = await kv().get<AccessRecord>(`pf:at:${sha(accessToken)}`);
  if (!rec) return null;
  const grants = await listGrants();
  const grant = grants.find((g) => g.id === rec.grantId);
  if (!grant) return null;
  const who = await principal(rec.userId);
  if (!who) return null;
  // Ghi "dùng lần cuối" tối đa 5 phút một lần để đỡ ghi.
  if (!grant.lastUsedAt || Date.now() - grant.lastUsedAt > 300_000) {
    grant.lastUsedAt = Date.now();
    await saveGrants(grants).catch(() => undefined);
  }
  return { ...who, clientId: rec.clientId, scope: rec.scope, grantId: rec.grantId };
}

// ── Metadata ────────────────────────────────────────────────────────

export function issuerFrom(req: Request): string {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, "");
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? new URL(req.url).host;
  const proto = h.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  return `${proto}://${host}`;
}

export function authServerMetadata(issuer: string) {
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/api/oauth/token`,
    registration_endpoint: `${issuer}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [SCOPE],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
  };
}

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};
