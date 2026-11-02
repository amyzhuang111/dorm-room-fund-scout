/**
 * Regression: expand dedupe must NEVER merge on normalized name alone.
 * Cases from campus-dcedf9e-data-verify.md wrong merges.
 */
import assert from "node:assert/strict";
import { normalizeCompanyName, websiteIdentity } from "../../lib/domain/dedupe";
import {
  campusSetKey,
  expandDedupeBucket,
  founderSetKey,
} from "../../lib/domain/expand-dedupe-key";

const SHARED =
  /ycombinator\.com|skydeck\.berkeley|dormroomfund\.com|linkedin\.com|github\.com|devpost\.com/;

function isSharedPortalHost(host: string | null | undefined): boolean {
  return !host || SHARED.test(host);
}

function bucket(input: {
  name: string;
  websiteUrl?: string | null;
  primaryLink?: string | null;
  campusIds?: string[];
  founderIds?: string[];
}) {
  return expandDedupeBucket({
    name: input.name,
    websiteUrl: input.websiteUrl ?? null,
    primaryLink: input.primaryLink ?? null,
    campusIds: input.campusIds ?? [],
    founderIds: input.founderIds ?? [],
    isSharedPortalHost,
  });
}

function main() {
  // Domain key preferred when present
  const manifestApp = bucket({
    name: "Manifest",
    websiteUrl: "https://manifestapp.xyz",
    campusIds: ["univ_stanford"],
    founderIds: ["person_amy"],
  });
  const manifestBuild = bucket({
    name: "Manifest",
    websiteUrl: "https://manifest.build",
    campusIds: ["univ_berkeley"],
  });
  assert.equal(manifestApp.kind, "domain");
  assert.equal(manifestBuild.kind, "domain");
  assert.notEqual(manifestApp.key, manifestBuild.key);

  // Scout trio — three distinct companies
  const cpg = bucket({ name: "Scout", websiteUrl: "https://cpgscout.ai/", campusIds: ["univ_penn"], founderIds: ["person_sasha"] });
  const daily = bucket({ name: "Scout", websiteUrl: "https://thedailyscout.com", campusIds: ["univ_berkeley"], founderIds: ["person_rohan"] });
  const uchicago = bucket({ name: "Scout", campusIds: ["univ_uchicago"] });
  assert.notEqual(cpg.key, daily.key);
  assert.notEqual(cpg.key, uchicago.key);
  assert.notEqual(daily.key, uchicago.key);
  assert.equal(uchicago.kind, "name-campus-founders");

  // Fulcrum
  const fulA = bucket({ name: "Fulcrum", websiteUrl: "https://fulcrumresearch.ai", campusIds: ["univ_mit"] });
  const fulB = bucket({ name: "Fulcrum", websiteUrl: "https://www.withfulcrum.com/", campusIds: ["univ_columbia"] });
  assert.notEqual(fulA.key, fulB.key);

  // agora Penn vs Agora NYU — same norm name, different campus, no domain
  assert.equal(normalizeCompanyName("agora"), normalizeCompanyName("Agora"));
  const agoraPenn = bucket({ name: "agora", campusIds: ["univ_penn"], founderIds: ["person_meha", "person_yochi"] });
  const agoraNyu = bucket({
    name: "Agora",
    campusIds: ["univ_nyu"],
    founderIds: ["person_christian", "person_david", "person_tomer"],
  });
  assert.equal(agoraPenn.kind, "name-campus-founders");
  assert.notEqual(agoraPenn.key, agoraNyu.key);

  // Pulse CMU vs runpulse.com
  const pulseWeb = bucket({ name: "Pulse", websiteUrl: "https://www.runpulse.com/", campusIds: ["univ_gatech"] });
  const pulseCmu = bucket({ name: "Pulse", campusIds: ["univ_cmu"] });
  assert.notEqual(pulseWeb.key, pulseCmu.key);

  // HINDSIGHT UCSD vs usehindsight.com
  const hindWeb = bucket({ name: "Hindsight", websiteUrl: "https://www.usehindsight.com/", campusIds: ["univ_berkeley"] });
  const hindUcsd = bucket({ name: "HINDSIGHT", campusIds: ["univ_ucsd"] });
  assert.equal(normalizeCompanyName("Hindsight"), normalizeCompanyName("HINDSIGHT"));
  assert.notEqual(hindWeb.key, hindUcsd.key);

  // Kindred / PipeLine / VAMP — campus distinguishes
  assert.notEqual(
    bucket({ name: "Kindred", campusIds: ["univ_uw"] }).key,
    bucket({ name: "Kindred", campusIds: ["univ_cornell_tech"] }).key,
  );
  assert.notEqual(
    bucket({ name: "Pipeline", campusIds: ["univ_uci"] }).key,
    bucket({ name: "PipeLine", campusIds: ["univ_purdue"] }).key,
  );
  assert.notEqual(
    bucket({ name: "VAMP", campusIds: ["univ_gw"] }).key,
    bucket({ name: "VAMP", campusIds: ["univ_georgetown"] }).key,
  );

  // Same domain merges even if display names differ
  const a = bucket({ name: "Orble", websiteUrl: "https://orble-tea.com" });
  const b = bucket({ name: "Munch Industries", websiteUrl: "http://www.orble-tea.com/" });
  assert.equal(a.kind, "domain");
  assert.equal(a.key, b.key);

  // Same name + campus + founders → same bucket (true twin)
  const twin1 = bucket({
    name: "Kaigo Health",
    campusIds: ["univ_stanford", "univ_mit"],
    founderIds: ["person_lukas", "person_kazuki"],
  });
  const twin2 = bucket({
    name: "Kaigo Health",
    campusIds: ["univ_mit", "univ_stanford"],
    founderIds: ["person_kazuki", "person_lukas"],
  });
  assert.equal(twin1.key, twin2.key);

  // Name alone (no campus, no founders, no domain) must not share a mergeable ncf key with a richer twin
  // expand script skips empty campus+founder; bucket still encodes empties but keys differ once campus set
  const thin = bucket({ name: "Manifest" });
  const rich = bucket({ name: "Manifest", campusIds: ["univ_stanford"], founderIds: ["person_amy"] });
  assert.notEqual(thin.key, rich.key);

  // Helpers stable
  assert.equal(campusSetKey(["univ_b", "univ_a", "univ_a"]), "univ_a|univ_b");
  assert.equal(founderSetKey(["p2", "p1"]), "p1|p2");
  assert.ok(websiteIdentity("https://www.withfulcrum.com/"));

  console.log("dedupe-expand-key.test.ts: ok");
}

main();
