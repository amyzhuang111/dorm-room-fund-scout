import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import Database from 'better-sqlite3';

const batch = 'corpus-recovery-2026-11-04';
const db = new Database(process.env.CAMPUS_UNIVERSE_DB_PATH || path.join(process.cwd(), 'data/campus-universe.db'));
db.pragma('foreign_keys = ON');
db.exec('CREATE TABLE IF NOT EXISTS corpus_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL, report_json TEXT NOT NULL)');
if (db.prepare('SELECT 1 FROM corpus_migrations WHERE id=?').get(batch)) {
  console.log(JSON.stringify({ batch, alreadyApplied: true }));
} else {
  const payload = JSON.parse(gunzipSync(Buffer.from(fs.readFileSync('data/imports/recovery-2026-11-04.json.gz.base64', 'utf8').trim(), 'base64')).toString('utf8'));
  const audit = db.prepare(`INSERT OR IGNORE INTO accuracy_audit
    (id,entity_type,entity_id,action,field,old_value,new_value,reason,evidence_url,checked_at,idempotency_key)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  const hash = value => crypto.createHash('sha256').update(value).digest('hex').slice(0,24);
  const log = (type,id,action,field,oldValue,newValue,reason,url=null) => {
    const key = `${batch}:${type}:${id}:${field || action}`;
    audit.run(`audit_${hash(key)}`,type,id,action,field,oldValue,newValue,reason,url,'2026-11-04',key);
  };
  const report = db.transaction(() => {
    // These 14 pre-existing references point to absent claims in both snapshots.
    // Keep the affiliation/role and explicitly remove only its dangling evidence pointer.
    const clearedEvidence = {};
    for (const table of ['affiliations','person_project_roles']) {
      const broken = db.prepare(`SELECT id,claim_id FROM ${table} WHERE claim_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM claims c WHERE c.id=${table}.claim_id)`).all();
      for (const row of broken) {
        db.prepare(`UPDATE ${table} SET claim_id=NULL WHERE id=?`).run(row.id);
        log(table,row.id,'fix','claim_id',row.claim_id,null,'Referenced claim is absent from both backend snapshots. Relationship retained; evidence requires review.');
      }
      clearedEvidence[table] = broken.length;
    }
    const inserted = {};
    const redirects = new Map(db.prepare('SELECT old_id,survivor_id FROM entity_redirects').all().map(r=>[r.old_id,r.survivor_id]));
    const removed = new Set(db.prepare("SELECT entity_id FROM accuracy_audit WHERE action='false_positive'").all().map(r=>r.entity_id));
    for (const [table,rows] of Object.entries(payload.tables)) {
      if (!/^[a-z_]+$/.test(table)) throw new Error('Invalid table');
      inserted[table]=0;
      if (!rows.length) continue;
      const columns=Object.keys(rows[0]);
      const actual=new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(r=>r.name));
      if (columns.some(c=>!actual.has(c))) throw new Error(`Schema mismatch: ${table}`);
      const stmt=db.prepare(`INSERT OR IGNORE INTO ${table} (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`);
      for (const original of rows) {
        const row={...original};
        if (['people','projects'].includes(table) && (redirects.has(row.id)||removed.has(row.id))) continue;
        for (const key of ['person_id','project_id','entity_id','source_entity_id','target_entity_id']) if (redirects.has(row[key])) row[key]=redirects.get(row[key]);
        if (['person_id','entity_id','source_entity_id','target_entity_id'].some(key=>removed.has(row[key]))) continue;
        if (row.claim_id && !db.prepare('SELECT 1 FROM claims WHERE id=?').get(row.claim_id)) {
          log(table,row.id,'fix','claim_id',row.claim_id,null,'Recovered relationship has no matching evidence claim; retained without the invalid reference.');row.claim_id=null;
        }
        const change=stmt.run(...columns.map(c=>row[c]??null)).changes;
        inserted[table]+=change;
        if(change && ['people','projects'].includes(table)) log(table==='people'?'person':'project',row.id,'restore',null,null,row.id,'Recovered missing record from backend export at fa09249. Existing records and audit decisions preserved. Recovery is not a new factual verification.');
      }
    }
    for (const item of payload.identityMappings) {
      db.prepare('INSERT OR IGNORE INTO entity_redirects (old_id,entity_type,survivor_id,reason,merged_at) VALUES (?,?,?,?,?)').run(item.oldId,item.oldId.startsWith('person_')?'person':'project',item.survivorId,item.reason,'2026-11-04');
    }
    let repairedFactIds=0;
    for(const row of db.prepare('SELECT rowid,project_id,fact_key,value_text,source_url FROM company_facts WHERE id IS NULL').all()) {
      const id=`fact_recovered_${hash(JSON.stringify(row))}`;
      db.prepare('UPDATE company_facts SET id=? WHERE rowid=? AND id IS NULL').run(id,row.rowid);repairedFactIds++;
    }
    const issues=db.pragma('foreign_key_check');
    if(issues.length) throw new Error(`Foreign-key check failed: ${JSON.stringify(issues.slice(0,10))}`);
    const result={batch,inserted,clearedEvidence,repairedFactIds,identityMappings:payload.identityMappings.length,ambiguousNamesRetained:payload.ambiguousNames.length};
    db.prepare('INSERT INTO corpus_migrations VALUES (?,?,?)').run(batch,'2026-11-04T00:00:00.000Z',JSON.stringify(result));
    return result;
  })();
  console.log(JSON.stringify(report));
}
db.close();
