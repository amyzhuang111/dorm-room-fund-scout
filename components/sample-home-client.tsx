"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FounderResults, FounderSearchBar } from "@/components/founder-sourcing";
import { GlobeHero } from "@/components/globe-hero";
import { SampleTheme } from "@/components/sample-theme";
import type { DirectoryCard, DirectoryFilter, DirectorySort } from "@/lib/domain/directory";
import type { HeroStats } from "@/lib/domain/hero-stats";
import type { FounderLead } from "@/lib/domain/founder-index";
import type { FacetCompany } from "@/lib/domain/sample-facets";
import type { Feed } from "@/components/sample-home";
import type { PeakShell } from "@/lib/domain/peak-shell";
import { shortCampusLabel } from "@/lib/domain/campuses";

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

let sharedDirectory: Promise<FacetCompany[]> | null = null;

function fetchDirectory(url: string): Promise<FacetCompany[]> {
  if (!sharedDirectory) {
    sharedDirectory = fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`directory ${res.status}`);
        const data = (await res.json()) as { cards?: FacetCompany[] };
        return Array.isArray(data.cards) ? data.cards : [];
      })
      .catch((err) => {
        sharedDirectory = null;
        throw err;
      });
  }
  return sharedDirectory;
}

function browseHref(opts: {
  feed?: Feed;
  sector?: string;
  kind?: string;
  campus?: string;
  q?: string;
  sort?: DirectorySort;
  more?: number;
}): string {
  const query = new URLSearchParams();
  query.set("sample", "1");
  if (opts.feed && opts.feed !== "directory") query.set("feed", opts.feed);
  if (opts.sector) query.set("sector", opts.sector);
  if (opts.kind) query.set("kind", opts.kind);
  if (opts.campus) query.set("campus", opts.campus);
  const q = opts.q?.trim();
  if (q) query.set("q", q);
  if (opts.sort && opts.sort !== "rank") query.set("sort", opts.sort);
  if (opts.more && opts.more > 1) query.set("more", String(opts.more));
  return `/companies?${query.toString()}`;
}


