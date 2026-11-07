import assert from "node:assert/strict";
import { eligibilityLines, readPersonScope } from "./claim-scope";

const kevinIn = {
  name: "Kevin Gu",
  status: "recent_grad",
  basis: "inferred",
  evidence: "No class year is stated. The newest dated evidence is 2025 (Founded in 2025).",
  sourceUrl: "https://devpost.com/software/pitchlab-clxhuj",
};
const kevin = readPersonScope(kevinIn);
assert.equal(kevin.present, "unknown");
assert.match(kevin.presentText, /inferred/);
assert.equal(kevin.roleState, "no_claim");

const adarshIn = {
  name: "Adarsh Hiremath",
  year: 2025,
  status: "recent_grad",
  basis: "verified",
  evidence: "class 2025 · alumni",
  leftSchool: true,
  roleClaimState: "unverified",
  roleClaimUrl: "https://www.thecrimson.com/article/2025/3/14/mercor-valuation-2-bil/",
  roleClaimExcerpt: "Left Harvard to co-found Mercor ($10B valuation, Oct 2025)",
};
const adarsh = readPersonScope(adarshIn);
assert.equal(adarsh.present, "unknown");
assert.match(adarsh.presentText, /Left school/);
assert.match(adarsh.claimDateNote ?? "", /2025-03-14/);
assert.equal(adarsh.classYearText, "Class of 2025");

const alexandra = readPersonScope({
  name: "Alexandra Debow",
  year: 2024,
  status: "current_student",
  basis: "verified",
  evidence: "degree completion is not established",
  affiliationSaysCurrentStudent: true,
  affiliationSourceUrl: "https://entrepreneur.nyu.edu/blog/2023/11/10/alexandra-debow-swsh/",
  roleClaimState: "observed",
  roleClaimUrl: "https://entrepreneur.nyu.edu/blog/2023/11/10/alexandra-debow-swsh/",
});
assert.equal(alexandra.present, "unknown");
assert.match(alexandra.presentText, /2023-11-10/);
assert.match(alexandra.presentText, /not established/);
assert.equal(alexandra.roleState, "recorded");

const graduatedIn = {
  name: "Case Grad",
  year: 2024,
  status: "recent_grad",
  basis: "verified",
  evidence: "She graduated and completed a degree in 2024.",
  sourceUrl: "https://example.edu/news/2024/06/01/commencement/",
};
const graduated = readPersonScope(graduatedIn);
assert.equal(graduated.present, "graduated");

const current = readPersonScope({
  name: "Case Now",
  year: 2027,
  status: "current_student",
  basis: "verified",
  evidence: "Listed as a current student on the 2026 roster.",
  sourceUrl: "https://example.edu/roster/2026/09/01/students/",
});
assert.equal(current.present, "current_student");

const lines = eligibilityLines([kevinIn, adarshIn]);
assert.ok(lines.some((line) => /Kevin Gu/.test(line) && /unknown/.test(line)));
assert.ok(lines.some((line) => /No source claim/.test(line)));
assert.ok(lines.some((line) => /2025-03-14/.test(line)));
assert.equal(eligibilityLines([graduatedIn]).some((line) => /Present enrollment is unknown/.test(line)), false);

console.log("claim scope tests ok");
