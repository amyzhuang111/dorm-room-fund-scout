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
    <div className="hero-night bg-bg px-6 py-6 text-fg">
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12 lg:items-stretch">
        <div className="flex flex-col gap-4 lg:col-span-3">
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
          <p className="text-[16px] text-fg-2">
            <Link href="/companies" className="hover:underline"><span className="num">{stats.tracked.toLocaleString("en-US")}</span> companies</Link>
            {" · "}
            <Link href="/signals" className="hover:underline"><span className="num">{stats.signalsWeek.toLocaleString("en-US")}</span> {SIGNALS_THIS_WEEK_LABEL}</Link>
          </p>
          <Link href="/founders" className="inline-flex h-12 w-fit items-center rounded bg-ember px-6 text-[16px] font-semibold text-[#0b0e17]">
            Explore founders
          </Link>
        </div>
        <div className="flex flex-col lg:col-span-7">
          <div className="mb-3 flex h-10 items-center gap-1 border-b border-line" role="group" aria-label="Map geography">
            {(["campus", "hq"] as const).map((value) => (
              <button key={value} type="button" className={`h-10 border-b-2 px-3 text-[14px] font-medium ${mode === value ? "border-ember text-fg" : "border-transparent text-fg-2"}`} onClick={() => setMode(value)}>
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
              recentIds={stats.recentCampusIds}
            />
          </div>
          <DotLegend />
          <p className="mt-2 text-[14px] text-fg-2">
            <MapCredit />
          </p>
        </div>
        <section className="lg:col-span-2" aria-label="Top campuses">
          <h2 className="text-[14px] font-medium">Top campuses</h2>
          <p className="mt-1 text-[14px] text-fg-2">Founders, signals vs last week</p>
          <ol className="mt-2">
            {rankedCampuses.map((campus, index) => (
              <li key={campus.id} className={`border-t border-line py-1.5 ${index === 0 ? "border-l-2 border-l-ember pl-2" : ""}`}>
                <div className="flex items-center gap-1.5 text-[14px]">
                  <span className={`num w-4 ${index === 0 ? "text-ember" : "text-fg-2"}`}>{index + 1}</span>
                  <Link href={`/campuses/${campus.slug}`} className="min-w-0 flex-1 truncate hover:underline">{shortCampusLabel(campus.id, campus.name)}</Link>
                  <WeekDelta delta={campus.signalWeek - campus.signalPrev} />
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 pl-5">
                  <Sparkline values={campus.signalSeries} />
                  <span className="num text-[14px]">{campus.founderCount.toLocaleString("en-US")}</span>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const q = ask.trim();
          if (q) router.push(`/ask?q=${encodeURIComponent(q)}`);
        }}
        className="relative mt-6 max-w-xl"
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
      <section className="mt-8">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[16px] font-medium">Latest signals</h2>
          <Link href="/signals" className="text-[14px] text-fg-2 hover:text-fg">View all</Link>
        </div>
        {latest.length > 0 ? (
          <ul className="mt-3 grid grid-cols-1 gap-x-8 md:grid-cols-2">
            {latest.map((item) => (
              <SignalRow key={item.id} item={item} />
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[14px] text-fg-2">Quiet week. Last signal {absoluteDate(stats.lastSignalAt)}</p>
        )}
      </section>
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
  { count: 10, size: 9, color: "#7f9dcf" },
  { count: 100, size: 13, color: "#a9c2ee" },
  { count: 700, size: 20, color: "#f4f7ff" },
];

function DotLegend() {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-4 text-[14px] text-fg-2">
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
  const width = 64;
  const height = 18;
  const peak = Math.max(...values, 1);
  const step = width / (values.length - 1);
  const points = values.map((value, index) => `${index * step},${height - 2 - (value / peak) * (height - 4)}`).join(" ");
  const last = values[values.length - 1] ?? 0;
  const lastX = (values.length - 1) * step;
  const lastY = height - 2 - (last / peak) * (height - 4);
  return (
    <svg width={width} height={height} aria-hidden className="shrink-0">
      <polyline fill="none" stroke="#8ea3c4" strokeWidth="1.5" points={points} />
      {last > 0 ? <circle cx={lastX} cy={lastY} r="2.5" fill="#E8823A" /> : null}
    </svg>
  );
}

function WeekDelta({ delta }: { delta: number }) {
  const title = "Signals this week minus the previous 7 days";
  if (delta > 0) {
    return (
      <span className="num inline-flex items-center gap-0.5 text-[#3fb68b]" title={title}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden><path d="M5 1.5 8.5 8H1.5Z" fill="currentColor" /></svg>
        {delta}
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span className="num inline-flex items-center gap-0.5 text-[#e5484d]" title={title}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden><path d="M5 8.5 1.5 2h7Z" fill="currentColor" /></svg>
        {Math.abs(delta)}
      </span>
    );
  }
  return <span className="num text-fg-2" title={title}>0</span>;
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

function SignalRow({ item }: { item: WeekItem }) {
  const high = isHighValue(item);
  const summary = item.detail && item.detail !== item.event ? firstSentence(item.detail) : "";
  const title = item.event || summary;
  const body = summary && summary !== title ? summary : "";
  const heading = item.url ? (
    <a href={item.url} className="text-[15px] font-medium leading-5 hover:underline" target="_blank" rel="noreferrer">{title}</a>
  ) : (
    <Link href="/signals" className="text-[15px] font-medium leading-5 hover:underline">{title}</Link>
  );
  const campus = item.campusSlug ? (
    <Link href={`/campuses/${item.campusSlug}`} className="truncate text-fg-2 hover:text-fg">{item.campus}</Link>
  ) : (
    <span className="truncate text-fg-2">{item.campus}</span>
  );
  const chip = chipText(item);
  return (
    <li className="border-t border-line py-3">
      <div className="flex min-w-0 items-center gap-2 text-[14px]">
        <span className={`h-2 w-2 shrink-0 rounded-full ${item.thisWeek ? "bg-ember" : "bg-[#7f9dcf]"}`} title={item.thisWeek ? "This week" : "Earlier"} />
        {campus}
        {chip ? <span className={`shrink-0 rounded-full px-1.5 py-px text-[14px] leading-5 ${chipClass(item, high)}`}>{chip}</span> : null}
        <span className="num ml-auto shrink-0 text-fg-2" title={item.at ?? undefined}>{updatedAgo(item.at)}</span>
      </div>
      <p className="mt-1.5">{heading}</p>
      {body ? <p className="mt-1 text-[14px] leading-5 text-fg-2" title={item.detail ?? body}>{body}</p> : null}
    </li>
  );
}
