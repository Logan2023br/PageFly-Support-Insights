"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { BarChart3, FileSpreadsheet, KeyRound, ListFilter, Plug, ShieldCheck, Store, Users, type LucideIcon } from "lucide-react";
import { Suspense, type ReactNode } from "react";
import { cx } from "@/components/ui";

const NAV: { href: string; label: string; icon: LucideIcon; match: (p: string) => boolean; adminOnly?: boolean }[] = [
  { href: "/", label: "Thống kê", icon: BarChart3, match: (p) => p === "/" },
  { href: "/tickets", label: "Chi tiết", icon: ListFilter, match: (p) => p.startsWith("/tickets") },
  { href: "/customers", label: "Khách hàng", icon: Store, match: (p) => p.startsWith("/customers") },
  { href: "/team", label: "Đội ngũ", icon: Users, match: (p) => p.startsWith("/team") },
  { href: "/reports", label: "Báo cáo", icon: FileSpreadsheet, match: (p) => p.startsWith("/reports") },
  { href: "/data-quality", label: "Chất lượng dữ liệu", icon: ShieldCheck, match: (p) => p.startsWith("/data-quality") },
  { href: "/connect", label: "Kết nối Claude", icon: Plug, match: (p) => p.startsWith("/connect") },
  { href: "/accounts", label: "Tài khoản", icon: KeyRound, match: (p) => p.startsWith("/accounts"), adminOnly: true },
];

export function Sidebar({ footer, isAdmin = false }: { footer?: ReactNode; isAdmin?: boolean }) {
  return (
    <aside className="lg:sticky lg:top-6 lg:flex lg:h-[calc(100vh-48px)] lg:w-[212px] lg:shrink-0 lg:flex-col">
      <Link href="/" className="flex items-center gap-2.5 pb-4">
        <span className="grid size-7 place-items-center rounded-[8px] bg-pf-primary text-[13px] font-bold text-white shadow-pf-button">P</span>
        <span className="font-display text-[15px] font-semibold text-pf-text">
          PageFly <span className="text-pf-muted">Insights</span>
        </span>
      </Link>
      <Suspense fallback={<NavLinks pathname={null} isAdmin={isAdmin} />}>
        <ActiveNav isAdmin={isAdmin} />
      </Suspense>
      <div className="pt-3 lg:mt-auto lg:pt-4">{footer}</div>
    </aside>
  );
}

function ActiveNav({ isAdmin }: { isAdmin: boolean }) {
  return <NavLinks pathname={usePathname()} isAdmin={isAdmin} />;
}

function NavLinks({ pathname, isAdmin }: { pathname: string | null; isAdmin: boolean }) {
  return (
    <nav className="pf-scroll -mx-4 flex gap-1 overflow-x-auto border-b border-pf-border px-4 pb-3 lg:mx-0 lg:flex-col lg:overflow-visible lg:border-0 lg:px-0 lg:pb-0">
      {NAV.filter((item) => !item.adminOnly || isAdmin).map((item) => {
        const active = pathname != null && item.match(pathname);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cx(
              "relative flex shrink-0 items-center gap-2 rounded-[12px] px-3 py-2 text-[13px] font-semibold transition-colors duration-150",
              active ? "text-white" : "text-pf-muted hover:text-white",
            )}
          >
            {active && (
              <motion.span
                layoutId="nav-pill"
                className="absolute inset-0 rounded-[12px] border border-pf-primary-hi/40 bg-pf-primary/14"
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              />
            )}
            <Icon size={15} strokeWidth={1.75} className="relative" />
            <span className="relative">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
