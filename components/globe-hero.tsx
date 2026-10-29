"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CampusGlobe, type GlobeCampus } from "@/components/campus-globe";
import type { HeroStats, WeekItem } from "@/lib/domain/hero-stats";
import type { UniversitySummary } from "@/lib/domain/queries";
import { updatedAgo } from "@/lib/domain/relative-time";

function plottedCampuses(stats: HeroStats): GlobeCampus[] {
  return stats.universities
    .filter((university) => university.lat != null && university.lon != null)
    .map((university) => ({
      id: university.id,
      name: university.name,
      lat: university.lat as number,
      lon: university.lon as number,
      founders: university.founderCount,
      signals: university.signalCount,
    }));
}

function countryCoverage(universities: UniversitySummary[]): string {
  const plotted = universities.filter((university) => university.lat != null && university.lon != null);
  const counts = new Map<string, number>();
  for (const university of plotted) {
    const country = university.country?.trim();
    if (!country) continue;
    counts.set(country, (counts.get(country) ?? 0) + 1);
  }
  const names = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name);
  const campusWord = plotted.length === 1 ? "campus" : "campuses";
  const countryWord = names.length === 1 ? "country" : "countries";
  const listed = names.length <= 1 ? (names[0] ?? "") : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
  const count = `${plotted.length.toLocaleString("en-US")} ${campusWord} in ${names.length.toLocaleString("en-US")} ${countryWord}`;
  const base = listed ? `${count}: ${listed}.` : `${count}.`;
  const unplotted = universities.length - plotted.length;
  if (unplotted <= 0) return base;
  const stored = unplotted === 1 ? "1 campus is stored without coordinates." : `${unplotted.toLocaleString("en-US")} campuses are stored without coordinates.`;
  return `${base} ${stored}`;
}

function GlobeBlock({ stats, height, bare = false }: { stats: HeroStats; height: number; bare?: boolean }) {
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

  const globe = (
    <div className="flex justify-center">
      <CampusGlobe campuses={campuses} height={height} selectedId={selectedId} onSelect={onSelect} />
    </div>
  );
  if (bare) return globe;
  return (
    <div className="mt-5">
      <p className="text-center text-[16px] leading-6">
        <span className="num">{stats.founders.toLocaleString("en-US")}</span> student founders across{" "}
        <span className="num">{stats.campuses.toLocaleString("en-US")}</span> campuses
      </p>
      <div className="mt-3">{globe}</div>
      <p className="mx-auto mt-3 max-w-[40rem] text-center text-[13px] leading-5 text-fg-2">
        {countryCoverage(stats.universities)} Point size follows how many signals are on record.
      </p>
    </div>
  );
}

export function GlobeHero({ stats, showGlobe = true }: { stats: HeroStats; showGlobe?: boolean }) {
  return (
    <div className="bg-bg px-6 py-6 text-fg">
      <div className={showGlobe ? "max-lg:min-h-[calc(100svh-72px)] lg:min-h-[calc(100dvh-72px)]" : ""}>
        <SignatureBand stats={stats} globe={showGlobe ? <GlobeBlock stats={stats} height={580} bare /> : null} />
      </div>
      {showGlobe ? (
        <div className="mx-auto mt-10 w-full max-w-[880px]">
          <Collage stats={stats} />
          <p className="mt-4 max-w-[40rem] text-[13px] leading-5 text-fg-2">
            {countryCoverage(stats.universities)} Point size follows how many signals are on record.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function WorldMap({ stats }: { stats: HeroStats }) {
  return <GlobeBlock stats={stats} height={640} />;
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

function SamplePill() {
  return (
    <span className="inline-flex h-6 items-center gap-0.5 rounded-full border border-line bg-sunken pl-2 pr-0.5 text-[12px] leading-none text-fg-3">
      Sample data
      <Link href="/" aria-label="Close" className="grid h-4 w-4 place-items-center rounded-full text-fg-3 hover:bg-raised hover:text-fg">
        <svg width="8" height="8" viewBox="0 0 10 10" aria-hidden>
          <path d="M2 2 8 8M8 2 2 8" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
        </svg>
      </Link>
    </span>
  );
}

function HeroActions() {
  const search = useSearchParams();
  const directory = new URLSearchParams(search.toString());
  directory.set("sample", "1");
  directory.delete("feed");
  const world = new URLSearchParams(directory.toString());
  world.set("feed", "world");
  return (
    <div className="mt-5 flex flex-wrap items-center gap-2">
      <Link href={`/?${world.toString()}#browse`} className="inline-flex h-10 items-center rounded bg-ember px-4 text-[14px] font-semibold text-accent-foreground">
        Explore map
      </Link>
      <Link href={`/?${directory.toString()}#browse`} className="inline-flex h-10 items-center rounded border border-line px-4 text-[14px] font-medium text-fg">
        Browse directory
      </Link>
    </div>
  );
}

function SignatureBand({ stats, globe }: { stats: HeroStats; globe?: ReactNode }) {
  return (
    <section className="-mx-6 px-6 pb-2" aria-label="Campus Scout">
      <div className={globe ? "flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(480px,580px)] lg:items-center lg:gap-8" : "max-w-[640px]"}>
        <div className="order-1 max-w-[640px]">
          <div className="mb-3">
            <SamplePill />
          </div>
          <p className="display text-[40px] font-semibold leading-[44px] sm:text-[48px] sm:leading-[52px]">
            Track student founders before they raise
          </p>
          {globe ? (
            <p className="mt-3 text-[16px] leading-6 text-fg-2">
              <span className="num text-fg">{stats.founders.toLocaleString("en-US")}</span> student founders across{" "}
              <span className="num text-fg">{stats.campuses.toLocaleString("en-US")}</span> campuses
            </p>
          ) : (
            <p className="mt-3 max-w-[34rem] text-[16px] leading-6 text-fg-2">
              The campus map, the people on it, and recent signals.
            </p>
          )}
          <HeroActions />
        </div>
        {globe ? <div className="order-2 lg:col-start-2 lg:row-start-1">{globe}</div> : null}
      </div>
    </section>
  );
}
