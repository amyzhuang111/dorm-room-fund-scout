import assert from "node:assert/strict";
import { loadDirectory } from "./directory";
import {
  activeThisMonth,
  bucketSum,
  daysSinceSignal,
  directoryCardSubtitle,
  filterFacetCompanies,
  foundedYearBuckets,
  hasFlag,
  hqRegionBuckets,
  hqRegionPills,
  newThisYear,
  NOT_ON_RECORD,
  preferLogoCompanies,
  recencyOf,
  sectorBuckets,
  sampleSurfaceCounts,
  sectorPills,
  signalsUnit,
  statusOf,
  FLAG_LABEL,
} from "./sample-facets";

assert.equal(recencyOf("2026-10-01"), "month");
assert.equal(recencyOf("2026-05-00"), "year");
assert.equal(recencyOf("2024-01-01"), "older");
assert.equal(recencyOf(null), "none");

const rows = [
  { id: "a", name: "A", schoolId: "u1", signals: 1, sectorId: "ai", stage: "Seed", signalKind: "funding", latestSignalAt: "2026-10-01", foundedYear: 2026, logoUrl: "https://example.com/a.png", hqRegion: "San Francisco", primaryProgram: "Y Combinator", founders: ["Ada"] },
  { id: "b", name: "B", schoolId: "u2", signals: 2, sectorId: "health", stage: "Series A", signalKind: "launch", latestSignalAt: "2024-01-01", foundedYear: 2023, operatingStatus: "dead" as const, hqRegion: "New York", founders: [] },
  { id: "c", name: "C", schoolId: "u1", signals: 0, sectorId: "ai", signalKind: "acquisition", operatingStatus: "acquired" as const, latestSignalAt: "2025-01-01", foundedYear: 2025, founders: ["Cam"] },
  { id: "d", name: "D", schoolId: null, signals: 0, founders: [] },
];

assert.equal(statusOf(rows[0]), "active");
assert.equal(statusOf(rows[1]), "closed");
assert.equal(statusOf(rows[2]), "acquired");
assert.equal(statusOf({ ...rows[2], operatingStatus: null }), "active");

assert.equal(FLAG_LABEL.new, "Founded in 2026");
assert.equal(newThisYear(2026), true);
assert.equal(newThisYear(2025), false);
assert.equal(activeThisMonth("2026-10-15"), true);
assert.equal(activeThisMonth("2026-09-25"), false);
assert.equal(activeThisMonth("2026-09-00"), false);
assert.equal(daysSinceSignal("2026-10-29"), 0);
assert.equal(daysSinceSignal("2026-09-29"), 30);
assert.equal(daysSinceSignal("2026-09-28"), 31);
assert.equal(activeThisMonth("2026-09-29"), true);
assert.equal(activeThisMonth("2026-09-28"), false);
assert.equal(daysSinceSignal("2026-10"), null);
assert.equal(hasFlag(rows[0], "new"), true);
assert.equal(hasFlag(rows[0], "funded"), true);
assert.equal(hasFlag(rows[0], "founders"), true);
assert.equal(hasFlag(rows[1], "founders"), false);
assert.equal(hasFlag(rows[1], "new"), false);
assert.equal(hasFlag(rows[2], "new"), false);
assert.equal(hasFlag(rows[0], "signaled"), true);
assert.equal(hasFlag(rows[1], "signaled"), false);
assert.equal(signalsUnit(1), "signal");
assert.equal(signalsUnit(2), "signals");

const sectorAll = sectorBuckets(rows);
assert.equal(bucketSum(sectorAll), rows.length);
assert.ok(sectorAll.some((b) => b.id === NOT_ON_RECORD && b.count === 1));
const sectorPack = sectorPills(rows, 1);
assert.equal(bucketSum(sectorPack.visible) + sectorPack.moreCount, rows.length);


const pills = hqRegionPills(rows, 1);
assert.ok(pills.visible.some((b) => b.id === NOT_ON_RECORD));
assert.equal(pills.visible.filter((b) => b.id !== NOT_ON_RECORD).length, 1);
assert.ok(pills.moreCount >= 1);

assert.equal(filterFacetCompanies(rows, { sector: "ai" }).length, 2);
assert.equal(filterFacetCompanies(rows, { recency: "older" }).length, 2);
assert.equal(filterFacetCompanies(rows, { foundedYear: 2026 }).length, 1);
assert.equal(filterFacetCompanies(rows, { yearMissing: true }).length, 1);
assert.equal(filterFacetCompanies(rows, { hqRegion: "San Francisco" }).length, 1);
assert.equal(filterFacetCompanies(rows, { hqRegion: NOT_ON_RECORD }).length, 2);
assert.equal(filterFacetCompanies(rows, { status: "closed" }).length, 1);
assert.equal(filterFacetCompanies(rows, { flag: "new" }).length, 1);
assert.equal(filterFacetCompanies(rows, { flag: "founders" }).length, 2);

