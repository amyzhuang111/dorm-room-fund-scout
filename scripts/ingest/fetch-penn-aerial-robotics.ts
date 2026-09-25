// Real ingestion from Penn Aerial Robotics's public team page
// (pennaerial.com/team/) — a real UAV/autonomy build team (SAE Aero Design,
// IARC), tiered Founder Scout A / Startup Scout C in
// lib/domain/source-quality.ts (cat_penn_aerial_robotics, previously
// "unconfigured"). A modern WordPress block-editor (Gutenberg/neve-fse)
// site, server-rendered — no API, no client-side JS needed to read it.
//
// Unlike Penn Electric Racing, this page carries NO full ~80-member roster
// — it's the club's leadership page only, 9 people, each with an explicit
// title directly in the markup (`<h6>President</h6>` immediately followed
// by `<p>Aidan Kuo</p>`, repeated per person). This is actually a BETTER
// fit for this source's own `whatToExtract` ("technical leads, subsystem
// owners") than PER's undifferentiated roster: every person here already
// has a real, site-authored leadership title — nothing inferred. Checked
// the site's own nav (contact-us, current-upcoming-projects, join-us,
// penn-air-through-the-years, sponsors, team) for a separate full-roster
// page: none exists, so this bound is what the source actually offers, not
// a deliberate narrowing.
//
// Two of the nine titles have a literal typo in the site's own markup
// ("Software LEad", "Electrical LEad") — normalized to "Lead" for
// consistent grouping (§ROLE_FIXES below), with the raw as-scraped text
// kept verbatim in each claim's excerpt, never silently rewritten as if
// the site said something different.
//
// No bio text, major, class year, or personal links (LinkedIn/GitHub) are
// on this page at all — checked directly, not assumed — so affiliation
// status stays the schema default 'unverified' for all nine (no
// enrollment-year language to key off, unlike PER's bios).
//
// Run: npx tsx scripts/ingest/fetch-penn-aerial-robotics.ts

import * as cheerio from "cheerio";
import crypto from "node:crypto";
import { getDb, newId, nowIso } from "../../lib/db/client";
import { previousSnapshotHash } from "../../lib/ingest/dedup";

const SOURCE_ID = "src_penn_aerial_robotics";
const UNIV_ID = "univ_penn";
const ORG_PROJECT_ID = "proj_penn_aerial_robotics";
const PAGE_URL = "https://www.pennaerial.com/team/";

// The site's own literal text -> normalized for consistent grouping only;
// raw text is preserved verbatim in each claim's excerpt regardless.
const ROLE_FIXES: Record<string, string> = {
  "Software LEad": "Software Lead",
  "Electrical LEad": "Electrical Lead",
};

interface Leader {
  rawRole: string;
  role: string;
  name: string;
}

function extractLeadership(html: string): Leader[] {
  const $ = cheerio.load(html);
  const found: Leader[] = [];
  $("h6.wp-block-heading").each((_, h6) => {
    const rawRole = $(h6).text().trim();
    const nameEl = $(h6).next("p.wp-block-paragraph");
    const name = nameEl.text().trim();
    if (!rawRole || !name) return; // not a role/name pair — skip rather than guess
    found.push({ rawRole, role: ROLE_FIXES[rawRole] || rawRole, name });
  });
  return found;
}

