"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { campusPeerCompanies, type FacetCompany } from "@/lib/domain/sample-facets";
import { fetchSampleDirectory } from "@/lib/domain/sample-directory-client";
import { browseHref } from "@/lib/domain/facet-url";
import { safeDiscoveryReturn } from "@/lib/domain/discovery-navigation";
import { emptyFacets, FacetRail, IntelligenceBoards, PANEL, type FacetState } from "./sample-instrument";
import { SampleTheme } from "./sample-theme";

export function SampleCompanyShell({ children, companies, campuses, dossier, peerTotals }: {
  children: ReactNode;
  companies: FacetCompany[];
  campuses: { id: string; name: string; country: string; founders: number }[];
  dossier?: { id?: string; name: string; schoolId?: string | null; sectorId?: string | null; sector?: string | null; campus?: string | null };
  peerTotals?: { campus: number; sector: number };
}) {
  const router = useRouter();
  const search = useSearchParams();
  const backHref = safeDiscoveryReturn(search.get("from"), search.get("campus"));
  const [catalog, setCatalog] = useState<FacetCompany[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetchSampleDirectory().then((cards) => { if (!cancelled) { setCatalog(cards); setFailed(false); } }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [attempt]);
  const peers = useMemo(() => {
    const source = catalog ?? companies;
    const campus = dossier?.schoolId ? campusPeerCompanies(source, dossier.schoolId) : [];
    return campus.length ? campus : source.filter((c) => c.sectorId && c.sectorId === dossier?.sectorId);
  }, [catalog, companies, dossier]);
  const count = catalog ? peers.length : peerTotals?.campus || peerTotals?.sector || peers.length;
  const similar = useMemo(() => (catalog ?? companies)
    .filter((c) => c.id !== dossier?.id && Boolean(dossier?.sectorId && c.sectorId === dossier.sectorId))
    .sort((a, b) => Number(b.schoolId === dossier?.schoolId) - Number(a.schoolId === dossier?.schoolId) || b.signals - a.signals || a.name.localeCompare(b.name)).slice(0, 6),
  [catalog, companies, dossier]);
  return <div className="sample-paper company-dossier" data-company-shell="white">
    <SampleTheme />
    <div className="mx-auto w-full max-w-[1280px] px-3 py-3 pb-10 sm:px-5">
      <nav className="dossier-breadcrumb" aria-label="Company navigation">
        <Link href={backHref}>← {backHref.startsWith("/companies") ? "Company results" : "Map"}</Link><Link href="/work/shortlist">Saved companies</Link>
      </nav>
      <div className="grid gap-4 lg:grid-cols-[230px_minmax(0,1fr)_250px]" data-dossier-spread="">
        <aside className="hidden min-w-0 lg:block" data-dossier-index=""><div className="sticky top-14 h-[min(78vh,720px)]">
          <FacetRail companies={catalog ?? companies} campuses={campuses} facets={emptyFacets()} onChange={(next: FacetState) => router.push(browseHref({ facets: next }))} index indexCount={count} caption="Explore companies" />
        </div></aside>
        <div className="min-w-0">
          <div className="company-instrument" data-unified-company-record="">{children}</div>
          <section className="similar-companies"><h2>Similar companies</h2><p>Same recorded sector{dossier?.sector ? `: ${dossier.sector}` : ""}. Shared campus appears first; signal count breaks ties.</p>
            {similar.length ? <ul>{similar.map((c) => <li key={c.id}><Link href={`/startup/${c.id}`}><strong>{c.name}</strong><span>{c.schoolId === dossier?.schoolId ? "Same campus" : c.school ?? c.sector ?? "Sector peer"}</span></Link><Link href={`/compare?ids=${encodeURIComponent(dossier?.id ?? "")},${encodeURIComponent(c.id)}`}>Compare pair</Link></li>)}</ul> : <p>{catalog ? "No other companies with this sector are on record." : "Loading sector peers…"}</p>}
          </section>
        </div>
        <aside className="min-w-0" data-dossier-wire=""><div className={`${PANEL} p-3 lg:sticky lg:top-14`}>
          <h2 className="text-sm font-semibold">{dossier?.campus ? `${dossier.campus} context` : "Sector context"}</h2>
          <p className="mt-1 mb-3 text-xs text-muted">{count.toLocaleString("en-US")} companies · includes this company</p>
          {!catalog ? <p className="mb-3 text-xs text-muted" role="status">{failed ? "Full context could not load. Charts show the initial record sample." : "Loading full context. Charts show the initial record sample."}{failed ? <button className="min-h-11 px-2 text-link underline" onClick={() => { setFailed(false); setAttempt((n) => n + 1); }}>Retry</button> : null}</p> : null}
          <IntelligenceBoards companies={peers} compact hideSector surface="company" />
        </div></aside>
      </div>
    </div>
  </div>;
}
