/**
 * Hard gate: no em dash (U+2014) or en dash (U+2013) in visible page text.
 *
 * Pass 1 (Playwright): document.body.innerText on core routes AFTER hydration,
 *   at both 390 and 1440 (catches client-inserted en/em dashes).
 * Pass 2 (HTML crawl): every dossier route, /startup/<id> for all companies in
 *   public/data/candidates.json plus every companyId in public/data/founders.json,
 *   and the founder pages. Server HTML with <script>/<style>/<template> removed,
 *   tags stripped, entities decoded. Stricter than innerText (hidden text counts).
 * Any dash anywhere fails. /networks is not a route here; the network map is /map/network.
 *
 * Usage: BASE=http://127.0.0.1:3460 node scripts/check-no-dash.mjs
 * Env: CONCURRENCY (default 12), OUT (default reviews/no-dash.json)
 */
import { chromium } from "playwright";
import fs from "fs";

const BASE = (process.env.BASE || "http://127.0.0.1:3460").replace(/\/$/, "");
const CONCURRENCY = Number(process.env.CONCURRENCY || 12);
const OUT = process.env.OUT || "reviews/no-dash.json";
const SAMPLE_ID = process.env.SAMPLE_ID || "proj_9GUOmdEYxbuH";
const CORE = ["/", "/companies", "/founders", "/data", "/networks", "/methodology", "/signals", `/startup/${SAMPLE_ID}`, "/map/network", "/campuses/penn", "/campuses", "/campuses/stanford", "/campuses/mit", "/campuses/berkeley"];
const FOUNDER_PAGES = ["/founders", "/founder/network", "/founder/discover", "/founder/shortlist"];

const campusIndex = (() => {
  const paths = ["public/data/campuses.json", "data/corpus-snapshot.json"];
  for (const path of paths) {
    try {
      if (!fs.existsSync(path)) continue;
      const raw = JSON.parse(fs.readFileSync(path, "utf8"));
      if (Array.isArray(raw)) {
        return raw.flatMap((c) => {
          const slug = c.slug || c.id;
          return slug ? [`/campuses/${slug}`] : [];
        });
      }
      if (raw && Array.isArray(raw.campuses)) {
        return raw.campuses.flatMap((c) => {
          const slug = c.slug || c.id;
          return slug ? [`/campuses/${slug}`] : [];
        });
      }
    } catch {}
  }
  // Always include Penn (known dash source label) and a few desk campuses.
  return ["/campuses/penn", "/campuses/stanford", "/campuses/mit", "/campuses/harvard", "/campuses/yale", "/campuses/columbia", "/campuses/berkeley", "/campuses/cmu"];
})();
const CAMPUS_PAGES = [...new Set(campusIndex)];

function loadJson(path) {
  try {
    if (!fs.existsSync(path)) return null;
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}
const candidates = loadJson("public/data/candidates.json") || [];
const founders = loadJson("public/data/founders.json") || [];
const ids = new Set((Array.isArray(candidates) ? candidates : []).map((c) => c.id).filter(Boolean));
for (const f of Array.isArray(founders) ? founders : []) if (f.companyId) ids.add(f.companyId);
const companyCount = ids.size;
// Always crawl founder + campus desks (campus source labels were the live dash miss).
// Company dossiers only when local precompute artifacts exist.
const CRAWL = [...new Set([...FOUNDER_PAGES, ...CAMPUS_PAGES, ...[...ids].map((id) => `/startup/${id}`)])];
if (!ids.size) {
  console.warn("check-no-dash: public/data/candidates.json missing — crawling CORE + campus pages only");
}

const DASHES = /[\u2013\u2014]/g;
function snippets(text) {
  const out = [];
  const re = /.{0,40}[\u2013\u2014].{0,40}/g;
  let m;
  while ((m = re.exec(text)) && out.length < 3) out.push(m[0].replace(/\s+/g, " ").trim());
  return out;
}
function decode(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&mdash;/g, "\u2014").replace(/&ndash;/g, "\u2013")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
function htmlText(html) {
  const body = html.replace(/<(script|style|template|noscript)\b[\s\S]*?<\/\1>/gi, " ").replace(/<head\b[\s\S]*?<\/head>/i, " ");
  return decode(body.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
}

const failures = [];
let checked = 0;

// Pass 1 — rendered DOM after hydration at both widths, every core route
const VIEWPORTS = [
  { w: 390, h: 844, mobile: true },
  { w: 1440, h: 900, mobile: false },
];
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const browser = await chromium.launch();
for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.w, height: vp.h },
    ...(vp.mobile
      ? { deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA }
      : { deviceScaleFactor: 2 }),
  });
  await context.route(/vercel\.live/, (r) => r.abort());
  const page = await context.newPage();
  for (const route of CORE) {
    const res = await page.goto(`${BASE}${route}`, { waitUntil: "load", timeout: 90000 });
    checked++;
    if (!res || res.status() >= 400) {
      failures.push({ pass: "innerText", vp: vp.w, route, status: res?.status() ?? 0 });
      continue;
    }
    // Wait for client hydration so client-only strings are in the DOM
    await page.waitForFunction(() => !/Loading/i.test(document.body?.innerText || ""), null, { timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const text = await page.evaluate(() => document.body.innerText);
    const n = (text.match(DASHES) || []).length;
    console.log(`[innerText ${vp.w}] ${route}: dashes=${n}`);
    if (n) failures.push({ pass: "innerText", vp: vp.w, route, dashes: n, samples: snippets(text) });
  }
  await context.close();
}
await browser.close();

// Pass 2
let next = 0;
let crawlDashes = 0;
const statusCounts = {};
async function worker() {
  while (next < CRAWL.length) {
    const route = CRAWL[next++];
    let res;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { res = await fetch(`${BASE}${route}`, { redirect: "follow" }); break; } catch { await new Promise((r) => setTimeout(r, 500)); }
    }
    checked++;
    const status = res?.status ?? 0;
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    if (!res || status >= 400) { failures.push({ pass: "crawl", route, status }); continue; }
    const text = htmlText(await res.text());
    const n = (text.match(DASHES) || []).length;
    crawlDashes += n;
    if (n) failures.push({ pass: "crawl", route, dashes: n, samples: snippets(text) });
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

const summary = {
  base: BASE,
  innerTextRoutes: CORE.length,
  crawlRoutes: CRAWL.length,
  companies: companyCount,
  dossiers: CRAWL.length - FOUNDER_PAGES.length,
  founderPages: FOUNDER_PAGES.length,
  statusCounts,
  crawlDashes,
  checked,
  failed: failures.length,
};
fs.mkdirSync(OUT.replace(/\/[^/]+$/, ""), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ ...summary, failures }, null, 2));
for (const f of failures.slice(0, 25)) console.log("FAIL", JSON.stringify(f));
console.log(JSON.stringify(summary, null, 2));
console.log(failures.length === 0 ? "PASS: no dashes" : `FAIL: ${failures.length} route(s) with dashes or errors`);
process.exit(failures.length === 0 ? 0 : 1);
