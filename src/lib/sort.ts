import type { Ticket } from "@/lib/data/types";

/** Cột sắp xếp được: khoá trường hoặc trường suy ra. */
const SORTERS: Record<string, (t: Ticket) => number | string | null> = {
  first_reply: (t) => t.derived.firstReplySec,
  priority: (t) => (t.priority === "Urgent" ? 3 : t.priority === "High" ? 2 : t.priority === "Normal" ? 1 : null),
};

export function sortTickets(ts: Ticket[], sort: string | null | undefined, dir: string | null | undefined): Ticket[] {
  const key = sort || "recap_at_vn";
  const sign = dir === "asc" ? 1 : -1;
  const get =
    SORTERS[key] ??
    ((t: Ticket) => {
      const v = (t as unknown as Record<string, unknown>)[key];
      if (Array.isArray(v)) return v.join(", ") || null;
      if (typeof v === "boolean") return v ? 1 : 0;
      return (v as number | string | null) ?? null;
    });
  return [...ts].sort((a, b) => {
    const va = get(a);
    const vb = get(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1; // trống luôn xuống cuối
    if (vb == null) return -1;
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * sign;
    return String(va).localeCompare(String(vb), "vi") * sign;
  });
}
