import assert from "node:assert/strict";
import { attendanceSpan, sameSchoolCofounderHits, scoreBonus, spansOverlap, type CofounderAttendance } from "./same-school";

const pair: CofounderAttendance[] = [
  { projectId: "proj_a", personId: "p1", universityId: "univ_penn", gradYear: 2026, startYear: null, endYear: null },
  { projectId: "proj_a", personId: "p2", universityId: "univ_penn", gradYear: 2027, startYear: null, endYear: null },
];
const hit = sameSchoolCofounderHits(pair);
assert.equal(hit.length, 1);
assert.deepEqual(hit[0].personIds, ["p1", "p2"]);

const apart: CofounderAttendance[] = [
  { projectId: "proj_b", personId: "p1", universityId: "univ_penn", gradYear: 2016, startYear: null, endYear: null },
  { projectId: "proj_b", personId: "p2", universityId: "univ_penn", gradYear: 2026, startYear: null, endYear: null },
];
assert.equal(sameSchoolCofounderHits(apart).length, 0);

const differentSchools: CofounderAttendance[] = [
  { projectId: "proj_c", personId: "p1", universityId: "univ_penn", gradYear: 2026, startYear: null, endYear: null },
  { projectId: "proj_c", personId: "p2", universityId: "univ_mit", gradYear: 2026, startYear: null, endYear: null },
];
assert.equal(sameSchoolCofounderHits(differentSchools).length, 0);

const undated: CofounderAttendance[] = [
  { projectId: "proj_d", personId: "p1", universityId: "univ_penn", gradYear: null, startYear: null, endYear: null },
  { projectId: "proj_d", personId: "p2", universityId: "univ_penn", gradYear: 2026, startYear: null, endYear: null },
];
assert.equal(sameSchoolCofounderHits(undated).length, 0);

const dated: CofounderAttendance[] = [
  { projectId: "proj_e", personId: "p1", universityId: "univ_stanford", gradYear: null, startYear: 2022, endYear: 2026 },
  { projectId: "proj_e", personId: "p2", universityId: "univ_stanford", gradYear: null, startYear: 2025, endYear: 2029 },
];
assert.equal(sameSchoolCofounderHits(dated).length, 1);
assert.equal(spansOverlap(attendanceSpan(dated[0])!, attendanceSpan(dated[1])!), true);

const boosted = scoreBonus(60, 4, true);
assert.equal(boosted.score, 64);
assert.equal(boosted.applied, 4);
assert.deepEqual(scoreBonus(null, 4, true), { score: null, applied: 0 });
assert.deepEqual(scoreBonus(99, 4, true), { score: 100, applied: 1 });
assert.deepEqual(scoreBonus(70, 2, false), { score: 70, applied: 0 });

console.log("same-school tests ok");
