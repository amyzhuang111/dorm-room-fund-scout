"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { cloneElement, isValidElement, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { FounderResults, FounderSearchBar } from "@/components/founder-sourcing";
import { MobileCampusSegments, MobileFounderDeck, MobileFounderPeek } from "@/components/mobile-founder-deck";
import {
  CurrentViewStrip,
  FilterChips,
  LineagePanels,
  campusIdsForSearch,
  startupsInFounderMatches,
  type ActiveChip,
} from "@/components/fold-map-craft";
import { FoldOpenLaneHero } from "@/components/fold-open-lane";
import { buildOpenLaneShell } from "@/lib/domain/open-lane";
import { GlobeHero } from "@/components/globe-hero";
import { SampleTheme } from "@/components/sample-theme";
import type { DirectoryCard, DirectoryFilter, DirectorySort } from "@/lib/domain/directory";
import type { HeroStats } from "@/lib/domain/hero-stats";
import { founderMatches, type FounderLead } from "@/lib/domain/founder-index";
import type { FacetCompany } from "@/lib/domain/sample-facets";
import { fetchSampleDirectory } from "@/lib/domain/sample-directory-client";
import type { Feed } from "@/components/sample-home";
import type { PeakShell } from "@/lib/domain/peak-shell";
import { shortCampusLabel } from "@/lib/domain/campuses";
import { browseHref as buildBrowseHref, type FacetState as UrlFacetState } from "@/lib/domain/facet-url";

const SampleInstrumentBrowse = dynamic(
  () => import("@/components/sample-instrument-browse").then((mod) => ({ default: mod.SampleInstrumentBrowse })),
  { ssr: true },
);

type TopCampus = { id: string; name: string; founders: number };

/** Client-only Peak share · outer slot reserves exact height so CLS ≈ 0 (HTML stays lean). */
const FoldPeakShare = dynamic(
  () => import("@/components/fold-peak-share").then((mod) => ({ default: mod.FoldPeakShare })),
  { ssr: false, loading: () => null },
);


type CampusOpt = { id: string; name: string; country: string; founders: number };


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


