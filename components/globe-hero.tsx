"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { TileGlobe, type TileCampus, type TileCompany } from "@/components/tile-globe";
import type { HeroStats, WeekItem } from "@/lib/domain/hero-stats";
import { updatedAgo } from "@/lib/domain/relative-time";

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
    }));
}

function GlobeBlock({ stats, companies }: { stats: HeroStats; companies: TileCompany[] }) {
  const router = useRouter();
  const search = useSearchParams();
  const campuses = plottedCampuses(stats);
  const requested = search.get("campus");
  const selectedId = campuses.some((campus) => campus.id === requested) ? requested : null;

  function onSelect(id: string) {
    const next = new URLSearchParams(search.toString());
    next.set("sample", "1");
    next.delete("feed");
    next.delete("university");
    if (requested === id) next.delete("campus");
    else next.set("campus", id);
    router.push(`/?${next.toString()}#browse`);
  }

  return <TileGlobe campuses={campuses} companies={companies} selectedId={selectedId} onSelect={onSelect} />;
}

export function GlobeHero({ stats, companies = [], showGlobe = true }: { stats: HeroStats; companies?: TileCompany[]; showGlobe?: boolean }) {
  return (
    <div className={showGlobe ? "bg-[#0B0E17] px-4 py-1.5 text-[color:var(--fg,#ECEEF4)] sm:px-5 lg:py-1" : "bg-bg px-6 py-6 text-fg"}>
      <div className={showGlobe ? "max-lg:min-h-[calc(100svh-48px)] lg:min-h-[calc(100dvh-48px)]" : ""}>
        <SignatureBand
          stats={stats}
          companies={companies}
          globe={showGlobe ? <GlobeBlock stats={stats} companies={companies} /> : null}
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

export function WorldMap({ stats, companies = [] }: { stats: HeroStats; companies?: TileCompany[] }) {
  return <GlobeBlock stats={stats} companies={companies} />;
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
        <span className="h-2 w-2 shrink-0 rounded-full bg-[#e6dfd4]" />
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

function SamplePill({ cream = false }: { cream?: boolean }) {
  return (
    <span className={`inline-flex h-6 items-center gap-0.5 rounded-full border pl-2 pr-0.5 text-[12px] leading-none ${cream ? "border-[color:var(--line,#1F2536)] bg-[color:var(--bg-raised,#121726)]/80 text-[color:var(--fg-3,#6B7390)]" : "border-line bg-sunken text-fg-3"}`}>
      Sample data
      <Link href="/" aria-label="Close" className={`grid h-4 w-4 place-items-center rounded-full ${cream ? "text-[color:var(--fg-3,#6B7390)] hover:bg-[color:var(--bg-sunken,#080A11)]" : "text-fg-3 hover:bg-raised hover:text-fg"}`}>
        <svg width="8" height="8" viewBox="0 0 10 10" aria-hidden>
          <path d="M2 2 8 8M8 2 2 8" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
        </svg>
      </Link>
    </span>
  );
}

function HeroActions({ cream = false, compact = false }: { cream?: boolean; compact?: boolean }) {
  const search = useSearchParams();
  const directory = new URLSearchParams(search.toString());
  directory.set("sample", "1");
  directory.delete("feed");
  const world = new URLSearchParams(directory.toString());
  world.set("feed", "world");
  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <Link href={`/?${world.toString()}#browse`} className="inline-flex h-6 items-center rounded bg-[color:var(--ember,#E8823A)] px-2 text-[11px] font-semibold text-white sm:h-7 sm:px-2.5 sm:text-[12px]">
          Explore map
        </Link>
        <Link href={`/?${directory.toString()}#browse`} className="inline-flex h-6 items-center rounded border border-[color:var(--line,#1F2536)] bg-[color:var(--bg-raised,#121726)] px-2 text-[11px] font-medium text-[color:var(--fg,#ECEEF4)] sm:h-7 sm:px-2.5 sm:text-[12px]">
          Browse directory
        </Link>
      </div>
    );
  }
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2 lg:mt-1">
      <Link href={`/?${world.toString()}#browse`} className={`inline-flex h-10 items-center rounded px-4 text-[14px] font-semibold ${cream ? "bg-[color:var(--ember,#E8823A)] text-white" : "bg-ember text-accent-foreground"}`}>
        Explore map
      </Link>
      <Link href={`/?${directory.toString()}#browse`} className={`inline-flex h-10 items-center rounded border px-4 text-[14px] font-medium ${cream ? "border-[#e7cbb6] bg-white text-[#20140c]" : "border-line text-fg"}`}>
        Browse directory
      </Link>
    </div>
  );
}

function SignatureBand({ stats, companies = [], globe }: { stats: HeroStats; companies?: TileCompany[]; globe?: ReactNode }) {
  // Same source of truth as the fold instrument: founders listed on directory
  // companies + campuses with coordinates on the map (not the full scout roster).
  const campusesOnMap = plottedCampuses(stats).length;
  const foundersListed = companies.reduce((sum, company) => sum + (company.founders?.length ?? 0), 0);
  if (globe) {
    return (
      <section className="-mx-4 px-0 pb-1 sm:-mx-5" aria-label="Campus Scout">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <SamplePill />
          <p className="text-[12px] leading-4 text-[color:var(--fg-2,#A3AAC0)] sm:text-[13px]" data-sample-strip-counts>
            <span className="font-bold tabular-nums text-[color:var(--ember,#E8823A)]" data-count="founders-listed">{foundersListed.toLocaleString("en-US")}</span>
            {" founders listed · "}
            <span className="font-bold tabular-nums text-[color:var(--ember,#E8823A)]" data-count="campuses-on-map">{campusesOnMap.toLocaleString("en-US")}</span>
            {" campuses on map"}
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
          <SamplePill />
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
