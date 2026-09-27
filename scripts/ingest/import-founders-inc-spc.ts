// Idempotent import of public Founders Inc and South Park Commons people.
// Reads data/imports/founders-inc-spc.json. A person is in that file only
// when a public page names them and a public page states a school already
// in the campus list, or they are a current student somewhere else.
//
// Not written, on purpose:
// - Off Season team pages, which list companies and booths and not people.
// - Portfolio companies with no qualifying person.
// - Team-level school mentions that do not name who attended.
// - Job titles (professor, lecturer, faculty, postdoc, researcher) used as enrollment.
//
// Re-running updates claims and badges in place. It does not replace a
// verified enrollment with an inferred one, and it does not merge two people
// who share a name but not a campus, company, or LinkedIn profile.
//
// Run: npx tsx scripts/ingest/import-founders-inc-spc.ts

import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { getDb, newId, nowIso } from "../../lib/db/client";
import { linkedinPersonSlug, normalizeCompanyName, normalizePersonName } from "../../lib/domain/dedupe";
import { isProgramMatchStatus } from "../../lib/domain/program-signals";

// Kept local so new program badges do not have to be listed in this importer.
const FOUNDERS_PROGRAMS = ["founders_inc", "south_park_commons"] as const;
type FoundersProgram = (typeof FOUNDERS_PROGRAMS)[number];

function isFoundersProgram(value: string): value is FoundersProgram {
  return (FOUNDERS_PROGRAMS as readonly string[]).includes(value);
}

interface CompanyRecord {
  name: string;
  founded: number | null;
  website: string | null;
  description: string | null;
  investable: boolean;
}

interface PersonRecord {
  name: string;
  program: FoundersProgram;
  matchStatus: "confirmed" | "likely";
  label: string;
  year: number | null;
  cohort: string | null;
  role: string;
  universityId: string | null;
  extraUniversityIds: string[];
  enrollmentStatus: "current_student" | "recent_grad" | "older_alumni";
  enrollmentBasis: "verified" | "inferred";
  gradYear: number | null;
  leftSchool: boolean;
  keepWithoutCampus: boolean;
  founderStatus: "founder" | "potential";
  company: CompanyRecord | null;
  companyRole: "founder" | null;
  sourceUrl: string;
  excerpt: string;
  educationUrl: string | null;
  educationExcerpt: string | null;
  linkedin: string | null;
}

interface CompanyRow {
  id: string;
  name: string;
  website_url: string | null;
  description: string | null;
}

const PROGRAMS: Record<
  FoundersProgram,
  { sourceId: string; sourceName: string; sourceUrl: string; projectId: string; projectName: string; rationale: string }
> = {
  founders_inc: {
    sourceId: "src_founders_inc",
    sourceName: "Founders Inc",
    sourceUrl: "https://f.inc/",
    projectId: "proj_founders_inc",
    projectName: "Founders Inc",
    rationale:
      "San Francisco residency and first-check fund. Off Season is six weeks for students, recent grads, and dropouts (48 teams in 2025, 100 teams in 2026). First checks are typically $100k–$250k. Broader than a ~12-person fellowship, so founder and startup tiers are A.",
  },
  south_park_commons: {
    sourceId: "src_south_park_commons",
    sourceName: "South Park Commons",
    sourceUrl: "https://www.southparkcommons.com/",
    projectId: "proj_south_park_commons",
    projectName: "South Park Commons",
    rationale:
      "San Francisco founder community. The Founder Fellowship invests $400k for 7% and reserves $600k for the next external round. A separate residency runs six months at no cost and no equity. Founder and startup tiers are A.",
  },
};

const GENERIC_HOSTS = new Set(["linkedin.com", "twitter.com", "x.com", "github.com", "medium.com", "substack.com", "youtube.com", "google.com", "notion.so"]);

function hostOf(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith("http")) return null;
  try {
    const host = new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
    if (!host || GENERIC_HOSTS.has(host)) return null;
    return host;
  } catch {
    return null;
  }
}

function loadPeople(): PersonRecord[] {
  const file = path.join(process.cwd(), "data", "imports", "founders-inc-spc.json");
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { people: PersonRecord[] };
  return parsed.people;
}

