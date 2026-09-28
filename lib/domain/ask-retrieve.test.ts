import assert from "node:assert/strict";
import { answerFromRecords, fallbackAnswer, noMatchAnswer, NOT_IN_THE_DATA } from "./ask-prompt";
import { retrieveAsk, retrieveForAsk } from "./ask-retrieve";

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
assert.match(northwesternAnswer, /recorded backing|recorded raises|No recorded raise/);
assert.match(northwesternAnswer, /Y Combinator|HaptE/);

const seriesA = retrieveForAsk("Stanford startups that raised a Series A");
assert.equal(seriesA.matches.length, 0);
assert.equal(seriesA.suggestion?.stage, "seed");
assert.ok(seriesA.suggestion?.matches.some((hit) => hit.name === "SkyPilot"));
assert.match(seriesA.suggestion?.matches.find((hit) => hit.name === "SkyPilot")?.detail ?? "", /Seed|\$20M|Lux/i);
const seriesAnswer = noMatchAnswer("Stanford startups that raised a Series A", seriesA.suggestion);
assert.match(seriesAnswer, /No Series A records match for Stanford/);
assert.match(seriesAnswer, /nearest recorded stage is Seed/);
assert.match(seriesAnswer, /SkyPilot/);

const pennYc = retrieveAsk("Which Penn startups are backed by YC?");
assert.ok(pennYc.some((hit) => hit.kind === "startup" && hit.campuses.includes("univ_penn") && /Y Combinator/i.test(hit.detail)));
assert.ok(pennYc.filter((hit) => hit.kind === "startup").length >= 8);

const pennPreseed = retrieveForAsk("ANY STARTUPS PRESEED IN PENN");
assert.ok(pennPreseed.matches.length > 0);
assert.ok(pennPreseed.matches.length <= 30);
assert.ok(pennPreseed.total >= pennPreseed.matches.length);
assert.equal(pennPreseed.suggestion, null);
for (const hit of pennPreseed.matches) {
  assert.equal(hit.kind, "startup");
  assert.ok(hit.campuses.includes("univ_penn"), hit.name);
  assert.match(hit.detail, /^recorded:/);
  assert.doesNotMatch(hit.detail, /Series [A-E]/i, hit.name);
  assert.doesNotMatch(hit.detail, /\bSeed\b/, hit.name);
}
for (const name of ["Flagler Health", "Probook", "Shinkei Systems"]) {
  assert.equal(pennPreseed.matches.some((hit) => hit.name === name), false, name);
}
assert.equal(pennPreseed.matches[0]?.name, "Deploy");
assert.match(pennPreseed.matches[0]?.detail ?? "", /Y Combinator accelerator \(Fall 2026\)/);
assert.match(pennPreseed.matches[0]?.detail ?? "", /founders:/);
const pennPreseedAnswer = answerFromRecords(pennPreseed.matches, "ANY STARTUPS PRESEED IN PENN", pennPreseed.total);
assert.match(pennPreseedAnswer, /No round is labelled Pre-seed/);
assert.match(pennPreseedAnswer, /Deploy/);
assert.doesNotMatch(pennPreseedAnswer, /Flagler Health|Series B/);

const berkeleySeed = retrieveAsk("seed startups at berkeley");
assert.ok(berkeleySeed.length > 0);
assert.ok(berkeleySeed.every((hit) => hit.kind === "startup" && hit.campuses.includes("univ_berkeley")));
assert.ok(berkeleySeed.some((hit) => hit.name === "SkyPilot"));
for (const name of ["Edvisor", "Teragen Energy", "Naïve", "Supermove"]) {
  assert.equal(berkeleySeed.some((hit) => hit.name === name), false, name);
}
assert.match(berkeleySeed.find((hit) => hit.name === "SkyPilot")?.detail ?? "", /Seed \$20M/);

const unfunded = retrieveAsk("unfunded penn founders");
assert.ok(unfunded.length > 0);
assert.ok(unfunded.every((hit) => hit.kind === "person" && hit.campuses.includes("univ_penn")));
assert.ok(unfunded.every((hit) => /recorded: no recorded funding/.test(hit.detail)));
for (const name of ["Rohan Parikh", "Albert Katz", "Toby Hirsch"]) {
  assert.equal(unfunded.some((hit) => hit.name === name), false, name);
}

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
