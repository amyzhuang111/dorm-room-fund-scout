// Directory name matching. No database.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { CAMPUSES, compareCampusLabels } from "./campuses";
import { loadHotspotEvents } from "./hotspot-dates";
import { campusFilterLabels, cardsFromRows, hasPhrase, matchPhrases, normHotspotName, ORG_ALIAS_PHRASES, parseCsv, samePlace, sortGroupFor } from "./hotspot-model";

assert.equal(samePlace("Jerome Fisher M&T", "Jerome Fisher Management & Technology"), true);
assert.equal(samePlace("M&T", "Jerome Fisher M&T"), true);
assert.equal(samePlace("Management & Technology", "Jerome Fisher M&T"), true);
assert.equal(samePlace("Penn Labs", "Stanford Labs"), false);
assert.equal(samePlace("Mayfield", "Mayfield Fellows Program"), true);
assert.equal(samePlace("Human Capital", "Human Capital Fellowship"), false);
assert.equal(samePlace("Prod", "Prod fellowship (prod.so)"), false);

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

const cards = cardsFromRows(parseCsv(fs.readFileSync(path.join(process.cwd(), "data", "imports", "campus_hotspots.csv"), "utf8")));
assert.equal(cards.some((card) => /pennapps organising team/i.test(card.place)), false);
assert.ok(cards.some((card) => card.tier === "D"));
assert.equal(cards.find((card) => card.place === "Pear Fellows")?.tier, "A");
assert.equal(cards.find((card) => card.place === "Pear Garage")?.tier, "B");
assert.ok(cards.find((card) => card.place === "Pear Garage")?.howToGetIn.includes("engineering students"));
assert.equal(cards.find((card) => card.place === "Human Capital Fellowship")?.tier, "A");
assert.equal(cards.find((card) => card.place.startsWith("Prod fellowship"))?.tier, "A");
assert.ok(cards.find((card) => card.place.startsWith("Prod fellowship"))?.url.startsWith("https://prod.so"));

const humanCapital = matchPhrases("Human Capital Fellowship");
assert.equal(humanCapital.includes("human capital"), false);
assert.equal(humanCapital.includes("human capital fellowship"), false);
const prod = matchPhrases("Prod fellowship (prod.so)");
assert.ok(prod.includes("prod fellowship"));
assert.equal(prod.includes("prod"), false);
assert.ok(ORG_ALIAS_PHRASES["human capital fellowship"]?.includes("delta fellowship"));
assert.ok(ORG_ALIAS_PHRASES["human capital fellowship"]?.includes("hc fellowship"));

assert.equal(sortGroupFor("Penn", "campus"), 0);
assert.equal(sortGroupFor("UC Berkeley", "campus"), 0);
assert.equal(sortGroupFor("Boston", "city"), 1);
assert.equal(sortGroupFor("Cross-campus programmes", "other"), 1);

const v3Ids = [
  "univ_stanford",
  "univ_berkeley",
  "univ_ucla",
  "univ_usc",
  "univ_uw",
  "univ_caltech",
  "univ_hmc",
  "univ_penn",
  "univ_unc",
  "univ_duke",
  "univ_georgetown",
  "univ_emory",
  "univ_cmu",
  "univ_princeton",
  "univ_gatech",
  "univ_vanderbilt",
  "univ_uva",
  "univ_lafayette",
  "univ_columbia",
  "univ_nyu",
  "univ_cornell",
  "univ_cornell_tech",
  "univ_yale",
  "univ_northwestern",
  "univ_uchicago",
  "univ_uiuc",
  "univ_michigan",
  "univ_washu",
  "univ_notredame",
  "univ_utexas",
  "univ_rice",
  "univ_mit",
  "univ_harvard",
  "univ_dartmouth",
  "univ_bu",
  "univ_brown",
  "univ_waterloo",
  "univ_toronto",
  "univ_laurentian",
  "univ_queens",
  "univ_cambridge",
];
for (const id of v3Ids) assert.ok(CAMPUSES.some((campus) => campus.id === id), id);

const labels = CAMPUSES.map((campus) => campus.shortLabel).sort(compareCampusLabels);
assert.deepEqual(
  labels,
  [...labels].sort(compareCampusLabels),
);
assert.notEqual(labels[0], "Penn");
assert.ok(labels.indexOf("Penn") > 0);
assert.ok(labels.indexOf("Berkeley") !== 1 || labels[0] !== "Penn");

