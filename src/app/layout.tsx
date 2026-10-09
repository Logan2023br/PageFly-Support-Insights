import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
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
        {children}
      </body>
    </html>
  );
}
