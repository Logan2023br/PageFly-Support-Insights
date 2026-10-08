import Link from "next/link";
import { ArrowUpRight, FileText, UserRound, Users } from "lucide-react";
import type { SummaryBlock, SummaryLine } from "@/lib/metrics/summaries";
import { cx, Panel, PanelTitle } from "@/components/ui";

const ICONS = { tickets: FileText, fl: Users, customers: UserRound };
const DOT: Record<string, string> = { bad: "bg-pf-danger", warn: "bg-pf-warn", good: "bg-pf-success", neutral: "bg-pf-border-hi" };

export function SummaryBlocks({ blocks, hrefFor }: { blocks: SummaryBlock[]; hrefFor: (filter: Record<string, string>) => string }) {
  return (
    <div className="grid gap-3 xl:grid-cols-3">
      {blocks.map((b) => (
        <Panel key={b.key} className="p-4 sm:p-5">
          <PanelTitle title={b.title} icon={ICONS[b.key]} />
          <ul className="grid gap-2">
            {b.lines.map((l, i) => (
              <Line key={i} line={l} href={l.filter ? hrefFor(l.filter) : undefined} />
            ))}
          </ul>
        </Panel>
      ))}
    </div>
  );
}

function Line({ line, href }: { line: SummaryLine; href?: string }) {
  const content = (
    <>
      <span className={cx("mt-[7px] size-1.5 shrink-0 rounded-full", DOT[line.tone ?? "neutral"])} />
      <span className="text-[12.5px] leading-relaxed text-pf-body">{line.text}</span>
      {href && <ArrowUpRight size={13} strokeWidth={1.75} className="mt-1 shrink-0 text-pf-faint group-hover:text-pf-primary-hi" />}
    </>
  );
  return (
    <li>
      {href ? (
        <Link href={href} className="group flex gap-2 rounded-[8px] hover:bg-white/[.02]">
          {content}
        </Link>
      ) : (
        <div className="flex gap-2">{content}</div>
      )}
    </li>
  );
}
