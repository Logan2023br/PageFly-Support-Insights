import "server-only";
import Papa from "papaparse";
import { JWT } from "google-auth-library";

export interface SheetConfig {
  sheetId: string;
  tab: string;
  serviceAccountEmail?: string;
  serviceAccountKey?: string;
}

export interface RawSheet {
  header: string[];
  rows: string[][];
  mode: "sheet-public" | "sheet-service-account";
}

/** Đọc qua Google Sheets API bằng Service Account (sheet chỉ cần share quyền xem cho email service account). */
async function readWithServiceAccount(cfg: SheetConfig): Promise<RawSheet> {
  const client = new JWT({
    email: cfg.serviceAccountEmail,
    key: cfg.serviceAccountKey!.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const range = encodeURIComponent(`'${cfg.tab}'`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${cfg.sheetId}/values/${range}?valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;
  const res = await client.request<{ values?: string[][] }>({ url });
  const values = res.data.values ?? [];
  return { header: values[0] ?? [], rows: values.slice(1), mode: "sheet-service-account" };
}

/** Đọc CSV công khai (sheet đặt "Anyone with the link can view"). Không cần credential. */
async function readPublicCsv(cfg: SheetConfig): Promise<RawSheet> {
  const url = `https://docs.google.com/spreadsheets/d/${cfg.sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(cfg.tab)}`;
  const res = await fetch(url, { cache: "no-store", redirect: "follow" });
  if (!res.ok) throw new Error(`Google Sheets trả về HTTP ${res.status}`);
  const text = await res.text();
  if (text.trimStart().startsWith("<")) {
    throw new Error("Sheet không công khai. Share sheet cho Service Account hoặc bật \"Anyone with the link can view\".");
  }
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
  const values = parsed.data;
  return { header: values[0] ?? [], rows: values.slice(1), mode: "sheet-public" };
}

export async function readSheet(cfg: SheetConfig): Promise<RawSheet> {
  if (cfg.serviceAccountEmail && cfg.serviceAccountKey) return readWithServiceAccount(cfg);
  return readPublicCsv(cfg);
}
