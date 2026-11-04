/**
 * Fail when primary mobile desk tabs or site-nav items are horizontally clipped
 * (right edge beyond parent clientWidth by >2px without overflow scroll).
 * Usage: BASE=http://127.0.0.1:3460 node scripts/check-nav-clip.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = (process.env.BASE || "http://127.0.0.1:3460").replace(/\/$/, "");
const OUT = process.env.OUT || "reviews/nav-clip.json";
const ROUTES = ["/", "/companies", "/founders", "/data", "/networks"];
const VIEWPORTS = [{ w: 390, h: 844 }];

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
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  await context.route(/vercel\.live/, (r) => r.abort());
  const page = await context.newPage();
  for (const route of ROUTES) {
    await page.goto(`${BASE}${route}`, { waitUntil: "load", timeout: 90000 });
    await page.waitForTimeout(1200);
    const found = await page.evaluate(() => {
      const sels = ["[data-mobile-desk-tabs]", "[data-site-nav] nav", "[data-mobile-view-tabs]"];
      const hits = [];
      for (const sel of sels) {
        const nav = document.querySelector(sel);
        if (!nav) continue;
        const style = getComputedStyle(nav);
        const canScroll = nav.scrollWidth > nav.clientWidth + 1 && /(auto|scroll)/.test(style.overflowX);
        // If scrollable with fade, OK — only fail hard clip without scroll
        const kids = [...nav.children].filter((el) => el instanceof HTMLElement);
        for (const kid of kids) {
          const kr = kid.getBoundingClientRect();
          const nr = nav.getBoundingClientRect();
          if (kr.width < 2) continue;
          // Clip past viewport right edge
          if (kr.right > window.innerWidth + 1) {
            // Allowed if parent scrolls
            if (!canScroll) {
              hits.push({ sel, label: (kid.textContent || "").trim().slice(0, 40), right: kr.right, vw: window.innerWidth });
            }
          }
          // Clip past parent without being able to scroll to it
          if (kr.right > nr.right + 2 && !canScroll) {
            hits.push({ sel, label: (kid.textContent || "").trim().slice(0, 40), parentClip: true });
          }
        }
      }
      return hits.slice(0, 12);
    });
    for (const hit of found) {
      fail(`${vp.w}${route} nav-clip ${hit.label || hit.sel}`, { vp: vp.w, route, ...hit });
    }
    if (!found.length) console.log(`OK ${vp.w}${route}`);
  }
  await context.close();
}
await browser.close();
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(report.ok ? "PASS check-nav-clip" : "FAIL check-nav-clip", { hits: report.hits.length, out: OUT });
