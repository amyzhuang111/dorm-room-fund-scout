"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { loadDirectoryClient } from "@/lib/client/directory-cache";
import type { DirectoryCard, DirectoryFilter, DirectorySort } from "@/lib/domain/directory";
import { whyItsHere } from "@/lib/domain/directory-rank";
import { directoryCardSubtitle } from "@/lib/domain/sample-facets";
import type { FacetCompany } from "@/lib/domain/sample-facets";
import { shortCampusLabel } from "@/lib/domain/campuses";
import {
  applyFacets,
  emptyFacets,
  FacetRail,
  IntelligenceBoards,
  LogoMark,
  MobileFilterDock,
  PANEL,
  ScoutSignalPodium,
  campusFoundersTop,
  topPrograms,
  isYcProgramLabel,
  YC_MEMBERSHIP_EXPECTED,
  type FacetState,
  SignalsLanded,
} from "./sample-instrument";

type Feed = "directory" | "leaderboard";

function browseHref(opts: {
  feed?: Feed | "world";
  sector?: string;
  kind?: string;
  campus?: string;
  q?: string;
  sort?: DirectorySort;
  more?: number;
}): string {
  const query = new URLSearchParams();
  query.set("sample", "1");
  if (opts.feed && opts.feed !== "directory") query.set("feed", opts.feed);
  if (opts.sector) query.set("sector", opts.sector);
  if (opts.kind) query.set("kind", opts.kind);
  if (opts.campus) query.set("campus", opts.campus);
  const q = opts.q?.trim();
  if (q) query.set("q", q);
  if (opts.sort && opts.sort !== "rank") query.set("sort", opts.sort);
  if (opts.more && opts.more > 1) query.set("more", String(opts.more));
  return `/companies?${query.toString()}`;
}


type EndSliceInsight = {
  figure: number;
  figureUnit: string;
  kicker: string;
  companyName: string;
  companyMeta: string;
  companyId: string;
};

