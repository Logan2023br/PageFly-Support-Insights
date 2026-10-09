import type { CategoryTicket, Mood, Role } from "@/lib/schema/fields";

export type Handler = "FL" | "TS" | "Dev";
export type ReviewAskedStatus = "already" | "asked" | "forgot" | "not_suitable" | "unknown";

/** Một ticket đã chuẩn hoá. Khoá trùng tên cột trong hợp đồng; phần `derived` do web tự tính. */
export interface Ticket {
  id: string;
  row: number;

  recap_at_vn: number | null;
  shift: string | null;
  shift_lead: string | null;
  triggered_by: string | null;

  store_domain: string | null;
  store_name: string | null;
  pagefly_plan: string | null;
  pagefly_price: number | null;
  shopify_plan: string | null;
  timezone: string | null;
  country: string | null;
  type_user: string | null;
  tenure: string | null;
  /** Infinity = không giới hạn ("unlimited"). */
  max_slot: number | null;
  total_pages: number | null;
  num_pages_publish: number | null;
  num_section_publish: number | null;
  discount_code: string | null;
  time_install: number | null;
  time_uninstall: number | null;
  app_review: string | null;
  app_review_content: string | null;
  crisp_review: string | null;
  crisp_review_content: string | null;

  category_ticket: CategoryTicket | string | null;
  category_issue: string | null;
  page_issue: string | null;
  issue_summary: string | null;
  type_issue: string | null;
  priority: string | null;
  team_owner: string | null;

  escalated: boolean | null;
  name_pic: string[];
  role_pic: string[];
  time_cx_contact: number | null;
  time_pic_reply: number | null;
  time_pic_support_join: number | null;
  time_pic_solution: number | null;
  total_time_handle_fl: number | null;
  total_time_handle_ts: number | null;
  /** Suy ra: thời gian handle của bậc xử lý cao nhất (TS nếu có, ngược lại FL). */
  total_time_handle: number | null;
  total_time_ticket: number | null;
  time_pic_max_reply: number | null;
  root_cause: string | null;
  resolution: string | null;
  feedback_cx_solution: string | null;
  review_verdict: string | null;
  review_pic: string | null;
  csat: string | null;
  mood_label_cx: Mood | string | null;
  mood_label_cx_end_to_end: string | null;
  review_ticket: string | null;
  upsell_signal: string | null;
  churn_risk: boolean | null;
  next_action: string | null;
  session_id: string | null;
  ticket_url: string | null;
  review_asked: string | null;

  derived: {
    /** Mốc thời gian của ticket: lúc khách contact (time_cx_contact), thiếu thì lấy lúc recap. */
    at: number | null;
    /** Ngày (giờ VN) của `at` — dùng để lọc theo khoảng thời gian. */
    dayKey: string | null;
    /** Bậc xử lý cao nhất: FL tự xử lý / TS / Dev. */
    handler: Handler;
    roles: Role[];
    firstReplySec: number | null;
    supportWaitSec: number | null;
    resolved: boolean;
    moodStart: Mood | null;
    moodEnd: Mood | null;
    moodWorsened: boolean;
    moodImproved: boolean;
    /** Khu vực lớn của category_issue (ISSUE_AREAS). */
    issueArea: string | null;
    /** review_verdict = QUALIFIED nhưng FL chưa hỏi và khách chưa có review. */
    reviewMissed: boolean;
    upsell: boolean;
    reviewAsked: ReviewAskedStatus;
    appReviewStars: number | null;
    reviewAfterSupport: boolean;
    crispStars: number | null;
    attention: boolean;
    /** CSAT thang 1–5: lấy số gốc nếu sheet ghi số, ngược lại quy đổi từ chữ (Tốt 5 · Khá 4 · Trung bình 3 · Tệ 1.5). */
    csatScore: number | null;
    /** Số lần ticket được recap (các dòng trùng session đã gộp). */
    recapCount: number;
  };
}

export type IssueLevel = "error" | "warning";

export interface DataIssue {
  row: number;
  ticketId: string;
  field: string;
  value: string;
  level: IssueLevel;
  message: string;
}

export interface Dataset {
  tickets: Ticket[];
  issues: DataIssue[];
  source: "mock" | "sheet-public" | "sheet-service-account";
  sourceLabel: string;
  /** Link mở sheet nguồn (null khi dùng dữ liệu giả lập). */
  sourceUrl: string | null;
  /** Tên tab đang đọc. */
  sourceTab: string | null;
  /** Số cột có trong hàng tiêu đề của sheet. */
  headerCount: number;
  loadedAt: number;
  /** Cột có trong sheet nhưng không thuộc hợp đồng. */
  unknownHeaders: string[];
  /** Cột trong hợp đồng mà sheet chưa có. */
  missingHeaders: string[];
  rawRowCount: number;
  /** Dòng recap trùng session đã gộp vào ticket mới nhất. */
  duplicates: number;
  /** Các tên nhân sự đã được gộp về một tên hiển thị. */
  nameMerges: import("./names").NameMerge[];
  error?: string;
}