function aliasesOf(json: string | null): string[] {
  try {
    const parsed = JSON.parse(json || "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function linkedinAlias(url: string | null): string | null {
  if (!url || !linkedinPersonSlug(url)) return null;
  return `linkedin:${url}`;
}

function ensureSource(db: Database.Database, program: FoundersProgram, retrievedAt: string) {
  const spec = PROGRAMS[program];
  const dimensions = JSON.stringify({
    campusPurity: "low",
    earliness: "medium",
    buildEvidence: "medium",
    selectivity: "medium",
    novelty: "medium",
    identityQuality: "high",
    extractability: "medium",
  });
  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at, last_success_at, founder_scout_tier, startup_scout_tier, quality_dimensions_json, source_role, tier_rationale)
     VALUES (?, ?, 'accelerator', ?, '[]', 1, 'manual', 'available', ?, ?, 'A', 'A', ?, 'discovery', ?)
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name,
       url=excluded.url,
       status='available',
       last_attempt_at=excluded.last_attempt_at,
       last_success_at=excluded.last_success_at`
  ).run(spec.sourceId, spec.sourceName, spec.sourceUrl, retrievedAt, retrievedAt, dimensions, spec.rationale);
  db.prepare(
    `UPDATE sources SET founder_scout_tier='A', startup_scout_tier='A', quality_dimensions_json=?, source_role='discovery', tier_rationale=?
     WHERE id=? AND tier_override_by IS NULL`
  ).run(dimensions, spec.rationale, spec.sourceId);
}

function ensureProgramProject(db: Database.Database, program: FoundersProgram) {
  const spec = PROGRAMS[program];
  const existing = db.prepare(`SELECT id FROM projects WHERE id=?`).get(spec.projectId) as { id: string } | undefined;
  if (existing) return;
  db.prepare(
    `INSERT INTO projects (id, name, aliases_json, kind, description, website_url, is_portfolio_reference, is_investable_candidate)
     VALUES (?, ?, '[]', 'project', ?, ?, 0, 0)`
  ).run(spec.projectId, spec.projectName, spec.rationale, spec.sourceUrl);
}

function upsertClaim(
  db: Database.Database,
  entityType: "person" | "project",
  entityId: string,
  claimType: string,
  excerpt: string,
  sourceId: string,
  sourceUrl: string,
  value: unknown,
  retrievedAt: string
): string {
  const existing = db
    .prepare(`SELECT id FROM claims WHERE entity_type=? AND entity_id=? AND source_url=? AND claim_type=? LIMIT 1`)
    .get(entityType, entityId, sourceUrl, claimType) as { id: string } | undefined;
  const text = excerpt.slice(0, 1400);
  if (existing) {
    db.prepare(`UPDATE claims SET excerpt=?, value_json=?, source_id=?, retrieved_at=? WHERE id=?`).run(
      text,
      JSON.stringify(value),
      sourceId,
      retrievedAt,
      existing.id
    );
    return existing.id;
  }
  const id = newId("claim");
  db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, source_url, retrieved_at, label, verification_state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'observed_fact', 'unverified')`
  ).run(id, entityType, entityId, claimType, JSON.stringify(value), text, sourceId, sourceUrl, retrievedAt);
  return id;
}

function personSlugs(db: Database.Database, personId: string): string[] {
  const row = db.prepare(`SELECT aliases_json FROM people WHERE id=?`).get(personId) as { aliases_json: string };
  return aliasesOf(row.aliases_json)
    .map((alias) => (alias.startsWith("linkedin:") ? linkedinPersonSlug(alias.slice("linkedin:".length)) : null))
    .filter((slug): slug is string => Boolean(slug));
}

function personCampuses(db: Database.Database, personId: string): string[] {
  return (db.prepare(`SELECT university_id FROM affiliations WHERE person_id=?`).all(personId) as { university_id: string }[]).map(
    (row) => row.university_id
  );
}

function personCompanyNorms(db: Database.Database, personId: string): Set<string> {
  const rows = db
    .prepare(
      `SELECT p.name FROM person_project_roles r JOIN projects p ON p.id = r.project_id
       WHERE r.person_id=? AND p.kind='company'`
    )
    .all(personId) as { name: string }[];
  return new Set(rows.map((row) => normalizeCompanyName(row.name)));
}

