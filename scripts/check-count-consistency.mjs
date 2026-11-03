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


  // Overlays Status + Campus must match FacetRail (same unit: founders for campus).
  {
    const url = `${BASE}/companies`;
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2000);
    // Ensure right rail is open, then select Overlays (do not toggle closed).
    const feedToggle = page.locator('button:has-text("Feed"), button:has-text("Hide feed"), button:has-text("Panels"), button:has-text("Hide panels")').first();
    if (await feedToggle.count()) {
      const label = ((await feedToggle.textContent()) || "").toLowerCase();
      if (label.includes("feed") && !label.includes("hide")) {
        await feedToggle.click().catch(() => {});
        await page.waitForTimeout(350);
      }
    }
    const overlaysTab = page.locator('[data-tab="overlays"]:visible').first();
    if (await overlaysTab.count()) {
      await overlaysTab.click();
      await page.waitForTimeout(500);
    } else {
      // Fallback: any overlays tab force-visible via evaluate
      await page.evaluate(() => {
        const tab = document.querySelector('[data-tab="overlays"]');
        tab?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await page.waitForTimeout(500);
    }
    const cross = await page.evaluate(() => {
      const overlayUnit = document.querySelector("[data-overlay-campus-unit], [data-tab-panel='overlays'] [data-overlay-unit]")?.getAttribute("data-overlay-campus-unit")
        || document.querySelector("[data-overlay-facet='campus']")?.getAttribute("data-overlay-unit")
        || null;
      const railUnit = document.querySelector("[data-campus-count-unit]")?.getAttribute("data-campus-count-unit") || null;
      const overlayStatus = {};
      for (const btn of document.querySelectorAll('[data-overlay-row="status"]')) {
        overlayStatus[btn.getAttribute("data-overlay-id")] = Number(btn.getAttribute("data-overlay-count"));
      }
      const railStatus = {};
      for (const btn of document.querySelectorAll('[data-facet-status-pin] [data-facet], [data-facet-group="facet-status"] [data-facet], #facet-status button[data-facet-count]')) {
        // Status pin rows may not set data-facet; fall back to label match via aria/text
      }
      // Prefer status pin buttons with counts
      const statusPin = document.querySelector("#facet-status, [data-facet-status-pin]");
      const railStatusByLabel = {};
      if (statusPin) {
        for (const btn of statusPin.querySelectorAll("button")) {
          const label = (btn.textContent || "").replace(/\s+/g, " ").trim();
          const m = label.match(/^(Active|Acquired|Closed).*?([\d,]+)\s*$/i) || label.match(/^(Active|Acquired|Closed)/i);
          const countAttr = btn.getAttribute("data-facet-count");
          const count = countAttr != null ? Number(countAttr) : (label.match(/([\d,]+)\s*$/) ? Number(RegExp.$1.replace(/,/g, "")) : null);
          const name = (m && m[1]) ? m[1].toLowerCase() : null;
          if (name && count != null) railStatusByLabel[name] = count;
        }
      }
      const overlayCampus = {};
      for (const btn of document.querySelectorAll('[data-overlay-row="campus"]')) {
        overlayCampus[btn.getAttribute("data-overlay-id")] = Number(btn.getAttribute("data-overlay-count"));
      }
      const railCampus = {};
      for (const btn of document.querySelectorAll('[data-facet-group="facet-campus"] button[data-facet="campus"], [data-facet-group="facet-campus"] button')) {
        const idHint = btn.getAttribute("data-overlay-id");
        const count = btn.getAttribute("data-facet-count");
        const label = (btn.textContent || "").replace(/\s+/g, " ").trim();
        if (count != null && /penn/i.test(label)) railCampus["univ_penn"] = Number(count);
        if (count != null && /stanford/i.test(label)) railCampus["univ_stanford"] = Number(count);
      }
      // Also scan all campus facet buttons
      for (const btn of document.querySelectorAll("button[data-facet='campus']")) {
        const count = Number(btn.getAttribute("data-facet-count"));
        const label = (btn.textContent || "").toLowerCase();
        if (/penn/.test(label) && !/state/.test(label)) railCampus["univ_penn"] = count;
        if (/stanford/.test(label)) railCampus["univ_stanford"] = count;
      }
      return { overlayUnit, railUnit, overlayStatus, railStatusByLabel, overlayCampus, railCampus };
    });
    inventory.push({ page: "companies-overlay-rail", url, status: 200, counts: cross });
    if (cross.overlayUnit !== "founders" || cross.railUnit !== "founders") {
      errors.push({
        page: "companies",
        label: "campus count unit",
        expected: "founders",
        actual: `overlay=${cross.overlayUnit} rail=${cross.railUnit}`,
        source: "Overlays + FacetRail must label campus counts as founders",
      });
    }
    for (const key of ["active", "acquired", "closed"]) {
      const o = cross.overlayStatus[key];
      const r = cross.railStatusByLabel[key];
      if (o != null && r != null && o !== r) {
        errors.push({
          page: "companies",
          label: `status ${key}`,
          expected: r,
          actual: o,
          source: "Overlays status vs FacetRail status (shared statusOf)",
        });
      }
    }
    for (const id of ["univ_penn", "univ_stanford"]) {
      const o = cross.overlayCampus[id];
      const r = cross.railCampus[id];
      if (o != null && r != null && o !== r) {
        errors.push({
          page: "companies",
          label: `campus ${id} founders`,
          expected: r,
          actual: o,
          source: "Overlays campus founders vs FacetRail campus founders",
        });
      }
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
