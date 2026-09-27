import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseAlumniRecords, type DrfAlumRow } from "./drf-alumni";
import { scoreConnectors } from "./connectors";
import type { IntroGraph, IntroOrg } from "./intro-graph";
import { neighborhoodFromGraph, orgScore, rankWarmPaths, viaLabel } from "./warm-paths";

const records = parseAlumniRecords(JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "imports", "drf_alumni.json"), "utf8")));
assert.equal(records.length, 324);
assert.equal(records.filter((row) => row.confidence === "confirmed").length, 323);
assert.equal(records.filter((row) => row.confidence === "likely").length, 1);
for (const row of records) {
  assert.ok(row.sourceUrl.startsWith("https://"), row.id);
  assert.ok(row.excerpt.length >= 40, row.id);
  const founderOnly = !!row.currentRole && /\bfounder\b/i.test(row.currentRole) && !/\b(partner|gp|investor|principal|vp)\b/i.test(row.currentRole);
  if (row.currentFirm && !founderOnly) assert.ok(row.investorId?.startsWith("inv_"), row.id);
  if (founderOnly) assert.equal(row.investorId, null, row.id);
}
assert.equal(records.find((row) => row.id === "dra_lauren_reeder")?.investorId, "inv_sequoia_capital");
assert.equal(records.find((row) => row.id === "dra_lauren_reeder")?.linkedinConfidence, "confirmed");
assert.equal(records.filter((row) => row.linkedinConfidence === "confirmed").length, 78);
assert.equal(records.filter((row) => row.linkedinUrl).length, 176);
for (const row of records) {
  if (row.linkedinUrl) assert.ok(row.linkedinConfidence === "confirmed" || row.linkedinConfidence === "likely", row.id);
  else assert.equal(row.linkedinConfidence, null, row.id);
  if (row.linkedinConfidence === "confirmed") assert.ok(row.linkedinSourceUrl && !row.linkedinSourceUrl.includes("linkedin.com/in/"), row.id);
}
assert.equal(records.find((row) => row.id === "dra_matthew_wachter")?.currentRole, null);
assert.equal(records.find((row) => row.id === "dra_matthew_wachter")?.confidence, "likely");
assert.equal(records.find((row) => row.id === "dra_michael_truell")?.foundedProjectId, "proj_GjrFxToPH-cI");
assert.equal(records.find((row) => row.id === "dra_michael_truell")?.investorId, null);
assert.equal(records.find((row) => row.id === "dra_toni_oloko")?.foundedProjectId, "proj_-useAjLwlsUE");
assert.equal(records.find((row) => row.id === "dra_heston_berkman")?.investorId, "inv_banter_capital");
assert.equal(records.find((row) => row.id === "dra_kenta_yaegashi")?.linkedinConfidence, "confirmed");
assert.equal(records.find((row) => row.id === "dra_kenta_yaegashi")?.location, "New York");
assert.equal(records.find((row) => row.id === "dra_shawn_xu")?.currentRole, "Partner");
assert.equal(records.find((row) => row.id === "dra_tony_shi")?.currentRole, "Partner");
assert.equal(records.find((row) => row.id === "dra_anjney_midha")?.currentRole, "Venture Partner");
assert.ok(records.find((row) => row.id === "dra_lan_jiang")?.linkedinSourceUrl?.includes("luxcapital.com"));
assert.equal(records.find((row) => row.id === "dra_tori_orr")?.currentFirm, "NGP Capital");
assert.equal(records.find((row) => row.id === "dra_trevor_sookraj")?.currentFirm, "Divisional");
assert.equal(records.find((row) => row.id === "dra_steven_krouse")?.location, "Prospect Heights, Brooklyn");
assert.equal(records.find((row) => row.id === "dra_bruno_faviero")?.linkedinUrl, "https://www.linkedin.com/in/faviero");
assert.equal(records.find((row) => row.id === "dra_justine_humenansky")?.currentFirm, "Optimism Foundation");