function samePerson(db: Database.Database, personId: string, record: PersonRecord, companyNorm: string | null): boolean {
  const incomingSlug = record.linkedin ? linkedinPersonSlug(record.linkedin) : null;
  const slugs = personSlugs(db, personId);
  if (incomingSlug && slugs.length && slugs.includes(incomingSlug)) return true;
  if (incomingSlug && slugs.length && !slugs.includes(incomingSlug)) return false;
  const campuses = personCampuses(db, personId);
  const wanted = [record.universityId, ...record.extraUniversityIds].filter((id): id is string => Boolean(id));
  if (companyNorm && personCompanyNorms(db, personId).has(companyNorm)) return true;
  if (wanted.some((id) => campuses.includes(id))) return true;
  if (campuses.length === 0 && personCompanyNorms(db, personId).size === 0) return true;
  return false;
}

function findPerson(db: Database.Database, record: PersonRecord): string | null | "ambiguous" {
  const claimed = db
    .prepare(
      `SELECT p.id FROM people p
       JOIN claims c ON c.entity_id = p.id AND c.entity_type = 'person' AND c.claim_type = 'program_membership' AND c.source_url = ?
       WHERE lower(p.name) = lower(?)`
    )
    .all(record.sourceUrl, record.name) as { id: string }[];
  if (claimed.length === 1) return claimed[0].id;
  if (claimed.length > 1) return "ambiguous";

  const wanted = normalizePersonName(record.name);
  const matches = (db.prepare(`SELECT id, name FROM people`).all() as { id: string; name: string }[]).filter(
    (row) => normalizePersonName(row.name) === wanted
  );
  if (matches.length === 0) return null;
  const companyNorm = record.company ? normalizeCompanyName(record.company.name) : null;
  const compatible = matches.filter((row) => samePerson(db, row.id, record, companyNorm));
  if (compatible.length === 1) return compatible[0].id;
  if (compatible.length > 1) return "ambiguous";
  return null;
}

function addLinkedin(db: Database.Database, personId: string, url: string | null) {
  const alias = linkedinAlias(url);
  if (!alias) return;
  const slug = linkedinPersonSlug(url);
  const row = db.prepare(`SELECT aliases_json FROM people WHERE id=?`).get(personId) as { aliases_json: string };
  const aliases = aliasesOf(row.aliases_json);
  if (aliases.some((item) => item.startsWith("linkedin:") && linkedinPersonSlug(item.slice("linkedin:".length)) === slug)) return;
  aliases.push(alias);
  db.prepare(`UPDATE people SET aliases_json=? WHERE id=?`).run(JSON.stringify(aliases), personId);
}

function applyEnrollment(db: Database.Database, personId: string, record: PersonRecord, sourceId: string, created: boolean) {
  const evidence = (record.educationExcerpt || record.excerpt).slice(0, 1400);
  const sourceUrl = record.educationUrl || record.sourceUrl;
  if (created) {
    db.prepare(
      `UPDATE people SET enrollment_status=?, enrollment_evidence=?, enrollment_source_url=?, enrollment_source_id=?,
         enrollment_grad_year=?, enrollment_basis=?, left_school=?, founder_status=?, potential_signal=?
       WHERE id=?`
    ).run(
      record.enrollmentStatus,
      evidence,
      sourceUrl,
      sourceId,
      record.gradYear,
      record.enrollmentBasis,
      record.leftSchool ? 1 : 0,
      record.founderStatus,
      record.founderStatus === "potential" ? record.excerpt.slice(0, 400) : null,
      personId
    );
    return;
  }
  const existing = db
    .prepare(
      `SELECT enrollment_status, enrollment_basis, enrollment_grad_year, founder_status, potential_signal, left_school
       FROM people WHERE id=?`
    )
    .get(personId) as {
    enrollment_status: string | null;
    enrollment_basis: string | null;
    enrollment_grad_year: number | null;
    founder_status: string | null;
    potential_signal: string | null;
    left_school: number;
  };
  const missing = !existing.enrollment_status || existing.enrollment_status === "unknown";
  const upgrade = record.enrollmentBasis === "verified" && existing.enrollment_basis !== "verified";
  if (missing || upgrade) {
    db.prepare(
      `UPDATE people SET enrollment_status=?, enrollment_evidence=?, enrollment_source_url=?, enrollment_source_id=?,
         enrollment_grad_year=?, enrollment_basis=? WHERE id=?`
    ).run(record.enrollmentStatus, evidence, sourceUrl, sourceId, record.gradYear, record.enrollmentBasis, personId);
  }
  if (record.leftSchool && existing.left_school !== 1) db.prepare(`UPDATE people SET left_school=1 WHERE id=?`).run(personId);
  if (!existing.founder_status) {
    db.prepare(`UPDATE people SET founder_status=?, potential_signal=? WHERE id=?`).run(
      record.founderStatus,
      record.founderStatus === "potential" ? record.excerpt.slice(0, 400) : null,
      personId
    );
  } else if (existing.founder_status !== "founder" && record.founderStatus === "founder") {
    db.prepare(`UPDATE people SET founder_status='founder' WHERE id=?`).run(personId);
  } else if (existing.founder_status === "potential" && !existing.potential_signal && record.founderStatus === "potential") {
    db.prepare(`UPDATE people SET potential_signal=? WHERE id=?`).run(record.excerpt.slice(0, 400), personId);
  }
}

