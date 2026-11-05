/** Shared Overlays + FacetRail count source so Status / Campus never drift. */

import { NOT_ON_RECORD, sectorBuckets, STATUS_LABEL, statusOf, type FacetCompany, type StatusId } from "@/lib/domain/sample-facets";

export const CAMPUS_COUNT_UNIT = "founders" as const;

export type OverlayRow = {
  id: string;
  label: string;
  count: number;
  /** Facet key this row applies when clicked. */
  facet: "status" | "sector" | "campus";
};

export type OverlayCampus = { id: string; name: string; shortLabel: string; founders: number };

export function overlayStatusRows(companies: FacetCompany[]): OverlayRow[] {
  const counts = new Map<StatusId, number>();
  for (const company of companies) {
    const id = statusOf(company);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return (Object.keys(STATUS_LABEL) as StatusId[])
    .map((id) => ({
      id,
      label: STATUS_LABEL[id],
      count: counts.get(id) ?? 0,
      facet: "status" as const,
    }))
    .filter((row) => row.count > 0);
}

export function overlaySectorRows(companies: FacetCompany[], topN = 6): OverlayRow[] {
  return sectorBuckets(companies)
    .filter((row) => row.id !== NOT_ON_RECORD)
    .map((row) => ({ ...row, facet: "sector" as const }))
    .slice(0, topN);
}

/** Same founders unit as FacetRail Campus rows (not company counts). */
export function overlayCampusRows(campuses: OverlayCampus[], topN = 6): OverlayRow[] {
  return [...campuses]
    .filter((c) => c.founders > 0)
    .sort((a, b) => b.founders - a.founders || a.shortLabel.localeCompare(b.shortLabel))
    .slice(0, topN)
    .map((c) => ({
      id: c.id,
      label: c.shortLabel,
      count: c.founders,
      facet: "campus" as const,
    }));
}

export function buildOverlayCounts(
  companies: FacetCompany[],
  campuses: OverlayCampus[],
): { status: OverlayRow[]; sector: OverlayRow[]; campus: OverlayRow[]; campusUnit: typeof CAMPUS_COUNT_UNIT } {
  return {
    status: overlayStatusRows(companies),
    sector: overlaySectorRows(companies),
    campus: overlayCampusRows(campuses),
    campusUnit: CAMPUS_COUNT_UNIT,
  };
}
