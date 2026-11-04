/** Count how many raw program/backer strings map vs demote. */
import Database from "better-sqlite3";
import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
// Use compiled path via tsx or dynamic import of source through next alias — run via node --import tsx
const { canonicalizeTag } = await import("../lib/display/canonical-tag.ts");

const db = new Database("data/campus-universe.db", { readonly: true });
const raws = new Set();
for (const row of db.prepare(`
  SELECT trim(COALESCE(json_extract(value_json,'$.org'), excerpt, '')) AS raw
  FROM claims WHERE entity_type='project' AND claim_type='program_membership'
`).all()) {
  if (row.raw) raws.add(row.raw);
}
for (const row of db.prepare(`SELECT value_text AS raw FROM company_facts WHERE fact_key='investor'`).all()) {
  if (row.raw?.trim()) raws.add(row.raw.trim());
}

let mapped = 0, demoted = 0, kept = 0, dropped = 0;
const demotedSamples = [];
const mappedSamples = [];
for (const raw of raws) {
  const r = canonicalizeTag(raw);
  if (r.mapped && r.chip) {
    mapped++;
    if (mappedSamples.length < 12) mappedSamples.push({ raw: raw.slice(0, 90), chip: r.chip });
  } else if (r.chip && !r.mapped) {
    kept++;
  } else {
    dropped++;
  }
  if (r.demoted) {
    demoted++;
    if (demotedSamples.length < 12) demotedSamples.push(r.demoted.slice(0, 90));
  }
}
const summary = {
  uniqueRaws: raws.size,
  mapped,
  demoted,
  keptShortUnmapped: kept,
  noChip: dropped,
  mappedSamples,
  demotedSamples,
};
fs.mkdirSync("reviews", { recursive: true });
fs.writeFileSync("reviews/canonical-tag-stats.json", JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
