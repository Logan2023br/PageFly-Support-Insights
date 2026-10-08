import "server-only";
import { connection } from "next/server";
import { generateMockSheet } from "./mock";
import { normalizeRows } from "./normalize";
import { readSheet } from "./sheet";
import type { Dataset } from "./types";

const TTL_MS = Number(process.env.DATA_CACHE_SECONDS ?? 30) * 1000;

interface CacheState {
  dataset: Dataset | null;
  inflight: Promise<Dataset> | null;
}

// Giữ cache qua các lần hot-reload trong dev.
const g = globalThis as unknown as { __pfDataCache?: CacheState };
const cache: CacheState = (g.__pfDataCache ??= { dataset: null, inflight: null });

function resolveSource(): "mock" | "sheet" {
  const mode = (process.env.DATA_SOURCE ?? "auto").toLowerCase();
  if (mode === "mock") return "mock";
  if (mode === "sheet") return "sheet";
  return process.env.SHEET_ID ? "sheet" : "mock";
}

async function load(): Promise<Dataset> {
  const now = Date.now();
  if (resolveSource() === "mock") {
    const { header, rows } = generateMockSheet(120, now);
    const { tickets, issues, headerMap, duplicates, nameMerges } = normalizeRows(header, rows);
    return {
      tickets,
      issues,
      source: "mock",
      sourceLabel: "Dữ liệu giả lập (đúng hợp đồng 49 cột)",
      loadedAt: now,
      unknownHeaders: headerMap.unknown,
      missingHeaders: headerMap.missing,
      rawRowCount: rows.length,
      duplicates,
      nameMerges,
    };
  }

  const tab = process.env.SHEET_TAB ?? "Recap Log";
  const raw = await readSheet({
    sheetId: process.env.SHEET_ID!,
    tab,
    serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    serviceAccountKey: process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
  });
  const { tickets, issues, headerMap, duplicates, nameMerges } = normalizeRows(raw.header, raw.rows);
  return {
    tickets,
    issues,
    source: raw.mode,
    sourceLabel: `Google Sheet · ${tab}`,
    loadedAt: now,
    unknownHeaders: headerMap.unknown,
    missingHeaders: headerMap.missing,
    rawRowCount: raw.rows.length,
    duplicates,
    nameMerges,
  };
}

/** Dataset đã chuẩn hoá, cache TTL (mặc định 5 phút). Lỗi tải sheet -> giữ bản cũ và gắn `error`. */
export async function getDataset(opts: { force?: boolean } = {}): Promise<Dataset> {
  // Dữ liệu thay đổi theo thời gian: luôn đọc lúc request, không đưa vào static shell.
  await connection();
  const fresh = cache.dataset && Date.now() - cache.dataset.loadedAt < TTL_MS && !cache.dataset.error;
  if (fresh && !opts.force) return cache.dataset!;
  if (cache.inflight) return cache.inflight;

  cache.inflight = load()
    .then((ds) => {
      cache.dataset = ds;
      return ds;
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      const fallback: Dataset = cache.dataset
        ? { ...cache.dataset, error: message }
        : {
            tickets: [],
            issues: [],
            source: "sheet-public",
            sourceLabel: "Google Sheet",
            loadedAt: Date.now(),
            unknownHeaders: [],
            missingHeaders: [],
            rawRowCount: 0,
            duplicates: 0,
            nameMerges: [],
            error: message,
          };
      cache.dataset = fallback;
      return fallback;
    })
    .finally(() => {
      cache.inflight = null;
    });
  return cache.inflight;
}

/** Ngày sớm nhất có dữ liệu (dùng cho khoảng "Toàn bộ"). */
export function earliestDay(ds: Dataset): string | undefined {
  let min: string | undefined;
  for (const t of ds.tickets) if (t.derived.dayKey && (!min || t.derived.dayKey < min)) min = t.derived.dayKey;
  return min;
}
