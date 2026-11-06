import assert from "node:assert/strict";
import { getDb } from "../db/client";
import { getFounderPreview } from "./founder-preview";
import { userFounderPreview, userStartupPreview } from "./user-preview";
import type { UserStartup } from "./user-pipeline";
import {
  assembleStartupLinks,
  classifyCompanyLink,
  formatVerifiedDate,
  founderRoleLabel,
  getStartupCard,
  startupStatusLabel,
  startupSubtitle,
  verificationSourceLabel,
} from "./startup-card";

assert.equal(classifyCompanyLink("https://olferatx.com/"), "website");
assert.equal(classifyCompanyLink("https://x.com/acme"), "x");
assert.equal(classifyCompanyLink("https://twitter.com/acme"), "x");
assert.equal(classifyCompanyLink("https://www.linkedin.com/company/afterquery"), "linkedin");
assert.equal(classifyCompanyLink("https://www.linkedin.com/in/someone"), null);
assert.equal(classifyCompanyLink("https://github.com/acme/app"), "github");
assert.equal(classifyCompanyLink("https://www.producthunt.com/posts/acme"), "productHunt");
assert.equal(classifyCompanyLink("https://www.crunchbase.com/organization/acme"), "crunchbase");
assert.equal(classifyCompanyLink("https://www.facebook.com/acme"), "facebook");

const links = assembleStartupLinks([
  "https://afterquery.com",
  "https://afterquery.com/",
  "https://www.linkedin.com/company/afterquery",
  "https://www.linkedin.com/in/spencermateega",
  "https://github.com/acme/app",
  "https://www.crunchbase.com/organization/ivytech-design-llc",
  "https://devpost.com/software/example",
]);
assert.deepEqual(
  links.map((link) => link.kind),
  ["website", "linkedin", "crunchbase", "github"]
);
assert.equal(links.find((link) => link.kind === "website")?.url, "https://afterquery.com");

assert.equal(startupSubtitle("Winter 2026", "Y Combinator", "San Francisco"), "Winter 2026 · San Francisco");
assert.equal(
  startupSubtitle("Winter 2022", null, "Manchester, England, United Kingdom"),
  "Winter 2022 · Manchester, England, United Kingdom"
);
assert.equal(startupSubtitle("SR005", "a16z Speedrun", "San Francisco"), "a16z Speedrun SR005 · San Francisco");
assert.equal(startupSubtitle(null, "Berkeley SkyDeck", "Berkeley"), "Berkeley");
assert.equal(startupSubtitle(null, null, null), null);
assert.equal(startupSubtitle("2026", "WashU Skandalaris I&E Awards spring 2026", null), "WashU Skandalaris I&E Awards spring 2026");

assert.equal(startupStatusLabel("acquired"), "Acquired");
assert.equal(startupStatusLabel("dead"), "Inactive");
assert.equal(startupStatusLabel("Active"), "Active");
assert.equal(startupStatusLabel("operating"), null);
assert.equal(startupStatusLabel(null), null);

assert.equal(founderRoleLabel("founder"), "Founder");
assert.equal(founderRoleLabel("co-founder"), "Co-Founder");
assert.equal(founderRoleLabel("Founder/CEO"), "Founder/CEO");

assert.equal(formatVerifiedDate("2026-09-27"), "Sep 27, 2026");
assert.equal(formatVerifiedDate("nope"), null);
assert.equal(
  verificationSourceLabel("YC company page and the live website both match the name (fetched 2026-09-27)."),
  "YC company page"
);
assert.equal(
  verificationSourceLabel("Live website title or page text matches the company name (fetched 2026-09-27)."),
  "company website"
);
assert.equal(verificationSourceLabel("No company website or YC page was on record to check."), null);
assert.equal(
  verificationSourceLabel("Named on https://entrepreneurship.columbia.edu/2026/07/13/welcome"),
  "entrepreneurship.columbia.edu"
);

