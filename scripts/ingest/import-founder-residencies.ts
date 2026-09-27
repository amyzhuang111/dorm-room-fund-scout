// Idempotent import of public founder-residency, fellowship, and founder-house hubs.
// Reads data/imports/founder-residencies.json and data/imports/founder-houses.json.
// A person is in those files only when a public page names them. A campus is
// set only when that page names a school already in the campus list. Current
// students and recent graduates at a school outside that list are kept with
// keepWithoutCampus.
//
// Hubs with no importable roster are still created. For residencies those are
// The Residency, 1517 Medici, Buildspace, Afore FIR U, and Pioneer. For houses
// those are AGI House, HF0, and Frontier Tower.
//
// Not written, on purpose:
// - Team-level school lists ("they come from Stanford, Princeton, Berkeley").
// - A city used as a place (Berkeley, Toronto, Chicago, Cambridge) when the
//   line does not name the university.
// - Job titles (professor, faculty, postdoc, lecturer) used as enrollment.
// - A school named only as somewhere to visit or work.
// - Third-party compiled rosters.
//
// Re-running updates claims and badges in place. It does not replace an
// existing enrollment status with a different one. It does not merge two
// people who share a name but not a campus, company, or LinkedIn profile.
//
// Run: npx tsx scripts/ingest/import-founder-residencies.ts

import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { getDb, newId, nowIso } from "../../lib/db/client";
import { linkedinPersonSlug, normalizeCompanyName, normalizePersonName } from "../../lib/domain/dedupe";
import { isProgramMatchStatus, PROGRAM_DIRECTORY, programTierLine } from "../../lib/domain/program-signals";
import { membershipTierFields, writePersonDirectoryTier, writeProjectDirectoryTier, writeSourceDirectoryTier } from "./program-directory";

const RESIDENCY_PROGRAMS = [
  "the_residency",
  "z_fellows",
  "emergent_ventures",
  "medici_1517",
  "contrary_venture_partners",
  "buildspace",
  "afore_fir_u",
  "pioneer",
  "kleiner_perkins_fellows",
  "agi_house",
  "hf0",
  "frontier_tower",
  "yale_hacker_house",
  "farmhouse",
  "gatech_hacker_house",
  "rice_residency",
  "foundher_house",
  "playa_house",
  "harvard_st_commons",
] as const;
type ResidencyProgram = (typeof RESIDENCY_PROGRAMS)[number];

