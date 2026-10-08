import { Suspense } from "react";
import Link from "next/link";
import { getDataset } from "@/lib/data";
import { formatVnDateTime } from "@/lib/data/parse";
import { FIELDS, FIELD_BY_KEY, GROUP_LABELS } from "@/lib/schema/fields";
import { cellText } from "@/lib/ticket-format";
import { Badge, cx, Empty, InlineError, PageHeader, PageSkeleton, Panel, PanelTitle } from "@/components/ui";

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DataQuality />
    </Suspense>
  );
}

const KIND_LABEL: Record<string, string> = {
  text: "Chữ",
  longtext: "Chữ dài",
  datetime: "Ngày giờ",
  date: "Ngày",
  duration: "Khoảng TG (d-h-m-s)",
  number: "Số",
  enum: "Danh sách",
  multi: "Nhiều giá trị",
  bool: "Yes / No",
  url: "Link",
};

async function DataQuality() {
  const ds = await getDataset();
  const total = ds.tickets.length;
  const errors = ds.issues.filter((i) => i.level === "error");
  const warnings = ds.issues.filter((i) => i.level === "warning");
  const coverage = FIELDS.map((f) => {
    const filled = ds.tickets.filter((t) => cellText(t, f.key) !== "").length;
    return { f, filled, rate: total ? filled / total : 0, missingColumn: ds.missingHeaders.includes(f.key) };
  });
  const byField = new Map<string, number>();
  for (const i of ds.issues) byField.set(i.field, (byField.get(i.field) ?? 0) + 1);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <PageHeader eyebrow="Support Insights" title="Chất lượng dữ liệu" subtitle="Kiểm tra sheet có đúng hợp đồng cột hay không. Số liệu trên web chỉ đúng khi dữ liệu nhập đúng." />
      {ds.error && <InlineError>Lỗi tải sheet: {ds.error}</InlineError>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Nguồn", ds.source === "mock" ? "Giả lập" : "Google Sheet", null],
          ["Hàng trong sheet", ds.rawRowCount.toLocaleString("vi-VN"), null],
          ["Ticket (đã gộp session)", `${total.toLocaleString("vi-VN")}${ds.duplicates ? ` · gộp ${ds.duplicates}` : ""}`, null],
          ["Lỗi bắt buộc", errors.length.toLocaleString("vi-VN"), errors.length ? "danger" : "success"],
          ["Cảnh báo định dạng", warnings.length.toLocaleString("vi-VN"), warnings.length ? "warn" : "success"],
        ].map(([label, value, tone]) => (
          <Panel key={label} className="p-4">
            <div className="text-[12px] font-semibold text-pf-muted">{label}</div>
            <div className={cx("tabular mt-2 font-display text-[22px] font-bold leading-tight tracking-[-0.02em]", tone === "danger" ? "text-pf-danger" : tone === "warn" ? "text-pf-warn" : "text-white")}>{value}</div>
          </Panel>
        ))}
      </div>
      <p className="-mt-2 text-[11.5px] text-pf-faint">{ds.sourceLabel} · cập nhật lúc {formatVnDateTime(ds.loadedAt)}. Dữ liệu tự làm mới mỗi 30 giây.</p>

      {(ds.missingHeaders.length > 0 || ds.unknownHeaders.length > 0) && (
        <Panel className="p-4 sm:p-5">
          <PanelTitle title="Cột chưa khớp hợp đồng" note="Cột thiếu sẽ hiển thị “—” trên web; cột lạ bị bỏ qua." />
          {ds.missingHeaders.length > 0 && (
            <div className="mb-3">
              <div className="mb-1.5 text-[12px] font-semibold text-pf-body">Sheet chưa có {ds.missingHeaders.length} cột:</div>
              <div className="flex flex-wrap gap-1.5">
                {ds.missingHeaders.map((k) => (
                  <Badge key={k} tone="warn">
                    {k}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {ds.unknownHeaders.length > 0 && (
            <div>
              <div className="mb-1.5 text-[12px] font-semibold text-pf-body">Cột không thuộc hợp đồng:</div>
              <div className="flex flex-wrap gap-1.5">
                {ds.unknownHeaders.map((k) => (
                  <Badge key={k}>{k}</Badge>
                ))}
              </div>
            </div>
          )}
        </Panel>
      )}

      {ds.nameMerges.length > 0 && (
        <Panel className="p-4 sm:p-5">
          <PanelTitle
            title={`Tên nhân sự đã gộp (${ds.nameMerges.length})`}
            note="Mỗi người chỉ hiển thị một tên. Gộp sai thì khai báo lại trong src/config/name-aliases.ts."
          />
          <div className="flex flex-wrap gap-2">
            {ds.nameMerges.map((m) => (
              <span key={m.from + m.to} className="inline-flex items-center gap-1.5 rounded-[10px] border border-pf-border px-2.5 py-1.5 text-[12px]">
                <span className="text-pf-muted line-through decoration-pf-faint">{m.from}</span>
                <span className="text-pf-faint">→</span>
                <span className="font-semibold text-white">{m.to}</span>
                <span className="tabular text-[11px] text-pf-faint">
                  {m.count} lần · {m.reason === "auto" ? "tự động" : m.reason === "manual" ? "thủ công" : "khác hoa/thường"}
                </span>
              </span>
            ))}
          </div>
        </Panel>
      )}

      <Panel className="overflow-hidden">
        <div className="px-4 pt-4 sm:px-5">
          <PanelTitle title={`Dòng lỗi (${ds.issues.length})`} note="Hiển thị tối đa 300 dòng đầu. Sửa trực tiếp trên sheet, web tự cập nhật sau lần đồng bộ tiếp theo." />
        </div>
        {ds.issues.length ? (
          <div className="pf-scroll max-h-[480px] overflow-auto">
            <table className="w-full min-w-[820px] border-collapse text-left">
              <thead className="sticky top-0 bg-pf-bg-alt">
                <tr className="border-y border-pf-border text-[11px] uppercase tracking-[0.06em] text-pf-faint">
                  {["Hàng", "Trường", "Giá trị", "Vấn đề", "Mức"].map((h) => (
                    <th key={h} className="px-4 py-2.5 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ds.issues.slice(0, 300).map((i, idx) => (
                  <tr key={idx} className="border-b border-pf-border/60 text-[12.5px] last:border-0">
                    <td className="tabular px-4 py-2 text-pf-muted">
                      <Link href={`/tickets?range=all&ticket=${encodeURIComponent(i.ticketId)}`} className="hover:text-white hover:underline">
                        {i.row}
                      </Link>
                    </td>
                    <td className="px-4 py-2 font-semibold text-white">{FIELD_BY_KEY[i.field]?.label ?? i.field}</td>
                    <td className="max-w-[260px] truncate px-4 py-2 text-pf-body">{i.value || <span className="text-pf-faint">(trống)</span>}</td>
                    <td className="px-4 py-2 text-pf-muted">{i.message}</td>
                    <td className="px-4 py-2">
                      <Badge tone={i.level === "error" ? "danger" : "warn"}>{i.level === "error" ? "Lỗi" : "Cảnh báo"}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text="Không có lỗi dữ liệu." />
        )}
      </Panel>

      <Panel className="overflow-hidden">
        <div className="px-4 pt-4 sm:px-5">
          <PanelTitle title="Hợp đồng cột (49 trường)" note="Bên ghi sheet cần giữ đúng tên cột, định dạng và giá trị cho phép bên dưới. Tỷ lệ điền = % ticket có giá trị." />
        </div>
        <div className="pf-scroll overflow-x-auto">
          <table className="w-full min-w-[1100px] border-collapse text-left">
            <thead>
              <tr className="border-y border-pf-border text-[11px] uppercase tracking-[0.06em] text-pf-faint">
                {["Nhóm", "Cột", "Tên", "Kiểu", "Giá trị cho phép / ví dụ", "Mô tả", "Tỷ lệ điền", "Lỗi"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2.5 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {coverage.map(({ f, rate, missingColumn }) => (
                <tr key={f.key} className="border-b border-pf-border/60 text-[12px] last:border-0 hover:bg-pf-card/60">
                  <td className="whitespace-nowrap px-3 py-2 align-top text-pf-faint">{GROUP_LABELS[f.group]}</td>
                  <td className="whitespace-nowrap px-3 py-2 align-top font-mono text-[11.5px] text-pf-violet">
                    {f.key}
                    {f.required && <span className="ml-1 text-pf-danger">*</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 align-top font-semibold text-white">{f.label}</td>
                  <td className="whitespace-nowrap px-3 py-2 align-top text-pf-muted">{KIND_LABEL[f.kind]}</td>
                  <td className="max-w-[320px] px-3 py-2 align-top text-pf-body">{f.values ? f.values.join(" · ") : <span className="text-pf-muted">vd. {f.example}</span>}</td>
                  <td className="max-w-[340px] px-3 py-2 align-top text-pf-muted">{f.description}</td>
                  <td className="tabular whitespace-nowrap px-3 py-2 align-top">
                    {missingColumn ? (
                      <Badge tone="warn">Chưa có cột</Badge>
                    ) : (
                      <span className="flex items-center gap-2">
                        <span className="h-[3px] w-16 rounded-full bg-pf-bg-deep">
                          <span className={cx("block h-full rounded-full", rate < 0.5 ? "bg-pf-warn" : "bg-pf-primary")} style={{ width: `${rate * 100}%` }} />
                        </span>
                        <span className="text-pf-body">{Math.round(rate * 100)}%</span>
                      </span>
                    )}
                  </td>
                  <td className="tabular px-3 py-2 align-top">{byField.get(f.key) ? <span className="font-semibold text-pf-warn">{byField.get(f.key)}</span> : <span className="text-pf-faint">0</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
