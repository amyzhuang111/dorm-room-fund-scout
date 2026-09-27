// Sourced notes on which programs predict student founders. These rows steer
// where to look. They are not Founder Signal, eligibility, or an investment score.

import fs from "node:fs";
import path from "node:path";
import { parseCsv, resolveCampusParam } from "./hotspot-model";

export const FOUNDER_SIGNAL_TIERS = ["S+", "S", "A", "B", "C", "D"] as const;
export type FounderSignalTier = (typeof FOUNDER_SIGNAL_TIERS)[number];

export interface FounderSignalRow {
  signal: string;
  campus: string;
  tier: string;
  why: string;
  howToGetIn: string;
  timing: string;
  officialLink: string;
  sources: string[];
}

const CSV_PATH = path.join(process.cwd(), "data", "imports", "founder_signals.csv");

export function parseFounderSignals(text: string): FounderSignalRow[] {
  return parseCsv(text).map((row) => {
    const officialLink = (row.official_link || "").trim();
    const sources = (row.sources || "")
      .split("|")
      .map((url) => url.trim())
      .filter((url) => url.startsWith("http"));
    if (officialLink.startsWith("http") && !sources.includes(officialLink)) sources.unshift(officialLink);
    return {
      signal: (row.signal || "").trim(),
      campus: (row.campus || "").trim(),
      tier: (row.tier || "").trim(),
      why: (row.why || "").trim(),
      howToGetIn: (row.how_to_get_in || "").trim(),
      timing: (row.timing || "").trim(),
      officialLink: officialLink.startsWith("http") ? officialLink : "",
      sources,
    };
  });
}

export function loadFounderSignals(): FounderSignalRow[] {
  return parseFounderSignals(fs.readFileSync(CSV_PATH, "utf8"));
}

/** Rows whose campus is this directory label. Same rows, scoped to one school. */
export function founderSignalsForCampus(rows: FounderSignalRow[], campus: string): FounderSignalRow[] {
  if (!campus.trim()) return [];
  return rows.filter((row) => resolveCampusParam(row.campus, [campus]) === campus);
}
