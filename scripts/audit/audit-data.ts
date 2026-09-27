// Fail when program names collide, one program is tied to two campuses,
// a link points at a missing row, or two people share a LinkedIn slug.
// Safe to re-run. Does not write the database.

import fs from "node:fs";
import path from "node:path";
import { getDb } from "../../lib/db/client";
import { auditData } from "../../lib/domain/data-audit";

const csvPath = path.join(process.cwd(), "data", "imports", "campus_hotspots.csv");
const csv = fs.readFileSync(csvPath, "utf8");
const issues = auditData(getDb(), csv);

if (issues.length === 0) {
  console.log("audit:data passed");
  process.exit(0);
}

for (const issue of issues) {
  console.error(`${issue.code}\t${issue.entityId}\t${issue.detail}`);
}
console.error(`audit:data failed with ${issues.length} issue(s)`);
process.exit(1);
