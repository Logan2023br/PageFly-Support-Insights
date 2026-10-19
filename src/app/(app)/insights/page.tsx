import { Suspense } from "react";
import { AlertTriangle, Lightbulb, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { aiConfigured } from "@/lib/ai/insights";
import { listPacks, readPack } from "@/lib/insight-pack/generate";
import { PRIORITY_LABEL, PRIORITIES } from "@/lib/insight-pack/types";
import { formatVnDateTime } from "@/lib/data/parse";
import type { SearchParams } from "@/lib/query";
import { PackControls, PackRunning } from "@/components/insight-pack/pack-controls";
import { PackView } from "@/components/insight-pack/pack-view";
import { InlineError, PageHeader, PageSkeleton } from "@/components/ui";

export default function Page(props: PageProps<"/insights">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Insights searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Insights({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const list = await listPacks();
  const wanted = typeof sp.pack === "string" ? sp.pack : null;
  const selected = wanted ?? list.find((e) => e.status === "done")?.id ?? list[0]?.id ?? null;
  const pack = selected ? await readPack(selected, { collect: true }) : null;
  const counts = pack ? PRIORITIES.map((p) => [p, pack.insights.filter((i) => i.priority === p).length] as const) : [];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <PageHeader
        eyebrow="Support Insights"
        title="Insight Pack"
        subtitle="Mỗi tuần AI đọc toàn bộ dữ liệu support và đề xuất việc cần làm: lỗi cần sửa, sản phẩm, quy trình support, khách hàng & doanh thu — kèm bằng chứng và kết quả kỳ vọng."
        actions={<PackControls list={list} selected={pack?.id ?? null} isAdmin={user.role === "admin"} />}
      />

      {!aiConfigured() && <InlineError>Chưa cấu hình ANTHROPIC_API_KEY nên chưa tạo được Insight Pack.</InlineError>}

      {!pack ? (
        <div className="rounded-[20px] border border-dashed border-pf-border px-6 py-14 text-center">
          <Lightbulb size={28} strokeWidth={1.5} className="mx-auto text-pf-primary-hi" />
          <p className="mt-3 text-[14px] font-semibold text-white">Chưa có Insight Pack nào</p>
          <p className="mt-1 text-[12.5px] text-pf-muted">Hệ thống tự tạo pack của tuần trước vào 01:00 sáng thứ 2 hằng tuần.{user.role === "admin" ? " Admin có thể bấm “Tạo pack tuần trước” để tạo ngay." : ""}</p>
        </div>
      ) : pack.status === "running" ? (
        <PackRunning pack={pack} />
      ) : pack.status === "error" ? (
        <InlineError>Không tạo được pack {pack.label}: {pack.error ?? "lỗi không xác định"}.</InlineError>
      ) : (
        <>
          <section className="grid gap-4 rounded-[20px] border border-pf-border bg-pf-card p-4 shadow-pf-card sm:p-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-pf-violet">{pack.label}</div>
              {pack.headline && <h2 className="mt-1 font-display text-[16px] font-semibold leading-snug text-white sm:text-[18px]">{pack.headline}</h2>}
              {pack.summary && <p className="mt-2 text-[13px] leading-relaxed text-pf-body">{pack.summary}</p>}
            </div>
            <div className="grid content-start gap-3">
              <div className="grid grid-cols-4 gap-2">
                {counts.map(([p, n]) => (
                  <div key={p} className="rounded-[14px] border border-pf-border bg-white/[.02] p-2.5 text-center">
                    <div className="tabular font-display text-[22px] font-semibold text-white">{n}</div>
                    <div className="text-[11px] text-pf-muted">{PRIORITY_LABEL[p]}</div>
                  </div>
                ))}
              </div>
              <div className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-pf-faint">
                <ShieldCheck size={13} strokeWidth={1.75} className="mt-0.5 shrink-0 text-pf-success" />
                <span>
                  Phân tích {pack.totals.tickets} ticket · {pack.totals.stores} store. Mọi số liệu, biểu đồ và ticket là dữ liệu thật do hệ thống tính; AI chỉ dẫn chứng từ đó, insight không có bằng chứng hợp lệ đã bị loại. Tạo {pack.auto ? "tự động" : `bởi ${pack.createdBy}`} lúc {formatVnDateTime(pack.finishedAt ?? pack.createdAt)} · {pack.model}.
                </span>
              </div>
              {Object.values(pack.parts).some((x) => x?.status === "error") && (
                <div className="flex items-start gap-1.5 text-[11.5px] text-pf-warn">
                  <AlertTriangle size={13} strokeWidth={1.75} className="mt-0.5 shrink-0" /> Một số mảng phân tích bị lỗi; pack có thể thiếu insight của mảng đó.
                </div>
              )}
            </div>
          </section>
          <PackView pack={pack} />
        </>
      )}
    </div>
  );
}
