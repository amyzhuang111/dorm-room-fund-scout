"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { shortCampusLabel } from "@/lib/domain/campuses";
import type { HeroStats, WeekItem } from "@/lib/domain/hero-stats";
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
  const rankedCampuses = [...plotted].sort((a, b) => b.founderCount - a.founderCount || a.name.localeCompare(b.name));
  const topCampuses = rankedCampuses.slice(0, 6);
  const latest = stats.week.slice(0, 4);

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
      <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-12 md:gap-x-6">
        <div className="flex flex-col gap-4 md:col-span-5">
          <div>
            {updatedToday(stats.updatedAt) ? <p className="mb-3 text-[14px] text-fg-2">Updated today</p> : null}
            <h1>
              <span className="num block text-[64px] leading-none">{stats.founders.toLocaleString("en-US")}</span>
              <span className="display mt-3 block text-[28px] font-medium leading-8">
                student founders across <span className="num">{stats.campuses.toLocaleString("en-US")}</span> campuses
              </span>
            </h1>
            <p className="mt-3 text-[16px] text-fg-2">Track student founders before they raise</p>
          </div>
          <p className="text-[14px] text-fg-2">
            <Link href="/companies" className="hover:underline"><span className="num">{stats.tracked.toLocaleString("en-US")}</span> companies</Link>
            {" · "}
            <Link href="/signals" className="hover:underline"><span className="num">{stats.signalsWeek.toLocaleString("en-US")}</span> signals this week</Link>
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
              <h2 className="display text-[16px] font-medium">Latest signals</h2>
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
        <div className="flex flex-col md:col-span-7 md:col-start-6">
          <div className="mb-3 flex h-10 items-center gap-1 border-b border-line" role="group" aria-label="Map geography">
            {(["campus", "hq"] as const).map((value) => (
              <button key={value} type="button" className={`h-8 rounded px-3 text-[14px] font-medium ${mode === value ? "bg-raised text-fg" : "text-fg-2"}`} onClick={() => setMode(value)}>
                {value === "campus" ? "Campuses" : "HQs"}
              </button>
            ))}
            <Link href="/map/network" className="grid h-8 place-items-center rounded px-3 text-[14px] font-medium text-fg-2">Network</Link>
          </div>
          <div className="relative h-[360px] overflow-hidden rounded-lg border border-line md:h-[520px]">
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
          <p className="mt-2 text-[13px] text-fg-2">
            <MapCredit />
          </p>
        </div>
      </div>
      <section className="mt-10">
        <h2 className="display text-[16px] font-medium">Top campuses</h2>
        <ul className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-6">
          {topCampuses.map((campus) => (
            <li key={campus.id}>
              <Link href={`/campuses/${campus.slug}`} className="block rounded-lg border border-line bg-raised px-3 py-3 hover:border-line-strong">
                <span className="block truncate text-[14px]">{shortCampusLabel(campus.id, campus.name)}</span>
                <span className="num mt-1 block text-[18px]">{campus.founderCount.toLocaleString("en-US")}</span>
                <span className="text-[14px] text-fg-2">founders</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
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
      <nav className="sr-only" aria-label="Top campuses">
        {stats.universities.filter((item) => item.founderCount > 0).sort((a, b) => b.founderCount - a.founderCount).slice(0, 12).map((item) => (
          <Link key={item.id} href={`/?university=${item.id}`}>{item.name}</Link>
        ))}
      </nav>
    </div>
  );
}

const TAG_CLASS: Record<NonNullable<WeekItem["tag"]>, string> = {
  YC: "border-[#7C8CF0] text-[#b7c4ff]",
  GitHub: "border-line-strong text-fg",
  Funding: "border-[#3FB68B] text-[#3FB68B]",
};

function SignalRow({ item }: { item: WeekItem }) {
  const event = item.url ? (
    <a href={item.url} className="mt-0.5 block truncate text-[14px] hover:underline" target="_blank" rel="noreferrer">{item.event}</a>
  ) : (
    <Link href="/signals" className="mt-0.5 block truncate text-[14px] hover:underline">{item.event}</Link>
  );
  const campus = item.campusSlug ? (
    <Link href={`/campuses/${item.campusSlug}`} className="truncate text-fg-2 hover:text-fg">{item.campus}</Link>
  ) : (
    <span className="truncate text-fg-2">{item.campus}</span>
  );
  return (
    <li className="border-t border-line py-2">
      <div className="flex min-w-0 items-center gap-2 text-[13px]">
        {item.thisWeek ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ember" title="This week" /> : null}
        {campus}
        {item.tag ? <span className={`shrink-0 rounded-full border px-1.5 py-px text-[13px] leading-4 ${TAG_CLASS[item.tag]}`}>{item.tag}</span> : null}
        <span className="num ml-auto shrink-0 text-fg-2" title={item.at ?? undefined}>{updatedAgo(item.at)}</span>
      </div>
      {event}
    </li>
  );
}
