import assert from "node:assert/strict";
import { sanitizePitch, pitchStartsBad } from "./sanitize-pitch";

assert.equal(
  sanitizePitch("Intempus ... equipping robots with emotional intelligence."),
  "Intempus equipping robots with emotional intelligence",
);
assert.equal(
  sanitizePitch("Baleena … captures microfibers at their laundry point source"),
  "Baleena captures microfibers at their laundry point source",
);
assert.ok(!(sanitizePitch("Intempus ... equipping robots") || "").includes("..."));
assert.ok(!(sanitizePitch("Intempus … equipping robots") || "").includes("…"));

assert.equal(
  sanitizePitch(
    "…ns Health (YC S17, formerly Totemic). Built deep learning radars in consumer electronics for the home.",
  ),
  "Built deep learning radars in consumer electronics for the home",
);

assert.equal(
  sanitizePitch(
    "…him and saw him waste hours every day on manual paperwork. That's where Stockline comes from. I made it a personal mission.",
  ),
  "That's where Stockline comes from. I made it a personal mission",
);

assert.equal(
  sanitizePitch(
    "…o Infinity, I co-founded Edge Analytics, an ML consulting company that we grew to 12 engineers.",
  ),
  "I co-founded Edge Analytics, an ML consulting company that we grew to 12 engineers",
);

assert.equal(
  sanitizePitch("mit '23 computer science graduate building ... [Nowadays] summer 2023 batch"),
  "MIT '23 computer science graduate building summer 2023 batch",
);
assert.ok(!(sanitizePitch("mit '23 building [Nowadays] xxxxxx more words here") || "").includes("["));

assert.equal(
  sanitizePitch("is building food automation for quick-service dining areas.", "Munch Industries"),
  "Munch Industries is building food automation for quick-service dining areas",
);

assert.equal(
  sanitizePitch("Co-founder of Sciloop (YC F25), On Leave From MIT"),
  "Co-founder of Sciloop (YC F25), On Leave From MIT",
);

assert.equal(sanitizePitch("him and saw him waste hours every day on paperwork alone"), null);
assert.ok(!pitchStartsBad(sanitizePitch("MIT dropout building robots for warehouses and factories")!));

console.log("sanitize-pitch tests ok");
