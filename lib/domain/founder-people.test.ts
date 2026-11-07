import assert from "node:assert/strict";
import { claimDateNote, companyIdentityNote, filterFounderPeople, founderYearFacts, presentEnrollment } from "./founder-people";
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
    companyClaimState: null,
    companyClaimUrl: null,
    companyClaimExcerpt: null,
    year: null,
    enrollmentStatus: null,
    enrollmentBasis: null,
    enrollmentEvidence: null,
    enrollmentSourceUrl: null,
    leftSchool: false,
    verificationStatus: null,
    verificationNote: null,
    affiliations: [],
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

const year = founderYearFacts(person({ id: "a", name: "Ada", year: 2025, leftSchool: true, enrollmentStatus: "recent_grad", enrollmentEvidence: "class 2025" }));
assert.equal(year.label, "Class year");
assert.equal(year.value, "2025");
assert.match(year.note ?? "", /Left school/);
assert.match(year.note ?? "", /recent grad/);

const kevin = presentEnrollment(person({ id: "k", name: "Kevin", enrollmentStatus: "recent_grad", enrollmentBasis: "inferred", enrollmentEvidence: "No class year is stated. The newest dated evidence is 2025 (Founded in 2025)." }));
assert.equal(kevin.state, "unknown");
assert.match(kevin.summary, /inferred/);
const adarsh = presentEnrollment(person({ id: "a2", name: "Adarsh", year: 2025, leftSchool: true, enrollmentStatus: "recent_grad", enrollmentBasis: "verified", enrollmentEvidence: "class 2025 · alumni" }));
assert.equal(adarsh.state, "unknown");
assert.match(adarsh.summary, /Left school/);
const alex = presentEnrollment(person({
  id: "x", name: "Alexandra", year: 2024, enrollmentStatus: "current_student", enrollmentBasis: "verified",
  enrollmentEvidence: "degree completion is not established",
  affiliations: [{ campusId: "univ_nyu", campus: "NYU", role: "current_student", status: "current_student", sourceUrl: "https://entrepreneur.nyu.edu/blog/2023/11/10/alexandra-debow-swsh/", excerpt: "current_student · 2025", retrievedAt: "2026-11-03T09:19:10.624Z" }],
}));
assert.equal(alex.state, "unknown");
assert.match(alex.summary, /2023-11-10/);
assert.equal(companyIdentityNote(person({ id: "k2", name: "Kevin", company: "Thirdlayer", companyId: "proj" })), "Stored founder role. No source claim is attached to this role.");
assert.match(claimDateNote("Left Harvard to co-found Mercor ($10B valuation, Oct 2025)", "https://www.thecrimson.com/article/2025/3/14/mercor-valuation-2-bil/") ?? "", /2025-03-14/);

console.log("founder people tests ok");
