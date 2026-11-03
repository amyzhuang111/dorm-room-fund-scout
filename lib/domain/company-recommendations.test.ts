import assert from "node:assert/strict";
import { loadDirectory } from "./directory";
import { companyRecommendations } from "./company-recommendations";

// Exercise real stored records and the lone-campus fallback without inventing data.
const all = loadDirectory().cards;
const original = JSON.stringify(all);
for (const subject of all) {
  const result = companyRecommendations(all, subject);
  const rows = result.rows.map(row => all.find(c => c.id === row.id)!);
  assert(rows.length <= 6);
  assert.equal(new Set(rows.map(c => c.id)).size, rows.length);
  assert(rows.every(c => c && c.id !== subject.id));
  if (result.scope === "campus") {
    assert(rows.every(c => c.schoolId === subject.schoolId));
    assert.equal(new URL(result.href, "https://example.test").searchParams.get("campus"), subject.schoolId);
    const sameSectorCount = all.filter(c => c.id !== subject.id && c.schoolId === subject.schoolId && subject.sectorId && c.sectorId === subject.sectorId).length;
    assert(rows.slice(0, Math.min(6, sameSectorCount)).every(c => c.sectorId === subject.sectorId));
  } else if (result.scope === "sector") {
    assert(rows.every(c => c.sectorId === subject.sectorId));
    assert.equal(new URL(result.href, "https://example.test").searchParams.get("sector"), subject.sectorId);
  } else {
    assert(rows.every(c => c.signals > 0));
    assert.equal(new URL(result.href, "https://example.test").searchParams.get("feed"), "leaderboard");
  }
  assert.deepEqual(companyRecommendations([...all].reverse(), subject), result);
}
const sim = all.find(c => c.id === "proj_9GUOmdEYxbuH")!;
assert(sim);
const withoutOtherCampusPeers = all.filter(c => c.id === sim.id || c.schoolId !== sim.schoolId);
assert.equal(companyRecommendations(withoutOtherCampusPeers, sim).scope, "sector");
assert.equal(companyRecommendations([sim], sim).rows.length, 0);
assert.equal(JSON.stringify(all), original);
console.log(`PASS: recommendation identity, relevance, links, ordering and fallback for ${all.length.toLocaleString("en-US")} stored companies`);
