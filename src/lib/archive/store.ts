import "server-only";
import { loadDataset } from "@/lib/data";
import { vnDayKey } from "@/lib/data/parse";
import { kv } from "@/lib/store/kv";
import { TEAMS, type ReportTeam } from "@/lib/reports";
import { customPeriod, lastClosed, type ArchiveGrain, type ArchivePeriod } from "./periods";
import { renderReportPdf } from "./pdf";
import { buildSnapshot } from "./snapshot";

// Kho báo cáo PDF: mục lục (danh sách nhỏ) + từng file PDF (base64) lưu riêng trong KV (Redis / file local).
const INDEX_KEY = "reports:archive:index";
const pdfKey = (id: string) => `reports:archive:pdf:${id}`;

export interface ArchiveEntry {
  id: string;
  team: ReportTeam;
  /** "custom" = báo cáo tự tạo theo khoảng ngày tự chọn. */
  grain: ArchiveGrain | "custom";
  from: string;
  to: string;
  label: string;
  year: number;
  createdAt: number;
  /** true = báo cáo tự động (theo lịch, cả 3 team); false = báo cáo tự tạo (riêng 1 team). */
  auto: boolean;
  /** Báo cáo tự tạo: có phần so sánh với kỳ trước không (tự động luôn có). */
  compare?: boolean;
  /** Người tạo báo cáo tự tạo. */
  createdBy?: string;
  bytes: number;
  tickets: number;
}

async function addToIndex(added: ArchiveEntry[]) {
  if (!added.length) return;
  const store = kv();
  // Đọc lại mục lục ngay trước khi ghi để không đè mục do lần chạy khác vừa thêm.
  const latest = (await store.get<ArchiveEntry[]>(INDEX_KEY)) ?? [];
  const ids = new Set(added.map((a) => a.id));
  await store.set(INDEX_KEY, [...latest.filter((e) => !ids.has(e.id)), ...added]);
}

export const archiveId = (team: ReportTeam, grain: ArchiveGrain, from: string) => `${team}-${grain}-${from}`;

export async function listArchive(): Promise<ArchiveEntry[]> {
  const list = (await kv().get<ArchiveEntry[]>(INDEX_KEY)) ?? [];
  return list.sort((a, b) => b.from.localeCompare(a.from) || a.team.localeCompare(b.team));
}

export async function readArchivePdf(id: string): Promise<{ entry: ArchiveEntry; pdf: Buffer } | null> {
  const entry = (await listArchive()).find((e) => e.id === id);
  if (!entry) return null;
  const b64 = await kv().get<string>(pdfKey(id));
  return b64 ? { entry, pdf: Buffer.from(b64, "base64") } : null;
}

export interface GenerateResult {
  period: ArchivePeriod;
  created: string[];
  skipped: string[];
}

/**
 * Báo cáo tự động: tạo PDF cho cả 3 team của kỳ đã kết thúc gần nhất (theo `grain`).
 * Kỳ đã có file thì bỏ qua, trừ khi `force` (tạo lại với dữ liệu mới nhất).
 */
export async function generateArchive(grain: ArchiveGrain, opts: { auto: boolean; force?: boolean; now?: number }): Promise<GenerateResult> {
  const today = vnDayKey(opts.now ?? Date.now());
  const period = lastClosed(grain, today);
  const ds = await loadDataset({ force: true });
  const store = kv();
  const existing = await listArchive();
  const created: string[] = [];
  const skipped: string[] = [];
  const added: ArchiveEntry[] = [];

  for (const team of Object.keys(TEAMS) as ReportTeam[]) {
    const id = archiveId(team, grain, period.from);
    if (!opts.force && existing.some((e) => e.id === id)) {
      skipped.push(id);
      continue;
    }
    const snap = { ...buildSnapshot(ds.tickets, team, period, today, ds.sourceLabel), auto: opts.auto };
    const pdf = await renderReportPdf(snap);
    await store.set(pdfKey(id), pdf.toString("base64"));
    added.push({ id, team, grain, from: period.from, to: period.to, label: period.label, year: period.year, createdAt: Date.now(), auto: opts.auto, bytes: pdf.length, tickets: snap.totals.tickets });
    created.push(id);
  }

  await addToIndex(added);
  return { period, created, skipped };
}

/**
 * Báo cáo tự tạo: chỉ cho 1 team, khoảng ngày tự chọn, tuỳ chọn so sánh với khoảng cùng độ dài ngay trước.
 * Cùng team + khoảng + kiểu so sánh thì ghi đè bản cũ.
 */
export async function generateCustom(team: ReportTeam, from: string, to: string, opts: { compare: boolean; createdBy: string }): Promise<ArchiveEntry> {
  const period = customPeriod(from, to);
  const ds = await loadDataset({ force: true });
  const snap = { ...buildSnapshot(ds.tickets, team, period, vnDayKey(Date.now()), ds.sourceLabel, opts.compare), auto: false };
  const pdf = await renderReportPdf(snap);
  const id = `${team}-custom-${from}-${to}${opts.compare ? "-cmp" : ""}`;
  await kv().set(pdfKey(id), pdf.toString("base64"));
  const entry: ArchiveEntry = { id, team, grain: "custom", from, to, label: period.label, year: period.year, createdAt: Date.now(), auto: false, compare: opts.compare, createdBy: opts.createdBy, bytes: pdf.length, tickets: snap.totals.tickets };
  await addToIndex([entry]);
  return entry;
}

export async function deleteArchive(id: string): Promise<boolean> {
  const store = kv();
  const list = (await store.get<ArchiveEntry[]>(INDEX_KEY)) ?? [];
  if (!list.some((e) => e.id === id)) return false;
  await store.set(INDEX_KEY, list.filter((e) => e.id !== id));
  await store.del(pdfKey(id));
  return true;
}
