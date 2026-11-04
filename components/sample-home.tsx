import dynamic from "next/dynamic";
import {
  countFoundersListed,
  directoryPage,
  directorySortOf,
  filterDirectory,
  leaderboardPage,
  loadDirectory,
  searchDirectory,
  sortDirectory,
  type DirectoryCard,
  type DirectoryFilter,
} from "@/lib/domain/directory";
import type { HeroStats } from "@/lib/domain/hero-stats";
import { buildPeakShell } from "@/lib/domain/peak-shell";

export type Feed = "directory" | "leaderboard" | "world";

const SampleHomeClient = dynamic(
  () => import("@/components/sample-home-client").then((mod) => ({ default: mod.SampleHomeClient })),
  { ssr: true },
);

export function SampleHome({
  feed,
  sector,
  kind,
  campus,
  more,
  q,
  sort,
  stats,
  place = "map",
  facetExtras,
}: {
  feed: Feed;
  sector?: string;
  kind?: string;
  campus?: string;
  more?: string;
  q?: string;
  sort?: string;
  stats: HeroStats;
  /** Map is the globe. Explore is the ranked company list. */
  place?: "map" | "explore";
  facetExtras?: Record<string, string | number | boolean | null | undefined>;
}) {
  const pages = Math.max(1, Math.floor(Number(more)) || 1);
  const query = q?.trim() ?? "";
  const order = directorySortOf(sort);
  const campusRow = campus ? stats.universities.find((university) => university.id === campus) : undefined;
  const campusId = campusRow?.id;
  const listed = place === "explore" && (feed === "directory" || feed === "leaderboard");
  const data = loadDirectory();
  const foundersListed = countFoundersListed();
  const matched = searchDirectory(filterDirectory(data.cards, sector, kind, campusId), query);
  const campusTotal = campusId ? filterDirectory(data.cards, undefined, undefined, campusId).length : null;
  const ordered = feed === "directory" ? sortDirectory(matched, order) : matched;
  // Map home loads companies client-side; skip card SSR to keep HTML ~210 KB.
  // Explore SSR only the first page — later ?more=N pages hydrate from directory JSON.
  const shown = listed
    ? feed === "leaderboard"
      ? leaderboardPage(ordered, 1)
      : directoryPage(ordered, 1)
    : [];
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
    if (at.length >= 7 && at.slice(0, 7) >= "2026-04" && !at.includes("-00")) row.recent += 1;
    sectorAgg.set(id, row);
  }
  const newestHomeRow = [...sectorAgg.values()]
    .filter((row) => row.recent > 0)
    .sort((a, b) => b.recent - a.recent || b.sig - a.sig || a.label.localeCompare(b.label))[0] ?? null;
  const newestHome = newestHomeRow
    ? {
        label: newestHomeRow.label,
        detail: `${newestHomeRow.sig.toLocaleString("en-US")} of ${newestHomeRow.n.toLocaleString("en-US")} since Apr`,
      }
    : null;
  const peakShell = buildPeakShell(data.cards);
  // Explore does not mount GlobeHero — omit heavy university rankings from RSC HTML (~160KB).
  // Map fold only needs coords + founder/signal counts for markers; full UniversitySummary
  // (coordSource, pitchbook, hitRate, …) was ~147KB in the document and blew the 210 KiB budget.
  // Minimal campus rows for GlobeHero markers (id/name/lat/lon/counts). Cast keeps HeroStats
  // typing without shipping coordSource/pitchbook/hitRate blobs in the document.
  const foldUniversities = stats.universities.map((university) => ({
    id: university.id,
    name: university.name,
    country: university.country,
    lat: university.lat,
    lon: university.lon,
    founderCount: university.founderCount,
    signalCount: university.signalCount,
    slug: university.slug,
    signalWeek: university.signalWeek,
    signalPrev: university.signalPrev,
    latestSignal: university.latestSignal,
    signalSeries: university.signalSeries,
  })) as HeroStats["universities"];
  const foldWeek = stats.week.map((item) => ({ ...item, detail: null }));
  const clientStats: HeroStats =
    place === "explore"
      ? {
          ...stats,
          week: [],
          universities: [],
          recentCampusIds: [],
          signalTypes: [],
          collageFounder: null,
        }
      : {
          ...stats,
          universities: foldUniversities,
          week: foldWeek,
        };

  return (
    <SampleHomeClient
      feed={feed}
      sector={sector}
      kind={kind}
      campusId={campusId}
      campusName={campusRow?.name}
      campusTotal={campusTotal}
      query={query}
      order={order}
      pages={pages}
      shown={listed ? shown : []}
      total={total}
      sectors={data.sectors}
      kinds={data.kinds}
      campuses={campuses}
      stats={clientStats}
      cardCount={data.cards.length}
      signalCompanyCount={data.cards.filter((c) => c.signals > 0).length}
      foundersListed={foundersListed}
      newestHome={newestHome}
      peakShell={peakShell}
      directoryUrl="/data/sample-directory.json"
      place={place}
      facetExtras={facetExtras}
    />
  );
}

export type { DirectoryCard, DirectoryFilter };
