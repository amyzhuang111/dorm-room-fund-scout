// Every investable company should have a clickable public page.
// An official product URL is stored only when that URL already appears in
// a stored description or claim (text taken from a source page). Otherwise
// the claim's own source_url is stored as primary_link, with a kind
// (accelerator, press, devpost, github, …). Nothing is guessed from a name.
//
// Run: npx tsx scripts/ingest/backfill-company-links.ts

import * as cheerio from "cheerio";
import { getDb, newId, nowIso } from "../../lib/db/client";
import { isOfficialProductHost, linkKind } from "../../lib/domain/company-link";

const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;

function cleanUrl(raw: string): string {
  return raw.replace(/[.,;]+$/, "");
}

function urlsIn(text: string | null | undefined): string[] {
  if (!text) return [];
  return [...text.matchAll(URL_RE)].map((m) => cleanUrl(m[0]));
}

async function main() {
  const db = getDb();
  const companies = db
    .prepare(
      `SELECT id, name, description, website_url FROM projects
       WHERE kind = 'company' AND is_investable_candidate = 1`
    )
    .all() as { id: string; name: string; description: string | null; website_url: string | null }[];

  const claims = db.prepare(
    `SELECT source_url, excerpt, value_json FROM claims WHERE entity_type = 'project' AND entity_id = ?`
  );
  const setWebsite = db.prepare(
    `UPDATE projects SET website_url = ?, updated_at = ? WHERE id = ? AND (website_url IS NULL OR website_url = '')`
  );
  const setPrimary = db.prepare(
    `UPDATE projects SET primary_link = ?, primary_link_kind = ?, updated_at = ? WHERE id = ? AND (website_url IS NULL OR website_url = '')`
  );
  const insertClaim = db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, source_url, retrieved_at, label, verification_state)
     VALUES (?, 'project', ?, 'website', ?, ?, 'src_public_link_backfill', ?, ?, 'observed_fact', 'corroborated')`
  );
  const now = nowIso();
  let websites = 0;
  let primaries = 0;

  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at, last_success_at)
     VALUES ('src_public_link_backfill', 'Public pages already stored on claims', 'directory', 'https://github.com/campus-scout/campus-scout', '[]', 3, 'manual', 'available', ?, ?)
     ON CONFLICT(id) DO UPDATE SET last_success_at = excluded.last_success_at`
  ).run(now, now);

  for (const company of companies) {
    const rows = claims.all(company.id) as { source_url: string | null; excerpt: string | null; value_json: string | null }[];
    const found: string[] = urlsIn(company.description);
    for (const row of rows) {
      found.push(...urlsIn(row.excerpt), ...urlsIn(row.value_json));
    }
    const official = found.find((u) => {
      try {
        const parsed = new URL(u);
        if (!parsed.protocol.startsWith("http")) return false;
        return isOfficialProductHost(u);
      } catch {
        return false;
      }
    });
    if (!company.website_url && official) {
      setWebsite.run(official, now, company.id);
      insertClaim.run(
        newId("claim"),
        company.id,
        JSON.stringify({ website: official }),
        `A stored source excerpt for ${company.name} already contained this URL: ${official}.`,
        official,
        now
      );
      websites++;
      continue;
    }
    if (company.website_url) continue;

    const sourceUrls = rows.map((r) => r.source_url).filter((u): u is string => !!u && u.startsWith("http"));
    const unique = [...new Set(sourceUrls)];
    if (unique.length === 0) continue;
    // Prefer a page whose path names this company over a shared directory.
    const slug = company.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
    unique.sort((a, b) => {
      const as = a.toLowerCase().includes(slug.slice(0, 8)) ? 0 : 1;
      const bs = b.toLowerCase().includes(slug.slice(0, 8)) ? 0 : 1;
      return as - bs || b.length - a.length;
    });
    const best = unique[0];
    const kind = linkKind(best);
    setPrimary.run(best, kind.kind, now, company.id);
    primaries++;
  }

  console.log(`Filled ${websites} official website(s) from URLs already in stored text. Set ${primaries} primary_link row(s) to the source page that lists the company.`);
  const cards = await enrichListingCards(db, now);
  console.log(`Moved ${cards} company link(s) from a shared listing to a company-specific page on that same source.`);
  refreshLinkKinds(db);
}

