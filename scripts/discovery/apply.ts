import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { fingerprint, stageBatch, type ApprovedBatch, type Observation } from '../../lib/discovery/review';
import { readCatalog } from './catalog';

const stableId=(kind:string,value:unknown)=>`${kind}_discovery_${fingerprint(value).slice(0,18)}`;
const companyKey=(row:Observation)=>row.companyWebsite ? ['domain',new URL(row.companyWebsite).hostname.replace(/^www\./,'')] : ['name',row.companyName.toLowerCase(),row.campusId];
export function applyApprovedBatch(db:Database.Database,batch:ApprovedBatch) {
  if(batch.version!==1 || !Array.isArray(batch.rows) || !/^[a-z0-9][a-z0-9_-]{2,80}$/.test(batch.id)) throw Error('Invalid approved batch');
  const catalog=readCatalog(db), seen=new Set<string>();
  for(const row of batch.rows) {
    const {decision,reviewer,reviewedAt,digest,...staged}=row;
    if(decision!=='approve' || !reviewer.trim() || !Number.isFinite(Date.parse(reviewedAt)) || Date.parse(reviewedAt)<Date.parse(batch.createdAt) || Date.parse(reviewedAt)>Date.now()+300000) throw Error('Every imported row needs an explicit, dated review');
    if(fingerprint(staged)!==digest || !row.ready || row.issues.length) throw Error('Approved facts were changed or still need review');
    if(seen.has(row.rowId)) throw Error('Repeated approval row'); seen.add(row.rowId);
    if(row.companyId && !catalog.companies.some(c=>c.id===row.companyId)) throw Error('Reviewed company no longer exists');
    if(row.personId && !catalog.people.some(p=>p.id===row.personId)) throw Error('Reviewed person no longer exists');
    const observation:Observation={pathId:row.pathId,query:row.query,founderName:row.founderName,companyName:row.companyName,campusId:row.campusId,campusName:row.campusName,linkedinUrl:row.linkedinUrl,companyWebsite:row.companyWebsite,description:row.description,retrievedAt:row.retrievedAt,profileStatus:row.profileStatus,evidence:row.evidence,notes:row.notes};
    const fresh=stageBatch(batch.id,[observation],catalog,batch.createdAt).rows[0];
    if(!fresh.ready) throw Error(`${row.rowId}: catalog conflict; restage and review again`);
    // Newly appearing matches must be reviewed, rather than silently merged.
    const expectedCompany=row.companyId||stableId('proj',companyKey(row));
    const expectedPerson=row.personId||stableId('person',[row.linkedinUrl||row.founderName.toLowerCase(),expectedCompany,row.campusId]);
    if((fresh.companyId&&fresh.companyId!==expectedCompany)||(fresh.personId&&fresh.personId!==expectedPerson)) throw Error(`${row.rowId}: identity changed since review`);
  }
  const failuresBefore=new Set((db.pragma('foreign_key_check') as unknown[]).map(row=>JSON.stringify(row)));
  return db.transaction(()=>{
    db.exec(`CREATE TABLE IF NOT EXISTS discovery_import_rows (row_id TEXT PRIMARY KEY,batch_id TEXT NOT NULL,digest TEXT NOT NULL,reviewer TEXT NOT NULL,reviewed_at TEXT NOT NULL,project_id TEXT NOT NULL,person_id TEXT NOT NULL,imported_at TEXT NOT NULL)`);
    const results:{rowId:string;projectId:string;personId:string;status:string}[]=[];
    for(const row of batch.rows) {
      const prior=db.prepare('SELECT digest,project_id,person_id FROM discovery_import_rows WHERE row_id=?').get(row.rowId) as {digest:string;project_id:string;person_id:string}|undefined;
      if(prior) { if(prior.digest!==row.digest) throw Error('Previously imported row was changed');results.push({rowId:row.rowId,projectId:prior.project_id,personId:prior.person_id,status:'already imported'});continue; }
      const projectId=row.companyId||stableId('proj',companyKey(row));
      const personId=row.personId||stableId('person',[row.linkedinUrl||row.founderName.toLowerCase(),projectId,row.campusId]);
      db.prepare(`INSERT OR IGNORE INTO projects (id,name,kind,description,website_url,verification_status,verification_note,is_investable_candidate) VALUES (?,?,'company',?,?,'partial','Human-reviewed discovery evidence; eligibility and other missing fields still need verification.',1)`).run(projectId,row.companyName,row.description||null,row.companyWebsite||null);
      // A discovered URL becomes a confirmed alias only when the direct evidence identifies that profile.
      const aliases=row.linkedinUrl&&row.evidence.some(e=>e.kind!=='search_snippet'&&e.supports.includes('linkedin'))?[`linkedin:${row.linkedinUrl}`]:[];
      db.prepare(`INSERT OR IGNORE INTO people (id,name,aliases_json,founder_status,verification_status,verification_note) VALUES (?,?,?,'founder','partial','Human-reviewed discovery evidence. Graduation year and enrollment status are not inferred.')`).run(personId,row.founderName,JSON.stringify(aliases));
      // Add missing public fields without replacing existing reviewed data.
      if(row.companyWebsite) db.prepare("UPDATE projects SET website_url=? WHERE id=? AND (website_url IS NULL OR trim(website_url)='')").run(row.companyWebsite,projectId);
      if(aliases.length) {
        const existing=db.prepare('SELECT aliases_json FROM people WHERE id=?').get(personId) as {aliases_json:string};
        const current=JSON.parse(existing.aliases_json||'[]') as string[];
        if(!current.some(alias=>alias.includes('linkedin.com/in/'))) db.prepare('UPDATE people SET aliases_json=? WHERE id=?').run(JSON.stringify([...current,...aliases]),personId);
      }
      const claims:{id:string;supports:string[]}[]=[];
      for(const [i,evidence] of row.evidence.entries()) {
        if(evidence.kind==='search_snippet') continue;
        const sourceId=stableId('src',evidence.url),claimId=stableId('claim',[row.rowId,i]);
        db.prepare(`INSERT OR IGNORE INTO sources (id,name,family,url,campuses_json,ingestion_mode,status,source_role) VALUES (?,?,'founder_discovery',?,?,'reviewed_import','available','corroboration')`).run(sourceId,new URL(evidence.url).hostname,evidence.url,JSON.stringify([row.campusId]));
        db.prepare(`INSERT OR IGNORE INTO claims (id,entity_type,entity_id,claim_type,value_json,excerpt,source_id,source_url,retrieved_at,label,verification_state) VALUES (?,'person',?,'reviewed_discovery',?,?,?,?,?,'observed_fact','unverified')`).run(claimId,personId,JSON.stringify({founder:row.founderName,company:row.companyName,campus:row.campusName,supports:evidence.supports,reviewer:row.reviewer,reviewedAt:row.reviewedAt}),evidence.excerpt,sourceId,evidence.url,row.retrievedAt);
        claims.push({id:claimId,supports:evidence.supports});
      }
      const founderClaim=claims.find(c=>c.supports.includes('founder'))!.id,campusClaim=claims.find(c=>c.supports.includes('campus'))!.id;
      if(!db.prepare("SELECT 1 FROM person_project_roles WHERE person_id=? AND project_id=? AND lower(role) LIKE '%founder%'").get(personId,projectId)) db.prepare("INSERT INTO person_project_roles (id,person_id,project_id,role,claim_id) VALUES (?,?,?,'founder',?)").run(stableId('ppr',[personId,projectId]),personId,projectId,founderClaim);
      if(!db.prepare('SELECT 1 FROM affiliations WHERE person_id=? AND university_id=?').get(personId,row.campusId)) db.prepare("INSERT INTO affiliations (id,person_id,university_id,role,status,claim_id) VALUES (?,?,?,'Recorded campus affiliation','unverified',?)").run(stableId('aff',[personId,row.campusId]),personId,row.campusId,campusClaim);
      for(const [fromType,from,toType,to,kind,claim] of [['person',personId,'project',projectId,'founded',founderClaim],['person',personId,'university',row.campusId,'affiliated_with',campusClaim],['project',projectId,'university',row.campusId,'affiliated_with',campusClaim]]) {
        if(!db.prepare('SELECT 1 FROM relationships WHERE source_entity_type=? AND source_entity_id=? AND target_entity_type=? AND target_entity_id=? AND relationship_type=?').get(fromType,from,toType,to,kind)) db.prepare("INSERT INTO relationships (id,source_entity_type,source_entity_id,target_entity_type,target_entity_id,relationship_type,evidence_claim_ids_json,verification_state) VALUES (?,?,?,?,?,?,?,'affiliation_only')").run(stableId('rel',[from,to,kind]),fromType,from,toType,to,kind,JSON.stringify([claim]));
      }
      db.prepare('INSERT INTO discovery_import_rows VALUES (?,?,?,?,?,?,?,?)').run(row.rowId,batch.id,row.digest,row.reviewer,row.reviewedAt,projectId,personId,new Date().toISOString());
      results.push({rowId:row.rowId,projectId,personId,status:row.companyId&&row.personId?'evidence added':'imported'});
    }
    if((db.pragma('foreign_key_check') as unknown[]).some(row=>!failuresBefore.has(JSON.stringify(row)))) throw Error('Import introduced a foreign-key violation');
    return results;
  })();
}

export async function applyPublishedBatches() {
  const folder=path.join(process.cwd(),'data/discovery/approved');
  const files=fs.existsSync(folder)?fs.readdirSync(folder).filter(f=>f.endsWith('.json')).sort():[];
  if(!files.length){console.log('Discovery: no approved batches to publish.');return;}
  const {getDb}=await import('../../lib/db/client');
  for(const file of files) console.log(file,applyApprovedBatch(getDb(),JSON.parse(fs.readFileSync(path.join(folder,file),'utf8'))));
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/discovery/apply.ts')) applyPublishedBatches().catch(error=>{console.error(error instanceof Error?error.message:error);process.exitCode=1;});
