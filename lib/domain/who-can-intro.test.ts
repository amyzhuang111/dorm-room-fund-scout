import assert from "node:assert/strict";
import { batchKeysFromExcerpt, batchReason, introCoverage, introPanelFor, alumniReferralDirectory, samePlaceReason, yearOverlap } from "./who-can-intro";

assert.deepEqual(yearOverlap({ start: 2014, end: 2016 }, { start: 2016, end: 2019 }), { start: 2016, end: 2016 });
assert.equal(yearOverlap({ start: 2010, end: 2012 }, { start: 2014, end: 2016 }), null);
assert.equal(samePlaceReason("Penn M&T", 2016, 2016, { start: 2013, end: 2016 }), "Same Penn M&T class, 2016");
assert.equal(samePlaceReason("Penn", 2016, 2018, { start: 2015, end: 2016 }), "Same Penn, overlapping years 2015–2016");
assert.equal(samePlaceReason("Penn M&T", 2016, 2016, null), "Same Penn M&T");
assert.equal(batchReason("yc:W26", "YC W26"), "Same YC W26 batch");
assert.equal(batchReason("thiel:2026", "Thiel Fellowship 2026"), "Same Thiel Fellowship 2026");

const yc = batchKeysFromExcerpt("YC W26");
assert.deepEqual(yc, [{ key: "yc:W26", label: "YC W26" }]);
const prose = batchKeysFromExcerpt("Y Combinator's page for SpotPay (Winter 2026) lists Zsika Phillip.");
assert.deepEqual(prose, [{ key: "yc:W26", label: "YC W26" }]);
const both = batchKeysFromExcerpt("Free Ventures S2026; YC X2026");
assert.deepEqual(both.map((item) => item.key).sort(), ["fv:S2026", "yc:X26"]);
assert.deepEqual(batchKeysFromExcerpt("Thiel Fellowship 2026 ($250k)"), [{ key: "thiel:2026", label: "Thiel Fellowship 2026" }]);
assert.deepEqual(batchKeysFromExcerpt("2025 Semifinalist"), []);
assert.deepEqual(batchKeysFromExcerpt("Y Combinator invested with no season named"), []);

const coverage = introCoverage();
assert.equal(coverage.alumni, 324);
assert.ok(coverage.alumniWithLinkedIn >= 176, String(coverage.alumniWithLinkedIn));
assert.ok(coverage.trackedStartups > 500, String(coverage.trackedStartups));
assert.ok(coverage.startupsWithPath > 0, String(coverage.startupsWithPath));
assert.ok(coverage.startupsWithWarmPath > 0, String(coverage.startupsWithWarmPath));
assert.ok(coverage.alumniWhoCanRefer > 0, String(coverage.alumniWhoCanRefer));
assert.ok(coverage.startupsWithWarmPath <= coverage.startupsWithPath);
assert.ok(coverage.startupsWithPath <= coverage.trackedStartups);

const directory = alumniReferralDirectory();
assert.equal(directory.length, 324);
const lauren = directory.find((row) => row.id === "dra_lauren_reeder");
assert.ok(lauren);
assert.equal(lauren.school, "University of Pennsylvania");
assert.equal(lauren.years, "2015–2016");
assert.equal(lauren.firm, "Sequoia Capital");
assert.equal(lauren.role, "Partner");
assert.equal(lauren.canRefer, true);
assert.ok(lauren.reach > 0);
for (const row of directory) {
  assert.equal(row.canRefer, row.reach > 0);
  for (const sample of row.samples) {
    assert.match(sample.reason, /^(Same |Co-founder|Backed through )/);
    assert.ok(sample.strength === "strong" || sample.strength === "medium" || sample.strength === "weak");
  }
}

const mt = introPanelFor("person_36MDV5h2Ej4w");
const mtPath = mt.paths.find((path) => path.alumName === "Lauren Reeder");
assert.ok(mtPath, JSON.stringify(mt.paths.map((path) => path.reason)));
assert.equal(mtPath.reason, "Same Penn M&T class, 2016");
assert.equal(mtPath.strength, "strong");

const boba = introPanelFor("proj_boba");
assert.equal(boba.target, null);

const peter = directory.find((row) => row.name === "Peter Chung");
assert.equal(peter, undefined);

const mario = directory.find((row) => row.id === "dra_mario_ruiz");
assert.ok(mario);
assert.equal(mario.location, "Connecticut");
assert.equal(mario.weakReach, 0);

const shawn = directory.find((row) => row.id === "dra_shawn_xu");
assert.ok(shawn);
assert.equal(shawn.location, "San Francisco");
assert.ok(shawn.weakReach > 0, String(shawn.weakReach));

const truell = directory.find((row) => row.id === "dra_michael_truell");
assert.ok(truell);
assert.ok(truell.startups.some((startup) => startup.name === "Cursor" && startup.relation === "Founded"));

const cursor = introPanelFor("proj_GjrFxToPH-cI");
assert.equal(cursor.target?.name, "Cursor");
assert.ok(cursor.paths.every((path) => path.alumName !== "Michael Truell"));
for (const path of cursor.paths) {
  if (path.strength === "weak") assert.match(path.reason, /metro$/);
}

const reachable = new Set<string>();
for (const row of directory) {
  for (const sample of row.samples) reachable.add(sample.startupId);
}
assert.ok(coverage.startupsWithPath >= reachable.size);

console.log(
  JSON.stringify(
    {
      alumni: coverage.alumni,
      linkedin: coverage.alumniWithLinkedIn,
      trackedStartups: coverage.trackedStartups,
      startupsWithPath: coverage.startupsWithPath,
      startupsWithWarmPath: coverage.startupsWithWarmPath,
      alumniWhoCanRefer: coverage.alumniWhoCanRefer,
      laurenReach: lauren.reach,
      laurenWeak: lauren.weakReach,
    },
    null,
    2
  )
);
console.log("who can intro tests ok");