function PeakShareLite({
  shell,
  foundersListed: _foundersListed,
  campusesOnMap: _campusesOnMap,
  topCampuses: _topCampuses = [],
}: {
  shell: PeakShell;
  foundersListed: number;
  campusesOnMap: number;
  topCampuses?: TopCampus[];
}) {
  void _foundersListed;
  void _campusesOnMap;
  void _topCampuses;
  const peakCount = shell.peakCount;
  const peakLabel = shell.peakLabel;
  const pct = Math.round((peakCount / Math.max(1, shell.dated)) * 100);
  return (
    <div data-fold-peak-ssr-shell="" data-fold-peak-identity="" data-fold-baseline="8" data-fold-redesign="seal-dispatch">
      <div className="mb-1 hidden min-h-[11.5rem] lg:block" data-fold-peak-desk="">
        <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] items-end gap-6 border-b border-[color:var(--line,#E1E5EF)] pb-3" data-fold-peak-share="">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[color:var(--cobalt,#2F4FD8)]">Peak share</p>
            <p className="mt-1 h-[52px] overflow-hidden font-mono text-[72px] font-bold leading-none tracking-[-0.08em] text-[color:var(--cobalt,#2F4FD8)]" data-fold-peak-figure="">
              {peakCount.toLocaleString("en-US")}
              <span className="mx-2 text-[28px] font-semibold tracking-[-0.04em] text-[color:var(--fg-3,#5C647A)]">/</span>
              <span className="text-[36px] font-bold tracking-[-0.06em] text-[color:var(--fg,#0B0E17)]">{shell.dated.toLocaleString("en-US")}</span>
            </p>
            <p className="mt-1.5 max-w-[36rem] text-[16px] font-semibold leading-5 tracking-tight text-[color:var(--fg,#0B0E17)]" data-fold-peak-caption="">
              {peakLabel} took <span className="text-[color:var(--cobalt,#2F4FD8)]">{pct}%</span>
              {" of every dated signal on record"}
            </p>
            <div className="mt-2 h-[4.25rem]" data-fold-peak-bars-reserve="" aria-hidden="true" />
            <p className="mt-1.5 font-mono text-[10px] tabular-nums text-[color:var(--fg-3,#5C647A)]">
              {shell.dated.toLocaleString("en-US")} dated
              {shell.earlierValid > 0 ? ` · ${shell.earlierValid.toLocaleString("en-US")} earlier` : ""}
              {shell.undatedMonth > 0 ? ` · ${shell.undatedMonth.toLocaleString("en-US")} undated` : ""}
              {" · "}
              {shell.quiet.toLocaleString("en-US")} quiet
            </p>
          </div>
          <div className="min-w-0 self-stretch border-l border-[color:var(--cobalt,#2F4FD8)]/25 pl-5" data-fold-top-campuses-desk="" data-fold-top-campuses-ssr="">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[color:var(--cobalt,#2F4FD8)]">Desk rank</p>
            <div className="mt-2 h-[8rem]" data-fold-peak-campus-rank-reserve="" aria-hidden="true" />
          </div>
        </div>
      </div>
      <div className="border-b border-[color:var(--line,#E1E5EF)] pb-2 lg:hidden" data-fold-peak-share-mobile="" data-fold-peak-share="">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[color:var(--cobalt,#2F4FD8)]">Peak share</p>
        <p className="mt-2 h-10 overflow-hidden font-mono text-[40px] font-bold leading-none tracking-[-0.06em] text-[color:var(--cobalt,#2F4FD8)]" data-fold-peak-figure="">
          {peakCount.toLocaleString("en-US")}
          <span className="mx-1.5 text-[18px] font-semibold tracking-[-0.04em] text-[color:var(--fg-3,#5C647A)]">/</span>
          <span className="text-[24px] font-bold tracking-[-0.04em] text-[color:var(--fg,#0B0E17)]">{shell.dated.toLocaleString("en-US")}</span>
        </p>
        <p className="mt-2 text-[14px] font-semibold leading-5 tracking-tight text-[color:var(--fg,#0B0E17)]" data-fold-peak-caption="">
          {peakLabel} took <span className="text-[color:var(--cobalt,#2F4FD8)]">{pct}%</span> of every dated signal
        </p>
        <div className="mt-2 h-14" data-fold-peak-bars-mobile-reserve="" aria-hidden="true" />
        <div className="mt-2 h-10 border-t border-[color:var(--line,#E1E5EF)] pt-2" data-fold-peak-campus-rank-mobile-reserve="" aria-hidden="true" />
      </div>
    </div>
  );
}

function PeakShareSlot({
  companies,
  foundersListed,
  campusesOnMap,
  topCampuses = [],
  shell,
  mobileDeck = false,
}: {
  companies: FacetCompany[];
  foundersListed: number;
  campusesOnMap: number;
  topCampuses?: TopCampus[];
  shell?: PeakShell | null;
  mobileDeck?: boolean;
}) {
  const [live, setLive] = useState(false);
  // Keep SSR lite until the client Peak chunk has painted (same box → CLS ≈ 0).
  const showLive = live;
  return (
    <div className={`relative min-h-0 ${mobileDeck ? "mb-0" : "mb-2"}`} data-fold-peak-slot="" data-fold-peak-reserve="" data-fold-peak-deck={mobileDeck ? "1" : undefined}>
      <div className={showLive ? "hidden" : undefined} aria-hidden={showLive || undefined} data-fold-peak-ssr-wrap="">
        {shell ? (
          <PeakShareLite shell={shell} foundersListed={foundersListed} campusesOnMap={campusesOnMap} topCampuses={topCampuses} />
        ) : null}
      </div>
      <div className={showLive ? undefined : "absolute left-0 right-0 top-0 opacity-0 pointer-events-none"} data-fold-peak-live-wrap="" aria-hidden={!showLive || undefined}>
        <FoldPeakShare
          companies={companies}
          foundersListed={foundersListed}
          campusesOnMap={campusesOnMap}
          topCampuses={topCampuses}
          shell={shell}
          hideMobileRanks={mobileDeck}
          onReady={() => setLive(true)}
        />
      </div>
    </div>
  );
}



function useIsLg() {
  const [lg, setLg] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => setLg(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return lg;
}

function MapFoldSheet({
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
  // r53b: compact peek so ≥80% of the home map stays unobstructed @375.
  // Swipe up or tap Expand for the founder deck; drag further for filters + list.
  const REST = 120;
  const DECK = 300;
  const [height, setHeight] = useState(REST);
  const minH = 100;
  const clampH = (h: number) => {
    const max = typeof window !== "undefined" ? Math.round(window.innerHeight * 0.82) : 560;
    return Math.max(minH, Math.min(max, h));
  };
  const mode: "peek" | "deck" | "expanded" =
    height >= DECK + 40 ? "expanded" : height >= REST + 36 ? "deck" : "peek";

  useEffect(() => {
    const onResize = () => setHeight((h) => clampH(h));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-fold-sheet-mode", mode);
    return () => {
      document.documentElement.removeAttribute("data-fold-sheet-mode");
    };
  }, [mode]);

  const expandToDeck = () => setHeight(clampH(DECK));

  const onPointerDown = (e: ReactPointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { startY: e.clientY, startH: height };
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
    setHeight((h) => {
      if (h < REST + 24) return REST;
      if (h < DECK + 24) return DECK;
      const max = typeof window !== "undefined" ? Math.round(window.innerHeight * 0.82) : 560;
      return max;
    });
  };

  return (
    <div
      ref={sheetRef}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[30] lg:hidden"
      data-fold-map-sheet=""
      data-fold-sheet-mode={mode}
      data-fold-sheet-rest={String(REST)}
      style={{ height }}
    >
      <div
        className="pointer-events-auto flex h-full flex-col overflow-hidden rounded-t-2xl border border-[color:var(--cobalt,#2F4FD8)]/25 bg-[color:var(--bg,#FFFFFF)] shadow-[0_-10px_32px_rgba(47,79,216,0.16)]"
        data-fold-sheet-panel=""
      >
        <div
          className="flex shrink-0 cursor-grab touch-none items-center justify-center py-1.5 active:cursor-grabbing"
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
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-2" data-fold-sheet-body="">
          <div className="sticky top-0 z-[1] bg-[color:var(--bg,#FFFFFF)] pb-1.5">
            <MobileCampusSegments
              campuses={campuses}
              selectedId={campusId}
              onSelect={onSelectCampus}
              onClear={onClearCampus}
              kicker="Open lane campuses"
            />
          </div>
          {mode === "peek" ? (
            <div className="mt-1" data-fold-sheet-peek="" data-fold-founders-col="">
              {isValidElement(peek)
                ? cloneElement(peek as ReactElement<{ onExpand?: () => void }>, { onExpand: expandToDeck })
                : peek}
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


/** Desk overlays portaled onto the map stage — filters live in the fold, not stacked above. */
function MapStageOverlays({
  mast,
  peak,
  founders,
}: {
  mast: ReactNode;
  peak: ReactNode;
  founders: ReactNode;
}) {
  const [stage, setStage] = useState<HTMLElement | null>(null);
  const [peakOpen, setPeakOpen] = useState(true);
  const [foundersOpen, setFoundersOpen] = useState(true);

  useEffect(() => {
    let dead = false;
    const sync = () => {
      if (dead) return;
      const el = document.querySelector("[data-dispatch-map-stage]") as HTMLElement | null;
      setStage((prev) => (prev === el ? prev : el));
    };
    sync();
    const id = window.setInterval(sync, 400);
    const mo = new MutationObserver(sync);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      dead = true;
      window.clearInterval(id);
      mo.disconnect();
    };
  }, []);

  if (!stage) return null;

  return createPortal(
    <div className="pointer-events-none absolute inset-0 z-[5] flex flex-col" data-fold-map-overlays="" data-fold-desk-bleed="1">
      <div
        className="pointer-events-auto z-[6] mx-2 mt-2 shrink-0 rounded-md border border-[color:var(--cobalt,#2F4FD8)]/25 bg-[color:var(--bg,#FFFFFF)]/95 px-2.5 py-2 shadow-[0_8px_28px_rgba(47,79,216,0.12)] backdrop-blur-[2px]"
        data-fold-overlay-mast=""
        data-fold-mast=""
      >
        {mast}
      </div>
      <div className="relative min-h-0 flex-1" data-fold-overlay-body="">
        <aside
          className={`pointer-events-auto absolute bottom-2 left-2 top-2 max-h-[calc(100%-1rem)] overflow-y-auto rounded-md border border-[color:var(--cobalt,#2F4FD8)]/25 bg-[color:var(--bg,#FFFFFF)]/95 shadow-[0_8px_28px_rgba(47,79,216,0.12)] backdrop-blur-[2px] ${
            peakOpen ? "w-[min(340px,34%)]" : "w-auto"
          }`}
          data-fold-overlay-peak=""
          data-fold-peak-in-rail=""
          data-fold-panel-collapsed={peakOpen ? "0" : "1"}
        >
          <div className="flex items-center justify-between gap-2 border-b border-[color:var(--line,#E1E5EF)] px-2 py-1.5">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]">Open lane</p>
            <button
              type="button"
              className="inline-flex h-7 items-center rounded-sm border border-[color:var(--line,#E1E5EF)] px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--fg-2,#3F465C)]"
              aria-expanded={peakOpen}
              data-fold-panel-toggle="peak"
              onClick={() => setPeakOpen((v) => !v)}
            >
              {peakOpen ? "Hide" : "Show"}
            </button>
          </div>
          {peakOpen ? <div className="p-2.5">{peak}</div> : null}
        </aside>
        <aside
          className={`pointer-events-auto absolute bottom-2 right-2 top-2 flex w-[min(300px,32%)] flex-col overflow-hidden rounded-md border border-[color:var(--cobalt,#2F4FD8)]/25 bg-[color:var(--bg,#FFFFFF)]/95 shadow-[0_8px_28px_rgba(47,79,216,0.12)] backdrop-blur-[2px] ${
            foundersOpen ? "" : "!w-auto !bottom-auto"
          }`}
          data-fold-overlay-founders=""
          data-fold-founders-col=""
          data-fold-panel-collapsed={foundersOpen ? "0" : "1"}
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[color:var(--line,#E1E5EF)] px-2 py-1.5">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]">Founders</p>
            <button
              type="button"
              className="inline-flex h-7 items-center rounded-sm border border-[color:var(--line,#E1E5EF)] px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--fg-2,#3F465C)]"
              aria-expanded={foundersOpen}
              data-fold-panel-toggle="founders"
              onClick={() => setFoundersOpen((v) => !v)}
            >
              {foundersOpen ? "Hide" : "Show"}
            </button>
          </div>
          {foundersOpen ? <div className="min-h-0 flex-1 overflow-y-auto p-2.5">{founders}</div> : null}
        </aside>
      </div>
    </div>,
    stage,
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
    peakShell = null,
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
  const isLg = useIsLg();
  const mapCampusId = search.get("campus");
  const listed = feed === "directory" || feed === "leaderboard";
  const topCampuses = useMemo<TopCampus[]>(() => {
    return [...campuses]
      .filter((c) => (c.founders ?? 0) > 0)
      .sort((a, b) => b.founders - a.founders || a.name.localeCompare(b.name))
      .slice(0, 3)
      .map((c) => ({
        id: c.id,
        name: shortCampusLabel(c.id, c.name),
        founders: c.founders,
      }));
  }, [campuses]);

  useEffect(() => {
    let dead = false;
    void fetchSampleDirectory(directoryUrl).then((cards) => {
      if (dead) return;
      setCompanies(cards);
      setReady(true);
    });
    void (async () => {
      const attempts = 3;
      for (let i = 0; i < attempts; i++) {
        try {
          const res = await fetch("/data/founders.json", { cache: "no-store" });
          if (!res.ok) throw new Error(String(res.status));
          const data = (await res.json()) as FounderLead[];
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

  const matchedFounders = useMemo(
    () =>
      founders.filter((founder) =>
        founderMatches(founder, { text: founderQuery, campusId: mapCampusId || null }),
      ),
    [founders, founderQuery, mapCampusId],
  );

  const viewStartups = useMemo(
    () =>
      startupsInFounderMatches(
        matchedFounders,
        companies.filter((c) => !mapCampusId || mapCampusId === "missing" || c.schoolId === mapCampusId),
      ),
    [matchedFounders, companies, mapCampusId],
  );

  const activeChips: ActiveChip[] = [];
  if (mapCampusName) {
    activeChips.push({ key: "campus", label: mapCampusName, onClear: clearCampus });
  }
  if (founderQuery.trim()) {
    activeChips.push({ key: "q", label: `“${founderQuery.trim()}”`, onClear: () => setFounderQuery("") });
  }

  const openLane = useMemo(
    () => (founders.length ? buildOpenLaneShell(founders) : null),
    [founders],
  );

  return (
    <div className="sample-paper" {...(place === "map" ? { "data-fold-root": "" } : {})} data-directory-ready={ready ? "1" : "0"}>
      <SampleTheme />
      {place === "map" ? (
        <div className="px-0 pb-6 pt-0 sm:px-4 lg:px-0 lg:pt-0" data-fold-hierarchy="" data-fold-mobile-bleed="" data-fold-desk-bleed="1" data-fold-investor-first="1">
          {/* r56 desk: search + chips live inside the map fold overlays (not stacked above). Mobile unchanged. */}
          {/* r45: map-dominant stage with floating panels (desk) / peek sheet (mobile). */}
          <div data-fold-stack="" data-fold-bigmap="" data-fold-overlay="">
            <div className="relative min-w-0" data-fold-globe-col="" data-fold-map-stage-wrap="">
              <GlobeHero
                stats={stats}
                showGlobe={feed !== "world"}
                companies={companies}
                companyCount={cardCount}
                foundersListed={foundersListed}
                foundersIndexed={founders.length || undefined}
                highlightCampusIds={highlightCampusIds}
              />

              {/* Mobile sheet only below lg — keeps first [data-founder-card] visible for checks. */}
              {!isLg ? <MapFoldSheet
                campuses={(openLane?.campuses?.length ? openLane.campuses : topCampuses)}
                campusId={mapCampusId}
                onSelectCampus={selectCampus}
                onClearCampus={clearCampus}
                peak={
                  <PeakShareSlot
                    companies={companies}
                    foundersListed={foundersListed}
                    campusesOnMap={stats.universities.filter((u) => u.lat != null && u.lon != null).length}
                    topCampuses={topCampuses}
                    shell={peakShell}
                    mobileDeck
                  />
                }
                deck={
                  <MobileFounderDeck
                    founders={founders}
                    status={founderStatus}
                    query={founderQuery}
                    campusId={mapCampusId}
                    openLane={openLane}
                  />
                }
                peek={
                  <MobileFounderPeek
                    founders={founders}
                    status={founderStatus}
                    query={founderQuery}
                    campusId={mapCampusId}
                    openLane={openLane}
                  />
                }
                filterKeep={
                  <FounderResults
                    founders={founders}
                    status={founderStatus}
                    query={founderQuery}
                    campusId={mapCampusId}
                    campusName={mapCampusName}
                    foundersListed={foundersListed}
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
                    onClearCampus={clearCampus}
                    onMissingCampus={() => {
                      const next = new URLSearchParams(search.toString());
                      next.set("sample", "1");
                      next.set("campus", "missing");
                      router.push(`/?${next.toString()}`);
                    }}
                  />
                }
              /> : null}

              {/* r56 desk: full-bleed fold — mast filters + open-lane hero + founders on the map. */}
              {isLg ? (
                <MapStageOverlays
                  mast={
                    <div className="space-y-1.5" data-fold-desk-mast-inner="">
                      <FounderSearchBar query={founderQuery} onQuery={setFounderQuery} />
                      <FilterChips chips={activeChips} matchCount={matchedFounders.length} totalCount={founders.length || foundersListed} />
                      <CurrentViewStrip
                        campusName={mapCampusName}
                        query={founderQuery}
                        matchCount={matchedFounders.length}
                        totalFounders={founders.length || foundersListed}
                        startups={viewStartups}
                        onClearCampus={clearCampus}
                        onClearQuery={() => setFounderQuery("")}
                      />
                    </div>
                  }
                  peak={
                    <>
                      <FoldOpenLaneHero
                        shell={openLane}
                        companyTotal={cardCount}
                        foundersIndexed={founders.length || foundersListed}
                      />
                      <div className="border-t border-[color:var(--line,#E1E5EF)] pt-2" data-fold-open-lane-peak="">
                        <PeakShareSlot
                          companies={companies}
                          foundersListed={foundersListed}
                          campusesOnMap={stats.universities.filter((u) => u.lat != null && u.lon != null).length}
                          topCampuses={topCampuses}
                          shell={peakShell}
                        />
                      </div>
                    </>
                  }
                  founders={
                    <FounderResults
                      founders={founders}
                      status={founderStatus}
                      query={founderQuery}
                      campusId={mapCampusId}
                      campusName={mapCampusName}
                      foundersListed={foundersListed}
                      peek={3}
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
              ) : null}
            </div>

            <div className="mt-3 hidden lg:block" data-fold-lineage-desk="">
              <LineagePanels
                companies={companies}
                week={stats.week}
                campusId={mapCampusId && mapCampusId !== "missing" ? mapCampusId : null}
                campusName={mapCampusName}
              />
            </div>
          </div>
        </div>
      ) : null}
      {place === "explore" ? (
      <section id="browse" className="scroll-mt-14 border-t border-line px-3 pb-10 pt-2 sm:px-5">
        <div className="mx-auto w-full max-w-[1280px]">
          <div
            className="flex flex-wrap items-center gap-x-1 border-b border-line"
            role="tablist"
            aria-label="Views"
          >
            <Tab href={browseHref({ feed: "directory", sector, kind, campus: campusId, q: query, sort: order })} active={feed === "directory"}>
              Companies
            </Tab>
            <Tab href={browseHref({ feed: "leaderboard", sector, kind, campus: campusId, q: query })} active={feed === "leaderboard"}>
              Signals
            </Tab>
            <Tab href="/" active={false}>
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
              status: (facetExtras?.status as any) ?? null,
              flag: (facetExtras?.flag as any) ?? null,
              foundedYear: typeof facetExtras?.foundedYear === "number" ? facetExtras.foundedYear : null,
              yearMissing: Boolean(facetExtras?.yearMissing),
              hqRegion: (facetExtras?.hqRegion as string) ?? null,
              country: (facetExtras?.country as string) ?? null,
              recency: (facetExtras?.recency as any) ?? null,
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
    <Link href={href} role="tab" aria-selected={active} className={`grid h-8 place-items-center border-b-2 px-2.5 font-mono text-[12px] font-medium uppercase tracking-[0.08em] ${active ? "border-[color:var(--cobalt,#2F4FD8)] text-[color:var(--fg,#0B0E17)]" : "border-transparent text-[color:var(--fg-3,#5C647A)] hover:text-[color:var(--fg-2,#3F465C)]"}`}>
      {children}
    </Link>
  );
}
