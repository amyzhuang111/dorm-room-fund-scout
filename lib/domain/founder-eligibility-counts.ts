/**
 * Shared person-level eligibility breakdown for the founder directory.
 * Raw promoted founders minus each exclusion reason equals the eligible count
 * used by the snapshot, campus headers, and /data copy.
 */
import { getDb } from "@/lib/db/client";
import { evaluatePromotion } from "@/lib/domain/promotion";
import { isEligibleForFounderDirectory } from "@/lib/domain/founder-status";

export type FounderEligibilityBreakdown = {
  /** Promoted founders before the class-of-2023+ / current-student gate. */
  rawPromoted: number;
  /** Dropped because people.enrollment_status = older_alumni. */
  excludedEnrollmentOlderAlumni: number;
  /**
   * Dropped because the primary affiliation is older_alumni /
   * verified_older_alumni and enrollment is not current_student or recent_grad.
   */
  excludedAffiliationOlderAlumni: number;
  /** Sum of exclusion reasons. */
  excludedTotal: number;
  /** Directory / indexed founders after eligibility. */
  eligible: number;
};

/**
 * Exact raw → exclusion → eligible math. Matches listFounders / buildFounderIndex.
 * Primary affiliation status uses the same ordering as buildFounders.
 */
export function loadFounderEligibilityBreakdown(): FounderEligibilityBreakdown {
  const db = getDb();
  const projectsByPerson = new Map<string, { kind: string; role: string }[]>();
  for (const row of db
    .prepare(
      `SELECT ppr.person_id as person_id, p.kind as kind, ppr.role as role
       FROM person_project_roles ppr JOIN projects p ON p.id = ppr.project_id`,
    )
    .all() as { person_id: string; kind: string; role: string }[]) {
    const list = projectsByPerson.get(row.person_id) ?? [];
    list.push({ kind: row.kind, role: row.role });
    projectsByPerson.set(row.person_id, list);
  }

  const primary = new Map<
    string,
    {
      founderStatus: string | null;
      enrollmentStatus: string | null;
      affiliationStatus: string | null;
    }
  >();
  for (const row of db
    .prepare(
      `SELECT pe.id as id, pe.founder_status as founder_status, pe.enrollment_status as enrollment_status, a.status as status
       FROM people pe
       LEFT JOIN affiliations a ON a.person_id = pe.id
       ORDER BY pe.id,
         CASE a.status WHEN 'current_student' THEN 0 WHEN 'recent_grad' THEN 1 WHEN 'older_alumni' THEN 2 ELSE 3 END`,
    )
    .all() as {
      id: string;
      founder_status: string | null;
      enrollment_status: string | null;
      status: string | null;
    }[]) {
    if (primary.has(row.id)) continue;
    primary.set(row.id, {
      founderStatus: row.founder_status,
      enrollmentStatus: row.enrollment_status,
      affiliationStatus: row.status,
    });
  }

  let rawPromoted = 0;
  let excludedEnrollmentOlderAlumni = 0;
  let excludedAffiliationOlderAlumni = 0;
  let eligible = 0;

  for (const [id, person] of primary) {
    if (person.founderStatus === "removed" || person.founderStatus === "potential") continue;
    if (!evaluatePromotion(projectsByPerson.get(id) ?? []).promoted) continue;
    rawPromoted += 1;
    // Match buildFounders eligibility inputs (enrollment + primary affiliation).
    // Grad year is included so dated older alumni stay out even if status lags.
    // Match buildFounders: enrollment + primary affiliation only.
    const ok = isEligibleForFounderDirectory({
      enrollmentStatus: person.enrollmentStatus,
      affiliationStatus: person.affiliationStatus,
    });
    if (!ok) {
      if (person.enrollmentStatus === "older_alumni") excludedEnrollmentOlderAlumni += 1;
      else excludedAffiliationOlderAlumni += 1;
      continue;
    }
    eligible += 1;
  }

  return {
    rawPromoted,
    excludedEnrollmentOlderAlumni,
    excludedAffiliationOlderAlumni,
    excludedTotal: excludedEnrollmentOlderAlumni + excludedAffiliationOlderAlumni,
    eligible,
  };
}
