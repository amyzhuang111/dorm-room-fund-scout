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

/** Cohort year ceiling for the scrubber ("now"). */
export function cohortYearNow(): number {
  return new Date().getFullYear();
}

/** Founder visible under scrub year. year=0 excluded. Years past max included at max. */
export function founderVisibleAtYear(year: number, scrub: number, yearMax: number): boolean {
  if (!year || year <= 0) return false;
  if (scrub >= yearMax) return true;
  return year <= scrub;
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
