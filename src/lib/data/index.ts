import "server-only";
import { connection } from "next/server";
import { requireUser } from "@/lib/auth/current";
import { generateMockSheet } from "./mock";
import { normalizeRows } from "./normalize";
import { readSheet } from "./sheet";
import type { Dataset } from "./types";
import { setMissingFields } from "./availability";

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

/** Link mở sheet nguồn; SHEET_GID (tuỳ chọn) để mở thẳng đúng tab. */
function sheetUrl(): string | null {
  const id = process.env.SHEET_ID;
  if (!id) return null;
  const gid = process.env.SHEET_GID;
  return `https://docs.google.com/spreadsheets/d/${id}/edit${gid ? `#gid=${gid}` : ""}`;
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
      sourceLabel: "Dữ liệu giả lập (đúng hợp đồng cột)",
      sourceUrl: null,
      sourceTab: null,
      headerCount: header.length,
      loadedAt: now,
      unknownHeaders: headerMap.unknown,
      missingHeaders: headerMap.missing,
      rawRowCount: rows.length,
      duplicates,
      nameMerges,
    };
  }

  const tab = process.env.SHEET_TAB ?? "Recap v11";
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
    sourceUrl: sheetUrl(),
    sourceTab: tab,
    headerCount: raw.header.filter((h) => h?.trim()).length,
    loadedAt: now,
    unknownHeaders: headerMap.unknown,
    missingHeaders: headerMap.missing,
    rawRowCount: raw.rows.length,
    duplicates,
    nameMerges,
  };
}

/** Dataset cho trang web / API nội bộ: bắt buộc đăng nhập bằng cookie (tài khoản còn tồn tại). */
export async function getDataset(opts: { force?: boolean } = {}): Promise<Dataset> {
  // Dữ liệu thay đổi theo thời gian: luôn đọc lúc request, không đưa vào static shell.
  await connection();
  // Chặn tại nguồn: chỉ tài khoản còn tồn tại mới đọc được dữ liệu (kể cả qua API).
  await requireUser();
  return loadDataset(opts);
}

/**
 * Dataset KHÔNG kiểm tra cookie — chỉ gọi sau khi đã xác thực bằng cách khác (vd. token OAuth ở /api/mcp).
 * Cache TTL (mặc định 30 giây). Lỗi tải sheet -> giữ bản cũ và gắn `error`.
 */
export async function loadDataset(opts: { force?: boolean } = {}): Promise<Dataset> {
  const fresh = cache.dataset && Date.now() - cache.dataset.loadedAt < TTL_MS && !cache.dataset.error;
  if (fresh && !opts.force) return cache.dataset!;
  if (cache.inflight) return cache.inflight;

  cache.inflight = load()
    .then((ds) => {
      setMissingFields(ds.missingHeaders);
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
            sourceUrl: sheetUrl(),
            sourceTab: process.env.SHEET_TAB ?? "Recap v11",
            headerCount: 0,
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
