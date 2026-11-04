import assert from "node:assert/strict";
import { markerRadius, markerRadiusByFounders, markerSizeLegend } from "./marker-radius";

assert.equal(markerRadius(0), 2.6);
assert.ok(markerRadius(13) > markerRadius(0));
assert.ok(markerRadius(27) > markerRadius(13));
assert.ok(markerRadius(387) > markerRadius(380), "Penn should outsize Berkeley slightly");
assert.ok(markerRadius(387) <= 10.8);

assert.equal(markerRadiusByFounders(0), 3.1);
assert.ok(markerRadiusByFounders(300) > markerRadiusByFounders(238), "Stanford > MIT by founders");
assert.ok(markerRadiusByFounders(757) > markerRadiusByFounders(300), "Penn > Stanford by founders");
assert.ok(markerRadiusByFounders(757) <= 12.5);

assert.equal(markerSizeLegend(), "Point size scales with founder names on record. Color is the campus country.");
assert.ok(!markerSizeLegend().includes("\u2014"));
console.log("marker-radius tests ok", {
  zero: markerRadius(0),
  foundersPenn: markerRadiusByFounders(757),
  foundersStanford: markerRadiusByFounders(300),
  foundersMit: markerRadiusByFounders(238),
});
