import { Suspense } from "react";
import { headers } from "next/headers";
import { Bot, Laptop, MessageSquareText, Plug, Terminal, Unplug } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { listGrants } from "@/lib/oauth/server";
import { kvWritable } from "@/lib/store/kv";
import { Badge, buttonClass, Empty, InlineError, InlineNote, PageHeader, PageSkeleton, Panel, PanelTitle } from "@/components/ui";
import { CopyField } from "./copy-field";
import { revokeConnection } from "./actions";

export const metadata = { title: "Kết nối Claude · PageFly Support Insights" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Connect />
    </Suspense>
  );
}

const TOOLS: [string, string][] = [
  ["get_overview", "Tổng quan KPI, tóm tắt ticket / FL / khách hàng"],
  ["compare_periods", "So sánh kỳ, chỉ số tăng/giảm và báo động"],
  ["search_tickets", "Tìm ticket theo từ khoá và bộ lọc"],
  ["get_ticket", "Đủ mọi trường của một ticket"],
  ["list_customers", "Khách hàng, sức khoẻ, nhóm, upsell"],
  ["get_customer", "Hồ sơ và lịch sử liên hệ của một store"],
  ["team_performance", "Xếp hạng Front-line / Technical"],
  ["get_report", "Báo cáo CS / Dev / Marketing theo kỳ"],
  ["data_quality", "Tình trạng dữ liệu sheet"],
  ["get_schema", "Ý nghĩa các trường dữ liệu"],
];

const PROMPTS = [
  "Tuần này support có gì đáng lo so với tuần trước? Liệt kê ticket cụ thể.",
  "Những khách nào đang có nguy cơ rời bỏ và nên làm gì với từng khách?",
  "Xếp hạng Front-line 30 ngày qua, ai cần kèm cặp và vì sao?",
  "Tóm tắt các lỗi Flymate tháng này cho team Dev, nhóm theo nguyên nhân.",
];

