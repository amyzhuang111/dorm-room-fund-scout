// Assembles the ProjectFacts a gate function needs, from whatever evidence
// actually exists in the database. Never fills a gap with an assumption —
// absence of a row means the corresponding fact stays null/unknown.

import type Database from "better-sqlite3";
import type { AffiliationStatus, FundingFact, ProjectFacts } from "../screening/gates";

const STATUS_RANK: Record<AffiliationStatus, number> = {
  current_student: 3,
  recent_grad: 2,
  older_alumni: 1,
  unverified: 0,
};

export function assembleProjectFacts(db: Database.Database, projectId: string): ProjectFacts {
  const founderAffiliations = db
    .prepare(
      `SELECT a.status as status, a.claim_id as claim_id
       FROM person_project_roles ppr
       JOIN affiliations a ON a.person_id = ppr.person_id
       WHERE ppr.project_id = ? AND ppr.role LIKE '%founder%'`
    )
    .all(projectId) as { status: AffiliationStatus; claim_id: string | null }[];

  // evidenceDated must track whether the row(s) that actually produced bestStatus
  // are dated, not whether *any* founder row on the project is — otherwise a
  // dated but weaker "older_alumni" affiliation could wrongly mark a stronger,
  // undated "current_student" claim as dated evidence, and pass the affiliation
  // gate on a claim that was never actually corroborated.
  let bestStatus: AffiliationStatus = "unverified";
  let evidenceDated = false;
  for (const row of founderAffiliations) {
    if (STATUS_RANK[row.status] > STATUS_RANK[bestStatus]) {
      bestStatus = row.status;
      evidenceDated = !!row.claim_id;
    } else if (row.status === bestStatus && row.claim_id) {
      evidenceDated = true;
    }
  }

  const fundingRows = db
    .prepare(`SELECT amount, instrument, event_date FROM funding_events WHERE project_id = ?`)
    .all(projectId) as { amount: number | null; instrument: FundingFact["instrument"]; event_date: string | null }[];

  const project = db.prepare(`SELECT sector FROM projects WHERE id = ?`).get(projectId) as { sector: string | null } | undefined;

  const portfolioMatch = db
    .prepare(`SELECT 1 FROM portfolio_memberships WHERE project_id = ? AND match_status = 'confirmed'`)
    .get(projectId);

  return {
    affiliationStatus: bestStatus,
    affiliationEvidenceDated: evidenceDated,
    selfReportedStage: null, // no self-reported stage claim ingested yet for these sources
    verifiedStage: null, // no independent stage corroboration ingested yet
    fundingEvents: fundingRows.map((r) => ({ amount: r.amount, instrument: r.instrument || "unknown", eventDate: r.event_date })),
    businessModelTags: project?.sector ? [project.sector] : [],
    isConfirmedPortfolioMember: !!portfolioMatch,
    fundingAvailability: "unknown",
  };
}
