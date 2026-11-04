"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadDirectoryClient } from "@/lib/client/directory-cache";
import type { DirectoryCard, DirectoryFilter, DirectorySort } from "@/lib/domain/directory";
import { directoryRank } from "@/lib/domain/directory-rank";
import { whyItsHere } from "@/lib/domain/directory-rank";
import { ellipsisAtBoundary, WRAP_2, WRAP_FULL } from "@/lib/display/ellipsis";
import { campusInk } from "@/lib/display/campus-ink";
import { directoryCardSubtitle, type StatusId } from "@/lib/domain/sample-facets";
import type { FacetCompany } from "@/lib/domain/sample-facets";
import {
  CAMPUS_COUNT_UNIT,
  buildOverlayCounts,
  type OverlayRow,
} from "@/lib/domain/overlay-counts";
import { resolveCampusSlug, shortCampusLabel } from "@/lib/domain/campuses";
import { CampusSeal } from "@/components/campus-seal";
import { MobileListMast } from "@/components/mobile-list-mast";
import { TagChips, type TagChip } from "@/components/tag-chips";
import { stripUrls } from "@/lib/display/strip-urls";
import {
  applyFacets,
  emptyFacets,
  FacetRail,
  IntelligenceBoards,
  LogoMark,
  PANEL,
  ScoutSignalPodium,
  campusFoundersTop,
  campusFoundersRanked,
  topPrograms,
  isYcProgramLabel,
  YC_MEMBERSHIP_EXPECTED,
  type FacetState,
  SignalsLanded,
} from "./sample-instrument";
import { nounFor } from "@/lib/display/plural";
import {
  activeFacetChips,
  browseHref as buildBrowseHref,
  type FacetState as UrlFacetState,
} from "@/lib/domain/facet-url";

type Feed = "directory" | "leaderboard";

function browseHref(opts: {
  feed?: Feed | "world";
  sector?: string;
  kind?: string;
  campus?: string;
  q?: string;
  sort?: DirectorySort;
  more?: number;
  facets?: Partial<UrlFacetState> | UrlFacetState;
  c?: string | null;
}): string {
  return buildBrowseHref({
    feed: opts.feed,
    sort: opts.sort,
    more: opts.more,
    c: opts.c,
    facets: {
      sector: opts.sector ?? null,
      kind: opts.kind ?? null,
      campus: opts.campus ?? null,
      query: opts.q ?? "",
      ...(opts.facets ?? {}),
    },
  });
}

