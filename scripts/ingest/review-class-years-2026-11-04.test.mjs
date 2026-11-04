import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import Database from 'better-sqlite3';
const manifest=JSON.parse(fs.readFileSync('data/imports/class-year-review-2026-11-04.json','utf8'));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'class-year-review-'));
const file=path.join(dir,'test.db');
const source=new Database(process.env.CAMPUS_UNIVERSE_DB_PATH||'data/campus-universe.db',{readonly:true});
await source.backup(file);source.close();
const run=()=>{const r=spawnSync(process.execPath,['scripts/ingest/review-class-years-2026-11-04.mjs'],{env:{...process.env,CAMPUS_UNIVERSE_DB_PATH:file},encoding:'utf8'});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout.trim());};
try{
 let db=new Database(file);
 // Restore the reviewed input values only in this disposable test database.
 for(const p of manifest.patches)db.prepare('UPDATE people SET enrollment_grad_year=?,enrollment_source_url=?,enrollment_evidence=? WHERE id=?').run(p.expectedYear,p.expectedSourceUrl,p.expectedEvidence,p.personId);
 const unchangedTables=['people','projects','person_project_roles','affiliations','company_facts'];
 const counts=Object.fromEntries(unchangedTables.map(t=>[t,db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n]));
 const statuses=db.prepare('SELECT id,founder_status,verification_status,enrollment_status FROM people ORDER BY id').all();
 db.close();const first=run();
 db=new Database(file);
 for(const patch of manifest.patches){const p=db.prepare('SELECT enrollment_grad_year FROM people WHERE id=?').get(patch.personId);if(p)assert.equal(p.enrollment_grad_year,patch.newYear,patch.name);}
 for(const t of unchangedTables)assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n,counts[t],`Do not drop ${t}`);
 assert.deepEqual(db.prepare('SELECT id,founder_status,verification_status,enrollment_status FROM people ORDER BY id').all(),statuses,'A class-year review must not blanket-promote profile or enrollment status');
 assert.equal(db.prepare("SELECT enrollment_grad_year FROM people WHERE name='Octavius Kim'").get().enrollment_grad_year,2023,'Do not copy a teammate\'s 2024 year');
 assert.equal(db.prepare("SELECT enrollment_grad_year FROM people WHERE name='Craig Thompson'").get().enrollment_grad_year,2022,'Keep the separately stated graduate degree');
 assert.equal(db.prepare("SELECT enrollment_grad_year FROM people WHERE name='Josh Aviv'").get().enrollment_grad_year,2017,'Do not replace a graduate degree with the undergraduate year');
 assert.equal(db.prepare("SELECT enrollment_grad_year FROM people WHERE name='Utkarsh Saxena'").get().enrollment_grad_year,null,'Company founding is not graduation');
 assert.equal(db.prepare("SELECT r.status FROM person_class_year_reviews r JOIN people p ON p.id=r.person_id WHERE p.name='Joshua Baek'").get().status,'conflict');
 assert.ok(!manifest.observations.some(o=>o.name==='Aaron Wang'&&o.graduationYear===2025),'A different teammate\'s year must not leak through');
 const carlos=manifest.observations.find(o=>o.name==='Carlos Gosen');
 assert.equal(carlos?.graduationYear,2025);
 assert.match(carlos.retrievalMethod,/Manually inspected rendered PDF/,'PDF columns require visual name-to-degree confirmation');
 assert.match(carlos.evidence,/page 3/);
 assert.equal(db.prepare("SELECT enrollment_grad_year FROM people WHERE name='Advika Vuppala'").get().enrollment_grad_year,2028,'Use CMU expected degree year rather than GHC conference date');
 assert.equal(db.prepare("SELECT r.status FROM person_class_year_reviews r JOIN people p ON p.id=r.person_id WHERE p.name='Advika Vuppala'").get().status,'verified');
 assert.deepEqual(db.pragma('foreign_key_check'),[]);
 const before=db.prepare('SELECT * FROM person_class_year_reviews ORDER BY person_id').all();db.close();
 const second=run();assert.equal(second.yearsFilled+second.yearsCorrected+second.invalidYearsCleared+second.claimsAdded,0);
 db=new Database(file);assert.deepEqual(db.prepare('SELECT * FROM person_class_year_reviews ORDER BY person_id').all(),before);
 db.prepare("UPDATE people SET enrollment_grad_year=2031,enrollment_evidence='Newer independent research' WHERE name='Octavius Kim'").run();
 db.prepare("INSERT INTO people (id,name) VALUES ('review_new_person','New Unreviewed Person')").run();db.close();
 const concurrent=run();assert.equal(concurrent.concurrentChanges.length,1);
 db=new Database(file);assert.equal(db.prepare("SELECT enrollment_grad_year FROM people WHERE name='Octavius Kim'").get().enrollment_grad_year,2031);
 assert.equal(db.prepare("SELECT 1 FROM person_class_year_reviews WHERE person_id='review_new_person'").get(),undefined,'New records require their own review');db.close();
 console.log(JSON.stringify({first,repeatIsIdempotent:true,concurrentEditsPreserved:true,profileStatusesUnchanged:true}));
}finally{fs.rmSync(dir,{recursive:true,force:true});}