function isResidencyProgram(value: string): value is ResidencyProgram {
  return (RESIDENCY_PROGRAMS as readonly string[]).includes(value);
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
  program: ResidencyProgram;
  matchStatus: "confirmed" | "likely";
  label: string;
  year: number | null;
  cohort: string | null;
  role: string;
  universityId: string | null;
  extraUniversityIds: string[];
  enrollmentStatus: "current_student" | "recent_grad" | "older_alumni" | null;
  enrollmentBasis: "verified" | "inferred" | null;
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

interface ProgramSpec {
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  projectId: string;
  projectName: string;
  rationale: string;
  // False skips renaming an existing source. The directory tier is still written.
  updateExistingSource: boolean;
}

const PROGRAMS: Record<ResidencyProgram, ProgramSpec> = {
  the_residency: {
    sourceId: "src_the_residency",
    sourceName: "The Residency",
    sourceUrl: "https://www.livetheresidency.com/residencies",
    projectId: "proj_the_residency",
    projectName: "The Residency",
    updateExistingSource: true,
    rationale:
      "Live-in houses for builders. The residencies page lists the Inventors Residency of San Francisco (12 weeks), sf2 (a hardware hacker house), Odyssey, and Arcadia in Berkeley (14 bedrooms, a former YC office), plus houses in Vancouver, Bangalore, Berlin, Vienna, and Hyderabad. The page does not name residents.",
  },
  z_fellows: {
    sourceId: "src_z_fellows",
    sourceName: "Z Fellows",
    sourceUrl: "https://www.zfellows.com/",
    projectId: "proj_z_fellows",
    projectName: "Z Fellows",
    updateExistingSource: true,
    rationale:
      "One week and $10,000 for technical builders. The public alumni section names people and companies and does not name schools. A badge is stored only when that person's own public page says they are a Z Fellow and names a school.",
  },
  emergent_ventures: {
    sourceId: "src_emergent_ventures",
    sourceName: "Emergent Ventures",
    sourceUrl: "https://marginalrevolution.com/marginalrevolution/2018/09/emergent-ventures-new-project-help-foment-enlightenment.html",
    projectId: "proj_emergent_ventures",
    projectName: "Emergent Ventures",
    updateExistingSource: true,
    rationale:
      "Tyler Cowen's grant program. Winners are posted on Marginal Revolution, cohorts 36 through 59 (August 2024 through September 2026). A winner line names a person, a place, and a project. Many recipients are researchers rather than founders.",
  },
  medici_1517: {
    sourceId: "src_1517_medici",
    sourceName: "1517 Medici Project",
    sourceUrl: "https://www.1517fund.com/medici",
    projectId: "proj_1517_medici",
    projectName: "1517 Medici Project",
    updateExistingSource: true,
    rationale:
      "No-strings grants of at least $1,000 for high school students, college students, and dropouts. 1517 says the grants ran in stealth for almost a decade and that it cannot issue grants to teams outside North America. The page does not list recipients with schools.",
  },
  contrary_venture_partners: {
    sourceId: "src_contrary_venture_partners",
    sourceName: "Contrary student venture partners",
    sourceUrl: "https://contrary.com/blog/class-of-2026",
    projectId: "proj_contrary_venture_partners",
    projectName: "Contrary Venture Partners",
    updateExistingSource: false,
    rationale:
      "Contrary's Class of 2026 venture partners: nearly 1,500 applications and 20 accepted, announced 6 Nov 2025. Each bio names a school and a standing. This is a scout class, not a research fellowship. Source tiers stay D: membership is not evidence they founded a company. The hotspot stays B.",
  },
  buildspace: {
    sourceId: "src_buildspace",
    sourceName: "Buildspace",
    sourceUrl: "https://buildspace.so/",
    projectId: "proj_buildspace",
    projectName: "Buildspace",
    updateExistingSource: true,
    rationale:
      "Archived. The homepage says this was buildspace, a school for people who wanted to work on their own ideas. The shutdown letter says the founder decided to fully shut it down, and names nights & weekends as part of what the company had. No participant roster is published.",
  },
  afore_fir_u: {
    sourceId: "src_afore_fir_u",
    sourceName: "Afore FIR U",
    sourceUrl: "https://www.afore.vc/students",
    projectId: "proj_afore_fir_u",
    projectName: "Afore FIR U",
    updateExistingSource: true,
    rationale:
      "Afore's two-month San Francisco program for students, dropouts, and recent graduates. The students page says Afore invests $20k–$100k+ and gives office space, and that applications are open for 2026. It does not pair each person with a school.",
  },
  pioneer: {
    sourceId: "src_pioneer",
    sourceName: "Pioneer",
    sourceUrl: "https://pioneer.app/",
    projectId: "proj_pioneer",
    projectName: "Pioneer",
    updateExistingSource: true,
    rationale:
      "Accelerator founded in 2018 by Rishi Narang and Daniel Gross. The site says it funded 150+ companies and stopped making new investments in 2024. Testimonials name founders and companies and do not name schools.",
  },
  kleiner_perkins_fellows: {
    sourceId: "src_kleiner_perkins_fellows",
    sourceName: "Kleiner Perkins Fellows",
    sourceUrl: "https://jobs.ashbyhq.com/kleinerperkinsfellows",
    projectId: "proj_kleiner_perkins_fellows",
    projectName: "Kleiner Perkins Fellows",
    updateExistingSource: true,
    rationale:
      "Small paid summer fellowship placed in Kleiner Perkins portfolio companies. The public jobs page does not name the current class. A badge is stored only when a public page names that person as a fellow and names a school.",
  },
  agi_house: {
    sourceId: "src_agi_house",
    sourceName: "AGI House",
    sourceUrl: "https://agihouse.ai/",
    projectId: "proj_agi_house",
    projectName: "AGI House",
    updateExistingSource: true,
    rationale:
      "San Francisco AI hacker house. The homepage photo caption names roommates and companies and does not name schools. A badge is stored only when a public page names the person and a school.",
  },
  hf0: {
    sourceId: "src_hf0",
    sourceName: "HF0",
    sourceUrl: "https://www.hf0.com/",
    projectId: "proj_hf0",
    projectName: "HF0",
    updateExistingSource: true,
    rationale:
      "Residency for repeat founders. The site says it backs 10 teams at a time. The team page names staff and does not name resident founders or schools.",
  },
  frontier_tower: {
    sourceId: "src_frontier_tower",
    sourceName: "Frontier Tower",
    sourceUrl: "https://frontiertower.io/",
    projectId: "proj_frontier_tower",
    projectName: "Frontier Tower",
    updateExistingSource: true,
    rationale:
      "16-floor vertical village at 995 Market Street, San Francisco. Public quotes on the site use first initials only.",
  },
  yale_hacker_house: {
    sourceId: "src_yale_hacker_house",
    sourceName: "Yale Hacker House",
    sourceUrl: "https://www.yalehackerhouse.com/",
    projectId: "proj_yale_hacker_house",
    projectName: "Yale Hacker House",
    updateExistingSource: true,
    rationale:
      "Yale's founder residency in San Francisco. The site publishes a first cohort and says each person is a Yale student.",
  },
  farmhouse: {
    sourceId: "src_farmhouse",
    sourceName: "Farmhouse",
    sourceUrl: "https://www.thefarm.haus/",
    projectId: "proj_farmhouse",
    projectName: "Farmhouse",
    updateExistingSource: true,
    rationale:
      "Stanford hacker house. The site lists eight builders for summer 2026 and a Stanford major for each. It does not print a class year.",
  },
  gatech_hacker_house: {
    sourceId: "src_gatech_hacker_house",
    sourceName: "Georgia Tech Hacker House",
    sourceUrl: "https://news.gatech.edu/news/2025/04/11/computing-student-launches-first-ever-hacker-house-campus",
    projectId: "proj_gatech_hacker_house",
    projectName: "Georgia Tech Hacker House",
    updateExistingSource: true,
    rationale:
      "Nine-month live-in program at 160 6th St NW, 10 rooms and 20 spots, August 10 2025 through May 10 2026. Georgia Tech's news center says nearly 180 students applied. The story names the founder and does not name the other residents.",
  },
  rice_residency: {
    sourceId: "src_rice_residency",
    sourceName: "Rice Residency",
    sourceUrl: "https://www.riceresidency.com/",
    projectId: "proj_rice_residency",
    projectName: "Rice Residency",
    updateExistingSource: true,
    rationale:
      "Student hacker house at Rice. The Rice Thresher (19 Nov 2025) says applications for the first cohort were opening and names two Will Rice juniors.",
  },
  foundher_house: {
    sourceId: "src_foundher_house",
    sourceName: "FoundHer House",
    sourceUrl: "https://www.foundherhouse.org/",
    projectId: "proj_foundher_house",
    projectName: "FoundHer House",
    updateExistingSource: true,
    rationale:
      "All-women hacker house in San Francisco. KTVU (2 Sep 2025) names the two USC student founders. The article says other residents represented Cornell and Stanford and that one dropout was from Penn, and it does not say which person.",
  },
  playa_house: {
    sourceId: "src_playa_house",
    sourceName: "Playa House",
    sourceUrl: "https://liveplayahouse.com/",
    projectId: "proj_playa_house",
    projectName: "Playa House",
    updateExistingSource: true,
    rationale:
      "Student-run founder house in Isla Vista. UCSB Engineering (30 Jul 2026) says ten residents joined in fall 2025 and names four of them. UC Santa Barbara is not in the campus list, so those four are stored without a campus.",
  },
  harvard_st_commons: {
    sourceId: "src_harvard_st_commons",
    sourceName: "Harvard St. Commons",
    sourceUrl: "https://harvardst.co/",
    projectId: "proj_harvard_st_commons",
    projectName: "Harvard St. Commons",
    updateExistingSource: true,
    rationale:
      "Founder house in Cambridge. The site names the house leads and a school for two of them. It does not publish the full resident roster.",
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
  const files = ["data/imports/founder-residencies.json", "data/imports/founder-houses.json"];
  return files.flatMap((file) => {
    const parsed = JSON.parse(fs.readFileSync(path.join(process.cwd(), file), "utf8")) as { people: PersonRecord[] };
    return parsed.people;
  });
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

function ensureSource(db: Database.Database, program: ResidencyProgram, retrievedAt: string) {
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
  const existing = db.prepare(`SELECT id FROM sources WHERE id=?`).get(spec.sourceId) as { id: string } | undefined;
  if (!existing) {
    db.prepare(
      `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at, last_success_at, founder_scout_tier, startup_scout_tier, quality_dimensions_json, source_role, tier_rationale)
       VALUES (?, ?, 'accelerator', ?, '[]', 1, 'manual', 'available', ?, ?, ?, ?, ?, 'discovery', ?)`
    ).run(
      spec.sourceId,
      spec.sourceName,
      spec.sourceUrl,
      retrievedAt,
      retrievedAt,
      PROGRAM_DIRECTORY[program].tier,
      PROGRAM_DIRECTORY[program].tier,
      dimensions,
      programTierLine(PROGRAM_DIRECTORY[program])
    );
    return;
  }
  db.prepare(`UPDATE sources SET status='available', last_attempt_at=?, last_success_at=? WHERE id=?`).run(retrievedAt, retrievedAt, spec.sourceId);
  writeSourceDirectoryTier(db, spec.sourceId, program);
  if (!spec.updateExistingSource) return;
  db.prepare(
    `UPDATE sources SET name=?, url=?, quality_dimensions_json=?, source_role='discovery'
     WHERE id=? AND tier_override_by IS NULL`
  ).run(spec.sourceName, spec.sourceUrl, dimensions, spec.sourceId);
}

function ensureProgramProject(db: Database.Database, program: ResidencyProgram) {
  const spec = PROGRAMS[program];
  const existing = db.prepare(`SELECT id FROM projects WHERE id=?`).get(spec.projectId) as { id: string } | undefined;
  if (!existing) {
    db.prepare(
      `INSERT INTO projects (id, name, aliases_json, kind, description, website_url, is_portfolio_reference, is_investable_candidate)
       VALUES (?, ?, '[]', 'project', ?, ?, 0, 0)`
    ).run(spec.projectId, spec.projectName, spec.rationale, spec.sourceUrl);
  }
  writeProjectDirectoryTier(db, spec.projectId, program);
  db.prepare(`UPDATE projects SET description=? WHERE id=?`).run(spec.rationale, spec.projectId);
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
  const org = value && typeof value === "object" && "org" in value ? (value as { org?: unknown }).org : null;
  const rows = db
    .prepare(`SELECT id, value_json FROM claims WHERE entity_type=? AND entity_id=? AND source_url=? AND claim_type=?`)
    .all(entityType, entityId, sourceUrl, claimType) as { id: string; value_json: string }[];
  const existing = rows.find((row) => {
    if (typeof org !== "string") return true;
    try {
      return (JSON.parse(row.value_json) as { org?: string }).org === org;
    } catch {
      return false;
    }
  });
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
  const claimedIds = [...new Set(claimed.map((row) => row.id))];
  if (claimedIds.length === 1) return claimedIds[0];
  if (claimedIds.length > 1) return "ambiguous";

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

function applyFounderStatus(db: Database.Database, personId: string, record: PersonRecord, existing: { founder_status: string | null; potential_signal: string | null } | null) {
  const signal = record.founderStatus === "potential" ? record.excerpt.slice(0, 400) : null;
  if (!existing || !existing.founder_status) {
    db.prepare(`UPDATE people SET founder_status=?, potential_signal=? WHERE id=?`).run(record.founderStatus, signal, personId);
    return;
  }
  if (existing.founder_status !== "founder" && record.founderStatus === "founder") {
    db.prepare(`UPDATE people SET founder_status='founder' WHERE id=?`).run(personId);
  } else if (existing.founder_status === "potential" && !existing.potential_signal && record.founderStatus === "potential") {
    db.prepare(`UPDATE people SET potential_signal=? WHERE id=?`).run(signal, personId);
  }
}

function applyEnrollment(db: Database.Database, personId: string, record: PersonRecord, sourceId: string, created: boolean) {
  const evidence = (record.educationExcerpt || record.excerpt).slice(0, 1400);
  const sourceUrl = record.educationUrl || record.sourceUrl;
  if (record.leftSchool) db.prepare(`UPDATE people SET left_school=1 WHERE id=? AND left_school IS NOT 1`).run(personId);
  if (created) {
    if (record.enrollmentStatus) {
      db.prepare(
        `UPDATE people SET enrollment_status=?, enrollment_evidence=?, enrollment_source_url=?, enrollment_source_id=?,
           enrollment_grad_year=?, enrollment_basis=?, founder_status=?, potential_signal=?
         WHERE id=?`
      ).run(
        record.enrollmentStatus,
        evidence,
        sourceUrl,
        sourceId,
        record.gradYear,
        record.enrollmentBasis,
        record.founderStatus,
        record.founderStatus === "potential" ? record.excerpt.slice(0, 400) : null,
        personId
      );
    } else {
      applyFounderStatus(db, personId, record, null);
    }
    return;
  }
  const existing = db
    .prepare(`SELECT enrollment_status, enrollment_basis, founder_status, potential_signal FROM people WHERE id=?`)
    .get(personId) as {
    enrollment_status: string | null;
    enrollment_basis: string | null;
    founder_status: string | null;
    potential_signal: string | null;
  };
  const missing = !existing.enrollment_status || existing.enrollment_status === "unknown";
  if (record.enrollmentStatus && missing) {
    db.prepare(
      `UPDATE people SET enrollment_status=?, enrollment_evidence=?, enrollment_source_url=?, enrollment_source_id=?,
         enrollment_grad_year=?, enrollment_basis=? WHERE id=?`
    ).run(record.enrollmentStatus, evidence, sourceUrl, sourceId, record.gradYear, record.enrollmentBasis, personId);
  } else if (
    record.enrollmentStatus &&
    existing.enrollment_status === record.enrollmentStatus &&
    record.enrollmentBasis === "verified" &&
    existing.enrollment_basis !== "verified"
  ) {
    db.prepare(
      `UPDATE people SET enrollment_evidence=?, enrollment_source_url=?, enrollment_source_id=?, enrollment_grad_year=?, enrollment_basis='verified' WHERE id=?`
    ).run(evidence, sourceUrl, sourceId, record.gradYear, personId);
  }
  applyFounderStatus(db, personId, record, existing);
}

function ensureAffiliation(db: Database.Database, personId: string, universityId: string, role: string, status: string, claimId: string) {
  const existing = db.prepare(`SELECT id FROM affiliations WHERE person_id=? AND university_id=? AND role=?`).get(personId, universityId, role) as { id: string } | undefined;
  if (existing) {
    db.prepare(`UPDATE affiliations SET status=? WHERE id=?`).run(status, existing.id);
    return;
  }
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
  const tier = membershipTierFields(record.program, record.label);
  const existing = db
    .prepare(
      `SELECT id FROM program_signals
       WHERE person_id=? AND signal_type=? AND IFNULL(year, 0)=IFNULL(?, 0) AND source_url=?`
    )
    .get(personId, record.program, record.year, record.sourceUrl) as { id: string } | undefined;
  if (existing) {
    db.prepare(`UPDATE program_signals SET label=?, match_status=?, excerpt=?, claim_id=?, tier=?, tier_rationale=?, tier_source_url=? WHERE id=?`).run(
      record.label,
      record.matchStatus,
      record.excerpt.slice(0, 1400),
      claimId,
      tier.tier,
      tier.rationale,
      tier.sourceUrl,
      existing.id
    );
  } else {
    db.prepare(
      `INSERT INTO program_signals (id, person_id, signal_type, label, year, match_status, source_url, excerpt, claim_id, tier, tier_rationale, tier_source_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      newId("psig"),
      personId,
      record.program,
      record.label,
      record.year,
      record.matchStatus,
      record.sourceUrl,
      record.excerpt.slice(0, 1400),
      claimId,
      tier.tier,
      tier.rationale,
      tier.sourceUrl
    );
  }
  writePersonDirectoryTier(db, personId, record.program, record.label);
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

function ensureCampusLink(db: Database.Database, program: ResidencyProgram, universityId: string, excerpt: string, sourceUrl: string, retrievedAt: string) {
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
    if (!isResidencyProgram(person.program)) throw new Error(`Bad program for ${person.name}`);
    if (!isProgramMatchStatus(person.matchStatus)) throw new Error(`Bad match status for ${person.name}`);
    if (!person.sourceUrl.startsWith("http") || person.excerpt.trim().length < 20) throw new Error(`Missing source for ${person.name}`);
    if (!person.keepWithoutCampus && !person.universityId) throw new Error(`No campus for ${person.name}`);
    if ((person.enrollmentStatus == null) !== (person.enrollmentBasis == null)) throw new Error(`Enrollment basis mismatch for ${person.name}`);
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
  const counts = Object.fromEntries(RESIDENCY_PROGRAMS.map((program) => [program, blank()])) as Record<
    ResidencyProgram,
    ReturnType<typeof blank>
  >;
  const campusLinks = new Map<ResidencyProgram, Map<string, { excerpt: string; sourceUrl: string }>>();

  const tx = db.transaction(() => {
    for (const program of RESIDENCY_PROGRAMS) {
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
      for (const campus of campuses) {
        if (!db.prepare(`SELECT 1 FROM universities WHERE id=?`).get(campus)) throw new Error(`Missing university ${campus} for ${record.name}`);
        const stored = db.prepare(`SELECT enrollment_status FROM people WHERE id=?`).get(personId) as { enrollment_status: string | null };
        const status = stored.enrollment_status && stored.enrollment_status !== "unknown" ? stored.enrollment_status : "unknown";
        ensureAffiliation(db, personId, campus, record.role, status, claimId);
        const links = campusLinks.get(record.program) ?? new Map();
        if (!links.has(campus)) links.set(campus, { excerpt: record.educationExcerpt || record.excerpt, sourceUrl: record.educationUrl || record.sourceUrl });
        campusLinks.set(record.program, links);
      }
      ensureRole(db, personId, spec.projectId, "member", claimId);
      ensureSignal(db, personId, record, claimId);
      bucket[record.matchStatus] += 1;
      const campusKey = record.universityId ?? "(no campus)";
      const campusBucket = bucket.byCampus[campusKey] ?? { added: 0, linked: 0 };
      if (created) campusBucket.added += 1;
      else campusBucket.linked += 1;
      bucket.byCampus[campusKey] = campusBucket;

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

  const report = Object.fromEntries(RESIDENCY_PROGRAMS.map((program) => [program, finish(counts[program])]));
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
