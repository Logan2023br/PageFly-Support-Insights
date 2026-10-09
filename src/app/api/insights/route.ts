import { after, NextResponse, type NextRequest } from "next/server";
import { readCurrentUser } from "@/lib/auth/current";
import { earliestDay, getDataset } from "@/lib/data";
import { vnDayKey } from "@/lib/data/parse";
import { compareFacts, overviewFacts } from "@/lib/dashboard";
import { AiError, aiConfigured, generateInsight, type InsightKind } from "@/lib/ai/insights";
import { factsHash, isRunning, jobKey, readJob, writeJob, type InsightJob } from "@/lib/ai/jobs";
import { parseQuery, type SearchParams } from "@/lib/query";
import { buildReport, reportFacts, type ReportGrain, type ReportTeam } from "@/lib/reports";

export const maxDuration = 60;

const KINDS: InsightKind[] = ["overview", "compare", "report-cs", "report-dev", "report-marketing"];
const GRAINS: ReportGrain[] = ["week", "month", "quarter", "all"];

/** Server tự tính lại số liệu từ tham số lọc — client không gửi số. */
async function buildFacts(kind: InsightKind, params: SearchParams): Promise<{ facts: unknown } | { error: string }> {
  const ds = await getDataset();
  const q = parseQuery(params, { earliestDay: earliestDay(ds) });
  if (kind === "overview") return { facts: overviewFacts(ds.tickets, q) };
  if (kind === "compare") return q.prev ? { facts: compareFacts(ds.tickets, q) } : { error: "Khoảng Toàn bộ không có kỳ để so sánh" };
  const team = kind.replace("report-", "") as ReportTeam;
  const grainParam = String(params.grain ?? "week") as ReportGrain;
  const grain = GRAINS.includes(grainParam) ? grainParam : "week";
  return { facts: reportFacts(buildReport(ds.tickets, team, grain, vnDayKey(Date.now()))) };
}

function parseInput(kind: unknown, params: unknown): { kind: InsightKind; params: SearchParams } | null {
  if (!KINDS.includes(kind as InsightKind)) return null;
  return { kind: kind as InsightKind, params: params && typeof params === "object" ? (params as SearchParams) : {} };
}

/** Trạng thái phân tích đã lưu của người dùng + kết quả đó có còn khớp số liệu hiện tại không. */
export async function GET(request: NextRequest) {
  const user = await readCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const sp = request.nextUrl.searchParams;
  let params: unknown = {};
  try {
    params = JSON.parse(sp.get("params") ?? "{}");
  } catch {}
  const input = parseInput(sp.get("kind"), params);
  if (!input) return NextResponse.json({ error: "kind không hợp lệ" }, { status: 400 });

  const job = await readJob(jobKey(user.id, input.kind, input.params));
  if (!job || job.status !== "done") return NextResponse.json({ job, stale: false });
  const built = await buildFacts(input.kind, input.params);
  return NextResponse.json({ job, stale: "facts" in built && factsHash(built.facts) !== job.factsHash });
}

/** Bắt đầu phân tích: trả về ngay, phần gọi AI chạy ngầm ở server và lưu kết quả vào KV. */
export async function POST(request: Request) {
  const user = await readCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { kind?: unknown; params?: unknown } | null;
  const input = parseInput(body?.kind, body?.params);
  if (!input) return NextResponse.json({ error: "kind không hợp lệ" }, { status: 400 });
  if (!aiConfigured()) return NextResponse.json({ error: "Chưa cấu hình ANTHROPIC_API_KEY" }, { status: 503 });

  const built = await buildFacts(input.kind, input.params);
  if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });
  const key = jobKey(user.id, input.kind, input.params);
  const hash = factsHash(built.facts);

  const existing = await readJob(key);
  if (isRunning(existing) && existing!.factsHash === hash) return NextResponse.json({ job: existing, stale: false });

  const job: InsightJob = { status: "running", kind: input.kind, factsHash: hash, startedAt: Date.now() };
  await writeJob(key, job);
  after(async () => {
    let result: InsightJob;
    try {
      const r = await generateInsight(input.kind, built.facts);
      result = { ...job, status: "done", finishedAt: Date.now(), insight: r.insight, model: r.model };
    } catch (err) {
      const message = err instanceof AiError ? err.message : err instanceof Error ? err.message : "Lỗi không xác định";
      result = { ...job, status: "error", finishedAt: Date.now(), error: message };
    }
    // Không ghi đè nếu người dùng đã bấm phân tích lại (lần chạy mới hơn).
    const current = await readJob(key);
    if (!current || current.startedAt === job.startedAt) await writeJob(key, result);
  });
  return NextResponse.json({ job, stale: false });
}
