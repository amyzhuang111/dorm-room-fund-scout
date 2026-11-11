import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { PGlite } from '@electric-sql/pglite';
import { readSnapshot, migrate, validateSchema, type Target, type Row } from './corpus-migration';

async function main() {
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'scout-pg-'));
  const file=path.join(folder,'source.db');
  const source=new Database(file);
  source.exec(`CREATE TABLE parents(id TEXT PRIMARY KEY, label TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE children(id TEXT PRIMARY KEY, parent_id TEXT REFERENCES parents(id), year INTEGER, amount REAL, status TEXT CHECK(status IN ('active','closed')), UNIQUE(parent_id,year));
    CREATE TABLE audit(id TEXT PRIMARY KEY, note TEXT);
    INSERT INTO audit VALUES(NULL,'historical source ID missing'),(NULL,'another');
    CREATE UNIQUE INDEX unique_child_year ON children(parent_id,IFNULL(year,0));
    INSERT INTO parents(id,label) VALUES ('p','O''Brien');
    INSERT INTO children VALUES ('c','p',2026,1.25,'active');`);
  source.close();
  const pg=new PGlite();
  const target:Target={query:async(text,values)=> (await pg.query<Row>(text,values)).rows,transaction:fn=>pg.transaction(tx=>fn(async(text,values)=>(await tx.query<Row>(text,values)).rows))};
  try {
    const snapshot=readSnapshot(file);
    assert.throws(()=>validateSchema('public'));
    assert.throws(()=>validateSchema('scout_import_a;DROP SCHEMA public'));
    const result=await migrate(target,snapshot,'scout_import_test');
    assert.equal(result.disposition,'imported_and_verified');
    assert.equal(result.preservedNullableKeys[0].rows,2);
    assert.equal((await pg.query('SELECT DISTINCT _scout_row_id FROM scout_import_test.audit WHERE id IS NULL')).rows.length,2);
    assert.equal((await migrate(target,snapshot,'scout_import_test')).disposition,'verified_existing');
    await assert.rejects(pg.query("INSERT INTO scout_import_test.children VALUES ('bad','absent',2025,1,'active')"),/foreign key/);
    await assert.rejects(pg.query("INSERT INTO scout_import_test.children VALUES ('bad','p',2025,1,'unknown')"),/check constraint/);
    await assert.rejects(pg.query("INSERT INTO scout_import_test.children VALUES ('bad','p',2026,1,'active')"),/unique constraint/);
    const broken={...snapshot,tables:snapshot.tables.map(t=>t.name==='children'?{...t,rows:t.rows.map(r=>({...r,parent_id:'absent'}))}:t)};
    await assert.rejects(migrate(target,broken,'scout_import_rollback'));
    assert.equal((await pg.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name='scout_import_rollback'")).rows.length,0);
    await pg.query("UPDATE scout_import_test.parents SET label='changed'");
    await assert.rejects(migrate(target,snapshot,'scout_import_test'),/Verification failed/);
    // An optional scratch corpus verifies every real table and source row in PostgreSQL.
    if (process.env.CAMPUS_MIGRATION_TEST_SOURCE) {
      const full=readSnapshot(process.env.CAMPUS_MIGRATION_TEST_SOURCE);
      const imported=await migrate(target,full,'scout_import_corpus_test');
      console.log(JSON.stringify({fullCorpus:imported.tables,rows:full.tables.reduce((n,t)=>n+t.rows.length,0),foreignKeys:imported.foreignKeys}));
    }
    console.log('Postgres migration: constraints, quoting, idempotency, row hashes, rollback passed');
  } finally { await pg.close(); fs.rmSync(folder,{recursive:true,force:true}); }
}
main().catch(e=>{console.error(e instanceof Error?e.message:e);process.exitCode=1;});
