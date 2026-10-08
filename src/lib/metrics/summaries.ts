// Bản tóm tắt theo luật: mọi con số do code đếm, câu chữ theo mẫu. AI chỉ viết thêm phần nhận định.
import { formatDuration } from "@/lib/data/parse";
import type { Ticket } from "@/lib/data/types";
import { periodLabel, type Period } from "@/lib/query";
import { countBy } from "./compute";
import { flStats } from "./people";

export type LineTone = "bad" | "warn" | "good" | "neutral";

export interface SummaryLine {
  text: string;
  tone?: LineTone;
  /** Tham số lọc để mở danh sách ticket tương ứng ở trang Chi tiết. */
  filter?: Record<string, string>;
}

export interface SummaryBlock {
  key: "tickets" | "fl" | "customers";
  title: string;
  lines: SummaryLine[];
}

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");
const list = (buckets: { key: string; count: number }[], n: number, unit = "") =>
  buckets
    .slice(0, n)
    .map((b) => `${b.count}${unit} ${b.key}`)
    .join(", ");

export function ticketSummary(ts: Ticket[], p: Period): SummaryBlock {
  const fb = ts.filter((t) => t.category_ticket === "Feedback");
  const is = ts.filter((t) => t.category_ticket === "Issue");
  const im = ts.filter((t) => t.category_ticket === "Improve");
  const lines: SummaryLine[] = [
    { text: `Trong thời gian ${periodLabel(p)}: tổng ${ts.length} ticket, gồm ${fb.length} Feedback · ${is.length} Issue · ${im.length} Improve.` },
  ];

  const fbAttention = fb.filter((t) => t.derived.attention);
  lines.push({
    text: fbAttention.length
      ? `Feedback: có ${fbAttention.length} case cần chú ý (${fbAttention
          .slice(0, 2)
          .map((t) => `"${t.issue_summary}"`)
          .join(", ")}).`
      : `Feedback: ${fb.length} góp ý, không có case cần chú ý.`,
    tone: fbAttention.length ? "warn" : "neutral",
    filter: { cat: "Feedback", f_attention: "Yes" },
  });

  if (is.length) {
    const byArea = countBy(is, (t) => t.category_issue);
    lines.push({ text: `Issue: ${list(byArea, 6, " về")}.`, filter: { cat: "Issue" } });

    const urgent = is.filter((t) => t.priority === "Urgent");
    if (urgent.length) {
      const roots = countBy(urgent, (t) => t.root_cause);
      lines.push({
        text: `Có ${urgent.length} case Urgent, nguyên nhân chính: ${list(roots, 3).replace(/(\d+) /g, "$1 ca ")}.`,
        tone: "bad",
        filter: { cat: "Issue", f_priority: "Urgent" },
      });
    }
    const angry = ts.filter((t) => t.derived.moodEnd === "Angry");
    if (angry.length) {
      const supportCaused = angry.filter((t) => /cần cải thiện/i.test(t.review_pic ?? ""));
      const roots = countBy(angry, (t) => t.root_cause);
      lines.push({
        text:
          `Có ${angry.length} case khách Angry` +
          (supportCaused.length ? `, trong đó ${supportCaused.length} case đánh giá PIC "cần cải thiện" (support chưa chuẩn)` : "") +
          `; nguyên nhân: ${list(roots, 3).replace(/(\d+) /g, "$1 ca ")}.`,
        tone: "bad",
        filter: { f_mood_label_cx: "Angry" },
      });
    }
    const dev = is.filter((t) => t.derived.handler === "Dev");
    if (dev.length) {
      const devNote = dev.filter((t) => t.type_issue === "dev_note").length;
      lines.push({
        text: `${dev.length} issue cần Dev${devNote ? `, trong đó ${devNote} ticket dev_note (lỗi lặp lại đã biết)` : ""}.`,
        tone: "warn",
        filter: { f_handler: "Cần Dev" },
      });
    }
  }

  if (im.length) {
    const top = countBy(im, (t) => t.issue_summary);
    lines.push({ text: `Improve: khách muốn nhiều nhất ${top
      .slice(0, 3)
      .map((b) => `"${b.key}" (${b.count})`)
      .join(", ")}.`, filter: { cat: "Improve" } });
  }
  return { key: "tickets", title: "Tóm tắt ticket", lines };
}

