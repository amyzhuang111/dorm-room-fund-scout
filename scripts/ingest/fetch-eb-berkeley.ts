// Entrepreneurs @ Berkeley public roster.
// https://www.entrepreneursatberkeley.com/companies and /founders are
// server-rendered (verified 2026-09-25). An earlier pass called the site a
// client-only dead end; the companies and founders routes now include the
// roster in the HTML. This script reads only those two pages.
//
// Founder bios are quoted as observed facts. A bio that names UC Berkeley
// creates an unverified affiliation — the page usually does not say whether
// the person is a current student. Dollar amounts are stored only when the
// page itself states them, as company-reported, never as a verified round.
//
// Run: npx tsx scripts/ingest/fetch-eb-berkeley.ts

import * as cheerio from "cheerio";
import crypto from "node:crypto";
import { getDb, newId, nowIso } from "../../lib/db/client";
import { previousSnapshotHash } from "../../lib/ingest/dedup";
import { assembleProjectFacts } from "../../lib/domain/facts";
import { evaluateAllGates } from "../../lib/screening/gates";

const SOURCE_ID = "src_eb_berkeley";
const UNIV_ID = "univ_berkeley";
const COMPANIES_URL = "https://www.entrepreneursatberkeley.com/companies";
const FOUNDERS_URL = "https://www.entrepreneursatberkeley.com/founders";
const ORG_PROJECT_ID = "proj_eb_berkeley";

interface CompanyCard {
  name: string;
  website: string | null;
  location: string | null;
  description: string | null;
  cohort: string | null;
  tags: string[];
}

interface FounderCard {
  name: string;
  companyName: string | null;
  title: string | null;
  bio: string | null;
  cohort: string | null;
  ycBatch: string | null;
}

