// Real ingestion from Penn Aerial Robotics's public team page
// (pennaerial.com/team/) — a real UAV/autonomy build team (SAE Aero Design,
// IARC), tiered Founder Scout A / Startup Scout C in
// lib/domain/source-quality.ts (cat_penn_aerial_robotics, previously
// "unconfigured"). A modern WordPress block-editor (Gutenberg/neve-fse)
// site, server-rendered — no API, no client-side JS needed to read it.
//
// Two of the nine titles have a literal typo in the site's own markup
// ("Software LEad", "Electrical LEad") — normalized to "Lead" for
// consistent grouping (§ROLE_FIXES below), with the raw as-scraped text
// kept verbatim in each claim's excerpt, never silently rewritten as if
// the site said something different.
//
// CORRECTION (2026-09-25): the original pass here claimed "No bio text,
// major, class year, or personal links are on this page at all" — that was
// simply wrong, found by accident while investigating captured LinkedIn
// aliases for a separate Apify pass. The page has a second, much larger
// section below the 9-officer title list: a ~85-entry photo-caption
// gallery with real major/year/hometown/subteam bios, same richness as
// PER's. Missed the first time because the original extraction only
// looked for `h6.wp-block-heading` + a following `<p>` — this gallery uses
// `<figure><a href=linkedin?><img></a><figcaption>Name is a ...</figcaption>
// </figure>` instead, a structurally different block the first pass never
// searched for.
//
// This gallery has real data-quality problems on the SITE's own side, not
// introduced here: ~25 entries are a bare first name with zero bio text
// (e.g. "Madison", "Yuzhi", "Frankie"), and several first names repeat
// with DIFFERENT, sometimes CONFLICTING bios (three different "Tina"
// captions — one says VP of Sponsorships, the officer list above says Tina
// Lee is VP Operations; a bare first name gives no way to know if these
// are the same person, a title that changed, or different people with the
// same first name). Rather than guess, this adapter ingests ONLY: (a)
// entries whose caption starts with a full "Firstname Lastname" (9 found,
// unambiguous), and (b) entries with a personal LinkedIn link attached,
// even if the caption gives only a first name (2 found: "Xiangyu" and
// "Mingni") — the LinkedIn URL itself is a real, unambiguous identifier
// even when the page's own prose isn't. All ~25 bare-first-name-only,
// no-LinkedIn entries, and the ambiguous repeated first names, are
// deliberately left out — ingesting them would risk silently merging two
// different real people under one name, which this codebase's own §40/§42
// discipline ("never merge on name alone") exists to prevent.
//
// "Xiangyu"'s own bio ("oversees all projects on the team... specializes
// in structural design") reads like a president-level description, which
// conflicts with the officer list's "President: Aidan Kuo" above — this is
// disclosed directly in Xiangyu's claim excerpt as an unresolved
// discrepancy (stale bio-gallery content vs. a current officer list,
// possibly a leadership change the gallery wasn't updated for), not
// silently resolved in either direction.
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

