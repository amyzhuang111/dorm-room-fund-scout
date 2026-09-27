// Download PitchBook's 2026 university workbook and upsert it.
// Re-running replaces the same (name, track) row and drops names that left the file.
// Campuses that are not already in Scout stay unmatched.
//
//   npm run import:pitchbook

import fs from "node:fs";
import path from "node:path";
import { getDb, nowIso } from "../../lib/db/client";
import { buildHitRateTable } from "../../lib/domain/campus-hit-rate";
import { formatHitRate } from "../../lib/domain/campus-hit-rate-model";
import { shortCampusLabel } from "../../lib/domain/campuses";
import { usUndergradMissingFromScout } from "../../lib/domain/pitchbook";
import {
  PITCHBOOK_LIST_URL,
  PITCHBOOK_PERIOD_END,
  PITCHBOOK_PERIOD_START,
  PITCHBOOK_SOURCE_URL,
  capitalUsdFromMillions,
  formatCapitalUsd,
  foundersPerThousand,
  matchPitchbookUniversity,
  pitchbookSlug,
  type PitchbookTrackName,
} from "../../lib/domain/pitchbook-model";
import { undergradEnrollment } from "../../lib/domain/undergrad-enrollment";
import { readXlsxSheets } from "./read-xlsx";

const FILE_PATH = path.join(process.cwd(), "data", "imports", "pitchbook-universities-2026.xlsx");

const TRACK_BY_SHEET: Record<string, PitchbookTrackName> = {
  undergraduate: "undergrad",
  graduate: "grad",
  mba: "mba",
};

interface ImportedRow {
  id: string;
  universityId: string | null;
  pitchbookName: string;
  country: string | null;
  geography: string | null;
  schoolStatus: string | null;
  track: PitchbookTrackName;
  rank: number;
  founderCount: number;
  companyCount: number;
  capitalRaisedUsd: number;
  enrollmentBand: string | null;
}

