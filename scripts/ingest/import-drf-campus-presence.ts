// Load DRF campus presence from data/imports/drf_campus_presence.csv.
// Re-running replaces the table with the file: same school updates in place,
// schools no longer in the file are removed, and named partners are never invented.
//
//   npx tsx scripts/ingest/import-drf-campus-presence.ts

import fs from "node:fs";
import path from "node:path";
import { getDb } from "../../lib/db/client";
import { DRF_SCHOOL_UNIVERSITY, evidenceUrls, parsePresenceRecords, presenceId } from "../../lib/domain/drf-presence";
import { parseCsv } from "../../lib/domain/hotspot-model";

const CSV_PATH = path.join(process.cwd(), "data", "imports", "drf_campus_presence.csv");

function main() {
  const db = getDb();
  const records = parsePresenceRecords(parseCsv(fs.readFileSync(CSV_PATH, "utf8")));
  const universities = new Set((db.prepare(`SELECT id FROM universities`).all() as { id: string }[]).map((row) => row.id));
  const upsert = db.prepare(
    `INSERT INTO drf_campus_presence (
       id, school, university_id, drf_region, status, partner_count, named_partners, evidence_links, change_vs_v1, date_checked
     ) VALUES (
       @id, @school, @university_id, @drf_region, @status, @partner_count, @named_partners, @evidence_links, @change_vs_v1, @date_checked
     )
     ON CONFLICT(school) DO UPDATE SET
       id = excluded.id,
       university_id = excluded.university_id,
       drf_region = excluded.drf_region,
       status = excluded.status,
       partner_count = excluded.partner_count,
       named_partners = excluded.named_partners,
       evidence_links = excluded.evidence_links,
       change_vs_v1 = excluded.change_vs_v1,
       date_checked = excluded.date_checked`
  );

  const ids: string[] = [];
  const write = db.transaction(() => {
    for (const row of records) {
      if (!(row.school in DRF_SCHOOL_UNIVERSITY)) {
        console.warn(`No campus mapping for ${row.school}; stored without a university id.`);
      }
      const mapped = DRF_SCHOOL_UNIVERSITY[row.school] ?? null;
      const universityId = mapped && universities.has(mapped) ? mapped : null;
      const id = presenceId(row.school);
      ids.push(id);
      upsert.run({
        id,
        school: row.school,
        university_id: universityId,
        drf_region: row.region,
        status: row.status,
        partner_count: row.partnerCount,
        named_partners: row.namedPartners,
        evidence_links: row.evidenceLinks.join(" ; "),
        change_vs_v1: row.changeVsV1,
        date_checked: row.dateChecked,
      });
    }
    if (ids.length === 0) {
      db.prepare(`DELETE FROM drf_campus_presence`).run();
      return;
    }
    const marks = ids.map(() => "?").join(",");
    db.prepare(`DELETE FROM drf_campus_presence WHERE id NOT IN (${marks})`).run(...ids);
  });
  write();

  const counts = db.prepare(`SELECT status, COUNT(*) AS n FROM drf_campus_presence GROUP BY status ORDER BY n DESC`).all() as { status: string; n: number }[];
  const linked = db.prepare(`SELECT COUNT(*) AS n FROM drf_campus_presence WHERE university_id IS NOT NULL`).get() as { n: number };
  const stored = db.prepare(`SELECT evidence_links FROM drf_campus_presence`).all() as { evidence_links: string }[];
  for (const row of stored) {
    for (const url of evidenceUrls(row.evidence_links)) {
      if (!url.startsWith("http")) throw new Error(`non-http evidence link stored: ${url}`);
    }
  }
  db.pragma("wal_checkpoint(TRUNCATE)");
  console.log(`drf campus presence: ${records.length} schools, ${linked.n} linked to a campus record`);
  for (const row of counts) console.log(`  ${row.status}: ${row.n}`);
}

main();
