// Hợp đồng cột giữa sheet Recap và web. Mọi tên cột, giá trị hợp lệ và định dạng đều khai báo ở đây;
// docs/sheet-contract.md được sinh ra từ file này (npm run contract) nên không bao giờ lệch nhau.
// File này không import alias "@/..." để script Node có thể đọc trực tiếp.

export type FieldGroup = "basic" | "customer" | "ticket" | "handling";

export type FieldKind =
  | "text" // chuỗi tự do
  | "longtext" // chuỗi dài, hiển thị rút gọn
  | "datetime" // ngày giờ (giờ Việt Nam)
  | "date" // chỉ ngày
  | "duration" // khoảng thời gian, lưu ở dạng giây
  | "number"
  | "enum" // một giá trị trong danh sách
  | "multi" // nhiều giá trị, ngăn bằng dấu phẩy
  | "bool" // Yes / No
  | "url";

export interface FieldDef {
  key: string;
  label: string;
  group: FieldGroup;
  kind: FieldKind;
  description: string;
  example: string;
  /** Giá trị hợp lệ (enum / multi). */
  values?: readonly string[];
  /** Ánh xạ giá trị cũ / viết khác -> giá trị chuẩn (so khớp không phân biệt hoa thường). */
  valueAliases?: Record<string, string>;
  /** Tên cột cũ trong sheet "Recap Log" v2 vẫn được nhận. */
  headerAliases?: readonly string[];
  required?: boolean;
  /** Ẩn khỏi bảng mặc định (vẫn xem được trong chi tiết ticket). */
  hiddenByDefault?: boolean;
  /** Trường nhạy cảm về nhân sự (sẽ ẩn với team ngoài CS khi có phân quyền). */
  sensitive?: boolean;
}

export const GROUP_LABELS: Record<FieldGroup, string> = {
  basic: "Thông tin cơ bản",
  customer: "Thông tin khách hàng",
  ticket: "Thông tin ticket",
  handling: "Thông tin xử lý",
};

export const CATEGORY_TICKET = ["Feedback", "Issue", "Improve"] as const;
export const CATEGORY_ISSUE = [
  "Flymate",
  "Style",
  "Editor",
  "A/B Testing",
  "Bug",
  "Free service",
  "ATC",
  "Font",
  "Section",
  "Theme",
  "3rd App",
] as const;
export const PAGE_ISSUE = [
  "Multi",
  "Regular Page",
  "Home Page",
  "Product Page",
  "Collection Page",
  "Blog Page",
  "Contact Page",
  "Password Page",
] as const;
export const ROLE_PIC = ["FL", "TS", "Dev"] as const;
export const RESOLUTION = [
  "Đã resolved",
  "Hết ca vẫn chưa giải quyết",
  "Đợi TS check",
  "Đợi dev check",
  "Ticket cần dev note",
  "Cần buy time",
  "Đợi khách phản hồi",
] as const;
export const FEEDBACK_CX_SOLUTION = ["Good", "Tệ", "Chưa fix cần kiểm tra lại", "Chưa phản hồi"] as const;
export const CSAT = ["Tốt", "Khá", "Trung bình", "Tệ"] as const;
export const MOODS = ["Happy", "Neutral", "Worried", "Frustrated", "Angry"] as const;
export const REVIEW_VERDICT = ["RIPE", "NOT_YET", "DO_NOT_ASK"] as const;
export const PRIORITY = ["Urgent", "High", "Normal"] as const;
export const TEAM_OWNER = ["CS", "Dev", "Billing/Refund", "Marketing", "Partner", "Free service"] as const;
export const TYPE_ISSUE = ["dev_note", "normal"] as const;

export type CategoryTicket = (typeof CATEGORY_TICKET)[number];
export type Mood = (typeof MOODS)[number];
export type Role = (typeof ROLE_PIC)[number];

