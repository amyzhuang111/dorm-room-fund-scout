// Re-adds rows lost when PR #149 replaced the committed database
// (data/exports/recovered-rows-*.json, taken from the database as of PR #147).
// Additive only, idempotent, runs in `prebuild`. See docs/data-pipeline-and-operations.md.
//
//   npx tsx scripts/data/apply-recovered-rows.ts            # apply
//   npx tsx scripts/data/apply-recovered-rows.ts --dry-run  # report only
//
// Honors CAMPUS_UNIVERSE_DB_PATH. A missing database is a no-op.
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { applyRecoveredRows, type RecoveredData } from "./recovered-lib";

const dbPath = process.env.CAMPUS_UNIVERSE_DB_PATH || path.join(process.cwd(), "data", "campus-universe.db");
const dir = path.join(process.cwd(), "data", "exports");
const dry = process.argv.includes("--dry-run");

if (!fs.existsSync(dbPath)) {
  console.log(`recovered rows: no database at ${dbPath}; nothing to do`);
  process.exit(0);
}
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^recovered-rows-.*\.json$/.test(f)).sort() : [];
const db = new Database(dbPath);
for (const f of files) {
  const data = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as RecoveredData;
  const r = applyRecoveredRows(db, data, dry);
  const detail = Object.entries(r.perTable).map(([t, v]) => `${t} ${v.inserted}/${v.offered}`).join(", ");
  console.log(`recovered rows: ${f}: ${dry ? "would insert" : "inserted"} ${r.inserted} (${detail})`);
}
if (!dry) db.pragma("wal_checkpoint(TRUNCATE)");
db.close();
