// Dữ liệu giả lập đúng hợp đồng 49 cột, dùng khi sheet chưa cấu hình hoặc chưa có cột mới.
// Sinh ra dạng chuỗi giống hệt sheet để đi qua cùng đường chuẩn hoá với dữ liệu thật.
import { FIELDS } from "@/lib/schema/fields";
import { VN_OFFSET_MS, vnDayKey } from "./parse";

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FL = ["Marcel Oketch", "Dan Segun", "Ayla Latifat", "Rasheed Bukola", "Mahedi Hasan", "Aldwin Tabios", "Yakub Mohammed", "Eli Nguyen", "Tina Vo", "Khoa Le"];
const TS = ["Hew", "Logan", "Kai", "Mina"];
const DEV = ["Duy", "Phong", "Thanh"];
const SHIFTS: [string, string][] = [
  ["8-11", "Marcel Oketch"],
  ["11-14", "Ayla Latifat"],
  ["14-17", "Eli Nguyen"],
  ["17-20", "Dan Segun"],
  ["20-23", "Mahedi Hasan"],
  ["23-2", "Yakub Mohammed"],
  ["2-5", "Aldwin Tabios"],
  ["5-8", "Rasheed Bukola"],
];
const PLANS: [string, number, number][] = [
  ["Free", 0, 30],
  ["Silver", 19, 14],
  ["Builder 10 slot", 34, 16],
  ["24 slot", 24, 12],
  ["Gold", 49, 10],
  ["Optimize 20 slot", 69, 8],
  ["Platinum", 99, 6],
  ["140 slot", 199, 2],
];
const SHOPIFY = ["Basic", "Shopify", "Advanced", "Plus", "Starter", "NPO Lite"];
const TZ = ["America/New_York", "America/Los_Angeles", "Europe/London", "Europe/Berlin", "Australia/Sydney", "Asia/Singapore", "Asia/Ho_Chi_Minh", "America/Chicago"];
const STORE_A = ["Bella", "Nordic", "Urban", "Lumi", "Wild", "Oak", "Coral", "Ember", "Velvet", "Sunny", "Pure", "Golden", "Bloom", "Stone", "Echo", "Maple"];
const STORE_B = ["Home", "Wear", "Beauty", "Pets", "Studio", "Goods", "Supply", "Co", "Botanics", "Kids", "Outdoors", "Atelier"];

const ISSUES: Record<string, { w: number; summaries: string[]; roots: string[]; pages: string[] }> = {
  Flymate: {
    w: 10,
    summaries: ["Flymate lỗi không build được trang", "Flymate sinh section sai layout", "Flymate treo khi generate", "Flymate không đọc được ảnh mẫu", "Flymate dịch sai nội dung"],
    roots: ["do app bug", "do giới hạn AI", "do khách dùng sai prompt"],
    pages: ["Product Page", "Home Page", "Regular Page"],
  },
  Style: {
    w: 14,
    summaries: ["Font section không khớp theme", "Khoảng cách mobile bị lệch", "Màu nút không đổi khi publish", "Ảnh bị crop trên mobile"],
    roots: ["do theme", "do khách chưa biết cách chỉnh", "do CSS custom"],
    pages: ["Home Page", "Product Page", "Collection Page", "Regular Page"],
  },
  Editor: {
    w: 12,
    summaries: ["Editor load chậm", "Không kéo thả được element", "Mất thay đổi sau khi save", "Không publish được trang"],
    roots: ["do app bug", "do trình duyệt", "do mạng khách"],
    pages: ["Regular Page", "Multi", "Product Page"],
  },
  "A/B Testing": { w: 4, summaries: ["A/B test không chia traffic", "Không thấy kết quả A/B test"], roots: ["do cấu hình", "do app bug"], pages: ["Product Page", "Home Page"] },
  Bug: { w: 8, summaries: ["Accordion vỡ trên live page", "Slider không chạy trên Safari", "Trang trắng sau publish"], roots: ["do app bug", "do theme"], pages: ["Multi", "Product Page", "Home Page"] },
  "Free service": { w: 5, summaries: ["Nhờ build lại trang landing", "Nhờ chỉnh layout trang chủ"], roots: ["yêu cầu dịch vụ"], pages: ["Home Page", "Regular Page"] },
  ATC: { w: 6, summaries: ["Nút Add to cart không hoạt động", "ATC không nhận variant"], roots: ["do theme", "do app bug", "do app bên thứ 3"], pages: ["Product Page"] },
  Font: { w: 4, summaries: ["Không upload được font custom", "Font hiển thị sai trên live"], roots: ["do khách chưa biết cách chỉnh", "do theme"], pages: ["Multi", "Home Page"] },
  Section: { w: 6, summaries: ["Section PageFly không hiện trong theme", "Không thêm được section vào template"], roots: ["do theme", "do cấu hình"], pages: ["Home Page", "Product Page"] },
  Theme: { w: 7, summaries: ["Theme mới làm vỡ trang PageFly", "Header theme đè lên trang"], roots: ["do theme"], pages: ["Multi", "Home Page", "Collection Page"] },
  "3rd App": { w: 7, summaries: ["Widget review không hiển thị", "App bundle không nhận form product"], roots: ["do app bên thứ 3", "do cấu hình"], pages: ["Product Page", "Collection Page"] },
};
const FEEDBACK_SUMMARIES = ["Khen giao diện editor mới", "Góp ý template ít mẫu ngành thời trang", "Góp ý giá plan hơi cao", "Muốn support trả lời nhanh hơn", "Góp ý onboarding khó hiểu", "Khen Flymate tiết kiệm thời gian"];
const IMPROVE_SUMMARIES = ["Muốn có countdown theo timezone khách", "Muốn export trang sang store khác", "Muốn có element so sánh sản phẩm", "Muốn Flymate hỗ trợ tiếng Việt", "Muốn lịch sử version trang", "Muốn A/B test theo segment", "Muốn tích hợp Klaviyo form"];