export function flSummary(ts: Ticket[]): SummaryBlock {
  const stats = flStats(ts).filter((s) => s.name !== "(không rõ)");
  const lines: SummaryLine[] = [];
  if (!stats.length) return { key: "fl", title: "Tóm tắt FL", lines: [{ text: "Chưa có dữ liệu FL trong khoảng này." }] };

  const shifts = new Set(ts.map((t) => `${t.derived.dayKey}|${t.shift}`)).size;
  lines.push({ text: `Có ${stats.length} FL handle ${ts.length} ticket trong ${shifts} ca làm việc; trung bình ${(ts.length / stats.length).toFixed(1)} ticket/FL.` });

  const issues = ts.filter((t) => t.category_ticket === "Issue");
  const self = issues.filter((t) => t.derived.handler === "FL").length;
  const toTs = issues.filter((t) => t.derived.handler === "TS").length;
  const toDev = issues.filter((t) => t.derived.handler === "Dev").length;
  lines.push({ text: `FL tự xử lý ${self}/${issues.length} issue (${pct(self, issues.length)}), nhờ TS ${toTs}, cần Dev ${toDev}.` });

  const fr = ts.map((t) => t.derived.firstReplySec).filter((v): v is number => v != null);
  if (fr.length) {
    const slow = fr.filter((v) => v > 600).length;
    lines.push({
      text: `Phản hồi đầu trung bình ${formatDuration(fr.reduce((s, v) => s + v, 0) / fr.length)}; ${slow} ticket phản hồi chậm hơn 10 phút.`,
      tone: slow > fr.length * 0.1 ? "warn" : "neutral",
    });
  }

  const slowest = [...stats].filter((s) => s.tickets >= 5 && s.firstReplyAvg != null).sort((a, b) => (b.firstReplyAvg ?? 0) - (a.firstReplyAvg ?? 0))[0];
  if (slowest && slowest.firstReplyAvg! > 300) {
    lines.push({ text: `Phản hồi chậm nhất: ${slowest.name} (TB ${formatDuration(slowest.firstReplyAvg)}).`, tone: "warn", filter: { f_triggered_by: slowest.name } });
  }
  const needImprove = [...stats].filter((s) => s.needImprove > 0).sort((a, b) => b.needImprove - a.needImprove);
  if (needImprove.length) {
    lines.push({
      text: `Đánh giá "cần cải thiện": ${needImprove
        .slice(0, 3)
        .map((s) => `${s.name} (${s.needImprove})`)
        .join(", ")}.`,
      tone: "warn",
    });
  }

  const asked = stats.reduce((s, x) => s + x.reviewAsked, 0);
  const forgot = stats.reduce((s, x) => s + x.reviewForgot, 0);
  const topForgot = [...stats].sort((a, b) => b.reviewForgot - a.reviewForgot)[0];
  lines.push({
    text: `Hỏi review ${asked}/${asked + forgot} lần khách vui vẻ (${pct(asked, asked + forgot)}); quên hỏi ${forgot} case${topForgot?.reviewForgot ? `, nhiều nhất ${topForgot.name} (${topForgot.reviewForgot})` : ""}.`,
    tone: forgot > asked * 0.3 ? "warn" : "neutral",
    filter: { f_review_asked_status: "FL quên hỏi" },
  });

  const best = [...stats].filter((s) => s.tickets >= 5).sort((a, b) => (b.csatGood ?? 0) - (a.csatGood ?? 0))[0];
  if (best?.csatGood != null) lines.push({ text: `CSAT tốt cao nhất: ${best.name} (${Math.round(best.csatGood * 100)}%).`, tone: "good" });

  return { key: "fl", title: "Tóm tắt FL", lines };
}

export function customerSummary(ts: Ticket[]): SummaryBlock {
  const lines: SummaryLine[] = [];
  const byStore = countBy(ts, (t) => t.store_domain);
  const repeat = byStore.filter((b) => b.count >= 2);
  lines.push({ text: `${byStore.length} store liên hệ, ${repeat.length} store liên hệ từ 2 lần trở lên${repeat[0] ? ` (nhiều nhất ${repeat[0].key}: ${repeat[0].count} lần)` : ""}.` });

  const plans = countBy(ts, (t) => t.pagefly_plan);
  if (plans.length) lines.push({ text: `Theo plan: ${list(plans, 4)}.` });

  const churnStores = new Map<string, number>();
  for (const t of ts) if (t.churn_risk && t.store_domain) churnStores.set(t.store_domain, t.pagefly_price ?? 0);
  const atRisk = [...churnStores.values()].reduce((s, v) => s + v, 0);
  const uninstalled = new Set(ts.filter((t) => t.time_uninstall != null).map((t) => t.store_domain)).size;
  if (churnStores.size) {
    lines.push({
      text: `${churnStores.size} store có nguy cơ rời bỏ, doanh thu rủi ro $${atRisk}/tháng; ${uninstalled} store đã gỡ app.`,
      tone: "bad",
      filter: { f_churn_risk: "Yes" },
    });
  }
  const upsell = ts.filter((t) => t.derived.upsell);
  if (upsell.length) {
    lines.push({ text: `${upsell.length} cơ hội upsell, ví dụ: "${upsell[0].upsell_signal}".`, tone: "good", filter: { f_upsell: "Yes" } });
  }
  const newReviews = ts.filter((t) => t.derived.reviewAfterSupport).length;
  const crisp5 = ts.filter((t) => t.derived.crispStars === 5).length;
  lines.push({ text: `Review mới trên App Store sau support: ${newReviews}; Crisp 5 sao: ${crisp5}.`, tone: newReviews ? "good" : "neutral" });
  return { key: "customers", title: "Tóm tắt khách hàng", lines };
}
