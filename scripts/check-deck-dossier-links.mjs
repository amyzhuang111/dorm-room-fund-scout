/**
 * Crawl every mobile deck + peek founder Open link and fail on any non-200 dossier.
 * Usage: BASE=http://127.0.0.1:3460 node scripts/check-deck-dossier-links.mjs
 */
import { chromium } from "playwright";
import fs from "fs";

const BASE = process.env.BASE || "http://127.0.0.1:3460";
const OUT = process.env.OUT || "reviews/deck-dossier-links.json";
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
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, ...EXTRA });
await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForSelector('[data-directory-ready="1"]', { timeout: 60000 }).catch(() => {});
await page.waitForSelector("[data-founder-card]", { timeout: 60000 });

// Expand sheet so deck links are the live surface; peek keep still mounts cards too.
const expand = page.locator("[data-fold-sheet-expand]").first();
if (await expand.count()) {
  await expand.click().catch(() => {});
  await page.waitForTimeout(500);
}
await page.waitForSelector('[data-fold-sheet-mode="deck"], [data-fold-sheet-mode="expanded"], [data-founder-deck]', {
  timeout: 15000,
}).catch(() => {});

// Click "More" until exhausted so we crawl the full open-lane deck, not only the first page.
for (let i = 0; i < 40; i++) {
  const more = page.locator("[data-founder-deck-more]").first();
  if (!(await more.count())) break;
  await more.click().catch(() => {});
  await page.waitForTimeout(200);
}

const hrefs = await page.evaluate(() => {
  const roots = [
    ...document.querySelectorAll("[data-founder-deck] [data-founder-card], [data-founder-peek-strip] [data-founder-card], [data-fold-sheet-deck-keep] [data-founder-card], [data-fold-sheet-peek] [data-founder-card]"),
  ];
  const set = new Set();
  for (const card of roots) {
    for (const a of card.querySelectorAll('a[href*="/startup/"]')) {
      const href = a.getAttribute("href");
      if (!href) continue;
      try {
        const u = new URL(href, location.origin);
        // Strip query for dossier identity; status check still uses full path+search if needed.
        set.add(u.pathname);
      } catch {
        /* ignore */
      }
    }
  }
  return [...set].sort();
});

console.log(`deck/peek unique /startup links: ${hrefs.length}`);

const results = [];
for (const path of hrefs) {
  const res = await page.request.get(`${BASE}${path}`, { maxRedirects: 5, timeout: 60000 });
  const status = res.status();
  const ok = status >= 200 && status < 400;
  results.push({ path, status, ok });
  const line = `${ok ? "OK" : "FAIL"} ${status} ${path}`;
  console.log(line);
  if (!ok) fail(`${path} returned ${status}`);
}

const payload = {
  ok: !process.exitCode,
  base: BASE,
  checked: results.length,
  failed: results.filter((r) => !r.ok).length,
  results,
};
fs.mkdirSync("reviews", { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
console.log(`Wrote ${OUT} checked=${payload.checked} failed=${payload.failed}`);

await browser.close();
if (process.exitCode) {
  console.error("check-deck-dossier-links FAILED");
  process.exit(process.exitCode);
}
console.log(`PASS check-deck-dossier-links checked=${payload.checked}`);
