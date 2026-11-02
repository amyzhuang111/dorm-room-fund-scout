import fs from "node:fs";
import { databasePath, getDb } from "../db/client";
import { sectorLabel } from "./sectors";
import { domainKey, type FeedbackRecord, type FeedbackTarget } from "./feedback";
import { computeRubric, type Ratings } from "../scoring/rubric";
import { computeFounderSignal, type FounderSignalFacts, type FounderSignalResult } from "../scoring/founder-signal";
import { overallGateStatus, primaryBlocker, type GateOutcome } from "../screening/gates";
import { assignQueue, type Queue } from "./queue";
import { evaluatePromotion } from "./promotion";
import { parseCommunitySignalCategories, type CommunityConfidence, type CommunitySignal } from "./community-signal";
import { catalogueForCampus } from "./source-quality";
import { ENROLLMENT_STATUSES, enrollmentBoost, type EnrollmentStatus } from "./founder-status";
import { bestPersonLink, confirmedLinkedIn, readLinkedInCandidate, type PersonLinkTarget } from "./person-link";
import type { RelatedHotspot } from "./hotspot-model";
import { relatedHotspotsForPerson, relatedHotspotsForProject } from "./hotspots";
import { assembleProfileLinks, type OtherSourceLink, type ProfileIconLink } from "./profile-links";
import { assembleCompanyProfile, type CompanyFactRecord, type CompanyProfile } from "./company-profile";
import { matchCandidate } from "./candidate-filter";
import { bestPrecollegeSignals, isPrecollegeSignalType, type PrecollegeSignalView } from "./precollege";
import { bestProgramSignals, isProgramMatchStatus, isProgramSignalType, type ProgramSignalView } from "./program-signals";
import { newsForProject } from "./news";
import type { NewsListItem } from "./news-types";
import { hitRateByCampus } from "./campus-hit-rate";
import type { CampusHitRate } from "./campus-hit-rate-model";
import { pitchbookByCampus } from "./pitchbook";
import type { PitchbookCampus } from "./pitchbook-model";
import { SAME_SCHOOL_FOUNDER_POINTS, SAME_SCHOOL_STARTUP_POINTS, scoreBonus } from "./same-school";
import { sameSchoolIndex } from "./same-school-index";

export type CoverageState = "not_scanned" | "partial" | "up_to_date" | "needs_attention";

function cacheStamp(): string {
  try {
    const st = fs.statSync(databasePath());
    return `${st.mtimeMs}:${st.size}`;
  } catch {
    return "missing";
  }
}

let universityMemo: { stamp: string; rows: UniversitySummary[] } | null = null;
let candidateMemo: { stamp: string; rows: CandidateSummary[] } | null = null;
let founderMemo: { stamp: string; promoted: FounderRow[]; potential: FounderRow[]; all: FounderRow[]; affs: Map<string, { status: string | null; universityId: string | null; universityName: string | null }[]> } | null = null;

export interface UniversitySummary {
  id: string;
  name: string;
  country: string | null;
  lat: number | null;
  lon: number | null;
  coordSource: string | null;
  /** @deprecated use companyCount */
  candidateProjectCount: number;
  companyCount: number; // Startup Scout: formed/plausibly-formed companies only (kind='company')
  founderCount: number; // Founder Scout: PROMOTED founder candidates only (see lib/domain/promotion.ts) · not every resolved person
  resolvedPersonCount: number; // total distinct people resolved with any affiliation to this campus, promoted or not
  sourcesConfigured: number;
  lastCheckedAt: string | null;
  coverage: CoverageState;
  /** PitchBook 2026 rankings when this campus matched a list. */
  pitchbook: PitchbookCampus | null;
  /** Scout hit rate for tracked founders at this campus. Null when nobody is tracked. */
  hitRate: CampusHitRate | null;
}

export function listUniversities(): UniversitySummary[] {
  const stamp = cacheStamp();
  if (universityMemo?.stamp === stamp) return universityMemo.rows;
  const rows = buildUniversities();
  universityMemo = { stamp, rows };
  return rows;
}

// Campus founder counts for the globe. The full Founder Scout rows take seconds
// to assemble, and the map only needs how many promoted people sit on each
// campus. This matches listFounders({ universityId }).length.
function founderCountsByUniversity(): Map<string, number> {
  const db = getDb();
  const projectsByPerson = new Map<string, { kind: string; role: string }[]>();
  for (const row of db
    .prepare(
      `SELECT ppr.person_id as person_id, p.kind as kind, ppr.role as role
       FROM person_project_roles ppr JOIN projects p ON p.id = ppr.project_id`
    )
    .all() as { person_id: string; kind: string; role: string }[]) {
    const list = projectsByPerson.get(row.person_id) ?? [];
    list.push({ kind: row.kind, role: row.role });
    projectsByPerson.set(row.person_id, list);
  }
  const campusesByPerson = new Map<string, Set<string>>();
  for (const row of db.prepare(`SELECT person_id, university_id FROM affiliations WHERE university_id IS NOT NULL`).all() as {
    person_id: string;
    university_id: string;
  }[]) {
    const set = campusesByPerson.get(row.person_id) ?? new Set<string>();
    set.add(row.university_id);
    campusesByPerson.set(row.person_id, set);
  }
  const counts = new Map<string, number>();
  const people = db.prepare(`SELECT id, founder_status FROM people`).all() as { id: string; founder_status: string | null }[];
  for (const person of people) {
    if (person.founder_status === "removed" || person.founder_status === "potential") continue;
    if (!evaluatePromotion(projectsByPerson.get(person.id) ?? []).promoted) continue;
    for (const campusId of campusesByPerson.get(person.id) ?? []) {
      counts.set(campusId, (counts.get(campusId) ?? 0) + 1);
    }
  }
  return counts;
}

export function countCandidateProjects(): number {
  const db = getDb();
  const row = db.prepare(`SELECT COUNT(*) as c FROM projects WHERE kind = 'company' AND is_investable_candidate = 1`).get() as { c: number };
  return row.c;
}

/** Public campus coordinates for rows missing lat/lon in SQLite (verifiable locations only). */
const CAMPUS_COORD_OVERRIDES: Record<string, { lat: number; lon: number; country: string }> = {
  // Franklin W. Olin College of Engineering, Needham, MA
  univ_olin_college: { lat: 42.2925, lon: -71.2639, country: "United States" },
  // Huron University College (Western University), London, Ontario
  univ_western_university_huron_college: { lat: 43.0125, lon: -81.2736, country: "Canada" },
};

function buildUniversities(): UniversitySummary[] {
  const db = getDb();
  const universities = db.prepare(`SELECT id, name, country, lat, lon, coord_source FROM universities ORDER BY name`).all() as {
    id: string; name: string; country: string | null; lat: number | null; lon: number | null; coord_source: string | null;
  }[];
  for (const row of universities) {
    if (row.lat != null && row.lon != null) continue;
    const override = CAMPUS_COORD_OVERRIDES[row.id];
    if (!override) continue;
    row.lat = override.lat;
    row.lon = override.lon;
    if (!row.country) row.country = override.country;
    row.coord_source = row.coord_source || "public_campus";
  }

  const companyCounts = new Map<string, number>();
  for (const row of db
    .prepare(
      `WITH link AS (
         SELECT ppr.project_id as project_id, a.university_id as university_id
         FROM person_project_roles ppr
         JOIN affiliations a ON a.person_id = ppr.person_id AND ppr.role LIKE '%founder%'
         UNION
         SELECT r.source_entity_id, r.target_entity_id
         FROM relationships r
         WHERE r.source_entity_type = 'project' AND r.target_entity_type = 'university' AND r.relationship_type = 'affiliated_with'
       )
       SELECT link.university_id as id, COUNT(DISTINCT p.id) as c
       FROM projects p
       JOIN link ON link.project_id = p.id
       WHERE p.kind = 'company' AND p.is_investable_candidate = 1
       GROUP BY link.university_id`
    )
    .all() as { id: string; c: number }[]) {
    companyCounts.set(row.id, row.c);
  }
  const personCounts = new Map<string, number>();
  for (const row of db.prepare(`SELECT university_id as id, COUNT(DISTINCT person_id) as c FROM affiliations GROUP BY university_id`).all() as { id: string; c: number }[]) {
    personCounts.set(row.id, row.c);
  }
  const founderCounts = founderCountsByUniversity();
  const pitchbook = pitchbookByCampus();
  const hitRates = hitRateByCampus();

  return universities.map((u) => {
    const companyCount = companyCounts.get(u.id) ?? 0;
    const resolvedPersonCount = personCounts.get(u.id) ?? 0;
    const founderCount = founderCounts.get(u.id) ?? 0;

    const sourceRow = db
      .prepare(`SELECT COUNT(*) c, MAX(last_success_at) last FROM sources WHERE campuses_json LIKE ?`)
      .get(`%${u.id}%`) as { c: number; last: string | null };
    const failed = db
      .prepare(`SELECT COUNT(*) c FROM sources WHERE campuses_json LIKE ? AND status = 'failed'`)
      .get(`%${u.id}%`) as { c: number };
    const catalogueOpen = catalogueForCampus(u.id).filter((s) => s.status === "unconfigured").length;
    const coverage: CoverageState =
      sourceRow.c === 0 ? "not_scanned" : failed.c > 0 ? "needs_attention" : catalogueOpen > 0 ? "partial" : "up_to_date";

    return {
      id: u.id,
      name: u.name,
      country: u.country,
      lat: u.lat,
      lon: u.lon,
      coordSource: u.coord_source,
      candidateProjectCount: companyCount,
      companyCount,
      founderCount,
      resolvedPersonCount,
      sourcesConfigured: sourceRow.c,
      lastCheckedAt: sourceRow.last,
      coverage,
      pitchbook: pitchbook.get(u.id) ?? null,
      hitRate: hitRates.get(u.id) ?? null,
    };
  });
}

export interface LinkedInCandidate {
  url: string;
  reason: string;
  confidence?: "likely" | "unverified";
}

