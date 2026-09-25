import { getDb } from "../db/client";
import { computeRubric, type Ratings } from "../scoring/rubric";
import { computeFounderSignal, type FounderSignalResult } from "../scoring/founder-signal";
import { overallGateStatus, primaryBlocker, type GateOutcome } from "../screening/gates";
import { assignQueue, type Queue } from "./queue";
import { evaluatePromotion } from "./promotion";
import { parseCommunitySignalCategories, type CommunityConfidence, type CommunitySignal } from "./community-signal";
import { catalogueForCampus } from "./source-quality";

export type CoverageState = "not_scanned" | "partial" | "up_to_date" | "needs_attention";

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
  founderCount: number; // Founder Scout: PROMOTED founder candidates only (see lib/domain/promotion.ts) — not every resolved person
  resolvedPersonCount: number; // total distinct people resolved with any affiliation to this campus, promoted or not
  sourcesConfigured: number;
  lastCheckedAt: string | null;
  coverage: CoverageState;
}

export function listUniversities(): UniversitySummary[] {
  const db = getDb();
  const universities = db.prepare(`SELECT id, name, country, lat, lon, coord_source FROM universities ORDER BY name`).all() as {
    id: string; name: string; country: string | null; lat: number | null; lon: number | null; coord_source: string | null;
  }[];

  return universities.map((u) => {
    // A company's campus is normally read off its founders' affiliations —
    // but a real source can evidence a company's campus (e.g. Velocity,
    // Waterloo's accelerator) before any of its founders are individually
    // researched. The `relationships` project→university 'affiliated_with'
    // row (same pattern already used for community/program nodes like Penn
    // Labs) covers that case so a real, sourced company isn't invisible
    // under its own campus filter just because founders aren't named yet.
    const companyCount = (
      db
        .prepare(
          `SELECT COUNT(DISTINCT p.id) c
           FROM projects p
           WHERE p.kind = 'company' AND p.is_investable_candidate = 1
             AND (
               EXISTS (
                 SELECT 1 FROM affiliations a
                 JOIN person_project_roles ppr ON ppr.person_id = a.person_id AND ppr.role LIKE '%founder%'
                 WHERE ppr.project_id = p.id AND a.university_id = ?
               )
               OR EXISTS (
                 SELECT 1 FROM relationships r
                 WHERE r.source_entity_type = 'project' AND r.source_entity_id = p.id
                   AND r.target_entity_type = 'university' AND r.target_entity_id = ?
                   AND r.relationship_type = 'affiliated_with'
               )
             )`
        )
        .get(u.id, u.id) as { c: number }
    ).c;

    const resolvedPersonCount = (
      db.prepare(`SELECT COUNT(DISTINCT person_id) c FROM affiliations WHERE university_id = ?`).get(u.id) as { c: number }
    ).c;
    // Promoted candidates only — see lib/domain/promotion.ts. Cheap at this
    // data scale (hundreds of people, not tens of thousands); revisit if that changes.
    const founderCount = listFounders({ universityId: u.id }).length;

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
    };
  });
}

