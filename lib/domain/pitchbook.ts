import fs from "node:fs";
import { databasePath, getDb } from "../db/client";
import { shortCampusLabel } from "./campuses";
import { undergradEnrollment } from "./undergrad-enrollment";
import { type PitchbookTable } from "./network-analysis-model";
import {
  PITCHBOOK_SOURCE_URL,
  PITCHBOOK_TITLE,
  foundersPerThousand,
  type PitchbookCampus,
  type PitchbookTrack,
  type PitchbookTrackName,
} from "./pitchbook-model";

interface StoredRow {
  university_id: string | null;
  pitchbook_name: string;
  country: string | null;
  track: PitchbookTrackName;
  rank: number;
  founder_count: number;
  company_count: number;
  capital_raised_usd: number;
  enrollment_band: string | null;
}

let cache: { stamp: string; rows: StoredRow[] } | null = null;

function stamp(): string {
  try {
    const stat = fs.statSync(databasePath());
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return "missing";
  }
}

export function listPitchbookRows(): StoredRow[] {
  const current = stamp();
  if (cache?.stamp === current) return cache.rows;
  const db = getDb();
  const table = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'pitchbook_rankings'`).get();
  if (!table) {
    cache = { stamp: current, rows: [] };
    return [];
  }
  const rows = db
    .prepare(
      `SELECT university_id, pitchbook_name, country, track, rank, founder_count, company_count, capital_raised_usd, enrollment_band
       FROM pitchbook_rankings
       ORDER BY track, rank`
    )
    .all() as StoredRow[];
  cache = { stamp: current, rows };
  return rows;
}

function asTrack(row: StoredRow): PitchbookTrack {
  return {
    rank: row.rank,
    founderCount: row.founder_count,
    companyCount: row.company_count,
    capitalRaisedUsd: row.capital_raised_usd,
    enrollmentBand: row.enrollment_band,
  };
}

export function pitchbookByCampus(): Map<string, PitchbookCampus> {
  const byId = new Map<string, PitchbookCampus>();
  for (const row of listPitchbookRows()) {
    if (!row.university_id) continue;
    const campus = byId.get(row.university_id) ?? {
      universityId: row.university_id,
      undergrad: null,
      grad: null,
      mba: null,
      perThousand: null,
      undergrads: null,
      enrollmentYear: null,
      enrollmentSourceUrl: null,
    };
    campus[row.track] = asTrack(row);
    byId.set(row.university_id, campus);
  }
  for (const campus of byId.values()) {
    const enrollment = undergradEnrollment(campus.universityId);
    if (campus.undergrad && enrollment) {
      campus.perThousand = foundersPerThousand(campus.undergrad.founderCount, enrollment.undergrads);
      campus.undergrads = enrollment.undergrads;
      campus.enrollmentYear = enrollment.year;
      campus.enrollmentSourceUrl = enrollment.sourceUrl;
    }
  }
  return byId;
}

export function usUndergradMissingFromScout(): { rank: number; name: string; founders: number; country: string | null }[] {
  return listPitchbookRows()
    .filter((row) => row.track === "undergrad" && !row.university_id && (row.country ?? "").toLowerCase() === "united states")
    .map((row) => ({ rank: row.rank, name: row.pitchbook_name, founders: row.founder_count, country: row.country }))
    .sort((a, b) => a.rank - b.rank);
}

export function buildPitchbookTable(): PitchbookTable {
  const rows = [...pitchbookByCampus().values()]
    .filter((campus) => campus.undergrad)
    .map((campus) => ({
      id: campus.universityId,
      label: shortCampusLabel(campus.universityId),
      rank: campus.undergrad!.rank,
      founders: campus.undergrad!.founderCount,
      companies: campus.undergrad!.companyCount,
      capitalRaisedUsd: campus.undergrad!.capitalRaisedUsd,
      enrollmentBand: campus.undergrad!.enrollmentBand,
      perThousand: campus.perThousand,
      undergrads: campus.undergrads,
    }))
    .sort((a, b) => (b.perThousand ?? -1) - (a.perThousand ?? -1) || a.rank - b.rank || a.label.localeCompare(b.label));
  return {
    title: PITCHBOOK_TITLE,
    subtitle: "Undergraduate founder count divided by cited undergraduate enrollment.",
    rows,
    caption:
      "Undergraduate alumni who founded a company that raised venture capital from January 2015 through August 2026. Founders per 1,000 uses Scout’s undergraduate headcount, not PitchBook’s enrollment band. Graduate and MBA lists are on each campus page.",
    sourceUrl: PITCHBOOK_SOURCE_URL,
    sourceLabel: "PitchBook university rankings",
  };
}
