import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { formatCorpusDate, loadCorpusTotals } from "./corpus-totals";

assert.equal(formatCorpusDate("2026-05-00"), "2026-05");
assert.equal(formatCorpusDate("2026-00-00"), "2026");
assert.equal(formatCorpusDate("2026-05-12"), "2026-05-12");
assert.equal(formatCorpusDate(2025), "2025");
assert.equal(formatCorpusDate(null), null);
assert.equal(formatCorpusDate(""), null);

const totals = loadCorpusTotals();
assert.ok(totals.investableCompanies > 0);
assert.ok(totals.foundersListed > 0);
const snap = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "corpus-snapshot.json"), "utf8")) as {
  investableCompanies: number;
};
assert.equal(totals.investableCompanies, snap.investableCompanies);

console.log("corpus-totals.test.ts: ok");
