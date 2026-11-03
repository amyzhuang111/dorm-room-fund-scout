#!/usr/bin/env node
/**
 * Fetch real company photo thumbs for /networks between-stage cards.
 * Source order: og:image → twitter:image → first large content image on own site / official program|press page.
 * No stock hosts. Store source URL in manifest. Fallback to logo is client-side.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public", "company-thumbs");
const MANIFEST = path.join(OUT, "manifest.json");
const CAND = process.env.CAND || "/tmp/n20-thumb-candidates.json";
const CONCURRENCY = 10;
const TIMEOUT_MS = 12000;
const UA = "CampusScoutThumbBot/1.0 (+https://campus-scout.local; research)";

const STOCK =
  /(?:unsplash|pexels|pixabay|shutterstock|gettyimages|istockphoto|depositphotos|dreamstime|alamy|stock\.adobe|placeholder\.com|placehold\.it|placekitten|loremflickr|picsum\.photos|via\.placeholder|dummyimage|gravatar\.com|ui-avatars|dicebear|pravatar)/i;
const BLOCKED_HOST =
  /(?:^|\.)(ycombinator\.com|linkedin\.com|wix\.com|wixsite\.com|squarespace\.com|wordpress\.com|wp\.com|facebook\.com|instagram\.com|twitter\.com|x\.com|youtube\.com|tiktok\.com)$/i;

fs.mkdirSync(OUT, { recursive: true });

const db = new Database(path.join(ROOT, "data", "campus-universe.db"), { readonly: true });
const byId = new Map(
  db
    .prepare(
      `SELECT id, name, website_url, primary_link FROM projects WHERE kind='company'`
    )
    .all()
    .map((r) => [r.id, r])
);

const candidates = JSON.parse(fs.readFileSync(CAND, "utf8"));
const existing = fs.existsSync(MANIFEST)
  ? JSON.parse(fs.readFileSync(MANIFEST, "utf8"))
  : { thumbs: {}, generatedAt: null };
const thumbs = { ...(existing.thumbs || {}) };

function absUrl(base, href) {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

function hostOk(url) {
  try {
    const h = new URL(url).hostname;
    if (STOCK.test(url) || STOCK.test(h)) return false;
    if (BLOCKED_HOST.test(h)) return false;
    return true;
  } catch {
    return false;
  }
}

async function fetchBuf(url, accept) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": UA, Accept: accept || "*/*" },
    });
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    const buf = Buffer.from(await res.arrayBuffer());
    return { buf, ct, finalUrl: res.url };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function metaContent(tag) {
  const m =
    tag.match(/content=["']([^"']+)["']/i) ||
    tag.match(/content=([^\s>]+)/i);
  return m ? m[1] : null;
}

function parseImageCandidates(html, pageUrl) {
  const out = [];
  const push = (u, kind) => {
    const abs = absUrl(pageUrl, u);
    if (!abs || !/^https?:/i.test(abs)) return;
    if (!hostOk(abs)) return;
    out.push({ url: abs, kind });
  };
  for (const re of [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]*>/gi,
    /<meta[^>]+name=["']og:image["'][^>]*>/gi,
  ]) {
    let m;
    while ((m = re.exec(html))) {
      const c = metaContent(m[0]);
      if (c) push(c, "og:image");
    }
  }
  for (const re of [
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]*>/gi,
    /<meta[^>]+property=["']twitter:image["'][^>]*>/gi,
  ]) {
    let m;
    while ((m = re.exec(html))) {
      const c = metaContent(m[0]);
      if (c) push(c, "twitter:image");
    }
  }
  // Official press / program pages sometimes only have article images
  const imgRe = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let im;
  let n = 0;
  while ((im = imgRe.exec(html)) && n < 12) {
    const src = im[1];
    if (!src || src.startsWith("data:")) continue;
    if (/\.svg(\?|$)/i.test(src)) continue;
    if (/logo|icon|favicon|sprite|avatar|emoji/i.test(src)) continue;
    push(src, "page-img");
    n++;
  }
  return out;
}

