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
  sectorMix,
  COUNT,
  PANEL,
  type FacetState,
} from "./sample-instrument";
import { SampleTheme } from "./sample-theme";

function MobileInstrumentStrip({ companies }: { companies: FacetCompany[] }) {
  const mix = useMemo(() => sectorMix(companies).slice(0, 5), [companies]);
  const signaled = companies.filter((c) => c.signals > 0).length;
  const total = mix.reduce((sum, item) => sum + item.count, 0) || 1;
  const dots = ["#2F4FD8", "#D96B1C", "#1F8A66", "#C47A12", "#7A4FBF"];
  return (
    <div className={`${PANEL} relative mb-2 overflow-hidden p-2 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-[color:var(--ember,#E8823A)]`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--cobalt,#2F4FD8)]">Scout pulse</p>
        <p className="text-[10px] text-[color:var(--fg-3,#6B7390)]">
          <span className={COUNT}>{signaled.toLocaleString("en-US")}</span> signaled ·{" "}
          <span className={COUNT}>{companies.length.toLocaleString("en-US")}</span> in view
        </p>
      </div>
      <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-[color:var(--bg-sunken,#080A11)]">
        {mix.map((item, index) => (
          <div
            key={item.id}
            className="h-full"
            style={{ width: `${Math.max(3, Math.round((item.count / total) * 100))}%`, background: dots[index % dots.length] }}
            title={`${item.label}: ${item.count}`}
          />
        ))}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
        {mix.slice(0, 4).map((item, index) => (
          <span key={item.id} className="inline-flex items-center gap-1 text-[9px] text-[color:var(--fg-2,#A3AAC0)]">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: dots[index % dots.length] }} aria-hidden />
            {item.label}
            <span className={COUNT}>{item.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

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

  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  return (
    <div className="sample-paper min-h-[calc(100dvh-48px)]">
      <SampleTheme />
      <div className="mx-auto w-full max-w-[1280px] px-3 py-3 sm:px-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--line,#E1E5EF)] pb-2">
          <Link href="/?sample=1#browse" className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[color:var(--ember,#D96B1C)] hover:underline">
            ← Company ledger
          </Link>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--cobalt,#2F4FD8)]">Scout dossier</p>
        </div>
        <div className="grid gap-3 lg:grid-cols-[240px_minmax(0,1fr)_250px]">
          <aside className="hidden min-w-0 lg:block">
            <div className={`${PANEL} relative sticky top-14 h-[min(72vh,680px)] overflow-hidden p-2.5 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-[color:var(--ember,#D96B1C)]`}>
              <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--cobalt,#2F4FD8)]">Scout filters</p>
              <FacetRail companies={companies} campuses={campuses} facets={facets} onChange={onFacetChange} />
            </div>
          </aside>
          <div className="min-w-0">
            <MobileInstrumentStrip companies={filtered} />
            <div className="company-instrument relative overflow-hidden rounded-md border border-[color:var(--cobalt,#2F4FD8)]/30 border-l-[3px] border-l-[color:var(--ember,#D96B1C)] bg-[color:var(--bg-raised,#FFFFFF)] p-2.5 shadow-[inset_0_1px_0_rgba(47,79,216,0.12)] sm:p-3.5 before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-[color:var(--cobalt,#2F4FD8)]">{children}</div>
            <button
              type="button"
              onClick={() => setMobileFiltersOpen(true)}
              className={`${PANEL} mt-3 flex w-full items-center justify-between px-2.5 py-2 text-left font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--fg,#0B0E17)] lg:hidden`}
            >
              <span>Scout filters</span>
              <span className="text-[color:var(--ember,#D96B1C)]">Open</span>
            </button>
          </div>
          <aside className="hidden min-w-0 lg:block">
            <div className="sticky top-14 space-y-2">
              <IntelligenceBoards companies={filtered} compact hideSector />
            </div>
          </aside>
          <div className="mt-3 space-y-2 lg:hidden">
            <IntelligenceBoards companies={filtered} compact hideSector />
          </div>
        </div>
      </div>
      {mobileFiltersOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Scout filters">
          <button type="button" className="absolute inset-0 bg-slate-900/40" aria-label="Close filters" onClick={() => setMobileFiltersOpen(false)} />
          <div className={`${PANEL} absolute inset-x-0 bottom-0 flex max-h-[min(85dvh,640px)] flex-col overflow-hidden rounded-t-xl border-t border-[color:var(--cobalt,#2F4FD8)]/25 bg-[color:var(--bg-raised,#FFFFFF)]`}>
            <div className="flex items-center justify-between gap-2 border-b border-[color:var(--line,#E1E5EF)] px-3 py-2">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--fg,#0B0E17)]">Scout filters</p>
              <button type="button" onClick={() => setMobileFiltersOpen(false)} className="font-mono text-[11px] text-[color:var(--ember,#D96B1C)]">Done</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              <div className="h-[min(70dvh,520px)]">
                <FacetRail companies={companies} campuses={campuses} facets={facets} onChange={onFacetChange} />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
