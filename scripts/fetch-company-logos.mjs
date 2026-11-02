#!/usr/bin/env node
/**
 * Fetch real company logos/favicons from each company's website.
 * Prefer apple-touch-icon → og:image (square-ish) → link rel=icon → /favicon.ico.
 * Verify with sharp; write webp under public/company-logos/{id}.webp.
 * Never invent; skip failures. Manifest: public/company-logos/manifest.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public", "company-logos");
const MANIFEST = path.join(OUT, "manifest.json");
const CONCURRENCY = 24;
const TIMEOUT_MS = 10000;
const UA = "CampusScoutLogoBot/1.0 (+https://campus-scout.local; research)";

fs.mkdirSync(OUT, { recursive: true });

const db = new Database(path.join(ROOT, "data", "campus-universe.db"), { readonly: true });
const companies = db
  .prepare(
    `SELECT id, name, website_url FROM projects
     WHERE kind='company' AND is_investable_candidate=1
     ORDER BY name`
  )
  .all();

const existing = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : { logos: {}, generatedAt: null };
const logos = { ...(existing.logos || {}) };

function hostFromUrl(raw) {
  try {
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function absUrl(base, href) {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

async function fetchBuf(url, { accept } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": UA,
        Accept: accept || "*/*",
      },
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

function parseIconCandidates(html, pageUrl) {
  const out = [];
  const reTouch = /<link[^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]*>/gi;
  const reIcon = /<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]*>/gi;
  const reOg = /<meta[^>]+property=["']og:image["'][^>]*>/gi;
  const hrefOf = (tag) => {
    const m = /href=["']([^"']+)["']/i.exec(tag) || /content=["']([^"']+)["']/i.exec(tag);
    return m ? m[1] : null;
  };
  for (const re of [reTouch, reIcon, reOg]) {
    let m;
    while ((m = re.exec(html))) {
      const href = hrefOf(m[0]);
      if (!href) continue;
      const abs = absUrl(pageUrl, href);
      if (abs) out.push({ url: abs, kind: re === reTouch ? "apple-touch" : re === reOg ? "og" : "icon" });
    }
  }
  // also /favicon.ico
  try {
    const u = new URL(pageUrl);
    out.push({ url: `${u.origin}/favicon.ico`, kind: "favicon.ico" });
  } catch {}
  // de-dupe
  const seen = new Set();
  return out.filter((c) => {
    if (seen.has(c.url)) return false;
    seen.add(c.url);
    return true;
  });
}

