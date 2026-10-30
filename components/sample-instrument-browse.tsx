"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { DirectoryCard, DirectoryFilter, DirectorySort } from "@/lib/domain/directory";
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
  MobileWireStrip,
  PANEL,
  ScoutChronograph,
  chronographCaption,
  signalChronographDetail,
  sectorMix,
  contentsPageInsight,
  newestSectorMix,
  type FacetState,
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
  if (opts.sort && opts.sort !== "recent") query.set("sort", opts.sort);
  if (opts.more && opts.more > 1) query.set("more", String(opts.more));
  return `/?${query.toString()}#browse`;
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

  const boardCompanies = useMemo(() => applyFacets(companies, facets), [companies, facets]);
  const topCampus = useMemo(() => {
    return [...campuses].sort((a, b) => b.founders - a.founders || a.name.localeCompare(b.name))[0] ?? null;
  }, [campuses]);
  const topSector = useMemo(() => sectorMix(boardCompanies)[0] ?? null, [boardCompanies]);
  /** Continued-view insight: matching companies with ≥1 stored signal (not pagination). */
  const signaledMatch = useMemo(
    () => boardCompanies.filter((c) => (c.signals ?? 0) > 0).length,
    [boardCompanies],
  );
  /** Quiet matching companies (no stored signal) — insight, not pagination. */
  const quietMatch = boardCompanies.length - signaledMatch;
  /** Visible page / rank-band / loaded-end slice for chronograph (not the global 369). */
  const pageSlice = useMemo(() => cards as FacetCompany[], [cards]);
  const sliceInsight = useMemo(() => endSliceInsight(cards), [cards]);
  const contentsUnfiltered = boardCompanies.length === companies.length;
  const contentsChrono = useMemo(() => signalChronographDetail(boardCompanies), [boardCompanies]);
  const contentsInsight = useMemo(() => contentsPageInsight(boardCompanies), [boardCompanies]);
  const pageInsight = useMemo(() => contentsPageInsight(pageSlice), [pageSlice]);
  const newestSectors = useMemo(() => newestSectorMix(boardCompanies, undefined, 5), [boardCompanies]);

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

  const kicker = feed === "leaderboard" ? "Scout dispatch · signals" : "Scout dispatch · ledger";
  const caption =
    feed === "leaderboard"
      ? total === 1
        ? "company on the signal desk"
        : "companies on the signal desk"
      : total === 1
        ? "company on the ledger"
        : "companies on the ledger";
  const subline =
    feed === "leaderboard" ? "Ranked by recent signal weight" : "Sorted ledger · Scout Dispatch";

  const wireLabel =
    feed === "leaderboard"
      ? "Signal wire"
      : pages > 1
        ? "Ledger wire · continued"
        : "Ledger wire";

  return (
    <div
      className="mx-auto mt-2 grid w-full max-w-[1280px] scroll-mt-16 gap-3 sm:mt-3 lg:grid-cols-[minmax(280px,320px)_minmax(0,1fr)_minmax(220px,280px)]"
      data-browse-spread=""
    >
      {/* Col 1 — persistent ruled index (magazine TOC), not a sheet over content */}
      <aside className="hidden min-w-0 lg:block" data-browse-index="">
        <div className="sticky top-14 space-y-2">
          {/* Ember beat for open Contents — trails 353/01/138 hero pages without twinning them */}
          {/* Contents index is the desk-filters hero — big split + FacetRail first; chrono supports. */}
          <div
            className="relative overflow-hidden border border-[color:var(--ember,#D96B1C)]/40 bg-[color:var(--bg,#FFFFFF)] px-3 py-3 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[color:var(--ember,#D96B1C)]"
            data-index-signal-beat=""
            data-contents-hero=""
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--ember,#D96B1C)]">
              {feed === "leaderboard" ? "Contents · signal desk" : "Contents · ledger index"}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div>
                <p className="font-mono text-[52px] font-bold leading-[0.88] tracking-[-0.07em] text-[color:var(--ember,#D96B1C)]">
                  {signaledMatch.toLocaleString("en-US")}
                </p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--fg-2,#3F465C)]">with signal</p>
              </div>
              <div>
                <p className="font-mono text-[52px] font-bold leading-[0.88] tracking-[-0.07em] text-[color:var(--fg,#0B0E17)]">
                  {quietMatch.toLocaleString("en-US")}
                </p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--fg-2,#3F465C)]">quiet</p>
              </div>
            </div>
            <p className="mt-2 font-mono text-[11px] tabular-nums text-[color:var(--fg-2,#3F465C)]">
              {boardCompanies.length.toLocaleString("en-US")}
              {" matching · facet map below"}
            </p>
            {contentsInsight ? (
              <div className="mt-2.5 border-t border-[color:var(--line,#E1E5EF)] pt-2.5" data-contents-page-insight="">
                <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]">{contentsInsight.kicker}</p>
                <p className="mt-1 flex items-baseline gap-2">
                  <span className="font-mono text-[28px] font-bold leading-none tracking-[-0.04em] text-[color:var(--ember,#D96B1C)]">
                    {contentsInsight.figure.toLocaleString("en-US")}
                  </span>
                  <span className="min-w-0 truncate text-[13px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">{contentsInsight.label}</span>
                </p>
                <p className="mt-1 font-mono text-[10px] tabular-nums text-[color:var(--fg-2,#3F465C)]">{contentsInsight.detail}</p>
              </div>
            ) : null}
            <p className="mt-1.5 font-mono text-[10px] text-[color:var(--fg-3,#5C647A)]">
              {chronographCaption(contentsChrono)}
            </p>
          </div>
          <div className="h-[min(58vh,560px)]" data-contents-facet-map="">
            <FacetRail
              companies={companies}
              campuses={campuses}
              facets={facets}
              onChange={commitFacet}
              index
              indexCount={boardCompanies.length}
              caption={feed === "leaderboard" ? "Signal index" : "Ledger index"}
            />
          </div>
          <ScoutChronograph
            companies={boardCompanies}
            variant="compact"
            kicker={feed === "leaderboard" ? "Signal chronograph · Contents" : "Ledger chronograph · Contents"}
            lead={contentsUnfiltered ? "monthUnknown" : "peak"}
            reading={
              contentsUnfiltered
                ? `Supporting · ${boardCompanies.length.toLocaleString("en-US")} matching`
                : `Filtered · ${boardCompanies.length.toLocaleString("en-US")} matching · ${quietMatch.toLocaleString("en-US")} quiet`
            }
          />
        </div>
      </aside>

      {/* Col 2 — ember figure hero + ledger */}
      <div className="min-w-0" data-browse-ledger="">
        {/* Distinct hero per surface — fold language, not the fold stamp */}
        <div
          className={`mb-3 border-b border-[color:var(--line,#E1E5EF)] pb-3 lg:mb-2 lg:pb-2 ${
            feed === "directory" ? "" : ""
          }`}
          data-browse-hero={feed}
          data-continued-chapter={pages > 1 ? "1" : undefined}
          data-ledger-chapter={feed === "directory" ? "1" : undefined}
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              {feed === "leaderboard" && topCampus ? (
                <>
                  {/* Quiet mast all sizes — ranked ledger numerals (mobile + desk) are the lead. */}
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--cobalt,#2F4FD8)]">
                    Signal desk · ranked ledger
                  </p>
                  <p className="mt-2 text-[17px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)] sm:text-[18px] lg:text-[22px]">
                    Ranked by recent signal weight
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[color:var(--fg-2,#3F465C)]">
                    <span className="font-bold text-[color:var(--ember,#D96B1C)]">{topCampus.founders.toLocaleString("en-US")}</span>
                    {" founder names · #1 "}
                    {shortCampusLabel(topCampus.id, topCampus.name)}
                    {" · "}
                    <span className="font-bold text-[color:var(--ember,#D96B1C)]">{total.toLocaleString("en-US")}</span>
                    {" companies"}
                  </p>
                </>
              ) : topSector ? (
                <>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--cobalt,#2F4FD8)]">
                    {pages > 1 ? "Scout ledger · signal desk" : "Scout ledger · top sector"}
                  </p>
                  <p
                    className={`mt-1.5 font-mono font-bold text-[color:var(--fg,#0B0E17)] sm:mt-1 sm:leading-none sm:tracking-[-0.05em] ${
                      pages > 1
                        ? "text-[56px] leading-[0.9] tracking-[-0.06em] sm:text-[56px] lg:text-[64px]"
                        : "text-[64px] leading-[0.88] tracking-[-0.06em] sm:text-[56px] lg:text-[44px]"
                    }`}
                  >
                    <span className="text-[color:var(--ember,#D96B1C)]">
                      {pages > 1
                        ? signaledMatch.toLocaleString("en-US")
                        : topSector.count.toLocaleString("en-US")}
                    </span>
                  </p>
                  <p className="mt-1 text-[15px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">
                    {pages > 1 ? (
                      <>
                        with a stored signal
                        {topSector.label ? (
                          <>
                            {" · "}
                            {topSector.label}
                            {" leads"}
                          </>
                        ) : null}
                      </>
                    ) : (
                      <>
                        {topSector.label}
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
                      </>
                    )}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[color:var(--fg-2,#3F465C)]" data-ledger-showing-hero="">
                    {pages > 1 ? (
                      <>
                        {"Showing "}
                        <span className="font-bold text-[color:var(--ember,#D96B1C)]">{cards.length.toLocaleString("en-US")}</span>
                        {" of "}
                        <span className="font-bold text-[color:var(--ember,#D96B1C)]">{total.toLocaleString("en-US")}</span>
                        {" matching · "}
                        <span className="font-bold text-[color:var(--ember,#D96B1C)]">{quietMatch.toLocaleString("en-US")}</span>
                        {" quiet (no signal)"}
                      </>
                    ) : (
                      <>
                        <span className="font-bold text-[color:var(--ember,#D96B1C)]">{signaledMatch.toLocaleString("en-US")}</span>
                        {" with signal · "}
                        <span className="font-bold text-[color:var(--fg,#0B0E17)]">{quietMatch.toLocaleString("en-US")}</span>
                        {" quiet · "}
                        <span className="font-bold text-[color:var(--ember,#D96B1C)]">{cards.length.toLocaleString("en-US")}</span>
                        {" on page"}
                      </>
                    )}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--cobalt,#2F4FD8)]">{kicker}</p>
                  <p className="mt-1.5 font-mono text-[64px] font-bold leading-[0.88] tracking-[-0.06em] text-[color:var(--fg,#0B0E17)] sm:mt-1 sm:text-[56px] sm:leading-none sm:tracking-[-0.05em] lg:text-[64px]">
                    <span className="text-[color:var(--ember,#D96B1C)]">{total.toLocaleString("en-US")}</span>
                  </p>
                  <p className="mt-1 text-[15px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">{caption}</p>
                  <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[color:var(--fg-2,#3F465C)]">{subline}</p>
                </>
              )}
            </div>
            {/* Desktop: pill sort only — filters live in the persistent index column. */}
            <div className="hidden flex-wrap items-center gap-1.5 lg:flex">
              {feed === "directory"
                ? (
                    [
                      ["name", "Name"],
                      ["recent", "Recent"],
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
        </div>

        {/* Scout Chronograph — unifying system. Browse-more uses folio (originality priority);
            page-1 pairs chronograph + sector strip; leaderboard uses chronograph alone. */}
        <div className="mb-4 space-y-3 lg:hidden" data-mobile-browse-compose="">
          {feed === "directory" && (pages > 1 ? pageInsight : contentsInsight) ? (
            <div
              className="relative overflow-hidden border border-[color:var(--ember,#D96B1C)]/40 bg-[color:var(--bg,#FFFFFF)] px-3 py-2.5 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[color:var(--ember,#D96B1C)]"
              data-mobile-page-insight=""
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--ember,#D96B1C)]">
                {pages > 1
                  ? `Newest on loaded page · ${(pageInsight ?? contentsInsight)!.kicker}`
                  : `${contentsInsight!.kicker} · ledger`}
              </p>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="font-mono text-[40px] font-bold leading-none tracking-[-0.05em] text-[color:var(--ember,#D96B1C)]">
                  {(pages > 1 ? pageInsight : contentsInsight)!.figure.toLocaleString("en-US")}
                </span>
                <span className="text-[15px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">
                  {(pages > 1 ? pageInsight : contentsInsight)!.label}
                </span>
              </p>
              <p className="mt-1 font-mono text-[10px] tabular-nums text-[color:var(--fg-2,#3F465C)]">
                {(pages > 1 ? pageInsight : contentsInsight)!.detail}
              </p>
            </div>
          ) : null}
          <ScoutChronograph
            companies={pageSlice}
            variant="compact"
            kicker={
              feed === "leaderboard"
                ? "Signal chronograph · supporting"
                : pages > 1
                  ? "Ledger chronograph · loaded page"
                  : "Ledger chronograph · on page"
            }
            reading={
              feed === "leaderboard"
                ? `Supporting · ${cards.length.toLocaleString("en-US")} on desk · peak on this band`
                : pages > 1
                  ? `Loaded page slice · Showing ${cards.length.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}`
                  : `Page slice · ${cards.length.toLocaleString("en-US")} on page · not the full dispatch`
            }
          />
          {feed === "directory" ? (
            <div
              className="flex w-full overflow-hidden rounded-none border border-[color:var(--cobalt,#2F4FD8)]/30"
              data-mobile-sort-segment=""
              role="group"
              aria-label="Sort ledger"
            >
              {(
                [
                  ["name", "Name"],
                  ["recent", "Recent"],
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
          {feed === "directory" && pages <= 1 ? (
            <div className="space-y-3" data-mobile-sector-folio="">
              <div>
                <div className="mb-1.5 flex items-baseline justify-between gap-2 px-0.5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--cobalt,#2F4FD8)]">Sector strip</p>
                  <p className="font-mono text-[10px] tabular-nums text-[color:var(--fg-3,#5C647A)]">Top 3</p>
                </div>
                <ol className="relative overflow-hidden divide-y divide-[color:var(--line,#E1E5EF)] border border-[color:var(--cobalt,#2F4FD8)]/25 bg-[color:var(--bg,#FFFFFF)] before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-[color:var(--cobalt,#2F4FD8)]">
                  {sectorMix(boardCompanies).slice(0, 3).map((sec, i) => (
                    <li key={sec.id}>
                      <Link
                        href={browseHref({ feed, sector: sec.id, kind, campus, q: query, sort })}
                        className="flex items-center gap-3 px-3 py-2 hover:bg-[color:var(--cobalt-haze,#E8ECFA)]/40"
                      >
                        <span className="w-6 shrink-0 text-right font-mono text-[11px] font-bold tabular-nums text-[color:var(--cobalt,#2F4FD8)]">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">{sec.label}</span>
                        <span className="shrink-0 font-mono text-[16px] font-bold leading-none tracking-[-0.03em] text-[color:var(--ember,#D96B1C)]">
                          {sec.count.toLocaleString("en-US")}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </div>
              {newestSectors.length ? (
                <div data-mobile-newest-folio="">
                  <div className="mb-1.5 flex items-baseline justify-between gap-2 px-0.5">
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--ember,#D96B1C)]">Newest sectors</p>
                    <p className="font-mono text-[10px] tabular-nums text-[color:var(--fg-3,#5C647A)]">Since Sep</p>
                  </div>
                  <ol className="relative overflow-hidden divide-y divide-[color:var(--line,#E1E5EF)] border border-[color:var(--ember,#D96B1C)]/35 bg-[color:var(--bg,#FFFFFF)] before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-[color:var(--ember,#D96B1C)]">
                    {newestSectors.slice(0, 3).map((sec, i) => (
                      <li key={sec.id}>
                        <Link
                          href={browseHref({ feed, sector: sec.id, kind, campus, q: query, sort })}
                          className="flex items-center gap-3 px-3 py-2 hover:bg-[color:var(--ember,#D96B1C)]/5"
                        >
                          <span className="w-6 shrink-0 text-right font-mono text-[11px] font-bold tabular-nums text-[color:var(--ember,#D96B1C)]">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">{sec.label}</span>
                          <span className="shrink-0 font-mono text-[16px] font-bold leading-none tracking-[-0.03em] text-[color:var(--ember,#D96B1C)]">
                            {sec.count.toLocaleString("en-US")}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </div>
          ) : feed === "leaderboard" ? (
            <MobileWireStrip companies={boardCompanies} label="Signal wire" surface="fold" />
          ) : null}
        </div>

        {/* Desk mid-pack: distinct dominant beats — chronograph supports (mobile keep hero compose). */}
        {feed === "directory" && pages <= 1 ? (
          <div className="mb-4 hidden space-y-3 lg:block" data-desk-browse-dominant="sector-folio">
            <div
              className="relative overflow-hidden border border-[color:var(--ember,#D96B1C)]/40 bg-[color:var(--bg,#FFFFFF)] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[color:var(--ember,#D96B1C)]"
              data-sector-folio-desk=""
            >
              <div className="flex items-baseline justify-between gap-2 border-b border-[color:var(--line,#E1E5EF)] px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--ember,#D96B1C)]">Sector folio · matching</p>
                  {contentsInsight ? (
                    <p className="mt-0.5 font-mono text-[10px] tabular-nums text-[color:var(--fg-2,#3F465C)]">
                      <span className="font-bold text-[color:var(--ember,#D96B1C)]">{contentsInsight.figure.toLocaleString("en-US")}</span>
                      {" newest · "}
                      {contentsInsight.label}
                    </p>
                  ) : null}
                </div>
                <p className="font-mono text-[10px] tabular-nums text-[color:var(--fg-3,#5C647A)]">
                  {boardCompanies.length.toLocaleString("en-US")}
                  {" on Contents"}
                </p>
              </div>
              <ol className="divide-y divide-[color:var(--line,#E1E5EF)]">
                {sectorMix(boardCompanies).slice(0, 5).map((sec, i) => (
                  <li key={sec.id}>
                    <Link
                      href={browseHref({ feed, sector: sec.id, kind, campus, q: query, sort })}
                      className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-[color:var(--ember,#D96B1C)]/5"
                    >
                      <span className="w-10 shrink-0 text-right font-mono text-[22px] font-bold tabular-nums leading-none tracking-[-0.04em] text-[color:var(--ember,#D96B1C)]">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">{sec.label}</span>
                      <span className="shrink-0 font-mono text-[28px] font-bold leading-none tracking-[-0.04em] text-[color:var(--ember,#D96B1C)]">
                        {sec.count.toLocaleString("en-US")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
            <ScoutChronograph
              companies={pageSlice}
              variant="compact"
              kicker="Ledger chronograph · on page"
              reading={`Supporting · ${cards.length.toLocaleString("en-US")} on page · not the full dispatch`}
            />
          </div>
        ) : feed === "leaderboard" ? (
          <div className="mb-3 hidden lg:block" data-desk-browse-dominant="rank-rail" data-desk-browse-chronograph="">
            <ScoutChronograph
              companies={pageSlice}
              variant="compact"
              kicker="Signal chronograph · rank band"
              reading={`Supporting · ${cards.length.toLocaleString("en-US")} on desk · peak on this band`}
            />
          </div>
        ) : (
          <div className="mb-4 hidden space-y-3 lg:block" data-desk-browse-dominant="newest-folio" data-desk-browse-chronograph="">
            {newestSectors.length ? (
              <div
                className="relative overflow-hidden border border-[color:var(--ember,#D96B1C)]/40 bg-[color:var(--bg,#FFFFFF)] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[color:var(--ember,#D96B1C)]"
                data-newest-folio-desk=""
              >
                <div className="flex items-baseline justify-between gap-2 border-b border-[color:var(--line,#E1E5EF)] px-3.5 py-2.5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--ember,#D96B1C)]">Newest sectors · matching</p>
                  <p className="font-mono text-[10px] tabular-nums text-[color:var(--fg-3,#5C647A)]">
                    {boardCompanies.length.toLocaleString("en-US")}
                    {" on Contents"}
                  </p>
                </div>
                <ol className="divide-y divide-[color:var(--line,#E1E5EF)]">
                  {newestSectors.map((sec, i) => (
                    <li key={sec.id}>
                      <Link
                        href={browseHref({ feed, sector: sec.id, kind, campus, q: query, sort })}
                        className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-[color:var(--ember,#D96B1C)]/5"
                      >
                        <span className="w-10 shrink-0 text-right font-mono text-[22px] font-bold tabular-nums leading-none tracking-[-0.04em] text-[color:var(--ember,#D96B1C)]">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">{sec.label}</span>
                        <span className="shrink-0 font-mono text-[28px] font-bold leading-none tracking-[-0.04em] text-[color:var(--ember,#D96B1C)]">
                          {sec.count.toLocaleString("en-US")}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
            <ScoutChronograph
              companies={pageSlice}
              variant="compact"
              kicker="Ledger chronograph · loaded page"
              reading={`Supporting · Showing ${cards.length.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}`}
            />
          </div>
        )}

        {/* One strong ledger stage — map-stage language: cobalt frame, ruled rows.
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
                <div className="flex items-end justify-between gap-3 px-3 py-2 sm:px-3.5">
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]">
                      {feed === "leaderboard" ? "Signal desk continued" : "Ledger continued"}
                    </p>
                    <p className="mt-0.5 hidden font-mono text-[10px] text-[color:var(--fg-3,#5C647A)] sm:block">Section rules every 14 rows · end mark below</p>
                    <p className="mt-0.5 font-mono text-[10px] text-[color:var(--fg-3,#5C647A)] sm:hidden">
                      <span className="font-bold text-[color:var(--ember,#D96B1C)]">{signaledMatch.toLocaleString("en-US")}</span>
                      {" with signal · end mark below"}
                    </p>
                  </div>
                  <p className="shrink-0 text-right font-mono text-[11px] tabular-nums text-[color:var(--fg-2,#3F465C)]" data-continued-insight="">
                    <span className="block text-[18px] font-bold leading-none tracking-tight text-[color:var(--ember,#D96B1C)] sm:text-[20px]">
                      {signaledMatch.toLocaleString("en-US")}
                    </span>
                    <span className="mt-0.5 block text-[9px] uppercase tracking-[0.1em]">with signal</span>
                  </p>
                </div>
              </div>
            ) : null}
            <ol
              data-ledger-stage={feed}
              data-ledger-top={pages > 1 ? undefined : ""}
              className={`relative overflow-hidden border border-[color:var(--cobalt,#2F4FD8)]/25 bg-[color:var(--bg,#FFFFFF)] before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-[color:var(--cobalt,#2F4FD8)] divide-y divide-[color:var(--line,#E1E5EF)] ${pages > 1 ? "border-t-0" : ""}`}
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
                          Rows {String(sectionFrom).padStart(2, "0")}–{String(sectionTo).padStart(2, "0")}
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
            {pages > 1 && sliceInsight ? (
              <div
                className="mt-0 border border-t-0 border-[color:var(--cobalt,#2F4FD8)]/25 bg-[color:var(--bg,#FFFFFF)]"
                data-ledger-end=""
                data-ledger-end-mobile=""
                data-end-insight={sliceInsight.kicker}
              >
                <div
                  className="relative overflow-hidden border-b border-[color:var(--line,#E1E5EF)] px-3 py-3.5 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[color:var(--ember,#D96B1C)] sm:px-3.5 sm:py-4"
                  data-end-lead=""
                >
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--ember,#D96B1C)]">
                    {sliceInsight.kicker}
                  </p>
                  <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-[52px] font-bold leading-[0.88] tracking-[-0.07em] text-[color:var(--ember,#D96B1C)] sm:text-[56px] lg:text-[64px]">
                        {sliceInsight.figure.toLocaleString("en-US")}
                      </p>
                      <p className="mt-1.5 max-w-[22rem] text-[14px] font-semibold leading-snug tracking-tight text-[color:var(--fg,#0B0E17)] sm:text-[15px]">
                        {sliceInsight.figureUnit}
                      </p>
                    </div>
                    <div className="min-w-0 flex-1 sm:max-w-[16rem] sm:text-right">
                      <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--cobalt,#2F4FD8)]">Named on slice</p>
                      <Link
                        href={`/startup/${sliceInsight.companyId}?sample=1`}
                        className="mt-1 block truncate text-[15px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)] underline-offset-2 hover:text-[color:var(--ember,#D96B1C)] hover:underline"
                      >
                        {sliceInsight.companyName}
                      </Link>
                      <p className="mt-0.5 truncate font-mono text-[10px] tabular-nums text-[color:var(--fg-3,#5C647A)]">
                        {sliceInsight.companyMeta}
                      </p>
                    </div>
                  </div>
                  <p className="mt-2.5 font-mono text-[10px] tabular-nums text-[color:var(--fg-3,#5C647A)]" data-ledger-showing="">
                    {"Showing "}
                    <span className="font-bold text-[color:var(--ember,#D96B1C)]">{cards.length.toLocaleString("en-US")}</span>
                    {" of "}
                    <span className="font-bold text-[color:var(--fg,#0B0E17)]">{total.toLocaleString("en-US")}</span>
                    {" · "}
                    <span className="font-bold text-[color:var(--ember,#D96B1C)]">{signaledMatch.toLocaleString("en-US")}</span>
                    {" with signal · "}
                    <span className="font-bold text-[color:var(--fg,#0B0E17)]">{quietMatch.toLocaleString("en-US")}</span>
                    {" quiet"}
                  </p>
                </div>
                <div className="px-3 py-2.5 sm:px-3.5" data-ledger-end-chrono="">
                  <ScoutChronograph
                    companies={pageSlice}
                    variant="compact"
                    kicker="Ledger chronograph · end slice"
                    reading={`Supporting · peak on this loaded slice · not pagination`}
                  />
                </div>
              </div>
            ) : null}
          </div>
        )}

        {cards.length < total ? (
          <div className={`mt-3 flex flex-wrap items-center gap-2 ${pages > 1 ? "justify-between border-t border-dashed border-[color:var(--line-strong,#C5CAD8)] pt-3" : ""}`}>
            <Link
              href={moreHref}
              className="inline-flex h-8 items-center rounded-sm border border-[color:var(--ember,#D96B1C)] bg-[color:var(--ember,#D96B1C)] px-3 font-mono text-[11px] font-semibold text-white hover:opacity-90"
            >
              {pages > 1 ? "Load next page" : "Show more"}
            </Link>
            <p className="font-mono text-[10px] tabular-nums text-[color:var(--fg-3,#5C647A)]" data-ledger-showing-next="">
              {"Showing "}
              {cards.length.toLocaleString("en-US")}
              {" of "}
              {total.toLocaleString("en-US")}
            </p>
          </div>
        ) : pages > 1 ? (
          <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--fg-3,#5C647A)]">
            Full ledger on desk
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

      {/* Col 3 — WIRE digest (desk), aligned to fold grid */}
      <aside className="hidden min-w-0 lg:block" data-browse-wire="">
        <div className="sticky top-14">
          <div className={`${PANEL} relative overflow-hidden p-3 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-[color:var(--ember,#D96B1C)]`}>
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
              surface={pages > 1 && feed === "directory" ? "signals" : wireSurface}
              hideSector={pages > 1 && feed === "directory"}
            />
          </div>
        </div>
      </aside>

      <MobileFilterDock
        onOpen={() => setMobileFiltersOpen(true)}
        count={boardCompanies.length}
        caption={feed === "leaderboard" ? "Narrow the signal desk" : "Narrow the ledger"}
        tone="ember"
        kicker={feed === "leaderboard" ? "Signal filters" : "Ledger filters"}
        observe="#browse"
      />

      {mobileFiltersOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Scout filters">
          <button type="button" className="absolute inset-0 bg-slate-900/35" aria-label="Close filters" onClick={() => setMobileFiltersOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[min(82dvh,620px)] flex-col overflow-hidden rounded-t-md border border-[color:var(--cobalt,#2F4FD8)]/25 border-b-0 bg-[color:var(--bg,#FFFFFF)] shadow-[0_-8px_28px_rgba(15,23,42,0.12)] before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-[color:var(--cobalt,#2F4FD8)]">
            <div className="relative border-b border-[color:var(--line,#E1E5EF)] px-3 py-3 before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:bg-[color:var(--ember,#D96B1C)]" data-mobile-contents-hero="">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--ember,#D96B1C)]">
                    {feed === "leaderboard" ? "Contents · signal desk" : "Contents · ledger index"}
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-3" data-filter-split="">
                    <div>
                      <p className="font-mono text-[44px] font-bold leading-[0.88] tracking-[-0.07em] text-[color:var(--ember,#D96B1C)]">
                        {signaledMatch.toLocaleString("en-US")}
                      </p>
                      <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--fg-2,#3F465C)]">with signal</p>
                    </div>
                    <div>
                      <p className="font-mono text-[44px] font-bold leading-[0.88] tracking-[-0.07em] text-[color:var(--fg,#0B0E17)]">
                        {quietMatch.toLocaleString("en-US")}
                      </p>
                      <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--fg-2,#3F465C)]">quiet</p>
                    </div>
                  </div>
                  <p className="mt-2 font-mono text-[11px] tabular-nums text-[color:var(--fg-2,#3F465C)]">
                    {boardCompanies.length.toLocaleString("en-US")}
                    {" matching · facet map below"}
                  </p>
                  {contentsInsight ? (
                    <p className="mt-1.5 font-mono text-[11px] tabular-nums text-[color:var(--fg-2,#3F465C)]" data-contents-page-insight="">
                      <span className="font-bold text-[color:var(--ember,#D96B1C)]">{contentsInsight.figure.toLocaleString("en-US")}</span>
                      {" newest · "}
                      {contentsInsight.label}
                      {" · "}
                      {contentsInsight.kicker}
                    </p>
                  ) : null}
                  <p className="mt-0.5 font-mono text-[10px] text-[color:var(--fg-3,#5C647A)]">
                    {chronographCaption(contentsChrono)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileFiltersOpen(false)}
                  className="inline-flex h-9 shrink-0 items-center rounded-sm border border-[color:var(--ember,#D96B1C)] bg-[color:var(--ember,#D96B1C)] px-3.5 font-mono text-[11px] font-semibold text-white"
                >
                  Done
                </button>
              </div>
              <p className="mt-2.5 flex flex-wrap gap-x-2 gap-y-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--fg-3,#5C647A)]">
                <span className="text-[color:var(--cobalt,#2F4FD8)]">Status</span>
                <span aria-hidden>·</span>
                <span>Year</span>
                <span aria-hidden>·</span>
                <span>Sector</span>
                <span aria-hidden>·</span>
                <span>Campus</span>
                <span aria-hidden>·</span>
                <span>facet map</span>
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-mobile-facet-map="">
              <div className="h-[min(58dvh,480px)]">
                <FacetRail companies={companies} campuses={campuses} facets={facets} onChange={commitFacet} dense />
              </div>
              <div className="border-t border-[color:var(--line,#E1E5EF)] px-3 py-2.5">
                <ScoutChronograph
                  companies={boardCompanies}
                  variant="compact"
                  kicker={feed === "leaderboard" ? "Signal chronograph · filters" : "Ledger chronograph · filters"}
                  lead={contentsUnfiltered ? "monthUnknown" : "peak"}
                  reading={
                    contentsUnfiltered
                      ? `Supporting · ${boardCompanies.length.toLocaleString("en-US")} matching`
                      : `Filtered · ${boardCompanies.length.toLocaleString("en-US")} matching · ${quietMatch.toLocaleString("en-US")} quiet`
                  }
                />
              </div>
            </div>
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
  return (
    <Link
      href={`/startup/${card.id}`}
      className={`group flex items-start gap-3 px-3.5 transition-[background-color,color] hover:bg-[color:var(--cobalt-haze,#E8ECFA)]/40 sm:gap-3 sm:px-3.5 ${
        ranked ? "py-4 sm:py-3.5 lg:gap-4 lg:py-5" : "py-3.5 sm:py-3"
      }`}
    >
      {rank != null ? (
        <span
          className={`shrink-0 text-right font-mono font-bold tabular-nums tracking-[-0.05em] text-[color:var(--ember,#D96B1C)] ${
            ranked
              ? "mt-0 w-12 text-[40px] leading-none sm:w-14 sm:text-[40px] lg:w-16 lg:text-[44px]"
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
              ? "line-clamp-2 break-words text-[13px] font-semibold leading-snug tracking-tight text-[color:var(--fg,#0B0E17)] underline-offset-2 group-hover:text-[color:var(--ember,#D96B1C)] group-hover:underline group-hover:decoration-[color:var(--ember,#D96B1C)]/70 sm:line-clamp-none sm:text-[15px] sm:leading-5 sm:[overflow-wrap:anywhere]"
              : "truncate text-[15px] font-semibold leading-5 tracking-tight text-[color:var(--fg,#0B0E17)] underline-offset-2 group-hover:text-[color:var(--ember,#D96B1C)] group-hover:underline group-hover:decoration-[color:var(--ember,#D96B1C)]/70 sm:text-[15px]"
          }
        >
          {card.name}
        </p>
        {subtitle ? (
          <p className={`mt-0.5 font-mono text-[11px] leading-4 text-[color:var(--fg-2,#3F465C)] ${ranked ? "line-clamp-2" : "truncate"}`}>
            {subtitle}
          </p>
        ) : null}
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
                {" founders"}
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
