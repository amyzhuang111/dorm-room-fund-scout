/**
 * Fail when sibling buttons in a control row mix font-family mono and sans.
 * Usage: BASE=http://127.0.0.1:3460 node scripts/check-button-font-mix.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = (process.env.BASE || "http://127.0.0.1:3460").replace(/\/$/, "");
const OUT = process.env.OUT || "reviews/button-font-mix.json";
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
      const isMono = (ff) => /mono|menlo|consolas|courier|roboto mono|ui-monospace/i.test(ff);
      const hits = [];
      const groups = document.querySelectorAll(
        "[data-browse-hero], [data-founder-filters], [data-corpus-filters], [data-filters-index-hero], [data-showing-count], [data-fold-overlay-peak] > div, [data-fold-overlay-founders] > div",
      );
      for (const group of groups) {
        const buttons = [...group.querySelectorAll("button, a[class*='inline-flex']")].filter((el) => {
          const cs = getComputedStyle(el);
          return cs.display !== "none" && cs.visibility !== "hidden";
        });
        if (buttons.length < 2) continue;
        const families = buttons.map((b) => ({
          text: (b.textContent || "").trim().slice(0, 24),
          mono: isMono(getComputedStyle(b).fontFamily),
          ff: getComputedStyle(b).fontFamily.slice(0, 40),
        }));
        const hasMono = families.some((f) => f.mono);
        const hasSans = families.some((f) => !f.mono);
        if (hasMono && hasSans) {
          hits.push({ group: group.getAttribute("data-browse-hero") || group.getAttribute("data-founder-filters") || group.tagName, families });
        }
      }
      return hits.slice(0, 10);
    });
    for (const hit of found) {
      fail(`${vp.w}${route} button font mix`, { vp: vp.w, route, ...hit });
    }
    if (!found.length) console.log(`OK ${vp.w}${route}`);
  }
  await context.close();
}
await browser.close();
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(report.ok ? "PASS check-button-font-mix" : "FAIL check-button-font-mix", { hits: report.hits.length, out: OUT });
