/** Facet helpers for the sample instrument. Counts come from stored directory cards only. */
import { matchesFundingStage } from "./funding-stage";
import { matchesSector, sectorIdsOf, sectorLabelsOf, sectorLabel } from "./sectors";
import { companyMatchesCampus, companyCampusIds } from "./campus-membership";

export type RecencyId = "month" | "year" | "older" | "future" | "none";
export type StatusId = "active" | "acquired" | "closed" | "unknown";
export type OperatingStatus = "active" | "public" | "acquired" | "dead";
/** Product flags backed by stored fields only (no meta asset flags like logo). */
export type FlagId = "new" | "signaled" | "funded" | "founders";

export const NOT_ON_RECORD = "not_on_record";
export const NOT_ON_RECORD_LABEL = "Not on record";

export interface FacetCompany {
  id: string;
  name: string;
  schoolId: string | null;
  campusIds?: string[];
  campuses?: string[];
  teamSize?: string | null;
  verificationStatus?: string | null;
  sourceUrls?: string[];
  school?: string | null;
  signals: number;
  logoUrl?: string | null;
  founders?: string[];
  description?: string | null;
  sectorId?: string | null;
  sectorIds?: string[];
  sector?: string | null;
  stage?: string | null;
  signalKind?: string | null;
  signalLabel?: string | null;
  latestSignalAt?: string | null;
  foundedYear?: number | null;
  operatingStatus?: OperatingStatus | null;
  hqRegion?: string | null;
  primaryProgram?: string | null;
  programs?: string[] | null;
}

export interface FacetCount {
  id: string;
  label: string;
  count: number;
}

export type CalendarDay = { y: number; m: number; d: number };
const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
export function currentCalendarDay(now = new Date()): CalendarDay {
  const parts = dayFormatter.formatToParts(now);
  const part = (name: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === name)?.value);
  return { y: part("year"), m: part("month"), d: part("day") };
}

export function recencyOf(latestSignalAt: string | null | undefined, today = currentCalendarDay()): RecencyId {
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(latestSignalAt ?? "");
  if (!match) return "none";
  const y = Number(match[1]), m = Number(match[2] ?? 0), d = Number(match[3] ?? 0);
  if (m > 12 || (m === 0 && d !== 0)) return "none";
  const days = daysSinceSignal(latestSignalAt, today);
  if (d && days === null) return "none";
  if (y > today.y || (y === today.y && m > today.m) || (days !== null && days < 0)) return "future";
  if (days !== null && days <= 30) return "month";
  return y === today.y ? "year" : "older";
}

export const RECENCY_LABEL: Record<RecencyId, string> = {
  month: "Past month",
  year: "This year",
  older: "Older",
  future: "Future dated",
  none: "No date",
};

export const STATUS_LABEL: Record<StatusId, string> = {
  active: "Active",
  acquired: "Acquired",
  closed: "Closed",
  unknown: "Not on record",
};

export const FLAG_LABEL: Record<FlagId, string> = {
  new: "Founded this year",
  signaled: "Signal in past 30 days",
  funded: "Raised funding",
  founders: "Has named founders",
};

/** Company status is operating_status only. An acquisition signal is a signal, not a status. */
export function statusOf(company: FacetCompany): StatusId {
  if (company.operatingStatus === "dead") return "closed";
  if (company.operatingStatus === "acquired") return "acquired";
  if (company.operatingStatus === "active" || company.operatingStatus === "public") return "active";
  return "unknown";
}

export function recordedOperatingStatus(value: string | null | undefined): OperatingStatus | null {
  const raw = value?.trim().toLowerCase();
  if (raw === "active" || raw === "public" || raw === "acquired" || raw === "dead") return raw;
  if (raw === "closed" || raw === "inactive" || raw === "shut down" || raw === "shutdown") return "dead";
  return null;
}

/** Calendar day distance from TODAY (box clock). Full YYYY-MM-DD only; partial dates do not count. */
export function daysSinceSignal(latestSignalAt: string | null | undefined, today = currentCalendarDay()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(latestSignalAt ?? "")) return null;
  if (!latestSignalAt) return null;
  const y = Number(latestSignalAt.slice(0, 4));
  const m = Number(latestSignalAt.slice(5, 7));
  const d = Number(latestSignalAt.slice(8, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d) || m < 1 || m > 12 || d < 1) return null;
  const then = Date.UTC(y, m - 1, d);
  const date = new Date(then);
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  const now = Date.UTC(today.y, today.m - 1, today.d);
  return Math.floor((now - then) / 86400000);
}

/** Last full-date signal within the last 30 days (inclusive of today). */
export function activeThisMonth(latestSignalAt: string | null | undefined, today = currentCalendarDay()): boolean {
  const days = daysSinceSignal(latestSignalAt, today);
  return days != null && days >= 0 && days <= 30;
}

