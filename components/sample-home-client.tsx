"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FounderResults, FounderSearchBar } from "@/components/founder-sourcing";
import {
  CurrentViewStrip,
  FilterChips,
  LineagePanels,
  campusIdsForSearch,
  startupsInFounderMatches,
  type ActiveChip,
} from "@/components/fold-map-craft";
import { GlobeHero } from "@/components/globe-hero";
import { SampleTheme } from "@/components/sample-theme";
import type { DirectoryCard, DirectoryFilter, DirectorySort } from "@/lib/domain/directory";
import type { HeroStats } from "@/lib/domain/hero-stats";
import { founderMatches, type FounderLead } from "@/lib/domain/founder-index";
import type { FacetCompany } from "@/lib/domain/sample-facets";
import { fetchSampleDirectory } from "@/lib/domain/sample-directory-client";
import type { Feed } from "@/components/sample-home";
import type { PeakShell } from "@/lib/domain/peak-shell";
import { shortCampusLabel } from "@/lib/domain/campuses";
import { browseHref as buildBrowseHref, type FacetState as UrlFacetState } from "@/lib/domain/facet-url";

const SampleInstrumentBrowse = dynamic(
  () => import("@/components/sample-instrument-browse").then((mod) => ({ default: mod.SampleInstrumentBrowse })),
  { ssr: true },
);

type TopCampus = { id: string; name: string; founders: number };

/** Client-only Peak share · outer slot reserves exact height so CLS ≈ 0 (HTML stays lean). */
const FoldPeakShare = dynamic(
  () => import("@/components/fold-peak-share").then((mod) => ({ default: mod.FoldPeakShare })),
  { ssr: false, loading: () => null },
);


type CampusOpt = { id: string; name: string; country: string; founders: number };


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


