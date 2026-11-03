import assert from "node:assert/strict";
import { officeMapPoints } from "./office-map-points";
import records from "@/data/company-office-locations.json";
const cities = [...new Set(records.locations.map(r => r.cityId))].map(id => ({ id, companies: records.locations.filter(r => r.cityId === id).map(r => ({ id: r.projectId, name: r.company, office: { coordinates: [r.longitude, r.latitude] as [number, number] } })) }));
const points = officeMapPoints(cities);
const ids = points.features.flatMap(f => JSON.parse(f.properties!.companyIds) as string[]);
assert.deepEqual([...ids].sort(), records.locations.map(r => r.projectId).sort(), "Every company remains selectable at its building");
for (const point of points.features) {
  const members: string[] = JSON.parse(point.properties!.companyIds);
  for (const id of members) {
    const record = records.locations.find(r => r.projectId === id)!;
    assert.deepEqual(point.geometry.coordinates, [record.longitude, record.latitude], "Never scatter co-located companies");
  }
}
const shared = points.features.find(f => JSON.parse(f.properties!.companyIds).includes("proj_tC50qyBPY8DZ"));
assert(shared && JSON.parse(shared.properties!.companyIds).includes("proj_zrJA2pF1ffO6"), "Emdash and SyntheticFi share a building, not an office suite");
assert.equal(officeMapPoints([{ id: "city", companies: [{ id: "unknown", name: "Unknown" }] }]).features.length, 0, "No point without address evidence");
console.log(`PASS: ${ids.length} companies at ${points.features.length} sourced building points, no coordinate jitter`);
