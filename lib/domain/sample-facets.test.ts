import assert from "node:assert/strict";
import { loadDirectory } from "./directory";
import { countCandidateProjects } from "./queries";
import { sectorIdsOf } from "./sectors";
import {
  activeThisMonth as activeThisMonthAt,
  bucketSum,
  daysSinceSignal as daysSinceSignalAt,
  directoryCardSubtitle,
  filterFacetCompanies as filterFacetCompaniesAt,
  foundedYearBuckets,
  hasFlag as hasFlagAt,
  hqRegionBuckets,
  hqRegionPills,
  newThisYear as newThisYearAt,
  NOT_ON_RECORD,
  preferLogoCompanies,
  recencyOf as recencyOfAt,
  sectorBuckets,
  sampleSurfaceCounts,
  sectorPills,
  signalsUnit,
  statusOf,
  FLAG_LABEL,
} from "./sample-facets";


const today = { y: 2026, m: 10, d: 29 };
const recencyOf = (value: string | null) => recencyOfAt(value, today);
const activeThisMonth = (value: string | null) => activeThisMonthAt(value, today);
const daysSinceSignal = (value: string | null) => daysSinceSignalAt(value, today);
const newThisYear = (value: number) => newThisYearAt(value, today);
const hasFlag = (company: Parameters<typeof hasFlagAt>[0], flag: Parameters<typeof hasFlagAt>[1]) => hasFlagAt(company, flag, today);
const filterFacetCompanies = (companies: Parameters<typeof filterFacetCompaniesAt>[0], opts: Parameters<typeof filterFacetCompaniesAt>[1]) => filterFacetCompaniesAt(companies, { ...opts, today });

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

assert.equal(statusOf(rows[0]), "unknown");
assert.equal(statusOf({ ...rows[0], operatingStatus: "active" }), "active");
assert.equal(statusOf(rows[1]), "closed");
assert.equal(statusOf(rows[2]), "acquired");
assert.equal(statusOf({ ...rows[2], operatingStatus: null }), "unknown");

assert.equal(FLAG_LABEL.new, "Founded this year");
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
assert.equal(directoryCardSubtitle({ school: "Georgetown", stage: "Series C", signalLabel: "Acquisition" }), "Georgetown · Series C · Acquisition signal");
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
const sectorMemberships = data.cards.reduce((sum, card) => sum + Math.max(1, sectorIdsOf(card).length), 0);
assert.equal(bucketSum(sectorBuckets(data.cards)), sectorMemberships);
for (const bucket of sectorBuckets(data.cards)) {
  assert.equal(bucket.count, filterFacetCompanies(data.cards, bucket.id === NOT_ON_RECORD ? { sectorMissing: true } : { sector: bucket.id }).length);
}
assert.equal(data.cards.length, countCandidateProjects());
const sectorMissing = sectorBuckets(data.cards).find((b) => b.id === NOT_ON_RECORD)?.count ?? 0;
assert.ok(sectorMissing > 0);
const namedSector = sectorBuckets(data.cards).filter((b) => b.id !== NOT_ON_RECORD).reduce((s, b) => s + b.count, 0);
assert.ok(namedSector >= 700, `expected broader sector coverage, got ${namedSector}`);
const pack = sectorPills(data.cards, 10);
assert.equal(bucketSum(pack.visible.filter((b) => b.id !== NOT_ON_RECORD)) + pack.moreCount + (pack.visible.find((b) => b.id === NOT_ON_RECORD)?.count ?? 0), sectorMemberships);
const newCount = data.cards.filter((c) => hasFlag(c, "new")).length;
const activeCount = data.cards.filter((c) => hasFlag(c, "signaled")).length;
assert.ok(newCount !== activeCount, `flags must differ: new=${newCount} active=${activeCount}`);
assert.equal(newCount, data.cards.filter((c) => c.foundedYear === 2026).length);
assert.ok(activeCount < 50, `active this month should be a tight 30d window, got ${activeCount}`);
const withLogo = data.cards.filter((c) => c.logoUrl).length;
assert.equal(withLogo + data.cards.filter((c) => !c.logoUrl).length, data.cards.length);
const surface = sampleSurfaceCounts(data.cards, [{ id: "a" }, { id: "b" }]);
assert.equal(surface.companies, data.cards.length);
assert.equal(surface.campusesOnMap, 2);
assert.equal(surface.foundersListed, data.cards.reduce((s, c) => s + (c.founders?.length ?? 0), 0));
assert.ok(surface.foundersListed > 0);

const active = data.cards.filter((c) => statusOf(c) === "active").length;
const acquired = data.cards.filter((c) => statusOf(c) === "acquired").length;
const closed = data.cards.filter((c) => statusOf(c) === "closed").length;
const unknown = data.cards.filter((c) => statusOf(c) === "unknown").length;
assert.equal(active + acquired + closed + unknown, data.cards.length);

for (const card of data.cards.slice(0, 50)) {
  const sub = directoryCardSubtitle(card);
  assert.ok(!sub.toLowerCase().includes("on record"), `placeholder subtitle on ${card.name}`);
  assert.ok(!sub.includes("SIGNAL S"), `truncated label on ${card.name}`);
}

console.log("sample-facets tests ok", { total: data.cards.length, yearsMissing: foundedYearBuckets(data.cards).find((b) => b.id === NOT_ON_RECORD)?.count, hqMissing: hqRegionBuckets(data.cards).find((b) => b.id === NOT_ON_RECORD)?.count });

// Search the same stored fields on initial pages, continued pages, and charts.
const searchable = [{ ...rows[0], name: "Relay", description: "Precision agriculture robots", school: "Cornell", sector: "Food/ag", founders: ["Ada Lovelace"] }];
for (const query of ["Relay", "agriculture", "Cornell", "Food/ag", "Ada Lovelace"]) {
  assert.equal(filterFacetCompanies(searchable, { query }).length, 1, query);
}
assert.equal(filterFacetCompanies(searchable, { query: "Cornell robots", stage: "Seed", sector: "ai" }).length, 1);
assert.equal(filterFacetCompanies(searchable, { query: "Cornell", stage: "Series A" }).length, 0);