const MOOD_ALIASES: Record<string, string> = {
  natural: "Neutral",
  neutral: "Neutral",
  happy: "Happy",
  worried: "Worried",
  frustrated: "Frustrated",
  angry: "Angry",
  "vui vẻ": "Happy",
  "bình thường": "Neutral",
  "lo lắng": "Worried",
  "bực": "Frustrated",
  "tức giận": "Angry",
};

export const FIELDS: readonly FieldDef[] = [
  // ── Thông tin cơ bản ──────────────────────────────────────────────
  {
    key: "recap_at_vn",
    label: "Thời gian recap",
    group: "basic",
    kind: "datetime",
    required: true,
    description: "Thời điểm ghi recap, giờ Việt Nam. Dùng làm mốc lọc thời gian của toàn bộ web.",
    example: "2026-09-14 10:49",
  },
  { key: "shift", label: "Ca", group: "basic", kind: "text", description: "Ca làm việc.", example: "8-11" },
  { key: "shift_lead", label: "Shift lead", group: "basic", kind: "text", description: "Shift lead của ca.", example: "Marcel Oketch" },
  {
    key: "triggered_by",
    label: "Người handle",
    group: "basic",
    kind: "text",
    required: true,
    description: "Người note recap (FL handle ticket).",
    example: "Eli Nguyen",
  },

  // ── Thông tin khách hàng ──────────────────────────────────────────
  {
    key: "store_domain",
    label: "Store domain",
    group: "customer",
    kind: "text",
    required: true,
    headerAliases: ["store"],
    description: "Domain myshopify của store. Nếu cột cũ dạng \"Tên · domain\" web tự tách.",
    example: "loganstore.myshopify.com",
  },
  { key: "store_name", label: "Tên store", group: "customer", kind: "text", description: "Tên store.", example: "loganstore" },
  {
    key: "pagefly_plan",
    label: "Plan PageFly",
    group: "customer",
    kind: "text",
    headerAliases: ["plan"],
    description: "Plan PageFly hiện tại.",
    example: "24 slot",
  },
  {
    key: "pagefly_price",
    label: "Giá plan ($)",
    group: "customer",
    kind: "number",
    headerAliases: ["plan_price"],
    description: "Chi phí plan hiện tại, USD/tháng. Chỉ ghi số.",
    example: "24",
  },
  { key: "shopify_plan", label: "Plan Shopify", group: "customer", kind: "text", description: "Plan Shopify.", example: "Basic" },
  {
    key: "timezone",
    label: "Múi giờ",
    group: "customer",
    kind: "text",
    headerAliases: ["time/zone", "time_zone"],
    description: "Múi giờ hoạt động chính của khách (IANA).",
    example: "Asia/Ho_Chi_Minh",
  },
  { key: "tenure", label: "Thời gian dùng app", group: "customer", kind: "text", description: "Đã dùng app bao lâu.", example: "5 năm" },
  { key: "time_install", label: "Ngày cài app", group: "customer", kind: "date", description: "Ngày cài đặt app.", example: "2019-09-24" },
  {
    key: "time_uninstall",
    label: "Ngày gỡ app",
    group: "customer",
    kind: "date",
    description: "Ngày gỡ app, để trống nếu chưa gỡ.",
    example: "2026-09-30",
  },
  {
    key: "app_review",
    label: "Review App Store",
    group: "customer",
    kind: "text",
    headerAliases: ["already_reviewed"],
    description: "Trạng thái review trên Shopify App Store. Nếu review sau khi support thì ghi \"5s sau khi support\".",
    example: "5s sau khi support",
  },
  {
    key: "app_review_content",
    label: "Nội dung review App",
    group: "customer",
    kind: "longtext",
    hiddenByDefault: true,
    description: "Nội dung review trên App Store.",
    example: "Support rất nhanh",
  },
  {
    key: "crisp_review",
    label: "Review Crisp",
    group: "customer",
    kind: "text",
    headerAliases: ["crips_review"],
    description: "Đánh giá trong Crisp.",
    example: "5s crisp",
  },
  {
    key: "crisp_review_content",
    label: "Nội dung review Crisp",
    group: "customer",
    kind: "longtext",
    hiddenByDefault: true,
    headerAliases: ["crips_review_content"],
    description: "Nội dung đánh giá Crisp.",
    example: "Sản phẩm tốt",
  },

  // ── Thông tin ticket ──────────────────────────────────────────────
  {
    key: "category_ticket",
    label: "Loại ticket",
    group: "ticket",
    kind: "enum",
    required: true,
    values: CATEGORY_TICKET,
    headerAliases: ["category"],
    valueAliases: {
      feedback: "Feedback",
      "góp ý": "Feedback",
      "pre-sales": "Feedback",
      issue: "Issue",
      bug: "Issue",
      "app bug": "Issue",
      technical: "Issue",
      "how-to": "Issue",
      billing: "Issue",
      improve: "Improve",
      "feature-request": "Improve",
      "free-service": "Issue",
      "feature request": "Improve",
    },
    description: "Feedback = góp ý · Issue = vấn đề khách gặp · Improve = chức năng khách muốn có.",
    example: "Issue",
  },
  {
    key: "category_issue",
    label: "Nhóm issue",
    group: "ticket",
    kind: "enum",
    values: CATEGORY_ISSUE,
    headerAliases: ["issue_area"],
    valueAliases: {
      flymate: "Flymate",
      style: "Style",
      "editor-styling": "Style",
      editor: "Editor",
      publish: "Editor",
      "a/b testing": "A/B Testing",
      "ab testing": "A/B Testing",
      bug: "Bug",
      "live-page-display": "Bug",
      "storefront-render": "Bug",
      "free service": "Free service",
      "free-service": "Free service",
      atc: "ATC",
      font: "Font",
      section: "Section",
      theme: "Theme",
      "theme-conflict": "Theme",
      "3rd app": "3rd App",
      "third-party-app": "3rd App",
    },
    description: "Phân loại danh mục issue.",
    example: "Flymate",
  },
  {
    key: "page_issue",
    label: "Trang gặp vấn đề",
    group: "ticket",
    kind: "enum",
    values: PAGE_ISSUE,
    valueAliases: { regular: "Regular Page", home: "Home Page", product: "Product Page", collection: "Collection Page", blog: "Blog Page" },
    description: "Loại trang gặp vấn đề. Nhiều loại thì ghi Multi.",
    example: "Product Page",
  },
  {
    key: "issue_summary",
    label: "Tóm tắt issue",
    group: "ticket",
    kind: "longtext",
    required: true,
    description: "Mô tả ngắn gọn issue, tối đa 50 ký tự.",
    example: "Flymate lỗi không build được",
  },
  {
    key: "type_issue",
    label: "Loại xử lý",
    group: "ticket",
    kind: "enum",
    values: TYPE_ISSUE,
    valueAliases: { "dev note": "dev_note", devnote: "dev_note", "dev-note": "dev_note", thường: "normal" },
    description: "dev_note nếu issue đã có segment dev_note từ trước, ngược lại normal.",
    example: "normal",
  },
  {
    key: "priority",
    label: "Mức ưu tiên",
    group: "ticket",
    kind: "enum",
    values: PRIORITY,
    valueAliases: { urgent: "Urgent", high: "High", normal: "Normal", "khẩn": "Urgent", cao: "High", "bình thường": "Normal" },
    description: "Urgent / High / Normal.",
    example: "Urgent",
  },
  {
    key: "team_owner",
    label: "Team phụ trách",
    group: "ticket",
    kind: "enum",
    values: TEAM_OWNER,
    valueAliases: {
      cs: "CS",
      dev: "Dev",
      refund: "Billing/Refund",
      billing: "Billing/Refund",
      "billing/refund": "Billing/Refund",
      marketing: "Marketing",
      partner: "Partner",
      "free service": "Free service",
    },
    description: "Team chịu trách nhiệm xử lý tiếp.",
    example: "Billing/Refund",
  },

  // ── Thông tin xử lý ───────────────────────────────────────────────
  {
    key: "escalated",
    label: "Chuyển TS",
    group: "handling",
    kind: "bool",
    description: "Có chuyển sang TS không: Yes / No.",
    example: "Yes",
  },
  {
    key: "name_pic",
    label: "PIC",
    group: "handling",
    kind: "multi",
    description: "Tên người handle, nhiều người ngăn bằng dấu phẩy.",
    example: "Eli, Hew",
  },
  {
    key: "role_pic",
    label: "Vai trò PIC",
    group: "handling",
    kind: "multi",
    values: ROLE_PIC,
    valueAliases: { fl: "FL", ts: "TS", dev: "Dev", technical: "TS" },
    description: "Bộ phận người handle (FL, TS, Dev), có thể kết hợp.",
    example: "FL, TS",
  },
  {
    key: "time_cx_contact",
    label: "Khách contact lúc",
    group: "handling",
    kind: "datetime",
    description: "Thời điểm khách gửi tin đầu tiên.",
    example: "12:23 13/04/2026",
  },
  {
    key: "time_pic_reply",
    label: "PIC phản hồi lúc",
    group: "handling",
    kind: "datetime",
    description: "Thời điểm phản hồi khách lần đầu.",
    example: "12:25 13/04/2026",
  },
  {
    key: "time_pic_support_join",
    label: "TS/Dev join lúc",
    group: "handling",
    kind: "datetime",
    description: "Thời điểm TS hoặc Dev join (lấy từ note TS start nếu có).",
    example: "12:40 13/04/2026",
  },
  {
    key: "time_pic_solution",
    label: "Đưa solution lúc",
    group: "handling",
    kind: "datetime",
    description: "Thời điểm FL hoặc TS đưa ra solution.",
    example: "13:05 13/04/2026",
  },
  {
    key: "total_time_handle",
    label: "Thời gian handle",
    group: "handling",
    kind: "duration",
    description: "FL: từ lúc khách hỏi đến khi khách đồng ý solution. TS: từ note TS start đến note TS solution. Định dạng ngày-giờ-phút-giây.",
    example: "0-00-42-10",
  },
  {
    key: "total_time_ticket",
    label: "Tổng thời gian ticket",
    group: "handling",
    kind: "duration",
    description: "Từ tin nhắn đầu của khách đến tin nhắn cuối của FL. Định dạng ngày-giờ-phút-giây.",
    example: "0-01-15-00",
  },
  {
    key: "time_pic_max_reply",
    label: "Lâu nhất để trả lời",
    group: "handling",
    kind: "duration",
    description: "Khoảng chờ dài nhất giữa tin khách và tin trả lời của FL. Định dạng ngày-giờ-phút-giây.",
    example: "0-00-12-30",
  },
  {
    key: "root_cause",
    label: "Nguyên nhân gốc",
    group: "handling",
    kind: "text",
    description: "Nguyên nhân cốt lõi.",
    example: "do theme",
  },
  {
    key: "resolution",
    label: "Kết quả xử lý",
    group: "handling",
    kind: "enum",
    values: RESOLUTION,
    valueAliases: {
      resolved: "Đã resolved",
      answered: "Đã resolved",
      workaround: "Đã resolved",
      unresolved: "Hết ca vẫn chưa giải quyết",
      escalated: "Đợi TS check",
      "handed-over": "Đợi TS check",
      pending: "Cần buy time",
      "waiting-customer": "Đợi khách phản hồi",
    },
    description: "Vấn đề đã được giải quyết hay chưa.",
    example: "Đã resolved",
  },
  {
    key: "feedback_cx_solution",
    label: "Khách phản hồi solution",
    group: "handling",
    kind: "enum",
    values: FEEDBACK_CX_SOLUTION,
    valueAliases: { good: "Good", tốt: "Good", bad: "Tệ", tệ: "Tệ" },
    description: "Khách phản hồi ngay về solution.",
    example: "Good",
  },
  {
    key: "review_verdict",
    label: "Thời điểm mời review",
    group: "handling",
    kind: "enum",
    values: REVIEW_VERDICT,
    valueAliases: { ripe: "RIPE", not_yet: "NOT_YET", "not yet": "NOT_YET", do_not_ask: "DO_NOT_ASK" },
    description: "RIPE = nên mời review ngay · NOT_YET = chưa đến lúc · DO_NOT_ASK = không nên mời. (Chờ Eli xác nhận định nghĩa.)",
    example: "RIPE",
  },
  {
    key: "review_pic",
    label: "Đánh giá PIC",
    group: "handling",
    kind: "longtext",
    sensitive: true,
    description: "Đánh giá thái độ làm việc của PIC: tốt hay cần cải thiện gì, giải thích có rõ không, khách có phải hỏi lại nhiều lần không.",
    example: "Tốt, giải thích rõ ràng",
  },
  {
    key: "csat",
    label: "CSAT",
    group: "handling",
    kind: "enum",
    values: CSAT,
    valueAliases: { good: "Tốt", tốt: "Tốt", khá: "Khá", "trung bình": "Trung bình", bad: "Tệ", tệ: "Tệ" },
    description: "Mức hài lòng của khách với cách xử lý (Haiku tự đo).",
    example: "Tốt",
  },
  {
    key: "mood_label_cx",
    label: "Mood khách",
    group: "handling",
    kind: "enum",
    values: MOODS,
    headerAliases: ["mood_label"],
    valueAliases: MOOD_ALIASES,
    description: "Trạng thái cảm xúc của khách.",
    example: "Happy",
  },
  {
    key: "mood_label_cx_end_to_end",
    label: "Mood đầu → cuối",
    group: "handling",
    kind: "text",
    description: "Mood lúc mới contact -> sau khi xử lý, ngăn bằng \"->\".",
    example: "Neutral->Happy",
  },
  {
    key: "review_ticket",
    label: "Nhận xét ticket",
    group: "handling",
    kind: "longtext",
    headerAliases: ["review_note"],
    description: "Mô tả ngắn gọn trạng thái ticket.",
    example: "Khách cảm ơn, đã mời review",
  },
  {
    key: "upsell_signal",
    label: "Tín hiệu upsell",
    group: "handling",
    kind: "longtext",
    description: "Có upsell được không và nên upsell thế nào. Không có thì ghi \"Không\".",
    example: "Có, khách gói 24$ build nhiều nên lên 69$",
  },
  {
    key: "churn_risk",
    label: "Nguy cơ rời bỏ",
    group: "handling",
    kind: "bool",
    description: "Yes / No.",
    example: "No",
  },
  { key: "next_action", label: "Hành động tiếp theo", group: "handling", kind: "longtext", description: "Việc tiếp theo phía mình cần làm.", example: "Follow up sau 24h" },
  {
    key: "session_id",
    label: "Session ID",
    group: "handling",
    kind: "text",
    required: true,
    hiddenByDefault: true,
    description: "Session ID Crisp. Dùng làm khoá duy nhất của ticket.",
    example: "session_3452f782-…",
  },
  { key: "ticket_url", label: "Link ticket", group: "handling", kind: "url", description: "Link Crisp.", example: "https://app.crisp.chat/…" },
  {
    key: "review_asked",
    label: "Đã hỏi review",
    group: "handling",
    kind: "text",
    description: "\"Đã có review từ trước\" · \"FL đã hỏi\" · \"Khách vui vẻ nhưng FL quên hỏi\" · \"Không phù hợp để hỏi\".",
    example: "FL đã hỏi",
  },
];

export const FIELD_BY_KEY: Record<string, FieldDef> = Object.fromEntries(FIELDS.map((f) => [f.key, f]));
