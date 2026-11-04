import fs from 'node:fs';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';

const manifest=JSON.parse(fs.readFileSync('data/imports/class-year-review-2026-11-04.json','utf8'));
const db=new Database(process.env.CAMPUS_UNIVERSE_DB_PATH||'data/campus-universe.db');
db.pragma('foreign_keys=ON');
const batch=manifest.version;
const stable=(kind,key)=>`${kind}_${crypto.createHash('sha256').update(`${batch}:${key}`).digest('hex').slice(0,24)}`;
const reviewed=new Set(manifest.reviewedPeople);
const attempts=new Map(manifest.sourceAttempts.map(a=>[a.url,a]));
const observations=new Map();
for(const o of manifest.observations){const list=observations.get(o.personId)||[];list.push(o);observations.set(o.personId,list);}
const patches=new Map(manifest.patches.map(p=>[p.personId,p]));
const validUrl=s=>{try{return ['http:','https:'].includes(new URL(s).protocol);}catch{return false;}};
const norm=s=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const report={batch,peopleReviewed:0,yearsVerified:0,yearsFilled:0,yearsCorrected:0,invalidYearsCleared:0,claimsAdded:0,conflicts:0,concurrentChanges:[],statuses:{}};

db.transaction(()=>{
 db.exec(`CREATE TABLE IF NOT EXISTS person_class_year_reviews (
   person_id TEXT PRIMARY KEY REFERENCES people(id), review_version TEXT NOT NULL,
   reviewed_at TEXT NOT NULL, status TEXT NOT NULL, reason TEXT NOT NULL,
   reviewed_year INTEGER, previous_year INTEGER, source_coverage TEXT NOT NULL,
   observations_json TEXT NOT NULL, checked_urls_json TEXT NOT NULL, profile_flags_json TEXT NOT NULL
 )`);
 const audit=(id,field,before,after,reason,url)=>{
  const key=`${batch}:${id}:${field}`;
  db.prepare(`INSERT OR IGNORE INTO accuracy_audit (id,entity_type,entity_id,action,field,old_value,new_value,reason,evidence_url,checked_at,idempotency_key) VALUES (?,'person',?,'review',?,?,?,?,?,?,?)`).run(stable('audit',key),id,field,before==null?null:JSON.stringify(before),after==null?null:JSON.stringify(after),reason,url,manifest.checkedAt,key);
 };
 for(const o of manifest.observations){
  if(!db.prepare('SELECT 1 FROM people WHERE id=?').get(o.personId))continue;
  if(!db.prepare('SELECT 1 FROM universities WHERE id=?').get(o.universityId))throw new Error(`Unknown school ${o.universityId}`);
  if(!validUrl(o.sourceUrl))throw new Error(`Invalid evidence URL ${o.sourceUrl}`);
  const existing=db.prepare('SELECT id FROM sources WHERE url=? ORDER BY id LIMIT 1').get(o.sourceUrl);
  const sourceId=existing?.id||stable('src',o.sourceUrl);
  db.prepare(`INSERT OR IGNORE INTO sources (id,name,family,url,campuses_json,priority,ingestion_mode,status,source_role) VALUES (?,?, 'web',?,?,1,'manual','active','discovery')`).run(sourceId,`Class-year evidence: ${new URL(o.sourceUrl).hostname}`,o.sourceUrl,JSON.stringify([o.universityId]));
  report.claimsAdded+=db.prepare(`INSERT OR IGNORE INTO claims (id,entity_type,entity_id,claim_type,value_json,excerpt,source_id,source_url,retrieved_at,label,verification_state) VALUES (?,'person',?,'education',?,?,?,?,?,'observed_fact','confirmed')`).run(stable('claim',`${o.personId}:${o.universityId}:${o.graduationYear}:${o.sourceUrl}`),o.personId,JSON.stringify({universityId:o.universityId,graduationYear:o.graduationYear,yearMeaning:o.yearMeaning,reviewVersion:batch,retrievalMethod:o.retrievalMethod}),o.evidence,sourceId,o.sourceUrl,`${manifest.checkedAt}T00:00:00Z`).changes;
 }
 const people=db.prepare('SELECT * FROM people ORDER BY id').all();
 const schools=new Map(),roles=new Set(),urls=new Map(),names=new Map();
 for(const p of people){if(validUrl(p.enrollment_source_url))urls.set(p.id,new Set([p.enrollment_source_url]));const key=norm(p.name);names.set(key,(names.get(key)||0)+1);}
 for(const a of db.prepare('SELECT person_id,university_id FROM affiliations').all()){const set=schools.get(a.person_id)||new Set();set.add(a.university_id);schools.set(a.person_id,set);}
 for(const r of db.prepare('SELECT person_id FROM person_project_roles').all())roles.add(r.person_id);
 for(const c of db.prepare(`SELECT entity_id,source_url FROM claims WHERE entity_type='person'
   UNION SELECT a.person_id,c.source_url FROM affiliations a JOIN claims c ON c.id=a.claim_id
   UNION SELECT r.person_id,c.source_url FROM person_project_roles r JOIN claims c ON c.id=r.claim_id`).all()){
  if(validUrl(c.source_url)){const set=urls.get(c.entity_id)||new Set();set.add(c.source_url);urls.set(c.entity_id,set);}
 }
 for(let p of people){
  // A new person added after the reviewed snapshot must never inherit a completed-review label.
  if(!reviewed.has(p.id))continue;
  report.peopleReviewed++;
  const obs=observations.get(p.id)||[];
  const patch=patches.get(p.id);
  let conflict=manifest.conflicts[p.id]||null;
  if(patch && p.enrollment_grad_year!==patch.newYear){
   const unchanged=p.enrollment_grad_year===patch.expectedYear && (patch.expectedYear==null || (p.enrollment_source_url===patch.expectedSourceUrl && p.enrollment_evidence===patch.expectedEvidence));
   if(unchanged){
    audit(p.id,'enrollment_grad_year',{year:p.enrollment_grad_year,label:p.enrollment_label,evidence:p.enrollment_evidence,sourceUrl:p.enrollment_source_url,basis:p.enrollment_basis},{year:patch.newYear},patch.reason,obs[0]?.sourceUrl||p.enrollment_source_url);
    db.prepare(`UPDATE people SET enrollment_grad_year=?,enrollment_label=?,enrollment_basis=?,enrollment_evidence=? WHERE id=?`).run(patch.newYear,patch.newYear==null?null:`Class of ${patch.newYear}`,patch.newYear==null?'unknown':'verified',patch.newYear==null?patch.reason:p.enrollment_evidence,p.id);
    if(patch.newYear==null)report.invalidYearsCleared++;else if(patch.expectedYear==null)report.yearsFilled++;else report.yearsCorrected++;
    p=db.prepare('SELECT * FROM people WHERE id=?').get(p.id);
   }else{conflict='This record changed after the source review. The newer value was preserved and needs comparison with the reviewed observations.';report.concurrentChanges.push(p.id);}
  }
  const current=obs.filter(o=>o.graduationYear===p.enrollment_grad_year && schools.get(p.id)?.has(o.universityId));
  let status,reason;
  if(conflict){status='conflict';reason=conflict;report.conflicts++;}
  else if(current.length){
   status='verified';reason='An explicit individual class designation is supported by a published source. This does not verify degree completion, current enrollment, or company role.';report.yearsVerified++;
   const best=current.find(o=>o.sourceUrl===p.enrollment_source_url)||current[0];
   const sourceId=db.prepare('SELECT id FROM sources WHERE url=? ORDER BY id LIMIT 1').get(best.sourceUrl).id;
   const next={sourceUrl:best.sourceUrl,evidence:`${best.evidence} ${best.yearMeaning}. Checked ${manifest.checkedAt}.`,basis:'verified'};
   if(p.enrollment_source_url!==next.sourceUrl||p.enrollment_evidence!==next.evidence||p.enrollment_basis!=='verified'){
    audit(p.id,'class_year_evidence',{sourceUrl:p.enrollment_source_url,evidence:p.enrollment_evidence,basis:p.enrollment_basis},next,reason,best.sourceUrl);
    db.prepare(`UPDATE people SET enrollment_source_url=?,enrollment_source_id=?,enrollment_evidence=?,enrollment_basis='verified' WHERE id=?`).run(next.sourceUrl,sourceId,next.evidence,p.id);
   }
  }else if(patch?.newYear===null && p.enrollment_grad_year==null){status='invalid_inference';reason=patch.reason;}
  else if(p.enrollment_grad_year==null){status='missing';reason='No independently supported individual class year found in the reviewed evidence. No year was inferred from program dates or company history.';}
  else {
   const relevant=attempts.get(p.enrollment_source_url);
   status=relevant&&!relevant.readable?'source_unavailable':'needs_review';
   reason=status==='source_unavailable'?'The cited year source could not be retrieved. The stored year is retained but is not verified.':'The reviewed material did not establish this individual year with sufficient confidence. The stored year is retained for review; a cohort or team year is not enough.';
  }
  const checked=[...(urls.get(p.id)||[])].filter(u=>attempts.has(u)).sort().map(url=>({url,readable:attempts.get(url).readable}));
  const coverage=checked.length?`${checked.length} linked source(s) checked; ${checked.filter(s=>s.readable).length} readable. Retrieval alone does not verify a claim.`:'Stored evidence screened; no linked institutional year source retrieved.';
  const flags=[];
  if(!(urls.get(p.id)?.size))flags.push('No source URL on file');
  if(!(schools.get(p.id)?.size))flags.push('No school affiliation on file');
  if(!roles.has(p.id))flags.push('No company or project link on file');
  if(names.get(norm(p.name))>1)flags.push('Another record has the same normalized name; identity merge requires corroboration');
  if(p.name.trim().split(/\s+/).length<2)flags.push('Name may be incomplete or a handle');
  db.prepare(`INSERT INTO person_class_year_reviews (person_id,review_version,reviewed_at,status,reason,reviewed_year,previous_year,source_coverage,observations_json,checked_urls_json,profile_flags_json) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(person_id) DO UPDATE SET review_version=excluded.review_version,reviewed_at=excluded.reviewed_at,status=excluded.status,reason=excluded.reason,reviewed_year=excluded.reviewed_year,previous_year=excluded.previous_year,source_coverage=excluded.source_coverage,observations_json=excluded.observations_json,checked_urls_json=excluded.checked_urls_json,profile_flags_json=excluded.profile_flags_json`).run(p.id,batch,manifest.checkedAt,status,reason,p.enrollment_grad_year,patch?.expectedYear??null,coverage,JSON.stringify(obs),JSON.stringify(checked),JSON.stringify(flags));
  report.statuses[status]=(report.statuses[status]||0)+1;
 }
 if(db.pragma('foreign_key_check').length)throw new Error('Foreign-key check failed');
})();
console.log(JSON.stringify(report));db.close();