function extractLeadership($: cheerio.CheerioAPI): Leader[] {
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

interface BioMember {
  name: string; // full "First Last" when the caption gives one; first-name-only when only disambiguated by a LinkedIn link
  bio: string;
  linkedinUrl: string | null;
  isFullName: boolean;
}

const FULL_NAME_RE = /^([A-Z][a-zA-Z.]+ [A-Z][a-zA-Z.]+)\b/;

function extractBioGallery($: cheerio.CheerioAPI): BioMember[] {
  const found: BioMember[] = [];
  $("figure").each((_, fig) => {
    const $fig = $(fig);
    const captionEl = $fig.find("figcaption").first();
    if (!captionEl.length) return;
    const bio = captionEl.text().replace(/\s+/g, " ").trim();
    if (!bio || bio.length < 20) return; // bare name / empty caption — see header note, deliberately excluded unless linked
    const linkedinHref = $fig.find('a[href*="linkedin.com/in/"]').first().attr("href")?.replace(/\/$/, "") || null;
    const m = bio.match(FULL_NAME_RE);
    if (m) {
      found.push({ name: m[1], bio, linkedinUrl: linkedinHref, isFullName: true });
    } else if (linkedinHref) {
      const firstWord = bio.split(/\s+/)[0].replace(/[.,]/g, "");
      found.push({ name: firstWord, bio, linkedinUrl: linkedinHref, isFullName: false });
    }
    // else: ambiguous first-name-only caption with no LinkedIn to disambiguate — skip, see header note
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

  const $ = cheerio.load(html);
  const leaders = extractLeadership($);
  const bioMembers = extractBioGallery($);
  console.log(
    `Penn Aerial Robotics: ${leaders.length} titled leaders (h6/p list) + ${bioMembers.length} bio-gallery entries kept (full-name or LinkedIn-linked only — see header note on why ~25 bare-name entries are excluded).`
  );

  db.prepare(
    `INSERT INTO projects (id, name, aliases_json, kind, sector, description, website_url, is_portfolio_reference, is_investable_candidate)
     VALUES (?, 'Penn Aerial Robotics', '[]', 'project', 'student_builder_org', 'Penn''s student UAV/autonomy build team, competing in SAE Aero Design and IARC. A discovery source for embedded/autonomy/controls/software builders, not itself an investment target.', 'https://www.pennaerial.com/', 0, 0)
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
    const existing = findPersonByName.get(leader.name) as { id: string; aliases_json: string } | undefined;
    let personId: string;
    if (!existing) {
      personId = newId("person");
      insertPerson.run(personId, leader.name, "[]");
      newPeople++;
    } else {
      personId = existing.id;
    }

    const excerpt = `Penn Aerial Robotics's public team page lists "${leader.name}" under the heading "${leader.rawRole}"${
      leader.role !== leader.rawRole ? ` (normalized to "${leader.role}" — the site's own text has a typo)` : ""
    } — a real, site-authored leadership title, not inferred from a bio or membership list. This titled-officer list itself has no major/class-year/personal-link text (that only appears in the page's separate bio-gallery section, see the bio_membership claim type below if this person also appears there).`;

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

  let newBioPeople = 0;
  let newBioRoles = 0;
  let linkedinFound = 0;

  for (const member of bioMembers) {
    const existing = findPersonByName.get(member.name) as { id: string; aliases_json: string } | undefined;
    let personId: string;
    let aliases: string[];
    if (!existing) {
      personId = newId("person");
      aliases = member.linkedinUrl ? [`linkedin:${member.linkedinUrl}`] : [];
      insertPerson.run(personId, member.name, JSON.stringify(aliases));
      newBioPeople++;
      if (member.linkedinUrl) linkedinFound++;
    } else {
      personId = existing.id;
      aliases = JSON.parse(existing.aliases_json || "[]");
      if (member.linkedinUrl) {
        const marker = `linkedin:${member.linkedinUrl}`;
        if (!aliases.includes(marker)) {
          aliases.push(marker);
          updatePersonAliases.run(JSON.stringify(aliases), personId);
          linkedinFound++;
        }
      }
    }

    const conflictNote =
      member.name === "Xiangyu"
        ? " DISCREPANCY, not resolved here: this bio describes president-level responsibility ('oversees all projects on the team'), but the officer list above (h6/p titles) names Aidan Kuo as President — possibly a stale bio predating a leadership change, or two different roles; left for a human to check, not guessed either way."
        : "";
    const excerpt = `Penn Aerial Robotics's public team page bio-gallery caption for "${member.name}": "${member.bio}"${
      member.linkedinUrl ? ` Self-linked personal LinkedIn: ${member.linkedinUrl} (not fetched by this script — see fetch-linkedin-apify.ts for that).` : ""
    }${!member.isFullName ? " (Only a first name is given on the page — captured because a personal LinkedIn link disambiguates this from other same-first-name entries on the page, which were excluded.)" : ""}${conflictNote}`;

    const affRole = "Penn Aerial Robotics member (bio gallery)";
    if (!findAffiliation.get(personId, UNIV_ID, affRole)) {
      const affClaimId = newId("claim");
      insertClaim.run(affClaimId, "affiliation", personId, "affiliation", JSON.stringify({ university: "University of Pennsylvania" }), excerpt, SOURCE_ID, snapshotId, PAGE_URL, retrievedAt);
      insertAffiliation.run(newId("aff"), personId, UNIV_ID, affRole, affClaimId);
    }

    if (!findRole.get(personId, ORG_PROJECT_ID)) {
      const roleClaimId = newId("claim");
      insertClaim.run(roleClaimId, "person_project_role", personId, "bio_membership", JSON.stringify({ bio: member.bio }), excerpt, SOURCE_ID, snapshotId, PAGE_URL, retrievedAt);
      insertRole.run(newId("ppr"), personId, ORG_PROJECT_ID, "team_member", roleClaimId);
      if (!findRel.get(personId, ORG_PROJECT_ID)) {
        insertRel.run(newId("rel"), personId, ORG_PROJECT_ID, JSON.stringify([roleClaimId]));
      }
      newBioRoles++;
    }
  }

  const totalIngested = (
    db.prepare(`SELECT COUNT(DISTINCT person_id) c FROM person_project_roles WHERE project_id = ?`).get(ORG_PROJECT_ID) as { c: number }
  ).c;
  db.prepare(`UPDATE sources SET last_success_at=?, discovered_lead_count=? WHERE id=?`).run(nowIso(), totalIngested, SOURCE_ID);

  console.log(
    `Leadership: ${newPeople} new person(s), ${newRoles} new role(s). Bio gallery: ${newBioPeople} new person(s), ${newBioRoles} new role(s), ${linkedinFound} personal LinkedIn link(s) captured. ${totalIngested} total people on file for this org.`
  );
  console.log(
    "Bio-gallery entries are honestly incomplete by design — ~25 bare-first-name-only captions with no LinkedIn to disambiguate were excluded rather than risk merging two different real people under one name. See header note for the 'Xiangyu' President-title discrepancy left unresolved."
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
