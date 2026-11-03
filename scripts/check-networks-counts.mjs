/**
 * Every company / strip count on /networks must match the shared page total.
 * Usage: BASE=http://127.0.0.1:3471 node scripts/check-networks-counts.mjs
 */
import { chromium } from "playwright";
import fs from "fs";

const BASE = process.env.BASE || "http://127.0.0.1:3471";
const OUT = process.env.OUT || "";

function fail(msg) {
  console.error("FAIL", msg);
  process.exitCode = 1;
}

const pageJson = await fetch(`${BASE}/data/founder-networks-page.json`).then((r) => r.json());
const expected = {
  companies: pageJson.totals.companyTotal ?? pageJson.totals.companiesLinked,
  founderLinks: pageJson.totals.founderLinks,
  networks: pageJson.totals.networks,
  founders: pageJson.totals.foundersLinked,
};

if (pageJson.totals.companyTotal !== pageJson.totals.companiesLinked) {
  fail(`companyTotal (${pageJson.totals.companyTotal}) !== companiesLinked (${pageJson.totals.companiesLinked})`);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${BASE}/networks`, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(1200);

const found = await page.evaluate(() => {
  const nodes = [...document.querySelectorAll("[data-networks-count]")];
  return nodes.map((el) => ({
    key: el.getAttribute("data-networks-count"),
    text: (el.textContent || "").replace(/,/g, "").trim(),
    raw: (el.textContent || "").trim(),
  }));
});

const report = { ok: true, expected, found, mismatches: [] };
if (!found.length) {
  report.ok = false;
  fail("no [data-networks-count] nodes on /networks");
}

const byKey = {};
for (const row of found) {
  byKey[row.key] = byKey[row.key] || [];
  byKey[row.key].push(Number(row.text));
}

for (const [key, want] of Object.entries(expected)) {
  const vals = byKey[key] || [];
  if (!vals.length) {
    report.ok = false;
    report.mismatches.push({ key, want, got: null });
    fail(`missing data-networks-count=${key}`);
    continue;
  }
  for (const got of vals) {
    if (got !== want) {
      report.ok = false;
      report.mismatches.push({ key, want, got });
      fail(`count ${key}: DOM ${got} !== shared ${want}`);
    }
  }
}

// Hero company figure must equal stats company figure (same shared total).
const companyVals = byKey.companies || [];
if (companyVals.length >= 2 && new Set(companyVals).size !== 1) {
  report.ok = false;
  fail(`company counts disagree across page: ${JSON.stringify(companyVals)}`);
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, expected, foundCount: found.length, mismatches: report.mismatches }, null, 2));
await browser.close();
if (process.exitCode) {
  console.error("check-networks-counts FAILED");
  process.exit(process.exitCode);
}
console.log("OK every /networks count matches shared totals");
