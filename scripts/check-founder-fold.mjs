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
await browser.close();
if (process.exitCode) {
  console.error("check-founder-fold FAILED");
  process.exit(process.exitCode);
}
console.log("PASS founder fold loaded");
