import Link from "next/link";
import type { Bucket } from "@/lib/metrics/compute";
import { Empty } from "@/components/ui";

/** Danh sách thanh ngang: nhãn · % · số + thanh 3px. Mỗi dòng có thể là link sang trang Chi tiết. */
export function BarList({ items, max = 8, hrefFor, emptyText = "Không có dữ liệu", active }: { items: Bucket[]; max?: number; hrefFor?: (key: string) => string; emptyText?: string; active?: string }) {
  if (!items.length) return <Empty text={emptyText} />;
  // Dòng đang được chọn luôn hiện, kể cả khi nằm ngoài top.
  const top = active && items.findIndex((i) => i.key === active) >= max ? [...items.slice(0, max - 1), items.find((i) => i.key === active)!] : items.slice(0, max);
  const peak = Math.max(...top.map((i) => i.count));
  return (
    <ul className="grid gap-2.5">
      {top.map((item) => {
        const inner = (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className={`truncate text-[12.5px] group-hover:text-white ${item.key === active ? "font-semibold text-white" : "text-pf-body"}`}>{item.key}</span>
              <span className="flex shrink-0 items-baseline gap-2">
                <span className="tabular text-[11px] text-pf-faint">{Math.round(item.share * 100)}%</span>
                <span className="tabular text-[12.5px] font-semibold text-white">{item.count}</span>
              </span>
            </div>
            <div className="mt-1.5 h-[3px] rounded-full bg-pf-bg-deep">
              <div className="h-full rounded-full bg-pf-primary transition-[width] duration-500 group-hover:bg-pf-primary-hi" style={{ width: `${(item.count / peak) * 100}%` }} />
            </div>
          </>
        );
        return (
          <li key={item.key}>
            {hrefFor ? (
              <Link
                href={hrefFor(item.key)}
                aria-current={item.key === active ? "true" : undefined}
                className={`group -mx-2 block rounded-[8px] px-2 py-1 outline-none transition-colors hover:bg-white/[.03] focus-visible:ring-2 focus-visible:ring-pf-primary-hi ${item.key === active ? "bg-pf-primary/[.12] ring-1 ring-pf-primary-hi/50" : ""}`}
              >
                {inner}
              </Link>
            ) : (
              <div className="group">{inner}</div>
            )}
          </li>
        );
      })}
      {items.length > max && <li className="text-[11.5px] text-pf-faint">+ {items.length - max} mục khác</li>}
    </ul>
  );
}