export interface CandidateSummary {
  id: string;
  name: string;
  sector: string | null;
  description: string | null;
  websiteUrl: string | null;
  founders: string[];
  universities: string[]; // names
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
export function listCandidateProjects(filters: { universityId?: string; queue?: Queue; sector?: string; search?: string } = {}): CandidateSummary[] {
  const db = getDb();
  const projects = db
    .prepare(`SELECT id, name, sector, description, website_url, is_portfolio_reference FROM projects WHERE kind='company' AND is_investable_candidate=1 ORDER BY name`)
    .all() as { id: string; name: string; sector: string | null; description: string | null; website_url: string | null; is_portfolio_reference: number }[];

  const out: CandidateSummary[] = [];
  for (const p of projects) {
    const founders = (
      db
        .prepare(
          `SELECT DISTINCT pe.name as name FROM person_project_roles ppr JOIN people pe ON pe.id = ppr.person_id WHERE ppr.project_id = ? AND ppr.role LIKE '%founder%'`
        )
        .all(p.id) as { name: string }[]
    ).map((r) => r.name);

    // Same founder-affiliation-or-direct-relationship fallback as
    // listUniversities()'s companyCount above.
    const universities = (
      db
        .prepare(
          `SELECT DISTINCT u.name as name, u.id as id FROM affiliations a
           JOIN person_project_roles ppr ON ppr.person_id = a.person_id AND ppr.role LIKE '%founder%'
           JOIN universities u ON u.id = a.university_id
           WHERE ppr.project_id = ?
           UNION
           SELECT DISTINCT u.name as name, u.id as id FROM relationships r
           JOIN universities u ON u.id = r.target_entity_id
           WHERE r.source_entity_type = 'project' AND r.source_entity_id = ?
             AND r.target_entity_type = 'university' AND r.relationship_type = 'affiliated_with'`
        )
        .all(p.id, p.id) as { name: string; id: string }[]
    );

    if (filters.universityId && !universities.some((u) => u.id === filters.universityId)) continue;
    if (filters.sector && p.sector !== filters.sector) continue;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const haystack = `${p.name} ${p.description ?? ""} ${founders.join(" ")}`.toLowerCase();
      if (!haystack.includes(q)) continue;
    }

    const gateOutcomes = getGateOutcomesFor(db, p.id);
    const overallGate = gateOutcomes.length ? overallGateStatus(gateOutcomes) : null;

    const latestAssessment = db
      .prepare(`SELECT ratings_json, coverage, quality_score FROM assessments WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`)
      .get(p.id) as { ratings_json: string; coverage: number; quality_score: number | null } | undefined;

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

    // "An explicit milestone or revisit date is on record" — any pipeline entry with a
    // due date qualifies, independent of its current stage (decoupled from the pipeline
    // status enum on purpose, since "Watching" as a status was consolidated away).
    const watchRow = db.prepare(`SELECT due_date FROM pipeline_entries WHERE project_id = ? AND due_date IS NOT NULL`).get(p.id);

    const queue = assignQueue({
      isPortfolioReference: !!p.is_portfolio_reference,
      overallGate,
      hasHeadlineScore: qualityScore != null,
      hasWatchMilestone: !!watchRow,
    });

    if (filters.queue && queue !== filters.queue) continue;

    const latestSignal = db
      .prepare(`SELECT current_observation FROM signals WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`)
      .get(p.id) as { current_observation: string } | undefined;

    const placeRow = db
      .prepare(
        `SELECT json_extract(value_json, '$.location') AS loc FROM claims
         WHERE entity_type = 'project' AND entity_id = ? AND json_extract(value_json, '$.location') IS NOT NULL
           AND trim(json_extract(value_json, '$.location')) != ''
         LIMIT 1`
      )
      .get(p.id) as { loc: string } | undefined;

    out.push({
      id: p.id,
      name: p.name,
      sector: p.sector,
      description: p.description,
      websiteUrl: p.website_url,
      founders,
      universities: universities.map((u) => u.name),
      overallGate,
      gateOutcomes,
      queue,
      qualityScore,
      coverage,
      strongestSignalKey,
      openQuestion,
      latestSignalNote: latestSignal?.current_observation ?? null,
      recordedPlace: placeRow?.loc ?? null,
    });
  }
  return out;
}

export interface ClaimRow {
  id: string;
  claimType: string;
  excerpt: string;
  sourceUrl: string;
  publishedDate: string | null;
  retrievedAt: string;
  label: string;
  verificationState: string;
}

export interface ProjectDetail extends CandidateSummary {
  claims: ClaimRow[];
  signals: { id: string; signalType: string; currentObservation: string; sourceDate: string | null; significanceNote: string | null }[];
  pipeline: { status: string; nextAction: string | null; dueDate: string | null; notes: string | null; passReason: string | null } | null;
  manualNotes: ManualNote[];
  assessmentHistory: AssessmentHistoryRow[];
}

