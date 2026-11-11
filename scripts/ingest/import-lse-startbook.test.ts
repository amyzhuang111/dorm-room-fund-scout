import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { applyLseBatch, lseId, validateLseBatch } from './import-lse-startbook';
import type { StartbookBatch } from '../../lib/discovery/startbook';
import { readLinkedInCandidate } from '../../lib/domain/person-link';
import { computeRubric } from '../../lib/scoring/rubric';
async function main() {
const batch = JSON.parse(fs.readFileSync('data/imports/lse-startbook-2026-11-11.json','utf8')) as StartbookBatch;
const source = process.env.CAMPUS_UNIVERSE_DB_PATH;
assert.ok(source && source.startsWith('/tmp/'), 'Tests require an explicit scratch corpus.');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'lse-import-test-'));
const base=new Database(source,{readonly:true});
await base.backup(path.join(temp,'test.db')); base.close();
const db=new Database(path.join(temp,'test.db')); db.pragma('foreign_keys=ON');
const counts=()=>Object.fromEntries(['projects','people','claims','assessments','relationships','affiliations','company_facts','person_project_roles'].map(t=>[t,(db.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as {n:number}).n]));
try {
 const before=counts(), fk=db.pragma('foreign_key_check');
 const first=applyLseBatch(db,batch);
 assert.equal(first.companies,142); assert.equal(first.createdCompanies,141); assert.equal(first.createdPeople,178);
 const after=counts();
 for(const key of Object.keys(before)) assert.ok(after[key]>=before[key],`${key} must not shrink`);
 assert.deepEqual(db.pragma('foreign_key_check'),fk);
 const second=applyLseBatch(db,batch);
 assert.equal(second.createdCompanies,0); assert.equal(second.createdPeople,0); assert.deepEqual(counts(),after,'rerun is idempotent');
 assert.equal(first.results.find(r=>r.key==='marymount-labs')?.projectId,'proj_x4fcAJntkOJg');
 for(const key of ['aithena','kino','solis']) assert.equal(first.results.find(r=>r.key===key)?.projectId,lseId('proj',key),'same name must not merge distinct businesses');
 for(const row of batch.companies) {
   const assessment=db.prepare('SELECT ratings_json,coverage,quality_score FROM assessments WHERE id=?').get(lseId('assessment','lse-startbook-2026-11-11',row.key)) as {ratings_json:string;coverage:number;quality_score:number|null};
   const result=computeRubric(JSON.parse(assessment.ratings_json));
   assert.equal(assessment.quality_score,result.qualityScore); assert.equal(assessment.coverage,result.coverage);
 }
 const candidate=db.prepare("SELECT value_json,verification_state FROM claims WHERE source_id='src_lse_startbook' AND claim_type='linkedin_candidate' LIMIT 1").get() as {value_json:string;verification_state:string};
 assert.ok(readLinkedInCandidate(candidate.value_json,candidate.verification_state)?.url,'public founder LinkedIn link must be usable');
 const stages=db.prepare("SELECT value_text FROM company_facts WHERE origin='startbook_directory' AND fact_key='funding_round'").all() as {value_text:string}[];
 assert.equal(stages.length,45); assert.ok(stages.every(r=>['Pre-seed','Seed'].includes(r.value_text)),'fundraising/prototype must not imply pre-seed');
 assert.equal((db.prepare("SELECT count(*) n FROM claims WHERE source_id='src_lse_startbook' AND claim_type='funding'").get() as {n:number}).n,0);
 for(const person of batch.companies.flatMap(r=>r.founders).filter(f=>f.lseQualification==='I did not attend LSE')) {
   assert.equal(db.prepare("SELECT 1 FROM affiliations WHERE person_id=? AND university_id='univ_lse'").get(lseId('person',person.key)),undefined);
 }
 const bad=structuredClone(batch); bad.companies[0].review.status='pending';
 assert.throws(()=>validateLseBatch(bad),/Review required/);
 const conflict=structuredClone(batch); conflict.companies[0].key='new-test-row'; conflict.companies[1].key='another-new-test-row'; conflict.companies[1].existingProjectId='missing'; conflict.companies[1].identitySourceUrl='https://example.com';
 assert.throws(()=>applyLseBatch(db,conflict),/Reviewed identity changed/); assert.deepEqual(counts(),after,'failure rolls back all writes');
 console.log(JSON.stringify({checkedCompanies:142,createdCompanies:first.createdCompanies,createdPeople:first.createdPeople,checks:['idempotence','no row loss','foreign keys','homonyms','stage evidence','ratings','education','rollback']}));
} finally {db.close(); fs.rmSync(temp,{recursive:true,force:true});}

}
main().catch(error => { console.error(error); process.exitCode=1; });