export interface NamedFounder {
  name: string;
  personId: string;
  linkedinUrl: string | null;
  linkedinCandidates: LinkedInCandidate[];
  /** Confirmed LinkedIn, an unverified candidate, or the best other public profile. */
  link: PersonLinkTarget | null;
  profileLinks: ProfileIconLink[];
  otherLinks: OtherSourceLink[];
  founderStatus: string | null;
  role: string | null;
  enrollmentStatus: string | null;
  enrollmentLabel: string | null;
  enrollmentBasis: string | null;
  leftSchool: boolean;
  school: string | null;
  program: string | null;
}

export interface CandidateSummary {
  id: string;
  name: string;
  sector: string | null;
  description: string | null;
  websiteUrl: string | null;
  primaryLink: string | null;
  primaryLinkKind: string | null;
  founders: string[];
  founderLinks: NamedFounder[];
  founderIds: string[];
  universities: string[]; // names
  universityIds: string[];
  sectorTags: string[];
  sourceIds: string[];
  overallGate: string | null;
  gateOutcomes: GateOutcome[];
  queue: Queue;
  qualityScore: number | null;
  coverage: number | null;
  strongestSignalKey: string | null;
  openQuestion: string | null;
  latestSignalNote: string | null;
  /** Place name recorded by a source. Not a coordinate, and not plotted on the globe. */
  recordedPlace: string | null;
  /** Highest founder enrollment rank: current student 2, recent grad 1, otherwise 0. */
  enrollmentBoost: number;
  /** Playbook founder-signal tier. Null when no rule applies. */
  signalTier: string | null;
  verificationStatus: string | null;
  lastVerifiedAt: string | null;
  verificationNote: string | null;
  signalTierBasis: string | null;
  /** Two or more co-founders attended the same campus in overlapping years. */
  sameSchoolCofounders: boolean;
  /** Points added to a headline quality score. Zero when the startup is unassessed. */
  sameSchoolBonus: number;
}

function getGateOutcomesFor(db: ReturnType<typeof getDb>, projectId: string): GateOutcome[] {
  const rows = db.prepare(`SELECT gate_name, result, rationale FROM gate_results WHERE project_id = ?`).all(projectId) as {
    gate_name: string; result: "pass" | "needs_verification" | "outside_current_brief"; rationale: string;
  }[];
  return rows.map((r) => ({ gate: r.gate_name, result: r.result, rationale: r.rationale }));
}

// Distinct sectors actually present among Startup Scout candidates — never a
// static/guessed list, and never includes null: most candidates don't have a
// researched sector yet (`sector` stays null pending research, per brief
// section 1 — "unknown means unknown"), so an "Unresearched" bucket isn't a
// real category to filter by, it's just the default absence of one.
export function listCandidateSectors(): string[] {
  const db = getDb();
  return (
    db
      .prepare(
        `SELECT DISTINCT sector FROM projects WHERE kind='company' AND is_investable_candidate=1 AND sector IS NOT NULL ORDER BY sector`
      )
      .all() as { sector: string }[]
  ).map((r) => r.sector);
}

// Startup Scout's company universe. A Cal Hacks/PennApps/TreeHacks submission
// is a *project* — founder evidence — not a startup, until it's independently
// evidenced as a formed (or plausibly forming) company. Only kind='company'
// enters here; kind='project' surfaces exclusively through Founder Scout
// (listFounders below) as evidence attached to a person.
export function linkedinCandidatesFor(db: ReturnType<typeof getDb>, personId: string): LinkedInCandidate[] {
  const rows = db
    .prepare(
      `SELECT value_json, verification_state FROM claims
       WHERE entity_type = 'person' AND entity_id = ? AND claim_type = 'linkedin_candidate' AND verification_state IN ('unverified', 'likely')`
    )
    .all(personId) as { value_json: string; verification_state: string }[];
  const out: LinkedInCandidate[] = [];
  for (const row of rows) {
    const candidate = readLinkedInCandidate(row.value_json, row.verification_state);
    if (candidate) out.push(candidate);
  }
  return out;
}

export function linkedinFromAliases(aliasesJson: string | null | undefined): string | null {
  return confirmedLinkedIn(aliasesJson);
}

export function unverifiedLinkedInByPerson(db: ReturnType<typeof getDb>): Map<string, LinkedInCandidate[]> {
  const rows = db
    .prepare(
      `SELECT entity_id, value_json, verification_state FROM claims
       WHERE entity_type = 'person' AND claim_type = 'linkedin_candidate' AND verification_state IN ('unverified', 'likely')`
    )
    .all() as { entity_id: string; value_json: string; verification_state: string }[];
  const out = new Map<string, LinkedInCandidate[]>();
  for (const row of rows) {
    const candidate = readLinkedInCandidate(row.value_json, row.verification_state);
    if (!candidate) continue;
    const list = out.get(row.entity_id) ?? [];
    list.push(candidate);
    out.set(row.entity_id, list);
  }
  return out;
}

function profileClaimsByPerson(db: ReturnType<typeof getDb>): Map<string, { valueJson: string; excerpt: string; sourceUrl: string | null }[]> {
  const out = new Map<string, { valueJson: string; excerpt: string; sourceUrl: string | null }[]>();
  for (const row of db
    .prepare(
      `SELECT entity_id, value_json, excerpt, source_url FROM claims
       WHERE entity_type = 'person' AND claim_type = 'profile_link'`
    )
    .all() as { entity_id: string; value_json: string; excerpt: string; source_url: string | null }[]) {
    const list = out.get(row.entity_id) ?? [];
    list.push({ valueJson: row.value_json, excerpt: row.excerpt, sourceUrl: row.source_url });
    out.set(row.entity_id, list);
  }
  return out;
}

export interface SectorCount {
  tag: string;
  label: string;
  count: number;
  byCampus: { universityId: string; name: string; count: number }[];
}