function PeakShareLite({
  shell,
  foundersListed: _foundersListed,
  campusesOnMap: _campusesOnMap,
  topCampuses: _topCampuses = [],
}: {
  shell: PeakShell;
  foundersListed: number;
  campusesOnMap: number;
  topCampuses?: TopCampus[];
}) {
  void _foundersListed;
  void _campusesOnMap;
  void _topCampuses;
  const peakCount = shell.peakCount;
  const peakLabel = shell.peakLabel;
  const pct = Math.round((peakCount / Math.max(1, shell.dated)) * 100);
  return (
    <div data-fold-peak-ssr-shell="" data-fold-peak-identity="" data-fold-baseline="8" data-fold-redesign="seal-dispatch">
      <div className="mb-1 hidden min-h-[15rem] lg:block" data-fold-peak-desk="">
        <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] items-end gap-6 border-b border-[color:var(--line,#E1E5EF)] pb-3" data-fold-peak-share="">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-[color:var(--cobalt,#2F4FD8)]">Peak share</p>
            <p className="mt-1 font-mono text-[84px] font-bold leading-[0.8] tracking-[-0.08em] text-[color:var(--cobalt,#2F4FD8)]">
              {peakCount.toLocaleString("en-US")}
              <span className="mx-2 text-[28px] font-semibold tracking-[-0.04em] text-[color:var(--fg-3,#5C647A)]">/</span>
              <span className="text-[36px] font-bold tracking-[-0.06em] text-[color:var(--fg,#0B0E17)]">{shell.dated.toLocaleString("en-US")}</span>
            </p>
            <p className="mt-2 max-w-[36rem] text-[17px] font-semibold leading-snug tracking-tight text-[color:var(--fg,#0B0E17)]">
              {peakLabel} took <span className="text-[color:var(--cobalt,#2F4FD8)]">{pct}%</span>
              {" of every dated signal on record"}
            </p>
            <div className="mt-3 h-[4.25rem]" data-fold-peak-bars-reserve="" aria-hidden="true" />
            <p className="mt-1.5 font-mono text-[10px] tabular-nums text-[color:var(--fg-3,#5C647A)]">
              {shell.dated.toLocaleString("en-US")} dated
              {shell.earlierValid > 0 ? ` · ${shell.earlierValid.toLocaleString("en-US")} earlier` : ""}
              {shell.undatedMonth > 0 ? ` · ${shell.undatedMonth.toLocaleString("en-US")} undated` : ""}
              {" · "}
              {shell.quiet.toLocaleString("en-US")} quiet
            </p>
          </div>
          <div className="min-w-0 self-stretch border-l border-[color:var(--cobalt,#2F4FD8)]/25 pl-5" data-fold-top-campuses-desk="" data-fold-top-campuses-ssr="">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[color:var(--cobalt,#2F4FD8)]">Desk rank</p>
            <div className="mt-3 h-[9.5rem]" data-fold-peak-campus-rank-reserve="" aria-hidden="true" />
          </div>
        </div>
      </div>
      <div className="min-h-[10.5rem] border-b border-[color:var(--line,#E1E5EF)] pb-2.5 lg:hidden" data-fold-peak-share-mobile="" data-fold-peak-share="">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-[color:var(--cobalt,#2F4FD8)]">Peak share</p>
        <p className="mt-0.5 font-mono text-[40px] font-bold leading-[0.84] tracking-[-0.07em] text-[color:var(--cobalt,#2F4FD8)]">
          {peakCount.toLocaleString("en-US")}
          <span className="mx-1.5 text-[18px] font-semibold tracking-[-0.04em] text-[color:var(--fg-3,#5C647A)]">/</span>
          <span className="text-[24px] font-bold tracking-[-0.05em] text-[color:var(--fg,#0B0E17)]">{shell.dated.toLocaleString("en-US")}</span>
        </p>
        <p className="mt-1 text-[14px] font-semibold leading-snug tracking-tight text-[color:var(--fg,#0B0E17)]">
          {peakLabel} took <span className="text-[color:var(--cobalt,#2F4FD8)]">{pct}%</span> of every dated signal
        </p>
        <div className="mt-1.5 h-[2.6rem]" data-fold-peak-bars-mobile-reserve="" aria-hidden="true" />
        <div className="mt-2 h-11 border-t border-[color:var(--line,#E1E5EF)] pt-2" data-fold-peak-campus-rank-mobile-reserve="" aria-hidden="true" />
      </div>
    </div>
  );
}

function PeakShareSlot({
  companies,
  foundersListed,
  campusesOnMap,
  topCampuses = [],
  shell,
}: {
  companies: FacetCompany[];
  foundersListed: number;
  campusesOnMap: number;
  topCampuses?: TopCampus[];
  shell?: PeakShell | null;
}) {
  const [live, setLive] = useState(false);
  // Keep SSR lite until the client Peak chunk has painted (same box → CLS ≈ 0).
  const showLive = live;
  return (
    <div className="relative mb-3 min-h-[9.75rem] lg:mb-4 lg:min-h-[11.5rem]" data-fold-peak-slot="" data-fold-peak-reserve="">
      <div className={showLive ? "hidden" : undefined} aria-hidden={showLive || undefined} data-fold-peak-ssr-wrap="">
        {shell ? (
          <PeakShareLite shell={shell} foundersListed={foundersListed} campusesOnMap={campusesOnMap} topCampuses={topCampuses} />
        ) : null}
      </div>
      <div className={showLive ? undefined : "absolute left-0 right-0 top-0 opacity-0 pointer-events-none"} data-fold-peak-live-wrap="" aria-hidden={!showLive || undefined}>
        <FoldPeakShare
          companies={companies}
          foundersListed={foundersListed}
          campusesOnMap={campusesOnMap}
          topCampuses={topCampuses}
          shell={shell}
          onReady={() => setLive(true)}
        />
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
    peakShell = null,
    directoryUrl = "/data/sample-directory.json",
    place = "map",
  facetExtras,
  } = props;

  const [companies, setCompanies] = useState<FacetCompany[]>([]);
  const [founders, setFounders] = useState<FounderLead[]>([]);
  const [founderStatus, setFounderStatus] = useState<"loading" | "ready" | "error">("loading");
  const [founderQuery, setFounderQuery] = useState("");
  const [ready, setReady] = useState(false);
  const search = useSearchParams();
  const router = useRouter();
  const mapCampusId = search.get("campus");
  const listed = feed === "directory" || feed === "leaderboard";
  const topCampuses = useMemo<TopCampus[]>(() => {
    return [...campuses]
      .filter((c) => (c.founders ?? 0) > 0)
      .sort((a, b) => b.founders - a.founders || a.name.localeCompare(b.name))
      .slice(0, 3)
      .map((c) => ({
        id: c.id,
        name: shortCampusLabel(c.id, c.name),
        founders: c.founders,
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
          const res = await fetch("/data/founders.json", { cache: "no-store" });
          if (!res.ok) throw new Error(String(res.status));
          const data = (await res.json()) as FounderLead[];
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

  const matchedFounders = useMemo(
    () =>
      founders.filter((founder) =>
        founderMatches(founder, { text: founderQuery, campusId: mapCampusId || null }),
      ),
    [founders, founderQuery, mapCampusId],
  );

  const viewStartups = useMemo(
    () =>
      startupsInFounderMatches(
        matchedFounders,
        companies.filter((c) => !mapCampusId || mapCampusId === "missing" || c.schoolId === mapCampusId),
      ),
    [matchedFounders, companies, mapCampusId],
  );

  const activeChips: ActiveChip[] = [];
  if (mapCampusName) {
    activeChips.push({ key: "campus", label: mapCampusName, onClear: clearCampus });
  }
  if (founderQuery.trim()) {
    activeChips.push({ key: "q", label: `“${founderQuery.trim()}”`, onClear: () => setFounderQuery("") });
  }

  return (
    <div className="sample-paper" {...(place === "map" ? { "data-fold-root": "" } : {})} data-directory-ready={ready ? "1" : "0"}>
      <SampleTheme />
      {place === "map" ? (
        <div className="px-4 pb-8 pt-3 sm:px-5" data-fold-hierarchy="">
          {/* Mobile (fold-375): Peak + campus ranking strip first, then search. Desk: search first. */}
          <div className="flex flex-col" data-fold-mast="">
            <div className="order-2 lg:order-1">
              <FounderSearchBar query={founderQuery} onQuery={setFounderQuery} />
            </div>
            <div className="order-1 lg:order-2">
              <PeakShareSlot
                companies={companies}
                foundersListed={foundersListed}
                campusesOnMap={stats.universities.filter((u) => u.lat != null && u.lon != null).length}
                topCampuses={topCampuses}
                shell={peakShell}
              />
            </div>
          </div>
          {/* Desk-only current-view strip (won fold-filters-1440). Hidden on mobile so Peak campus ranking strip stays. */}
          <div className="hidden lg:block">
            <FilterChips chips={activeChips} matchCount={matchedFounders.length} totalCount={founders.length || foundersListed} />
            <CurrentViewStrip
              campusName={mapCampusName}
              query={founderQuery}
              matchCount={matchedFounders.length}
              totalFounders={founders.length || foundersListed}
              startups={viewStartups}
              onClearCampus={clearCampus}
              onClearQuery={() => setFounderQuery("")}
            />
          </div>
          {/* Mobile: founders above map (keeps campus ranking strip from Peak). Desk: globe | founders + lineage. */}
          <div
            className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(320px,0.82fr)_minmax(0,1.18fr)] lg:items-start lg:gap-5"
            data-fold-stack=""
          >
            <div className="order-2 lg:order-1 min-w-0" data-fold-globe-col="">
              <GlobeHero
                stats={stats}
                showGlobe={feed !== "world"}
                companies={companies}
                companyCount={cardCount}
                foundersListed={foundersListed}
                foundersIndexed={founders.length || undefined}
                highlightCampusIds={highlightCampusIds}
              />
              <div className="mt-3 hidden lg:block" data-fold-lineage-desk="">
                <LineagePanels
                  companies={companies}
                  week={stats.week}
                  campusId={mapCampusId && mapCampusId !== "missing" ? mapCampusId : null}
                  campusName={mapCampusName}
                />
              </div>
            </div>
            <div className="order-1 lg:order-2 min-w-0 lg:sticky lg:top-3 lg:max-h-[calc(100dvh-1.5rem)] lg:overflow-y-auto lg:scroll-pt-1 lg:pb-6" data-fold-founders-col="">
              <FounderResults
                founders={founders}
                status={founderStatus}
                query={founderQuery}
                campusId={mapCampusId}
                campusName={mapCampusName}
                foundersListed={foundersListed}
                onClearCampus={clearCampus}
                onMissingCampus={() => {
                  const next = new URLSearchParams(search.toString());
                  next.set("sample", "1");
                  next.set("campus", "missing");
                  router.push(`/?${next.toString()}`);
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
      {place === "explore" ? (
      <section id="browse" className="scroll-mt-14 border-t border-line px-3 pb-10 pt-2 sm:px-5">
        <div className="mx-auto w-full max-w-[1280px]">
          <div
            className="flex flex-wrap items-center gap-x-1 border-b border-line"
            role="tablist"
            aria-label="Views"
          >
            <Tab href={browseHref({ feed: "directory", sector, kind, campus: campusId, q: query, sort: order })} active={feed === "directory"}>
              Companies
            </Tab>
            <Tab href={browseHref({ feed: "leaderboard", sector, kind, campus: campusId, q: query })} active={feed === "leaderboard"}>
              Signals
            </Tab>
            <Tab href="/" active={false}>
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
              status: (facetExtras?.status as any) ?? null,
              flag: (facetExtras?.flag as any) ?? null,
              foundedYear: typeof facetExtras?.foundedYear === "number" ? facetExtras.foundedYear : null,
              yearMissing: Boolean(facetExtras?.yearMissing),
              hqRegion: (facetExtras?.hqRegion as string) ?? null,
              country: (facetExtras?.country as string) ?? null,
              recency: (facetExtras?.recency as any) ?? null,
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
    <Link href={href} role="tab" aria-selected={active} className={`grid h-8 place-items-center border-b-2 px-2.5 font-mono text-[12px] font-medium uppercase tracking-[0.08em] ${active ? "border-[color:var(--cobalt,#2F4FD8)] text-[color:var(--fg,#0B0E17)]" : "border-transparent text-[color:var(--fg-3,#5C647A)] hover:text-[color:var(--fg-2,#3F465C)]"}`}>
      {children}
    </Link>
  );
}
