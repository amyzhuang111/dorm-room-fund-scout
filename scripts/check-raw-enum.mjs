/**
 * Fail if visible DOM text still shows raw snake_case enrollment enums
 * (current_student, recent_grad, older_alumni) or their comma-mangled forms.
 *
 * Usage: BASE=http://127.0.0.1:3460 node scripts/check-raw-enum.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = (process.env.BASE || "http://127.0.0.1:3460").replace(/\/$/, "");
const OUT = process.env.OUT || "reviews/raw-enum.json";
const ROUTES = ["/", "/founders", "/companies", "/data", "/campuses", "/campuses/penn", "/networks"];
const VIEWPORTS = [
  { w: 390, h: 844 },
  { w: 1440, h: 900 },
];

const RAW_RE =
  /\b(current_student|recent_grad|older_alumni|enrollment_status|signal_type|pre_seed|series_[a-z])\b|\bcurrent,\s*student\b|\brecent,\s*grad\b|\bolder,\s*alumni\b/i;

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
    await page.goto(`${BASE}${route}`, { waitUntil: "load", timeout: 90000 });
    await page
      .waitForFunction(() => !/Loading/i.test(document.body.innerText), null, { timeout: 25000 })
      .catch(() => {});
    await page.waitForTimeout(2000);
    // Reveal quiet founder rows so hidden enum pitches are still checked on /founders
    if (route === "/founders") {
      const btn = page.locator('button:has-text("Show quiet rows"), button:has-text("Hide rows with no signal")').first();
      if (await btn.count()) {
        const label = await btn.textContent();
        if (/Hide rows/i.test(label || "")) {
          // already showing signals-only; also sample with quiet rows
          await btn.click().catch(() => {});
          await page.waitForTimeout(600);
        }
      }
    }
    const found = await page.evaluate((rawReSource) => {
      const re = new RegExp(rawReSource, "i");
      const hits = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const parent = node.parentElement;
        if (!parent) continue;
        const tag = parent.closest("script,style,noscript,template,svg,code,pre");
        if (tag) continue;
        const cs = getComputedStyle(parent);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        const t = node.nodeValue || "";
        if (!re.test(t)) continue;
        const sample = t.replace(/\s+/g, " ").trim().slice(0, 80);
        hits.push({ sample });
        if (hits.length >= 20) break;
      }
      return hits;
    }, RAW_RE.source);
    for (const hit of found) {
      fail(`${vp.w}${route} raw-enum "${hit.sample}"`, { vp: vp.w, route, ...hit });
    }
    if (!found.length) console.log(`OK ${vp.w}${route}`);
  }
  await context.close();
}

await browser.close();
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(report.ok ? "PASS check-raw-enum" : "FAIL check-raw-enum", { hits: report.hits.length, out: OUT });