export function listSectorCounts(universityId?: string): SectorCount[] {
  const db = getDb();
  const campusSql = universityId ? "AND link.university_id = ?" : "";
  const params = universityId ? [universityId] : [];
  const linkSql = `
       FROM project_sector_tags t
       JOIN projects p ON p.id = t.project_id AND p.kind = 'company' AND p.is_investable_candidate = 1
       JOIN (
         SELECT ppr.project_id as project_id, a.university_id as university_id
         FROM person_project_roles ppr
         JOIN affiliations a ON a.person_id = ppr.person_id AND ppr.role LIKE '%founder%'
         UNION
         SELECT r.source_entity_id, r.target_entity_id
         FROM relationships r
         WHERE r.source_entity_type = 'project' AND r.target_entity_type = 'university' AND r.relationship_type = 'affiliated_with'
       ) link ON link.project_id = p.id`;
  const totals = db
    .prepare(`SELECT t.tag as tag, COUNT(DISTINCT p.id) as c ${linkSql} WHERE 1=1 ${campusSql} GROUP BY t.tag`)
    .all(...params) as { tag: string; c: number }[];
  const campuses = db
    .prepare(
      `SELECT t.tag as tag, u.id as university_id, u.name as university_name, COUNT(DISTINCT p.id) as c
       ${linkSql}
       JOIN universities u ON u.id = link.university_id
       WHERE 1=1 ${campusSql}
       GROUP BY t.tag, u.id`
    )
    .all(...params) as { tag: string; university_id: string; university_name: string; c: number }[];
  const byTag = new Map<string, SectorCount>();
  for (const row of totals) {
    byTag.set(row.tag, { tag: row.tag, label: sectorLabel(row.tag), count: row.c, byCampus: [] });
  }
  for (const row of campuses) {
    const existing = byTag.get(row.tag);
    if (!existing) continue;
    existing.byCampus.push({ universityId: row.university_id, name: row.university_name, count: row.c });
  }
  for (const row of byTag.values()) {
    row.byCampus.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }
  return [...byTag.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export interface EnrollmentCampusCount {
  universityId: string;
  name: string;
  counts: Record<EnrollmentStatus, number>;
}

export function listEnrollmentCounts(universityId?: string): { totals: Record<EnrollmentStatus, number>; byCampus: EnrollmentCampusCount[] } {
  const db = getDb();
  const totals = Object.fromEntries(ENROLLMENT_STATUSES.map((status) => [status, 0])) as Record<EnrollmentStatus, number>;
  const params = universityId ? [universityId] : [];
  const campusSql = universityId ? "AND a.university_id = ?" : "";
  const rows = db
    .prepare(
      `SELECT a.university_id as university_id, u.name as university_name, COALESCE(pe.enrollment_status, 'unknown') as status, COUNT(DISTINCT pe.id) as c
       FROM people pe
       JOIN affiliations a ON a.person_id = pe.id
       JOIN universities u ON u.id = a.university_id
       WHERE 1=1 ${campusSql}
       GROUP BY a.university_id, pe.enrollment_status`
    )
    .all(...params) as { university_id: string; university_name: string; status: string; c: number }[];
  const byId = new Map<string, EnrollmentCampusCount>();
  for (const row of rows) {
    const status = (ENROLLMENT_STATUSES as readonly string[]).includes(row.status) ? (row.status as EnrollmentStatus) : "unknown";
    let campus = byId.get(row.university_id);
    if (!campus) {
      campus = {
        universityId: row.university_id,
        name: row.university_name,
        counts: Object.fromEntries(ENROLLMENT_STATUSES.map((s) => [s, 0])) as Record<EnrollmentStatus, number>,
      };
      byId.set(row.university_id, campus);
    }
    campus.counts[status] += row.c;
    totals[status] += row.c;
  }
  const byCampus = [...byId.values()].sort((a, b) => b.counts.current_student + b.counts.recent_grad - (a.counts.current_student + a.counts.recent_grad) || a.name.localeCompare(b.name));
  return { totals, byCampus };
}

/** Promoted Founder Scout candidates in each enrollment bucket. */
function emptyStatusCounts(): Record<EnrollmentStatus, number> {
  return Object.fromEntries(ENROLLMENT_STATUSES.map((status) => [status, 0])) as Record<EnrollmentStatus, number>;
}

let statusMemo: { stamp: string; all: Record<EnrollmentStatus, number>; byUniversity: Map<string, Record<EnrollmentStatus, number>> } | null = null;

export function listFounderStatusCounts(universityId?: string): Record<EnrollmentStatus, number> {
  const stamp = cacheStamp();
  if (!statusMemo || statusMemo.stamp !== stamp) {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT pe.id as id, COALESCE(pe.enrollment_status, 'unknown') as status, p.kind as kind, ppr.role as role
         FROM people pe
         JOIN person_project_roles ppr ON ppr.person_id = pe.id
         JOIN projects p ON p.id = ppr.project_id`
      )
      .all() as { id: string; status: string; kind: string; role: string }[];
    const grouped = new Map<string, { status: string; projects: { kind: string; role: string }[] }>();
    for (const row of rows) {
      const existing = grouped.get(row.id);
      if (existing) existing.projects.push({ kind: row.kind, role: row.role });
      else grouped.set(row.id, { status: row.status, projects: [{ kind: row.kind, role: row.role }] });
    }
    const campuses = new Map<string, Set<string>>();
    for (const row of db.prepare(`SELECT person_id, university_id FROM affiliations WHERE university_id IS NOT NULL`).all() as {
      person_id: string;
      university_id: string;
    }[]) {
      const set = campuses.get(row.person_id) ?? new Set<string>();
      set.add(row.university_id);
      campuses.set(row.person_id, set);
    }
    const all = emptyStatusCounts();
    const byUniversity = new Map<string, Record<EnrollmentStatus, number>>();
    for (const [id, person] of grouped) {
      if (!evaluatePromotion(person.projects).promoted) continue;
      const status = (ENROLLMENT_STATUSES as readonly string[]).includes(person.status) ? (person.status as EnrollmentStatus) : "unknown";
      all[status] += 1;
      for (const campus of campuses.get(id) ?? []) {
        const bucket = byUniversity.get(campus) ?? emptyStatusCounts();
        bucket[status] += 1;
        byUniversity.set(campus, bucket);
      }
    }
    statusMemo = { stamp, all, byUniversity };
  }
  if (!universityId) return statusMemo.all;
  return statusMemo.byUniversity.get(universityId) ?? emptyStatusCounts();
}

export interface CampusArc {
  fromId: string;
  toId: string;
  count: number;
}

// Campuses joined by at least one investable company that is sourced to both.
// Used only to draw those real links on the globe — never a decorative arc.
export function listCampusArcs(): CampusArc[] {
  const db = getDb();
  const link = `
    SELECT ppr.project_id as project_id, a.university_id as university_id
    FROM person_project_roles ppr
    JOIN affiliations a ON a.person_id = ppr.person_id AND ppr.role LIKE '%founder%'
    UNION
    SELECT r.source_entity_id, r.target_entity_id
    FROM relationships r
    WHERE r.source_entity_type = 'project' AND r.target_entity_type = 'university' AND r.relationship_type = 'affiliated_with'`;
  return (
    db
      .prepare(
        `SELECT a.university_id as fromId, b.university_id as toId, COUNT(DISTINCT p.id) as count
         FROM projects p
         JOIN (${link}) a ON a.project_id = p.id
         JOIN (${link}) b ON b.project_id = p.id AND a.university_id < b.university_id
         WHERE p.kind = 'company' AND p.is_investable_candidate = 1
         GROUP BY 1, 2`
      )
      .all() as CampusArc[]
  );
}

function allCandidates(): CandidateSummary[] {
  const stamp = cacheStamp();
  if (candidateMemo?.stamp === stamp) return candidateMemo.rows;
  const rows = buildAllCandidates();
  candidateMemo = { stamp, rows };
  return rows;
}

export function listCandidateProjects(filters: { universityId?: string; queue?: Queue; sector?: string; search?: string } = {}): CandidateSummary[] {
  return allCandidates().filter((candidate) => matchCandidate(candidate, filters));
}

function buildAllCandidates(): CandidateSummary[] {
  const db = getDb();
  const sameSchool = sameSchoolIndex();
  const unverified = unverifiedLinkedInByPerson(db);
  const profileClaims = profileClaimsByPerson(db);
  const projects = db
    .prepare(`SELECT id, name, sector, description, website_url, primary_link, primary_link_kind, is_portfolio_reference, signal_tier, signal_tier_basis, verification_status, last_verified_at, verification_note FROM projects WHERE kind='company' AND is_investable_candidate=1 ORDER BY name`)
    .all() as { id: string; name: string; sector: string | null; description: string | null; website_url: string | null; primary_link: string | null; primary_link_kind: string | null; is_portfolio_reference: number; signal_tier: string | null; signal_tier_basis: string | null; verification_status: string | null; last_verified_at: string | null; verification_note: string | null }[];

  const schoolByPerson = new Map<string, string>();
  for (const row of db
    .prepare(
      `SELECT person_id, school FROM (
         SELECT a.person_id as person_id, u.name as school,
                ROW_NUMBER() OVER (PARTITION BY a.person_id ORDER BY a.rowid) as rn
         FROM affiliations a JOIN universities u ON u.id = a.university_id
       ) WHERE rn = 1`
    )
    .all() as { person_id: string; school: string }[]) {
    schoolByPerson.set(row.person_id, row.school);
  }

  const programByPerson = new Map<string, string>();
  for (const row of db
    .prepare(
      `SELECT entity_id, name FROM (
         SELECT c.entity_id as entity_id, s.name as name,
                ROW_NUMBER() OVER (PARTITION BY c.entity_id ORDER BY c.retrieved_at DESC) as rn
         FROM claims c JOIN sources s ON s.id = c.source_id
         WHERE c.entity_type = 'person' AND c.source_id IS NOT NULL
           AND c.claim_type NOT IN ('linkedin_alias_discovered', 'linkedin_candidate', 'linkedin_search_attempt', 'profile_link')
       ) WHERE rn = 1`
    )
    .all() as { entity_id: string; name: string }[]) {
    programByPerson.set(row.entity_id, row.name);
  }

  const foundersByProject = new Map<string, NamedFounder[]>();
  const seenFounder = new Set<string>();
  for (const r of db
    .prepare(
      `SELECT ppr.project_id as project_id, pe.id as id, pe.name as name, pe.aliases_json as aliases_json,
              pe.enrollment_status as enrollment_status, pe.enrollment_label as enrollment_label,
              pe.enrollment_basis as enrollment_basis,
              pe.left_school as left_school, pe.founder_status as founder_status, ppr.role as role
       FROM person_project_roles ppr JOIN people pe ON pe.id = ppr.person_id
       WHERE ppr.role LIKE '%founder%'
       ORDER BY ppr.rowid`
    )
    .all() as { project_id: string; id: string; name: string; aliases_json: string; enrollment_status: string | null; enrollment_label: string | null; enrollment_basis: string | null; left_school: number | null; founder_status: string | null; role: string | null }[]) {
    const key = `${r.project_id}:${r.id}`;
    if (seenFounder.has(key)) continue;
    seenFounder.add(key);
    const linkedinUrl = linkedinFromAliases(r.aliases_json);
    const linkedinCandidates = linkedinUrl ? [] : (unverified.get(r.id) ?? []);
    const profiles = assembleProfileLinks(r.aliases_json, profileClaims.get(r.id) ?? []);
    const list = foundersByProject.get(r.project_id) ?? [];
    list.push({
      name: r.name,
      personId: r.id,
      linkedinUrl,
      linkedinCandidates,
      link: bestPersonLink({ aliasesJson: r.aliases_json, linkedinCandidates }),
      profileLinks: profiles.profileLinks,
      otherLinks: profiles.otherLinks,
      founderStatus: r.founder_status,
      role: r.role,
      enrollmentStatus: r.enrollment_status,
      enrollmentLabel: r.enrollment_label,
      enrollmentBasis: r.enrollment_basis,
      leftSchool: r.left_school === 1,
      school: schoolByPerson.get(r.id) ?? null,
      program: programByPerson.get(r.id) ?? null,
    });
    foundersByProject.set(r.project_id, list);
  }

  const universitiesByProject = new Map<string, { name: string; id: string }[]>();
  const seenUni = new Set<string>();
  for (const row of db
    .prepare(
      `SELECT ppr.project_id as project_id, u.name as name, u.id as id
       FROM affiliations a
       JOIN person_project_roles ppr ON ppr.person_id = a.person_id AND ppr.role LIKE '%founder%'
       JOIN universities u ON u.id = a.university_id
       UNION
       SELECT r.source_entity_id, u.name, u.id
       FROM relationships r
       JOIN universities u ON u.id = r.target_entity_id
       WHERE r.source_entity_type = 'project' AND r.target_entity_type = 'university' AND r.relationship_type = 'affiliated_with'`
    )
    .all() as { project_id: string; name: string; id: string }[]) {
    const key = `${row.project_id}:${row.id}`;
    if (seenUni.has(key)) continue;
    seenUni.add(key);
    const list = universitiesByProject.get(row.project_id) ?? [];
    list.push({ name: row.name, id: row.id });
    universitiesByProject.set(row.project_id, list);
  }

  const tagsByProject = new Map<string, string[]>();
  for (const row of db.prepare(`SELECT project_id, tag FROM project_sector_tags ORDER BY is_primary DESC, tag`).all() as { project_id: string; tag: string }[]) {
    const list = tagsByProject.get(row.project_id) ?? [];
    list.push(row.tag);
    tagsByProject.set(row.project_id, list);
  }

  const sourcesByEntity = new Map<string, string[]>();
  const seenSource = new Set<string>();
  for (const row of db.prepare(`SELECT entity_id, source_id FROM claims WHERE source_id IS NOT NULL`).all() as { entity_id: string; source_id: string }[]) {
    const key = `${row.entity_id}:${row.source_id}`;
    if (seenSource.has(key)) continue;
    seenSource.add(key);
    const list = sourcesByEntity.get(row.entity_id) ?? [];
    list.push(row.source_id);
    sourcesByEntity.set(row.entity_id, list);
  }

  const gatesByProject = new Map<string, GateOutcome[]>();
  for (const row of db.prepare(`SELECT project_id, gate_name, result, rationale FROM gate_results`).all() as { project_id: string; gate_name: string; result: GateOutcome["result"]; rationale: string }[]) {
    const list = gatesByProject.get(row.project_id) ?? [];
    list.push({ gate: row.gate_name, result: row.result, rationale: row.rationale });
    gatesByProject.set(row.project_id, list);
  }

  const assessmentByProject = new Map<string, { ratings_json: string }>();
  for (const row of db
    .prepare(
      `SELECT project_id, ratings_json FROM (
         SELECT project_id, ratings_json, ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at DESC) as rn
         FROM assessments
       ) WHERE rn = 1`
    )
    .all() as { project_id: string; ratings_json: string }[]) {
    assessmentByProject.set(row.project_id, row);
  }

  const watchIds = new Set(
    (db.prepare(`SELECT DISTINCT project_id FROM pipeline_entries WHERE due_date IS NOT NULL`).all() as { project_id: string }[]).map((r) => r.project_id)
  );

  const signalByProject = new Map<string, string>();
  for (const row of db
    .prepare(
      `SELECT project_id, current_observation FROM (
         SELECT project_id, current_observation, ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at DESC) as rn
         FROM signals
       ) WHERE rn = 1`
    )
    .all() as { project_id: string; current_observation: string }[]) {
    signalByProject.set(row.project_id, row.current_observation);
  }

  const placeByProject = new Map<string, string>();
  for (const row of db
    .prepare(
      `SELECT entity_id, json_extract(value_json, '$.location') AS loc FROM claims
       WHERE entity_type = 'project' AND json_extract(value_json, '$.location') IS NOT NULL
         AND trim(json_extract(value_json, '$.location')) != ''`
    )
    .all() as { entity_id: string; loc: string }[]) {
    if (!placeByProject.has(row.entity_id)) placeByProject.set(row.entity_id, row.loc);
  }

  const out: CandidateSummary[] = [];
  for (const p of projects) {
    const founderLinks = foundersByProject.get(p.id) ?? [];
    const universities = universitiesByProject.get(p.id) ?? [];
    const sectorTags = (tagsByProject.get(p.id) ?? []).map(sectorLabel);
    const gateOutcomes = gatesByProject.get(p.id) ?? [];
    const overallGate = gateOutcomes.length ? overallGateStatus(gateOutcomes) : null;
    const latestAssessment = assessmentByProject.get(p.id);
    let coverage: number | null = null;
    let qualityScore: number | null = null;
    let strongestSignalKey: string | null = null;
    let openQuestion: string | null = null;
    if (latestAssessment) {
      const ratings = JSON.parse(latestAssessment.ratings_json) as Ratings;
      const rubric = computeRubric(ratings);
      coverage = rubric.coverage;
      qualityScore = rubric.qualityScore;
      strongestSignalKey = rubric.strongestSignal?.key ?? null;
      openQuestion = rubric.openQuestion;
    }
    const sameSchoolCofounders = sameSchool.projects.has(p.id);
    const startupBonus = scoreBonus(qualityScore, SAME_SCHOOL_STARTUP_POINTS, sameSchoolCofounders);
    qualityScore = startupBonus.score;
    const queue = assignQueue({
      isPortfolioReference: !!p.is_portfolio_reference,
      overallGate,
      hasHeadlineScore: qualityScore != null,
      hasWatchMilestone: watchIds.has(p.id),
    });
    out.push({
      id: p.id,
      name: p.name,
      sector: p.sector,
      description: p.description,
      websiteUrl: p.website_url,
      primaryLink: p.primary_link,
      primaryLinkKind: p.primary_link_kind,
      founders: founderLinks.map((r) => r.name),
      founderLinks,
      founderIds: founderLinks.map((f) => f.personId),
      universities: universities.map((u) => u.name),
      universityIds: universities.map((u) => u.id),
      sectorTags,
      sourceIds: sourcesByEntity.get(p.id) ?? [],
      overallGate,
      gateOutcomes,
      queue,
      qualityScore,
      coverage,
      strongestSignalKey,
      openQuestion,
      latestSignalNote: signalByProject.get(p.id) ?? null,
      recordedPlace: placeByProject.get(p.id) ?? null,
      enrollmentBoost: founderLinks.reduce((best, founder) => Math.max(best, enrollmentBoost(founder.enrollmentStatus)), 0),
      signalTier: p.signal_tier,
      signalTierBasis: p.signal_tier_basis,
      verificationStatus: p.verification_status,
      lastVerifiedAt: p.last_verified_at,
      verificationNote: p.verification_note,
      sameSchoolCofounders,
      sameSchoolBonus: startupBonus.applied,
    });
  }
  return out;
}

export interface ClaimRow {
  id: string;
  claimType: string;
  excerpt: string;
  sourceUrl: string;
  sourceName: string | null;
  publishedDate: string | null;
  retrievedAt: string;
  label: string;
  verificationState: string;
}

export interface ProjectDetail extends CandidateSummary {
  profile: CompanyProfile;
  claims: ClaimRow[];
  signals: { id: string; signalType: string; currentObservation: string; sourceDate: string | null; significanceNote: string | null; sourceUrl: string | null }[];
  pipeline: { status: string; nextAction: string | null; dueDate: string | null; notes: string | null; passReason: string | null } | null;
  manualNotes: ManualNote[];
  assessmentHistory: AssessmentHistoryRow[];
  hotspots: RelatedHotspot[];
  news: NewsListItem[];
}

export function getProjectDetail(id: string): ProjectDetail | null {
  const db = getDb();
  const summary = allCandidates().find((c) => c.id === id);
  if (!summary) return null;

  const claims = (
    db
      .prepare(
        `SELECT DISTINCT c.id, c.claim_type, c.excerpt, c.source_url, c.published_date, c.retrieved_at, c.label, c.verification_state,
                s.name as source_name
         FROM claims c
         LEFT JOIN sources s ON s.id = c.source_id
         WHERE c.entity_id IN (
           SELECT ppr.person_id FROM person_project_roles ppr WHERE ppr.project_id = ?
           UNION SELECT ?
         )
         ORDER BY CASE WHEN c.claim_type = 'profile_link' THEN 1 ELSE 0 END, c.retrieved_at DESC`
      )
      .all(id, id) as {
        id: string;
        claim_type: string;
        excerpt: string;
        source_url: string;
        published_date: string | null;
        retrieved_at: string;
        label: string;
        verification_state: string;
        source_name: string | null;
      }[]
  ).map((r) => ({
    id: r.id,
    claimType: r.claim_type,
    excerpt: r.excerpt,
    sourceUrl: r.source_url,
    sourceName: r.source_name,
    publishedDate: r.published_date,
    retrievedAt: r.retrieved_at,
    label: r.label,
    verificationState: r.verification_state,
  }));

  const signalRows = db
    .prepare(
      `SELECT id, signal_type, current_observation, source_date, significance_note, claim_ids_json
       FROM signals WHERE project_id = ? ORDER BY created_at DESC`
    )
    .all(id) as {
      id: string;
      signal_type: string;
      current_observation: string;
      source_date: string | null;
      significance_note: string | null;
      claim_ids_json: string | null;
    }[];
  const claimIdSet = new Set<string>();
  const parsedClaimIds = signalRows.map((r) => {
    let ids: string[] = [];
    try {
      const raw = r.claim_ids_json ? JSON.parse(r.claim_ids_json) : [];
      if (Array.isArray(raw)) ids = raw.filter((x): x is string => typeof x === "string");
    } catch {
      ids = [];
    }
    for (const cid of ids) claimIdSet.add(cid);
    return ids;
  });
  const claimUrlById = new Map<string, string>();
  if (claimIdSet.size > 0) {
    const ids = [...claimIdSet];
    const placeholders = ids.map(() => "?").join(",");
    for (const row of db
      .prepare(`SELECT id, source_url FROM claims WHERE id IN (${placeholders}) AND source_url IS NOT NULL AND source_url != ''`)
      .all(...ids) as { id: string; source_url: string }[]) {
      claimUrlById.set(row.id, row.source_url);
    }
  }
  const signals = signalRows.map((r, i) => {
    let sourceUrl: string | null = null;
    for (const cid of parsedClaimIds[i]) {
      const url = claimUrlById.get(cid);
      if (url) {
        sourceUrl = url;
        break;
      }
    }
    return {
      id: r.id,
      signalType: r.signal_type,
      currentObservation: r.current_observation,
      sourceDate: r.source_date,
      significanceNote: r.significance_note,
      sourceUrl,
    };
  });

  const pipeline = db
    .prepare(`SELECT status, next_action, due_date, notes, pass_reason FROM pipeline_entries WHERE project_id = ?`)
    .get(id) as { status: string; next_action: string | null; due_date: string | null; notes: string | null; pass_reason: string | null } | undefined;

  const factRows = db
    .prepare(
      `SELECT fact_key, value_text, amount_usd, amount_status, detail_json, source_url, excerpt, origin
       FROM company_facts WHERE project_id = ?`
    )
    .all(id) as {
      fact_key: string;
      value_text: string;
      amount_usd: number | null;
      amount_status: string | null;
      detail_json: string;
      source_url: string;
      excerpt: string;
      origin: string;
    }[];
  const profile = assembleCompanyProfile(
    factRows.map(
      (row): CompanyFactRecord => ({
        factKey: row.fact_key,
        valueText: row.value_text,
        amountUsd: row.amount_usd,
        amountStatus: row.amount_status,
        detailJson: row.detail_json,
        sourceUrl: row.source_url,
        excerpt: row.excerpt,
        origin: row.origin,
      })
    )
  );

  return {
    ...summary,
    profile,
    claims,
    signals,
    pipeline: pipeline
      ? { status: pipeline.status, nextAction: pipeline.next_action, dueDate: pipeline.due_date, notes: pipeline.notes, passReason: pipeline.pass_reason }
      : null,
    manualNotes: listNotesFor("project", id),
    assessmentHistory: listAssessmentHistory(id),
    hotspots: relatedHotspotsForProject(id),
    news: newsForProject(id),
  };
}

export interface AssessmentHistoryRow {
  id: string;
  evaluator: string;
  createdAt: string;
  coverage: number;
  qualityScore: number | null;
  ratings: Record<string, number | null>;
  notes: string;
}

export function listAssessmentHistory(projectId: string): AssessmentHistoryRow[] {
  const db = getDb();
  return (
    db
      .prepare(
        `SELECT id, evaluator, created_at, coverage, quality_score, ratings_json, rationale_json FROM assessments WHERE project_id = ? ORDER BY created_at DESC`
      )
      .all(projectId) as {
        id: string;
        evaluator: string;
        created_at: string;
        coverage: number;
        quality_score: number | null;
        ratings_json: string;
        rationale_json: string;
      }[]
  ).map((r) => ({
    id: r.id,
    evaluator: r.evaluator,
    createdAt: r.created_at,
    coverage: r.coverage,
    qualityScore: r.quality_score,
    ratings: JSON.parse(r.ratings_json),
    notes: (JSON.parse(r.rationale_json || "{}").notes as string) || "",
  }));
}

export interface ManualNote {
  id: string;
  body: string;
  author: string;
  createdAt: string;
}

export function listNotesFor(entityType: string, entityId: string): ManualNote[] {
  const db = getDb();
  return (
    db
      .prepare(`SELECT id, body, author, created_at FROM notes WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC`)
      .all(entityType, entityId) as { id: string; body: string; author: string; created_at: string }[]
  ).map((r) => ({ id: r.id, body: r.body, author: r.author, createdAt: r.created_at }));
}

export interface SourceRow {
  id: string; name: string; family: string; url: string; status: string; priority: number;
  lastAttemptAt: string | null; lastSuccessAt: string | null; error: string | null;
  discoveredLeadCount: number; reviewedRelevantCount: number; campuses: string[];
  founderScoutTier: string | null; startupScoutTier: string | null; sourceRole: string | null;
  tierRationale: string | null;
  tierOverrideBy: string | null; tierOverrideAt: string | null; tierOverrideReason: string | null;
  communitySignal: CommunitySignal | null;
}

export interface SourceTypedCounts {
  people: number;
  projects: number;
  ventures: number;
}

// Typed breakdown per source (UIUX_UPGRADE_CLAUDE.md §11: "distinguish
// people, projects, ventures and portfolio references") — derived from
// claims.source_id, not a single undifferentiated "leads" number.
//
// A project's evidence isn't always a direct entity_type='project' claim —
// e.g. Penn Labs' product-contribution claims are typed against the person
// (entity_type='person_project_role', entity_id=personId), with the link to
// the product only recorded via person_project_roles.claim_id. Counting only
// direct project claims under-reported every such source's Projects/Ventures
// column as 0 even when real, evidenced projects existed (caught against
// Penn Labs: 4 real products with role-claim evidence, 0 previously shown).
function projectCountForSource(db: ReturnType<typeof getDb>, sourceId: string, kind: "project" | "company"): number {
  return (
    db
      .prepare(
        `SELECT COUNT(DISTINCT p.id) c FROM projects p
         WHERE p.kind = ?
           AND (
             EXISTS (SELECT 1 FROM claims c WHERE c.entity_id = p.id AND c.entity_type = 'project' AND c.source_id = ?)
             OR EXISTS (
               SELECT 1 FROM person_project_roles ppr JOIN claims c2 ON c2.id = ppr.claim_id
               WHERE ppr.project_id = p.id AND c2.source_id = ?
             )
           )`
      )
      .get(kind, sourceId, sourceId) as { c: number }
  ).c;
}

export function sourceTypedCounts(sourceId: string): SourceTypedCounts {
  const db = getDb();
  const people = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT a.person_id) c FROM affiliations a JOIN claims c ON c.id = a.claim_id WHERE c.source_id = ?`
      )
      .get(sourceId) as { c: number }
  ).c;
  const projects = projectCountForSource(db, sourceId, "project");
  const ventures = projectCountForSource(db, sourceId, "company");
  return { people, projects, ventures };
}

