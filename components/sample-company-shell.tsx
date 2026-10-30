"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import type { FacetCompany } from "@/lib/domain/sample-facets";
import { campusPeerCompanies } from "@/lib/domain/sample-facets";
import { shortCampusLabel } from "@/lib/domain/campuses";
import {
  applyFacets,
  emptyFacets,
  FacetRail,
  IntelligenceBoards,
  COUNT,
  MobileFilterDock,
  MobileWireStrip,
  PANEL,
  ScoutChronograph,
  type FacetState,
} from "./sample-instrument";
import { SampleTheme } from "./sample-theme";

export function SampleCompanyShell({
  children,
  companies,
  campuses,
  dossier,
}: {
  children: ReactNode;
  companies: FacetCompany[];
  campuses: { id: string; name: string; country: string; founders: number }[];
  /** Local company beat — name / campus / year / ids. Not the global dispatch count. */
  dossier?: {
    name: string;
    campus?: string | null;
    year?: number | null;
    schoolId?: string | null;
    sectorId?: string | null;
    sector?: string | null;
  };
}) {
  const router = useRouter();
  const [facets, setFacets] = useState<FacetState>(emptyFacets);
  const filtered = useMemo(() => applyFacets(companies, facets), [companies, facets]);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

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
  const campusPeers = useMemo(() => {
    const sid = dossier?.schoolId;
    if (!sid) return null;
    const peers = campusPeerCompanies(companies, sid);
    return peers.length ? peers : null;
  }, [companies, dossier?.schoolId]);
  const sectorPeers = useMemo(() => {
    const sec = dossier?.sectorId;
    if (!sec) return null;
    const peers = companies.filter((c) => c.sectorId === sec);
    return peers.length ? peers : null;
  }, [companies, dossier?.sectorId]);
  // Side-column count: campus peers including this company (preferred), else sector — never global 2,513.
  const wireCount = campusPeers?.length ?? sectorPeers?.length ?? signaled;
  const campusShort = dossier?.schoolId
    ? shortCampusLabel(dossier.schoolId, dossier.campus ?? "Campus")
    : (dossier?.campus ?? "Campus").replace(/^University of (?:California, )?/, "").replace(/ University$/, "");
  const wireScope = campusPeers
    ? `${campusShort} companies on campus`
    : sectorPeers
      ? "companies in sector"
      : "signaled nearby";
  // Explicit: the subject company is included in the campus peer count.
  const wireIncludeNote = campusPeers ? "includes this company" : sectorPeers ? "includes this company" : null;
  const wireCompanies = campusPeers ?? sectorPeers ?? filtered.filter((c) => c.signals > 0);

  return (
    <div className="sample-paper min-h-[calc(100dvh-48px)]">
      <SampleTheme />
      <div className="mx-auto w-full max-w-[1280px] px-3 py-3 sm:px-5">
        {/* Magazine dossier cover — desk + mobile share the profile treatment */}
        <div className="mb-3 border-b border-[color:var(--line,#E1E5EF)] pb-3" data-dossier-hero="" data-mobile-magazine="">
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/?sample=1#browse" className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[color:var(--ember,#D96B1C)] hover:underline">
              ← Company ledger
            </Link>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--cobalt,#2F4FD8)]">Scout dossier</span>
          </div>
          {dossier?.name ? (
            <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-[32px] font-bold leading-[1.02] tracking-tight text-[color:var(--fg,#0B0E17)] sm:text-[40px] lg:text-[44px]">
                  {dossier.name}
                </p>
                <p className="mt-2 font-mono text-[12px] tabular-nums text-[color:var(--fg-2,#3F465C)] sm:text-[13px]">
                  {dossier.campus ? <span className="font-semibold text-[color:var(--fg,#0B0E17)]">{dossier.campus}</span> : <span>Campus not on record</span>}
                  {" · "}
                  {dossier.year != null ? (
                    <span>
                      <span className={COUNT}>{dossier.year}</span>
                      {" founded"}
                    </span>
                  ) : (
                    <span>Year not on record</span>
                  )}
                </p>
              </div>
              <div className="shrink-0 text-right" data-dossier-wire-count="">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]">Campus wire</p>
                <p className="mt-1 font-mono text-[48px] font-bold leading-none tracking-[-0.05em] text-[color:var(--ember,#D96B1C)] sm:text-[56px] lg:text-[64px]">
                  {wireCount.toLocaleString("en-US")}
                </p>
                <p className="mt-1.5 max-w-[12rem] text-right font-mono text-[10px] leading-snug text-[color:var(--fg-3,#5C647A)] sm:max-w-[16rem]">
                  {wireScope}
                  {wireIncludeNote ? (
                    <>
                      {" · "}
                      {wireIncludeNote}
                    </>
                  ) : null}
                </p>
              </div>
            </div>
          ) : (
            <>
              <p className="mt-1 font-mono text-[56px] font-bold leading-none tracking-[-0.05em] text-[color:var(--fg,#0B0E17)] sm:text-[48px]">
                <span className="text-[color:var(--ember,#D96B1C)]">{filtered.length.toLocaleString("en-US")}</span>
              </p>
              <p className="mt-1 text-[15px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">companies in this dispatch</p>
            </>
          )}
        </div>

        <div className="mb-3" data-dossier-chronograph="">
          <ScoutChronograph
            companies={wireCompanies}
            variant="hero"
            kicker="Campus chronograph"
            datedLabel={`${wireCompanies.filter((c) => (c.latestSignalAt ?? "").length >= 7).length.toLocaleString("en-US")} dated on this campus wire`}
            reading={
              campusPeers
                ? `${campusShort} campus slice · ${wireCount.toLocaleString("en-US")} companies · includes this company`
                : sectorPeers
                  ? `Sector slice · ${wireCount.toLocaleString("en-US")} companies · includes this company`
                  : `Nearby signaled slice · ${wireCount.toLocaleString("en-US")} companies`
            }
          />
        </div>

        {/* Three-column desk: index · profile · wire digest */}
        <div className="grid gap-3 lg:grid-cols-[minmax(240px,280px)_minmax(0,1fr)_minmax(240px,300px)]" data-dossier-spread="">
          <aside className="hidden min-w-0 lg:block" data-dossier-index="">
            <div className="sticky top-14 h-[min(78vh,720px)]">
              <FacetRail
                companies={companies}
                campuses={campuses}
                facets={facets}
                onChange={onFacetChange}
                index
                indexCount={wireCount}
                caption="Dossier index"
              />
            </div>
          </aside>
          <div className="min-w-0">
            {/* Mobile magazine: swipe WIRE digest above the profile card */}
            <div
              className="mb-3 lg:hidden"
              data-dossier-wire-mobile=""
              data-mobile-magazine-wire=""
              style={{ paddingBottom: "calc(5.25rem + env(safe-area-inset-bottom, 0px))" }}
            >
              <MobileWireStrip companies={wireCompanies} label="Dossier wire" surface="company" />
            </div>
            <div className="company-instrument relative overflow-hidden rounded-none border border-[color:var(--cobalt,#2F4FD8)]/25 bg-[color:var(--bg,#FFFFFF)] p-3 sm:p-4 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-[color:var(--cobalt,#2F4FD8)] before:content-[''] after:absolute after:inset-x-0 after:top-0 after:h-0.5 after:bg-[color:var(--cobalt,#2F4FD8)] after:content-['']">
              {children}
            </div>
          </div>
          <aside className="hidden min-w-0 lg:block" data-dossier-wire="">
            <div className="sticky top-14">
              <div className={`${PANEL} relative overflow-hidden p-3 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-[color:var(--ember,#D96B1C)]`}>
                <div className="mb-2 flex items-baseline justify-between gap-2 border-b border-[color:var(--line,#E1E5EF)] pb-2">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--cobalt,#2F4FD8)]">Dossier wire</p>
                  <p className="font-mono text-[10px] tabular-nums text-[color:var(--ember,#D96B1C)]">{wireCount.toLocaleString("en-US")}</p>
                </div>
                <p className="mb-2 font-mono text-[10px] tabular-nums text-[color:var(--fg-3,#5C647A)]">
                  <span className={COUNT}>{wireCount.toLocaleString("en-US")}</span>
                  {" "}
                  {wireScope}
                  {wireIncludeNote ? (
                    <>
                      {" · "}
                      <span>{wireIncludeNote}</span>
                    </>
                  ) : null}
                </p>
                <IntelligenceBoards companies={wireCompanies} compact hideSector surface="company" />
              </div>
            </div>
          </aside>
        </div>
      </div>
      <MobileFilterDock
        onOpen={() => setMobileFiltersOpen(true)}
        count={wireCount}
        caption="Scout this campus"
        tone="magazine"
        kicker="Dossier filters"
      />

      {mobileFiltersOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Scout filters">
          <button type="button" className="absolute inset-0 bg-slate-900/35" aria-label="Close filters" onClick={() => setMobileFiltersOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[min(82dvh,620px)] flex-col overflow-hidden rounded-t-md border border-[color:var(--cobalt,#2F4FD8)]/25 border-b-0 bg-[color:var(--bg,#FFFFFF)] shadow-[0_-8px_28px_rgba(15,23,42,0.12)] before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-[color:var(--cobalt,#2F4FD8)]">
            <div className="relative flex items-end justify-between gap-3 border-b border-[color:var(--line,#E1E5EF)] px-3 py-2.5">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--cobalt,#2F4FD8)]">Scout filters</p>
                <p className="mt-0.5 text-[13px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">Narrow the ledger</p>
                <p className="mt-0.5 font-mono text-[9px] tabular-nums text-[color:var(--fg-3,#5C647A)]">Status · Year · Sector · Campus</p>
              </div>
              <button type="button" onClick={() => setMobileFiltersOpen(false)} className="inline-flex h-8 shrink-0 items-center rounded-sm border border-[color:var(--ember,#D96B1C)] bg-[color:var(--ember,#D96B1C)] px-3 font-mono text-[11px] font-semibold text-white">Done</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <div className="h-[min(70dvh,540px)]">
                <FacetRail companies={companies} campuses={campuses} facets={facets} onChange={onFacetChange} dense />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
