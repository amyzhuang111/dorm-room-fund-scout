import { getDb } from "@/lib/db/client";
import { campusSlug, shortCampusLabel } from "@/lib/domain/campuses";
import {
  programNameSearchHref,
  programPeopleHref,
  sectorPeopleHref,
  type EligibilityExamples,
} from "@/lib/domain/counted-hrefs";
import { listUniversities } from "@/lib/domain/queries";
import { sectorLabel } from "@/lib/domain/sectors";

const PROGRAM_TYPES = `('participated_in_program', 'part_of_program')`;

/** Company rows stored with is_investable_candidate set. Not a live enrollment check. */
export function eligibleCompanyIds(): string[] {
  return (
    getDb().prepare(
      `SELECT id FROM projects WHERE kind = 'company' AND is_investable_candidate = 1 ORDER BY id`,
    ).all() as { id: string }[]
  ).map((row) => row.id);
}

/** Distinct person ids with any role on an eligible company. Founder is not required in the role. */
export function eligibleCompanyRolePersonIds(): string[] {
  return (
    getDb().prepare(
      `SELECT DISTINCT r.person_id AS id
         FROM person_project_roles r
         JOIN projects p ON p.id = r.project_id
        WHERE p.kind = 'company' AND p.is_investable_candidate = 1
        ORDER BY id`,
    ).all() as { id: string }[]
  ).map((row) => row.id);
}

export function pinnedCampuses() {
  return listUniversities().filter((university) => university.lat != null && university.lon != null);
}

/** Affiliations of people stored with founder_status founder. Not the promotion gate. */
export function storedFounderCampuses(): { id: string; name: string; slug: string }[] {
  const ids = getDb()
    .prepare(
      `SELECT DISTINCT a.university_id AS id
         FROM affiliations a
         JOIN people p ON p.id = a.person_id
        WHERE p.founder_status = 'founder' AND a.university_id IS NOT NULL
        ORDER BY a.university_id`,
    )
    .all() as { id: string }[];
  const byId = new Map(listUniversities().map((university) => [university.id, university]));
  return ids.map((row) => {
    const university = byId.get(row.id);
    const name = university?.name || row.id;
    const label = university ? shortCampusLabel(university.id, university.name) : row.id;
    return { id: row.id, name, slug: university ? campusSlug(label) : "" };
  });
}

/** Campuses whose promoted-founder count is above zero. A different list from stored founder status. */
export function promotedFounderCampuses() {
  return listUniversities().filter((university) => university.founderCount > 0);
}

export type ProgramMembership = { id: string; name: string; people: number; href: string };

export function programMemberships(limit = 6): ProgramMembership[] {
  const cap = Math.max(1, Math.min(8, limit));
  const rows = getDb()
    .prepare(
      `SELECT p.id AS id, p.name AS name, COUNT(DISTINCT r.source_entity_id) AS people
         FROM relationships r
         JOIN projects p ON p.id = r.target_entity_id
        WHERE r.relationship_type IN ${PROGRAM_TYPES}
          AND r.source_entity_type = 'person'
          AND p.name IS NOT NULL
          AND trim(p.name) != ''
        GROUP BY p.id
       HAVING people >= 3
        ORDER BY people DESC, p.name COLLATE NOCASE ASC
        LIMIT ?`,
    )
    .all(cap) as { id: string; name: string; people: number }[];
  return rows.map((row) => ({
    id: row.id,
    name: row.name.replace(/\s+/g, " ").trim(),
    people: row.people,
    href: programPeopleHref(row.id),
  }));
}

export function programRecord(programId: string): { id: string; name: string } | null {
  const row = getDb()
    .prepare(`SELECT id, name FROM projects WHERE id = ?`)
    .get(programId) as { id: string; name: string | null } | undefined;
  const name = row?.name?.replace(/\s+/g, " ").trim();
  if (!row || !name) return null;
  return { id: row.id, name };
}

export function programPersonIds(programId: string): string[] {
  return (
    getDb()
      .prepare(
        `SELECT DISTINCT r.source_entity_id AS id
           FROM relationships r
           JOIN projects p ON p.id = r.target_entity_id
          WHERE r.relationship_type IN ${PROGRAM_TYPES}
            AND r.source_entity_type = 'person'
            AND p.id = ?
          ORDER BY id`,
      )
      .all(programId) as { id: string }[]
  ).map((row) => row.id);
}

export type SectorMembership = { id: string; label: string; people: number; href: string };

/** People on eligible companies, grouped by the company's primary sector tag. */
export function sectorMemberships(limit = 6): SectorMembership[] {
  const cap = Math.max(1, Math.min(8, limit));
  const rows = getDb()
    .prepare(
      `SELECT t.tag AS tag, COUNT(DISTINCT r.person_id) AS people
         FROM person_project_roles r
         JOIN projects p ON p.id = r.project_id
         JOIN project_sector_tags t ON t.project_id = p.id AND t.is_primary = 1
        WHERE p.kind = 'company' AND p.is_investable_candidate = 1
        GROUP BY t.tag
        ORDER BY people DESC, t.tag COLLATE NOCASE ASC
        LIMIT ?`,
    )
    .all(cap) as { tag: string; people: number }[];
  return rows.map((row) => ({
    id: row.tag,
    label: sectorLabel(row.tag),
    people: row.people,
    href: sectorPeopleHref(row.tag),
  }));
}

