import assert from "node:assert/strict";
import { canonicalizeTag, chipLooksBad, MAX_CHIP_CHARS } from "./canonical-tag";

const cases: { raw: string; chip: string | null; mapped?: boolean }[] = [
  {
    raw: "Neo Scholars note names Walden Yan as co-founder of Cognition.",
    chip: "Neo Scholars",
    mapped: true,
  },
  { raw: "a16z speedrun SR007 (per frontrun.vc)", chip: "a16z Speedrun SR007", mapped: true },
  { raw: "MIT $100K 2026 First Place ($100K)", chip: "MIT $100K 1st", mapped: true },
  { raw: "President's Innovation/Sustainability Prize 2021", chip: "Penn Sustainability Prize", mapped: true },
  {
    raw: 'E@B\'s public companies page lists "Arden" (Spring 2026): AI agents',
    chip: "Innovate@BU",
    mapped: true,
  },
  { raw: "Thiel Fellowship 2026 ($250k)", chip: "Thiel Fellowship", mapped: true },
  { raw: "Venture Lab VIP-X", chip: "Venture Lab VIP-X", mapped: true },
  { raw: "Sequoia Capital", chip: "Sequoia", mapped: true },
  { raw: "Y Combinator", chip: "Y Combinator", mapped: true },
];

for (const item of cases) {
  const got = canonicalizeTag(item.raw);
  assert.equal(got.chip, item.chip, item.raw);
  if (item.mapped != null) assert.equal(got.mapped, item.mapped, `mapped:${item.raw}`);
  if (got.chip) assert.ok(got.chip.length <= MAX_CHIP_CHARS, got.chip);
  if (got.chip) assert.equal(chipLooksBad(got.chip), false, got.chip);
}

console.log("canonical-tag.test.ts OK", cases.length);
