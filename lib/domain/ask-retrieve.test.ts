import assert from "node:assert/strict";
import { fallbackAnswer, NOT_IN_THE_DATA } from "./ask-prompt";
import { retrieveAsk } from "./ask-retrieve";

const clubs = retrieveAsk("top-tier clubs with the most founders");
assert.ok(clubs.length > 0);
assert.equal(clubs[0]?.kind, "organization");
assert.match(clubs[0]?.detail ?? "", /club/i);
assert.match(fallbackAnswer(clubs), /Campus Scout records match/);

const berkeley = retrieveAsk("Berkeley founders backed by a16z speedrun");
assert.ok(berkeley.length > 0);
for (const hit of berkeley) {
  if (hit.kind === "person") {
    assert.ok(hit.campuses.includes("univ_berkeley"), hit.detail);
    assert.match(hit.detail, /a16z speedrun/i);
  }
}

const health = retrieveAsk("recent grads building in healthcare in NYC");
assert.ok(health.length > 0);
for (const hit of health) {
  assert.equal(hit.kind, "person");
  assert.match(hit.detail, /Recent grad/);
}

const penn = retrieveAsk("Penn juniors in M&T building in AI");
assert.equal(penn.length, 0);
assert.equal(fallbackAnswer(penn), NOT_IN_THE_DATA);

assert.equal(retrieveAsk("xqvzz mplkqq").length, 0);

console.log("ask-retrieve tests ok", {
  clubs: clubs.slice(0, 3).map((hit) => hit.name),
  berkeley: berkeley.slice(0, 3).map((hit) => `${hit.name} | ${hit.detail}`),
  health: health.slice(0, 3).map((hit) => `${hit.name} | ${hit.detail}`),
  pennJuniorsMtAi: NOT_IN_THE_DATA,
});
