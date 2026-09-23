// Real ingestion from Velocity's public company directory
// (velocityincubator.com/companies + /company/<slug> detail pages) — a real
// University of Waterloo startup accelerator, tiered Startup Scout A in
// lib/domain/source-quality.ts. This is Startup Scout's second real source
// (after Penn's Venture Lab Startup Challenge) and its first at Waterloo.
//
// Velocity accepts founders broadly, not only current Waterloo students
// (source-quality.ts's own rationale: "don't assume every Velocity founder
// is a current Waterloo student — verify university relationship
// independently"), so affiliation is seeded 'unverified', exactly like the
// Devpost hackathon sources — company participation in a Waterloo-affiliated
// accelerator is real evidence, but not proof of Waterloo enrollment.
//
// Bounded to the most recent cohort years (2025–2026) rather than the
// directory's full ~90-company, decade-plus history — an older Velocity
// company (e.g. ApplyBoard, a 2015 cohort company now a large late-stage
// business) is not a pre-seed candidate, and the brief is pre-seed-only.
// Real founder names ARE available per-company here (unlike MIT delta v,
// which only links out to each company's own external site) — role is
// 'founder' directly, not the hedged 'team_member' Devpost sources use,
// since Velocity's own page explicitly labels these people "Founders".
//
// Run: npx tsx scripts/ingest/fetch-velocity.ts

import * as cheerio from "cheerio";
import crypto from "node:crypto";
import { getDb, newId, nowIso } from "../../lib/db/client";
import { previousSnapshotHash } from "../../lib/ingest/dedup";
import { assembleProjectFacts } from "../../lib/domain/facts";
import { evaluateAllGates } from "../../lib/screening/gates";

const SOURCE_ID = "src_velocity";
const UNIV_ID = "univ_waterloo";
const LIST_URL = "https://www.velocityincubator.com/companies";
const MIN_YEAR = 2025; // most recent 2 cohort years only — see header note
const ROLE_LABEL = "Velocity company founder";

interface ListEntry {
  name: string;
  year: number;
  slug: string;
  sector: string | null;
}

