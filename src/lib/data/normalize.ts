import { FIELDS, FIELD_BY_KEY, MOODS, type FieldDef, type Mood, type Role } from "@/lib/schema/fields";
import { parseBool, parseDuration, parseList, parseNumber, parseVnDateTime, vnDayKey } from "./parse";
import type { DataIssue, Handler, ReviewAskedStatus, Ticket } from "./types";
import { buildNameMap, type NameMerge } from "./names";

const MOOD_RANK: Record<Mood, number> = { Happy: 4, Neutral: 3, Worried: 2, Frustrated: 1, Angry: 0 };

export interface HeaderMap {
  /** chỉ số cột -> key trong hợp đồng */
  columns: Map<number, string>;
  /** Cột "ts" của sheet cũ (tên TS) — dùng khi sheet chưa có name_pic / role_pic. */
  legacyTsColumn: number | null;
  unknown: string[];
  missing: string[];
}

const norm = (s: string) => s.trim().toLowerCase();

export function mapHeaders(header: string[]): HeaderMap {
  const lookup = new Map<string, string>();
  for (const f of FIELDS) {
    lookup.set(norm(f.key), f.key);
    for (const a of f.headerAliases ?? []) lookup.set(norm(a), f.key);
  }
  const columns = new Map<number, string>();
  const unknown: string[] = [];
  const seen = new Set<string>();
  let legacyTsColumn: number | null = null;
  header.forEach((h, i) => {
    if (!h?.trim()) return;
    if (norm(h) === "ts") {
      legacyTsColumn = i;
      return;
    }
    const key = lookup.get(norm(h));
    // Cột tên mới thắng cột alias cũ nếu sheet có cả hai.
    if (key && (!seen.has(key) || norm(h) === key)) {
      if (seen.has(key)) for (const [idx, k] of columns) if (k === key) columns.delete(idx);
      columns.set(i, key);
      seen.add(key);
    } else if (!key) unknown.push(h.trim());
  });
  const missing = FIELDS.filter((f) => !seen.has(f.key)).map((f) => f.key);
  return { columns, legacyTsColumn, unknown, missing };
}

function canonicalEnum(def: FieldDef, raw: string): { value: string; known: boolean } {
  const v = raw.trim();
  const low = v.toLowerCase();
  const direct = def.values?.find((x) => x.toLowerCase() === low);
  if (direct) return { value: direct, known: true };
  const alias = def.valueAliases?.[low];
  if (alias) return { value: alias, known: true };
  return { value: v, known: false };
}

function toMood(raw: string | null | undefined): Mood | null {
  if (!raw) return null;
  const def = FIELD_BY_KEY.mood_label_cx;
  const { value, known } = canonicalEnum(def, raw);
  return known && (MOODS as readonly string[]).includes(value) ? (value as Mood) : null;
}

function reviewAskedStatus(raw: string | null): ReviewAskedStatus {
  if (!raw) return "unknown";
  const v = raw.toLowerCase();
  if (v.includes("quên")) return "forgot";
  if (v.includes("có review") || v.includes("đã review") || v.includes("review rồi") || v.includes("từ trước")) return "already";
  if (v.includes("đã hỏi") || v.includes("đã mời") || v === "yes") return "asked";
  if (v.includes("không phù hợp") || v.includes("không nên") || v === "no") return "not_suitable";
  return "unknown";
}

function stars(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.match(/([1-5])\s*(?:s\b|sao|★|stars?)/i);
  return m ? Number(m[1]) : null;
}

function isUpsell(raw: string | null): boolean {
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  if (!v || ["none", "no", "không", "khong", "-", "n/a"].includes(v)) return false;
  if (v.startsWith("không") || v.startsWith("no ") || v.startsWith("no,")) return false;
  return true;
}

function splitStore(raw: string): { name: string | null; domain: string } {
  // Cột cũ: "HER Cincinnati · her-cincinnati.myshopify.com"
  const parts = raw.split(/\s+[·|]\s+/);
  if (parts.length >= 2) return { name: parts[0].trim() || null, domain: parts[parts.length - 1].trim().toLowerCase() };
  return { name: null, domain: raw.trim().toLowerCase() };
}

