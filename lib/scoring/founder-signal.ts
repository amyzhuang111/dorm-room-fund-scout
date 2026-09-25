// Founder Signal — deterministic, evidence-only dimension scoring for
// Founder Scout (FOUNDER_SCOUT_SOURCING.md §55-56, §108-110). Separate from
// source tier on purpose: "TreeHacks = S, therefore founder score = high" is
// exactly the fallacy this file exists to avoid (§55, §98). Every dimension
// is either backed by a real row in the DB or explicitly "unknown" — unknown
// is never coerced to zero (§109), and a headline number is only ever shown
// once real coverage clears a bar (§51, §108), which — given how thin
// per-person evidence still is (mostly single hackathon-team-membership
// claims, no GitHub-per-founder resolution yet) — most founders will
// legitimately not clear right now. That's the correct, honest outcome, not
// a bug.

import type Database from "better-sqlite3";

export type SignalLevel = "strong" | "medium" | "none";

export interface DimensionResult {
  key: string;
  label: string;
  level: SignalLevel | null; // null = unknown, not zero
  evidence: string | null;
}

export interface FounderSignalResult {
  dimensions: DimensionResult[];
  coverage: number; // fraction of dimensions with real evidence (0-1)
  founderSignal: number | null; // only set once coverage + required dimensions clear the bar
}

const LEVEL_POINTS: Record<SignalLevel, number> = { strong: 100, medium: 60, none: 20 };

// A dimension only "counts" toward coverage/scoring when it has a level —
// projectAmbition, technicalDepth, and momentum currently have no reliable
// deterministic source (no stack-level data, no per-founder recency signal
// beyond same-day ingestion, and ambition is inherently a judgment call) —
// so they always report unknown rather than being guessed at.
export interface FounderSignalFacts {
  continuedDev: { current_observation: string } | null;
  award: boolean;
  repeatCollaborator: boolean;
}