// Only present once a human has actually recorded a confidence level — a row
// with zero community research done has communitySignal: null, distinct from
// confidence: "insufficient" (which means research WAS done and came up
// empty; see community-signal.ts's COMMUNITY_CONFIDENCE_MEANING).
interface SourceRawRow {
  id: string;
  name: string;
  family: string;
  url: string;
  status: string;
  priority: number;
  last_attempt_at: string | null;
  last_success_at: string | null;
  error: string | null;
  discovered_lead_count: number;
  reviewed_relevant_count: number;
  campuses_json: string | null;
  founder_scout_tier: string | null;
  startup_scout_tier: string | null;
  source_role: string | null;
  tier_rationale: string | null;
  tier_override_by: string | null;
  tier_override_at: string | null;
  tier_override_reason: string | null;
  community_confidence: string | null;
  community_signal_json: string | null;
  reddit_mention_count: number | null;
  reddit_independent_mentions: number | null;
  reddit_positive_mentions: number | null;
  reddit_negative_mentions: number | null;
  community_rationale: string | null;
  reddit_last_checked_at: string | null;
}

function communitySignalFromRow(r: SourceRawRow): CommunitySignal | null {
  if (!r.community_confidence) return null;
  return {
    categories: parseCommunitySignalCategories(r.community_signal_json),
    confidence: r.community_confidence as CommunityConfidence,
    mentionCount: r.reddit_mention_count,
    independentMentions: r.reddit_independent_mentions,
    positiveMentions: r.reddit_positive_mentions,
    negativeMentions: r.reddit_negative_mentions,
    rationale: r.community_rationale,
    lastCheckedAt: r.reddit_last_checked_at,
  };
}

