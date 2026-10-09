// Phiên đăng nhập: cookie "payload.signature" ký HMAC-SHA256 bằng AUTH_SECRET.
// Chỉ dùng Web Crypto để chạy được cả trong proxy lẫn server.

export const SESSION_COOKIE = "pf_session";
export const SESSION_DAYS = 7;

export type Role = "admin" | "member";

export interface SessionPayload {
  uid: string;
  u: string;
  r: Role;
  /** Hết hạn (epoch giây). */
  exp: number;
}

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") throw new Error("Thiếu AUTH_SECRET (tối thiểu 32 ký tự) trong biến môi trường.");
  return "dev-only-insecure-secret-change-me-please-0000";
}

async function hmacKey() {
  return crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signSession(p: Omit<SessionPayload, "exp">, days = SESSION_DAYS): Promise<string> {
  const payload: SessionPayload = { ...p, exp: Math.floor(Date.now() / 1000) + days * 86400 };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

export async function verifySession(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const sigBytes = fromB64url(sig);
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(), sigBytes.buffer.slice(sigBytes.byteOffset, sigBytes.byteOffset + sigBytes.byteLength) as ArrayBuffer, enc.encode(body));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(fromB64url(body))) as SessionPayload;
    if (!p.uid || !p.u || (p.r !== "admin" && p.r !== "member")) return null;
    if (p.exp * 1000 < Date.now()) return null;
    return p;
  } catch {
    return null;
  }
}
