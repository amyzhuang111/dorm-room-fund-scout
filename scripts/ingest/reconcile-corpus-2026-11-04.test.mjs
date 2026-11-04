import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import Database from 'better-sqlite3';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'campus-reconcile-'));
const target=path.join(tmp,'test.db');
fs.copyFileSync(process.env.CORPUS_TEST_BASE_DB||'data/campus-universe.db',target);
const run=file=>{const r=spawnSync(process.execPath,file.endsWith('.ts')?['--import','tsx',file]:[file],{env:{...process.env,CAMPUS_UNIVERSE_DB_PATH:target},encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout;};
try{
 run('scripts/ingest/import-scouting-list-2026-11-03.mjs');
 let db=new Database(target);const beforePeople=db.prepare('SELECT * FROM people').all();const beforeProjects=db.prepare('SELECT * FROM projects').all();db.close();
 run('scripts/ingest/reconcile-corpus-2026-11-04.mjs');
 db=new Database(target);
 // A recovery may insert rows but must never replace current profile or company fields.
 for(const row of beforePeople)assert.deepEqual(db.prepare('SELECT * FROM people WHERE id=?').get(row.id),row);
 for(const row of beforeProjects)assert.deepEqual(db.prepare('SELECT * FROM projects WHERE id=?').get(row.id),row);
 const payload=JSON.parse(gunzipSync(Buffer.from(fs.readFileSync('data/imports/recovery-2026-11-04.json.gz.base64','utf8'),'base64')).toString());
 for(const table of ['people','projects'])for(const row of payload.tables[table])assert.ok(db.prepare(`SELECT 1 FROM ${table} WHERE id=?`).get(row.id)||db.prepare('SELECT 1 FROM entity_redirects WHERE old_id=?').get(row.id),`Lost ${row.id}`);
 assert.deepEqual(db.pragma('foreign_key_check'),[]);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM company_facts WHERE id IS NULL').get().n,0);db.close();
 run('scripts/data/apply-recovered-rows.ts');
 run('scripts/ingest/import-verified-class-years-2026-11-04.mjs');
 db=new Database(target);
 const shirin=db.prepare("SELECT * FROM people WHERE name='Shirin Ghorbani'").get();assert.equal(shirin.enrollment_grad_year,2028);assert.match(shirin.enrollment_source_url,/32-student-startups/);
 const jocelyne=db.prepare("SELECT * FROM people WHERE name='Jocelyne Murphy'").get();assert.equal(jocelyne.enrollment_grad_year,2025);assert.match(jocelyne.enrollment_source_url,/uwaterloo.ca/);
 assert.ok(db.prepare("SELECT COUNT(*) n FROM claims WHERE claim_type='education' AND verification_state='confirmed'").get().n>=96);
 const state=()=>JSON.stringify(db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(({name})=>[name,db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()]));
 const snapshot=state();db.close();
 run('scripts/ingest/reconcile-corpus-2026-11-04.mjs');run('scripts/data/apply-recovered-rows.ts');run('scripts/ingest/import-verified-class-years-2026-11-04.mjs');
 db=new Database(target);assert.equal(state(),snapshot,'Repeat import changed database');assert.deepEqual(db.pragma('foreign_key_check'),[]);db.close();
 console.log('Recovery and class-year import: preserves existing rows, resolves IDs, validates sources, passes foreign keys, and is idempotent.');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