export function listSources(): SourceRow[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM sources ORDER BY priority, name`).all() as SourceRawRow[];
  return rows.map((r) => ({
    id: r.id, name: r.name, family: r.family, url: r.url, status: r.status, priority: r.priority,
    lastAttemptAt: r.last_attempt_at, lastSuccessAt: r.last_success_at, error: r.error,
    discoveredLeadCount: r.discovered_lead_count, reviewedRelevantCount: r.reviewed_relevant_count,
    campuses: JSON.parse(r.campuses_json || "[]"),
    founderScoutTier: r.founder_scout_tier, startupScoutTier: r.startup_scout_tier, sourceRole: r.source_role,
    tierRationale: r.tier_rationale,
    tierOverrideBy: r.tier_override_by, tierOverrideAt: r.tier_override_at, tierOverrideReason: r.tier_override_reason,
    communitySignal: communitySignalFromRow(r),
  }));
}

export interface CampusBuilder {
  id: string;
  name: string;
  status: string;
  projects: string[];
  link: PersonLinkTarget | null;
}

let builderMemo: { stamp: string; byCampus: Map<string, CampusBuilder[]> } | null = null;

export function listBuildersForUniversity(universityId: string): CampusBuilder[] {
  const stamp = cacheStamp();
  if (!builderMemo || builderMemo.stamp !== stamp) {
    const db = getDb();
    const unverified = unverifiedLinkedInByPerson(db);
    const projectsByPerson = new Map<string, string[]>();
    for (const row of db
      .prepare(`SELECT DISTINCT ppr.person_id as person_id, p.name as name FROM person_project_roles ppr JOIN projects p ON p.id = ppr.project_id ORDER BY p.name`)
      .all() as { person_id: string; name: string }[]) {
      const list = projectsByPerson.get(row.person_id) ?? [];
      if (!list.includes(row.name)) list.push(row.name);
      projectsByPerson.set(row.person_id, list);
    }
    const byCampus = new Map<string, CampusBuilder[]>();
    const seen = new Set<string>();
    for (const row of db
      .prepare(
        `SELECT a.university_id as university_id, pe.id as id, pe.name as name, a.status as status, pe.aliases_json as aliases_json
         FROM affiliations a JOIN people pe ON pe.id = a.person_id
         ORDER BY pe.name`
      )
      .all() as { university_id: string; id: string; name: string; status: string; aliases_json: string }[]) {
      const key = `${row.university_id}:${row.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const linkedinUrl = linkedinFromAliases(row.aliases_json);
      const list = byCampus.get(row.university_id) ?? [];
      list.push({
        id: row.id,
        name: row.name,
        status: row.status,
        projects: projectsByPerson.get(row.id) ?? [],
        link: bestPersonLink({ aliasesJson: row.aliases_json, linkedinCandidates: linkedinUrl ? [] : (unverified.get(row.id) ?? []) }),
      });
      byCampus.set(row.university_id, list);
    }
    builderMemo = { stamp, byCampus };
  }
  return builderMemo.byCampus.get(universityId) ?? [];
}

export interface FounderRow {
  id: string;
  name: string;
  status: string;
  universityId: string | null;
  universityName: string | null;
  projects: { id: string; name: string; kind: string; role: string; websiteUrl: string | null; primaryLink: string | null; primaryLinkKind: string | null; signalTier: string | null }[];
  signalTier: string | null;
  signalTierBasis: string | null;
  founderStatus: string | null;
  potentialSignal: string | null;
  precollegeSignals: PrecollegeSignalView[];
  programSignals: ProgramSignalView[];
  signalEvidence: { excerpt: string; sourceUrl: string | null; sourceName: string | null; unverified: boolean } | null;
  linkedCompany: { id: string; name: string } | null; // a real kind='company' project they're linked to, if any
  possibleCompany: { name: string; status: "unreviewed" | "confirmed" } | null; // §65-67: a bio-derived hint, never auto-promoted · null once linkedCompany is set
  linkedinUrl: string | null; // from a captured `linkedin:<url>` alias · a URL found on a source page, not built from a name
  linkedinCandidates: LinkedInCandidate[];
  link: PersonLinkTarget | null;
  profileLinks: ProfileIconLink[];
  otherLinks: OtherSourceLink[];
  education: { excerpt: string; sourceUrl: string | null }[];
  enrollmentStatus: string;
  enrollmentLabel: string | null;
  enrollmentBasis: string | null;
  leftSchool: boolean;
  enrollmentEvidence: string | null;
  enrollmentSourceUrl: string | null;
  verificationStatus: string | null;
  lastVerifiedAt: string | null;
  verificationNote: string | null;
  websiteUrl: string | null; // a personal site found on a source page, stored as a `site:` alias
  sectorTags: string[];
  sourceIds: string[];
  personIds: string[];
  strongestEvidence: string | null; // the most recent claim excerpt attributed to them
  reviewNotes: string[]; // hand-check caveats stored on the person; empty for everyone else
  /** Every campus affiliation on record, so a campus filter can include multi-campus people. */
  campuses: { universityId: string | null; universityName: string | null; status: string | null }[];
  hotspots: RelatedHotspot[];
  promoted: boolean;
  promotionReasonLabel: string | null;
  founderSignal: FounderSignalResult;
  /** A startup they founded has a same-school co-founder with overlapping years. */
  sameSchoolCofounders: boolean;
  /** Points added to Founder Signal. Zero when that score is still unassessed. */
  sameSchoolBonus: number;
}

