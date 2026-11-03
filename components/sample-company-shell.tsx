"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { FacetCompany } from "@/lib/domain/sample-facets";
import { campusPeerCompanies } from "@/lib/domain/sample-facets";
import { fetchSampleDirectory } from "@/lib/domain/sample-directory-client";
import { shortCampusLabel } from "@/lib/domain/campuses";
import { CompanyRecordHeader, CompanyPeers, type CompanyDossier } from "./company-record-header";
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
import { browseHref } from "@/lib/domain/facet-url";
import styles from "./company-mobile.module.css";
import { companyDisplayCopy } from "@/lib/ui/company-display-copy";

export function SampleCompanyShell({
  children,
  companies,
  dossier,
}: {
  children: ReactNode;
  companies: FacetCompany[];
  /** Local company beat - name / campus / year / ids. Not the global dispatch count. */
  dossier?: CompanyDossier;
}) {
  const router = useRouter();
  const [facets, setFacets] = useState<FacetState>(emptyFacets);
  /** Full corpus for FacetRail only - lazy-loaded; SSR ships peer seed alone. */
  const [catalog, setCatalog] = useState<FacetCompany[] | null>(null);
  const [campuses, setCampuses] = useState<{ id: string; name: string; country: string; founders: number }[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchSampleDirectory()
      .then((cards) => {
        if (!cancelled) setCatalog(companyDisplayCopy(cards));
      })
      .catch(() => {
        /* keep peer seed; filters still navigate to /companies */
      });
    // The global campus index is only needed by the hydrated desktop filters.
    // Keep it out of every company's initial document, especially on mobile.
    void fetch("/data/hero-stats.json")
      .then(async (response) => {
        if (!response.ok) throw new Error("campus index");
        return await response.json() as { universities: { id: string; name: string; country?: string | null; founderCount: number; lat?: number | null; lon?: number | null }[] };
      })
      .then((data) => {
        if (!cancelled) setCampuses(data.universities
          .filter((university) => university.lat != null && university.lon != null)
          .map((university) => ({ id: university.id, name: university.name, country: university.country?.trim() || "Unknown", founders: university.founderCount })));
      })
      .catch(() => { /* The browse link remains available if the index cannot load. */ });
    return () => {
      cancelled = true;
    };
  }, []);
  const facetCompanies = catalog ?? companies;
  const filtered = useMemo(() => applyFacets(facetCompanies, facets), [facetCompanies, facets]);
  function onFacetChange(next: FacetState) {
    setFacets(next);
    router.push(browseHref({ facets: next }));
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
  const wireCount = dossier?.peerCount ?? campusPeers?.length ?? sectorPeers?.length ?? signaled;
  const campusShort = dossier?.schoolId
    ? shortCampusLabel(dossier.schoolId, dossier.campus ?? "Campus")
    : (dossier?.campus ?? "Campus").replace(/^University of (?:California, )?/, "").replace(/ University$/, "");
  const wireScope = campusPeers
    ? `${campusShort} companies`
    : sectorPeers
      ? "companies in sector"
      : "signaled nearby";
  // Explicit: the subject company is included in the campus peer count.
  const wireIncludeNote = campusPeers ? "includes this company" : sectorPeers ? "includes this company" : null;
  const wireCompanies = campusPeers ?? sectorPeers ?? filtered.filter((c) => c.signals > 0);

  return (
    <div className={`sample-paper min-h-[calc(100dvh-48px)] ${styles.record}`}>
      <SampleTheme />
      <div className="mx-auto w-full max-w-[1280px] px-3 py-3 pb-8 sm:px-5 sm:pb-5">
        {dossier && <CompanyRecordHeader dossier={dossier} peers={wireCompanies} campusShort={campusShort} />}
        <p className={styles.recordCount} data-dossier-colophon="">
          {wireCount.toLocaleString("en-US")} {wireScope}{wireIncludeNote ? ` · ${wireIncludeNote}` : ""}
        </p>

        {/* Three-column desk: index · profile · wire digest */}
        <div className="grid gap-3 lg:grid-cols-[minmax(240px,280px)_minmax(0,1fr)_minmax(240px,300px)]" data-dossier-spread="">
          <aside className="hidden min-w-0 lg:block" data-dossier-index="">
            <div className="sticky top-14 h-[min(78vh,720px)]">
              {catalog && campuses.length > 0 ? <FacetRail
                companies={facetCompanies}
                campuses={campuses}
                facets={facets}
                onChange={onFacetChange}
                index
                indexCount={wireCount}
                caption="Company filters"
              /> : (
                <Link href="/companies" className="inline-flex min-h-10 items-center border border-[color:var(--cobalt,#2F4FD8)] px-3 font-mono text-[11px] text-[color:var(--cobalt,#2F4FD8)]">
                  Browse company filters
                </Link>
              )}
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
              <CompanyPeers companies={wireCompanies} subjectId={dossier?.id} campus={dossier?.schoolId ? campusShort : null} />
              <div className={`${PANEL} relative overflow-hidden p-3 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-[color:var(--ember,#D96B1C)]`}>
                <div className="mb-2 flex items-baseline justify-between gap-2 border-b border-[color:var(--line,#E1E5EF)] pb-2">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--cobalt,#2F4FD8)]">Campus activity</p>
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
