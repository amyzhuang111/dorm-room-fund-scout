import assert from "node:assert/strict";
import { companyLocations, resolveCompanyLocations } from "./company-locations";
import { getDb } from "../db/client";
import officeRecords from "@/data/company-office-locations.json";
import addressReview from "@/reviews/r59-company-address-review.json";
import { loadDirectory } from "./directory";
import cityCenters from "@/data/company-city-centers.json";

// A business address is independently sourced evidence, including when the HQ is unknown
// or another city. It must not fabricate a headquarters or introduce a hidden company.
const officeFixture = officeRecords.locations[0];
const fixture = resolveCompanyLocations(
  ["no-hq", "different-hq", "unknown", "invalid-address"],
  [{ project_id: "different-hq", value_text: "New York, NY", source_url: "https://example.com/hq" }],
  cityCenters.cities,
  [
    { ...officeFixture, projectId: "no-hq" },
    { ...officeFixture, projectId: "different-hq" },
    { ...officeFixture, projectId: "hidden" },
    { ...officeFixture, projectId: "invalid-address", latitude: 999 },
  ],
);
assert.equal(fixture.mapped, 2);
assert.equal(fixture.addressMapped, 2);
assert.equal(fixture.unmapped, 2);
const fixtureCompanies = fixture.cities.flatMap(c => c.companies);
assert.equal(fixtureCompanies.find(c => c.id === "no-hq")?.hq, null);
assert.equal(fixtureCompanies.find(c => c.id === "no-hq")?.sourceUrl, officeFixture.sourceUrl);
assert.equal(fixtureCompanies.find(c => c.id === "different-hq")?.hq, "New York, NY");
assert.equal(fixtureCompanies.find(c => c.id === "different-hq")?.sourceUrl, "https://example.com/hq");
assert.equal(fixture.cities[0].id, officeFixture.cityId);

const result = companyLocations();
// Keep held or unreviewed candidates out of the map, and make review coverage auditable.
const directoryIds = loadDirectory().cards.map(c => c.id).sort();
assert.deepEqual(addressReview.records.map(r => r.projectId).sort(), directoryIds);
const publishedIds = officeRecords.locations.map(r => r.projectId).sort();
assert.deepEqual(addressReview.records.filter(r => r.status === "published_business_address").map(r => r.projectId).sort(), publishedIds);
for (const [status, count] of Object.entries(addressReview.counts)) {
  assert.equal(addressReview.records.filter(r => r.status === status).length, count);
}
for (const record of addressReview.records) {
  assert(record.reason.trim().length > 0);
  assert(!("latitude" in record) && !("longitude" in record) && !("address" in record), "The review inventory must not expose raw address candidates");
}
const ids = result.cities.flatMap(c => c.companies.map(co => co.id));
assert.equal(ids.length, new Set(ids).size);
assert.equal(result.mapped + result.unmapped, result.total);
assert.equal(result.mapped, ids.length);
assert.equal(result.precision, "mixed");
assert.equal(result.addressMapped, result.cities.flatMap(c=>c.companies).filter(c=>c.office).length);
assert.equal(result.addressMapped, officeRecords.locations.length, "Every reviewed address must resolve to its existing company and sourced business city");
assert.equal(new Set(officeRecords.locations.map(r=>r.projectId)).size, officeRecords.locations.length);
for (const record of officeRecords.locations) {
  assert(record.excerpt.trim().length>10, "Every address needs individually reviewed primary business-location evidence");
  assert(record.coordinateMethod.includes("address point"), "Coordinates must be address/building points, not city geocodes");
  const co=result.cities.flatMap(c=>c.companies).find(c=>c.id===record.projectId);
  assert.deepEqual(co?.office?.coordinates, [record.longitude,record.latitude]);
}
for (const city of result.cities) {
  assert(city.coordinates[0] >= -180 && city.coordinates[0] <= 180);
  assert(city.coordinates[1] >= -90 && city.coordinates[1] <= 90);
  assert(city.coordinateSource.startsWith("https://www.geonames.org/"));
  for (const co of city.companies) {
    if (co.hq !== null) {
      assert(getDb().prepare("SELECT 1 FROM company_facts WHERE project_id=? AND fact_key='hq' AND value_text=? AND source_url=?").get(co.id, co.hq, co.sourceUrl));
    } else {
      assert(co.office, "An unknown HQ only maps when it has independently reviewed business address evidence");
      assert.equal(co.sourceUrl, co.office.sourceUrl);
    }
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
console.log(`PASS: ${result.mapped.toLocaleString("en-US")} mapped companies, ${result.cities.length} city groups, ${result.addressMapped} sourced address points, ${result.unmapped} explicitly unmapped; no fabricated HQs, campus fallback or scattered office pins`);
