"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { DirectoryCard, DirectoryFilter, DirectorySort } from "@/lib/domain/directory";
import type { FacetCompany } from "@/lib/domain/sample-facets";
import {
  applyFacets,
  BarRow,
  Board,
  emptyFacets,
  FacetRail,
  LogoMark,
  recentSignals,
  sectorMix,
  topFounders,
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

  // URL is source of truth for listed results; local facets refine the right-rail boards and quick pills.
  const boardCompanies = useMemo(() => applyFacets(companies, facets), [companies, facets]);
  const mix = useMemo(() => sectorMix(boardCompanies), [boardCompanies]);
  const recent = useMemo(() => recentSignals(boardCompanies), [boardCompanies]);
  const founders = useMemo(() => topFounders(boardCompanies), [boardCompanies]);

  function commitFacet(next: FacetState) {
    setFacets(next);
    // Navigate when a URL-backed facet changes so directory results stay real/server-filtered.
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
    <div className="mx-auto mt-3 grid w-full max-w-[1280px] gap-3 lg:grid-cols-[240px_minmax(0,1fr)_236px]">
      <div className="hidden h-[min(70vh,720px)] lg:block">
        <FacetRail companies={companies} campuses={campuses} facets={facets} onChange={commitFacet} />
      </div>
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-[#8a7260]">{feed === "leaderboard" ? "Leaderboard" : "Directory"}</p>
            <p className="mt-0.5 text-[13px] text-[#6b5443]">
              Showing <span className="font-bold tabular-nums text-[#E05612]">{total.toLocaleString("en-US")}</span>{" "}
              {total === 1 ? "company" : "companies"}
              {campusName ? (
                <>
                  {" · "}
                  {campusName}
                  {" · "}
                  <Link href={clearCampusHref} className="text-[#20140c] hover:underline">
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
                  className={`inline-flex h-6 items-center rounded-full border px-2 text-[11px] ${sort === id ? "border-[#FB651E] bg-[#FB651E] text-white" : "border-[#f0d9c6] text-[#20140c]"}`}
                >
                  {label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
        <div className="mb-2 lg:hidden">
          <details className="rounded-xl border border-[#f0d9c6] bg-white px-2.5 py-2">
            <summary className="cursor-pointer text-[12px] font-semibold text-[#20140c]">Filters</summary>
            <div className="mt-2 h-[280px]">
              <FacetRail companies={companies} campuses={campuses} facets={facets} onChange={commitFacet} />
            </div>
          </details>
        </div>
        {cards.length === 0 ? (
          <p className="text-[13px] text-[#6b5443]">
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
          <Link href={moreHref} className="mt-3 inline-flex h-8 items-center rounded-full border border-[#f0d9c6] bg-white px-3 text-[12px] font-medium text-[#20140c] hover:border-[#E05612]">
            Show more
          </Link>
        ) : null}
        {/* Keep sector/kind quick links for crawlers / no-js parity with prior filters */}
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
      <div className="hidden space-y-2 lg:block">
        <Board title="Recent signals" unit="date">
          <ol className="space-y-1.5">
            {recent.map((company, index) => (
              <li key={company.id}>
                <Link href={`/startup/${company.id}`} className="block hover:text-[#FB651E]">
                  <div className="flex items-baseline gap-1.5 text-[11px]">
                    <span className="w-3.5 shrink-0 font-bold tabular-nums text-[#E05612]">{index + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{company.name}</span>
                    <span className="shrink-0 text-[10px] text-[#8a7260]">{company.signalLabel ?? "Signal"}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        </Board>
        <Board title="Sector mix" unit="companies">
          <ol className="space-y-1.5">
            {mix.map((item, index) => (
              <li key={item.id}>
                <BarRow
                  rank={index + 1}
                  label={item.label}
                  value={item.count}
                  max={mix[0]?.count || 1}
                  href={browseHref({ feed, sector: item.id, kind, campus, q: query, sort: feed === "directory" ? sort : undefined })}
                />
              </li>
            ))}
          </ol>
        </Board>
        <Board title="Top founders" unit="signals">
          <ol className="space-y-1.5">
            {founders.map((person, index) => (
              <li key={person.key}>
                <Link href={`/startup/${person.companyId}`} className="block hover:text-[#FB651E]" title={person.companyName}>
                  <div className="flex items-baseline gap-1.5 text-[11px]">
                    <span className="w-3.5 shrink-0 font-bold tabular-nums text-[#E05612]">{index + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{person.name}</span>
                    <span className="shrink-0 font-bold tabular-nums text-[#E05612]">{person.signals}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        </Board>
      </div>
    </div>
  );
}

function DirectoryPill({ card, rank }: { card: DirectoryCard; rank: number | null }) {
  return (
    <Link href={`/startup/${card.id}`} className="flex items-center gap-2 rounded-xl border border-[#f0d9c6] bg-white px-2 py-1.5 hover:border-[#E05612]">
      {rank != null ? <span className="w-4 shrink-0 text-center text-[11px] font-bold tabular-nums text-[#E05612]">{rank}</span> : null}
      <LogoMark name={card.name} logoUrl={card.logoUrl} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-medium text-[#20140c]">{card.name}</p>
        <p className="truncate text-[10px] text-[#8a7260]">
          {[card.school, card.sector, card.stage, card.signalLabel].filter(Boolean).join(" · ") || "On record"}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[13px] font-bold tabular-nums leading-none text-[#E05612]">{card.signals.toLocaleString("en-US")}</p>
        <p className="text-[9px] uppercase tracking-[0.04em] text-[#8a7260]">signals</p>
      </div>
    </Link>
  );
}
