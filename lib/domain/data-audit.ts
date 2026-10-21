// Consistency checks for the campus database and hotspot directory.
// Fails closed on duplicate program names, one program tied to two campuses,
// and links whose target row is gone. Hackathon projects that share a short
// name stay out of this check unless they are campus programs.

import type Database from "better-sqlite3";
import { parseCsv, placeKeyOf } from "./hotspot-model";

const ORG_DROP = new Set(["program", "programme", "programs", "organization", "organisation", "org"]);

const CAMPUS_TOKENS = new Set([
  "berkeley",
  "stanford",
  "harvard",
  "penn",
  "upenn",
  "mit",
  "yale",
  "princeton",
  "columbia",
  "cornell",
  "brown",
  "dartmouth",
  "duke",
  "uchicago",
  "chicago",
  "cmu",
  "waterloo",
  "caltech",
  "rice",
  "michigan",
  "toronto",
  "ucla",
  "usc",
  "nyu",
  "oxford",
  "cambridge",
  "uiuc",
  "gatech",
]);

// Whole-key aliases. Applied only after token cleanup, so a short company
// name is not rewritten unless that exact key is the whole name.
const ORG_ABBREV: Record<string, string> = {
  "e at b": "entrepreneurs",
  eb: "entrepreneurs",
  bair: "berkeley artificial intelligence research",
  sail: "stanford artificial intelligence laboratory",
};

export function normalizeOrgName(name: string): string {
  const stripped = name.replace(/\([^)]*\)/g, " ");
  const text = stripped.toLowerCase().replace(/&/g, " and ").replace(/@/g, " at ").replace(/[^a-z0-9\s]/g, " ");
  let tokens = text
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => (token === "fellows" ? "fellow" : token))
    .filter((token) => !ORG_DROP.has(token));
  while (tokens[0] === "the") tokens.shift();
  while (tokens[tokens.length - 1] === "the") tokens.pop();
  const at = tokens.lastIndexOf("at");
  if (at > 0 && at < tokens.length - 1 && tokens.slice(at + 1).every((token) => CAMPUS_TOKENS.has(token))) {
    tokens = tokens.slice(0, at);
  }
  const key = tokens.join(" ");
  return ORG_ABBREV[key] ?? key;
}

export type AuditIssue = {
  code: "duplicate_org_name" | "conflicting_campus" | "orphan_link" | "duplicate_linkedin" | "hotspot_url_conflict";
  entityId: string;
  detail: string;
};

type OrgRow = { id: string; name: string };

function linkedinSlug(raw: string): string | null {
  const match = raw.match(/linkedin\.com\/in\/([A-Za-z0-9_%-]+)/i);
  if (!match) return null;
  let slug = match[1];
  try {
    slug = decodeURIComponent(slug);
  } catch {
    // keep the raw slug
  }
  slug = slug.toLowerCase().replace(/[-_]+$/g, "");
  return slug.length >= 2 ? slug : null;
}

function hostOf(url: string): string | null {
  const match = url.match(/https?:\/\/([^/\s]+)/i);
  if (!match) return null;
  return match[1].toLowerCase().replace(/^www\./, "");
}

function orgLikeProjects(db: Database.Database): OrgRow[] {
  return db
    .prepare(
      `SELECT p.id, p.name FROM projects p
       WHERE p.kind = 'project' AND (
         p.id IN (
           SELECT source_entity_id FROM relationships
           WHERE relationship_type = 'affiliated_with' AND source_entity_type = 'project' AND target_entity_type = 'university'
         )
         OR p.id IN (
           SELECT project_id FROM person_project_roles GROUP BY project_id HAVING COUNT(DISTINCT person_id) >= 8
         )
         OR p.id IN (
           SELECT target_entity_id FROM relationships
           WHERE relationship_type = 'part_of_program' AND target_entity_type = 'project'
         )
       )`
    )
    .all() as OrgRow[];
}

