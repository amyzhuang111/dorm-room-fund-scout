import assert from "node:assert/strict";
import { EMPTY_STARTUP_FILTERS, filterMapStartups, mapStartupPool } from "./map-startups";
import { filterFacetCompanies, sectorBuckets, type FacetCompany } from "./sample-facets";
import { classifyDescription, matchesSector, resolveCompanySectors } from "./sectors";

const company: FacetCompany = {
  id: "space", name: "Orbital AI", schoolId: "penn", signals: 1,
  sectorId: "ai_agents", sector: "AI agents/apps", sectorIds: ["ai_agents", "aerospace", "aerospace"],
  primaryProgram: "SkyDeck", programs: ["SkyDeck", "YC"], foundedYear: 2025, stage: "Seed", signalKind: "funding",
};
const missing: FacetCompany = { id: "unknown", name: "Unknown", schoolId: null, signals: 0 };
const legacy: FacetCompany = { ...missing, id: "legacy", name: "Legacy", sectorId: "aerospace", sector: "Aerospace" };
const rows = [company, missing, legacy];
const aerospace = { ...EMPTY_STARTUP_FILTERS, sector: "aerospace" };

assert.deepEqual(filterMapStartups(rows, aerospace).map(c => c.id), ["space", "legacy"]);
assert.deepEqual(filterFacetCompanies(rows, { sector: "aerospace" }).map(c => c.id), ["space", "legacy"]);
assert.equal(sectorBuckets(rows).find(row => row.id === "aerospace")?.count, 2, "duplicate tags must not duplicate startups");
assert.equal(matchesSector(company, null), false);
assert.deepEqual(filterMapStartups(rows, { ...aerospace, sector: "__missing" }).map(c => c.id), ["unknown"]);
assert.equal(filterMapStartups(rows, { ...aerospace, program: "YC", year: "2025", stage: "Seed", signal: "funding" }).length, 1);
assert.equal(filterMapStartups(rows, { ...aerospace, stage: "Series A" }).length, 0);
assert.deepEqual(mapStartupPool(rows, "Aerospace Orbital", "penn").map(c => c.id), ["space"]);
assert.deepEqual(mapStartupPool(rows, "", "missing").map(c => c.id), ["unknown", "legacy"]);
assert.equal(mapStartupPool(rows, "", "stanford").length, 0);
assert.equal(filterMapStartups(rows, EMPTY_STARTUP_FILTERS).length, rows.length);

// Matches beyond the first page must count and remain reachable by Show more.
const many = Array.from({ length: 29 }, (_, i) => ({ ...company, id: `space-${i}` }));
const all = filterMapStartups(many, aerospace);
assert.equal(all.length, 29);
assert.deepEqual([...all.slice(0, 12), ...all.slice(12, 24), ...all.slice(24)].map(c => c.id), many.map(c => c.id));

// Regressions from real omitted records: secondary tag, plural, short copy,
// and relevant product information after the card's display truncation.
for (const text of ["AI spacecraft operators that live onboard the vehicle", "Reusable Satellites", "Aviation Instrument Technologies designs aircraft instruments", "Solid rocket propellant company"]) {
  assert.ok(classifyDescription(text).some(hit => hit.tag === "aerospace"), text);
}
const longDescription = "We build AI-powered systems that monitor operations and give teams reliable information to improve performance while maintaining quality across their business. Our platform controls satellite navigation.";
assert.deepEqual(resolveCompanySectors(["ai_agents"], longDescription, "Example"), ["ai_agents", "aerospace"]);
assert.deepEqual(resolveCompanySectors(["healthtech", "ai_agents"], null, "Example"), ["healthtech", "ai_agents"]);
assert.deepEqual(classifyDescription("Product/sector not yet researched for this listing."), []);
assert.deepEqual(classifyDescription("Listed on Berkeley SkyDeck's public companies directory."), []);
assert.deepEqual(classifyDescription("Tools for teams in a shared office space.", "Aerospace"), []);
console.log("map startup filters: secondary sectors, full results, combined filters and aerospace regressions passed");
