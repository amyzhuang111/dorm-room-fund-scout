import assert from "node:assert/strict";
import { filterFacetCompanies, hasFlag, recencyOf, statusOf } from "./sample-facets";

assert.equal(recencyOf("2026-10-01"), "month");
assert.equal(recencyOf("2026-05-00"), "year");
assert.equal(recencyOf("2024-01-01"), "older");
assert.equal(recencyOf(null), "none");

const rows = [
  { id: "a", name: "A", schoolId: "u1", signals: 1, sectorId: "ai", stage: "Seed", signalKind: "funding", latestSignalAt: "2026-10-01", foundedYear: 2026, logoUrl: "https://example.com/a.png", hqRegion: "San Francisco", primaryProgram: "Y Combinator" },
  { id: "b", name: "B", schoolId: "u2", signals: 2, sectorId: "health", stage: "Series A", signalKind: "launch", latestSignalAt: "2024-01-01", foundedYear: 2023, operatingStatus: "dead" as const, hqRegion: "New York" },
  { id: "c", name: "C", schoolId: "u1", signals: 0, sectorId: "ai", signalKind: "acquisition", latestSignalAt: "2025-01-01", foundedYear: 2025 },
];

assert.equal(statusOf(rows[0]), "active");
assert.equal(statusOf(rows[1]), "closed");
assert.equal(statusOf(rows[2]), "acquired");
assert.equal(hasFlag(rows[0], "new"), true);
assert.equal(hasFlag(rows[0], "funded"), true);
assert.equal(hasFlag(rows[0], "logo"), true);
assert.equal(hasFlag(rows[1], "new"), false);
assert.equal(filterFacetCompanies(rows, { sector: "ai" }).length, 2);
assert.equal(filterFacetCompanies(rows, { recency: "older" }).length, 2);
assert.equal(filterFacetCompanies(rows, { foundedYear: 2026 }).length, 1);
assert.equal(filterFacetCompanies(rows, { hqRegion: "San Francisco" }).length, 1);
assert.equal(filterFacetCompanies(rows, { status: "closed" }).length, 1);
assert.equal(filterFacetCompanies(rows, { flag: "new" }).length, 2);
console.log("sample-facets tests ok");
