import assert from "node:assert/strict";
import {
  applyVerifiedLinkedIn,
  evidenceNote,
  evidenceSourceUrl,
  isUnknownSchool,
  normalizeVerifiedLinkedIn,
  type VerifiedLinkedIn,
} from "./import-drf-linkedin-verified";

assert.equal(normalizeVerifiedLinkedIn("https://www.linkedin.com/in/cmcewen/"), "https://www.linkedin.com/in/cmcewen");
assert.equal(normalizeVerifiedLinkedIn("https://uk.linkedin.com/in/ben-okeefe?trk=public"), "https://www.linkedin.com/in/ben-okeefe");
assert.equal(normalizeVerifiedLinkedIn("https://www.linkedin.com/company/dorm-room-fund"), null);
assert.equal(isUnknownSchool("(school unknown)"), true);
assert.equal(isUnknownSchool("Stanford University"), false);

assert.equal(
  evidenceSourceUrl("DRF podcast gives LinkedIn URL (https://podcasts.apple.com/ch/podcast/office-hours-with-dorm-room-fund/id1494752850)"),
  "https://podcasts.apple.com/ch/podcast/office-hours-with-dorm-room-fund/id1494752850"
);
assert.equal(evidenceSourceUrl("own LinkedIn post about DRF"), null);
assert.ok(evidenceNote("Richard Clay", "Bowie State and DRF on profile").length >= 40);
assert.equal(
  evidenceNote("Connor McEwen", "DRF podcast gives LinkedIn URL (https://podcasts.apple.com/ch/podcast/office-hours-with-dorm-room-fund/id1494752850)"),
  "DRF podcast gives LinkedIn URL (https://podcasts.apple.com/ch/podcast/office-hours-with-dorm-room-fund/id1494752850)"
);

function row(id: string, name: string, school: string | null, linkedin = ""): Record<string, unknown> {
  return { id, name, ...(school ? { school_label: school } : {}), ...(linkedin ? { linkedin_url: linkedin } : {}) };
}

const alumni = [
  row("dra_ben_okeefe", "Ben O’Keefe", "Stanford University"),
  row("dra_vesal_yazdi", "Vesal Yazdi", null),
  row("dra_ada", "Ada Lovelace", "Stanford University"),
  row("dra_ada_2", "Ada Lovelace", "Stanford University"),
  row("dra_bea", "Bea Builder", "MIT"),
  row("dra_cole", "Cole Fairchild", "University of Pennsylvania", "https://www.linkedin.com/in/someone-else"),
];

const inputs: VerifiedLinkedIn[] = [
  { name: "Ben O'Keefe", school: "Stanford University", linkedin_url: "https://www.linkedin.com/in/ben-okeefe/", evidence: "DRF partner mentioned in recruiting post" },
  { name: "Vesal Yazdi", school: "(school unknown)", linkedin_url: "https://www.linkedin.com/in/vesalyazdi", evidence: "DRF article names Vesal Yazdi (https://wp.dormroomfund.com/inside-shield-ais-beginnings/)" },
  { name: "Ada Lovelace", school: "Stanford University", linkedin_url: "https://www.linkedin.com/in/ada-lovelace", evidence: "A public page names Ada Lovelace at Stanford and DRF." },
  { name: "Bea Builder", school: "Stanford University", linkedin_url: "https://www.linkedin.com/in/bea-builder", evidence: "A public page names Bea Builder." },
  { name: "Nobody Here", school: "Yale University", linkedin_url: "https://www.linkedin.com/in/nobody-here", evidence: "No alumni row uses this name and school." },
  { name: "Cole Fairchild", school: "University of Pennsylvania", linkedin_url: "https://www.linkedin.com/in/taken-slug", evidence: "Cole Fairchild's own LinkedIn post about DRF." },
  { name: "Twin One", school: "Princeton University", linkedin_url: "https://www.linkedin.com/in/same-slug", evidence: "First copy of a repeated slug in this import." },
  { name: "Twin Two", school: "Princeton University", linkedin_url: "https://www.linkedin.com/in/same-slug/", evidence: "Second copy of a repeated slug in this import." },
];

const taken = new Map<string, Set<string>>([["taken-slug", new Set(["person:person_other"])]]);
const first = applyVerifiedLinkedIn(alumni, inputs, taken, new Map([["dra_cole", "person_cole"]]));
assert.deepEqual(first.matched.map((item) => item.id), ["dra_ben_okeefe", "dra_vesal_yazdi"]);
assert.equal(first.matched[0].url, "https://www.linkedin.com/in/ben-okeefe");
assert.equal(first.matched[0].changed, true);
assert.equal(first.alumni.find((item) => item.id === "dra_ben_okeefe")?.linkedin_confidence, "confirmed");
assert.equal(first.alumni.find((item) => item.id === "dra_vesal_yazdi")?.linkedin_source_url, "https://wp.dormroomfund.com/inside-shield-ais-beginnings/");
assert.equal(first.alumni.find((item) => item.id === "dra_ada")?.linkedin_url, undefined);
assert.ok(first.skipped.some((item) => item.name === "Ada Lovelace" && item.reason.includes("more than one")));
assert.ok(first.skipped.some((item) => item.name === "Bea Builder" && item.reason.includes("school did not")));
assert.ok(first.skipped.some((item) => item.name === "Nobody Here"));
assert.ok(first.skipped.some((item) => item.name === "Cole Fairchild" && item.reason.includes("person:person_other")));
assert.equal(first.skipped.filter((item) => item.reason.includes("repeated")).length, 2);

const second = applyVerifiedLinkedIn(first.alumni, inputs, taken, new Map([["dra_cole", "person_cole"]]));
assert.equal(second.matched.filter((item) => item.changed).length, 0);
assert.equal(second.matched.length, 2);
assert.equal(JSON.stringify(second.alumni), JSON.stringify(first.alumni));

console.log("import-drf-linkedin-verified.test.ts ok");
