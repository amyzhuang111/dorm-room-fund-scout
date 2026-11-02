/**
 * Fail if any primary route renders a period-as-thousands-separator number
 * (e.g. "1.172") under a non-en locale, or if source still calls
 * toLocaleString()/NumberFormat without an explicit "en-US".
 *
 * Usage: BASE=http://127.0.0.1:3460 node scripts/check-en-us-grouping.mjs
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

const BASE = process.env.BASE || "http://127.0.0.1:3460";
const OUT = process.env.OUT || "reviews/en-us-grouping.json";

const sourceHits = execFileSync(process.env.PYTHON || "python3", ["scripts/_scan_locale_formatters.py"], {
  encoding: "utf8",
  cwd: process.cwd(),
}).trim();

const ROUTES = [
  "/",
  "/companies",
  "/companies?feed=leaderboard",
  "/founders",
  "/campuses",
  "/data",
  "/signals",
  "/startup/proj_9GUOmdEYxbuH",
];
const VIEWPORTS = [
  { name: "375", width: 375, height: 812, locale: "de-DE" },
  { name: "1440", width: 1440, height: 900, locale: "de-DE" },
];

const PERIOD_THOUSANDS = /(?<![.\d])(\d{1,3}(?:\.\d{3})+)(?!\.\d)/g;

const browser = await chromium.launch({ headless: true });
const pages = [];
let ok = !sourceHits;
const offenders = [];
if (sourceHits) {
  console.log("FAIL source default-locale formatters:\n" + sourceHits);
}

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({
    viewport: { width: vp.width, height: vp.height },
    locale: vp.locale,
  });
  for (const route of ROUTES) {
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(
      route === "/" || route.startsWith("/data") || route.startsWith("/companies") ? 1600 : 900,
    );
    const found = await page.evaluate((reSrc) => {
      const re = new RegExp(reSrc, "g");
      const text = document.body?.innerText || "";
      const hits = [...new Set([...text.matchAll(re)].map((m) => m[1]))];
      const figures = [...document.querySelectorAll(".m-figure, [data-peak-figure], [data-fold-peak-figure]")].map(
        (el) => el.textContent?.replace(/\s+/g, " ").trim() || "",
      );
      return { hits, figures };
    }, PERIOD_THOUSANDS.source);
    const bad = found.hits.filter((h) => h.replace(/\./g, "").length >= 4);
    pages.push({
      route,
      viewport: vp.name,
      locale: vp.locale,
      periodThousands: bad,
      figures: found.figures.slice(0, 6),
    });
    if (bad.length) {
      ok = false;
      offenders.push({ route, viewport: vp.name, bad });
      console.log(`FAIL ${vp.name} ${route} → ${bad.join(", ")}`);
    } else {
      console.log(`OK ${vp.name} ${route}`);
    }
  }
  await page.close();
}
await browser.close();

const report = { ok, sourceHits: sourceHits || null, offenders, pages };
fs.mkdirSync(path.dirname(OUT) === "." ? "." : path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok, offenders: offenders.length, sourceHits: Boolean(sourceHits), wrote: OUT }, null, 2));
if (!ok) process.exit(1);
