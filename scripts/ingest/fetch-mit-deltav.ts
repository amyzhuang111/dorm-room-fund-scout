// Real ingestion from MIT delta v's public "Past Teams" page
// (entrepreneurship.mit.edu/accelerator/past-teams/) — a real MIT startup
// accelerator, tiered Startup Scout A in lib/domain/source-quality.ts. Real
// company names + real external websites, grouped by cohort year on one
// page (11 cohort years, 2015–2025).
//
// Unlike Velocity, delta v's own site has no per-company detail page — each
// listing just links out to the company's own external site, which has no
// consistent structure to extract a founder from without guessing (§7:
// never guess). So these companies are ingested WITHOUT founders — honest
// "Founders not yet identified" — and attributed to MIT via a direct
// project→university relationship (the same fallback added for Velocity's
// founderless companies; see lib/domain/queries.ts's companyCount /
// listCandidateProjects).
//
// Bounded to the single most recent cohort year (2025, 12 companies) rather
// than the full decade-plus history, matching the Velocity precedent — an
// older delta v company is not a pre-seed candidate by the time it's a
// decade old.
//
// Run: npx tsx scripts/ingest/fetch-mit-deltav.ts

import * as cheerio from "cheerio";
import crypto from "node:crypto";
import { getDb, newId, nowIso } from "../../lib/db/client";
import { previousSnapshotHash } from "../../lib/ingest/dedup";
import { assembleProjectFacts } from "../../lib/domain/facts";
import { evaluateAllGates } from "../../lib/screening/gates";

const SOURCE_ID = "src_mit_deltav";
const UNIV_ID = "univ_mit";
const PAGE_URL = "https://entrepreneurship.mit.edu/accelerator/past-teams/";
const COHORT_YEAR = "2025"; // most recent cohort only — see header note

interface Entry {
  name: string;
  url: string;
}

function extractMostRecentCohort(html: string): Entry[] {
  const $ = cheerio.load(html);
  // Each cohort year is its own fusion-builder-row; the year heading is the
  // first <h1><p>YYYY</p></h1> in that row, and the company list is the
  // sibling column's first <ul>. Walk rows in document order (most recent
  // first, matching the page's own layout) and stop at the target year.
  const found: Entry[] = [];
  $(".fusion-builder-row").each((_, row) => {
    if (found.length > 0) return; // already found the target cohort
    const yearText = $(row).find("h1 p").first().text().trim();
    if (yearText !== COHORT_YEAR) return;
    $(row)
      .find('ul li a[rel="noopener"]') // the company list specifically — the row also has a "Watch Demo Day" button and other links this excludes
      .each((__, a) => {
        const name = $(a).text().trim();
        const url = $(a).attr("href") || "";
        if (name && url) found.push({ name, url });
      });
  });
  return found;
}

