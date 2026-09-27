import type Database from "better-sqlite3";
import { inferEnrollment, type EnrollmentBasis, type InferSnippet } from "./enrollment-infer";
import { decideEnrollment, type EnrollmentDecision, type EvidenceSnippet } from "./founder-status";

const SNIPPETS = `
  SELECT c.excerpt as excerpt, c.source_url as source_url, c.source_id as source_id,
         c.claim_type as claim_type, c.value_json as value_json, c.verification_state as verification_state
  FROM claims c
  WHERE c.entity_id = ?
     OR c.id IN (SELECT claim_id FROM affiliations WHERE person_id = ? AND claim_id IS NOT NULL)
     OR c.id IN (SELECT claim_id FROM person_project_roles WHERE person_id = ? AND claim_id IS NOT NULL)
`;

export function recomputePersonEnrollment(db: Database.Database, personId: string): EnrollmentDecision {
  const rows = db.prepare(SNIPPETS).all(personId, personId, personId) as {
    excerpt: string;
    source_url: string | null;
    source_id: string | null;
    claim_type: string | null;
    value_json: string | null;
    verification_state: string | null;
  }[];
  const snippets: EvidenceSnippet[] = rows.map((row) => ({
    excerpt: row.excerpt ?? "",
    sourceUrl: row.source_url,
    sourceId: row.source_id,
    claimType: row.claim_type,
    valueJson: row.value_json,
    verificationState: row.verification_state,
  }));
  const person = db.prepare(`SELECT name FROM people WHERE id = ?`).get(personId) as { name: string } | undefined;
  const decision = decideEnrollment(snippets, { personName: person?.name ?? null });
  let status = decision.status;
  let label = decision.label;
  let evidence = decision.evidence;
  let sourceUrl = decision.sourceUrl;
  let sourceId = decision.sourceId;
  let gradYear = decision.gradYear;
  let basis: EnrollmentBasis = "verified";
  if (decision.status === "unknown") {
    const roles = db.prepare(`SELECT role FROM affiliations WHERE person_id = ? AND role IS NOT NULL`).all(personId) as { role: string }[];
    const campus = db.prepare(`SELECT 1 as ok FROM affiliations WHERE person_id = ? LIMIT 1`).get(personId) as { ok: number } | undefined;
    const founded = db
      .prepare(
        `SELECT cf.value_text as value_text
         FROM person_project_roles ppr
         JOIN company_facts cf ON cf.project_id = ppr.project_id AND cf.fact_key = 'founded_year'
         WHERE ppr.person_id = ? AND ppr.role LIKE '%founder%'`
      )
      .all(personId) as { value_text: string }[];
    const foundedYears: number[] = [];
    for (const row of founded) {
      const year = Number(String(row.value_text).match(/\d{4}/)?.[0]);
      if (year >= 1990 && year <= 2032) foundedYears.push(year);
    }
    const inferred = inferEnrollment({
      personName: person?.name ?? "",
      snippets: snippets.map((row): InferSnippet => ({ excerpt: row.excerpt, sourceUrl: row.sourceUrl, sourceId: row.sourceId })),
      affiliationRoles: roles.map((row) => row.role),
      foundedYears,
      hasCampusAffiliation: Boolean(campus),
    });
    status = inferred.status;
    label = inferred.label;
    evidence = inferred.reason;
    sourceUrl = inferred.sourceUrl ?? snippets[0]?.sourceUrl ?? sourceUrl;
    sourceId = inferred.sourceId ?? snippets[0]?.sourceId ?? sourceId;
    gradYear = inferred.gradYear;
    basis = inferred.basis;
    if (inferred.leftSchool) {
      db.prepare(`UPDATE people SET left_school = 1 WHERE id = ?`).run(personId);
    }
  }
  db.prepare(
    `UPDATE people
     SET enrollment_status = ?, enrollment_label = ?, enrollment_evidence = ?,
         enrollment_source_url = ?, enrollment_source_id = ?, enrollment_grad_year = ?,
         enrollment_basis = ?
     WHERE id = ?`
  ).run(status, label, evidence, sourceUrl, sourceId, gradYear, basis, personId);
  return { status, label, gradYear, evidence, sourceUrl, sourceId };
}

export function recomputeAllEnrollment(db: Database.Database): Record<string, number> {
  const ids = db.prepare(`SELECT id FROM people`).all() as { id: string }[];
  const counts: Record<string, number> = { current_student: 0, recent_grad: 0, older_alumni: 0, unknown: 0 };
  const tx = db.transaction(() => {
    for (const row of ids) {
      const decision = recomputePersonEnrollment(db, row.id);
      counts[decision.status] = (counts[decision.status] ?? 0) + 1;
    }
  });
  tx();
  return counts;
}