async function verifyPhoto(buf, sourceUrl) {
  if (!buf || buf.length < 2500) return null;
  if (STOCK.test(sourceUrl)) return null;
  try {
    const img = sharp(buf, { failOn: "none" });
    const meta = await img.metadata();
    const w = meta.width || 0;
    const h = meta.height || 0;
    if (w < 120 || h < 80) return null; // reject tiny icons
    // Prefer photographic / wide cards over square favicons
    const outBuf = await img
      .resize(320, 200, { fit: "cover", position: "attention" })
      .webp({ quality: 78 })
      .toBuffer();
    if (outBuf.length < 800) return null;
    return { buf: outBuf, width: 320, height: 200 };
  } catch {
    return null;
  }
}

async function fetchThumbFor(row) {
  const site = (row.website_url || "").trim();
  const primary = (row.primary_link || "").trim();
  const pages = [];
  if (site && /^https?:/i.test(site) && hostOk(site)) pages.push(site);
  // Official program / press page only when primary looks like press/news/about
  if (
    primary &&
    /^https?:/i.test(primary) &&
    hostOk(primary) &&
    /(press|news|about|blog|launch|announce|program)/i.test(primary)
  ) {
    pages.push(primary);
  }
  if (!pages.length) return { status: "no-site" };

  for (const page of pages) {
    const htmlRes = await fetchBuf(page, "text/html,application/xhtml+xml");
    if (!htmlRes || !htmlRes.ct.includes("html")) continue;
    const html = htmlRes.buf.toString("utf8").slice(0, 500_000);
    const cands = parseImageCandidates(html, htmlRes.finalUrl || page);
    for (const c of cands) {
      const img = await fetchBuf(c.url, "image/*,*/*");
      if (!img) continue;
      if (!/^image\//.test(img.ct) && !/\.(jpe?g|png|webp|gif)(\?|$)/i.test(c.url)) continue;
      const verified = await verifyPhoto(img.buf, img.finalUrl || c.url);
      if (!verified) continue;
      return {
        status: "ok",
        sourceUrl: img.finalUrl || c.url,
        pageUrl: htmlRes.finalUrl || page,
        kind: c.kind,
        ...verified,
      };
    }
  }
  return { status: "no-image" };
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

const todo = candidates.filter((c) => !thumbs[c.cid] || process.env.FORCE);
console.log(`thumbs: ${candidates.length} candidates, ${todo.length} to fetch, have ${Object.keys(thumbs).length}`);

const results = await mapPool(todo, CONCURRENCY, async (c) => {
  const row = byId.get(c.cid);
  if (!row) return { id: c.cid, status: "missing" };
  if (thumbs[c.cid] && !process.env.FORCE) return { id: c.cid, status: "cached" };
  const r = await fetchThumbFor(row);
  if (r.status === "ok") {
    const dest = path.join(OUT, `${c.cid}.webp`);
    fs.writeFileSync(dest, r.buf);
    thumbs[c.cid] = {
      path: `/company-thumbs/${c.cid}.webp`,
      bytes: r.buf.length,
      width: r.width,
      height: r.height,
      sourceUrl: r.sourceUrl,
      pageUrl: r.pageUrl,
      kind: r.kind,
      name: row.name,
    };
    process.stdout.write("+");
  } else {
    process.stdout.write(r.status === "no-site" ? "." : "x");
  }
  return { id: c.cid, ...r };
});

const ok = Object.keys(thumbs).length;
fs.writeFileSync(
  MANIFEST,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      totalCandidates: candidates.length,
      withThumb: ok,
      thumbs,
    },
    null,
    2
  )
);
console.log(`\nWrote ${ok} thumbs → ${MANIFEST}`);
const statuses = {};
for (const r of results) statuses[r.status] = (statuses[r.status] || 0) + 1;
console.log(statuses);
