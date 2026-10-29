/** Facet helpers for the sample instrument. Counts come from stored directory cards only. */

export type RecencyId = "month" | "year" | "older" | "none";

export interface FacetCompany {
  id: string;
  name: string;
  schoolId: string | null;
  school?: string | null;
  signals: number;
  logoUrl?: string | null;
  founders?: string[];
  sectorId?: string | null;
  sector?: string | null;
  stage?: string | null;
  signalKind?: string | null;
  signalLabel?: string | null;
  latestSignalAt?: string | null;
}

export interface FacetCount {
  id: string;
  label: string;
  count: number;
}

/** Today for sample recency buckets (box clock America/New_York). */
const TODAY = { y: 2026, m: 10, d: 29 };

export function recencyOf(latestSignalAt: string | null | undefined): RecencyId {
  if (!latestSignalAt || latestSignalAt.length < 4) return "none";
  const y = Number(latestSignalAt.slice(0, 4));
  if (!Number.isFinite(y)) return "none";
  const rawM = latestSignalAt.length >= 7 ? latestSignalAt.slice(5, 7) : "00";
  const m = rawM === "00" ? 0 : Number(rawM);
  if (y > TODAY.y) return "month";
  if (y === TODAY.y) {
    if (!m || m === TODAY.m) return "month";
    if (m === TODAY.m - 1 || (TODAY.m === 1 && m === 12 && y === TODAY.y)) return "month";
    return "year";
  }
  if (y === TODAY.y - 1 && TODAY.m === 1 && m === 12) return "month";
  return "older";
}

export const RECENCY_LABEL: Record<RecencyId, string> = {
  month: "Past month",
  year: "This year",
  older: "Older",
  none: "No date",
};

export function countBy<T>(items: T[], keyOf: (item: T) => string | null | undefined, labelOf: (id: string) => string): FacetCount[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const id = keyOf(item)?.trim();
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ id, label: labelOf(id), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function filterFacetCompanies(
  companies: FacetCompany[],
  opts: {
    sector?: string | null;
    kind?: string | null;
    stage?: string | null;
    campus?: string | null;
    recency?: RecencyId | null;
    query?: string;
  },
): FacetCompany[] {
  const tokens = (opts.query ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  return companies.filter((company) => {
    if (opts.sector && company.sectorId !== opts.sector) return false;
    if (opts.kind && company.signalKind !== opts.kind) return false;
    if (opts.stage && company.stage !== opts.stage) return false;
    if (opts.campus && company.schoolId !== opts.campus) return false;
    if (opts.recency && recencyOf(company.latestSignalAt) !== opts.recency) return false;
    if (tokens.length) {
      const hay = [company.name, company.sector ?? "", company.school ?? "", ...(company.founders ?? [])].join("\n").toLowerCase();
      if (!tokens.every((token) => hay.includes(token))) return false;
    }
    return true;
  });
}
