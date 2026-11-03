// Pure PitchBook ranking helpers. The spreadsheet stores capital in millions
// of US dollars. Matching never invents a campus: a name links only when it
// is already in the Scout campus list.

import { CAMPUSES, type CampusConfig } from "./campuses";
import { perThousand } from "./network-analysis-model";

export const PITCHBOOK_SOURCE_URL = "https://pitchbook.com/news/articles/pitchbook-university-rankings";
export const PITCHBOOK_LIST_URL =
  "https://editorial-viz.s3.us-west-1.amazonaws.com/20260901-universities-2026/global/Universities+list.xlsx";
export const PITCHBOOK_TITLE = "PitchBook VC-backed alumni founders (2015-2026)";
export const PITCHBOOK_PERIOD_START = "2015-01-01";
export const PITCHBOOK_PERIOD_END = "2026-08-31";

export type PitchbookTrackName = "undergrad" | "grad" | "mba";

export interface PitchbookTrack {
  rank: number;
  founderCount: number;
  companyCount: number;
  capitalRaisedUsd: number;
  enrollmentBand: string | null;
}

export interface PitchbookCampus {
  universityId: string;
  undergrad: PitchbookTrack | null;
  grad: PitchbookTrack | null;
  mba: PitchbookTrack | null;
  /** Undergraduate founders per 1,000 undergraduates. Null without both inputs. */
  perThousand: number | null;
  undergrads: number | null;
  enrollmentYear: string | null;
  enrollmentSourceUrl: string | null;
}

/** Spreadsheet capital is millions of USD. */
export function capitalUsdFromMillions(millions: number): number {
  return millions * 1_000_000;
}

export function formatCapitalUsd(usd: number): string {
  const abs = Math.abs(usd);
  if (abs >= 1e12) return `$${(usd / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `$${(usd / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(usd / 1e6).toFixed(1)}M`;
  return `$${Math.round(usd).toLocaleString("en-US")}`;
}

export function foundersPerThousand(founders: number, undergrads: number): number {
  return perThousand(founders, undergrads);
}

export function normalizeCampusName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/&/g, " and ")
    .replace(/['’.]/g, "")
    .replace(/\b(at|the|in)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// PitchBook appends a city that Scout's campus name leaves off.
const EXTRA_KEYS: Record<string, string> = {
  "university of michigan ann arbor": "univ_michigan",
  "university of virginia charlottesville": "univ_uva",
  "university of washington seattle": "univ_uw",
};

export function matchPitchbookUniversity(name: string, campuses: readonly CampusConfig[] = CAMPUSES): string | null {
  const index = new Map<string, string>();
  const add = (label: string, id: string) => {
    const key = normalizeCampusName(label);
    if (!key || index.has(key)) return;
    index.set(key, id);
  };
  for (const campus of campuses) {
    add(campus.name, campus.id);
    add(campus.shortLabel, campus.id);
    for (const alias of campus.aliases) add(alias, campus.id);
  }
  for (const [key, id] of Object.entries(EXTRA_KEYS)) {
    if (!index.has(key)) index.set(key, id);
  }
  return index.get(normalizeCampusName(name)) ?? null;
}

export function pitchbookSlug(name: string): string {
  return normalizeCampusName(name).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 80);
}
