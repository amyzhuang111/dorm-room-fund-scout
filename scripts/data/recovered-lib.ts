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
  const hasRedirects = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='entity_redirects'").get();
  const redirects = new Map<string,string>(hasRedirects ? (db.prepare('SELECT old_id,survivor_id FROM entity_redirects').all() as {old_id:string;survivor_id:string}[]).map(r=>[r.old_id,r.survivor_id]) : []);
  const resolve = (value: unknown): unknown => { const seen=new Set<string>();while(typeof value==='string'&&redirects.has(value)&&!seen.has(value)){seen.add(value);value=redirects.get(value)!;}return value; };
  const remap = (value: unknown): unknown => Array.isArray(value) ? value.map(remap) : value && typeof value==='object' ? Object.fromEntries(Object.entries(value).map(([k,v])=>[k,remap(v)])) : resolve(value);
  // News refreshes may recreate a URL under a new id. INSERT OR IGNORE keeps
  // the existing article's unique url_key, so restore mentions against that id.
  const articleIds = new Map<string, string>();
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
      for (const original of t.rows) {
        if (table === "news_articles" && target.has("url_key") && t.columns.includes("url_key") && !exists.get(original[idCol])) {
          const existing = db.prepare('SELECT id FROM news_articles WHERE url_key = ?').get(original[t.columns.indexOf("url_key")]) as { id: string } | undefined;
          if (existing) {
            articleIds.set(String(original[idCol]), existing.id);
            continue;
          }
        }
        // A recovery must never resurrect an identity already merged by a reviewed decision.
        if ((table==='people'||table==='projects') && redirects.has(String(original[idCol]))) continue;
        const row = original.map((value,i)=>{
          const key=t.columns[i];
          if (table === "news_mentions" && key === "article_id") return articleIds.get(String(value)) ?? value;
          if (['person_id','project_id','entity_id','source_entity_id','target_entity_id'].includes(key)) return resolve(value);
          if (key.endsWith('_json') && typeof value==='string') {try{return JSON.stringify(remap(JSON.parse(value)));}catch{/* Keep historical invalid JSON as-is. */}}
          return value;
        });
        const semanticKeys: Record<string,string[]> = {affiliations:['person_id','university_id','role'],person_project_roles:['person_id','project_id','role'],company_facts:['project_id','fact_key','value_text','source_url']};
        const keys=semanticKeys[table];
        if(keys && keys.every(k=>target.has(k)&&t.columns.includes(k)) && db.prepare(`SELECT 1 FROM "${table}" WHERE ${keys.map(k=>`"${k}" IS ?`).join(' AND ')} LIMIT 1`).get(...keys.map(k=>row[t.columns.indexOf(k)] as never))) continue;
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

