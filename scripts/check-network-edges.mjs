/**
 * Every edge in the founder-networks graph must cite a real data sourceKey
 * and carry a non-null http(s) sourceUrl (unsourced edges must be dropped).
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
  "claims.product",
  "company_facts.investor",
  "program_signals",
  "relationships.program",
  "person_project_roles.shared_founder",
  "person_project_roles.company_founder",
  "person_project_roles.same_company_cofounder",
]);

let bad = 0;
let missingUrlField = 0;
let missingUrlValue = 0;
const counts = new Map();
for (const edge of graph.edges ?? []) {
  const key = edge.sourceKey || "";
  counts.set(key, (counts.get(key) || 0) + 1);
  if (!ALLOWED.has(key)) {
    bad += 1;
    if (bad <= 5) console.error("bad sourceKey", key, edge);
  }
  if (!("sourceUrl" in edge)) {
    missingUrlField += 1;
  } else if (!edge.sourceUrl || !/^https?:\/\//i.test(String(edge.sourceUrl))) {
    missingUrlValue += 1;
    if (missingUrlValue <= 8) console.error("null/invalid sourceUrl", edge.type, edge.sourceKey, edge.source, edge.target, edge.sourceUrl);
  }
}
console.log("edges", graph.edges?.length ?? 0);
console.log("bySourceKey", Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1])));
console.log("missingUrlField", missingUrlField, "nullOrInvalidSourceUrl", missingUrlValue);
if (bad > 0) {
  console.error("FAIL", bad, "edges without an allowed data source");
  process.exit(1);
}
if (missingUrlField > 0) {
  console.error("FAIL", missingUrlField, "edges missing sourceUrl field");
  process.exit(1);
}
if (missingUrlValue > 0) {
  console.error("FAIL", missingUrlValue, "edges with null or non-http sourceUrl");
  process.exit(1);
}
console.log("urlCoverage", 1);
console.log("OK every edge has a real data source and http(s) sourceUrl");
