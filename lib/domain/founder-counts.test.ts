import assert from "node:assert/strict";
import { listFounders, listUniversities } from "./queries";

const universities = listUniversities();
assert.ok(universities.length > 0);
for (const university of universities) {
  const counted = listFounders({ universityId: university.id }).length;
  assert.equal(university.founderCount, counted, university.id);
}
console.log(`founder counts match for ${universities.length} campuses`);