export function getProjectDetail(id: string): ProjectDetail | null {
  const db = getDb();
  const summary = listCandidateProjects().find((c) => c.id === id);
  if (!summary) return null;

  const claims = (
    db
      .prepare(
        `SELECT DISTINCT c.id, c.claim_type, c.excerpt, c.source_url, c.published_date, c.retrieved_at, c.label, c.verification_state
         FROM claims c
         WHERE c.entity_id IN (
           SELECT ppr.person_id FROM person_project_roles ppr WHERE ppr.project_id = ?
           UNION SELECT ?
         )
         ORDER BY c.retrieved_at DESC`
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
      }[]
  ).map((r) => ({
    id: r.id,
    claimType: r.claim_type,
    excerpt: r.excerpt,
    sourceUrl: r.source_url,
    publishedDate: r.published_date,
    retrievedAt: r.retrieved_at,
    label: r.label,
    verificationState: r.verification_state,
  }));

  const signals = (
    db
      .prepare(`SELECT id, signal_type, current_observation, source_date, significance_note FROM signals WHERE project_id = ? ORDER BY created_at DESC`)
      .all(id) as { id: string; signal_type: string; current_observation: string; source_date: string | null; significance_note: string | null }[]
  ).map((r) => ({ id: r.id, signalType: r.signal_type, currentObservation: r.current_observation, sourceDate: r.source_date, significanceNote: r.significance_note }));

  const pipeline = db
    .prepare(`SELECT status, next_action, due_date, notes, pass_reason FROM pipeline_entries WHERE project_id = ?`)
    .get(id) as { status: string; next_action: string | null; due_date: string | null; notes: string | null; pass_reason: string | null } | undefined;

  return {
    ...summary,
    claims,
    signals,
    pipeline: pipeline
      ? { status: pipeline.status, nextAction: pipeline.next_action, dueDate: pipeline.due_date, notes: pipeline.notes, passReason: pipeline.pass_reason }
      : null,
    manualNotes: listNotesFor("project", id),
    assessmentHistory: listAssessmentHistory(id),
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

export function listBuildersForUniversity(universityId: string) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT DISTINCT pe.id as id, pe.name as name, a.status as status
       FROM affiliations a JOIN people pe ON pe.id = a.person_id
       WHERE a.university_id = ?
       ORDER BY pe.name`
    )
    .all(universityId) as { id: string; name: string; status: string }[];

  return rows.map((r) => {
    const projects = (
      db
        .prepare(`SELECT DISTINCT p.name as name FROM person_project_roles ppr JOIN projects p ON p.id = ppr.project_id WHERE ppr.person_id = ?`)
        .all(r.id) as { name: string }[]
    ).map((x) => x.name);
    return { id: r.id, name: r.name, status: r.status, projects };
  });
}

export interface FounderRow {
  id: string;
  name: string;
  status: string;
  universityId: string | null;
  universityName: string | null;
  projects: { id: string; name: string; kind: string; role: string }[];
  linkedCompany: { id: string; name: string } | null; // a real kind='company' project they're linked to, if any
  possibleCompany: { name: string; status: "unreviewed" | "confirmed" } | null; // §65-67: a bio-derived hint, never auto-promoted — null once linkedCompany is set
  linkedinUrl: string | null; // from a captured `linkedin:<url>` alias (see fetch-penn-electric-racing.ts / fetch-linkedin-apify.ts) — a real self-disclosed link, not a search result
  strongestEvidence: string | null; // the most recent claim excerpt attributed to them
  promoted: boolean;
  promotionReasonLabel: string | null;
  founderSignal: FounderSignalResult;
}

// Founder Scout's people universe: real people and the project evidence
// attached to them. A hackathon submission is founder evidence, never a
// startup by itself — that's the whole point of keeping this separate from
// listCandidateProjects (Startup Scout), which only ever sees kind='company'.
//
// By default only PROMOTED candidates are returned (FOUNDER_SCOUT_SOURCING.md
// §46/§92: "only promoted founder candidates appear by default") — pass
// includeUnpromoted to see every resolved person, e.g. for a raw/debug count.
export function listFounders(filters: { universityId?: string; search?: string; includeUnpromoted?: boolean } = {}): FounderRow[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT DISTINCT pe.id as id, pe.name as name, pe.aliases_json as aliases_json, a.status as status, a.university_id as university_id, u.name as university_name
       FROM people pe
       LEFT JOIN affiliations a ON a.person_id = pe.id
       LEFT JOIN universities u ON u.id = a.university_id
       ORDER BY pe.name`
    )
    .all() as { id: string; name: string; aliases_json: string; status: string | null; university_id: string | null; university_name: string | null }[];

  const byId = new Map<string, Omit<FounderRow, "promoted" | "promotionReasonLabel" | "founderSignal">>();
  for (const r of rows) {
    if (filters.universityId && r.university_id !== filters.universityId) continue;
    const existing = byId.get(r.id);
    if (existing) continue; // keep first affiliation row if a person somehow has several
    if (filters.search && !r.name.toLowerCase().includes(filters.search.toLowerCase())) continue;
    let linkedinUrl: string | null = null;
    try {
      const aliases: string[] = JSON.parse(r.aliases_json || "[]");
      const li = aliases.find((a) => a.startsWith("linkedin:"));
      if (li) linkedinUrl = li.replace("linkedin:", "");
    } catch {
      // malformed aliases_json — leave linkedinUrl null rather than throw
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
      strongestEvidence: null,
    });
  }

  const projectStmt = db.prepare(
    `SELECT DISTINCT p.id as id, p.name as name, p.kind as kind, ppr.role as role FROM person_project_roles ppr JOIN projects p ON p.id = ppr.project_id WHERE ppr.person_id = ?`
  );
  const claimStmt = db.prepare(`SELECT excerpt FROM claims WHERE entity_id = ? ORDER BY retrieved_at DESC LIMIT 1`);
  // §65-67: only surfaced when there's no confirmed linkedCompany already —
  // a bio-derived hint adds nothing once the real relationship is known.
  const possibleCompanyStmt = db.prepare(
    `SELECT company_name_guess, match_status FROM possible_companies WHERE person_id = ? AND match_status != 'rejected' ORDER BY detected_at DESC LIMIT 1`
  );

  const out: FounderRow[] = [];
  for (const founder of byId.values()) {
    const projects = projectStmt.all(founder.id) as { id: string; name: string; kind: string; role: string }[];
    const company = projects.find((p) => p.kind === "company");
    const claim = claimStmt.get(founder.id) as { excerpt: string } | undefined;
    const promotion = evaluatePromotion(projects);
    if (!filters.includeUnpromoted && !promotion.promoted) continue;

    const possible = company ? undefined : (possibleCompanyStmt.get(founder.id) as { company_name_guess: string; match_status: string } | undefined);

    out.push({
      ...founder,
      projects,
      linkedCompany: company ? { id: company.id, name: company.name } : null,
      possibleCompany: possible ? { name: possible.company_name_guess, status: possible.match_status as "unreviewed" | "confirmed" } : null,
      strongestEvidence: claim?.excerpt ?? null,
      promoted: promotion.promoted,
      promotionReasonLabel: promotion.reasonLabel,
      founderSignal: computeFounderSignal(db, founder.id, projects),
    });
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
       JOIN person_project_roles ppr ON ppr.project_id = p.id
       JOIN affiliations a ON a.person_id = ppr.person_id
       WHERE a.university_id = ?
       ORDER BY s.created_at DESC`
    )
    .all(universityId) as { id: string; project_name: string; signal_type: string; current_observation: string; source_date: string | null; significance_note: string | null }[];
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
  campus_name: string | null;
  blocker: string | null;
}

export function listPipelineEntries(): PipelineEntryRow[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT pe.status, pe.next_action, pe.due_date, pe.notes, pe.pass_reason, p.id as project_id, p.name as project_name
       FROM pipeline_entries pe JOIN projects p ON p.id = pe.project_id
       ORDER BY pe.updated_at DESC`
    )
    .all() as { status: string; next_action: string | null; due_date: string | null; notes: string | null; pass_reason: string | null; project_id: string; project_name: string }[];

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
  team: { name: string; role: string }[]; // every person with a role on this project, role shown as-is — not all team members are founders (§8/§18)
  claims: { excerpt: string; sourceUrl: string; retrievedAt: string }[];
  linkedCompanyId: string | null; // set when kind='company', for a Founder Scout node to deep-link into Startup Scout
}

