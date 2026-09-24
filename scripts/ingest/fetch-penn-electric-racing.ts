// Real ingestion from Penn Electric Racing's public team roster
// (pennelectricracing.com/team-members-2526) — a real Formula SAE Electric
// build team, tiered Founder Scout A / Startup Scout C in
// lib/domain/source-quality.ts (cat_penn_electric_racing, previously
// "unconfigured"). No API — the site is a Squarespace gallery block; each
// member is a `.slide-meta` node with a `.title` (name) and a
// `.description` paragraph (a short bio, written by the team member
// themselves per the club's own submission process — not scraped from an
// external profile).
//
// Bounded to the single current-season roster page (2025-2026, 67 members)
// rather than also pulling the site's separate per-year archive pages
// (2020-21 through 2024-25 all exist as their own URLs) — same "most recent
// cohort only" bound as MIT delta v/Velocity, and it also means
// "repeat builders across seasons" (one of this source's own
// `whatToExtract` items) is honestly NOT attempted this pass; would require
// fetching every archived year and merging by name, which isn't done here.
//
// No leadership/subsystem-lead distinction exists in this data — bios
// mention subteam membership ("member of the Electrical Hardware team")
// but never a title like "Lead" or "Captain" (checked: zero matches across
// all 67 bios). Per this source's own `whatNotToInfer` ("Team membership
// alone isn't the signal — individual technical ownership is"), every
// person is seeded role='team_member', never elevated — subteam is kept
// only as descriptive text in the role/claim, not as a leadership signal.
//
// People keyed by name only — this roster page exposes no stronger
// identifier (no pennkey, no email, no student ID) — the same accepted
// limitation already disclosed for Hack4Impact's team page.
//
// A minority of bios (8 of 67) self-link to the member's own personal
// LinkedIn profile. That URL is recorded as a real, self-disclosed alias —
// but LinkedIn's profile content itself is not fetched (no API access in
// this environment, and scraping a logged-out LinkedIn profile page
// reliably returns a login wall, not real content) — so unlike WDB's
// GitHub-bio route, this does NOT feed lib/domain/company-detection.ts.
// Disclosed as a real gap, not silently skipped.
//
// Run: npx tsx scripts/ingest/fetch-penn-electric-racing.ts

import * as cheerio from "cheerio";
import crypto from "node:crypto";
import { getDb, newId, nowIso } from "../../lib/db/client";
import { previousSnapshotHash } from "../../lib/ingest/dedup";

const SOURCE_ID = "src_penn_electric_racing";
const UNIV_ID = "univ_penn";
const ORG_PROJECT_ID = "proj_penn_electric_racing";
const PAGE_URL = "https://www.pennelectricracing.com/team-members-2526";
const SEASON_LABEL = "2025-2026";

interface Member {
  name: string;
  bio: string;
  subteam: string | null;
  linkedinUrl: string | null;
}

function extractMembers(html: string): Member[] {
  const $ = cheerio.load(html);
  const members: Member[] = [];
  $(".slide-meta").each((_, el) => {
    const name = $(el).find(".title").first().text().trim();
    const descEl = $(el).find(".description").first();
    const bio = descEl.text().replace(/\s+/g, " ").trim();
    if (!name || !bio) return; // skip malformed/empty slides rather than guessing

    const subteamMatch = bio.match(/member of the ([A-Za-z &]+?) [Tt]eam/);
    const subteam = subteamMatch ? subteamMatch[1].trim().replace(/\s+/g, " ") : null;

    // Only a link inside THIS member's own description counts as their
    // personal profile — the page also links the club's own LinkedIn
    // company page elsewhere in the nav/footer, which must not be
    // misattributed to whichever member happens to be parsed first.
    const linkedinHref = descEl.find('a[href*="linkedin.com/in/"]').first().attr("href") || null;

    members.push({ name, bio, subteam, linkedinUrl: linkedinHref });
  });
  return members;
}

