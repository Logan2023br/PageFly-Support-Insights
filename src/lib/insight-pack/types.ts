// Insight Pack: kiểu dữ liệu dùng chung (server + client). Không import logic nặng ở đây.

export const AREAS = ["bug", "product", "docs", "support", "team", "customer", "revenue", "review", "data"] as const;
export type InsightArea = (typeof AREAS)[number];
export const AREA_LABEL: Record<InsightArea, string> = {
  bug: "Lỗi cần sửa",
  product: "Sản phẩm & tính năng",
  docs: "Tài liệu & tự phục vụ",
  support: "Quy trình support",
  team: "Đội ngũ & đào tạo",
  customer: "Trải nghiệm khách hàng",
  revenue: "Doanh thu · churn · upsell",
  review: "Review & marketing",
  data: "Dữ liệu & ghi recap",
};

export const PRIORITIES = ["critical", "high", "medium", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<Priority, string> = { critical: "Khẩn cấp", high: "Cao", medium: "Trung bình", low: "Thấp" };

export type Confidence = "high" | "medium" | "low";
export const CONFIDENCE_LABEL: Record<Confidence, string> = { high: "Chắc chắn", medium: "Khá chắc", low: "Cần kiểm chứng" };

export type Effort = "S" | "M" | "L";
export const EFFORT_LABEL: Record<Effort, string> = { S: "Nhỏ (≤1 ngày)", M: "Vừa (vài ngày)", L: "Lớn (≥1 tuần)" };

/** Một "bằng chứng" do code tính từ dữ liệu thật — AI chỉ được dẫn chứng qua id của nó. */
export interface PackFact {
  id: string;
  label: string;
  /** Giải thích ngắn số này là gì / tính thế nào. */
  note?: string;
  value?: string;
  prev?: string;
  delta?: string;
  tone?: "good" | "bad" | "neutral";
  /** Chuỗi theo tuần (8 tuần gần nhất, tuần cuối = tuần của pack). */
  series?: { label: string; v: number | null }[];
  seriesFormat?: "count" | "pct" | "duration" | "money" | "score5";
  /** Bảng xếp hạng (vd theo category, theo người). */
  rows?: { key: string; value: number; display?: string; extra?: string }[];
  ticketIds?: string[];
}

export interface PackTicket {
  id: string;
  day: string | null;
  store: string | null;
  domain: string | null;
  plan: string | null;
  category: string | null;
  categoryIssue: string | null;
  summary: string | null;
  resolution: string | null;
  fl: string | null;
  url: string | null;
}

export interface Insight {
  id: string;
  title: string;
  area: InsightArea;
  priority: Priority;
  confidence: Confidence;
  summary: string;
  problem: string;
  rootCause: string;
  evidence: { factId: string; observation: string }[];
  ticketIds: string[];
  solution: { step: string; owner: string; effort: Effort }[];
  impact: { metric: string; estimate: string; basis: string };
  measure: { factId: string | null; target: string };
  charts: string[];
  tags: string[];
}

export type PackFocus = "bug" | "product" | "support" | "revenue" | "overview";
export const FOCUS_LABEL: Record<PackFocus, string> = {
  bug: "Lỗi sản phẩm",
  product: "Sản phẩm & tài liệu",
  support: "Support & đội ngũ",
  revenue: "Khách hàng & doanh thu",
  overview: "Tổng quan",
};

export interface PackPart {
  status: "running" | "done" | "error";
  insights?: Insight[];
  headline?: string;
  summary?: string;
  error?: string;
  finishedAt?: number;
}

export interface InsightPack {
  id: string;
  from: string;
  to: string;
  label: string;
  status: "running" | "done" | "error";
  auto: boolean;
  createdAt: number;
  createdBy: string;
  finishedAt?: number;
  model: string;
  totals: { tickets: number; issues: number; stores: number };
  facts: Record<string, PackFact>;
  tickets: Record<string, PackTicket>;
  headline?: string;
  summary?: string;
  insights: Insight[];
  parts: Partial<Record<PackFocus, { status: PackPart["status"]; error?: string; count?: number }>>;
  /** Message Batch đang chạy 5 mảng phân tích. */
  batchId?: string;
  progress?: { done: number; total: number };
  error?: string;
}

export interface PackIndexEntry {
  id: string;
  from: string;
  to: string;
  label: string;
  status: InsightPack["status"];
  createdAt: number;
  count: number;
  critical: number;
  high: number;
  auto: boolean;
}
