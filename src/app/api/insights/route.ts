import { NextResponse } from "next/server";
import { earliestDay, getDataset } from "@/lib/data";
import { vnDayKey } from "@/lib/data/parse";
import { compareFacts, overviewFacts } from "@/lib/dashboard";
import { AiError, generateInsight, type InsightKind } from "@/lib/ai/insights";
import { parseQuery, type SearchParams } from "@/lib/query";
import { buildReport, reportFacts, type ReportGrain, type ReportTeam } from "@/lib/reports";

interface Body {
  kind: InsightKind;
  params?: SearchParams;
}

const KINDS: InsightKind[] = ["overview", "compare", "report-cs", "report-dev", "report-marketing"];
const GRAINS: ReportGrain[] = ["week", "month", "quarter", "all"];

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });
  }
  if (!KINDS.includes(body.kind)) return NextResponse.json({ error: "kind không hợp lệ" }, { status: 400 });

  // Server tự tính lại số liệu từ tham số lọc — client không gửi số.
  const ds = await getDataset();
  const params = body.params ?? {};
  const q = parseQuery(params, { earliestDay: earliestDay(ds) });

  let facts: unknown;
  if (body.kind === "overview") facts = overviewFacts(ds.tickets, q);
  else if (body.kind === "compare") {
    if (!q.prev) return NextResponse.json({ error: "Khoảng Toàn bộ không có kỳ để so sánh" }, { status: 400 });
    facts = compareFacts(ds.tickets, q);
  } else {
    const team = body.kind.replace("report-", "") as ReportTeam;
    const grainParam = String(params.grain ?? "week") as ReportGrain;
    const grain = GRAINS.includes(grainParam) ? grainParam : "week";
    facts = reportFacts(buildReport(ds.tickets, team, grain, vnDayKey(Date.now())));
  }

  try {
    const result = await generateInsight(body.kind, facts);
    return NextResponse.json(result);
  } catch (err) {
    const e = err instanceof AiError ? err : new AiError("Lỗi không xác định", 500);
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}
