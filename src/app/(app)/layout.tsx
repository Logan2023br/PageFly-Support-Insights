import { Suspense, type ReactNode } from "react";
import { LogOut, ShieldCheck, UserRound } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { logoutAction } from "@/app/login/actions";
import { Sidebar } from "@/components/shell/sidebar";
import { DataStatus } from "@/components/shell/data-status";
import { AutoRefresh } from "@/components/shell/auto-refresh";
import { NotificationBell } from "@/components/shell/notification-bell";
import { Skeleton } from "@/components/ui";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto max-w-[1600px] px-4 pb-10 pt-4 sm:px-6 sm:pt-6 lg:flex lg:gap-6">
      <Suspense fallback={<Sidebar footer={<Skeleton className="hidden h-[150px] rounded-[16px] lg:block" />} />}>
        <SidebarWithUser />
      </Suspense>
      <main className="min-w-0 flex-1 pt-4 lg:pt-0">
        <div className="relative z-40 mb-3 flex justify-end">
          <NotificationBell />
        </div>
        {children}
      </main>
      <AutoRefresh />
    </div>
  );
}

async function SidebarWithUser() {
  // Kiểm tra lại ở server: tài khoản bị xoá sau khi đăng nhập sẽ bị đưa về trang login.
  const user = await requireUser();
  return (
    <Sidebar
      isAdmin={user.role === "admin"}
      footer={
        <div className="grid gap-2">
          <div className="hidden lg:block">
            <Suspense fallback={<Skeleton className="h-[110px] rounded-[16px]" />}>
              <DataStatus />
            </Suspense>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-[14px] border border-pf-border bg-pf-card px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-pf-primary/20 text-pf-violet">
                {user.role === "admin" ? <ShieldCheck size={14} strokeWidth={1.75} /> : <UserRound size={14} strokeWidth={1.75} />}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[12.5px] font-semibold text-white">{user.username}</span>
                <span className="block text-[11px] text-pf-faint">{user.role === "admin" ? "Admin" : "Thành viên"}</span>
              </span>
            </div>
            <form action={logoutAction}>
              <button type="submit" title="Đăng xuất" className="grid size-8 place-items-center rounded-[10px] text-pf-faint transition-colors hover:bg-pf-bg-deep hover:text-white">
                <LogOut size={15} strokeWidth={1.75} />
              </button>
            </form>
          </div>
        </div>
      }
    />
  );
}
