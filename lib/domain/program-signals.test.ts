import assert from "node:assert/strict";
import fs from "node:fs";
import { CAMPUSES } from "./campuses";
import { hasPhrase, matchPhrases, normHotspotName, ORG_ALIAS_PHRASES } from "./hotspot-model";
import { isProgramMatchStatus, isProgramSignalType } from "./program-signals";

const campusIds = new Set(CAMPUSES.map((campus) => campus.id));
const file = JSON.parse(fs.readFileSync("data/imports/founders-inc-spc.json", "utf8")) as {
  people: {
    name: string;
    program: string;
    matchStatus: string;
    label: string;
    sourceUrl: string;
    excerpt: string;
    universityId: string | null;
    keepWithoutCampus: boolean;
    enrollmentStatus: string;
    enrollmentBasis: string;
    company: { name: string; website: string | null } | null;
    linkedin: string | null;
  }[];
};

assert.ok(file.people.length > 0);
const names = new Set<string>();
for (const person of file.people) {
  assert.equal(names.has(person.name), false, person.name);
  names.add(person.name);
  assert.ok(isProgramSignalType(person.program), person.name);
  assert.ok(isProgramMatchStatus(person.matchStatus), person.name);
  assert.match(person.sourceUrl, /^https:\/\//, person.name);
  assert.ok(person.excerpt.trim().length > 20, person.name);
  assert.ok(person.label.trim().length > 0, person.name);
  if (person.keepWithoutCampus) assert.equal(person.universityId, null, person.name);
  else assert.ok(person.universityId && campusIds.has(person.universityId), `${person.name} ${person.universityId}`);
  assert.ok(["current_student", "recent_grad", "older_alumni"].includes(person.enrollmentStatus), person.name);
  assert.ok(person.enrollmentBasis === "verified" || person.enrollmentBasis === "inferred", person.name);
  if (person.company?.website) assert.match(person.company.website, /^https?:\/\//, person.company.name);
  if (person.linkedin) assert.match(person.linkedin, /linkedin\.com\/in\//i, person.name);
}

assert.ok(ORG_ALIAS_PHRASES["founders inc"]?.includes("founders inc"));
assert.equal(hasPhrase(normHotspotName("role Founders Inc"), "founders inc"), true);
assert.ok(matchPhrases("South Park Commons").includes("south park commons"));

const residencies = JSON.parse(fs.readFileSync("data/imports/founder-residencies.json", "utf8")) as {
  people: {
    name: string;
    program: string;
    matchStatus: string;
    label: string;
    sourceUrl: string;
    excerpt: string;
    universityId: string | null;
    keepWithoutCampus: boolean;
    enrollmentStatus: string | null;
    enrollmentBasis: string | null;
    company: { name: string; website: string | null } | null;
    linkedin: string | null;
  }[];
};
const residencyKeys = new Set<string>();
for (const person of residencies.people) {
  const key = `${person.program}\0${person.name}\0${person.sourceUrl}`;
  assert.equal(residencyKeys.has(key), false, person.name);
  residencyKeys.add(key);
  assert.ok(isProgramSignalType(person.program), person.name);
  assert.ok(isProgramMatchStatus(person.matchStatus), person.name);
  assert.match(person.sourceUrl, /^https:\/\//, person.name);
  assert.ok(person.excerpt.trim().length > 20, person.name);
  assert.ok(person.label.trim().length > 0, person.name);
  if (person.keepWithoutCampus) assert.equal(person.universityId, null, person.name);
  else assert.ok(person.universityId && campusIds.has(person.universityId), `${person.name} ${person.universityId}`);
  if (person.enrollmentStatus == null) assert.equal(person.enrollmentBasis, null, person.name);
  else {
    assert.ok(["current_student", "recent_grad", "older_alumni"].includes(person.enrollmentStatus), person.name);
    assert.ok(person.enrollmentBasis === "verified" || person.enrollmentBasis === "inferred", person.name);
  }
  if (person.company?.website) assert.match(person.company.website, /^https?:\/\//, person.company.name);
  if (person.linkedin) assert.match(person.linkedin, /linkedin\.com\/in\//i, person.name);
}
assert.ok(matchPhrases("Emergent Ventures").includes("emergent ventures"));
assert.ok(matchPhrases("Z Fellows").includes("z fellows"));
assert.equal(hasPhrase(normHotspotName("role Z Fellows"), "z fellows"), true);
assert.equal(hasPhrase(normHotspotName("role Kleiner Perkins Fellows"), "kleiner perkins fellows"), true);

console.log(`program-signals tests ok (${file.people.length} founders-inc/spc, ${residencies.people.length} residencies)`);
