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

export function GlobeHero({ stats }: { stats: HeroStats }) {
  const router = useRouter();
  const search = useSearchParams();
  const university = search.get("university");
  const selected = stats.universities.find((item) => item.id === university) ?? null;
  const [mode, setMode] = useState<"campus" | "hq">("campus");
  const [ask, setAsk] = useState("");
  const [highlight, setHighlight] = useState<string | null>(null);
  const [builders, setBuilders] = useState<{ name: string }[]>([]);
  const plotted = stats.universities.filter((item) => item.founderCount > 0);
  const rankedCampuses = [...plotted].sort((a, b) => b.founderCount - a.founderCount || a.name.localeCompare(b.name)).slice(0, 5);
  const thisWeek = stats.week.filter((item) => item.thisWeek).slice(0, 4);
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
    <div className="hero-night bg-bg px-6 py-6 text-fg">
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12 lg:items-stretch">
        <div className="flex flex-col gap-4 lg:col-span-3">
          <div>
            {updatedToday(stats.updatedAt) ? <p className="mb-3 text-[14px] text-fg-2">Updated today</p> : null}
            <h1>
              <span className="hero-num block text-[64px] font-semibold leading-none">{stats.founders.toLocaleString("en-US")}</span>
              <span className="mt-2 block whitespace-nowrap text-[18px] leading-6 lg:text-[20px]" style={{ fontWeight: 500 }}>
                student founders across {stats.campuses.toLocaleString("en-US")} campuses
              </span>
            </h1>
            <h2 className="mt-2 text-[16px] leading-6 text-fg" style={{ fontWeight: 400 }}>Track student founders before they raise</h2>
          </div>
          <p className="whitespace-nowrap text-[14px] leading-5 text-fg">
            <Link href="/companies" className="hover:underline"><span className="num">{stats.tracked.toLocaleString("en-US")}</span> companies</Link>
            {" · "}
            <Link href="/signals" className="hover:underline"><span className="num">{stats.signalsWeek.toLocaleString("en-US")}</span> {SIGNALS_THIS_WEEK_LABEL}</Link>
          </p>
          <Link href="/founders" className="inline-flex h-12 w-fit items-center rounded bg-ember px-6 text-[16px] font-semibold text-[#0b0e17]">
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
          <section aria-label={SIGNALS_THIS_WEEK_LABEL}>
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-[14px] font-medium">{SIGNALS_THIS_WEEK_LABEL}</h3>
              <Link href="/signals" className="text-[14px] text-fg hover:underline">View all</Link>
            </div>
            {thisWeek.length > 0 ? (
              <ul className="mt-1">
                {thisWeek.map((item) => (
                  <CompactSignal key={item.id} item={item} />
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[14px] text-fg-2">Quiet week. Last signal {absoluteDate(stats.lastSignalAt)}</p>
            )}
          </section>
        </div>
        <div className="flex flex-col lg:col-span-7">
          <div className="mb-3 flex h-10 items-center gap-1 border-b border-line" role="group" aria-label="Map geography">
            {(["campus", "hq"] as const).map((value) => (
              <button key={value} type="button" className={`h-10 border-b-2 px-3 text-[14px] font-medium ${mode === value ? "border-[#8eb4ff] text-fg" : "border-transparent text-fg-2"}`} onClick={() => setMode(value)}>
                {value === "campus" ? "Campuses" : "HQs"}
              </button>
            ))}
            <Link href="/map/network" className="grid h-10 place-items-center border-b-2 border-transparent px-3 text-[14px] font-medium text-fg-2">Network</Link>
          </div>
          <div className="relative h-[340px] overflow-hidden rounded-lg border border-line lg:h-[520px]">
            <GlobeView
              universities={plotted}
              basePath="/"
              current={{ university: university ?? undefined }}
              onNavigate={navigate}
              hero
              hideStats
              flush
              geoMode={mode}
              recentIds={hotIds}
              highlightId={highlight}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <DotLegend />
            <NortheastPanel universities={plotted} />
          </div>
          <p className="mt-2 text-[14px] text-fg">
            <MapCredit />
          </p>
        </div>
        <section className="lg:col-span-2" aria-label="Top campuses">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-[16px] font-medium">Top campuses</h2>
            <Link href="/campuses" className="text-[14px] text-fg hover:underline">View all</Link>
          </div>
          <p className="mt-1 text-[14px] text-fg">8-week signals, vs last week</p>
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
                  <span className="num w-9 shrink-0 text-right text-[14px] text-fg">{campus.founderCount.toLocaleString("en-US")}</span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-1 pl-5">
                  <Sparkline values={campus.signalSeries} />
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

const LEGEND = [
  { count: 10, size: 10, color: "#c5d4ff" },
  { count: 100, size: 14, color: "#d7e4ff" },
  { count: 700, size: 18, color: "#ffffff" },
];

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

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const width = 88;
  const height = 32;
  const peak = Math.max(...values, 1);
  const step = width / (values.length - 1);
  const points = values.map((value, index) => `${index * step},${height - 4 - (value / peak) * (height - 8)}`).join(" ");
  return (
    <svg width={width} height={height} role="img" aria-label="Signals each week for 8 weeks" className="shrink-0">
      <polyline fill="none" stroke="#d6e2ff" strokeWidth="2.75" strokeLinejoin="round" strokeLinecap="round" points={points} />
    </svg>
  );
}

function WeekDelta({ delta }: { delta: number }) {
  const title = "Signals this week minus the previous 7 days";
  if (delta > 0) {
    return (
      <span className="num inline-flex items-center gap-0.5 text-[14px] font-semibold text-[#3fb68b]" title={title}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden><path d="M5 1.5 8.5 8H1.5Z" fill="currentColor" /></svg>
        {delta}
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span className="num inline-flex items-center gap-0.5 text-[14px] font-semibold text-[#e5484d]" title={title}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden><path d="M5 8.5 1.5 2h7Z" fill="currentColor" /></svg>
        {Math.abs(delta)}
      </span>
    );
  }
  return <span className="num text-[14px] font-semibold text-fg" title={title}>0</span>;
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
  if (item.tag === "Funding") return "border border-[#3FB68B] bg-[#143028] font-medium text-[#8ee0c0]";
  if (item.tag === "YC") return "border border-[#7C8CF0] bg-[#1c2140] font-medium text-[#d5dcff]";
  if (high) return "border border-[#8ea3c4] bg-[#243044] font-medium text-fg";
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
        <span className="h-2 w-2 shrink-0 rounded-full bg-[#c5d4ff]" />
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
const PANEL_LABEL: Record<string, { side: "left" | "right"; dy: number }> = {
  univ_penn: { side: "left", dy: -8 },
  univ_yale: { side: "right", dy: 6 },
  univ_mit: { side: "left", dy: -18 },
  univ_harvard: { side: "right", dy: 8 },
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

function NortheastPanel({ universities }: { universities: UniversitySummary[] }) {
  const hotIds = new Set(
    [...universities]
      .filter((university) => signalWeekOf(university) > 0)
      .sort((a, b) => signalWeekOf(b) - signalWeekOf(a) || b.founderCount - a.founderCount || a.name.localeCompare(b.name))
      .slice(0, 3)
      .map((university) => university.id),
  );
  const inside = universities.filter((university) => university.lat != null && university.lon != null && university.lon >= PANEL_WEST && university.lon <= PANEL_EAST && university.lat >= PANEL_SOUTH && university.lat <= PANEL_NORTH);
  return (
    <div className="relative h-[132px] w-[220px] shrink-0 overflow-hidden rounded border border-line bg-[#0c1320]" role="img" aria-label="Northeast">
      <svg viewBox="0 0 1000 700" className="absolute inset-0 h-full w-full" aria-hidden>
        <path d={NORTHEAST_PATH} fill="#2a3548" stroke="#e8eef8" strokeWidth="6" strokeOpacity="0.45" />
      </svg>
      <span className="absolute left-2 top-1 text-[13px] font-medium text-[#f7f8fc]">Northeast</span>
      {inside.map((university) => {
        const [x, y] = panelXY(university.lon as number, university.lat as number);
        const left = `${x / 10}%`;
        const top = `${y / 7}%`;
        const place = PANEL_LABEL[university.id];
        const side = place?.side;
        const hot = hotIds.has(university.id) && Boolean(side);
        const radius = university.founderCount >= 700 ? 6 : university.founderCount >= 200 ? 4.5 : 3.5;
        return (
          <span key={university.id}>
            {hot ? <span className="absolute rounded-full" style={{ left, top, width: 16, height: 16, transform: "translate(-50%, -50%)", boxShadow: "0 0 0 2px #E8823A" }} /> : null}
            <span className="absolute rounded-full bg-[#d7e4ff]" style={{ left, top, width: radius * 2, height: radius * 2, transform: "translate(-50%, -50%)", boxShadow: "0 0 0 1px #0b0e17" }} />
            {side ? (
              <span
                className="absolute whitespace-nowrap text-[13px] font-medium leading-4 text-[#f7f8fc]"
                style={{ left, top, textAlign: side === "left" ? "right" : "left", transform: side === "left" ? `translate(calc(-100% - 8px), ${place?.dy ?? 0}px)` : `translate(8px, ${place?.dy ?? 0}px)`, textShadow: "0 1px 2px #0c1320" }}
              >
                <span className="block">{shortCampusLabel(university.id, university.name)}</span>
                {hot ? <span className="block text-[#ffb07a]">new this week</span> : null}
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}