const fmt = (t: number | null) => (t ? new Date(t).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" }) : "Chưa dùng");

async function Connect() {
  const me = await requireUser();
  const h = await headers();
  const origin = process.env.PUBLIC_URL?.replace(/\/$/, "") ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const mcpUrl = `${origin}/api/mcp`;
  const isLocal = /localhost|127\.0\.0\.1/.test(origin);
  let grants = await listGrants().catch(() => []);
  if (me.role !== "admin") grants = grants.filter((g) => g.userId === me.id);
  grants.sort((a, b) => (b.lastUsedAt ?? b.createdAt) - (a.lastUsedAt ?? a.createdAt));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <PageHeader
        eyebrow="Tích hợp"
        title="Kết nối Claude"
        subtitle="Kết nối tài khoản Claude qua MCP để hỏi đáp trên toàn bộ dữ liệu của web: thống kê, ticket, khách hàng, đội ngũ, báo cáo."
      />

      {!kvWritable() && <InlineError>Máy chủ chưa cấu hình nơi lưu (Upstash Redis) nên chưa kết nối được. Thêm Upstash Redis trong Vercel → Storage rồi deploy lại.</InlineError>}
      {isLocal && (
        <InlineNote>
          Bạn đang mở web ở máy local ({origin}). Claude trên web / app không truy cập được địa chỉ này. Hãy dùng link production (vd. https://pf-support-insights.vercel.app/connect) để kết nối. Claude Code chạy trên chính máy này thì vẫn dùng được.
        </InlineNote>
      )}

      <Panel className="p-4 sm:p-5">
        <PanelTitle title="Link MCP" icon={Plug} note="Dán link này vào Claude. Claude sẽ mở trang đăng nhập của web để bạn cho phép, không cần copy token hay mật khẩu." />
        <CopyField value={mcpUrl} />
      </Panel>

      <div className="grid gap-3 xl:grid-cols-3">
        <Panel className="p-4 sm:p-5">
          <PanelTitle title="Claude (web / Desktop / mobile)" icon={MessageSquareText} />
          <ol className="grid list-decimal gap-2 pl-5 text-[12.5px] leading-relaxed text-pf-body marker:text-pf-faint">
            <li>
              Vào <b className="text-white">Settings → Connectors</b> trên claude.ai (hoặc app Claude).
            </li>
            <li>
              Bấm <b className="text-white">Add custom connector</b>. Đặt tên <i>PageFly Insights</i>, dán Link MCP ở trên, bấm <b className="text-white">Add</b>.
            </li>
            <li>
              Bấm <b className="text-white">Connect</b>. Trang của web mở ra: đăng nhập (nếu cần) rồi bấm <b className="text-white">Cho phép</b>.
            </li>
            <li>Trong chat, bật connector PageFly Insights ở menu công cụ và đặt câu hỏi.</li>
          </ol>
          <p className="mt-3 text-[11.5px] text-pf-faint">Gói Team / Enterprise: Owner có thể thêm connector cho cả tổ chức ở Admin settings → Connectors; từng người vẫn bấm Connect bằng tài khoản web của mình.</p>
        </Panel>
        <Panel className="p-4 sm:p-5">
          <PanelTitle title="Claude Code" icon={Terminal} />
          <p className="mb-2 text-[12.5px] text-pf-body">Chạy trong terminal:</p>
          <CopyField value={`claude mcp add --transport http pagefly-insights ${mcpUrl}`} />
          <p className="mt-3 text-[12.5px] text-pf-body">
            Sau đó gõ <code className="rounded bg-pf-bg-deep px-1.5 py-0.5 text-pf-violet">/mcp</code> trong Claude Code, chọn pagefly-insights → Authenticate, trình duyệt mở trang cho phép.
          </p>
        </Panel>
        <Panel className="p-4 sm:p-5">
          <PanelTitle title="Ứng dụng khác" icon={Laptop} />
          <p className="text-[12.5px] leading-relaxed text-pf-body">
            Mọi client MCP hỗ trợ <b className="text-white">Streamable HTTP + OAuth</b> đều dùng Link MCP trực tiếp. Client chỉ chạy stdio thì dùng:
          </p>
          <div className="mt-2">
            <CopyField value={`npx -y mcp-remote ${mcpUrl}`} />
          </div>
        </Panel>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.2fr_1fr]">
        <Panel className="p-4 sm:p-5">
          <PanelTitle title="Claude đọc được gì" icon={Bot} note="Chỉ đọc. Số liệu do server tính, khớp với web." />
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {TOOLS.map(([name, desc]) => (
              <li key={name} className="rounded-[10px] border border-pf-border px-3 py-2">
                <div className="font-mono text-[11.5px] text-pf-violet">{name}</div>
                <div className="text-[12px] text-pf-muted">{desc}</div>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel className="p-4 sm:p-5">
          <PanelTitle title="Thử hỏi Claude" icon={MessageSquareText} />
          <ul className="grid gap-2">
            {PROMPTS.map((p) => (
              <li key={p}>
                <CopyField value={p} mono={false} />
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel className="overflow-hidden">
        <div className="px-4 pt-4 sm:px-5">
          <PanelTitle
            title={me.role === "admin" ? `Kết nối đang hoạt động (${grants.length})` : `Kết nối của bạn (${grants.length})`}
            note="Mỗi kết nối gắn với một tài khoản web. Thu hồi thì Claude mất quyền ngay; tài khoản bị xoá thì kết nối cũng mất."
          />
        </div>
        {grants.length ? (
          <div className="pf-scroll overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="border-y border-pf-border text-[11px] uppercase tracking-[0.06em] text-pf-faint">
                  <th className="px-4 py-3 font-semibold">Ứng dụng</th>
                  {me.role === "admin" && <th className="px-3 py-3 font-semibold">Tài khoản</th>}
                  <th className="px-3 py-3 font-semibold">Kết nối lúc</th>
                  <th className="px-3 py-3 font-semibold">Dùng gần nhất</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {grants.map((g) => (
                  <tr key={g.id} className="border-b border-pf-border/60 text-[12.5px] last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-white">{g.clientName}</div>
                      <div className="max-w-[320px] truncate text-[11px] text-pf-faint">{g.clientId}</div>
                    </td>
                    {me.role === "admin" && (
                      <td className="px-3 py-3">
                        {g.username} {g.userId === me.id && <Badge>bạn</Badge>}
                      </td>
                    )}
                    <td className="tabular px-3 py-3 text-pf-muted">{fmt(g.createdAt)}</td>
                    <td className="tabular px-3 py-3 text-pf-muted">{fmt(g.lastUsedAt)}</td>
                    <td className="px-3 py-3 text-right">
                      <form action={revokeConnection}>
                        <input type="hidden" name="id" value={g.id} />
                        <button type="submit" className={buttonClass("danger", "sm")}>
                          <Unplug size={13} strokeWidth={1.75} /> Thu hồi
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon={Plug} text="Chưa có kết nối nào. Làm theo hướng dẫn ở trên để kết nối Claude." />
        )}
      </Panel>
    </div>
  );
}
