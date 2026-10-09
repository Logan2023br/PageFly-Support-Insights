import type { Ticket } from "@/lib/data/types";

export interface FlStats {
  name: string;
  tickets: number;
  issues: number;
  shifts: number;
  selfSolved: number;
  selfRate: number | null;
  escalated: number;
  devNeeded: number;
  resolvedRate: number | null;
  firstReplyAvg: number | null;
  maxReplyAvg: number | null;
  handleAvg: number | null;
  csatGood: number | null;
  angry: number;
  moodWorsened: number;
  moodImproved: number;
  reviewAsked: number;
  reviewForgot: number;
  newReviews: number;
  needImprove: number;
  attention: number;
}

const ratio = (num: number, den: number) => (den ? num / den : null);
/** Trung vị cho thời gian (vài ticket kéo dài nhiều ngày làm trung bình lệch). */
const median = (vals: (number | null)[]) => {
  const v = vals.filter((x): x is number => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

/** Hiệu suất theo FL (người note recap = triggered_by). */
export function flStats(ts: Ticket[]): FlStats[] {
  const by = new Map<string, Ticket[]>();
  for (const t of ts) {
    const k = t.triggered_by ?? "(không rõ)";
    if (!by.has(k)) by.set(k, []);
    by.get(k)!.push(t);
  }
  return [...by.entries()]
    .map(([name, list]) => {
      const issues = list.filter((t) => t.category_ticket === "Issue");
      const self = issues.filter((t) => t.derived.handler === "FL").length;
      const withCsat = list.filter((t) => t.csat != null);
      const withRes = list.filter((t) => t.resolution != null);
      return {
        name,
        tickets: list.length,
        issues: issues.length,
        shifts: new Set(list.map((t) => `${t.derived.dayKey}|${t.shift}`)).size,
        selfSolved: self,
        selfRate: ratio(self, issues.length),
        escalated: list.filter((t) => t.derived.handler !== "FL").length,
        devNeeded: list.filter((t) => t.derived.handler === "Dev").length,
        resolvedRate: ratio(withRes.filter((t) => t.derived.resolved).length, withRes.length),
        firstReplyAvg: median(list.map((t) => t.derived.firstReplySec)),
        maxReplyAvg: median(list.map((t) => t.time_pic_max_reply)),
        handleAvg: median(list.map((t) => t.total_time_handle_fl ?? t.total_time_handle)),
        csatGood: ratio(withCsat.filter((t) => t.csat === "Tốt").length, withCsat.length),
        angry: list.filter((t) => t.derived.moodEnd === "Angry").length,
        moodWorsened: list.filter((t) => t.derived.moodWorsened).length,
        moodImproved: list.filter((t) => t.derived.moodImproved).length,
        reviewAsked: list.filter((t) => t.derived.reviewAsked === "asked").length,
        reviewForgot: list.filter((t) => t.derived.reviewAsked === "forgot").length,
        newReviews: list.filter((t) => t.derived.reviewAfterSupport).length,
        needImprove: list.filter((t) => /cần cải thiện/i.test(t.review_pic ?? "")).length,
        attention: list.filter((t) => t.derived.attention).length,
      };
    })
    .sort((a, b) => b.tickets - a.tickets);
}

export interface PicStats {
  name: string;
  role: string;
  tickets: number;
  resolvedRate: number | null;
  joinWaitAvg: number | null;
  handleAvg: number | null;
  pending: number;
  angry: number;
}

/** Hiệu suất TS / Dev, ghép name_pic với role_pic theo thứ tự. */
export function picStats(ts: Ticket[], role: "TS" | "Dev"): PicStats[] {
  const by = new Map<string, Ticket[]>();
  for (const t of ts) {
    if (!t.derived.roles.includes(role)) continue;
    const names =
      t.name_pic.length === t.role_pic.length ? t.name_pic.filter((_, i) => t.role_pic[i] === role) : [t.name_pic[t.name_pic.length - 1]].filter(Boolean);
    for (const name of names) {
      if (!by.has(name)) by.set(name, []);
      by.get(name)!.push(t);
    }
  }
  return [...by.entries()]
    .map(([name, list]) => {
      const withRes = list.filter((t) => t.resolution != null);
      return {
        name,
        role,
        tickets: list.length,
        resolvedRate: ratio(withRes.filter((t) => t.derived.resolved).length, withRes.length),
        joinWaitAvg: median(list.map((t) => t.derived.supportWaitSec)),
        handleAvg: median(list.map((t) => t.total_time_handle_ts ?? t.total_time_handle)),
        pending: list.filter((t) => !t.derived.resolved).length,
        angry: list.filter((t) => t.derived.moodEnd === "Angry").length,
      };
    })
    .sort((a, b) => b.tickets - a.tickets);
}
