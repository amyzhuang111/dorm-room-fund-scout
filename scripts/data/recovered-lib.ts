// Additive-only restore of rows that were lost when a PR replaced the committed
// database. Each table is { columns, rows }; rows are inserted with
// INSERT OR IGNORE keyed on the primary key (id), so existing rows are NEVER
// modified and re-running changes nothing. Only columns that exist in the target
// table are written (a newer schema just gets defaults for new columns).
import type Database from "better-sqlite3";

export interface RecoveredData {
  recoveredFrom?: string;
  tables: Record<string, { columns: string[]; rows: unknown[][] }>;
}

export interface RecoveredResult {
  perTable: Record<string, { offered: number; inserted: number }>;
  inserted: number;
}

/** Parents before children. Tables not listed here are ignored. */
export const RECOVERED_ORDER = [
  "sources",
  "snapshots",
  "projects",
  "people",
  "claims",
  "affiliations",
  "person_project_roles",
  "company_facts",
  "project_sector_tags",
  "gate_results",
  "relationships",
  "signals",
  "news_articles",
  "news_mentions",
] as const;

export function applyRecoveredRows(db: Database.Database, data: RecoveredData, dry = false): RecoveredResult {
  const perTable: RecoveredResult["perTable"] = {};
  let inserted = 0;
  db.transaction(() => {
    for (const table of RECOVERED_ORDER) {
      const t = data.tables[table];
      if (!t) continue;
      const target = new Set((db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map((c) => c.name));
      if (target.size === 0) continue; // table absent in this schema
      const idx = t.columns.map((c, i) => [c, i] as const).filter(([c]) => target.has(c));
      const cols = idx.map(([c]) => `"${c}"`).join(",");
      const marks = idx.map(() => "?").join(",");
      const insert = db.prepare(`INSERT OR IGNORE INTO "${table}" (${cols}) VALUES (${marks})`);
      const exists = db.prepare(`SELECT 1 FROM "${table}" WHERE id = ?`);
      const idCol = t.columns.indexOf("id");
      let n = 0;
      for (const row of t.rows) {
        if (dry) {
          if (!exists.get(row[idCol])) n += 1;
        } else {
          n += insert.run(...idx.map(([, i]) => row[i] as never)).changes;
        }
      }
      perTable[table] = { offered: t.rows.length, inserted: n };
      inserted += n;
    }
  })();
  return { perTable, inserted };
}
