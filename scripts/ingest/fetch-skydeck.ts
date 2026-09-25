// Berkeley SkyDeck public companies directory.
// skydeck.berkeley.edu/companies/ is a WordPress archive: each card is a
// company name plus an external website. The "BY" author on every card is
// SkyDeck staff, not a founder — no founder names are ingested from it.
//
// SkyDeck is not limited to current Berkeley students (source tier: Founder
// Scout C / Startup Scout B, corroboration). Each row says that explicitly.
// MAX_PAGES is the last page that returns cards. The following page 404s.
//
// Run: npx tsx scripts/ingest/fetch-skydeck.ts

import * as cheerio from "cheerio";
import crypto from "node:crypto";
import { getDb, newId, nowIso } from "../../lib/db/client";
import { previousSnapshotHash } from "../../lib/ingest/dedup";
import { assembleProjectFacts } from "../../lib/domain/facts";
import { evaluateAllGates } from "../../lib/screening/gates";

const SOURCE_ID = "src_skydeck";
const UNIV_ID = "univ_berkeley";
const BASE = "https://skydeck.berkeley.edu/companies/";
const MAX_PAGES = 40;

interface Card {
  name: string;
  website: string;
  pageUrl: string;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": "campus-universe-research-bot/0.1 (manual, bounded)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

function parseCards(html: string, pageUrl: string): Card[] {
  const $ = cheerio.load(html);
  const out: Card[] = [];
  $("a.post-card_title").each((_, el) => {
    const name = $(el).text().replace(/\s+/g, " ").trim();
    const website = $(el).attr("href") || "";
    if (!name || !website.startsWith("http")) return;
    out.push({ name, website, pageUrl });
  });
  return out;
}

async function main() {
  const db = getDb();
  const retrievedAt = nowIso();

  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at)
     VALUES (?, 'Berkeley SkyDeck', 'accelerator', ?, ?, 2, 'html_scrape', 'available', ?)
     ON CONFLICT(id) DO UPDATE SET last_attempt_at=excluded.last_attempt_at, status='available'`
  ).run(SOURCE_ID, BASE, JSON.stringify([UNIV_ID]), retrievedAt);

  const cards: Card[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = page === 1 ? BASE : `${BASE}page/${page}/`;
    const html = await fetchText(url);
    const hash = crypto.createHash("sha256").update(html).digest("hex");
    if (previousSnapshotHash(db, SOURCE_ID, url) !== hash) {
      db.prepare(
        `INSERT INTO snapshots (id, source_id, url, content_hash, fetched_at, http_status, raw_excerpt) VALUES (?, ?, ?, ?, ?, 200, ?)`
      ).run(newId("snap"), SOURCE_ID, url, hash, retrievedAt, `SkyDeck companies page ${page}`);
    }
    const pageCards = parseCards(html, url);
    console.log(`SkyDeck page ${page}: ${pageCards.length} companies`);
    if (pageCards.length === 0) break;
    cards.push(...pageCards);
  }

  if (cards.length === 0) throw new Error("SkyDeck directory parsed to zero companies — markup changed.");

  const findProject = db.prepare(`SELECT id FROM projects WHERE website_url = ? AND kind = 'company'`);
  const insertProject = db.prepare(
    `INSERT INTO projects (id, name, aliases_json, kind, sector, description, website_url, is_portfolio_reference, is_investable_candidate)
     VALUES (?, ?, '[]', 'company', NULL, ?, ?, 0, 1)`
  );
  const insertClaim = db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, source_url, retrieved_at, label, verification_state)
     VALUES (?, 'project', ?, 'accelerator_membership', ?, ?, ?, ?, ?, 'observed_fact', 'unverified')`
  );
  const insertRel = db.prepare(
    `INSERT INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json, verification_state)
     VALUES (?, 'project', ?, 'university', ?, 'affiliated_with', ?, 'affiliation_only')`
  );
  const insertSignal = db.prepare(
    `INSERT INTO signals (id, project_id, signal_type, current_observation, significance_note, claim_ids_json)
     VALUES (?, ?, 'demo', ?, ?, ?)`
  );
  const upsertGate = db.prepare(
    `INSERT INTO gate_results (id, project_id, gate_name, result, rationale, evaluated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(project_id, gate_name) DO UPDATE SET result=excluded.result, rationale=excluded.rationale, evaluated_at=excluded.evaluated_at`
  );

  const description =
    "Listed on Berkeley SkyDeck's public companies directory. SkyDeck does not publish founder names on this page, and the program is not limited to current Berkeley students.";

  let created = 0;
  for (const card of cards) {
    if (findProject.get(card.website)) continue;
    const projectId = newId("proj");
    insertProject.run(projectId, card.name, description, card.website);
    const claimId = newId("claim");
    const excerpt = `Berkeley SkyDeck's public companies directory lists "${card.name}" with website ${card.website}. No founder name is on the card (the byline is SkyDeck staff). This does not establish that the founders are Berkeley students.`;
    insertClaim.run(
      claimId,
      projectId,
      JSON.stringify({ name: card.name, website: card.website }),
      excerpt,
      SOURCE_ID,
      card.pageUrl,
      retrievedAt
    );
    insertRel.run(newId("rel"), projectId, UNIV_ID, JSON.stringify([claimId]));
    insertSignal.run(
      newId("sig"),
      projectId,
      `Appears on Berkeley SkyDeck's public company directory (${card.website}).`,
      "Corroboration that the company exists in SkyDeck's directory. Not founder evidence and not a funding amount.",
      JSON.stringify([claimId])
    );
    const facts = assembleProjectFacts(db, projectId);
    for (const o of evaluateAllGates(facts)) upsertGate.run(newId("gate"), projectId, o.gate, o.result, o.rationale);
    created++;
  }

  const total = (
    db.prepare(`SELECT COUNT(*) c FROM claims WHERE source_id = ? AND claim_type = 'accelerator_membership'`).get(SOURCE_ID) as { c: number }
  ).c;
  db.prepare(`UPDATE sources SET last_success_at=?, discovered_lead_count=?, error=NULL, refresh_suggestion=? WHERE id=?`).run(
    nowIso(),
    total,
    `Walked pages 1–${MAX_PAGES}. The next page 404s, so this is the public archive as of this fetch. No founder names: the card byline is staff.`,
    SOURCE_ID
  );
  console.log(`SkyDeck: ${created} new companies this run, ${total} claims from this source. No founder rows created.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
