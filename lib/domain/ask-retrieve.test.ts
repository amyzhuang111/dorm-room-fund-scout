import assert from "node:assert/strict";
import { answerFromRecords, fallbackAnswer, NOT_IN_THE_DATA } from "./ask-prompt";
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

const pennHealth = retrieveAsk("Penn founders in health tech");
assert.ok(pennHealth.length > 0);
assert.ok(pennHealth.some((hit) => hit.kind === "startup"));
assert.ok(pennHealth.some((hit) => /healthtech|biotech|medtech|penn health-tech/i.test(hit.detail)));
assert.ok(pennHealth.some((hit) => hit.name === "Eye-V Ultrasound" || hit.name === "Vasowatch" || /Penn Health-Tech/i.test(hit.detail)));

for (const question of ["Penn digital health startups", "Penn medtech founders", "Penn biotech startups", "Penn healthcare founders"]) {
  const rows = retrieveAsk(question);
  assert.ok(rows.length > 0, question);
  assert.ok(rows.some((hit) => /health|bio|med/i.test(`${hit.name} ${hit.detail}`)), question);
}

const program = retrieveAsk("Which startups are in Penn Health-Tech?");
assert.ok(program.some((hit) => /Penn Health-Tech/i.test(hit.detail)));

assert.equal(retrieveAsk("xqvzz mplkqq").length, 0);

const northwestern = retrieveAsk("Which Northwestern startups raised money?");
assert.ok(northwestern.length > 0);
assert.ok(northwestern.every((hit) => hit.kind === "startup"));
assert.ok(northwestern.some((hit) => hit.name === "HaptE" && hit.campuses.includes("univ_northwestern")));
const northwesternAnswer = answerFromRecords(northwestern, "Which Northwestern startups raised money?");
assert.notEqual(northwesternAnswer, NOT_IN_THE_DATA);
assert.match(northwesternAnswer, /HaptE/);
assert.match(northwesternAnswer, /No recorded raise is attached yet/);

const seriesA = retrieveAsk("Stanford startups that raised a Series A");
assert.ok(seriesA.length > 0);
assert.ok(seriesA.every((hit) => hit.kind === "startup" || hit.kind === "investor"));
const seriesNames = seriesA.map((hit) => hit.name);
for (const name of ["SkyPilot", "Phia", "Cleva"]) {
  assert.ok(seriesNames.includes(name), name);
}
assert.ok(/round:|funding news:|total:/i.test(seriesA[0]?.detail ?? ""));
assert.match(seriesA.find((hit) => hit.name === "SkyPilot")?.detail ?? "", /Seed|\$20M|Lux/i);
assert.match(answerFromRecords(seriesA, "Stanford startups that raised a Series A"), /These have recorded raises:/);
assert.match(answerFromRecords(seriesA, "Stanford startups that raised a Series A"), /SkyPilot/);

const pennYc = retrieveAsk("Which Penn startups are backed by YC?");
assert.ok(pennYc.some((hit) => hit.kind === "startup" && hit.campuses.includes("univ_penn") && /Y Combinator/i.test(hit.detail)));
assert.ok(pennYc.filter((hit) => hit.kind === "startup").length >= 8);

const robotics = retrieveAsk("Top MIT founders in robotics");
assert.ok(robotics.some((hit) => hit.kind === "person" && hit.campuses.includes("univ_mit")));
assert.equal(robotics[0]?.name, "Anubhav Guha");
assert.match(robotics[0]?.detail ?? "", /Sensei|Robotics/i);
assert.ok(robotics.some((hit) => /Vision Lab|EverCurrent|Ember/i.test(`${hit.name} ${hit.detail}`)));

console.log("ask-retrieve tests ok", {
  clubs: clubs.slice(0, 3).map((hit) => hit.name),
  berkeley: berkeley.slice(0, 3).map((hit) => `${hit.name} | ${hit.detail}`),
  health: health.slice(0, 3).map((hit) => `${hit.name} | ${hit.detail}`),
  pennJuniorsMtAi: NOT_IN_THE_DATA,
  pennHealth: pennHealth.slice(0, 6).map((hit) => `${hit.name} | ${hit.detail}`),
});
