/**
 * Fail when page counts that should match the shared corpus snapshot differ.
 * Usage:
 *   BASE=http://127.0.0.1:3460 node scripts/check-count-consistency.mjs
 *   BASE=https://…vercel.app node scripts/check-count-consistency.mjs
 *
 * Source of truth: data/corpus-snapshot.json (regenerate after recency + dedupe
 * via `npx tsx scripts/ingest/enrich-corpus-snapshot.ts`).
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = (process.env.BASE || "http://127.0.0.1:3460").replace(/\/$/, "");
const snapPath = path.join(process.cwd(), "data", "corpus-snapshot.json");
if (!fs.existsSync(snapPath)) {
  console.error("missing data/corpus-snapshot.json — run enrich-corpus-snapshot.ts first");
  process.exit(1);
}
const SNAP = JSON.parse(fs.readFileSync(snapPath, "utf8"));

const EXPECT = {
  investableCompanies: SNAP.investableCompanies,
  foundersListed: SNAP.foundersListed,
  foundersIndexed: SNAP.foundersIndexed,
  campusesOnMap: SNAP.campusesOnMap,
  campusesTotal: SNAP.campusesTotal ?? SNAP.campuses,
  ycMembership: SNAP.ycMembership,
};

function num(text) {
  if (text == null) return null;
  const m = String(text).replace(/,/g, "").match(/-?\d+/);
  return m ? Number(m[0]) : null;
}

function pushErr(errors, page, label, expected, actual, source) {
  if (expected == null || actual == null) return;
  if (Number(expected) !== Number(actual)) {
    errors.push({ page, label, expected, actual, source });
  }
}

async function readCounts(page) {
  return page.evaluate(() => {
    const out = {};
    for (const el of document.querySelectorAll("[data-count]")) {
      const key = el.getAttribute("data-count");
      out[key] = (el.textContent || "").trim();
    }
    // Visible masthead "N companies"
    const fold = document.querySelector("[data-fold-counts]");
    if (fold) {
      const text = fold.textContent || "";
      const m = text.match(/([\d,]+)\s+companies/);
      if (m) out.visibleCompanies = m[1];
      const c = text.match(/([\d,]+)\s+campuses/);
      if (c) out.visibleCampuses = c[1];
    }
    const top = document.querySelector("[data-fold-top-campuses-desk], [data-fold-top-campuses-ssr]");
    if (top) out.topCampusesText = (top.textContent || "").replace(/\s+/g, " ").trim();
    return out;
  });
}

async function main() {
  const errors = [];
  const inventory = [];
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const routes = [
    { path: "/", name: "home" },
    { path: "/companies", name: "companies" },
    { path: "/campuses", name: "campuses" },
    { path: "/data", name: "data" },
    { path: "/signals", name: "signals" },
  ];

  for (const route of routes) {
    const url = `${BASE}${route.path}`;
    let status = 0;
    try {
      const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      status = res?.status() || 0;
      await page.waitForTimeout(1500);
    } catch (e) {
      errors.push({ page: route.name, label: "load", expected: 200, actual: String(e.message || e), source: "navigation" });
      inventory.push({ page: route.name, url, status, counts: {}, error: String(e.message || e) });
      continue;
    }
    const counts = await readCounts(page);
    inventory.push({
      page: route.name,
      url,
      status,
      counts,
      sourceOfTruth: {
        investableCompanies: { value: EXPECT.investableCompanies, from: "corpus-snapshot.json#investableCompanies" },
        foundersListed: { value: EXPECT.foundersListed, from: "corpus-snapshot.json#foundersListed" },
        foundersIndexed: { value: EXPECT.foundersIndexed, from: "corpus-snapshot.json#foundersIndexed" },
        campusesOnMap: { value: EXPECT.campusesOnMap, from: "corpus-snapshot.json#campusesOnMap" },
        campusesTotal: { value: EXPECT.campusesTotal, from: "corpus-snapshot.json#campusesTotal" },
      },
    });

    if (counts["founders-listed"] != null) {
      pushErr(errors, route.name, "founders-listed", EXPECT.foundersListed, num(counts["founders-listed"]), "data-count=founders-listed vs snapshot.foundersListed");
    }
    if (counts["founders-indexed"] != null) {
      pushErr(errors, route.name, "founders-indexed", EXPECT.foundersIndexed, num(counts["founders-indexed"]), "data-count=founders-indexed vs snapshot.foundersIndexed");
    }
    if (counts["campuses-on-map"] != null) {
      pushErr(errors, route.name, "campuses-on-map", EXPECT.campusesOnMap, num(counts["campuses-on-map"]), "data-count=campuses-on-map vs snapshot.campusesOnMap");
    }
    if (counts.visibleCompanies != null) {
      pushErr(errors, route.name, "visible companies", EXPECT.investableCompanies, num(counts.visibleCompanies), "fold masthead companies vs snapshot.investableCompanies");
    }
    // Campuses label must not show the companies total
    if (counts.visibleCampuses != null && num(counts.visibleCampuses) === EXPECT.investableCompanies) {
      errors.push({
        page: route.name,
        label: "campuses mislabeled as companies total",
        expected: EXPECT.campusesOnMap,
        actual: num(counts.visibleCampuses),
        source: "visible 'campuses' equals investableCompanies",
      });
    }
  }

  await browser.close();

  const outPath = path.join(process.cwd(), "reviews", "count-consistency.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ base: BASE, expect: EXPECT, inventory, errors }, null, 2) + "\n");

  if (errors.length) {
    console.error(JSON.stringify({ ok: false, errors, wrote: outPath }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, expect: EXPECT, pages: inventory.length, wrote: outPath }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
