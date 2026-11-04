/** Facet helpers for the sample instrument. Counts come from stored directory cards only. */

export type RecencyId = "month" | "year" | "older" | "none";
export type StatusId = "active" | "acquired" | "closed";
/** Product flags backed by stored fields only (no meta asset flags like logo). */
export type FlagId = "new" | "signaled" | "funded" | "founders";

export const NOT_ON_RECORD = "not_on_record";
export const NOT_ON_RECORD_LABEL = "Not on record";

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
  foundedYear?: number | null;
  operatingStatus?: "acquired" | "dead" | null;
  hqRegion?: string | null;
  primaryProgram?: string | null;
  programs?: string[] | null;
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

export const STATUS_LABEL: Record<StatusId, string> = {
  active: "Active",
  acquired: "Acquired",
  closed: "Closed",
};

export const FLAG_LABEL: Record<FlagId, string> = {
  new: "Founded in 2026",
  signaled: "Active this month",
  funded: "Raised funding",
  founders: "Has named founders",
};

/** Company status is operating_status only. An acquisition signal is a signal, not a status. */
export function statusOf(company: FacetCompany): StatusId {
  if (company.operatingStatus === "dead") return "closed";
  if (company.operatingStatus === "acquired") return "acquired";
  return "active";
}

/** Calendar day distance from TODAY (box clock). Full YYYY-MM-DD only; partial dates do not count. */
export function daysSinceSignal(latestSignalAt: string | null | undefined, today = TODAY): number | null {
  if (!latestSignalAt || latestSignalAt.length < 10) return null;
  const y = Number(latestSignalAt.slice(0, 4));
  const m = Number(latestSignalAt.slice(5, 7));
  const d = Number(latestSignalAt.slice(8, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d) || m < 1 || d < 1) return null;
  const then = Date.UTC(y, m - 1, d);
  const now = Date.UTC(today.y, today.m - 1, today.d);
  return Math.floor((now - then) / 86400000);
}

/** Last full-date signal within the last 30 days (inclusive of today). */
export function activeThisMonth(latestSignalAt: string | null | undefined, today = TODAY): boolean {
  const days = daysSinceSignal(latestSignalAt, today);
  return days != null && days >= 0 && days <= 30;
}

/** Founded in the current calendar year (not "last two years"). */
export function newThisYear(foundedYear: number | null | undefined, today = TODAY): boolean {
  return foundedYear === today.y;
}

export function hasFlag(company: FacetCompany, flag: FlagId): boolean {
  if (flag === "new") return newThisYear(company.foundedYear);
  if (flag === "signaled") return activeThisMonth(company.latestSignalAt);
  if (flag === "funded") return company.signalKind === "funding" || Boolean(company.stage);
  if (flag === "founders") return (company.founders?.length ?? 0) > 0;
  return false;
}

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

