/**
 * Mobile audit: widths 320/375/390/430, DPR3, touch emulation.
 * Reports overflow, small tap targets, text <14px, map obstruction.
 */
import { chromium, devices } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = (process.env.BASE || "http://127.0.0.1:3477").replace(/\/$/, "");
const OUT = process.env.OUT || "/tmp/campus-mobile-compat/reviews/mobile-audit";
const WIDTHS = [320, 375, 390, 430];
const ROUTES = [
  "/",
  "/founders",
  "/companies",
  "/data",
  "/campuses",
  "/campuses/penn",
  "/campuses/georgia-tech",
  "/networks",
  "/map",
  "/startup/proj_9GUOmdEYxbuH", // sample dossier if exists
];

fs.mkdirSync(OUT, { recursive: true });

async function auditPage(page, route, width) {
  const url = `${BASE}${route}`;
  let status = 0;
  try {
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    status = res?.status() || 0;
  } catch (e) {
    return { route, width, status: 0, error: String(e.message || e), issues: ["load-failed"] };
  }
  await page.waitForTimeout(1800);

  const issues = await page.evaluate(() => {
    const out = [];
    const docW = document.documentElement.clientWidth;
    const scrollW = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0);
    if (scrollW > docW + 1) out.push({ kind: "horizontal-overflow", scrollW, docW, delta: scrollW - docW });

    // overflowed children
    const overflowEls = [];
    for (const el of document.querySelectorAll("body *")) {
      if (!(el instanceof HTMLElement)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      if (r.right > docW + 2 || r.left < -2) {
        if (overflowEls.length < 8) {
          overflowEls.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.className || "").toString().slice(0, 80),
            right: Math.round(r.right),
            left: Math.round(r.left),
            text: (el.innerText || "").slice(0, 40).replace(/\s+/g, " "),
          });
        }
      }
    }
    if (overflowEls.length) out.push({ kind: "overflow-elements", sample: overflowEls });

    // tap targets < 44
    const smallTaps = [];
    const selectors = "a, button, [role=button], input, select, summary, [data-tier-reason], [data-tooltip], label";
    for (const el of document.querySelectorAll(selectors)) {
      if (!(el instanceof HTMLElement)) continue;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || style.pointerEvents === "none") continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      // skip if offscreen above fold a lot
      if (r.bottom < 0 || r.top > window.innerHeight * 2) continue;
      const w = r.width;
      const h = r.height;
      if (w < 44 || h < 44) {
        if (smallTaps.length < 20) {
          smallTaps.push({
            tag: el.tagName.toLowerCase(),
            w: Math.round(w),
            h: Math.round(h),
            text: (el.innerText || el.getAttribute("aria-label") || "").slice(0, 40).replace(/\s+/g, " "),
            cls: (el.className || "").toString().slice(0, 60),
          });
        }
      }
    }
    if (smallTaps.length) out.push({ kind: "tap-under-44", count: smallTaps.length, sample: smallTaps });

    // text under 14px in main content
    const smallText = [];
    for (const el of document.querySelectorAll("p, span, a, button, td, th, li, label, h1, h2, h3, h4")) {
      if (!(el instanceof HTMLElement)) continue;
      if (!el.childNodes.length) continue;
      const hasOwnText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!hasOwnText && el.children.length) continue;
      const style = getComputedStyle(el);
      const fs = parseFloat(style.fontSize);
      if (fs > 0 && fs < 14) {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        if (smallText.length < 15) {
          smallText.push({
            fs: Math.round(fs * 10) / 10,
            tag: el.tagName.toLowerCase(),
            text: (el.innerText || "").slice(0, 40).replace(/\s+/g, " "),
            cls: (el.className || "").toString().slice(0, 50),
          });
        }
      }
    }
    if (smallText.length) out.push({ kind: "text-under-14", count: smallText.length, sample: smallText });

    // map obstruction
    const map = document.querySelector("[data-fold-map], [data-globe-stage], canvas, .maplibregl-map, [data-networks-stage]");
    if (map) {
      const mr = map.getBoundingClientRect();
      const mapArea = Math.max(0, mr.width) * Math.max(0, mr.height);
      // overlays that sit on map
      let covered = 0;
      // approximate: sticky/fixed panels intersecting map
      for (const el of document.querySelectorAll("[data-fold-sheet], [data-peek], .sheet, [data-overlay]")) {
        if (!(el instanceof HTMLElement)) continue;
        const r = el.getBoundingClientRect();
        const ix = Math.max(0, Math.min(r.right, mr.right) - Math.max(r.left, mr.left));
        const iy = Math.max(0, Math.min(r.bottom, mr.bottom) - Math.max(r.top, mr.top));
        covered += ix * iy;
      }
      const unobstructed = mapArea > 0 ? 1 - Math.min(1, covered / mapArea) : 1;
      if (unobstructed < 0.8) out.push({ kind: "map-obstructed", unobstructed: Math.round(unobstructed * 100) / 100 });
    }

    // invalid dates
    const bodyText = document.body?.innerText || "";
    if (/2026-05-00/.test(bodyText)) out.push({ kind: "invalid-date-2026-05-00" });

    // counts visible
    const counts = {};
    for (const el of document.querySelectorAll("[data-count]")) {
      counts[el.getAttribute("data-count")] = (el.textContent || "").trim();
    }
    const stats = document.querySelector("[data-campuses-stats], [data-fold-counts]");
    if (stats) counts._stats = (stats.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160);

    // tier visibility
    const tierEls = document.querySelectorAll("[data-tier], [data-signal-tier], .tier");
    let tierMention = /tier/i.test(bodyText.slice(0, 5000));
    counts._tierVisible = tierMention;

    // hover-only tooltips without tap
    const hoverOnly = [];
    for (const el of document.querySelectorAll("[title], [data-tooltip]:not([data-tooltip-tap]), [data-tier-reason]:not(button):not(a):not([tabindex])")) {
      if (!(el instanceof HTMLElement)) continue;
      if (hoverOnly.length < 10) {
        hoverOnly.push({
          tag: el.tagName.toLowerCase(),
          title: (el.getAttribute("title") || "").slice(0, 40),
          cls: (el.className || "").toString().slice(0, 50),
        });
      }
    }
    if (hoverOnly.length) out.push({ kind: "possible-hover-only", count: hoverOnly.length, sample: hoverOnly });

    return { issues: out, counts, title: document.title };
  });

  return { route, width, status, ...issues };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const width of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width, height: 812 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      userAgent: devices["iPhone 13"].userAgent,
    });
    const page = await context.newPage();
    for (const route of ROUTES) {
      const r = await auditPage(page, route, width);
      results.push(r);
      console.log(JSON.stringify({ route, width, status: r.status, issueKinds: (r.issues || []).map((i) => i.kind || i) }));
      if (width === 375 && ["/","/founders","/data","/networks"].includes(route) && r.status === 200) {
        const shot = path.join(OUT, `before-${route.replace(/\W+/g, "_") || "home"}-375.png`);
        await page.screenshot({ path: shot, fullPage: false });
      }
    }
    await context.close();
  }
  fs.writeFileSync(path.join(OUT, "audit-before.json"), JSON.stringify(results, null, 2));
  await browser.close();
  console.log("wrote", path.join(OUT, "audit-before.json"));
}
main().catch((e) => { console.error(e); process.exit(1); });
