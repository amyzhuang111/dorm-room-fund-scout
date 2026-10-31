import assert from "node:assert/strict";
import {
  awardYearPlausible,
  detectPrecollegeMentions,
  independentCollegeGradYear,
  judgePrecollegeMention,
  matchesPrecollegeFilter,
  precollegeRankBoost,
  type PrecollegeSignalView,
} from "./precollege";

const hackathon = "Team member on ACTA AI (HackPrinceton Spring '26 Winner AI & Tech for Clinical Trials by Regeneron [Cash Prizes])";
assert.deepEqual(detectPrecollegeMentions(hackathon), []);

const contestant = "Amine Oueslati, a student in the Jerome Fisher M&T Program at the University of Pennsylvania, was an international contestant in the 2021 and 2022 IOI";
assert.deepEqual(detectPrecollegeMentions(contestant), []);

const ioi = "Agastya Goel earned International Olympiad in Informatics gold medals in 2023 and 2024 and is at MIT";
const ioiHits = detectPrecollegeMentions(ioi);
assert.equal(ioiHits.length, 1);
assert.equal(ioiHits[0].signalType, "ioi_medal");
assert.deepEqual(ioiHits[0].years, [2023, 2024]);
assert.equal(ioiHits[0].tier, 1);

const usamo = "Joshua Wang, Stanford dropout. Top 250 united states (USAMO) Qualifier, USACO Platinum.";
const usamoHits = detectPrecollegeMentions(usamo);
assert.ok(usamoHits.some((hit) => hit.signalType === "usamo_qualifier" && hit.tier === 1));
assert.ok(usamoHits.some((hit) => hit.signalType === "usaco_platinum" && hit.tier === 2 && hit.label.startsWith("USACO Platinum")));

const finalist = "Aaron Chew. Columbia CS Dropout. USACO Finalist, top 20 programmers in the USA.";
const finalistHits = detectPrecollegeMentions(finalist);
assert.equal(finalistHits[0].label, "USACO finalist");
assert.equal(finalistHits[0].tier, 2);

assert.equal(detectPrecollegeMentions("studied AIME problems for fun").length, 0);
assert.equal(detectPrecollegeMentions("AIME qualifier in 2021, Alex Kim").length, 1);

assert.equal(detectPrecollegeMentions("Left MIT as freshmen (ISEF circuit); Code Four").length, 0);
assert.equal(detectPrecollegeMentions("Won an ISEF grand award in 2019, Priya Shah").length, 1);

assert.equal(detectPrecollegeMentions("attended Georgia Tech on a scholarship described as LATAM’s Thiel Fellowship").length, 0);
assert.equal(detectPrecollegeMentions("The 2026 Thiel Fellows include: Aubrey Niederhoffer · Swoop").length, 1);

assert.equal(detectPrecollegeMentions("IOAI absolute winner").length, 0);

const sts = "Amanrai Singh Kahlon of Sanford School is a Regeneron STS finalist";
assert.equal(detectPrecollegeMentions(sts)[0].signalType, "regeneron_sts_finalist");
assert.equal(detectPrecollegeMentions(sts)[0].label, "Regeneron STS finalist");

assert.equal(independentCollegeGradYear("On Leave From MIT International Physics Olympiad '22 medalist.", 2022), null);
assert.equal(independentCollegeGradYear("The Harvard Crimson lists Robert S. Wachen '24 among Harvard students awarded a Thiel Fellowship.", 2024), 2024);

const confirmed = judgePrecollegeMention({
  personName: "Robert Wachen",
  excerpt: "The Harvard Crimson lists Robert S. Wachen '24 among Harvard students awarded $100,000 Thiel Fellowship grants in 2024.",
  mention: detectPrecollegeMentions("The Harvard Crimson lists Robert S. Wachen '24 among Harvard students awarded $100,000 Thiel Fellowship grants in 2024.")[0],
  collegeGradYear: 2024,
  universityIds: ["univ_harvard"],
});
assert.equal(confirmed.ok, true);
if (confirmed.ok) {
  assert.equal(confirmed.matchStatus, "confirmed");
  assert.equal(confirmed.label, "Thiel Fellow 2024");
}

const likely = judgePrecollegeMention({
  personName: "Jessica Wan",
  excerpt: "MIT Math + CS student Jessica Wan, IMO '24 Gold Medallist (LinkedIn/MAA via search index)",
  mention: detectPrecollegeMentions("MIT Math + CS student Jessica Wan, IMO '24 Gold Medallist (LinkedIn/MAA via search index)")[0],
  collegeGradYear: null,
  universityIds: ["univ_mit"],
});
assert.equal(likely.ok, true);
if (likely.ok) assert.equal(likely.matchStatus, "likely");

const unnamed = judgePrecollegeMention({
  personName: "Charlie Wu",
  excerpt: "Thiel Fellow, Cornell dropout; Orchard Robotics $22M Series A (2025)",
  mention: detectPrecollegeMentions("Thiel Fellow, Cornell dropout; Orchard Robotics $22M Series A (2025)")[0],
  collegeGradYear: null,
  universityIds: [],
});
assert.equal(unnamed.ok, false);

const implausible = judgePrecollegeMention({
  personName: "Bilal Asmatullah",
  excerpt: "Bilal Asmatullah, On Leave From MIT. International Physics Olympiad '22 medalist.",
  mention: detectPrecollegeMentions("Bilal Asmatullah, On Leave From MIT. International Physics Olympiad '22 medalist.")[0],
  collegeGradYear: 2010,
  universityIds: ["univ_mit"],
});
assert.equal(implausible.ok, false);

const gavin = "The Harvard Crimson (March 27, 2024) lists Gavin J. Uberti '25 among Harvard students awarded a Thiel Fellowship.";
assert.deepEqual(detectPrecollegeMentions(gavin)[0].years, [2024]);

assert.equal(awardYearPlausible("regeneron_sts_finalist", 2024, 2028), "plausible");
assert.equal(awardYearPlausible("imo_medal", 2024, 2022), "implausible");

const tier1: PrecollegeSignalView = {
  signalType: "usamo_qualifier",
  tier: 1,
  label: "USAMO 2022",
  year: 2022,
  matchStatus: "likely",
  sourceUrl: "https://example.com/usamo",
};
const tier2: PrecollegeSignalView = {
  signalType: "aime_qualifier",
  tier: 2,
  label: "AIME 2021",
  year: 2021,
  matchStatus: "confirmed",
  sourceUrl: "https://example.com/aime",
};
assert.ok(precollegeRankBoost([tier1]) > precollegeRankBoost([tier2]));
assert.equal(matchesPrecollegeFilter([tier2], "1"), false);
assert.equal(matchesPrecollegeFilter([tier2], "2"), true);
assert.equal(matchesPrecollegeFilter([], "any"), false);

console.log("precollege tests ok");
