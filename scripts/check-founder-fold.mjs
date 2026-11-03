/**
 * Fail if home founder list is empty, filters empty, or "failed to load" shows.
 * Usage: BASE=http://127.0.0.1:3460 node scripts/check-founder-fold.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:3460";
const EXTRA = process.env.VERCEL_BYPASS
  ? {
      extraHTTPHeaders: {
        "x-vercel-protection-bypass": process.env.VERCEL_BYPASS,
        "x-vercel-set-bypass-cookie": "true",
      },
    }
  : {};

function fail(msg) {
  console.error("FAIL", msg);
  process.exitCode = 1;
}

const browser = await chromium.launch({ headless: true });
for (const [width, height, label] of [
  [1440, 900, "desk-1440"],
  [375, 812, "mobile-375"],
]) {
  const page = await browser.newPage({ viewport: { width, height }, ...EXTRA });
  const foundersRes = [];
  page.on("response", (r) => {
    if (r.url().includes("/data/founders.json")) foundersRes.push(r.status());
  });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForSelector('[data-directory-ready="1"]', { timeout: 60000 });
  // Wait until founders resolve to ready or error (not perpetual loading)
  await page.waitForFunction(() => {
    const body = document.body?.innerText || "";
    if (/could not be loaded|failed to load/i.test(body)) return "error";
    if (document.querySelectorAll("[data-founder-card]").length > 0) return "ready";
    if (/Loading founders/i.test(body)) return false;
    return document.querySelector("[data-founder-results]") ? "empty" : false;
  }, { timeout: 60000 });

  const state = await page.evaluate(() => {
    const body = document.body?.innerText || "";
    const selects = [...document.querySelectorAll("[data-founder-filters] select")];
    const optionCounts = selects.map((s) => s.options.length);
    return {
      failedCopy: /could not be loaded|failed to load/i.test(body),
      loadingCopy: /Loading founders/i.test(body),
      founderCards: document.querySelectorAll("[data-founder-card]").length,
      filtersPresent: !!document.querySelector("[data-founder-filters]"),
      filterSelects: selects.length,
      optionCounts,
      emptyFilters: optionCounts.length > 0 && optionCounts.every((n) => n <= 1),
      campusStrip: !!document.querySelector("[data-campus-founders-top], [data-fold-counts]"),
      peakCampuses: !!document.querySelector("[data-fold-peak], [data-peak-share]") || /TOP CAMPUSES|Penn/i.test(body),
    };
  });

  console.log(label, JSON.stringify({ ...state, foundersHttp: foundersRes }, null, 2));
  if (state.failedCopy) fail(`${label}: founder list shows failed-to-load copy`);
  if (state.founderCards < 1) fail(`${label}: founder list empty (${state.founderCards} cards)`);
  if (!state.filtersPresent || state.filterSelects < 4) fail(`${label}: founder filters missing`);
  if (state.emptyFilters) fail(`${label}: founder filter options empty`);
  if (foundersRes.length && foundersRes.every((s) => s >= 400)) fail(`${label}: founders.json HTTP ${foundersRes}`);
  await page.close();
}
// r52: full-record @1440 — Capital + Website/LinkedIn must clear the 900px fold
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, ...EXTRA });
  await page.goto(`${BASE}/startup/proj_9GUOmdEYxbuH`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForSelector("[data-company-full-record]", { timeout: 60000 });
  await page.locator("[data-company-full-record]").first().evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(350);
  const fold = await page.evaluate(() => {
    const vh = 900;
    const topOf = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), inFold: r.top < vh && r.bottom > 0 };
    };
    const founders = topOf("[data-full-record-founders-lead]");
    const identity = topOf("[data-full-record-identity-first]");
    const confirmed = [...document.querySelectorAll("[data-company-full-record] *")].find(
      (n) => /^\s*CONFIRMED\s*$/i.test((n.textContent || "").trim()),
    );
    const confirmedTop = confirmed ? Math.round(confirmed.getBoundingClientRect().top) : null;
    // Capital: key-stat marker or fold-capital row or capital group
    const capital =
      topOf('[data-full-record-key-stat="capital"]') ||
      topOf("[data-full-record-fold-capital]") ||
      topOf("[data-full-record-capital-first]");
    const links =
      topOf("[data-full-record-fold-links]") ||
      topOf("[data-full-record-identity-links-desk]") ||
      topOf("[data-full-record-identity-links]");
    return {
      founders,
      identity,
      confirmedTop,
      capital,
      links,
      capitalInFold: capital ? capital.top < vh : false,
      linksInFold: links ? links.top < vh : false,
      foundersStillHigh: founders ? founders.top < 500 : false,
      identityStillHigh: identity ? identity.top < 850 : false,
      confirmedStillHigh: confirmedTop != null ? confirmedTop < 700 : false,
    };
  });
  console.log("full-record-1440", JSON.stringify(fold, null, 2));
  if (!fold.capitalInFold) fail(`full-record-1440: Capital below fold (top=${fold.capital?.top})`);
  if (!fold.linksInFold) fail(`full-record-1440: Website/LinkedIn below fold (top=${fold.links?.top})`);
  if (!fold.foundersStillHigh) fail(`full-record-1440: founders pushed down (top=${fold.founders?.top})`);
  if (!fold.identityStillHigh) fail(`full-record-1440: identity pushed down (top=${fold.identity?.top})`);
  if (!fold.confirmedStillHigh) fail(`full-record-1440: CONFIRMED pushed down (top=${fold.confirmedTop})`);
  await page.close();
}

await browser.close();
if (process.exitCode) {
  console.error("check-founder-fold FAILED");
  process.exit(process.exitCode);
}
console.log("PASS founder fold loaded");
