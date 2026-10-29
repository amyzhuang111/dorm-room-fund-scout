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
  PANEL,
  COUNT,
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
      ? "border-[color:var(--ember,#E8823A)] bg-[color:var(--ember,#E8823A)] text-[#0B0E17]"
      : "border-[color:var(--cobalt-haze,#1A2556)] bg-[color:var(--bg-sunken,#080A11)] font-mono text-[color:var(--fg,#ECEEF4)] hover:border-[color:var(--cobalt,#2F4FD8)]";

  return (
    <div className="mx-auto mt-2 grid w-full max-w-[1280px] gap-2.5 lg:grid-cols-[minmax(0,1fr)_240px] sm:mt-3 sm:gap-3">
      <div className="min-w-0">
        <div className={`${PANEL} relative mb-2 flex flex-wrap items-end justify-between gap-2 overflow-hidden p-2.5 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-[color:var(--ember,#E8823A)]`}>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--cobalt,#2F4FD8)]">{feed === "leaderboard" ? "Signal ledger" : "Company ledger"}</p>
            <p className="mt-0.5 text-[13px] text-[color:var(--fg-2,#A3AAC0)]">
              <span className={COUNT}>{total.toLocaleString("en-US")}</span>{" "}
              {total === 1 ? "company" : "companies"}
              {campusName ? (
                <>
                  {" · "}
                  {campusName}
                  {" · "}
                  <Link href={clearCampusHref} className="text-[color:var(--ember,#E8823A)] hover:underline">
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
          <details className={`${PANEL} px-2.5 py-2`}>
            <summary className="cursor-pointer font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--fg,#ECEEF4)]">Scout filters</summary>
            <div className="mt-2 h-[min(50vh,420px)]">
              <FacetRail companies={companies} campuses={campuses} facets={facets} onChange={commitFacet} />
            </div>
          </details>
        </div>
        {cards.length === 0 ? (
          <p className="text-[13px] text-[color:var(--fg-2,#A3AAC0)]">
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
          <Link href={moreHref} className="mt-3 inline-flex h-8 items-center rounded-md border border-[color:var(--ember,#E8823A)]/50 bg-[color:var(--ember,#E8823A)]/10 px-3 font-mono text-[12px] font-medium text-[color:var(--ember,#E8823A)] hover:border-[color:var(--ember,#E8823A)]">
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
      <aside className="hidden min-w-0 lg:block">
        <div className="sticky top-14 space-y-2">
          <IntelligenceBoards companies={boardCompanies} compact />
        </div>
      </aside>
      <div className="lg:hidden">
        <IntelligenceBoards companies={boardCompanies} compact />
      </div>
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
    <Link href={`/startup/${card.id}`} className="group flex items-center gap-2.5 rounded-md border border-[color:var(--line,#1F2536)] border-l-2 border-l-[color:var(--cobalt,#2F4FD8)] bg-[color:var(--bg-raised,#121726)] px-2.5 py-2.5 transition-colors hover:border-[color:var(--cobalt,#2F4FD8)]/60 hover:border-l-[color:var(--ember,#E8823A)] hover:bg-[color:var(--bg-sunken,#080A11)]">
      {rank != null ? <span className="w-5 shrink-0 text-center font-mono text-[12px] font-bold tabular-nums text-[color:var(--ember,#E8823A)]">{rank}</span> : null}
      <LogoMark name={card.name} logoUrl={card.logoUrl} size={28} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium tracking-tight text-[color:var(--fg,#ECEEF4)] group-hover:text-white">{card.name}</p>
        {subtitle ? <p className="truncate font-mono text-[10px] text-[color:var(--fg-3,#6B7390)]">{subtitle}</p> : null}
      </div>
      {meta ? (
        <div className="max-w-[4.75rem] shrink-0 text-right">
          <p className="truncate font-mono text-[11px] font-semibold leading-none text-[color:var(--ember,#E8823A)]">{meta.primary}</p>
          {meta.secondary ? <p className="mt-0.5 truncate whitespace-nowrap font-mono text-[9px] text-[color:var(--fg-3,#6B7390)]">{meta.secondary}</p> : null}
        </div>
      ) : null}
    </Link>
  );
}
