import assert from "node:assert/strict";
import {
  HIT_RATE_SENTENCE,
  MAX_HIT_RATE_INTERVAL,
  fundingIsGoodOutcome,
  fundingStageKind,
  gammaQuantile,
  scoreHitRates,
  type HitObservation,
} from "./campus-hit-rate-model";

assert.equal(fundingStageKind("Pre-seed"), "preseed");
assert.equal(fundingStageKind("Seed"), "seed");
assert.equal(fundingStageKind("Series A"), "later");
assert.equal(fundingStageKind("grant"), "grant");
assert.equal(fundingIsGoodOutcome(["preseed"]), false);
assert.equal(fundingIsGoodOutcome(["seed"]), true);
assert.equal(fundingIsGoodOutcome(["later"]), true);
assert.equal(fundingIsGoodOutcome(["grant"]), false);
assert.equal(fundingIsGoodOutcome(["unknown", "unknown"]), true);
assert.equal(fundingIsGoodOutcome(["preseed", "seed"]), true);
assert.equal(fundingIsGoodOutcome(["unknown"]), false);

const observations: HitObservation[] = [];
for (let i = 0; i < 40; i++) observations.push({ id: `other_${i}`, year: 2024, good: i < 8, campuses: ["univ_other"] });
for (let i = 0; i < 10; i++) observations.push({ id: `campus_${i}`, year: 2024, good: i < 5, campuses: ["univ_campus"] });
for (let i = 0; i < 2; i++) observations.push({ id: `tiny_${i}`, year: 2024, good: true, campuses: ["univ_tiny"] });

const scored = scoreHitRates(observations, { priorStrength: 8, minFounders: 8 });
const campus = scored.find((row) => row.universityId === "univ_campus");
const tiny = scored.find((row) => row.universityId === "univ_tiny");
const other = scored.find((row) => row.universityId === "univ_other");
assert.ok(campus && tiny && other);
assert.equal(campus.reliable, campus.high - campus.low <= MAX_HIT_RATE_INTERVAL);
assert.equal(tiny.reliable, false);
assert.equal(campus.founders, 10);
assert.equal(campus.good, 5);
const yearRate = 15 / 52;
const expected = 10 * yearRate;
const shrunk = (5 + 8) / (expected + 8);
assert.ok(Math.abs(campus.hitRate - shrunk) < 1e-9, `${campus.hitRate} vs ${shrunk}`);
assert.ok(campus.low < campus.hitRate && campus.hitRate < campus.high);
assert.ok(tiny.hitRate < 2 / (2 * yearRate), "small campus shrinks toward 1");
assert.ok(tiny.hitRate > 1);
assert.ok(gammaQuantile(8, 8, 0) > 0.5 && gammaQuantile(8, 8, 0) < 1.5);

const matched: HitObservation[] = [
  ...Array.from({ length: 20 }, (_, i) => ({ id: `early_${i}`, year: 2020, good: i < 2, campuses: ["univ_pool"] })),
  ...Array.from({ length: 8 }, (_, i) => ({ id: `late_${i}`, year: 2026, good: i < 4, campuses: ["univ_pool"] })),
  ...Array.from({ length: 8 }, (_, i) => ({ id: `focus_${i}`, year: 2026, good: i < 6, campuses: ["univ_focus"] })),
];
const focus = scoreHitRates(matched, { priorStrength: 8, minFounders: 8 }).find((row) => row.universityId === "univ_focus");
assert.ok(focus);
const lateRate = 10 / 16;
const focusExpected = 8 * lateRate;
assert.ok(Math.abs(focus.hitRate - (6 + 8) / (focusExpected + 8)) < 1e-9);
const vague = scoreHitRates(
  Array.from({ length: 8 }, (_, i) => ({ id: `vague_${i}`, year: 2015, good: false, campuses: ["univ_vague"] })),
  { priorStrength: 8, minFounders: 8 }
).find((row) => row.universityId === "univ_vague");
assert.ok(vague);
assert.equal(vague.founders, 8);
assert.equal(vague.reliable, false, "eight founders with a very wide interval stay off the ranking");

assert.ok(!HIT_RATE_SENTENCE.toLowerCase().includes("unicorn"));
assert.equal((HIT_RATE_SENTENCE.match(/[.!?](?=\s|$)/g) ?? []).length, 1);

console.log("campus hit-rate tests ok");
