"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FounderResults, FounderSearchBar } from "@/components/founder-sourcing";
import { MobileCampusSegments, MobileFounderDeck } from "@/components/mobile-founder-deck";
import {
  campusIdsForSearch,
} from "@/components/fold-map-craft";
import { buildOpenLaneShell } from "@/lib/domain/open-lane";
import { GlobeHero } from "@/components/globe-hero";
import { SampleTheme } from "@/components/sample-theme";
import type { DirectoryCard, DirectoryFilter, DirectorySort } from "@/lib/domain/directory";
import type { HeroStats } from "@/lib/domain/hero-stats";
import { logoLooksBlank } from "@/components/corpus-row-mark";
import { founderMatches, type FounderLead } from "@/lib/domain/founder-index";
import type { FacetCompany } from "@/lib/domain/sample-facets";
import { fetchSampleDirectory } from "@/lib/domain/sample-directory-client";
import type { Feed } from "@/components/sample-home";
import type { PeakShell } from "@/lib/domain/peak-shell";
import { shortCampusLabel } from "@/lib/domain/campuses";
import { discoveryHref } from "@/lib/domain/discovery-navigation";
import { rankedByUndergrad } from "@/lib/domain/pitchbook-model";
import { browseHref as buildBrowseHref, type FacetState as UrlFacetState } from "@/lib/domain/facet-url";

const SampleInstrumentBrowse = dynamic(
  () => import("@/components/sample-instrument-browse").then((mod) => ({ default: mod.SampleInstrumentBrowse })),
  { ssr: true },
);

type TopCampus = {
  id: string;
  name: string;
  founders: number;
  pitchbookRank: number | null;
  pitchbookFounders: number | null;
};



type CampusOpt = {
  id: string;
  name: string;
  country: string;
  founders: number;
  pitchbookRank?: number | null;
  pitchbookFounders?: number | null;
};


function browseHref(opts: {
  feed?: Feed;
  sector?: string;
  kind?: string;
  campus?: string;
  q?: string;
  sort?: DirectorySort;
  more?: number;
  facets?: Partial<UrlFacetState>;
}): string {
  return buildBrowseHref({
    feed: opts.feed,
    sort: opts.sort,
    more: opts.more,
    facets: {
      sector: opts.sector ?? null,
      kind: opts.kind ?? null,
      campus: opts.campus ?? null,
      query: opts.q ?? "",
      ...(opts.facets ?? {}),
    },
  });
}


