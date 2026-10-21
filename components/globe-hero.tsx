"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { HeroStats } from "@/lib/domain/hero-stats";
import { absoluteDate, updatedAgo, updatedWithinHour } from "@/lib/domain/relative-time";

const GlobeView = dynamic(() => import("./globe-view").then((mod) => mod.GlobeView), { ssr: false });

export function GlobeHero({ stats }: { stats: HeroStats }) {
  const router = useRouter();
  const search = useSearchParams();
  const university = search.get("university");
  const selected = stats.universities.find((item) => item.id === university) ?? null;
  const [mode, setMode] = useState<"campus" | "hq">("campus");
  const [ask, setAsk] = useState("");
  const [builders, setBuilders] = useState<{ name: string }[]>([]);
  const live = updatedWithinHour(stats.updatedAt);

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
    <div className="hero-night relative h-[calc(100dvh-64px)] min-h-[640px] bg-bg text-fg max-md:h-auto max-md:min-h-0">
      <div className="max-md:px-6 max-md:pb-4 max-md:pt-8 md:absolute md:left-6 md:top-16 md:z-20 md:w-[calc(50%-48px)]">
        <p className="text-[13px] text-[#C9CCD6]">
          {live ? "Live · updated " : "Updated "}
          {updatedAgo(stats.updatedAt)}
        </p>
        <h1 className="mt-4 max-w-[16ch] text-[28px] leading-[1.15] font-semibold tracking-[-0.035em] md:text-[36px]">
          <span className="text-[48px] leading-none text-ember md:text-[72px]">{stats.founders.toLocaleString("en-US")}</span>
          {" "}founders forming across {stats.campuses.toLocaleString("en-US")} campuses.
        </h1>
        <Link href="/founders" className="mt-6 inline-flex h-12 items-center rounded bg-ember px-6 text-[16px] font-semibold text-[#0b0e17]">
          Explore founders
        </Link>
        <p className="mt-6 text-[13px] text-[#C9CCD6]">
          <Link href="/companies" className="hover:text-fg">{stats.tracked.toLocaleString("en-US")} companies</Link>
          {" · "}
          <Link href="/campuses" className="hover:text-fg">{stats.monitored.toLocaleString("en-US")} campuses monitored</Link>
          {" · "}
          <Link href="/signals" className="hover:text-fg">{stats.signalsWeek.toLocaleString("en-US")} signals this week</Link>
        </p>
        {stats.fresh ? (
          <>
            <h2 className="mt-8 text-[13px] font-medium text-[#C9CCD6]">Latest signals</h2>
            <ul className="mt-2 hidden md:block">
              {stats.week.map((item) => (
                <li key={item.id} className="flex h-9 items-center gap-3 text-[13px]">
                  <span className="w-[180px] shrink-0 truncate whitespace-nowrap text-[#C9CCD6]">
                    {item.campusSlug ? <Link href={`/campuses/${item.campusSlug}`}>{item.campus}</Link> : item.campus}
                  </span>
                  <span className="sig-dot shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{item.event}</span>
                  <span className="ml-auto shrink-0 text-right text-[12px] text-[#C9CCD6]" title={item.at ?? undefined}>{updatedAgo(item.at)}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-8 text-[13px] text-[#C9CCD6]">Quiet week · last signal {absoluteDate(stats.lastSignalAt)}</p>
        )}
      </div>
      <div className="relative mx-auto aspect-square h-[420px] w-full max-md:mt-4 md:absolute md:left-[53%] md:top-[44%] md:mx-0 md:h-auto md:w-[min(560px,42vw)] md:-translate-y-1/2">
        <GlobeView
          universities={stats.universities}
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
      <div className="bottom-6 left-6 z-20 mt-4 flex gap-2 px-6 md:absolute md:mt-0 md:px-0">
        {(["campus", "hq"] as const).map((value) => (
          <button key={value} type="button" className={`h-8 rounded px-3 text-[13px] ${mode === value ? "bg-raised text-fg" : "text-fg-2"}`} onClick={() => setMode(value)}>
            {value === "campus" ? "Campuses" : "HQs"}
          </button>
        ))}
        <Link href="/map/network" className="grid h-8 place-items-center rounded px-3 text-[13px] text-fg-2">Network</Link>
      </div>
      <form
        className="z-20 mt-4 w-[calc(100%-48px)] max-md:fixed max-md:bottom-6 max-md:left-6 md:absolute md:bottom-6 md:left-1/2 md:mt-0 md:w-[560px] md:-translate-x-1/2"
        onSubmit={(event) => {
          event.preventDefault();
          const q = ask.trim();
          if (q) router.push(`/ask?q=${encodeURIComponent(q)}`);
        }}
      >
        <label className="sr-only" htmlFor="hero-ask">Ask</label>
        <input
          id="hero-ask"
          value={ask}
          onChange={(event) => setAsk(event.target.value)}
          placeholder="Ask: “AI founders at Waterloo who shipped in the last 30 days”"
          className="h-12 w-full rounded-lg border border-line-strong bg-raised px-4 text-[15px] outline-none"
        />
      </form>
      {selected && (
        <aside className="fixed bottom-0 right-0 z-30 max-h-[60dvh] w-full overflow-y-auto border-line bg-raised p-5 md:top-14 md:max-h-none md:w-[400px] md:border-l">
          <button type="button" className="text-[13px] text-fg-2" onClick={() => navigate({ university: null })}>Close</button>
          <h2 className="mt-3 text-[24px] leading-8 font-semibold tracking-[-0.02em]">{selected.name}</h2>
          <p className="num mt-2 text-[13px] text-fg-2">{selected.founderCount.toLocaleString("en-US")} founders · {selected.companyCount.toLocaleString("en-US")} companies · {selected.sourcesConfigured.toLocaleString("en-US")} sources</p>
          <ul className="mt-4 space-y-2 text-[14px]">
            {builders.map((builder) => <li key={builder.name}>{builder.name}</li>)}
            {builders.length === 0 && <li className="text-fg-3">Loading founders…</li>}
          </ul>
          <Link href={`/campuses/${selected.slug}`} className="mt-6 inline-block text-[14px] text-ember">Open campus →</Link>
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