async function main() {
  const db = getDb();
  const retrievedAt = nowIso();

  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at)
     VALUES (?, 'Penn Electric Racing', 'student_club', ?, ?, 1, 'html_scrape', 'available', ?)
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
    ).run(snapshotId, SOURCE_ID, PAGE_URL, hash, retrievedAt, `Penn Electric Racing Team Members ${SEASON_LABEL} page`);
  } else {
    snapshotId = (
      db.prepare(`SELECT id FROM snapshots WHERE source_id = ? AND url = ? ORDER BY fetched_at DESC LIMIT 1`).get(SOURCE_ID, PAGE_URL) as { id: string }
    ).id;
  }

  const members = extractMembers(html);
  console.log(`Penn Electric Racing ${SEASON_LABEL} roster: ${members.length} real members found.`);

  db.prepare(
    `INSERT INTO projects (id, name, aliases_json, kind, sector, description, website_url, is_portfolio_reference, is_investable_candidate)
     VALUES (?, 'Penn Electric Racing', '[]', 'project', 'student_builder_org', 'Penn''s Formula SAE Electric build team (10 custom cars since 2013). A discovery source for embedded/hardware/controls/software builders, not itself an investment target.', 'https://www.pennelectricracing.com/', 0, 0)
     ON CONFLICT(id) DO NOTHING`
  ).run(ORG_PROJECT_ID);
  db.prepare(
    `INSERT OR IGNORE INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json, verification_state)
     VALUES (?, 'project', ?, 'university', ?, 'affiliated_with', '[]', 'affiliation_only')`
  ).run(newId("rel"), ORG_PROJECT_ID, UNIV_ID);

  const findPersonByName = db.prepare(`SELECT id, aliases_json FROM people WHERE name = ?`);
  const insertPerson = db.prepare(`INSERT INTO people (id, name, aliases_json) VALUES (?, ?, ?)`);
  const updatePersonAliases = db.prepare(`UPDATE people SET aliases_json = ? WHERE id = ?`);
  const findAffiliation = db.prepare(`SELECT id FROM affiliations WHERE person_id = ? AND university_id = ? AND role = ?`);
  const insertAffiliation = db.prepare(
    `INSERT INTO affiliations (id, person_id, university_id, role, status, claim_id) VALUES (?, ?, ?, ?, ?, ?)`
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
  let linkedinFound = 0;

  for (const m of members) {
    const existing = findPersonByName.get(m.name) as { id: string; aliases_json: string } | undefined;
    let personId: string;
    if (!existing) {
      personId = newId("person");
      const aliases = m.linkedinUrl ? [`linkedin:${m.linkedinUrl}`] : [];
      insertPerson.run(personId, m.name, JSON.stringify(aliases));
      newPeople++;
      if (m.linkedinUrl) linkedinFound++;
    } else {
      personId = existing.id;
      if (m.linkedinUrl) {
        const aliases: string[] = JSON.parse(existing.aliases_json || "[]");
        const marker = `linkedin:${m.linkedinUrl}`;
        if (!aliases.includes(marker)) {
          aliases.push(marker);
          updatePersonAliases.run(JSON.stringify(aliases), personId);
          linkedinFound++;
        }
      }
    }

    const status = /\bgraduated\b/i.test(m.bio) ? "older_alumni" : /\b(freshman|sophomore|junior|senior)\b/i.test(m.bio) ? "current_student" : "unverified";
    const excerpt = `Penn Electric Racing's public "Team Members ${SEASON_LABEL}" page bio for "${m.name}": "${m.bio}"${m.linkedinUrl ? ` Self-linked personal profile: ${m.linkedinUrl} (not fetched — no reliable logged-out access to LinkedIn profile content in this environment).` : ""}`;

    if (!findAffiliation.get(personId, UNIV_ID, "Penn Electric Racing team member")) {
      const affClaimId = newId("claim");
      insertClaim.run(
        affClaimId,
        "affiliation",
        personId,
        "affiliation",
        JSON.stringify({ university: "University of Pennsylvania", status, season: SEASON_LABEL, subteam: m.subteam }),
        excerpt,
        SOURCE_ID,
        snapshotId,
        PAGE_URL,
        retrievedAt
      );
      insertAffiliation.run(newId("aff"), personId, UNIV_ID, "Penn Electric Racing team member", status, affClaimId);
    }

    if (!findRole.get(personId, ORG_PROJECT_ID)) {
      const roleClaimId = newId("claim");
      insertClaim.run(
        roleClaimId,
        "person_project_role",
        personId,
        "team_membership",
        JSON.stringify({ subteam: m.subteam, season: SEASON_LABEL }),
        excerpt,
        SOURCE_ID,
        snapshotId,
        PAGE_URL,
        retrievedAt
      );
      const roleLabel = m.subteam ? `team_member — ${m.subteam}` : "team_member";
      insertRole.run(newId("ppr"), personId, ORG_PROJECT_ID, roleLabel, roleClaimId);
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

  console.log(`${newPeople} new person(s), ${newRoles} new role(s), ${linkedinFound} personal LinkedIn link(s) captured, ${totalIngested} total members on file for this org.`);
  console.log("No leads/captains distinguished — this page's bios never use a title like 'Lead' or 'Captain', so every member is seeded role='team_member' (with subteam noted, never elevated). Affiliation status derived from each bio's own class-year/graduation language, defaulting to 'unverified' when neither is mentioned.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
