// Gộp ticket theo store để nhìn từng khách: số lần liên hệ, trạng thái cuối, sức khoẻ, upsell, churn.
import type { Ticket } from "@/lib/data/types";
import { diffDays, vnDayKey } from "@/lib/data/parse";

export type Segment = "risk" | "care" | "upsell" | "stable";

export const SEGMENTS: Record<Segment, { label: string; tone: "danger" | "warn" | "violet" | "success"; hint: string }> = {
  risk: { label: "Nguy cơ cao", tone: "danger", hint: "Churn risk, đã gỡ app, hoặc sức khoẻ < 50" },
  care: { label: "Cần chăm sóc", tone: "warn", hint: "Sức khoẻ 50–74 hoặc lần liên hệ cuối chưa giải quyết xong" },
  upsell: { label: "Tiềm năng upsell", tone: "violet", hint: "Có tín hiệu upsell và sức khoẻ ≥ 75" },
  stable: { label: "Ổn định", tone: "success", hint: "Không có rủi ro, lần cuối đã xử lý tốt" },
};

export interface HealthFactor {
  label: string;
  points: number;
}

export interface Customer {
  domain: string;
  name: string | null;
  plan: string | null;
  price: number | null;
  shopifyPlan: string | null;
  timezone: string | null;
  country: string | null;
  typeUser: string | null;
  tenure: string | null;
  maxSlot: number | null;
  totalPages: number | null;
  pagesPublished: number | null;
  sectionsPublished: number | null;
  discountCode: string | null;
  installAt: number | null;
  uninstallAt: number | null;
  appReview: string | null;
  crispReview: string | null;
  /** Ticket trong khoảng đang xem. */
  tickets: Ticket[];
  /** Mọi ticket của store (toàn bộ dữ liệu), mới nhất trước. */
  history: Ticket[];
  last: Ticket;
  firstContact: string | null;
  lastContact: string | null;
  /** Lần đầu liên hệ nằm trong khoảng đang xem. */
  isNew: boolean;
  avgDaysBetween: number | null;
  churn: boolean;
  upsell: string | null;
  angry: number;
  unresolved: number;
  health: number;
  factors: HealthFactor[];
  segment: Segment;
}

const MOOD_PENALTY: Record<string, number> = { Angry: -20, Frustrated: -12, Worried: -6 };

/**
 * Điểm sức khoẻ khách 0–100 (bắt đầu từ 100):
 *  churn risk ở lần cuối −35 · đã gỡ app −30 · mood cuối Angry −20 / Frustrated −12 / Worried −6
 *  lần cuối hết ca chưa xong −15, chưa resolved khác −10 · CSAT cuối Tệ −10
 *  liên hệ > 2 lần trong 30 ngày gần nhất −5 mỗi lần (tối đa −20) · đã review 5 sao +5
 */
export function health(history: Ticket[], now: number): { score: number; factors: HealthFactor[] } {
  const last = history[0];
  const f: HealthFactor[] = [];
  if (last.churn_risk) f.push({ label: "Lần liên hệ cuối có churn risk", points: -35 });
  if (history.some((t) => t.time_uninstall != null)) f.push({ label: "Đã gỡ app", points: -30 });
  const mood = last.derived.moodEnd;
  if (mood && MOOD_PENALTY[mood]) f.push({ label: `Mood cuối: ${mood}`, points: MOOD_PENALTY[mood] });
  if (last.resolution === "Hết ca vẫn chưa giải quyết") f.push({ label: "Lần cuối hết ca chưa giải quyết", points: -15 });
  else if (last.resolution && !last.derived.resolved) f.push({ label: `Lần cuối: ${last.resolution}`, points: -10 });
  if (last.csat === "Tệ") f.push({ label: "CSAT lần cuối: Tệ", points: -10 });
  const today = vnDayKey(now);
  const recent = history.filter((t) => t.derived.dayKey && diffDays(t.derived.dayKey, today) <= 30).length;
  if (recent > 2) f.push({ label: `${recent} lần liên hệ trong 30 ngày`, points: -Math.min(20, (recent - 2) * 5) });
  if (history.some((t) => t.derived.appReviewStars === 5)) f.push({ label: "Đã review 5 sao", points: 5 });
  const score = Math.max(0, Math.min(100, 100 + f.reduce((s, x) => s + x.points, 0)));
  return { score, factors: f };
}

function segmentOf(c: Pick<Customer, "churn" | "uninstallAt" | "health" | "last" | "upsell">): Segment {
  if (c.churn || c.uninstallAt != null || c.health < 50) return "risk";
  if (c.health < 75 || (c.last.resolution != null && !c.last.derived.resolved)) return "care";
  if (c.upsell) return "upsell";
  return "stable";
}

const latest = <T,>(ts: Ticket[], get: (t: Ticket) => T | null | undefined): T | null => {
  for (const t of ts) {
    const v = get(t);
    if (v != null && v !== "") return v;
  }
  return null;
};

