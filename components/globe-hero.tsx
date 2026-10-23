"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { shortCampusLabel } from "@/lib/domain/campuses";
import type { HeroStats, WeekItem } from "@/lib/domain/hero-stats";
import type { UniversitySummary } from "@/lib/domain/queries";
import { SIGNALS_THIS_WEEK_LABEL } from "@/lib/domain/signal-copy";
import { absoluteDate, updatedAgo, updatedToday } from "@/lib/domain/relative-time";
import usStates from "@/public/us-states.json";
import { MapCredit } from "./map-credit";

const GlobeView = dynamic(() => import("./globe-view").then((mod) => mod.GlobeView), { ssr: false });

export function GlobeHero({ stats, band = true, world = false }: { stats: HeroStats; band?: boolean; world?: boolean }) {
  const router = useRouter();
  const search = useSearchParams();
  const university = search.get("university");
  const selected = stats.universities.find((item) => item.id === university) ?? null;
  const [mode, setMode] = useState<"campus" | "hq">("campus");
  const [ask, setAsk] = useState("");
  const [highlight, setHighlight] = useState<string | null>(null);
  const [builders, setBuilders] = useState<{ name: string }[]>([]);
  const plotted = stats.universities.filter((item) => item.lat != null && item.lon != null);
  const rankedCampuses = [...plotted].sort((a, b) => b.founderCount - a.founderCount || a.name.localeCompare(b.name)).slice(0, 5);
  const sparkPeak = Math.max(1, ...rankedCampuses.flatMap((campus) => campus.signalSeries));
  const tiedIds = new Set(
    rankedCampuses
      .filter((campus) => rankedCampuses.filter((other) => other.founderCount === campus.founderCount).length > 1)
      .map((campus) => campus.id),
  );
  const recentSignals = stats.week.slice(0, 4);
  const recentHeading = recentSignals.length > 0 && recentSignals.every((item) => item.thisWeek) ? SIGNALS_THIS_WEEK_LABEL : "Recent signals";
  const hotIds = [...stats.universities]
    .filter((item) => item.signalWeek > 0 && item.lat != null && item.lon != null)
    .sort((a, b) => b.signalWeek - a.signalWeek || b.founderCount - a.founderCount || a.name.localeCompare(b.name))
    .slice(0, 3)
    .map((item) => item.id);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && university) navigate({ university: null });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [university, search]);

  useEffect(() => {
    if (!selected) return;
    let cancel = false;
    setBuilders([]);
    fetch(`/api/campus/${selected.id}`)
      .then((res) => res.json())
      .then((data: { builders?: { name: string }[] }) => {
        if (!cancel) setBuilders((data.builders ?? []).slice(0, 5));
      })
      .catch(() => {
        if (!cancel) setBuilders([]);
      });
    return () => {
      cancel = true;
    };
  }, [selected]);

  function navigate(overrides: Record<string, string | null>) {
    const next = new URLSearchParams(search.toString());
    for (const [key, value] of Object.entries(overrides)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const qs = next.toString();
    router.replace(qs ? `/?${qs}` : "/", { scroll: false });
  }

  return (
    <div className="hero-night flex flex-col bg-bg px-6 py-6 text-fg lg:min-h-[calc(100dvh-72px)]">
      {band ? <SignatureBand stats={stats} /> : null}
      <div className={`${band ? "mt-5 " : ""}grid flex-1 grid-cols-1 items-start gap-6 lg:min-h-0 lg:grid-cols-12 lg:items-stretch`}>
        <div className="flex flex-col gap-4 lg:col-span-3">
          <div>
            {updatedToday(stats.updatedAt) ? <p className="mb-3 text-[14px] text-fg-2">Updated today</p> : null}
            <h1>
              <span className="hero-num block text-[64px] font-semibold leading-none">{stats.founders.toLocaleString("en-US")}</span>
              <span className="mt-2 block whitespace-nowrap text-[18px] leading-6 lg:text-[20px]" style={{ fontWeight: 500 }}>
                student founders across {stats.campuses.toLocaleString("en-US")} campuses
              </span>
            </h1>
          </div>
          <p className="whitespace-nowrap text-[14px] leading-5 text-fg">
            <Link href="/companies" className="hover:underline"><span className="num">{stats.tracked.toLocaleString("en-US")}</span> companies</Link>
            {" · "}
            <Link href="/signals" className="hover:underline"><span className="num">{stats.signalsTotal.toLocaleString("en-US")}</span> signals</Link>
          </p>
          <Link href="/founders" className="inline-flex h-12 w-fit items-center rounded bg-ember px-6 text-[16px] font-semibold text-accent-foreground">
            Explore founders
          </Link>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const q = ask.trim();
              if (q) router.push(`/ask?q=${encodeURIComponent(q)}`);
            }}
            className="relative"
          >
            <label className="sr-only" htmlFor="hero-ask">Search</label>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-2">
              <circle cx="7" cy="7" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10.2 10.2 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              id="hero-ask"
              value={ask}
              onChange={(event) => setAsk(event.target.value)}
              placeholder="Search founders, campuses, companies"
              className="h-10 w-full rounded border border-line bg-sunken pl-9 pr-3 text-[14px] text-fg outline-none placeholder:text-fg-2"
            />
          </form>
          <section aria-label={recentHeading}>
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-[14px] font-medium">{recentHeading}</h3>
              <Link href="/signals" className="text-[14px] text-fg hover:underline">View all</Link>
            </div>
            {recentSignals.length > 0 ? (
              <ul className="mt-1">
                {recentSignals.map((item) => (
                  <CompactSignal key={item.id} item={item} />
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[14px] text-fg-2">No recent signals. Last signal {absoluteDate(stats.lastSignalAt)}</p>
            )}
          </section>
        </div>
        <div className="flex min-h-[460px] flex-col lg:col-span-7 lg:min-h-0">
          <div className="mb-3 flex h-10 items-center gap-1 border-b border-line" role="group" aria-label="Map geography">
            {(["campus", "hq"] as const).map((value) => (
              <button key={value} type="button" className={`h-10 border-b-2 px-3 text-[14px] font-medium ${mode === value ? "border-link text-fg" : "border-transparent text-fg-2"}`} onClick={() => setMode(value)}>
                {value === "campus" ? "Campuses" : "HQs"}
              </button>
            ))}
            <Link href="/map/network" className="grid h-10 place-items-center border-b-2 border-transparent px-3 text-[14px] font-medium text-fg-2">Network</Link>
          </div>
          <CampusMap
            className="h-[420px] flex-1 lg:h-auto lg:min-h-[420px]"
            universities={plotted}
            world={world}
            mode={mode}
            university={university}
            onNavigate={navigate}
            hotIds={hotIds}
            highlightId={highlight}
          />
        </div>
        <section className="lg:col-span-2" aria-label="Top campuses">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-[16px] font-medium">Top campuses</h2>
            <Link href="/campuses" className="text-[14px] text-fg hover:underline">View all</Link>
          </div>
          <p className="mt-1 text-[14px] text-fg"><span className="text-fg-2">8 wk</span> vs last week</p>
          <ol className="mt-2">
            {rankedCampuses.map((campus, index) => (
              <li
                key={campus.id}
                className="border-t border-line py-1.5"
                onMouseEnter={() => setHighlight(campus.id)}
                onMouseLeave={() => setHighlight((current) => (current === campus.id ? null : current))}
              >
                <div className="flex items-center gap-1 text-[14px]">
                  <span className="num w-4 shrink-0 text-fg">{index + 1}</span>
                  <Link href={`/campuses/${campus.slug}`} className="min-w-0 flex-1 truncate hover:underline" onFocus={() => setHighlight(campus.id)} onBlur={() => setHighlight((current) => (current === campus.id ? null : current))}>{shortCampusLabel(campus.id, campus.name)}</Link>
                  {tiedIds.has(campus.id) ? <span className="shrink-0 text-[13px] text-fg-2">tie</span> : null}
                  <span className="num w-9 shrink-0 text-right text-[14px] text-fg">{campus.founderCount.toLocaleString("en-US")}</span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-1 pl-5">
                  <Sparkline values={campus.signalSeries} peak={sparkPeak} />
                  <WeekDelta delta={campus.signalWeek - campus.signalPrev} />
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
      {selected && (
        <aside className="fixed bottom-0 right-0 z-30 max-h-[60dvh] w-full overflow-y-auto border-line bg-raised p-5 md:top-14 md:max-h-none md:w-[400px] md:border-l">
          <button type="button" className="text-[14px] text-fg-2" onClick={() => navigate({ university: null })}>Close</button>
          <h2 className="mt-3 text-[24px] leading-8 font-semibold tracking-[-0.02em]">{selected.name}</h2>
          <p className="mt-2 text-[14px] text-fg-2"><span className="num">{selected.founderCount.toLocaleString("en-US")}</span> founders · <span className="num">{selected.companyCount.toLocaleString("en-US")}</span> companies · <span className="num">{selected.sourcesConfigured.toLocaleString("en-US")}</span> sources</p>
          <ul className="mt-4 space-y-2 text-[14px]">
            {builders.map((builder) => <li key={builder.name}>{builder.name}</li>)}
            {builders.length === 0 && <li className="text-fg-3">Loading founders…</li>}
          </ul>
          <Link href={`/campuses/${selected.slug}`} className="mt-6 inline-block text-[14px] text-fg-2">Open campus →</Link>
        </aside>
      )}
    </div>
  );
}

export function WorldMap({ stats }: { stats: HeroStats }) {
  const router = useRouter();
  const search = useSearchParams();
  const university = search.get("university");
  const hotIds = [...stats.universities]
    .filter((item) => item.signalWeek > 0 && item.lat != null && item.lon != null)
    .sort((a, b) => b.signalWeek - a.signalWeek || b.founderCount - a.founderCount || a.name.localeCompare(b.name))
    .slice(0, 3)
    .map((item) => item.id);

  function navigate(overrides: Record<string, string | null>) {
    const next = new URLSearchParams(search.toString());
    for (const [key, value] of Object.entries(overrides)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const qs = next.toString();
    router.replace(qs ? `/?${qs}` : "/", { scroll: false });
  }

  return (
    <CampusMap
      className="h-[420px] lg:h-[680px]"
      universities={stats.universities}
      world
      mode="campus"
      university={university}
      onNavigate={navigate}
      hotIds={hotIds}
      highlightId={null}
    />
  );
}

function CampusMap({
  className,
  universities,
  world,
  mode,
  university,
  onNavigate,
  hotIds,
  highlightId,
}: {
  className: string;
  universities: UniversitySummary[];
  world: boolean;
  mode: "campus" | "hq";
  university: string | null;
  onNavigate: (overrides: Record<string, string | null>) => void;
  hotIds: string[];
  highlightId: string | null;
}) {
  return (
    <div className={`relative overflow-hidden rounded-lg border border-line ${className}`}>
      <GlobeView
        universities={universities}
        basePath="/"
        current={{ university: university ?? undefined }}
        onNavigate={onNavigate}
        hero
        world={world}
        hideStats
        flush
        geoMode={mode}
        recentIds={hotIds}
        highlightId={highlightId}
      />
      {world ? (
        <p className="pointer-events-none absolute left-3 top-3 z-20 max-w-[min(320px,calc(100%-24px))] rounded bg-bg/88 px-2.5 py-1.5 text-[13px] leading-4 text-fg-2">
          {countryCoverage(universities)}
        </p>
      ) : null}
      <div className="pointer-events-none absolute bottom-3 left-3 z-20 rounded bg-bg/88 px-2.5 py-1.5">
        <DotLegend />
      </div>
      <NortheastPanel universities={universities} className={world ? "hidden lg:block" : ""} />
      <p className="pointer-events-auto absolute bottom-2 right-3 z-20 max-w-[240px] text-right text-[13px] leading-4 text-fg-2">
        <MapCredit />
      </p>
    </div>
  );
}

const LEGEND = [
  { count: 10, size: 10, color: "#e6dfd4" },
  { count: 100, size: 14, color: "#f3eee6" },
  { count: 700, size: 18, color: "#fffaf4" },
];

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

function DotLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-[14px] text-fg">
      <span>Founders</span>
      {LEGEND.map((stop) => (
        <span key={stop.count} className="inline-flex items-center gap-1.5">
          <span className="inline-block rounded-full" style={{ width: stop.size, height: stop.size, background: stop.color }} />
          <span className="num">{stop.count.toLocaleString("en-US")}</span>
        </span>
      ))}
    </div>
  );
}

function Sparkline({ values, peak }: { values: number[]; peak: number }) {
  if (values.length < 2) return null;
  const width = 88;
  const height = 32;
  const scale = Math.max(peak, 1);
  const step = width / (values.length - 1);
  const base = height - 4;
  const points = values.map((value, index) => `${index * step},${base - (value / scale) * (height - 8)}`).join(" ");
  return (
    <svg width={width} height={height} role="img" aria-label="Signals each week for 8 weeks" className="shrink-0">
      <line x1="0" y1={base} x2={width} y2={base} stroke="#e6dfd4" strokeOpacity="0.35" strokeWidth="1" />
      <polyline fill="none" stroke="#e6dfd4" strokeWidth="2.75" strokeLinejoin="round" strokeLinecap="round" points={points} />
    </svg>
  );
}

function WeekDelta({ delta }: { delta: number }) {
  const title = "Signals this week minus the previous 7 days";
  if (delta > 0) {
    return (
      <span className="num inline-flex items-center gap-0.5 text-[14px] font-semibold text-ok" title={title}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden><path d="M5 1.5 8.5 8H1.5Z" fill="currentColor" /></svg>
        {delta}
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span className="num inline-flex items-center gap-0.5 text-[14px] font-semibold text-danger" title={title}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden><path d="M5 8.5 1.5 2h7Z" fill="currentColor" /></svg>
        {Math.abs(delta)}
      </span>
    );
  }
  return <span className="text-[14px] text-fg-2" title={title}>{"\u2014"}</span>;
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

function SignatureBand({ stats }: { stats: HeroStats }) {
  const signal = collageSignal(stats.week);
  const founder = stats.collageFounder;
  const signalTypes = stats.signalTypes;
  return (
    <section className="-mx-6 border-b border-line px-6 pb-5" aria-label="Campus Scout">
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-10">
        <div className="max-w-[640px]">
          <div className="mb-3">
            <span className="inline-flex h-7 items-center gap-1 rounded-full border border-line bg-sunken pl-2.5 pr-1 text-[13px] leading-none text-fg-2">
              Sample data
              <Link href="/" aria-label="Close" className="grid h-5 w-5 place-items-center rounded-full text-fg-2 hover:bg-raised hover:text-fg">
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                  <path d="M2 2 8 8M8 2 2 8" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
                </svg>
              </Link>
            </span>
          </div>
          <p className="display text-[40px] font-semibold leading-[44px] sm:text-[48px] sm:leading-[52px]">
            Track student founders before they raise
          </p>
          <p className="mt-3 max-w-[34rem] text-[16px] leading-6 text-fg-2">
            The campus map, the people on it, and recent signals.
          </p>
        </div>
        {signal || founder || signalTypes.length > 0 ? (
          <div className="grid w-full grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            {signalTypes.length > 0 ? <SignalMix counts={signalTypes} /> : null}
            <div className="flex flex-col gap-3">
              {founder ? <FounderFragment founder={founder} /> : null}
              {signal ? <SignalFragment item={signal} /> : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function CompactSignal({ item }: { item: WeekItem }) {
  const title = item.event || (item.detail ? firstSentence(item.detail) : "");
  const chip = chipText(item);
  const heading = item.url ? (
    <a href={item.url} className="truncate text-[14px] font-medium leading-5 hover:underline" target="_blank" rel="noreferrer">{title}</a>
  ) : (
    <Link href="/signals" className="truncate text-[14px] font-medium leading-5 hover:underline">{title}</Link>
  );
  const campus = item.campusSlug ? (
    <Link href={`/campuses/${item.campusSlug}`} className="truncate text-fg-2 hover:text-fg">{item.campus}</Link>
  ) : (
    <span className="truncate text-fg-2">{item.campus}</span>
  );
  return (
    <li className="border-t border-line py-1.5">
      <div className="flex min-w-0 items-center gap-2 text-[14px]">
        <span className="h-2 w-2 shrink-0 rounded-full bg-[#e6dfd4]" />
        {campus}
        {chip ? <span className={`shrink-0 rounded-full px-1.5 py-px text-[13px] leading-5 ${chipClass(item, isHighValue(item))}`}>{chip}</span> : null}
        <span className="num ml-auto shrink-0 text-fg-2" title={item.at ?? undefined}>{updatedAgo(item.at)}</span>
      </div>
      <p className="mt-0.5 min-w-0">{heading}</p>
    </li>
  );
}

const PANEL_WEST = -80.2;
const PANEL_EAST = -67.6;
const PANEL_SOUTH = 38.6;
const PANEL_NORTH = 43.4;
const PANEL_LABEL: Record<string, "left" | "right"> = {
  univ_penn: "left",
  univ_yale: "right",
  univ_mit: "left",
  univ_harvard: "right",
};

function panelMercator(lat: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + rad / 2));
}

const PANEL_YN = panelMercator(PANEL_NORTH);
const PANEL_YS = panelMercator(PANEL_SOUTH);

function panelXY(lon: number, lat: number): [number, number] {
  const x = ((lon - PANEL_WEST) / (PANEL_EAST - PANEL_WEST)) * 1000;
  const y = ((PANEL_YN - panelMercator(lat)) / (PANEL_YN - PANEL_YS)) * 700;
  return [x, y];
}

function panelRingHits(ring: number[][]): boolean {
  let minLon = 180;
  let maxLon = -180;
  let minLat = 90;
  let maxLat = -90;
  for (const pair of ring) {
    if (pair[0] < minLon) minLon = pair[0];
    if (pair[0] > maxLon) maxLon = pair[0];
    if (pair[1] < minLat) minLat = pair[1];
    if (pair[1] > maxLat) maxLat = pair[1];
  }
  return maxLon >= PANEL_WEST && minLon <= PANEL_EAST && maxLat >= PANEL_SOUTH && minLat <= PANEL_NORTH;
}

function panelPath(): string {
  const features = (usStates as { features: { geometry?: { type?: string; coordinates?: unknown } }[] }).features;
  const parts: string[] = [];
  for (const feature of features) {
    const geometry = feature.geometry;
    if (!geometry?.coordinates) continue;
    const polygons = geometry.type === "Polygon" ? [geometry.coordinates as number[][][]] : geometry.type === "MultiPolygon" ? (geometry.coordinates as number[][][][]) : [];
    for (const polygon of polygons) {
      for (const ring of polygon) {
        if (ring.length < 3 || !panelRingHits(ring)) continue;
        let path = "";
        for (let index = 0; index < ring.length; index += 1) {
          const [x, y] = panelXY(ring[index][0], ring[index][1]);
          path += `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
        }
        parts.push(`${path}Z`);
      }
    }
  }
  return parts.join("");
}

const NORTHEAST_PATH = panelPath();

function signalWeekOf(university: UniversitySummary): number {
  const value = (university as UniversitySummary & { signalWeek?: number }).signalWeek;
  return typeof value === "number" ? value : 0;
}

function NortheastPanel({ universities, className = "" }: { universities: UniversitySummary[]; className?: string }) {
  const hotIds = new Set(
    [...universities]
      .filter((university) => signalWeekOf(university) > 0)
      .sort((a, b) => signalWeekOf(b) - signalWeekOf(a) || b.founderCount - a.founderCount || a.name.localeCompare(b.name))
      .slice(0, 3)
      .map((university) => university.id),
  );
  const inside = universities.filter((university) => university.lat != null && university.lon != null && university.lon >= PANEL_WEST && university.lon <= PANEL_EAST && university.lat >= PANEL_SOUTH && university.lat <= PANEL_NORTH);
  const frameW = 340;
  const frameH = 168;
  return (
    <div className={`absolute bottom-14 right-3 z-20 w-[340px] overflow-hidden rounded border border-line bg-bg ${className}`} role="img" aria-label="Northeast">
      <div className="px-2 pt-1.5 text-[13px] font-medium leading-4 text-fg">Northeast</div>
      <div className="relative h-[168px]">
        <svg viewBox="0 0 1000 700" className="absolute inset-0 h-full w-full" aria-hidden>
          <path d={NORTHEAST_PATH} fill="#3c3832" stroke="#e6dfd4" strokeWidth="6" strokeOpacity="0.45" />
        </svg>
        {inside.map((university) => {
          const [x, y] = panelXY(university.lon as number, university.lat as number);
          const px = (x / 1000) * frameW;
          const py = (y / 700) * frameH;
          const preferred = PANEL_LABEL[university.id];
          const hot = hotIds.has(university.id) && Boolean(preferred);
          const name = shortCampusLabel(university.id, university.name);
          const nameW = Math.ceil(name.length * 7.4);
          const textW = Math.max(nameW, hot ? 104 : 0);
          const blockH = hot ? 32 : 16;
          const radius = university.founderCount >= 700 ? 6 : university.founderCount >= 200 ? 4.5 : 3.5;
          const spaceLeft = px - 16;
          const spaceRight = frameW - px - 16;
          let side = preferred;
          if (side === "left" && spaceLeft < textW && spaceRight >= textW) side = "right";
          if (side === "right" && spaceRight < textW && spaceLeft >= textW) side = "left";
          let labelX = side === "left" ? px - 16 - textW : side === "right" ? px + 16 : 0;
          let labelY = py - blockH / 2;
          if (side) {
            labelX = Math.max(8, Math.min(frameW - textW - 8, labelX));
            labelY = Math.max(6, Math.min(frameH - blockH - 6, labelY));
          }
          return (
            <span key={university.id}>
              {hot ? <span className="absolute rounded-full" style={{ left: px, top: py, width: 16, height: 16, transform: "translate(-50%, -50%)", boxShadow: "0 0 0 2px #c5c9ff, 0 0 10px 2px rgba(197,201,255,0.55)" }} /> : null}
              <span className="absolute rounded-full bg-[#f3eee6]" style={{ left: px, top: py, width: radius * 2, height: radius * 2, transform: "translate(-50%, -50%)", boxShadow: "0 0 0 1px #12110f" }} />
              {side ? (
                <span
                  className="absolute whitespace-nowrap text-[13px] font-medium leading-4 text-fg"
                  style={{ left: labelX, top: labelY, textShadow: "0 1px 2px #12110f" }}
                >
                  <span className="block">{name}</span>
                  {hot ? <span className="block text-link">new this week</span> : null}
                </span>
              ) : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}
