import clsx from "clsx";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Minus, Inbox, type LucideIcon } from "lucide-react";

export const cx = clsx;

export function Panel({ className, ...rest }: ComponentProps<"div">) {
  return <div className={cx("rounded-[20px] border border-pf-border bg-pf-card shadow-pf-card", className)} {...rest} />;
}

export function PanelTitle({ title, note, right, icon: Icon }: { title: ReactNode; note?: ReactNode; right?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="flex items-center gap-2 text-[13.5px] font-semibold text-pf-text">
          {Icon && <Icon size={15} strokeWidth={1.75} className="text-pf-muted" />}
          {title}
        </h2>
        {note && <p className="mt-0.5 text-[11.5px] text-pf-muted">{note}</p>}
      </div>
      {right}
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-pf-primary-hi">{children}</div>;
}

export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: ReactNode; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 border-b border-pf-border pb-3.5">
      <div className="min-w-0">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 className="mt-1 font-display text-[22px] font-bold tracking-[-0.025em] text-pf-text sm:text-[26px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[12.5px] text-pf-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

type Variant = "primary" | "ghost" | "quiet" | "danger";
type Size = "sm" | "md";
const BTN_BASE = "inline-flex items-center justify-center gap-1.5 rounded-[12px] font-semibold transition-colors duration-150 whitespace-nowrap";
const BTN_VARIANT: Record<Variant, string> = {
  primary: "bg-pf-primary text-white shadow-pf-button hover:bg-pf-primary-hi disabled:bg-pf-card disabled:text-pf-faint disabled:shadow-none",
  ghost: "border border-pf-border text-pf-body hover:border-pf-border-hi hover:bg-pf-card",
  quiet: "text-pf-muted hover:text-pf-text hover:bg-pf-card",
  danger: "border border-pf-danger/40 text-pf-danger hover:bg-pf-danger/10",
};
const BTN_SIZE: Record<Size, string> = { sm: "h-8 px-3 text-[12.5px]", md: "h-10 px-4 text-[13.5px]" };

export function buttonClass(variant: Variant = "ghost", size: Size = "sm", className?: string | false | null) {
  return cx(BTN_BASE, BTN_VARIANT[variant], BTN_SIZE[size], className);
}

export function ButtonLink({ variant, size, className, ...rest }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />;
}

export type BadgeTone = "success" | "danger" | "warn" | "neutral" | "violet";
const BADGE: Record<BadgeTone, string> = {
  success: "border-pf-success/40 bg-pf-success/10 text-pf-success",
  danger: "border-pf-danger/35 bg-pf-danger/10 text-pf-danger",
  warn: "border-pf-warn/40 bg-pf-warn/10 text-pf-warn",
  neutral: "border-pf-border text-pf-muted",
  violet: "border-pf-primary-hi/40 bg-pf-primary/14 text-pf-violet",
};

export function Badge({ tone = "neutral", children, className, title }: { tone?: BadgeTone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold", BADGE[tone], className)}>
      {children}
    </span>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return <span className="rounded-[8px] border border-pf-border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-pf-muted">{children}</span>;
}

export function Empty({ text, icon: Icon = Inbox }: { text: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
      <span className="grid size-10 place-items-center rounded-[12px] border border-pf-border text-pf-faint">
        <Icon size={18} strokeWidth={1.75} />
      </span>
      <p className="max-w-sm text-[13.5px] text-pf-muted">{text}</p>
    </div>
  );
}

export function InlineError({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-[12px] border border-pf-danger/35 bg-pf-danger/10 px-3.5 py-2.5 text-[13px] text-pf-danger">
      <AlertTriangle size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export function InlineNote({ children, tone = "warn" }: { children: ReactNode; tone?: "warn" | "violet" }) {
  return (
    <div
      className={cx(
        "flex gap-2.5 rounded-[12px] border px-3.5 py-2.5 text-[12.5px]",
        tone === "warn" ? "border-pf-warn/35 bg-pf-warn/[.07] text-pf-warn" : "border-pf-primary-hi/35 bg-pf-primary/10 text-pf-violet",
      )}
    >
      <AlertTriangle size={15} strokeWidth={1.75} className="mt-0.5 shrink-0" />
      <div className="text-pf-body">{children}</div>
    </div>
  );
}

/** Mũi tên + chênh lệch, tô màu theo tốt/xấu chứ không theo tăng/giảm. */
export function Delta({ delta, text, tone, size = "sm" }: { delta: number | null; text: string; tone: "good" | "bad" | "neutral"; size?: "sm" | "xs" }) {
  if (delta == null) return null;
  const Icon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
  const color = tone === "good" ? "text-pf-success" : tone === "bad" ? "text-pf-danger" : "text-pf-muted";
  return (
    <span className={cx("tabular inline-flex items-center gap-0.5 font-semibold", color, size === "sm" ? "text-[11.5px]" : "text-[11px]")}>
      <Icon size={size === "sm" ? 13 : 12} strokeWidth={2} />
      {text}
    </span>
  );
}

export function AlertBadge({ level }: { level: "critical" | "warning" | null }) {
  if (!level) return null;
  return level === "critical" ? (
    <Badge tone="danger">
      <AlertTriangle size={11} strokeWidth={2} /> Báo động
    </Badge>
  ) : (
    <Badge tone="warn">
      <AlertTriangle size={11} strokeWidth={2} /> Theo dõi
    </Badge>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("pf-skeleton rounded-[12px]", className)} />;
}

export function PageSkeleton() {
  return (
    <div className="grid gap-3 pt-5">
      <Skeleton className="h-9 w-full max-w-xl" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-[108px] rounded-[20px]" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-[20px]" />
    </div>
  );
}