export function sectorPersonIds(tag: string): string[] {
  return (
    getDb()
      .prepare(
        `SELECT DISTINCT r.person_id AS id
           FROM person_project_roles r
           JOIN projects p ON p.id = r.project_id
           JOIN project_sector_tags t ON t.project_id = p.id AND t.is_primary = 1
          WHERE p.kind = 'company' AND p.is_investable_candidate = 1
            AND t.tag = ?
          ORDER BY id`,
      )
      .all(tag) as { id: string }[]
  ).map((row) => row.id);
}

export function resolvePeopleIds(opts: { membership?: string; program?: string; sector?: string }): Set<string> | null {
  const sets: Set<string>[] = [];
  if (opts.membership === "eligible-company-roles") sets.push(new Set(eligibleCompanyRolePersonIds()));
  if (opts.program) sets.push(new Set(programPersonIds(opts.program)));
  if (opts.sector) sets.push(new Set(sectorPersonIds(opts.sector)));
  if (sets.length === 0) return null;
  return sets.reduce((acc, set) => new Set([...acc].filter((id) => set.has(id))));
}

export function describePeopleMembership(
  opts: { membership?: string; program?: string; sector?: string },
  listed: number,
): {
  heading: string;
  detail: string;
  nameSearchHref: string | null;
  nameSearchLabel: string | null;
  counted: number;
} | null {
  const ids = resolvePeopleIds(opts);
  if (!ids) return null;
  const counted = ids.size;
  const exact = listed === counted;
  const heading = exact
    ? `${counted.toLocaleString("en-US")} people in this counted list.`
    : `${listed.toLocaleString("en-US")} people shown of ${counted.toLocaleString("en-US")} in the counted membership.`;
  let detail = exact ? "This list is that counted membership." : "Other filters narrowed this list. The counted membership is unchanged.";
  let nameSearchHref: string | null = null;
  let nameSearchLabel: string | null = null;
  if (opts.program) {
    const program = programRecord(opts.program);
    const name = program?.name || opts.program;
    detail = `${detail} Counted people have a participated_in_program or part_of_program link to ${name}.`;
    nameSearchHref = programNameSearchHref(name);
    nameSearchLabel = `Company and project name search for ${name}`;
  } else if (opts.sector) {
    detail = `${detail} Counted people have a role on an eligible company whose primary sector tag is ${sectorLabel(opts.sector)}. A person in two sectors is counted in both.`;
  } else if (opts.membership === "eligible-company-roles") {
    detail = `${detail} Counted people have any role on an eligible company. The role is not limited to a founder title. The full index is a different list.`;
  }
  return { heading, detail, nameSearchHref, nameSearchLabel, counted };
}

export function loadEligibilityExamples(): EligibilityExamples {
  const db = getDb();
  const company = db
    .prepare(
      `SELECT id, name, verification_status, last_verified_at, verification_note
         FROM projects
        WHERE kind = 'company' AND is_investable_candidate = 1
          AND verification_note IS NOT NULL AND trim(verification_note) != ''
          AND last_verified_at IS NOT NULL AND trim(last_verified_at) != ''
        ORDER BY name COLLATE NOCASE, id
        LIMIT 1`,
    )
    .get() as
    | { id: string; name: string; verification_status: string | null; last_verified_at: string | null; verification_note: string | null }
    | undefined;
  const classYear = db
    .prepare(
      `SELECT pe.id, pe.name, pe.enrollment_grad_year AS year, pe.enrollment_status AS status
         FROM people pe
         JOIN person_project_roles r ON r.person_id = pe.id
         JOIN projects p ON p.id = r.project_id AND p.kind = 'company' AND p.is_investable_candidate = 1
        WHERE pe.enrollment_grad_year IS NOT NULL
          AND pe.enrollment_status IS NOT NULL
          AND trim(pe.enrollment_status) != ''
          AND pe.enrollment_status != 'current_student'
          AND trim(pe.name) != ''
        ORDER BY pe.name COLLATE NOCASE, pe.id
        LIMIT 1`,
    )
    .get() as { id: string; name: string; year: number; status: string } | undefined;
  const unknown = db
    .prepare(
      `SELECT pe.id, pe.name, pe.verification_status AS status, p.name AS company
         FROM people pe
         JOIN person_project_roles r ON r.person_id = pe.id
         JOIN projects p ON p.id = r.project_id AND p.kind = 'company' AND p.is_investable_candidate = 1
        WHERE pe.enrollment_grad_year IS NULL
          AND (pe.enrollment_status IS NULL OR trim(pe.enrollment_status) = '')
          AND trim(pe.name) != ''
          AND trim(p.name) != ''
        ORDER BY pe.name COLLATE NOCASE, pe.id
        LIMIT 1`,
    )
    .get() as { id: string; name: string; status: string | null; company: string } | undefined;
  return {
    company: company
      ? {
          id: company.id,
          name: company.name,
          verificationStatus: company.verification_status || "",
          verifiedAt: company.last_verified_at,
          note: company.verification_note,
        }
      : null,
    classYear: classYear
      ? { id: classYear.id, name: classYear.name, year: classYear.year, enrollmentStatus: classYear.status }
      : null,
    unknown: unknown
      ? { id: unknown.id, name: unknown.name, company: unknown.company, verificationStatus: unknown.status || "" }
      : null,
  };
}
