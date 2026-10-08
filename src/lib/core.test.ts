import { describe, expect, it } from "vitest";
import { parseDuration, parseVnDateTime, formatVnDateTime, vnDayKey } from "@/lib/data/parse";
import { normalizeRows, mapHeaders } from "@/lib/data/normalize";
import { generateMockSheet } from "@/lib/data/mock";
import { parseQuery, previousPeriod, selectTickets } from "@/lib/query";
import { judge, compareBreakdown } from "@/lib/metrics/compute";
import { FIELDS } from "@/lib/schema/fields";

describe("parse", () => {
  it("đọc các định dạng ngày giờ theo giờ VN", () => {
    const a = parseVnDateTime("2026-09-14 10:49")!;
    expect(formatVnDateTime(a)).toBe("14/09/2026 10:49");
    expect(parseVnDateTime("10:49 14/09/2026")).toBe(a);
    expect(parseVnDateTime("14/09/2026 10:49")).toBe(a);
    expect(vnDayKey(parseVnDateTime("2026-09-14 23:30")!)).toBe("2026-09-14");
    expect(parseVnDateTime("abc")).toBeNull();
  });
  it("đọc serial ngày của Google Sheets", () => {
    const t = parseVnDateTime("46303.5")!;
    expect(formatVnDateTime(t)).toBe("08/10/2026 12:00");
  });
  it("đọc khoảng thời gian", () => {
    expect(parseDuration("0-02-15-30")).toBe(2 * 3600 + 15 * 60 + 30);
    expect(parseDuration("1-00-00-00")).toBe(86400);
    expect(parseDuration("01:00:05")).toBe(3605);
    expect(parseDuration("2h15m")).toBe(8100);
    expect(parseDuration("45 phút")).toBe(2700);
    expect(parseDuration("xyz")).toBeNull();
  });
});

describe("normalize", () => {
  it("nhận header cũ của Recap Log v2 và tách store", () => {
    const header = ["recap_at_vn", "triggered_by", "store", "plan", "plan_price", "category", "issue_area", "mood_label", "resolution", "escalated", "session_id", "issue_summary"];
    const { tickets, headerMap, issues } = normalizeRows(header, [
      ["2026-09-14 11:00", "Eli", "HER Cincinnati · her-cincinnati.myshopify.com", "Silver", "19", "how-to", "third-party-app", "happy", "answered", "no", "s1", "Khách hỏi CAPTCHA"],
    ]);
    const t = tickets[0];
    expect(t.store_domain).toBe("her-cincinnati.myshopify.com");
    expect(t.store_name).toBe("HER Cincinnati");
    expect(t.category_ticket).toBe("Issue");
    expect(t.category_issue).toBe("3rd App");
    expect(t.mood_label_cx).toBe("Happy");
    expect(t.resolution).toBe("Đã resolved");
    expect(t.derived.handler).toBe("FL");
    expect(headerMap.missing).toContain("priority");
    expect(issues.filter((i) => i.level === "error")).toHaveLength(0);
  });
  it("gộp session trùng, giữ recap mới nhất", () => {
    const { tickets, issues } = normalizeRows(["recap_at_vn", "category_ticket", "session_id"], [
      ["2026-09-14 11:00", "Lạ", "s1"],
      ["2026-09-14 12:00", "Issue", "s1"],
    ]);
    expect(tickets).toHaveLength(1);
    // giữ recap mới nhất (12:00), các cảnh báo của dòng cũ bị bỏ theo
    expect(tickets[0].category_ticket).toBe("Issue");
    expect(tickets[0].derived.recapCount).toBe(2);
    expect(issues.some((i) => i.field === "category_ticket")).toBe(false);
  });
  it("cảnh báo giá trị ngoài danh sách", () => {
    const { issues } = normalizeRows(["recap_at_vn", "category_ticket"], [["2026-09-14 11:00", "Lạ"]]);
    expect(issues.some((i) => i.field === "category_ticket")).toBe(true);
  });
  it("suy ra bậc xử lý, mood và review", () => {
    const { tickets } = normalizeRows(
      ["recap_at_vn", "role_pic", "mood_label_cx_end_to_end", "review_asked", "app_review", "time_cx_contact", "time_pic_reply"],
      [["2026-09-14 11:00", "FL, TS, Dev", "Happy->Angry", "Khách vui vẻ nhưng FL quên hỏi", "5s sau khi support", "12:00 14/09/2026", "12:05 14/09/2026"]],
    );
    const d = tickets[0].derived;
    expect(d.handler).toBe("Dev");
    expect(d.moodWorsened).toBe(true);
    expect(d.reviewAsked).toBe("forgot");
    expect(d.reviewAfterSupport).toBe(true);
    expect(d.firstReplySec).toBe(300);
  });
  it("mock sinh đủ 49 cột và chuẩn hoá không lỗi bắt buộc", () => {
    const { header, rows } = generateMockSheet(30, Date.UTC(2026, 9, 8, 5));
    expect(header).toHaveLength(FIELDS.length);
    expect(mapHeaders(header).missing).toHaveLength(0);
    const { tickets, issues } = normalizeRows(header, rows);
    expect(tickets.length).toBeGreaterThan(300);
    expect(issues.filter((i) => i.level === "error")).toHaveLength(0);
    expect(issues.filter((i) => i.field !== "issue_summary")).toHaveLength(0);
  });
});