export function computeFounderSignal(
  db: Database.Database,
  personId: string,
  projects: { id: string; kind: string; role: string }[],
  facts?: FounderSignalFacts
): FounderSignalResult {
  const dims: DimensionResult[] = [];

  // 1. Ability to build
  const companyFounder = projects.some((p) => p.kind === "company");
  const leadership = projects.some((p) => /team lead|director|technical lead/i.test(p.role));
  const namedRole = projects.some((p) => !["team_member", "contributor", "unknown", "member", ""].includes(p.role.toLowerCase().trim()));
  if (companyFounder || leadership) {
    dims.push({ key: "ability_to_build", label: "Ability to build", level: "strong", evidence: "Named leadership role or linked company." });
  } else if (namedRole) {
    dims.push({ key: "ability_to_build", label: "Ability to build", level: "medium", evidence: "Specific, named role on a real shipped project." });
  } else if (projects.length > 0) {
    dims.push({ key: "ability_to_build", label: "Ability to build", level: "none", evidence: "Only a generic team-member listing — no differentiated ownership evidence yet." });
  } else {
    dims.push({ key: "ability_to_build", label: "Ability to build", level: null, evidence: null });
  }

  // 2. Technical / domain depth — no structured stack-level evidence exists yet.
  dims.push({ key: "technical_depth", label: "Technical / domain depth", level: null, evidence: null });

  // 3. Repeat building
  const distinctProjects = new Set(projects.map((p) => p.id)).size;
  if (distinctProjects >= 3) {
    dims.push({ key: "repeat_building", label: "Repeat building", level: "strong", evidence: `${distinctProjects} distinct projects on record.` });
  } else if (distinctProjects === 2) {
    dims.push({ key: "repeat_building", label: "Repeat building", level: "medium", evidence: "2 distinct projects on record." });
  } else if (distinctProjects === 1) {
    dims.push({ key: "repeat_building", label: "Repeat building", level: "none", evidence: "Only 1 project on record so far — absence of a second isn't negative evidence." });
  } else {
    dims.push({ key: "repeat_building", label: "Repeat building", level: null, evidence: null });
  }

  // 4. Shipping velocity — real continued-development evidence on any of their projects.
  const projectIds = projects.map((p) => p.id);
  const continuedDev = facts
    ? (facts.continuedDev ?? undefined)
    : projectIds.length > 0
      ? (db
          .prepare(
            `SELECT current_observation, source_date FROM signals WHERE project_id IN (${projectIds.map(() => "?").join(",")}) AND signal_type='continued_dev' ORDER BY source_date DESC LIMIT 1`
          )
          .get(...projectIds) as { current_observation: string; source_date: string | null } | undefined)
      : undefined;
  if (continuedDev) {
    dims.push({ key: "shipping_velocity", label: "Shipping velocity", level: "medium", evidence: continuedDev.current_observation });
  } else {
    dims.push({ key: "shipping_velocity", label: "Shipping velocity", level: null, evidence: null });
  }

  // 5. Project ambition — inherently a judgment call; never inferred deterministically.
  dims.push({ key: "project_ambition", label: "Project ambition", level: null, evidence: null });

  // 6. External validation — a real prize/award recorded against one of their projects.
  const awardHit = facts ? facts.award : projectIds.length > 0
    ? (db
        .prepare(
          `SELECT current_observation FROM signals WHERE project_id IN (${projectIds.map(() => "?").join(",")}) AND (current_observation LIKE '%won a prize%' OR current_observation LIKE '%winner%') LIMIT 1`
        )
        .get(...projectIds) as { current_observation: string } | undefined)
    : undefined;
  if (awardHit) {
    dims.push({ key: "external_validation", label: "External validation", level: "medium", evidence: "Team-level prize/award on record — not individually attributed." });
  } else {
    dims.push({ key: "external_validation", label: "External validation", level: null, evidence: null });
  }

  // 7. Collaborator quality — a real second person co-appearing on 2+ shared projects.
  const repeatCollaborator = facts
    ? facts.repeatCollaborator
    : projectIds.length > 0
      ? (db
          .prepare(
            `SELECT other.person_id as id, COUNT(DISTINCT other.project_id) as shared
             FROM person_project_roles mine
             JOIN person_project_roles other ON other.project_id = mine.project_id AND other.person_id != mine.person_id
             WHERE mine.person_id = ?
             GROUP BY other.person_id
             HAVING shared >= 2
             LIMIT 1`
          )
          .get(personId) as { id: string; shared: number } | undefined)
      : undefined;
  if (repeatCollaborator) {
    dims.push({ key: "collaborator_quality", label: "Collaborator quality", level: "medium", evidence: "At least one recurring collaborator across multiple projects." });
  } else {
    dims.push({ key: "collaborator_quality", label: "Collaborator quality", level: null, evidence: null });
  }

  // 8. Momentum — no reliable recency signal beyond same-day ingestion exists yet.
  dims.push({ key: "momentum", label: "Momentum", level: null, evidence: null });

  const withEvidence = dims.filter((d) => d.level !== null);
  const coverage = dims.length > 0 ? withEvidence.length / dims.length : 0;

  // Required-dimension bar mirrors the company rubric's pattern (lib/scoring/rubric.ts):
  // a headline number needs BOTH real coverage AND the single most load-bearing
  // dimension (ability to build) actually assessed above "none" — otherwise it stays
  // unassessed, which given current evidence depth is the honest default for most people.
  const abilityToBuild = dims.find((d) => d.key === "ability_to_build");
  const meetsBar = coverage >= 0.5 && abilityToBuild?.level != null && abilityToBuild.level !== "none";

  let founderSignal: number | null = null;
  if (meetsBar) {
    const total = withEvidence.reduce((sum, d) => sum + LEVEL_POINTS[d.level as SignalLevel], 0);
    founderSignal = Math.round(total / withEvidence.length);
  }

  return { dimensions: dims, coverage, founderSignal };
}
