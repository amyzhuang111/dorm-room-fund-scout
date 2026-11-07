"use client";

import type { ReactNode } from "react";
import { createContext, useContext } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { GlobeFoldSkeleton } from "@/components/globe-fold-skeleton";
import type { TileCampus, TileCompany } from "@/components/tile-globe";
import type { HeroStats, WeekItem } from "@/lib/domain/hero-stats";
import { updatedAgo } from "@/lib/domain/relative-time";

const FoldSkeletonContext = createContext<React.ComponentProps<typeof GlobeFoldSkeleton>>({});

const TileGlobe = dynamic(() => import("./tile-globe").then((mod) => mod.TileGlobe), {
  ssr: false,
  loading: () => <GlobeFoldSkeletonFromContext />,
});

function GlobeFoldSkeletonFromContext() {
  return <GlobeFoldSkeleton {...useContext(FoldSkeletonContext)} />;
}

function plottedCampuses(stats: HeroStats): TileCampus[] {
  return stats.universities
    .filter((university) => university.lat != null && university.lon != null)
    .map((university) => ({
      id: university.id,
      name: university.name,
      lat: university.lat as number,
      lon: university.lon as number,
      founders: university.founderCount,
      signals: university.signalCount,
      country: university.country?.trim() || "Unknown",
      pitchbookRank: (university as { pitchbookRank?: number | null }).pitchbookRank ?? null,
      pitchbookFounders: (university as { pitchbookFounders?: number | null }).pitchbookFounders ?? null,
    }));
}

