import { getDb } from "../db/client";
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

assert.equal(totals.investableCompanies, (getDb().prepare("SELECT COUNT(*) n FROM projects WHERE kind='company' AND is_investable_candidate=1").get() as {n:number}).n);
assert.equal(totals.peopleTotal, (getDb().prepare("SELECT COUNT(*) n FROM people").get() as {n:number}).n);

console.log("corpus-totals.test.ts: ok");

