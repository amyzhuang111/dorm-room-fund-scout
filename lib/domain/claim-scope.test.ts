import assert from "node:assert/strict";
import { displayedGateLine, eligibilityLines, enrollmentPhrase, readPersonScope, storedAffiliationLine } from "./claim-scope";

const ethanEvidence = "Listed as student founder on https://entrepreneurship.columbia.edu/2026/07/13/welcome-to-the-2026-2027-cohort-of-the-columbia-startup-lab/";
const ethan = readPersonScope({
  name: "Ethan Shea",
  status: "current_student",
  basis: "verified",
  evidence: ethanEvidence,
  sourceUrl: "https://entrepreneurship.columbia.edu/2026/07/13/welcome-to-the-2026-2027-cohort-of-the-columbia-startup-lab/",
});
assert.equal(ethan.present, "unknown", "a 2026 URL and a stored current_student flag are not enrollment");
assert.equal(ethan.sourceAsOf, null);
assert.doesNotMatch(ethan.presentText, /2026-07-13/);
assert.match(ethan.presentText, /not backed by a statement/);

const natalie = readPersonScope({
  name: "Natalie Aresta-Katz",
  status: "current_student",
  basis: "verified",
  evidence: ethanEvidence.replace("Listed as student founder", "Listed as student founder"),
  sourceUrl: "https://entrepreneurship.columbia.edu/2026/07/13/welcome-to-the-2026-2027-cohort-of-the-columbia-startup-lab/",
});
assert.equal(natalie.present, "unknown");

const alumniCohort = readPersonScope({
  name: "Ethan Shea",
  status: "current_student",
  basis: "verified",
  evidence: "The Lab cultivates a cohort of alumni entrepreneurs each year. Ethan Shea and Natalie Aresta-Katz are named with CBS.",
  sourceUrl: "https://entrepreneurship.columbia.edu/2026/07/13/welcome-to-the-2026-2027-cohort-of-the-columbia-startup-lab/",
});
assert.equal(alumniCohort.present, "unknown");
assert.match(alumniCohort.presentText, /alumni cohort/);

const eventOnly = readPersonScope({
  name: "Ada Event",
  status: "current_student",
  basis: "verified",
  evidence: "Ada Event is listed on the 2026 hackathon prize page.",
  sourceUrl: "https://example.edu/events/2026/05/02/hackathon/",
});
assert.equal(eventOnly.present, "unknown");
assert.equal(eventOnly.sourceAsOf, null);

const negated = readPersonScope({
  name: "Alexandra Debow",
  year: 2024,
  status: "current_student",
  basis: "verified",
  evidence: "Alexandra Debow: degree completion is not established.",
});
assert.equal(negated.present, "unknown");
assert.notEqual(negated.present, "graduated");
assert.match(negated.presentText, /not established/);

const otherPerson = readPersonScope({
  name: "Ada Team",
  status: "recent_grad",
  basis: "verified",
  evidence: "Bob Example graduated in 2024. Ada Team is named on the project page.",
});
assert.equal(otherPerson.present, "unknown");

const unverifiedBasis = readPersonScope({
  name: "Victor Espinosa",
  status: "current_student",
  basis: "unverified",
  evidence: "Victor Espinosa is pursuing his master's degree in computer science at Georgia Tech.",
});
assert.equal(unverifiedBasis.present, "unknown");

const victor = readPersonScope({
  name: "Victor Espinosa",
  status: "current_student",
  basis: "verified",
  evidence: "The CREATE-X article says Victor Espinosa is currently pursuing his master's degree in computer science at Georgia Tech.",
  sourceUrl: "https://www.gatech.edu/news/2026/04/09/create-x-startup-brings-digital-access-unbanked",
});
assert.equal(victor.present, "current_student");
assert.match(victor.presentText, /as of the source/);
assert.equal(victor.sourceAsOf, null);
assert.doesNotMatch(victor.presentText, /2026-04-09/);