function ensureAffiliation(db: Database.Database, personId: string, universityId: string, role: string, status: string, claimId: string) {
  const existing = db.prepare(`SELECT id FROM affiliations WHERE person_id=? AND university_id=? AND role=?`).get(personId, universityId, role);
  if (existing) return;
  db.prepare(`INSERT INTO affiliations (id, person_id, university_id, role, status, claim_id) VALUES (?, ?, ?, ?, ?, ?)`).run(
    newId("aff"),
    personId,
    universityId,
    role,
    status,
    claimId
  );
}

function ensureRole(db: Database.Database, personId: string, projectId: string, role: string, claimId: string) {
  if (role === "founder") {
    const founder = db
      .prepare(`SELECT id FROM person_project_roles WHERE person_id=? AND project_id=? AND lower(role) LIKE '%founder%'`)
      .get(personId, projectId);
    if (founder) return;
  } else {
    const existing = db.prepare(`SELECT id FROM person_project_roles WHERE person_id=? AND project_id=? AND role=?`).get(personId, projectId, role);
    if (existing) return;
  }
  db.prepare(`INSERT INTO person_project_roles (id, person_id, project_id, role, claim_id) VALUES (?, ?, ?, ?, ?)`).run(
    newId("ppr"),
    personId,
    projectId,
    role,
    claimId
  );
}

