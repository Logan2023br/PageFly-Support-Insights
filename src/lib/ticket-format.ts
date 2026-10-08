import { formatDuration, formatVnDate, formatVnDateTime } from "@/lib/data/parse";
import type { Ticket } from "@/lib/data/types";
import { FIELD_BY_KEY } from "@/lib/schema/fields";

/** Giá trị hiển thị dạng chuỗi của một trường; "" khi trống. */
export function cellText(t: Ticket, key: string): string {
  const def = FIELD_BY_KEY[key];
  const v = (t as unknown as Record<string, unknown>)[key];
  if (v == null || v === "" || (Array.isArray(v) && !v.length)) return "";
  switch (def?.kind) {
    case "datetime":
      return formatVnDateTime(v as number);
    case "date":
      return formatVnDate(v as number);
    case "duration":
      return formatDuration(v as number);
    case "bool":
      return v ? "Yes" : "No";
    case "multi":
      return (v as string[]).join(", ");
    default:
      return String(v);
  }
}
