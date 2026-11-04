/**
 * Fail when card pitches show scraper residue (Snippet:, Evidence:, search-index, etc).
 * Usage: BASE=http://127.0.0.1:3460 node scripts/check-scraped-pitch.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = (process.env.BASE || "http://127.0.0.1:3460").replace(/\/$/, "");
const OUT = process.env.OUT || "reviews/scraped-pitch.json";
const ROUTES = ["/founders", "/companies", "/data", "/campuses/penn"];
const VIEWPORTS = [
  { w: 390, h: 844 },
  { w: 1440, h: 900 },
];
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const BAD =
  /Snippet\s*:|\[this profile cited\]|\(search-index summary\)|\bEvidence\s*:|\bsearch-index\b|\bconfirmed LinkedIn\b/i;

const browser = await chromium.launch({ headless: true });
const report = { ok: true, base: BASE, hits: [] };

function fail(msg, hit) {
  console.error("FAIL", msg);
  report.ok = false;
  process.exitCode = 1;
  if (hit) report.hits.push(hit);
}

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.w, height: vp.h },
    ...(vp.w < 800
      ? { deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA }
      : { deviceScaleFactor: 2 }),
  });
  await context.route(/vercel\.live/, (r) => r.abort());
  const page = await context.newPage();
  for (const route of ROUTES) {
    await page.goto(`${BASE}${route}`, { waitUntil: "load", timeout: 90000 });
    await page.waitForFunction(() => !/Loading/i.test(document.body?.innerText || ""), null, { timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(1800);
    if (route === "/founders") {
      // Sample quiet rows too
      const btn = page.locator('button:has-text("Show quiet"), button:has-text("Hide quiet")').first();
      if (await btn.count()) {
        const label = await btn.textContent();
        if (/Hide quiet/i.test(label || "")) {
          await btn.click().catch(() => {});
          await page.waitForTimeout(500);
        }
      }
    }
    const found = await page.evaluate((src) => {
      const re = new RegExp(src, "i");
      const hits = [];
      const nodes = document.querySelectorAll("[data-card-pitch], [data-why-here], [data-founder-card] p, [data-corpus-row] p");
      for (const el of nodes) {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        const t = (el.textContent || "").replace(/\s+/g, " ").trim();
        if (!re.test(t)) continue;
        hits.push({ sample: t.slice(0, 120) });
        if (hits.length >= 15) break;
      }
      return hits;
    }, BAD.source);
    for (const hit of found) {
      fail(`${vp.w}${route} scraped "${hit.sample}"`, { vp: vp.w, route, ...hit });
    }
    if (!found.length) console.log(`OK ${vp.w}${route}`);
  }
  await context.close();
}
await browser.close();
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(report.ok ? "PASS check-scraped-pitch" : "FAIL check-scraped-pitch", { hits: report.hits.length, out: OUT });
