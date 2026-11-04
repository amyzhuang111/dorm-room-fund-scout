import assert from "node:assert/strict";
import { markerRadius, markerRadiusByFounders, markerRadiusByPitchbook, markerRadiusForCampus, markerSizeLegend } from "./marker-radius";

assert.equal(markerRadius(0), 2.6);
assert.ok(markerRadius(13) > markerRadius(0));
assert.ok(markerRadius(27) > markerRadius(13));
assert.ok(markerRadius(387) > markerRadius(380), "Penn should outsize Berkeley slightly");
assert.ok(markerRadius(387) <= 10.8);

assert.equal(markerRadiusByFounders(0), 3.1);
assert.ok(markerRadiusByFounders(300) > markerRadiusByFounders(238), "Stanford > MIT by founders");
assert.ok(markerRadiusByFounders(757) > markerRadiusByFounders(300), "Penn > Stanford by founders");
assert.ok(markerRadiusByFounders(757) <= 12.5);

assert.ok(markerRadiusByPitchbook(2380) > markerRadiusByPitchbook(1466), "Berkeley outsizes Penn on PitchBook");
assert.ok(markerRadiusForCampus(768, null) < markerRadiusByPitchbook(1466), "file-only dots stay under a PitchBook top school");
assert.equal(
  markerSizeLegend(),
  "Point size follows PitchBook undergraduate founder counts when the school is on that list, and founders on file otherwise. Color is the campus country.",
);
assert.ok(!markerSizeLegend().includes("\u2014"));
assert.ok(!markerSizeLegend().includes("\u2013"));
console.log("marker-radius tests ok", {
  zero: markerRadius(0),
  foundersPenn: markerRadiusByFounders(757),
  foundersStanford: markerRadiusByFounders(300),
  foundersMit: markerRadiusByFounders(238),
});