// A lightweight, evidence-only lookup for any project/company node clicked in
// the Founder Scout network view — unlike getProjectDetail, this works for
// kind='project' nodes too (hackathon submissions etc.), since those never
// appear in listCandidateProjects.
export function getNetworkNodeDetail(id: string): NetworkNodeDetail | null {
  const db = getDb();
  const project = db.prepare(`SELECT id, name, kind FROM projects WHERE id = ?`).get(id) as { id: string; name: string; kind: string } | undefined;
  if (!project) return null;

  const team = (
    db
      .prepare(
        `SELECT DISTINCT pe.name as name, ppr.role as role FROM person_project_roles ppr JOIN people pe ON pe.id = ppr.person_id WHERE ppr.project_id = ?`
      )
      .all(id) as { name: string; role: string }[]
  ).map((r) => ({ name: r.name, role: r.role }));

  const claims = (
    db
      .prepare(
        `SELECT DISTINCT c.excerpt, c.source_url, c.retrieved_at FROM claims c
         WHERE c.entity_id IN (SELECT ppr.person_id FROM person_project_roles ppr WHERE ppr.project_id = ? UNION SELECT ?)
         ORDER BY c.retrieved_at DESC LIMIT 3`
      )
      .all(id, id) as { excerpt: string; source_url: string; retrieved_at: string }[]
  ).map((r) => ({ excerpt: r.excerpt, sourceUrl: r.source_url, retrievedAt: r.retrieved_at }));

  return { id: project.id, name: project.name, kind: project.kind, team, claims, linkedCompanyId: project.kind === "company" ? project.id : null };
}
