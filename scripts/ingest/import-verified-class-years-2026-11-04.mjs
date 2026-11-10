import fs from 'node:fs';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
const db=new Database(process.env.CAMPUS_UNIVERSE_DB_PATH || 'data/campus-universe.db');
db.pragma('foreign_keys=ON');
const batch='verified-class-years-2026-11-04';
db.exec('CREATE TABLE IF NOT EXISTS corpus_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL, report_json TEXT NOT NULL)');
if(db.prepare('SELECT 1 FROM corpus_migrations WHERE id=?').get(batch)){console.log(JSON.stringify({batch,alreadyApplied:true}));db.close();process.exit(0);}
const rows=JSON.parse(fs.readFileSync(`data/imports/${batch}.json`,'utf8'));
const norm=s=>(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const stable=(kind,value)=>`${kind}_${crypto.createHash('sha256').update(`${batch}:${value}`).digest('hex').slice(0,24)}`;
// These names are variants in Cornell's own cohort pages, checked against their stored Cornell source URLs.
const aliases={'EcoMatia':'EcoMatia LLC','JOUS, Inc.':'JOUS','Mizoma':'Mizoma Africa','XPLAIN':'Proactive AI - XPLAIN'};
const report={batch,peopleAdded:0,projectsAdded:0,yearsFilled:0,yearsConfirmed:0,conflicts:[],rows:rows.length};
db.transaction(()=>{
 for(const r of rows){
  const sourceId=stable('src',r.sourceUrl);
  db.prepare(`INSERT OR IGNORE INTO sources (id,name,family,url,campuses_json,priority,ingestion_mode,status,source_role,created_at) VALUES (?,?,?,?,?,?,'manual','active','discovery',?)`).run(sourceId,r.universityId==='univ_cornell'?`Cornell eLab roster (${r.publishedDate})`:'Waterloo Engineering: Jocelyne Murphy','university',r.sourceUrl,JSON.stringify([r.universityId]),1,'2026-11-04 00:00:00');
  const allProjects=db.prepare('SELECT id,name FROM projects').all();
  let projects=allProjects.filter(p=>norm(p.name)===norm(aliases[r.company]||r.company));
  // Exact printed spelling resolves GO2 vs a separate GO₂ record; never merge on the normalized name alone.
  if(projects.length>1) projects=projects.filter(p=>p.name===r.company);
  if(projects.length>1) throw new Error(`Ambiguous project: ${r.company}`);
  let project=projects[0];
  if(project){
   const evidence=db.prepare(`SELECT 1 FROM claims WHERE entity_id=? AND (source_url LIKE '%cornell.edu%' OR source_url LIKE '%elabstartup.com%') UNION SELECT 1 FROM person_project_roles r JOIN affiliations a ON a.person_id=r.person_id WHERE r.project_id=? AND a.university_id=? LIMIT 1`).get(project.id,project.id,r.universityId);
   if(!evidence && r.company!=='Wygo') throw new Error(`No campus corroboration for ${r.company}`);
  } else {
   project={id:stable('proj',`${r.universityId}:${r.company}`),name:r.company};
   report.projectsAdded+=db.prepare(`INSERT OR IGNORE INTO projects (id,name,kind,is_investable_candidate,verification_status,verification_note,excluded_reason,created_at,updated_at) VALUES (?,?,'company',0,'unverified',?,'unverified recency',?,?)`).run(project.id,project.name,'Student venture listed by Cornell eLab; incorporation, funding, and current operating status not verified.','2026-11-04 00:00:00','2026-11-04 00:00:00').changes;
  }
  const candidates=db.prepare('SELECT * FROM people').all().filter(p=>norm(p.name)===norm(r.name));
  const linked=candidates.filter(p=>db.prepare('SELECT 1 FROM person_project_roles WHERE person_id=? AND project_id=?').get(p.id,project.id));
  const onCampus=candidates.filter(p=>db.prepare('SELECT 1 FROM affiliations WHERE person_id=? AND university_id=?').get(p.id,r.universityId));
  const possible=linked.length?linked:onCampus;
  if(possible.length>1)throw new Error(`Ambiguous person: ${r.name}`);
  let person=possible[0];
  if(!person){
   const id=stable('person',`${r.universityId}:${r.name}`);
   report.peopleAdded+=db.prepare(`INSERT OR IGNORE INTO people (id,name,founder_status,verification_status,verification_note,created_at) VALUES (?,?,'founder','unverified',?,?)`).run(id,r.name,'University/program source confirms the named venture team and class year; other profile fields are not verified.','2026-11-04 00:00:00').changes;
   person=db.prepare('SELECT * FROM people WHERE id=?').get(id);
  }
  const claimId=stable('claim',`${person.id}:${project.id}:${r.sourceUrl}`);
  const evidence=`${r.name}: ${r.degree?r.degree+' ':''}class of ${r.graduationYear}; listed with ${r.company}.`;
  db.prepare(`INSERT OR IGNORE INTO claims (id,entity_type,entity_id,claim_type,value_json,excerpt,source_id,source_url,published_date,retrieved_at,label,verification_state,created_at) VALUES (?,'person',?,'education',?,?,?,?,?,?,'observed_fact','confirmed',?)`).run(claimId,person.id,JSON.stringify({universityId:r.universityId,graduationYear:r.graduationYear,degree:r.degree,projectId:project.id,yearMeaning:r.yearMeaning}),evidence,sourceId,r.sourceUrl,r.publishedDate,'2026-11-04T00:00:00Z','2026-11-04 00:00:00');
  // A conflicting existing class year is retained for review, never silently overwritten.
  if(person.enrollment_grad_year!=null && person.enrollment_grad_year!==r.graduationYear){
   report.conflicts.push({personId:person.id,existingYear:person.enrollment_grad_year,sourceYear:r.graduationYear,sourceUrl:r.sourceUrl});
  } else {
   if(person.enrollment_grad_year==null)report.yearsFilled++;else report.yearsConfirmed++;
   db.prepare(`UPDATE people SET enrollment_grad_year=?,enrollment_label=?,enrollment_evidence=?,enrollment_source_url=?,enrollment_source_id=?,enrollment_basis='verified' WHERE id=?`).run(r.graduationYear,`${r.degree?r.degree+' ':''}Class of ${r.graduationYear}`,`${evidence} ${r.yearMeaning}. Source dated ${r.publishedDate}.`,r.sourceUrl,sourceId,person.id);
  }
  if(!db.prepare('SELECT 1 FROM affiliations WHERE person_id=? AND university_id=?').get(person.id,r.universityId)) db.prepare(`INSERT INTO affiliations (id,person_id,university_id,role,status,claim_id,created_at) VALUES (?,?,?,'student / alumni','confirmed',?,?)`).run(stable('aff',`${person.id}:${r.universityId}`),person.id,r.universityId,claimId,'2026-11-04 00:00:00');
  if(!db.prepare('SELECT 1 FROM person_project_roles WHERE person_id=? AND project_id=?').get(person.id,project.id)) db.prepare(`INSERT INTO person_project_roles (id,person_id,project_id,role,claim_id) VALUES (?,?,?,'founder',?)`).run(stable('role',`${person.id}:${project.id}`),person.id,project.id,claimId);
  const key=`${batch}:${person.id}:${project.id}`;
  db.prepare(`INSERT OR IGNORE INTO accuracy_audit (id,entity_type,entity_id,action,field,old_value,new_value,reason,evidence_url,checked_at,idempotency_key) VALUES (?,'person',?,'verify','enrollment_grad_year',?,?,?,?,?,?)`).run(stable('audit',key),person.id,person.enrollment_grad_year==null?null:String(person.enrollment_grad_year),String(r.graduationYear),'Class year is explicitly attached to this person on the official university/program page; cohort year was not substituted.',r.sourceUrl,'2026-11-04',key);
 }
 db.prepare('INSERT INTO corpus_migrations VALUES (?,?,?)').run(batch,'2026-11-04T00:00:00.000Z',JSON.stringify(report));
 if(db.pragma('foreign_key_check').length)throw new Error('Foreign-key check failed');
})();
console.log(JSON.stringify(report));db.close();
