import assert from "node:assert/strict";
import { featuredNationalKey } from "./featured-national";
import { CAMPUS_LABEL_MIN_MEMBERS, LABEL_CLUB, bundleInk, bundleOpacity, bundleWidth, campusHubDegreeFloor, labelDegreeFloor, labelScreenPx, neighborhoodView, nodeColor, openingCameraRatio, openingZoomRatio, programLineColor, readableInk, selectVisibleLabels, zoomSizeFactor } from "../../components/network-style";
import { REGIONS, campusShade, packRegionCenters, regionForCampus, regionSwatch } from "./network-regions";

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const value = Number.parseInt(hex.slice(1), 16);
  const red = ((value >> 16) & 255) / 255;
  const green = ((value >> 8) & 255) / 255;
  const blue = (value & 255) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const light = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { h: 0, s: 0, l: light * 100 };
  const sat = delta / (1 - Math.abs(2 * light - 1));
  let hue = 0;
  if (max === red) hue = ((green - blue) / delta) % 6;
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  hue = (hue * 60 + 360) % 360;
  return { h: hue, s: sat * 100, l: light * 100 };
}

const hueOf = (id: string) => hexToHsl(regionSwatch(id)).h;
assert.ok(hueOf("philly") <= 14 || hueOf("philly") >= 350, `philly ${hueOf("philly")}`);
assert.ok(hueOf("ny") >= 32 && hueOf("ny") <= 52, `ny ${hueOf("ny")}`);
assert.ok(hueOf("boston") >= 200 && hueOf("boston") <= 230, `boston ${hueOf("boston")}`);
assert.ok(hueOf("west") >= 125 && hueOf("west") <= 165, `west ${hueOf("west")}`);
assert.ok(hueOf("international") >= 255 && hueOf("international") <= 295, `international ${hueOf("international")}`);

const siblings = [
  { id: "univ_penn", label: "Penn" },
  { id: "univ_duke", label: "Duke" },
  { id: "univ_cmu", label: "CMU" },
  { id: "univ_emory", label: "Emory" },
  { id: "univ_stanford", label: "Stanford" },
  { id: "univ_berkeley", label: "Berkeley" },
  { id: "univ_mit", label: "MIT" },
  { id: "univ_harvard", label: "Harvard" },
  { id: "univ_columbia", label: "Columbia" },
  { id: "univ_nyu", label: "NYU" },
  { id: "univ_toronto", label: "Toronto" },
  { id: "univ_cambridge", label: "Cambridge" },
];

const philly = siblings.filter((campus) => ["univ_penn", "univ_duke", "univ_cmu", "univ_emory"].includes(campus.id));
const ordered = [...philly].sort((a, b) => a.label.localeCompare(b.label));
const lights = ordered.map((campus) => hexToHsl(campusShade(campus.id, campus.label, siblings)).l);
for (let i = 1; i < lights.length; i++) assert.ok(lights[i] < lights[i - 1] - 2, lights.join(","));

