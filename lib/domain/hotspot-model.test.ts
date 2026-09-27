// Directory name matching. No database.

import assert from "node:assert/strict";
import fs from "node:fs";
import { CAMPUSES, compareCampusLabels } from "./campuses";
import { loadHotspotEvents } from "./hotspot-dates";
import { campusFilterLabels, cardsFromRows, hasPhrase, matchPhrases, normHotspotName, parseCsv, samePlace, sortGroupFor } from "./hotspot-model";

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
const events = loadHotspotEvents();
assert.ok(events.length >= 30);
assert.equal(events[0]?.where, "Penn");
assert.match(events[0]?.url ?? "", /^https:\/\//);

console.log("hotspot-model tests ok");
