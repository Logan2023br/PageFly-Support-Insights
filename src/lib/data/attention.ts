// Luật "ticket cần xử lý" — dùng cho cờ derived.attention, khung Cần xử lý ngay và chuông thông báo.
import type { Ticket } from "./types";

export type ActionLevel = "critical" | "warning";

export interface ActionReason {
  key: string;
  label: string;
  level: ActionLevel;
}

/**
 * Lý do một ticket cần người xem xét (chỉnh luật ở đây):
 *  critical: churn risk chưa xong · khách Angry · hết ca chưa giải quyết · solution chưa fix
 *  warning:  khách Frustrated · đang đợi TS/Dev · CSAT 1–2
 */
export function actionReasons(t: Ticket): ActionReason[] {
  const out: ActionReason[] = [];
  const done = t.derived.resolved;
  if (t.churn_risk && !done) out.push({ key: "churn", label: "Churn risk", level: "critical" });
  if (t.derived.moodEnd === "Angry") out.push({ key: "angry", label: "Khách Angry", level: "critical" });
  if (t.resolution === "Hết ca vẫn chưa giải quyết") out.push({ key: "shift", label: "Hết ca chưa xong", level: "critical" });
  if (t.feedback_cx_solution === "Chưa fix cần kiểm tra lại" || t.feedback_cx_solution === "Tệ") out.push({ key: "solution", label: "Solution chưa ổn", level: "critical" });
  if (t.derived.moodEnd === "Frustrated") out.push({ key: "frustrated", label: "Khách Frustrated", level: "warning" });
  if (t.resolution === "Đợi TS check" || t.resolution === "Đợi dev check") out.push({ key: "waiting", label: t.resolution, level: "warning" });
  if (t.derived.csatScore != null && t.derived.csatScore <= 2) out.push({ key: "csat", label: `CSAT ${t.derived.csatScore}/5`, level: "warning" });
  return out;
}
