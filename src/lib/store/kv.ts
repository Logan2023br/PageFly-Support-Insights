import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { redisCall, redisConfigured } from "./redis";

// Kho key-value có hạn dùng cho OAuth (client, code, token, kết nối).
// Có Redis (Upstash REST hoặc REDIS_URL) → Redis; không có → file data/kv.json.

interface Kv {
  kind: "redis" | "file";
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSec?: number): Promise<void>;
  del(key: string): Promise<void>;
}

function redisKv(): Kv {
  return {
    kind: "redis",
    async get<T>(key: string) {
      const r = await redisCall(["GET", key]);
      return r == null ? null : (JSON.parse(String(r)) as T);
    },
    async set(key, value, ttlSec) {
      await redisCall(ttlSec ? ["SET", key, JSON.stringify(value), "EX", Math.max(1, Math.round(ttlSec))] : ["SET", key, JSON.stringify(value)]);
    },
    async del(key) {
      await redisCall(["DEL", key]);
    },
  };
}

type FileData = Record<string, { v: unknown; exp: number | null }>;

function fileKv(file: string): Kv {
  let chain: Promise<unknown> = Promise.resolve();
  const load = async (): Promise<FileData> => {
    try {
      const data = JSON.parse(await readFile(file, "utf8")) as FileData;
      const now = Date.now();
      for (const [k, e] of Object.entries(data)) if (e.exp && e.exp < now) delete data[k];
      return data;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw e;
    }
  };
  const save = async (data: FileData) => {
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(data), { mode: 0o600 });
    await rename(tmp, file);
  };
  // Ghi tuần tự để không mất dữ liệu khi nhiều request cùng lúc.
  const locked = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = chain.then(fn, fn);
    chain = next.catch(() => undefined);
    return next;
  };
  return {
    kind: "file",
    async get<T>(key: string) {
      const e = (await load())[key];
      return e ? (e.v as T) : null;
    },
    set: (key, value, ttlSec) =>
      locked(async () => {
        const d = await load();
        d[key] = { v: value, exp: ttlSec ? Date.now() + ttlSec * 1000 : null };
        await save(d);
      }),
    del: (key) =>
      locked(async () => {
        const d = await load();
        delete d[key];
        await save(d);
      }),
  };
}

export function kv(): Kv {
  if (redisConfigured()) return redisKv();
  return fileKv(process.env.KV_FILE ?? path.join(process.cwd(), "data", "kv.json"));
}

/** Trên Vercel mà không có Redis thì không lưu được gì (ổ đĩa chỉ đọc). */
export function kvWritable(): boolean {
  return kv().kind === "redis" || !process.env.VERCEL;
}