describe("query", () => {
  const now = Date.UTC(2026, 9, 23, 3); // 23/10/2026 10:00 VN
  it("7 ngày so với 7 ngày liền trước", () => {
    const q = parseQuery({ range: "7d" }, { now });
    expect(q.period).toEqual({ from: "2026-10-17", to: "2026-10-23" });
    expect(q.prev).toEqual({ from: "2026-10-10", to: "2026-10-16" });
  });
  it("chọn 20–23 thì so với 16–19", () => {
    const q = parseQuery({ range: "custom", from: "2026-10-20", to: "2026-10-23" }, { now });
    expect(q.prev).toEqual({ from: "2026-10-16", to: "2026-10-19" });
    expect(previousPeriod({ from: "2026-10-01", to: "2026-10-01" })).toEqual({ from: "2026-09-30", to: "2026-09-30" });
  });
  it("cho phép tự chọn kỳ so sánh", () => {
    const q = parseQuery({ range: "7d", cfrom: "2026-09-01", cto: "2026-09-07" }, { now });
    expect(q.prev).toEqual({ from: "2026-09-01", to: "2026-09-07" });
  });
  it("lọc theo facet và loại ticket", () => {
    const { header, rows } = generateMockSheet(10, now);
    const { tickets } = normalizeRows(header, rows);
    const q = parseQuery({ range: "7d", cat: "Issue", f_priority: "Urgent|High" }, { now });
    const sel = selectTickets(tickets, q);
    expect(sel.length).toBeGreaterThan(0);
    expect(sel.every((t) => t.category_ticket === "Issue" && ["Urgent", "High"].includes(t.priority!))).toBe(true);
  });
});

describe("judge", () => {
  it("Flymate 12 vs 10 không báo động, 15 vs 10 cần theo dõi, 20 vs 10 báo động", () => {
    const base = { key: "x", label: "x", format: "count" as const, polarity: "down-good" as const };
    expect(judge({ ...base, current: 12, previous: 10 }).alert).toBeNull();
    expect(judge({ ...base, current: 13, previous: 10 }).alert).toBe("warning");
    expect(judge({ ...base, current: 20, previous: 10 }).alert).toBe("critical");
    expect(judge({ ...base, critical: true, current: 4, previous: 2 }).alert).toBe("critical");
    expect(judge({ ...base, current: 5, previous: 10 }).tone).toBe("good");
  });
  it("tỷ lệ giảm 6 điểm % là warning", () => {
    const r = judge({ key: "r", label: "r", format: "pct", polarity: "up-good", current: 0.7, previous: 0.76 });
    expect(r.alert).toBe("warning");
  });
  it("mock: Flymate tăng mạnh 7 ngày gần nhất bị bắt", () => {
    const now = Date.UTC(2026, 9, 23, 3);
    const { header, rows } = generateMockSheet(30, now);
    const { tickets } = normalizeRows(header, rows);
    const q = parseQuery({ range: "7d" }, { now });
    const rowsCmp = compareBreakdown(selectTickets(tickets, q), selectTickets(tickets, q, q.prev), (t) => (t.category_ticket === "Issue" ? t.category_issue : null));
    const fly = rowsCmp.find((r) => r.key === "Flymate")!;
    expect(fly.alert).not.toBeNull();
  });
});