async function main() {
  const db = getDb();
  const retrievedAt = nowIso();

  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at)
     VALUES (?, 'Penn Aerial Robotics', 'student_club', ?, ?, 1, 'html_scrape', 'available', ?)
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
    ).run(snapshotId, SOURCE_ID, PAGE_URL, hash, retrievedAt, "Penn Aerial Robotics leadership team page");
  } else {
    snapshotId = (
      db.prepare(`SELECT id FROM snapshots WHERE source_id = ? AND url = ? ORDER BY fetched_at DESC LIMIT 1`).get(SOURCE_ID, PAGE_URL) as { id: string }
    ).id;
  }

  const leaders = extractLeadership(html);
  console.log(`Penn Aerial Robotics leadership page: ${leaders.length} real named leaders found (title directly in the page's own markup, nothing inferred).`);

  db.prepare(
    `INSERT INTO projects (id, name, aliases_json, kind, sector, description, website_url, is_portfolio_reference, is_investable_candidate)
     VALUES (?, 'Penn Aerial Robotics', '[]', 'project', 'student_builder_org', 'Penn''s student UAV/autonomy build team, competing in SAE Aero Design and IARC. A discovery source for embedded/autonomy/controls/software builders, not itself an investment target.', 'https://www.pennaerial.com/', 0, 0)
     ON CONFLICT(id) DO NOTHING`
  ).run(ORG_PROJECT_ID);
  db.prepare(
    `INSERT OR IGNORE INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json, verification_state)
     VALUES (?, 'project', ?, 'university', ?, 'affiliated_with', '[]', 'affiliation_only')`
  ).run(newId("rel"), ORG_PROJECT_ID, UNIV_ID);

  const findPersonByName = db.prepare(`SELECT id FROM people WHERE name = ?`);
  const insertPerson = db.prepare(`INSERT INTO people (id, name, aliases_json) VALUES (?, ?, '[]')`);
  const findAffiliation = db.prepare(`SELECT id FROM affiliations WHERE person_id = ? AND university_id = ? AND role = ?`);
  const insertAffiliation = db.prepare(
    `INSERT INTO affiliations (id, person_id, university_id, role, status, claim_id) VALUES (?, ?, ?, ?, 'unverified', ?)`
  );
  const findRole = db.prepare(`SELECT id FROM person_project_roles WHERE person_id = ? AND project_id = ?`);
  const insertRole = db.prepare(`INSERT INTO person_project_roles (id, person_id, project_id, role, claim_id) VALUES (?, ?, ?, ?, ?)`);
  const findRel = db.prepare(
    `SELECT id FROM relationships WHERE source_entity_type='person' AND source_entity_id=? AND target_entity_type='project' AND target_entity_id=? AND relationship_type='participated_in_program'`
  );
  const insertRel = db.prepare(
    `INSERT INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json, verification_state)
     VALUES (?, 'person', ?, 'project', ?, 'participated_in_program', ?, 'affiliation_only')`
  );
  const insertClaim = db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, snapshot_id, source_url, retrieved_at, label, verification_state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'observed_fact', 'unverified')`
  );

  let newPeople = 0;
  let newRoles = 0;

  for (const leader of leaders) {
    const existing = findPersonByName.get(leader.name) as { id: string } | undefined;
    let personId: string;
    if (!existing) {
      personId = newId("person");
      insertPerson.run(personId, leader.name);
      newPeople++;
    } else {
      personId = existing.id;
    }

    const excerpt = `Penn Aerial Robotics's public team page lists "${leader.name}" under the heading "${leader.rawRole}"${
      leader.role !== leader.rawRole ? ` (normalized to "${leader.role}" — the site's own text has a typo)` : ""
    } — a real, site-authored leadership title, not inferred from a bio or membership list. No major, class year, or personal links are shown on this page for anyone.`;

    if (!findAffiliation.get(personId, UNIV_ID, "Penn Aerial Robotics leadership")) {
      const affClaimId = newId("claim");
      insertClaim.run(
        affClaimId,
        "affiliation",
        personId,
        "affiliation",
        JSON.stringify({ university: "University of Pennsylvania", role: leader.role }),
        excerpt,
        SOURCE_ID,
        snapshotId,
        PAGE_URL,
        retrievedAt
      );
      insertAffiliation.run(newId("aff"), personId, UNIV_ID, "Penn Aerial Robotics leadership", affClaimId);
    }

    if (!findRole.get(personId, ORG_PROJECT_ID)) {
      const roleClaimId = newId("claim");
      insertClaim.run(
        roleClaimId,
        "person_project_role",
        personId,
        "leadership_title",
        JSON.stringify({ role: leader.role, rawRole: leader.rawRole }),
        excerpt,
        SOURCE_ID,
        snapshotId,
        PAGE_URL,
        retrievedAt
      );
      insertRole.run(newId("ppr"), personId, ORG_PROJECT_ID, leader.role, roleClaimId);
      if (!findRel.get(personId, ORG_PROJECT_ID)) {
        insertRel.run(newId("rel"), personId, ORG_PROJECT_ID, JSON.stringify([roleClaimId]));
      }
      newRoles++;
    }
  }

  const totalIngested = (
    db.prepare(`SELECT COUNT(DISTINCT person_id) c FROM person_project_roles WHERE project_id = ?`).get(ORG_PROJECT_ID) as { c: number }
  ).c;
  db.prepare(`UPDATE sources SET last_success_at=?, discovered_lead_count=? WHERE id=?`).run(nowIso(), totalIngested, SOURCE_ID);

  console.log(`${newPeople} new person(s), ${newRoles} new role(s), ${totalIngested} total leaders on file for this org.`);
  console.log("This page is leadership-only (9 people, no full roster exists on the site) — every role is a real site-authored title (President/VP/Lead), nothing seeded as generic 'team_member' the way PER's undifferentiated roster was.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