async function downloadWorkbook(): Promise<Buffer> {
  fs.mkdirSync(path.dirname(FILE_PATH), { recursive: true });
  try {
    const response = await fetch(PITCHBOOK_LIST_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buf = Buffer.from(await response.arrayBuffer());
    if (buf.length < 1000) throw new Error(`workbook is only ${buf.length} bytes`);
    fs.writeFileSync(FILE_PATH, buf);
    return buf;
  } catch (err) {
    if (fs.existsSync(FILE_PATH)) {
      console.warn(`PitchBook download failed (${err instanceof Error ? err.message : err}); using ${FILE_PATH}`);
      return fs.readFileSync(FILE_PATH);
    }
    throw err;
  }
}

function cell(row: string[], header: Map<string, number>, name: string): string {
  const index = header.get(name);
  if (index == null) throw new Error(`workbook is missing the ${name} column`);
  return (row[index] ?? "").trim();
}

function parseRows(buf: Buffer, knownIds: Set<string>): ImportedRow[] {
  const sheets = readXlsxSheets(buf);
  const out: ImportedRow[] = [];
  for (const sheet of sheets) {
    const track = TRACK_BY_SHEET[sheet.name.trim().toLowerCase()];
    if (!track) throw new Error(`unexpected sheet ${sheet.name}`);
    const [headerRow, ...body] = sheet.rows;
    if (!headerRow) throw new Error(`${sheet.name} is empty`);
    const header = new Map(headerRow.map((name, index) => [name.trim().toLowerCase(), index]));
    for (const row of body) {
      const pitchbookName = cell(row, header, "university");
      if (!pitchbookName) continue;
      const rank = Number(cell(row, header, "rank"));
      const founderCount = Number(cell(row, header, "founder count"));
      const companyCount = Number(cell(row, header, "company count"));
      const millions = Number(cell(row, header, "capital raised"));
      if (![rank, founderCount, companyCount, millions].every((value) => Number.isFinite(value))) {
        throw new Error(`bad numbers for ${pitchbookName} on ${sheet.name}`);
      }
      const matched = matchPitchbookUniversity(pitchbookName);
      out.push({
        id: `pb_${track}_${pitchbookSlug(pitchbookName)}`,
        universityId: matched && knownIds.has(matched) ? matched : null,
        pitchbookName,
        country: cell(row, header, "country") || null,
        geography: cell(row, header, "geography") || null,
        schoolStatus: cell(row, header, "status") || null,
        track,
        rank,
        founderCount,
        companyCount,
        capitalRaisedUsd: capitalUsdFromMillions(millions),
        enrollmentBand: cell(row, header, "enrollment") || null,
      });
    }
  }
  return out;
}

async function main() {
  const buf = await downloadWorkbook();
  const db = getDb();
  const knownIds = new Set((db.prepare(`SELECT id FROM universities`).all() as { id: string }[]).map((row) => row.id));
  const rows = parseRows(buf, knownIds);
  const undergrad = rows.filter((row) => row.track === "undergrad");
  if (undergrad.length !== 100) throw new Error(`expected 100 undergraduate rows, got ${undergrad.length}`);
  const berkeley = undergrad.find((row) => row.universityId === "univ_berkeley");
  if (!berkeley || berkeley.rank !== 1 || berkeley.founderCount !== 2380) {
    throw new Error(`Berkeley undergraduate row did not match the 2026 list (${berkeley?.rank}, ${berkeley?.founderCount})`);
  }

  const upsert = db.prepare(
    `INSERT INTO pitchbook_rankings (
       id, university_id, pitchbook_name, country, geography, school_status, track, rank,
       founder_count, company_count, capital_raised_usd, enrollment_band,
       period_start, period_end, source_url, list_url, retrieved_at
     ) VALUES (
       @id, @university_id, @pitchbook_name, @country, @geography, @school_status, @track, @rank,
       @founder_count, @company_count, @capital_raised_usd, @enrollment_band,
       @period_start, @period_end, @source_url, @list_url, @retrieved_at
     )
     ON CONFLICT(pitchbook_name, track) DO UPDATE SET
       id = excluded.id,
       university_id = excluded.university_id,
       country = excluded.country,
       geography = excluded.geography,
       school_status = excluded.school_status,
       rank = excluded.rank,
       founder_count = excluded.founder_count,
       company_count = excluded.company_count,
       capital_raised_usd = excluded.capital_raised_usd,
       enrollment_band = excluded.enrollment_band,
       period_start = excluded.period_start,
       period_end = excluded.period_end,
       source_url = excluded.source_url,
       list_url = excluded.list_url,
       retrieved_at = excluded.retrieved_at`
  );
  const retrievedAt = nowIso();
  const ids = rows.map((row) => row.id);
  const write = db.transaction(() => {
    for (const row of rows) {
      upsert.run({
        id: row.id,
        university_id: row.universityId,
        pitchbook_name: row.pitchbookName,
        country: row.country,
        geography: row.geography,
        school_status: row.schoolStatus,
        track: row.track,
        rank: row.rank,
        founder_count: row.founderCount,
        company_count: row.companyCount,
        capital_raised_usd: row.capitalRaisedUsd,
        enrollment_band: row.enrollmentBand,
        period_start: PITCHBOOK_PERIOD_START,
        period_end: PITCHBOOK_PERIOD_END,
        source_url: PITCHBOOK_SOURCE_URL,
        list_url: PITCHBOOK_LIST_URL,
        retrieved_at: retrievedAt,
      });
    }
    const marks = ids.map(() => "?").join(",");
    db.prepare(`DELETE FROM pitchbook_rankings WHERE id NOT IN (${marks})`).run(...ids);
  });
  write();
  db.pragma("wal_checkpoint(TRUNCATE)");

  const counts = db.prepare(`SELECT track, COUNT(*) AS n FROM pitchbook_rankings GROUP BY track ORDER BY track`).all() as { track: string; n: number }[];
  console.log(`pitchbook rankings: ${rows.length} rows`);
  for (const row of counts) console.log(`  ${row.track}: ${row.n}`);
  const linked = rows.filter((row) => row.universityId).length;
  console.log(`  linked to a Scout campus: ${linked}`);

  const perThousand = undergrad
    .filter((row) => row.universityId)
    .map((row) => {
      const enrollment = undergradEnrollment(row.universityId!);
      return {
        label: shortCampusLabel(row.universityId!),
        founders: row.founderCount,
        perThousand: enrollment ? foundersPerThousand(row.founderCount, enrollment.undergrads) : null,
        capital: formatCapitalUsd(row.capitalRaisedUsd),
      };
    })
    .filter((row) => row.perThousand != null)
    .sort((a, b) => (b.perThousand ?? 0) - (a.perThousand ?? 0));
  console.log("top 10 PitchBook founders per 1,000 undergrads:");
  for (const [index, row] of perThousand.slice(0, 10).entries()) {
    console.log(`  ${index + 1}. ${row.label}: ${row.perThousand?.toFixed(1)} (${row.founders.toLocaleString("en-US")} founders, ${row.capital})`);
  }

  const missing = usUndergradMissingFromScout();
  console.log(`US undergraduate top 100 missing from Scout: ${missing.length}`);
  for (const row of missing) console.log(`  ${row.rank}. ${row.name} (${row.founders.toLocaleString("en-US")} founders)`);

  const hit = buildHitRateTable();
  console.log("top 10 campuses by hit rate:");
  for (const [index, row] of hit.rows.slice(0, 10).entries()) {
    console.log(
      `  ${index + 1}. ${row.label}: ${formatHitRate(row.hitRate)} (${formatHitRate(row.low)}–${formatHitRate(row.high)}, ${row.good}/${row.founders} founders)`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