function duplicateOrgNames(db: Database.Database): AuditIssue[] {
  const groups = new Map<string, OrgRow[]>();
  for (const row of orgLikeProjects(db)) {
    const key = normalizeOrgName(row.name);
    if (key.length < 4) continue;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  const issues: AuditIssue[] = [];
  for (const [key, rows] of groups) {
    if (rows.length < 2) continue;
    issues.push({
      code: "duplicate_org_name",
      entityId: rows.map((row) => row.id).join(","),
      detail: `Normalized name "${key}" is shared by ${rows.map((row) => `${row.name} (${row.id})`).join("; ")}`,
    });
  }
  return issues;
}

function conflictingCampuses(db: Database.Database): AuditIssue[] {
  const ids = new Set(orgLikeProjects(db).map((row) => row.id));
  if (ids.size === 0) return [];
  const rows = db
    .prepare(
      `SELECT p.id, p.name, r.target_entity_id AS university_id
       FROM projects p
       JOIN relationships r ON r.source_entity_type = 'project' AND r.source_entity_id = p.id
         AND r.target_entity_type = 'university' AND r.relationship_type = 'affiliated_with'
       WHERE p.kind = 'project'`
    )
    .all() as { id: string; name: string; university_id: string }[];
  const byProject = new Map<string, { name: string; campuses: Set<string> }>();
  for (const row of rows) {
    if (!ids.has(row.id)) continue;
    const entry = byProject.get(row.id) ?? { name: row.name, campuses: new Set<string>() };
    entry.campuses.add(row.university_id);
    byProject.set(row.id, entry);
  }
  const issues: AuditIssue[] = [];
  for (const [id, entry] of byProject) {
    if (entry.campuses.size < 2) continue;
    issues.push({
      code: "conflicting_campus",
      entityId: id,
      detail: `${entry.name} is affiliated with ${[...entry.campuses].sort().join(", ")}`,
    });
  }
  return issues;
}

function countMissing(db: Database.Database, sql: string): number {
  const row = db.prepare(sql).get() as { n: number };
  return row.n;
}

function orphanLinks(db: Database.Database): AuditIssue[] {
  const checks: { id: string; sql: string }[] = [
    { id: "person_project_roles.person_id", sql: `SELECT COUNT(*) AS n FROM person_project_roles r LEFT JOIN people p ON p.id = r.person_id WHERE p.id IS NULL` },
    { id: "person_project_roles.project_id", sql: `SELECT COUNT(*) AS n FROM person_project_roles r LEFT JOIN projects p ON p.id = r.project_id WHERE p.id IS NULL` },
    { id: "person_project_roles.claim_id", sql: `SELECT COUNT(*) AS n FROM person_project_roles r LEFT JOIN claims c ON c.id = r.claim_id WHERE r.claim_id IS NOT NULL AND c.id IS NULL` },
    { id: "affiliations.person_id", sql: `SELECT COUNT(*) AS n FROM affiliations a LEFT JOIN people p ON p.id = a.person_id WHERE p.id IS NULL` },
    { id: "affiliations.university_id", sql: `SELECT COUNT(*) AS n FROM affiliations a LEFT JOIN universities u ON u.id = a.university_id WHERE u.id IS NULL` },
    { id: "affiliations.claim_id", sql: `SELECT COUNT(*) AS n FROM affiliations a LEFT JOIN claims c ON c.id = a.claim_id WHERE a.claim_id IS NOT NULL AND c.id IS NULL` },
    { id: "claims.person", sql: `SELECT COUNT(*) AS n FROM claims c LEFT JOIN people p ON p.id = c.entity_id WHERE c.entity_type = 'person' AND p.id IS NULL` },
    { id: "claims.project", sql: `SELECT COUNT(*) AS n FROM claims c LEFT JOIN projects p ON p.id = c.entity_id WHERE c.entity_type = 'project' AND p.id IS NULL` },
    { id: "relationships.source.person", sql: `SELECT COUNT(*) AS n FROM relationships r LEFT JOIN people p ON p.id = r.source_entity_id WHERE r.source_entity_type = 'person' AND p.id IS NULL` },
    { id: "relationships.source.project", sql: `SELECT COUNT(*) AS n FROM relationships r LEFT JOIN projects p ON p.id = r.source_entity_id WHERE r.source_entity_type = 'project' AND p.id IS NULL` },
    { id: "relationships.source.university", sql: `SELECT COUNT(*) AS n FROM relationships r LEFT JOIN universities u ON u.id = r.source_entity_id WHERE r.source_entity_type = 'university' AND u.id IS NULL` },
    { id: "relationships.target.person", sql: `SELECT COUNT(*) AS n FROM relationships r LEFT JOIN people p ON p.id = r.target_entity_id WHERE r.target_entity_type = 'person' AND p.id IS NULL` },
    { id: "relationships.target.project", sql: `SELECT COUNT(*) AS n FROM relationships r LEFT JOIN projects p ON p.id = r.target_entity_id WHERE r.target_entity_type = 'project' AND p.id IS NULL` },
    { id: "relationships.target.university", sql: `SELECT COUNT(*) AS n FROM relationships r LEFT JOIN universities u ON u.id = r.target_entity_id WHERE r.target_entity_type = 'university' AND u.id IS NULL` },
    { id: "entity_redirects.person", sql: `SELECT COUNT(*) AS n FROM entity_redirects e LEFT JOIN people p ON p.id = e.survivor_id WHERE e.entity_type = 'person' AND p.id IS NULL` },
    { id: "entity_redirects.project", sql: `SELECT COUNT(*) AS n FROM entity_redirects e LEFT JOIN projects p ON p.id = e.survivor_id WHERE e.entity_type = 'project' AND p.id IS NULL` },
    { id: "program_signals.person_id", sql: `SELECT COUNT(*) AS n FROM program_signals s LEFT JOIN people p ON p.id = s.person_id WHERE p.id IS NULL` },
    { id: "program_signals.claim_id", sql: `SELECT COUNT(*) AS n FROM program_signals s LEFT JOIN claims c ON c.id = s.claim_id WHERE s.claim_id IS NOT NULL AND c.id IS NULL` },
    { id: "company_facts.project_id", sql: `SELECT COUNT(*) AS n FROM company_facts f LEFT JOIN projects p ON p.id = f.project_id WHERE p.id IS NULL` },
    { id: "precollege_signals.person_id", sql: `SELECT COUNT(*) AS n FROM precollege_signals s LEFT JOIN people p ON p.id = s.person_id WHERE p.id IS NULL` },
    { id: "funding_events.project_id", sql: `SELECT COUNT(*) AS n FROM funding_events f LEFT JOIN projects p ON p.id = f.project_id WHERE p.id IS NULL` },
    { id: "funding_events.claim_id", sql: `SELECT COUNT(*) AS n FROM funding_events f LEFT JOIN claims c ON c.id = f.claim_id WHERE f.claim_id IS NOT NULL AND c.id IS NULL` },
  ];
  const issues: AuditIssue[] = [];
  for (const check of checks) {
    const n = countMissing(db, check.sql);
    if (n > 0) issues.push({ code: "orphan_link", entityId: check.id, detail: `${n} orphaned ${check.id}` });
  }
  return issues;
}

function duplicateLinkedin(db: Database.Database): AuditIssue[] {
  const people = db.prepare(`SELECT id, name, aliases_json FROM people`).all() as { id: string; name: string; aliases_json: string }[];
  const bySlug = new Map<string, { id: string; name: string }[]>();
  for (const person of people) {
    let aliases: unknown[] = [];
    try {
      const parsed = JSON.parse(person.aliases_json || "[]") as unknown;
      aliases = Array.isArray(parsed) ? parsed : [];
    } catch {
      aliases = [];
    }
    const slugs = new Set<string>();
    for (const alias of aliases) {
      if (typeof alias !== "string" || !alias.toLowerCase().includes("linkedin")) continue;
      const slug = linkedinSlug(alias);
      if (slug) slugs.add(slug);
    }
    for (const slug of slugs) {
      const list = bySlug.get(slug) ?? [];
      if (!list.some((item) => item.id === person.id)) list.push({ id: person.id, name: person.name });
      bySlug.set(slug, list);
    }
  }
  const issues: AuditIssue[] = [];
  for (const [slug, rows] of bySlug) {
    if (rows.length < 2) continue;
    issues.push({
      code: "duplicate_linkedin",
      entityId: rows.map((row) => row.id).join(","),
      detail: `LinkedIn /in/${slug} is on ${rows.map((row) => `${row.name} (${row.id})`).join("; ")}`,
    });
  }
  return issues;
}

export function hotspotUrlConflicts(csvText: string): AuditIssue[] {
  const rows = parseCsv(csvText);
  const groups = new Map<string, { campus: string; host: string; place: string }[]>();
  for (const row of rows) {
    const place = row.Place || "";
    const key = placeKeyOf(place);
    if (key.length < 6) continue;
    const host = hostOf(row.urls || "");
    if (!host) continue;
    const list = groups.get(key) ?? [];
    list.push({ campus: row.campus || "", host, place });
    groups.set(key, list);
  }
  const issues: AuditIssue[] = [];
  for (const [key, list] of groups) {
    const campuses = new Set(list.map((item) => item.campus).filter(Boolean));
    const hosts = new Set(list.map((item) => item.host));
    if (campuses.size > 1 && hosts.size > 1) {
      issues.push({
        code: "hotspot_url_conflict",
        entityId: key,
        detail: `"${key}" is listed at ${[...campuses].join(", ")} with hosts ${[...hosts].join(", ")}`,
      });
    }
  }
  return issues;
}

export function auditData(db: Database.Database, hotspotCsv?: string): AuditIssue[] {
  const issues = [...duplicateOrgNames(db), ...conflictingCampuses(db), ...orphanLinks(db), ...duplicateLinkedin(db)];
  if (hotspotCsv) issues.push(...hotspotUrlConflicts(hotspotCsv));
  return issues;
}
