import type { Ticket } from "./types";

/** Ticket thuộc tab Feedback: phân loại Feedback, hoặc có ghi vào feedback form (kể cả ticket Issue/Improve). */
export const isFeedback = (t: Ticket): boolean => t.category_ticket === "Feedback" || Boolean(t.feedback_form);

/** Lọc theo tab loại ticket. Một ticket Issue có feedback form thuộc cả tab Issue lẫn tab Feedback. */
export function inCategory(t: Ticket, cat: string): boolean {
  if (cat === "all") return true;
  if (cat === "Feedback") return isFeedback(t);
  return t.category_ticket === cat;
}

/** Nội dung góp ý để gom nhóm: ticket Feedback dùng tóm tắt; ticket khác dùng nội dung feedback form (bỏ "(người ghi, ngày) #mã"). */
export function feedbackText(t: Ticket): string | null {
  if (t.category_ticket === "Feedback") return t.issue_summary ?? null;
  if (!t.feedback_form) return null;
  return t.feedback_form.replace(/\s*\([^)]*\)\s*#\S+\s*$/, "").replace(/\s*#\S+\s*$/, "").trim() || null;
}