/** Year buckets including an explicit Not on record row. Sum equals companies.length. */
export function foundedYearBuckets(companies: FacetCompany[]): FacetCount[] {
  const counts = new Map<string, number>();
  let missing = 0;
  for (const company of companies) {
    if (company.foundedYear == null) {
      missing += 1;
      continue;
    }
    const id = String(company.foundedYear);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const years = [...counts.entries()]
    .map(([id, count]) => ({ id, label: id, count, year: Number(id) }))
    .sort((a, b) => b.year - a.year)
    .map(({ id, label, count }) => ({ id, label, count }));
  // Put Not on record first so the hollow majority is honest and visible.
  if (missing > 0) years.unshift({ id: NOT_ON_RECORD, label: NOT_ON_RECORD_LABEL, count: missing });
  return years;
}

/** HQ buckets including Not on record. Sum equals companies.length. */
export function hqRegionBuckets(companies: FacetCompany[]): FacetCount[] {
  const counts = new Map<string, number>();
  let missing = 0;
  for (const company of companies) {
    const region = company.hqRegion?.trim();
    if (!region) {
      missing += 1;
      continue;
    }
    counts.set(region, (counts.get(region) ?? 0) + 1);
  }
  const regions = [...counts.entries()]
    .map(([id, count]) => ({ id, label: id, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  if (missing > 0) regions.unshift({ id: NOT_ON_RECORD, label: NOT_ON_RECORD_LABEL, count: missing });
  return regions;
}

/** Sector buckets including Not on record. Sum equals companies.length. */
export function sectorBuckets(companies: FacetCompany[]): FacetCount[] {
  const counts = new Map<string, number>();
  const labels = new Map<string, string>();
  let missing = 0;
  for (const company of companies) {
    const id = company.sectorId?.trim();
    if (!id) {
      missing += 1;
      continue;
    }
    counts.set(id, (counts.get(id) ?? 0) + 1);
    if (!labels.has(id)) labels.set(id, company.sector?.trim() || id);
  }
  const sectors = [...counts.entries()]
    .map(([id, count]) => ({ id, label: labels.get(id) ?? id, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  if (missing > 0) sectors.unshift({ id: NOT_ON_RECORD, label: NOT_ON_RECORD_LABEL, count: missing });
  return sectors;
}

/** Sector pills: Not on record first, then top N named, optional More remainder. Visible+More+missing sum to total. */
export function sectorPills(companies: FacetCompany[], topN = 10): { visible: FacetCount[]; more: FacetCount[]; moreCount: number; all: FacetCount[] } {
  const all = sectorBuckets(companies);
  const missing = all.filter((b) => b.id === NOT_ON_RECORD);
  const named = all.filter((b) => b.id !== NOT_ON_RECORD);
  const visibleNamed = named.slice(0, topN);
  const more = named.slice(topN);
  return {
    all,
    visible: [...missing, ...visibleNamed],
    more,
    moreCount: more.reduce((s, b) => s + b.count, 0),
  };
}

/** HQ city pills for the rail: Not on record first, then top N cities, optional More remainder. */
export function hqRegionPills(companies: FacetCompany[], topN = 8): { visible: FacetCount[]; more: FacetCount[]; moreCount: number } {
  const all = hqRegionBuckets(companies);
  const missing = all.filter((b) => b.id === NOT_ON_RECORD);
  const cities = all.filter((b) => b.id !== NOT_ON_RECORD);
  const visibleCities = cities.slice(0, topN);
  const more = cities.slice(topN);
  return {
    visible: [...missing, ...visibleCities],
    more,
    moreCount: more.reduce((s, b) => s + b.count, 0),
  };
}

/** Counts for the company filters before the directory JSON has loaded in the browser. */
export function listedFacetSeed(companies: FacetCompany[]): {
  total: number;
  statuses: { id: StatusId; label: string; count: number }[];
  years: FacetCount[];
  sectors: { visible: FacetCount[]; more: FacetCount[]; moreCount: number };
  hq: { visible: FacetCount[]; more: FacetCount[]; moreCount: number };
} {
  const counts = new Map<StatusId, number>();
  for (const company of companies) {
    const id = statusOf(company);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return {
    total: companies.length,
    statuses: (Object.keys(STATUS_LABEL) as StatusId[]).map((id) => ({
      id,
      label: STATUS_LABEL[id],
      count: counts.get(id) ?? 0,
    })),
    years: foundedYearBuckets(companies),
    sectors: sectorPills(companies, 10),
    hq: hqRegionPills(companies, 8),
  };
}

export type FacetSeed = ReturnType<typeof listedFacetSeed>;

/** Plural-safe signal unit for directory cards. */
export function signalsUnit(count: number): string {
  return count === 1 ? "signal" : "signals";
}

export function bucketSum(buckets: FacetCount[]): number {
  return buckets.reduce((sum, item) => sum + item.count, 0);
}

export function filterFacetCompanies(
  companies: FacetCompany[],
  opts: {
    sector?: string | null;
    sectorMissing?: boolean;
    kind?: string | null;
    stage?: string | null;
    campus?: string | null;
    recency?: RecencyId | null;
    foundedYear?: number | null;
    yearMissing?: boolean;
    status?: StatusId | null;
    flag?: FlagId | null;
    hqRegion?: string | null;
    query?: string;
  },
): FacetCompany[] {
  const tokens = (opts.query ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  return companies.filter((company) => {
    if (opts.sectorMissing) {
      if (company.sectorId) return false;
    } else if (opts.sector && company.sectorId !== opts.sector) {
      return false;
    }
    if (opts.kind && company.signalKind !== opts.kind) return false;
    if (opts.stage && company.stage !== opts.stage) return false;
    if (opts.campus && company.schoolId !== opts.campus) return false;
    if (opts.recency && recencyOf(company.latestSignalAt) !== opts.recency) return false;
    if (opts.yearMissing) {
      if (company.foundedYear != null) return false;
    } else if (opts.foundedYear != null && company.foundedYear !== opts.foundedYear) {
      return false;
    }
    if (opts.status && statusOf(company) !== opts.status) return false;
    if (opts.flag && !hasFlag(company, opts.flag)) return false;
    if (opts.hqRegion === NOT_ON_RECORD) {
      if (company.hqRegion) return false;
    } else if (opts.hqRegion && company.hqRegion !== opts.hqRegion) {
      return false;
    }
    if (tokens.length) {
      const hay = [company.name, company.sector ?? "", company.school ?? "", ...(company.founders ?? [])].join("\n").toLowerCase();
      if (!tokens.every((token) => hay.includes(token))) return false;
    }
    return true;
  });
}

/** Directory card subtitle from stored fields only. Empty string means hide the line. */
export function directoryCardSubtitle(card: {
  school?: string | null;
  hqRegion?: string | null;
  sector?: string | null;
  stage?: string | null;
  signalLabel?: string | null;
}): string {
  const signal =
    card.signalLabel === "Acquisition"
      ? "Acquired"
      : card.signalLabel ?? null;
  return [card.school, card.hqRegion, card.sector, card.stage, signal].filter(Boolean).join(" · ");
}

/** Prefer real logos first for dense drawers; stable by name within each group. */
export function preferLogoCompanies<T extends { logoUrl?: string | null; name: string }>(companies: T[]): T[] {
  const withLogo: T[] = [];
  const without: T[] = [];
  for (const company of companies) {
    if (company.logoUrl) withLogo.push(company);
    else without.push(company);
  }
  return [...withLogo, ...without];
}


/** Single source of truth for sample instrument surfaces (fold, strip, browse, DOM tests). */
export function sampleSurfaceCounts(
  companies: { founders?: readonly unknown[] | null }[],
  campuses: { id: string }[],
): { companies: number; foundersListed: number; campusesOnMap: number } {
  let foundersListed = 0;
  for (const company of companies) foundersListed += company.founders?.length ?? 0;
  return {
    companies: companies.length,
    foundersListed,
    campusesOnMap: campuses.length,
  };
}

/** Companies on the same campus as `schoolId`, including the subject company. */
export function campusPeerCompanies<T extends { schoolId: string | null }>(
  companies: T[],
  schoolId: string | null | undefined,
): T[] {
  if (!schoolId) return [];
  return companies.filter((c) => c.schoolId === schoolId);
}