function normName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function usefulHref(href: string | undefined): href is string {
  if (!href || !href.startsWith("http")) return false;
  if (/(brightspot|amazonaws|\.(?:png|jpe?g|webp|svg|gif)(?:\?|$)|eventbrite|instagram|facebook|twitter|youtube|oncehub|workday|smapply|pennvlab|upenn\.edu)/i.test(href)) return false;
  return true;
}

// Venture Lab finalist cards sometimes link the company tile to Crunchbase
// or a product site. Only an exact title match on that card is accepted.
async function enrichListingCards(db: ReturnType<typeof getDb>, now: string): Promise<number> {
  const rows = db
    .prepare(
      `SELECT id, name, primary_link FROM projects
       WHERE kind = 'company' AND is_investable_candidate = 1
         AND (website_url IS NULL OR website_url = '')
         AND primary_link LIKE '%venturelab.upenn.edu%'`
    )
    .all() as { id: string; name: string; primary_link: string }[];
  const byUrl = new Map<string, { id: string; name: string }[]>();
  for (const row of rows) {
    const list = byUrl.get(row.primary_link) ?? [];
    list.push(row);
    byUrl.set(row.primary_link, list);
  }
  const setWebsite = db.prepare(`UPDATE projects SET website_url = ?, updated_at = ? WHERE id = ? AND (website_url IS NULL OR website_url = '')`);
  const setPrimary = db.prepare(`UPDATE projects SET primary_link = ?, primary_link_kind = ?, updated_at = ? WHERE id = ?`);
  const insertClaim = db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, source_url, retrieved_at, label, verification_state)
     VALUES (?, 'project', ?, 'website', ?, ?, 'src_public_link_backfill', ?, ?, 'observed_fact', 'corroborated')`
  );
  let moved = 0;
  for (const [pageUrl, companies] of byUrl) {
    let html = "";
    try {
      const res = await fetch(pageUrl, { headers: { "user-agent": "campus-universe-research-bot/0.1 (company links)" }, signal: AbortSignal.timeout(15000) });
      if (!res.ok) continue;
      html = await res.text();
    } catch {
      continue;
    }
    const $ = cheerio.load(html);
    $("div.PromoCardA").each((_, el) => {
      const title = $(el).find(".PromoCardA-title").text().replace(/\s+/g, " ").trim();
      const key = normName(title);
      const company = companies.find((c) => normName(c.name) === key);
      if (!company) return;
      const hrefs = new Set<string>();
      $(el).find("a[href]").each((__, a) => {
        const href = $(a).attr("href");
        if (usefulHref(href)) hrefs.add(href);
      });
      if (hrefs.size !== 1) return;
      const next = [...hrefs][0];
      const kind = linkKind(next);
      if (isOfficialProductHost(next)) {
        setWebsite.run(next, now, company.id);
      }
      setPrimary.run(next, kind.kind, now, company.id);
      insertClaim.run(
        newId("claim"),
        company.id,
        JSON.stringify({ website: next, kind: kind.kind }),
        `${pageUrl} links ${company.name}'s own card to ${next}.`,
        pageUrl,
        now
      );
      moved++;
    });
  }
  return moved;
}

function refreshLinkKinds(db: ReturnType<typeof getDb>) {
  const rows = db.prepare(`SELECT id, primary_link FROM projects WHERE primary_link IS NOT NULL AND trim(primary_link) != ''`).all() as {
    id: string;
    primary_link: string;
  }[];
  const setKind = db.prepare(`UPDATE projects SET primary_link_kind = ? WHERE id = ?`);
  for (const row of rows) setKind.run(linkKind(row.primary_link).kind, row.id);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