function ensureSignal(
  db: Database.Database,
  personId: string,
  record: PersonRecord,
  claimId: string
) {
  const existing = db
    .prepare(
      `SELECT id FROM program_signals
       WHERE person_id=? AND signal_type=? AND IFNULL(year, 0)=IFNULL(?, 0) AND source_url=?`
    )
    .get(personId, record.program, record.year, record.sourceUrl) as { id: string } | undefined;
  if (existing) {
    db.prepare(`UPDATE program_signals SET label=?, match_status=?, excerpt=?, claim_id=? WHERE id=?`).run(
      record.label,
      record.matchStatus,
      record.excerpt.slice(0, 1400),
      claimId,
      existing.id
    );
    return;
  }
  db.prepare(
    `INSERT INTO program_signals (id, person_id, signal_type, label, year, match_status, source_url, excerpt, claim_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(newId("psig"), personId, record.program, record.label, record.year, record.matchStatus, record.sourceUrl, record.excerpt.slice(0, 1400), claimId);
}

function loadCompanies(db: Database.Database): CompanyRow[] {
  return db.prepare(`SELECT id, name, website_url, description FROM projects WHERE kind='company'`).all() as CompanyRow[];
}

function membersNamed(db: Database.Database, projectId: string): Set<string> {
  const rows = db
    .prepare(`SELECT pe.name FROM person_project_roles r JOIN people pe ON pe.id = r.person_id WHERE r.project_id=?`)
    .all(projectId) as { name: string }[];
  return new Set(rows.map((row) => normalizePersonName(row.name)));
}

function findCompany(
  db: Database.Database,
  companies: CompanyRow[],
  record: PersonRecord,
  peers: Set<string>
): CompanyRow | "ambiguous" | null {
  const company = record.company;
  if (!company) return null;
  const norm = normalizeCompanyName(company.name);
  const host = hostOf(company.website);
  const byHost = host ? companies.filter((row) => hostOf(row.website_url) === host) : [];
  if (byHost.length === 1) return byHost[0];
  if (byHost.length > 1) return "ambiguous";
  const byName = companies.filter((row) => normalizeCompanyName(row.name) === norm);
  if (byName.length === 1) {
    const existingHost = hostOf(byName[0].website_url);
    if (host && existingHost && host !== existingHost) {
      const members = membersNamed(db, byName[0].id);
      if ([...peers].some((name) => members.has(name))) return byName[0];
      return null;
    }
    return byName[0];
  }
  if (byName.length > 1) {
    const onPerson = byName.filter((row) => membersNamed(db, row.id).has(normalizePersonName(record.name)));
    if (onPerson.length === 1) return onPerson[0];
    return "ambiguous";
  }
  return null;
}

function ensureDescriptionFact(db: Database.Database, projectId: string, description: string, sourceUrl: string, retrievedAt: string) {
  const existing = db.prepare(`SELECT id FROM company_facts WHERE project_id=? AND fact_key='description' LIMIT 1`).get(projectId);
  if (existing) return;
  const text = description.slice(0, 1400);
  db.prepare(
    `INSERT INTO company_facts (id, project_id, fact_key, value_text, amount_usd, amount_status, detail_json, source_url, excerpt, origin, created_at)
     VALUES (?, ?, 'description', ?, NULL, NULL, '{}', ?, ?, 'program_page', ?)`
  ).run(newId("fact"), projectId, text, sourceUrl, text, retrievedAt);
}

function ensureCompany(
  db: Database.Database,
  companies: CompanyRow[],
  record: PersonRecord,
  peers: Set<string>,
  sourceId: string,
  retrievedAt: string
): { id: string; created: boolean } | "ambiguous" | null {
  const company = record.company;
  if (!company) return null;
  const found = findCompany(db, companies, record, peers);
  if (found === "ambiguous") return "ambiguous";
  if (found) {
    if (!found.website_url && company.website) {
      db.prepare(`UPDATE projects SET website_url=?, updated_at=? WHERE id=?`).run(company.website, retrievedAt, found.id);
      found.website_url = company.website;
    }
    if (!found.description && company.description) {
      db.prepare(`UPDATE projects SET description=?, updated_at=? WHERE id=?`).run(company.description.slice(0, 2000), retrievedAt, found.id);
      found.description = company.description;
    }
    if (company.description) ensureDescriptionFact(db, found.id, company.description, record.sourceUrl, retrievedAt);
    return { id: found.id, created: false };
  }
  const id = newId("proj");
  const website = company.website;
  db.prepare(
    `INSERT INTO projects (id, name, aliases_json, kind, description, website_url, primary_link, primary_link_kind, is_portfolio_reference, is_investable_candidate)
     VALUES (?, ?, '[]', 'company', ?, ?, ?, ?, 0, ?)`
  ).run(
    id,
    company.name,
    company.description ? company.description.slice(0, 2000) : null,
    website,
    website ? null : record.sourceUrl,
    website ? null : "directory",
    company.investable ? 1 : 0
  );
  const row: CompanyRow = { id, name: company.name, website_url: website, description: company.description };
  companies.push(row);
  if (company.description) ensureDescriptionFact(db, id, company.description, record.sourceUrl, retrievedAt);
  if (company.founded && `${record.excerpt} ${company.description ?? ""}`.includes(String(company.founded))) {
    db.prepare(
      `INSERT INTO company_facts (id, project_id, fact_key, value_text, amount_usd, amount_status, detail_json, source_url, excerpt, origin, created_at)
       VALUES (?, ?, 'founded_year', ?, NULL, NULL, '{}', ?, ?, 'program_page', ?)`
    ).run(newId("fact"), id, String(company.founded), record.sourceUrl, record.excerpt.slice(0, 400), retrievedAt);
  }
  upsertClaim(db, "project", id, "program_membership", record.excerpt, sourceId, record.sourceUrl, { org: PROGRAMS[record.program].projectName, company: company.name }, retrievedAt);
  return { id, created: true };
}

function ensurePartOfProgram(db: Database.Database, companyId: string, programProjectId: string, claimId: string) {
  const existing = db
    .prepare(
      `SELECT id FROM relationships
       WHERE source_entity_type='project' AND source_entity_id=? AND target_entity_type='project' AND target_entity_id=? AND relationship_type='part_of_program'`
    )
    .get(companyId, programProjectId);
  if (existing) return;
  db.prepare(
    `INSERT INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json, verification_state)
     VALUES (?, 'project', ?, 'project', ?, 'part_of_program', ?, 'affiliation_only')`
  ).run(newId("rel"), companyId, programProjectId, JSON.stringify([claimId]));
}

function ensureCampusLink(db: Database.Database, program: FoundersProgram, universityId: string, excerpt: string, sourceUrl: string, retrievedAt: string) {
  const spec = PROGRAMS[program];
  const existing = db
    .prepare(
      `SELECT id FROM relationships
       WHERE source_entity_type='project' AND source_entity_id=? AND target_entity_type='university' AND target_entity_id=? AND relationship_type='affiliated_with'`
    )
    .get(spec.projectId, universityId);
  if (existing) return;
  const prior = db
    .prepare(`SELECT id, value_json FROM claims WHERE entity_type='project' AND entity_id=? AND claim_type='campus_affiliation'`)
    .all(spec.projectId) as { id: string; value_json: string }[];
  let claimId = prior.find((row) => {
    try {
      return (JSON.parse(row.value_json) as { universityId?: string }).universityId === universityId;
    } catch {
      return false;
    }
  })?.id;
  if (!claimId) {
    claimId = newId("claim");
    db.prepare(
      `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, source_url, retrieved_at, label, verification_state)
       VALUES (?, 'project', ?, 'campus_affiliation', ?, ?, ?, ?, ?, 'observed_fact', 'unverified')`
    ).run(claimId, spec.projectId, JSON.stringify({ universityId }), excerpt.slice(0, 1400), spec.sourceId, sourceUrl, retrievedAt);
  }
  db.prepare(
    `INSERT INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json, verification_state)
     VALUES (?, 'project', ?, 'university', ?, 'affiliated_with', ?, 'affiliation_only')`
  ).run(newId("rel"), spec.projectId, universityId, JSON.stringify([claimId]));
}

function main() {
  const people = loadPeople();
  for (const person of people) {
    if (!isFoundersProgram(person.program)) throw new Error(`Bad program for ${person.name}`);
    if (!isProgramMatchStatus(person.matchStatus)) throw new Error(`Bad match status for ${person.name}`);
    if (!person.sourceUrl.startsWith("http") || person.excerpt.trim().length < 20) throw new Error(`Missing source for ${person.name}`);
    if (!person.keepWithoutCampus && !person.universityId) throw new Error(`No campus for ${person.name}`);
  }
  const peersByCompany = new Map<string, Set<string>>();
  for (const person of people) {
    if (!person.company) continue;
    const key = normalizeCompanyName(person.company.name);
    const set = peersByCompany.get(key) ?? new Set<string>();
    set.add(normalizePersonName(person.name));
    peersByCompany.set(key, set);
  }

  const retrievedAt = nowIso();
  const db = getDb();
  const counts = {
    founders_inc: blank(),
    south_park_commons: blank(),
  };
  const campusLinks = new Map<FoundersProgram, Map<string, { excerpt: string; sourceUrl: string }>>();

  const tx = db.transaction(() => {
    for (const program of ["founders_inc", "south_park_commons"] as const) {
      ensureSource(db, program, retrievedAt);
      ensureProgramProject(db, program);
    }
    const companies = loadCompanies(db);
    for (const record of people) {
      const bucket = counts[record.program];
      const spec = PROGRAMS[record.program];
      if (record.universityId && !db.prepare(`SELECT 1 FROM universities WHERE id=?`).get(record.universityId)) {
        throw new Error(`Missing university ${record.universityId} for ${record.name}`);
      }
      const found = findPerson(db, record);
      if (found === "ambiguous") {
        bucket.skipped.push(`${record.name}: ambiguous name`);
        continue;
      }
      let personId = found;
      let created = false;
      if (!personId) {
        personId = newId("person");
        db.prepare(`INSERT INTO people (id, name, aliases_json) VALUES (?, ?, '[]')`).run(personId, record.name);
        created = true;
        bucket.peopleAdded += 1;
      } else {
        bucket.peopleLinked += 1;
      }
      addLinkedin(db, personId, record.linkedin);
      applyEnrollment(db, personId, record, spec.sourceId, created);
      const claimId = upsertClaim(
        db,
        "person",
        personId,
        "program_membership",
        record.excerpt,
        spec.sourceId,
        record.sourceUrl,
        { org: spec.projectName, cohort: record.cohort, campus: record.universityId, matchStatus: record.matchStatus },
        retrievedAt
      );
      if (record.educationUrl && record.educationExcerpt && record.educationUrl !== record.sourceUrl) {
        upsertClaim(db, "person", personId, "education", record.educationExcerpt, spec.sourceId, record.educationUrl, { campus: record.universityId }, retrievedAt);
      }
      const campuses = [record.universityId, ...record.extraUniversityIds].filter((id): id is string => Boolean(id));
      for (const campus of campuses) ensureAffiliation(db, personId, campus, record.role, record.enrollmentStatus, claimId);
      ensureRole(db, personId, spec.projectId, "member", claimId);
      ensureSignal(db, personId, record, claimId);
      bucket[record.matchStatus] += 1;
      const campusKey = record.universityId ?? "(no campus)";
      const campusBucket = bucket.byCampus[campusKey] ?? { added: 0, linked: 0 };
      if (created) campusBucket.added += 1;
      else campusBucket.linked += 1;
      bucket.byCampus[campusKey] = campusBucket;
      if (record.universityId) {
        const links = campusLinks.get(record.program) ?? new Map();
        if (!links.has(record.universityId)) links.set(record.universityId, { excerpt: record.educationExcerpt || record.excerpt, sourceUrl: record.educationUrl || record.sourceUrl });
        campusLinks.set(record.program, links);
      }

      const peers = record.company ? (peersByCompany.get(normalizeCompanyName(record.company.name)) ?? new Set<string>()) : new Set<string>();
      const company = ensureCompany(db, companies, record, peers, spec.sourceId, retrievedAt);
      if (company === "ambiguous") {
        bucket.skipped.push(`${record.name}: ambiguous company ${record.company?.name}`);
        continue;
      }
      if (!company) continue;
      if (company.created) bucket.startupsAdded.add(company.id);
      else bucket.startupsLinked.add(company.id);
      const companyClaim = upsertClaim(
        db,
        "project",
        company.id,
        "program_membership",
        record.excerpt,
        spec.sourceId,
        record.sourceUrl,
        { org: spec.projectName, company: record.company?.name },
        retrievedAt
      );
      if (record.companyRole) ensureRole(db, personId, company.id, record.companyRole, companyClaim);
      ensurePartOfProgram(db, company.id, spec.projectId, companyClaim);
    }
    for (const [program, links] of campusLinks) {
      for (const [universityId, evidence] of links) ensureCampusLink(db, program, universityId, evidence.excerpt, evidence.sourceUrl, retrievedAt);
    }
  });
  tx();
  db.pragma("wal_checkpoint(TRUNCATE)");

  const report = {
    founders_inc: finish(counts.founders_inc),
    south_park_commons: finish(counts.south_park_commons),
  };
  console.log(JSON.stringify(report, null, 2));
}

function blank() {
  return {
    peopleAdded: 0,
    peopleLinked: 0,
    confirmed: 0,
    likely: 0,
    startupsAdded: new Set<string>(),
    startupsLinked: new Set<string>(),
    byCampus: {} as Record<string, { added: number; linked: number }>,
    skipped: [] as string[],
  };
}

function finish(bucket: ReturnType<typeof blank>) {
  const linkedOnly = [...bucket.startupsLinked].filter((id) => !bucket.startupsAdded.has(id));
  return {
    peopleAdded: bucket.peopleAdded,
    peopleLinked: bucket.peopleLinked,
    confirmed: bucket.confirmed,
    likely: bucket.likely,
    startupsAdded: bucket.startupsAdded.size,
    startupsLinked: linkedOnly.length,
    byCampus: bucket.byCampus,
    skipped: bucket.skipped,
  };
}

main();