async function main() {
  const db = getDb();
  const retrievedAt = nowIso();

  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at)
     VALUES (?, 'MIT delta v', 'accelerator', ?, ?, 1, 'html_scrape', 'available', ?)
     ON CONFLICT(id) DO UPDATE SET last_attempt_at=excluded.last_attempt_at, status='available'`
  ).run(SOURCE_ID, PAGE_URL, JSON.stringify([UNIV_ID]), retrievedAt);

  const res = await fetch(PAGE_URL, { headers: { "user-agent": "campus-universe-research-bot/0.1 (manual, bounded)" } });
  if (!res.ok) {
    db.prepare(`UPDATE sources SET status='failed', error=? WHERE id=?`).run(`HTTP ${res.status}`, SOURCE_ID);
    throw new Error(`HTTP ${res.status}`);
  }
  const html = await res.text();
  const hash = crypto.createHash("sha256").update(html).digest("hex");

  let snapshotId: string;
  if (previousSnapshotHash(db, SOURCE_ID, PAGE_URL) !== hash) {
    snapshotId = newId("snap");
    db.prepare(
      `INSERT INTO snapshots (id, source_id, url, content_hash, fetched_at, http_status, raw_excerpt) VALUES (?, ?, ?, ?, ?, 200, ?)`
    ).run(snapshotId, SOURCE_ID, PAGE_URL, hash, retrievedAt, `MIT delta v Past Teams page (${COHORT_YEAR} cohort)`);
  } else {
    // Unchanged since the last fetch — reuse that snapshot's own id rather
    // than generating a fresh, un-inserted one (which would fail claims'
    // snapshot_id foreign key).
    snapshotId = (
      db.prepare(`SELECT id FROM snapshots WHERE source_id = ? AND url = ? ORDER BY fetched_at DESC LIMIT 1`).get(SOURCE_ID, PAGE_URL) as { id: string }
    ).id;
  }

  const entries = extractMostRecentCohort(html);
  console.log(`MIT delta v ${COHORT_YEAR} cohort: ${entries.length} real companies found (bounded to this one cohort, not the full 2015-2025 history).`);

  const findProjectByName = db.prepare(`SELECT id FROM projects WHERE name = ? AND kind = 'company'`);
  const insertProject = db.prepare(
    `INSERT INTO projects (id, name, aliases_json, kind, sector, description, website_url, is_portfolio_reference, is_investable_candidate)
     VALUES (?, ?, '[]', 'company', NULL, ?, ?, 0, 1)`
  );
  const insertClaim = db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, snapshot_id, source_url, retrieved_at, label, verification_state)
     VALUES (?, 'project', ?, 'accelerator_membership', ?, ?, ?, ?, ?, ?, 'observed_fact', 'unverified')`
  );
  const insertCompanyUniRel = db.prepare(
    `INSERT INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json, verification_state)
     VALUES (?, 'project', ?, 'university', ?, 'affiliated_with', ?, 'affiliation_only')`
  );
  const insertSignal = db.prepare(
    `INSERT INTO signals (id, project_id, signal_type, current_observation, source_date, significance_note, claim_ids_json)
     VALUES (?, ?, 'demo', ?, ?, ?, ?)`
  );
  const upsertGate = db.prepare(
    `INSERT INTO gate_results (id, project_id, gate_name, result, rationale, evaluated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(project_id, gate_name) DO UPDATE SET result=excluded.result, rationale=excluded.rationale, evaluated_at=excluded.evaluated_at`
  );

  let newCompanies = 0;

  for (const entry of entries) {
    if (findProjectByName.get(entry.name)) continue; // already ingested in a prior run

    const projectId = newId("proj");
    insertProject.run(projectId, entry.name, `MIT delta v ${COHORT_YEAR} cohort company. Product/sector not yet researched beyond this accelerator listing.`, entry.url);
    newCompanies++;

    const claimId = newId("claim");
    insertClaim.run(
      claimId,
      projectId,
      JSON.stringify({ company: entry.name, year: COHORT_YEAR, url: entry.url }),
      `MIT delta v's public "Past Teams" page lists "${entry.name}" as a ${COHORT_YEAR} cohort company, linking to ${entry.url}. No founder names are listed on delta v's own page (unlike Velocity) — founders not yet identified.`,
      SOURCE_ID,
      snapshotId,
      PAGE_URL,
      retrievedAt
    );
    insertCompanyUniRel.run(newId("rel"), projectId, UNIV_ID, JSON.stringify([claimId]));

    insertSignal.run(
      newId("sig"),
      projectId,
      `MIT delta v (MIT's student startup accelerator) ${COHORT_YEAR} cohort company.`,
      null,
      "Accelerator cohort membership is a real, dated formation signal — not itself an investment-readiness judgment.",
      JSON.stringify([claimId])
    );

    const facts = assembleProjectFacts(db, projectId);
    const outcomes = evaluateAllGates(facts);
    for (const o of outcomes) upsertGate.run(newId("gate"), projectId, o.gate, o.result, o.rationale);
  }

  const totalIngested = (
    db.prepare(`SELECT COUNT(DISTINCT entity_id) c FROM claims WHERE source_id = ? AND entity_type = 'project'`).get(SOURCE_ID) as { c: number }
  ).c;

  db.prepare(`UPDATE sources SET last_success_at=?, discovered_lead_count=? WHERE id=?`).run(nowIso(), totalIngested, SOURCE_ID);
  console.log(`${newCompanies} new compan(y/ies), ${totalIngested} total ingested from this source so far.`);
  console.log("No founders identified from this source — MIT delta v's own page links out to each company's site rather than listing founders, and guessing from an external site's own page isn't attempted. Company-to-MIT attribution comes from the direct project-university relationship, not a founder chain.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