// Founder Scout's people universe: real people and the project evidence
// attached to them. A hackathon submission is founder evidence, never a
// startup by itself — that's the whole point of keeping this separate from
// listCandidateProjects (Startup Scout), which only ever sees kind='company'.
//
// By default only PROMOTED candidates are returned (FOUNDER_SCOUT_SOURCING.md
// §46/§92: "only promoted founder candidates appear by default") — pass
// includeUnpromoted to see every resolved person, e.g. for a raw/debug count.
// The founder card only reads the signal number and coverage. Dimension
// write-ups, id lists, and unused link duplicates stay on the server so the
// page payload is not carrying them into the browser.
function slimFounder(founder: FounderRow): FounderRow {
  return {
    ...founder,
    founderSignal: {
      founderSignal: founder.founderSignal.founderSignal,
      coverage: founder.founderSignal.coverage,
      dimensions: [],
    },
    personIds: [],
    sourceIds: [],
    sectorTags: [],
    linkedinCandidates: [],
  };
}

export function listFoundersForPage(filters: { universityId?: string; search?: string } = {}): FounderRow[] {
  return listFounders(filters).map(slimFounder);
}

export function listPotentialFoundersForPage(): FounderRow[] {
  return cachedFounders().potential.map(slimFounder);
}

export function listFounders(filters: { universityId?: string; search?: string; includeUnpromoted?: boolean } = {}): FounderRow[] {
  const built = cachedFounders();
  let rows = filters.includeUnpromoted ? built.all : built.promoted;
  if (filters.universityId) {
    const universityId = filters.universityId;
    rows = rows.flatMap((founder) => {
      const match = built.affs.get(founder.id)?.find((a) => a.universityId === universityId);
      if (!match) return [];
      if (match.universityId === founder.universityId && match.status === founder.status) return [founder];
      return [{ ...founder, status: match.status ?? founder.status, universityId: match.universityId, universityName: match.universityName }];
    });
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    rows = rows.filter((founder) => founder.name.toLowerCase().includes(q));
  }
  return rows;
}

function cachedFounders(): { promoted: FounderRow[]; potential: FounderRow[]; all: FounderRow[]; affs: Map<string, { status: string | null; universityId: string | null; universityName: string | null }[]> } {
  const stamp = cacheStamp();
  if (founderMemo?.stamp === stamp) return founderMemo;
  const built = buildFounders();
  founderMemo = { stamp, ...built };
  return founderMemo;
}

