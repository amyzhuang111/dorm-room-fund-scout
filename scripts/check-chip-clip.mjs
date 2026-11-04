/**
 * Fail when a tag chip's right edge extends past its row's clip/client box
 * (mid-word horizontal clip from overflow:hidden).
 * Usage: BASE=http://127.0.0.1:3460 node scripts/check-chip-clip.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = (process.env.BASE || "http://127.0.0.1:3460").replace(/\/$/, "");
const OUT = process.env.OUT || "reviews/chip-clip.json";
const ROUTES = ["/", "/founders", "/companies", "/data", "/campuses/penn", "/networks"];
const VIEWPORTS = [
  { w: 390, h: 844 },
  { w: 1440, h: 900 },
];
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

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
      ? { deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA }
      : { deviceScaleFactor: 2 }),
  });
  await context.route(/vercel\.live/, (r) => r.abort());
  const page = await context.newPage();
  for (const route of ROUTES) {
    await page.goto(`${BASE}${route}`, { waitUntil: "load", timeout: 90000 });
    await page.waitForFunction(() => !/Loading/i.test(document.body?.innerText || ""), null, { timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(2800);
    const found = await page.evaluate(() => {
      const hits = [];
      const rows = document.querySelectorAll("[data-tag-chips], [data-card-chips]");
      for (const row of rows) {
        const cs = getComputedStyle(row);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        const rowBox = row.getBoundingClientRect();
        if (rowBox.width < 4) continue;
        // Clip edge: row itself, else nearest ancestor that clips overflow-x
        let clipRight = rowBox.right;
        let overflowX = cs.overflowX;
        if (/(hidden|auto|scroll)/.test(cs.overflowX) || /(hidden|auto|scroll)/.test(cs.overflow)) {
          clipRight = row.clientLeft + row.clientWidth + rowBox.left;
        } else {
          let p = row.parentElement;
          while (p && p !== document.body) {
            const pcs = getComputedStyle(p);
            if (/(hidden|auto|scroll)/.test(pcs.overflowX) || /(hidden|auto|scroll)/.test(pcs.overflow)) {
              const pb = p.getBoundingClientRect();
              clipRight = Math.min(clipRight, p.clientLeft + p.clientWidth + pb.left);
              overflowX = pcs.overflowX;
              break;
            }
            p = p.parentElement;
          }
        }
        const chips = row.querySelectorAll("[data-tag-chip], :scope > span, :scope > button");
        for (const chip of chips) {
          if (chip.hasAttribute("data-tag-chips-measure") || chip.closest("[data-tag-chips-measure]")) continue;
          const r = chip.getBoundingClientRect();
          if (r.width < 2 || r.height < 2) continue;
          const over = r.right - clipRight;
          if (over > 1.5) {
            hits.push({
              label: (chip.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40),
              over: Math.round(over),
              overflowX,
            });
          }
          if (hits.length >= 20) break;
        }
        if (hits.length >= 20) break;
      }
      return hits;
    });
    for (const hit of found) {
      fail(`${vp.w}${route} chip-clip "${hit.label}" +${hit.over}px`, { vp: vp.w, route, ...hit });
    }
    if (!found.length) console.log(`OK ${vp.w}${route}`);
    else console.log(`FAIL ${vp.w}${route} ${found.length}`, found.slice(0, 6).map((h) => h.label));
  }
  await context.close();
}
await browser.close();
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(report.ok ? "PASS check-chip-clip" : "FAIL check-chip-clip", { hits: report.hits.length, out: OUT });
process.exit(report.ok ? 0 : 1);
