import "server-only";
import { createHash } from "node:crypto";
import { kv } from "@/lib/store/kv";
import type { Insight, InsightKind } from "./insights";

// Mỗi tài khoản có 1 "phiên phân tích" cho mỗi (loại + bộ lọc), lưu trong KV để chạy ngầm:
// rời trang / đăng xuất rồi quay lại vẫn thấy kết quả (hoặc đang chạy).

export interface InsightJob {
  status: "running" | "done" | "error";
  kind: InsightKind;
  /** Băm số liệu lúc bấm phân tích — so với số liệu hiện tại để biết kết quả đã cũ. */
  factsHash: string;
  startedAt: number;
  finishedAt?: number;
  insight?: Insight;
  model?: string;
  error?: string;
}

const JOB_TTL_SEC = 14 * 86400;
/** Quá lâu vẫn "running" (hàm server bị dừng giữa chừng) → coi là lỗi để cho chạy lại. */
const STUCK_MS = 3 * 60 * 1000;

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);

export function factsHash(facts: unknown): string {
  return hash(JSON.stringify(facts));
}

function normParams(params: Record<string, unknown>): string {
  return JSON.stringify(Object.keys(params).sort().map((k) => [k, params[k]]));
}

export function jobKey(userId: string, kind: InsightKind, params: Record<string, unknown>): string {
  return `ai:job:${userId}:${hash(`${kind}|${normParams(params)}`)}`;
}

export async function readJob(key: string): Promise<InsightJob | null> {
  const job = await kv().get<InsightJob>(key);
  if (job?.status === "running" && Date.now() - job.startedAt > STUCK_MS) {
    return { ...job, status: "error", error: "Phân tích bị gián đoạn, bấm Phân tích lại." };
  }
  return job;
}

export async function writeJob(key: string, job: InsightJob): Promise<void> {
  await kv().set(key, job, JOB_TTL_SEC);
}

export function isRunning(job: InsightJob | null): boolean {
  return job?.status === "running" && Date.now() - job.startedAt <= STUCK_MS;
}