function buildFounders(): { promoted: FounderRow[]; potential: FounderRow[]; all: FounderRow[]; affs: Map<string, { status: string | null; universityId: string | null; universityName: string | null }[]> } {
  const db = getDb();
  const sameSchool = sameSchoolIndex();
  const precollegeByPerson = new Map<string, PrecollegeSignalView[]>();
  for (const row of db
    .prepare(
      `SELECT person_id, signal_type, tier, label, year, match_status, source_url
       FROM precollege_signals
       WHERE source_url != '' AND label != ''`
    )
    .all() as {
      person_id: string;
      signal_type: string;
      tier: number;
      label: string;
      year: number | null;
      match_status: string;
      source_url: string;
    }[]) {
    if (!isPrecollegeSignalType(row.signal_type)) continue;
    if (row.match_status !== "confirmed" && row.match_status !== "likely") continue;
    if (row.tier !== 1 && row.tier !== 2) continue;
    const list = precollegeByPerson.get(row.person_id) ?? [];
    list.push({
      signalType: row.signal_type,
      tier: row.tier,
      label: row.label,
      year: row.year,
      matchStatus: row.match_status,
      sourceUrl: row.source_url,
    });
    precollegeByPerson.set(row.person_id, list);
  }

  const programByPerson = new Map<string, ProgramSignalView[]>();
  for (const row of db
    .prepare(
      `SELECT person_id, signal_type, label, year, match_status, source_url, tier, tier_rationale, tier_source_url
       FROM program_signals
       WHERE source_url != '' AND label != ''`
    )
    .all() as {
      person_id: string;
      signal_type: string;
      label: string;
      year: number | null;
      match_status: string;
      source_url: string;
      tier: string | null;
      tier_rationale: string | null;
      tier_source_url: string | null;
    }[]) {
    if (!isProgramSignalType(row.signal_type) || !isProgramMatchStatus(row.match_status)) continue;
    const tier = row.tier === "S+" || row.tier === "S" || row.tier === "A" || row.tier === "B" || row.tier === "C" ? row.tier : null;
    const list = programByPerson.get(row.person_id) ?? [];
    list.push({
      signalType: row.signal_type,
      label: row.label,
      year: row.year,
      matchStatus: row.match_status,
      sourceUrl: row.source_url,
      tier,
      tierRationale: row.tier_rationale,
      tierSourceUrl: row.tier_source_url,
    });
    programByPerson.set(row.person_id, list);
  }

  const notesByPerson = new Map<string, string[]>();
  for (const row of db
    .prepare(`SELECT entity_id, body FROM notes WHERE entity_type = 'person' AND trim(body) != '' ORDER BY created_at`)
    .all() as { entity_id: string; body: string }[]) {
    const list = notesByPerson.get(row.entity_id) ?? [];
    list.push(row.body);
    notesByPerson.set(row.entity_id, list);
  }
  const rows = db
    .prepare(
      `SELECT DISTINCT pe.id as id, pe.name as name, pe.aliases_json as aliases_json, a.status as status, a.university_id as university_id, u.name as university_name,
              pe.enrollment_status as enrollment_status, pe.enrollment_label as enrollment_label,
              pe.enrollment_basis as enrollment_basis,
              pe.enrollment_evidence as enrollment_evidence, pe.enrollment_source_url as enrollment_source_url,
              pe.left_school as left_school,
              pe.founder_status as founder_status, pe.potential_signal as potential_signal,
              pe.signal_tier as signal_tier, pe.signal_tier_basis as signal_tier_basis,
              pe.verification_status as verification_status, pe.last_verified_at as last_verified_at,
              pe.verification_note as verification_note
       FROM people pe
       LEFT JOIN affiliations a ON a.person_id = pe.id
       LEFT JOIN universities u ON u.id = a.university_id
       ORDER BY pe.name,
         CASE a.status WHEN 'current_student' THEN 0 WHEN 'recent_grad' THEN 1 WHEN 'older_alumni' THEN 2 ELSE 3 END`
    )
    .all() as {
      id: string;
      name: string;
      aliases_json: string;
      status: string | null;
      university_id: string | null;
      university_name: string | null;
      enrollment_status: string | null;
      enrollment_label: string | null;
      enrollment_basis: string | null;
      enrollment_evidence: string | null;
      enrollment_source_url: string | null;
      left_school: number | null;
      founder_status: string | null;
      potential_signal: string | null;
      signal_tier: string | null;
      signal_tier_basis: string | null;
      verification_status: string | null;
      last_verified_at: string | null;
      verification_note: string | null;
    }[];

  const unverified = unverifiedLinkedInByPerson(db);
  const profileClaims = profileClaimsByPerson(db);
  const affs = new Map<string, { status: string | null; universityId: string | null; universityName: string | null }[]>();
  const byId = new Map<string, Omit<FounderRow, "promoted" | "promotionReasonLabel" | "founderSignal">>();
  for (const r of rows) {
    const affiliations = affs.get(r.id) ?? [];
    const prior = affiliations.find((item) => item.universityId === r.university_id);
    if (!prior) affiliations.push({ status: r.status, universityId: r.university_id, universityName: r.university_name });
    else if ((!prior.status || prior.status === "unverified") && r.status && r.status !== "unverified") prior.status = r.status;
    affs.set(r.id, affiliations);
    if (byId.has(r.id)) continue;
    const linkedinUrl = linkedinFromAliases(r.aliases_json);
    const linkedinCandidates = linkedinUrl ? [] : (unverified.get(r.id) ?? []);
    const profiles = assembleProfileLinks(r.aliases_json, profileClaims.get(r.id) ?? []);
    let websiteUrl: string | null = null;
    try {
      const aliases = JSON.parse(r.aliases_json || "[]") as string[];
      const site = aliases.find((a) => a.startsWith("site:https://") || a.startsWith("site:http://"));
      if (site) websiteUrl = site.slice("site:".length);
    } catch {
      websiteUrl = null;
    }
    byId.set(r.id, {
      id: r.id,
      name: r.name,
      status: r.status ?? "unverified",
      universityId: r.university_id,
      universityName: r.university_name,
      projects: [],
      linkedCompany: null,
      possibleCompany: null,
      linkedinUrl,
      linkedinCandidates,
      link: bestPersonLink({ aliasesJson: r.aliases_json, linkedinCandidates, websiteUrl }),
      profileLinks: profiles.profileLinks,
      otherLinks: profiles.otherLinks,
      education: [],
      enrollmentStatus: r.enrollment_status ?? "unknown",
      enrollmentLabel: r.enrollment_label,
      enrollmentBasis: r.enrollment_basis,
      leftSchool: r.left_school === 1,
      enrollmentEvidence: r.enrollment_evidence,
      enrollmentSourceUrl: r.enrollment_source_url,
      signalTier: r.signal_tier,
      signalTierBasis: r.signal_tier_basis,
      founderStatus: r.founder_status,
      potentialSignal: r.potential_signal,
      precollegeSignals: bestPrecollegeSignals(precollegeByPerson.get(r.id) ?? []),
      programSignals: bestProgramSignals(programByPerson.get(r.id) ?? []),
      verificationStatus: r.verification_status,
      lastVerifiedAt: r.last_verified_at,
      verificationNote: r.verification_note,
      signalEvidence: null,
      websiteUrl,
      sectorTags: [],
      sourceIds: [],
      personIds: [r.id],
      strongestEvidence: null,
      reviewNotes: notesByPerson.get(r.id) ?? [],
      campuses: [],
      hotspots: [],
      sameSchoolCofounders: false,
      sameSchoolBonus: 0,
    });
  }

  type RoleRow = { person_id: string; id: string; name: string; kind: string; role: string; website_url: string | null; primary_link: string | null; primary_link_kind: string | null; signal_tier: string | null };
  const rolesByPerson = new Map<string, RoleRow[]>();
  const peopleByProject = new Map<string, string[]>();
  const seenRole = new Set<string>();
  for (const row of db
    .prepare(
      `SELECT ppr.person_id as person_id, p.id as id, p.name as name, p.kind as kind, ppr.role as role, p.website_url as website_url, p.primary_link as primary_link, p.primary_link_kind as primary_link_kind, p.signal_tier as signal_tier
       FROM person_project_roles ppr JOIN projects p ON p.id = ppr.project_id
       ORDER BY ppr.rowid`
    )
    .all() as RoleRow[]) {
    const key = `${row.person_id}|${row.id}|${row.role}|${row.kind}|${row.website_url}|${row.primary_link}|${row.primary_link_kind}|${row.signal_tier}`;
    if (seenRole.has(key)) continue;
    seenRole.add(key);
    const list = rolesByPerson.get(row.person_id) ?? [];
    list.push(row);
    rolesByPerson.set(row.person_id, list);
    const people = peopleByProject.get(row.id) ?? [];
    if (!people.includes(row.person_id)) people.push(row.person_id);
    peopleByProject.set(row.id, people);
  }

  const educationByPerson = new Map<string, { excerpt: string; source_url: string | null }[]>();
  for (const row of db
    .prepare(
      `SELECT entity_id, excerpt, source_url FROM claims
       WHERE claim_type IN ('affiliation', 'program_membership', 'program', 'bio_membership')
         AND excerpt IS NOT NULL AND trim(excerpt) != ''
       ORDER BY retrieved_at DESC`
    )
    .all() as { entity_id: string; excerpt: string; source_url: string | null }[]) {
    const list = educationByPerson.get(row.entity_id) ?? [];
    if (list.length >= 3) continue;
    list.push({ excerpt: row.excerpt, source_url: row.source_url });
    educationByPerson.set(row.entity_id, list);
  }

  const latestExcerpt = new Map<string, string | null>();
  for (const row of db
    .prepare(
      `SELECT entity_id, excerpt FROM claims
       WHERE entity_type = 'person'
       ORDER BY CASE WHEN claim_type IN ('linkedin_alias_discovered', 'linkedin_candidate', 'linkedin_search_attempt', 'linkedin_web_search_attempt', 'profile_link') THEN 1 ELSE 0 END,
                retrieved_at DESC`
    )
    .all() as { entity_id: string; excerpt: string | null }[]) {
    if (!latestExcerpt.has(row.entity_id)) latestExcerpt.set(row.entity_id, row.excerpt);
  }

  const possibleByPerson = new Map<string, { company_name_guess: string; match_status: string }>();
  for (const row of db
    .prepare(`SELECT person_id, company_name_guess, match_status FROM possible_companies WHERE match_status != 'rejected' ORDER BY detected_at DESC`)
    .all() as { person_id: string; company_name_guess: string; match_status: string }[]) {
    if (!possibleByPerson.has(row.person_id)) possibleByPerson.set(row.person_id, row);
  }

  const sourcesByPerson = new Map<string, string[]>();
  const seenSource = new Set<string>();
  for (const row of db.prepare(`SELECT entity_id, source_id FROM claims WHERE source_id IS NOT NULL`).all() as { entity_id: string; source_id: string }[]) {
    const key = `${row.entity_id}:${row.source_id}`;
    if (seenSource.has(key)) continue;
    seenSource.add(key);
    const list = sourcesByPerson.get(row.entity_id) ?? [];
    list.push(row.source_id);
    sourcesByPerson.set(row.entity_id, list);
  }

  const tagsByPerson = new Map<string, string[]>();
  const seenTag = new Set<string>();
  for (const row of db
    .prepare(
      `SELECT ppr.person_id as person_id, t.tag as tag FROM project_sector_tags t
       JOIN person_project_roles ppr ON ppr.project_id = t.project_id`
    )
    .all() as { person_id: string; tag: string }[]) {
    const key = `${row.person_id}:${row.tag}`;
    if (seenTag.has(key)) continue;
    seenTag.add(key);
    const list = tagsByPerson.get(row.person_id) ?? [];
    list.push(sectorLabel(row.tag));
    tagsByPerson.set(row.person_id, list);
  }

  const continuedByProject = new Map<string, { current_observation: string; source_date: string | null }>();
  for (const row of db
    .prepare(`SELECT project_id, current_observation, source_date FROM signals WHERE signal_type = 'continued_dev' ORDER BY source_date DESC`)
    .all() as { project_id: string; current_observation: string; source_date: string | null }[]) {
    const existing = continuedByProject.get(row.project_id);
    if (!existing || (row.source_date ?? "") > (existing.source_date ?? "")) continuedByProject.set(row.project_id, row);
  }
  const awardProjects = new Set<string>();
  for (const row of db
    .prepare(`SELECT project_id, current_observation FROM signals WHERE current_observation LIKE '%won a prize%' OR current_observation LIKE '%winner%'`)
    .all() as { project_id: string; current_observation: string }[]) {
    awardProjects.add(row.project_id);
  }

  const sharedCounts = new Map<string, Map<string, number>>();
  for (const [, people] of peopleByProject) {
    for (const personId of people) {
      let counts = sharedCounts.get(personId);
      if (!counts) {
        counts = new Map();
        sharedCounts.set(personId, counts);
      }
      for (const other of people) {
        if (other === personId) continue;
        counts.set(other, (counts.get(other) ?? 0) + 1);
      }
    }
  }
  const repeatCollaborators = new Set<string>();
  for (const [personId, counts] of sharedCounts) {
    for (const shared of counts.values()) {
      if (shared >= 2) {
        repeatCollaborators.add(personId);
        break;
      }
    }
  }

  const signalByPerson = new Map<string, { excerpt: string; sourceUrl: string | null; sourceName: string | null; unverified: boolean }>();
  for (const row of db
    .prepare(
      `SELECT c.entity_id as entity_id, c.excerpt as excerpt, c.source_url as source_url, c.verification_state as verification_state, s.name as source_name
       FROM claims c LEFT JOIN sources s ON s.id = c.source_id
       WHERE c.entity_type = 'person' AND c.claim_type = 'potential_founder_signal' AND trim(c.excerpt) != ''
       ORDER BY CASE WHEN s.name = 'Additional source' THEN 1 ELSE 0 END, c.retrieved_at DESC`
    )
    .all() as { entity_id: string; excerpt: string; source_url: string | null; verification_state: string | null; source_name: string | null }[]) {
    if (signalByPerson.has(row.entity_id)) continue;
    const blob = `${row.source_name ?? ""} ${row.excerpt}`;
    signalByPerson.set(row.entity_id, {
      excerpt: row.excerpt,
      sourceUrl: row.source_url,
      sourceName: row.source_name,
      unverified: row.verification_state === "unverified" && /search[- ]index|search summary|via search/i.test(blob),
    });
  }

  const all: FounderRow[] = [];
  const promoted: FounderRow[] = [];
  const potential: FounderRow[] = [];
  for (const founder of byId.values()) {
    const projects = rolesByPerson.get(founder.id) ?? [];
    const company = projects.find((p) => p.kind === "company");
    const education: { excerpt: string; sourceUrl: string | null }[] = [];
    if (founder.enrollmentEvidence) education.push({ excerpt: founder.enrollmentEvidence, sourceUrl: founder.enrollmentSourceUrl });
    for (const row of educationByPerson.get(founder.id) ?? []) {
      if (education.length >= 4) break;
      if (education.some((item) => item.excerpt === row.excerpt)) continue;
      education.push({ excerpt: row.excerpt, sourceUrl: row.source_url });
    }
    const promotion = evaluatePromotion(projects);
    const neighbors: string[] = [];
    const seenNeighbor = new Set<string>();
    for (const project of projects) {
      for (const other of peopleByProject.get(project.id) ?? []) {
        if (other === founder.id || seenNeighbor.has(other)) continue;
        seenNeighbor.add(other);
        neighbors.push(other);
        if (neighbors.length >= 12) break;
      }
      if (neighbors.length >= 12) break;
    }
    const projectIds = projects.map((p) => p.id);
    let continued: { current_observation: string; source_date: string | null } | null = null;
    for (const id of projectIds) {
      const hit = continuedByProject.get(id);
      if (!hit) continue;
      if (!continued || (hit.source_date ?? "") > (continued.source_date ?? "")) continued = hit;
    }
    const facts: FounderSignalFacts = {
      continuedDev: continued,
      award: projectIds.some((id) => awardProjects.has(id)),
      repeatCollaborator: repeatCollaborators.has(founder.id),
    };
    const scored = computeFounderSignal(db, founder.id, projects, facts);
    const sameSchoolCofounders = sameSchool.people.has(founder.id);
    const founderBonus = scoreBonus(scored.founderSignal, SAME_SCHOOL_FOUNDER_POINTS, sameSchoolCofounders);
    const possible = company ? undefined : possibleByPerson.get(founder.id);
    const row: FounderRow = {
      ...founder,
      sectorTags: tagsByPerson.get(founder.id) ?? [],
      sourceIds: sourcesByPerson.get(founder.id) ?? [],
      personIds: [founder.id, ...neighbors],
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        kind: p.kind,
        role: p.role,
        websiteUrl: p.website_url,
        primaryLink: p.primary_link,
        primaryLinkKind: p.primary_link_kind,
        signalTier: p.signal_tier,
      })),
      education,
      linkedCompany: company ? { id: company.id, name: company.name } : null,
      possibleCompany: possible ? { name: possible.company_name_guess, status: possible.match_status as "unreviewed" | "confirmed" } : null,
      strongestEvidence: latestExcerpt.get(founder.id) ?? null,
      signalEvidence: signalByPerson.get(founder.id) ?? null,
      campuses: affs.get(founder.id) ?? [],
      promoted: promotion.promoted,
      promotionReasonLabel: promotion.reasonLabel,
      founderSignal: { ...scored, founderSignal: founderBonus.score },
      hotspots: relatedHotspotsForPerson(founder.id, founder.universityId),
      sameSchoolCofounders,
      sameSchoolBonus: founderBonus.applied,
    };
    all.push(row);
    // accuracy_audit keeps the row. founder_status "removed" is off both scout lists.
    if (row.founderStatus === "removed") continue;
    if (row.founderStatus === "potential") potential.push(row);
    else if (row.promoted) promoted.push(row);
  }
  return { promoted, potential, all, affs };
}

