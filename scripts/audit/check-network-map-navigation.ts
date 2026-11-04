import assert from "node:assert/strict";
import fs from "node:fs";
import { NETWORK_ZOOM_PRESETS } from "../../lib/domain/network-zoom-presets";
import { buildFounderNetworksPage } from "../../lib/domain/founder-networks";

const graph = fs.readFileSync("components/networks-graph.tsx", "utf8");
const three = fs.readFileSync("components/networks-graph-3d.tsx", "utf8");
const page = buildFounderNetworksPage();

assert.ok(page.totals.networks >= 80);
assert.ok(page.totals.foundersLinked > 0);
assert.equal(NETWORK_ZOOM_PRESETS.length, 5);
assert.ok(graph.includes('setMode("2d")'), "Reliable 2D graph should be the first desktop/mobile view");
assert.ok(graph.includes("NETWORK_ZOOM_PRESETS[1].scale"), "Start at readable overview scale, not tiny wide-out");
for (const name of ["data-network-zoom-in", "data-network-zoom-out", "data-network-zoom-fit", "data-network-map-hint"]) {
  assert.ok(graph.includes(name), "Map must have useful on-map navigation: " + name);
}
assert.ok(!graph.includes("data-canvas-callout-leader"), "Unusable long editorial lines should be removed");
assert.ok(!graph.includes("poster.callouts.map("), "Huge margin annotations must not cover the map");
assert.ok(!three.includes("data-networks-margin-line"), "3D margin lines should not cross the map");
assert.ok(three.includes("ctrl.autoRotate = false;"), "3D must not orbit unexpectedly while selecting founders");
assert.ok(graph.includes("<NetworksGraph2D {...props} />"), "3D must remain an optional visualization");
assert.ok(three.includes("data-networks-graph"), "3D option should remain available");
console.log(JSON.stringify({
  defaultView: "2D overview",
  mobileView: "2D overview",
  zoomStops: NETWORK_ZOOM_PRESETS.length,
  onMapControls: ["zoom in", "zoom out", "fit"],
  networkCount: page.totals.networks,
  founderCount: page.totals.foundersLinked,
  diagonalMarginAnnotations: 0,
}, null, 2));
