"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, CheckCircle2, ExternalLink, FileSearch, Lightbulb, Minus, Search, Target, TrendingUp, Users, Wrench, X } from "lucide-react";
import { AREA_LABEL, AREAS, CONFIDENCE_LABEL, EFFORT_LABEL, PRIORITIES, PRIORITY_LABEL, type Insight, type InsightArea, type InsightPack, type PackFact, type Priority } from "@/lib/insight-pack/types";
import { cx } from "@/components/ui";
import { FactChart } from "./fact-chart";

const PRIORITY_STYLE: Record<Priority, { badge: string; bar: string }> = {
  critical: { badge: "border-pf-danger/40 bg-pf-danger/10 text-pf-danger", bar: "bg-pf-danger" },
  high: { badge: "border-pf-warn/40 bg-pf-warn/10 text-pf-warn", bar: "bg-pf-warn" },
  medium: { badge: "border-pf-primary-hi/40 bg-pf-primary/12 text-pf-violet", bar: "bg-pf-primary" },
  low: { badge: "border-pf-border bg-white/[.03] text-pf-muted", bar: "bg-pf-border-hi" },
};
const CONF_STYLE = { high: "text-pf-success", medium: "text-pf-body", low: "text-pf-warn" } as const;

const dmy = (k: string | null) => (k ? k.split("-").reverse().join("/") : "—");
const chip = "rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition-colors";