export function loadLikeTargets(records: FeedbackRecord[]): FeedbackTarget[] {
  const db = getDb();
  const out: FeedbackTarget[] = [];
  for (const record of records) {
    if (record.action !== "like") continue;
    if (record.entityType === "project") {
      const project = db.prepare(`SELECT id, name, website_url, primary_link FROM projects WHERE id = ?`).get(record.entityId) as
        | { id: string; name: string; website_url: string | null; primary_link: string | null }
        | undefined;
      if (!project) continue;
      const sectors = (db.prepare(`SELECT tag FROM project_sector_tags WHERE project_id = ?`).all(project.id) as { tag: string }[]).map((r) => sectorLabel(r.tag));
      const universityIds = (
        db
          .prepare(
            `SELECT DISTINCT a.university_id as id FROM person_project_roles ppr JOIN affiliations a ON a.person_id = ppr.person_id WHERE ppr.project_id = ?
             UNION SELECT target_entity_id FROM relationships WHERE source_entity_type = 'project' AND source_entity_id = ? AND target_entity_type = 'university' AND relationship_type = 'affiliated_with'`
          )
          .all(project.id, project.id) as { id: string }[]
      ).map((r) => r.id);
      const sourceIds = (db.prepare(`SELECT DISTINCT source_id as id FROM claims WHERE entity_id = ? AND source_id IS NOT NULL`).all(project.id) as { id: string }[]).map((r) => r.id);
      const personIds = (
        db.prepare(`SELECT DISTINCT person_id as id FROM person_project_roles WHERE project_id = ? AND role LIKE '%founder%'`).all(project.id) as { id: string }[]
      ).map((r) => r.id);
      out.push({
        entityType: "project",
        entityId: project.id,
        name: project.name,
        domain: domainKey(project.website_url || project.primary_link),
        sectors,
        universityIds,
        sourceIds,
        personIds,
      });
    } else {
      const person = db.prepare(`SELECT id, name FROM people WHERE id = ?`).get(record.entityId) as { id: string; name: string } | undefined;
      if (!person) continue;
      const sectors = (
        db
          .prepare(
            `SELECT DISTINCT t.tag as tag FROM project_sector_tags t JOIN person_project_roles ppr ON ppr.project_id = t.project_id WHERE ppr.person_id = ?`
          )
          .all(person.id) as { tag: string }[]
      ).map((r) => sectorLabel(r.tag));
      const universityIds = (db.prepare(`SELECT university_id as id FROM affiliations WHERE person_id = ?`).all(person.id) as { id: string }[]).map((r) => r.id);
      const sourceIds = (db.prepare(`SELECT DISTINCT source_id as id FROM claims WHERE entity_id = ? AND source_id IS NOT NULL`).all(person.id) as { id: string }[]).map((r) => r.id);
      const personIds = [
        person.id,
        ...(
          db
            .prepare(
              `SELECT DISTINCT other.person_id as id FROM person_project_roles mine JOIN person_project_roles other ON other.project_id = mine.project_id AND other.person_id != mine.person_id WHERE mine.person_id = ? LIMIT 12`
            )
            .all(person.id) as { id: string }[]
        ).map((r) => r.id),
      ];
      out.push({ entityType: "person", entityId: person.id, name: person.name, domain: record.domainKey, sectors, universityIds, sourceIds, personIds });
    }
  }
  return out;
}

export function listSignalsForUniversity(universityId: string) {
  const db = getDb();
  return db
    .prepare(
      `SELECT DISTINCT s.id, p.name as project_name, s.signal_type, s.current_observation, s.source_date, s.significance_note
       FROM signals s
       JOIN projects p ON p.id = s.project_id
       WHERE s.project_id IN (
         SELECT ppr.project_id FROM person_project_roles ppr
         JOIN affiliations a ON a.person_id = ppr.person_id
         WHERE a.university_id = ?
         UNION
         SELECT r.source_entity_id FROM relationships r
         WHERE r.source_entity_type = 'project' AND r.target_entity_type = 'university'
           AND r.relationship_type = 'affiliated_with' AND r.target_entity_id = ?
       )
       ORDER BY COALESCE(s.source_date, s.created_at) DESC`
    )
    .all(universityId, universityId) as { id: string; project_name: string; signal_type: string; current_observation: string; source_date: string | null; significance_note: string | null }[];
}

export function getUniversity(id: string) {
  const db = getDb();
  return db.prepare(`SELECT * FROM universities WHERE id = ?`).get(id) as
    | { id: string; name: string; country: string | null; lat: number | null; lon: number | null; coord_source: string | null }
    | undefined;
}

export function listPortfolioMemberships() {
  const db = getDb();
  return db.prepare(`SELECT matched_name, source_url, category_tags_json, match_status FROM portfolio_memberships ORDER BY matched_name`).all() as {
    matched_name: string; source_url: string; category_tags_json: string; match_status: string;
  }[];
}

export interface PipelineEntryRow {
  status: string;
  next_action: string | null;
  due_date: string | null;
  notes: string | null;
  pass_reason: string | null;
  project_id: string;
  project_name: string;
  website_url: string | null;
  campus_name: string | null;
  blocker: string | null;
}

export function listPipelineEntries(): PipelineEntryRow[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT pe.status, pe.next_action, pe.due_date, pe.notes, pe.pass_reason, p.id as project_id, p.name as project_name, p.website_url as website_url
       FROM pipeline_entries pe JOIN projects p ON p.id = pe.project_id
       ORDER BY pe.updated_at DESC`
    )
    .all() as { status: string; next_action: string | null; due_date: string | null; notes: string | null; pass_reason: string | null; project_id: string; project_name: string; website_url: string | null }[];

  const campusStmt = db.prepare(
    `SELECT DISTINCT u.name as name FROM affiliations a
     JOIN person_project_roles ppr ON ppr.person_id = a.person_id AND ppr.role LIKE '%founder%'
     JOIN universities u ON u.id = a.university_id
     WHERE ppr.project_id = ? LIMIT 1`
  );

  return rows.map((r) => {
    const campus = campusStmt.get(r.project_id) as { name: string } | undefined;
    const gateOutcomes = getGateOutcomesFor(db, r.project_id);
    return { ...r, campus_name: campus?.name ?? null, blocker: primaryBlocker(gateOutcomes) };
  });
}

export interface NetworkNodeDetail {
  id: string;
  name: string;
  kind: string;
  description: string | null;
  websiteUrl: string | null;
  primaryLink: string | null;
  primaryLinkKind: string | null;
  team: {
    personId: string;
    name: string;
    role: string;
    link: PersonLinkTarget | null;
    enrollmentStatus: string | null;
    enrollmentLabel: string | null;
    leftSchool: boolean;
    school: string | null;
  }[]; // every person with a role on this project, role shown as-is · not all team members are founders (§8/§18)
  claims: { excerpt: string; sourceUrl: string; retrievedAt: string }[];
  linkedCompanyId: string | null; // set when kind='company', for a Founder Scout node to deep-link into Startup Scout
}

// A lightweight, evidence-only lookup for any project/company node clicked in
// the Founder Scout network view — unlike getProjectDetail, this works for
// kind='project' nodes too (hackathon submissions etc.), since those never
// appear in listCandidateProjects.
export function getNetworkNodeDetail(id: string): NetworkNodeDetail | null {
  const db = getDb();
  const project = db.prepare(`SELECT id, name, kind, description, website_url, primary_link, primary_link_kind FROM projects WHERE id = ?`).get(id) as
    | { id: string; name: string; kind: string; description: string | null; website_url: string | null; primary_link: string | null; primary_link_kind: string | null }
    | undefined;
  if (!project) return null;
  const unverified = unverifiedLinkedInByPerson(db);

  const team = (
    db
      .prepare(
        `SELECT DISTINCT pe.id as id, pe.name as name, pe.aliases_json as aliases_json, ppr.role as role,
                pe.enrollment_status as enrollment_status, pe.enrollment_label as enrollment_label,
                pe.left_school as left_school,
                (SELECT u.name FROM affiliations a JOIN universities u ON u.id = a.university_id WHERE a.person_id = pe.id LIMIT 1) as school
         FROM person_project_roles ppr JOIN people pe ON pe.id = ppr.person_id WHERE ppr.project_id = ?`
      )
      .all(id) as {
        id: string;
        name: string;
        aliases_json: string;
        role: string;
        enrollment_status: string | null;
        enrollment_label: string | null;
        left_school: number | null;
        school: string | null;
      }[]
  ).map((r) => {
    const linkedinUrl = linkedinFromAliases(r.aliases_json);
    return {
      personId: r.id,
      name: r.name,
      role: r.role,
      link: bestPersonLink({ aliasesJson: r.aliases_json, linkedinCandidates: linkedinUrl ? [] : (unverified.get(r.id) ?? []) }),
      enrollmentStatus: r.enrollment_status,
      enrollmentLabel: r.enrollment_label,
      leftSchool: r.left_school === 1,
      school: r.school,
    };
  });

  const claims = (
    db
      .prepare(
        `SELECT DISTINCT c.excerpt, c.source_url, c.retrieved_at FROM claims c
         WHERE c.entity_id IN (SELECT ppr.person_id FROM person_project_roles ppr WHERE ppr.project_id = ? UNION SELECT ?)
         ORDER BY c.retrieved_at DESC LIMIT 3`
      )
      .all(id, id) as { excerpt: string; source_url: string; retrieved_at: string }[]
  ).map((r) => ({ excerpt: r.excerpt, sourceUrl: r.source_url, retrievedAt: r.retrieved_at }));

  return {
    id: project.id,
    name: project.name,
    kind: project.kind,
    description: project.description,
    websiteUrl: project.website_url,
    primaryLink: project.primary_link,
    primaryLinkKind: project.primary_link_kind,
    team,
    claims,
    linkedCompanyId: project.kind === "company" ? project.id : null,
  };
}
