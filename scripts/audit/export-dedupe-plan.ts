// Write the conservative dedupe plan as JSON for the accuracy audit to apply.
// Does not modify the database.

import fs from "node:fs";
import { getDb } from "../../lib/db/client";
import { planDedupe } from "../../lib/domain/dedupe";

const out = process.argv[2];
if (!out) {
  console.error("Usage: tsx scripts/audit/export-dedupe-plan.ts plan.json");
  process.exit(1);
}

const db = getDb();
const plan = planDedupe(db);
const pairs = [
  ...plan.peopleMerges.flatMap((group) =>
    group.drop.map((drop) => ({
      entityType: "person" as const,
      survivorId: group.survivorId,
      dropId: drop.id,
      reason: `${group.reason} Merged duplicate person "${drop.name}".`,
    })),
  ),
  ...plan.startupMerges.flatMap((group) =>
    group.drop.map((drop) => ({
      entityType: "project" as const,
      survivorId: group.survivorId,
      dropId: drop.id,
      reason: `${group.reason} Merged duplicate startup "${drop.name}".`,
    })),
  ),
];
fs.writeFileSync(out, JSON.stringify(pairs, null, 2));
console.log(`Dedupe plan: ${plan.peopleMerges.length} people groups, ${plan.startupMerges.length} startup groups, ${pairs.length} rows, ${plan.ambiguous.length} ambiguous.`);