function GlobeBlock({
  stats,
  companies,
  companyCount,
  foundersListed,
  foundersIndexed = 0,
  highlightCampusIds = null,
}: {
  stats: HeroStats;
  companies: TileCompany[];
  companyCount: number;
  foundersListed: number;
  foundersIndexed?: number;
  highlightCampusIds?: Set<string> | null;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const campuses = plottedCampuses(stats);
  const campusesWithFounders = stats.universities.filter((university) => university.founderCount > 0).length;
  const requested = search.get("campus");
  const selectedId = campuses.some((campus) => campus.id === requested) ? requested : null;
  const top = [...campuses].sort((a, b) => b.founders - a.founders || a.name.localeCompare(b.name))[0];

  function onSelect(id: string) {
    const next = new URLSearchParams(search.toString());
    next.delete("feed");
    next.delete("university");
    if (!id) next.delete("campus");
    else next.set("campus", id);
    router.push(`/?${next.toString()}`);
  }

  const skeleton = {
    companyCount,
    foundersListed,
    campusesOnMap: campuses.length,
    campusesWithFounders,
    dataThrough: stats.updatedAt,
    topName: top?.name ?? "",
    topFounders: top?.founders ?? 0,
    topSignals: top?.signals ?? 0,
  };

  return (
    <FoldSkeletonContext.Provider value={skeleton}>
      <TileGlobe
        campuses={campuses}
        companies={companies}
        companyCount={companyCount}
        foundersListed={foundersListed}
        foundersIndexed={foundersIndexed}
        campusesWithFounders={campusesWithFounders}
        selectedId={selectedId}
        onSelect={onSelect}
        dataThrough={stats.updatedAt}
        highlightCampusIds={highlightCampusIds}
      />
    </FoldSkeletonContext.Provider>
  );
}

export function GlobeHero({
  stats,
  companies = [],
  companyCount = 0,
  foundersListed = 0,
  foundersIndexed = 0,
  showGlobe = true,
  highlightCampusIds = null,
}: {
  stats: HeroStats;
  companies?: TileCompany[];
  companyCount?: number;
  foundersListed?: number;
  foundersIndexed?: number;
  showGlobe?: boolean;
  highlightCampusIds?: Set<string> | null;
}) {
  return (
    <div className={showGlobe ? "bg-[color:var(--bg,#FFFFFF)] text-[color:var(--fg,#0B0E17)]" : "bg-bg px-6 py-6 text-fg"}>
      <div>
        <SignatureBand
          stats={stats}
          foundersListed={foundersListed}
          foundersIndexed={foundersIndexed}
          globe={showGlobe ? <GlobeBlock stats={stats} companies={companies} companyCount={companyCount} foundersListed={foundersListed} foundersIndexed={foundersIndexed} highlightCampusIds={highlightCampusIds} /> : null}
        />
      </div>
      {/* Collage teasers compete with Directory tabs on mobile browse; instrument rails carry signals instead. */}
      {!showGlobe ? (
        <div className="mx-auto mt-8 w-full max-w-[880px]">
          <Collage stats={stats} />
        </div>
      ) : null}
    </div>
  );
}

export function WorldMap({
  stats,
  companies = [],
  companyCount = 0,
  foundersListed = 0,
}: {
  stats: HeroStats;
  companies?: TileCompany[];
  companyCount?: number;
  foundersListed?: number;
}) {
  return <GlobeBlock stats={stats} companies={companies} companyCount={companyCount} foundersListed={foundersListed} />;
}

const HIGH_VALUE = new Set(["funding", "launch", "award", "acquisition"]);

function chipText(item: WeekItem): string {
  if (item.tag) return item.tag;
  const category = item.category.trim().toLowerCase();
  if (!category || category === "other" || category === "news") return "";
  return category.charAt(0).toUpperCase() + category.slice(1);
}

function isHighValue(item: WeekItem): boolean {
  if (item.tag === "YC" || item.tag === "Funding") return true;
  return HIGH_VALUE.has(item.category.trim().toLowerCase());
}

function chipClass(item: WeekItem, high: boolean): string {
  const label = (item.tag || item.category || "").trim().toLowerCase();
  if (label === "funding") return "sig-chip sig-funding";
  if (label === "launch") return "sig-chip sig-launch";
  if (label === "award") return "sig-chip sig-award";
  if (label === "acquisition") return "sig-chip sig-acquisition";
  if (label === "yc" || label === "press") return "sig-chip sig-press";
  if (high) return "sig-chip sig-launch";
  return "border border-line text-fg-2";
}

function firstSentence(text: string): string {
  const match = text.match(/^.{24,}?[.!?](?:\s|$)/);
  const sentence = (match ? match[0] : text).trim();
  if (sentence.length <= 180) return sentence;
  const cut = sentence.slice(0, 180);
  const space = cut.lastIndexOf(" ");
  return space > 60 ? cut.slice(0, space) : cut;
}

function collageSignal(week: WeekItem[]): WeekItem | null {
  const titled = (item: WeekItem) => Boolean(item.event.trim() || item.detail?.trim());
  return week.find((item) => item.thisWeek && titled(item)) ?? week.find(titled) ?? null;
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  const first = (parts[0] ?? "").replace(/[^A-Za-z]/g, "");
  const last = parts.length > 1 ? parts[parts.length - 1].replace(/[^A-Za-z]/g, "") : "";
  return ((first[0] ?? "") + (last[0] ?? first[1] ?? "")).toUpperCase();
}

function mixChipClass(type: string): string {
  if (type === "funding") return "sig-chip sig-funding";
  if (type === "launch" || type === "demo") return "sig-chip sig-launch";
  if (type === "award") return "sig-chip sig-award";
  if (type === "acquisition") return "sig-chip sig-acquisition";
  return "rounded-full border border-line text-fg-2";
}

function SignalMix({ counts }: { counts: HeroStats["signalTypes"] }) {
  if (counts.length === 0) return null;
  return (
    <div className="rounded-lg border border-line bg-raised px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.28)]">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[14px] font-medium">Signals</span>
        <Link href="/signals" className="text-[13px] text-fg hover:underline">View all</Link>
      </div>
      <ul className="mt-1">
        {counts.map((row) => (
          <li key={row.type} className="flex items-center justify-between gap-2 border-t border-line py-1">
            <span className={`min-w-0 truncate rounded-full px-1.5 py-px text-[13px] leading-5 ${mixChipClass(row.type)}`}>{row.label}</span>
            <span className="num shrink-0 text-[14px]">{row.count.toLocaleString("en-US")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FounderFragment({ founder }: { founder: NonNullable<HeroStats["collageFounder"]> }) {
  const mark = initials(founder.name);
  return (
    <Link href="/founders" className="flex items-center gap-2.5 rounded-lg border border-line bg-raised px-3 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.28)]">
      {mark ? <span className="inline-grid h-8 w-8 shrink-0 place-items-center rounded-full bg-bg text-[13px] font-medium">{mark}</span> : null}
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-medium leading-5">{founder.name}</span>
        <span className="block truncate text-[13px] leading-5 text-fg-2">{founder.campus} · {founder.company}</span>
      </span>
    </Link>
  );
}

function SignalFragment({ item }: { item: WeekItem }) {
  const title = item.event || (item.detail ? firstSentence(item.detail) : "");
  const chip = chipText(item);
  const heading = item.url ? (
    <a href={item.url} className="clamp-2 text-[14px] font-medium leading-5 hover:underline" target="_blank" rel="noreferrer">{title}</a>
  ) : (
    <Link href="/signals" className="clamp-2 text-[14px] font-medium leading-5 hover:underline">{title}</Link>
  );
  const campus = item.campusSlug ? (
    <Link href={`/campuses/${item.campusSlug}`} className="truncate text-fg-2 hover:text-fg">{item.campus}</Link>
  ) : (
    <span className="truncate text-fg-2">{item.campus}</span>
  );
  return (
    <div className="rounded-lg border border-line bg-raised px-3 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.28)]">
      <div className="flex min-w-0 items-center gap-2 text-[14px]">
        <span className="h-2 w-2 shrink-0 rounded-full bg-[color:var(--ember,#D96B1C)]" />
        {campus}
        {chip ? <span className={`shrink-0 rounded-full px-1.5 py-px text-[13px] leading-5 ${chipClass(item, isHighValue(item))}`}>{chip}</span> : null}
        <span className="num ml-auto shrink-0 text-fg-2" title={item.at ?? undefined}>{updatedAgo(item.at)}</span>
      </div>
      <p className="mt-1 min-w-0">{heading}</p>
    </div>
  );
}

function Collage({ stats }: { stats: HeroStats }) {
  const signal = collageSignal(stats.week);
  const founder = stats.collageFounder;
  const signalTypes = stats.signalTypes;
  if (!signal && !founder && signalTypes.length === 0) return null;
  return (
    <div className="grid w-full grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
      {signalTypes.length > 0 ? <SignalMix counts={signalTypes} /> : null}
      <div className="flex flex-col gap-3">
        {founder ? <FounderFragment founder={founder} /> : null}
        {signal ? <SignalFragment item={signal} /> : null}
      </div>
    </div>
  );
}


function HeroActions({ cream = false, compact = false }: { cream?: boolean; compact?: boolean }) {
  const search = useSearchParams();
  const directory = new URLSearchParams(search.toString());
  directory.delete("feed");
  const world = new URLSearchParams(directory.toString());
  world.set("feed", "world");
  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <Link href={`/?${world.toString()}`} className="inline-flex h-6 items-center rounded bg-[color:var(--ember,#D96B1C)] px-2 text-[11px] font-semibold text-white sm:h-7 sm:px-2.5 sm:text-[12px]">
          Map
        </Link>
        <Link href="/companies" className="inline-flex h-6 items-center rounded border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg-raised,#FFFFFF)] px-2 text-[11px] font-medium text-[color:var(--fg,#0B0E17)] sm:h-7 sm:px-2.5 sm:text-[12px]">
          Companies
        </Link>
      </div>
    );
  }
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2 lg:mt-1">
      <Link href={`/?${world.toString()}`} className={`inline-flex h-10 items-center rounded px-4 text-[14px] font-semibold ${cream ? "bg-[color:var(--ember,#D96B1C)] text-white" : "bg-ember text-accent-foreground"}`}>
        Map
      </Link>
      <Link href="/companies" className={`inline-flex h-10 items-center rounded border px-4 text-[14px] font-medium ${cream ? "border-[#e7cbb6] bg-white text-[#20140c]" : "border-line text-fg"}`}>
        Companies
      </Link>
    </div>
  );
}

function SignatureBand({ stats, foundersListed = 0, foundersIndexed = 0, globe }: { stats: HeroStats; foundersListed?: number; foundersIndexed?: number; globe?: ReactNode }) {
  const campusesOnMap = plottedCampuses(stats).length;
  if (globe) {
    return (
      <section className="pb-0" aria-label="Campus Scout">
        <div className="flex flex-wrap items-center gap-2">
          <p className="sr-only" data-sample-strip-counts>
            <span data-count="founders-listed">{foundersListed.toLocaleString("en-US")}</span>
            {foundersIndexed > 0 ? <span data-count="founders-indexed">{foundersIndexed.toLocaleString("en-US")}</span> : null}
            <span data-count="campuses-on-map">{campusesOnMap.toLocaleString("en-US")}</span>
          </p>
        </div>
        <div className="min-h-0">{globe}</div>
      </section>
    );
  }
  return (
    <section className="-mx-6 px-6 pb-2" aria-label="Campus Scout">
      <div className="max-w-[640px]">
        <div className="mb-1.5">
        </div>
        <p className="display text-[32px] font-semibold leading-[36px] sm:text-[36px] sm:leading-[40px]">
          Track student founders before they raise
        </p>
        <p className="mt-3 max-w-[34rem] text-[16px] leading-6 text-fg-2">
          The campus map, the people on it, and recent signals.
        </p>
        <HeroActions />
      </div>
    </section>
  );
}
