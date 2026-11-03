import assert from "node:assert/strict";
import { companyLocations } from "./company-locations";
import { getDb } from "../db/client";
const result = companyLocations();
const ids = result.cities.flatMap(c => c.companies.map(co => co.id));
assert.equal(ids.length, new Set(ids).size);
assert.equal(result.mapped + result.unmapped, result.total);
assert.equal(result.mapped, ids.length);
assert.equal(result.precision, "city");
for (const city of result.cities) {
  assert(city.coordinates[0] >= -180 && city.coordinates[0] <= 180);
  assert(city.coordinates[1] >= -90 && city.coordinates[1] <= 90);
  assert(city.coordinateSource.startsWith("https://www.geonames.org/"));
  for (const co of city.companies) {
    assert(getDb().prepare("SELECT 1 FROM company_facts WHERE project_id=? AND fact_key='hq' AND value_text=? AND source_url=?").get(co.id, co.hq, co.sourceUrl));
  }
}
assert(result.cities.find(c => c.city === "San Francisco")?.companies.some(c => c.id === "proj_9GUOmdEYxbuH"));
assert(result.unmapped > 0, "Unknown HQs must remain explicitly unmapped");
console.log(`PASS: ${result.mapped.toLocaleString("en-US")} sourced city HQs, ${result.cities.length} city groups, ${result.unmapped} explicitly unmapped; no campus fallback or scattered office pins`);
