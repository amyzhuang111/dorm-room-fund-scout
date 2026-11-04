// Shared logic for applying a reviewed "restore" list to the projects table.
// Used by the CLI (restore-reviewed-companies.ts) and by the build-time runner
// (apply-reviewed-patches.ts). Idempotent: a company is only touched while it is
// still a company, still hidden, and its excluded_reason is NULL or one of the
// list's `fromReasons`. Restoring also clears that reason.
import type Database from "better-sqlite3";

export interface RestoreList {
  restore: { id: string; name: string }[];
  fromReasons?: string[];
}

export interface RestoreResult {
  changed: number;
  skipped: string[];
  vettedBefore: number;
  vettedAfter: number;
}

export function vettedCount(db: Database.Database): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM projects WHERE kind = 'company' AND is_investable_candidate = 1`).get() as { n: number }).n;
}

export function applyRestoreList(db: Database.Database, list: RestoreList, dry = false): RestoreResult {
  const fromReasons = list.fromReasons ?? [];
  const marks = fromReasons.map(() => "?").join(",");
  const eligible = db.prepare(
    `SELECT id, name FROM projects WHERE id = ? AND kind = 'company' AND is_investable_candidate = 0
       AND (excluded_reason IS NULL${fromReasons.length ? ` OR excluded_reason IN (${marks})` : ""})`,
  );
  const update = db.prepare(
    `UPDATE projects SET is_investable_candidate = 1, excluded_reason = NULL, updated_at = datetime('now') WHERE id = ?`,
  );
  const vettedBefore = vettedCount(db);
  let changed = 0;
  const skipped: string[] = [];
  db.transaction(() => {
    for (const c of list.restore) {
      const row = eligible.get(c.id, ...fromReasons) as { id: string; name: string } | undefined;
      if (!row) {
        skipped.push(`${c.name} (${c.id})`);
        continue;
      }
      if (!dry) update.run(c.id);
      changed += 1;
    }
  })();
  return { changed, skipped, vettedBefore, vettedAfter: dry ? vettedBefore : vettedCount(db) };
}
