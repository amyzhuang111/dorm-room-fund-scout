// Real ingestion from Penn Labs' public team directory (pennlabs.org).
// Penn Labs builds Penn's own student software (Penn Mobile, Penn Clubs,
// Penn Course Review, Office Hours Queue) — these are NOT startups and are
// marked is_investable_candidate=0. The point of this source is "ability to
// build" evidence about real people, per brief section 6 (Penn Labs row) and
// the discovery loop ("follow builders after their first public project").
//
// Run: npx tsx scripts/ingest/fetch-penn-labs.ts

import crypto from "node:crypto";
import { getDb, newId, nowIso } from "../../lib/db/client";
import { previousSnapshotHash } from "../../lib/ingest/dedup";

const TEAM_DATA_URL = "https://pennlabs.org/page-data/team/page-data.json";
const SOURCE_ID = "src_penn_labs";
const UNIV_ID = "univ_penn";
const ORG_PROJECT_ID = "proj_penn_labs_org";

interface TeamMember {
  name: string;
  team: { name: string }[] | string; // current members: array of {name}; alumni rows: a single team-name string
  pennkey?: string;
  semester_joined?: string;
  alumnus: boolean;
  roles: string[];
}

function teamNames(m: TeamMember): string[] {
  if (Array.isArray(m.team)) return m.team.map((t) => t.name);
  if (typeof m.team === "string" && m.team) return [m.team];
  return [];
}

const PRODUCT_SLUGS: Record<string, string> = {
  "Penn Mobile": "/products/penn-mobile",
  "Penn Clubs": "/products/penn-clubs",
  "Penn Courses": "/products/penn-course-review",
  "Office Hours Queue": "/products/office-hours-queue",
};

function claimId(db: ReturnType<typeof getDb>, args: {
  entityType: string;
  entityId: string;
  claimType: string;
  value: unknown;
  excerpt: string;
  sourceUrl: string;
  snapshotId: string;
  retrievedAt: string;
  label?: string;
}) {
  const id = newId("claim");
  db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, snapshot_id, source_url, retrieved_at, label, verification_state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unverified')`
  ).run(
    id,
    args.entityType,
    args.entityId,
    args.claimType,
    JSON.stringify(args.value),
    args.excerpt,
    SOURCE_ID,
    args.snapshotId,
    args.sourceUrl,
    args.retrievedAt,
    args.label || "observed_fact"
  );
  return id;
}

