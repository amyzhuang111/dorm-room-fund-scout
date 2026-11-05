import assert from "node:assert/strict";
import { getDb } from "../db/client";
import { buildDirectoryFromDb, filterDirectory } from "./directory";
import { EMPTY_STARTUP_FILTERS, filterMapStartups } from "./map-startups";
import { filterFacetCompanies, NOT_ON_RECORD, sectorBuckets } from "./sample-facets";
import { overlaySectorRows } from "./overlay-counts";

const data = buildDirectoryFromDb();
const cards = new Map(data.cards.map(card => [card.id, card]));
const stored = getDb().prepare(`SELECT p.id, p.name, t.tag FROM projects p JOIN project_sector_tags t ON t.project_id=p.id
  WHERE p.kind='company' AND p.is_investable_candidate=1`).all() as { id: string; name: string; tag: string }[];
for (const row of stored) assert.ok(cards.get(row.id)?.sectorIds?.includes(row.tag), `${row.name}: lost stored ${row.tag}`);

const buckets = sectorBuckets(data.cards).filter(row => row.id !== NOT_ON_RECORD);
assert.equal(data.sectors.length, buckets.length, "rare sectors must stay selectable");
const overlays = overlaySectorRows(data.cards, Infinity);
for (const sector of buckets) {
  const mapIds = filterMapStartups(data.cards, { ...EMPTY_STARTUP_FILTERS, sector: sector.id }).map(c => c.id).sort();
  assert.deepEqual(mapIds, filterDirectory(data.cards, sector.id, undefined).map(c => c.id).sort(), sector.label);
  assert.deepEqual(mapIds, filterFacetCompanies(data.cards, { sector: sector.id }).map(c => c.id).sort(), sector.label);
  assert.equal(mapIds.length, sector.count, sector.label);
  assert.equal(data.sectors.find(s => s.id === sector.id)?.count, sector.count);
  assert.equal(overlays.find(s => s.id === sector.id)?.count, sector.count);
  assert.equal(new Set(mapIds).size, mapIds.length);
}
const aerospace = filterDirectory(data.cards, "aerospace", undefined);
for (const name of ["Orca Aerospace", "Reditus Space", "AITI", "NADE"]) {
  assert.ok(aerospace.some(card => card.name === name), `${name} missing from Aerospace`);
}
console.log("all sector surfaces agree", { companies: data.cards.length, sectors: buckets.length, aerospace: aerospace.map(c => c.name) });
