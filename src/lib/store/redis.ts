import "server-only";
import { createClient } from "redis";

// Một cổng gọi Redis cho cả 2 kiểu tích hợp trên Vercel:
//  - Upstash (REST): UPSTASH_REDIS_REST_URL/TOKEN, KV_REST_API_URL/TOKEN hoặc REDIS_KV_REST_API_URL/TOKEN (tiền tố REDIS)
//  - Redis Cloud / Redis bất kỳ (TCP): REDIS_URL (redis:// hoặc rediss://)

type Cmd = (string | number)[];

function restConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL ?? process.env.REDIS_KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN ?? process.env.REDIS_KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

export function redisConfigured(): boolean {
  return restConfig() != null || Boolean(process.env.REDIS_URL);
}

/** Chỉ cần sendCommand — tránh kiểu generic rất nặng của node-redis. */
type TcpClient = { sendCommand(args: string[]): Promise<unknown> };
const g = globalThis as unknown as { __pfRedis?: Promise<TcpClient> };

/** Giữ một kết nối TCP dùng lại giữa các request trong cùng instance. */
function tcp(): Promise<TcpClient> {
  if (!g.__pfRedis) {
    const client = createClient({ url: process.env.REDIS_URL, socket: { connectTimeout: 5000, reconnectStrategy: (n) => (n > 3 ? false : 200 * n) } });
    client.on("error", () => undefined); // lỗi được ném ra ở lệnh gọi, tránh crash process
    g.__pfRedis = client.connect().then((c) => c as unknown as TcpClient).catch((e) => {
      g.__pfRedis = undefined;
      throw e;
    });
  }
  return g.__pfRedis;
}

export async function redisCall(cmd: Cmd): Promise<unknown> {
  const rest = restConfig();
  if (rest) {
    const res = await fetch(rest.url, { method: "POST", headers: { Authorization: `Bearer ${rest.token}` }, body: JSON.stringify(cmd), cache: "no-store" });
    if (!res.ok) throw new Error(`Redis lỗi HTTP ${res.status}`);
    const j = (await res.json()) as { result: unknown; error?: string };
    if (j.error) throw new Error(j.error);
    return j.result;
  }
  if (!process.env.REDIS_URL) throw new Error("Chưa cấu hình Redis");
  const client = await tcp();
  return client.sendCommand(cmd.map(String));
}
