/**
 * Fail when any visible card description (data-card-pitch) is site chrome /
 * Speedrun SR00x application banner text rather than a real bio.
 * Usage: BASE=http://127.0.0.1:3460 node scripts/check-boilerplate-pitch.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = (process.env.BASE || "http://127.0.0.1:3460").replace(/\/$/, "");
const OUT = process.env.OUT || "reviews/boilerplate-pitch.json";
const CORE = ["/", "/founders", "/companies", "/data", "/networks", "/campuses", "/campuses/penn", "/campuses/mit", "/campuses/berkeley", "/campuses/georgia-tech", "/campuses/stanford", "/campuses/uiuc", "/campuses/yale", "/campuses/dartmouth", "/campuses/cambridge"];
const VIEWPORTS = [
  { w: 390, h: 844 },
  { w: 1440, h: 900 },
];
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const BAD = [
  /Had trouble submitting\?/i,
  /SR00\d application/i,
  /speedrun\.a16z\.com\/apply/i,
  /Skip to Search[\s\S]{0,40}Skip to Chat/i,
];

const browser = await chromium.launch({ headless: true });
const report = { ok: true, base: BASE, hits: [], routes: [] };

function fail(msg, hit) {
  console.error("FAIL", msg);
  report.ok = false;
  process.exitCode = 1;
  if (hit) report.hits.push(hit);
}

async function campusRoutes(page) {
  try {
    await page.goto(`${BASE}/campuses`, { waitUntil: "load", timeout: 90000 });
    await page.waitForTimeout(1200);
    const slugs = await page.evaluate(() =>
      [...document.querySelectorAll('a[href^="/campuses/"]')]
        .map((a) => a.getAttribute("href") || "")
        .filter((h) => /^\/campuses\/[a-z0-9-]+$/i.test(h)),
    );
    return [...new Set(slugs)].slice(0, 40);
  } catch {
    return CORE.filter((r) => r.startsWith("/campuses/"));
  }
}

const boot = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await boot.route(/vercel\.live/, (r) => r.abort());
const bootPage = await boot.newPage();
const campuses = await campusRoutes(bootPage);
await boot.close();
const ROUTES = [...new Set([...CORE, ...campuses])];
report.routes = ROUTES;

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
    await page.waitForTimeout(1500);
    if (route === "/founders") {
      const btn = page.locator('button:has-text("Show quiet")').first();
      if (await btn.count()) {
        await btn.click().catch(() => {});
        await page.waitForTimeout(500);
      }
    }
    const found = await page.evaluate((patterns) => {
      const hits = [];
      const nodes = document.querySelectorAll("[data-card-pitch]");
      for (const el of nodes) {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        if (el.classList.contains("sr-only")) continue;
        const text = (el.textContent || "").replace(/\s+/g, " ").trim();
        if (!text || text.length < 3) continue;
        const reasons = [];
        for (const src of patterns) {
          const re = new RegExp(src.source, src.flags);
          if (re.test(text)) reasons.push(src.source.slice(0, 40));
        }
        if (!reasons.length) continue;
        hits.push({ text: text.slice(0, 140), reasons });
        if (hits.length >= 20) break;
      }
      return hits;
    }, BAD.map((re) => ({ source: re.source, flags: re.flags })));
    for (const hit of found) {
      fail(`${vp.w}${route} boilerplate "${hit.text}" [${hit.reasons.join(",")}]`, { vp: vp.w, route, ...hit });
    }
    if (!found.length) console.log(`OK ${vp.w}${route}`);
    else console.log(`FAIL ${vp.w}${route} ${found.length}`, found.slice(0, 3).map((h) => h.text));
  }
  await context.close();
}
await browser.close();
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(report.ok ? "PASS check-boilerplate-pitch" : "FAIL check-boilerplate-pitch", {
  hits: report.hits.length,
  routes: ROUTES.length,
  out: OUT,
});
process.exit(report.ok ? 0 : 1);
