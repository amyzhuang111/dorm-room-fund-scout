// Seed launch campuses from lib/domain/campuses.ts (the single config).
// Coordinates are sourced on each entry — re-verify if that source changes.
// Run: npx tsx scripts/ingest/seed-universities.ts

import { getDb } from "../../lib/db/client";
import { CAMPUSES } from "../../lib/domain/campuses";

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
}

main();
