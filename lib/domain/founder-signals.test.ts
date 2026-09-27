import assert from "node:assert/strict";
import { loadFounderSignals } from "./founder-signals";

const rows = loadFounderSignals();
assert.ok(rows.length >= 15, `expected at least 15 signals, got ${rows.length}`);
for (const row of rows) {
  assert.ok(row.signal.length > 3, row.signal);
  assert.ok(row.campus.length > 2, row.campus);
  assert.ok(row.why.length > 40, row.signal);
  assert.ok(row.sources.length >= 1, row.signal);
  for (const url of row.sources) assert.ok(url.startsWith("https://"), url);
}
const penn = rows.filter((row) => row.campus === "Penn");
const berkeley = rows.filter((row) => row.campus === "UC Berkeley");
assert.ok(penn.length >= 8, `penn signals ${penn.length}`);
assert.ok(berkeley.length >= 5, `berkeley signals ${berkeley.length}`);
console.log(`founder-signals tests ok (${rows.length} rows)`);
