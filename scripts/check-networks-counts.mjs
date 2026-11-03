/**
 * Every company / strip count on /networks must match the shared page total.
 * Partial counts (companiesLinked of corpusCompanies) must show an explicit
 * "N of M" denominator beside every partial figure.
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
const totals = pageJson.totals || {};
const expected = {
  companies: totals.companyTotal ?? totals.companiesLinked,
  corpusCompanies: totals.corpusCompanies ?? pageJson.corpusCompanies,
  founderLinks: totals.founderLinks,
  networks: totals.networks,
  founders: totals.foundersLinked,
};

if (totals.companyTotal !== totals.companiesLinked) {
  fail(`companyTotal (${totals.companyTotal}) !== companiesLinked (${totals.companiesLinked})`);
}
if (!(expected.corpusCompanies > expected.companies)) {
  fail(
    `corpusCompanies (${expected.corpusCompanies}) must be greater than companyTotal (${expected.companies})`,
  );
}
if (totals.corpusCompanies != null && totals.corpusCompanies !== pageJson.corpusCompanies) {
  fail(
    `totals.corpusCompanies (${totals.corpusCompanies}) !== page.corpusCompanies (${pageJson.corpusCompanies})`,
  );
}

/**
 * Partials: numerator shown on the page that is a share of a larger shared total.
 * Other strip figures (founderLinks, networks, foundersLinked) are complete desk
 * totals for this payload — there is no larger published corpus denominator — so
 * they do not require an "of <total>" suffix.
 */
const PARTIALS = [
  {
    key: "companies",
    numerator: expected.companies,
    denominatorKey: "corpusCompanies",
    denominator: expected.corpusCompanies,
    label: "companies",
  },
];

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

const report = {
  ok: true,
  expected,
  found,
  mismatches: [],
  partials: [],
  note:
    "founderLinks / networks / foundersLinked are full desk totals (no corpus denominator); only companies is a partial of corpusCompanies",
};

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
const corpusVals = byKey.corpusCompanies || [];
if (corpusVals.length >= 2 && new Set(corpusVals).size !== 1) {
  report.ok = false;
  fail(`corpusCompanies counts disagree across page: ${JSON.stringify(corpusVals)}`);
}

// Every partial count must appear with an explicit "N of M" denominator in context.
const shareCheck = await page.evaluate((partials) => {
  function norm(s) {
    return (s || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }
  function fmt(n) {
    return Number(n).toLocaleString("en-US");
  }
  const hero = norm(document.querySelector("[data-networks-hero]")?.innerText || "");
  const stats = norm(document.querySelector("[data-networks-stats]")?.innerText || "");
  const body = norm(document.body.innerText || "");
  return partials.map((p) => {
    const num = fmt(p.numerator);
    const den = fmt(p.denominator);
    const bareNum = String(p.numerator);
    const bareDen = String(p.denominator);
    const ofRe = new RegExp(
      `${num.replace(/,/g, ",?")}\\s+of\\s+${den.replace(/,/g, ",?")}`,
      "i",
    );
    const ofBare = new RegExp(`${bareNum}\\s+of\\s+${bareDen}`, "i");
    const nodes = [...document.querySelectorAll(`[data-networks-count="${p.key}"]`)];
    const nodeChecks = nodes.map((el) => {
      const ctx = norm(el.parentElement?.innerText || el.textContent || "");
      const hasOf = ofRe.test(ctx) || ofBare.test(ctx);
      return { ctx: ctx.slice(0, 160), hasOf };
    });
    return {
      key: p.key,
      numerator: p.numerator,
      denominator: p.denominator,
      heroHasOf: ofRe.test(hero) || ofBare.test(hero),
      statsHasOf: ofRe.test(stats) || ofBare.test(stats),
      bodyHasOf: ofRe.test(body) || ofBare.test(body),
      nodeChecks,
      heroSnippet: hero.slice(0, 220),
      statsSnippet: stats.slice(0, 220),
    };
  });
}, PARTIALS);

for (const row of shareCheck) {
  report.partials.push(row);
  if (!row.heroHasOf) {
    report.ok = false;
    fail(`hero missing "${row.numerator} of ${row.denominator}" share for ${row.key}`);
  }
  if (!row.statsHasOf) {
    report.ok = false;
    fail(`stats strip missing "${row.numerator} of ${row.denominator}" share for ${row.key}`);
  }
  for (const n of row.nodeChecks) {
    if (!n.hasOf) {
      report.ok = false;
      fail(`partial ${row.key} shown without of ${row.denominator} in context: ${n.ctx}`);
    }
  }
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      ok: report.ok,
      expected,
      foundCount: found.length,
      mismatches: report.mismatches,
      partials: report.partials.map((p) => ({
        key: p.key,
        heroHasOf: p.heroHasOf,
        statsHasOf: p.statsHasOf,
        nodesOk: p.nodeChecks.every((n) => n.hasOf),
      })),
      note: report.note,
    },
    null,
    2,
  ),
);
await browser.close();
if (process.exitCode) {
  console.error("check-networks-counts FAILED");
  process.exit(process.exitCode);
}
console.log("OK every /networks count matches shared totals and partials show of <total>");