function PeakShareLite({
  shell,
  foundersListed,
  campusesOnMap,
  topCampuses = [],
}: {
  shell: PeakShell;
  foundersListed: number;
  campusesOnMap: number;
  topCampuses?: TopCampus[];
}) {
  const peakCount = shell.peakCount;
  const peakLabel = shell.peakLabel;
  const pct = Math.round((peakCount / Math.max(1, shell.dated)) * 100);
  return (
    <div data-fold-peak-ssr-shell="" data-fold-peak-identity="" data-fold-baseline="8">
      <div className="mb-1 hidden min-h-[14rem] lg:block" data-fold-peak-desk="">
        <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] items-end gap-5 border-b border-[color:var(--line,#E1E5EF)] pb-3" data-fold-peak-share="">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-[color:var(--cobalt,#2F4FD8)]">Peak share</p>
            <p className="mt-1 font-mono text-[72px] font-bold leading-[0.82] tracking-[-0.08em] text-[color:var(--ember,#D96B1C)]">
              {peakCount.toLocaleString("en-US")}
              <span className="mx-2 text-[26px] font-semibold tracking-[-0.04em] text-[color:var(--fg-3,#5C647A)]">/</span>
              <span className="text-[40px] font-bold tracking-[-0.06em] text-[color:var(--fg,#0B0E17)]">{shell.dated.toLocaleString("en-US")}</span>
            </p>
            <p className="mt-2 max-w-[34rem] text-[16px] font-semibold leading-snug tracking-tight text-[color:var(--fg,#0B0E17)]">
              {peakLabel} took <span className="text-[color:var(--ember,#D96B1C)]">{pct}%</span>
              {" of every dated signal on record"}
            </p>
            {/* Height twin for month bars · marks paint on live hydrate */}
            <div className="mt-3 h-10" data-fold-peak-bars-reserve="" aria-hidden="true" />
            <p className="mt-1.5 font-mono text-[10px] tabular-nums text-[color:var(--fg-3,#5C647A)]">
              {shell.dated.toLocaleString("en-US")} dated
              {shell.earlierValid > 0 ? ` · ${shell.earlierValid.toLocaleString("en-US")} earlier` : ""}
              {shell.undatedMonth > 0 ? ` · ${shell.undatedMonth.toLocaleString("en-US")} undated` : ""}
              {" · "}
              {shell.quiet.toLocaleString("en-US")} quiet
            </p>
          </div>
          <div className="min-w-0 self-stretch border-l border-[color:var(--line,#E1E5EF)] pl-4" data-fold-top-campuses-desk="" data-fold-top-campuses-ssr="">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[color:var(--cobalt,#2F4FD8)]">Top campuses</p>
            <p className="mt-1 font-mono text-[10px] tabular-nums text-[color:var(--fg-3,#5C647A)]">
              <span className="font-bold text-[color:var(--fg,#0B0E17)]">{foundersListed.toLocaleString("en-US")}</span>
              {" names · "}
              <span className="font-bold text-[color:var(--fg,#0B0E17)]">{campusesOnMap.toLocaleString("en-US")}</span>
              {" on map"}
            </p>
            {/* Height twin for live campus ranks · avoids SSR name payload */}
            <div className="mt-3 h-[5.25rem]" data-fold-peak-campus-rank-reserve="" aria-hidden="true" />
          </div>
        </div>
      </div>
      <div className="min-h-[9.5rem] border-b border-[color:var(--line,#E1E5EF)] pb-3 lg:hidden" data-fold-peak-share-mobile="" data-fold-peak-share="">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-[color:var(--cobalt,#2F4FD8)]">Peak share</p>
        <p className="mt-1 font-mono text-[40px] font-bold leading-[0.84] tracking-[-0.07em] text-[color:var(--ember,#D96B1C)]">
          {peakCount.toLocaleString("en-US")}
          <span className="mx-1.5 text-[18px] font-semibold tracking-[-0.04em] text-[color:var(--fg-3,#5C647A)]">/</span>
          <span className="text-[24px] font-bold tracking-[-0.05em] text-[color:var(--fg,#0B0E17)]">{shell.dated.toLocaleString("en-US")}</span>
        </p>
        <p className="mt-1.5 text-[14px] font-semibold leading-snug tracking-tight text-[color:var(--fg,#0B0E17)]">
          {peakLabel} took <span className="text-[color:var(--ember,#D96B1C)]">{pct}%</span> of every dated signal
        </p>
        <div className="mt-2.5 h-9 border-t border-[color:var(--line,#E1E5EF)] pt-2.5" data-fold-peak-campus-rank-mobile-reserve="" aria-hidden="true" />
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
    <div className="relative mb-3 min-h-[9.5rem] lg:mb-4 lg:min-h-[14rem]" data-fold-peak-slot="" data-fold-peak-reserve="">
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
    void fetchDirectory(directoryUrl).then((cards) => {
      if (dead) return;
      setCompanies(cards);
      setReady(true);
    });
    void fetch("/data/founders.json")
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as FounderLead[];
        return Array.isArray(data) ? data : [];
      })
      .then((rows) => {
        if (dead) return;
        setFounders(rows);
        setFounderStatus("ready");
      })
      .catch(() => {
        if (!dead) setFounderStatus("error");
      });
    return () => {
      dead = true;
    };
  }, [directoryUrl]);

  return (
    <div className="sample-paper" data-directory-ready={ready ? "1" : "0"}>
      <SampleTheme />
      {place === "map" ? (
        <div className="px-4 pb-8 pt-3 sm:px-5" data-fold-hierarchy="">
          {/* Mobile: Peak leads. Desk: search first, then Peak. */}
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
          {/* Mobile: founders above map. Desk: founders beside a short globe so cards clear the fold at 1440. */}
          <div
            className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(320px,0.82fr)_minmax(0,1.18fr)] lg:items-start lg:gap-5"
            data-fold-stack=""
          >
            <div className="order-2 lg:order-2 min-w-0" data-fold-globe-col="">
              <GlobeHero
                stats={stats}
                showGlobe={feed !== "world"}
                companies={companies}
                companyCount={cardCount}
                foundersListed={foundersListed}
                foundersIndexed={founders.length || undefined}
              />
            </div>
            <div className="order-1 lg:order-1 min-w-0 lg:sticky lg:top-3 lg:max-h-[calc(100dvh-1.5rem)] lg:overflow-y-auto" data-fold-founders-col="">
              <FounderResults
                founders={founders}
                status={founderStatus}
                query={founderQuery}
                campusId={mapCampusId}
                campusName={mapCampusId && mapCampusId !== "missing" ? campuses.find((campus) => campus.id === mapCampusId)?.name ?? null : null}
                onClearCampus={() => {
                  const next = new URLSearchParams(search.toString());
                  next.delete("campus");
                  next.set("sample", "1");
                  router.push(`/?${next.toString()}`);
                }}
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
          <div className="flex flex-wrap items-center gap-x-1 border-b border-line" role="tablist" aria-label="Views">
            <Tab href={browseHref({ feed: "directory", sector, kind, campus: campusId, q: query, sort: order })} active={feed === "directory"}>
              Companies
            </Tab>
            <Tab href={browseHref({ feed: "leaderboard", sector, kind, campus: campusId, q: query })} active={feed === "leaderboard"}>
              Signals
            </Tab>
            <Tab href="/?sample=1" active={false}>
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
            clearCampusHref={browseHref({ feed, sector, kind, q: query, sort: feed === "directory" ? order : undefined })}
          />
        ) : null}
      </section>
      ) : null}
    </div>
  );
}

function Tab({ href, active, children }: { href: string; active: boolean; children: string }) {
  return (
    <Link href={href} role="tab" aria-selected={active} className={`grid h-8 place-items-center border-b-2 px-2.5 font-mono text-[12px] font-medium uppercase tracking-[0.08em] ${active ? "border-[color:var(--ember,#D96B1C)] text-[color:var(--fg,#0B0E17)]" : "border-transparent text-[color:var(--fg-3,#5C647A)] hover:text-[color:var(--fg-2,#3F465C)]"}`}>
      {children}
    </Link>
  );
}
