/**
 * Hard gate: floating fold/map overlays must not cover real page text or controls
 * at 1440 and 375 on every primary route.
 *
 * Counts:
 *   overlay-on-text     — overlay intersects visible text outside the overlay itself
 *   overlay-on-control  — overlay intersects interactive controls outside itself
 *
 * Fold content inside a collapsible panel is allowed; covering stats/search/Map
 * labels or Program filters is not.
 *
 * Usage: BASE=http://127.0.0.1:3460 node scripts/check-overlay.mjs
 */
import { chromium } from "playwright";
import fs from "fs";

const BASE = (process.env.BASE || "http://127.0.0.1:3460").replace(/\/$/, "");
const OUT = process.env.OUT || "reviews/overlay.json";

const ROUTES = [
  "/",
  "/companies",
  "/companies?more=2",
  "/companies?feed=leaderboard",
  "/founders",
  "/campuses",
  "/data",
  "/networks",
  "/signals",
  "/startup/proj_9GUOmdEYxbuH",
];

const VIEWPORTS = [
  { name: "375", width: 375, height: 812 },
  { name: "1440", width: 1440, height: 900 },
];

const OVERLAY_SEL = [
  "[data-fold-map-overlays] > aside",
  "[data-fold-map-legend]",
  "[data-fold-map-sheet]",
  "[data-fold-overlay-peak]",
  "[data-fold-overlay-founders]",
].join(", ");

function fail(msg) {
  console.error("FAIL", msg);
  process.exitCode = 1;
}

