// Bounded, resumable import of DRF's PUBLIC portfolio directory
// (https://www.dormroomfund.com/portfolio). This is a reference/exclusion set,
// never a source of new investment targets (brief section 4 / 6).
//
// Run: npx tsx scripts/ingest/fetch-drf-portfolio.ts
//
// Pagination note: the site paginates via ?f3d579bb_page=N (Webflow/Finsweet
// CMS list param, discovered by inspecting the "Next Page" control — this is
// not a documented API, so re-verify this param name if DRF redesigns the page).

import * as cheerio from "cheerio";
import crypto from "node:crypto";
import { getDb, newId, nowIso } from "../../lib/db/client";
import { previousSnapshotHash } from "../../lib/ingest/dedup";

const BASE_URL = "https://www.dormroomfund.com/portfolio";
const MAX_PAGES = 10; // bounded — the real directory is ~4 pages (319 entries) as of 2026-09-18
const SOURCE_NAME = "DRF Public Portfolio Directory";

async function fetchPage(pageNum: number): Promise<string> {
  const url = pageNum === 1 ? BASE_URL : `${BASE_URL}?f3d579bb_page=${pageNum}`;
  const res = await fetch(url, { headers: { "user-agent": "campus-universe-research-bot/0.1 (manual, bounded)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

function extractEntries(html: string): { name: string; url: string; categories: string[] }[] {
  const $ = cheerio.load(html);
  const out: { name: string; url: string; categories: string[] }[] = [];
  $(".portfolio-name-card").each((_, el) => {
    const a = $(el).find("a.portfolio-name_link").first();
    const name = (a.attr("aria-label") || a.text()).trim();
    const url = (a.attr("href") || "").trim();
    if (!name) return;
    const categories = $(el)
      .find('[fs-list-field="category"]')
      .map((__, c) => $(c).text().trim())
      .get()
      .filter(Boolean);
    out.push({ name, url, categories });
  });
  return out;
}

async function main() {
  const db = getDb();
  const retrievedAt = nowIso();

  const sourceId = "src_drf_portfolio_directory";
  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at)
     VALUES (?, ?, 'portfolio_directory', ?, '[]', 1, 'html_scrape', 'available', ?)
     ON CONFLICT(id) DO UPDATE SET last_attempt_at = excluded.last_attempt_at, status = 'available'`
  ).run(sourceId, SOURCE_NAME, BASE_URL, retrievedAt);

  const runId = newId("run");
  db.prepare(
    `INSERT INTO ingestion_runs (id, source_id, started_at, budget_config_json, status)
     VALUES (?, ?, ?, ?, 'running')`
  ).run(runId, sourceId, retrievedAt, JSON.stringify({ maxPages: MAX_PAGES }));

  let totalEntries = 0;
  let pagesFetched = 0;
  const seenNames = new Set<string>();

  try {
    for (let p = 1; p <= MAX_PAGES; p++) {
      const html = await fetchPage(p);
      pagesFetched++;
      const entries = extractEntries(html);
      if (entries.length === 0) {
        console.log(`page ${p}: 0 entries — stopping (end of directory)`);
        break;
      }

      const pageUrl = p === 1 ? BASE_URL : `${BASE_URL}?f3d579bb_page=${p}`;
      const hash = crypto.createHash("sha256").update(html).digest("hex");

      if (previousSnapshotHash(db, sourceId, pageUrl) === hash) {
        console.log(`page ${p}: unchanged since last fetch — skipping (no duplicate rows created)`);
        for (const entry of entries) seenNames.add(entry.name.toLowerCase());
        totalEntries += entries.length;
        continue;
      }

      const snapshotId = newId("snap");
      db.prepare(
        `INSERT INTO snapshots (id, source_id, url, content_hash, fetched_at, http_status, raw_excerpt)
         VALUES (?, ?, ?, ?, ?, 200, ?)`
      ).run(snapshotId, sourceId, pageUrl, hash, retrievedAt, `${entries.length} portfolio entries found`);

      const findMembership = db.prepare(`SELECT id FROM portfolio_memberships WHERE matched_name = ?`);
      const insertMembership = db.prepare(
        `INSERT INTO portfolio_memberships (id, matched_name, source_url, source_page, category_tags_json, retrieved_at, match_status)
         VALUES (?, ?, ?, ?, ?, ?, 'unmatched')`
      );

      for (const entry of entries) {
        if (seenNames.has(entry.name.toLowerCase())) continue; // dedupe within this run
        seenNames.add(entry.name.toLowerCase());
        if (findMembership.get(entry.name)) continue; // already imported in a previous run
        totalEntries++;
        insertMembership.run(
          newId("pm"),
          entry.name,
          entry.url || "(no linked website in directory)",
          p,
          JSON.stringify(entry.categories),
          retrievedAt
        );
      }

      console.log(`page ${p}: ${entries.length} entries (running total ${totalEntries})`);
    }

    db.prepare(
      `UPDATE sources SET last_success_at = ?, discovered_lead_count = ?, status = 'available' WHERE id = ?`
    ).run(nowIso(), totalEntries, sourceId);

    db.prepare(
      `UPDATE ingestion_runs SET finished_at = ?, fetch_count = ?, status = 'completed' WHERE id = ?`
    ).run(nowIso(), pagesFetched, runId);

    console.log(`\nDone. ${totalEntries} named portfolio entries across ${pagesFetched} pages.`);
    console.log(
      `Note: DRF's directory headline claims 340 "first checks" — this import captured ${totalEntries} named, linkable entries from the public list, not DRF's full historical count.`
    );
  } catch (err: any) {
    db.prepare(`UPDATE ingestion_runs SET finished_at = ?, status = 'failed', error = ? WHERE id = ?`).run(
      nowIso(),
      String(err?.message || err),
      runId
    );
    db.prepare(`UPDATE sources SET error = ?, status = 'failed' WHERE id = ?`).run(String(err?.message || err), sourceId);
    throw err;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
