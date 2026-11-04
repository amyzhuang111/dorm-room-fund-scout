/**
 * Fail when tag chips on a page mix ALL-CAPS words with Title Case on the same
 * card strip (inconsistent case style). Acronyms ≤4 chars are allowed.
 * Usage: BASE=http://127.0.0.1:3460 node scripts/check-tag-case.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = (process.env.BASE || "http://127.0.0.1:3460").replace(/\/$/, "");
const OUT = process.env.OUT || "reviews/tag-case.json";
const ROUTES = ["/companies", "/founders", "/data"];
const VIEWPORTS = [
  { w: 390, h: 844 },
  { w: 1440, h: 900 },
];

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
      ? { deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" }
      : { deviceScaleFactor: 2 }),
  });
  await context.route(/vercel\.live/, (r) => r.abort());
  const page = await context.newPage();
  for (const route of ROUTES) {
    await page.goto(`${BASE}${route}`, { waitUntil: "load", timeout: 90000 });
    await page.waitForTimeout(1500);
    const found = await page.evaluate(() => {
      const strips = document.querySelectorAll("[data-tag-chips], [data-card-chips]");
      const hits = [];
      for (const strip of strips) {
        const chips = [...strip.querySelectorAll(":scope > span, :scope > button")].map((el) =>
          (el.textContent || "").replace(/\s+/g, " ").trim(),
        ).filter(Boolean);
        if (chips.length < 2) continue;
        const isAcronym = (s) => /^[A-Z0-9+/\-]{1,4}$/.test(s);
        const isAllCapsWord = (s) => {
          if (isAcronym(s)) return false;
          const letters = s.replace(/[^A-Za-z]/g, "");
          return letters.length >= 5 && letters === letters.toUpperCase();
        };
        const isTitleish = (s) => /[a-z]/.test(s) && /[A-Z]/.test(s.charAt(0));
        const caps = chips.filter(isAllCapsWord);
        const titled = chips.filter(isTitleish);
        if (caps.length && titled.length) {
          hits.push({ caps, titled, sample: chips.slice(0, 6) });
        }
        if (hits.length >= 8) break;
      }
      return hits;
    });
    for (const hit of found) {
      fail(`${vp.w}${route} tag case mix`, { vp: vp.w, route, ...hit });
    }
    if (!found.length) console.log(`OK ${vp.w}${route}`);
  }
  await context.close();
}
await browser.close();
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(report.ok ? "PASS check-tag-case" : "FAIL check-tag-case", { hits: report.hits.length, out: OUT });
