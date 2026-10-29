import assert from "node:assert/strict";
import { markerRadius, markerSizeLegend } from "./marker-radius";

assert.equal(markerRadius(0), 2.6);
assert.ok(markerRadius(13) > markerRadius(0));
assert.ok(markerRadius(27) > markerRadius(13));
assert.ok(markerRadius(387) > markerRadius(380), "Penn should outsize Berkeley slightly");
assert.ok(markerRadius(387) <= 10.8);
assert.equal(markerSizeLegend(), "Point size scales with stored campus signals. Ember marks the top desk.");
assert.ok(!markerSizeLegend().includes("\u2014"));
console.log("marker-radius tests ok", {
  zero: markerRadius(0),
  stanford13: markerRadius(13),
  mit27: markerRadius(27),
  berkeley380: markerRadius(380),
  penn387: markerRadius(387),
});
