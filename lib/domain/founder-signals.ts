// Sourced notes on which programs predict student founders. These rows steer
// where to look. They are not Founder Signal, eligibility, or an investment score.

import fs from "node:fs";
import path from "node:path";
import { parseCsv, resolveCampusParam } from "./hotspot-model";

export interface FounderSignalRow {
  signal: string;
  campus: string;
  why: string;
  sources: string[];
}

const CSV_PATH = path.join(process.cwd(), "data", "imports", "founder_signals.csv");

export function parseFounderSignals(text: string): FounderSignalRow[] {
  return parseCsv(text).map((row) => ({
    signal: (row.signal || "").trim(),
    campus: (row.campus || "").trim(),
    why: (row.why || "").trim(),
    sources: (row.sources || "")
      .split("|")
      .map((url) => url.trim())
      .filter((url) => url.startsWith("http")),
  }));
}

export function loadFounderSignals(): FounderSignalRow[] {
  return parseFounderSignals(fs.readFileSync(CSV_PATH, "utf8"));
}

/** Rows whose campus is this directory label. Same rows, scoped to one school. */
export function founderSignalsForCampus(rows: FounderSignalRow[], campus: string): FounderSignalRow[] {
  if (!campus.trim()) return [];
  return rows.filter((row) => resolveCampusParam(row.campus, [campus]) === campus);
}
