"use client";

import dynamic from "next/dynamic";
import { MapStartupResults } from "./map-startup-results";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FounderResults, FounderSearchBar } from "@/components/founder-sourcing";
import { MobileCampusSegments, MobileFounderDeck, MobileFounderPeek } from "@/components/mobile-founder-deck";
import {
  campusIdsForSearch,
} from "@/components/fold-map-craft";
import { buildOpenLaneShell } from "@/lib/domain/open-lane";
import { GlobeHero } from "@/components/globe-hero";
import { SampleTheme } from "@/components/sample-theme";
import type { DirectoryCard, DirectoryFilter, DirectorySort } from "@/lib/domain/directory";
import type { HeroStats } from "@/lib/domain/hero-stats";
import { type FounderLead } from "@/lib/domain/founder-index";
import type { FacetCompany } from "@/lib/domain/sample-facets";
import { fetchSampleDirectory } from "@/lib/domain/sample-directory-client";
import type { Feed } from "@/components/sample-home";
import type { PeakShell } from "@/lib/domain/peak-shell";
import { shortCampusLabel } from "@/lib/domain/campuses";
import { discoveryHref } from "@/lib/domain/discovery-navigation";
import { rankedByUndergrad } from "@/lib/domain/pitchbook-model";
import { browseHref as buildBrowseHref, type FacetState as UrlFacetState } from "@/lib/domain/facet-url";

const SampleInstrumentBrowse = dynamic(
  () => import("@/components/sample-instrument-browse").then((mod) => ({ default: mod.SampleInstrumentBrowse })),
  { ssr: true },
);

type TopCampus = {
  id: string;
  name: string;
  founders: number;
  pitchbookRank: number | null;
  pitchbookFounders: number | null;
};



type CampusOpt = {
  id: string;
  name: string;
  country: string;
  founders: number;
  pitchbookRank?: number | null;
  pitchbookFounders?: number | null;
};


function browseHref(opts: {
  feed?: Feed;
  sector?: string;
  kind?: string;
  campus?: string;
  q?: string;
  sort?: DirectorySort;
  more?: number;
  facets?: Partial<UrlFacetState>;
}): string {
  return buildBrowseHref({
    feed: opts.feed,
    sort: opts.sort,
    more: opts.more,
    facets: {
      sector: opts.sector ?? null,
      kind: opts.kind ?? null,
      campus: opts.campus ?? null,
      query: opts.q ?? "",
      ...(opts.facets ?? {}),
    },
  });
}


