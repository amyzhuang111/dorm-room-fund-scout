import assert from "node:assert/strict";
import test from "node:test";
import { founderSignalWeight, signalTooltip, sqrtScores, startupSignalWeight, tierSizeBoost } from "./network-signal-size";

test("confirmed funded accelerator startups outweigh a plain confirmed one", () => {
  const plain = startupSignalWeight({ verification: "confirmed", funded: false, accelerator: false, strongTier: false });
  const strong = startupSignalWeight({ verification: "confirmed", funded: true, accelerator: true, strongTier: true });
  const hidden = startupSignalWeight({ verification: "unverified", funded: true, accelerator: true, strongTier: true });
  assert.equal(plain, 1);
  assert.equal(strong, 2.5);
  assert.equal(hidden, 0);
});

test("partial startups count at half", () => {
  assert.equal(startupSignalWeight({ verification: "partial", funded: false, accelerator: false, strongTier: false }), 0.5);
});

test("a verified founder of a strong startup counts, an unverified one does not", () => {
  assert.equal(founderSignalWeight({ verification: "confirmed", tier: null, startupWeight: 1 }), 1);
  assert.equal(founderSignalWeight({ verification: "confirmed", tier: "S", startupWeight: 0 }), 1.5);
  assert.equal(founderSignalWeight({ verification: "unverified", tier: "S", startupWeight: 2 }), 0);
  assert.equal(founderSignalWeight({ verification: "confirmed", tier: null, startupWeight: 0 }), 0);
});

test("sqrt scale lets a small ratio sit near a large one", () => {
  const [small, large] = sqrtScores([0.02, 0.08]);
  assert.ok(small > 0.4);
  assert.equal(large, 1);
});

test("tooltip shows the raw count, denominator, and ratio", () => {
  assert.equal(
    signalTooltip({ type: "campus", signalCount: 18, signalWeight: 24.5, signalDenominator: 921, signalRatio: 24.5 / 921 }),
    "18 strong (weight 24.5) / 921 undergrads · ratio 0.0266",
  );
  assert.equal(signalTooltip({ type: "person", signalCount: 4, signalWeight: 4, signalDenominator: 1, signalRatio: 4 }), "4 connections / 1 · ratio 4");
  assert.equal(
    signalTooltip({ type: "person", signalCount: 4, signalWeight: 4, signalDenominator: 1, signalRatio: 4, tier: "S" }),
    "4 connections / 1 · ratio 4 · tier S",
  );
  assert.equal(
    signalTooltip({ type: "organization", signalCount: 0, signalWeight: 0, signalDenominator: 1, signalRatio: 0, orgTier: "S" }),
    "0 strong / 1 members · ratio 0 · tier S",
  );
});

test("directory tiers add screen weight from S down to C", () => {
  assert.ok(tierSizeBoost("S") > tierSizeBoost("A"));
  assert.ok(tierSizeBoost("A") > tierSizeBoost("B"));
  assert.ok(tierSizeBoost("B") > tierSizeBoost("C"));
  assert.equal(tierSizeBoost("C"), 0);
  assert.equal(tierSizeBoost(null), 0);
});
