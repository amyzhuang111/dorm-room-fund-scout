import assert from "node:assert/strict";
import {
  classYearNumber,
  enrollmentFromClassYear,
  findDuplicates,
  mergeCatalog,
  parseHttpUrl,
  parseState,
  upsertStartup,
  validateDraft,
  type CatalogRecord,
  type StartupDraft,
} from "./user-pipeline";
import { EMPTY_PIPELINE } from "./user-pipeline";
import type { UniversitySummary } from "./queries";

function draft(overrides: Partial<StartupDraft> = {}): StartupDraft {
  return {
    name: "Northstar",
    websiteUrl: "https://northstar.example",
    campusId: "univ_penn",
    campusName: "University of Pennsylvania",
    campusIsNew: false,
    founders: [{ name: "Ada Lovelace", linkedinUrl: "https://www.linkedin.com/in/ada", classYear: "2027", role: "CEO" }],
    fundingStage: "Pre-seed",
    description: "Campus tools for lab teams.",
    verificationUrl: "https://news.example/northstar",
    verificationNotes: "Founder confirmed the site.",
    stage: "Sourced",
    sourcedVia: null,
    referrer: null,
    ...overrides,
  };
}

assert.equal(parseHttpUrl("https://example.com/path"), "https://example.com/path");
assert.equal(parseHttpUrl("example.com"), "https://example.com/");
assert.equal(parseHttpUrl("javascript:alert(1)"), null);
assert.equal(parseHttpUrl("not a url"), null);
assert.equal(parseHttpUrl(""), null);

assert.equal(classYearNumber("2027"), 2027);
assert.equal(classYearNumber("'27"), 2027);
assert.equal(enrollmentFromClassYear("2027").status, "current_student");
assert.equal(enrollmentFromClassYear("2025").status, "recent_grad");
assert.equal(enrollmentFromClassYear("2014").status, "older_alumni");
assert.equal(enrollmentFromClassYear("").status, "unknown");

const invalid = validateDraft(draft({ verificationUrl: "nope", name: "A" }));
assert.equal(invalid.ok, false);
if (!invalid.ok) {
  assert.ok(invalid.errors.verificationUrl);
  assert.ok(invalid.errors.name);
}

const valid = validateDraft(draft());
assert.equal(valid.ok, true);

const created = valid.ok ? upsertStartup(EMPTY_PIPELINE, valid.value, "University of Pennsylvania") : EMPTY_PIPELINE;
assert.equal(created.startups.length, 1);
assert.equal(created.startups[0].campusId, "univ_penn");
assert.equal(created.startups[0].founders[0].classYear, "2027");
assert.equal(created.startups[0].sourcedVia, null);
assert.equal(parseState(created).startups[0].name, "Northstar");

const sourced = validateDraft(draft({ sourcedVia: "alum_referral", referrer: "  Lauren Reeder  " }));
assert.equal(sourced.ok, true);
const sourcedState = sourced.ok ? upsertStartup(EMPTY_PIPELINE, sourced.value, "University of Pennsylvania") : EMPTY_PIPELINE;
assert.equal(sourcedState.startups[0].sourcedVia, "alum_referral");
assert.equal(sourcedState.startups[0].referrer, "Lauren Reeder");
assert.equal(parseState(sourcedState).startups[0].referrer, "Lauren Reeder");
assert.equal(parseState({ startups: [{ ...sourcedState.startups[0], sourcedVia: "nope", referrer: "   " }] }).startups[0].sourcedVia, null);
assert.equal(parseState({ startups: [{ ...sourcedState.startups[0], sourcedVia: "nope", referrer: "   " }] }).startups[0].referrer, null);
assert.equal(parseState({ startups: [{ id: "nope", name: "X" }] }).startups.length, 0);

const other = validateDraft(draft({ campusId: null, campusName: "Oberlin College", campusIsNew: true }));
assert.equal(other.ok, true);
const withCampus = other.ok ? upsertStartup(EMPTY_PIPELINE, other.value, "Oberlin College") : EMPTY_PIPELINE;
assert.ok(withCampus.campuses[0]?.id.startsWith("ucampus_"));
assert.equal(withCampus.startups[0].campusName, "Oberlin College");

const records: CatalogRecord[] = [
  { id: "proj_north", kind: "startup", name: "Northstar", campusName: "Penn", websiteUrl: "https://www.northstar.example", href: "/startup/proj_north" },
  { id: "proj_other", kind: "startup", name: "Completely Different", campusName: "MIT", websiteUrl: "https://other.test", href: "/startup/proj_other" },
  { id: "person_ada", kind: "founder", name: "Ada Lovelace", campusName: "Penn", websiteUrl: null, href: "/founder/discover?founder=person_ada" },
];
const dupes = findDuplicates({ name: "Northstar Inc", websiteUrl: "https://northstar.example/about", founderNames: ["Ada Lovelace"] }, records);
assert.ok(dupes.some((hit) => hit.id === "proj_north" && hit.reason.includes("domain")));
assert.ok(dupes.some((hit) => hit.id === "person_ada"));
assert.equal(dupes.some((hit) => hit.id === "proj_other"), false);

const similar = findDuplicates({ name: "Northstarr", websiteUrl: null, founderNames: [] }, records);
assert.ok(similar.some((hit) => hit.id === "proj_north" && hit.reason.includes("Similar")));
const phrase = findDuplicates({ name: "Northstar Robotics", websiteUrl: null, founderNames: [] }, records);
assert.ok(phrase.some((hit) => hit.id === "proj_north" && hit.reason.includes("Similar")));
const unrelated = findDuplicates({ name: "Harborline", websiteUrl: "https://harborline.example", founderNames: [] }, [
  { id: "proj_harbor", kind: "startup", name: "Harbor", campusName: "Michigan", websiteUrl: "https://harbor.example", href: "/startup/proj_harbor" },
]);
assert.equal(unrelated.length, 0);

const universities = [
  {
    id: "univ_penn",
    name: "University of Pennsylvania",
    country: "United States",
    lat: 1,
    lon: 2,
    coordSource: "test",
    candidateProjectCount: 1,
    companyCount: 1,
    founderCount: 1,
    resolvedPersonCount: 1,
    sourcesConfigured: 2,
    lastCheckedAt: null,
    coverage: "up_to_date",
  },
] as UniversitySummary[];
const merged = mergeCatalog({ universities, candidates: [], founders: [] }, created);
assert.equal(merged.candidates.length, 1);
assert.equal(merged.candidates[0].universityIds[0], "univ_penn");
assert.equal(merged.founders.length, 1);
assert.equal(merged.founders[0].enrollmentStatus, "current_student");
assert.equal(merged.universities[0].companyCount, 2);

console.log("user-pipeline tests passed");