function extractListEntries(html: string): ListEntry[] {
  const $ = cheerio.load(html);
  const out: ListEntry[] = [];
  $(".company_list_item_wrapper").each((_, el) => {
    const $el = $(el);
    const name = $el.find('[fs-cmsfilter-field="company"]').first().text().trim();
    const yearText = $el.find('[fs-cmsfilter-field="year"]').first().text().trim();
    const year = parseInt(yearText, 10);
    const href = $el.find('a[href^="/company/"]').first().attr("href") || "";
    const slug = href.replace(/^\/company\//, "");
    const sector = $el.find('[fs-cmsfilter-field="Sector"]').first().text().trim() || null;
    if (name && slug && Number.isFinite(year)) out.push({ name, year, slug, sector });
  });
  return out;
}

interface CompanyDetail {
  description: string | null;
  founders: string[];
  location: string | null;
  status: string | null;
}

function extractCompanyDetail(html: string): CompanyDetail {
  const $ = cheerio.load(html);
  const description = $(".text_company_description").first().text().trim() || null;
  const founders = $(".founders_company_wrapper .text-block-9-copy.founder")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);

  // "Location:" / "Status:" are label/value pairs inside .detail_item — match
  // by the label text rather than a fixed index, since the field order isn't
  // guaranteed to be stable.
  let location: string | null = null;
  let status: string | null = null;
  $(".detail_item").each((_, el) => {
    const label = $(el).find(".text-block-9").first().text().trim().replace(/:$/, "");
    const value = $(el).find(".text-block-9-copy").first().text().trim();
    if (label === "Location") location = value || null;
    if (label === "Status") status = value || null;
  });

  return { description, founders, location, status };
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": "campus-universe-research-bot/0.1 (manual, bounded)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

async function main() {
  const db = getDb();
  const retrievedAt = nowIso();

  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at)
     VALUES (?, 'Velocity (Waterloo)', 'accelerator', ?, ?, 1, 'html_scrape', 'available', ?)
     ON CONFLICT(id) DO UPDATE SET last_attempt_at=excluded.last_attempt_at, status='available'`
  ).run(SOURCE_ID, LIST_URL, JSON.stringify([UNIV_ID]), retrievedAt);

  const listHtml = await fetchText(LIST_URL);
  const listHash = crypto.createHash("sha256").update(listHtml).digest("hex");
  let fetches = 1;

  if (previousSnapshotHash(db, SOURCE_ID, LIST_URL) !== listHash) {
    db.prepare(
      `INSERT INTO snapshots (id, source_id, url, content_hash, fetched_at, http_status, raw_excerpt) VALUES (?, ?, ?, ?, ?, 200, ?)`
    ).run(newId("snap"), SOURCE_ID, LIST_URL, listHash, retrievedAt, "Velocity companies directory");
  }

  const allEntries = extractListEntries(listHtml);
  const recent = allEntries.filter((e) => e.year >= MIN_YEAR);
  console.log(`Velocity directory: ${allEntries.length} companies total, ${recent.length} from ${MIN_YEAR}+ (bounded to recent cohorts, not the full decade-plus history).`);

  const findProjectByName = db.prepare(`SELECT id FROM projects WHERE name = ? AND kind = 'company'`);
  const insertProject = db.prepare(
    `INSERT INTO projects (id, name, aliases_json, kind, sector, description, website_url, is_portfolio_reference, is_investable_candidate)
     VALUES (?, ?, '[]', 'company', ?, ?, NULL, 0, 1)`
  );
  const findPerson = db.prepare(`SELECT id FROM people WHERE name = ?`);
  const insertPerson = db.prepare(`INSERT INTO people (id, name, aliases_json) VALUES (?, ?, '[]')`);
  const findAffiliation = db.prepare(`SELECT id FROM affiliations WHERE person_id = ? AND university_id = ? AND role = ?`);
  const insertAffiliation = db.prepare(
    `INSERT INTO affiliations (id, person_id, university_id, role, status, claim_id) VALUES (?, ?, ?, ?, 'unverified', ?)`
  );
  const findRole = db.prepare(`SELECT id FROM person_project_roles WHERE person_id = ? AND project_id = ?`);
  const insertRole = db.prepare(`INSERT INTO person_project_roles (id, person_id, project_id, role, claim_id) VALUES (?, ?, ?, 'founder', ?)`);
  const insertRel = db.prepare(
    `INSERT INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json, verification_state)
     VALUES (?, 'person', ?, 'project', ?, 'founded', ?, 'affiliation_only')`
  );
  // Project→university link, independent of whether any founder was
  // extracted — Velocity's own directory is itself real evidence the
  // company is Waterloo-accelerator-affiliated, which shouldn't depend on
  // a founder existing (a couple of real companies list zero founders on
  // Velocity's own page). See lib/domain/queries.ts's companyCount /
  // listCandidateProjects fallback, which reads this same relationship.
  const insertCompanyUniRel = db.prepare(
    `INSERT INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json, verification_state)
     VALUES (?, 'project', ?, 'university', ?, 'affiliated_with', ?, 'affiliation_only')`
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

  for (const entry of recent) {
    if (fetches >= 30) {
      console.log("Hit the 30-fetch scan budget — stopping early (this is intentional, not a bug).");
      break;
    }
    if (findProjectByName.get(entry.name)) continue; // already ingested in a prior run

    const detailUrl = `https://www.velocityincubator.com/company/${entry.slug}`;
    let detailHtml: string;
    try {
      detailHtml = await fetchText(detailUrl);
      fetches++;
    } catch (e) {
      console.log(`skip ${entry.name}: fetch failed (${(e as Error).message})`);
      continue;
    }
    const detailHash = crypto.createHash("sha256").update(detailHtml).digest("hex");
    const detailSnapshotId = newId("snap");
    db.prepare(
      `INSERT INTO snapshots (id, source_id, url, content_hash, fetched_at, http_status, raw_excerpt) VALUES (?, ?, ?, ?, ?, 200, ?)`
    ).run(detailSnapshotId, SOURCE_ID, detailUrl, detailHash, retrievedAt, `Velocity company page: ${entry.name}`);

    const detail = extractCompanyDetail(detailHtml);
    const projectId = newId("proj");
    insertProject.run(projectId, entry.name, entry.sector, detail.description);
    newCompanies++;

    const companyClaimId = newId("claim");
    insertClaim.run(
      companyClaimId,
      "project",
      projectId,
      "accelerator_membership",
      JSON.stringify({ company: entry.name, year: entry.year, status: detail.status }),
      `Velocity's public company directory lists "${entry.name}" as a company that joined in ${entry.year}.`,
      SOURCE_ID,
      detailSnapshotId,
      detailUrl,
      retrievedAt,
      "observed_fact"
    );
    insertCompanyUniRel.run(newId("rel"), projectId, UNIV_ID, JSON.stringify([companyClaimId]));

    const statusNote = detail.status ? ` Status on Velocity's directory: ${detail.status}.` : "";
    insertSignal.run(
      newId("sig"),
      projectId,
      `Velocity (University of Waterloo accelerator) company, joined ${entry.year}${detail.location ? `, based in ${detail.location}` : ""}.${statusNote}`,
      null,
      "Accelerator participation is a real, dated formation signal — not itself an investment-readiness judgment.",
      JSON.stringify([])
    );

    for (const founderName of detail.founders) {
      const person = findPerson.get(founderName) as { id: string } | undefined;
      const personId = person?.id ?? newId("person");
      if (!person) {
        insertPerson.run(personId, founderName);
        newPeople++;
      }

      const excerpt = `Velocity's public company page lists "${founderName}" as a founder of ${entry.name} (joined ${entry.year}). Velocity accepts founders broadly, not only current Waterloo students — this does NOT by itself confirm Waterloo enrollment, seeded as unverified pending independent research.`;
      const claimId = newId("claim");
      insertClaim.run(claimId, "project", projectId, "accelerator_founder", JSON.stringify({ company: entry.name, founder: founderName, year: entry.year }), excerpt, SOURCE_ID, detailSnapshotId, detailUrl, retrievedAt, "observed_fact");

      if (!findAffiliation.get(personId, UNIV_ID, ROLE_LABEL)) {
        insertAffiliation.run(newId("aff"), personId, UNIV_ID, ROLE_LABEL, claimId);
      }
      if (!findRole.get(personId, projectId)) {
        insertRole.run(newId("ppr"), personId, projectId, claimId);
        insertRel.run(newId("rel"), personId, projectId, JSON.stringify([claimId]));
      }
    }

    const facts = assembleProjectFacts(db, projectId);
    const outcomes = evaluateAllGates(facts);
    for (const o of outcomes) upsertGate.run(newId("gate"), projectId, o.gate, o.result, o.rationale);
  }

  // Cumulative total ever ingested from this source, not just this run's
  // slice — counts a project via either its own direct claim (every company
  // gets one, even the couple with zero founders listed) or a founder-role
  // claim, so a founderless company isn't undercounted here either.
  const totalIngested = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT p.id) c FROM projects p
         WHERE p.kind = 'company' AND (
           EXISTS (SELECT 1 FROM claims c WHERE c.entity_id = p.id AND c.entity_type = 'project' AND c.source_id = ?)
           OR EXISTS (SELECT 1 FROM person_project_roles ppr JOIN claims c2 ON c2.id = ppr.claim_id WHERE ppr.project_id = p.id AND c2.source_id = ?)
         )`
      )
      .get(SOURCE_ID, SOURCE_ID) as { c: number }
  ).c;

  db.prepare(`UPDATE sources SET last_success_at=?, discovered_lead_count=? WHERE id=?`).run(nowIso(), totalIngested, SOURCE_ID);
  console.log(`${newCompanies} new compan(y/ies), ${newPeople} new person(s), ${fetches} total fetches used, ${totalIngested} total ingested from this source so far.`);
  console.log("All founder-university affiliations seeded as 'unverified' — Velocity accepts founders beyond current Waterloo students, confirming enrollment is a research task, not assumed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
