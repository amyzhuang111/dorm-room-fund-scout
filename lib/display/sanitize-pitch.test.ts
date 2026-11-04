import assert from "node:assert/strict";
import { sanitizePitch } from "./sanitize-pitch";

assert.equal(
  sanitizePitch("Intempus ... equipping robots with emotional intelligence."),
  "Intempus equipping robots with emotional intelligence",
);
assert.equal(
  sanitizePitch("Baleena … captures microfibers at their laundry point source"),
  "Baleena captures microfibers at their laundry point source",
);
assert.equal(
  sanitizePitch("Name ... middle ... end of pitch here."),
  "Name middle end of pitch here",
);
assert.match(sanitizePitch("Clean pitch with no ellipsis joins stays put.") || "", /Clean pitch/);
assert.ok(!(sanitizePitch("Intempus ... equipping robots") || "").includes("..."));
assert.ok(!(sanitizePitch("Intempus … equipping robots") || "").includes("…"));

console.log("sanitize-pitch tests ok");