function textOf(el: { text: () => string }): string {
  return el.text().replace(/\s+/g, " ").trim();
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": "campus-universe-research-bot/0.1 (manual, bounded)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

function parseCompanies(html: string): CompanyCard[] {
  const $ = cheerio.load(html);
  const out: CompanyCard[] = [];
  $("a[title^='Visit ']").each((_, el) => {
    const $a = $(el);
    const name = textOf($a.find("span").first()) || textOf($a);
    const website = $a.attr("href") || null;
    const block = $a.closest(".min-w-0");
    const location = textOf(block.find(".text-muted-foreground").first()) || null;
    const description = textOf(block.find("p").first()) || null;
    const badges = block
      .find("[data-slot='badge']")
      .map((__, b) => textOf($(b)))
      .get()
      .filter(Boolean);
    const cohort = badges.find((b) => /20\d{2}/.test(b) && !/y combinator/i.test(b)) ?? null;
    if (!name || name.length > 80) return;
    out.push({ name, website, location, description, cohort, tags: badges });
  });
  return out;
}

function parseFounders(html: string): FounderCard[] {
  const $ = cheerio.load(html);
  const out: FounderCard[] = [];
  $("span.font-display").each((_, el) => {
    const $name = $(el);
    const name = textOf($name);
    if (!name || name.length > 80 || /entrepreneurs/i.test(name)) return;
    const header = $name.parent();
    const companyName = textOf(header.find("span").eq(1)) || null;
    const block = $name.closest(".min-w-0");
    const title = textOf(block.find("p").eq(0)) || null;
    const bio = textOf(block.find("p").eq(1)) || null;
    const badges = block
      .find("[data-slot='badge']")
      .map((__, b) => textOf($(b)))
      .get()
      .filter(Boolean);
    const cohort = badges.find((b) => /^E@B/i.test(b)) ?? null;
    const ycBatch = badges.find((b) => /^YC/i.test(b)) ?? null;
    if (!title || !/founder|ceo|cto|coo/i.test(title)) return;
    out.push({ name, companyName, title, bio, cohort, ycBatch });
  });
  return out;
}

function mentionsBerkeley(text: string | null): boolean {
  if (!text) return false;
  return /\buc berkeley\b|university of california,?\s+berkeley|\bberkeley\b/i.test(text);
}

async function main() {
  const db = getDb();
  const retrievedAt = nowIso();

  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at)
     VALUES (?, 'Entrepreneurs @ Berkeley', 'campus_builder_org', ?, ?, 1, 'html_scrape', 'available', ?)
     ON CONFLICT(id) DO UPDATE SET last_attempt_at=excluded.last_attempt_at, status='available', url=excluded.url`
  ).run(SOURCE_ID, COMPANIES_URL, JSON.stringify([UNIV_ID]), retrievedAt);

  const companiesHtml = await fetchText(COMPANIES_URL);
  const foundersHtml = await fetchText(FOUNDERS_URL);

  for (const [url, html, label] of [
    [COMPANIES_URL, companiesHtml, "E@B companies"],
    [FOUNDERS_URL, foundersHtml, "E@B founders"],
  ] as const) {
    const hash = crypto.createHash("sha256").update(html).digest("hex");
    if (previousSnapshotHash(db, SOURCE_ID, url) !== hash) {
      db.prepare(
        `INSERT INTO snapshots (id, source_id, url, content_hash, fetched_at, http_status, raw_excerpt) VALUES (?, ?, ?, ?, ?, 200, ?)`
      ).run(newId("snap"), SOURCE_ID, url, hash, retrievedAt, label);
    }
  }

  const companies = parseCompanies(companiesHtml);
  const founders = parseFounders(foundersHtml);
  console.log(`E@B: ${companies.length} companies, ${founders.length} founders parsed from the public pages.`);
  if (companies.length === 0 || founders.length === 0) {
    throw new Error("E@B pages parsed to an empty roster — markup changed, refusing to write nothing as success.");
  }

  const findProjectByName = db.prepare(`SELECT id FROM projects WHERE name = ? AND kind = 'company'`);
  const insertProject = db.prepare(
    `INSERT INTO projects (id, name, aliases_json, kind, sector, description, website_url, is_portfolio_reference, is_investable_candidate)
     VALUES (?, ?, '[]', 'company', NULL, ?, ?, 0, 1)`
  );
  const findPersonByAlias = db.prepare(`SELECT id FROM people WHERE aliases_json LIKE ?`);
  const insertPerson = db.prepare(`INSERT INTO people (id, name, aliases_json) VALUES (?, ?, ?)`);
  const findAffiliation = db.prepare(`SELECT id FROM affiliations WHERE person_id = ? AND university_id = ? AND role = ?`);
  const insertAffiliation = db.prepare(
    `INSERT INTO affiliations (id, person_id, university_id, role, status, claim_id) VALUES (?, ?, ?, ?, 'unverified', ?)`
  );
  const findRole = db.prepare(`SELECT id FROM person_project_roles WHERE person_id = ? AND project_id = ?`);
  const insertRole = db.prepare(
    `INSERT INTO person_project_roles (id, person_id, project_id, role, claim_id) VALUES (?, ?, ?, 'founder', ?)`
  );
  const insertRel = db.prepare(
    `INSERT INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json, verification_state)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'affiliation_only')`
  );
  const insertClaim = db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, source_url, retrieved_at, label, verification_state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unverified')`
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

  const orgExists = db.prepare(`SELECT id FROM projects WHERE id = ?`).get(ORG_PROJECT_ID);
  if (!orgExists) {
    db.prepare(
      `INSERT INTO projects (id, name, aliases_json, kind, description, website_url, is_portfolio_reference, is_investable_candidate)
       VALUES (?, 'Entrepreneurs @ Berkeley', '[]', 'project', ?, 'https://www.entrepreneursatberkeley.com/', 0, 0)`
    ).run(
      ORG_PROJECT_ID,
      "UC Berkeley undergraduate founder community. Recorded as the organization itself, not as an investable company."
    );
  }
  const orgClaim = newId("claim");
  insertClaim.run(
    orgClaim,
    "project",
    ORG_PROJECT_ID,
    "program",
    JSON.stringify({ name: "Entrepreneurs @ Berkeley" }),
    "Entrepreneurs @ Berkeley's public site describes itself as UC Berkeley's undergraduate founder community and publishes a companies roster and a founders roster.",
    SOURCE_ID,
    COMPANIES_URL,
    retrievedAt,
    "observed_fact"
  );
  const orgRel = db
    .prepare(
      `SELECT id FROM relationships WHERE source_entity_id = ? AND target_entity_id = ? AND relationship_type = 'affiliated_with'`
    )
    .get(ORG_PROJECT_ID, UNIV_ID);
  if (!orgRel) {
    insertRel.run(newId("rel"), "project", ORG_PROJECT_ID, "university", UNIV_ID, "affiliated_with", JSON.stringify([orgClaim]));
  }

  const projectIds = new Map<string, string>();
  let newCompanies = 0;
  let newPeople = 0;

  for (const company of companies) {
    const existing = findProjectByName.get(company.name) as { id: string } | undefined;
    let projectId = existing?.id;
    if (!projectId) {
      projectId = newId("proj");
      insertProject.run(projectId, company.name, company.description, company.website);
      newCompanies++;
    }
    projectIds.set(company.name.toLowerCase(), projectId);

    const excerpt = `E@B's public companies page lists "${company.name}"${company.cohort ? ` (${company.cohort})` : ""}${
      company.description ? `: ${company.description}` : ""
    }.${company.location ? ` Location on the page: ${company.location}.` : ""} The page says these are startups built by E@B members.`;
    const claimId = newId("claim");
    insertClaim.run(
      claimId,
      "project",
      projectId,
      "program_membership",
      JSON.stringify({ company: company.name, cohort: company.cohort, tags: company.tags, website: company.website }),
      excerpt,
      SOURCE_ID,
      COMPANIES_URL,
      retrievedAt,
      "observed_fact"
    );
    const already = db
      .prepare(
        `SELECT id FROM relationships WHERE source_entity_id = ? AND target_entity_id = ? AND relationship_type = 'affiliated_with'`
      )
      .get(projectId, UNIV_ID);
    if (!already) {
      insertRel.run(newId("rel"), "project", projectId, "university", UNIV_ID, "affiliated_with", JSON.stringify([claimId]));
    }
    insertSignal.run(
      newId("sig"),
      projectId,
      `Listed on Entrepreneurs @ Berkeley's public companies roster${company.cohort ? ` (${company.cohort})` : ""}.`,
      "E@B membership of the founding team is what the page claims. It is not a funding total and not proof every founder is a current student.",
      JSON.stringify([claimId])
    );
  }

  for (const founder of founders) {
    const alias = `eb-founder:${founder.name.toLowerCase()}`;
    const existingPerson = findPersonByAlias.get(`%"${alias}"%`) as { id: string } | undefined;
    const personId = existingPerson?.id ?? newId("person");
    if (!existingPerson) {
      insertPerson.run(personId, founder.name, JSON.stringify([alias]));
      newPeople++;
    }

    const schoolNamed = mentionsBerkeley(founder.bio);
    const excerpt = `E@B's public founders page lists ${founder.name}${founder.title ? ` as ${founder.title}` : ""}${
      founder.companyName ? ` of ${founder.companyName}` : ""
    }${founder.cohort ? `, ${founder.cohort}` : ""}${founder.ycBatch ? `, ${founder.ycBatch}` : ""}.${
      founder.bio ? ` Bio on the page: "${founder.bio}"` : ""
    }${
      schoolNamed
        ? " The bio names UC Berkeley; enrollment status is still unverified because the page does not give a dated current-student record."
        : " The bio does not itself name UC Berkeley — affiliation stays unverified, sourced only to the E@B roster."
    }`;
    const claimId = newId("claim");
    insertClaim.run(
      claimId,
      "person",
      personId,
      "program_membership",
      JSON.stringify({ name: founder.name, company: founder.companyName, title: founder.title, cohort: founder.cohort, ycBatch: founder.ycBatch }),
      excerpt,
      SOURCE_ID,
      FOUNDERS_URL,
      retrievedAt,
      "observed_fact"
    );

    const roleLabel = founder.cohort ? `E@B founder (${founder.cohort})` : "E@B founder";
    if (!findAffiliation.get(personId, UNIV_ID, roleLabel)) {
      insertAffiliation.run(newId("aff"), personId, UNIV_ID, roleLabel, claimId);
    }
    if (!findRole.get(personId, ORG_PROJECT_ID)) {
      db.prepare(
        `INSERT INTO person_project_roles (id, person_id, project_id, role, claim_id) VALUES (?, ?, ?, 'member', ?)`
      ).run(newId("ppr"), personId, ORG_PROJECT_ID, claimId);
      insertRel.run(newId("rel"), "person", personId, "project", ORG_PROJECT_ID, "contributed_to_project", JSON.stringify([claimId]));
    }

    const projectId = founder.companyName ? projectIds.get(founder.companyName.toLowerCase()) : undefined;
    if (projectId && !findRole.get(personId, projectId)) {
      insertRole.run(newId("ppr"), personId, projectId, claimId);
      insertRel.run(newId("rel"), "person", personId, "project", projectId, "founded", JSON.stringify([claimId]));
    } else if (founder.companyName && !projectId) {
      console.log(`E@B founder ${founder.name} names company "${founder.companyName}" which was not on the companies page — no company row invented.`);
    }
  }

  for (const projectId of projectIds.values()) {
    const facts = assembleProjectFacts(db, projectId);
    const outcomes = evaluateAllGates(facts);
    for (const o of outcomes) upsertGate.run(newId("gate"), projectId, o.gate, o.result, o.rationale);
  }

  db.prepare(`UPDATE sources SET last_success_at=?, discovered_lead_count=?, error=NULL WHERE id=?`).run(
    nowIso(),
    companies.length,
    SOURCE_ID
  );
  console.log(`E@B done: ${newCompanies} new companies, ${newPeople} new people.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
