/**
 * Hard gate: no em dash (U+2014) or en dash (U+2013) in visible page text.
 * Reads document.body.innerText on each route and fails on any hit.
 *
 * /networks is not a route in this app (404); the network map lives at /map/network.
 * Usage: BASE=http://127.0.0.1:3460 node scripts/check-no-dash.mjs
 */
import { chromium } from "playwright";

const BASE = (process.env.BASE || "http://127.0.0.1:3460").replace(/\/$/, "");
const SAMPLE_ID = process.env.SAMPLE_ID || "proj_9GUOmdEYxbuH";
const ROUTES = ["/", "/founders", "/methodology", "/signals", `/startup/${SAMPLE_ID}`, "/map/network"];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
let total = 0;
for (const route of ROUTES) {
  const res = await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 90000 });
  if (!res || res.status() >= 400) {
    console.log(`${route}: HTTP ${res?.status()}`);
    total += 1;
    continue;
  }
  const r = await page.evaluate(() => {
    const t = document.body.innerText;
    const em = (t.match(/\u2014/g) || []).length;
    const en = (t.match(/\u2013/g) || []).length;
    const samples = [];
    const re = /.{0,40}[\u2013\u2014].{0,40}/g;
    let m;
    while ((m = re.exec(t)) && samples.length < 5) samples.push(m[0].replace(/\s+/g, " "));
    return { em, en, samples };
  });
  total += r.em + r.en;
  console.log(`${route}: em=${r.em} en=${r.en}${r.samples.length ? "\n  " + r.samples.join("\n  ") : ""}`);
}
await browser.close();
console.log(total === 0 ? "PASS: no dashes" : `FAIL: ${total} dash(es)`);
process.exit(total === 0 ? 0 : 1);
