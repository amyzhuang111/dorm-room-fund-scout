"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { loadDirectoryClient } from "@/lib/client/directory-cache";
import type { DirectoryCard, DirectoryFilter, DirectorySort } from "@/lib/domain/directory";
import { directoryRank } from "@/lib/domain/directory-rank";
import { whyItsHere } from "@/lib/domain/directory-rank";
import { directoryCardSubtitle } from "@/lib/domain/sample-facets";
import type { FacetCompany } from "@/lib/domain/sample-facets";
import { shortCampusLabel } from "@/lib/domain/campuses";
import { CampusSeal } from "@/components/campus-seal";
import { MobileListMast } from "@/components/mobile-list-mast";
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
import {
  activeFacetChips,
  browseHref as buildBrowseHref,
  type FacetState as UrlFacetState,
} from "@/lib/domain/facet-url";
import { CurrentViewDock } from "@/components/current-view-dock";

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
  const topCampus = useMemo(() => {
    return [...campuses].sort((a, b) => b.founders - a.founders || a.name.localeCompare(b.name))[0] ?? null;
  }, [campuses]);
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
    const map = new Map<string, { label: string; companies: number; signaled: number }>();
    for (const card of cards) {
      const label = (card.school || "").trim();
      if (!label) continue;
      const cur = map.get(label) ?? { label, companies: 0, signaled: 0 };
      cur.companies += 1;
      if (card.signals > 0) cur.signaled += 1;
      map.set(label, cur);
    }
    return [...map.values()]
      .sort((a, b) => b.companies - a.companies || b.signaled - a.signaled || a.label.localeCompare(b.label))
      .slice(0, 6);
  }, [cards]);
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

  function commitFacet(next: FacetState) {
    setFacets(next);
    const href = browseHref({
      feed,
      sort: feed === "directory" ? sort : undefined,
      facets: next,
      c: selectedCompanyId,
    });
    router.push(href);
  }

  const chipDefs = useMemo(() => {
    const campusLabel = facets.campus
      ? campuses.find((c) => c.id === facets.campus)?.name ?? facets.campus
      : null;
    return activeFacetChips(facets, { campus: campusLabel });
  }, [facets, campuses]);

  const dockCompanies = useMemo(
    () =>
      boardCompanies.slice(0, 48).map((c) => ({
        id: c.id,
        name: c.name,
        logoUrl: c.logoUrl,
        href: `/startup/${c.id}`,
      })),
    [boardCompanies],
  );

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
  const wireLabel = pages > 1 ? "More on this list" : "On this list";

  return (
    <div
      className="mx-auto mt-2 grid w-full max-w-[1280px] scroll-mt-16 gap-4 sm:mt-3 lg:grid-cols-[minmax(280px,320px)_minmax(0,1fr)_minmax(220px,280px)] lg:gap-5"
      data-browse-spread=""
    >
      {/* Col 1 · persistent ruled index (magazine TOC), not a sheet over content */}
      <aside className="hidden min-w-0 lg:block" data-browse-index="">
        <div className="sticky top-14 space-y-2">
          <div
            className="border-b border-[color:var(--line,#E1E5EF)] pb-2"
            data-index-signal-beat=""
            data-filters-index-hero=""
            data-n-of-m=""
          >
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[color:var(--cobalt,#2F4FD8)]">Filters</p>
            <p className="mt-1.5 font-mono text-[32px] font-bold leading-[0.84] tracking-[-0.05em] text-[color:var(--ember,#D96B1C)]">
              <span data-match-count="">{boardCompanies.length.toLocaleString("en-US")}</span>
              <span className="mx-1.5 text-[18px] font-semibold tracking-normal text-[color:var(--fg-3,#5C647A)]">of</span>
              <span className="text-[22px] font-bold text-[color:var(--fg,#0B0E17)]" data-total-count="">
                {total.toLocaleString("en-US")}
              </span>
            </p>
            <p className="mt-1.5 text-[13px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">
              {feed === "leaderboard" ? "on the signal desk" : "companies"}
            </p>
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
                  className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[color:var(--cobalt,#2F4FD8)] hover:underline"
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
                className="inline-flex h-8 items-center rounded-sm border border-[color:var(--line-strong,#C5CAD8)] bg-[color:var(--bg,#FFFFFF)] px-2.5 font-mono text-[11px] font-semibold text-[color:var(--fg,#0B0E17)] hover:border-[color:var(--cobalt,#2F4FD8)]"
              >
                Export CSV
              </button>
            </div>
          </div>
          <div className="h-[min(42vh,400px)] pt-1" data-contents-facet-map="">
            <FacetRail
              companies={companiesLive}
              campuses={campuses}
              facets={facets}
              onChange={commitFacet}
              index
              indexCount={boardCompanies.length}
              caption={feed === "leaderboard" ? "Signals" : "Companies"}
            />
          </div>
          <CurrentViewDock companies={dockCompanies} />
        </div>
      </aside>

      {/* Col 2 · ember figure hero + ledger */}
      <div className="min-w-0" data-browse-ledger="">
        {/* Distinct hero per surface · fold language, not the fold stamp */}
        <div
          className={`mb-3 border-b border-[color:var(--line,#E1E5EF)] pb-3 lg:mb-2 lg:pb-2 ${
            feed === "directory" && pages <= 1 ? "hidden lg:block" : ""
          } ${feed === "directory" && pages > 1 ? "hidden lg:block" : ""}`}
          data-browse-hero={feed}
          data-continued-page={pages > 1 ? "1" : undefined}
          data-ledger-chapter={feed === "directory" ? "1" : undefined}
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              {feed === "leaderboard" && topCampus ? (
                <div className="min-w-0" data-signal-hero-spread="">
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--cobalt,#2F4FD8)]">
                      Signal desk · ranked ledger
                    </p>
                    <p className="mt-1 font-mono text-[28px] font-bold leading-[0.88] tracking-[-0.04em] text-[color:var(--ember,#D96B1C)]">
                      {topCampus.founders.toLocaleString("en-US")}
                    </p>
                    <p className="mt-1 text-[15px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">
                      {shortCampusLabel(topCampus.id, topCampus.name)}
                      {" · #1 by founders"}
                    </p>
                    <p className="mt-1 font-mono text-[11px] tabular-nums text-[color:var(--fg-2,#3F465C)]">
                      Ranked by recent signal weight ·{" "}
                      <span className="font-bold text-[color:var(--ember,#D96B1C)]">{total.toLocaleString("en-US")}</span>
                      {" on desk"}
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--cobalt,#2F4FD8)]">{kicker}</p>
                  <p className="mt-1.5 font-mono text-[44px] font-bold leading-[0.84] tracking-[-0.05em] text-[color:var(--fg,#0B0E17)]">
                    <span className="text-[color:var(--ember,#D96B1C)]">{total.toLocaleString("en-US")}</span>
                  </p>
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
                </>
              )}
            </div>
            {/* Desktop: pill sort only · filters live in the persistent index column. */}
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
                      className={`inline-flex h-8 items-center rounded-sm border px-3 font-mono text-[11px] font-medium ${sortChip(sort === id)}`}
                    >
                      {label}
                    </Link>
                  ))
                : null}
            </div>
          </div>
          {feed === "directory" && pages <= 1 ? (
            <div className="mt-4 hidden lg:block" data-signals-landed-desk="">
              <SignalsLanded companies={companiesLive} />
            </div>
          ) : null}
          {feed === "directory" && pages > 1 ? (
            <div className="mt-3 hidden lg:block" data-signals-landed-desk-continued="">
              <SignalsLanded companies={companiesLive} />
            </div>
          ) : null}
        </div>

        {/* Scout Chronograph · unifying system. Browse-more uses folio (originality priority);
            page-1 pairs chronograph + sector strip; leaderboard uses chronograph alone. */}
        <div className="mb-2 flex flex-wrap items-center gap-2 lg:hidden" data-mobile-filter-chips="" data-n-of-m="">
          <span className="font-mono text-[11px] tabular-nums text-[color:var(--fg-2,#3F465C)]">
            <span className="font-bold text-[color:var(--ember,#D96B1C)]">{boardCompanies.length.toLocaleString("en-US")}</span>
            {" of "}
            <span className="font-semibold text-[color:var(--fg,#0B0E17)]">{total.toLocaleString("en-US")}</span>
            {" companies"}
          </span>
          {chipDefs.map((chip) => (
            <button
              key={`m-${String(chip.key)}`}
              type="button"
              data-filter-chip={String(chip.key)}
              onClick={() => commitFacet({ ...facets, ...chip.clear })}
              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[color:var(--cobalt,#2F4FD8)]/35 bg-[color:var(--cobalt-haze,#E8ECFA)]/60 px-2.5 text-[12px] font-medium"
            >
              {chip.label}
              <span className="font-mono text-[10px] text-[color:var(--ember,#D96B1C)]" aria-hidden>x</span>
            </button>
          ))}
          <button
            type="button"
            data-export-filtered-mobile=""
            onClick={() => exportFilteredCsv(boardCompanies)}
            className="ml-auto font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--cobalt,#2F4FD8)]"
          >
            Export CSV
          </button>
        </div>
        <div className="mb-3 space-y-2 lg:hidden" data-mobile-browse-compose="">
          {/* r30: one list mast (seal + counts + takeaway), then a single collapsed Filters row. Sort lives inside Filters. */}
          {feed === "directory" && pages <= 1 ? (
            <div data-browse-mobile-hero="">
            <MobileListMast
              kicker="Companies on this desk"
              sealLabel={deskCampusTop?.label}
              figure={total.toLocaleString("en-US")}
              figureSuffix="companies"
              takeaway={
                deskCampusTop
                  ? `${deskCampusTop.label} leads with ${deskCampusTop.signaled.toLocaleString("en-US")} signaled of ${deskCampusTop.companies.toLocaleString("en-US")} on the desk`
                  : `${signaledMatch.toLocaleString("en-US")} companies on this desk carry a signal`
              }
              meta={`${signaledMatch.toLocaleString("en-US")} with a signal`}
            >
              <div data-signals-landed-mobile="" className="border-t border-[color:var(--cobalt,#2F4FD8)]/15 px-3.5 pb-3">
                <SignalsLanded companies={companiesLive} compact />
              </div>
            </MobileListMast>
            </div>
          ) : null}

          {feed === "directory" && pages > 1 ? (
            <MobileListMast
              kicker="Campuses in this batch"
              sealLabel={pageCampusRanks[0]?.label}
              figure={String(pageCampusRanks.length || pageSignaled)}
              figureSuffix={pageCampusRanks.length ? "campuses" : "signaled"}
              takeaway={
                pageCampusRanks[0]
                  ? `${pageCampusRanks[0].label} tops this batch with ${pageCampusRanks[0].companies.toLocaleString("en-US")} companies · ${pageSignaled.toLocaleString("en-US")} of ${cards.length.toLocaleString("en-US")} have a signal`
                  : `${pageSignaled.toLocaleString("en-US")} of ${cards.length.toLocaleString("en-US")} on this page have a signal`
              }
              meta={`Companies ${pageFrom.toLocaleString("en-US")}-${cards.length.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}`}
            >
              <div
                className="border-t border-[color:var(--cobalt,#2F4FD8)]/15 px-3.5 pb-3"
                data-mobile-continued-mast=""
                data-page-window=""
                data-page-peak=""
                data-chapter-window=""
                data-chapter-peak=""
              >
                <div className="flex items-end justify-between gap-3">
                  <p className="m-meta min-w-0">
                    <span data-page-signaled-count="">{pageSignaled.toLocaleString("en-US")}</span>
                    {" of "}
                    {cards.length.toLocaleString("en-US")}
                    {" have a signal"}
                    {pagePeakLabel ? (
                      <>
                        {" · peak "}
                        <span className="font-semibold text-[color:var(--cobalt,#2F4FD8)]">{pagePeakLabel}</span>
                      </>
                    ) : null}
                    {sliceInsight ? ` · ${sliceInsight.companyName}` : ""}
                  </p>
                  {pageSignalBars.length > 0 ? (
                    <div className="flex h-12 max-w-[42%] flex-1 items-end justify-end gap-0.5" data-page-signal-bars="" aria-hidden>
                      {pageSignalBars.map((bar) => (
                        <span
                          key={bar.key}
                          title={`${bar.label ?? bar.key}: ${bar.count}`}
                          className={`min-w-[5px] flex-1 rounded-sm ${bar.peak ? "bg-[color:var(--cobalt,#2F4FD8)]" : "bg-[color:var(--cobalt,#2F4FD8)]/40"}`}
                          style={{ height: `${Math.max(8, Math.round((bar.count / pageSignalBarsMax) * 44))}px` }}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="flex h-12 w-14 items-end" data-page-signal-bars="empty" aria-hidden>
                      <span className="w-full rounded-sm bg-[color:var(--cobalt,#2F4FD8)]/25" style={{ height: 24 }} />
                    </div>
                  )}
                </div>
              </div>
            </MobileListMast>
          ) : null}

          {feed === "leaderboard" ? (
            <MobileListMast
              kicker="Signal desk"
              sealLabel={podiumRows[0]?.label ?? deskCampusTop?.label}
              figure={(podiumRows[0]?.signals ?? signaledMatch).toLocaleString("en-US")}
              figureSuffix="signaled"
              takeaway={
                podiumRows[0]
                  ? `${podiumRows[0].label} leads the podium with ${podiumRows[0].founders.toLocaleString("en-US")} founders on record`
                  : `${signaledMatch.toLocaleString("en-US")} companies carry a signal on this desk`
              }
              meta={`${total.toLocaleString("en-US")} on the desk`}
            />
          ) : null}

          {/* Continued pages: sort segment stays above the list (r29 peak+sort). Page 1 keeps sort inside Filters. */}
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

          {/* Single chrome row: Filters (sort chips inside on page 1). */}
          {feed === "directory" ? (
            <div
              className="overflow-hidden border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)]"
              role="region"
              aria-label="Scout filters"
              data-mobile-filters-inline=""
              data-mobile-contents-hero=""
              data-filters-index-hero=""
            >
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left"
                onClick={() => setMobileFiltersOpen((open) => !open)}
                aria-expanded={mobileFiltersOpen}
              >
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--fg-2,#3F465C)]">
                  Filters
                  <span className="ml-2 font-mono text-[13px] font-bold tabular-nums normal-case tracking-normal text-[color:var(--fg,#0B0E17)]">
                    {boardCompanies.length.toLocaleString("en-US")}
                  </span>
                  <span className="ml-1 font-mono text-[11px] font-medium normal-case tracking-normal text-[color:var(--fg-3,#5C647A)]">
                    of {total.toLocaleString("en-US")}
                  </span>
                </p>
                <span className="whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.08em] text-[color:var(--cobalt,#2F4FD8)]">
                  {mobileFiltersOpen ? "Close" : "Open"}
                </span>
              </button>
              {mobileFiltersOpen ? (
                <div className="max-h-[min(42dvh,340px)] overflow-y-auto overscroll-contain border-t border-[color:var(--line,#E1E5EF)] px-1 pb-3" data-mobile-facet-map="">
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
                  <FacetRail companies={companiesLive} campuses={campuses} facets={facets} onChange={commitFacet} dense />
                </div>
              ) : null}
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
                      card={card}
                      rank={feed === "leaderboard" ? index + 1 : null}
                      ranked={feed === "leaderboard"}
                      whyOverride={whyOverride}
                      showCampusSeal={showCampusSeal}
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
                              <p className="truncate text-[15px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">{row.label}</p>
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
                    className="overflow-hidden border border-[color:var(--cobalt,#2F4FD8)]/30 bg-[color:var(--bg,#FFFFFF)]"
                    data-ledger-end-lead=""
                    data-pass-close=""
                  >
                    <div className="border-b border-[color:var(--cobalt,#2F4FD8)]/20 bg-[color:var(--cobalt-haze,#E8ECFA)]/35 px-3.5 py-3.5" data-mobile-list-mast="">
                      <div className="flex items-start gap-3">
                        {pageCampusRanks[0] ? <CampusSeal label={pageCampusRanks[0].label} size="lg" className="mt-1" /> : null}
                        <div className="min-w-0 flex-1">
                          <p className="m-kicker">Campuses in this batch</p>
                          <p className="m-figure mt-1.5" data-ledger-showing="" data-end-lead="" data-more-context="">
                            {pageCampusRanks.length.toLocaleString("en-US")}
                            <span className="m-figure-sub ml-1.5">campuses</span>
                          </p>
                          <p className="m-takeaway mt-2">
                            {pageCampusRanks[0]
                              ? `${pageCampusRanks[0].label} leads with ${pageCampusRanks[0].companies.toLocaleString("en-US")} companies on this page`
                              : `${cards.length.toLocaleString("en-US")} companies loaded`}
                          </p>
                          <p className="m-meta mt-1">
                            {cards.length.toLocaleString("en-US")} of {total.toLocaleString("en-US")} loaded
                          </p>
                        </div>
                      </div>
                    </div>
                    {pageCampusRanks.length ? (
                      <ol className="divide-y divide-[color:var(--line,#E1E5EF)] px-3.5" data-page-campus-seals="" data-page-campus-ranks="">
                        {pageCampusRanks.slice(0, 5).map((row, i) => (
                          <li key={row.label} className="flex items-center gap-2.5 py-2.5">
                            <span className="w-5 shrink-0 text-right font-mono text-[14px] font-bold tabular-nums text-[color:var(--cobalt,#2F4FD8)]">
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <CampusSeal label={row.label} size="md" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[14px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">{row.label}</p>
                              <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[color:var(--fg-2,#3F465C)]">
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
                    <div className="px-3.5 py-3" data-ledger-end-more="" data-ledger-end-colophon="">
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
                        <p className="mt-2 font-mono text-[12px] text-[color:var(--fg-3,#5C647A)]">
                          <span>{"Still "}{(total - cards.length).toLocaleString("en-US")}{" · "}</span>
                          <Link
                            href={moreHref}
                            data-load-next=""
                            className="font-semibold text-[color:var(--cobalt,#2F4FD8)] underline-offset-2 hover:underline"
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
              className="inline-flex h-8 items-center rounded-sm border border-[color:var(--ember,#D96B1C)] bg-[color:var(--ember,#D96B1C)] px-3 font-mono text-[11px] font-semibold text-white hover:opacity-90"
            >
              Show more
            </Link>
            <p className="font-mono text-[10px] tabular-nums text-[color:var(--fg-3,#5C647A)]" data-ledger-showing-next="">
              {"Companies 1 to "}
              <span className="font-medium text-[color:var(--fg-2,#3F465C)]">{cards.length.toLocaleString("en-US")}</span>
              {" of "}
              {total.toLocaleString("en-US")}
            </p>
          </div>
        ) : pages > 1 && cards.length >= total ? (
          <p className="mt-4 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--fg-3,#5C647A)]">
            All companies shown
          </p>
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

      {/* Col 3 · WIRE digest (desk), aligned to fold grid */}
      <aside className="hidden min-w-0 lg:block" data-browse-wire="">
        <div className="sticky top-14">
          <div className={`${PANEL} relative overflow-hidden p-2.5`}>
            <div className="mb-2 flex items-baseline justify-between gap-2 border-b border-[color:var(--line,#E1E5EF)] pb-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--cobalt,#2F4FD8)]">{wireLabel}</p>
              <p className="font-mono text-[10px] tabular-nums text-[color:var(--fg-3,#5C647A)]">
                {pages > 1 && feed === "directory" ? (
                  <>
                    <span className="font-bold text-[color:var(--ember,#D96B1C)]">{cards.length}</span>
                    {" / "}
                    {boardCompanies.length.toLocaleString("en-US")}
                  </>
                ) : (
                  boardCompanies.length.toLocaleString("en-US")
                )}
              </p>
            </div>
            <IntelligenceBoards
              companies={boardCompanies}
              compact={pages <= 1}
              surface={wireSurface}
              hideSector={feed === "directory" && pages <= 1}
              hideLatest={pages <= 1}
              hidePrograms={false}
            />
          </div>
        </div>
      </aside>

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
function LedgerRow({
  card,
  rank,
  ranked = false,
  whyOverride,
  showCampusSeal = true,
  selected = false,
}: {
  card: DirectoryCard;
  rank: number | null;
  ranked?: boolean;
  /** Null blanks a repeated Why line; undefined uses whyItsHere. */
  whyOverride?: string | null;
  /** First row of a campus run shows the seal on mobile; desk keeps one per row. */
  showCampusSeal?: boolean;
  selected?: boolean;
}) {
  const subtitle = directoryCardSubtitle(card);
  const meta = signalMeta(card);
  const why = whyOverride === undefined ? whyItsHere(card) : whyOverride;
  return (
    <Link
      href={`/startup/${card.id}`}
      data-card-signals={card.signals}
      data-card-dated={card.latestSignalAt ? "1" : "0"}
      data-card-selected={selected ? "1" : undefined}
      className={`group flex items-start px-3.5 transition-[background-color,color] lg:hover:bg-[color:var(--cobalt-haze,#E8ECFA)]/40 sm:px-3.5 ${
        ranked ? "gap-3 py-3.5 sm:py-3 lg:gap-3 lg:py-3.5" : "gap-2.5 py-4 sm:gap-3 sm:py-3"
      } ${selected ? "bg-[color:var(--cobalt-haze,#E8ECFA)]/55 ring-1 ring-inset ring-[color:var(--cobalt,#2F4FD8)]/35" : ""}`}
    >
      {rank != null ? (
        <span
          className={`shrink-0 text-right font-mono font-bold tabular-nums tracking-[-0.05em] text-[color:var(--ember,#D96B1C)] ${
            ranked
              ? "mt-0 w-9 text-[22px] leading-none sm:w-10 sm:text-[24px] lg:w-11 lg:text-[26px]"
              : "mt-0.5 w-6 text-[16px] leading-none sm:w-8 sm:text-[20px]"
          }`}
        >
          {String(rank).padStart(2, "0")}
        </span>
      ) : null}
      {/* Directory mobile: xs seal once per campus group. Ranked mobile + desk: per-row seal (04db2e8). */}
      {card.school ? (
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
        <LogoMark name={card.name} logoUrl={card.logoUrl} size={ranked ? 20 : 24} />
      )}
      <div className="min-w-0 flex-1">
        <p
          className={
            ranked
              ? "line-clamp-2 break-words text-[20px] font-semibold leading-snug tracking-tight text-[color:var(--fg,#0B0E17)] underline-offset-2 lg:group-hover:text-[color:var(--ember,#D96B1C)] lg:group-hover:underline lg:group-hover:decoration-[color:var(--ember,#D96B1C)]/70 sm:line-clamp-none sm:text-[18px] sm:leading-5 sm:[overflow-wrap:anywhere]"
              : "truncate text-[18px] font-semibold leading-5 tracking-tight text-[color:var(--fg,#0B0E17)] underline-offset-2 lg:group-hover:text-[color:var(--ember,#D96B1C)] lg:group-hover:underline lg:group-hover:decoration-[color:var(--ember,#D96B1C)]/70 sm:text-[16px]"
          }
        >
          {card.name}
        </p>
        {subtitle ? (
          <p className="mt-0.5 text-[12px] leading-4 text-[color:var(--fg-2,#3F465C)] line-clamp-2">
            {subtitle}
          </p>
        ) : null}
        {why ? (
          <p className="mt-1.5 border-l-2 border-[color:var(--ember,#D96B1C)]/45 pl-2 text-[12px] leading-5 text-[color:var(--fg,#0B0E17)]" data-why-here="">
            <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ember,#D96B1C)]">Why it&apos;s here</span>
            <span className="mt-0.5 block">{why}</span>
          </p>
        ) : (
          <p className="sr-only" data-why-here="" data-why-blank="1">Why it&apos;s here blank</p>
        )}
        {(card.foundedYear != null || card.primaryProgram || (card.founders?.length ?? 0) > 0) ? (
          <p className={`mt-1 font-mono text-[10px] tabular-nums text-[color:var(--fg-3,#5C647A)] ${ranked ? "line-clamp-2" : "truncate"}`} data-card-facts="">
            {card.foundedYear != null ? (
              <span>
                <span className="font-bold text-[color:var(--ember,#D96B1C)]">{card.foundedYear}</span>
                {" founded"}
              </span>
            ) : null}
            {card.foundedYear != null && card.primaryProgram ? <span aria-hidden> · </span> : null}
            {card.primaryProgram ? <span className="text-[color:var(--fg-2,#3F465C)]">{card.primaryProgram}</span> : null}
            {(card.foundedYear != null || card.primaryProgram) && (card.founders?.length ?? 0) > 0 ? <span aria-hidden> · </span> : null}
            {(card.founders?.length ?? 0) > 0 ? (
              <span>
                <span className="font-bold text-[color:var(--fg,#0B0E17)]">{card.founders.length.toLocaleString("en-US")}</span>
                {card.founders.length === 1 ? " founder" : " founders"}
              </span>
            ) : null}
          </p>
        ) : null}
        {meta ? (
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex h-[18px] items-center rounded-sm border border-[color:var(--cobalt,#2F4FD8)]/30 bg-[color:var(--cobalt-haze,#E8ECFA)] px-1.5 font-mono text-[10px] font-semibold text-[color:var(--cobalt,#2F4FD8)]">
              {meta.primary}
            </span>
            {meta.secondary ? (
              <span className="inline-flex h-[18px] items-center rounded-sm border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-1.5 font-mono text-[10px] tabular-nums text-[color:var(--fg-2,#3F465C)] sm:hidden">
                {meta.secondary}
              </span>
            ) : null}
          </span>
        ) : null}
      </div>
      {ranked && card.signals > 0 ? (
        <span className="mt-0.5 shrink-0 font-mono text-[13px] font-bold tabular-nums text-[color:var(--ember,#D96B1C)] sm:text-[14px]">
          {card.signals.toLocaleString("en-US")}
        </span>
      ) : !ranked && meta?.secondary ? (
        <span className="mt-0.5 hidden shrink-0 self-center font-mono text-[11px] tabular-nums text-[color:var(--fg-3,#5C647A)] sm:inline">
          {meta.secondary}
        </span>
      ) : null}
    </Link>
  );
}
