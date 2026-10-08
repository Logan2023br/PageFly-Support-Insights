import ExcelJS from "exceljs";
import Papa from "papaparse";
import { earliestDay, getDataset } from "@/lib/data";
import { vnDayKey } from "@/lib/data/parse";
import { formatValue } from "@/lib/metrics/compute";
import { parseQuery, selectTickets, type SearchParams } from "@/lib/query";
import { buildReport, GRAIN_LABELS, TEAMS, type ReportGrain, type ReportTeam } from "@/lib/reports";
import { FIELDS } from "@/lib/schema/fields";
import { cellText } from "@/lib/ticket-format";
import { sortTickets } from "@/lib/sort";

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6B2FF7" } };

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = HEADER_FILL;
  row.alignment = { vertical: "middle" };
}

function fileResponse(body: ArrayBuffer | string, filename: string, type: string) {
  return new Response(body, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sp: SearchParams = Object.fromEntries(url.searchParams.entries());
  const kind = url.searchParams.get("kind") ?? "tickets";
  const ds = await getDataset();
  const today = vnDayKey(Date.now());

  if (kind === "report") {
    const team = (url.searchParams.get("team") ?? "cs") as ReportTeam;
    const grain = (url.searchParams.get("grain") ?? "week") as ReportGrain;
    if (!(team in TEAMS) || !(grain in GRAIN_LABELS)) return new Response("Tham số không hợp lệ", { status: 400 });
    const report = buildReport(ds.tickets, team, grain, today);

    const wb = new ExcelJS.Workbook();
    wb.creator = "PageFly Support Insights";
    const ws = wb.addWorksheet("Chỉ số");
    ws.addRow([`Báo cáo ${TEAMS[team].title} theo ${GRAIN_LABELS[grain].toLowerCase()} · xuất ngày ${today}`]).font = { bold: true, size: 13 };
    ws.addRow([]);
    styleHeader(ws.addRow(["Nhóm", "Chỉ số", ...report.periods.map((p) => p.label), "Tổng kỳ", "Thay đổi kỳ gần nhất", "Đánh giá"]));
    for (const row of report.rows) {
      const r = ws.addRow([
        row.def.section,
        row.def.label,
        ...row.values.map((v) => formatValue(v, row.def.format)),
        formatValue(row.total, row.def.format),
        row.change.note,
        row.change.alert === "critical" ? "Báo động" : row.change.alert === "warning" ? "Theo dõi" : row.change.tone === "good" ? "Tốt" : "",
      ]);
      if (row.change.alert) r.getCell(r.cellCount).font = { bold: true, color: { argb: row.change.alert === "critical" ? "FFD03B3B" : "FFC98500" } };
    }
    ws.columns.forEach((c, i) => (c.width = i === 1 ? 34 : i === report.periods.length + 3 ? 60 : 16));
    ws.views = [{ state: "frozen", xSplit: 2, ySplit: 3 }];

    for (const table of report.tables) {
      const sheet = wb.addWorksheet(table.title.slice(0, 31).replace(/[\\/?*[\]:]/g, "-"));
      styleHeader(sheet.addRow(table.columns));
      for (const r of table.rows) sheet.addRow(r);
      sheet.columns.forEach((c, i) => (c.width = i === 0 ? 40 : 18));
      sheet.views = [{ state: "frozen", ySplit: 1 }];
    }
    const buf = await wb.xlsx.writeBuffer();
    return fileResponse(buf as ArrayBuffer, `bao-cao-${team}-${grain}-${today}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }

  // Danh sách ticket theo đúng bộ lọc đang xem
  const q = parseQuery(sp, { earliestDay: earliestDay(ds) });
  const tickets = sortTickets(selectTickets(ds.tickets, q), url.searchParams.get("sort"), url.searchParams.get("dir"));
  const header = FIELDS.map((f) => f.label);
  const rows = tickets.map((t) => FIELDS.map((f) => cellText(t, f.key)));
  const name = `tickets-${q.period.from}_${q.period.to}`;

  if (url.searchParams.get("format") === "csv") {
    const csv = "﻿" + Papa.unparse([FIELDS.map((f) => f.key), ...rows]);
    return fileResponse(csv, `${name}.csv`, "text/csv; charset=utf-8");
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Tickets");
  styleHeader(ws.addRow(header));
  rows.forEach((r) => ws.addRow(r));
  ws.columns.forEach((c, i) => (c.width = ["issue_summary", "review_ticket", "next_action", "upsell_signal", "review_pic"].includes(FIELDS[i].key) ? 44 : 18));
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: header.length } };
  const buf = await wb.xlsx.writeBuffer();
  return fileResponse(buf as ArrayBuffer, `${name}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}