for (const campus of siblings) {
  const hex = campusShade(campus.id, campus.label, siblings);
  const hsl = hexToHsl(hex);
  const value = Number.parseInt(hex.slice(1), 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  assert.ok(hsl.l >= 32 && hsl.l <= 72, `${campus.label} ${hex} L${hsl.l}`);
  assert.ok(red + green + blue > 90, `${campus.label} too dark ${hex}`);
  assert.notEqual(hex.toLowerCase(), "#000000");
}

const penn = hexToHsl(campusShade("univ_penn", "Penn", siblings));
const duke = hexToHsl(campusShade("univ_duke", "Duke", siblings));
assert.ok(Math.abs(penn.h - duke.h) < 2);
assert.ok(Math.abs(penn.s - duke.s) >= 8 || Math.abs(penn.l - duke.l) >= 4);

const hues = REGIONS.map((region) => hueOf(region.id));
for (let i = 0; i < hues.length; i++) {
  for (let j = i + 1; j < hues.length; j++) {
    const gap = Math.min(Math.abs(hues[i] - hues[j]), 360 - Math.abs(hues[i] - hues[j]));
    assert.ok(gap >= 28, `${REGIONS[i].id} and ${REGIONS[j].id} too close`);
  }
}

const campusColors = new Map(siblings.map((campus) => [campus.id, campusShade(campus.id, campus.label, siblings)]));
const person = nodeColor({ type: "person", campus: "univ_penn", id: "p1" }, campusColors);
assert.match(person, /^rgba\(/);
assert.doesNotMatch(person, /156,\s*163,\s*175/);
const investor = nodeColor({ type: "investor", campus: null, id: "inv", rimBand: "outer", rimTier: "S" }, campusColors);
assert.match(investor, /75,\s*85,\s*99/);
const second = nodeColor({ type: "organization", campus: null, id: "z", rimBand: "outer", rimTier: "A" }, campusColors);
assert.match(second, /156,\s*163,\s*175/);

const pennShade = campusShade("univ_penn", "Penn", siblings);
const club = nodeColor({ type: "organization", campus: null, homeCampus: "univ_penn", id: "labs", rimBand: "inward" }, campusColors);
assert.match(club, /^rgba\(/);
assert.doesNotMatch(club, /196,\s*201,\s*209/);
assert.ok(club.includes(String(Number.parseInt(pennShade.slice(1, 3), 16))));
const ink = readableInk(pennShade);
const inkValue = Number.parseInt(ink.slice(1), 16);
const inkRed = (inkValue >> 16) & 255;
const inkGreen = (inkValue >> 8) & 255;
const inkBlue = inkValue & 255;
const linear = (channel: number) => {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};
const luminance = 0.2126 * linear(inkRed) + 0.7152 * linear(inkGreen) + 0.0722 * linear(inkBlue);
assert.ok(1.05 / (luminance + 0.05) >= 4.5, ink);
assert.notEqual(ink.toLowerCase(), "#000000");
assert.notEqual(ink.toLowerCase(), "#111111");

assert.equal(regionForCampus("univ_uva", "University of Virginia"), "philly");
assert.equal(regionForCampus("univ_waterloo", "University of Waterloo"), "boston");
assert.equal(regionForCampus("univ_toronto", "University of Toronto"), "boston");
assert.equal(regionForCampus("univ_queens", "Queen's University"), "international");

const uva = hexToHsl(campusShade("univ_uva", "University of Virginia", siblings));
assert.ok(uva.h <= 18 || uva.h >= 345, `uva ${uva.h}`);
const waterlooHue = hexToHsl(campusShade("univ_waterloo", "University of Waterloo", siblings)).h;
assert.ok(waterlooHue >= 200 && waterlooHue <= 230, `waterloo ${waterlooHue}`);
const torontoHue = hexToHsl(campusShade("univ_toronto", "University of Toronto", siblings)).h;
assert.ok(torontoHue >= 200 && torontoHue <= 230, `toronto ${torontoHue}`);

assert.ok(LABEL_CLUB >= 11);
assert.equal(campusHubDegreeFloor(1), 8);
assert.equal(campusHubDegreeFloor(0.5), 8);
assert.equal(campusHubDegreeFloor(0.3), 4);
assert.equal(campusHubDegreeFloor(0.1), 1);

assert.equal(openingCameraRatio(1), 0.9);
assert.ok(openingCameraRatio(1) < 1);
assert.ok(Math.abs(openingZoomRatio(0.9) - 0.46) < 1e-9);
assert.ok(openingZoomRatio(0.9) < openingCameraRatio(1));
assert.equal(openingZoomRatio(0.2), 0.18);
assert.equal(labelDegreeFloor(0.9), 1_000_000);
assert.equal(labelDegreeFloor(0.4), 24);
assert.equal(labelDegreeFloor(0.12), 3);
assert.equal(labelDegreeFloor(0.05), 1);
assert.ok(labelDegreeFloor(0.2) < labelDegreeFloor(0.4));

assert.equal(zoomSizeFactor(0.8, 0.8), 1);
assert.ok(Math.abs(zoomSizeFactor(0.4, 0.8) - 0.5) < 1e-9);
assert.equal(zoomSizeFactor(0.02, 0.8), 0.1);

assert.equal(labelScreenPx(12, 0.8, 0.8), 12);
assert.equal(labelScreenPx(12, 0.2, 0.8), 12);
assert.equal(labelScreenPx(13, 0.05, 0.9), 13);
assert.ok(labelScreenPx(8, 0.2, 0.8) >= 11);
assert.ok(labelScreenPx(40, 0.2, 0.8) <= 15);

const neighborhood = neighborhoodView(
  [
    { x: 0.42, y: 0.4 },
    { x: 0.5, y: 0.47 },
  ],
  0.9,
);
assert.ok(neighborhood.ratio < 0.9);
assert.ok(neighborhood.ratio > 0.05);
assert.ok(neighborhood.x > 0.42 && neighborhood.x < 0.5);
const tightNeighborhood = neighborhoodView([{ x: 0.5, y: 0.5 }], 0.9);
assert.ok(tightNeighborhood.ratio < 0.2);
assert.ok(tightNeighborhood.ratio >= 0.05);

const measure = (text: string, fontSize: number) => text.length * fontSize * 0.5;
const placed = selectVisibleLabels(
  [
    { id: "penn", tier: 5, degree: 400, text: "Penn", x: 100, y: 100, nodeSize: 9, marker: false, anchor: true, fontSize: 12 },
    { id: "labs", tier: 3, degree: 198, text: "Penn Labs", x: 100, y: 140, nodeSize: 2, marker: false, anchor: false, fontSize: LABEL_CLUB },
    { id: "clubs", tier: 3, degree: 33, text: "Penn Clubs", x: 108, y: 142, nodeSize: 2, marker: false, anchor: false, fontSize: LABEL_CLUB },
    { id: "sky", tier: 3, degree: 259, text: "SkyDeck", x: 420, y: 360, nodeSize: 2, marker: false, anchor: false, fontSize: LABEL_CLUB },
  ],
  measure,
);
assert.ok(placed.has("penn"));
assert.ok(placed.has("labs"));
assert.ok(!placed.has("clubs"));
assert.ok(placed.has("sky"));

const crowded = selectVisibleLabels(
  [
    { id: "mit", tier: 5, degree: 400, text: "MIT", x: 200, y: 200, nodeSize: 8, marker: false, anchor: true, fontSize: 12, discId: "mit", strictDiscs: true },
    { id: "harvard", tier: 5, degree: 200, text: "Harvard", x: 250, y: 200, nodeSize: 8, marker: false, anchor: true, fontSize: 12, discId: "harvard", strictDiscs: true },
    { id: "queen", tier: 5, degree: 20, text: "Queen's", x: 206, y: 198, nodeSize: 8, marker: false, anchor: true, fontSize: 12, discId: "queen", strictDiscs: true },
  ],
  measure,
  [],
  [
    { id: "mit", x: 200, y: 200, r: 18 },
    { id: "harvard", x: 250, y: 200, r: 16 },
    { id: "queen", x: 206, y: 198, r: 10 },
  ],
);
assert.ok(crowded.has("mit"));
assert.ok(crowded.has("harvard"));
for (const offset of crowded.values()) assert.ok(Math.hypot(offset.dx, offset.dy) <= 22);
const queen = crowded.get("queen");
assert.ok(!queen || Math.hypot(queen.dx, queen.dy) <= 22);

// A label whose upper slots are taken must not fall onto its own node.
const covered = selectVisibleLabels(
  [{ id: "pear", tier: 4, degree: 9, text: "Pear Fellows", x: 200, y: 200, nodeSize: 6, marker: false, anchor: true, fontSize: 12 }],
  measure,
  [{ left: 120, top: 150, right: 280, bottom: 176 }],
);
const pearOffset = covered.get("pear");
assert.ok(!pearOffset || !(pearOffset.dx === 0 && pearOffset.dy >= 10));

assert.equal(CAMPUS_LABEL_MIN_MEMBERS, 10);
const campusWins = selectVisibleLabels(
  [
    { id: "stanford", tier: 5, degree: 700, text: "Stanford", x: 100, y: 100, nodeSize: 9, marker: false, anchor: true, fontSize: 12, required: true },
    { id: "club", tier: 3, degree: 40, text: "Rice Business Plan Competition", x: 108, y: 108, nodeSize: 3, marker: false, anchor: true, fontSize: 11 },
  ],
  measure,
);
assert.ok(campusWins.has("stanford"));
assert.ok(!campusWins.has("club"));
const neighbors = selectVisibleLabels(
  [
    { id: "columbia", tier: 5, degree: 118, text: "Columbia", x: 200, y: 200, nodeSize: 8, marker: false, anchor: true, fontSize: 12, required: true },
    { id: "nyu", tier: 5, degree: 55, text: "NYU", x: 236, y: 200, nodeSize: 8, marker: false, anchor: true, fontSize: 12, required: true },
  ],
  measure,
);
assert.ok(neighbors.has("columbia"));
assert.ok(neighbors.has("nyu"));
for (const offset of neighbors.values()) assert.ok(Math.hypot(offset.dx, offset.dy) <= 32);

const ycLine = programLineColor("Y Combinator");
assert.equal(ycLine.toLowerCase(), "#ea580c");
assert.ok(bundleWidth(2) > bundleWidth(1));
assert.ok(bundleWidth(2) >= 1.1 && bundleWidth(2) < 1.35);
assert.ok(bundleWidth(64) > bundleWidth(8));
assert.equal(bundleWidth(4000), 3.25);
assert.ok(bundleOpacity(1) < bundleOpacity(8));
assert.ok(bundleOpacity(8) < bundleOpacity(64));
assert.ok(bundleOpacity(1) >= 0.32 && bundleOpacity(1) < 0.38);
assert.ok(bundleOpacity(64) > 0.78 && bundleOpacity(64) <= 0.84);
assert.equal(bundleInk(1), "rgba(32, 34, 38, 0.340)");

const packed = packRegionCenters(
  [
    { id: "philly", r: 80 },
    { id: "west", r: 90 },
    { id: "ny", r: 70 },
    { id: "boston", r: 85 },
    { id: "international", r: 28 },
  ],
  (id) =>
    ({
      philly: -Math.PI / 2,
      west: Math.PI,
      ny: 0.04,
      boston: Math.PI / 2,
      international: Math.PI * 0.75,
    })[id] ?? 0,
  4,
);
const at = (id: string) => packed.get(id)!;
assert.ok(at("boston").y > at("philly").y);
assert.ok(at("west").x < at("ny").x);
for (const [a, b] of [
  ["philly", "west"],
  ["philly", "ny"],
  ["boston", "west"],
  ["boston", "ny"],
  ["west", "international"],
] as const) {
  const dist = Math.hypot(at(a).x - at(b).x, at(a).y - at(b).y);
  const radii = { philly: 80, west: 90, ny: 70, boston: 85, international: 28 };
  assert.ok(dist + 1.5 >= radii[a] + radii[b] + 4, `${a}-${b} ${dist}`);
}
const intlGap = Math.hypot(at("international").x - at("west").x, at("international").y - at("west").y) - (90 + 28);
assert.ok(intlGap < 36, `international float ${intlGap}`);

assert.equal(featuredNationalKey("HF0 residency"), "hf0");
assert.equal(featuredNationalKey("a16z speedrun"), "speedrun");
assert.equal(featuredNationalKey("Pear Fellows"), "pear");
assert.equal(featuredNationalKey("Pear Garage"), null);
assert.equal(featuredNationalKey("Pear Dorm"), null);
assert.equal(featuredNationalKey("Neo Scholars"), "neo");
assert.equal(featuredNationalKey("Kleiner Perkins Fellows"), "kp");

console.log("region color tests ok");
