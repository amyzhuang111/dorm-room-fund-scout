// Tag investable companies from text that actually describes the product.
// Stored descriptions that are directory boilerplate are skipped. When a
// company has a real website and no product sentence on file, the script
// reads that site's own meta description (the URL already stored from a
// source page — never a guessed domain).
//
// Run: npx tsx scripts/ingest/tag-sectors.ts
// Skip homepage fetches: SKIP_SITE_FETCH=1

import * as cheerio from "cheerio";
import { getDb, newId, nowIso } from "../../lib/db/client";
import { classifyDescription, isBoilerplateDescription, sectorLabel } from "../../lib/domain/sectors";

const SKIP_SITE = process.env.SKIP_SITE_FETCH === "1";
const DELAY_MS = 250;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function metaDescription(url: string): Promise<string | null> {
  const res = await fetch(url, {
    headers: { "user-agent": "campus-universe-research-bot/0.1 (sector descriptions)", accept: "text/html" },
    redirect: "follow",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const type = res.headers.get("content-type") || "";
  if (!type.includes("html") && !type.includes("text")) return null;
  const html = (await res.text()).slice(0, 250_000);
  const $ = cheerio.load(html);
  const text =
    $('meta[property="og:description"]').attr("content") ||
    $('meta[name="description"]').attr("content") ||
    "";
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length < 40) return null;
  if (isBoilerplateDescription(cleaned)) return null;
  return cleaned;
}

async function main() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, name, description, website_url FROM projects
       WHERE kind = 'company' AND is_investable_candidate = 1`
    )
    .all() as { id: string; name: string; description: string | null; website_url: string | null }[];

  const claimExcerpt = db.prepare(
    `SELECT excerpt, source_url FROM claims
     WHERE entity_type = 'project' AND entity_id = ? AND length(excerpt) > 40
     ORDER BY length(excerpt) DESC LIMIT 3`
  );
  const priorExcerpt = db.prepare(
    `SELECT excerpt, source_url FROM project_sector_tags
     WHERE project_id = ? AND source_url IS NOT NULL AND length(excerpt) > 40
     ORDER BY is_primary DESC LIMIT 1`
  );
  const clearTags = db.prepare(`DELETE FROM project_sector_tags WHERE project_id = ?`);
  const insertTag = db.prepare(
    `INSERT INTO project_sector_tags (id, project_id, tag, is_primary, excerpt, source_url)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const setSector = db.prepare(`UPDATE projects SET sector = ?, updated_at = ? WHERE id = ?`);
  const now = nowIso();

  let tagged = 0;
  let fromSite = 0;
  let untagged = 0;
  const counts = new Map<string, number>();

  for (const row of rows) {
    let text = row.description;
    let sourceUrl: string | null = null;
    const prior = priorExcerpt.get(row.id) as { excerpt: string; source_url: string | null } | undefined;
    if (isBoilerplateDescription(text)) {
      const claims = claimExcerpt.all(row.id) as { excerpt: string; source_url: string | null }[];
      const useful = claims.find((c) => !isBoilerplateDescription(c.excerpt) && !/does not publish founder names/i.test(c.excerpt));
      if (useful) {
        text = useful.excerpt;
        sourceUrl = useful.source_url;
      } else if (prior && !isBoilerplateDescription(prior.excerpt)) {
        text = prior.excerpt;
        sourceUrl = prior.source_url;
      } else if (!SKIP_SITE && row.website_url && row.website_url.startsWith("http")) {
        try {
          const meta = await metaDescription(row.website_url);
          if (meta) {
            text = meta;
            sourceUrl = row.website_url;
            fromSite++;
          }
        } catch {
          text = null;
        }
        await sleep(DELAY_MS);
      } else {
        text = null;
      }
    }

    const hits = classifyDescription(text, row.name);
    clearTags.run(row.id);
    if (hits.length === 0) {
      setSector.run(null, now, row.id);
      untagged++;
      continue;
    }
    hits.forEach((hit, i) => {
      insertTag.run(newId("sect"), row.id, hit.tag, i === 0 ? 1 : 0, hit.excerpt, sourceUrl);
    });
    setSector.run(sectorLabel(hits[0].tag), now, row.id);
    tagged++;
    counts.set(hits[0].tag, (counts.get(hits[0].tag) ?? 0) + 1);
  }

  console.log(`Tagged ${tagged} companies (${fromSite} from the company's own homepage meta description). ${untagged} left untagged — no product sentence on a source page.`);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [tag, n] of ranked) console.log(`  ${sectorLabel(tag)}: ${n} primary`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
