/**
 * Fail if settled hero/corpus stats render 0 or NaN after 5s.
 * Targets known positive corpus figures (vetted companies, peak figure, fold counts).
 * Legitimate per-row zeros (e.g. "0 signals" on a quiet campus) are ignored.
 *
 * Usage: BASE=http://127.0.0.1:3460 node scripts/check-stat-zero.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = (process.env.BASE || "http://127.0.0.1:3460").replace(/\/$/, "");
const OUT = process.env.OUT || "reviews/stat-zero.json";
const SETTLE_MS = Number(process.env.SETTLE_MS || 5000);
const ROUTES = ["/", "/companies", "/founders", "/data", "/campuses"];
const VIEWPORTS = [
  { w: 390, h: 844 },
  { w: 1440, h: 900 },
];

const browser = await chromium.launch({ headless: true });
const report = { ok: true, base: BASE, settleMs: SETTLE_MS, hits: [] };

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
    await page.waitForTimeout(SETTLE_MS);
    const found = await page.evaluate(() => {
      const hits = [];
      const text = document.body.innerText || "";
      if (/\bNaN\b/.test(text)) hits.push({ kind: "nan-text", sample: (text.match(/.{0,40}NaN.{0,40}/) || [""])[0] });

      const positiveSels = [
        "[data-fold-peak-shell='live'] [data-fold-peak-figure]",
        "[data-count='investable-companies']",
        "[data-fold-counts-companies] [class*='font-mono'], [data-fold-counts-companies]",
        "[data-match-count]",
        "[data-total-count]",
      ];
      for (const sel of positiveSels) {
        for (const el of document.querySelectorAll(sel)) {
          const cs = getComputedStyle(el);
          if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity || "1") < 0.05) continue;
          const r = el.getBoundingClientRect();
          if (r.width < 1 || r.height < 1) continue;
          const raw = (el.textContent || "").replace(/,/g, "").trim();
          // Leading integer only (ignore "34/103" peak-share ratios if they slip in)
          const m = raw.match(/^-?\d+(?:\.\d+)?/);
          const num = m ? Number(m[0]) : NaN;
          if (!Number.isFinite(num) || num === 0) {
            hits.push({ kind: "zero-or-nan-stat", sel, raw: (el.textContent || "").trim().slice(0, 40) });
          }
        }
      }

      // Labelled "Vetted companies" figure stuck at 0
      for (const el of document.querySelectorAll("p,span,div")) {
        const t = (el.textContent || "").replace(/\s+/g, " ").trim();
        if (/^Vetted companies$/i.test(t)) {
          const next = el.nextElementSibling;
          const fig = next?.matches?.("[data-fold-peak-figure]") ? next : el.parentElement?.querySelector?.("[data-fold-peak-figure]");
          if (fig) {
            const n = Number((fig.textContent || "").replace(/,/g, "").trim());
            if (!Number.isFinite(n) || n === 0) {
              hits.push({ kind: "vetted-companies-zero", raw: (fig.textContent || "").trim() });
            }
          }
        }
      }
      return hits;
    });
    for (const hit of found) {
      fail(`${vp.w}${route} ${hit.kind} ${hit.raw || hit.sample || ""}`, { vp: vp.w, route, ...hit });
    }
    if (!found.length) console.log(`OK ${vp.w}${route}`);
  }
  await context.close();
}

await browser.close();
fs.mkdirSync(OUT.replace(/\/[^/]+$/, "") || ".", { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(report.ok ? "PASS check-stat-zero" : "FAIL check-stat-zero", { hits: report.hits.length, out: OUT });