/** Dựng danh sách khách có ít nhất 1 lần liên hệ trong `inScope`. `all` dùng cho lịch sử đầy đủ. */
export function buildCustomers(all: Ticket[], inScope: Ticket[], periodFrom: string, now: number): Customer[] {
  const byDomain = new Map<string, Ticket[]>();
  for (const t of all) {
    if (!t.store_domain) continue;
    if (!byDomain.has(t.store_domain)) byDomain.set(t.store_domain, []);
    byDomain.get(t.store_domain)!.push(t);
  }
  const scopeBy = new Map<string, Ticket[]>();
  for (const t of inScope) {
    if (!t.store_domain) continue;
    if (!scopeBy.has(t.store_domain)) scopeBy.set(t.store_domain, []);
    scopeBy.get(t.store_domain)!.push(t);
  }

  const out: Customer[] = [];
  for (const [domain, tickets] of scopeBy) {
    const history = [...(byDomain.get(domain) ?? tickets)].sort((a, b) => (b.recap_at_vn ?? 0) - (a.recap_at_vn ?? 0));
    const last = history[0];
    const days = history.map((t) => t.derived.dayKey).filter((d): d is string => d != null);
    const firstContact = days.length ? days[days.length - 1] : null;
    const lastContact = days[0] ?? null;
    const gaps: number[] = [];
    for (let i = 0; i + 1 < days.length; i++) gaps.push(diffDays(days[i + 1], days[i]));
    const { score, factors } = health(history, now);
    const upsell = latest(history.slice(0, 3), (t) => (t.derived.upsell ? t.upsell_signal : null));
    const base = {
      domain,
      name: latest(history, (t) => t.store_name),
      plan: latest(history, (t) => t.pagefly_plan),
      price: latest(history, (t) => t.pagefly_price),
      shopifyPlan: latest(history, (t) => t.shopify_plan),
      timezone: latest(history, (t) => t.timezone),
      country: latest(history, (t) => t.country),
      typeUser: latest(history, (t) => t.type_user),
      tenure: latest(history, (t) => t.tenure),
      maxSlot: latest(history, (t) => t.max_slot),
      totalPages: latest(history, (t) => t.total_pages),
      pagesPublished: latest(history, (t) => t.num_pages_publish),
      sectionsPublished: latest(history, (t) => t.num_section_publish),
      discountCode: latest(history, (t) => t.discount_code),
      installAt: latest(history, (t) => t.time_install),
      uninstallAt: latest(history, (t) => t.time_uninstall),
      appReview: latest(history, (t) => t.app_review),
      crispReview: latest(history, (t) => t.crisp_review),
      tickets: tickets.sort((a, b) => (b.recap_at_vn ?? 0) - (a.recap_at_vn ?? 0)),
      history,
      last,
      firstContact,
      lastContact,
      isNew: firstContact != null && firstContact >= periodFrom,
      avgDaysBetween: gaps.length ? gaps.reduce((s, x) => s + x, 0) / gaps.length : null,
      churn: last.churn_risk === true,
      upsell,
      angry: history.filter((t) => t.derived.moodEnd === "Angry").length,
      unresolved: history.filter((t) => t.resolution != null && !t.derived.resolved).length,
      health: score,
      factors,
    };
    out.push({ ...base, segment: segmentOf(base) });
  }
  return out;
}

export function contactBucket(n: number): string {
  if (n <= 1) return "1 lần";
  if (n === 2) return "2 lần";
  if (n <= 4) return "3–4 lần";
  return "5+ lần";
}

/** Quy "5 năm", "1 năm 2 tháng", "3y", "10d", "2 years", "6 months", "cài 10 phút rồi gỡ" về số năm. */
export function tenureYears(raw: string | null): number | null {
  if (!raw) return null;
  const v = raw.toLowerCase().replace(",", ".");
  const num = (re: RegExp) => {
    const m = v.match(re);
    return m ? Number(m[1]) : 0;
  };
  const years = num(/(\d+(?:\.\d+)?)\s*(?:năm|y\b|yrs?\b|years?\b)/);
  const months = num(/(\d+(?:\.\d+)?)\s*(?:tháng|mo\b|months?\b|m\b)/);
  const days = num(/(\d+(?:\.\d+)?)\s*(?:ngày|d\b|days?\b)/);
  if (years || months || days) return years + months / 12 + days / 365;
  if (/phút|giờ|minute|hour|\b0\b/.test(v)) return 0;
  return null;
}

export function tenureBucket(raw: string | null): string | null {
  const y = tenureYears(raw);
  if (y == null) return null;
  if (y < 1 / 12) return "< 1 tháng";
  if (y < 1) return "1–12 tháng";
  if (y < 3) return "1–3 năm";
  if (y < 5) return "3–5 năm";
  return "5+ năm";
}

export function region(tz: string | null): string | null {
  if (!tz) return null;
  const area = tz.split("/")[0];
  return { America: "Châu Mỹ", Europe: "Châu Âu", Asia: "Châu Á", Australia: "Châu Úc", Africa: "Châu Phi", Pacific: "Thái Bình Dương" }[area] ?? area;
}
