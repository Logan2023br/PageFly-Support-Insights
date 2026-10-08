// Bộ parse thuần cho giá trị lấy từ sheet. Tất cả thời gian quy về epoch ms theo giờ Việt Nam (UTC+7).

export const VN_OFFSET_MS = 7 * 3600 * 1000;

const pad = (n: number) => String(n).padStart(2, "0");

function vnToEpoch(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): number | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  const ms = Date.UTC(y, mo - 1, d, h, mi, s) - VN_OFFSET_MS;
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Nhận các dạng: "2026-09-14 10:49[:ss]", "2026-09-14", "12:23 13/04/2026", "13/04/2026 12:23",
 * "13/04/2026", serial ngày của Google Sheets (46303.0895).
 */
export function parseVnDateTime(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const v = String(raw).trim();
  if (!v) return null;

  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) return vnToEpoch(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));

  m = v.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return vnToEpoch(+m[6], +m[5], +m[4], +m[1], +m[2], +(m[3] ?? 0));

  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) return vnToEpoch(+m[3], +m[2], +m[1], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));

  if (/^\d{5}(\.\d+)?$/.test(v)) {
    // Serial Google Sheets: số ngày kể từ 1899-12-30, giá trị là giờ địa phương của sheet (VN).
    const serial = Number(v);
    return Math.round((serial - 25569) * 86400 * 1000) - VN_OFFSET_MS;
  }
  return null;
}

/** "YYYY-MM-DD" theo giờ Việt Nam của một epoch. */
export function vnDayKey(epoch: number): string {
  const d = new Date(epoch + VN_OFFSET_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Epoch bắt đầu ngày (00:00 VN) của một day key. */
export function dayKeyStart(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d) - VN_OFFSET_MS;
}

export function addDays(key: string, n: number): string {
  return vnDayKey(dayKeyStart(key) + n * 86400000);
}

export function diffDays(from: string, to: string): number {
  return Math.round((dayKeyStart(to) - dayKeyStart(from)) / 86400000);
}

/**
 * Khoảng thời gian -> giây. Nhận "d-h-m-s" (0-02-15-30), "hh:mm:ss", "mm:ss",
 * "1d 2h 3m 4s" / "2h15m" / "45 phút", hoặc số giây thuần.
 */
export function parseDuration(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const v = String(raw).trim().toLowerCase();
  if (!v) return null;

  let m = v.match(/^(\d+)-(\d{1,2})-(\d{1,2})-(\d{1,2})$/);
  if (m) return +m[1] * 86400 + +m[2] * 3600 + +m[3] * 60 + +m[4];

  m = v.match(/^(\d+):(\d{2}):(\d{2})$/);
  if (m) return +m[1] * 3600 + +m[2] * 60 + +m[3];

  m = v.match(/^(\d+):(\d{2})$/);
  if (m) return +m[1] * 60 + +m[2];

  if (/^\d+(\.\d+)?$/.test(v)) return Math.round(Number(v));

  const units: Record<string, number> = { d: 86400, ngày: 86400, h: 3600, giờ: 3600, m: 60, phút: 60, s: 1, giây: 1 };
  const re = /(\d+(?:\.\d+)?)\s*(ngày|giờ|phút|giây|d|h|m|s)/g;
  let total = 0;
  let matched = false;
  for (const part of v.matchAll(re)) {
    total += Number(part[1]) * units[part[2]];
    matched = true;
  }
  return matched ? Math.round(total) : null;
}

export function parseNumber(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const v = String(raw).replace(/[$,\s]/g, "").replace(/usd/i, "");
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function parseBool(raw: string | null | undefined): boolean | null {
  if (raw == null) return null;
  const v = String(raw).trim().toLowerCase();
  if (!v) return null;
  if (["yes", "y", "true", "1", "có", "co"].includes(v)) return true;
  if (["no", "n", "false", "0", "không", "khong", "none"].includes(v)) return false;
  return null;
}

export function parseList(raw: string | null | undefined): string[] {
  if (raw == null) return [];
  return String(raw)
    .split(/\s*(?:,|;|\/|\+|&|\band\b)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Định dạng giây -> "2d 3h", "1h 05m", "12m 30s", "45s". */
export function formatDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return "—";
  const s = Math.round(sec);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${pad(m)}m`;
  if (m > 0) return `${m}m ${pad(r)}s`;
  return `${r}s`;
}

/** Hiển thị epoch theo giờ VN: "13/04/2026 12:23". */
export function formatVnDateTime(epoch: number | null | undefined): string {
  if (epoch == null) return "—";
  const d = new Date(epoch + VN_OFFSET_MS);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function formatVnDate(epochOrKey: number | string | null | undefined): string {
  if (epochOrKey == null) return "—";
  const key = typeof epochOrKey === "number" ? vnDayKey(epochOrKey) : epochOrKey;
  const [y, m, d] = key.split("-");
  return `${d}/${m}/${y}`;
}