async function main() {
  const db = getDb();
  const retrievedAt = nowIso();

  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at)
     VALUES (?, 'Penn Labs', 'campus_builder_org', 'https://pennlabs.org/', ?, 1, 'api', 'available', ?)
     ON CONFLICT(id) DO UPDATE SET last_attempt_at = excluded.last_attempt_at, status='available'`
  ).run(SOURCE_ID, JSON.stringify([UNIV_ID]), retrievedAt);

  const res = await fetch(TEAM_DATA_URL, { headers: { "user-agent": "campus-universe-research-bot/0.1 (manual, bounded)" } });
  if (!res.ok) {
    db.prepare(`UPDATE sources SET status='failed', error=? WHERE id=?`).run(`HTTP ${res.status}`, SOURCE_ID);
    throw new Error(`HTTP ${res.status} fetching ${TEAM_DATA_URL}`);
  }
  const json = await res.json();
  const raw = JSON.stringify(json);
  const hash = crypto.createHash("sha256").update(raw).digest("hex");

  if (previousSnapshotHash(db, SOURCE_ID, TEAM_DATA_URL) === hash) {
    db.prepare(`UPDATE sources SET last_attempt_at=?, status='checked_no_new' WHERE id=?`).run(retrievedAt, SOURCE_ID);
    console.log("Penn Labs: content unchanged since last fetch — skipping re-ingestion (no duplicate rows created).");
    return;
  }

  const snapshotId = newId("snap");
  db.prepare(
    `INSERT INTO snapshots (id, source_id, url, content_hash, fetched_at, http_status, raw_excerpt)
     VALUES (?, ?, ?, ?, ?, 200, ?)`
  ).run(snapshotId, SOURCE_ID, TEAM_DATA_URL, hash, retrievedAt, "Penn Labs Gatsby team page-data.json (teams + alumni rosters)");

  // The "community" node in the university -> community -> founder chain.
  db.prepare(
    `INSERT INTO projects (id, name, aliases_json, kind, sector, description, website_url, is_portfolio_reference, is_investable_candidate)
     VALUES (?, 'Penn Labs', '[]', 'project', 'student_builder_org', 'Penn''s student-run technology organization; builds Penn''s own official apps. A discovery source for builders, not itself an investment target.', 'https://pennlabs.org/', 0, 0)
     ON CONFLICT(id) DO NOTHING`
  ).run(ORG_PROJECT_ID);

  db.prepare(
    `INSERT OR IGNORE INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json, verification_state)
     VALUES (?, 'project', ?, 'university', ?, 'affiliated_with', '[]', 'affiliation_only')`
  ).run(newId("rel"), ORG_PROJECT_ID, UNIV_ID);

  const teams: { name: string; members: TeamMember[] }[] = json.result.data.allTeamsJson.nodes;
  const alumni: TeamMember[] = json.result.data.allAlumniJson.nodes;
  const allMembers = [
    ...teams.flatMap((t) => t.members),
    ...alumni,
  ];

  // Dedupe members appearing on multiple teams (e.g. also on "Directors").
  const byName = new Map<string, TeamMember>();
  for (const m of allMembers) {
    if (!byName.has(m.name)) byName.set(m.name, m);
    else {
      // merge team/role lists so we don't lose product associations
      const existing = byName.get(m.name)!;
      existing.team = [...teamNames(existing), ...teamNames(m)].map((name) => ({ name }));
      existing.roles = [...new Set([...existing.roles, ...m.roles])];
    }
  }

  let peopleCreated = 0;
  let productsLinked = 0;

  // Keyed by pennkey (a real, unique Penn identifier the directory itself
  // provides), not display name — two different real people can share a
  // name, and pennkey is right there in the source data to corroborate.
  const findPersonByAlias = db.prepare(`SELECT id FROM people WHERE aliases_json LIKE ?`);
  const findPersonByName = db.prepare(`SELECT id FROM people WHERE name = ?`);
  const insertPerson = db.prepare(`INSERT INTO people (id, name, aliases_json) VALUES (?, ?, ?)`);
  const findPersonByPennkey = (pennkey: string): { id: string } | undefined =>
    findPersonByAlias.get(`%"pennkey:${pennkey}"%`) as { id: string } | undefined;
  const findAffiliation = db.prepare(`SELECT id FROM affiliations WHERE person_id = ? AND university_id = ? AND role = ?`);
  const insertAffiliation = db.prepare(
    `INSERT INTO affiliations (id, person_id, university_id, role, status, start_date, claim_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const findProject = db.prepare(`SELECT id FROM projects WHERE name = ?`);
  const insertProject = db.prepare(
    `INSERT INTO projects (id, name, aliases_json, kind, sector, description, website_url, is_portfolio_reference, is_investable_candidate)
     VALUES (?, ?, '[]', 'project', 'student_builder_org', ?, ?, 0, 0)`
  );
  const findRole = db.prepare(`SELECT id FROM person_project_roles WHERE person_id = ? AND project_id = ?`);
  const insertRole = db.prepare(
    `INSERT INTO person_project_roles (id, person_id, project_id, role, claim_id) VALUES (?, ?, ?, ?, ?)`
  );
  const findRel = db.prepare(
    `SELECT id FROM relationships WHERE source_entity_type=? AND source_entity_id=? AND target_entity_type=? AND target_entity_id=? AND relationship_type=?`
  );
  const insertRel = db.prepare(
    `INSERT INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json, verification_state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  for (const [name, m] of byName) {
    // Fall back to name-based lookup only when the directory didn't give us a
    // pennkey for this row (rare) — corroborated identity beats none at all.
    const person = m.pennkey ? findPersonByPennkey(m.pennkey) : (findPersonByName.get(name) as { id: string } | undefined);
    let personId: string;
    if (!person) {
      personId = newId("person");
      insertPerson.run(personId, name, JSON.stringify(m.pennkey ? [`pennkey:${m.pennkey}`] : []));
      peopleCreated++;
    } else {
      personId = person.id;
    }

    const status = m.alumnus ? "older_alumni" : "current_student";
    const excerpt = `Penn Labs team directory lists "${name}" (roles: ${m.roles.join(", ")}) on team(s) ${teamNames(m).join(", ")}${m.semester_joined ? `, joined ${m.semester_joined}` : ""}; alumnus=${m.alumnus}.`;

    if (!findAffiliation.get(personId, UNIV_ID, "Penn Labs contributor")) {
      const cId = claimId(db, {
        entityType: "affiliation",
        entityId: personId,
        claimType: "affiliation",
        value: { university: "University of Pennsylvania", status, semester_joined: m.semester_joined || null },
        excerpt,
        sourceUrl: "https://pennlabs.org/team/",
        snapshotId,
        retrievedAt,
      });
      insertAffiliation.run(newId("aff"), personId, UNIV_ID, "Penn Labs contributor", status, m.semester_joined || null, cId);
      if (!findRel.get("person", personId, "project", ORG_PROJECT_ID, "participated_in_program")) {
        insertRel.run(newId("rel"), "person", personId, "project", ORG_PROJECT_ID, "participated_in_program", JSON.stringify([cId]), "affiliation_only");
      }
    }

    for (const teamName of teamNames(m)) {
      const slugPath = PRODUCT_SLUGS[teamName];
      if (!slugPath) continue; // "Directors"/"Platform" aren't products
      const proj = findProject.get(teamName) as { id: string } | undefined;
      let projId: string;
      if (!proj) {
        projId = newId("proj");
        insertProject.run(projId, teamName, `Penn Labs product, built by Penn students for the Penn community.`, `https://pennlabs.org${slugPath}`);
      } else {
        projId = proj.id;
      }
      if (findRole.get(personId, projId)) continue; // already recorded this person's contribution to this product

      const roleClaim = claimId(db, {
        entityType: "person_project_role",
        entityId: personId,
        claimType: "product_contribution",
        value: { project: teamName, roles: m.roles },
        excerpt,
        sourceUrl: "https://pennlabs.org/team/",
        snapshotId,
        retrievedAt,
      });
      insertRole.run(newId("ppr"), personId, projId, m.roles.join(", "), roleClaim);
      insertRel.run(newId("rel"), "person", personId, "project", projId, "contributed_to_project", JSON.stringify([roleClaim]), "affiliation_only");
      productsLinked++;
    }
  }

  db.prepare(`UPDATE sources SET last_success_at=?, discovered_lead_count=? WHERE id=?`).run(nowIso(), byName.size, SOURCE_ID);

  console.log(`Penn Labs: ${byName.size} people seen, ${peopleCreated} new person rows, ${productsLinked} product contribution links.`);
  console.log(`These are builder/ability-to-build evidence points, not investable candidates by themselves (Penn Labs' own products are internal tools).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
