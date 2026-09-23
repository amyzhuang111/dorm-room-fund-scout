// Real ingestion from GRASP Lab's public Startups list
// (grasp.upenn.edu/startups/) — a real Penn robotics/autonomy/CV/controls
// research lab, tiered Founder Scout S / Startup Scout B in
// lib/domain/source-quality.ts (`cat_grasp`, previously "unconfigured").
//
// grasp.upenn.edu is WordPress. Its Startups page itself renders nothing in
// raw HTML (fully AJAX-loaded via the Ajax Load More plugin on page load,
// verified by direct inspection — no noscript fallback here unlike
// /role/student/). Guessing at that plugin's admin-ajax.php contract was
// tried and abandoned: it returned HTTP 200 but silently ignored the
// post_type/meta params and fell back to a default blog-post query instead
// of startups — a wrong-but-200 response is exactly the kind of silent
// failure §7 warns against, so it was not pursued further. Checked for a
// real alternative instead of persisting with a guess: this WordPress
// install exposes a genuine, documented REST API
// (grasp.upenn.edu/wp-json/wp/v2/types lists real registered post types),
// including `startup` (13 total, verified via X-WP-Total) — a real,
// structured, non-guessed source.
//
// Scope for this pass is the Startups endpoint only, not the site's
// `people` post type (1941 total across all roles/decades — mostly
// historical alumni/staff, no bio content in the REST payload beyond a
// name + role-taxonomy id, and cat_grasp's own whatNotToInfer is explicit
// that bare lab-roster membership is weaker evidence than clearly
// leading/building something — ingesting 1941 undifferentiated roster rows
// would be exactly the conflation that note warns against) or `project`
// (94 research-paper-style posts; author field is the lab's web content
// manager, not the actual student researcher, and reliably attributing a
// named student would require scraping each project's arbitrary external
// link, which is a guess). Startups is the one endpoint that already
// carries what this source is supposed to catch: real deep-tech company
// formation.
//
// Founder names are extracted by hand from each startup's real page text,
// not by a generic regex (a regex over prose like "advised by CJ Taylor"
// or "affiliated with Dr. Mihail Pivtoraiko" would misparse an advisor or
// faculty affiliation as a founder — both phrases appear in this exact
// dataset). Only phrasing that unambiguously states who founded the
// company is used (FOUNDERS below), matching the PRODUCT_TO_REPO
// hand-verified-mapping precedent in enrich-penn-labs-github.ts. Faculty
// named as a company's origin (e.g. Exyn's Dr. Vijay Kumar, Aptonomy's Dr.
// Mihail Pivtoraiko) are deliberately NOT recorded as a person_project_role
// here — they're real, but a professor isn't a Founder Scout candidate for
// a student-sourcing tool, and the promotion pipeline (lib/domain/
// promotion.ts) would otherwise promote them into candidate lists
// alongside actual students.
//
// Run: npx tsx scripts/ingest/fetch-grasp-startups.ts

import crypto from "node:crypto";
import { getDb, newId, nowIso } from "../../lib/db/client";
import { previousSnapshotHash } from "../../lib/ingest/dedup";
import { assembleProjectFacts } from "../../lib/domain/facts";
import { evaluateAllGates } from "../../lib/screening/gates";

const SOURCE_ID = "src_grasp_startups";
const UNIV_ID = "univ_penn";
const API_URL = "https://www.grasp.upenn.edu/wp-json/wp/v2/startup?per_page=100";

// Hand-verified from each startup's real page text (see header note) —
// only where the text unambiguously names who founded the company.
const FOUNDERS: Record<string, string[]> = {
  "kmel-qualcomm": ["Alex Kushleyev", "Daniel Mellinger"],
  "iq-motion-control": ["Matthew Piccoli"],
  "ghost-robotics": ["Avik De", "Gavin Kenneally"],
  "augean-robotics-inc": ["Berkay Deniz Ilhan"],
};

