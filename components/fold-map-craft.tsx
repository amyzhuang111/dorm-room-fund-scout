"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { FacetCompany } from "@/lib/domain/sample-facets";
import type { FounderLead } from "@/lib/domain/founder-index";

const COUNT = "font-bold tabular-nums text-[color:var(--cobalt,#2F4FD8)]";

export type ActiveChip = {
  key: string;
  label: string;
  onClear: () => void;
};

/** Fix 4 — current-view strip: what the map is filtering right now. */
export function CurrentViewStrip({
  campusName,
  query,
  matchCount,
  totalFounders,
  startups,
  onClearCampus,
  onClearQuery,
}: {
  campusName: string | null;
  query: string;
  matchCount: number;
  totalFounders: number;
  startups: { id: string; name: string }[];
  onClearCampus: () => void;
  onClearQuery: () => void;
}) {
  const q = query.trim();
  const focused = Boolean(campusName) || Boolean(q);
  if (!focused) return null;

  return (
    <aside
      className="mb-2 rounded-sm border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg-raised,#FFFFFF)] px-2.5 py-1.5"
      data-fold-current-view=""
      aria-label="Current map view"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[color:var(--fg,#0B0E17)]">
        <p className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]">View</p>
        <p className="tabular-nums text-[color:var(--fg-2,#3F465C)]">
          <span className={COUNT}>{matchCount.toLocaleString("en-US")}</span>
          {" of "}
          <span className="font-semibold tabular-nums text-[color:var(--fg,#0B0E17)]">{totalFounders.toLocaleString("en-US")}</span>
          {" founders"}
        </p>
        {campusName ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--cobalt,#2F4FD8)]/35 bg-[color:var(--cobalt-haze,#E8ECFA)]/60 px-2.5 py-0.5" data-fold-selected-campus-chip="">
            <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-[color:var(--cobalt,#2F4FD8)]">Campus</span>
            <span className="font-semibold">{campusName}</span>
            <button type="button" onClick={onClearCampus} className="font-mono text-[10px] font-semibold text-[color:var(--cobalt,#2F4FD8)] hover:underline" aria-label={`Clear ${campusName}`}>
              ×
            </button>
          </span>
        ) : null}
        {q ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--cobalt,#2F4FD8)]/35 bg-[color:var(--cobalt-haze,#E8ECFA)]/60 px-2.5 py-0.5">
            <span className="font-semibold">&ldquo;{q}&rdquo;</span>
            <button type="button" onClick={onClearQuery} className="font-mono text-[10px] font-semibold text-[color:var(--cobalt,#2F4FD8)] hover:underline" aria-label="Clear search">
              ×
            </button>
          </span>
        ) : null}
        {startups.length > 0 ? (
          <span className="min-w-0 text-[11px] text-[color:var(--fg-2,#3F465C)]" data-fold-current-startups="">
            {startups.slice(0, 4).map((s, i) => (
              <span key={s.id}>
                {i > 0 ? " · " : null}
                <Link href={`/startup/${s.id}?from=map`} className="font-medium text-[color:var(--fg,#0B0E17)] hover:text-[color:var(--cobalt,#2F4FD8)] hover:underline">
                  {s.name}
                </Link>
              </span>
            ))}
            {startups.length > 4 ? ` · +${startups.length - 4}` : null}
          </span>
        ) : null}
      </div>
    </aside>
  );
}

/** Fix 7 — active filter chips with N of M. */
export function FilterChips({
  chips,
  matchCount,
  totalCount,
  noun = "founders",
}: {
  chips: ActiveChip[];
  matchCount: number;
  totalCount: number;
  noun?: string;
}) {
  if (chips.length === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2" data-fold-filter-chips="" aria-label="Active filters">
      <span className="font-mono text-[11px] tabular-nums text-[color:var(--fg-2,#3F465C)]">
        <span className={COUNT}>{matchCount.toLocaleString("en-US")}</span>
        {" of "}
        <span className="font-semibold tabular-nums">{totalCount.toLocaleString("en-US")}</span>
        {" "}
        {noun}
      </span>
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.onClear}
          className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[color:var(--cobalt,#2F4FD8)]/35 bg-[color:var(--cobalt-haze,#E8ECFA)]/60 px-2.5 text-[12px] font-medium text-[color:var(--fg,#0B0E17)] hover:border-[color:var(--cobalt,#2F4FD8)]"
        >
          {chip.label}
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--cobalt,#2F4FD8)]">×</span>
        </button>
      ))}
    </div>
  );
}

/** Fix 9 — mobile drawer shell for filters / lineage on small viewports. */
export function MobileFoldDrawer({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-3 lg:hidden" data-fold-mobile-drawer="">
      <button
        type="button"
        className="inline-flex h-9 w-full items-center justify-between rounded-sm border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-3 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{title}</span>
        <span className="tabular-nums text-[color:var(--fg-3,#5C647A)]">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}

/** Derive startups currently in the founder match set for the current-view strip. */
export function startupsInFounderMatches(
  founders: FounderLead[],
  companies: FacetCompany[],
  limit = 12,
): { id: string; name: string }[] {
  const ids = new Set<string>();
  const out: { id: string; name: string }[] = [];
  for (const f of founders) {
    if (!f.companyId || ids.has(f.companyId)) continue;
    ids.add(f.companyId);
    out.push({ id: f.companyId, name: f.company ?? f.companyId });
    if (out.length >= limit) break;
  }
  if (out.length > 0) return out;
  for (const c of companies) {
    if (ids.has(c.id)) continue;
    ids.add(c.id);
    out.push({ id: c.id, name: c.name });
    if (out.length >= limit) break;
  }
  return out;
}

/** Campus ids that should stay bright when search filters the globe. */
export function campusIdsForSearch(founders: FounderLead[], query: string, campuses: { id: string; name: string }[]): Set<string> | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const ids = new Set<string>();
  for (const f of founders) {
    if (!f.campusId) continue;
    const hay = `${f.name} ${f.campus ?? ""} ${f.company ?? ""} ${f.programs.join(" ")} ${f.sector ?? ""}`.toLowerCase();
    if (hay.includes(q)) ids.add(f.campusId);
  }
  for (const c of campuses) {
    if (c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)) ids.add(c.id);
  }
  return ids;
}
