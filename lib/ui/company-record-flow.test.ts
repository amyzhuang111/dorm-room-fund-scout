import assert from "node:assert/strict";
import { companyBrowsePath, companyRecordHref } from "./company-browse-path";
import { evidenceDate, formatEvidenceDate, latestSourceCollection } from "./company-evidence";
import { getProjectDetail } from "../domain/queries";
import { displayedFunding } from "../domain/company-profile";

const from = "/companies?campus=stanford&sort=name&more=2&q=AI";
assert.equal(companyBrowsePath(from), from);
assert.equal(companyBrowsePath(from + "#browse"), from);
const link = new URL(companyRecordHref("proj_9GUOmdEYxbuH", from), "https://example.test");
assert.equal(link.searchParams.get("from"), from);
for (const bad of ["https://example.test/companies", "//example.test/companies", "/companies/../pipeline", "/companies-extra", "/companies\\evil", "/companies\n", "/companies" + "x".repeat(2000), [from], null]) {
  assert.equal(companyBrowsePath(bad), null);
}
assert.equal(companyRecordHref("x", "//example.test"), "/startup/x");
assert.equal(evidenceDate("2024-02-29T12:00:00Z"), "2024-02-29");
for (const bad of ["2023-02-29", "2024-00-00", "2024-13-01", "2024-02", "unknown", null]) assert.equal(evidenceDate(bad), null);
assert.equal(formatEvidenceDate("2024-02-29"), "Feb 29, 2024");
const sim = getProjectDetail("proj_9GUOmdEYxbuH")!;
assert(sim);
assert(sim.profile.investors.some(i => i.kind === "accelerator"));
assert.equal(displayedFunding(sim.profile), null, "Program membership must not invent a funding amount");
assert.equal(latestSourceCollection(sim.claims, "https://unrecorded.example"), null);
const dates = sim.claims.map(c => evidenceDate(c.retrievedAt)).filter((d): d is string => !!d).sort();
assert.equal(latestSourceCollection(sim.claims), dates.at(-1) ?? null);
assert.equal(latestSourceCollection([]), null);
console.log("PASS: safe result URLs, filter/sort/page round trip, source date validation and real accelerator-only record");
