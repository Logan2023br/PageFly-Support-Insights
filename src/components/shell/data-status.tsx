import { Database } from "lucide-react";
import { getDataset } from "@/lib/data";
import { formatVnDateTime } from "@/lib/data/parse";
import { RefreshButton } from "./refresh-button";

export async function DataStatus() {
  const ds = await getDataset();
  return (
    <div className="grid gap-2 rounded-[16px] border border-pf-border bg-pf-card p-3 text-[11.5px]">
      <div className="flex items-center gap-1.5 font-semibold text-pf-body">
        <Database size={13} strokeWidth={1.75} className="text-pf-muted" />
        {ds.source === "mock" ? "Dữ liệu giả lập" : "Google Sheet"}
      </div>
      <div className="text-pf-muted">
        <span className="tabular text-pf-body">{ds.tickets.length.toLocaleString("vi-VN")}</span> ticket · cập nhật {formatVnDateTime(ds.loadedAt).slice(11)}
        <div className="text-pf-faint">Tự cập nhật mỗi {process.env.NEXT_PUBLIC_AUTO_REFRESH_SECONDS ?? 30} giây</div>
      </div>
      {ds.error && <div className="text-pf-danger">Lỗi tải: {ds.error}</div>}
      <RefreshButton />
    </div>
  );
}
