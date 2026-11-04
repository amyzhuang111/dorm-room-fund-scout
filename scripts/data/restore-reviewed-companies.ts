// Restores companies hidden from the vetted directory, from a reviewed list.
//
//   npx tsx scripts/data/restore-reviewed-companies.ts                        # default list (the first batch)
//   npx tsx scripts/data/restore-reviewed-companies.ts --dry-run              # report only
//   npx tsx scripts/data/restore-reviewed-companies.ts --list <path-to-json>  # another reviewed list
//
// A list is { restore: [{ id, name }], fromReasons?: string[] }. By default only
// companies with NO excluded_reason are restored; a list can name the reasons it
// may clear (e.g. ["unverified recency"]). Idempotent. Opens the database
// directly (no schema/migration side effects) and checkpoints the WAL.
//
// Every list in data/exports/restore-reviewed-companies-*.json is also applied on
// each build by apply-reviewed-patches.ts, so these decisions survive the
// committed database being replaced.
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { applyRestoreList, type RestoreList } from "./restore-lib";

const dbPath = process.env.CAMPUS_UNIVERSE_DB_PATH || path.join(process.cwd(), "data", "campus-universe.db");
const listArg = process.argv.indexOf("--list");
const listPath = listArg >= 0 ? path.resolve(process.argv[listArg + 1]) : path.join(process.cwd(), "data", "exports", "restore-reviewed-companies-2026-11-04.json");
const list = JSON.parse(fs.readFileSync(listPath, "utf8")) as RestoreList;
const dry = process.argv.includes("--dry-run");

const db = new Database(dbPath);
const r = applyRestoreList(db, list, dry);
console.log(`${dry ? "[dry run] would restore" : "restored"} ${r.changed} of ${list.restore.length}; skipped ${r.skipped.length}`);
for (const s of r.skipped.slice(0, 20)) console.log("  skipped:", s);
console.log(`investable companies: ${r.vettedBefore} -> ${r.vettedAfter}`);
if (!dry) db.pragma("wal_checkpoint(TRUNCATE)");
db.close();
