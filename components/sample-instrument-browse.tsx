"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { DirectoryCard, DirectoryFilter, DirectorySort } from "@/lib/domain/directory";
import { directoryCardSubtitle, signalsUnit } from "@/lib/domain/sample-facets";
import type { FacetCompany } from "@/lib/domain/sample-facets";
import {
  applyFacets,
  emptyFacets,
  FacetRail,
  IntelligenceBoards,
  LogoMark,
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

  return (
    <div className="mx-auto mt-3 grid w-full max-w-[1100px] gap-3">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-[color:var(--fg-3,#6B7390)]">{feed === "leaderboard" ? "Leaderboard" : "Directory"}</p>
            <p className="mt-0.5 text-[13px] text-[color:var(--fg-2,#A3AAC0)]">
              Showing <span className="font-bold tabular-nums text-[color:var(--ember,#E8823A)]">{total.toLocaleString("en-US")}</span>{" "}
              {total === 1 ? "company" : "companies"}
              {campusName ? (
                <>
                  {" · "}
                  {campusName}
                  {" · "}
                  <Link href={clearCampusHref} className="text-[color:var(--fg,#ECEEF4)] hover:underline">
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
                  className={`inline-flex h-6 items-center rounded-full border px-2 text-[11px] ${sort === id ? "border-[color:var(--ember,#E8823A)] bg-[color:var(--ember,#E8823A)] text-white" : "border-[color:var(--line,#1F2536)] text-[color:var(--fg,#ECEEF4)]"}`}
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
                  className={`inline-flex h-6 items-center rounded-full border px-2 text-[11px] ${active ? "border-[color:var(--ember,#E8823A)] bg-[color:var(--ember,#E8823A)] text-white" : "border-[color:var(--line,#1F2536)] bg-[color:var(--bg-raised,#121726)] text-[color:var(--fg,#ECEEF4)]"}`}
                >
                  {year}
                </button>
              );
            })}
            {(
              [
                ["flag", "new", "New this year"],
                ["flag", "signaled", "Active this month"],
                ["flag", "funded", "Raised funding"],
                ["flag", "founders", "Founders listed"],
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
                  className={`inline-flex h-6 items-center rounded-full border px-2 text-[11px] ${active ? "border-[color:var(--ember,#E8823A)] bg-[color:var(--ember,#E8823A)] text-white" : "border-[color:var(--line,#1F2536)] bg-[color:var(--bg-raised,#121726)] text-[color:var(--fg,#ECEEF4)]"}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <details className="rounded-xl border border-[color:var(--line,#1F2536)] bg-[color:var(--bg-raised,#121726)] px-2.5 py-2">
            <summary className="cursor-pointer text-[12px] font-semibold text-[color:var(--fg,#ECEEF4)]">All filters</summary>
            <div className="mt-2 h-[min(50vh,380px)]">
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
          <ol className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {cards.map((card, index) => (
              <li key={card.id}>
                <DirectoryPill card={card} rank={feed === "leaderboard" ? (pages - 1) * 5 + index + 1 : null} />
              </li>
            ))}
          </ol>
        )}
        {cards.length < total ? (
          <Link href={moreHref} className="mt-3 inline-flex h-8 items-center rounded-full border border-[color:var(--line,#1F2536)] bg-[color:var(--bg-raised,#121726)] px-3 text-[12px] font-medium text-[color:var(--fg,#ECEEF4)] hover:border-[color:var(--ember,#E8823A)]">
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
        <div className="mt-4">
          <IntelligenceBoards companies={boardCompanies} compact />
        </div>
      </div>
    </div>
  );
}

function DirectoryPill({ card, rank }: { card: DirectoryCard; rank: number | null }) {
  const subtitle = directoryCardSubtitle(card);
  return (
    <Link href={`/startup/${card.id}`} className="flex items-center gap-2 rounded-xl border border-[color:var(--line,#1F2536)] bg-[color:var(--bg-raised,#121726)] px-2 py-1.5 hover:border-[color:var(--ember,#E8823A)]">
      {rank != null ? <span className="w-4 shrink-0 text-center text-[11px] font-bold tabular-nums text-[color:var(--ember,#E8823A)]">{rank}</span> : null}
      <LogoMark name={card.name} logoUrl={card.logoUrl} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-medium text-[color:var(--fg,#ECEEF4)]">{card.name}</p>
        {subtitle ? <p className="truncate text-[10px] text-[color:var(--fg-3,#6B7390)]">{subtitle}</p> : null}
      </div>
      {card.signals > 0 ? (
        <div className="w-[3.25rem] shrink-0 text-right">
          <p className="text-[13px] font-bold tabular-nums leading-none text-[color:var(--ember,#E8823A)]">{card.signals.toLocaleString("en-US")}</p>
          <p className="whitespace-nowrap text-[9px] uppercase tracking-[0.02em] text-[color:var(--fg-3,#6B7390)]">{signalsUnit(card.signals)}</p>
        </div>
      ) : null}
    </Link>
  );
}
