// Kỳ báo cáo lưu trữ: tuần (thứ 2 → CN), tháng, quý, năm — luôn là kỳ ĐÃ KẾT THÚC tính đến ngày tạo.
import { addDays, diffDays } from "@/lib/data/parse";
import { lastDayOfMonth, weekStart } from "@/lib/reports";

import type { ArchiveGrain } from "./grains";

export { ARCHIVE_GRAIN_LABEL, ARCHIVE_GRAINS, type ArchiveGrain } from "./grains";

export interface ArchivePeriod {
  /** "custom" = khoảng ngày do người dùng tự chọn khi tạo báo cáo thủ công. */
  grain: ArchiveGrain | "custom";
  from: string;
  to: string;
  /** Nhãn hiển thị, vd "Tuần 29/09 – 05/10/2026", "Tháng 9/2026", "Quý 3/2026", "Năm 2025". */
  label: string;
  year: number;
}

const pad = (n: number) => String(n).padStart(2, "0");
const dm = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`;

/** ISO week number của ngày thứ 2 đầu tuần. */
function isoWeek(monday: string): number {
  const d = new Date(`${monday}T00:00:00Z`);
  const thursday = new Date(d.getTime() + 3 * 86400000);
  const jan1 = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return Math.floor((thursday.getTime() - jan1) / 86400000 / 7) + 1;
}

export function periodOf(grain: ArchiveGrain, from: string): ArchivePeriod {
  const y = +from.slice(0, 4);
  const m = +from.slice(5, 7);
  switch (grain) {
    case "week": {
      const to = addDays(from, 6);
      return { grain, from, to, year: +to.slice(0, 4), label: `Tuần ${isoWeek(from)} · ${dm(from)} – ${dm(to)}/${to.slice(0, 4)}` };
    }
    case "month":
      return { grain, from, to: lastDayOfMonth(y, m), year: y, label: `Tháng ${m}/${y}` };
    case "quarter": {
      const q = Math.ceil(m / 3);
      return { grain, from, to: lastDayOfMonth(y, q * 3), year: y, label: `Quý ${q}/${y}` };
    }
    case "year":
      return { grain, from, to: `${y}-12-31`, year: y, label: `Năm ${y}` };
  }
}

/** Kỳ đã kết thúc gần nhất tính đến ngày `today` (giờ VN). */
export function lastClosed(grain: ArchiveGrain, today: string): ArchivePeriod {
  const y = +today.slice(0, 4);
  const m = +today.slice(5, 7);
  switch (grain) {
    case "week":
      return periodOf("week", addDays(weekStart(today), -7));
    case "month": {
      const pm = m === 1 ? 12 : m - 1;
      return periodOf("month", `${m === 1 ? y - 1 : y}-${pad(pm)}-01`);
    }
    case "quarter": {
      const q = Math.ceil(m / 3);
      const pq = q === 1 ? 4 : q - 1;
      return periodOf("quarter", `${q === 1 ? y - 1 : y}-${pad((pq - 1) * 3 + 1)}-01`);
    }
    case "year":
      return periodOf("year", `${y - 1}-01-01`);
  }
}

const dmy = (k: string) => k.split("-").reverse().join("/");

/** Khoảng ngày tự chọn [from, to] (cả 2 đầu). */
export function customPeriod(from: string, to: string): ArchivePeriod {
  return { grain: "custom", from, to, year: +to.slice(0, 4), label: from === to ? dmy(from) : `${dmy(from)} – ${dmy(to)}` };
}

/** Kỳ liền trước (để so sánh). Khoảng tự chọn → khoảng cùng số ngày ngay trước đó. */
export function previousOf(p: ArchivePeriod): ArchivePeriod {
  if (p.grain === "custom") {
    const len = diffDays(p.from, p.to) + 1;
    return customPeriod(addDays(p.from, -len), addDays(p.from, -1));
  }
  return lastClosed(p.grain, p.from);
}

/** Những loại báo cáo đến hạn tạo vào ngày `today`: thứ 2 → tuần; ngày 1 → tháng; 1/1, 1/4, 1/7, 1/10 → quý; 1/1 → năm. */
export function dueGrains(today: string): ArchiveGrain[] {
  const out: ArchiveGrain[] = [];
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  const d = +today.slice(8, 10);
  const m = +today.slice(5, 7);
  if (dow === 1) out.push("week");
  if (d === 1) out.push("month");
  if (d === 1 && [1, 4, 7, 10].includes(m)) out.push("quarter");
  if (d === 1 && m === 1) out.push("year");
  return out;
}
