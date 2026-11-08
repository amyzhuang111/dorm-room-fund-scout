import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
const people = readFileSync(new URL("../../app/data/people/page.tsx", import.meta.url), "utf8");

const countRule = css.slice(css.indexOf("[data-home-counts] [data-fold-counts] > p.corpus-count-line:first-child"));
assert.ok(countRule.startsWith("[data-home-counts]"), "count rule missing");
assert.match(countRule.slice(0, 500), /flex-direction:\s*row/);
assert.match(countRule.slice(0, 500), /flex-wrap:\s*wrap/);
assert.doesNotMatch(countRule.slice(0, 400), /flex-direction:\s*column/);
assert.match(countRule.slice(0, 900), /max-height:\s*none !important/);
assert.match(css, /\[data-home-counts\] a\.corpus-count-chip \{[\s\S]*min-height:\s*28px !important/);

const cards = people.slice(people.indexOf('data-class-year-review=""'));
assert.equal(cards.split('className="flex min-h-11 flex-col gap-1').length - 1, 3);
assert.match(cards, /Source-backed class years/);
assert.match(cards, /Stored years still unverified/);
assert.match(cards, /No class year stored/);
assert.doesNotMatch(cards.slice(0, 1200), /<strong className="block text-xl">/);

console.log("narrow layout regression ok");
