import assert from "node:assert/strict";
import fs from "node:fs";
import { CAMPUSES } from "./campuses";
import { hasPhrase, matchPhrases, normHotspotName, ORG_ALIAS_PHRASES } from "./hotspot-model";
import { SOURCE_CATALOGUE } from "./source-quality";
import { membershipDirectory, PROGRAM_DIRECTORY, PROGRAM_SIGNAL_TYPES, PROGRAM_SOURCE_ID, programTierLine, isProgramMatchStatus, isProgramSignalType } from "./program-signals";

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

const houses = JSON.parse(fs.readFileSync("data/imports/founder-houses.json", "utf8")) as {
  people: (typeof residencies.people)[number][];
};
const houseKeys = new Set<string>();
for (const person of houses.people) {
  const key = `${person.program}\0${person.name}\0${person.sourceUrl}`;
  assert.equal(houseKeys.has(key), false, person.name);
  houseKeys.add(key);
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
}
assert.ok(matchPhrases("Yale Hacker House").includes("yale hacker house"));
assert.ok(matchPhrases("Farmhouse").includes("farmhouse"));
assert.ok(matchPhrases("Georgia Tech Hacker House").includes("georgia tech hacker house"));
assert.ok(matchPhrases("Rice Residency").includes("rice residency"));
assert.ok(matchPhrases("FoundHer House").includes("foundher house"));
assert.ok(matchPhrases("Playa House").includes("playa house"));
assert.ok(matchPhrases("Harvard St. Commons").includes("harvard st commons"));
assert.ok(matchPhrases("Frontier Tower").includes("frontier tower"));
assert.ok(matchPhrases("HF0 residency").includes("hf0 residency"));
assert.ok(matchPhrases("AGI House SF").includes("agi house sf") || matchPhrases("AGI House").includes("agi house"));
assert.equal(hasPhrase(normHotspotName("role Yale Hacker House"), "yale hacker house"), true);
assert.equal(hasPhrase(normHotspotName("role Farmhouse"), "farmhouse"), true);
assert.equal(hasPhrase(normHotspotName("role Georgia Tech Hacker House"), "georgia tech hacker house"), true);
assert.equal(hasPhrase(normHotspotName("role Rice Residency"), "rice residency"), true);
assert.equal(hasPhrase(normHotspotName("role FoundHer House"), "foundher house"), true);
assert.equal(hasPhrase(normHotspotName("role Playa House"), "playa house"), true);
assert.equal(hasPhrase(normHotspotName("role Harvard St. Commons"), "harvard st commons"), true);
assert.equal(hasPhrase(normHotspotName("role Frontier Tower"), "frontier tower"), true);
assert.equal(hasPhrase(normHotspotName("role HF0 residency"), "hf0 residency"), true);
assert.equal(hasPhrase(normHotspotName("role AGI House"), "agi house"), true);

assert.equal(PROGRAM_DIRECTORY.z_fellows.tier, "S");
assert.equal(PROGRAM_DIRECTORY.emergent_ventures.tier, "S");
assert.equal(PROGRAM_DIRECTORY.hf0.tier, "S");
assert.equal(PROGRAM_DIRECTORY.south_park_commons.tier, "S");
assert.equal(PROGRAM_DIRECTORY.the_residency.tier, "A");
assert.equal(PROGRAM_DIRECTORY.agi_house.tier, "S");
assert.match(PROGRAM_DIRECTORY.agi_house.rationale, /Owner override/);
assert.equal(PROGRAM_DIRECTORY.contrary_venture_partners.tier, "A");
assert.equal(PROGRAM_DIRECTORY.medici_1517.tier, "A");
assert.equal(PROGRAM_DIRECTORY.frontier_tower.tier, "C");
assert.equal(PROGRAM_DIRECTORY.rice_residency.tier, "C");
assert.equal(membershipDirectory("south_park_commons", "South Park Commons").tier, "A");
assert.equal(membershipDirectory("south_park_commons", "South Park Commons Founder Fellow").tier, "S");
assert.equal(membershipDirectory("south_park_commons", "South Park Commons W'24").tier, "S");
for (const program of PROGRAM_SIGNAL_TYPES) {
  const entry = SOURCE_CATALOGUE.find((row) => row.dbSourceId === PROGRAM_SOURCE_ID[program]);
  assert.ok(entry, program);
  assert.equal(entry?.founderScoutTier, PROGRAM_DIRECTORY[program].tier, program);
  assert.equal(entry?.startupScoutTier, PROGRAM_DIRECTORY[program].tier, program);
  assert.equal(entry?.tierRationale, programTierLine(PROGRAM_DIRECTORY[program]), program);
}

console.log(`program-signals tests ok (${file.people.length} founders-inc/spc, ${residencies.people.length} residencies, ${houses.people.length} houses)`);
