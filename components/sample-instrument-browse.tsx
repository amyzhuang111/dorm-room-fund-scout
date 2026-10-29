"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { DirectoryCard, DirectoryFilter, DirectorySort } from "@/lib/domain/directory";
import { directoryCardSubtitle } from "@/lib/domain/sample-facets";
import type { FacetCompany } from "@/lib/domain/sample-facets";
import {
  applyFacets,
  emptyFacets,
  FacetRail,
  IntelligenceBoards,
  LogoMark,
  MobileBrowsePulse,
  PANEL,
  type FacetState,
} from "./sample-instrument";
import { FLAG_LABEL } from "@/lib/domain/sample-facets";

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

  const chip = (active: boolean) =>
    active
      ? "border-[color:var(--ember,#D96B1C)] bg-[color:var(--ember,#D96B1C)] font-mono text-white"
      : "border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg-sunken,#F3F5F9)] font-mono text-[color:var(--fg,#0B0E17)] hover:border-[color:var(--cobalt,#2F4FD8)]";

  return (
    <div className="mx-auto mt-2 grid w-full max-w-[1280px] gap-2.5 lg:grid-cols-[minmax(260px,300px)_minmax(0,1fr)] sm:mt-3 sm:gap-3">
      <aside className="hidden min-w-0 lg:block">
        <div className={`${PANEL} relative sticky top-14 space-y-2.5 overflow-hidden p-3 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-[color:var(--cobalt,#2F4FD8)]`}>
          <div className="flex items-baseline justify-between gap-2 border-b border-[color:var(--line,#E1E5EF)] pb-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--cobalt,#2F4FD8)]">Wire</p>
            <p className="font-mono text-[10px] tabular-nums text-[color:var(--fg-3,#5C647A)]">{boardCompanies.length.toLocaleString("en-US")}</p>
          </div>
          <IntelligenceBoards companies={boardCompanies} compact />
        </div>
      </aside>
      <div className="min-w-0">
        <div className="mb-3 border-b border-[color:var(--line,#E1E5EF)] pb-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--cobalt,#2F4FD8)]">{feed === "leaderboard" ? "Scout dispatch · signals" : "Scout dispatch · ledger"}</p>
            <p className="mt-1 font-mono text-[40px] font-bold leading-none tracking-[-0.04em] text-[color:var(--fg,#0B0E17)] sm:text-[48px]">
              <span className="text-[color:var(--ember,#D96B1C)]">{total.toLocaleString("en-US")}</span>
            </p>
            <p className="mt-1 text-[15px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">
              {feed === "leaderboard" ? (total === 1 ? "company on the signal desk" : "companies on the signal desk") : (total === 1 ? "company on the ledger" : "companies on the ledger")}
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
            <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[color:var(--fg-2,#3F465C)]">
              {feed === "leaderboard" ? "Ranked by recent signal weight" : "Sorted ledger · Scout Dispatch"}
              {" · "}
              <span className="font-bold text-[color:var(--ember,#D96B1C)]">{cards.length.toLocaleString("en-US")}</span>
              {" on page"}
            </p>
          </div>
          {feed === "directory" ? (
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ["name", "Name"],
                  ["recent", "Recent"],
                  ["stage", "Stage"],
                ] as const
              ).map(([id, label]) => (
                <Link
                  key={id}
                  href={browseHref({ feed, sector, kind, campus, q: query, sort: id })}
                  className={`inline-flex h-7 items-center rounded-sm border px-2.5 font-mono text-[11px] ${chip(sort === id)}`}
                >
                  {label}
                </Link>
              ))}
            </div>
          ) : null}
          </div>
        </div>
        <div className="mb-2 space-y-2">
          <div className="flex flex-wrap gap-1">
            {([2026, 2025, 2024] as const).map((year) => {
              const active = facets.foundedYear === year;
              return (
                <button
                  key={year}
                  type="button"
                  onClick={() => commitFacet({ ...facets, foundedYear: active ? null : year })}
                  className={`inline-flex h-7 items-center rounded-sm border px-2.5 font-mono text-[11px] ${chip(active)}`}
                >
                  {year}
                </button>
              );
            })}
            {(
              [
                ["flag", "new", FLAG_LABEL.new],
                ["flag", "signaled", FLAG_LABEL.signaled],
                ["flag", "funded", FLAG_LABEL.funded],
                ["flag", "founders", FLAG_LABEL.founders],
                ["status", "active", "Active"],
                ["status", "acquired", "Acquired"],
              ] as const
            ).map(([kind, id, label]) => {
              const active = kind === "flag" ? facets.flag === id : facets.status === id;
              return (
                <button
                  key={`${kind}:${id}`}
                  type="button"
                  onClick={() =>
                    commitFacet({
                      ...facets,
                      flag: kind === "flag" ? (facets.flag === id ? null : (id as FacetState["flag"])) : facets.flag,
                      status: kind === "status" ? (facets.status === id ? null : (id as FacetState["status"])) : facets.status,
                    })
                  }
                  className={`inline-flex h-7 items-center rounded-sm border px-2.5 font-mono text-[11px] ${chip(Boolean(active))}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setMobileFiltersOpen(true)}
            className={`${PANEL} flex w-full items-center justify-between px-2.5 py-2 text-left font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--fg,#0B0E17)] lg:hidden`}
          >
            <span>Scout filters</span>
            <span className="text-[color:var(--ember,#D96B1C)]">Open</span>
          </button>
          <details className={`${PANEL} hidden px-2.5 py-2 lg:block`}>
            <summary className="cursor-pointer font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--fg,#0B0E17)]">Scout filters</summary>
            <div className="mt-2 h-[min(50vh,420px)]">
              <FacetRail companies={companies} campuses={campuses} facets={facets} onChange={commitFacet} />
            </div>
          </details>
        </div>
        {cards.length === 0 ? (
          <p className="text-[13px] text-[color:var(--fg-2,#3F465C)]">
            {query
              ? `No companies match "${query}".`
              : campusName && campusTotal === 0
                ? `No companies are stored for ${campusName}.`
                : "No companies in this category."}
          </p>
        ) : (
          <ol
            className={
              feed === "leaderboard"
                ? "divide-y divide-[color:var(--line,#E1E5EF)] border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)]"
                : "grid grid-cols-1 gap-2 sm:grid-cols-2"
            }
          >
            {cards.map((card, index) => (
              <li key={card.id}>
                <DirectoryPill
                  card={card}
                  rank={feed === "leaderboard" ? (pages - 1) * 14 + index + 1 : null}
                  ranked={feed === "leaderboard"}
                />
              </li>
            ))}
          </ol>
        )}
        {cards.length < total ? (
          <Link href={moreHref} className="mt-3 inline-flex h-9 items-center rounded-sm border border-[color:var(--ember,#D96B1C)] bg-[color:var(--ember,#D96B1C)] px-4 font-mono text-[12px] font-semibold text-white hover:opacity-90">
            Show more
          </Link>
        ) : null}
        <div className="mt-3 lg:hidden">
          <MobileBrowsePulse companies={boardCompanies} />
        </div>
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
      {mobileFiltersOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Scout filters">
          <button type="button" className="absolute inset-0 bg-slate-900/35" aria-label="Close filters" onClick={() => setMobileFiltersOpen(false)} />
          <div className={`${PANEL} absolute inset-x-0 bottom-0 flex max-h-[min(78dvh,560px)] flex-col overflow-hidden rounded-t-lg border-t border-[color:var(--cobalt,#2F4FD8)]/25 bg-[color:var(--bg-raised,#FFFFFF)] shadow-[0_-6px_20px_rgba(15,23,42,0.10)]`}>
            <div className="flex items-center justify-between gap-2 border-b border-[color:var(--line,#E1E5EF)] px-2.5 py-1.5">
              <div className="min-w-0">
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--fg,#0B0E17)]">Scout filters</p>
                <p className="font-mono text-[9px] tabular-nums text-[color:var(--fg-3,#5C647A)]">Status · Year · Sector · Campus</p>
              </div>
              <button type="button" onClick={() => setMobileFiltersOpen(false)} className="inline-flex h-7 items-center rounded-sm border border-[color:var(--ember,#D96B1C)] bg-[color:var(--ember,#D96B1C)] px-2.5 font-mono text-[11px] font-semibold text-white">Done</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
              <div className="h-[min(68dvh,500px)]">
                <FacetRail companies={companies} campuses={campuses} facets={facets} onChange={commitFacet} />
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
  // Prefer kind + date over a uniform "1 signal" count that reads as a placeholder.
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

function DirectoryPill({ card, rank, ranked = false }: { card: DirectoryCard; rank: number | null; ranked?: boolean }) {
  const subtitle = directoryCardSubtitle(card);
  const meta = signalMeta(card);
  const shell = ranked
    ? "group flex items-start gap-3 px-3 py-2.5 transition-[background-color,color] hover:bg-[color:var(--cobalt-haze,#E8ECFA)]/45"
    : "group relative flex items-start gap-3 border border-[color:var(--line,#E1E5EF)] border-l-[3px] border-l-[color:var(--cobalt,#2F4FD8)] bg-[color:var(--bg,#FFFFFF)] px-3 py-2.5 transition-[border-color,background-color,box-shadow] hover:border-[color:var(--cobalt,#2F4FD8)]/55 hover:border-l-[color:var(--ember,#D96B1C)] hover:bg-[color:var(--cobalt-haze,#E8ECFA)]/40 hover:shadow-[inset_0_-1px_0_0_color-mix(in_srgb,var(--cobalt,#2F4FD8)_35%,transparent)]";
  return (
    <Link href={`/startup/${card.id}`} className={shell}>
      {rank != null ? (
        <span className="mt-0.5 w-7 shrink-0 text-right font-mono text-[17px] font-bold tabular-nums leading-none tracking-[-0.04em] text-[color:var(--ember,#D96B1C)]">
          {String(rank).padStart(2, "0")}
        </span>
      ) : null}
      <LogoMark name={card.name} logoUrl={card.logoUrl} size={ranked ? 22 : 24} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold leading-5 tracking-tight text-[color:var(--fg,#0B0E17)] group-hover:text-[color:var(--ember,#D96B1C)] sm:text-[15px]">{card.name}</p>
        {subtitle ? <p className="mt-0.5 truncate font-mono text-[11px] leading-4 text-[color:var(--fg-2,#3F465C)]">{subtitle}</p> : null}
        {meta ? (
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex h-[18px] items-center rounded-sm border border-[color:var(--cobalt,#2F4FD8)]/30 bg-[color:var(--cobalt-haze,#E8ECFA)] px-1.5 font-mono text-[10px] font-semibold text-[color:var(--cobalt,#2F4FD8)]">{meta.primary}</span>
            {meta.secondary ? (
              <span className="inline-flex h-[18px] items-center rounded-sm border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-1.5 font-mono text-[10px] tabular-nums text-[color:var(--fg-2,#3F465C)]">{meta.secondary}</span>
            ) : null}
          </span>
        ) : null}
      </div>
      {ranked && card.signals > 0 ? (
        <span className="mt-0.5 shrink-0 font-mono text-[12px] font-bold tabular-nums text-[color:var(--ember,#D96B1C)]">{card.signals.toLocaleString("en-US")}</span>
      ) : null}
    </Link>
  );
}