const penn: IntroOrg = {
  id: "univ_penn",
  name: "Penn",
  kind: "campus",
  members: 200,
  campusId: "univ_penn",
  campusShort: "Penn",
  cohort: false,
  sourceUrl: null,
};
const mt: IntroOrg = {
  id: "proj_mt_penn",
  name: "M&T (Jerome Fisher Program in Management & Technology)",
  kind: "program",
  members: 10,
  campusId: "univ_penn",
  campusShort: "Penn",
  cohort: false,
  sourceUrl: "https://fisher.wharton.upenn.edu/",
};
assert.equal(viaLabel(mt), "Penn M&T");
assert.equal(orgScore(mt).label, "Small club");
assert.ok(orgScore(mt).strength > orgScore({ ...penn, kind: "program", members: 90 }).strength);
assert.ok(orgScore(mt).strength > orgScore(penn).strength);

function alum(): DrfAlumRow {
  return {
    id: "dra_lauren_reeder",
    personId: "person_lauren",
    name: "Lauren Reeder",
    drfTeam: "Philly",
    universityId: "univ_penn",
    schoolLabel: "University of Pennsylvania",
    schoolRole: "undergrad",
    programId: "proj_mt_penn",
    programLabel: "M&T",
    yearStart: null,
    yearEnd: null,
    classYear: 2016,
    currentFirm: "Sequoia Capital",
    currentRole: "Partner",
    firmType: "vc",
    firmConfidence: "confirmed",
    investorId: "inv_sequoia_capital",
    sourceUrl: "https://fortune.com/2022/09/06/exclusive-student-run-vc-dorm-room-fund-spins-out-from-first-round-capital-raises-12-5m-fund-from-marc-andreessen-underscore-vc-insight-partners-others/",
    firmSourceUrl: "https://fisher.wharton.upenn.edu/mt-for-life/lauren-reeder-mt16/",
    linkedinUrl: null,
    linkedinConfidence: null,
    linkedinSourceUrl: null,
    location: null,
    verificationNote: null,
    xUrl: null,
    foundedProjectId: null,
    sourceUrls: [],
    affiliationStatus: null,
    confidence: "confirmed",
    excerpt: "Fortune names Lauren Reeder as a DRF alum and a Sequoia partner.",
  };
}

function baseGraph(): IntroGraph {
  return {
    people: new Map([
      ["person_lauren", { id: "person_lauren", name: "Lauren Reeder", campuses: ["univ_penn"] }],
      ["person_ada", { id: "person_ada", name: "Ada Founder", campuses: ["univ_penn"] }],
      ["person_bea", { id: "person_bea", name: "Bea Builder", campuses: ["univ_penn"] }],
    ]),
    orgs: new Map([
      [penn.id, penn],
      [mt.id, mt],
    ]),
    orgsByPerson: new Map([
      ["person_lauren", [
        { orgId: penn.id, sourceUrl: null },
        { orgId: mt.id, sourceUrl: "https://fisher.wharton.upenn.edu/" },
      ]],
      ["person_ada", [
        { orgId: penn.id, sourceUrl: null },
        { orgId: mt.id, sourceUrl: "https://fisher.wharton.upenn.edu/" },
      ]],
      ["person_bea", [{ orgId: penn.id, sourceUrl: null }]],
    ]),
    peopleByOrg: new Map([
      [penn.id, [{ personId: "person_lauren", sourceUrl: null }, { personId: "person_ada", sourceUrl: null }, { personId: "person_bea", sourceUrl: null }]],
      [mt.id, [{ personId: "person_lauren", sourceUrl: "https://fisher.wharton.upenn.edu/" }, { personId: "person_ada", sourceUrl: "https://fisher.wharton.upenn.edu/" }]],
    ]),
    cofounders: new Map(),
    startupsByPerson: new Map(),
    alumni: [alum()],
    strongFounders: new Set(["person_ada"]),
    schoolYears: new Map(),
    portfolioByInvestor: new Map(),
  };
}

const clubPath = rankWarmPaths(baseGraph(), "person_ada", 5);
assert.equal(clubPath.length, 1);
assert.equal(clubPath[0].sentence, "Path: Lauren Reeder at Sequoia Capital, via Penn M&T, to Ada Founder");
assert.equal(clubPath[0].strengthLabel, "Strong");
assert.equal(clubPath[0].via, "Penn M&T");
assert.equal(clubPath[0].hops, 2);
assert.ok(clubPath[0].evidence.some((item) => item.url.startsWith("https://fortune.com/")));