const datedEnrollment = readPersonScope({
  name: "Ada Roster",
  status: "current_student",
  basis: "verified",
  evidence: "Ada Roster is enrolled. The roster statement is dated March 1, 2024.",
});
assert.equal(datedEnrollment.present, "current_student");
assert.equal(datedEnrollment.sourceAsOf, "2024-03-01");

const completed = readPersonScope({
  name: "Ada Degree",
  status: "recent_grad",
  basis: "verified",
  evidence: "Ada Degree completed her degree in 2019.",
});
assert.equal(completed.present, "graduated");

const adarshYear = readPersonScope({
  name: "Adarsh Hiremath",
  year: 2025,
  classYearSupport: "source_unavailable",
  status: "recent_grad",
  basis: "verified",
  evidence: "Adarsh Hiremath · class 2025 · alumni",
  leftSchool: true,
  roleClaimState: "unverified",
  roleClaimUrl: "https://www.thecrimson.com/article/2025/3/14/mercor-valuation-2-bil/",
  roleClaimExcerpt: "Left Harvard to co-found Mercor ($10B valuation, Oct 2025)",
});
assert.equal(adarshYear.present, "unknown");
assert.match(adarshYear.classYearText, /Stored class year 2025/);
assert.match(adarshYear.classYearText, /not verified/);
assert.match(adarshYear.claimDateNote ?? "", /2025\/3\/14/);
assert.match(adarshYear.claimDateNote ?? "", /not a verified publication date/);

assert.ok(eligibilityLines([{ name: "Ethan Shea", status: "current_student", basis: "verified", evidence: ethanEvidence }]).some((line) => /unknown/.test(line)));
assert.equal(eligibilityLines([{ name: "Victor Espinosa", status: "current_student", basis: "verified", evidence: "The CREATE-X article says Victor Espinosa is currently pursuing his master's degree in computer science at Georgia Tech." }]).some((line) => /Present enrollment is unknown/.test(line)), false);

const victorEvidence = "The CREATE-X article says Victor Espinosa is currently pursuing his master's degree in computer science at Georgia Tech.";
const victorInput = { name: "Victor Espinosa", status: "current_student", basis: "verified", evidence: victorEvidence };
const victorScope = readPersonScope(victorInput);
const victorViews = {
  header: enrollmentPhrase(victorScope),
  lower: enrollmentPhrase(victorScope),
  tooltip: victorScope.presentText,
  open: displayedGateLine("No dated affiliation evidence yet. Unknown is not the same as ineligible.", [victorInput]),
  workbook: victorScope.present,
  date: victorScope.sourceAsOf,
};
assert.equal(victorViews.header, victorViews.lower);
assert.match(victorViews.header, /No publication date is written/);
assert.doesNotMatch(victorViews.header, /2026/);
assert.match(victorViews.tooltip, /pursuing a degree or enrolled/);
assert.match(victorViews.open, /No publication date is written/);
assert.doesNotMatch(victorViews.open, /No dated affiliation evidence/);
assert.equal(victorViews.workbook, "current_student");
assert.equal(victorViews.date, null);

const ethanScope = readPersonScope({ name: "Ethan Shea", status: "current_student", basis: "verified", evidence: ethanEvidence });
assert.equal(enrollmentPhrase(ethanScope), "Present enrollment unknown");
assert.match(storedAffiliationLine("current_student", "current_student"), /Stored affiliation label/);
assert.doesNotMatch(storedAffiliationLine("current_student", "current_student"), /source says/);

const alexandra = readPersonScope({
  name: "Alexandra Debow",
  year: 2024,
  status: "current_student",
  basis: "verified",
  evidence: "Alexandra Debow (Tandon '24). Degree completion is not established. Checked 2026-11-04.",
});
assert.equal(alexandra.present, "unknown");
assert.equal(alexandra.sourceAsOf, null);
assert.equal(alexandra.reviewDate, "2026-11-04");

console.log("claim scope tests ok");
