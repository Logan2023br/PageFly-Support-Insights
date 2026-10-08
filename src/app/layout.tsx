import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { Suspense } from "react";
import { Sidebar } from "@/components/shell/sidebar";
import { DataStatus } from "@/components/shell/data-status";
import { AutoRefresh } from "@/components/shell/auto-refresh";
import { Skeleton } from "@/components/ui";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin", "vietnamese"] });
const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin", "vietnamese"], weight: ["500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: "PageFly Support Insights",
  description: "Thống kê, chi tiết và báo cáo ticket support PageFly cho CS, Dev, Marketing, Partner.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className={`${inter.variable} ${jakarta.variable}`}>
      <body className="relative min-h-screen">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[520px]">
          <div className="pfd-glow absolute inset-0" />
          <div className="pfd-grid absolute inset-0" />
        </div>
        <div className="relative mx-auto max-w-[1600px] px-4 pb-10 pt-4 sm:px-6 sm:pt-6 lg:flex lg:gap-6">
          <Sidebar
            footer={
              <Suspense fallback={<Skeleton className="h-[110px] rounded-[16px]" />}>
                <DataStatus />
              </Suspense>
            }
          />
          <main className="min-w-0 flex-1 pt-4 lg:pt-0">{children}</main>
          <AutoRefresh />
        </div>
      </body>
    </html>
  );
}
