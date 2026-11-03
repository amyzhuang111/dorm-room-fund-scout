// DRF student-partner presence by school. Rows come from
// data/imports/drf_campus_presence.csv via scripts/ingest/import-drf-campus-presence.ts.
// Named partners are the CSV text. Nothing here invents a partner.

import { getDb } from "../db/client";

export const DRF_STATUS_ORDER = [
  "Current partner",
  "Recent partner",
  "Historical + portfolio",
  "Historical",
  "Portfolio-only",
  "Unverified",
] as const;

/**
 * School label in the presence CSV to an existing university id.
 * Null means the row stays on the presence table and is not attached to a campus,
 * either because this database has no campus record or because the row names
 * more than one school.
 */
export const DRF_SCHOOL_UNIVERSITY: Record<string, string | null> = {
  "Penn / Wharton": "univ_penn",
  "Stanford (incl. GSB)": "univ_stanford",
  MIT: "univ_mit",
  "Harvard (College + HBS)": "univ_harvard",
  "UC Berkeley": "univ_berkeley",
  UCLA: "univ_ucla",
  "UNC Chapel Hill": "univ_unc",
  Georgetown: "univ_georgetown",
  Emory: "univ_emory",
  Columbia: "univ_columbia",
  "Northwestern (Kellogg)": "univ_northwestern",
  UChicago: "univ_uchicago",
  UIUC: "univ_uiuc",
  "NYU (Stern)": "univ_nyu",
  Yale: "univ_yale",
  Dartmouth: "univ_dartmouth",
  "UT Austin": "univ_utexas",
  Waterloo: "univ_waterloo",
  "Cornell / Cornell Tech": "univ_cornell",
  Michigan: "univ_michigan",
  Duke: "univ_duke",
  Brown: "univ_brown",
  "Carnegie Mellon": "univ_cmu",
  Caltech: "univ_caltech",
  "Georgia Tech": "univ_gatech",
  // Multi-school row: keep unattached rather than inventing a single campus.
  "Columbia Business School / Chicago Booth / Yale SOM": null,
  USC: "univ_usc",
  Princeton: "univ_princeton",
  "UVA (Darden)": "univ_uva",
  "Notre Dame": "univ_notredame",
  "Boston University": "univ_bu",
  "University of Washington": "univ_uw",
  "University of Toronto": "univ_toronto",
  Rice: "univ_rice",
  Vanderbilt: "univ_vanderbilt",
  WashU: "univ_washu",
};

export interface DrfCampusPresence {
  id: string;
  school: string;
  universityId: string | null;
  region: string;
  status: string;
  partnerCount: number;
  namedPartners: string;
  evidenceLinks: string[];
  changeVsV1: string;
  dateChecked: string;
}

export function evidenceUrls(raw: string): string[] {
  return raw
    .split(";")
    .map((part) => part.trim())
    .filter((part) => /^https?:\/\//i.test(part));
}

export function presenceId(school: string): string {
  const slug = school
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 72);
  return `dcp_${slug || "school"}`;
}

export function statusRank(status: string): number {
  const index = DRF_STATUS_ORDER.indexOf(status as (typeof DRF_STATUS_ORDER)[number]);
  return index === -1 ? DRF_STATUS_ORDER.length : index;
}

export function comparePresence(a: Pick<DrfCampusPresence, "status" | "partnerCount" | "school">, b: Pick<DrfCampusPresence, "status" | "partnerCount" | "school">): number {
  const status = statusRank(a.status) - statusRank(b.status);
  if (status !== 0) return status;
  if (a.partnerCount !== b.partnerCount) return b.partnerCount - a.partnerCount;
  return a.school.localeCompare(b.school);
}

interface PresenceCsvRow {
  school: string;
  region: string;
  status: string;
  partnerCount: number;
  namedPartners: string;
  evidenceLinks: string[];
  changeVsV1: string;
  dateChecked: string;
}

export function parsePresenceRecords(rows: Record<string, string>[]): PresenceCsvRow[] {
  return rows
    .map((row) => ({
      school: (row.school || "").trim(),
      region: (row.drf_region || "").trim(),
      status: (row.status || "").trim(),
      partnerCount: Number.parseInt(row.current_partners_on_team_page || "0", 10) || 0,
      namedPartners: (row.details || "").trim(),
      evidenceLinks: evidenceUrls(row.evidence_links || ""),
      changeVsV1: (row.change_vs_v1_atlas || "").trim(),
      dateChecked: (row.date_checked || "").trim(),
    }))
    .filter((row) => row.school.length > 0);
}

function fromDb(row: {
  id: string;
  school: string;
  university_id: string | null;
  drf_region: string;
  status: string;
  partner_count: number;
  named_partners: string;
  evidence_links: string;
  change_vs_v1: string;
  date_checked: string;
}): DrfCampusPresence {
  return {
    id: row.id,
    school: row.school,
    universityId: row.university_id,
    region: row.drf_region,
    status: row.status,
    partnerCount: row.partner_count,
    namedPartners: row.named_partners,
    evidenceLinks: evidenceUrls(row.evidence_links),
    changeVsV1: row.change_vs_v1,
    dateChecked: row.date_checked,
  };
}

const SELECT = `SELECT id, school, university_id, drf_region, status, partner_count, named_partners, evidence_links, change_vs_v1, date_checked FROM drf_campus_presence`;

export function loadDrfPresence(): DrfCampusPresence[] {
  const db = getDb();
  const rows = db.prepare(SELECT).all() as Parameters<typeof fromDb>[0][];
  return rows.map(fromDb).sort(comparePresence);
}

export function presenceForUniversity(universityId: string): DrfCampusPresence | null {
  const db = getDb();
  const row = db.prepare(`${SELECT} WHERE university_id = ?`).get(universityId) as Parameters<typeof fromDb>[0] | undefined;
  return row ? fromDb(row) : null;
}

export function presenceByUniversity(): Map<string, DrfCampusPresence> {
  const map = new Map<string, DrfCampusPresence>();
  for (const row of loadDrfPresence()) {
    if (!row.universityId || map.has(row.universityId)) continue;
    map.set(row.universityId, row);
  }
  return map;
}
