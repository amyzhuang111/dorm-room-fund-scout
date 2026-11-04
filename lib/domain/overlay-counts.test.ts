import assert from "node:assert/strict";
import { statusOf, type FacetCompany } from "./sample-facets";
import {
  CAMPUS_COUNT_UNIT,
  buildOverlayCounts,
  overlayCampusRows,
  overlayStatusRows,
} from "./overlay-counts";

const companies: FacetCompany[] = [
  { id: "1", name: "A", schoolId: "univ_penn", school: "University of Pennsylvania", signals: 1, operatingStatus: null, signalKind: null },
  { id: "2", name: "B", schoolId: "univ_penn", school: "University of Pennsylvania", signals: 1, operatingStatus: null, signalKind: "acquisition" },
  { id: "3", name: "C", schoolId: "univ_stanford", school: "Stanford", signals: 1, operatingStatus: "acquired", signalKind: null },
  { id: "4", name: "D", schoolId: "univ_mit", school: "MIT", signals: 0, operatingStatus: "dead", signalKind: null },
  { id: "5", name: "E", schoolId: "univ_penn", school: "University of Pennsylvania", signals: 2, operatingStatus: null, sectorId: "fintech", sector: "Fintech" },
];

// An acquisition signal is not an acquired company. Status follows operatingStatus.
assert.equal(statusOf(companies[1]!), "active");
const status = overlayStatusRows(companies);
const byId = Object.fromEntries(status.map((r) => [r.id, r.count]));
assert.equal(byId.active, 3); // A + B (signal only) + E
assert.equal(byId.acquired, 1); // C
assert.equal(byId.closed, 1);

const rawActive = companies.filter((c) => c.operatingStatus !== "acquired" && c.operatingStatus !== "dead").length;
assert.equal(rawActive, 3);
assert.equal(byId.active, rawActive);

const campuses = [
  { id: "univ_penn", name: "University of Pennsylvania", shortLabel: "Penn", founders: 758 },
  { id: "univ_stanford", name: "Stanford University", shortLabel: "Stanford", founders: 300 },
  { id: "univ_mit", name: "MIT", shortLabel: "MIT", founders: 238 },
];
const campusRows = overlayCampusRows(campuses);
assert.equal(campusRows[0]!.id, "univ_penn");
assert.equal(campusRows[0]!.count, 758); // founders, not company count (3)
assert.equal(CAMPUS_COUNT_UNIT, "founders");

const built = buildOverlayCounts(companies, campuses);
assert.equal(built.campusUnit, "founders");
assert.equal(built.campus[0]!.count, 758);
assert.deepEqual(
  built.status.map((r) => r.count),
  status.map((r) => r.count),
);

console.log("overlay-counts tests ok");
