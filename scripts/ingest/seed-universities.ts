// Seed launch campuses from lib/domain/campuses.ts (the single config).
// Coordinates are sourced on each entry — re-verify if that source changes.
// Run: npx tsx scripts/ingest/seed-universities.ts

import { getDb } from "../../lib/db/client";
import { CAMPUSES } from "../../lib/domain/campuses";
import { matchPitchbookUniversity } from "../../lib/domain/pitchbook-model";

function main() {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO universities (id, name, aliases_json, country, lat, lon, coord_source)
     VALUES (@id, @name, @aliases, @country, @lat, @lon, @coord_source)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, aliases_json=excluded.aliases_json,
       country=excluded.country, lat=excluded.lat, lon=excluded.lon, coord_source=excluded.coord_source`
  );
  for (const u of CAMPUSES) {
    stmt.run({
      id: u.id,
      name: u.name,
      aliases: JSON.stringify(u.aliases),
      country: u.country,
      lat: u.lat,
      lon: u.lon,
      coord_source: u.coordSource,
    });
    console.log(`seeded ${u.name}`);
  }
  const table = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'pitchbook_rankings'`).get();
  if (table) {
    const rows = db.prepare(`SELECT id, pitchbook_name FROM pitchbook_rankings`).all() as { id: string; pitchbook_name: string }[];
    const link = db.prepare(`UPDATE pitchbook_rankings SET university_id = ? WHERE id = ?`);
    let linked = 0;
    for (const row of rows) {
      const universityId = matchPitchbookUniversity(row.pitchbook_name);
      link.run(universityId, row.id);
      if (universityId) linked += 1;
    }
    console.log(`pitchbook rows linked to a campus: ${linked} of ${rows.length}`);
  }
}

main();
