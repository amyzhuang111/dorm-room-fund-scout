// Merge duplicate startups and people already stored in campus-universe.db.
//
// A startup merges only when normalized name, website domain, LinkedIn company
// URL, or overlapping founders agree, and a second signal rules out a different
// company that happens to share a name. People merge on the same LinkedIn
// profile, or the same name plus the same campus plus the same startup.
//
//   npx tsx scripts/db/dedupe.ts --dry-run
//   npx tsx scripts/db/dedupe.ts

import { getDb } from "../../lib/db/client";
import { applyDedupe, formatDedupePlan, mergedAwayCounts, planDedupe, tableCounts } from "../../lib/domain/dedupe";

const dryRun = process.argv.includes("--dry-run");
const unexpected = process.argv.slice(2).filter((arg) => arg !== "--dry-run");
if (unexpected.length) {
  console.error(`Unknown argument: ${unexpected.join(" ")}. Supported flag: --dry-run`);
  process.exit(1);
}

const db = getDb();
const before = tableCounts(db);
const plan = planDedupe(db);
const counts = mergedAwayCounts(plan);
console.log(formatDedupePlan(plan));
console.log(`Before: ${before.companies} companies, ${before.projects} projects, ${before.people} people`);
if (dryRun) {
  console.log("Dry run only. No rows were changed.");
} else {
  applyDedupe(db, plan);
  db.pragma("wal_checkpoint(TRUNCATE)");
  const after = tableCounts(db);
  console.log(
    `Applied. Startups merged away: ${counts.startups}. People merged away: ${counts.people}. After: ${after.companies} companies, ${after.projects} projects, ${after.people} people.`,
  );
}
