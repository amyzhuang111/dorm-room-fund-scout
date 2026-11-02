/**
 * Every edge in the founder-networks graph must cite a real data sourceKey.
 * Usage: node scripts/check-network-edges.mjs
 */
import fs from "node:fs";
import path from "node:path";

const file = path.join(process.cwd(), "public", "data", "founder-networks-graph.json");
if (!fs.existsSync(file)) {
  console.error("FAIL missing", file);
  process.exit(1);
}
const graph = JSON.parse(fs.readFileSync(file, "utf8"));
const ALLOWED = new Set([
  "claims.program_membership",
  "claims.accelerator_membership",
  "claims.accelerator_founder",
  "claims.lab_spinout",
  "claims.lab_spinout_founder",
  "claims.program_listing",
  "claims.funding",
  "claims.bio_membership",
  "company_facts.investor",
  "program_signals",
  "relationships.program",
  "person_project_roles.shared_founder",
]);

let bad = 0;
const counts = new Map();
for (const edge of graph.edges ?? []) {
  const key = edge.sourceKey || "";
  counts.set(key, (counts.get(key) || 0) + 1);
  if (!ALLOWED.has(key)) {
    bad += 1;
    if (bad <= 5) console.error("bad sourceKey", key, edge);
  }
}
console.log("edges", graph.edges?.length ?? 0);
console.log("bySourceKey", Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1])));
if (bad > 0) {
  console.error("FAIL", bad, "edges without an allowed data source");
  process.exit(1);
}
console.log("OK every edge has a real data source");
