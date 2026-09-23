// FOUNDER_SCOUT_SOURCING.md §65-67 — scans real self-reported bio text
// already in the database (currently only the "GitHub bio" marker
// fetch-wdb-github.ts writes) for an unambiguous founder claim, and files
// it as a reviewable `possible_companies` row (see lib/domain/
// company-detection.ts + schema.sql) — never an auto-created Startup
// Scout candidate, per §67.
//
// Safe to re-run: only ever inserts a new row for a (person, company
// guess) pair it hasn't filed before; never touches or overwrites a row
// that's already there (matches the match-portfolio.ts convention).
// Run: npx tsx scripts/screen/detect-possible-companies.ts
import { getDb } from "../../lib/db/client";
import { runCompanyDetection } from "../../lib/domain/company-detection";

function main() {
  const db = getDb();
  const result = runCompanyDetection(db);
  console.log(
    `Possible-company detection: ${result.inserted} new row(s) filed (${result.autoConfirmed} auto-confirmed against an already-known founder relationship or exact project-name match, ${result.inserted - result.autoConfirmed} left 'unreviewed' for a human), ${result.skippedAlreadyKnown} already on file from a prior run.`
  );
}

main();
