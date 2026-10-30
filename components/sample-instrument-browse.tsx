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
  sectorMix,
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
      className="mx-auto mt-2 grid w-full max-w-[1280px] scroll-mt-16 gap-3 sm:mt-3 lg:grid-cols-[minmax(240px,280px)_minmax(0,1fr)_minmax(240px,300px)]"
      data-browse-spread=""
    >
      {/* Col 1 — persistent ruled index (magazine TOC), not a sheet over content */}
      <aside className="hidden min-w-0 lg:block" data-browse-index="">
        <div className="sticky top-14 space-y-2">
          {/* Ember beat for open Contents — trails 353/01/138 hero pages without twinning them */}
          <div
            className="relative overflow-hidden border border-[color:var(--cobalt,#2F4FD8)]/25 bg-[color:var(--bg,#FFFFFF)] px-2.5 py-2 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[color:var(--ember,#D96B1C)]"
            data-index-signal-beat=""
          >
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]">
              {feed === "leaderboard" ? "Signal desk" : "Matching · with signal"}
            </p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-[28px] font-bold leading-none tracking-[-0.04em] text-[color:var(--ember,#D96B1C)]">
                {signaledMatch.toLocaleString("en-US")}
              </span>
              <span className="font-mono text-[10px] tabular-nums text-[color:var(--fg-2,#3F465C)]">
                of {boardCompanies.length.toLocaleString("en-US")} matching
              </span>
            </p>
          </div>
          <div className="h-[min(70vh,640px)]">
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
        </div>
      </aside>

      {/* Col 2 — ember figure hero + ledger */}
      <div className="min-w-0" data-browse-ledger="">
        {/* Distinct hero per surface — fold language, not the fold stamp */}
        <div className="mb-2 border-b border-[color:var(--line,#E1E5EF)] pb-2" data-browse-hero={feed}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              {feed === "leaderboard" && topCampus ? (
                <>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--cobalt,#2F4FD8)]">Signal desk · #1 campus</p>
                  <p className="mt-1 font-mono text-[64px] font-bold leading-none tracking-[-0.06em] text-[color:var(--ember,#D96B1C)] sm:text-[64px] lg:text-[72px]">01</p>
                  <p className="mt-1 text-[17px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)] sm:text-[18px]">
                    {shortCampusLabel(topCampus.id, topCampus.name)}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[color:var(--fg-2,#3F465C)]">
                    <span className="font-bold text-[color:var(--ember,#D96B1C)]">{topCampus.founders.toLocaleString("en-US")}</span>
                    {" founder names · ranked signal desk below · "}
                    <span className="font-bold text-[color:var(--ember,#D96B1C)]">{total.toLocaleString("en-US")}</span>
                    {" companies"}
                  </p>
                </>
              ) : topSector ? (
                <>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--cobalt,#2F4FD8)]">
                    {pages > 1 ? "Scout ledger · signal desk" : "Scout ledger · top sector"}
                  </p>
                  <p className="mt-1 font-mono text-[56px] font-bold leading-none tracking-[-0.05em] text-[color:var(--fg,#0B0E17)] sm:text-[56px] lg:text-[64px]">
                    <span className="text-[color:var(--ember,#D96B1C)]">
                      {pages > 1
                        ? signaledMatch.toLocaleString("en-US")
                        : topSector.count.toLocaleString("en-US")}
                    </span>
                  </p>
                  <p className="mt-1 text-[15px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">
                    {pages > 1 ? (
                      <>
                        matching companies with a stored signal
                        {topSector.label ? (
                          <>
                            {" · "}
                            {topSector.label}
                            {" still leads"}
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
                  <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[color:var(--fg-2,#3F465C)]">
                    {pages > 1 ? (
                      <>
                        <span className="font-bold text-[color:var(--ember,#D96B1C)]">{total.toLocaleString("en-US")}</span>
                        {" matching · rows 01–"}
                        {String(cards.length).padStart(2, "0")}
                        {" on desk · "}
                        <span className="font-bold text-[color:var(--ember,#D96B1C)]">{(total - cards.length).toLocaleString("en-US")}</span>
                        {" still on the shelf"}
                      </>
                    ) : (
                      <>
                        {total.toLocaleString("en-US")}
                        {" on the ledger · "}
                        {subline}
                        {" · "}
                        <span className="font-bold text-[color:var(--ember,#D96B1C)]">{cards.length.toLocaleString("en-US")}</span>
                        {" on page"}
                      </>
                    )}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--cobalt,#2F4FD8)]">{kicker}</p>
                  <p className="mt-1 font-mono text-[56px] font-bold leading-none tracking-[-0.05em] text-[color:var(--fg,#0B0E17)] sm:text-[56px] lg:text-[64px]">
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
          {feed === "directory" ? (
            <div
              className="mt-3 flex w-full overflow-hidden rounded-none border border-[color:var(--cobalt,#2F4FD8)]/30 lg:hidden"
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
        </div>

        {/* Mobile-native: horizontal WIRE digest — composition, not a shrunk sidebar */}
        <div className="mb-3 lg:hidden" data-mobile-browse-compose="">
          <MobileWireStrip
            companies={boardCompanies}
            label={pages > 1 && feed === "directory" ? "Recent wire" : "Ledger wire"}
            surface={pages > 1 && feed === "directory" ? "signals" : "browse"}
          />
        </div>

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
            {pages > 1 ? (
              <div
                className="mt-0 border border-t-0 border-[color:var(--cobalt,#2F4FD8)]/25 bg-[color:var(--bg-sunken,#F3F5F9)] px-3 py-4 sm:px-3.5"
                data-ledger-end=""
              >
                <div className="flex items-center gap-2">
                  <span className="h-[2px] flex-1 bg-[color:var(--ember,#D96B1C)]/60" aria-hidden />
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--ember,#D96B1C)]">
                    {cards.length < total ? "End of loaded page" : "End of ledger"}
                  </p>
                  <span className="h-[2px] flex-1 bg-[color:var(--ember,#D96B1C)]/60" aria-hidden />
                </div>
                <p className="mt-2 text-center font-mono text-[13px] tabular-nums text-[color:var(--fg-2,#3F465C)]" data-ledger-showing="">
                  {"Showing "}
                  {cards.length.toLocaleString("en-US")}
                  {" of "}
                  {total.toLocaleString("en-US")}
                </p>
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
            <p className="font-mono text-[10px] tabular-nums text-[color:var(--fg-3,#5C647A)]">
              {(total - cards.length).toLocaleString("en-US")} more on the ledger
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
        caption="Narrow the ledger"
        tone="outline"
        kicker="Ledger filters"
        observe="#browse"
      />

      {mobileFiltersOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Scout filters">
          <button type="button" className="absolute inset-0 bg-slate-900/35" aria-label="Close filters" onClick={() => setMobileFiltersOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[min(82dvh,620px)] flex-col overflow-hidden rounded-t-md border border-[color:var(--cobalt,#2F4FD8)]/25 border-b-0 bg-[color:var(--bg,#FFFFFF)] shadow-[0_-8px_28px_rgba(15,23,42,0.12)] before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-[color:var(--cobalt,#2F4FD8)]">
            <div className="relative border-b border-[color:var(--line,#E1E5EF)] px-3 py-3 before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-[color:var(--ember,#D96B1C)]">
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--cobalt,#2F4FD8)]">Ledger index</p>
                  <p className="mt-1 font-mono text-[44px] font-bold leading-none tracking-[-0.05em] text-[color:var(--ember,#D96B1C)]">
                    {boardCompanies.length.toLocaleString("en-US")}
                  </p>
                  <p className="mt-1.5 text-[15px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">Narrow the ledger</p>
                  <p className="mt-0.5 font-mono text-[10px] tabular-nums text-[color:var(--fg-2,#3F465C)]">
                    <span className="font-bold text-[color:var(--ember,#D96B1C)]">{signaledMatch.toLocaleString("en-US")}</span>
                    {" with a stored signal · Status pinned"}
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
              <p className="mt-2 flex flex-wrap gap-x-2 gap-y-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--fg-3,#5C647A)]">
                <span className="text-[color:var(--cobalt,#2F4FD8)]">Status</span>
                <span aria-hidden>·</span>
                <span>Year</span>
                <span aria-hidden>·</span>
                <span>Sector</span>
                <span aria-hidden>·</span>
                <span>Campus</span>
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <div className="h-[min(70dvh,540px)]">
                <FacetRail companies={companies} campuses={campuses} facets={facets} onChange={commitFacet} dense />
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
      className="group flex items-start gap-3 px-3.5 py-3.5 transition-[background-color,color] hover:bg-[color:var(--cobalt-haze,#E8ECFA)]/40 sm:gap-3 sm:px-3.5 sm:py-3"
    >
      {rank != null ? (
        <span className="mt-0.5 w-6 shrink-0 text-right font-mono text-[16px] font-bold tabular-nums leading-none tracking-[-0.04em] text-[color:var(--ember,#D96B1C)] sm:w-8 sm:text-[20px]">
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
