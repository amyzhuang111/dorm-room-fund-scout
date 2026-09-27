import assert from "node:assert/strict";
import { inferEnrollment } from "./enrollment-infer";

const warren = inferEnrollment({
  personName: "Warren Shepard '26",
  snippets: [{ excerpt: "Control Seat (YC S26)", sourceUrl: "https://example.edu/a", sourceId: "src" }],
  affiliationRoles: [],
  foundedYears: [],
  hasCampusAffiliation: false,
});
assert.equal(warren.status, "recent_grad");
assert.equal(warren.basis, "verified");
assert.equal(warren.gradYear, 2026);

const juniors = inferEnrollment({
  personName: "Sean Hargrow",
  snippets: [{ excerpt: "Yale juniors; Series, $3.1M pre-seed in 14 days (Apr 2025)", sourceUrl: "https://example.edu/b", sourceId: "src" }],
  affiliationRoles: [],
  foundedYears: [],
  hasCampusAffiliation: false,
});
assert.equal(juniors.status, "current_student");
assert.equal(juniors.basis, "verified");

const oldCompany = inferEnrollment({
  personName: "Ada Founder",
  snippets: [{ excerpt: "Penn founder of a company.", sourceUrl: "https://example.edu/c", sourceId: "src" }],
  affiliationRoles: [],
  foundedYears: [2015],
  hasCampusAffiliation: true,
});
assert.equal(oldCompany.status, "older_alumni");
assert.equal(oldCompany.basis, "inferred");

const mayfield = inferEnrollment({
  personName: "Aaryan Shah",
  snippets: [{ excerpt: "2025 Cohort of the Mayfield Fellows Program.", sourceUrl: "https://stvp.stanford.edu/mayfield", sourceId: "src" }],
  affiliationRoles: ["Mayfield Fellow 2025"],
  foundedYears: [],
  hasCampusAffiliation: true,
});
assert.equal(mayfield.status, "current_student");
assert.equal(mayfield.basis, "inferred");

const oldCohort = inferEnrollment({
  personName: "Ali Hoffer",
  snippets: [{ excerpt: "2018 Cohort of the Mayfield Fellows Program.", sourceUrl: "https://stvp.stanford.edu/mayfield", sourceId: "src" }],
  affiliationRoles: [],
  foundedYears: [],
  hasCampusAffiliation: true,
});
assert.equal(oldCohort.status, "older_alumni");
assert.equal(oldCohort.basis, "inferred");

const left = inferEnrollment({
  personName: "Surya Midha",
  snippets: [{ excerpt: "Left Georgetown to co-found Mercor.", sourceUrl: "https://example.edu/d", sourceId: "src" }],
  affiliationRoles: [],
  foundedYears: [],
  hasCampusAffiliation: false,
});
assert.equal(left.status, "recent_grad");
assert.equal(left.basis, "inferred");
assert.equal(left.leftSchool, true);

const career = inferEnrollment({
  personName: "Nick Soman",
  snippets: [{ excerpt: "Stanford BA, Harvard MBA. Growth Product Lead at Gusto. Previously PM on Kindle. YC F26.", sourceUrl: "https://www.ycombinator.com/companies/decent", sourceId: "src" }],
  affiliationRoles: [],
  foundedYears: [],
  hasCampusAffiliation: true,
});
assert.equal(career.status, "older_alumni");
assert.equal(career.basis, "inferred");

const enrolled = inferEnrollment({
  personName: "Ada Student",
  snippets: [{ excerpt: "CS student at Stanford. YC S26.", sourceUrl: "https://www.ycombinator.com/companies/ada", sourceId: "src" }],
  affiliationRoles: [],
  foundedYears: [],
  hasCampusAffiliation: true,
});
assert.equal(enrolled.status, "current_student");
assert.equal(enrolled.basis, "inferred");

const design = inferEnrollment({
  personName: "Casey Design",
  snippets: [{ excerpt: "Listed on the senior design showcase.", sourceUrl: "https://example.edu/design", sourceId: "src" }],
  affiliationRoles: ["BE senior design 2021"],
  foundedYears: [],
  hasCampusAffiliation: true,
});
assert.equal(design.status, "older_alumni");
assert.equal(design.basis, "inferred");

const hacker = inferEnrollment({
  personName: "Casey Hacker",
  snippets: [{ excerpt: "Devpost team member on a PennApps submission.", sourceUrl: "https://devpost.com/x", sourceId: "src" }],
  affiliationRoles: ["PennApps XXIV team member"],
  foundedYears: [],
  hasCampusAffiliation: true,
});
assert.equal(hacker.status, "recent_grad");
assert.equal(hacker.basis, "inferred");

const officer = inferEnrollment({
  personName: "Pat Officer",
  snippets: [{ excerpt: "Listed on the club page.", sourceUrl: "https://pennapps.com/", sourceId: "src" }],
  affiliationRoles: ["PennApps director"],
  foundedYears: [],
  hasCampusAffiliation: true,
});
assert.equal(officer.status, "current_student");
assert.equal(officer.basis, "inferred");

console.log("enrollment-infer tests passed");