function exportFilteredCsv(rows: FacetCompany[]) {
  const header = [
    "id",
    "name",
    "sector",
    "stage",
    "campus",
    "founded_year",
    "hq",
    "status",
    "signals",
    "latest_signal",
    "program",
    "founders",
  ];
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [header.join(",")];
  for (const row of rows) {
    const status =
      row.operatingStatus === "acquired"
        ? "acquired"
        : row.operatingStatus === "dead"
          ? "closed"
          : "active";
    lines.push(
      [
        esc(row.id),
        esc(row.name),
        esc(row.sector ?? ""),
        esc(row.stage ?? ""),
        esc(row.school ?? ""),
        row.foundedYear == null ? "" : String(row.foundedYear),
        esc(row.hqRegion ?? ""),
        status,
        String(row.signals ?? 0),
        esc(row.latestSignalAt ?? ""),
        esc(row.primaryProgram ?? ""),
        esc((row.founders ?? []).join("; ")),
      ].join(","),
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "campus-scout-filtered.csv";
  a.click();
  URL.revokeObjectURL(url);
}


type EndSliceInsight = {
  figure: number;
  figureUnit: string;
  kicker: string;
  companyName: string;
  companyMeta: string;
  companyId: string;
};

/** Real insight from the loaded page slice - never pagination batch size. */
function endSliceInsight(cards: DirectoryCard[]): EndSliceInsight | null {
  if (cards.length === 0) return null;

  const programCounts = new Map<string, { label: string; count: number; example: DirectoryCard }>();
  for (const card of cards) {
    const label = card.primaryProgram?.trim();
    if (!label) continue;
    const prev = programCounts.get(label);
    if (prev) prev.count += 1;
    else programCounts.set(label, { label, count: 1, example: card });
  }
  const topProgram = [...programCounts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))[0];
  if (topProgram && topProgram.count >= 3) {
    return {
      figure: topProgram.count,
      figureUnit: `on ${topProgram.label} this page`,
      kicker: "End of loaded page · program lead",
      companyName: topProgram.example.name,
      companyMeta: directoryCardSubtitle(topProgram.example) || topProgram.example.latestSignalAt || "on record",
      companyId: topProgram.example.id,
    };
  }

  const dated = cards
    .filter((c) => c.latestSignalAt && !/-00-00$/.test(c.latestSignalAt))
    .slice()
    .sort((a, b) => (a.latestSignalAt ?? "").localeCompare(b.latestSignalAt ?? "") || a.name.localeCompare(b.name));
  const oldestSignal = dated[0];
  if (oldestSignal?.latestSignalAt) {
    const monthKey = oldestSignal.latestSignalAt.slice(0, 7);
    const sameMonth = dated.filter((c) => (c.latestSignalAt ?? "").startsWith(monthKey)).length;
    return {
      figure: sameMonth,
      figureUnit: `earliest month on page · ${oldestSignal.latestSignalAt}`,
      kicker: "End of loaded page · oldest signal",
      companyName: oldestSignal.name,
      companyMeta: directoryCardSubtitle(oldestSignal) || oldestSignal.latestSignalAt,
      companyId: oldestSignal.id,
    };
  }

  const founded = cards
    .filter((c) => c.foundedYear != null)
    .slice()
    .sort((a, b) => (a.foundedYear ?? 0) - (b.foundedYear ?? 0) || a.name.localeCompare(b.name));
  const oldestFounded = founded[0];
  if (oldestFounded?.foundedYear != null) {
    return {
      figure: oldestFounded.foundedYear,
      figureUnit: "oldest founded year on page",
      kicker: "End of loaded page · founding lead",
      companyName: oldestFounded.name,
      companyMeta: directoryCardSubtitle(oldestFounded) || String(oldestFounded.foundedYear),
      companyId: oldestFounded.id,
    };
  }

  return null;
}

export function SampleInstrumentBrowse({
  feed,
  cards: cardsProp,
  total,
  pages,
  sector,
  kind,
  campus,
  campusName,
  campusTotal,
  query,
  sort,
  sectors,
  kinds,
  campuses,
  companies,
  moreHref,
  clearCampusHref,
  initialFacets,
}: {
  feed: Feed;
  cards: DirectoryCard[];
  total: number;
  pages: number;
  sector?: string;
  kind?: string;
  campus?: string;
  campusName?: string;
  campusTotal: number | null;
  query: string;
  sort: DirectorySort;
  sectors: DirectoryFilter[];
  kinds: DirectoryFilter[];
  campuses: { id: string; name: string; country: string; founders: number }[];
  companies: FacetCompany[];
  moreHref: string;
  clearCampusHref: string;
  initialFacets?: Partial<FacetState>;
}) {
  const router = useRouter();
  const [facets, setFacets] = useState<FacetState>(() => ({
    ...emptyFacets(),
    ...(initialFacets ?? {}),
    sector: sector ?? initialFacets?.sector ?? null,
    kind: kind ?? initialFacets?.kind ?? null,
    campus: campus ?? initialFacets?.campus ?? null,
    query: query ?? initialFacets?.query ?? "",
  }));
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<FacetCompany[] | null>(null);
  const [founderLinks, setFounderLinks] = useState<Record<string, { name: string; linkedinUrl: string }[]>>({});
  const [rightTab, setRightTab] = useState<"feed" | "overlays">("feed");
  /** Right instrument starts closed so the ledger owns the width (Monitor-style peek). */
  const [rightOpen, setRightOpen] = useState(false); // calm desk: feed closed so the ledger starts high

  useEffect(() => {
    let cancel = false;
    void loadDirectoryClient()
      .then((data) => {
        if (!cancel) setCatalog(data.cards);
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, []);

  const companiesLive = catalog ?? companies;
  // When ?more>1, expand the ledger from the client catalog so SSR stays ≤1 page.
  const cards = useMemo(() => {
    if (pages <= 1 || !catalog || catalog.length === 0) return cardsProp;
    const PAGE = 14;
    let matched = (catalog as DirectoryCard[]).filter((card) => {
      if (sector && card.sectorId !== sector) return false;
      if (kind && card.signalKind !== kind) return false;
      if (campus && card.schoolId !== campus) return false;
      return true;
    });
    const tokens = (query ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length) {
      matched = matched.filter((card) => {
        const hay = [card.name, card.description ?? "", ...(card.founders ?? [])].join("\n").toLowerCase();
        return tokens.every((token) => hay.includes(token));
      });
    }
    const ordered = [...matched];
    if (feed === "leaderboard") {
      ordered.sort((a, b) => b.signals - a.signals || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
      const page = ordered.filter((c) => c.signals > 0).slice(0, Math.max(1, pages) * PAGE);
      return page.length > 0 ? page : cardsProp;
    }
    if (sort === "name") ordered.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    else if (sort === "recent") {
      ordered.sort((a, b) => {
        const left = a.latestSignalAt ?? "";
        const right = b.latestSignalAt ?? "";
        if (left !== right) {
          if (!left) return 1;
          if (!right) return -1;
          return right.localeCompare(left);
        }
        return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
      });
    } else if (sort === "stage") {
      const STAGE = ["Pre-seed", "Seed", "Series A", "Series B", "Series C", "Venture"];
      const rank = (stage: string | null) => {
        if (!stage) return STAGE.length + 1;
        const i = STAGE.indexOf(stage);
        return i === -1 ? STAGE.length : i;
      };
      ordered.sort((a, b) => rank(a.stage) - rank(b.stage) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    } else {
      ordered.sort((a, b) => {
        const left = directoryRank(a);
        const right = directoryRank(b);
        if (left.tier !== right.tier) return left.tier - right.tier;
        if (left.score !== right.score) return right.score - left.score;
        return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
      });
    }
    const page = ordered.slice(0, Math.max(1, pages) * PAGE);
    return page.length > 0 ? page : cardsProp;
  }, [pages, catalog, cardsProp, feed, sector, kind, campus, query, sort]);
  const boardCompanies = useMemo(() => applyFacets(companiesLive, facets), [companiesLive, facets]);
  /** Continued-view insight: matching companies with ≥1 stored signal (not pagination). */
  const signaledMatch = useMemo(
    () => boardCompanies.filter((c) => (c.signals ?? 0) > 0).length,
    [boardCompanies],
  );
  /** Quiet matching companies (no stored signal) - insight, not pagination. */
  const quietMatch = boardCompanies.length - signaledMatch;
  const pageFrom = Math.max(1, cards.length - 27);
  const pageContext = `Companies ${pageFrom.toLocaleString("en-US")} to ${cards.length.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}`;
  const pageSignalBars = useMemo(() => {
    /** Prefer per-company signal counts so the page always shows a multi-bar peak. */
    const ranked = cards
      .filter((c) => (c.signals ?? 0) > 0)
      .map((c) => ({ key: c.id, label: c.name, count: c.signals }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, 12);
    if (ranked.length >= 2) {
      const max = Math.max(...ranked.map((r) => r.count));
      return ranked.map((r) => ({ key: r.key, count: r.count, peak: r.count === max, label: r.label }));
    }
    const months = new Map<string, number>();
    for (const card of cards) {
      const at = card.latestSignalAt;
      if (!at || /-00-00$/.test(at) || card.signals <= 0) continue;
      const key = at.slice(0, 7);
      if (key.length < 7) continue;
      months.set(key, (months.get(key) ?? 0) + 1);
    }
    const keys = [...months.keys()].sort();
    if (!keys.length) return [] as { key: string; count: number; peak: boolean; label?: string }[];
    const [y0, m0] = keys[0]!.split("-").map(Number);
    const [y1, m1] = keys[keys.length - 1]!.split("-").map(Number);
    const rows: { key: string; count: number; peak: boolean; label?: string }[] = [];
    let y = y0!, m = m0!;
    while (y < y1! || (y === y1 && m <= m1!)) {
      const key = `${y}-${String(m).padStart(2, "0")}`;
      const count = months.get(key) ?? 0;
      rows.push({ key, count, peak: false });
      m += 1;
      if (m > 12) { m = 1; y += 1; }
      if (rows.length > 14) break;
    }
    const max = Math.max(1, ...rows.map((r) => r.count));
    return rows.map((r) => ({ ...r, peak: r.count === max && r.count > 0 }));
  }, [cards]);
  const pageSignalBarsMax = Math.max(1, ...pageSignalBars.map((b) => b.count));
  const pageSignaled = useMemo(
    () => cards.filter((c) => (c.signals ?? 0) > 0).length,
    [cards],
  );
  const pagePeakLabel = useMemo(() => {
    const peak = pageSignalBars.find((b) => b.peak);
    if (!peak) return "";
    if (peak.label) return peak.label;
    const mon = Number(peak.key.slice(5, 7));
    const names = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return names[mon] || peak.key;
  }, [pageSignalBars]);
  const sliceInsight = useMemo(() => endSliceInsight(cards), [cards]);
  /** Leaderboard podium: top campuses by founders; signals = companies with signal on that desk. */
  const podiumRankedCount = useMemo(() => campusFoundersRanked(campuses).length, [campuses]);
  /** Ranked campuses on this loaded page  -  seal header with real company/signal counts. */
  const pageCampusRanks = useMemo(() => {
    const map = new Map<string, { id: string | null; label: string; companies: number; signaled: number }>();
    for (const card of cards) {
      const label = (card.school || "").trim();
      if (!label) continue;
      const key = (card.schoolId || label).trim();
      const cur = map.get(key) ?? { id: card.schoolId || null, label, companies: 0, signaled: 0 };
      if (!cur.id && card.schoolId) cur.id = card.schoolId;
      cur.companies += 1;
      if (card.signals > 0) cur.signaled += 1;
      map.set(key, cur);
    }
    return [...map.values()]
      .sort((a, b) => b.companies - a.companies || b.signaled - a.signaled || a.label.localeCompare(b.label))
      .slice(0, 6);
  }, [cards]);
  const endLeadCampusHref = useMemo(() => {
    const lead = pageCampusRanks[0];
    if (!lead) return null;
    // Prefer schoolId from cards; else resolveCampusSlug (id/slug/alias) — never name===label.
    const leadId = lead.id || resolveCampusSlug(lead.label) || null;
    if (!leadId) return null;
    return browseHref({ feed, sector, kind, campus: leadId, q: query, sort: feed === "directory" ? sort : undefined });
  }, [pageCampusRanks, feed, sector, kind, query, sort]);
  /** Desk-wide campus leader for mobile list mast (real counts). */
  const deskCampusTop = useMemo(() => {
    const map = new Map<string, { label: string; companies: number; signaled: number }>();
    for (const card of boardCompanies) {
      const label = (card.school || "").trim();
      if (!label) continue;
      const cur = map.get(label) ?? { label, companies: 0, signaled: 0 };
      cur.companies += 1;
      if (card.signals > 0) cur.signaled += 1;
      map.set(label, cur);
    }
    return [...map.values()].sort((a, b) => b.signaled - a.signaled || b.companies - a.companies)[0] ?? null;
  }, [boardCompanies]);

  const podiumRows = useMemo(() => {
    const signaledByCampus = new Map<string, number>();
    for (const card of boardCompanies) {
      const id = card.schoolId;
      if (!id || !(card.signals > 0)) continue;
      signaledByCampus.set(id, (signaledByCampus.get(id) ?? 0) + 1);
    }
    // Mobile signals fold needs company cards above the fold (2e37f4f). Top-10 lives on home + /campuses.
    return campusFoundersTop(campuses, 3).map((c) => ({
      id: c.id,
      label: shortCampusLabel(c.id, c.name),
      founders: c.founders,
      signals: signaledByCampus.get(c.id) ?? 0,
    }));
  }, [campuses, boardCompanies]);
  /** End-colophon: next programs on the matching desk (programs[] membership counts; YC labelled in YC). */
  const nextToScout = useMemo(() => topPrograms(boardCompanies).slice(0, 4), [boardCompanies]);

  const wireSurface = feed === "leaderboard" ? "signals" : "browse";

  const urlSyncRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function commitFacet(next: FacetState, opts?: { debounceMs?: number }) {
    // Instant local filter (YC-speed); URL sync is replace-only and optional-debounce.
    setFacets(next);
    const href = browseHref({
      feed,
      sort: feed === "directory" ? sort : undefined,
      facets: next,
      c: selectedCompanyId,
    });
    const run = () => {
      router.replace(href, { scroll: false });
    };
    if (urlSyncRef.current) clearTimeout(urlSyncRef.current);
    const wait = opts?.debounceMs ?? 0;
    if (wait > 0) urlSyncRef.current = setTimeout(run, wait);
    else run();
  }

  const chipDefs = useMemo(() => {
    const campusLabel = facets.campus
      ? campuses.find((c) => c.id === facets.campus)?.name ?? facets.campus
      : null;
    return activeFacetChips(facets, { campus: campusLabel });
  }, [facets, campuses]);

  useEffect(() => {
    const ids = cards.slice(0, 40).map((c) => c.id);
    if (ids.length === 0) {
      setFounderLinks({});
      return;
    }
    let cancel = false;
    void fetch(`/api/founder-links?ids=${encodeURIComponent(ids.join(","))}`)
      .then((res) => (res.ok ? res.json() : {}))
      .then((data: Record<string, { name: string; linkedinUrl: string }[]>) => {
        if (!cancel) setFounderLinks(data ?? {});
      })
      .catch(() => {
        if (!cancel) setFounderLinks({});
      });
    return () => {
      cancel = true;
    };
  }, [cards]);

  const overlayCounts = useMemo(() => {
    const campusRows = campuses.map((c) => ({
      id: c.id,
      name: c.name,
      shortLabel: shortCampusLabel(c.id, c.name),
      founders: c.founders,
    }));
    // Status from the same statusOf() as FacetRail; campus counts are founders (same unit as FacetRail).
    const built = buildOverlayCounts(companiesLive, campusRows);
    return { ...built, total: boardCompanies.length };
  }, [companiesLive, campuses, boardCompanies.length]);

  function applyOverlayRow(row: OverlayRow) {
    if (row.facet === "status") {
      const next = facets.status === row.id ? null : (row.id as StatusId);
      commitFacet({ ...facets, status: next });
      return;
    }
    if (row.facet === "sector") {
      const next = facets.sector === row.id ? null : row.id;
      commitFacet({ ...facets, sector: next, sectorMissing: false });
      return;
    }
    if (row.facet === "campus") {
      const next = facets.campus === row.id ? null : row.id;
      commitFacet({ ...facets, campus: next });
    }
  }

  const sortChip = (active: boolean) =>
    active
      ? "border-[color:var(--ember,#D96B1C)] bg-[color:var(--ember,#D96B1C)] text-white"
      : "border-[color:var(--line-strong,#C5CAD8)] bg-[color:var(--bg,#FFFFFF)] text-[color:var(--fg,#0B0E17)] hover:border-[color:var(--cobalt,#2F4FD8)]";

  const kicker = feed === "leaderboard" ? "Signals" : "Companies";
  const caption = total === 1 ? "company" : "companies";
  const subline =
    feed === "leaderboard"
      ? "Ordered by how many signals are stored"
      : sort === "recent"
        ? "Newest signal first"
        : sort === "name"
          ? "Alphabetical"
          : sort === "stage"
            ? "Ordered by stage"
            : "Ranked from signals, founders, programs, and stage";

  return (
    <div
      className="mx-auto mt-2 grid w-full max-w-[1280px] scroll-mt-16 gap-4 sm:mt-3 lg:grid-cols-[minmax(280px,320px)_minmax(0,1fr)_minmax(220px,280px)] lg:gap-5"
      data-browse-spread=""
      data-right-open={rightOpen ? "1" : "0"}
    >
      {/* Col 1 · persistent ruled index (magazine TOC), not a sheet over content */}
      <aside className="hidden min-w-0 lg:block" data-browse-index="">
        <div className="sticky top-14 flex max-h-[calc(100dvh-3.5rem)] flex-col space-y-2 overflow-hidden">
          <div
            className="shrink-0 border-b border-[color:var(--line,#E1E5EF)] pb-2"
            data-index-signal-beat=""
            data-filters-index-hero=""
            data-n-of-m=""
          >
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[color:var(--fg-3,#5C647A)]">Filters</p>
            {/* One count on the page lives in the Vetted toggle; rail only restates when filtered. */}
            {boardCompanies.length !== total ? (
              <p className="mt-2 text-[15px] leading-5 text-[color:var(--fg,#0B0E17)]" data-showing-label="">
                <span className="font-semibold tabular-nums" data-match-count="">{boardCompanies.length.toLocaleString("en-US")}</span>
                <span className="mx-1 text-[color:var(--fg-3,#5C647A)]">of</span>
                <span className="tabular-nums text-[color:var(--fg-2,#3F465C)]" data-total-count="">{total.toLocaleString("en-US")}</span>
                <span className="text-[color:var(--fg-2,#3F465C)]"> match</span>
              </p>
            ) : (
              <p className="mt-2 text-[14px] text-[color:var(--fg-2,#3F465C)]" data-showing-label="">
                <span className="sr-only" data-match-count="">{boardCompanies.length.toLocaleString("en-US")}</span>
                <span className="sr-only" data-total-count="">{total.toLocaleString("en-US")}</span>
                All {feed === "leaderboard" ? "signals" : "companies"} on this desk
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2" data-filter-chips="" aria-label="Active filters">
              {chipDefs.map((chip) => (
                <button
                  key={String(chip.key)}
                  type="button"
                  data-filter-chip={String(chip.key)}
                  onClick={() => commitFacet({ ...facets, ...chip.clear })}
                  className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[color:var(--cobalt,#2F4FD8)]/35 bg-[color:var(--cobalt-haze,#E8ECFA)]/60 px-2.5 text-[12px] font-medium text-[color:var(--fg,#0B0E17)] hover:border-[color:var(--ember,#D96B1C)]"
                >
                  {chip.label}
                  <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--ember,#D96B1C)]" aria-hidden>
                    x
                  </span>
                </button>
              ))}
              {chipDefs.length > 0 ? (
                <button
                  type="button"
                  data-filter-reset=""
                  onClick={() => commitFacet(emptyFacets())}
                  className="text-[13px] font-semibold text-[color:var(--cobalt,#2F4FD8)] hover:underline"
                  data-btn-style="sans"
                >
                  Reset all
                </button>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                data-export-filtered=""
                onClick={() => exportFilteredCsv(boardCompanies)}
                className="inline-flex h-10 min-h-10 items-center rounded-md border border-[color:var(--line-strong,#C5CAD8)] bg-[color:var(--bg,#FFFFFF)] px-3 text-[14px] font-semibold text-[color:var(--fg,#0B0E17)] hover:border-[color:var(--cobalt,#2F4FD8)]"
                data-btn-style="sans"
              >
                Export CSV
              </button>
            </div>
          </div>
          <div className="mt-2 min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pt-1" data-contents-facet-map="">
            <FacetRail
              companies={companiesLive}
              campuses={campuses}
              facets={facets}
              onChange={(next) => commitFacet(next, { debounceMs: next.query !== facets.query ? 120 : 0 })}
              index
              caption={feed === "leaderboard" ? "Signals" : "Companies"}
            />
          </div>
          {/* Logo strip moved out of the filter rail so Flags / Raised funding stay tappable. */}
        </div>
      </aside>

      {/* Col 2 · ember figure hero + ledger */}
      <div className="min-w-0" data-browse-ledger="">
        {/* Universe count lives once in the Vetted toggle; ledger only adds the signal read. */}
        <p className="mb-2 text-[14px] leading-5 text-[color:var(--fg-2,#3F465C)]" data-hero-stat="">
          <span className="font-semibold tabular-nums text-[color:var(--fg,#0B0E17)]">{signaledMatch.toLocaleString("en-US")}</span>
          {" with a signal"}
          {deskCampusTop ? (
            <>
              <span aria-hidden> · </span>
              <span className="whitespace-nowrap">{deskCampusTop.label} leads</span>
            </>
          ) : null}
        </p>
        {/* Single count hero lives in the Filters column. Ledger keeps sort + optional signal strip. */}
        <div
          className={`mb-3 border-b border-[color:var(--line,#E1E5EF)] pb-3 lg:mb-2 lg:pb-2 ${
            feed === "directory" ? "hidden lg:block" : ""
          }`}
          data-browse-hero={feed}
          data-browse-hero-slim="1"
          data-continued-page={pages > 1 ? "1" : undefined}
          data-ledger-chapter={feed === "directory" ? "1" : undefined}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className={`min-w-0 ${feed === "directory" ? "lg:hidden" : ""}`}>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--cobalt,#2F4FD8)]">{kicker}</p>
              <p className="mt-1 text-[15px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">
                {caption}
                {campusName ? (
                  <>
                    {" · "}
                    {campusName}
                    {" · "}
                    <Link href={clearCampusHref} className="text-[color:var(--ember,#D96B1C)] hover:underline">
                      Clear
                    </Link>
                  </>
                ) : null}
              </p>
              <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[color:var(--fg-2,#3F465C)]">{subline}</p>
            </div>
            <div className="hidden flex-wrap items-center gap-1.5 lg:flex">
              {feed === "directory"
                ? (
                    [
                      ["rank", "Rank"],
                      ["recent", "Newest"],
                      ["name", "Name"],
                      ["stage", "Stage"],
                    ] as const
                  ).map(([id, label]) => (
                    <Link
                      key={id}
                      href={browseHref({ feed, sector, kind, campus, q: query, sort: id })}
                      className={`inline-flex h-8 items-center rounded-md border px-3 text-[13px] font-medium ${sortChip(sort === id)}`}
                    >
                      {label}
                    </Link>
                  ))
                : null}
              <button
                type="button"
                data-open-right-rail=""
                aria-pressed={rightOpen}
                onClick={() => setRightOpen((open) => !open)}
                className={`inline-flex h-8 items-center rounded-md border px-3 text-[13px] font-medium ${
                  rightOpen
                    ? "border-[color:var(--cobalt,#2F4FD8)] bg-[color:var(--cobalt-haze,#E8ECFA)] text-[color:var(--cobalt,#2F4FD8)]"
                    : "border-[color:var(--line,#E1E5EF)] text-[color:var(--fg-2,#3F465C)]"
                }`}
                data-btn-style="sans"
              >
                {rightOpen ? "Hide feed" : "Feed"}
              </button>
            </div>
          </div>
          {/* Signals chart moved below ledger so first fold is the company list (YC parity). */}
        </div>

        {/* Scout Chronograph · unifying system. Browse-more uses folio (originality priority);
            page-1 pairs chronograph + sector strip; leaderboard uses chronograph alone. */}
        {chipDefs.length > 0 ? (
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5 lg:hidden" data-mobile-filter-chips="">
          {chipDefs.map((chip) => (
            <button
              key={`m-${String(chip.key)}`}
              type="button"
              data-filter-chip={String(chip.key)}
              onClick={() => commitFacet({ ...facets, ...chip.clear })}
              className="inline-flex h-8 min-h-8 items-center gap-1.5 rounded-full border border-[color:var(--cobalt,#2F4FD8)]/35 bg-[color:var(--cobalt-haze,#E8ECFA)]/60 px-2.5 text-[13px] font-medium"
            >
              {chip.label}
              <span className="font-mono text-[10px] text-[color:var(--ember,#D96B1C)]" aria-hidden>x</span>
            </button>
          ))}
        </div>
        ) : null}
        <div className="mb-2 space-y-1.5 lg:hidden" data-mobile-browse-compose="">
          {/* Beat YC directory: sticky search + Filter + Showing, first card clears the fold. */}
          {feed === "directory" && pages <= 1 ? (
            <div data-browse-mobile-hero="" data-browse-mobile-hero-compact="1" className="hidden" aria-hidden>
              {/* Count moves under Filter (YC order) so the first card sits higher. */}
            </div>
          ) : null}

          {feed === "directory" && pages > 1 ? (
            <MobileListMast
              continued
              pageSignaledCount={pageSignaled}
              kicker="Companies in this batch"
              sealLabel={pageCampusRanks[0]?.label}
              figure={`${pageFrom.toLocaleString("en-US")}-${cards.length.toLocaleString("en-US")}`}
              figureSuffix={`of ${total.toLocaleString("en-US")}`}
              takeaway={
                pageCampusRanks[0]
                  ? `${pageCampusRanks[0].label} tops this batch · ${pageCampusRanks.length.toLocaleString("en-US")} campuses`
                  : `on this page`
              }
              meta={`${pageCampusRanks.length.toLocaleString("en-US")} campuses in range · sort stays below`}
            />
          ) : null}

          {feed === "leaderboard" ? (
            <MobileListMast
              kicker="Signal desk"
              sealLabel={podiumRows[0]?.label ?? deskCampusTop?.label}
              figure={(podiumRows[0]?.signals ?? signaledMatch).toLocaleString("en-US")}
              figureSuffix="signaled"
              takeaway={
                podiumRows[0]
                  ? `${podiumRows[0].label} leads the podium with ${podiumRows[0].founders.toLocaleString("en-US")} ${nounFor(podiumRows[0].founders, "founder")} on record`
                  : `${signaledMatch.toLocaleString("en-US")} companies carry a signal on this desk`
              }
              meta="Signal desk"
            />
          ) : null}

          {feed === "directory" && pages > 1 ? (
            <div
              className="flex w-full overflow-hidden rounded-none border border-[color:var(--cobalt,#2F4FD8)]/30"
              data-mobile-sort-segment=""
              role="group"
              aria-label="Sort ledger"
            >
              {(
                [
                  ["rank", "Rank"],
                  ["recent", "Newest"],
                  ["name", "Name"],
                  ["stage", "Stage"],
                ] as const
              ).map(([id, label], i) => {
                const active = sort === id;
                return (
                  <Link
                    key={id}
                    href={browseHref({ feed, sector, kind, campus, q: query, sort: id })}
                    className={`flex h-9 flex-1 items-center justify-center font-mono text-[11px] font-semibold uppercase tracking-[0.06em] ${
                      i > 0 ? "border-l border-[color:var(--cobalt,#2F4FD8)]/20" : ""
                    } ${
                      active
                        ? "bg-[color:var(--cobalt,#2F4FD8)] text-white"
                        : "bg-[color:var(--bg,#FFFFFF)] text-[color:var(--fg-2,#3F465C)]"
                    }`}
                  >
                    {label}
                  </Link>
                );
              })}
            </div>
          ) : null}

          {feed === "directory" ? (
            <div
              className="sticky top-10 z-30 space-y-1 border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)]/95 p-1.5 backdrop-blur-sm"
              role="region"
              aria-label="Scout filters"
              data-mobile-filters-inline=""
              data-mobile-contents-hero=""
              data-filters-index-hero=""
              data-yc-parity-search=""
            >
              <label className="sr-only" htmlFor="mobile-browse-q">
                Search company or founder
              </label>
              <input
                id="mobile-browse-q"
                type="search"
                value={facets.query}
                onChange={(event) => {
                  const next = { ...facets, query: event.target.value };
                  commitFacet(next, { debounceMs: 120 });
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitFacet({ ...facets, query: facets.query });
                  }
                }}
                onBlur={() => {
                  if ((query ?? "") !== facets.query) commitFacet(facets);
                }}
                placeholder="Search..."
                autoComplete="off"
                className="h-10 w-full rounded-md border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-3 text-[15px] text-[color:var(--fg,#0B0E17)] outline-none placeholder:text-[color:var(--fg-3,#5C647A)] focus:border-[color:var(--cobalt,#2F4FD8)]"
              />
              <button
                type="button"
                className="flex min-h-10 w-full items-center justify-between gap-3 rounded-md border border-[color:var(--line-strong,#C5CAD8)] px-3 py-2 text-left text-[14px] font-semibold"
                onClick={() => setMobileFiltersOpen(true)}
                aria-expanded={mobileFiltersOpen}
                aria-controls="mobile-filter-sheet"
                data-mobile-filters-open=""
              >
                <span>Filters</span>
                <span className="text-[12px] font-semibold tabular-nums text-[color:var(--fg-2,#3F465C)]">
                  {boardCompanies.length !== total
                    ? `${boardCompanies.length.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}`
                    : "All"}
                </span>
              </button>
              <div className="flex items-baseline justify-between gap-2 px-0.5" data-showing-count="">
                <p className={`min-w-0 text-[13px] leading-5 text-[color:var(--fg-2,#3F465C)]`}>
                  {boardCompanies.length !== total ? (
                    <>
                      <span className="font-semibold tabular-nums text-[color:var(--fg,#0B0E17)]">{boardCompanies.length.toLocaleString("en-US")}</span>
                      {" of "}
                      <span className="tabular-nums">{total.toLocaleString("en-US")}</span>
                      {" match"}
                    </>
                  ) : (
                    <span className="tabular-nums">{signaledMatch.toLocaleString("en-US")} with a signal</span>
                  )}
                </p>
                <button
                  type="button"
                  data-export-filtered-mobile=""
                  onClick={() => exportFilteredCsv(boardCompanies)}
                  className="shrink-0 text-[13px] font-semibold text-[color:var(--cobalt,#2F4FD8)]"
                  data-btn-style="sans"
                >
                  Export
                </button>
              </div>
            </div>
          ) : null}
        </div>




        {feed === "directory" && pages > 1 ? (
          <div className="mb-3 hidden lg:block" data-desk-browse-dominant="page-window" data-page-window="">
            <p className="flex flex-wrap items-baseline gap-x-2 border-b border-[color:var(--line,#E1E5EF)] pb-2 font-mono text-[11px] tabular-nums text-[color:var(--fg-2,#3F465C)]">
              <span className="font-bold uppercase tracking-[0.16em] text-[color:var(--cobalt,#2F4FD8)]">Companies</span>
              <span>
                <span className="font-bold text-[color:var(--ember,#D96B1C)]">{"1"}</span>
                {" to "}
                <span className="font-bold text-[color:var(--fg,#0B0E17)]">{cards.length.toLocaleString("en-US")}</span>
                {" of "}
                <span className="font-bold text-[color:var(--fg,#0B0E17)]">{total.toLocaleString("en-US")}</span>
                {" · "}
                <span className="font-bold text-[color:var(--ember,#D96B1C)]">{signaledMatch.toLocaleString("en-US")}</span>
                {" with a signal"}
              </span>
            </p>
          </div>
        ) : null}

        {/* One strong ledger stage · map-stage language: cobalt frame, ruled rows.
            Browse-more (pages > 1): sticky row-range, section dividers, end mark. */}
        {cards.length === 0 ? (
          <p className="text-[13px] text-[color:var(--fg-2,#3F465C)]">
            {query
              ? `No companies match "${query}".`
              : campusName && campusTotal === 0
                ? `No companies are stored for ${campusName}.`
                : "No companies in this category."}
          </p>
        ) : (
          <div data-ledger-expanded={pages > 1 ? "1" : "0"}>
            {pages > 1 ? (
              <div className="relative z-10 mb-0 border border-b-0 border-[color:var(--cobalt,#2F4FD8)]/25 bg-[color:var(--bg,#FFFFFF)]/95 backdrop-blur-sm before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-[color:var(--ember,#D96B1C)] lg:sticky lg:top-12">
                {/* Desk (more-1440): f53d loud sticky. Mobile (more-375): quieter bar. */}
                <div className="hidden items-end justify-between gap-3 px-3 py-2 sm:px-3.5 lg:flex">
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]">
                      {feed === "leaderboard" ? "Signals" : "Companies"}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[color:var(--fg-2,#3F465C)]">
                      {"1 to "}
                      {cards.length.toLocaleString("en-US")}
                      {" of "}
                      {total.toLocaleString("en-US")}
                    </p>
                  </div>
                  <p className="shrink-0 text-right font-mono text-[11px] tabular-nums text-[color:var(--fg-2,#3F465C)]" data-continued-insight="">
                    <span className="block text-[18px] font-bold leading-none tracking-tight text-[color:var(--ember,#D96B1C)] sm:text-[20px]">
                      {signaledMatch.toLocaleString("en-US")}
                    </span>
                    <span className="mt-0.5 block text-[9px] uppercase tracking-[0.1em]">with a signal</span>
                  </p>
                </div>
                <div className="hidden px-3.5 py-4" data-mid-list-hero="" data-more-context-hero="">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]">
                    {feed === "leaderboard" ? "Signals on this page" : "Companies on this page"}
                  </p>
                  <p className="mt-1 text-[15px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">
                    1 to {cards.length.toLocaleString("en-US")}
                    <span className="font-normal text-[color:var(--fg-3,#5C647A)]">
                      {" of "}
                      {total.toLocaleString("en-US")}
                    </span>
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[color:var(--fg-2,#3F465C)]">
                    <span className="font-bold text-[color:var(--ember,#D96B1C)]">{signaledMatch.toLocaleString("en-US")}</span>
                    {" with a signal · keep scrolling for the next batch"}
                  </p>
                </div>
              </div>
            ) : null}
            <div data-ledger-stage={feed} data-ledger-top={pages > 1 ? undefined : ""}>
            {feed === "leaderboard" ? (
              <div className="mb-4" data-signals-podium-wrap="">
                <ScoutSignalPodium rows={podiumRows} totalOnDesk={total} rankedCount={podiumRankedCount} allHref="/campuses" />
              </div>
            ) : null}
            <ol
              className={`relative overflow-hidden border border-[color:var(--cobalt,#2F4FD8)]/25 bg-[color:var(--bg,#FFFFFF)] before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-[color:var(--cobalt,#2F4FD8)] divide-y divide-[color:var(--line,#E1E5EF)] ${pages > 1 ? "border-t-0" : ""} ${feed === "leaderboard" ? "border-t-0 lg:border-t" : ""}`}
            >
              {cards.map((card, index) => {
                const chunk = 14;
                const showDivider = pages > 1 && index > 0 && index % chunk === 0;
                const sectionFrom = Math.floor(index / chunk) * chunk + 1;
                const sectionTo = Math.min(sectionFrom + chunk - 1, cards.length);
                const rawWhy = whyItsHere(card);
                const prevWhy = index > 0 ? whyItsHere(cards[index - 1]!) : null;
                // Keep the first Why in a run; blank identical repeats that follow (ba9d2b0 desk parity).
                const whyOverride = rawWhy && prevWhy === rawWhy ? null : undefined;
                const prevSchool = index > 0 ? cards[index - 1]?.school ?? null : null;
                // Mobile: one seal per campus group so 375 lists breathe.
                const showCampusSeal = Boolean(card.school) && card.school !== prevSchool;
                return (
                  <li key={card.id}>
                    {showDivider ? (
                      <>
                        {/* Desk more-end-1440: ba9d2b0 thin section rule */}
                        <div
                          className="hidden items-center gap-2 border-t-2 border-[color:var(--cobalt,#2F4FD8)]/35 bg-[color:var(--cobalt-haze,#E8ECFA)]/50 px-3 py-1.5 sm:px-3.5 lg:flex"
                          data-ledger-section={String(Math.floor(index / chunk) + 1)}
                        >
                          <span className="h-px flex-1 bg-[color:var(--cobalt,#2F4FD8)]/25" aria-hidden />
                          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]">
                            Companies {sectionFrom} to {sectionTo}
                          </span>
                          <span className="h-px flex-1 bg-[color:var(--cobalt,#2F4FD8)]/25" aria-hidden />
                        </div>
                        {/* Mobile more-375: thin section rule (r30 chrome cull; counts live in top mast) */}
                        <div
                          className="flex items-center gap-2 border-t-2 border-[color:var(--cobalt,#2F4FD8)]/35 bg-[color:var(--cobalt-haze,#E8ECFA)]/50 px-3.5 py-1.5 lg:hidden"
                          data-ledger-section={String(Math.floor(index / chunk) + 1)}
                          data-mid-list-hero=""
                          data-chapter-window=""
                        >
                          <span className="h-px flex-1 bg-[color:var(--cobalt,#2F4FD8)]/25" aria-hidden />
                          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]">
                            Companies {sectionFrom.toLocaleString("en-US")}-{sectionTo.toLocaleString("en-US")}
                          </span>
                          <span className="h-px flex-1 bg-[color:var(--cobalt,#2F4FD8)]/25" aria-hidden />
                        </div>
                      </>
                    ) : null}
                    <LedgerRow
                      founderLinks={founderLinks[card.id] ?? []}
                      card={card}
                      rank={feed === "leaderboard" ? index + 1 : null}
                      ranked={feed === "leaderboard"}
                      whyOverride={whyOverride}
                      showCampusSeal={showCampusSeal}
                      evidenceRich={feed === "directory" && pages > 1}
                    />
                  </li>
                );
              })}
            </ol>
            </div>
            {pages > 1 && sliceInsight ? (
              <>
                {/* Desk more-end-1440: campus rank header + quiet Load next */}
                <div
                  className="mt-5 hidden scroll-mt-24 border border-[color:var(--cobalt,#2F4FD8)]/30 bg-[color:var(--bg,#FFFFFF)] lg:block"
                  data-ledger-end=""
                  data-end-insight={sliceInsight.kicker}
                >
                  <div className="scroll-mt-[5.5rem] px-5 py-5" data-ledger-end-lead="">
                    <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[color:var(--cobalt,#2F4FD8)]">
                      Campuses in this batch
                    </p>
                    {pageCampusRanks.length ? (
                      <ol className="mt-3 divide-y divide-[color:var(--line,#E1E5EF)] border-y border-[color:var(--line,#E1E5EF)]" data-page-campus-seals="" data-page-campus-ranks="">
                        {pageCampusRanks.map((row, i) => (
                          <li key={row.label} className="flex items-center gap-3 py-2.5">
                            <span className="w-6 shrink-0 text-right font-mono text-[16px] font-bold tabular-nums tracking-[-0.04em] text-[color:var(--cobalt,#2F4FD8)]">
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <CampusSeal label={row.label} size="md" />
                            <div className="min-w-0 flex-1">
                              <p className={`${WRAP_2} text-[15px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]`}>{row.label}</p>
                              <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[color:var(--fg-2,#3F465C)]">
                                <span className="font-bold text-[color:var(--cobalt,#2F4FD8)]">{row.companies.toLocaleString("en-US")}</span>
                                {" companies"}
                                <span aria-hidden> · </span>
                                <span className="font-bold text-[color:var(--fg,#0B0E17)]">{row.signaled.toLocaleString("en-US")}</span>
                                {" with a signal"}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ol>
                    ) : null}
                    <p className="mt-4 font-mono text-[13px] tabular-nums text-[color:var(--fg-2,#3F465C)]" data-ledger-showing="" data-end-lead="">
                      <span className="font-bold text-[color:var(--fg,#0B0E17)]">{cards.length.toLocaleString("en-US")}</span>
                      {" of "}
                      {total.toLocaleString("en-US")}
                      {" loaded"}
                      {sliceInsight ? (
                        <>
                          {" · "}
                          <span className="font-bold text-[color:var(--cobalt,#2F4FD8)]">{sliceInsight.figure.toLocaleString("en-US")}</span>
                          {" "}
                          {sliceInsight.figureUnit}
                          {" · "}
                          <Link href={`/startup/${sliceInsight.companyId}`} className="font-semibold text-[color:var(--fg,#0B0E17)] underline-offset-2 hover:text-[color:var(--cobalt,#2F4FD8)] hover:underline">
                            {sliceInsight.companyName}
                          </Link>
                        </>
                      ) : null}
                    </p>
                    {cards.length < total ? (
                      <p className="mt-3 font-mono text-[12px] text-[color:var(--fg-3,#5C647A)]" data-ledger-end-more="" data-ledger-end-colophon="">
                        <span>{"Still "}{(total - cards.length).toLocaleString("en-US")}{" · "}</span>
                        <Link
                          href={moreHref}
                          className="font-semibold text-[color:var(--cobalt,#2F4FD8)] underline-offset-2 hover:underline"
                        >
                          Load next
                        </Link>
                      </p>
                    ) : null}
                  </div>
                </div>
                {/* Mobile more-end-375: strong campus-rank top, light footer, quiet Load next */}
                <div
                  className="mt-3 scroll-mt-24 lg:hidden"
                  data-ledger-end=""
                  data-ledger-end-mobile=""
                  data-end-insight={sliceInsight.kicker}
                >
                  <div
                    className="overflow-hidden border border-[color:var(--cobalt,#2F4FD8)]/30 bg-[color:var(--bg,#FFFFFF)] shadow-[0_-6px_16px_rgba(47,79,216,0.08)]"
                    data-ledger-end-lead=""
                    data-pass-close=""
                  >
                    <p className="border-b border-[color:var(--cobalt,#2F4FD8)]/15 bg-[color:var(--bg,#FFFFFF)] px-3.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]" data-ledger-end-continue="">
                      Batch close · last companies
                    </p>
                    <div className="border-b border-[color:var(--cobalt,#2F4FD8)]/20 bg-[color:var(--cobalt-haze,#E8ECFA)]/35 px-3.5 py-2.5" data-mobile-list-mast="">
                      <div className="flex items-start gap-3">
                        {pageCampusRanks[0] ? (
                          endLeadCampusHref ? (
                            <Link href={endLeadCampusHref} aria-label={`Filter to ${pageCampusRanks[0].label}`} className="shrink-0">
                              <CampusSeal label={pageCampusRanks[0].label} size="lg" className="mt-1" />
                            </Link>
                          ) : (
                            <CampusSeal label={pageCampusRanks[0].label} size="lg" className="mt-1" />
                          )
                        ) : null}
                        <div className="min-w-0 flex-1">
                          <p className="m-kicker">Batch close</p>
                          <p className="m-figure mt-1.5" data-ledger-showing="" data-end-lead="" data-more-context="">
                            {cards.length.toLocaleString("en-US")}
                            <span className="m-figure-sub ml-1.5">of {total.toLocaleString("en-US")}</span>
                          </p>
                          <p className="m-takeaway mt-2">
                            {pageCampusRanks[0]
                              ? `${pageCampusRanks[0].label} leads · ${pageCampusRanks.length.toLocaleString("en-US")} campuses · ${pageSignaled.toLocaleString("en-US")} signaled`
                              : `${cards.length.toLocaleString("en-US")} companies loaded`}
                          </p>
                          <p className="m-meta mt-1 leading-5">
                            Companies 1 to {cards.length.toLocaleString("en-US")} on desk
                          </p>
                        </div>
                      </div>
                    </div>
                    {/* Last companies on this page — keep the end state dense, not only ranks */}
                    {cards.length ? (
                      <ul className="divide-y divide-[color:var(--line,#E1E5EF)] border-b border-[color:var(--line,#E1E5EF)] px-3.5" data-ledger-end-companies="">
                        {cards.slice(-3).map((card) => (
                          <li key={card.id} className="flex items-center gap-2 py-2">
                            <LogoMark name={card.name} logoUrl={card.logoUrl} size={18} />
                            <div className="min-w-0 flex-1">
                              <Link
                                href={`/startup/${card.id}`}
                                className={`block ${WRAP_2} text-[14px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)] hover:text-[color:var(--cobalt,#2F4FD8)]`}
                              >
                                {card.name}
                              </Link>
                              <p className="mt-0.5 flex flex-wrap items-center gap-1 font-mono text-[10px] text-[color:var(--fg-3,#5C647A)]">
                                <span className={WRAP_FULL}>{card.school || "Campus missing"}</span>
                                {card.signalLabel ? (
                                  <span className="inline-flex h-[16px] items-center rounded-sm border border-[color:var(--cobalt,#2F4FD8)]/30 bg-[color:var(--cobalt-haze,#E8ECFA)] px-1 font-semibold text-[color:var(--cobalt,#2F4FD8)]">
                                    {card.signalLabel}
                                  </span>
                                ) : null}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {pageCampusRanks.length ? (
                      <ol className="divide-y divide-[color:var(--line,#E1E5EF)] px-3.5" data-page-campus-seals="" data-page-campus-ranks="">
                        {pageCampusRanks.slice(0, 6).map((row, i) => (
                          <li key={row.label} className="flex items-center gap-2 py-1.5">
                            <span className="w-5 shrink-0 text-right font-mono text-[12px] font-bold tabular-nums text-[color:var(--cobalt,#2F4FD8)]">
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <CampusSeal label={row.label} size="sm" />
                            <div className="min-w-0 flex-1">
                              <p className={`${WRAP_2} text-[13px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]`}>{row.label}</p>
                              <p className="font-mono text-[10px] tabular-nums text-[color:var(--fg-2,#3F465C)]">
                                <span className="font-bold text-[color:var(--cobalt,#2F4FD8)]">{row.companies.toLocaleString("en-US")}</span>
                                {" cos"}
                                <span aria-hidden> · </span>
                                <span className="font-bold text-[color:var(--fg,#0B0E17)]">{row.signaled.toLocaleString("en-US")}</span>
                                {" signaled"}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ol>
                    ) : null}
                    <div className="px-3.5 py-2.5" data-ledger-end-more="" data-ledger-end-colophon="">
                      {sliceInsight ? (
                        <p className="font-mono text-[11px] leading-4 tabular-nums text-[color:var(--fg-3,#5C647A)]">
                          <span className="font-bold text-[color:var(--cobalt,#2F4FD8)]">{sliceInsight.figure.toLocaleString("en-US")}</span>
                          {" "}
                          {sliceInsight.figureUnit}
                          {" · "}
                          <Link href={`/startup/${sliceInsight.companyId}`} className="font-semibold text-[color:var(--fg,#0B0E17)] underline-offset-2 hover:underline">
                            {sliceInsight.companyName}
                          </Link>
                        </p>
                      ) : null}
                      {cards.length < total ? (
                        <p className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[12px] text-[color:var(--fg-3,#5C647A)]">
                          <span>{"Still "}{(total - cards.length).toLocaleString("en-US")}</span>
                          <Link
                            href={moreHref}
                            data-load-next=""
                            className="inline-flex h-8 items-center rounded-sm border border-[color:var(--cobalt,#2F4FD8)] bg-[color:var(--cobalt,#2F4FD8)] px-3 font-semibold text-white hover:opacity-90"
                          >
                            Load next
                          </Link>
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        )}

        {cards.length < total && pages <= 1 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2.5" data-ledger-more-footer="">
            <Link
              href={moreHref}
              className="inline-flex h-8 items-center rounded-md border border-[color:var(--ember,#D96B1C)] bg-[color:var(--ember,#D96B1C)] px-3 text-[13px] font-semibold text-white hover:opacity-90" data-btn-style="sans"
            >
              Show more
            </Link>
            <p className="text-[12px] text-[color:var(--fg-3,#5C647A)]" data-ledger-showing-next="">
              {"Companies 1–"}
              <span className="font-medium tabular-nums text-[color:var(--fg-2,#3F465C)]">{cards.length.toLocaleString("en-US")}</span>
              {" on this page"}
            </p>
          </div>
        ) : pages > 1 && cards.length >= total ? (
          <p className="mt-4 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--fg-3,#5C647A)]">
            All companies shown
          </p>
        ) : null}

        {feed === "directory" ? (
          <details
            className="mt-4 hidden border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] lg:block"
            data-signals-landed-desk={pages > 1 ? undefined : ""}
            data-signals-landed-desk-continued={pages > 1 ? "" : undefined}
            data-signals-landed-collapsible="1"
          >
            <summary className="cursor-pointer list-none px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--cobalt,#2F4FD8)] marker:content-none [&::-webkit-details-marker]:hidden">
              When signals landed
              <span className="ml-2 font-normal normal-case tracking-normal text-[color:var(--fg-3,#5C647A)]">Show chart</span>
            </summary>
            <div className="border-t border-[color:var(--line,#E1E5EF)] px-1 pb-2">
              <SignalsLanded companies={companiesLive} />
            </div>
          </details>
        ) : null}
        <div className="h-4 lg:hidden" aria-hidden data-mobile-dock-spacer="" />

        <div className="sr-only">
          {sectors.map((item) => (
            <Link key={item.id} href={browseHref({ feed, sector: item.id, kind, campus, q: query, sort: feed === "directory" ? sort : undefined })}>
              {item.label}
            </Link>
          ))}
          {kinds.map((item) => (
            <Link key={item.id} href={browseHref({ feed, sector, kind: item.id, campus, q: query, sort: feed === "directory" ? sort : undefined })}>
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Col 3 · campus ranks when feed closed; feed/overlays when open. */}
      <aside
          className="hidden min-w-0 lg:block"
          data-browse-wire=""
          data-instrument-tabs=""
          data-right-rail={rightOpen ? "open" : "closed"}
        >
          <div className="sticky top-14">
            {!rightOpen ? (
              <div className={`${PANEL} relative overflow-hidden p-3`} data-companies-side-ranks="">
                <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[color:var(--fg-3,#5C647A)]">Campuses on this desk</p>
                <ol className="mt-2 space-y-1.5">
                  {pageCampusRanks.slice(0, 8).map((row, i) => (
                    <li key={row.label} className="flex items-baseline justify-between gap-2 text-[13px]">
                      <span className="min-w-0 truncate text-[color:var(--fg,#0B0E17)]">
                        <span className="mr-1.5 font-mono text-[11px] tabular-nums text-[color:var(--fg-3,#5C647A)]">{String(i + 1).padStart(2, "0")}</span>
                        {row.label}
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-[color:var(--fg-2,#3F465C)]">{row.companies.toLocaleString("en-US")}</span>
                    </li>
                  ))}
                  {pageCampusRanks.length === 0 ? (
                    <li className="text-[13px] text-[color:var(--fg-3,#5C647A)]">No campus ranks yet</li>
                  ) : null}
                </ol>
                <button
                  type="button"
                  className="mt-3 inline-flex h-9 items-center rounded-md border border-[color:var(--line-strong,#C5CAD8)] px-3 text-[13px] font-semibold"
                  data-btn-style="sans"
                  onClick={() => setRightOpen(true)}
                >
                  Open feed
                </button>
              </div>
            ) : (
              <div className={`${PANEL} relative overflow-hidden p-2.5`}>
                <div className="mb-2 flex items-center justify-between gap-2 border-b border-[color:var(--line,#E1E5EF)] pb-2">
                  <div className="flex items-center gap-1" role="tablist" aria-label="Instrument panels">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={rightTab === "feed"}
                      data-tab="feed"
                      data-btn-style="sans"
                      onClick={() => setRightTab("feed")}
                      className={`h-7 rounded-full px-2.5 text-[12px] font-semibold ${
                        rightTab === "feed"
                          ? "bg-[color:var(--cobalt,#2F4FD8)] text-white"
                          : "text-[color:var(--fg-3,#5C647A)] hover:text-[color:var(--fg,#0B0E17)]"
                      }`}
                    >
                      Feed
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={rightTab === "overlays"}
                      data-tab="overlays"
                      data-btn-style="sans"
                      onClick={() => setRightTab("overlays")}
                      className={`h-7 rounded-full px-2.5 text-[12px] font-semibold ${
                        rightTab === "overlays"
                          ? "bg-[color:var(--cobalt,#2F4FD8)] text-white"
                          : "text-[color:var(--fg-3,#5C647A)] hover:text-[color:var(--fg,#0B0E17)]"
                      }`}
                    >
                      Overlays
                    </button>
                  </div>
                  <button
                    type="button"
                    data-close-right-rail=""
                    data-btn-style="sans"
                    onClick={() => setRightOpen(false)}
                    className="text-[13px] font-semibold text-[color:var(--fg-3,#5C647A)] hover:text-[color:var(--ember,#D96B1C)]"
                  >
                    Close
                  </button>
                </div>
                {rightTab === "feed" ? (
                  <div data-tab-panel="feed">
                    <IntelligenceBoards
                      companies={boardCompanies}
                      compact={pages <= 1}
                      surface={wireSurface}
                      hideSector={feed === "directory" && pages <= 1}
                      hideLatest={false}
                      hidePrograms={false}
                    />
                  </div>
                ) : (
                  <div className="space-y-3" data-tab-panel="overlays" data-overlay-campus-unit={overlayCounts.campusUnit}>
                    <OverlayCountBlock title="Status" rows={overlayCounts.status} onSelect={applyOverlayRow} activeId={facets.status} />
                    <OverlayCountBlock title="Sector" rows={overlayCounts.sector} onSelect={applyOverlayRow} activeId={facets.sector} />
                    <OverlayCountBlock
                      title="Campus"
                      unit={CAMPUS_COUNT_UNIT}
                      rows={overlayCounts.campus}
                      onSelect={applyOverlayRow}
                      activeId={facets.campus}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
      </aside>


      {/* Mobile bottom filter sheet */}
      {mobileFiltersOpen ? (
        <div id="mobile-filter-sheet" className="fixed inset-0 z-40 lg:hidden" data-mobile-filter-sheet="" role="dialog" aria-modal="true" aria-label="Filters">
          <button
            type="button"
            className="absolute inset-0 bg-[color:var(--fg,#0B0E17)]/35"
            aria-label="Dismiss filters"
            onClick={() => setMobileFiltersOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[55dvh] overflow-hidden rounded-t-lg border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] shadow-lg">
            <div className="flex items-center justify-between gap-3 border-b border-[color:var(--line,#E1E5EF)] px-3 py-2.5">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--cobalt,#2F4FD8)]">
                Filters
                <span className="ml-2 font-mono text-[13px] font-bold tabular-nums normal-case tracking-normal text-[color:var(--ember,#D96B1C)]">
                  {boardCompanies.length.toLocaleString("en-US")}
                </span>
                <span className="ml-1 font-mono text-[11px] font-medium normal-case tracking-normal text-[color:var(--fg-3,#5C647A)]">
                  of {total.toLocaleString("en-US")}
                </span>
              </p>
              <button
                type="button"
                className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--ember,#D96B1C)]"
                onClick={() => setMobileFiltersOpen(false)}
              >
                Done
              </button>
            </div>
            <div className="max-h-[calc(55dvh-48px)] overflow-y-auto overscroll-contain px-1 pb-6" data-mobile-sheet-facets="" data-mobile-facet-map="">
              {pages <= 1 ? (
                <div className="mb-2 flex flex-wrap gap-1.5 px-2.5 pt-2" data-mobile-sort-segment="" role="group" aria-label="Sort ledger">
                  {(
                    [
                      ["rank", "Rank"],
                      ["recent", "Newest"],
                      ["name", "Name"],
                      ["stage", "Stage"],
                    ] as const
                  ).map(([id, label]) => {
                    const active = sort === id;
                    return (
                      <Link
                        key={id}
                        href={browseHref({ feed, sector, kind, campus, q: query, sort: id })}
                        className={`inline-flex h-8 items-center rounded-sm border px-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] ${
                          active
                            ? "border-[color:var(--cobalt,#2F4FD8)] bg-[color:var(--cobalt-haze,#E8ECFA)] text-[color:var(--cobalt,#2F4FD8)]"
                            : "border-[color:var(--line,#E1E5EF)] text-[color:var(--fg-2,#3F465C)]"
                        }`}
                      >
                        {label}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
              <FacetRail companies={companiesLive} campuses={campuses} facets={facets} onChange={(next) => commitFacet(next, { debounceMs: next.query !== facets.query ? 120 : 0 })} dense sheet />
            </div>
          </div>
        </div>
      ) : null}

      {/* Filters live in the quiet inline row above the list (no bottom dock). */}
    </div>
  );
}

function signalMeta(card: DirectoryCard): { primary: string; secondary: string } | null {
  if (card.signals <= 0) return null;
  const date = (card.latestSignalAt ?? "").replace(/-00/g, "").trim();
  if (card.signalLabel || date) {
    return {
      primary: card.signalLabel ?? (card.signals > 1 ? String(card.signals) : "Signal"),
      secondary: date || (card.signals > 1 ? "signals" : ""),
    };
  }
  if (card.signals > 1) {
    return { primary: String(card.signals), secondary: "signals" };
  }
  return null;
}

/** Editorial ledger row - fold/map-stage language: ruled, mono meta, ember hover. */
function OverlayCountBlock({
  title,
  rows,
  onSelect,
  activeId,
  unit,
}: {
  title: string;
  rows: OverlayRow[];
  onSelect: (row: OverlayRow) => void;
  activeId?: string | null;
  unit?: string;
}) {
  if (rows.length === 0) {
    return (
      <div>
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]">{title}</p>
        <p className="mt-1 text-[12px] text-[color:var(--fg-3,#5C647A)]">None in this view.</p>
      </div>
    );
  }
  return (
    <div data-overlay-facet={title.toLowerCase()} data-overlay-unit={unit || undefined}>
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]">
        {title}
        {unit ? <span className="ml-1 font-medium normal-case tracking-normal text-[color:var(--fg-3,#5C647A)]">· {unit}</span> : null}
      </p>
      <ul className="mt-1.5 divide-y divide-[color:var(--line,#E1E5EF)] border border-[color:var(--line,#E1E5EF)]">
        {rows.map((row) => {
          const active = activeId === row.id;
          return (
            <li key={row.id}>
              <button
                type="button"
                data-overlay-row={row.facet}
                data-overlay-id={row.id}
                data-overlay-count={String(row.count)}
                aria-pressed={active}
                onClick={() => onSelect(row)}
                className={`flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-[color:var(--cobalt-haze,#E8ECFA)]/40 ${
                  active ? "bg-[color:var(--ember,#D96B1C)]/8" : ""
                }`}
              >
                <span className={`${WRAP_FULL} font-medium ${active ? "text-[color:var(--ember,#D96B1C)]" : "text-[color:var(--fg,#0B0E17)]"}`}>{row.label}</span>
                <span className="font-mono text-[11px] font-bold tabular-nums text-[color:var(--ember,#D96B1C)]">{row.count.toLocaleString("en-US")}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function LedgerRow({
  card,
  rank,
  ranked = false,
  whyOverride,
  showCampusSeal = true,
  selected = false,
  founderLinks = [],
  evidenceRich = false,
}: {
  card: DirectoryCard;
  rank: number | null;
  ranked?: boolean;
  /** Null blanks a repeated Why line; undefined uses whyItsHere. */
  whyOverride?: string | null;
  /** First row of a campus run shows the seal on mobile; desk keeps one per row. */
  showCampusSeal?: boolean;
  selected?: boolean;
  founderLinks?: { name: string; linkedinUrl: string }[];
  /** r57: richer stage/program chips on continued mobile batches (companies-more). */
  evidenceRich?: boolean;
}) {
  const pitch = stripUrls((card.description || "").trim()) || "";
  const meta = signalMeta(card);
  const why = whyOverride === undefined ? whyItsHere(card) : whyOverride;
  const desk = directoryRank(card);
  const tierLabel = desk.tier === 0 ? "Core" : desk.tier === 1 ? "Watch" : "Listed";
  const backers = (card.programs?.length ? card.programs : card.primaryProgram ? [card.primaryProgram] : []).slice(0, 3);
  const yearOrBatch = card.foundedYear != null ? String(card.foundedYear) : null;
  return (
    <Link
      href={`/startup/${card.id}`}
      data-card-signals={card.signals}
      data-card-dated={card.latestSignalAt ? "1" : "0"}
      data-card-selected={selected ? "1" : undefined}
      data-card-tier={tierLabel}
      className={`group flex min-h-11 items-start gap-3 border-b border-[color:var(--line,#E1E5EF)] px-3 py-4 transition-colors duration-150 ease-out last:border-b-0 active:scale-[0.995] sm:gap-3.5 sm:px-4 sm:py-5 lg:hover:bg-[color:var(--bg-2,#F7F8FC)] ${
        selected ? "bg-[color:var(--bg-2,#F7F8FC)]" : ""
      }`}
    >
      {rank != null ? (
        <span
          className={`mt-1 shrink-0 text-right font-mono font-semibold tabular-nums tracking-tight text-[color:var(--fg-3,#5C647A)] ${
            ranked ? "w-8 text-[15px] sm:w-9 sm:text-[16px]" : "w-6 text-[13px] sm:w-7"
          }`}
        >
          {String(rank).padStart(2, "0")}
        </span>
      ) : null}
      {card.logoUrl ? (
        <LogoMark name={card.name} logoUrl={card.logoUrl} size={ranked ? 44 : 48} campusInk={campusInk(card.schoolId || card.school)} />
      ) : card.school ? (
        ranked ? (
          <CampusSeal label={card.school} size="sm" className="mt-0.5" />
        ) : (
          <>
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center lg:hidden" aria-hidden={!showCampusSeal}>
              {showCampusSeal ? <CampusSeal label={card.school} size="xs" /> : null}
            </span>
            <span className="mt-0.5 hidden shrink-0 lg:inline-flex">
              <CampusSeal label={card.school} size="md" />
            </span>
          </>
        )
      ) : (
        <LogoMark name={card.name} logoUrl={card.logoUrl} size={ranked ? 44 : 48} campusInk={campusInk(card.schoolId || card.school)} />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="break-words text-[17px] font-semibold leading-snug tracking-tight text-[color:var(--fg,#0B0E17)] sm:text-[18px] sm:leading-6">
            {card.name}
          </p>
          {card.school ? (
            <span className="text-[13px] text-[color:var(--fg-3,#5C647A)]">{card.school}</span>
          ) : null}
        </div>
        {pitch ? (
          <p className="mt-1 max-w-2xl text-[14px] leading-5 text-[color:var(--fg-2,#3F465C)]" title={pitch} data-card-pitch="">
            {ellipsisAtBoundary(pitch, 140)}
          </p>
        ) : null}
        {why ? (
          <p className="sr-only" data-why-here="" title={why}>{why}</p>
        ) : (
          <p className="sr-only" data-why-here="" data-why-blank="1">Why it&apos;s here blank</p>
        )}
        <TagChips
          max={4}
          chips={[
            { key: "tier", label: tierLabel, attrs: { "data-card-tier-chip": "" } },
            ...(yearOrBatch
              ? [{ key: "year", label: yearOrBatch, tone: "mono" as const, attrs: { "data-card-year": "" } }]
              : []),
            ...(card.stage
              ? [{ key: "stage", label: card.stage, attrs: { "data-evidence-chip": "stage" } }]
              : []),
            ...(card.sector
              ? [{ key: "sector", label: card.sector, attrs: { "data-card-sector": "" } }]
              : []),
            ...(meta
              ? [{ key: "signal", label: meta.primary, attrs: { "data-evidence-chip": "signal" } }]
              : []),
            ...backers.map((backer) => ({
              key: `b-${backer}`,
              label: backer,
              tone: "soft" as const,
              title: backer,
              attrs: { "data-card-backer": "" },
            })),
          ].filter(Boolean) as TagChip[]}
        />
        <span className="sr-only" data-card-chips="" data-evidence-chips={evidenceRich ? "1" : undefined} data-company-evidence={evidenceRich ? "1" : undefined} />
        {founderLinks.length > 0 ? (
          <span className="mt-2 flex flex-wrap items-center gap-1.5" data-card-founder-links="" onClick={(event) => event.preventDefault()}>
            {founderLinks.slice(0, 3).map((founder) => (
              <button
                key={founder.linkedinUrl}
                type="button"
                title={founder.name}
                aria-label={`${founder.name} on LinkedIn`}
                className="inline-flex h-9 min-h-9 items-center gap-1 rounded-full border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-2.5 text-[12px] font-medium text-[color:var(--fg,#0B0E17)] hover:border-[color:var(--fg-2,#3F465C)]"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  window.open(founder.linkedinUrl, "_blank", "noopener,noreferrer");
                }}
              >
                in
                <span className={`max-w-[7rem] ${WRAP_FULL}`}>{founder.name}</span>
              </button>
            ))}
          </span>
        ) : null}
      </div>
      {ranked && card.signals > 0 ? (
        <span className="mt-1 shrink-0 font-mono text-[13px] font-semibold tabular-nums text-[color:var(--fg-3,#5C647A)] sm:text-[14px]">
          {card.signals.toLocaleString("en-US")}
        </span>
      ) : null}
    </Link>
  );
}
