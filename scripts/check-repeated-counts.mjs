/**
 * Fail when the same large locale count appears 3+ times as visible hero/chrome
 * text on one page. Ignores facet mid-dot counts and ancestor-hidden nodes.
 * Usage: BASE=http://127.0.0.1:3460 node scripts/check-repeated-counts.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = (process.env.BASE || "http://127.0.0.1:3460").replace(/\/$/, "");
const OUT = process.env.OUT || "reviews/repeated-counts.json";
const ROUTES = ["/companies", "/data", "/founders"];
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
    await page.waitForTimeout(1800);
    const found = await page.evaluate(() => {
      const isHidden = (el) => {
        let cur = el;
        while (cur && cur !== document.documentElement) {
          const cs = getComputedStyle(cur);
          if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return true;
          if (cur.getAttribute("aria-hidden") === "true" || cur.classList.contains("sr-only")) return true;
          cur = cur.parentElement;
        }
        return false;
      };
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const counts = new Map();
      let node;
      while ((node = walker.nextNode())) {
        const parent = node.parentElement;
        if (!parent) continue;
        if (parent.closest("script,style,noscript,template,svg,code,pre,[data-facet-count],[data-facet-rail]")) continue;
        if (isHidden(parent)) continue;
        const raw = node.nodeValue || "";
        const t = raw.replace(/\s+/g, " ").trim();
        if (t.startsWith("·")) continue; // facet mid-dot
        const m = t.match(/\b\d{1,3}(?:,\d{3})+\b/g);
        if (!m) continue;
        for (const token of m) {
          const n = Number(token.replace(/,/g, ""));
          if (n < 200) continue;
          counts.set(token, (counts.get(token) || 0) + 1);
        }
      }
      return [...counts.entries()]
        .filter(([, c]) => c >= 3)
        .map(([token, count]) => ({ token, count }));
    });
    for (const hit of found) {
      fail(`${vp.w}${route} repeated count ${hit.token} x${hit.count}`, { vp: vp.w, route, ...hit });
    }
    if (!found.length) console.log(`OK ${vp.w}${route}`);
  }
  await context.close();
}
await browser.close();
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(report.ok ? "PASS check-repeated-counts" : "FAIL check-repeated-counts", { hits: report.hits.length, out: OUT });
