"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import type { FacetCompany } from "@/lib/domain/sample-facets";
import {
  applyFacets,
  emptyFacets,
  FacetRail,
  IntelligenceBoards,
  COUNT,
  PANEL,
  type FacetState,
} from "./sample-instrument";
import { SampleTheme } from "./sample-theme";

export function SampleCompanyShell({
  children,
  companies,
  campuses,
}: {
  children: ReactNode;
  companies: FacetCompany[];
  campuses: { id: string; name: string; country: string; founders: number }[];
}) {
  const router = useRouter();
  const [facets, setFacets] = useState<FacetState>(emptyFacets);
  const filtered = useMemo(() => applyFacets(companies, facets), [companies, facets]);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [deskFiltersOpen, setDeskFiltersOpen] = useState(false);

  function onFacetChange(next: FacetState) {
    setFacets(next);
    const params = new URLSearchParams({ sample: "1" });
    if (next.sector) params.set("sector", next.sector);
    if (next.kind) params.set("kind", next.kind);
    if (next.campus) params.set("campus", next.campus);
    if (next.query.trim()) params.set("q", next.query.trim());
    if (next.hqRegion) params.set("hq", next.hqRegion);
    if (
      next.sector ||
      next.kind ||
      next.campus ||
      next.query.trim() ||
      next.foundedYear ||
      next.status ||
      next.flag ||
      next.hqRegion
    ) {
      router.push(`/?${params.toString()}#browse`);
    }
  }

  const signaled = filtered.filter((c) => c.signals > 0).length;

  return (
    <div className="sample-paper min-h-[calc(100dvh-48px)]">
      <SampleTheme />
      <div className="mx-auto w-full max-w-[1280px] px-3 py-3 sm:px-5">
        {/* Scout Dispatch masthead — same signature as fold */}
        <div className="mb-2 border-b border-[color:var(--line,#E1E5EF)] pb-2">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link href="/?sample=1#browse" className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[color:var(--ember,#D96B1C)] hover:underline">
                  ← Company ledger
                </Link>
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--cobalt,#2F4FD8)]">Scout dossier</span>
              </div>
              <p className="mt-1 font-mono text-[36px] font-bold leading-none tracking-[-0.04em] text-[color:var(--fg,#0B0E17)] sm:text-[48px]">
                <span className="text-[color:var(--ember,#D96B1C)]">{filtered.length.toLocaleString("en-US")}</span>
              </p>
              <p className="mt-1 text-[15px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">companies in this dispatch</p>
              <p className="mt-0.5 flex items-baseline gap-2 font-mono text-[11px] tabular-nums text-[color:var(--fg-2,#3F465C)]">
                <span>
                  <span className={COUNT}>{signaled.toLocaleString("en-US")}</span>
                  {" signaled"}
                </span>
                <span className="text-[color:var(--fg-3,#5C647A)]">·</span>
                <span className="uppercase tracking-[0.12em] text-[color:var(--cobalt,#2F4FD8)]">Wire</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== "undefined" && window.innerWidth < 1024) setMobileFiltersOpen(true);
                  else setDeskFiltersOpen((v) => !v);
                }}
                className="inline-flex h-8 items-center rounded-sm border border-[color:var(--line-strong,#C5CAD8)] bg-[color:var(--bg,#FFFFFF)] px-3 font-mono text-[11px] font-medium text-[color:var(--fg,#0B0E17)] hover:border-[color:var(--cobalt,#2F4FD8)]"
              >
                {deskFiltersOpen ? "Hide filters" : "Filters"}
              </button>
            </div>
          </div>
        </div>

        {/* Asymmetric: one editorial column + dossier (no left filters / right boards sandwich) */}
        <div className="grid gap-3 lg:grid-cols-[minmax(260px,300px)_minmax(0,1fr)]">
          <aside className="hidden min-w-0 lg:block">
            <div className="sticky top-14 space-y-2">
              {deskFiltersOpen ? (
                <div className={`${PANEL} relative h-[min(72vh,680px)] overflow-hidden p-2 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-[color:var(--ember,#D96B1C)]`}>
                  <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--cobalt,#2F4FD8)]">Scout filters</p>
                  <FacetRail companies={companies} campuses={campuses} facets={facets} onChange={onFacetChange} dense />
                </div>
              ) : (
                <div className={`${PANEL} relative overflow-hidden p-3 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-[color:var(--cobalt,#2F4FD8)]`}>
                  <div className="mb-2 flex items-baseline justify-between gap-2 border-b border-[color:var(--line,#E1E5EF)] pb-2">
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--cobalt,#2F4FD8)]">Wire</p>
                    <p className="font-mono text-[10px] tabular-nums text-[color:var(--fg-3,#5C647A)]">{filtered.length.toLocaleString("en-US")}</p>
                  </div>
                  <IntelligenceBoards companies={filtered} compact hideSector />
                </div>
              )}
            </div>
          </aside>
          <div className="min-w-0">
            <div className="company-instrument relative overflow-hidden rounded-none border border-[color:var(--cobalt,#2F4FD8)]/25 border-l-[3px] border-l-[color:var(--ember,#D96B1C)] bg-[color:var(--bg-raised,#FFFFFF)] p-2.5 sm:p-4 before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-[color:var(--cobalt,#2F4FD8)]">
              {children}
            </div>
            <div className={`${PANEL} relative mt-3 overflow-hidden p-3 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-[color:var(--cobalt,#2F4FD8)] lg:hidden`}>
              <div className="mb-2 flex items-baseline justify-between gap-2 border-b border-[color:var(--line,#E1E5EF)] pb-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--cobalt,#2F4FD8)]">Wire</p>
                <p className="font-mono text-[10px] tabular-nums text-[color:var(--fg-3,#5C647A)]">{filtered.length.toLocaleString("en-US")}</p>
              </div>
              <p className="mb-2 font-mono text-[10px] tabular-nums text-[color:var(--fg-2,#3F465C)]">
                <span className={COUNT}>{signaled.toLocaleString("en-US")}</span>
                {" signaled in this dispatch"}
              </p>
              <IntelligenceBoards companies={filtered} compact hideSector />
            </div>
            <button
              type="button"
              onClick={() => setMobileFiltersOpen(true)}
              className={`${PANEL} mt-2 flex w-full items-center justify-between px-2.5 py-1.5 text-left font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--fg,#0B0E17)] lg:hidden`}
            >
              <span>Scout filters</span>
              <span className="text-[color:var(--ember,#D96B1C)]">Open</span>
            </button>
          </div>
        </div>
      </div>
      {mobileFiltersOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Scout filters">
          <button type="button" className="absolute inset-0 bg-slate-900/35" aria-label="Close filters" onClick={() => setMobileFiltersOpen(false)} />
          <div className={`${PANEL} absolute inset-x-0 bottom-0 flex max-h-[min(78dvh,560px)] flex-col overflow-hidden rounded-t-lg border-t border-[color:var(--cobalt,#2F4FD8)]/25 bg-[color:var(--bg-raised,#FFFFFF)] shadow-[0_-6px_20px_rgba(15,23,42,0.10)]`}>
            <div className="flex items-center justify-between gap-2 border-b border-[color:var(--line,#E1E5EF)] px-2.5 py-1.5">
              <div className="min-w-0">
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--fg,#0B0E17)]">Scout filters</p>
                <p className="font-mono text-[9px] tabular-nums text-[color:var(--fg-3,#5C647A)]">Status · Year · Sector · Campus</p>
              </div>
              <button type="button" onClick={() => setMobileFiltersOpen(false)} className="inline-flex h-7 items-center rounded-sm border border-[color:var(--ember,#D96B1C)] bg-[color:var(--ember,#D96B1C)] px-2.5 font-mono text-[11px] font-semibold text-white">Done</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1">
              <div className="h-[min(68dvh,500px)]">
                <FacetRail companies={companies} campuses={campuses} facets={facets} onChange={onFacetChange} dense />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
