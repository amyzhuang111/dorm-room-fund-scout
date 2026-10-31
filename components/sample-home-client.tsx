"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { GlobeHero } from "@/components/globe-hero";
import { SampleTheme } from "@/components/sample-theme";
import type { DirectoryCard, DirectoryFilter, DirectorySort } from "@/lib/domain/directory";
import type { HeroStats } from "@/lib/domain/hero-stats";
import type { FacetCompany } from "@/lib/domain/sample-facets";
import type { Feed } from "@/components/sample-home";

const SampleInstrumentBrowse = dynamic(
  () => import("@/components/sample-instrument-browse").then((mod) => ({ default: mod.SampleInstrumentBrowse })),
  { ssr: true },
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
    directoryUrl = "/data/sample-directory.json",
    place = "map",
  } = props;

  const [companies, setCompanies] = useState<FacetCompany[]>([]);
  const [ready, setReady] = useState(false);
  const listed = feed === "directory" || feed === "leaderboard";

  useEffect(() => {
    let dead = false;
    void fetchDirectory(directoryUrl).then((cards) => {
      if (dead) return;
      setCompanies(cards);
      setReady(true);
    });
    return () => {
      dead = true;
    };
  }, [directoryUrl]);

  return (
    <div className="sample-paper" data-directory-ready={ready ? "1" : "0"}>
      <SampleTheme />
      {place === "map" ? (
        <GlobeHero stats={stats} showGlobe={feed !== "world"} companies={companies} companyCount={cardCount} foundersListed={foundersListed} />
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