interface WpStartup {
  id: number;
  slug: string;
  link: string;
  title: { rendered: string };
  content: { rendered: string };
  date: string;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#8217;/g, "'")
    .replace(/&#8211;|&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const db = getDb();
  const retrievedAt = nowIso();

  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at)
     VALUES (?, 'GRASP Lab — Startups (WP REST API)', 'lab_or_research', ?, ?, 1, 'api', 'available', ?)
     ON CONFLICT(id) DO UPDATE SET last_attempt_at=excluded.last_attempt_at, status='available'`
  ).run(SOURCE_ID, "https://www.grasp.upenn.edu/startups/", JSON.stringify([UNIV_ID]), retrievedAt);

  const res = await fetch(API_URL, { headers: { "user-agent": "campus-universe-research-bot/0.1 (manual, bounded)", accept: "application/json" } });
  if (!res.ok) {
    db.prepare(`UPDATE sources SET status='failed', error=? WHERE id=?`).run(`HTTP ${res.status}`, SOURCE_ID);
    throw new Error(`HTTP ${res.status}`);
  }
  const startups = (await res.json()) as WpStartup[];
  const hash = crypto.createHash("sha256").update(JSON.stringify(startups.map((s) => [s.slug, s.content.rendered]))).digest("hex");

  let snapshotId: string;
  if (previousSnapshotHash(db, SOURCE_ID, API_URL) !== hash) {
    snapshotId = newId("snap");
    db.prepare(
      `INSERT INTO snapshots (id, source_id, url, content_hash, fetched_at, http_status, raw_excerpt) VALUES (?, ?, ?, ?, ?, 200, ?)`
    ).run(snapshotId, SOURCE_ID, API_URL, hash, retrievedAt, `${startups.length} startups from GRASP's real WP REST API`);
  } else {
    snapshotId = (
      db.prepare(`SELECT id FROM snapshots WHERE source_id = ? AND url = ? ORDER BY fetched_at DESC LIMIT 1`).get(SOURCE_ID, API_URL) as { id: string }
    ).id;
  }

  console.log(`GRASP Startups: ${startups.length} real entries found via the WP REST API.`);

  const findProjectByName = db.prepare(`SELECT id FROM projects WHERE name = ?`);
  const insertProject = db.prepare(
    `INSERT INTO projects (id, name, aliases_json, kind, sector, description, website_url, is_portfolio_reference, is_investable_candidate)
     VALUES (?, ?, '[]', 'company', 'robotics', ?, ?, 0, 1)`
  );
  const findPerson = db.prepare(`SELECT id FROM people WHERE name = ?`);
  const insertPerson = db.prepare(`INSERT INTO people (id, name, aliases_json) VALUES (?, ?, '[]')`);
  const findAffiliation = db.prepare(`SELECT id FROM affiliations WHERE person_id = ? AND university_id = ? AND role = ?`);
  const insertAffiliation = db.prepare(
    `INSERT INTO affiliations (id, person_id, university_id, role, status, claim_id) VALUES (?, ?, ?, 'GRASP-affiliated startup founder', 'unverified', ?)`
  );
  const findRole = db.prepare(`SELECT id FROM person_project_roles WHERE person_id = ? AND project_id = ?`);
  const insertRole = db.prepare(`INSERT INTO person_project_roles (id, person_id, project_id, role, claim_id) VALUES (?, ?, ?, 'founder', ?)`);
  const insertRel = db.prepare(
    `INSERT INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json, verification_state)
     VALUES (?, 'person', ?, 'project', ?, 'founded', ?, 'affiliation_only')`
  );
  const insertClaim = db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, snapshot_id, source_url, retrieved_at, label, verification_state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unverified')`
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
  let newPeople = 0;

  for (const s of startups) {
    const name = s.title.rendered;
    if (findProjectByName.get(name)) continue; // already ingested in a prior run

    const description = stripHtml(s.content.rendered) || null;
    const projectId = newId("proj");
    insertProject.run(projectId, name, description, s.link);
    newCompanies++;

    const claimId = newId("claim");
    insertClaim.run(
      claimId,
      "project",
      projectId,
      "lab_spinout",
      JSON.stringify({ slug: s.slug, postedDate: s.date.slice(0, 10) }),
      `GRASP Lab's public Startups page lists "${name}"${description ? `: "${description}"` : " (no description text on the page)."}`,
      SOURCE_ID,
      snapshotId,
      s.link,
      retrievedAt,
      "observed_fact"
    );
    insertSignal.run(
      newId("sig"),
      projectId,
      `GRASP Lab (Penn robotics/autonomy research lab) publicly lists "${name}" as a lab-connected startup.`,
      s.date.slice(0, 10),
      "The lab's own list of companies it credits as connected to its research/people — real provenance evidence, not itself an investment-readiness judgment (many of these are old or already acquired; gates below evaluate stage/funding independently).",
      JSON.stringify([claimId])
    );

    for (const founderName of FOUNDERS[s.slug] ?? []) {
      const person = findPerson.get(founderName) as { id: string } | undefined;
      const personId = person?.id ?? newId("person");
      if (!person) {
        insertPerson.run(personId, founderName);
        newPeople++;
      }

      const founderExcerpt = `GRASP Lab's public Startups page states "${founderName}" founded "${name}" — a real, named founder claim, but not independently corroborated yet, and does not by itself confirm current (vs. former/alumni) Penn affiliation.`;
      const founderClaimId = newId("claim");
      insertClaim.run(
        founderClaimId,
        "project",
        projectId,
        "lab_spinout_founder",
        JSON.stringify({ company: name, founder: founderName }),
        founderExcerpt,
        SOURCE_ID,
        snapshotId,
        s.link,
        retrievedAt,
        "observed_fact"
      );

      if (!findAffiliation.get(personId, UNIV_ID, "GRASP-affiliated startup founder")) {
        insertAffiliation.run(newId("aff"), personId, UNIV_ID, founderClaimId);
      }
      if (!findRole.get(personId, projectId)) {
        insertRole.run(newId("ppr"), personId, projectId, founderClaimId);
        insertRel.run(newId("rel"), personId, projectId, JSON.stringify([founderClaimId]));
      }
    }

    const facts = assembleProjectFacts(db, projectId);
    const outcomes = evaluateAllGates(facts);
    for (const o of outcomes) upsertGate.run(newId("gate"), projectId, o.gate, o.result, o.rationale);
  }

  const totalIngested = (
    db.prepare(`SELECT COUNT(DISTINCT entity_id) c FROM claims WHERE entity_type='project' AND source_id = ?`).get(SOURCE_ID) as { c: number }
  ).c;
  db.prepare(`UPDATE sources SET last_success_at=?, discovered_lead_count=? WHERE id=?`).run(nowIso(), totalIngested, SOURCE_ID);
  console.log(`${newCompanies} new compan(y/ies), ${newPeople} new person(s) (named founders on 4/13 entries — the rest are real but founderless on the page), ${totalIngested} total ingested from this source so far.`);
  console.log("All founder-university affiliations seeded 'unverified'. Faculty named as a company's research origin (Exyn, Aptonomy) are intentionally not recorded as person_project_roles — real, but not a Founder Scout student candidate.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