const browser = await chromium.launch({ headless: true });
const report = { ok: true, base: BASE, pages: [], totals: { overlayOnText: 0, overlayOnControl: 0 } };

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.width <= 400 ? 2 : 1,
  });
  for (const route of ROUTES) {
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    if (route === "/") {
      await page.waitForSelector("[data-directory-ready='1'], [data-fold-peak-figure], [data-founder-search]", { timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(1600);
    } else {
      await page.waitForTimeout(900);
    }
    await page.evaluate(() => window.scrollTo(0, 0));

    const found = await page.evaluate((overlaySel) => {
      const vh = window.innerHeight;
      const vw = window.innerWidth;

      function visible(el) {
        if (!el || el.nodeType !== 1) return false;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (r.width < 2 || r.height < 2) return false;
        if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) return false;
        if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity || "1") < 0.05) return false;
        if (el.closest("[hidden], [aria-hidden='true'], .sr-only")) return false;
        return true;
      }

      function rectOf(el) {
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height };
      }

      function intersects(a, b, pad = 1) {
        return !(a.right <= b.left + pad || a.left >= b.right - pad || a.bottom <= b.top + pad || a.top >= b.bottom - pad);
      }

      function area(a, b) {
        const x1 = Math.max(a.left, b.left);
        const y1 = Math.max(a.top, b.top);
        const x2 = Math.min(a.right, b.right);
        const y2 = Math.min(a.bottom, b.bottom);
        return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
      }

      // Overlays that actually paint above the map/page chrome.
      const overlays = [...document.querySelectorAll(overlaySel)].filter((el) => {
        if (!visible(el)) return false;
        // Collapsed legend chip alone is fine; still measure if it covers controls.
        return true;
      });

      // Protected text: stats line, Map label, search, page headings — outside overlays.
      const textCandidates = [];
      const textRoots = [
        ...document.querySelectorAll(
          "[data-fold-counts], [data-fold-desk-map] > h2, [data-fold-mast], [data-founder-search], [data-sample-strip-counts], h1, [data-corpus-explorer] h1, [data-company-name-lead]",
        ),
      ];
      for (const root of textRoots) {
        if (!visible(root)) continue;
        if (root.closest(overlaySel)) continue;
        // Collect leaf-ish text nodes via element rects with text
        const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = walk.nextNode())) {
          const t = (n.textContent || "").replace(/\s+/g, " ").trim();
          if (t.length < 2) continue;
          const parent = n.parentElement;
          if (!parent || !visible(parent)) continue;
          if (parent.closest(overlaySel)) continue;
          if (parent.closest("script, style, noscript")) continue;
          textCandidates.push({ el: parent, text: t.slice(0, 60), rect: rectOf(parent) });
        }
        // Also the root itself if it has direct visual size
        textCandidates.push({ el: root, text: (root.textContent || "").trim().slice(0, 60), rect: rectOf(root) });
      }

      // Controls: inputs, selects, buttons, links that are page chrome (not inside overlay).
      const controlCandidates = [...document.querySelectorAll("input, select, button, textarea, a[href], [role='button'], [data-founder-filter-select]")]
        .filter((el) => visible(el))
        .filter((el) => !el.closest(overlaySel))
        .filter((el) => !el.closest("[data-fold-map-overlays], [data-fold-map-sheet], [data-fold-map-legend]"))
        .map((el) => ({
          el,
          text: (el.getAttribute("aria-label") || el.textContent || el.getAttribute("name") || el.tagName).trim().slice(0, 50),
          rect: rectOf(el),
        }));

      const onText = [];
      const onControl = [];

      for (const ov of overlays) {
        const orect = rectOf(ov);
        // Ignore near-zero collapsed chips under 40×20 unless they hit a control.
        for (const t of textCandidates) {
          if (!intersects(orect, t.rect, 2)) continue;
          const hit = area(orect, t.rect);
          if (hit < 24) continue;
          // Sheet at rest may sit over empty map; only flag if text is NOT inside sheet/overlay.
          if (t.el.closest("[data-fold-map-sheet], [data-fold-map-overlays], [data-fold-map-legend]")) continue;
          onText.push({
            overlay: ov.getAttribute("data-fold-overlay-peak") != null ? "peak" : ov.getAttribute("data-fold-overlay-founders") != null ? "founders" : ov.getAttribute("data-fold-map-legend") != null ? "legend" : ov.getAttribute("data-fold-map-sheet") != null ? "sheet" : ov.tagName,
            text: t.text,
            hit: Math.round(hit),
          });
        }
        for (const c of controlCandidates) {
          if (!intersects(orect, c.rect, 2)) continue;
          const hit = area(orect, c.rect);
          if (hit < 16) continue;
          onControl.push({
            overlay: ov.getAttribute("data-fold-overlay-peak") != null ? "peak" : ov.getAttribute("data-fold-overlay-founders") != null ? "founders" : ov.getAttribute("data-fold-map-legend") != null ? "legend" : ov.getAttribute("data-fold-map-sheet") != null ? "sheet" : ov.tagName,
            control: c.text,
            hit: Math.round(hit),
          });
        }
      }

      // Dedupe by text/control string
      const dedupe = (arr, key) => {
        const seen = new Set();
        return arr.filter((x) => {
          const k = `${x.overlay}|${x[key]}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
      };

      return {
        overlayCount: overlays.length,
        onText: dedupe(onText, "text"),
        onControl: dedupe(onControl, "control"),
      };
    }, OVERLAY_SEL);

    const entry = {
      route,
      viewport: vp.name,
      overlayCount: found.overlayCount,
      overlayOnText: found.onText.length,
      overlayOnControl: found.onControl.length,
      onText: found.onText.slice(0, 12),
      onControl: found.onControl.slice(0, 12),
    };
    report.pages.push(entry);
    report.totals.overlayOnText += entry.overlayOnText;
    report.totals.overlayOnControl += entry.overlayOnControl;

    const label = `${route}@${vp.name}`;
    if (entry.overlayOnText || entry.overlayOnControl) {
      report.ok = false;
      fail(
        `${label}: overlay-on-text=${entry.overlayOnText} overlay-on-control=${entry.overlayOnControl} text=${JSON.stringify(entry.onText).slice(0, 280)} ctrl=${JSON.stringify(entry.onControl).slice(0, 280)}`,
      );
    } else {
      console.log(`OK ${label} overlays=${entry.overlayCount} overlay-on-text=0 overlay-on-control=0`);
    }
  }
  await page.close();
}

await browser.close();
fs.mkdirSync("reviews", { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(`Wrote ${OUT}`);
if (!report.ok) {
  console.error("check-overlay FAILED", report.totals);
  process.exit(1);
}
console.log("PASS check-overlay", report.totals);
