// Public former DRF student partners. Rows come from data/imports/drf_alumni.json.
// Nothing here invents a person, a campus, a year, or a firm.

import { getDb } from "../db/client";
import { investorNodeId } from "./hotspot-model";

export const DRF_ALUM_TAG = "DRF alum";

export type DrfConfidence = "confirmed" | "likely";

export interface DrfAlumniRecord {
  id: string;
  name: string;
  drfTeam: string | null;
  universityId: string | null;
  schoolLabel: string | null;
  schoolRole: string | null;
  programId: string | null;
  programLabel: string | null;
  yearStart: number | null;
  yearEnd: number | null;
  classYear: number | null;
  currentFirm: string | null;
  currentRole: string | null;
  investorId: string | null;
  sourceUrl: string;
  firmSourceUrl: string | null;
  sourceUrls: string[];
  affiliationStatus: "current_student" | "recent_grad" | "older_alumni" | "unverified" | null;
  confidence: DrfConfidence;
  excerpt: string;
}

export interface DrfAlumRow extends DrfAlumniRecord {
  personId: string;
}

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text.length ? text : null;
}

function httpUrl(value: unknown, label: string, id: string): string | null {
  const text = clean(value);
  if (!text) return null;
  if (!/^https:\/\/\S+$/i.test(text)) throw new Error(`${id}: ${label} must be an https URL`);
  return text;
}

function year(value: unknown, id: string, label: string): number | null {
  if (value == null || value === "") return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1990 || value > 2035) {
    throw new Error(`${id}: ${label} is not a year`);
  }
  return value;
}

export function parseAlumniRecords(input: unknown): DrfAlumniRecord[] {
  if (!Array.isArray(input)) throw new Error("DRF alumni file must be a list");
  const ids = new Set<string>();
  return input.map((item) => {
    if (!item || typeof item !== "object") throw new Error("DRF alumni row is not an object");
    const row = item as Record<string, unknown>;
    const id = clean(row.id);
    if (!id || !/^dra_[a-z0-9_]+$/.test(id)) throw new Error(`Bad DRF alumni id: ${String(row.id)}`);
    if (ids.has(id)) throw new Error(`Duplicate DRF alumni id: ${id}`);
    ids.add(id);
    const name = clean(row.name);
    if (!name || name.length < 3) throw new Error(`${id}: name is missing`);
    const sourceUrl = httpUrl(row.source_url, "source_url", id);
    if (!sourceUrl) throw new Error(`${id}: source_url is required`);
    const confidence = clean(row.confidence);
    if (confidence !== "confirmed" && confidence !== "likely") throw new Error(`${id}: confidence must be confirmed or likely`);
    const excerpt = clean(row.excerpt);
    if (!excerpt || excerpt.length < 40) throw new Error(`${id}: excerpt is too short to be evidence`);
    const firm = clean(row.current_firm);
    const role = clean(row.current_role);
    if (role && !firm) throw new Error(`${id}: a role needs a firm`);
    const affiliationStatus = clean(row.affiliation_status);
    if (affiliationStatus && !["current_student", "recent_grad", "older_alumni", "unverified"].includes(affiliationStatus)) {
      throw new Error(`${id}: affiliation_status is not a known status`);
    }
    const urls = [sourceUrl, httpUrl(row.firm_source_url, "firm_source_url", id), httpUrl(row.team_source_url, "team_source_url", id), httpUrl(row.school_source_url, "school_source_url", id)].filter(
      (url): url is string => !!url
    );
    return {
      id,
      name,
      drfTeam: clean(row.drf_team),
      universityId: clean(row.university_id),
      schoolLabel: clean(row.school_label),
      schoolRole: clean(row.school_role),
      programId: clean(row.program_id),
      programLabel: clean(row.program_label),
      yearStart: year(row.year_start, id, "year_start"),
      yearEnd: year(row.year_end, id, "year_end"),
      classYear: year(row.class_year, id, "class_year"),
      currentFirm: firm,
      currentRole: role,
      investorId: firm ? investorNodeId(firm) : null,
      sourceUrl,
      firmSourceUrl: httpUrl(row.firm_source_url, "firm_source_url", id),
      sourceUrls: [...new Set(urls)],
      affiliationStatus: (affiliationStatus as DrfAlumniRecord["affiliationStatus"]) ?? null,
      confidence,
      excerpt,
    };
  });
}

export function suggestedPersonId(recordId: string): string {
  return `person_drf_${recordId.slice(4)}`;
}

interface AlumniDbRow {
  id: string;
  person_id: string;
  name: string;
  drf_team: string | null;
  university_id: string | null;
  school_label: string | null;
  program_id: string | null;
  program_label: string | null;
  year_start: number | null;
  year_end: number | null;
  class_year: number | null;
  current_firm: string | null;
  current_role: string | null;
  investor_id: string | null;
  source_url: string;
  firm_source_url: string | null;
  sources_json: string | null;
  confidence: string;
  excerpt: string;
}

function fromDb(row: AlumniDbRow): DrfAlumRow {
  let sourceUrls: string[] = [];
  try {
    const parsed = JSON.parse(row.sources_json || "[]") as unknown;
    if (Array.isArray(parsed)) sourceUrls = parsed.filter((url): url is string => typeof url === "string");
  } catch {
    sourceUrls = [];
  }
  if (!sourceUrls.includes(row.source_url)) sourceUrls.unshift(row.source_url);
  return {
    id: row.id,
    personId: row.person_id,
    name: row.name,
    drfTeam: row.drf_team,
    universityId: row.university_id,
    schoolLabel: row.school_label,
    schoolRole: null,
    programId: row.program_id,
    programLabel: row.program_label,
    yearStart: row.year_start,
    yearEnd: row.year_end,
    classYear: row.class_year,
    currentFirm: row.current_firm,
    currentRole: row.current_role,
    investorId: row.investor_id,
    sourceUrl: row.source_url,
    firmSourceUrl: row.firm_source_url,
    sourceUrls,
    affiliationStatus: null,
    confidence: row.confidence === "confirmed" ? "confirmed" : "likely",
    excerpt: row.excerpt,
  };
}

export function listDrfAlumni(): DrfAlumRow[] {
  const db = getDb();
  const table = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'drf_alumni'`).get();
  if (!table) return [];
  const rows = db.prepare(`SELECT * FROM drf_alumni ORDER BY name`).all() as AlumniDbRow[];
  return rows.map(fromDb);
}

export interface DrfWorksAt {
  personId: string;
  investorId: string;
  firm: string;
}

export function drfWorksAtEdges(): DrfWorksAt[] {
  const edges: DrfWorksAt[] = [];
  for (const alum of listDrfAlumni()) {
    if (!alum.investorId || !alum.currentFirm) continue;
    edges.push({ personId: alum.personId, investorId: alum.investorId, firm: alum.currentFirm });
  }
  return edges;
}

export function yearsLabel(alum: Pick<DrfAlumRow, "yearStart" | "yearEnd" | "classYear">): string | null {
  if (alum.yearStart && alum.yearEnd) return `${alum.yearStart}–${alum.yearEnd}`;
  if (alum.yearStart) return `from ${alum.yearStart}`;
  if (alum.yearEnd) return `through ${alum.yearEnd}`;
  if (alum.classYear) return `class of ${alum.classYear}`;
  return null;
}