import { buildCustomers, health, tenureBucket } from "@/lib/customers";
import { buckets, qualityScore } from "@/lib/metrics/performance";

describe("customers & performance", () => {
  it("đọc tenure nhiều định dạng", () => {
    expect(tenureBucket("5 năm")).toBe("5+ năm");
    expect(tenureBucket("1 năm 1 tháng")).toBe("1–3 năm");
    expect(tenureBucket("3y")).toBe("3–5 năm");
    expect(tenureBucket("10d")).toBe("< 1 tháng");
    expect(tenureBucket("45d")).toBe("1–12 tháng");
    expect(tenureBucket("cài 10 phút rồi gỡ")).toBe("< 1 tháng");
    expect(tenureBucket("")).toBeNull();
  });
  it("sức khoẻ khách trừ điểm theo rủi ro", () => {
    const { tickets } = normalizeRows(
      ["recap_at_vn", "store_domain", "churn_risk", "mood_label_cx", "resolution", "session_id"],
      [
        ["2026-10-01 10:00", "a.myshopify.com", "No", "Happy", "Đã resolved", "s1"],
        ["2026-10-05 10:00", "a.myshopify.com", "Yes", "Angry", "Hết ca vẫn chưa giải quyết", "s2"],
      ],
    );
    const h = health(tickets, Date.UTC(2026, 9, 6));
    expect(h.score).toBe(100 - 35 - 20 - 15);
    const [c] = buildCustomers(tickets, tickets, "2026-10-01", Date.UTC(2026, 9, 6));
    expect(c.segment).toBe("risk");
    expect(c.history).toHaveLength(2);
    expect(c.avgDaysBetween).toBe(4);
  });
  it("điểm chất lượng bỏ thành phần thiếu và chia lại trọng số", () => {
    const { tickets } = normalizeRows(["recap_at_vn", "triggered_by", "resolution", "mood_label_cx"], [
      ["2026-10-01 10:00", "Eli", "Đã resolved", "Happy"],
      ["2026-10-01 11:00", "Eli", "Đã resolved", "Happy"],
    ]);
    const r = qualityScore(tickets, "fl");
    expect(r.score).toBe(100);
    expect(r.coverage.used).toBe(2);
  });
  it("chia mốc tuần bắt đầu thứ Hai, cắt theo khoảng", () => {
    const b = buckets({ from: "2026-10-01", to: "2026-10-14" }, "week");
    expect(b[0]).toMatchObject({ from: "2026-10-01", to: "2026-10-04" });
    expect(b[1]).toMatchObject({ from: "2026-10-05", to: "2026-10-11" });
    expect(b.at(-1)!.to).toBe("2026-10-14");
  });
});

import { buildNameMap } from "@/lib/data/names";

describe("gộp tên nhân sự", () => {
  it("tên một chữ gộp vào tên đầy đủ duy nhất, không phân biệt hoa thường", () => {
    const { canonical, merges } = buildNameMap(["Eli Nguyen", "Eli Nguyen", "Eli", "Logan", "Logan Truong", "Dan segun", "Dan Segun", "Dan Segun", "Aasim", "dev team"]);
    expect(canonical("Eli")).toBe("Eli Nguyen");
    expect(canonical("logan")).toBe("Logan Truong");
    expect(canonical("Dan segun")).toBe("Dan Segun");
    expect(canonical("Aasim")).toBe("Aasim");
    expect(canonical("dev team")).toBe("dev team");
    expect(merges.some((m) => m.from === "Eli" && m.reason === "auto")).toBe(true);
  });
  it("không gộp khi có nhiều tên đầy đủ cùng chữ đầu", () => {
    const { canonical } = buildNameMap(["Max", "Max Le", "Max Tran"]);
    expect(canonical("Max")).toBe("Max");
  });
  it("cột ts nhiều tên: mỗi TS đều được tính", () => {
    const { tickets } = normalizeRows(["recap_at_vn", "triggered_by", "ts", "escalated"], [["2026-10-01 10:00", "Eli Nguyen", "Aasim, Logan", "yes"]]);
    expect(tickets[0].name_pic).toEqual(["Eli Nguyen", "Aasim", "Logan"]);
    expect(tickets[0].role_pic).toEqual(["FL", "TS", "TS"]);
  });
});
