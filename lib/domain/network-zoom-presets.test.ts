import assert from "node:assert/strict";
import { NETWORK_ZOOM_PRESETS, closestNetworkZoomPreset } from "./network-zoom-presets";

assert.equal(NETWORK_ZOOM_PRESETS.length, 5);
const scales = NETWORK_ZOOM_PRESETS.map((p) => p.scale);
assert.deepEqual([...scales].sort((a, b) => a - b), scales);
assert.ok(new Set(NETWORK_ZOOM_PRESETS.map((p) => p.id)).size === 5);
for (const preset of NETWORK_ZOOM_PRESETS) {
  assert.equal(closestNetworkZoomPreset(preset.scale).id, preset.id);
  assert.ok(preset.scale >= 0.7 && preset.scale <= 5.5);
}
assert.equal(closestNetworkZoomPreset(100).id, "founders");
assert.equal(closestNetworkZoomPreset(0).id, "wide");
console.log("Five screenshot-matched network camera stops verified");
