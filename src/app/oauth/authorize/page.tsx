import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Check, Eye, Plug, ShieldCheck } from "lucide-react";
import { readCurrentUser } from "@/lib/auth/current";
import { InlineError, Panel, Skeleton, buttonClass } from "@/components/ui";
import { parseAuthRequest } from "./request";
import { decide } from "./actions";

export const metadata = { title: "Cho phép kết nối · PageFly Insights" };

export default function AuthorizePage(props: PageProps<"/oauth/authorize">) {
  return (
    <div className="relative mx-auto flex min-h-screen max-w-[460px] flex-col justify-center px-4 py-10">
      <Suspense fallback={<Skeleton className="h-[360px] rounded-[20px]" />}>
        <Consent searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

const CAN = [
  "Đọc thống kê, so sánh kỳ và báo cáo CS / Dev / Marketing",
  "Tìm và xem chi tiết ticket (mọi trường)",
  "Xem khách hàng, lịch sử liên hệ, hiệu suất Front-line / Technical",
];

async function Consent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const query = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : []))).toString();
  const user = await readCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${query}`)}`);

  const parsed = await parseAuthRequest(sp);
  if ("redirectError" in parsed) redirect(parsed.redirectError);
  if ("pageError" in parsed) {
    return (
      <Panel className="p-5">
        <h1 className="mb-3 font-display text-[20px] font-bold text-white">Không thể kết nối</h1>
        <InlineError>{parsed.pageError}</InlineError>
      </Panel>
    );
  }
  const { client, redirectUri } = parsed.ok;
  const host = (() => {
    try {
      return new URL(client.client_uri ?? (client.client_id.startsWith("https://") ? client.client_id : redirectUri)).host;
    } catch {
      return redirectUri;
    }
  })();

  return (
    <Panel className="p-5 sm:p-6">
      <div className="flex items-center justify-center gap-3">
        <span className="grid size-11 place-items-center rounded-[14px] border border-pf-border bg-pf-card text-pf-violet">
          <Plug size={20} strokeWidth={1.75} />
        </span>
        <span className="h-px w-8 bg-pf-border-hi" />
        <span className="grid size-11 place-items-center rounded-[14px] bg-pf-primary text-[17px] font-bold text-white shadow-pf-button">P</span>
      </div>
      <h1 className="mt-5 text-center font-display text-[20px] font-bold tracking-[-0.02em] text-white">
        {client.client_name} muốn truy cập PageFly Insights
      </h1>
      <p className="mt-1.5 text-center text-[12.5px] text-pf-muted">
        Từ <span className="text-pf-body">{host}</span> · bằng tài khoản <span className="font-semibold text-white">{user.username}</span>
      </p>

      <div className="mt-5 rounded-[14px] border border-pf-border bg-white/[.02] p-3.5">
        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-pf-faint">
          <Eye size={12} /> Quyền chỉ đọc
        </div>
        <ul className="grid gap-1.5">
          {CAN.map((c) => (
            <li key={c} className="flex gap-2 text-[12.5px] text-pf-body">
              <Check size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-pf-success" /> {c}
            </li>
          ))}
        </ul>
        <p className="mt-2.5 text-[11.5px] leading-relaxed text-pf-faint">
          Không sửa hoặc xoá được dữ liệu. Dữ liệu được gửi tới {client.client_name} khi bạn hỏi. Thu hồi bất cứ lúc nào ở menu Kết nối.
        </p>
      </div>

      <form action={decide} className="mt-5 grid grid-cols-2 gap-2">
        <input type="hidden" name="query" value={query} />
        <button type="submit" name="decision" value="deny" className={buttonClass("ghost", "md")}>
          Từ chối
        </button>
        <button type="submit" name="decision" value="allow" className={buttonClass("primary", "md")}>
          <ShieldCheck size={16} strokeWidth={1.75} /> Cho phép
        </button>
      </form>
      <p className="mt-3 break-all text-center text-[11px] text-pf-faint">Sẽ quay về: {redirectUri}</p>
    </Panel>
  );
}
