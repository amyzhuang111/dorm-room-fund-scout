import assert from "node:assert/strict";
import { globeVerticalSlack, mapStageHeight } from "./map-stage-height";

// Production m1f at 390x844 painted a ~76px white band because the stage was ~743px
// tall and the disk only ~374px. The phone stage must stay near the disk.
for (const width of [320, 375, 390, 430]) {
  const stage = mapStageHeight(width, 844);
  const slack = globeVerticalSlack(width, 844);
  assert.ok(stage <= width + 1, `${width}: stage ${stage} taller than the viewport width`);
  assert.ok(slack < 24, `${width}: ${slack.toFixed(1)}px of vertical slack can read as a blank bar`);
}

assert.equal(mapStageHeight(390, 844), 390);
assert.ok(mapStageHeight(1440, 900) >= 520);
assert.ok(mapStageHeight(1440, 900) <= 720);

console.log("map stage height tests ok");
