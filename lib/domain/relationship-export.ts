import { getDb } from "../db/client";
import { readPersonScope } from "./claim-scope";

export const RELATIONSHIP_HEADERS = [
  "person_id",
  "person_name",
  "project_id",
  "role",
  "role_claim_state",
  "role_claim_url",
  "class_year",
  "present_enrollment",
  "present_reason",
  "source_url",
  "source_as_of",
  "left_school",
  "stored_enrollment_status",
  "stored_basis",
  "relationship_id",
  "claim_id",
  "role_excerpt",
  "role_retrieved_at",
  "enrollment_evidence_date",
] as const;

export interface RelationshipExportRow {
  personId: string;
  personName: string;
  projectId: string;
  role: string;
  roleClaimState: string;
  roleClaimUrl: string;
  classYear: string;
  presentEnrollment: string;
  presentReason: string;
  sourceUrl: string;
  sourceAsOf: string;
  leftSchool: string;
  storedStatus: string;
  storedBasis: string;
  relationshipId: string;
  claimId: string;
  roleExcerpt: string;
  roleRetrievedAt: string;
  enrollmentEvidenceDate: string;
}

/** Person-role scope for the projects in this export. Company verification is not copied onto these rows. */
export function relationshipExportRows(projectIds: string[]): RelationshipExportRow[] {
  const allow = new Set(projectIds);
  const rows = getDb().prepare(
    `SELECT pe.id as person_id, pe.name as person_name, ppr.id as relationship_id, ppr.project_id as project_id, ppr.role as role,
            ppr.claim_id as claim_id, c.verification_state as role_claim_state, c.source_url as role_claim_url,
            c.excerpt as role_claim_excerpt, c.retrieved_at as role_retrieved_at,
            pe.enrollment_grad_year as year, y.status as class_year_support, pe.enrollment_status as status, pe.enrollment_basis as basis,
            pe.enrollment_evidence as evidence, pe.enrollment_source_url as source_url, pe.left_school as left_school
     FROM person_project_roles ppr
     JOIN people pe ON pe.id = ppr.person_id
     LEFT JOIN claims c ON c.id = ppr.claim_id
     LEFT JOIN person_class_year_reviews y ON y.person_id = pe.id
     ORDER BY ppr.project_id, pe.id, ppr.id, c.id`
  ).all() as {
    person_id: string; person_name: string; relationship_id: string; project_id: string; role: string | null;
    claim_id: string | null; role_claim_state: string | null; role_claim_url: string | null; role_claim_excerpt: string | null;
    role_retrieved_at: string | null; year: number | null; class_year_support: string | null; status: string | null; basis: string | null;
    evidence: string | null; source_url: string | null; left_school: number | null;
  }[];
  return rows.filter((row) => allow.has(row.project_id)).map((row) => {
    const scope = readPersonScope({
      name: row.person_name,
      year: row.year,
      classYearSupport: row.class_year_support,
      status: row.status,
      basis: row.basis,
      evidence: row.evidence,
      sourceUrl: row.source_url,
      leftSchool: row.left_school === 1,
      roleClaimState: row.role_claim_state,
      roleClaimUrl: row.role_claim_url,
      roleClaimExcerpt: row.role_claim_excerpt,
    });
    return {
      personId: row.person_id,
      personName: row.person_name,
      projectId: row.project_id,
      role: row.role ?? "",
      roleClaimState: scope.roleState,
      roleClaimUrl: row.role_claim_url ?? "",
      classYear: scope.classYearText ?? "",
      presentEnrollment: scope.present,
      presentReason: scope.presentText,
      sourceUrl: row.source_url ?? "",
      sourceAsOf: scope.sourceAsOf ?? "",
      leftSchool: row.left_school === 1 ? "yes" : "",
      storedStatus: row.status ?? "",
      storedBasis: row.basis ?? "",
      relationshipId: row.relationship_id,
      claimId: row.claim_id ?? "",
      roleExcerpt: row.role_claim_excerpt ?? "",
      roleRetrievedAt: row.role_retrieved_at ?? "",
      enrollmentEvidenceDate: scope.sourceAsOf ?? "",
    };
  });
}
