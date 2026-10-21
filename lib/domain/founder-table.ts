import { getDb } from "../db/client";
import { campusSlug, shortCampusLabel } from "./campuses";
import { listFoundersForPage } from "./queries";

export interface FounderTableRow {
  id: string;
  name: string;
  tier: string | null;
  campus: string | null;
  campusId: string | null;
  campusSlug: string | null;
  company: string | null;
  companyId: string | null;
  year: number | null;
  signal: string | null;
  signalType: string | null;
  signalAt: string | null;
  score: number | null;
  verified: boolean;
}

export function loadFounderTable(universityId?: string): FounderTableRow[] {
  const db = getDb();
  const years = new Map<string, number>();
  try {
    for (const row of db.prepare(
      `SELECT id as person_id, enrollment_grad_year as year FROM people WHERE enrollment_grad_year IS NOT NULL`
    ).all() as { person_id: string; year: number }[]) {
      if (!years.has(row.person_id)) years.set(row.person_id, row.year);
    }
  } catch {
    // Older databases keep class year off the person row. The column stays blank.
  }
  const signals = new Map<string, { type: string; at: string | null; text: string | null }>();
  for (const row of db.prepare(
    `SELECT ppr.person_id as person_id, s.signal_type as type, s.created_at as at, s.current_observation as text
       FROM signals s
       JOIN person_project_roles ppr ON ppr.project_id = s.project_id
      ORDER BY s.created_at DESC`
  ).all() as { person_id: string; type: string; at: string | null; text: string | null }[]) {
    if (!signals.has(row.person_id)) signals.set(row.person_id, { type: row.type, at: row.at, text: row.text });
  }

  return listFoundersForPage(universityId ? { universityId } : {})
    .filter((founder) => (universityId ? founder.campuses.some((campus) => campus.universityId === universityId) || founder.universityId === universityId : true))
    .map((founder) => {
      const campusId = founder.universityId;
      const signal = signals.get(founder.id);
      return {
        id: founder.id,
        name: founder.name,
        tier: founder.signalTier,
        campus: founder.universityName ? shortCampusLabel(campusId ?? "", founder.universityName) : null,
        campusId,
        campusSlug: campusId && founder.universityName ? campusSlug(shortCampusLabel(campusId, founder.universityName)) : null,
        company: founder.linkedCompany?.name ?? founder.possibleCompany?.name ?? founder.projects.find((project) => project.kind === "company")?.name ?? null,
        companyId: founder.linkedCompany?.id ?? founder.projects.find((project) => project.kind === "company")?.id ?? null,
        year: years.get(founder.id) ?? null,
        signal: signal?.text ?? founder.strongestEvidence,
        signalType: signal?.type ?? null,
        signalAt: signal?.at ?? null,
        score: founder.founderSignal.founderSignal,
        verified: founder.verificationStatus === "confirmed",
      };
    });
}
