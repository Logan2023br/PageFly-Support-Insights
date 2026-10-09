import { Suspense } from "react";
import { ShieldCheck } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import { envAdmin, listUsers, storeKind, storeWritable, toPublic } from "@/lib/auth/users";
import { Empty, InlineError, InlineNote, PageHeader, PageSkeleton, Panel, PanelTitle } from "@/components/ui";
import { AccountRow, CreateAccountForm } from "./accounts-client";

export const metadata = { title: "Tài khoản · PageFly Support Insights" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Accounts />
    </Suspense>
  );
}

async function Accounts() {
  const me = await requireAdmin();
  let users: Awaited<ReturnType<typeof listUsers>> = [];
  let loadError: string | null = null;
  try {
    users = await listUsers();
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Không đọc được danh sách tài khoản.";
  }
  const sorted = [...users].sort((a, b) => (a.role === b.role ? a.username.localeCompare(b.username) : a.role === "admin" ? -1 : 1));
  const root = envAdmin();

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <PageHeader eyebrow="Quản trị" title="Tài khoản" subtitle="Thêm, đổi mật khẩu, đổi quyền và xoá tài khoản đăng nhập. Chỉ admin thấy trang này." />

      {!storeWritable() && (
        <InlineError>
          Đang chạy trên Vercel nhưng chưa cấu hình nơi lưu tài khoản. Hãy thêm Redis trong Vercel → Storage (Upstash hoặc Redis Cloud, gói Free) và gắn vào project, rồi deploy lại. Trong lúc đó chỉ tài khoản admin gốc đăng nhập được.
        </InlineError>
      )}
      {loadError && <InlineError>{loadError}</InlineError>}

      <Panel className="p-4 sm:p-5">
        <PanelTitle title="Thêm tài khoản" note="Chỉ cần username và mật khẩu. Người dùng đăng nhập bằng đúng 2 thông tin này." />
        <CreateAccountForm />
      </Panel>

      <Panel className="overflow-hidden">
        <div className="px-4 pt-4 sm:px-5">
          <PanelTitle title={`Danh sách tài khoản (${users.length})`} note="Admin: quản lý tài khoản + xem mọi trang. Thành viên: chỉ xem. Tài khoản bị xoá sẽ bị đăng xuất ở lần tải trang tiếp theo." />
        </div>
        {sorted.length ? (
          <div className="pf-scroll overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead>
                <tr className="border-y border-pf-border text-[11px] uppercase tracking-[0.06em] text-pf-faint">
                  <th className="px-4 py-3 font-semibold">Username</th>
                  <th className="px-3 py-3 font-semibold">Quyền</th>
                  <th className="px-3 py-3 font-semibold">Đăng nhập gần nhất</th>
                  <th className="px-3 py-3 font-semibold">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((u) => (
                  <AccountRow key={u.id} user={toPublic(u)} isMe={u.id === me.id} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text="Chưa có tài khoản nào. Thêm tài khoản đầu tiên ở khung phía trên." />
        )}
      </Panel>

      <InlineNote tone="violet">
        <span className="inline-flex items-center gap-1.5 font-semibold text-white">
          <ShieldCheck size={14} strokeWidth={1.75} /> Admin gốc{root ? `: ${root.username}` : ""}
        </span>
        <br />
        Tài khoản này khai báo trong biến môi trường (ADMIN_USERNAME / ADMIN_PASSWORD), không xoá được từ đây và luôn đăng nhập được để phòng trường hợp mất hết tài khoản. Nơi lưu tài khoản hiện tại: {storeKind() === "redis" ? "Redis" : "file data/users.json (máy chủ local)"}.
        {me.isEnvAdmin && " Bạn đang đăng nhập bằng admin gốc."}
      </InlineNote>
    </div>
  );
}
