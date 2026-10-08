"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const SECONDS = Number(process.env.NEXT_PUBLIC_AUTO_REFRESH_SECONDS ?? 30);

/**
 * Làm mới dữ liệu trang mỗi N giây (mặc định 30). Giữ nguyên URL, bộ lọc, modal đang mở;
 * tạm dừng khi tab bị ẩn và làm mới ngay khi người dùng quay lại tab.
 */
export function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    if (!SECONDS || SECONDS < 5) return;
    let last = Date.now();
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      last = Date.now();
      router.refresh();
    };
    const id = setInterval(tick, SECONDS * 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - last >= SECONDS * 1000) tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);
  return null;
}
