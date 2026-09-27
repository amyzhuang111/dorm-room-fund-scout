import { memberDeniedResponse } from "@/lib/auth/guard";
import { getDb } from "@/lib/db/client";
import { findDuplicates, type CatalogRecord } from "@/lib/domain/user-pipeline";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denied = await memberDeniedResponse();
  if (denied) return denied;
  let body: { name?: string; websiteUrl?: string | null; founderNames?: string[]; ignoreIds?: string[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name = String(body.name ?? "");
  const websiteUrl = body.websiteUrl ? String(body.websiteUrl) : null;
  const founderNames = Array.isArray(body.founderNames) ? body.founderNames.map((item) => String(item)) : [];
  const ignoreIds = Array.isArray(body.ignoreIds) ? body.ignoreIds.map((item) => String(item)) : [];
  const matches = findDuplicates({ name, websiteUrl, founderNames }, catalogRecords(), ignoreIds);
  return Response.json({ matches });
}

function catalogRecords(): CatalogRecord[] {
  const db = getDb();
  const campusByProject = new Map<string, string[]>();
  const addCampus = (projectId: string, campus: string | null) => {
    if (!campus) return;
    const list = campusByProject.get(projectId) ?? [];
    if (!list.includes(campus)) list.push(campus);
    campusByProject.set(projectId, list);
  };
  for (const row of db
    .prepare(
      `SELECT ppr.project_id as project_id, u.name as campus
       FROM person_project_roles ppr
       JOIN affiliations a ON a.person_id = ppr.person_id
       JOIN universities u ON u.id = a.university_id`
    )
    .all() as { project_id: string; campus: string | null }[]) {
    addCampus(row.project_id, row.campus);
  }
  for (const row of db
    .prepare(
      `SELECT r.source_entity_id as project_id, u.name as campus
       FROM relationships r
       JOIN universities u ON u.id = r.target_entity_id
       WHERE r.source_entity_type = 'project' AND r.target_entity_type = 'university'`
    )
    .all() as { project_id: string; campus: string | null }[]) {
    addCampus(row.project_id, row.campus);
  }

  const records: CatalogRecord[] = [];
  for (const row of db.prepare(`SELECT id, name, website_url, primary_link FROM projects WHERE kind = 'company'`).all() as {
    id: string;
    name: string;
    website_url: string | null;
    primary_link: string | null;
  }[]) {
    records.push({
      id: row.id,
      kind: "startup",
      name: row.name,
      campusName: campusByProject.get(row.id)?.join(", ") ?? null,
      websiteUrl: row.website_url || row.primary_link,
      href: `/startup/${row.id}`,
    });
  }

  const people = new Map<string, CatalogRecord>();
  for (const row of db
    .prepare(
      `SELECT pe.id as id, pe.name as name, u.name as campus
       FROM people pe
       LEFT JOIN affiliations a ON a.person_id = pe.id
       LEFT JOIN universities u ON u.id = a.university_id`
    )
    .all() as { id: string; name: string; campus: string | null }[]) {
    const existing = people.get(row.id);
    if (!existing) {
      people.set(row.id, {
        id: row.id,
        kind: "founder",
        name: row.name,
        campusName: row.campus,
        websiteUrl: null,
        href: `/founder/discover?founder=${encodeURIComponent(row.id)}&enroll=current_student,recent_grad,older_alumni`,
      });
    } else if (row.campus && existing.campusName && !existing.campusName.includes(row.campus)) {
      existing.campusName = `${existing.campusName}, ${row.campus}`;
    } else if (row.campus && !existing.campusName) {
      existing.campusName = row.campus;
    }
  }
  records.push(...people.values());
  return records;
}
