import assert from "node:assert/strict";
import { campusRecordHref, topCampusLeads } from "./campus-record";

const leads = topCampusLeads([
  { id: "proj_b", name: "Bravo", schoolId: "univ_penn", signals: 2 },
  { id: "proj_a", name: "Alpha", schoolId: "univ_penn", signals: 4 },
  { id: "proj_c", name: "Cedar", schoolId: "univ_penn", signals: 4 },
  { id: "proj_d", name: "Delta", schoolId: null, signals: 9 },
  { id: "proj_e", name: "  ", schoolId: "univ_mit", signals: 3 },
]);

assert.equal(leads.length, 1);
assert.deepEqual(leads[0], { campusId: "univ_penn", companyId: "proj_a", companyName: "Alpha" });

const penn = leads[0];
assert.equal(
  campusRecordHref("univ_penn", penn, "penn"),
  "/startup/proj_a?from=map&campus=univ_penn",
);
assert.equal(campusRecordHref("univ_mit", undefined, "mit"), "/campuses/mit");
assert.equal(campusRecordHref("univ_other", undefined, null), "/campuses");

console.log("campus record tests ok");
