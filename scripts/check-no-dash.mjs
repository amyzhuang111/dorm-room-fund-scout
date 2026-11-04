/**
 * Hard gate: no em dash (U+2014) or en dash (U+2013) in visible page text.
 *
 * Pass 1 (Playwright): document.body.innerText on the core routes, after hydration.
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
const CORE = ["/", "/founders", "/methodology", "/signals", `/startup/${SAMPLE_ID}`, "/map/network", "/campuses/penn", "/campuses"];
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

const candidates = JSON.parse(fs.readFileSync("public/data/candidates.json", "utf8"));
const founders = JSON.parse(fs.readFileSync("public/data/founders.json", "utf8"));
const ids = new Set(candidates.map((c) => c.id));
const companyCount = ids.size;
for (const f of founders) if (f.companyId) ids.add(f.companyId);
const CRAWL = [...FOUNDER_PAGES, ...CAMPUS_PAGES, ...[...ids].map((id) => `/startup/${id}`)];

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

// Pass 1
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
for (const route of CORE) {
  const res = await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 90000 });
  checked++;
  if (!res || res.status() >= 400) { failures.push({ pass: "innerText", route, status: res?.status() ?? 0 }); continue; }
  const text = await page.evaluate(() => document.body.innerText);
  const n = (text.match(DASHES) || []).length;
  console.log(`[innerText] ${route}: dashes=${n}`);
  if (n) failures.push({ pass: "innerText", route, dashes: n, samples: snippets(text) });
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