const filters = campusFilterLabels(
  [
    { campus: "Penn", campusId: "univ_penn", placeKind: "campus" },
    { campus: "UC Berkeley", campusId: "univ_berkeley", placeKind: "campus" },
    { campus: "San Francisco", campusId: null, placeKind: "city" },
    { campus: "Boston", campusId: null, placeKind: "city" },
    { campus: "Cross-campus programmes", campusId: null, placeKind: "other" },
  ],
  [
    { id: "univ_penn", name: "University of Pennsylvania" },
    { id: "univ_berkeley", name: "University of California, Berkeley" },
    { id: "univ_brown", name: "Brown University" },
  ],
);
assert.deepEqual(filters.campuses, ["Brown", "Penn", "UC Berkeley"]);
assert.deepEqual(filters.cities, ["Boston", "San Francisco"]);
assert.deepEqual(filters.programmes, ["Cross-campus programmes"]);
assert.ok(filters.campuses.indexOf("Penn") > filters.campuses.indexOf("Brown"));

const directory = cardsFromRows(parseCsv(fs.readFileSync("data/imports/campus_hotspots.csv", "utf8")));
assert.equal(directory.some((card) => /pennapps organ/i.test(card.place)), false);
const mayfieldCard = directory.find((card) => card.place.startsWith("Mayfield Fellows"));
assert.equal(mayfieldCard?.tier, "S");
assert.ok(mayfieldCard?.tierRationale);
const foundersInc = directory.find((card) => card.place === "Founders Inc" && card.campus === "San Francisco");
const southPark = directory.find((card) => card.place === "South Park Commons" && card.campus === "San Francisco");
assert.equal(foundersInc?.tier, "A");
assert.equal(southPark?.tier, "A");
assert.match(foundersInc?.url ?? "", /^https:\/\/f\.inc\/?$/);
assert.match(southPark?.url ?? "", /^https:\/\/www\.southparkcommons\.com\/?$/);
assert.equal(directory.find((card) => card.place === "Emergent Ventures")?.tier, "B");
assert.equal(directory.find((card) => card.place === "1517 Medici Project")?.tier, "B");
assert.equal(directory.find((card) => card.place === "Buildspace")?.tier, "C");
assert.equal(directory.find((card) => card.place === "Afore FIR U")?.tier, "A");
assert.equal(directory.find((card) => card.place === "Pioneer")?.tier, "B");
assert.equal(directory.find((card) => card.place === "Z Fellows")?.tier, "A");
assert.equal(directory.find((card) => card.place.startsWith("The Residency (founder houses)"))?.tier, "B");
assert.match(directory.find((card) => card.place.startsWith("The Residency (founder houses)"))?.url ?? "", /livetheresidency\.com\/residencies$/);
assert.equal(directory.find((card) => card.place === "AGI House SF")?.tier, "A");
assert.equal(directory.find((card) => card.place === "HF0 residency" && card.campus === "San Francisco")?.tier, "A");
assert.equal(directory.find((card) => card.place === "Frontier Tower" && card.campus === "San Francisco")?.tier, "B");
assert.equal(directory.find((card) => card.place === "FoundHer House" && card.campus === "San Francisco")?.tier, "B");
assert.equal(directory.find((card) => card.place === "Yale Hacker House")?.tier, "A");
assert.equal(directory.find((card) => card.place === "Farmhouse" && card.campus === "Stanford")?.tier, "A");
assert.equal(directory.find((card) => card.place === "Georgia Tech Hacker House")?.tier, "A");
assert.equal(directory.find((card) => card.place === "Rice Residency")?.tier, "B");
assert.equal(directory.find((card) => card.place === "Playa House")?.tier, "A");
assert.equal(directory.find((card) => card.place === "Harvard St. Commons" && card.campus === "Boston")?.tier, "A");
assert.equal(directory.filter((card) => card.place === "AGI House SF").length, 2);
const events = loadHotspotEvents();
assert.ok(events.length >= 30);
assert.equal(events[0]?.where, "Penn");
assert.match(events[0]?.url ?? "", /^https:\/\//);

console.log("hotspot-model tests ok");
