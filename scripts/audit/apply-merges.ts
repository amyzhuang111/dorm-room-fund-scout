// Apply a JSON list of already-decided duplicate merges.
// Each item: { entityType: "person" | "project", survivorId, dropId, reason }
// Safe to re-run: a missing dropped row means that pair was already merged.

import fs from "node:fs";
import { getDb } from "../../lib/db/client";
import { mergeRecordedPair } from "../../lib/domain/dedupe";

const file = process.argv[2];
if (!file) {
  console.error("Usage: tsx scripts/audit/apply-merges.ts merges.json");
  process.exit(1);
}

const pairs = JSON.parse(fs.readFileSync(file, "utf8")) as {
  entityType: "person" | "project";
  survivorId: string;
  dropId: string;
  reason: string;
}[];

const db = getDb();
let applied = 0;
let skipped = 0;
for (const pair of pairs) {
  const ok = mergeRecordedPair(db, pair.entityType, pair.survivorId, pair.dropId, pair.reason);
  if (ok) {
    applied += 1;
    console.log(`merged ${pair.entityType} ${pair.dropId} → ${pair.survivorId}`);
  } else {
    skipped += 1;
  }
}
db.pragma("wal_checkpoint(TRUNCATE)");
console.log(`Merges applied: ${applied}. Already merged or missing: ${skipped}.`);
