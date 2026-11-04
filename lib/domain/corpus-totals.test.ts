import assert from "node:assert/strict";
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
assert.equal(totals.investableCompanies, 1633);

console.log("corpus-totals.test.ts: ok");
