/**
 * Fail on mobile horizontal overflow or tap targets under 44px.
 * Usage: BASE=http://127.0.0.1:3477 node scripts/check-mobile-compat.mjs
 */
import { chromium, devices } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = (process.env.BASE || "http://127.0.0.1:3477").replace(/\/$/, "");
const WIDTHS = [320, 375, 390, 430];
const ROUTES = ["/", "/founders", "/companies", "/data", "/campuses", "/networks"];
const OUT = path.join(process.cwd(), "reviews", "mobile-compat-gate.json");

async function measure(page) {
  return page.evaluate(() => {
    const docW = document.documentElement.clientWidth;
    const scrollW = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0);
    const overflow = scrollW > docW + 2;

    const small = [];
    const selectors = "a, button, [role=button], input, select, summary";
    for (const el of document.querySelectorAll(selectors)) {
      if (!(el instanceof HTMLElement)) continue;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) continue;
      if (style.pointerEvents === "none") continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      if (r.bottom < 0 || r.top > window.innerHeight * 1.5) continue;
      // Skip visually tiny decorative marks without text/label
      const label = (el.getAttribute("aria-label") || el.innerText || "").trim();
      if (!label && r.width < 24 && r.height < 24) continue;
      if (r.width < 44 || r.height < 44) {
        if (small.length < 25) {
          small.push({
            tag: el.tagName.toLowerCase(),
            w: Math.round(r.width),
            h: Math.round(r.height),
            text: label.slice(0, 48).replace(/\s+/g, " "),
          });
        }
      }
    }
    // invalid date
    const invalidDate = /20\d{2}-\d{2}-00/.test(document.body?.innerText || "");
    return { overflow, scrollW, docW, smallTapCount: small.length, smallTaps: small, invalidDate };
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  const inventory = [];

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
      const url = `${BASE}${route}`;
      let status = 0;
      try {
        const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
        status = res?.status() || 0;
        await page.waitForTimeout(1200);
      } catch (e) {
        errors.push({ route, width, kind: "load", detail: String(e.message || e) });
        inventory.push({ route, width, status: 0, error: String(e.message || e) });
        continue;
      }
      if (status >= 400) {
        errors.push({ route, width, kind: "http", detail: status });
      }
      const m = await measure(page);
      inventory.push({ route, width, status, ...m, smallTaps: m.smallTaps.slice(0, 8) });
      if (m.overflow) errors.push({ route, width, kind: "horizontal-overflow", detail: `${m.scrollW}>${m.docW}` });
      if (m.smallTapCount > 0) errors.push({ route, width, kind: "tap-under-44", detail: m.smallTapCount, sample: m.smallTaps.slice(0, 5) });
      if (m.invalidDate) errors.push({ route, width, kind: "invalid-date", detail: "day 00 visible" });
    }
    await context.close();
  }

  // /map must redirect to /networks
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    const res = await page.goto(`${BASE}/map`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const finalUrl = page.url();
    inventory.push({ route: "/map", redirectTo: finalUrl, status: res?.status() });
    if (!/\/networks\/?$/.test(new URL(finalUrl).pathname)) {
      errors.push({ route: "/map", kind: "redirect", detail: finalUrl });
    }
    await context.close();
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ ok: errors.length === 0, errors, inventory }, null, 2));
  await browser.close();
  if (errors.length) {
    console.error("mobile-compat gate FAILED", errors.length, "issues");
    console.error(JSON.stringify(errors.slice(0, 20), null, 2));
    process.exit(1);
  }
  console.log("mobile-compat gate OK", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
