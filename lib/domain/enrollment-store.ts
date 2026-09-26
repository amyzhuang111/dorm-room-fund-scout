import type Database from "better-sqlite3";
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
  db.prepare(
    `UPDATE people
     SET enrollment_status = ?, enrollment_label = ?, enrollment_evidence = ?,
         enrollment_source_url = ?, enrollment_source_id = ?, enrollment_grad_year = ?
     WHERE id = ?`
  ).run(
    decision.status,
    decision.label,
    decision.evidence,
    decision.sourceUrl,
    decision.sourceId,
    decision.gradYear,
    personId
  );
  return decision;
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
