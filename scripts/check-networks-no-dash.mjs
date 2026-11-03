/**
 * Fail if any em dash (U+2014) or en dash (U+2013) appears in rendered /networks text.
 * Usage: BASE=http://127.0.0.1:PORT node scripts/check-networks-no-dash.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:3471";
const DASH_RE = /[\u2014\u2013]/;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${BASE}/networks`, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForSelector("[data-networks-page]", { timeout: 60000 });
await page.waitForTimeout(1000);

const hits = await page.evaluate((reSrc) => {
  const re = new RegExp(reSrc);
  const out = [];
  const walk = (el) => {
    if (!el) return;
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = node.textContent || "";
        if (re.test(t)) out.push(t.trim().slice(0, 160));
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const cs = getComputedStyle(node);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        walk(node);
      }
    }
  };
  walk(document.querySelector("[data-networks-page]") || document.body);
  return out;
}, DASH_RE.source);

await browser.close();
console.log(JSON.stringify({ ok: hits.length === 0, hits: hits.slice(0, 20), count: hits.length }, null, 2));
if (hits.length) {
  console.error("FAIL em/en dashes in /networks copy", hits.length);
  process.exit(1);
}
console.log("OK no em or en dashes in rendered /networks text");
