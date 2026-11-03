import assert from "node:assert/strict";
import { companyLocations } from "./company-locations";
import { getDb } from "../db/client";
import officeRecords from "@/data/company-office-locations.json";
const result = companyLocations();
const ids = result.cities.flatMap(c => c.companies.map(co => co.id));
assert.equal(ids.length, new Set(ids).size);
assert.equal(result.mapped + result.unmapped, result.total);
assert.equal(result.mapped, ids.length);
assert.equal(result.precision, "mixed");
assert.equal(result.addressMapped, result.cities.flatMap(c=>c.companies).filter(c=>c.office).length);
assert.equal(result.addressMapped, officeRecords.locations.length, "Every reviewed address must resolve to its existing company and HQ city");
assert.equal(new Set(officeRecords.locations.map(r=>r.projectId)).size, officeRecords.locations.length);
for (const record of officeRecords.locations) {
  assert(record.excerpt.trim().length>10, "Every address needs company-published evidence");
  assert(record.coordinateMethod.includes("address point"), "Coordinates must be address points, not city geocodes");
  const co=result.cities.flatMap(c=>c.companies).find(c=>c.id===record.projectId);
  assert.deepEqual(co?.office?.coordinates, [record.longitude,record.latitude]);
}
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
