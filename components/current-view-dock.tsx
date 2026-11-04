"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { LogoMark } from "@/components/sample-instrument";

type DockItem = {
  id: string;
  name: string;
  logoUrl?: string | null;
  href: string;
};

/** Horizontal logo/name dock for the current filtered view (Companies | Founders). */
export function CurrentViewDock({
  companies,
  founders = [],
  max = 24,
}: {
  companies: DockItem[];
  founders?: DockItem[];
  max?: number;
}) {
  const [tab, setTab] = useState<"companies" | "founders">(
    companies.length > 0 || founders.length === 0 ? "companies" : "founders",
  );
  const items = useMemo(() => {
    const src = tab === "companies" ? companies : founders;
    return src.slice(0, max);
  }, [tab, companies, founders, max]);
  const total = tab === "companies" ? companies.length : founders.length;

  if (companies.length === 0 && founders.length === 0) return null;

  return (
    <aside
      className="mt-1.5 rounded-sm border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-1.5 py-1"
      data-current-view-dock=""
      aria-label="Current view dock"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1" role="tablist" aria-label="Dock mode">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "companies"}
            className={`h-7 rounded-full px-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] ${
              tab === "companies"
                ? "bg-[color:var(--cobalt,#2F4FD8)] text-white"
                : "text-[color:var(--fg-3,#5C647A)] hover:text-[color:var(--fg,#0B0E17)]"
            }`}
            onClick={() => setTab("companies")}
          >
            Companies
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "founders"}
            className={`h-7 rounded-full px-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] ${
              tab === "founders"
                ? "bg-[color:var(--cobalt,#2F4FD8)] text-white"
                : "text-[color:var(--fg-3,#5C647A)] hover:text-[color:var(--fg,#0B0E17)]"
            }`}
            onClick={() => setTab("founders")}
          >
            Founders
          </button>
        </div>
        <p className="font-mono text-[11px] tabular-nums text-[color:var(--fg-2,#3F465C)]">
          <span className="font-bold text-[color:var(--ember,#D96B1C)]">{Math.min(items.length, total).toLocaleString("en-US")}</span>
          {" of "}
          <span className="font-semibold text-[color:var(--fg,#0B0E17)]">{total.toLocaleString("en-US")}</span>
        </p>
      </div>
      <div className="mt-1 flex flex-wrap gap-1 overflow-x-auto pb-0.5 sm:max-h-[96px] sm:overflow-y-auto" data-dock-scroller="">
        {items.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="flex w-[44px] shrink-0 flex-col items-center gap-0.5 rounded-sm border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-0.5 py-0.5 hover:border-[color:var(--cobalt,#2F4FD8)]"
            title={item.name}
          >
            <LogoMark name={item.name} logoUrl={item.logoUrl ?? null} size={22} />
            <span className="line-clamp-1 w-full text-center text-[8px] font-medium leading-3 text-[color:var(--fg,#0B0E17)]">
              {item.name}
            </span>
          </Link>
        ))}
        {items.length === 0 ? (
          <p className="py-2 text-[12px] text-[color:var(--fg-3,#5C647A)]">Nothing in this tab for the current filters.</p>
        ) : null}
      </div>
    </aside>
  );
}
