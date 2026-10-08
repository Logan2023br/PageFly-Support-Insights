import Link from "next/link";
import type { Bucket } from "@/lib/metrics/compute";
import { Empty } from "@/components/ui";

/** Danh sách thanh ngang: nhãn · % · số + thanh 3px. Mỗi dòng có thể là link sang trang Chi tiết. */
export function BarList({ items, max = 8, hrefFor, emptyText = "Không có dữ liệu" }: { items: Bucket[]; max?: number; hrefFor?: (key: string) => string; emptyText?: string }) {
  if (!items.length) return <Empty text={emptyText} />;
  const top = items.slice(0, max);
  const peak = Math.max(...top.map((i) => i.count));
  return (
    <ul className="grid gap-2.5">
      {top.map((item) => {
        const inner = (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[12.5px] text-pf-body group-hover:text-white">{item.key}</span>
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
              <Link href={hrefFor(item.key)} className="group block rounded-[8px] outline-none focus-visible:ring-2 focus-visible:ring-pf-primary-hi">
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
