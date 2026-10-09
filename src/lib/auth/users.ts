import "server-only";
import { randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { Role } from "./session";
import { redisCall, redisConfigured } from "@/lib/store/redis";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export interface UserRecord {
  id: string;
  username: string;
  role: Role;
  passwordHash: string;
  createdAt: number;
  updatedAt: number;
  lastLoginAt: number | null;
}

export type PublicUser = Omit<UserRecord, "passwordHash">;

/** Tài khoản admin gốc khai báo trong biến môi trường, luôn đăng nhập được (phòng khi mất hết tài khoản). */
export const ENV_ADMIN_ID = "env-admin";

export function envAdmin(): { username: string; password: string } | null {
  const username = process.env.ADMIN_USERNAME?.trim();
  const password = process.env.ADMIN_PASSWORD;
  return username && password ? { username, password } : null;
}

// ── Mật khẩu ────────────────────────────────────────────────────────

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [algo, saltHex, keyHex] = stored.split("$");
  if (algo !== "scrypt" || !saltHex || !keyHex) return false;
  const key = await scrypt(pw, Buffer.from(saltHex, "hex"), 64);
  const expected = Buffer.from(keyHex, "hex");
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** So sánh chuỗi thời gian hằng (cho mật khẩu admin gốc). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// ── Nơi lưu ─────────────────────────────────────────────────────────
// Có Redis (Upstash REST: UPSTASH_REDIS_REST_* / KV_REST_API_*, hoặc REDIS_URL của Redis Cloud) → lưu Redis.
// Không có → lưu file data/users.json (chỉ dùng được khi chạy local / server có ổ đĩa).

interface Store {
  kind: "redis" | "file";
  load(): Promise<UserRecord[]>;
  save(users: UserRecord[]): Promise<void>;
}

const REDIS_KEY = "pf:users";

function redisStore(): Store {
  return {
    kind: "redis",
    async load() {
      const r = await redisCall(["GET", REDIS_KEY]);
      return r ? (JSON.parse(String(r)) as UserRecord[]) : [];
    },
    async save(users) {
      await redisCall(["SET", REDIS_KEY, JSON.stringify(users)]);
    },
  };
}

function fileStore(file: string): Store {
  return {
    kind: "file",
    async load() {
      try {
        return JSON.parse(await readFile(file, "utf8")) as UserRecord[];
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw e;
      }
    },
    async save(users) {
      await mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(users, null, 2), { mode: 0o600 });
      await rename(tmp, file);
    },
  };
}

function store(): Store {
  if (redisConfigured()) return redisStore();
  return fileStore(process.env.USERS_FILE ?? path.join(process.cwd(), "data", "users.json"));
}

export function storeKind(): "redis" | "file" {
  return store().kind;
}

/** Trên Vercel không có Redis thì không lưu được tài khoản (ổ đĩa chỉ đọc). */
export function storeWritable(): boolean {
  return store().kind === "redis" || !process.env.VERCEL;
}

// Cache ngắn trong instance để mỗi request không phải đọc lại.
const g = globalThis as unknown as { __pfUsers?: { at: number; users: UserRecord[] } };
const TTL = 15_000;

export async function listUsers(): Promise<UserRecord[]> {
  if (g.__pfUsers && Date.now() - g.__pfUsers.at < TTL) return g.__pfUsers.users;
  const users = await store().load();
  g.__pfUsers = { at: Date.now(), users };
  return users;
}

async function persist(users: UserRecord[]) {
  await store().save(users);
  g.__pfUsers = { at: Date.now(), users };
}

export function toPublic(u: UserRecord): PublicUser {
  return { id: u.id, username: u.username, role: u.role, createdAt: u.createdAt, updatedAt: u.updatedAt, lastLoginAt: u.lastLoginAt };
}

export async function findUser(id: string): Promise<UserRecord | undefined> {
  return (await listUsers()).find((u) => u.id === id);
}

export async function findByUsername(username: string): Promise<UserRecord | undefined> {
  const k = username.trim().toLowerCase();
  return (await listUsers()).find((u) => u.username.toLowerCase() === k);
}

// ── Kiểm tra dữ liệu ────────────────────────────────────────────────

export function validateUsername(u: string): string | null {
  if (!/^[a-zA-Z0-9._-]{2,32}$/.test(u)) return "Username 2–32 ký tự, chỉ gồm chữ không dấu, số, dấu chấm, gạch dưới, gạch ngang.";
  return null;
}

export function validatePassword(p: string): string | null {
  if (p.length < 8) return "Mật khẩu tối thiểu 8 ký tự.";
  if (p.length > 128) return "Mật khẩu tối đa 128 ký tự.";
  return null;
}

// ── Thao tác ────────────────────────────────────────────────────────

export async function createUser(username: string, password: string, role: Role): Promise<UserRecord> {
  const users = await store().load();
  if (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) throw new Error("Username đã tồn tại.");
  const admin = envAdmin();
  if (admin && admin.username.toLowerCase() === username.toLowerCase()) throw new Error("Username trùng với tài khoản admin gốc.");
  const now = Date.now();
  const user: UserRecord = { id: randomUUID(), username, role, passwordHash: await hashPassword(password), createdAt: now, updatedAt: now, lastLoginAt: null };
  await persist([...users, user]);
  return user;
}

export async function updateUser(id: string, patch: { password?: string; role?: Role }): Promise<void> {
  const users = await store().load();
  const i = users.findIndex((u) => u.id === id);
  if (i < 0) throw new Error("Không tìm thấy tài khoản.");
  const next = { ...users[i], updatedAt: Date.now() };
  if (patch.password) next.passwordHash = await hashPassword(patch.password);
  if (patch.role) {
    if (users[i].role === "admin" && patch.role !== "admin" && users.filter((u) => u.role === "admin").length === 1 && !envAdmin()) {
      throw new Error("Không thể hạ quyền admin cuối cùng.");
    }
    next.role = patch.role;
  }
  users[i] = next;
  await persist(users);
}

export async function deleteUser(id: string): Promise<void> {
  const users = await store().load();
  const target = users.find((u) => u.id === id);
  if (!target) throw new Error("Không tìm thấy tài khoản.");
  if (target.role === "admin" && users.filter((u) => u.role === "admin").length === 1 && !envAdmin()) {
    throw new Error("Không thể xoá admin cuối cùng.");
  }
  await persist(users.filter((u) => u.id !== id));
}

export async function touchLogin(id: string): Promise<void> {
  const users = await store().load();
  const u = users.find((x) => x.id === id);
  if (!u) return;
  u.lastLoginAt = Date.now();
  await persist(users).catch(() => undefined); // ghi thời điểm đăng nhập là phụ, lỗi thì bỏ qua
}
