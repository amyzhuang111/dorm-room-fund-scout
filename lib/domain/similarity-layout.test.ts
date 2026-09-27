import assert from "node:assert/strict";
import { clubTypeKey, cosineSimilarity, nearestSimilar, relaxSimilarity, similarityVectors, type SimilarityFacts } from "./similarity-layout";

assert.equal(clubTypeKey("Cal Hacks"), "hackathon");
assert.equal(clubTypeKey("Y Combinator"), "accelerator");
assert.equal(clubTypeKey("Penn Electric Racing"), "hardware");
assert.equal(clubTypeKey("Entrepreneurs @ Berkeley"), "entrepreneurship");

const shared = new Map([
  ["p:yc", Math.SQRT1_2],
  ["s:ai", Math.SQRT1_2],
]);
const same = new Map([
  ["p:yc", Math.SQRT1_2],
  ["s:ai", Math.SQRT1_2],
]);
const other = new Map([["p:hardware", 1]]);
assert.ok(Math.abs(cosineSimilarity(shared, same) - 1) < 1e-9);
assert.equal(cosineSimilarity(shared, other), 0);
assert.equal(cosineSimilarity(new Map(), shared), 0);

const facts: SimilarityFacts = {
  nodes: [
    { id: "mit", type: "campus" },
    { id: "stanford", type: "campus" },
    { id: "art", type: "campus" },
    { id: "ada", type: "person" },
    { id: "grace", type: "person" },
    { id: "poet", type: "person" },
    { id: "yc", type: "program", label: "Y Combinator", hub: true },
    { id: "lab", type: "organization", label: "Robotics Lab", hub: true },
    { id: "quip", type: "startup", sector: "AI" },
    { id: "verse", type: "startup", sector: "Media" },
    { id: "sequoia", type: "investor", label: "Sequoia", hub: true },
  ],
  edges: [
    { source: "ada", target: "yc", type: "member_of" },
    { source: "grace", target: "yc", type: "member_of" },
    { source: "poet", target: "lab", type: "member_of" },
    { source: "ada", target: "quip", type: "founded" },
    { source: "poet", target: "verse", type: "founded" },
    { source: "sequoia", target: "quip", type: "invested_in" },
  ],
  primaryCampus: new Map([
    ["ada", "mit"],
    ["grace", "stanford"],
    ["poet", "art"],
    ["quip", "mit"],
    ["verse", "art"],
  ]),
};

const vectors = similarityVectors(facts);
assert.ok((vectors.get("mit")?.size ?? 0) > 0);
assert.ok((vectors.get("stanford")?.size ?? 0) > 0);
const mitStanford = cosineSimilarity(vectors.get("mit")!, vectors.get("stanford")!);
const mitArt = cosineSimilarity(vectors.get("mit")!, vectors.get("art")!);
assert.ok(mitStanford > mitArt, `shared program should outrank an unrelated campus (${mitStanford} vs ${mitArt})`);
assert.ok(cosineSimilarity(vectors.get("mit")!, vectors.get("yc")!) > cosineSimilarity(vectors.get("art")!, vectors.get("yc")!));

const links = nearestSimilar(["mit", "stanford", "art"], vectors, 2, 0.15);
assert.ok(links.some((link) => [link.a, link.b].sort().join() === ["mit", "stanford"].join()));

const points = [
  { id: "mit", x: 0, y: 0, r: 12 },
  { id: "stanford", x: 220, y: 0, r: 12 },
  { id: "art", x: 0, y: 220, r: 12 },
];
relaxSimilarity(points, [{ a: "mit", b: "stanford", sim: 0.95 }], { iterations: 40, anchor: 0.2, spring: 0.55 });
const between = (a: (typeof points)[number], b: (typeof points)[number]) => Math.hypot(a.x - b.x, a.y - b.y);
const mit = points.find((point) => point.id === "mit")!;
const stanford = points.find((point) => point.id === "stanford")!;
const art = points.find((point) => point.id === "art")!;
assert.ok(between(mit, stanford) < 180, `similar campuses should close (${between(mit, stanford)})`);
assert.ok(between(mit, art) > between(mit, stanford));
assert.ok(Math.hypot(art.x, art.y - 220) < 1);
assert.ok(between(mit, stanford) >= mit.r + stanford.r);

const stacked = [
  { id: "a", x: 0, y: 0, r: 20 },
  { id: "b", x: 0, y: 0, r: 20 },
];
relaxSimilarity(stacked, [{ a: "a", b: "b", sim: 1 }], { iterations: 20, anchor: 0.05, spring: 0.2 });
assert.ok(between(stacked[0], stacked[1]) >= 40);

console.log("similarity layout tests ok");