const yearBuckets = foundedYearBuckets(rows);
assert.equal(bucketSum(yearBuckets), rows.length);
assert.ok(yearBuckets.some((b) => b.id === NOT_ON_RECORD && b.count === 1));

const hqBuckets = hqRegionBuckets(rows);
assert.equal(bucketSum(hqBuckets), rows.length);
assert.ok(hqBuckets.some((b) => b.id === NOT_ON_RECORD && b.count === 2));

assert.equal(directoryCardSubtitle({ school: "Berkeley", sector: "AI" }), "Berkeley · AI");
assert.equal(directoryCardSubtitle({ hqRegion: "San Francisco" }), "San Francisco");
assert.equal(directoryCardSubtitle({}), "");
assert.equal(directoryCardSubtitle({ school: null, sector: null, stage: null, signalLabel: null }), "");
assert.equal(directoryCardSubtitle({ school: "Georgetown", stage: "Series C", signalLabel: "Acquisition" }), "Georgetown · Series C · Acquired");
assert.ok(!directoryCardSubtitle({}).toLowerCase().includes("on record"));

const ordered = preferLogoCompanies([
  { name: "Zulu", logoUrl: null },
  { name: "Alpha", logoUrl: "https://example.com/a.png" },
  { name: "Beta", logoUrl: null },
]);
assert.equal(ordered[0]?.name, "Alpha");
assert.equal(ordered[1]?.name, "Zulu");

// Live directory: facet sums and count surfaces agree.
const data = loadDirectory();
assert.equal(bucketSum(foundedYearBuckets(data.cards)), data.cards.length);
assert.equal(bucketSum(hqRegionBuckets(data.cards)), data.cards.length);
assert.equal(bucketSum(sectorBuckets(data.cards)), data.cards.length);
assert.equal(data.cards.length, 2513);
const sectorMissing = sectorBuckets(data.cards).find((b) => b.id === NOT_ON_RECORD)?.count ?? 0;
assert.ok(sectorMissing > 0);
const namedSector = sectorBuckets(data.cards).filter((b) => b.id !== NOT_ON_RECORD).reduce((s, b) => s + b.count, 0);
assert.ok(namedSector >= 700, `expected broader sector coverage, got ${namedSector}`);
const pack = sectorPills(data.cards, 10);
assert.equal(bucketSum(pack.visible.filter((b) => b.id !== NOT_ON_RECORD)) + pack.moreCount + (pack.visible.find((b) => b.id === NOT_ON_RECORD)?.count ?? 0), data.cards.length);
const newCount = data.cards.filter((c) => hasFlag(c, "new")).length;
const activeCount = data.cards.filter((c) => hasFlag(c, "signaled")).length;
assert.ok(newCount !== activeCount, `flags must differ: new=${newCount} active=${activeCount}`);
assert.equal(newCount, data.cards.filter((c) => c.foundedYear === 2026).length);
assert.ok(activeCount < 50, `active this month should be a tight 30d window, got ${activeCount}`);
const withLogo = data.cards.filter((c) => c.logoUrl).length;
assert.ok(withLogo >= 1183, `expected favicons filled, got ${withLogo}`);
const surface = sampleSurfaceCounts(data.cards, [{ id: "a" }, { id: "b" }]);
assert.equal(surface.companies, data.cards.length);
assert.equal(surface.campusesOnMap, 2);
assert.equal(surface.foundersListed, data.cards.reduce((s, c) => s + (c.founders?.length ?? 0), 0));
assert.equal(surface.foundersListed, 2766);
assert.ok(surface.foundersListed > 2000);

const active = data.cards.filter((c) => statusOf(c) === "active").length;
const acquired = data.cards.filter((c) => statusOf(c) === "acquired").length;
const closed = data.cards.filter((c) => statusOf(c) === "closed").length;
assert.equal(active + acquired + closed, data.cards.length);

for (const card of data.cards.slice(0, 50)) {
  const sub = directoryCardSubtitle(card);
  assert.ok(!sub.toLowerCase().includes("on record"), `placeholder subtitle on ${card.name}`);
  assert.ok(!sub.includes("SIGNAL S"), `truncated label on ${card.name}`);
}

console.log("sample-facets tests ok", { total: data.cards.length, yearsMissing: foundedYearBuckets(data.cards).find((b) => b.id === NOT_ON_RECORD)?.count, hqMissing: hqRegionBuckets(data.cards).find((b) => b.id === NOT_ON_RECORD)?.count });
