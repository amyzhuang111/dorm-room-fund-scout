// Real ingestion from Hack4Impact's Penn chapter public "Our Work" page
// (upenn.hack4impact.org/projects), surfaced by real student-community
// discussion (see community-signal.ts) recommending it alongside Penn Labs
// as a place students build real software. The page embeds a clean
// `__NEXT_DATA__` JSON payload (Next.js SSG data) with real project names,
// real team-member names, and a cohort label — no HTML-scraping needed.
//
// Hack4Impact builds software FOR nonprofit clients, not its own ventures —
// same shape as Penn Labs building Penn's own internal apps. Projects are
// therefore kind='project', is_investable_candidate=0 (ability-to-build
// evidence about the people, never itself a Startup Scout candidate).
//
// Team members are a flat name list with no role differentiation (same
// epistemic gap as a Devpost hackathon gallery) — role is seeded
// 'team_member', never 'founder'. People are keyed by name only (Hack4Impact
// exposes no stronger per-person identifier like a profile URL or pennkey
// in this data), so a shared common name across chapters/years could in
// principle collide — a real, documented limitation, same class of risk
// already accepted for the Penn Venture Lab Startup Challenge's founder
// keying. A handful of team entries are bare UUID strings (broken/removed
// member references in Hack4Impact's own CMS) — filtered out rather than
// treated as a real name.
//
// Run: npx tsx scripts/ingest/fetch-hack4impact.ts

import crypto from "node:crypto";
import { getDb, newId, nowIso } from "../../lib/db/client";
import { previousSnapshotHash } from "../../lib/ingest/dedup";

const SOURCE_ID = "src_hack4impact_penn";
const UNIV_ID = "univ_penn";
const PAGE_URL = "https://upenn.hack4impact.org/projects";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ProjectEntry {
  title: string;
  team: string;
  description: string;
  urlSlug: string;
  completedIn: string;
}

function extractProjects(html: string): ProjectEntry[] {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return [];
  const data = JSON.parse(m[1]);
  return (data?.props?.pageProps?.projects ?? []) as ProjectEntry[];
}

async function main() {
  const db = getDb();
  const retrievedAt = nowIso();

  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at)
     VALUES (?, 'Hack4Impact (Penn chapter)', 'student_club', ?, ?, 1, 'html_scrape', 'available', ?)
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
    ).run(snapshotId, SOURCE_ID, PAGE_URL, hash, retrievedAt, "Hack4Impact Penn 'Our Work' page (__NEXT_DATA__ project list)");
  } else {
    snapshotId = (
      db.prepare(`SELECT id FROM snapshots WHERE source_id = ? AND url = ? ORDER BY fetched_at DESC LIMIT 1`).get(SOURCE_ID, PAGE_URL) as { id: string }
    ).id;
  }

  const projects = extractProjects(html);
  console.log(`Hack4Impact: ${projects.length} real projects found.`);

  const findProjectBySlug = db.prepare(`SELECT id FROM projects WHERE website_url = ?`);
  const insertProject = db.prepare(
    `INSERT INTO projects (id, name, aliases_json, kind, sector, description, website_url, is_portfolio_reference, is_investable_candidate)
     VALUES (?, ?, '[]', 'project', 'nonprofit_software', ?, ?, 0, 0)`
  );
  const findPerson = db.prepare(`SELECT id FROM people WHERE name = ?`);
  const insertPerson = db.prepare(`INSERT INTO people (id, name, aliases_json) VALUES (?, ?, '[]')`);
  const findAffiliation = db.prepare(`SELECT id FROM affiliations WHERE person_id = ? AND university_id = ? AND role = ?`);
  const insertAffiliation = db.prepare(
    `INSERT INTO affiliations (id, person_id, university_id, role, status, claim_id) VALUES (?, ?, ?, 'Hack4Impact team member', 'unverified', ?)`
  );
  const findRole = db.prepare(`SELECT id FROM person_project_roles WHERE person_id = ? AND project_id = ?`);
  const insertRole = db.prepare(`INSERT INTO person_project_roles (id, person_id, project_id, role, claim_id) VALUES (?, ?, ?, 'team_member', ?)`);
  const insertRel = db.prepare(
    `INSERT INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json, verification_state)
     VALUES (?, 'person', ?, 'project', ?, 'contributed_to_project', ?, 'affiliation_only')`
  );
  const insertClaim = db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, snapshot_id, source_url, retrieved_at, label, verification_state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unverified')`
  );
  const insertSignal = db.prepare(
    `INSERT INTO signals (id, project_id, signal_type, current_observation, source_date, significance_note, claim_ids_json)
     VALUES (?, ?, 'demo', ?, ?, ?, ?)`
  );

  let newProjects = 0;
  let newPeople = 0;

  for (const entry of projects) {
    const detailUrl = `https://upenn.hack4impact.org/projects/${entry.urlSlug}`;
    if (findProjectBySlug.get(detailUrl)) continue; // already ingested in a prior run

    const projectId = newId("proj");
    insertProject.run(projectId, entry.title, entry.description || null, detailUrl);
    newProjects++;

    insertSignal.run(
      newId("sig"),
      projectId,
      `Hack4Impact (Penn chapter) project for a nonprofit client: "${entry.title}" — ${entry.description}`,
      null,
      `Completed ${entry.completedIn}. A real, dated, client-delivered software project — ability-to-build evidence for the team, not a Hack4Impact venture of its own.`,
      JSON.stringify([])
    );

    const names = entry.team
      .split(",")
      .map((n) => n.trim())
      .filter((n) => n && !UUID_RE.test(n));

    for (const name of names) {
      const person = findPerson.get(name) as { id: string } | undefined;
      const personId = person?.id ?? newId("person");
      if (!person) {
        insertPerson.run(personId, name);
        newPeople++;
      }

      const excerpt = `Hack4Impact's public "Our Work" page lists "${name}" as a team member on "${entry.title}" (${entry.completedIn}). The team list carries no per-person role — this does NOT by itself distinguish ownership, and does not by itself confirm current Penn enrollment; affiliation seeded as unverified.`;
      const claimId = newId("claim");
      insertClaim.run(claimId, "project", projectId, "nonprofit_project_team", JSON.stringify({ project: entry.title, member: name }), excerpt, SOURCE_ID, snapshotId, detailUrl, retrievedAt, "observed_fact");

      if (!findAffiliation.get(personId, UNIV_ID, "Hack4Impact team member")) {
        insertAffiliation.run(newId("aff"), personId, UNIV_ID, claimId);
      }
      if (!findRole.get(personId, projectId)) {
        insertRole.run(newId("ppr"), personId, projectId, claimId);
        insertRel.run(newId("rel"), personId, projectId, JSON.stringify([claimId]));
      }
    }
  }

  const totalIngested = (
    db.prepare(`SELECT COUNT(DISTINCT project_id) c FROM person_project_roles ppr JOIN claims c ON c.id = ppr.claim_id WHERE c.source_id = ?`).get(SOURCE_ID) as { c: number }
  ).c;
  db.prepare(`UPDATE sources SET last_success_at=?, discovered_lead_count=? WHERE id=?`).run(nowIso(), totalIngested, SOURCE_ID);
  console.log(`${newProjects} new project(s), ${newPeople} new person(s), ${totalIngested} total ingested from this source so far.`);
  console.log("All affiliations seeded 'unverified' — a Hack4Impact team credit doesn't by itself confirm current Penn enrollment, and team roles are undifferentiated ('team_member', never 'founder').");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
