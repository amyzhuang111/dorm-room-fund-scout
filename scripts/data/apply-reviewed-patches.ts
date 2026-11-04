// Applies every reviewed restore list (data/exports/restore-reviewed-companies-*.json)
// to the database, in file-name order. Runs in `prebuild`, like the scouting-list
// import, so reviewed decisions are re-applied on top of whatever database is
// committed. Why: the database is a binary file that cannot be merged, and a PR
// that carries its own copy replaces it wholesale (this happened on 2026-11-04 and
// discarded 59 reviewed restores). Idempotent and cheap: nothing already restored
// is touched.
//
//   npx tsx scripts/data/apply-reviewed-patches.ts            # apply
//   npx tsx scripts/data/apply-reviewed-patches.ts --dry-run  # report only
//
// Honors CAMPUS_UNIVERSE_DB_PATH. A missing database is a no-op (clean checkouts).
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { applyRestoreList, type RestoreList } from "./restore-lib";

const dbPath = process.env.CAMPUS_UNIVERSE_DB_PATH || path.join(process.cwd(), "data", "campus-universe.db");
const dir = path.join(process.cwd(), "data", "exports");
const dry = process.argv.includes("--dry-run");

if (!fs.existsSync(dbPath)) {
  console.log(`reviewed patches: no database at ${dbPath}; nothing to do`);
  process.exit(0);
}
const files = fs.existsSync(dir)
  ? fs.readdirSync(dir).filter((f) => /^restore-reviewed-companies-.*\.json$/.test(f)).sort()
  : [];

const db = new Database(dbPath);
let total = 0;
for (const f of files) {
  const list = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as RestoreList;
  const r = applyRestoreList(db, list, dry);
  total += r.changed;
  console.log(`reviewed patches: ${f}: ${dry ? "would restore" : "restored"} ${r.changed}/${list.restore.length} (already applied or no longer hidden: ${r.skipped.length})`);
}
console.log(`reviewed patches: ${total} companies ${dry ? "would be restored" : "restored"} across ${files.length} lists`);
if (!dry) db.pragma("wal_checkpoint(TRUNCATE)");
db.close();