function ownersOf(i: Insight): string[] {
  return [...new Set(i.solution.map((s) => s.owner.split(/[(/,]/)[0].trim()).filter(Boolean))];
}

export function PackView({ pack }: { pack: InsightPack }) {
  const [area, setArea] = useState<InsightArea | "all">("all");
  const [prio, setPrio] = useState<Priority | "all">("all");
  const [owner, setOwner] = useState("all");
  const [conf, setConf] = useState<"all" | "high" | "medium" | "low">("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  // Mở sẵn insight theo ?i= (chia sẻ link).
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("i");
    if (id && pack.insights.some((x) => x.id === id)) setOpen(id); // eslint-disable-line react-hooks/set-state-in-effect
  }, [pack.insights]);
  const select = (id: string | null) => {
    setOpen(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("i", id);
    else url.searchParams.delete("i");
    window.history.replaceState(null, "", url);
  };

  const owners = useMemo(() => [...new Set(pack.insights.flatMap(ownersOf))].sort(), [pack.insights]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return pack.insights.filter(
      (i) =>
        (area === "all" || i.area === area) &&
        (prio === "all" || i.priority === prio) &&
        (conf === "all" || i.confidence === conf) &&
        (owner === "all" || ownersOf(i).includes(owner)) &&
        (!needle || `${i.title} ${i.summary} ${i.tags.join(" ")} ${i.problem}`.toLowerCase().includes(needle)),
    );
  }, [pack.insights, area, prio, conf, owner, q]);
  const areaCount = (a: InsightArea) => pack.insights.filter((i) => i.area === a && (prio === "all" || i.priority === prio)).length;
  const prioCount = (p: Priority) => pack.insights.filter((i) => i.priority === p && (area === "all" || i.area === area)).length;
  const current = open ? pack.insights.find((i) => i.id === open) : null;
  const filtered = area !== "all" || prio !== "all" || conf !== "all" || owner !== "all" || q;

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 rounded-[20px] border border-pf-border bg-pf-card p-4 shadow-pf-card sm:p-5">
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setPrio("all")} className={cx(chip, prio === "all" ? "border-pf-primary-hi/60 bg-pf-primary/15 text-white" : "border-pf-border text-pf-muted hover:text-pf-text")}>
            Mọi mức · {pack.insights.length}
          </button>
          {PRIORITIES.map((p) => (
            <button key={p} type="button" onClick={() => setPrio(prio === p ? "all" : p)} className={cx(chip, prio === p ? PRIORITY_STYLE[p].badge : "border-pf-border text-pf-muted hover:text-pf-text")}>
              {PRIORITY_LABEL[p]} · {prioCount(p)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setArea("all")} className={cx(chip, area === "all" ? "border-pf-primary-hi/60 bg-pf-primary/15 text-white" : "border-pf-border text-pf-muted hover:text-pf-text")}>
            Mọi mảng
          </button>
          {AREAS.filter((a) => pack.insights.some((i) => i.area === a)).map((a) => (
            <button key={a} type="button" onClick={() => setArea(area === a ? "all" : a)} className={cx(chip, area === a ? "border-pf-primary-hi/60 bg-pf-primary/15 text-white" : "border-pf-border text-pf-muted hover:text-pf-text")}>
              {AREA_LABEL[a]} · {areaCount(a)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-8 min-w-[220px] flex-1 items-center gap-2 rounded-[10px] border border-pf-border bg-pf-bg-deep px-2.5 sm:max-w-[360px]">
            <Search size={13} strokeWidth={1.75} className="text-pf-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm: 256KB, churn, theme, review…" className="w-full bg-transparent text-[12px] text-pf-text outline-none placeholder:text-pf-faint" />
          </label>
          <select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Người thực hiện" className="h-8 rounded-[10px] border border-pf-border bg-pf-bg-deep px-2 text-[12px] text-pf-body">
            <option value="all">Mọi người thực hiện</option>
            {owners.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <select value={conf} onChange={(e) => setConf(e.target.value as typeof conf)} aria-label="Độ chắc chắn" className="h-8 rounded-[10px] border border-pf-border bg-pf-bg-deep px-2 text-[12px] text-pf-body">
            <option value="all">Mọi độ chắc chắn</option>
            {(["high", "medium", "low"] as const).map((c) => (
              <option key={c} value={c}>
                {CONFIDENCE_LABEL[c]}
              </option>
            ))}
          </select>
          <span className="text-[12px] text-pf-muted">
            {shown.length}/{pack.insights.length} insight
          </span>
          {filtered && (
            <button
              type="button"
              onClick={() => {
                setArea("all");
                setPrio("all");
                setConf("all");
                setOwner("all");
                setQ("");
              }}
              className="text-[12px] font-semibold text-pf-primary-hi hover:underline"
            >
              Xoá lọc
            </button>
          )}
        </div>
      </div>

      {shown.length ? (
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {shown.map((i) => (
            <InsightCard key={i.id} i={i} onOpen={() => select(i.id)} />
          ))}
        </div>
      ) : (
        <p className="rounded-[16px] border border-dashed border-pf-border px-4 py-10 text-center text-[12.5px] text-pf-muted">Không có insight khớp bộ lọc.</p>
      )}

      {current && <InsightDetail i={current} pack={pack} onClose={() => select(null)} />}
    </div>
  );
}

function InsightCard({ i, onOpen }: { i: Insight; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="group relative flex flex-col overflow-hidden rounded-[20px] border border-pf-border bg-pf-card p-4 text-left shadow-pf-card transition-colors hover:border-pf-border-hi sm:p-5">
      <span className={cx("absolute inset-y-0 left-0 w-[3px]", PRIORITY_STYLE[i.priority].bar)} />
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className={cx("rounded-full border px-2 py-0.5 text-[11px] font-semibold", PRIORITY_STYLE[i.priority].badge)}>{PRIORITY_LABEL[i.priority]}</span>
        <span className="rounded-full border border-pf-border bg-white/[.03] px-2 py-0.5 text-[11px] font-semibold text-pf-body">{AREA_LABEL[i.area]}</span>
        <span className={cx("text-[11px] font-semibold", CONF_STYLE[i.confidence])}>{CONFIDENCE_LABEL[i.confidence]}</span>
      </div>
      <h3 className="font-display text-[15px] font-semibold leading-snug text-white group-hover:text-pf-violet">{i.title}</h3>
      <p className="mt-1.5 line-clamp-3 text-[12.5px] leading-relaxed text-pf-muted">{i.summary}</p>
      <div className="mt-3 rounded-[12px] border border-pf-success/25 bg-pf-success/[.06] px-3 py-2">
        <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-pf-success">
          <TrendingUp size={12} strokeWidth={2} /> Kết quả kỳ vọng
        </div>
        <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-pf-body">{i.impact.estimate}</div>
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-[11.5px] text-pf-faint">
        <span className="inline-flex items-center gap-1">
          <FileSearch size={12} strokeWidth={1.75} /> {i.evidence.length} bằng chứng
        </span>
        {i.ticketIds.length > 0 && <span>{i.ticketIds.length} ticket</span>}
        <span className="inline-flex items-center gap-1">
          <Users size={12} strokeWidth={1.75} /> {ownersOf(i).join(", ")}
        </span>
      </div>
    </button>
  );
}

function FactValue({ f }: { f: PackFact }) {
  if (!f.value) return null;
  const Icon = f.tone === "good" ? ArrowDownRight : f.tone === "bad" ? ArrowUpRight : Minus;
  return (
    <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
      <span className="tabular font-display text-[19px] font-semibold text-white">{f.value}</span>
      {f.delta && (
        <span className={cx("inline-flex items-center gap-0.5 text-[11.5px] font-semibold", f.tone === "good" ? "text-pf-success" : f.tone === "bad" ? "text-pf-danger" : "text-pf-muted")}>
          <Icon size={12} strokeWidth={2} />
          {f.delta}
        </span>
      )}
      {f.prev && <span className="text-[11.5px] text-pf-faint">trước: {f.prev}</span>}
    </div>
  );
}

function Section({ icon: Icon, title, children, note }: { icon: typeof Lightbulb; title: string; children: React.ReactNode; note?: string }) {
  return (
    <section className="grid gap-2">
      <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-pf-faint">
        <Icon size={13} strokeWidth={1.75} className="text-pf-primary-hi" /> {title}
        {note && <span className="font-normal normal-case tracking-normal text-pf-faint">· {note}</span>}
      </h4>
      {children}
    </section>
  );
}

function InsightDetail({ i, pack, onClose }: { i: Insight; pack: InsightPack; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);
  const measure = i.measure.factId ? pack.facts[i.measure.factId] : null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-[2px]" onClick={onClose} role="dialog" aria-modal="true" aria-label={i.title}>
      <div className="pf-scroll h-full w-full max-w-[920px] overflow-y-auto border-l border-pf-border bg-pf-bg p-4 shadow-pf-float sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className={cx("rounded-full border px-2 py-0.5 text-[11px] font-semibold", PRIORITY_STYLE[i.priority].badge)}>Ưu tiên: {PRIORITY_LABEL[i.priority]}</span>
              <span className="rounded-full border border-pf-border bg-white/[.03] px-2 py-0.5 text-[11px] font-semibold text-pf-body">{AREA_LABEL[i.area]}</span>
              <span className={cx("rounded-full border border-pf-border px-2 py-0.5 text-[11px] font-semibold", CONF_STYLE[i.confidence])}>Độ chắc chắn: {CONFIDENCE_LABEL[i.confidence]}</span>
              {i.tags.map((t) => (
                <span key={t} className="text-[11px] text-pf-faint">
                  #{t}
                </span>
              ))}
            </div>
            <h2 className="font-display text-[20px] font-semibold leading-snug text-white">{i.title}</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-pf-body">{i.summary}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="grid size-9 shrink-0 place-items-center rounded-[12px] border border-pf-border text-pf-muted hover:text-white">
            <X size={16} />
          </button>
        </div>

        <div className="grid gap-6">
          <Section icon={Lightbulb} title="Vấn đề">
            <p className="text-[13px] leading-relaxed text-pf-body">{i.problem}</p>
          </Section>

          <Section icon={FileSearch} title="Bằng chứng" note="số liệu do hệ thống tính từ dữ liệu thật; dòng nghiêng là nhận xét của AI">
            <div className="grid gap-2 md:grid-cols-2">
              {i.evidence.map((e) => {
                const f = pack.facts[e.factId];
                if (!f) return null;
                return (
                  <div key={e.factId} className="rounded-[14px] border border-pf-border bg-white/[.02] p-3">
                    <div className="text-[12px] font-semibold text-pf-muted">{f.label}</div>
                    <FactValue f={f} />
                    {f.note && <div className="mt-1 text-[11px] leading-snug text-pf-faint">{f.note}</div>}
                    <p className="mt-2 border-t border-pf-border pt-2 text-[12px] italic leading-relaxed text-pf-body">{e.observation}</p>
                  </div>
                );
              })}
            </div>
          </Section>

          {i.charts.length > 0 && (
            <Section icon={TrendingUp} title="Biểu đồ">
              <div className={cx("grid gap-3", i.charts.length > 1 && "md:grid-cols-2")}>
                {i.charts.map((id) => (pack.facts[id] ? <FactChart key={id} fact={pack.facts[id]} /> : null))}
              </div>
            </Section>
          )}

          <Section icon={FileSearch} title="Nguyên nhân gốc">
            <p className="text-[13px] leading-relaxed text-pf-body">{i.rootCause}</p>
          </Section>

          <Section icon={Wrench} title="Giải pháp đề xuất">
            <ol className="grid gap-2">
              {i.solution.map((s, k) => (
                <li key={k} className="flex gap-3 rounded-[14px] border border-pf-border bg-white/[.02] p-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-pf-primary/20 text-[12px] font-bold text-pf-violet">{k + 1}</span>
                  <div className="min-w-0">
                    <p className="text-[13px] leading-relaxed text-pf-body">{s.step}</p>
                    <div className="mt-1 flex flex-wrap gap-2 text-[11.5px]">
                      <span className="font-semibold text-white">{s.owner}</span>
                      <span className="text-pf-faint">· Công sức: {EFFORT_LABEL[s.effort]}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </Section>

          <Section icon={TrendingUp} title="Kết quả nếu làm theo">
            <div className="rounded-[14px] border border-pf-success/25 bg-pf-success/[.06] p-3.5">
              <div className="text-[12px] font-semibold text-pf-success">{i.impact.metric}</div>
              <div className="mt-1 text-[14px] font-semibold leading-snug text-white">{i.impact.estimate}</div>
              <div className="mt-2 text-[12px] leading-relaxed text-pf-muted">
                <b className="text-pf-body">Cách ước tính:</b> {i.impact.basis}
              </div>
              <div className="mt-1.5 text-[11px] text-pf-faint">Đây là ước tính của AI dựa trên số liệu trong phần bằng chứng, không phải cam kết.</div>
            </div>
          </Section>

          <Section icon={Target} title="Đo kết quả thế nào">
            <div className="rounded-[14px] border border-pf-border bg-white/[.02] p-3.5">
              {measure && (
                <>
                  <div className="text-[12px] font-semibold text-pf-muted">Theo dõi: {measure.label}</div>
                  <FactValue f={measure} />
                </>
              )}
              <div className="mt-1.5 flex items-start gap-1.5 text-[13px] leading-relaxed text-pf-body">
                <CheckCircle2 size={15} strokeWidth={1.75} className="mt-0.5 shrink-0 text-pf-primary-hi" /> {i.measure.target}
              </div>
            </div>
          </Section>

          {i.ticketIds.length > 0 && (
            <Section icon={FileSearch} title={`Ticket minh hoạ · ${i.ticketIds.length}`}>
              <div className="pf-scroll overflow-x-auto rounded-[14px] border border-pf-border">
                <table className="w-full min-w-[640px] border-collapse text-left">
                  <thead className="bg-pf-bg-alt">
                    <tr className="text-[10.5px] uppercase tracking-[0.06em] text-pf-faint">
                      {["Ngày", "Store", "Tóm tắt", "Kết quả", ""].map((h, k) => (
                        <th key={k} className="px-3 py-2 font-semibold">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {i.ticketIds.map((id) => {
                      const t = pack.tickets[id];
                      if (!t) return null;
                      return (
                        <tr key={id} className="border-t border-pf-border/60 text-[12px]">
                          <td className="whitespace-nowrap px-3 py-2 text-pf-muted">{dmy(t.day)}</td>
                          <td className="px-3 py-2">
                            {t.domain ? (
                              <Link href={`/customers/${encodeURIComponent(t.domain)}`} className="font-semibold text-white hover:underline">
                                {t.store ?? t.domain}
                              </Link>
                            ) : (
                              <span className="text-pf-faint">—</span>
                            )}
                            {t.plan && <div className="text-[11px] text-pf-faint">{t.plan}</div>}
                          </td>
                          <td className="max-w-[340px] px-3 py-2 text-pf-body">
                            <span className="line-clamp-2">{t.summary}</span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-pf-muted">{t.resolution ?? "—"}</td>
                          <td className="px-3 py-2 text-right">
                            {t.url && (
                              <a href={t.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 whitespace-nowrap text-[11.5px] text-pf-primary-hi hover:underline">
                                Crisp <ExternalLink size={11} strokeWidth={1.75} />
                              </a>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
