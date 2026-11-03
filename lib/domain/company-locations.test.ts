import assert from "node:assert/strict";
import { companyLocations } from "./company-locations";
import { getDb } from "../db/client";
const result = companyLocations();
const ids = result.cities.flatMap(c => c.companies.map(co => co.id));
assert.equal(ids.length, new Set(ids).size);
assert.equal(result.mapped + result.unmapped, result.total);
assert.equal(result.mapped, ids.length);
assert.equal(result.precision, "mixed");
assert.equal(result.addressMapped, result.cities.flatMap(c=>c.companies).filter(c=>c.office).length);
for (const city of result.cities) {
  assert(city.coordinates[0] >= -180 && city.coordinates[0] <= 180);
  assert(city.coordinates[1] >= -90 && city.coordinates[1] <= 90);
  assert(city.coordinateSource.startsWith("https://www.geonames.org/"));
  for (const co of city.companies) {
    assert(getDb().prepare("SELECT 1 FROM company_facts WHERE project_id=? AND fact_key='hq' AND value_text=? AND source_url=?").get(co.id, co.hq, co.sourceUrl));
    if(co.office){
      assert(co.office.sourceUrl.startsWith("https://"));
      assert(co.office.coordinateSource.startsWith("https://"));
      assert(co.office.address.length>10);
      assert(co.office.coordinates[0]>=-180 && co.office.coordinates[0]<=180);
      assert(co.office.coordinates[1]>=-90 && co.office.coordinates[1]<=90);
      assert.notDeepEqual(co.office.coordinates,city.coordinates,"Office coordinates must not be the city center");
    }
  }
}
assert(result.cities.find(c => c.city === "San Francisco")?.companies.some(c => c.id === "proj_9GUOmdEYxbuH"));
const sim=result.cities.flatMap(c=>c.companies).find(c=>c.id==="proj_9GUOmdEYxbuH");
assert.equal(sim?.office?.address,"80 Langton Street, San Francisco, CA 94103, USA");
assert.equal(sim?.office?.coordinates[0],-122.40886930385557);
assert(result.unmapped > 0, "Unknown HQs must remain explicitly unmapped");
console.log(`PASS: ${result.mapped.toLocaleString("en-US")} mapped HQs, ${result.cities.length} city groups, ${result.addressMapped} sourced address points, ${result.unmapped} explicitly unmapped; no campus fallback or scattered office pins`);
