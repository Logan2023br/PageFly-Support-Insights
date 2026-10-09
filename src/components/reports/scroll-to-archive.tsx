"use client";

import { ArrowDown } from "lucide-react";
import { buttonClass } from "@/components/ui";

/** Nút cạnh "Xuất Excel": cuộn mượt xuống Kho báo cáo PDF ở cuối trang. */
export function ScrollToArchive() {
  return (
    <a
      href="#kho-bao-cao"
      onClick={(e) => {
        const el = document.getElementById("kho-bao-cao");
        if (!el) return;
        e.preventDefault();
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
      className={buttonClass("ghost", "sm")}
    >
      <ArrowDown size={14} strokeWidth={1.75} /> Xem báo cáo
    </a>
  );
}
