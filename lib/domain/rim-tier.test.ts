import assert from "node:assert/strict";
import { screenSize } from "../../components/network-style";
import type { MapNode } from "./network-map";
import { demoteDuplicateOuter, rimBandFor, rimPlacementFor } from "./rim-tier";

const band = (label: string, nodeType: string, degree: number) => rimBandFor({ label, nodeType, degree });

assert.equal(band("Thiel Fellowship", "organization", 58), "outer");
assert.equal(band("Y Combinator", "organization", 1490), "outer");
assert.equal(band("Neo Scholars", "organization", 106), "outer");
assert.equal(band("Z Fellows", "organization", 2), "outer");
assert.equal(rimPlacementFor({ label: "Z Fellows", nodeType: "organization", degree: 2 })?.tier, "A");
assert.equal(rimPlacementFor({ label: "Thiel Fellowship", nodeType: "organization", degree: 58 })?.tier, "S");
assert.equal(rimPlacementFor({ label: "Y Combinator", nodeType: "organization", degree: 1490 })?.tier, "S");
assert.equal(rimPlacementFor({ label: "South Park Commons", nodeType: "investor", degree: 6 })?.tier, "S");
assert.equal(rimPlacementFor({ label: "Emergent Ventures", nodeType: "organization", degree: 4 })?.tier, "S");
assert.equal(rimPlacementFor({ label: "HF0", nodeType: "investor", degree: 3 })?.tier, "S");
assert.equal(band("a16z speedrun", "organization", 236), "outer");
assert.equal(band("a16z Speedrun", "investor", 94), "outer");
assert.equal(band("Mayfield Fellows Program", "organization", 332), "outer");
assert.equal(band("Kleiner Perkins Fellows", "organization", 2), "outer");
assert.equal(band("South Park Commons", "investor", 6), "outer");
assert.equal(band("Emergent Ventures", "organization", 4), "outer");
assert.equal(band("HF0", "investor", 3), "outer");
assert.equal(band("HF0 Residency", "program", 3), "outer");

assert.equal(band("Berkeley SkyDeck", "organization", 259), "inward");
assert.equal(band("Berkeley SkyDeck Demo Day", "organization", 259), "inward");
assert.equal(band("Berkeley SkyDeck", "investor", 244), "inward");
assert.equal(band("UC LAUNCH", "organization", 44), "inward");
assert.equal(band("UC LAUNCH", "investor", 35), "inward");
assert.equal(band("Cal Hacks organising team", "organization", 160), "inward");
assert.equal(band("TreeHacks organising team", "organization", 39), "inward");
assert.equal(band("PennApps organising team", "organization", 40), "inward");
assert.equal(band("Penn Labs", "organization", 198), "inward");
assert.equal(band("VIP-X accelerator", "organization", 488), "inward");
assert.equal(band("Free Ventures", "organization", 42), "inward");
assert.equal(band("delta v", "organization", 74), "inward");
assert.equal(band("MIT delta v", "program", 40), "inward");
assert.equal(band("StartX", "organization", 24), "inward");
assert.equal(band("Venture Lab Startup Challenge", "organization", 218), "inward");

assert.equal(band("Jerome Fisher M&T", "organization", 52), null);
assert.equal(band("Dorm Room Fund", "investor", 400), null);
assert.equal(band("Z Fellows", "organization", 1), null);
assert.equal(band("Cal Hacks organising team", "organization", 8), null);
assert.equal(band("Ada Lovelace", "person", 4), null);

const nodes = [
  { id: "org", type: "organization", label: "Y Combinator", rimBand: "outer" as const },
  { id: "inv", type: "investor", label: "Y Combinator", rimBand: "outer" as const },
];
demoteDuplicateOuter(nodes, new Map([["org", 1490], ["inv", 232]]));
assert.equal(nodes[0].rimBand, "outer");
assert.equal(nodes[1].rimBand, "inward");

const sized = (rimTier: "S" | "A"): number =>
  screenSize({ type: "organization", rimBand: "outer", rimTier, signalScore: 0.4 } as MapNode);
assert.ok(sized("S") > sized("A") + 0.8);

console.log("rim-tier tests ok");