function pick<T>(r: () => number, arr: readonly T[]): T {
  return arr[Math.floor(r() * arr.length)];
}
function weighted<T>(r: () => number, items: [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [v, w] of items) {
    x -= w;
    if (x <= 0) return v;
  }
  return items[items.length - 1][0];
}
const pad = (n: number) => String(n).padStart(2, "0");
function fmtDt(epoch: number) {
  const d = new Date(epoch + VN_OFFSET_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
function fmtCx(epoch: number) {
  const d = new Date(epoch + VN_OFFSET_MS);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} ${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}
function fmtDur(sec: number) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${d}-${pad(h)}-${pad(m)}-${pad(s)}`;
}

export function generateMockSheet(days = 120, now = Date.now()): { header: string[]; rows: string[][] } {
  const r = mulberry32(20261008);
  const header = FIELDS.map((f) => f.key);
  const rows: string[][] = [];
  const todayKey = vnDayKey(now);
  const stores = Array.from({ length: 420 }, (_, i) => {
    const name = `${pick(r, STORE_A)} ${pick(r, STORE_B)}${i % 7 === 0 ? " " + (i % 90) : ""}`;
    const plan = weighted(r, PLANS.map((p) => [p, p[2]] as [typeof p, number]));
    const years = Math.floor(r() * 7);
    const installEpoch = now - (years * 365 + Math.floor(r() * 300) + 10) * 86400000;
    return {
      name,
      domain: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.myshopify.com`,
      plan,
      shopify: pick(r, SHOPIFY),
      tz: pick(r, TZ),
      tenure: years === 0 ? `${Math.floor(r() * 11) + 1} tháng` : `${years} năm`,
      install: installEpoch,
      reviewed: r() < 0.22,
    };
  });

  for (let dayOffset = days - 1; dayOffset >= 0; dayOffset--) {
    const dayStart = Date.UTC(+todayKey.slice(0, 4), +todayKey.slice(5, 7) - 1, +todayKey.slice(8, 10)) - VN_OFFSET_MS - dayOffset * 86400000;
    const weekday = new Date(dayStart + VN_OFFSET_MS).getUTCDay();
    const base = weekday === 0 || weekday === 6 ? 11 : 17;
    const count = Math.round(base + r() * 8 + (days - dayOffset) * 0.03);
    // Kịch bản: Flymate tăng mạnh 7 ngày gần nhất để Compare có tín hiệu báo động.
    const recent = dayOffset < 7;

    for (let i = 0; i < count; i++) {
      if (dayOffset === 0 && i > count * 0.5) break; // hôm nay mới qua một phần ngày
      const store = pick(r, stores);
      const [shift, lead] = pick(r, SHIFTS);
      const fl = pick(r, FL);
      const cat = weighted<string>(r, [
        ["Issue", 74],
        ["Feedback", 15],
        ["Improve", 11],
      ]);
      const issueWeights = Object.entries(ISSUES).map(([k, v]) => [k, k === "Flymate" && recent ? v.w * 2.6 : v.w] as [string, number]);
      const area = cat === "Issue" ? weighted(r, issueWeights) : cat === "Improve" ? pick(r, ["Flymate", "Editor", "Section", "A/B Testing"]) : "";
      const spec = area ? ISSUES[area] : null;

      const dayLength = dayOffset === 0 ? Math.max(3600000, (now - dayStart) * 0.7) : 86400000;
      const contact = dayStart + Math.floor(r() * dayLength);
      const firstReply = Math.round(30 + r() * (fl === "Khoa Le" ? 900 : 360) + (r() < 0.06 ? 1800 : 0));
      const escalate = cat === "Issue" && r() < (area === "Bug" || area === "Flymate" ? 0.55 : 0.28);
      const needDev = escalate && r() < (area === "Bug" || area === "Flymate" ? 0.45 : 0.15);
      const roles = needDev ? "FL, TS, Dev" : escalate ? "FL, TS" : "FL";
      const ts = escalate ? pick(r, TS) : "";
      const dev = needDev ? pick(r, DEV) : "";
      const names = [fl.split(" ")[0], ts, dev].filter(Boolean).join(", ");
      const join = escalate ? contact + (firstReply + 300 + Math.floor(r() * 2400)) * 1000 : 0;
      const handleSec = escalate ? 900 + Math.floor(r() * (needDev ? 30000 : 5400)) : 300 + Math.floor(r() * 2400);
      const solution = contact + (firstReply + handleSec) * 1000;
      const ticketSec = handleSec + firstReply + Math.floor(r() * 1800);
      const maxReply = Math.max(firstReply, Math.floor(60 + r() * (fl === "Khoa Le" ? 1500 : 600)));

      const resolution = needDev
        ? weighted<string>(r, [["Đợi dev check", 5], ["Ticket cần dev note", 3], ["Đã resolved", 2]])
        : escalate
          ? weighted<string>(r, [["Đã resolved", 6], ["Đợi TS check", 3], ["Hết ca vẫn chưa giải quyết", 1]])
          : weighted<string>(r, [["Đã resolved", 8], ["Đợi khách phản hồi", 2], ["Hết ca vẫn chưa giải quyết", 1], ["Cần buy time", 0.4]]);
      const resolved = resolution === "Đã resolved";

      const moodStartW: [string, number][] = [["Neutral", 6], ["Worried", 3], ["Frustrated", 1.6], ["Happy", 1.4], ["Angry", 0.5]];
      const moodStart = weighted(r, moodStartW);
      const moodEnd = resolved
        ? weighted<string>(r, [["Happy", 7], ["Neutral", 2.5], ["Worried", 0.3], ["Angry", fl === "Khoa Le" ? 0.6 : 0.1]])
        : weighted<string>(r, [["Neutral", 3], ["Worried", 3], ["Frustrated", 2], ["Angry", needDev ? 1.2 : 0.5]]);

      const refund = cat === "Issue" && r() < 0.035;
      const churn = moodEnd === "Angry" || refund || (!resolved && r() < 0.08) || (recent && area === "Flymate" && r() < 0.18);
      const uninstalled = churn && r() < 0.3 ? fmtDt(contact + 86400000 * (1 + Math.floor(r() * 3))).slice(0, 10) : "";
      const priority = churn || moodEnd === "Angry" ? (r() < 0.6 ? "Urgent" : "High") : escalate && r() < 0.3 ? "High" : "Normal";
      const teamOwner = refund
        ? "Billing/Refund"
        : needDev
          ? "Dev"
          : area === "Free service"
            ? "Free service"
            : cat === "Feedback" && r() < 0.25
              ? "Marketing"
              : area === "3rd App" && r() < 0.35
                ? "Partner"
                : "CS";

      const happy = moodEnd === "Happy";
      const reviewAsked = store.reviewed
        ? "Đã có review từ trước"
        : happy
          ? r() < (fl === "Tina Vo" ? 0.35 : 0.72)
            ? "FL đã hỏi"
            : "Khách vui vẻ nhưng FL quên hỏi"
          : "Không phù hợp để hỏi";
      const appReview = store.reviewed ? "5s" : reviewAsked === "FL đã hỏi" && r() < 0.42 ? "5s sau khi support" : "Chưa đánh giá";
      const crisp = happy && r() < 0.5 ? "5s crisp" : moodEnd === "Angry" && r() < 0.3 ? "2s crisp" : "Chưa đánh giá";

      const price = store.plan[1];
      const upsell =
        price > 0 && price < 69 && r() < 0.12
          ? `Có, khách gói ${price}$ build nhiều trang nên lên gói 69$`
          : price === 0 && r() < 0.1
            ? "Có, khách Free hết slot, gợi ý gói 24$"
            : "Không";

      const summary =
        cat === "Feedback" ? pick(r, FEEDBACK_SUMMARIES) : cat === "Improve" ? pick(r, IMPROVE_SUMMARIES) : refund ? "Khách đòi refund vì không dùng được" : pick(r, spec!.summaries);

      const row: Record<string, string> = {
        recap_at_vn: fmtDt(solution + 600000),
        shift,
        shift_lead: lead,
        triggered_by: fl,
        store_domain: store.domain,
        store_name: store.name,
        pagefly_plan: store.plan[0],
        pagefly_price: String(price),
        shopify_plan: store.shopify,
        timezone: store.tz,
        tenure: store.tenure,
        time_install: fmtDt(store.install).slice(0, 10),
        time_uninstall: uninstalled,
        app_review: appReview,
        app_review_content: appReview.startsWith("5s") ? pick(r, ["Support nhanh và nhiệt tình", "App dễ dùng, team hỗ trợ tốt", "Great support, fixed my page in minutes"]) : "",
        crisp_review: crisp,
        crisp_review_content: crisp.startsWith("5s") ? pick(r, ["Sản phẩm tốt", "Hỗ trợ rất có tâm", "Thanks team!"]) : crisp.startsWith("2s") ? "Chờ quá lâu" : "",
        category_ticket: cat,
        category_issue: cat === "Feedback" ? "" : area,
        page_issue: spec ? pick(r, spec.pages) : "",
        issue_summary: summary,
        type_issue: needDev && r() < 0.5 ? "dev_note" : "normal",
        priority,
        team_owner: teamOwner,
        escalated: escalate ? "Yes" : "No",
        name_pic: names,
        role_pic: roles,
        time_cx_contact: fmtCx(contact),
        time_pic_reply: fmtCx(contact + firstReply * 1000),
        time_pic_support_join: escalate ? fmtCx(join) : "",
        time_pic_solution: resolved || r() < 0.5 ? fmtCx(solution) : "",
        total_time_handle: fmtDur(handleSec),
        total_time_ticket: fmtDur(ticketSec),
        time_pic_max_reply: fmtDur(maxReply),
        root_cause: refund ? "do khách không dùng được app" : spec ? pick(r, spec.roots) : cat === "Feedback" ? "góp ý sản phẩm" : "nhu cầu tính năng",
        resolution,
        feedback_cx_solution: resolved ? (moodEnd === "Angry" ? "Tệ" : "Good") : r() < 0.5 ? "Chưa fix cần kiểm tra lại" : "Chưa phản hồi",
        review_verdict: happy && !store.reviewed ? "RIPE" : churn ? "DO_NOT_ASK" : "NOT_YET",
        review_pic:
          moodEnd === "Angry" && fl === "Khoa Le"
            ? "Cần cải thiện: trả lời chậm, giải thích chưa rõ, khách phải hỏi lại nhiều lần"
            : firstReply > 600
              ? "Cần cải thiện tốc độ phản hồi đầu"
              : pick(r, ["Tốt, giải thích rõ ràng", "Tốt, ăn ý với khách", "Ổn, nên chủ động hơn"]),
        csat: moodEnd === "Happy" ? "Tốt" : moodEnd === "Neutral" ? "Khá" : moodEnd === "Angry" ? "Tệ" : "Trung bình",
        mood_label_cx: moodEnd,
        mood_label_cx_end_to_end: `${moodStart}->${moodEnd}`,
        review_ticket: resolved ? "Đã xử lý xong, khách xác nhận" : needDev ? "Đang chờ dev kiểm tra" : "Chưa xong, cần follow up",
        upsell_signal: upsell,
        churn_risk: churn ? "Yes" : "No",
        next_action: resolved ? "Không còn" : needDev ? "Bám dev, báo khách mốc thời gian" : "Follow up khách trong ca sau",
        session_id: `session_${Math.floor(r() * 0xffffffff).toString(16)}-${dayOffset}-${i}`,
        ticket_url: "",
        review_asked: reviewAsked,
      };
      row.ticket_url = `https://app.crisp.chat/website/demo/inbox/${row.session_id}/`;
      rows.push(header.map((h) => row[h] ?? ""));
    }
  }
  return { header, rows };
}