const schoolOnly = baseGraph();
schoolOnly.orgsByPerson.set("person_ada", [{ orgId: penn.id, sourceUrl: null }]);
schoolOnly.peopleByOrg.set(mt.id, [{ personId: "person_lauren", sourceUrl: null }]);
assert.equal(rankWarmPaths(schoolOnly, "person_ada", 5).length, 0);
const schoolPath = rankWarmPaths(schoolOnly, "person_ada", 5, { includeWeak: true });
assert.equal(schoolPath[0].via, "Penn");
assert.equal(schoolPath[0].strengthLabel, "Weak");

const overlapping = baseGraph();
overlapping.orgsByPerson.set("person_ada", [{ orgId: penn.id, sourceUrl: null }]);
overlapping.peopleByOrg.set(mt.id, [{ personId: "person_lauren", sourceUrl: null }]);
overlapping.schoolYears.set("person_lauren", [{ universityId: penn.id, start: 2014, end: 2016 }]);
overlapping.schoolYears.set("person_ada", [{ universityId: penn.id, start: 2015, end: 2019 }]);
const mediumPath = rankWarmPaths(overlapping, "person_ada", 5);
assert.equal(mediumPath[0].strengthLabel, "Medium");
assert.equal(mediumPath[0].via, "Penn, overlapping years");

const invested = baseGraph();
invested.orgsByPerson.set("person_ada", []);
invested.orgsByPerson.set("person_lauren", [{ orgId: penn.id, sourceUrl: null }]);
invested.peopleByOrg.set(mt.id, [{ personId: "person_lauren", sourceUrl: null }]);
invested.startupsByPerson.set("person_ada", ["proj_ada"]);
invested.portfolioByInvestor.set("inv_sequoia_capital", [{ projectId: "proj_ada", sourceUrl: "https://example.com/sequoia" }]);
const investedPath = rankWarmPaths(invested, "person_ada", 5);
assert.equal(investedPath[0].strengthLabel, "Strong");
assert.equal(investedPath[0].via, "Sequoia Capital invested");
assert.ok(investedPath[0].evidence.some((item) => item.url === "https://example.com/sequoia"));

const withCofounder = baseGraph();
withCofounder.cofounders.set("person_ada", [{ personId: "person_lauren", sourceUrl: "https://example.com/cofounder" }]);
withCofounder.cofounders.set("person_lauren", [{ personId: "person_ada", sourceUrl: "https://example.com/cofounder" }]);
const direct = rankWarmPaths(withCofounder, "person_ada", 5);
assert.equal(direct[0].hops, 1);
assert.equal(direct[0].strengthLabel, "Strong");
assert.equal(direct[0].via, "co-founder");
assert.ok(direct[0].strength > clubPath[0].strength);

const scored = scoreConnectors(baseGraph());
assert.equal(scored.people.find((row) => row.id === "person_lauren")?.strongFounders, 1);
const byInvestment = scoreConnectors(invested);
assert.equal(byInvestment.people.find((row) => row.id === "person_lauren")?.strongFounders, 1);

const sameSchoolOnly = neighborhoodFromGraph(schoolOnly);
assert.equal(sameSchoolOnly.includes("person_ada"), false);
const mediumNeighborhood = neighborhoodFromGraph(overlapping);
assert.equal(mediumNeighborhood.includes("person_ada"), true);
const clubNeighborhood = neighborhoodFromGraph(baseGraph());
assert.equal(clubNeighborhood.includes("person_ada"), true);
assert.equal(scored.clubs[0]?.id, mt.id);
assert.equal(scored.clubs[0]?.strongFounders, 1);
assert.ok((scored.clubs[0]?.perMember ?? 0) > 0);

const big = { ...mt, id: "proj_big", name: "Big Program", members: 100 };
const wide = baseGraph();
wide.orgs.set(big.id, big);
wide.peopleByOrg.set(big.id, [
  { personId: "person_lauren", sourceUrl: null },
  { personId: "person_ada", sourceUrl: null },
]);
wide.orgs.get(mt.id)!.members = 1000;
const ranked = scoreConnectors(wide);
const small = ranked.clubs.find((row) => row.id === "proj_big");
const crowded = ranked.clubs.find((row) => row.id === mt.id);
assert.ok(small && crowded && small.perMember > crowded.perMember);
assert.equal(ranked.clubs[0].id, "proj_big");

console.log("drf intro tests ok");
