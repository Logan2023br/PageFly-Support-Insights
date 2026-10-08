import { NAME_ALIASES, NOT_A_PERSON } from "@/config/name-aliases";

export interface NameMerge {
  from: string;
  to: string;
  count: number;
  reason: "manual" | "auto" | "case";
}

const key = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Dựng bảng tên chuẩn: mỗi người một tên hiển thị.
 * 1) NAME_ALIASES thủ công. 2) Gộp khác hoa/thường về cách viết phổ biến nhất.
 * 3) Tên một chữ gộp vào tên đầy đủ duy nhất bắt đầu bằng chữ đó.
 */
export function buildNameMap(occurrences: string[]): { canonical: (name: string) => string; merges: NameMerge[] } {
  const counts = new Map<string, Map<string, number>>(); // key -> spelling -> count
  for (const raw of occurrences) {
    const n = raw.trim().replace(/\s+/g, " ");
    if (!n) continue;
    const k = key(n);
    if (!counts.has(k)) counts.set(k, new Map());
    const m = counts.get(k)!;
    m.set(n, (m.get(n) ?? 0) + 1);
  }

  // Cách viết hiển thị cho mỗi key: phổ biến nhất, hoà thì ưu tiên viết hoa chữ cái đầu mỗi từ.
  const display = new Map<string, string>();
  const total = new Map<string, number>();
  const merges: NameMerge[] = [];
  for (const [k, spellings] of counts) {
    const sorted = [...spellings.entries()].sort((a, b) => b[1] - a[1] || Number(/^(\p{Lu}\S*\s?)+$/u.test(b[0])) - Number(/^(\p{Lu}\S*\s?)+$/u.test(a[0])));
    display.set(k, sorted[0][0]);
    total.set(k, sorted.reduce((s, [, c]) => s + c, 0));
    for (const [sp, c] of sorted.slice(1)) merges.push({ from: sp, to: sorted[0][0], count: c, reason: "case" });
  }

  const target = new Map<string, string>(); // key -> key đích
  const manual = new Map(Object.entries(NAME_ALIASES).map(([a, b]) => [key(a), b]));
  const skip = new Set(NOT_A_PERSON.map(key));

  for (const k of counts.keys()) {
    if (skip.has(k)) continue;
    const m = manual.get(k);
    if (m) {
      const mk = key(m);
      if (!display.has(mk)) display.set(mk, m);
      if (mk !== k) {
        target.set(k, mk);
        merges.push({ from: display.get(k)!, to: m, count: total.get(k)!, reason: "manual" });
      }
      continue;
    }
    if (k.includes(" ")) continue;
    const full = [...counts.keys()].filter((o) => o !== k && !skip.has(o) && o.includes(" ") && o.split(" ")[0] === k);
    if (full.length === 1) {
      target.set(k, full[0]);
      merges.push({ from: display.get(k)!, to: display.get(full[0])!, count: total.get(k)!, reason: "auto" });
    }
  }

  const canonical = (name: string) => {
    const n = name.trim().replace(/\s+/g, " ");
    if (!n) return n;
    let k = key(n);
    for (let i = 0; i < 3 && target.has(k); i++) k = target.get(k)!;
    return display.get(k) ?? n;
  };
  return { canonical, merges: merges.sort((a, b) => b.count - a.count) };
}