/** Founded in the current calendar year (not "last two years"). */
export function newThisYear(foundedYear: number | null | undefined, today = currentCalendarDay()): boolean {
  return foundedYear === today.y;
}

export function hasFlag(company: FacetCompany, flag: FlagId, today = currentCalendarDay()): boolean {
  if (flag === "new") return newThisYear(company.foundedYear, today);
  if (flag === "signaled") return activeThisMonth(company.latestSignalAt, today);
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

/** Unique companies per sector; multi-sector companies can appear in several buckets. */
export function sectorBuckets(companies: FacetCompany[]): FacetCount[] {
  const counts = new Map<string, number>();
  const labels = new Map<string, string>();
  let missing = 0;
  for (const company of companies) {
    const ids = sectorIdsOf(company);
    if (!ids.length) {
      missing += 1;
      continue;
    }
    for (const id of ids) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
      if (!labels.has(id)) labels.set(id, id === company.sectorId ? company.sector?.trim() || sectorLabel(id) : sectorLabel(id));
    }
  }
  const sectors = [...counts.entries()]
    .map(([id, count]) => ({ id, label: labels.get(id) ?? id, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  if (missing > 0) sectors.unshift({ id: NOT_ON_RECORD, label: NOT_ON_RECORD_LABEL, count: missing });
  return sectors;
}

/** Sector pills: Not on record first, then top N named, optional More remainder. */
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
    network?: string | null;
    missing?: string | null;
    today?: CalendarDay;
  },
): FacetCompany[] {
  const tokens = (opts.query ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  const today = opts.today ?? currentCalendarDay();
  return companies.filter((company) => {
    if (opts.network && !(company.programs ?? []).includes(opts.network)) return false;
    if (COVERAGE_FIELDS.find(field => field.id === opts.missing)?.has(company)) return false;
    if (opts.sectorMissing) {
      if (sectorIdsOf(company).length) return false;
    } else if (opts.sector && !matchesSector(company, opts.sector)) {
      return false;
    }
    if (opts.kind && company.signalKind !== opts.kind) return false;
    if (!matchesFundingStage(company.stage, opts.stage)) return false;
    if (opts.campus && !companyMatchesCampus(company, opts.campus)) return false;
    if (opts.recency && recencyOf(company.latestSignalAt, today) !== opts.recency) return false;
    if (opts.yearMissing) {
      if (company.foundedYear != null) return false;
    } else if (opts.foundedYear != null && company.foundedYear !== opts.foundedYear) {
      return false;
    }
    if (opts.status && statusOf(company) !== opts.status) return false;
    if (opts.flag && !hasFlag(company, opts.flag, today)) return false;
    if ((opts.hqRegion === NOT_ON_RECORD || opts.hqRegion === "missing")) {
      if (company.hqRegion) return false;
    } else if (opts.hqRegion && company.hqRegion !== opts.hqRegion) {
      return false;
    }
    if (tokens.length) {
      const hay = [company.name, company.description ?? "", ...sectorLabelsOf(company), company.school ?? "", ...(company.campuses ?? []), ...(company.founders ?? []), company.hqRegion ?? "", ...(company.programs ?? [])].join("\n").toLowerCase();
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
      ? "Acquisition signal"
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
export function campusPeerCompanies<T extends { schoolId: string | null; campusIds?: string[] }>(
  companies: T[],
  schoolId: string | null | undefined,
): T[] {
  if (!schoolId) return [];
  return companies.filter((c) => companyMatchesCampus(c, schoolId));
}


export function hasNamedFounder(company: FacetCompany): boolean {
  return (company.founders ?? []).some(name => /[\p{L}]{2,}/u.test(name) && !/^(unknown|unnamed|n\/a|founder)$/i.test(name.trim()));
}
export const COVERAGE_FIELDS = [
  { id: 'campus', label: 'Campus', has: (c: FacetCompany) => companyCampusIds(c).length > 0 },
  { id: 'founders', label: 'Named founders', has: hasNamedFounder },
  { id: 'year', label: 'Founded year', has: (c: FacetCompany) => !!c.foundedYear },
  { id: 'sector', label: 'Industry', has: (c: FacetCompany) => !!c.sectorId },
  { id: 'region', label: 'Headquarters', has: (c: FacetCompany) => !!c.hqRegion },
  { id: 'team', label: 'Team size', has: (c: FacetCompany) => !!c.teamSize },
  { id: 'status', label: 'Operating status', has: (c: FacetCompany) => statusOf(c) !== 'unknown' },
  { id: 'logo', label: 'Logo', has: (c: FacetCompany) => !!c.logoUrl },
];
