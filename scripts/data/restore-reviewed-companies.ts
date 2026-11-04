// Restores companies that were hidden with NO recorded exclusion reason, after a
// per-company review (data/exports/restore-reviewed-companies-2026-11-04.json).
//
//   npx tsx scripts/data/restore-reviewed-companies.ts                          # apply the default list
//   npx tsx scripts/data/restore-reviewed-companies.ts --dry-run                # report only
//   npx tsx scripts/data/restore-reviewed-companies.ts --list <path-to-json>    # another reviewed list
//
// A list is { restore: [{ id, name }], fromReasons?: string[] }. By default only
// companies with NO excluded_reason are restored; a list can name the reasons it
// is allowed to clear (e.g. ["unverified recency"]), and those are set to NULL.
//
// Safe to re-run: a company is only touched if it is still a company, still
// hidden (is_investable_candidate = 0) and still has no excluded_reason. It opens
// the database directly (no schema/migration side effects) and checkpoints the WAL
// so the committed .db file is self-contained.
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const dbPath = process.env.CAMPUS_UNIVERSE_DB_PATH || path.join(process.cwd(), "data", "campus-universe.db");
const listArg = process.argv.indexOf("--list");
const listPath = listArg >= 0 ? path.resolve(process.argv[listArg + 1]) : path.join(process.cwd(), "data", "exports", "restore-reviewed-companies-2026-11-04.json");
const list = JSON.parse(fs.readFileSync(listPath, "utf8")) as {
  restore: { id: string; name: string }[];
  fromReasons?: string[];
};
const fromReasons = list.fromReasons ?? [];
const dry = process.argv.includes("--dry-run");

const db = new Database(dbPath);
const count = () => (db.prepare(`SELECT COUNT(*) AS n FROM projects WHERE kind = 'company' AND is_investable_candidate = 1`).get() as { n: number }).n;
const before = count();
const reasonMarks = fromReasons.map(() => "?").join(",");
const eligible = db.prepare(
  `SELECT id, name FROM projects WHERE id = ? AND kind = 'company' AND is_investable_candidate = 0
     AND (excluded_reason IS NULL${fromReasons.length ? ` OR excluded_reason IN (${reasonMarks})` : ""})`,
);
const update = db.prepare(
  `UPDATE projects SET is_investable_candidate = 1, excluded_reason = NULL, updated_at = datetime('now') WHERE id = ?`,
);

let changed = 0;
const skipped: string[] = [];
const run = db.transaction(() => {
  for (const c of list.restore) {
    const row = eligible.get(c.id, ...fromReasons) as { id: string; name: string } | undefined;
    if (!row) {
      skipped.push(`${c.name} (${c.id}): no longer hidden (or reason not in this list's fromReasons)`);
      continue;
    }
    if (!dry) update.run(c.id);
    changed += 1;
  }
});
run();
console.log(`${dry ? "[dry run] would restore" : "restored"} ${changed} of ${list.restore.length}; skipped ${skipped.length}`);
for (const s of skipped) console.log("  skipped:", s);
console.log(`investable companies: ${before} -> ${dry ? before : count()}`);
if (!dry) db.pragma("wal_checkpoint(TRUNCATE)");
db.close();
