/**
 * Fail if a floating/side panel covers an interactive control:
 * elementFromPoint at the control's center must be the control or its descendant/ancestor,
 * not a foreign panel (logo dock, map overlay aside, etc.).
 *
 * Usage: BASE=http://127.0.0.1:3460 node scripts/check-panel-hit.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = (process.env.BASE || "http://127.0.0.1:3460").replace(/\/$/, "");
const OUT = process.env.OUT || "reviews/panel-hit.json";
const ROUTES = [
  { path: "/", settle: 2500 },
  { path: "/companies", settle: 2000 },
  { path: "/founders", settle: 2000 },
  { path: "/data", settle: 1500 },
];
const VIEWPORTS = [
  { w: 390, h: 844 },
  { w: 1440, h: 900 },
];

const PANEL_SEL = [
  "[data-current-view-dock]",
  "[data-fold-map-overlays] > aside",
  "[data-fold-overlay-peak]",
  "[data-fold-overlay-founders]",
  "[data-fold-map-sheet]",
  "[data-browse-logo-strip]",
].join(", ");

const CONTROL_SEL = [
  "[data-contents-facet-map] button",
  "[data-contents-facet-map] a",
  "[data-contents-facet-map] label",
  "[data-contents-facet-map] input",
  "[data-contents-facet-map] [role='checkbox']",
  "[data-facet-row]",
  "[data-filter-chip]",
  "[data-founder-filters] button",
  "[data-founder-filters] select",
  "[data-founder-filters] input",
  "[data-fold-map-modes] button",
].join(", ");

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
    await page.goto(`${BASE}${route.path}`, { waitUntil: "load", timeout: 90000 });
    await page
      .waitForFunction(() => !/Loading/i.test(document.body.innerText), null, { timeout: 25000 })
      .catch(() => {});
    await page.waitForTimeout(route.settle);
    await page.evaluate(() => window.scrollTo(0, 0));

    const found = await page.evaluate(
      ({ controlSel, panelSel }) => {
        const vh = window.innerHeight;
        const vw = window.innerWidth;
        const hits = [];
        const controls = [...document.querySelectorAll(controlSel)];
        for (const el of controls) {
          const cs = getComputedStyle(el);
          if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity || "1") < 0.05) continue;
          if (cs.pointerEvents === "none") continue;
          const r = el.getBoundingClientRect();
          if (r.width < 4 || r.height < 4) continue;
          if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) continue;
          const x = Math.min(vw - 1, Math.max(1, r.left + r.width / 2));
          const y = Math.min(vh - 1, Math.max(1, r.top + r.height / 2));
          const top = document.elementFromPoint(x, y);
          if (!top) continue;
          if (el === top || el.contains(top) || top.contains(el)) continue;
          // Allowed: top is inside the same interactive control group
          const panel = top.closest(panelSel);
          if (!panel) continue;
          if (el.closest(panelSel) === panel) continue;
          // Panel covers this control
          hits.push({
            control: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60),
            panel: panel.getAttribute("data-current-view-dock") != null
              ? "current-view-dock"
              : panel.getAttribute("data-browse-logo-strip") != null
                ? "browse-logo-strip"
                : panel.tagName.toLowerCase() + (panel.className ? "." + String(panel.className).slice(0, 40) : ""),
            x: Math.round(x),
            y: Math.round(y),
          });
          if (hits.length >= 12) break;
        }
        return hits;
      },
      { controlSel: CONTROL_SEL, panelSel: PANEL_SEL },
    );

    for (const hit of found) {
      fail(`${vp.w}${route.path} panel=${hit.panel} covers "${hit.control}" @${hit.x},${hit.y}`, { vp: vp.w, route: route.path, ...hit });
    }
    if (!found.length) console.log(`OK ${vp.w}${route.path}`);
  }
  await context.close();
}

await browser.close();
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(report.ok ? "PASS check-panel-hit" : "FAIL check-panel-hit", { hits: report.hits.length, out: OUT });
