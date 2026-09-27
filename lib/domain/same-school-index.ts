import fs from "node:fs";
import { databasePath, getDb } from "../db/client";
import { sameSchoolCofounderHits, yearInText, type CofounderAttendance } from "./same-school";

export interface SameSchoolIndex {
  projects: Set<string>;
  people: Set<string>;
}

let cache: { stamp: string; index: SameSchoolIndex } | null = null;

function stamp(): string {
  try {
    const stat = fs.statSync(databasePath());
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return "missing";
  }
}

export function sameSchoolIndex(): SameSchoolIndex {
  const current = stamp();
  if (cache?.stamp === current) return cache.index;
  const db = getDb();
  const gradYear = new Map<string, number | null>();
  for (const row of db.prepare(`SELECT id, enrollment_grad_year FROM people`).all() as { id: string; enrollment_grad_year: number | null }[]) {
    const year = row.enrollment_grad_year;
    gradYear.set(row.id, year != null && year >= 1970 && year <= 2040 ? year : null);
  }
  const rows = db
    .prepare(
      `SELECT ppr.project_id, ppr.person_id, a.university_id, a.start_date, a.end_date
       FROM person_project_roles ppr
       JOIN projects p ON p.id = ppr.project_id AND p.kind = 'company'
       JOIN affiliations a ON a.person_id = ppr.person_id
       WHERE lower(ppr.role) LIKE '%founder%'`
    )
    .all() as { project_id: string; person_id: string; university_id: string; start_date: string | null; end_date: string | null }[];
  const attendance: CofounderAttendance[] = rows.map((row) => ({
    projectId: row.project_id,
    personId: row.person_id,
    universityId: row.university_id,
    gradYear: gradYear.get(row.person_id) ?? null,
    startYear: yearInText(row.start_date),
    endYear: yearInText(row.end_date),
  }));
  const projects = new Set<string>();
  const people = new Set<string>();
  for (const hit of sameSchoolCofounderHits(attendance)) {
    projects.add(hit.projectId);
    for (const personId of hit.personIds) people.add(personId);
  }
  const index = { projects, people };
  cache = { stamp: current, index };
  return index;
}
