// Companies the site does NOT count as vetted because nobody has confirmed their
// founders are current students or recent graduates (excluded_reason =
// 'unverified recency'). They are shown only in the labeled "Unverified" view
// and never in the vetted totals. Companies excluded because their founders are
// known to be too old, or because they are faculty startups, are NOT included.
//
// Everything is loaded with a few grouped queries (no per-company queries) and
// memoized per database file version.
import fs from "node:fs";
import { databasePath, getDb } from "../db/client";
import { sectorLabel } from "./sectors";

export const UNVERIFIED_REASON = "unverified recency";

export interface UnverifiedCompany {
  id: string;
  name: string;
  description: string | null;
  website: string | null;
  sector: string | null;
  /** Raw verification_status from the record, e.g. needs_verification. */
  verification: string | null;
  campuses: { id: string; name: string }[];
  people: { name: string; status: string | null }[];
}

export interface UnverifiedPage {
  /** All unverified companies, ignoring filters. */
  totalAll: number;
  /** Companies matching the filters. */
  total: number;
  rows: UnverifiedCompany[];
  /** Campuses ranked by number of unverified companies (all companies, ignoring filters). */
  campusCounts: { id: string; name: string; count: number }[];
}

let memo: { stamp: string; companies: UnverifiedCompany[]; campusCounts: UnverifiedPage["campusCounts"] } | null = null;

function stamp(): string {
  try {
    const st = fs.statSync(databasePath());
    return `${st.mtimeMs}:${st.size}`;
  } catch {
    return "missing";
  }
}

function load() {
  const current = stamp();
  if (memo?.stamp === current) return memo;
  const db = getDb();

  const companies = new Map<string, UnverifiedCompany>();
  for (const r of db
    .prepare(
      `SELECT id, name, description, website_url, verification_status
         FROM projects
        WHERE kind = 'company' AND is_investable_candidate = 0 AND excluded_reason = ?`,
    )
    .all(UNVERIFIED_REASON) as { id: string; name: string; description: string | null; website_url: string | null; verification_status: string | null }[]) {
    companies.set(r.id, {
      id: r.id,
      name: r.name,
      description: r.description?.trim() || null,
      website: r.website_url?.trim() || null,
      sector: null,
      verification: r.verification_status,
      campuses: [],
      people: [],
    });
  }

  const addCampus = (projectId: string, id: string, name: string) => {
    const c = companies.get(projectId);
    if (c && !c.campuses.some((x) => x.id === id)) c.campuses.push({ id, name });
  };
  // Campus a company is reported at (explicit company-campus relationship) ...
  for (const r of db
    .prepare(
      `SELECT r.source_entity_id AS pid, u.id AS uid, u.name AS name
         FROM relationships r
         JOIN universities u ON u.id = r.target_entity_id
        WHERE r.source_entity_type = 'project' AND r.target_entity_type = 'university'
          AND r.relationship_type = 'affiliated_with'`,
    )
    .all() as { pid: string; uid: string; name: string }[]) {
    addCampus(r.pid, r.uid, r.name);
  }
  // ... and campuses of linked people.
  for (const r of db
    .prepare(
      `SELECT DISTINCT ppr.project_id AS pid, u.id AS uid, u.name AS name
         FROM person_project_roles ppr
         JOIN affiliations a ON a.person_id = ppr.person_id
         JOIN universities u ON u.id = a.university_id`,
    )
    .all() as { pid: string; uid: string; name: string }[]) {
    addCampus(r.pid, r.uid, r.name);
  }
  for (const r of db
    .prepare(
      `SELECT ppr.project_id AS pid, pe.name AS name, pe.enrollment_status AS status
         FROM person_project_roles ppr
         JOIN people pe ON pe.id = ppr.person_id
        WHERE trim(pe.name) != ''
        ORDER BY pe.name`,
    )
    .all() as { pid: string; name: string; status: string | null }[]) {
    const c = companies.get(r.pid);
    if (c && !c.people.some((p) => p.name === r.name)) c.people.push({ name: r.name, status: r.status });
  }
  for (const r of db
    .prepare(`SELECT project_id AS pid, tag FROM project_sector_tags ORDER BY is_primary DESC, rowid`)
    .all() as { pid: string; tag: string }[]) {
    const c = companies.get(r.pid);
    if (c && !c.sector && r.tag.trim()) c.sector = sectorLabel(r.tag.trim());
  }

  const list = [...companies.values()];
  // Most informative first: has people, then has a description, then name.
  list.sort(
    (a, b) =>
      Number(b.people.length > 0) - Number(a.people.length > 0) ||
      Number(Boolean(b.description)) - Number(Boolean(a.description)) ||
      a.name.localeCompare(b.name),
  );
  const byCampus = new Map<string, { id: string; name: string; count: number }>();
  for (const c of list) {
    for (const k of c.campuses) {
      const row = byCampus.get(k.id) ?? { id: k.id, name: k.name, count: 0 };
      row.count += 1;
      byCampus.set(k.id, row);
    }
  }
  const campusCounts = [...byCampus.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  memo = { stamp: current, companies: list, campusCounts };
  return memo;
}

export function listUnverifiedCompanies(opts: { campus?: string; q?: string; page?: number; pageSize?: number } = {}): UnverifiedPage {
  const { companies, campusCounts } = load();
  const pageSize = opts.pageSize ?? 40;
  const needle = opts.q?.trim().toLowerCase() ?? "";
  const filtered = companies.filter((c) => {
    if (opts.campus && !c.campuses.some((k) => k.id === opts.campus)) return false;
    if (needle) {
      const hay = `${c.name} ${c.description ?? ""} ${c.sector ?? ""} ${c.people.map((p) => p.name).join(" ")}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(pageCount, Math.max(1, opts.page ?? 1));
  return {
    totalAll: companies.length,
    total: filtered.length,
    rows: filtered.slice((page - 1) * pageSize, page * pageSize),
    campusCounts,
  };
}