function HomeRail({
  founders,
  status,
  query,
  onQuery,
  campusId,
  campusName,
  campuses,
  week,
  companies,
  foundersIndexed,
  onSelectCampus,
  onClearCampus,
}: {
  founders: FounderLead[];
  status: "loading" | "ready" | "error";
  query: string;
  onQuery: (value: string) => void;
  campusId: string | null;
  campusName: string | null;
  campuses: TopCampus[];
  week: HeroStats["week"];
  companies: FacetCompany[];
  foundersIndexed: number;
  onSelectCampus: (id: string) => void;
  onClearCampus: () => void;
}) {
  const people = useMemo(() => {
    return founders
      .filter((founder) => founderMatches(founder, { text: query, campusId: campusId || null }))
      .slice(0, 14);
  }, [founders, query, campusId]);
  const programs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const company of companies) {
      const label = company.primaryProgram?.trim();
      if (!label) continue;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 4);
  }, [companies]);
  const signals = week.filter((item) => item.event.trim() || item.campus.trim()).slice(0, 3);
  const schools = campuses.slice(0, 5);
  return (
    <aside className="mt-3 hidden min-w-0 lg:mt-0 lg:block" data-home-rail="">
      <div className="home-float flex max-h-[calc(100dvh-4.5rem)] flex-col overflow-hidden">
        <div className="border-b border-[color:var(--line,#F0D7C2)] px-3 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ember,#E85D04)]">Founders</p>
            <p className="font-mono text-[12px] tabular-nums text-[color:var(--fg-2,#5C4030)]">
              <span className="font-bold text-[color:var(--ember,#E85D04)]">{foundersIndexed.toLocaleString("en-US")}</span>
              {" indexed"}
            </p>
          </div>
          <div className="mt-1.5">
            <FounderSearchBar query={query} onQuery={onQuery} />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {campusId ? (
            <div className="flex items-start justify-between gap-2 border-b border-[color:var(--line,#F0D7C2)] px-3 py-1.5">
              <p className="break-words text-[14px] font-semibold leading-5">{campusName || "Selected school"}</p>
              <button type="button" className="inline-flex min-h-11 items-center text-[13px] font-semibold text-[color:var(--ember,#E85D04)]" onClick={onClearCampus}>Clear</button>
            </div>
          ) : null}
          <section className="border-b border-[color:var(--line,#F0D7C2)] px-3 py-1.5">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--fg-3,#8A6854)]">Schools</p>
            <ol className="mt-0.5">
              {schools.map((campus, index) => (
                <li key={campus.id}>
                  <button type="button" onClick={() => onSelectCampus(campus.id)} className="flex w-full items-baseline gap-2 py-0.5 text-left">
                    <span className="w-5 shrink-0 font-mono text-[11px] tabular-nums text-[color:var(--fg-3,#8A6854)]">{String(index + 1).padStart(2, "0")}</span>
                    <span className="min-w-0 flex-1 break-words text-[13px] font-semibold leading-5">{campus.name}</span>
                    <span className="shrink-0 font-mono text-[12px] font-bold tabular-nums text-[color:var(--ember,#E85D04)]">{campus.founders.toLocaleString("en-US")}</span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
          <section className="px-3 py-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--fg-3,#8A6854)]">People</p>
              <a href="/founders" className="inline-flex min-h-8 items-center text-[12px] font-semibold text-[color:var(--ember,#E85D04)]">Full index</a>
            </div>
            {status === "loading" ? <p className="mt-1 text-[13px] text-[color:var(--fg-2,#5C4030)]">Loading founders</p> : null}
            {status === "error" ? <p className="mt-1 text-[13px] text-[color:var(--fg-2,#5C4030)]">The founder index did not load.</p> : null}
            <ul>
              {people.map((person) => (
                <li key={person.id} className="border-t border-[color:var(--line,#F0D7C2)] py-1" data-founder-card="">
                  <a href={`/founder/discover?founder=${encodeURIComponent(person.id)}`} className="flex items-start gap-2">
                    <RailMark name={person.company || person.name} companyId={person.companyId} />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-[14px] font-semibold leading-5 text-[color:var(--fg,#2A1A10)]">{person.name}</span>
                      <span className="block break-words text-[12px] leading-4 text-[color:var(--fg-2,#5C4030)]">
                        {[person.campus, person.company].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
          {programs.length > 0 ? (
            <section className="border-t border-[color:var(--line,#F0D7C2)] px-3 py-1.5">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--fg-3,#8A6854)]">Programs</p>
              <ul>
                {programs.map(([label, count]) => (
                  <li key={label} className="flex items-baseline gap-2 py-0.5">
                    <span className="min-w-0 flex-1 break-words text-[13px] leading-5">{label}</span>
                    <span className="shrink-0 font-mono text-[12px] font-bold tabular-nums text-[color:var(--ember,#E85D04)]">{count.toLocaleString("en-US")}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {signals.length > 0 ? (
            <section className="border-t border-[color:var(--line,#F0D7C2)] px-3 py-1.5">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--fg-3,#8A6854)]">Recent signals</p>
              <ul>
                {signals.map((item) => (
                  <li key={item.id} className="py-0.5">
                    <p className="break-words text-[13px] font-semibold leading-5">{item.event.trim() || item.campus}</p>
                    <p className="break-words text-[12px] leading-4 text-[color:var(--fg-3,#8A6854)]">
                      {item.campus}
                      {item.tag ? ` · ${item.tag}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

function markInitials(name: string): string {
  const parts = name.replace(/[^a-zA-Z0-9\s]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
}

function RailMark({ name, companyId }: { name: string; companyId: string | null }) {
  const [ok, setOk] = useState(Boolean(companyId));
  const src = companyId ? `/company-logos/${companyId}.webp` : "";
  if (src && ok) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={18}
        height={18}
        className="mt-0.5 h-[18px] w-[18px] shrink-0 rounded-full border border-[color:var(--line,#F0D7C2)] bg-[#FFF4E8] object-contain"
        onError={() => setOk(false)}
        onLoad={(event) => {
          if (logoLooksBlank(event.currentTarget)) setOk(false);
        }}
      />
    );
  }
  return (
    <span className="mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-[#FFE4CC] font-mono text-[8px] font-bold text-[#9A3412]" aria-hidden>
      {markInitials(name)}
    </span>
  );
}

function MapFoldSheet({
  tabs,
  peak,
  founders,
  deck,
  peek,
  filterKeep,
  campuses,
  campusId,
  onSelectCampus,
  onClearCampus,
  search,
}: {
  tabs: ReactNode;
  peak: ReactNode;
  founders: ReactNode;
  deck: ReactNode;
  peek: ReactNode;
  filterKeep: ReactNode;
  campuses: TopCampus[];
  campusId: string | null;
  onSelectCampus: (id: string) => void;
  onClearCampus: () => void;
  search: ReactNode;
}) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);
  const heightRef = useRef(108);
  const springRef = useRef<number | null>(null);
  // r53b: compact peek so ≥80% of the home map stays unobstructed @375.
  // r59: spring-settle on expand / snap; drag stays 1:1 with the finger.
  const REST = 108;
  const DECK = 300;
  const [height, setHeight] = useState(REST);
  useEffect(() => { heightRef.current = height; }, [height]);
  const minH = 100;
  const clampH = (h: number) => {
    const max = typeof window !== "undefined" ? Math.round(window.innerHeight * 0.82) : 560;
    return Math.max(minH, Math.min(max, h));
  };
  const mode: "peek" | "deck" | "expanded" =
    height >= DECK + 40 ? "expanded" : height >= REST + 36 ? "deck" : "peek";

  const cancelSpring = () => {
    if (springRef.current != null) {
      cancelAnimationFrame(springRef.current);
      springRef.current = null;
    }
  };

  const springTo = (targetRaw: number) => {
    const target = clampH(targetRaw);
    cancelSpring();
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setHeight(target);
      return;
    }
    // Critically damped-ish spring (Emil/Apple: interruptible, no bounce on settle).
    const stiffness = 180;
    const damping = 26;
    let v = 0;
    let h = heightRef.current;
    const tick = () => {
      const dt = 1 / 60;
      const a = -stiffness * (h - target) - damping * v;
      v += a * dt;
      // Keep Euler stable on coarse frames.
      if (v > 6000) v = 6000;
      if (v < -6000) v = -6000;
      h += v * dt;
      if (Math.abs(h - target) < 0.75 && Math.abs(v) < 8) {
        setHeight(target);
        springRef.current = null;
        return;
      }
      setHeight(clampH(h));
      springRef.current = requestAnimationFrame(tick);
    };
    springRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    const onResize = () => setHeight((h) => clampH(h));
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      cancelSpring();
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-fold-sheet-mode", mode);
    return () => {
      document.documentElement.removeAttribute("data-fold-sheet-mode");
    };
  }, [mode]);

  const expandToDeck = () => {
    // Tap expand must flip React mode immediately (density + feel). Drag snaps still spring.
    cancelSpring();
    setHeight(clampH(DECK));
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    cancelSpring();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { startY: e.clientY, startH: heightRef.current };
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    setHeight(clampH(drag.startH + (drag.startY - e.clientY)));
  };
  const onPointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const h = heightRef.current;
    if (h < REST + 24) springTo(REST);
    else if (h < DECK + 24) springTo(DECK);
    else {
      const max = typeof window !== "undefined" ? Math.round(window.innerHeight * 0.82) : 560;
      springTo(max);
    }
  };

  return (
    <div
      ref={sheetRef}
      className="relative z-0 mt-2 lg:hidden"
      data-fold-map-sheet=""
      data-fold-sheet-mode={mode}
      data-fold-sheet-rest={String(REST)}
    >
      <div
        className="home-float pointer-events-auto flex flex-col overflow-visible"
        data-fold-sheet-panel=""
      >
        <div
          className={`flex shrink-0 cursor-grab touch-none items-center justify-center py-1 active:cursor-grabbing ${mode === "peek" ? "hidden" : ""}`}
          data-fold-sheet-handle=""
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          role="separator"
          aria-orientation="horizontal"
          aria-label="Drag sheet"
        >
          <span data-fold-sheet-grab="" className="h-1.5 w-12 rounded-full bg-[color:var(--cobalt,#2F4FD8)]/70" />
        </div>
        <div className="min-h-0 px-3 pb-2" data-fold-sheet-body="">
          {mode === "peek" ? (
            <div data-fold-sheet-peek="" data-fold-founders-col="">
              <div onClick={expandToDeck}>{tabs}</div>
              {peek}
            </div>
          ) : null}
          {mode === "peek" ? null : (
            <div className="bg-[color:var(--bg-raised,#FFFBF6)] pb-1.5">
              <div onClick={expandToDeck}>{tabs}</div>
              <MobileCampusSegments
                campuses={campuses}
                selectedId={campusId}
                onSelect={onSelectCampus}
                onClear={onClearCampus}
                kicker={campuses.some((campus) => campus.pitchbookRank != null) ? "PitchBook 2026" : "Schools"}
              />
            </div>
          )}
          {mode === "peek" ? (
            <div className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0" aria-hidden="true">
              <div className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0" aria-hidden="true" data-fold-sheet-filter-keep="">
                {filterKeep}
              </div>
              {/* Peak + deck stay mounted but inert so density can expand into a real surface */}
              <div className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0" aria-hidden="true" data-fold-sheet-deck-keep="">
                {peak}
                {deck}
              </div>
            </div>
          ) : null}
          {mode === "deck" ? (
            <div className="mt-1" data-fold-sheet-deck="" data-fold-founders-col="">
              <div className="mb-1" data-fold-peak-in-rail="" data-fold-sheet-peak="">
                {peak}
              </div>
              {deck}
              <div className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0" aria-hidden="true" data-fold-sheet-filter-keep="">
                {filterKeep}
              </div>
            </div>
          ) : null}
          {mode === "expanded" ? (
            <div className="mt-1 space-y-2" data-fold-sheet-founders="" data-fold-founders-col="">
              <div data-fold-peak-in-rail="" data-fold-sheet-peak="">
                {peak}
              </div>
              {search}
              {founders}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}





export function SampleHomeClient(props: {
  feed: Feed;
  sector?: string;
  kind?: string;
  campusId?: string;
  campusName?: string;
  campusTotal: number | null;
  query: string;
  order: DirectorySort;
  pages: number;
  shown: DirectoryCard[];
  total: number;
  sectors: DirectoryFilter[];
  kinds: DirectoryFilter[];
  campuses: CampusOpt[];
  stats: HeroStats;
  cardCount: number;
  signalCompanyCount: number;
  foundersListed: number;
  foundersIndexed: number;
  newestHome: { label: string; detail: string } | null;
  peakShell?: PeakShell | null;
  directoryUrl?: string;
  place?: "map" | "explore";
  facetExtras?: Record<string, string | number | boolean | null | undefined>;
}) {
  const {
    feed,
    sector,
    kind,
    campusId,
    campusName,
    campusTotal,
    query,
    order,
    pages,
    shown,
    total,
    sectors,
    kinds,
    campuses,
    stats,
    cardCount,
    foundersListed,
    foundersIndexed,
    directoryUrl = "/data/sample-directory.json",
    place = "map",
  facetExtras,
  } = props;

  const [companies, setCompanies] = useState<FacetCompany[]>([]);
  const [founders, setFounders] = useState<FounderLead[]>([]);
  const [founderStatus, setFounderStatus] = useState<"loading" | "ready" | "error">("loading");
  const [founderQuery, setFounderQuery] = useState("");
  const [ready, setReady] = useState(false);
  const search = useSearchParams();
  const router = useRouter();
  const mapCampusId = search.get("campus");
  const listed = feed === "directory" || feed === "leaderboard";
  const topCampuses = useMemo<TopCampus[]>(() => {
    const pitchbook = rankedByUndergrad(campuses);
    const source = pitchbook.length
      ? pitchbook.slice(0, 5)
      : [...campuses]
          .filter((c) => (c.founders ?? 0) > 0)
          .sort((a, b) => b.founders - a.founders || a.name.localeCompare(b.name))
          .slice(0, 5);
    return source.map((c) => ({
      id: c.id,
      name: shortCampusLabel(c.id, c.name),
      founders: c.founders,
      pitchbookRank: c.pitchbookRank ?? null,
      pitchbookFounders: c.pitchbookFounders ?? null,
    }));
  }, [campuses]);

  useEffect(() => {
    let dead = false;
    void fetchSampleDirectory(directoryUrl).then((cards) => {
      if (dead) return;
      setCompanies(cards);
      setReady(true);
    }).catch(() => {
      if (!dead) setReady(true);
    });
    void (async () => {
      const attempts = 3;
      for (let i = 0; i < attempts; i++) {
        try {
          const boot = i === 0 ? (window as Window & { __foundersPromise?: Promise<FounderLead[]> }).__foundersPromise : undefined;
          const data = boot
            ? await boot
            : await (async () => {
                const res = await fetch("/data/founders.json");
                if (!res.ok) throw new Error(String(res.status));
                return (await res.json()) as FounderLead[];
              })();
          if (!Array.isArray(data) || data.length === 0) throw new Error("empty founders");
          if (dead) return;
          setFounders(data);
          setFounderStatus("ready");
          return;
        } catch {
          if (i < attempts - 1) await new Promise((r) => setTimeout(r, 200 * (i + 1)));
        }
      }
      if (!dead) setFounderStatus("error");
    })();
    return () => {
      dead = true;
    };
  }, [directoryUrl]);

  const mapCampusName =
    mapCampusId && mapCampusId !== "missing"
      ? campuses.find((campus) => campus.id === mapCampusId)?.name ?? null
      : null;

  const highlightCampusIds = useMemo(
    () => campusIdsForSearch(founders, founderQuery, campuses),
    [founders, founderQuery, campuses],
  );

  const clearCampus = () => {
    const next = new URLSearchParams(search.toString());
    next.delete("campus");
    next.set("sample", "1");
    router.push(`/?${next.toString()}`);
  };

  const selectCampus = (id: string) => {
    const next = new URLSearchParams(search.toString());
    next.delete("feed");
    next.delete("university");
    next.set("sample", "1");
    if (!id) next.delete("campus");
    else next.set("campus", id);
    router.push(`/?${next.toString()}`);
  };

  const investableCompanyIds = useMemo(
    () => new Set(companies.map((company) => company.id).filter(Boolean)),
    [companies],
  );

  const openLane = useMemo(
    () =>
      founders.length && investableCompanyIds.size
        ? buildOpenLaneShell(founders, investableCompanyIds)
        : null,
    [founders, investableCompanyIds],
  );

  const founderPeek = (
    <ul className="mt-1" data-home-phone-founders="">
      {founders
        .filter((founder) => founderMatches(founder, { text: founderQuery, campusId: mapCampusId || null }))
        .slice(0, 3)
        .map((founder) => (
          <li key={founder.id} className="border-t border-[color:var(--line,#F0D7C2)] py-1.5" data-founder-card="">
            <a href={`/founder/discover?founder=${encodeURIComponent(founder.id)}`} className="block break-words text-[15px] font-semibold leading-5" data-founder-name="">
              {founder.name}
            </a>
            <p className="break-words text-[12px] leading-4 text-[color:var(--fg-2,#5C4030)]">
              {[founder.campus, founder.company].filter(Boolean).join(" · ")}
            </p>
          </li>
        ))}
      {founderStatus === "loading" ? <li className="py-1 text-[13px] text-[color:var(--fg-2,#5C4030)]">Loading founders</li> : null}
    </ul>
  );
  const founderDeck = (
    <MobileFounderDeck
      founders={founders}
      status={founderStatus}
      query={founderQuery}
      campusId={mapCampusId}
      openLane={openLane}
      investableCompanyIds={investableCompanyIds}
    />
  );
  return (
    <div className="sample-paper" {...(place === "map" ? { "data-fold-root": "" } : {})} data-directory-ready={ready ? "1" : "0"}>
      <SampleTheme />
      {place === "map" ? (
        <div className="px-3 pb-6 pt-0 sm:px-4 lg:px-4 lg:pt-2" data-fold-hierarchy="" data-fold-mobile-bleed="" data-fold-desk-bleed="1" data-fold-investor-first="1">
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-3" data-fold-stack="" data-fold-bigmap="">
            <div className="relative min-w-0" data-fold-globe-col="" data-fold-map-stage-wrap="">
              <GlobeHero
                stats={stats}
                showGlobe={feed !== "world"}
                companies={companies}
                companyCount={cardCount}
                foundersListed={foundersListed}
                foundersIndexed={foundersIndexed}
                highlightCampusIds={highlightCampusIds}
              />
              <MapFoldSheet
                tabs={<p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ember,#E85D04)]">Founders</p>}
                campuses={topCampuses}
                campusId={mapCampusId}
                onSelectCampus={selectCampus}
                onClearCampus={clearCampus}
                peak={null}
                deck={founderDeck}
                peek={founderPeek}
                filterKeep={
                  <FounderResults
                    founders={founders}
                    status={founderStatus}
                    query={founderQuery}
                    campusId={mapCampusId}
                    campusName={mapCampusName}
                    foundersListed={foundersListed}
                    foundersIndexed={foundersIndexed}
                    filtersOnly
                    onClearCampus={clearCampus}
                    onMissingCampus={() => {
                      const next = new URLSearchParams(search.toString());
                      next.set("sample", "1");
                      next.set("campus", "missing");
                      router.push(`/?${next.toString()}`);
                    }}
                  />
                }
                search={<FounderSearchBar query={founderQuery} onQuery={setFounderQuery} />}
                founders={
                  <FounderResults
                    founders={founders}
                    status={founderStatus}
                    query={founderQuery}
                    campusId={mapCampusId}
                    campusName={mapCampusName}
                    foundersListed={foundersListed}
                    foundersIndexed={foundersIndexed}
                    onClearCampus={clearCampus}
                    onMissingCampus={() => {
                      const next = new URLSearchParams(search.toString());
                      next.set("sample", "1");
                      next.set("campus", "missing");
                      router.push(`/?${next.toString()}`);
                    }}
                  />
                }
              />
            </div>
            <HomeRail
              founders={founders}
              status={founderStatus}
              query={founderQuery}
              onQuery={setFounderQuery}
              campusId={mapCampusId}
              campusName={mapCampusName}
              campuses={topCampuses}
              week={stats.week}
              companies={companies}
              foundersIndexed={foundersIndexed}
              onSelectCampus={selectCampus}
              onClearCampus={clearCampus}
            />
          </div>
        </div>
      ) : null}
      {place === "explore" ? (
      <section id="browse" className="scroll-mt-14 border-t border-line px-3 pb-10 pt-1 sm:px-5 md:pt-2">
        <div className="mx-auto w-full max-w-[1280px]">
          <div
            className="hidden flex-wrap items-center gap-x-1 border-b border-line md:flex"
            role="tablist"
            aria-label="Views"
          >
            <Tab href={browseHref({ feed: "directory", sector, kind, campus: campusId, q: query, sort: order })} active={feed === "directory"}>
              Companies
            </Tab>
            <Tab href={browseHref({ feed: "leaderboard", sector, kind, campus: campusId, q: query })} active={feed === "leaderboard"}>
              By signals
            </Tab>
            <Tab href={discoveryHref("map", new URLSearchParams(search))} active={false}>
              Map
            </Tab>
          </div>
        </div>
        {listed ? (
          <SampleInstrumentBrowse
            feed={feed}
            cards={shown}
            total={total}
            pages={pages}
            sector={sector}
            kind={kind}
            campus={campusId}
            campusName={campusName}
            campusTotal={campusTotal}
            query={query}
            sort={order}
            sectors={sectors}
            kinds={kinds}
            campuses={campuses}
            companies={companies}
            moreHref={browseHref({
              feed,
              sector,
              kind,
              campus: campusId,
              q: query,
              sort: feed === "directory" ? order : undefined,
              more: pages + 1,
            })}
            clearCampusHref={browseHref({ feed, sector, kind, q: query, sort: feed === "directory" ? order : undefined, facets: facetExtras as Partial<UrlFacetState> | undefined })}
            initialFacets={{
              sector: sector ?? null,
              kind: kind ?? null,
              campus: campusId ?? null,
              query: query ?? "",
              stage: (facetExtras?.stage as string) ?? null,
              status: (facetExtras?.status as UrlFacetState["status"]) ?? null,
              flag: (facetExtras?.flag as UrlFacetState["flag"]) ?? null,
              foundedYear: typeof facetExtras?.foundedYear === "number" ? facetExtras.foundedYear : null,
              yearMissing: Boolean(facetExtras?.yearMissing),
              hqRegion: (facetExtras?.hqRegion as string) ?? null,
              country: (facetExtras?.country as string) ?? null,
              recency: (facetExtras?.recency as UrlFacetState["recency"]) ?? null,
              sectorMissing: Boolean(facetExtras?.sectorMissing),
            }}
          />
        ) : null}
      </section>
      ) : null}
    </div>
  );
}

function Tab({ href, active, children }: { href: string; active: boolean; children: string }) {
  return (
    <Link href={href} role="tab" aria-selected={active} className={`grid h-9 min-h-9 min-w-11 place-items-center border-b-2 px-2 font-mono text-[12px] font-medium uppercase tracking-[0.08em] sm:h-11 sm:min-h-11 sm:px-2.5 sm:text-[14px] ${active ? "border-[color:var(--cobalt,#2F4FD8)] text-[color:var(--fg,#0B0E17)]" : "border-transparent text-[color:var(--fg-3,#5C647A)] hover:text-[color:var(--fg-2,#3F465C)]"}`}>
      {children}
    </Link>
  );
}
