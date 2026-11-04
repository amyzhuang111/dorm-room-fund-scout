/**
 * Fail if visible hero/stat text sits flush against the viewport or its
 * padded container edge (no left/right padding).
 *
 * Usage: BASE=http://127.0.0.1:3460 node scripts/check-edge-padding.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = (process.env.BASE || "http://127.0.0.1:3460").replace(/\/$/, "");
const OUT = process.env.OUT || "reviews/edge-padding.json";
const MIN_PAD = Number(process.env.MIN_PAD || 8);
const ROUTES = ["/", "/companies", "/founders", "/data"];
const VIEWPORTS = [
  { w: 390, h: 844 },
  { w: 1440, h: 900 },
];
const TARGET_SEL = [
  "[data-fold-counts]",
  "[data-fold-counts-line]",
  "[data-hero-stat]",
  "[data-fold-counts-companies]",
].join(", ");

const browser = await chromium.launch({ headless: true });
const report = { ok: true, base: BASE, minPad: MIN_PAD, hits: [] };

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
      ? {
          deviceScaleFactor: 3,
          isMobile: true,
          hasTouch: true,
          userAgent:
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        }
      : { deviceScaleFactor: 2 }),
  });
  await context.route(/vercel\.live/, (r) => r.abort());
  const page = await context.newPage();
  for (const route of ROUTES) {
    await page.goto(`${BASE}${route}`, { waitUntil: "load", timeout: 90000 });
    await page
      .waitForFunction(() => !/Loading/i.test(document.body.innerText), null, { timeout: 25000 })
      .catch(() => {});
    await page.waitForTimeout(1800);
    const found = await page.evaluate(
      ({ sel, minPad }) => {
        const hits = [];
        const vw = document.documentElement.clientWidth;
        for (const el of document.querySelectorAll(sel)) {
          const cs = getComputedStyle(el);
          if (cs.display === "none" || cs.visibility === "hidden") continue;
          const r = el.getBoundingClientRect();
          if (r.width < 4 || r.height < 4) continue;
          if (r.bottom <= 0 || r.top >= window.innerHeight) continue;
          // Content start = border-box left + padding-left (full-bleed boxes with pad are OK)
          const padL = parseFloat(cs.paddingLeft) || 0;
          const contentLeft = r.left + padL;
          if (contentLeft < minPad - 0.5) {
            hits.push({
              kind: "viewport-left",
              left: Math.round(contentLeft * 10) / 10,
              text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 50),
            });
          }
          // Number jammed against label with no gap (1,646vetted) — use innerText which
          // preserves flex-item separation as spaces in modern engines.
          const jammed = (el.innerText || el.textContent || "").replace(/[\u00A0\s]+/g, " ");
          if (/\dvet(?:ted)?|\dignal|\dcampus|\dlisted|\dindexed/i.test(jammed.replace(/,/g, ""))) {
            hits.push({ kind: "jammed-stat-label", text: jammed.trim().slice(0, 60) });
          }
        }
        return hits;
      },
      { sel: TARGET_SEL, minPad: MIN_PAD },
    );
    for (const hit of found) {
      fail(`${vp.w}${route} ${hit.kind} left=${hit.left ?? ""} "${hit.text}"`, { vp: vp.w, route, ...hit });
    }
    if (!found.length) console.log(`OK ${vp.w}${route}`);
  }
  await context.close();
}

await browser.close();
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(report.ok ? "PASS check-edge-padding" : "FAIL check-edge-padding", { hits: report.hits.length, out: OUT });
