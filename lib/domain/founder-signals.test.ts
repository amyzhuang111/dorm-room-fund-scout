import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { FOUNDER_SIGNAL_TIERS, founderSignalsForCampus, loadFounderSignals } from "./founder-signals";
import { cardsFromRows, hotspotPages, normHotspotName, parseCsv } from "./hotspot-model";

const rows = loadFounderSignals();
assert.ok(rows.length >= 15, `expected at least 15 signals, got ${rows.length}`);
const seen = new Set<string>();
for (const row of rows) {
  assert.ok(row.signal.length >= 3, row.signal);
  assert.ok(row.campus.length > 2, row.campus);
  assert.ok(FOUNDER_SIGNAL_TIERS.includes(row.tier as (typeof FOUNDER_SIGNAL_TIERS)[number]), `${row.campus} ${row.signal} tier ${row.tier}`);
  assert.ok(row.why.length > 40, row.signal);
  assert.ok(row.sources.length >= 1, row.signal);
  for (const url of row.sources) assert.ok(url.startsWith("https://"), url);
  if (row.officialLink) assert.ok(row.officialLink.startsWith("https://"), row.officialLink);
  const key = `${row.campus}::${normHotspotName(row.signal)}`;
  assert.ok(!seen.has(key), `duplicate signal ${row.campus} ${row.signal}`);
  seen.add(key);
}

const penn = rows.filter((row) => row.campus === "Penn");
const berkeley = rows.filter((row) => row.campus === "UC Berkeley");
assert.ok(penn.length >= 8, `penn signals ${penn.length}`);
assert.ok(berkeley.length >= 5, `berkeley signals ${berkeley.length}`);
assert.equal(founderSignalsForCampus(rows, "Penn").length, penn.length);
assert.equal(founderSignalsForCampus(rows, "UC Berkeley").length, berkeley.length);
assert.equal(founderSignalsForCampus(rows, "").length, 0);

const directory = cardsFromRows(parseCsv(fs.readFileSync(path.join(process.cwd(), "data", "imports", "campus_hotspots.csv"), "utf8")));
const pages = hotspotPages(directory);
const places = new Map<string, Set<string>>();
for (const card of directory) {
  const set = places.get(card.campus) ?? new Set<string>();
  set.add(normHotspotName(card.place));
  places.set(card.campus, set);
}
// The first Penn and Berkeley notes predate this pass and sometimes name a
// program that is also a hotspot card. New rows must not do that.
const legacySignals = new Set([
  "Wharton Analytics Fellows",
  "Wharton AI & Analytics student leaders",
  "Jerome Fisher M&T",
  "Huntsman Program",
  "Vagelos Life Sciences and Management (LSM)",
  "VIP Peer Advisors",
  "Weiss Tech House",
  "Penn Blockchain",
  "AI@Penn",
  "Penn Labs",
  "GRASP Laboratory",
  "Venture Lab as a room not a talent filter",
  "Management Entrepreneurship and Technology (M.E.T.)",
  "Entrepreneurs@Berkeley",
  "Machine Learning at Berkeley and Launchpad",
  "AI Entrepreneurs at Berkeley and Free Ventures",
  "Codebase at Berkeley",
  "PlexTech",
  "Berkeley cofounder matching",
]);
for (const row of rows) {
  if (legacySignals.has(row.signal)) continue;
  const campusPlaces = places.get(row.campus);
  assert.ok(campusPlaces, `unknown campus ${row.campus}`);
  assert.ok(!campusPlaces.has(normHotspotName(row.signal)), `signal repeats a hotspot: ${row.campus} / ${row.signal}`);
}

for (const page of pages) {
  if (page.placeKind === "other") continue;
  const count = founderSignalsForCampus(rows, page.campus).length;
  const minimum = page.placeKind === "city" ? 1 : 3;
  assert.ok(count >= minimum, `${page.campus} has ${count} founder signals`);
}

console.log(`founder-signals tests ok (${rows.length} rows)`);
