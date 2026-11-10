"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { HomeFold } from "@/components/home-fold";
import type { CampusLead } from "@/lib/domain/campus-record";
import type { EligibilityExamples } from "@/lib/domain/counted-hrefs";
import type { HomeProgram, HomeSector } from "@/lib/domain/home-panels";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SampleTheme } from "@/components/sample-theme";
import type { DirectoryCard, DirectoryFilter, DirectorySort } from "@/lib/domain/directory";
import type { HeroStats } from "@/lib/domain/hero-stats";
import type { FacetCompany } from "@/lib/domain/sample-facets";
import { fetchSampleDirectory } from "@/lib/domain/sample-directory-client";
import type { Feed } from "@/components/sample-home";
import type { PeakShell } from "@/lib/domain/peak-shell";
import { discoveryHref } from "@/lib/domain/discovery-navigation";
import { browseHref as buildBrowseHref, type FacetState as UrlFacetState } from "@/lib/domain/facet-url";

const SampleInstrumentBrowse = dynamic(
  () => import("@/components/sample-instrument-browse").then((mod) => ({ default: mod.SampleInstrumentBrowse })),
  { ssr: true },
);

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
  campusesWithFounders?: number;
  newestHome: { label: string; detail: string } | null;
  peakShell?: PeakShell | null;
  directoryUrl?: string;
  place?: "map" | "explore";
  facetExtras?: Record<string, string | number | boolean | null | undefined>;
  programs?: HomeProgram[];
  homeSectors?: HomeSector[];
  campusesOnMap?: number;
  examples?: EligibilityExamples | null;
  leads?: CampusLead[];
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
    campusesWithFounders = 0,
    directoryUrl = "/data/sample-directory.json",
    place = "map",
  facetExtras,
    programs = [],
    homeSectors = [],
    campusesOnMap = 0,
    examples = null,
    leads = [],
  } = props;

  const [companies, setCompanies] = useState<FacetCompany[]>([]);
  const [ready, setReady] = useState(false);
  const search = useSearchParams();
  const listed = feed === "directory" || feed === "leaderboard";

  useEffect(() => {
    let dead = false;
    void fetchSampleDirectory(directoryUrl).then((cards) => {
      if (dead) return;
      setCompanies(cards);
      setReady(true);
    }).catch(() => {
      if (!dead) setReady(true);
    });
    return () => {
      dead = true;
    };
  }, [directoryUrl]);


  return (
    <div className="sample-paper" data-directory-ready={ready ? "1" : "0"}>
      <SampleTheme />
      {place === "map" ? (
        <HomeFold
          stats={stats}
          programs={programs}
          leads={leads}
          companies={companies}
          companyCount={cardCount}
          foundersListed={foundersListed}
          foundersIndexed={foundersIndexed}
          campusesOnMap={campusesOnMap}
          campusesWithFounders={campusesWithFounders}
          sectors={homeSectors}
          examples={examples}
        />
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
