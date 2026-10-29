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
      ? "border-[color:var(--ember,#D96B1C)] bg-[color:var(--ember,#D96B1C)] text-white"
      : "border-[color:var(--cobalt-haze,#E8ECFA)] bg-[color:var(--bg-sunken,#F3F5F9)] font-mono text-[color:var(--fg,#0B0E17)] hover:border-[color:var(--cobalt,#2F4FD8)]";

  return (
    <div className="mx-auto mt-2 grid w-full max-w-[1280px] gap-2.5 lg:grid-cols-[minmax(260px,300px)_minmax(0,1fr)] sm:mt-3 sm:gap-3">
      <aside className="hidden min-w-0 lg:block">
        <div className={`${PANEL} relative sticky top-14 space-y-2 overflow-hidden p-2 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-[color:var(--cobalt,#2F4FD8)]`}>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--cobalt,#2F4FD8)]">Wire</p>
          <IntelligenceBoards companies={boardCompanies} compact />
        </div>
      </aside>
      <div className="min-w-0">
        <div className="mb-3 border-b border-[color:var(--line,#E1E5EF)] pb-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--cobalt,#2F4FD8)]">{feed === "leaderboard" ? "Scout dispatch · signals" : "Scout dispatch · ledger"}</p>
            <p className="mt-1 font-mono text-[36px] font-bold leading-none tracking-[-0.04em] text-[color:var(--fg,#0B0E17)] sm:text-[44px]">
              <span className="text-[color:var(--ember,#D96B1C)]">{total.toLocaleString("en-US")}</span>
            </p>
            <p className="mt-1 text-[14px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">
              {total === 1 ? "company" : "companies"}
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
                  className={`inline-flex h-6 items-center rounded-md border px-2 text-[11px] ${chip(sort === id)}`}
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
                  className={`inline-flex h-6 items-center rounded-md border px-2 text-[11px] ${chip(active)}`}
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
                  className={`inline-flex h-6 items-center rounded-md border px-2 text-[11px] ${chip(Boolean(active))}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="lg:hidden">
            <MobileBrowsePulse companies={boardCompanies} />
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
          <ol className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {cards.map((card, index) => (
              <li key={card.id}>
                <DirectoryPill card={card} rank={feed === "leaderboard" ? (pages - 1) * 14 + index + 1 : null} />
              </li>
            ))}
          </ol>
        )}
        {cards.length < total ? (
          <Link href={moreHref} className="mt-3 inline-flex h-8 items-center rounded-md border border-[color:var(--ember,#D96B1C)]/50 bg-[color:var(--ember,#D96B1C)]/10 px-3 font-mono text-[12px] font-medium text-[color:var(--ember,#D96B1C)] hover:border-[color:var(--ember,#D96B1C)]">
            Show more
          </Link>
        ) : null}
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
          <button type="button" className="absolute inset-0 bg-slate-900/40" aria-label="Close filters" onClick={() => setMobileFiltersOpen(false)} />
          <div className={`${PANEL} absolute inset-x-0 bottom-0 flex max-h-[min(85dvh,640px)] flex-col overflow-hidden rounded-t-xl border-t border-[color:var(--cobalt,#2F4FD8)]/25 bg-[color:var(--bg-raised,#FFFFFF)] shadow-[0_-8px_28px_rgba(15,23,42,0.12)]`}>
            <div className="flex items-center justify-between gap-2 border-b border-[color:var(--line,#E1E5EF)] px-3 py-2">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--fg,#0B0E17)]">Scout filters</p>
              <button type="button" onClick={() => setMobileFiltersOpen(false)} className="font-mono text-[11px] text-[color:var(--ember,#D96B1C)]">Done</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
              <div className="h-[min(70dvh,520px)]">
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

function DirectoryPill({ card, rank }: { card: DirectoryCard; rank: number | null }) {
  const subtitle = directoryCardSubtitle(card);
  const meta = signalMeta(card);
  return (
    <Link href={`/startup/${card.id}`} className="group flex items-center gap-2.5 rounded-md border border-[color:var(--line,#E1E5EF)] border-l-2 border-l-[color:var(--cobalt,#2F4FD8)] bg-[color:var(--bg-raised,#FFFFFF)] px-2.5 py-2.5 transition-colors hover:border-[color:var(--cobalt,#2F4FD8)]/60 hover:border-l-[color:var(--ember,#D96B1C)] hover:bg-[color:var(--bg-sunken,#F3F5F9)]">
      {rank != null ? <span className="w-5 shrink-0 text-center font-mono text-[12px] font-bold tabular-nums text-[color:var(--ember,#D96B1C)]">{rank}</span> : null}
      <LogoMark name={card.name} logoUrl={card.logoUrl} size={28} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium tracking-tight text-[color:var(--fg,#0B0E17)] group-hover:text-[color:var(--ember,#D96B1C)]">{card.name}</p>
        {subtitle ? <p className="truncate font-mono text-[10px] text-[color:var(--fg-3,#5C647A)]">{subtitle}</p> : null}
      </div>
      {meta ? (
        <div className="max-w-[4.75rem] shrink-0 text-right">
          <p className="truncate font-mono text-[11px] font-semibold leading-none text-[color:var(--ember,#D96B1C)]">{meta.primary}</p>
          {meta.secondary ? <p className="mt-0.5 truncate whitespace-nowrap font-mono text-[9px] text-[color:var(--fg-3,#5C647A)]">{meta.secondary}</p> : null}
        </div>
      ) : null}
    </Link>
  );
}
