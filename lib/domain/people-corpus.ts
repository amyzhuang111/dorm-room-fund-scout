import { cleanCsvList, cleanCsvText, cleanCsvUrl, cleanCsvUrls, encodeCsv } from "@/lib/display/csv";
import { getDb } from "@/lib/db/client";

export interface PersonCorpusRow {
  id: string; name: string; founderStatus: string; enrollmentStatus: string;
  verification: string; graduationYear: number | null; yearEvidence: string | null;
  yearSourceUrl: string | null; yearChecked: boolean;
  yearReviewStatus: string; yearReviewReason: string; yearReviewedAt: string | null;
  previousYear: number | null; yearSourceCoverage: string;
  educationObservations: {universityId:string;graduationYear:number;sourceUrl:string;evidence:string;yearMeaning:string;retrievalMethod:string}[];
  profileEvidenceFlags: string[];
  campuses: {id:string;name:string}[];
  projects: {id:string;name:string;role:string}[];
  sourceUrls: string[];
}
export type PeopleOptions = {q?:string;campus?:string;year?:string;status?:string;review?:string};
export function loadPeopleCorpus(): PersonCorpusRow[] {
  const db=getDb();
  const rows=db.prepare(`SELECT id,name,founder_status,enrollment_status,verification_status,enrollment_grad_year,enrollment_evidence,enrollment_source_url FROM people ORDER BY name COLLATE NOCASE,id`).all() as {id:string;name:string;founder_status:string|null;enrollment_status:string|null;verification_status:string|null;enrollment_grad_year:number|null;enrollment_evidence:string|null;enrollment_source_url:string|null}[];
  const byId=new Map<string,PersonCorpusRow>(rows.map(r=>[r.id,{id:r.id,name:r.name,founderStatus:r.founder_status||'unknown',enrollmentStatus:r.enrollment_status||'unknown',verification:r.verification_status||'unverified',graduationYear:r.enrollment_grad_year,yearEvidence:r.enrollment_grad_year==null?null:r.enrollment_evidence,yearSourceUrl:r.enrollment_grad_year==null?null:httpUrl(r.enrollment_source_url),yearChecked:false,yearReviewStatus:'not_reviewed',yearReviewReason:'This record has not been included in the complete class-year review.',yearReviewedAt:null,previousYear:null,yearSourceCoverage:'',educationObservations:[],profileEvidenceFlags:[],campuses:[],projects:[],sourceUrls:httpUrl(r.enrollment_source_url)?[httpUrl(r.enrollment_source_url)!]:[]} ]));
  for(const r of db.prepare(`SELECT DISTINCT a.person_id,u.id,u.name FROM affiliations a JOIN universities u ON u.id=a.university_id ORDER BY u.name`).all() as {person_id:string;id:string;name:string}[]) byId.get(r.person_id)?.campuses.push({id:r.id,name:r.name});
  for(const r of db.prepare(`SELECT DISTINCT r.person_id,p.id,p.name,r.role FROM person_project_roles r JOIN projects p ON p.id=r.project_id ORDER BY p.name`).all() as {person_id:string;id:string;name:string;role:string}[]) byId.get(r.person_id)?.projects.push({id:r.id,name:r.name,role:r.role});
  for(const r of db.prepare(`SELECT entity_id,source_url,value_json,source_id,verification_state,claim_type,retrieved_at FROM claims WHERE entity_type='person'
    UNION SELECT a.person_id,c.source_url,c.value_json,c.source_id,c.verification_state,c.claim_type,c.retrieved_at FROM affiliations a JOIN claims c ON c.id=a.claim_id
    UNION SELECT r.person_id,c.source_url,c.value_json,c.source_id,c.verification_state,c.claim_type,c.retrieved_at FROM person_project_roles r JOIN claims c ON c.id=r.claim_id
    ORDER BY retrieved_at DESC`).all() as {entity_id:string;source_url:string|null;value_json:string;source_id:string|null;verification_state:string;claim_type:string}[]) {
    const person=byId.get(r.entity_id); if(!person)continue;
    const url=httpUrl(r.source_url);if(url&&!person.sourceUrls.includes(url))person.sourceUrls.push(url);
    if(r.claim_type==='education' && r.verification_state==='confirmed' && r.source_url===person.yearSourceUrl) {
      try { const value=JSON.parse(r.value_json); if(value.yearMeaning && value.graduationYear===person.graduationYear && value.universityId)person.yearChecked=true; } catch { /* preserve malformed historical claim without promoting it */ }
    }
  }
  if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='person_class_year_reviews'").get()){
    for(const r of db.prepare('SELECT * FROM person_class_year_reviews').all() as {person_id:string;reviewed_at:string;status:string;reason:string;reviewed_year:number|null;previous_year:number|null;source_coverage:string;observations_json:string;profile_flags_json:string}[]){
      const p=byId.get(r.person_id);if(!p)continue;
      const unchanged=r.reviewed_year===p.graduationYear;
      p.yearReviewStatus=unchanged?r.status:'changed_since_review';
      p.yearReviewReason=unchanged?r.reason:'The stored year changed after this review and needs rechecking.';
      p.yearReviewedAt=r.reviewed_at;p.previousYear=r.previous_year;p.yearSourceCoverage=r.source_coverage;
      p.yearChecked=unchanged&&r.status==='verified';
      try{p.educationObservations=JSON.parse(r.observations_json);p.profileEvidenceFlags=JSON.parse(r.profile_flags_json);}catch{/* Preserve the record without promoting malformed review data. */p.yearChecked=false;p.yearReviewStatus='needs_review';}
    }
  }
  for(const p of byId.values()) if(p.yearSourceUrl&&!p.sourceUrls.includes(p.yearSourceUrl))p.sourceUrls.unshift(p.yearSourceUrl);
  return [...byId.values()];
}
function httpUrl(value:string|null):string|null{if(!value)return null;try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&url.hostname?value:null;}catch{return null;}}
export function filterPeopleCorpus(opts:PeopleOptions={}):PersonCorpusRow[]{
  const q=(opts.q||'').trim().toLocaleLowerCase();
  return loadPeopleCorpus().filter(p=>(!q||[p.name,...p.campuses.map(c=>c.name),...p.projects.map(c=>c.name)].join(' ').toLocaleLowerCase().includes(q)) && (!opts.campus||p.campuses.some(c=>c.id===opts.campus)) && (!opts.status||p.founderStatus===opts.status) && (!opts.review||(opts.review==='unresolved'?!p.yearChecked:p.yearReviewStatus===opts.review)) && (!opts.year || (opts.year==='known'?p.graduationYear!=null:opts.year==='unknown'?p.graduationYear==null:String(p.graduationYear)===opts.year)));
}
export function yearReviewLabel(p:PersonCorpusRow):string{
  if(p.yearChecked)return 'Individual class year verified';
  return ({conflict:'Conflicting sources',source_unavailable:'Source unavailable; year unverified',needs_review:'Stored year needs review',missing:'No supported class year found',invalid_inference:'Invalid inferred year removed',changed_since_review:'Changed since review',not_reviewed:'Not yet reviewed'} as Record<string,string>)[p.yearReviewStatus]||'Needs review';
}
export function peopleCorpusToCsv(rows:PersonCorpusRow[]):string{
  const headers=['person_id','name','school_ids','schools','class_year','year_verification','year_source_url','year_evidence','founder_status','enrollment_status','profile_verification','project_ids','projects_and_roles','source_urls','class_year_review_status','class_year_review_reason','class_year_review_date','previous_class_year','review_source_coverage','class_year_observations','profile_evidence_flags','profile_review_scope'];
  return encodeCsv([headers,...rows.map(p=>[
    cleanCsvText(p.id),cleanCsvText(p.name),cleanCsvList(p.campuses.map(c=>c.id)),cleanCsvList(p.campuses.map(c=>c.name)),p.graduationYear,yearReviewLabel(p),cleanCsvUrl(p.yearSourceUrl),cleanCsvText(p.yearEvidence),cleanCsvText(p.founderStatus),cleanCsvText(p.enrollmentStatus),cleanCsvText(p.verification),cleanCsvList(p.projects.map(c=>c.id)),cleanCsvList(p.projects.map(c=>{const name=cleanCsvText(c.name);const role=cleanCsvText(c.role);return name&&role?`${name} (${role})`:name||role;})),cleanCsvUrls(p.sourceUrls),p.yearReviewStatus,cleanCsvText(p.yearReviewReason),p.yearReviewedAt,p.previousYear,cleanCsvText(p.yearSourceCoverage),JSON.stringify(p.educationObservations.map(o=>({...o,evidence:cleanCsvText(o.evidence),sourceUrl:cleanCsvUrl(o.sourceUrl),yearMeaning:cleanCsvText(o.yearMeaning)}))),cleanCsvList(p.profileEvidenceFlags),'Class-year review and stored evidence screening; other profile fields are not independently verified by this audit'
  ])]);
}
