// Directory name matching. No database.

import assert from "node:assert/strict";
import { hasPhrase, matchPhrases, normHotspotName, samePlace } from "./hotspot-model";

assert.equal(samePlace("Jerome Fisher M&T", "Jerome Fisher Management & Technology"), true);
assert.equal(samePlace("M&T", "Jerome Fisher M&T"), true);
assert.equal(samePlace("Management & Technology", "Jerome Fisher M&T"), true);
assert.equal(samePlace("Penn Labs", "Stanford Labs"), false);

const mayfield = matchPhrases("Mayfield Fellows Program (STVP)");
assert.ok(mayfield.includes("mayfield"));
assert.ok(mayfield.includes("stvp"));

const calHacks = matchPhrases("Cal Hacks organising team (Hackathons @ Berkeley)");
assert.ok(calHacks.includes("cal hacks"));
assert.ok(calHacks.includes("hackathons berkeley"));

assert.equal(hasPhrase(normHotspotName("Stanford Mayfield Fellow (2026 cohort)"), "mayfield"), true);
assert.equal(hasPhrase(normHotspotName("Hackathons @ Berkeley team"), "hackathons berkeley"), true);
assert.equal(hasPhrase(normHotspotName("Penn Labs Team Lead (Penn Mobile)"), "penn labs"), true);
assert.equal(hasPhrase(normHotspotName("someone mentioned a lab"), "penn labs"), false);
assert.equal(hasPhrase(normHotspotName("YC founder; page names Stanford"), "yc founder"), true);
assert.equal(hasPhrase(normHotspotName("a founder at a campus lab"), "yc founder"), false);
assert.ok(matchPhrases("Wharton Analytics Fellows").includes("wharton analytics fellows"));
assert.ok(matchPhrases("Management, Entrepreneurship, & Technology (M.E.T.)").includes("management entrepreneurship and technology"));
assert.equal(hasPhrase(normHotspotName("Erfan Ballew (M.E.T. '28)"), "m e t"), true);

console.log("hotspot-model tests ok");
