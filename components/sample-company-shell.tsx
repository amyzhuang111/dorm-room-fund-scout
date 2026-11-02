"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { FacetCompany } from "@/lib/domain/sample-facets";
import { campusPeerCompanies } from "@/lib/domain/sample-facets";
import { fetchSampleDirectory } from "@/lib/domain/sample-directory-client";
import { shortCampusLabel } from "@/lib/domain/campuses";
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
  dossier,
}: {
  children: ReactNode;
  companies: FacetCompany[];
  campuses: { id: string; name: string; country: string; founders: number }[];
  /** Local company beat - name / campus / year / ids. Not the global dispatch count. */
  dossier?: {
    name: string;
    campus?: string | null;
    year?: number | null;
    schoolId?: string | null;
    sectorId?: string | null;
    sector?: string | null;
    primaryProgram?: string | null;
    founders?: string[];
    signals?: number;
    operatingStatus?: string | null;
    latestSignalAt?: string | null;
    logoUrl?: string | null;
    pitch?: string | null;
    stage?: string | null;
    signalLabel?: string | null;
  };
}) {
  const router = useRouter();
  const [facets, setFacets] = useState<FacetState>(emptyFacets);
  /** Full corpus for FacetRail only - lazy-loaded; SSR ships peer seed alone. */
  const [catalog, setCatalog] = useState<FacetCompany[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchSampleDirectory()
      .then((cards) => {
        if (!cancelled) setCatalog(cards);
      })
      .catch(() => {
        /* keep peer seed; filters still navigate to /companies */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const facetCompanies = catalog ?? companies;
  const filtered = useMemo(() => applyFacets(facetCompanies, facets), [facetCompanies, facets]);
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
      router.push(`/companies?${params.toString()}`);
    }
  }

  const signaled = filtered.filter((c) => c.signals > 0).length;
  const peerSource = catalog ?? companies;
  const campusPeers = useMemo(() => {
    const sid = dossier?.schoolId;
    if (!sid) return null;
    const peers = campusPeerCompanies(peerSource, sid);
    return peers.length ? peers : null;
  }, [peerSource, dossier?.schoolId]);
  const sectorPeers = useMemo(() => {
    const sec = dossier?.sectorId;
    if (!sec) return null;
    const peers = peerSource.filter((c) => c.sectorId === sec);
    return peers.length ? peers : null;
  }, [peerSource, dossier?.sectorId]);
  // Side-column count: campus peers including this company (preferred), else sector - never global 2,513.
  const wireCount = campusPeers?.length ?? sectorPeers?.length ?? signaled;
  const campusShort = dossier?.schoolId
    ? shortCampusLabel(dossier.schoolId, dossier.campus ?? "Campus")
    : (dossier?.campus ?? "Campus").replace(/^University of (?:California, )?/, "").replace(/ University$/, "");
  const wireScope = campusPeers
    ? `${campusShort} companies`
    : sectorPeers
      ? "companies in sector"
      : "signaled nearby";
  const wireUnit = campusPeers ? "companies on this campus" : sectorPeers ? "companies in this sector" : "signaled nearby";
  // Explicit: the subject company is included in the campus peer count.
  const wireIncludeNote = campusPeers ? "includes this company" : sectorPeers ? "includes this company" : null;
  const wireCompanies = campusPeers ?? sectorPeers ?? filtered.filter((c) => c.signals > 0);

  return (
    <div className="sample-paper min-h-[calc(100dvh-48px)]">
      <SampleTheme />
      <div className="mx-auto w-full max-w-[1280px] px-3 py-3 pb-8 sm:px-5 sm:pb-5">
        {/* Summary card hero · logo, pitch, campus, stage, key signal · real data only */}
        <div className="mb-3 hidden sm:mb-4 sm:block" data-dossier-hero="" data-mobile-magazine="" data-summary-card="">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Link href="/companies" className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[color:var(--ember,#D96B1C)] hover:underline">
              ← Companies
            </Link>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--cobalt,#2F4FD8)]">Scout dossier</span>
          </div>
          {dossier?.name ? (
            <div className="relative flex flex-wrap items-start justify-between gap-4 overflow-hidden border border-[color:var(--cobalt,#2F4FD8)]/25 bg-[color:var(--bg,#FFFFFF)] p-4 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-[color:var(--cobalt,#2F4FD8)]">
              <div className="flex min-w-0 flex-1 gap-3 pl-1">
                {dossier.logoUrl ? (
                  <img src={dossier.logoUrl} alt="" width={48} height={48} className="mt-1 h-12 w-12 shrink-0 rounded-sm border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] object-contain" data-dossier-logo="" />
                ) : (
                  <div className="mt-1 grid h-12 w-12 shrink-0 place-items-center rounded-sm border border-[color:var(--line,#E1E5EF)] bg-[color:var(--cobalt-haze,#E8ECFA)]/50 font-mono text-[14px] font-bold text-[color:var(--cobalt,#2F4FD8)]" aria-hidden>
                    {(dossier.name.trim()[0] || "?").toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[28px] font-bold leading-[1.05] tracking-tight text-[color:var(--fg,#0B0E17)] sm:text-[32px] lg:text-[36px]">
                    {dossier.name}
                  </p>
                  {dossier.pitch ? (
                    <p className="mt-1.5 text-[14px] leading-5 text-[color:var(--fg-2,#3F465C)]" data-dossier-pitch="">
                      {dossier.pitch}
                    </p>
                  ) : null}
                  <p className="mt-2 flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[12px] tabular-nums text-[color:var(--fg-2,#3F465C)]" data-dossier-facts="">
                    {dossier.campus ? <span className="font-semibold text-[color:var(--fg,#0B0E17)]">{dossier.campus}</span> : <span>Campus not on record</span>}
                    {dossier.stage ? (
                      <span>
                        <span aria-hidden> · </span>
                        <span className="font-semibold text-[color:var(--fg,#0B0E17)]">{dossier.stage}</span>
                      </span>
                    ) : null}
                    {dossier.signalLabel ? (
                      <span>
                        <span aria-hidden> · </span>
                        <span className="font-bold text-[color:var(--ember,#D96B1C)]">{dossier.signalLabel}</span>
                      </span>
                    ) : (dossier.signals ?? 0) > 0 ? (
                      <span>
                        <span aria-hidden> · </span>
                        <span className="font-bold text-[color:var(--ember,#D96B1C)]">{dossier.signals!.toLocaleString("en-US")}</span>
                        {" signals"}
                      </span>
                    ) : null}
                    {dossier.year != null ? (
                      <span>
                        <span aria-hidden> · </span>
                        <span className={COUNT}>{dossier.year}</span>
                      </span>
                    ) : null}
                    {dossier.primaryProgram ? (
                      <span>
                        <span aria-hidden> · </span>
                        <span className="break-words font-semibold text-[color:var(--fg,#0B0E17)]">{dossier.primaryProgram}</span>
                      </span>
                    ) : null}
                  </p>
                </div>
              </div>
              {/* Mobile whisper; desk keeps dual wire stamps. Atlas plate owns the mobile lead figure. */}
              <div className="hidden" data-dossier-wire-count="" aria-hidden="true">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]">Campus wire</p>
                  <p className="mt-1 font-mono text-[32px] font-bold leading-[0.9] tracking-[-0.04em] text-[color:var(--ember,#D96B1C)]">
                    {wireCount.toLocaleString("en-US")}
                  </p>
                  <p className="mt-1 max-w-[14rem] text-right text-[12px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">
                    {wireScope}
                  </p>
                  <p className="mt-0.5 max-w-[14rem] text-right font-mono text-[10px] leading-snug text-[color:var(--fg-3,#5C647A)]">
                    {wireUnit}
                    {wireIncludeNote ? (
                      <>
                        {" · "}
                        {wireIncludeNote}
                      </>
                    ) : null}
                  </p>
                </div>
                {sectorPeers && campusPeers && sectorPeers.length !== campusPeers.length ? (
                  <div data-dossier-sector-figure="">
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--ember,#D96B1C)]">Sector peers</p>
                    <p className="mt-1 font-mono text-[32px] font-bold leading-[0.9] tracking-[-0.04em] text-[color:var(--fg,#0B0E17)]">
                      {sectorPeers.length.toLocaleString("en-US")}
                    </p>
                    <p className="mt-1.5 max-w-[10rem] text-right font-mono text-[10px] leading-snug text-[color:var(--fg-3,#5C647A)]">
                      {dossier.sector ?? "sector"}
                      {" · includes this company"}
                    </p>
                  </div>
                ) : null}
              </div>
              <p className="mt-3 font-mono text-[12px] tabular-nums text-[color:var(--fg-2,#3F465C)] sm:hidden" data-dossier-wire-whisper="">
                <span className="font-bold text-[color:var(--ember,#D96B1C)]">{wireCount.toLocaleString("en-US")}</span>
                {" "}
                {wireScope}
                {sectorPeers && campusPeers && sectorPeers.length !== campusPeers.length ? (
                  <>
                    {" · "}
                    <span className="font-bold text-[color:var(--fg,#0B0E17)]">{sectorPeers.length.toLocaleString("en-US")}</span>
                    {" sector peers"}
                  </>
                ) : null}
              </p>
            </div>
          ) : (
            <>
              <p className="mt-1 font-mono text-[32px] font-bold leading-none tracking-[-0.04em] text-[color:var(--fg,#0B0E17)]">
                <span className="text-[color:var(--ember,#D96B1C)]">{filtered.length.toLocaleString("en-US")}</span>
              </p>
              <p className="mt-1 text-[15px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">companies in this dispatch</p>
            </>
          )}
        </div>
        <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-[color:var(--line,#E1E5EF)] pb-2" data-dossier-colophon="">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--cobalt,#2F4FD8)]">On this campus</p>
          <p className="min-w-0 flex-1 text-right font-mono text-[11px] leading-5 tabular-nums text-[color:var(--fg-2,#3F465C)]">
            <span className="font-bold text-[color:var(--ember,#D96B1C)]">{wireCount.toLocaleString("en-US")}</span>
            {" "}
            {wireScope}
            {dossier?.primaryProgram ? (
              <>
                {" · "}
                <span className="font-bold text-[color:var(--ember,#D96B1C)]">{dossier.primaryProgram}</span>
              </>
            ) : null}
            {dossier?.year != null ? (
              <>
                {" · "}
                <span className="font-bold text-[color:var(--ember,#D96B1C)]">{dossier.year}</span>
                {" founded"}
              </>
            ) : null}
          </p>
        </div>

        {/* Mobile identity: one strong company lead · peers live in the wire strip below. */}
        <div className="mb-3 flex items-center justify-between gap-2 sm:hidden" data-dossier-mobile-nav="">
          <Link href="/companies" className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[color:var(--ember,#D96B1C)] hover:underline">
            ← Companies
          </Link>
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--cobalt,#2F4FD8)]">Scout dossier</span>
        </div>
        <div
          className="relative z-10 mb-3 mt-1 scroll-mt-[5.5rem] sm:hidden"
          data-dossier-timeline=""
          data-mobile-chrono-identity=""
          data-company-mobile-hero=""
          data-summary-card=""
          data-company-pinned-header=""
        >
          <div className="relative overflow-hidden border border-[color:var(--cobalt,#2F4FD8)]/30 bg-[color:var(--bg,#FFFFFF)]/95 shadow-sm backdrop-blur-sm before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-[color:var(--cobalt,#2F4FD8)]" data-dossier-spread-mobile="">
            <div className="flex gap-2.5 px-3 py-2">
              {dossier?.logoUrl ? (
                <img src={dossier.logoUrl} alt="" width={44} height={44} className="mt-1 h-11 w-11 shrink-0 rounded-sm border border-[color:var(--line,#E1E5EF)] object-contain" data-dossier-logo="" />
              ) : (
                <div className="mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-sm border border-[color:var(--line,#E1E5EF)] bg-[color:var(--cobalt-haze,#E8ECFA)]/50 font-mono text-[13px] font-bold text-[color:var(--cobalt,#2F4FD8)]" aria-hidden>
                  {((dossier?.name ?? "?").trim()[0] || "?").toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="scout-kicker">Scout dossier</p>
                <p className="mt-0.5 text-[20px] font-bold leading-[1.05] tracking-tight text-[color:var(--fg,#0B0E17)]" data-company-name-lead="">
                  {dossier?.name ?? "Company"}
                </p>
                {dossier?.pitch ? (
                  <p className="mt-1 line-clamp-2 text-[12px] leading-4 text-[color:var(--fg-2,#3F465C)]" data-dossier-pitch="">
                    {dossier.pitch}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="border-t border-[color:var(--line,#E1E5EF)] px-3.5 py-3">
            <p className="flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[12px] leading-5 tabular-nums text-[color:var(--fg-2,#3F465C)]">
              {dossier?.campus ? <span className="font-semibold text-[color:var(--fg,#0B0E17)]">{dossier.campus}</span> : <span>Campus not on record</span>}
              {dossier?.stage ? (
                <span>
                  <span aria-hidden> · </span>
                  <span className="font-semibold text-[color:var(--fg,#0B0E17)]">{dossier.stage}</span>
                </span>
              ) : null}
              {dossier?.signalLabel ? (
                <span>
                  <span aria-hidden> · </span>
                  <span className="font-bold text-[color:var(--ember,#D96B1C)]">{dossier.signalLabel}</span>
                </span>
              ) : (dossier?.signals ?? 0) > 0 ? (
                <span>
                  <span aria-hidden> · </span>
                  <span className="font-bold text-[color:var(--ember,#D96B1C)]">{dossier!.signals!.toLocaleString("en-US")}</span>
                  {" signals"}
                </span>
              ) : null}
              {dossier?.year != null ? (
                <span>
                  <span aria-hidden> · </span>
                  <span className="font-bold text-[color:var(--ember,#D96B1C)]">{dossier.year}</span>
                </span>
              ) : null}
              {dossier?.primaryProgram ? (
                <span className="break-words">
                  <span aria-hidden> · </span>
                  <span className="font-semibold text-[color:var(--fg,#0B0E17)]">{dossier.primaryProgram}</span>
                </span>
              ) : null}
            </p>
            <p className="mt-1 font-mono text-[11px] tabular-nums text-[color:var(--fg-3,#5C647A)]" data-dossier-signal-plate="">
              <span className="font-bold text-[color:var(--ember,#D96B1C)]">{wireCount.toLocaleString("en-US")}</span>
              {" "}
              {wireUnit}
              {wireIncludeNote ? <>{" · "}{wireIncludeNote}</> : null}
            </p>
            {dossier?.founders && dossier.founders.length > 0 ? (
              <div className="mt-1.5" data-dossier-founders-lead="">
                <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ember,#D96B1C)]">Founders</p>
                <p className="mt-0.5 text-[13px] font-semibold leading-4 tracking-tight text-[color:var(--fg,#0B0E17)]">
                  {dossier.founders.slice(0, 4).join(" · ")}
                </p>
              </div>
            ) : null}
            </div>
          </div>
        </div>

        {/* Three-column desk: index · profile · wire digest */}
        <div className="grid gap-3 lg:grid-cols-[minmax(240px,280px)_minmax(0,1fr)_minmax(240px,300px)]" data-dossier-spread="">
          <aside className="hidden min-w-0 lg:block" data-dossier-index="">
            <div className="sticky top-14 h-[min(78vh,720px)]">
              <FacetRail
                companies={facetCompanies}
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
            {/* Mobile wire strip omitted on company: hero already lists campus peers. */}
            <div className="company-instrument relative overflow-visible rounded-none border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] p-2.5 pb-4 sm:overflow-hidden sm:border-[color:var(--cobalt,#2F4FD8)]/25 sm:p-4 sm:pb-4 sm:before:absolute sm:before:inset-y-0 sm:before:left-0 sm:before:w-0.5 sm:before:bg-[color:var(--cobalt,#2F4FD8)] sm:before:content-['']">
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
    </div>
  );
}
