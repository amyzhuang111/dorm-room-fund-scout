import assert from "node:assert/strict";
import { campusSlug, resolveCampusSlug } from "./campuses";
import { buildScoutNetwork } from "./network";
import { layoutCampusGraph, selectNonOverlappingLabels } from "./network-layout";

assert.equal(resolveCampusSlug("penn"), "univ_penn");
assert.equal(resolveCampusSlug("Penn"), "univ_penn");
assert.equal(resolveCampusSlug("univ_penn"), "univ_penn");
assert.equal(resolveCampusSlug("berkeley"), "univ_berkeley");
assert.equal(resolveCampusSlug("uc-berkeley"), "univ_berkeley");
assert.equal(resolveCampusSlug("UC Berkeley"), "univ_berkeley");
assert.equal(resolveCampusSlug("georgia-tech"), "univ_gatech");
assert.equal(campusSlug("Queen's"), "queens");
assert.equal(resolveCampusSlug("not-a-campus"), undefined);

for (const id of ["univ_penn", "univ_berkeley"] as const) {
  const graph = buildScoutNetwork(id);
  const counts = Object.fromEntries(["university", "community", "person", "project"].map((type) => [type, graph.nodes.filter((node) => node.type === type).length]));
  assert.equal(counts.university, 1, id);
  assert.ok(counts.community >= 1, `${id} should keep clubs and programs`);
  const names = new Set(graph.nodes.map((node) => node.label));
  if (id === "univ_penn") assert.ok(names.has("Penn Labs") || names.has("Penn Electric Racing"));
  if (id === "univ_berkeley") assert.ok(names.has("Entrepreneurs @ Berkeley"));

  const hub = graph.nodes.find((node) => node.type === "university")!;
  const communities = graph.nodes.filter((node) => node.type === "community");
  const outside = communities.filter((node) => node.zone === "external");
  const inside = communities.filter((node) => node.zone === "internal");
  assert.ok(outside.length >= 5, `${id} outside zone`);
  assert.ok(inside.length >= 5, `${id} on-campus zone`);
  assert.ok(outside.every((node) => node.x < hub.x), `${id} outside nodes stay left of campus`);
  assert.ok(inside.every((node) => node.x > hub.x), `${id} on-campus nodes stay right of campus`);
  assert.ok((graph.guides ?? []).some((guide) => guide.text === "OUTSIDE"));
  assert.ok((graph.guides ?? []).some((guide) => guide.text === "ON CAMPUS"));
  if (id === "univ_berkeley") {
    const tierOf = (pattern: RegExp) => communities.find((node) => pattern.test(node.label))?.tier;
    assert.equal(tierOf(/free ventures/i), "A");
    assert.equal(tierOf(/cal hacks/i), "B");
    assert.equal(tierOf(/skydeck/i), "C");
    const sBand = communities.filter((node) => node.zone === "internal" && node.tier === "S");
    const aBand = communities.filter((node) => node.zone === "internal" && node.tier === "A");
    if (sBand.length && aBand.length) {
      const mean = (rows: typeof sBand) => rows.reduce((sum, node) => sum + Math.hypot(node.x - hub.x, node.y - hub.y), 0) / rows.length;
      assert.ok(mean(sBand) < mean(aBand));
    }
  }
  const dist = (node: { x: number; y: number }) => Math.hypot(node.x - hub.x, node.y - hub.y);
  const communityDist = communities.reduce((sum, node) => sum + dist(node), 0) / communities.length;
  const outer = graph.nodes.filter((node) => node.type === "person" || node.type === "project");
  const outerDist = outer.reduce((sum, node) => sum + dist(node), 0) / Math.max(outer.length, 1);
  assert.ok(communityDist < outerDist, `${id} clubs should sit closer to campus than the average person or startup`);

  let minSep = Infinity;
  for (let i = 0; i < graph.nodes.length; i++) {
    for (let j = i + 1; j < graph.nodes.length; j++) {
      minSep = Math.min(minSep, Math.hypot(graph.nodes[i].x - graph.nodes[j].x, graph.nodes[i].y - graph.nodes[j].y));
    }
  }
  assert.ok(minSep >= 20, `${id} nodes overlap (${minSep})`);

  const bounds = graph.nodes.reduce(
    (box, node) => ({
      minX: Math.min(box.minX, node.x),
      maxX: Math.max(box.maxX, node.x),
      minY: Math.min(box.minY, node.y),
      maxY: Math.max(box.maxY, node.y),
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
  );
  const scale = 1000 / Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 1);
  const zoomLabels = (zoom: number) =>
    selectNonOverlappingLabels(
      graph.nodes
        .filter((node) => zoom >= 1.8 || node.type === "university" || node.type === "community" || (zoom >= 1.45 && node.type === "project"))
        .map((node) => ({
          id: node.id,
          text: node.label,
          x: (node.x - bounds.minX) * scale * zoom,
          y: (node.y - bounds.minY) * scale * zoom,
          priority: node.type === "university" ? 100 : node.type === "community" ? 80 : node.type === "project" ? 40 : 20,
        })),
    );
  const near = zoomLabels(1);
  const far = zoomLabels(2.4);
  assert.ok(near.includes(hub.id));
  assert.ok(near.some((id) => graph.nodes.find((node) => node.id === id)?.type === "community"));
  assert.ok(far.length >= near.length);
  console.log(id, counts, "minSep", minSep.toFixed(1), "labels", near.length, "→", far.length);
}

const placed = layoutCampusGraph(
  [
    { id: "u", type: "university", label: "Penn" },
    { id: "c", type: "community", label: "Penn Labs" },
    { id: "p", type: "person", label: "Ada" },
    { id: "s", type: "project", label: "Ada Co" },
  ],
  [
    { source: "c", target: "u", relationshipType: "affiliated_with" },
    { source: "p", target: "c", relationshipType: "contributed_to" },
    { source: "p", target: "s", relationshipType: "founded" },
  ],
);
assert.ok(Math.hypot(placed.get("c")!.x, placed.get("c")!.y) < Math.hypot(placed.get("p")!.x, placed.get("p")!.y));
console.log("campus network layout ok");
