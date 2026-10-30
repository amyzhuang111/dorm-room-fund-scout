import Link from "next/link";
import { GlobeHero, WorldMap } from "@/components/globe-hero";
import { SampleInstrumentBrowse } from "@/components/sample-instrument-browse";
import { SampleTheme } from "@/components/sample-theme";
import {
  directoryPage,
  directorySortOf,
  filterDirectory,
  leaderboardPage,
  loadDirectory,
  searchDirectory,
  sortDirectory,
  type DirectoryCard,
  type DirectoryFilter,
  type DirectorySort,
} from "@/lib/domain/directory";
import type { HeroStats } from "@/lib/domain/hero-stats";

export type Feed = "directory" | "leaderboard" | "world";

function browseHref(opts: {
  feed?: Feed;
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

export function SampleHome({
  feed,
  sector,
  kind,
  campus,
  more,
  q,
  sort,
  stats,
}: {
  feed: Feed;
  sector?: string;
  kind?: string;
  campus?: string;
  more?: string;
  q?: string;
  sort?: string;
  stats: HeroStats;
}) {
  const pages = Math.max(1, Math.floor(Number(more)) || 1);
  const query = q?.trim() ?? "";
  const order = directorySortOf(sort);
  const campusRow = campus ? stats.universities.find((university) => university.id === campus) : undefined;
  const campusId = campusRow?.id;
  const listed = feed === "directory" || feed === "leaderboard";
  const data = loadDirectory();
  const tiles = data.cards.map((card) => ({
    id: card.id,
    name: card.name,
    schoolId: card.schoolId,
    school: card.school,
    signals: card.signals,
    logoUrl: card.logoUrl,
    founders: card.founders,
    sectorId: card.sectorId,
    sector: card.sector,
    stage: card.stage,
    signalKind: card.signalKind,
    signalLabel: card.signalLabel,
    latestSignalAt: card.latestSignalAt,
    foundedYear: card.foundedYear,
    operatingStatus: card.operatingStatus,
    hqRegion: card.hqRegion,
    primaryProgram: card.primaryProgram,
  }));
  const matched = searchDirectory(filterDirectory(data.cards, sector, kind, campusId), query);
  const campusTotal = campusId ? filterDirectory(data.cards, undefined, undefined, campusId).length : null;
  const ordered = feed === "directory" ? sortDirectory(matched, order) : matched;
  const shown = feed === "leaderboard" ? leaderboardPage(ordered, pages) : directoryPage(ordered, pages);
  const total = feed === "leaderboard" ? matched.filter((card) => card.signals > 0).length : matched.length;
  const campuses = stats.universities
    .filter((university) => university.lat != null && university.lon != null)
    .map((university) => ({
      id: university.id,
      name: university.name,
      country: university.country?.trim() || "Unknown",
      founders: university.founderCount,
    }));
  // Server-safe newest-sector strip (mirrors contentsPageInsight; avoid client import).
  type Agg = { id: string; label: string; n: number; sig: number; recent: number };
  const sectorAgg = new Map<string, Agg>();
  for (const card of data.cards) {
    const id = card.sectorId?.trim() || "";
    const label = card.sector?.trim() || "";
    if (!id || !label || /^unlabeled$/i.test(label)) continue;
    const row = sectorAgg.get(id) ?? { id, label, n: 0, sig: 0, recent: 0 };
    row.n += 1;
    if ((card.signals ?? 0) > 0) row.sig += 1;
    const at = card.latestSignalAt ?? "";
    if (at.length >= 7 && at.slice(0, 7) >= "2026-09") row.recent += 1;
    sectorAgg.set(id, row);
  }
  const newestHomeRow = [...sectorAgg.values()]
    .filter((row) => row.recent > 0)
    .sort((a, b) => b.recent - a.recent || b.sig - a.sig || a.label.localeCompare(b.label))[0] ?? null;
  const newestHome = newestHomeRow
    ? {
        label: newestHomeRow.label,
        detail: `${newestHomeRow.sig.toLocaleString("en-US")} of ${newestHomeRow.n.toLocaleString("en-US")} since Sep`,
      }
    : null;

  return (
    <div className="sample-paper">
      <SampleTheme />
      <GlobeHero stats={stats} showGlobe={feed !== "world"} companies={tiles} />
      <section id="browse" className="scroll-mt-14 border-t border-line px-3 pb-10 pt-2 sm:px-5">
        <div className="mx-auto w-full max-w-[1280px]">
          <div className="flex flex-wrap items-center gap-x-1 border-b border-line" role="tablist" aria-label="Views">
            <Tab href={browseHref({ feed: "directory", sector, kind, campus: campusId, q: query, sort: order })} active={feed === "directory"}>
              Ledger
            </Tab>
            <Tab href={browseHref({ feed: "leaderboard", sector, kind, campus: campusId, q: query })} active={feed === "leaderboard"}>
              Signals
            </Tab>
            <Tab href={browseHref({ feed: "world", campus: campusId })} active={feed === "world"}>
              Atlas
            </Tab>
          </div>
          <div className="flex items-baseline justify-between gap-3 border-b border-line py-1.5" data-browse-edition="">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--cobalt,#2F4FD8)]">Scout edition</p>
            <p className="min-w-0 truncate text-right font-mono text-[11px] tabular-nums text-[color:var(--fg-2,#3F465C)]">
              <span className="font-bold text-[color:var(--ember,#D96B1C)]">{data.cards.length.toLocaleString("en-US")}</span>
              {" companies · "}
              <span className="font-bold text-[color:var(--ember,#D96B1C)]">{data.cards.filter((c) => c.signals > 0).length.toLocaleString("en-US")}</span>
              {" with signal"}
              {newestHome ? (
                <>
                  {" · "}
                  <span className="font-bold text-[color:var(--ember,#D96B1C)]">{newestHome.detail}</span>
                  {" · "}
                  {newestHome.label}
                </>
              ) : null}
            </p>
          </div>
        </div>
        {feed === "world" ? (
          <div className="mx-auto mt-3 w-full max-w-[1280px]">
            <WorldMap stats={stats} companies={tiles} />
          </div>
        ) : listed ? (
          <SampleInstrumentBrowse
            feed={feed}
            cards={shown}
            total={total}
            pages={pages}
            sector={sector}
            kind={kind}
            campus={campusId}
            campusName={campusRow?.name}
            campusTotal={campusTotal}
            query={query}
            sort={order}
            sectors={data.sectors}
            kinds={data.kinds}
            campuses={campuses}
            companies={tiles}
            moreHref={browseHref({
              feed,
              sector,
              kind,
              campus: campusId,
              q: query,
              sort: feed === "directory" ? order : undefined,
              more: pages + 1,
            })}
            clearCampusHref={browseHref({ feed, sector, kind, q: query, sort: feed === "directory" ? order : undefined })}
          />
        ) : null}
      </section>
    </div>
  );
}

function Tab({ href, active, children }: { href: string; active: boolean; children: string }) {
  return (
    <Link href={href} role="tab" aria-selected={active} className={`grid h-8 place-items-center border-b-2 px-2.5 font-mono text-[12px] font-medium uppercase tracking-[0.08em] ${active ? "border-[color:var(--ember,#D96B1C)] text-[color:var(--fg,#0B0E17)]" : "border-transparent text-[color:var(--fg-3,#5C647A)] hover:text-[color:var(--fg-2,#3F465C)]"}`}>
      {children}
    </Link>
  );
}

export type { DirectoryCard, DirectoryFilter };