function useIsLg() {
  const [lg, setLg] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => setLg(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return lg;
}

function MapFoldSheet({
  tabs,
  peek,
  filterKeep,
  campuses,
  campusId,
  onSelectCampus,
  onClearCampus,
}: {
  tabs: ReactNode;
  peak?: ReactNode;
  founders?: ReactNode;
  deck?: ReactNode;
  peek: ReactNode;
  filterKeep: ReactNode;
  campuses: TopCampus[];
  campusId: string | null;
  onSelectCampus: (id: string) => void;
  onClearCampus: () => void;
  search?: ReactNode;
}) {
  return (
    <div
      className="relative z-[1] border-t border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] lg:hidden"
      data-fold-map-sheet=""
      data-fold-sheet-mode="peek"
      data-fold-sheet-rest="0"
    >
      <div className="px-3 py-2" data-fold-sheet-panel="" data-fold-sheet-body="">
        <div data-fold-sheet-handle="" className="sr-only">Map records</div>
        {tabs}
        <MobileCampusSegments
          campuses={campuses}
          selectedId={campusId}
          onSelect={onSelectCampus}
          onClear={onClearCampus}
          kicker={campuses.some((campus) => campus.pitchbookRank != null) ? "PitchBook 2026" : "Open lane campuses"}
        />
        <div className="mt-2" data-fold-sheet-peek="" data-fold-founders-col="">
          {peek}
        </div>
        <div className="sr-only" data-fold-sheet-filter-keep="">
          {filterKeep}
        </div>
      </div>
    </div>
  );
}

export function SampleHomeClient(props: {
  feed: Feed;
  sector?: string;
  kind?: string;
  campusId?: string;
  campusName?: string;
  campusTotal: number | null;
  query: string;
  order: DirectorySort;
  pages: number;
  shown: DirectoryCard[];
  total: number;
  sectors: DirectoryFilter[];
  kinds: DirectoryFilter[];
  campuses: CampusOpt[];
  stats: HeroStats;
  cardCount: number;
  signalCompanyCount: number;
  foundersListed: number;
  foundersIndexed: number;
  newestHome: { label: string; detail: string } | null;
  peakShell?: PeakShell | null;
  directoryUrl?: string;
  place?: "map" | "explore";
  facetExtras?: Record<string, string | number | boolean | null | undefined>;
}) {
  const {
    feed,
    sector,
    kind,
    campusId,
    campusName,
    campusTotal,
    query,
    order,
    pages,
    shown,
    total,
    sectors,
    kinds,
    campuses,
    stats,
    cardCount,
    foundersListed,
    foundersIndexed,
    directoryUrl = "/data/sample-directory.json",
    place = "map",
  facetExtras,
  } = props;

  const [companies, setCompanies] = useState<FacetCompany[]>([]);
  const [founders, setFounders] = useState<FounderLead[]>([]);
  const [founderStatus, setFounderStatus] = useState<"loading" | "ready" | "error">("loading");
  const [founderQuery, setFounderQuery] = useState("");
  const [resultMode, setResultMode] = useState<"startups" | "founders">("startups");
  const [browseOpen, setBrowseOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const search = useSearchParams();
  const router = useRouter();
  const isLg = useIsLg();
  const mapCampusId = search.get("campus");
  const listed = feed === "directory" || feed === "leaderboard";
  const topCampuses = useMemo<TopCampus[]>(() => {
    const pitchbook = rankedByUndergrad(campuses);
    const source = pitchbook.length
      ? pitchbook.slice(0, 5)
      : [...campuses]
          .filter((c) => (c.founders ?? 0) > 0)
          .sort((a, b) => b.founders - a.founders || a.name.localeCompare(b.name))
          .slice(0, 5);
    return source.map((c) => ({
      id: c.id,
      name: shortCampusLabel(c.id, c.name),
      founders: c.founders,
      pitchbookRank: c.pitchbookRank ?? null,
      pitchbookFounders: c.pitchbookFounders ?? null,
    }));
  }, [campuses]);

  useEffect(() => {
    let dead = false;
    void fetchSampleDirectory(directoryUrl).then((cards) => {
      if (dead) return;
      setCompanies(cards);
      setReady(true);
    });
    void (async () => {
      const attempts = 3;
      for (let i = 0; i < attempts; i++) {
        try {
          const boot = i === 0 ? (window as Window & { __foundersPromise?: Promise<FounderLead[]> }).__foundersPromise : undefined;
          const data = boot
            ? await boot
            : await (async () => {
                const res = await fetch("/data/founders.json");
                if (!res.ok) throw new Error(String(res.status));
                return (await res.json()) as FounderLead[];
              })();
          if (!Array.isArray(data) || data.length === 0) throw new Error("empty founders");
          if (dead) return;
          setFounders(data);
          setFounderStatus("ready");
          return;
        } catch {
          if (i < attempts - 1) await new Promise((r) => setTimeout(r, 200 * (i + 1)));
        }
      }
      if (!dead) setFounderStatus("error");
    })();
    return () => {
      dead = true;
    };
  }, [directoryUrl]);

  const mapCampusName =
    mapCampusId && mapCampusId !== "missing"
      ? campuses.find((campus) => campus.id === mapCampusId)?.name ?? null
      : null;

  const highlightCampusIds = useMemo(
    () => campusIdsForSearch(founders, founderQuery, campuses),
    [founders, founderQuery, campuses],
  );

  const clearCampus = () => {
    const next = new URLSearchParams(search.toString());
    next.delete("campus");
    next.set("sample", "1");
    router.push(`/?${next.toString()}`);
  };

  const selectCampus = (id: string) => {
    const next = new URLSearchParams(search.toString());
    next.delete("feed");
    next.delete("university");
    next.set("sample", "1");
    if (!id) next.delete("campus");
    else next.set("campus", id);
    router.push(`/?${next.toString()}`);
  };

  const investableCompanyIds = useMemo(
    () => new Set(companies.map((company) => company.id).filter(Boolean)),
    [companies],
  );

  const openLane = useMemo(
    () =>
      founders.length && investableCompanyIds.size
        ? buildOpenLaneShell(founders, investableCompanyIds)
        : null,
    [founders, investableCompanyIds],
  );

  const discoveryTabs = <div className="flex gap-2" role="group" aria-label="Browse map records">{(["startups", "founders"] as const).map(mode => <button key={mode} type="button" aria-pressed={resultMode === mode} className={`min-h-11 rounded px-3 text-sm font-semibold ${resultMode === mode ? "bg-blue-50 text-blue-700" : "text-fg-2"}`} onClick={() => { setResultMode(mode); setBrowseOpen(true); }}>{mode === "startups" ? "Startups" : "Founders"}</button>)}</div>;
  const startupResults = <MapStartupResults key={`${mapCampusId}:${founderQuery}`} companies={companies} ready={ready} query={founderQuery} campusId={mapCampusId} />;
  return (
    <div className="sample-paper" {...(place === "map" ? { "data-fold-root": "" } : {})} data-directory-ready={ready ? "1" : "0"}>
      <SampleTheme />
      {place === "map" ? (
        <div className="px-0 pb-6 pt-0 sm:px-4 lg:px-0 lg:pt-0" data-fold-hierarchy="" data-fold-mobile-bleed="" data-fold-desk-bleed="1" data-fold-investor-first="1">
          {/* r56 desk: search + chips live inside the map fold overlays (not stacked above). Mobile unchanged. */}
          {/* r45: map-dominant stage with floating panels (desk) / peek sheet (mobile). */}
          <div data-fold-stack="" data-fold-bigmap="" data-fold-overlay="">
            <div className="relative min-w-0" data-fold-globe-col="" data-fold-map-stage-wrap="">
              {isLg ? (
                <div
                  className="border-b border-[color:var(--line,#E1E5EF)] px-4 py-2"
                  data-fold-overlay-mast=""
                  data-fold-mast=""
                >
                  <div className="space-y-1.5" data-fold-desk-mast-inner="">
                    {discoveryTabs}
                    <FounderSearchBar query={founderQuery} onQuery={setFounderQuery} />
                    {mapCampusId ? (
                      <button type="button" className="min-h-11 text-sm text-link" onClick={clearCampus}>
                        {mapCampusName || "Campus"} × Clear
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <GlobeHero
                stats={stats}
                showGlobe={feed !== "world"}
                companies={companies}
                companyCount={cardCount}
                foundersListed={foundersListed}
                foundersIndexed={foundersIndexed}
                highlightCampusIds={highlightCampusIds}
              />

              {/* Mobile sheet only below lg — keeps first [data-founder-card] visible for checks. */}
              {!isLg ? <MapFoldSheet
                tabs={discoveryTabs}
                campuses={topCampuses}
                campusId={mapCampusId}
                onSelectCampus={selectCampus}
                onClearCampus={clearCampus}
                peak={null}
                deck={resultMode === "startups" ? startupResults :
                  <MobileFounderDeck
                    founders={founders}
                    status={founderStatus}
                    query={founderQuery}
                    campusId={mapCampusId}
                    openLane={openLane}
                    investableCompanyIds={investableCompanyIds}
                  />
                }
                peek={resultMode === "startups" ? <MapStartupResults companies={companies} ready={ready} query={founderQuery} campusId={mapCampusId} compact /> :
                  <MobileFounderPeek
                    founders={founders}
                    status={founderStatus}
                    query={founderQuery}
                    campusId={mapCampusId}
                    openLane={openLane}
                    investableCompanyIds={investableCompanyIds}
                  />
                }
                filterKeep={
                  <FounderResults
                    founders={founders}
                    status={founderStatus}
                    query={founderQuery}
                    campusId={mapCampusId}
                    campusName={mapCampusName}
                    foundersListed={foundersListed}
                    foundersIndexed={foundersIndexed}
                    filtersOnly
                    onClearCampus={clearCampus}
                    onMissingCampus={() => {
                      const next = new URLSearchParams(search.toString());
                      next.set("sample", "1");
                      next.set("campus", "missing");
                      router.push(`/?${next.toString()}`);
                    }}
                  />
                }
                search={<FounderSearchBar query={founderQuery} onQuery={setFounderQuery} />}
                founders={resultMode === "startups" ? startupResults :
                  <FounderResults
                    founders={founders}
                    status={founderStatus}
                    query={founderQuery}
                    campusId={mapCampusId}
                    campusName={mapCampusName}
                    foundersListed={foundersListed}
                    foundersIndexed={foundersIndexed}
                    onClearCampus={clearCampus}
                    onMissingCampus={() => {
                      const next = new URLSearchParams(search.toString());
                      next.set("sample", "1");
                      next.set("campus", "missing");
                      router.push(`/?${next.toString()}`);
                    }}
                  />
                }
              /> : null}

              {isLg && (browseOpen || mapCampusId || founderQuery.trim()) ? (
                <div className="border-t border-[color:var(--line,#E1E5EF)] px-4 py-3" data-fold-founders-col="" data-fold-overlay-founders="">
                  <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]">
                    {resultMode === "startups" ? "Startups" : "Founders"}
                  </p>
                  {resultMode === "startups" ? startupResults : (
                    <FounderResults
                      founders={founders}
                      status={founderStatus}
                      query={founderQuery}
                      campusId={mapCampusId}
                      campusName={mapCampusName}
                      foundersListed={foundersListed}
                      foundersIndexed={foundersIndexed}
                      peek={3}
                      onClearCampus={clearCampus}
                      onMissingCampus={() => {
                        const next = new URLSearchParams(search.toString());
                        next.set("sample", "1");
                        next.set("campus", "missing");
                        router.push(`/?${next.toString()}`);
                      }}
                    />
                  )}
                </div>
              ) : null}
            </div>


          </div>
        </div>
      ) : null}
      {place === "explore" ? (
      <section id="browse" className="scroll-mt-14 border-t border-line px-3 pb-10 pt-1 sm:px-5 md:pt-2">
        <div className="mx-auto w-full max-w-[1280px]">
          <div
            className="hidden flex-wrap items-center gap-x-1 border-b border-line md:flex"
            role="tablist"
            aria-label="Views"
          >
            <Tab href={browseHref({ feed: "directory", sector, kind, campus: campusId, q: query, sort: order })} active={feed === "directory"}>
              Companies
            </Tab>
            <Tab href={browseHref({ feed: "leaderboard", sector, kind, campus: campusId, q: query })} active={feed === "leaderboard"}>
              By signals
            </Tab>
            <Tab href={discoveryHref("map", new URLSearchParams(search))} active={false}>
              Map
            </Tab>
          </div>
        </div>
        {listed ? (
          <SampleInstrumentBrowse
            feed={feed}
            cards={shown}
            total={total}
            pages={pages}
            sector={sector}
            kind={kind}
            campus={campusId}
            campusName={campusName}
            campusTotal={campusTotal}
            query={query}
            sort={order}
            sectors={sectors}
            kinds={kinds}
            campuses={campuses}
            companies={companies}
            moreHref={browseHref({
              feed,
              sector,
              kind,
              campus: campusId,
              q: query,
              sort: feed === "directory" ? order : undefined,
              more: pages + 1,
            })}
            clearCampusHref={browseHref({ feed, sector, kind, q: query, sort: feed === "directory" ? order : undefined, facets: facetExtras as Partial<UrlFacetState> | undefined })}
            initialFacets={{
              sector: sector ?? null,
              kind: kind ?? null,
              campus: campusId ?? null,
              query: query ?? "",
              stage: (facetExtras?.stage as string) ?? null,
              status: (facetExtras?.status as UrlFacetState["status"]) ?? null,
              flag: (facetExtras?.flag as UrlFacetState["flag"]) ?? null,
              foundedYear: typeof facetExtras?.foundedYear === "number" ? facetExtras.foundedYear : null,
              yearMissing: Boolean(facetExtras?.yearMissing),
              hqRegion: (facetExtras?.hqRegion as string) ?? null,
              country: (facetExtras?.country as string) ?? null,
              recency: (facetExtras?.recency as UrlFacetState["recency"]) ?? null,
              sectorMissing: Boolean(facetExtras?.sectorMissing),
            }}
          />
        ) : null}
      </section>
      ) : null}
    </div>
  );
}

function Tab({ href, active, children }: { href: string; active: boolean; children: string }) {
  return (
    <Link href={href} role="tab" aria-selected={active} className={`grid h-9 min-h-9 min-w-11 place-items-center border-b-2 px-2 font-mono text-[12px] font-medium uppercase tracking-[0.08em] sm:h-11 sm:min-h-11 sm:px-2.5 sm:text-[14px] ${active ? "border-[color:var(--cobalt,#2F4FD8)] text-[color:var(--fg,#0B0E17)]" : "border-transparent text-[color:var(--fg-3,#5C647A)] hover:text-[color:var(--fg-2,#3F465C)]"}`}>
      {children}
    </Link>
  );
}