const after = getStartupCard("proj_75gsH605T3no");
assert.ok(after);
assert.equal(after.name, "AfterQuery");
assert.equal(after.subtitle, "Winter 2025 · San Francisco");
assert.equal(after.sector, "AI infra");
assert.equal(after.region, "San Francisco");
assert.equal(after.teamSize, "30");
assert.equal(after.status, null);
// Penn comes from the YC page; UBC was added 2026-11-02 from the UBC Tech Map listing
// (observed, not verified). Assert the stable fact (Penn is present, names are sorted)
// instead of pinning the full list, which grows as sources are imported.
assert.ok(after.campuses.includes("University of Pennsylvania"));
assert.deepEqual(after.campuses, [...after.campuses].sort((a, b) => a.localeCompare(b)));
assert.equal(after.websiteUrl, "https://afterquery.com");
assert.ok(after.links.some((link) => link.kind === "website"));
assert.ok(after.links.some((link) => link.kind === "linkedin"));
assert.equal(after.links.some((link) => link.kind === "facebook" || link.kind === "x"), false);
// The exact date is record data that changes when a company is re-verified (it read
// "Sep 27, 2026" here, then "Aug 3, 2026"); assert it is a formatted date, not which one.
assert.match(after.verifiedOn ?? "", /^[A-Z][a-z]{2} \d{1,2}, 2026$/);
assert.equal(after.verifiedSource, "YC company page");
assert.equal(after.founders.length, 2);
for (const founder of after.founders) {
  assert.equal(founder.photoUrl, null);
  assert.equal(founder.linkedinFollowers, null);
  assert.equal(founder.yearsExperience, null);
  // These two had confirmed LinkedIn URLs on 2026-09-27; the 2026-11-02 accuracy pass
  // demoted them to "linkedin_unverified" (no URL). So assert the invariant, not the person:
  // a URL is shown only if it is a profile link, and confidence is set exactly when a URL is.
  if (founder.linkedinUrl) {
    assert.ok(founder.linkedinUrl.includes("linkedin.com/in/"));
    assert.ok(founder.linkedinConfidence === "confirmed" || founder.linkedinConfidence === "likely");
  } else {
    assert.equal(founder.linkedinConfidence, null);
  }
  assert.equal(founder.role, "Founder");
}
const spencer = after.founders.find((founder) => founder.name === "Spencer Mateega");
assert.equal(spencer?.school, "University of Pennsylvania");
const carlos = after.founders.find((founder) => founder.name === "Carlos Georgescu");
assert.equal(carlos?.school, "University of British Columbia");

// The atlas and other previews must get the same complete company card.
const maive = getStartupCard("proj_UY-Y_bIuBQ6h");
assert.ok(maive);
assert.equal(maive.description, "AI for Home Services");
assert.equal(maive.subtitle, "Winter 2025 · San Francisco");
assert.deepEqual(maive.founders.map(founder => founder.name), ["David Tondreau", "Will Cray"]);
assert.equal(maive.links.find(link => link.kind === "website")?.confirmed, false);

// Sparse campus records still expose their recorded cohort and evidence.
// A portfolio listing must never become the startup's Website button.
const addsynth = getStartupCard("proj_38CLDX9KEFL_");
assert.ok(addsynth);
assert.equal(addsynth.subtitle, "Georgia KickStart Fund 2025");
assert.equal(addsynth.websiteUrl, null);
assert.equal(addsynth.links.some(link => link.kind === "website"), false);
assert.equal(addsynth.sourceLink?.url, "https://georgiakickstart.com/portfolio");
assert.equal(addsynth.verifiedOn, null);
assert.deepEqual(addsynth.founders, []);

const greptile = getStartupCard("proj_Kjt4QnMR7jT7");
assert.equal(greptile?.description, "AI code review agent with complete context of your codebase");

const central = getStartupCard("proj_64eq0ZNyLkur");
assert.ok(central);
assert.equal(central.status, "Acquired");

const missing = getStartupCard("does-not-exist");
assert.equal(missing, null);

// The founder card must preserve the company and school from the atlas example.
const yi = getFounderPreview("person_9SmCmePgT0cC");
assert.ok(yi);
assert.equal(yi.name, "Yi Zhang");
assert.ok(yi.schools.includes("Harvard University"));
assert.ok(yi.companies.some(company => company.name === "Relari"));
assert.ok(yi.links.some(link => link.kind === "linkedin"));
assert.equal(getFounderPreview("does-not-exist"), null);

// A preview must not hide founding roles just because a company is outside the investment pool.
const excludedRoles = getDb().prepare(`SELECT r.person_id, p.id FROM person_project_roles r JOIN projects p ON p.id = r.project_id
  WHERE p.kind = 'company' AND p.is_investable_candidate = 0 AND r.role LIKE '%founder%' LIMIT 5`).all() as { person_id: string; id: string }[];
for (const row of excludedRoles) assert.ok(getFounderPreview(row.person_id)?.companies.some(company => company.id === row.id));

const local: UserStartup = {
  id: "user_preview", name: "Local startup", websiteUrl: "https://example.com", campusId: "univ_test", campusName: "Test University",
  founders: [{ id: "ufounder_preview", name: "Test Founder", linkedinUrl: "https://www.linkedin.com/in/example", classYear: "2027", role: "Co-founder" }],
  fundingStage: "Pre-seed", description: "A user-added startup", verificationUrl: "https://example.com/team", verificationNotes: "User source",
  stage: "Sourced", sourcedVia: null, referrer: null, createdAt: "2026-11-06", updatedAt: "2026-11-06",
};
assert.equal(userStartupPreview(local).founders[0].linkedinConfidence, "unverified");
assert.equal(userStartupPreview(local).verifiedOn, null);
assert.equal(userFounderPreview("ufounder_preview", [local])?.companies[0].id, local.id);
assert.equal(userFounderPreview("ufounder_preview", [local])?.classYear, "2027");
assert.equal(userStartupPreview({ ...local, websiteUrl: "javascript:alert(1)" }).websiteUrl, null);
assert.equal(userFounderPreview("missing", [local]), null);

console.log("startup and founder preview tests ok");
