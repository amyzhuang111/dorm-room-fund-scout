// Ask AI query layer. Hits must be real Campus Scout rows.

import assert from "node:assert/strict";
import { createRateLimiter } from "./ask-rate-limit";
import { isKnownAskId, searchInvestors, searchOrganizations, searchPeople, searchStartups } from "./ask-query";
import type { AskHit } from "./ask-types";

function assertKnown(hits: AskHit[]) {
  assert.ok(hits.length > 0);
  for (const hit of hits) {
    assert.equal(isKnownAskId(hit.id), true, hit.id);
    assert.ok(hit.href.startsWith("/"));
    assert.ok(hit.sources.some((source) => source.label === "Record" && source.url === hit.href));
    assert.equal(hit.name.length > 0, true);
  }
}

const penn = searchPeople({
  campus: "Penn",
  standing: "junior",
  organization: "M&T",
  sector: "AI",
  building: true,
  limit: 20,
});
for (const hit of penn.matches) {
  assert.equal(hit.kind, "person");
  assert.ok(hit.campuses.includes("univ_penn"), hit.detail);
  assert.match(hit.detail, /Class of 2028/);
  assert.match(hit.detail, /Current student/);
  assert.match(hit.detail, /M&T|Management and Technology/i);
  assert.equal(isKnownAskId(hit.id), true);
}
assert.deepEqual(searchPeople({ campus: "not-a-campus", organization: "M&T" }).matches, []);
assert.deepEqual(searchPeople({ organization: "zzzz-not-a-club" }).matches, []);

const mt = searchPeople({ campus: "Penn", organization: "M&T", limit: 5 });
assertKnown(mt.matches);
for (const hit of mt.matches) assert.ok(hit.campuses.includes("univ_penn"));

const berkeley = searchPeople({
  campus: "Berkeley",
  founderOnly: true,
  investor: "a16z speedrun",
  limit: 20,
});
assertKnown(berkeley.matches);
for (const hit of berkeley.matches) {
  assert.equal(hit.kind, "person");
  assert.ok(hit.campuses.includes("univ_berkeley"), hit.detail);
  assert.match(hit.detail, /a16z speedrun/i);
}

const clubs = searchOrganizations({ typeIncludes: "club", limit: 8 });
assertKnown(clubs.matches);
const topClubs = searchOrganizations({ topTier: true, typeIncludes: "club", minFounders: 0 });
assert.ok(topClubs.matches.length >= 1);
for (const hit of topClubs.matches) assert.match(hit.detail, /· (?:S\+|S|A) ·/);
let previous = Infinity;
for (const hit of clubs.matches) {
  assert.equal(hit.kind, "organization");
  assert.ok(hit.id.startsWith("hsn_"), hit.id);
  assert.match(hit.detail, /Tier [1-5]/);
  assert.match(hit.detail, /club/i);
  const founders = Number(hit.detail.match(/(\d+) founders/)?.[1] ?? "0");
  assert.ok(founders >= 1);
  assert.ok(founders <= previous);
  previous = founders;
}

const health = searchPeople({
  enrollment: "recent_grad",
  sector: "healthcare",
  city: "NYC",
  building: true,
  limit: 20,
});
for (const hit of health.matches) {
  assert.equal(hit.kind, "person");
  assert.match(hit.detail, /Recent grad/);
  assert.equal(isKnownAskId(hit.id), true);
}
const healthStartups = searchStartups({ sector: "healthcare", city: "NYC", limit: 20 });
assertKnown(healthStartups.matches);
for (const hit of healthStartups.matches) {
  assert.equal(hit.kind, "startup");
  assert.match(hit.detail, /New York|NYC/i);
  assert.match(hit.detail, /Health|Bio|Med/i);
}

const investors = searchInvestors({ name: "a16z speedrun", limit: 5 });
assert.equal(investors.matches.length, 1);
assert.equal(investors.matches[0]?.name, "a16z Speedrun");
assert.equal(isKnownAskId(investors.matches[0]!.id), true);

const limiter = createRateLimiter(2, 60_000);
assert.equal(limiter("ip", 1_000).ok, true);
assert.equal(limiter("ip", 1_100).ok, true);
const blocked = limiter("ip", 1_200);
assert.equal(blocked.ok, false);
if (!blocked.ok) assert.ok(blocked.retryAfterSeconds >= 1);
assert.equal(limiter("other", 1_200).ok, true);

console.log("ask-query tests ok", {
  pennJuniorsMtAi: penn.matches.length,
  berkeleyA16z: berkeley.matches.length,
  topClubs: clubs.matches.map((hit) => hit.name),
  recentGradHealthNyc: health.matches.length,
  healthStartups: healthStartups.matches.length,
});
