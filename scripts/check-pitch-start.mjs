/**
 * Fail when any visible card description (data-card-pitch):
 * - starts with a lowercase letter, word fragment, or orphan pronoun (him/it/…)
 * - contains '[' (unstripped bracket markers)
 * - ends with '.…' / '!…' / '?…' (period before ellipsis)
 * - quoted Bio / Bio excerpt / Speedrun segments start mid-word
 * Runs every listed route including all campus pages at 390 and 1440.
 * Usage: BASE=http://127.0.0.1:3460 node scripts/check-pitch-start.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = (process.env.BASE || "http://127.0.0.1:3460").replace(/\/$/, "");
const OUT = process.env.OUT || "reviews/pitch-start.json";
const CORE = ["/", "/founders", "/companies", "/data", "/networks", "/campuses", "/campuses/penn", "/campuses/mit", "/campuses/berkeley", "/campuses/georgia-tech", "/campuses/stanford"];
const VIEWPORTS = [
  { w: 390, h: 844 },
  { w: 1440, h: 900 },
];
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const PRONOUNS = new Set(["him", "her", "them", "it", "they", "we", "us", "me", "my", "his", "their", "its"]);

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
    return ["/campuses/penn", "/campuses/mit", "/campuses/berkeley", "/campuses/georgia-tech", "/campuses/stanford"];
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
    await page.waitForTimeout(1800);
    if (route === "/founders") {
      const btn = page.locator('button:has-text("Show quiet")').first();
      if (await btn.count()) {
        await btn.click().catch(() => {});
        await page.waitForTimeout(500);
      }
    }
    const found = await page.evaluate((pronouns) => {
      const hits = [];
      const nodes = document.querySelectorAll("[data-card-pitch]");
      for (const el of nodes) {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        // Skip sr-only why-blank
        if (el.classList.contains("sr-only")) continue;
        const text = (el.textContent || "").replace(/\s+/g, " ").trim();
        if (!text || text.length < 3) continue;
        const reasons = [];
        if (/^[a-z]/.test(text)) reasons.push("lowercase-start");
        if (/^[a-z]{1,4}\s+[A-Z]/.test(text)) reasons.push("word-fragment");
        const first = (text.match(/^[A-Za-z']+/)?.[0] || "").toLowerCase();
        if (pronouns.includes(first)) reasons.push(`pronoun:${first}`);
        if (text.includes("[")) reasons.push("bracket");
        if (/\.\u2026$/.test(text) || /\.\.\.$/.test(text) || /[.!?]\u2026$/.test(text)) reasons.push("punct-before-ellipsis");
        // Quoted Bio / Speedrun segments must not start mid-word.
        const quoteRe = /(?:Bio excerpt|Bio|on the Speedrun page)\s*:\s*["“]([^"”]*)["”]/gi;
        for (const qm of text.matchAll(quoteRe)) {
          const inner = (qm[1] || "").replace(/\s+/g, " ").trim();
          if (!inner) continue;
          if (/^[a-z]/.test(inner)) reasons.push("quoted-lowercase-start");
          if (/^[a-z]{1,6}\s+[A-Z]/.test(inner)) reasons.push("quoted-word-fragment");
          const qFirst = (inner.match(/^[A-Za-z']+/)?.[0] || "").toLowerCase();
          if (pronouns.includes(qFirst)) reasons.push(`quoted-pronoun:${qFirst}`);
        }
        if (!reasons.length) continue;
        hits.push({ text: text.slice(0, 120), reasons });
        if (hits.length >= 20) break;
      }
      return hits;
    }, [...PRONOUNS]);
    for (const hit of found) {
      fail(`${vp.w}${route} pitch-start "${hit.text}" [${hit.reasons.join(",")}]`, { vp: vp.w, route, ...hit });
    }
    if (!found.length) console.log(`OK ${vp.w}${route}`);
    else console.log(`FAIL ${vp.w}${route} ${found.length}`, found.slice(0, 3).map((h) => h.text));
  }
  await context.close();
}
await browser.close();
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(report.ok ? "PASS check-pitch-start" : "FAIL check-pitch-start", { hits: report.hits.length, routes: ROUTES.length, out: OUT });
process.exit(report.ok ? 0 : 1);
