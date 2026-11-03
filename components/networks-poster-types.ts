export type PosterCampus = { id: string; label: string; color: string; n: number };
export type PosterHub = { id: string; label: string; kind: string; i: number; founders: number };
export type PosterCampusLabel = { id: string; label: string; n: number; x: number; y: number; r: number };
export type PosterCallout = { text: string; ax: number; ay: number; lx: number; ly: number; side: string };

export type Poster = {
  v: number;
  w: number;
  h: number;
  totals: {
    founders: number;
    companies: number;
    links: number;
    companyTotal: number;
    corpusCompanies: number;
    founderLinks: number;
    networks: number;
    foundersLinked: number;
    foundersShown?: number;
    companiesShown?: number;
    foundersWithYear?: number;
    foundersWithProxy?: number;
    foundersAlwaysOn?: number;
    foundersNoYear?: number;
    yearMin?: number;
    yearMax?: number;
  };
  campuses: PosterCampus[];
  hubs: PosterHub[];
  campusLabels?: PosterCampusLabel[];
  x: number[];
  y: number[];
  z?: number[];
  r: number[];
  kind: number[];
  campus: number[];
  deg: number[];
  /** 0 = always-on; >0 grad year; <0 = -(founded proxy year). */
  year?: number[];
  e0: number[];
  e1: number[];
  ek: number[];
  callouts: PosterCallout[];
  insights: string[];
  featuredId: string | null;
  investorHubs: { id: string; label: string; founders: number; companies: number }[];
  foIds: string[];
  coIds: string[];
};

export type Deal = {
  founderName: string;
  companyName: string | null;
  companyId: string | null;
  stage: string | null;
  networks: string[];
  investors: string[];
  hasTopFund: boolean;
};

export const YEAR_MIN_DEFAULT = 2023;

export function cohortYearNow(): number {
  return new Date().getFullYear();
}

/** Absolute cohort year from packed year field. */
export function absYear(year: number): number {
  return year < 0 ? -year : year;
}

/**
 * Founder visible under scrub year.
 * year=0 always visible; dated years must be >= YEAR_MIN (2023-or-later filter)
 * and abs(year) <= scrub (all in-range dated years show at yearMax).
 */
export function founderVisibleAtYear(
  year: number,
  scrub: number,
  yearMax: number,
  yearMin: number = YEAR_MIN_DEFAULT,
): boolean {
  if (!year) return true;
  const y = absYear(year);
  if (y < yearMin) return false;
  if (scrub >= yearMax) return true;
  return y <= scrub;
}

/** Company passes the shared 2023-or-later filter when listed in the pass set. */
export function companyPasses2023Filter(companyId: string | null | undefined, passIds: Set<string>): boolean {
  if (!companyId) return false;
  return passIds.has(companyId);
}

export function countFoundersByYear(
  years: number[] | undefined,
  kinds: number[],
  scrub: number,
  yearMax: number,
): number {
  if (!years) return 0;
  let n = 0;
  for (let i = 0; i < years.length; i++) {
    if (kinds[i] !== 0) continue;
    if (founderVisibleAtYear(years[i], scrub, yearMax)) n += 1;
  }
  return n;
}