/** Real insight from the loaded page slice — never pagination batch size. */
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
  cards,
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
}) {
  const router = useRouter();
  const [facets, setFacets] = useState<FacetState>(() => ({
    ...emptyFacets(),
    sector: sector ?? null,
    kind: kind ?? null,
    campus: campus ?? null,
    query: query ?? "",
  }));
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
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
  const boardCompanies = useMemo(() => applyFacets(companiesLive, facets), [companiesLive, facets]);
  const topCampus = useMemo(() => {
    return [...campuses].sort((a, b) => b.founders - a.founders || a.name.localeCompare(b.name))[0] ?? null;
  }, [campuses]);
  /** Continued-view insight: matching companies with ≥1 stored signal (not pagination). */
  const signaledMatch = useMemo(
    () => boardCompanies.filter((c) => (c.signals ?? 0) > 0).length,
    [boardCompanies],
  );
  /** Quiet matching companies (no stored signal) — insight, not pagination. */
  const quietMatch = boardCompanies.length - signaledMatch;
  const pageSignalBars = useMemo(() => {
    const months = new Map<string, number>();
    for (const card of cards) {
      const at = card.latestSignalAt;
      if (!at || /-00-00$/.test(at) || card.signals <= 0) continue;
      const key = at.slice(0, 7);
      if (key.length < 7) continue;
      months.set(key, (months.get(key) ?? 0) + 1);
    }
    const rows = [...months.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, count]) => ({ key, count, peak: false as boolean }));
    if (!rows.length) return [] as { key: string; count: number; peak: boolean }[];
    const max = Math.max(...rows.map((r) => r.count));
    return rows.map((r) => ({ ...r, peak: r.count === max }));
  }, [cards]);
  const pageSignalBarsMax = Math.max(1, ...pageSignalBars.map((b) => b.count));
  const pageSignaled = useMemo(
    () => cards.filter((c) => (c.signals ?? 0) > 0).length,
    [cards],
  );
  const pagePeakMonth = pageSignalBars.find((b) => b.peak)?.key ?? "";
  const sliceInsight = useMemo(() => endSliceInsight(cards), [cards]);
  /** Leaderboard podium: top-3 campuses by founders; signals = companies with signal on that desk. */
  const podiumRows = useMemo(() => {
    const signaledByCampus = new Map<string, number>();
    for (const card of boardCompanies) {
      const id = card.schoolId;
      if (!id || !(card.signals > 0)) continue;
      signaledByCampus.set(id, (signaledByCampus.get(id) ?? 0) + 1);
    }
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
      sector: next.sector ?? undefined,
      kind: next.kind ?? undefined,
      campus: next.campus ?? undefined,
      q: next.query || undefined,
      sort: feed === "directory" ? sort : undefined,
    });
    if (
      next.sector !== (sector ?? null) ||
      next.kind !== (kind ?? null) ||
      next.campus !== (campus ?? null) ||
      (next.query || "") !== (query || "")
    ) {
      router.push(href);
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

  const wireLabel = pages > 1 ? "More on this list" : "On this list";

  return (
    <div
      className="mx-auto mt-2 grid w-full max-w-[1280px] scroll-mt-16 gap-4 sm:mt-3 lg:grid-cols-[minmax(280px,320px)_minmax(0,1fr)_minmax(220px,280px)] lg:gap-5"
      data-browse-spread=""
    >
      {/* Col 1 · persistent ruled index (magazine TOC), not a sheet over content */}
      <aside className="hidden min-w-0 lg:block" data-browse-index="">
        <div className="sticky top-14 space-y-2">
          {/* Ember beat for open Contents · trails 353/01/138 hero pages without twinning them */}
          {/* Contents index is the desk-filters hero · big split + FacetRail; dial lives on fold only. */}
          <div
            className="border-b border-[color:var(--line,#E1E5EF)] pb-2"
            data-index-signal-beat=""
            data-contents-hero=""
            data-filters-index-hero=""
          >
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[color:var(--cobalt,#2F4FD8)]">Contents</p>
            <p className="mt-1.5 font-mono text-[40px] font-bold leading-[0.84] tracking-[-0.05em] text-[color:var(--ember,#D96B1C)]">
              {boardCompanies.length.toLocaleString("en-US")}
            </p>
            <p className="mt-1.5 text-[13px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">
              {feed === "leaderboard" ? "on the signal desk" : "companies in this list"}
            </p>
          </div>
          {/* FacetRail is the filters hero · Contents is a quiet caption only. */}
          <div className="h-[min(48vh,460px)] pt-1" data-contents-facet-map="">
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
          data-continued-chapter={pages > 1 ? "1" : undefined}
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
        </div>

        {/* Scout Chronograph · unifying system. Browse-more uses folio (originality priority);
            page-1 pairs chronograph + sector strip; leaderboard uses chronograph alone. */}
        <div className="mb-3 space-y-3 lg:hidden" data-mobile-browse-compose="">
          {feed === "directory" && pages <= 1 ? (
            <div data-signals-landed-mobile="">
              <SignalsLanded companies={companiesLive} />
            </div>
          ) : null}
          {/* Leaderboard podium mounts inside data-ledger-stage (shot frames that). Browse-more keeps a folio insight, not a shared ticket. */}
          {feed === "directory" && pages > 1 ? (
            <div
              className="relative scroll-mt-14 overflow-hidden border border-[color:var(--cobalt,#2F4FD8)]/25 bg-[color:var(--bg,#FFFFFF)] px-3.5 py-3.5 before:absolute before:inset-y-0 before:left-0 before:w-[2px] before:bg-[color:var(--cobalt,#2F4FD8)]"
              data-mobile-continued-mast=""
              data-chapter-window=""
              data-chapter-peak=""
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]">On this page</p>
              <div className="mt-2 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-[36px] font-bold leading-none tracking-[-0.05em] text-[color:var(--ember,#D96B1C)]">
                    {pageSignaled.toLocaleString("en-US")}
                    <span className="ml-1 font-mono text-[16px] font-semibold tracking-tight text-[color:var(--fg-2,#3F465C)]">
                      / {cards.length.toLocaleString("en-US")}
                    </span>
                  </p>
                  <p className="mt-1.5 text-[14px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">
                    {pagePeakMonth
                      ? `Peak ${pagePeakMonth.slice(5)} among the ${cards.length} loaded`
                      : `${pageSignaled} carry a dated signal`}
                  </p>
                </div>
                {pageSignalBars.length > 0 ? (
                  <div className="flex h-14 items-end gap-0.5" data-page-signal-bars="" aria-hidden>
                    {pageSignalBars.map((bar) => (
                      <span
                        key={bar.key}
                        title={`${bar.key}: ${bar.count}`}
                        className={`w-2.5 rounded-sm ${bar.peak ? "bg-[color:var(--ember,#D96B1C)]" : "bg-[color:var(--cobalt,#2F4FD8)]/45"}`}
                        style={{ height: `${Math.max(10, Math.round((bar.count / pageSignalBarsMax) * 52))}px` }}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex h-14 w-16 items-end" data-page-signal-bars="empty" aria-hidden>
                    <span className="w-full rounded-sm bg-[color:var(--cobalt,#2F4FD8)]/25" style={{ height: 28 }} />
                  </div>
                )}
              </div>
              {sliceInsight ? (
                <p className="mt-2.5 text-[12px] leading-5 text-[color:var(--fg-2,#3F465C)]">
                  <span className="font-semibold text-[color:var(--fg,#0B0E17)]">{sliceInsight.companyName}</span>
                  {" · "}
                  {sliceInsight.figure.toLocaleString("en-US")} {sliceInsight.figureUnit}
                </p>
              ) : null}
            </div>
          ) : null}
          {feed === "directory" ? (
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
                    className={`relative flex h-9 flex-1 items-center justify-center font-mono text-[11px] font-semibold uppercase tracking-[0.08em] ${
                      i > 0 ? "border-l border-[color:var(--cobalt,#2F4FD8)]/25" : ""
                    } ${
                      active
                        ? "bg-[color:var(--cobalt-haze,#E8ECFA)] text-[color:var(--cobalt,#2F4FD8)] after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-[color:var(--ember,#D96B1C)]"
                        : "bg-[color:var(--bg,#FFFFFF)] text-[color:var(--fg-2,#3F465C)]"
                    }`}
                  >
                    {label}
                  </Link>
                );
              })}
            </div>
          ) : null}
          {/* Secondary sector strips culled · mobile page-1 owns the newest-insight hero alone. */}
        </div>

        {feed === "directory" && pages > 1 ? (
          <div className="mb-3 hidden lg:block" data-desk-browse-dominant="chapter-window" data-chapter-window="">
            {/* Browse-more: thin chapter rule · cards lead, not a second hero stamp. */}
            <p className="flex flex-wrap items-baseline gap-x-2 border-b border-[color:var(--line,#E1E5EF)] pb-2 font-mono text-[11px] tabular-nums text-[color:var(--fg-2,#3F465C)]">
              <span className="font-bold uppercase tracking-[0.16em] text-[color:var(--cobalt,#2F4FD8)]">Chapter</span>
              <span>
                <span className="font-bold text-[color:var(--ember,#D96B1C)]">{cards.length.toLocaleString("en-US")}</span>
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
              <div className="relative sticky top-12 z-10 mb-0 border border-b-0 border-[color:var(--cobalt,#2F4FD8)]/25 bg-[color:var(--bg,#FFFFFF)]/95 backdrop-blur-sm before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-[color:var(--ember,#D96B1C)]">
                {/* Desk (more-1440): f53d loud sticky. Mobile (more-375): quieter bar. */}
                <div className="hidden items-end justify-between gap-3 px-3 py-2 sm:px-3.5 lg:flex">
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]">
                      {feed === "leaderboard" ? "More signals" : "More companies"}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] text-[color:var(--fg-3,#5C647A)]">Section rules every 14 rows</p>
                  </div>
                  <p className="shrink-0 text-right font-mono text-[11px] tabular-nums text-[color:var(--fg-2,#3F465C)]" data-continued-insight="">
                    <span className="block text-[18px] font-bold leading-none tracking-tight text-[color:var(--ember,#D96B1C)] sm:text-[20px]">
                      {signaledMatch.toLocaleString("en-US")}
                    </span>
                    <span className="mt-0.5 block text-[9px] uppercase tracking-[0.1em]">with a signal</span>
                  </p>
                </div>
                <div className="flex items-baseline justify-between gap-3 px-3 py-2.5 lg:hidden">
                  <p className="text-[12px] font-semibold tracking-tight text-[color:var(--cobalt,#2F4FD8)]">
                    {feed === "leaderboard" ? "More signals" : "More companies"}
                  </p>
                  <p className="shrink-0 text-[11px] tabular-nums text-[color:var(--fg-2,#3F465C)]">
                    <span className="font-bold text-[color:var(--ember,#D96B1C)]">{signaledMatch.toLocaleString("en-US")}</span>
                    {" with a signal"}
                  </p>
                </div>
              </div>
            ) : null}
            <div data-ledger-stage={feed} data-ledger-top={pages > 1 ? undefined : ""}>
            {feed === "leaderboard" ? (
              <div className="mb-4 lg:hidden">
                <ScoutSignalPodium rows={podiumRows} totalOnDesk={total} />
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
                return (
                  <li key={card.id}>
                    {showDivider ? (
                      <div
                        className="flex items-center gap-2 border-t-2 border-[color:var(--cobalt,#2F4FD8)]/35 bg-[color:var(--cobalt-haze,#E8ECFA)]/50 px-3 py-1.5 sm:px-3.5"
                        data-ledger-section={String(Math.floor(index / chunk) + 1)}
                      >
                        <span className="h-px flex-1 bg-[color:var(--cobalt,#2F4FD8)]/25" aria-hidden />
                        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]">
                          Rows {String(sectionFrom).padStart(2, "0")}-{String(sectionTo).padStart(2, "0")}
                        </span>
                        <span className="h-px flex-1 bg-[color:var(--cobalt,#2F4FD8)]/25" aria-hidden />
                      </div>
                    ) : null}
                    <LedgerRow
                      card={card}
                      rank={feed === "leaderboard" ? index + 1 : null}
                      ranked={feed === "leaderboard"}
                      />
                  </li>
                );
              })}
            </ol>
            </div>
            {pages > 1 && sliceInsight ? (
              <div
                className="mt-4 border border-[color:var(--cobalt,#2F4FD8)]/25 bg-[color:var(--bg,#FFFFFF)]"
                data-ledger-end=""
                data-ledger-end-mobile=""
                data-end-insight={sliceInsight.kicker}
              >
                {/* Mobile lead + desk share one programs list; Showing appears once below. */}
                <div
                  className="scroll-mt-[5.5rem] border-b border-[color:var(--line,#E1E5EF)] px-4 pb-4 pt-5"
                  data-ledger-end-lead=""
                >
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[color:var(--cobalt,#2F4FD8)]">
                    End of chapter
                  </p>
                  {nextToScout[0] ? (
                    <>
                      <p className="mt-1.5 font-mono text-[44px] font-bold leading-[0.84] tracking-[-0.05em] text-[color:var(--ember,#D96B1C)] lg:text-[40px]">
                        {nextToScout[0].count.toLocaleString("en-US")}
                      </p>
                      <p className="mt-2 text-[16px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)] lg:text-[18px]">
                        {nextToScout[0].label}
                        {" leads programs on this desk"}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="mt-1.5 font-mono text-[44px] font-bold leading-[0.84] tracking-[-0.05em] text-[color:var(--ember,#D96B1C)]">
                        {cards.length.toLocaleString("en-US")}
                      </p>
                      <p className="mt-2 text-[16px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">
                        companies loaded on this chapter
                      </p>
                    </>
                  )}
                </div>
                <div className="px-3.5 py-5 sm:px-5 sm:py-6" data-ledger-end-colophon="" data-next-to-scout="">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[color:var(--ember,#D96B1C)]">
                    Next to scout
                  </p>
                  <p className="mt-1.5 max-w-[28rem] text-[15px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)] sm:text-[16px]">
                    Programs by company count on this desk
                  </p>
                  <ol className="mt-4 divide-y divide-[color:var(--line,#E1E5EF)] border-y border-[color:var(--line,#E1E5EF)]">
                    {nextToScout.map((prog, i) => (
                      <li key={prog.id} className="flex items-baseline gap-4 py-3.5">
                        <span className="w-8 shrink-0 text-right font-mono text-[13px] font-bold tabular-nums text-[color:var(--cobalt,#2F4FD8)]">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[16px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)] sm:text-[17px]">{prog.label}</span>
                        <span
                          className="shrink-0 font-mono text-[24px] font-bold leading-none tracking-[-0.04em] text-[color:var(--ember,#D96B1C)] sm:text-[28px]"
                          {...(isYcProgramLabel(prog.label) && prog.count === YC_MEMBERSHIP_EXPECTED
                            ? { "data-yc-membership-count": String(prog.count) }
                            : {})}
                        >
                          {prog.count.toLocaleString("en-US")}
                        </span>
                        {isYcProgramLabel(prog.label) && prog.count === YC_MEMBERSHIP_EXPECTED ? (
                          <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.1em] text-[color:var(--fg-3,#5C647A)]">in YC</span>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                  <p className="mt-4 font-mono text-[11px] tabular-nums text-[color:var(--fg-3,#5C647A)]" data-ledger-showing="" data-end-lead="">
                    <span className="font-bold text-[color:var(--ember,#D96B1C)]">{sliceInsight.figure.toLocaleString("en-US")}</span>
                    {" "}
                    {sliceInsight.figureUnit}
                    {" · see "}
                    <Link href={`/startup/${sliceInsight.companyId}?sample=1`} className="font-semibold text-[color:var(--fg,#0B0E17)] underline-offset-2 hover:text-[color:var(--ember,#D96B1C)] hover:underline">
                      {sliceInsight.companyName}
                    </Link>
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {cards.length < total ? (
          <div
            className={`mt-3 flex flex-wrap items-center gap-2.5 ${pages > 1 ? "border-t border-[color:var(--line,#E1E5EF)]/70 pt-3" : ""}`}
            data-ledger-more-footer=""
          >
            <Link
              href={moreHref}
              className={`inline-flex items-center rounded-sm border px-3 font-mono text-[11px] font-medium hover:opacity-90 ${
                pages > 1
                  ? "h-7 border-[color:var(--line,#E1E5EF)]/80 bg-transparent text-[color:var(--fg-3,#5C647A)]"
                  : "h-8 border-[color:var(--ember,#D96B1C)] bg-[color:var(--ember,#D96B1C)] text-white font-semibold"
              }`}
            >
              {pages > 1 ? "Load next page" : "Show more"}
            </Link>
            <p className="font-mono text-[10px] tabular-nums text-[color:var(--fg-3,#5C647A)]/90" data-ledger-showing-next="">
              {"Showing "}
              <span className="font-medium text-[color:var(--fg-2,#3F465C)]">{cards.length.toLocaleString("en-US")}</span>
              {" of "}
              {total.toLocaleString("en-US")}
            </p>
          </div>
        ) : pages > 1 ? (
          <p className="mt-4 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--fg-3,#5C647A)]">
            All companies shown
          </p>
        ) : null}

        <div className="h-20 lg:hidden" aria-hidden data-mobile-dock-spacer="" />

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
              compact
              surface={wireSurface}
              hideSector={feed === "directory"}
              hideLatest
              hidePrograms={pages > 1 && feed === "directory"}
            />
          </div>
        </div>
      </aside>

      <MobileFilterDock
        onOpen={() => setMobileFiltersOpen(true)}
        count={boardCompanies.length}
        caption={feed === "leaderboard" ? "Narrow the signal desk" : "Narrow the ledger"}
        tone="ember"
        kicker="Filters"
        observe="#browse"
      />

      {mobileFiltersOpen ? (
        <div
          className="fixed inset-x-0 top-12 z-50 max-h-[min(42dvh,360px)] overflow-hidden border-b border-[color:var(--cobalt,#2F4FD8)]/25 bg-[color:var(--bg,#FFFFFF)] shadow-[0_10px_28px_rgba(15,23,42,0.08)] lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Scout filters"
          data-mobile-filters-drawer=""
        >
          {/* Top drawer · no dim · list and chart stay visible underneath */}
          <div className="relative border-b border-[color:var(--line,#E1E5EF)] px-3.5 py-2" data-mobile-contents-hero="" data-filters-index-hero="">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[color:var(--cobalt,#2F4FD8)]">
                  Filters
                </p>
                <p className="mt-0.5 font-mono text-[18px] font-bold leading-none tracking-[-0.03em] text-[color:var(--ember,#D96B1C)]">
                  {boardCompanies.length.toLocaleString("en-US")}
                  <span className="ml-1.5 font-mono text-[11px] font-medium text-[color:var(--fg-2,#3F465C)]">in this list</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="inline-flex h-8 shrink-0 items-center rounded-sm border border-[color:var(--ember,#D96B1C)] bg-[color:var(--ember,#D96B1C)] px-3 font-mono text-[11px] font-semibold text-white"
              >
                Done
              </button>
            </div>
          </div>
          <div className="max-h-[min(34dvh,300px)] overflow-y-auto overscroll-contain" data-mobile-facet-map="">
            <FacetRail companies={companiesLive} campuses={campuses} facets={facets} onChange={commitFacet} dense />
          </div>
        </div>
      ) : null}
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

/** Editorial ledger row — fold/map-stage language: ruled, mono meta, ember hover. */
function LedgerRow({
  card,
  rank,
  ranked = false,
}: {
  card: DirectoryCard;
  rank: number | null;
  ranked?: boolean;
}) {
  const subtitle = directoryCardSubtitle(card);
  const meta = signalMeta(card);
  const why = whyItsHere(card);
  return (
    <Link
      href={`/startup/${card.id}`}
      className={`group flex items-start gap-3 px-3.5 transition-[background-color,color] lg:hover:bg-[color:var(--cobalt-haze,#E8ECFA)]/40 sm:gap-3 sm:px-3.5 ${
        ranked ? "py-3.5 sm:py-3 lg:gap-3 lg:py-3.5" : "py-3.5 sm:py-3"
      }`}
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
      <LogoMark name={card.name} logoUrl={card.logoUrl} size={ranked ? 20 : 24} />
      <div className="min-w-0 flex-1">
        <p
          className={
            ranked
              ? "line-clamp-2 break-words text-[17px] font-semibold leading-snug tracking-tight text-[color:var(--fg,#0B0E17)] underline-offset-2 lg:group-hover:text-[color:var(--ember,#D96B1C)] lg:group-hover:underline lg:group-hover:decoration-[color:var(--ember,#D96B1C)]/70 sm:line-clamp-none sm:text-[18px] sm:leading-5 sm:[overflow-wrap:anywhere]"
              : "truncate text-[16px] font-semibold leading-5 tracking-tight text-[color:var(--fg,#0B0E17)] underline-offset-2 lg:group-hover:text-[color:var(--ember,#D96B1C)] lg:group-hover:underline lg:group-hover:decoration-[color:var(--ember,#D96B1C)]/70 sm:text-[16px]"
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
