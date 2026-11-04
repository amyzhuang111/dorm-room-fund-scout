/**
 * Single shared corpus totals. Every page masthead and desk count that claims
 * a universe total must read from here (corpus-snapshot.json). Partial desks
 * (e.g. campuses with founders) keep their subset math but label the share.
 */
import fs from "node:fs";
import path from "node:path";

export type CorpusTotals = {
  investableCompanies: number;
  foundersListed: number;
  foundersIndexed: number;
  campusesOnMap: number;
  campusesTotal: number;
  campusesWithFounders: number;
  /** Person-level directory exclusions (graduated before 2023 / older alumni). */
  excludedOlderAlumni: number;
  foundersRawPromoted: number;
  foundersExcludedEnrollmentOlderAlumni: number;
  foundersExcludedAffiliationOlderAlumni: number;
  companiesExcludedOlderAlumni: number;
  unverifiedRecency: number;
  ycMembership: number;
};

let memo: CorpusTotals | null = null;

export function loadCorpusTotals(): CorpusTotals {
  if (memo) return memo;
  const snapPath = path.join(process.cwd(), "data", "corpus-snapshot.json");
  const snap = JSON.parse(fs.readFileSync(snapPath, "utf8")) as Record<string, unknown>;
  memo = {
    investableCompanies: Number(snap.investableCompanies ?? 0),
    foundersListed: Number(snap.foundersListed ?? 0),
    foundersIndexed: Number(snap.foundersIndexed ?? 0),
    campusesOnMap: Number(snap.campusesOnMap ?? 0),
    campusesTotal: Number(snap.campusesTotal ?? snap.campuses ?? 0),
    campusesWithFounders: Number(snap.campusesWithFounders ?? 0),
    excludedOlderAlumni: Number(snap.excludedOlderAlumni ?? 0),
    foundersRawPromoted: Number(snap.foundersRawPromoted ?? 0),
    foundersExcludedEnrollmentOlderAlumni: Number(snap.foundersExcludedEnrollmentOlderAlumni ?? 0),
    foundersExcludedAffiliationOlderAlumni: Number(snap.foundersExcludedAffiliationOlderAlumni ?? 0),
    companiesExcludedOlderAlumni: Number(snap.companiesExcludedOlderAlumni ?? snap.excludedOlderAlumni ?? 0),
    unverifiedRecency: Number(snap.unverifiedRecency ?? 0),
    ycMembership: Number(snap.ycMembership ?? 0),
  };
  return memo;
}

/** Display helper for incomplete ISO dates like 2026-05-00 or 2026-00-00. */
export function formatCorpusDate(raw: string | number | null | undefined): string | null {
  if (raw == null || raw === "") return null;
  const text = String(raw).trim();
  if (!text) return null;
  // Numeric founded year
  if (/^\d{4}$/.test(text)) return text;
  const m = text.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/);
  if (!m) return text;
  const year = m[1];
  const month = m[2] && m[2] !== "00" ? m[2] : null;
  const day = m[3] && m[3] !== "00" ? m[3] : null;
  if (day && month) return `${year}-${month}-${day}`;
  if (month) return `${year}-${month}`;
  if (year) return year;
  return null;
}
