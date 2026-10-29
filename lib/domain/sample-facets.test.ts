import assert from "node:assert/strict";
import { filterFacetCompanies, recencyOf } from "./sample-facets";

assert.equal(recencyOf("2026-10-01"), "month");
assert.equal(recencyOf("2026-05-00"), "year");
assert.equal(recencyOf("2024-01-01"), "older");
assert.equal(recencyOf(null), "none");

const rows = [
  { id: "a", name: "A", schoolId: "u1", signals: 1, sectorId: "ai", stage: "Seed", signalKind: "funding", latestSignalAt: "2026-10-01" },
  { id: "b", name: "B", schoolId: "u2", signals: 2, sectorId: "health", stage: "Series A", signalKind: "launch", latestSignalAt: "2024-01-01" },
];
assert.equal(filterFacetCompanies(rows, { sector: "ai" }).length, 1);
assert.equal(filterFacetCompanies(rows, { recency: "older" }).length, 1);
console.log("sample-facets tests ok");
