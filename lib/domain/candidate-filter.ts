import type { Queue } from "./queue";
import type { CandidateSummary, FounderRow, SectorCount } from "./queries";
import { sectorLabel } from "./sectors";

export function matchCandidate(
  candidate: CandidateSummary,
  filters: { universityId?: string; queue?: Queue; sector?: string; search?: string }
): boolean {
  if (filters.universityId && !candidate.universityIds.includes(filters.universityId)) return false;
  if (
    filters.sector &&
    candidate.sector !== filters.sector &&
    !candidate.sectorTags.includes(filters.sector) &&
    !candidate.sectorTags.some((tag) => sectorLabel(tag) === filters.sector)
  ) {
    return false;
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    const haystack = `${candidate.name} ${candidate.description ?? ""} ${candidate.founders.join(" ")}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  if (filters.queue && candidate.queue !== filters.queue) return false;
  return true;
}

export function sectorsForUniversity(sectors: SectorCount[], universityId?: string): SectorCount[] {
  if (!universityId) return sectors;
  return sectors
    .map((sector) => {
      const byCampus = sector.byCampus.filter((campus) => campus.universityId === universityId);
      const count = byCampus.reduce((sum, campus) => sum + campus.count, 0);
      return { ...sector, count, byCampus };
    })
    .filter((sector) => sector.count > 0);
}

export function foundersInView(founders: FounderRow[], filters: { universityId?: string; search?: string }): FounderRow[] {
  const q = filters.search?.toLowerCase();
  return founders.flatMap((founder) => {
    if (q && !founder.name.toLowerCase().includes(q)) return [];
    if (!filters.universityId) return [founder];
    const match = founder.campuses?.find((campus) => campus.universityId === filters.universityId);
    if (!match) return [];
    if (match.universityId === founder.universityId && (match.status ?? founder.status) === founder.status) return [founder];
    return [{ ...founder, status: match.status ?? founder.status, universityId: match.universityId, universityName: match.universityName }];
  });
}
