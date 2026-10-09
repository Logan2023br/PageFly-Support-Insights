// Hằng số dùng được cả ở client (không kéo theo logic báo cáo).
export type ArchiveGrain = "week" | "month" | "quarter" | "year";

export const ARCHIVE_GRAINS: ArchiveGrain[] = ["week", "month", "quarter", "year"];
export const ARCHIVE_GRAIN_LABEL: Record<ArchiveGrain, string> = { week: "Tuần", month: "Tháng", quarter: "Quý", year: "Năm" };
