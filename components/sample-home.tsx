import dynamic from "next/dynamic";
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
} from "@/lib/domain/directory";
import type { HeroStats } from "@/lib/domain/hero-stats";

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
      stats={stats}
      cardCount={data.cards.length}
      signalCompanyCount={data.cards.filter((c) => c.signals > 0).length}
      newestHome={newestHome}
      directoryUrl="/data/sample-directory.json"
    />
  );
}

export type { DirectoryCard, DirectoryFilter };
