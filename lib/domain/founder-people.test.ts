import assert from "node:assert/strict";
import { filterFounderPeople } from "./founder-people";
import type { FounderTableRow } from "./founder-table";

function person(partial: Partial<FounderTableRow> & Pick<FounderTableRow, "id" | "name">): FounderTableRow {
  return {
    tier: null,
    tierBasis: null,
    campus: null,
    campusId: null,
    campusIds: [],
    campusSlug: null,
    company: null,
    companyId: null,
    year: null,
    signal: null,
    signalType: null,
    signalAt: null,
    score: null,
    verified: false,
    ...partial,
  };
}

const rows = [
  person({ id: "a", name: "Ada Lovelace", campus: "Penn", campusId: "univ_penn", campusIds: ["univ_penn"], company: "Analytical" }),
  person({ id: "b", name: "Project Gallery", campus: null, company: null }),
];

assert.deepEqual(filterFounderPeople(rows, { text: "ada" }).map((row) => row.id), ["a"]);
assert.deepEqual(filterFounderPeople(rows, { campus: "univ_penn" }).map((row) => row.id), ["a"]);
assert.equal(filterFounderPeople(rows, { text: "gallery" })[0]?.name, "Project Gallery");
assert.equal(filterFounderPeople(rows, {}).length, 2);

console.log("founder people tests ok");