async function verifyAndWrite(id, buf) {
  if (!buf || buf.length < 64) return null;
  let img;
  try {
    img = sharp(buf, { failOn: "none", animated: false });
    const meta = await img.metadata();
    if (!meta.width || !meta.height) return null;
    if (meta.width < 16 || meta.height < 16) return null;
    // Reject near-empty / 1-color stubs (google default globe often tiny solid)
    if (meta.width <= 16 && meta.height <= 16 && buf.length < 200) return null;
    // Resize to 128 and webp
    const outBuf = await img
      .resize(128, 128, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .webp({ quality: 82, effort: 4 })
      .toBuffer();
    if (outBuf.length < 80) return null;
    const rel = `/company-logos/${id}.webp`;
    const dest = path.join(OUT, `${id}.webp`);
    fs.writeFileSync(dest, outBuf);
    return { path: rel, bytes: outBuf.length, width: 128, height: 128 };
  } catch {
    return null;
  }
}

async function fetchOne(row) {
  if (logos[row.id]?.path && fs.existsSync(path.join(OUT, `${row.id}.webp`))) {
    return { id: row.id, status: "cached", path: logos[row.id].path };
  }
  const site = row.website_url?.trim();
  if (!site) return { id: row.id, status: "no-website" };

  let pageUrl = site.startsWith("http") ? site : `https://${site}`;
  const htmlHit = await fetchBuf(pageUrl, { accept: "text/html,application/xhtml+xml" });
  let candidates = [];
  if (htmlHit?.buf) {
    const html = htmlHit.buf.toString("utf8").slice(0, 250_000);
    candidates = parseIconCandidates(html, htmlHit.finalUrl || pageUrl);
    pageUrl = htmlHit.finalUrl || pageUrl;
  } else {
    try {
      const u = new URL(pageUrl);
      candidates = [{ url: `${u.origin}/favicon.ico`, kind: "favicon.ico" }];
    } catch {
      return { id: row.id, status: "unreachable" };
    }
  }

  // Prefer apple-touch, then icon, then og, then favicon.ico
  const rank = { "apple-touch": 0, icon: 1, og: 2, "favicon.ico": 3 };
  candidates.sort((a, b) => (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9));

  for (const c of candidates.slice(0, 6)) {
    // Skip huge marketing og images that aren't logos (we'll still try; sharp will contain)
    const hit = await fetchBuf(c.url, { accept: "image/*,*/*" });
    if (!hit?.buf) continue;
    const ct = hit.ct || "";
    if (ct.includes("text/html") || ct.includes("application/json")) continue;
    // og:image often large photo — require roughly square for og
    if (c.kind === "og") {
      try {
        const meta = await sharp(hit.buf, { failOn: "none" }).metadata();
        if (!meta.width || !meta.height) continue;
        const ratio = meta.width / meta.height;
        if (ratio < 0.6 || ratio > 1.7) continue; // not logo-like
        if (meta.width > 1200 && meta.height > 1200) continue;
      } catch {
        continue;
      }
    }
    const saved = await verifyAndWrite(row.id, hit.buf);
    if (saved) {
      logos[row.id] = { ...saved, source: c.url, kind: c.kind, name: row.name, host: hostFromUrl(pageUrl) };
      return { id: row.id, status: "ok", path: saved.path, kind: c.kind };
    }
  }

  // Last resort: download google s2 and verify it's not the default stub
  const host = hostFromUrl(pageUrl);
  if (host) {
    const gUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
    const hit = await fetchBuf(gUrl, { accept: "image/*" });
    if (hit?.buf && hit.buf.length > 200) {
      // Default Google stub is a small globe; real favicons are richer
      try {
        const meta = await sharp(hit.buf, { failOn: "none" }).metadata();
        const stats = await sharp(hit.buf, { failOn: "none" }).stats();
        const channels = stats.channels || [];
        const meanSat = channels.length >= 3 ? Math.abs(channels[0].mean - channels[1].mean) + Math.abs(channels[1].mean - channels[2].mean) : 0;
        // Reject near-grayscale tiny stubs with very low variance
        const variance = channels[0]?.stdev ?? 0;
        if (meta.width >= 32 && (variance > 18 || meanSat > 12)) {
          const saved = await verifyAndWrite(row.id, hit.buf);
          if (saved) {
            logos[row.id] = { ...saved, source: gUrl, kind: "google-s2", name: row.name, host };
            return { id: row.id, status: "ok", path: saved.path, kind: "google-s2" };
          }
        }
      } catch {}
    }
  }

  return { id: row.id, status: "no-logo" };
}

async function pool(items, n, fn) {
  let i = 0;
  let done = 0;
  const results = [];
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      const row = items[idx];
      try {
        results[idx] = await fn(row);
      } catch (e) {
        results[idx] = { id: row.id, status: "error", error: String(e?.message || e) };
      }
      done++;
      if (done % 50 === 0 || done === items.length) {
        const ok = results.filter((r) => r && (r.status === "ok" || r.status === "cached")).length;
        process.stdout.write(`\rlogos ${done}/${items.length} ok+cached=${ok}   `);
        // checkpoint
        fs.writeFileSync(
          MANIFEST,
          JSON.stringify({ generatedAt: new Date().toISOString(), totalCompanies: companies.length, logos }, null, 2)
        );
      }
    }
  }
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

const results = await pool(companies, CONCURRENCY, fetchOne);
const ok = results.filter((r) => r.status === "ok" || r.status === "cached").length;
const noWeb = results.filter((r) => r.status === "no-website").length;
const noLogo = results.filter((r) => r.status === "no-logo" || r.status === "unreachable").length;
fs.writeFileSync(
  MANIFEST,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      totalCompanies: companies.length,
      withLogo: ok,
      noWebsite: noWeb,
      noLogo,
      logos,
    },
    null,
    2
  )
);
console.log(`\nDone. ${ok}/${companies.length} logos. noWebsite=${noWeb} noLogo=${noLogo}`);
