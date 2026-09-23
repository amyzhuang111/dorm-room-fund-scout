// Seed the five launch campuses with coordinates sourced from Wikipedia's
// wgCoordinates (which mirrors each article's infobox coordinate, itself
// sourced to the institution). Re-verify if Wikipedia's figure changes.
// Run: npx tsx scripts/ingest/seed-universities.ts

import { getDb } from "../../lib/db/client";

const UNIVERSITIES = [
  {
    id: "univ_penn",
    name: "University of Pennsylvania",
    aliases: ["Penn", "UPenn"],
    country: "United States",
    lat: 39.951944,
    lon: -75.193611,
    coord_source: "en.wikipedia.org/wiki/University_of_Pennsylvania (wgCoordinates, retrieved 2026-09-18)",
  },
  {
    id: "univ_berkeley",
    name: "University of California, Berkeley",
    aliases: ["UC Berkeley", "Berkeley", "Cal"],
    country: "United States",
    lat: 37.8719,
    lon: -122.2583,
    coord_source: "en.wikipedia.org/wiki/University_of_California,_Berkeley (wgCoordinates, retrieved 2026-09-18)",
  },
  {
    id: "univ_mit",
    name: "Massachusetts Institute of Technology",
    aliases: ["MIT"],
    country: "United States",
    lat: 42.3597,
    lon: -71.0919,
    coord_source: "en.wikipedia.org/wiki/Massachusetts_Institute_of_Technology (wgCoordinates, retrieved 2026-09-18)",
  },
  {
    id: "univ_stanford",
    name: "Stanford University",
    aliases: ["Stanford"],
    country: "United States",
    lat: 37.4275,
    lon: -122.17,
    coord_source: "en.wikipedia.org/wiki/Stanford_University (wgCoordinates, retrieved 2026-09-18)",
  },
  {
    id: "univ_waterloo",
    name: "University of Waterloo",
    aliases: ["Waterloo", "UWaterloo"],
    country: "Canada",
    lat: 43.476944,
    lon: -80.554722,
    coord_source: "en.wikipedia.org/wiki/University_of_Waterloo (wgCoordinates, retrieved 2026-09-18)",
  },
  {
    id: "univ_harvard",
    name: "Harvard University",
    aliases: ["Harvard"],
    country: "United States",
    lat: 42.374444,
    lon: -71.116944,
    coord_source: "en.wikipedia.org/wiki/Harvard_University (wgCoordinates via MediaWiki API, retrieved 2026-09-21)",
  },
];

function main() {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO universities (id, name, aliases_json, country, lat, lon, coord_source)
     VALUES (@id, @name, @aliases, @country, @lat, @lon, @coord_source)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, aliases_json=excluded.aliases_json,
       country=excluded.country, lat=excluded.lat, lon=excluded.lon, coord_source=excluded.coord_source`
  );
  for (const u of UNIVERSITIES) {
    stmt.run({ ...u, aliases: JSON.stringify(u.aliases) });
    console.log(`seeded ${u.name}`);
  }
}

main();
