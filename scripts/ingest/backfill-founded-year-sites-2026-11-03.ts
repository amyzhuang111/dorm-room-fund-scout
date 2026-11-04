import * as cheerio from "cheerio";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { getDb, newId, nowIso } from "../../lib/db/client";

const CACHE = "/tmp/backfill-2026-11-03/html-founded";
const CONCURRENCY = Number(process.env.CONCURRENCY || 10);
const UA = "Mozilla/5.0 (compatible; CampusScoutBackfill/1.0)";
const SOURCE_ID = "src_founded_year_sites_2026_11_03";

function cachePath(url: string) {
  return path.join(CACHE, `${createHash("sha1").update(url).digest("hex")}.html`);
}
async function fetchHtml(url: string) {
  fs.mkdirSync(CACHE, { recursive: true });
  const cached = cachePath(url);
  if (fs.existsSync(cached) && Date.now() - fs.statSync(cached).mtimeMs < 12 * 3600_000) {
    return fs.readFileSync(cached, "utf8");
  }
  try {
    await new Promise((r) => setTimeout(r, 60 + Math.random() * 100));
    const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(12000), redirect: "follow" });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length > 50) fs.writeFileSync(cached, text);
    return text;
  } catch {
    return null;
  }
}
async function mapPool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      for (;;) {
        const idx = i++;
        if (idx >= items.length) return;
        await fn(items[idx]);
      }
    })
  );
}
function pageText(html: string) {
  const $ = cheerio.load(html);
  $("script,style,noscript,svg").remove();
  return $("body").text().replace(/\s+/g, " ").trim();
}
function parseFounded(text: string) {
  const patterns = [
    /\bfounded\s+in\s+(20\d{2})\b/i,
    /\bfounded\s+(20\d{2})\b/i,
    /\bestablished\s+in\s+(20\d{2})\b/i,
    /\blaunched\s+in\s+(20\d{2})\b/i,
    /\byear\s+founded[:\s]+(20\d{2})\b/i,
    /\b\(founded\s+(20\d{2})\)/i,
    /\bfounding\s+year[:\s]+(20\d{2})\b/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m || m.index == null) continue;
    const year = Number(m[1]);
    if (year >= 2015 && year <= 2026) return { year, index: m.index, length: m[0].length };
  }
  return null;
}

async function main() {
  const db = getDb();
  const retrievedAt = nowIso();
  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at, last_success_at)
     VALUES (?, 'Founded year site backfill', 'reference', 'https://campus-scout.vercel.app/data', '[]', 3, 'html_scrape', 'available', ?, ?)
     ON CONFLICT(id) DO UPDATE SET last_success_at=excluded.last_success_at`
  ).run(SOURCE_ID, retrievedAt, retrievedAt);

  const have = new Set(
    (db.prepare(`SELECT project_id FROM company_facts WHERE fact_key='founded_year'`).all() as { project_id: string }[]).map((r) => r.project_id)
  );
  const targets = (
    db
      .prepare(
        `SELECT id, name, website_url FROM projects
         WHERE kind='company' AND is_investable_candidate=1
           AND website_url IS NOT NULL AND trim(website_url)!=''`
      )
      .all() as { id: string; name: string; website_url: string }[]
  ).filter((c) => !have.has(c.id));

  console.log("targets", targets.length);
  const drafts: { projectId: string; year: number; url: string; excerpt: string }[] = [];
  await mapPool(targets, CONCURRENCY, async (c) => {
    const html = await fetchHtml(c.website_url);
    if (!html) return;
    const text = pageText(html);
    const hit = parseFounded(text);
    if (!hit) return;
    drafts.push({
      projectId: c.id,
      year: hit.year,
      url: c.website_url,
      excerpt: text.slice(Math.max(0, hit.index - 80), hit.index + hit.length + 80).replace(/\s+/g, " ").trim(),
    });
  });

  const insert = db.prepare(
    `INSERT INTO company_facts (id, project_id, fact_key, value_text, amount_usd, amount_status, detail_json, source_url, excerpt, origin, created_at)
     VALUES (?, ?, 'founded_year', ?, NULL, NULL, '{}', ?, ?, 'company_site', ?)`
  );
  const tx = db.transaction(() => {
    for (const d of drafts) {
      if (db.prepare(`SELECT 1 FROM company_facts WHERE project_id=? AND fact_key='founded_year'`).get(d.projectId)) continue;
      insert.run(newId("fact"), d.projectId, String(d.year), d.url, d.excerpt.slice(0, 500), retrievedAt);
    }
  });
  tx();
  console.log("wrote", drafts.length);
}
main();
