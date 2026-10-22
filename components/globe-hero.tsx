"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { shortCampusLabel } from "@/lib/domain/campuses";
import type { HeroStats, WeekItem } from "@/lib/domain/hero-stats";
import { SIGNALS_THIS_WEEK_LABEL } from "@/lib/domain/signal-copy";
import { absoluteDate, updatedAgo, updatedToday } from "@/lib/domain/relative-time";
import { MapCredit } from "./map-credit";

const GlobeView = dynamic(() => import("./globe-view").then((mod) => mod.GlobeView), { ssr: false });

export function GlobeHero({ stats }: { stats: HeroStats }) {
  const router = useRouter();
  const search = useSearchParams();
  const university = search.get("university");
  const selected = stats.universities.find((item) => item.id === university) ?? null;
  const [mode, setMode] = useState<"campus" | "hq">("campus");
  const [ask, setAsk] = useState("");
  const [builders, setBuilders] = useState<{ name: string }[]>([]);
  const plotted = stats.universities.filter((item) => item.founderCount > 0);
  const rankedCampuses = [...plotted].sort((a, b) => b.founderCount - a.founderCount || a.name.localeCompare(b.name)).slice(0, 10);
  const latest = stats.week.slice(0, 8);

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
    <div className="hero-night bg-bg px-6 py-8 text-fg">
      <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-12 md:items-stretch md:gap-x-6">
        <div className="flex flex-col gap-4 md:col-span-5">
          <div>
            {updatedToday(stats.updatedAt) ? <p className="mb-3 text-[14px] text-fg-2">Updated today</p> : null}
            <h1>
              <span className="hero-num block text-[64px] leading-none">{stats.founders.toLocaleString("en-US")}</span>
              <span className="mt-3 block text-[28px] font-medium leading-8">
                student founders across {stats.campuses.toLocaleString("en-US")} campuses
              </span>
            </h1>
            <p className="mt-3 text-[16px] text-fg-2">Track student founders before they raise</p>
          </div>
          <p className="text-[14px] text-fg-2">
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
            <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-fg-2">
              <circle cx="7" cy="7" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10.2 10.2 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              id="hero-ask"
              value={ask}
              onChange={(event) => setAsk(event.target.value)}
              placeholder="Search founders, campuses, companies"
              className="h-12 w-full rounded-full border border-[#8b93a7] bg-raised pl-11 pr-4 text-[16px] text-fg outline-none placeholder:text-fg-2"
            />
          </form>
          <section>
            <div className="flex items-baseline justify-between">
              <h2 className="text-[16px] font-medium">Latest signals</h2>
              <Link href="/signals" className="text-[13px] text-fg-2 hover:text-fg">View all</Link>
            </div>
            {latest.length > 0 ? (
              <ul className="mt-2">
                {latest.map((item) => (
                  <SignalRow key={item.id} item={item} />
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[14px] text-fg-2">Quiet week. Last signal {absoluteDate(stats.lastSignalAt)}</p>
            )}
          </section>
        </div>
        <div className="flex h-full min-h-[360px] flex-col md:col-span-7 md:col-start-6">
          <div className="mb-3 flex h-10 items-center gap-1 border-b border-line" role="group" aria-label="Map geography">
            {(["campus", "hq"] as const).map((value) => (
              <button key={value} type="button" className={`h-8 rounded px-3 text-[14px] font-medium ${mode === value ? "bg-raised text-fg" : "text-fg-2"}`} onClick={() => setMode(value)}>
                {value === "campus" ? "Campuses" : "HQs"}
              </button>
            ))}
            <Link href="/map/network" className="grid h-8 place-items-center rounded px-3 text-[14px] font-medium text-fg-2">Network</Link>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row">
            <div className="flex min-h-[320px] min-w-0 flex-1 flex-col">
              <div className="relative min-h-[320px] flex-1 overflow-hidden rounded-lg border border-line">
                <GlobeView
                  universities={plotted}
                  basePath="/"
                  current={{ university: university ?? undefined }}
                  onNavigate={navigate}
                  hero
                  hideStats
                  flush
                  geoMode={mode}
                  recentIds={stats.recentCampusIds}
                />
                <DotLegend />
              </div>
              <p className="mt-2 text-[13px] text-fg-2">
                <MapCredit />
              </p>
            </div>
            <section className="w-full shrink-0 md:w-[232px]" aria-label="Top campuses">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-[16px] font-medium">Top campuses</h2>
              </div>
              <p className="mt-1 text-[13px] text-fg-2">Founders, and signals vs last week</p>
              <ol className="mt-2">
                {rankedCampuses.map((campus, index) => {
                  const delta = campus.signalWeek - campus.signalPrev;
                  return (
                    <li key={campus.id} className="flex items-baseline gap-2 border-t border-line py-1.5 text-[14px]">
                      <span className="num w-4 text-fg-2">{index + 1}</span>
                      <Link href={`/campuses/${campus.slug}`} className="min-w-0 flex-1 truncate hover:underline">{shortCampusLabel(campus.id, campus.name)}</Link>
                      <span className="num">{campus.founderCount.toLocaleString("en-US")}</span>
                      <span className="num w-7 text-right text-fg-2" title="Signals this week minus the previous 7 days">{delta > 0 ? `+${delta}` : String(delta)}</span>
                    </li>
                  );
                })}
              </ol>
            </section>
          </div>
        </div>
      </div>
      {selected && (
        <aside className="fixed bottom-0 right-0 z-30 max-h-[60dvh] w-full overflow-y-auto border-line bg-raised p-5 md:top-14 md:max-h-none md:w-[400px] md:border-l">
          <button type="button" className="text-[13px] text-fg-2" onClick={() => navigate({ university: null })}>Close</button>
          <h2 className="mt-3 text-[24px] leading-8 font-semibold tracking-[-0.02em]">{selected.name}</h2>
          <p className="num mt-2 text-[13px] text-fg-2">{selected.founderCount.toLocaleString("en-US")} founders · {selected.companyCount.toLocaleString("en-US")} companies · {selected.sourcesConfigured.toLocaleString("en-US")} sources</p>
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
  { count: 10, size: 9, color: "#7f9dcf" },
  { count: 100, size: 13, color: "#a9c2ee" },
  { count: 700, size: 20, color: "#f4f7ff" },
];

function DotLegend() {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex items-center gap-3 rounded bg-[#0c1320]/80 px-2.5 py-1.5 text-[13px] text-[#d5d8e2]">
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

const HIGH_VALUE = new Set(["funding", "launch", "award", "acquisition"]);

function chipText(item: WeekItem): string {
  if (item.tag) return item.tag;
  const category = item.category.trim();
  if (!category) return "";
  return category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
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

function SignalRow({ item }: { item: WeekItem }) {
  const high = isHighValue(item);
  const line = item.detail || item.event;
  const description = item.url ? (
    <a href={item.url} className={`mt-0.5 block truncate text-[14px] hover:underline ${high ? "font-medium" : ""}`} target="_blank" rel="noreferrer" title={line}>{line}</a>
  ) : (
    <Link href="/signals" className={`mt-0.5 block truncate text-[14px] hover:underline ${high ? "font-medium" : ""}`} title={line}>{line}</Link>
  );
  const campus = item.campusSlug ? (
    <Link href={`/campuses/${item.campusSlug}`} className="truncate text-fg-2 hover:text-fg">{item.campus}</Link>
  ) : (
    <span className="truncate text-fg-2">{item.campus}</span>
  );
  const chip = chipText(item);
  return (
    <li className="border-t border-line py-1.5">
      <div className="flex min-w-0 items-center gap-2 text-[13px]">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${item.thisWeek ? "bg-ember" : "bg-[#7f9dcf]"}`} title={item.thisWeek ? "This week" : "Earlier"} />
        {campus}
        {chip ? <span className={`shrink-0 rounded-full px-1.5 py-px text-[13px] leading-4 ${chipClass(item, high)}`}>{chip}</span> : null}
        <span className="num ml-auto shrink-0 text-fg-2" title={item.at ?? undefined}>{updatedAgo(item.at)}</span>
      </div>
      {description}
    </li>
  );
}
