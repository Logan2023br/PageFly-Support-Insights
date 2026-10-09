import Link from "next/link";
import type { Ticket } from "@/lib/data/types";
import { formatVnDateTime } from "@/lib/data/parse";
import { Badge, Empty, type BadgeTone } from "@/components/ui";

export const PRIORITY_TONE: Record<string, BadgeTone> = { Urgent: "danger", High: "warn", Normal: "neutral" };
export const MOOD_TONE: Record<string, BadgeTone> = { Excited: "success", Happy: "success", Neutral: "neutral", Worried: "warn", Frustrated: "warn", Angry: "danger" };
export const CAT_TONE: Record<string, BadgeTone> = { Feedback: "neutral", Issue: "violet", Improve: "success" };

export function resolutionTone(r: string | null): BadgeTone {
  if (!r) return "neutral";
  if (r === "Đã resolved") return "success";
  if (r.startsWith("Hết ca")) return "danger";
  return "warn";
}

/** Bảng rút gọn dùng trong khung kết quả drill-down. */
export function MiniTable({ tickets, hrefFor, limit = 25 }: { tickets: Ticket[]; hrefFor: (t: Ticket) => string; limit?: number }) {
  if (!tickets.length) return <Empty text="Không có ticket nào trong khoảng này." />;
  return (
    <div className="pf-scroll overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse text-left">
        <thead>
          <tr className="border-b border-pf-border text-[11px] uppercase tracking-[0.06em] text-pf-faint">
            {["Khách contact", "Store", "Loại", "Tóm tắt", "FL / PIC", "Ưu tiên", "Kết quả", "Mood"].map((h) => (
              <th key={h} className="whitespace-nowrap px-3 py-2.5 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tickets.slice(0, limit).map((t) => (
            <tr key={t.id} className="border-b border-pf-border/60 text-[12.5px] last:border-0 hover:bg-pf-card/60">
              <td className="tabular whitespace-nowrap px-3 py-2.5 align-top text-pf-muted">{formatVnDateTime(t.derived.at)}</td>
              <td className="px-3 py-2.5 align-top">
                <div className="grid gap-0.5">
                  <span className="font-semibold text-white">{t.store_name ?? t.store_domain ?? "—"}</span>
                  <span className="text-[11px] text-pf-faint">{t.pagefly_plan ?? "—"}</span>
                </div>
              </td>
              <td className="px-3 py-2.5 align-top">
                <div className="grid gap-1">
                  <Badge tone={CAT_TONE[t.category_ticket ?? ""] ?? "neutral"}>{t.category_ticket ?? "—"}</Badge>
                  {t.category_issue && <span className="text-[11px] text-pf-muted">{t.category_issue}</span>}
                </div>
              </td>
              <td className="max-w-[300px] px-3 py-2.5 align-top">
                <Link href={hrefFor(t)} className="line-clamp-2 text-pf-body hover:text-white hover:underline">
                  {t.issue_summary ?? "—"}
                </Link>
              </td>
              <td className="px-3 py-2.5 align-top text-pf-muted">
                <div className="text-pf-body">{t.triggered_by ?? "—"}</div>
                <div className="text-[11px] text-pf-faint">{t.role_pic.join(" → ") || "—"}</div>
              </td>
              <td className="px-3 py-2.5 align-top">{t.priority ? <Badge tone={PRIORITY_TONE[t.priority] ?? "neutral"}>{t.priority}</Badge> : <span className="text-pf-muted">—</span>}</td>
              <td className="px-3 py-2.5 align-top">{t.resolution ? <Badge tone={resolutionTone(t.resolution)}>{t.resolution}</Badge> : <span className="text-pf-muted">—</span>}</td>
              <td className="whitespace-nowrap px-3 py-2.5 align-top">
                {t.derived.moodEnd ? (
                  <Badge tone={MOOD_TONE[t.derived.moodEnd]}>{t.derived.moodStart && t.derived.moodStart !== t.derived.moodEnd ? `${t.derived.moodStart} → ${t.derived.moodEnd}` : t.derived.moodEnd}</Badge>
                ) : (
                  <span className="text-pf-muted">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