export function normalizeRows(header: string[], rows: string[][]): {
  tickets: Ticket[];
  issues: DataIssue[];
  headerMap: HeaderMap;
  /** Số dòng recap bị gộp vì trùng session_id (ticket được recap nhiều lần). */
  duplicates: number;
  nameMerges: NameMerge[];
} {
  const headerMap = mapHeaders(header);
  // Một session có thể được recap nhiều lần: giữ recap mới nhất (theo recap_at_vn, hoà thì lấy dòng dưới).
  const byId = new Map<string, { ticket: Ticket; issues: DataIssue[] }>();
  let duplicates = 0;
  // Mọi tên xuất hiện trong sheet (kể cả recap cũ đã bị thay) để dựng bảng gộp tên.
  const allNames: string[] = [];

  rows.forEach((cells, idx) => {
    const rowNumber = idx + 2; // hàng 1 là header
    if (!cells || cells.every((c) => !String(c ?? "").trim())) return;

    const raw: Record<string, string> = {};
    for (const [col, key] of headerMap.columns) raw[key] = String(cells[col] ?? "").trim();

    const sessionId = raw.session_id || null;
    const id = sessionId ?? `row-${rowNumber}`;
    const rowIssues: DataIssue[] = [];
    const issue = (field: string, value: string, level: DataIssue["level"], message: string) =>
      rowIssues.push({ row: rowNumber, ticketId: id, field, value, level, message });

    const get = (key: string): string | null => (raw[key] ? raw[key] : null);

    const enumField = (key: string): string | null => {
      const v = get(key);
      if (!v) return null;
      const { value, known } = canonicalEnum(FIELD_BY_KEY[key], v);
      if (!known) issue(key, v, "warning", `Giá trị ngoài danh sách cho phép (${FIELD_BY_KEY[key].values?.join(", ")})`);
      return value;
    };
    const dateField = (key: string): number | null => {
      const v = get(key);
      if (!v) return null;
      const t = parseVnDateTime(v);
      if (t == null) issue(key, v, "warning", "Không đọc được ngày giờ");
      return t;
    };
    const durationField = (key: string): number | null => {
      const v = get(key);
      if (!v) return null;
      const d = parseDuration(v);
      if (d == null) issue(key, v, "warning", "Không đọc được khoảng thời gian (dạng ngày-giờ-phút-giây)");
      return d;
    };
    const boolField = (key: string): boolean | null => {
      const v = get(key);
      if (!v) return null;
      const b = parseBool(v);
      if (b == null) issue(key, v, "warning", "Chỉ nhận Yes / No");
      return b;
    };

    // Store: tách cột cũ "Tên · domain"
    let storeDomain = get("store_domain");
    let storeName = get("store_name");
    if (storeDomain) {
      const s = splitStore(storeDomain);
      storeDomain = s.domain;
      storeName = storeName ?? s.name;
    }

    const priceRaw = get("pagefly_price");
    const price = priceRaw ? parseNumber(priceRaw) : null;
    if (priceRaw && price == null) issue("pagefly_price", priceRaw, "warning", "Giá plan phải là số");

    // Sheet cũ: chưa có name_pic/role_pic nhưng có cột ts → FL (triggered_by) + TS.
    const legacyTs = headerMap.legacyTsColumn != null ? String(cells[headerMap.legacyTsColumn] ?? "").trim() : "";
    if (!raw.name_pic && !raw.role_pic) {
      const fl = raw.triggered_by;
      if (legacyTs) {
        // Ô ts có thể chứa nhiều TS ("Aasim, Logan") → mỗi người một vai trò TS.
        const tsNames = parseList(legacyTs);
        raw.name_pic = [fl, ...tsNames].filter(Boolean).join(", ");
        raw.role_pic = [...(fl ? ["FL"] : []), ...tsNames.map(() => "TS")].join(", ");
      } else if (fl) {
        raw.name_pic = fl;
        raw.role_pic = "FL";
      }
    }
    const rolesRaw = parseList(get("role_pic"));
    const roles: Role[] = [];
    for (const r of rolesRaw) {
      const { value, known } = canonicalEnum(FIELD_BY_KEY.role_pic, r);
      if (known) roles.push(value as Role);
      else issue("role_pic", r, "warning", "Vai trò chỉ gồm FL, TS, Dev");
    }

    const t: Ticket = {
      id,
      row: rowNumber,
      recap_at_vn: dateField("recap_at_vn"),
      shift: get("shift"),
      shift_lead: get("shift_lead"),
      triggered_by: get("triggered_by"),
      store_domain: storeDomain,
      store_name: storeName,
      pagefly_plan: get("pagefly_plan"),
      pagefly_price: price,
      shopify_plan: get("shopify_plan"),
      timezone: get("timezone"),
      tenure: get("tenure"),
      time_install: dateField("time_install"),
      time_uninstall: dateField("time_uninstall"),
      app_review: get("app_review"),
      app_review_content: get("app_review_content"),
      crisp_review: get("crisp_review"),
      crisp_review_content: get("crisp_review_content"),
      category_ticket: enumField("category_ticket"),
      category_issue: enumField("category_issue"),
      page_issue: enumField("page_issue"),
      issue_summary: get("issue_summary"),
      type_issue: enumField("type_issue"),
      priority: enumField("priority"),
      team_owner: enumField("team_owner"),
      escalated: boolField("escalated"),
      name_pic: parseList(get("name_pic")),
      role_pic: roles,
      time_cx_contact: dateField("time_cx_contact"),
      time_pic_reply: dateField("time_pic_reply"),
      time_pic_support_join: dateField("time_pic_support_join"),
      time_pic_solution: dateField("time_pic_solution"),
      total_time_handle: durationField("total_time_handle"),
      total_time_ticket: durationField("total_time_ticket"),
      time_pic_max_reply: durationField("time_pic_max_reply"),
      root_cause: get("root_cause"),
      resolution: enumField("resolution"),
      feedback_cx_solution: enumField("feedback_cx_solution"),
      review_verdict: enumField("review_verdict"),
      review_pic: get("review_pic"),
      csat: enumField("csat"),
      mood_label_cx: enumField("mood_label_cx"),
      mood_label_cx_end_to_end: get("mood_label_cx_end_to_end"),
      review_ticket: get("review_ticket"),
      upsell_signal: get("upsell_signal"),
      churn_risk: boolField("churn_risk"),
      next_action: get("next_action"),
      session_id: sessionId,
      ticket_url: get("ticket_url"),
      review_asked: get("review_asked"),
      derived: undefined as unknown as Ticket["derived"],
    };

    for (const f of FIELDS) {
      if (f.required && !raw[f.key] && headerMap.columns.size > 0 && !headerMap.missing.includes(f.key)) {
        issue(f.key, "", "error", "Thiếu trường bắt buộc");
      }
    }
    if (t.issue_summary && t.issue_summary.length > 50) {
      issue("issue_summary", t.issue_summary, "warning", `Dài ${t.issue_summary.length} ký tự (tối đa 50)`);
    }
    if (t.time_cx_contact && t.time_pic_reply && t.time_pic_reply < t.time_cx_contact) {
      issue("time_pic_reply", raw.time_pic_reply, "warning", "Thời gian phản hồi sớm hơn lúc khách contact");
    }

    // ── Trường suy ra ──
    const moodPair = (t.mood_label_cx_end_to_end ?? "").split(/\s*(?:->|→|=>|>)\s*/);
    const moodStart = toMood(moodPair[0]) ?? null;
    const moodEnd = toMood(moodPair[1]) ?? toMood(t.mood_label_cx);
    if (t.mood_label_cx_end_to_end && (!moodStart || !moodPair[1])) {
      issue("mood_label_cx_end_to_end", t.mood_label_cx_end_to_end, "warning", 'Định dạng "Mood->Mood", ví dụ Neutral->Happy');
    }

    const hasDev = roles.includes("Dev") || t.resolution === "Đợi dev check" || t.resolution === "Ticket cần dev note" || t.team_owner === "Dev";
    const hasTs = roles.includes("TS") || t.escalated === true;
    const handler: Handler = hasDev ? "Dev" : hasTs ? "TS" : "FL";

    const firstReplySec =
      t.time_cx_contact && t.time_pic_reply && t.time_pic_reply >= t.time_cx_contact
        ? Math.round((t.time_pic_reply - t.time_cx_contact) / 1000)
        : null;
    const supportWaitSec =
      t.time_cx_contact && t.time_pic_support_join && t.time_pic_support_join >= t.time_cx_contact
        ? Math.round((t.time_pic_support_join - t.time_cx_contact) / 1000)
        : null;

    const moodWorsened = moodStart != null && moodEnd != null && MOOD_RANK[moodEnd] < MOOD_RANK[moodStart];
    const moodImproved = moodStart != null && moodEnd != null && MOOD_RANK[moodEnd] > MOOD_RANK[moodStart];
    const appStars = stars(t.app_review);

    t.derived = {
      dayKey: t.recap_at_vn != null ? vnDayKey(t.recap_at_vn) : null,
      handler,
      roles,
      firstReplySec,
      supportWaitSec,
      resolved: t.resolution === "Đã resolved",
      moodStart,
      moodEnd,
      moodWorsened,
      moodImproved,
      upsell: isUpsell(t.upsell_signal),
      reviewAsked: reviewAskedStatus(t.review_asked),
      appReviewStars: appStars,
      reviewAfterSupport: /sau khi support|after support/i.test(t.app_review ?? ""),
      crispStars: stars(t.crisp_review),
      recapCount: 1,
      attention:
        t.priority === "Urgent" ||
        t.churn_risk === true ||
        moodEnd === "Angry" ||
        moodWorsened ||
        t.feedback_cx_solution === "Tệ" ||
        t.csat === "Tệ",
    };

    allNames.push(...[t.triggered_by, t.shift_lead, ...t.name_pic].filter((x): x is string => !!x));
    const prev = byId.get(id);
    if (prev) {
      duplicates++;
      t.derived.recapCount = prev.ticket.derived.recapCount + 1;
      if ((prev.ticket.recap_at_vn ?? 0) > (t.recap_at_vn ?? 0)) {
        prev.ticket.derived.recapCount = t.derived.recapCount;
        return;
      }
    }
    byId.set(id, { ticket: t, issues: rowIssues });
  });

  const tickets = [...byId.values()].map((e) => e.ticket).sort((a, b) => (b.recap_at_vn ?? 0) - (a.recap_at_vn ?? 0));
  const issues = [...byId.values()].flatMap((e) => e.issues).sort((a, b) => a.row - b.row);
  // Gộp tên nhân sự: mỗi người một tên hiển thị.
  const names = buildNameMap(allNames);
  for (const t of tickets) {
    if (t.triggered_by) t.triggered_by = names.canonical(t.triggered_by);
    if (t.shift_lead) t.shift_lead = names.canonical(t.shift_lead);
    t.name_pic = t.name_pic.map(names.canonical);
  }
  return { tickets, issues, headerMap, duplicates, nameMerges: names.merges };
}
