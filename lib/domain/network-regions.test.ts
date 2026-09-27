import assert from "node:assert/strict";
import { nodeColor, readableInk } from "../../components/network-style";
import { REGIONS, campusShade, regionForCampus, regionSwatch } from "./network-regions";

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

console.log("region color tests ok");
