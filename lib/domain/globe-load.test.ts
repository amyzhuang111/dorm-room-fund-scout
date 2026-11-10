import assert from "node:assert/strict";
import { globeLoadDecision } from "./globe-load";

assert.equal(
  globeLoadDecision({ vectorTileArrived: false, tilesSettled: true, timedOut: false }),
  "loading",
  "idle or a first render without a vector tile is not ready",
);
assert.equal(
  globeLoadDecision({ vectorTileArrived: false, tilesSettled: false, timedOut: false }),
  "loading",
);
assert.equal(
  globeLoadDecision({ vectorTileArrived: false, tilesSettled: false, timedOut: true }),
  "error",
  "a wait with no vector tile is an error, not a painted globe",
);
assert.equal(
  globeLoadDecision({ vectorTileArrived: true, tilesSettled: true, timedOut: false }),
  "ready",
);
assert.equal(
  globeLoadDecision({ vectorTileArrived: true, tilesSettled: false, timedOut: true }),
  "ready",
  "a tile that arrived is shown rather than spinning forever",
);
assert.equal(
  globeLoadDecision({ vectorTileArrived: true, tilesSettled: false, timedOut: false }),
  "loading",
);

console.log("globe load decision ok");
