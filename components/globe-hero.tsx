"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { HeroStats } from "@/lib/domain/hero-stats";
import { relativeTime } from "@/lib/domain/relative-time";

const GlobeView = dynamic(() => import("./globe-view").then((mod) => mod.GlobeView), { ssr: false });

const SIGNAL_LABEL: Record<string, string> = {
  funding: "Raise",
  demo: "Launch",
  continued_dev: "Launch",
  team_change: "Hiring",
  award: "Press",
  customer_evidence: "Research",
};

export function GlobeHero({ stats }: { stats: HeroStats }) {
  const router = useRouter();
  const search = useSearchParams();
  const university = search.get("university");
  const selected = stats.universities.find((item) => item.id === university) ?? null;
  const [mode, setMode] = useState<"campus" | "hq">("campus");
  const [ask, setAsk] = useState("");
  const [builders, setBuilders] = useState<{ name: string }[]>([]);

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
    <div className="hero-night relative h-[calc(100dvh-56px)] min-h-[640px] bg-bg text-fg max-md:h-auto max-md:min-h-0">
      <div className="max-md:px-5 max-md:pb-4 max-md:pt-8 md:absolute md:left-12 md:top-16 md:z-20 md:w-[360px]">
        <p className="micro flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-ember" />
          Live · updated {relativeTime(stats.updatedAt)}
        </p>
        <h1 className="mt-4 max-w-[16ch] text-[36px] leading-[40px] font-semibold tracking-[-0.035em] md:text-[56px] md:leading-[60px]">
          <Link href="/founders" className="num text-ember">{stats.founders.toLocaleString("en-US")}</Link>
          {" "}founders forming across {stats.campuses.toLocaleString("en-US")} campuses.
        </h1>
        <p className="num mt-6 text-[13px] text-fg-2">
          <Link href="/companies" className="hover:text-fg">{stats.tracked.toLocaleString("en-US")} tracked</Link>
          {" · "}
          <Link href="/campuses" className="hover:text-fg">{stats.monitored.toLocaleString("en-US")} monitored</Link>
          {" · "}
          <Link href="/signals" className="hover:text-fg">{stats.signalsWeek.toLocaleString("en-US")} signals this week</Link>
        </p>
        <ul className="mt-8 hidden md:block">
          {stats.week.map((item) => (
            <li key={item.id} className="flex h-9 items-center gap-3 text-[13px]">
              <span className="w-[120px] truncate text-fg-2">{item.campusSlug ? <Link href={`/campuses/${item.campusSlug}`}>{item.campus}</Link> : item.campus}</span>
              <span className="sig-dot" />
              <span>{SIGNAL_LABEL[item.type] ?? item.type}</span>
              <span className="num ml-auto text-fg-3" title={item.at ?? undefined}>{relativeTime(item.at)}</span>
            </li>
          ))}
          {stats.week.length === 0 && <li className="text-[13px] text-fg-3">No signals are stored yet.</li>}
        </ul>
      </div>
      <div className="relative h-[340px] md:absolute md:inset-0 md:h-auto">
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
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(closest-side_at_80%_50%,color-mix(in_srgb,var(--amber)_6%,transparent),transparent)]" />
      </div>
      <div className="bottom-6 left-12 z-20 mt-4 flex gap-2 px-5 md:absolute md:mt-0 md:px-0">
        {(["campus", "hq"] as const).map((value) => (
          <button key={value} type="button" className={`h-8 rounded px-3 text-[13px] ${mode === value ? "bg-raised text-fg" : "text-fg-2"}`} onClick={() => setMode(value)}>
            {value === "campus" ? "Campuses" : "HQs"}
          </button>
        ))}
        <Link href="/map/network" className="grid h-8 place-items-center rounded px-3 text-[13px] text-fg-2">Network</Link>
      </div>
      <form
        className="z-20 mt-4 w-[calc(100%-32px)] max-md:fixed max-md:bottom-4 max-md:left-4 md:absolute md:bottom-6 md:left-1/2 md:mt-0 md:w-[560px] md:-translate-x-1/2"
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
