import { ExternalLink } from "lucide-react";
import type { Ticket } from "@/lib/data/types";
import { FIELD_BY_KEY } from "@/lib/schema/fields";
import { cellText } from "@/lib/ticket-format";
import { Badge } from "@/components/ui";
import { CAT_TONE, MOOD_TONE, PRIORITY_TONE, resolutionTone } from "./mini-table";

const Dash = () => <span className="text-pf-muted">—</span>;

/** Ô bảng / giá trị trong ngăn chi tiết, có badge cho các trường trạng thái. */
export function TicketCell({ t, field, full }: { t: Ticket; field: string; full?: boolean }) {
  const text = cellText(t, field);
  if (!text) return <Dash />;
  const def = FIELD_BY_KEY[field];

  switch (field) {
    case "category_ticket":
      return <Badge tone={CAT_TONE[text] ?? "neutral"}>{text}</Badge>;
    case "priority":
      return <Badge tone={PRIORITY_TONE[text] ?? "neutral"}>{text}</Badge>;
    case "resolution":
      return <Badge tone={resolutionTone(text)}>{text}</Badge>;
    case "mood_label_cx":
      return <Badge tone={MOOD_TONE[text] ?? "neutral"}>{text}</Badge>;
    case "mood_label_cx_end_to_end":
      return <Badge tone={t.derived.moodWorsened ? "danger" : t.derived.moodImproved ? "success" : "neutral"}>{text.replace("->", " → ")}</Badge>;
    case "churn_risk":
      return t.churn_risk ? <Badge tone="danger">Yes</Badge> : <span className="text-pf-muted">No</span>;
    case "escalated":
      return t.escalated ? <Badge tone="violet">Yes</Badge> : <span className="text-pf-muted">No</span>;
    case "csat":
      return <Badge tone={text === "Tốt" ? "success" : text === "Tệ" ? "danger" : text === "Trung bình" ? "warn" : "neutral"}>{text}</Badge>;
    case "type_issue":
      return text === "dev_note" ? <Badge tone="warn">dev_note</Badge> : <span className="text-pf-muted">{text}</span>;
    case "review_asked":
      return <span className={t.derived.reviewAsked === "forgot" ? "text-pf-warn" : "text-pf-body"}>{text}</span>;
    case "ticket_url":
      return (
        <a href={text} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-pf-primary-hi hover:underline">
          Crisp <ExternalLink size={12} strokeWidth={1.75} />
        </a>
      );
    case "store_domain":
      return (
        <div className="grid gap-0.5">
          <span className="font-semibold text-white">{t.store_name ?? text}</span>
          <span className="text-[11px] text-pf-faint">{text}</span>
        </div>
      );
  }

  if (def?.kind === "longtext") return <span className={full ? "whitespace-pre-wrap text-pf-body" : "line-clamp-2 block max-w-[280px] text-[11.5px] text-pf-muted"}>{text}</span>;
  if (def?.kind === "datetime" || def?.kind === "date" || def?.kind === "duration" || def?.kind === "number") return <span className="tabular whitespace-nowrap">{text}</span>;
  return <span>{text}</span>;
}
