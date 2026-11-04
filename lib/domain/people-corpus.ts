import { getDb } from "@/lib/db/client";

export interface PersonCorpusRow {
  id: string; name: string; founderStatus: string; enrollmentStatus: string;
  verification: string; graduationYear: number | null; yearEvidence: string | null;
  yearSourceUrl: string | null; yearChecked: boolean;
  campuses: {id:string;name:string}[];
  projects: {id:string;name:string;role:string}[];
  sourceUrls: string[];
}
export type PeopleOptions = {q?:string;campus?:string;year?:string;status?:string};
export function loadPeopleCorpus(): PersonCorpusRow[] {
  const db=getDb();
  const rows=db.prepare(`SELECT id,name,founder_status,enrollment_status,verification_status,enrollment_grad_year,enrollment_evidence,enrollment_source_url FROM people ORDER BY name COLLATE NOCASE,id`).all() as {id:string;name:string;founder_status:string|null;enrollment_status:string|null;verification_status:string|null;enrollment_grad_year:number|null;enrollment_evidence:string|null;enrollment_source_url:string|null}[];
  const byId=new Map<string,PersonCorpusRow>(rows.map(r=>[r.id,{id:r.id,name:r.name,founderStatus:r.founder_status||'unknown',enrollmentStatus:r.enrollment_status||'unknown',verification:r.verification_status||'unverified',graduationYear:r.enrollment_grad_year,yearEvidence:r.enrollment_evidence,yearSourceUrl:httpUrl(r.enrollment_source_url),yearChecked:false,campuses:[],projects:[],sourceUrls:[]} ]));
  for(const r of db.prepare(`SELECT DISTINCT a.person_id,u.id,u.name FROM affiliations a JOIN universities u ON u.id=a.university_id ORDER BY u.name`).all() as {person_id:string;id:string;name:string}[]) byId.get(r.person_id)?.campuses.push({id:r.id,name:r.name});
  for(const r of db.prepare(`SELECT DISTINCT r.person_id,p.id,p.name,r.role FROM person_project_roles r JOIN projects p ON p.id=r.project_id ORDER BY p.name`).all() as {person_id:string;id:string;name:string;role:string}[]) byId.get(r.person_id)?.projects.push({id:r.id,name:r.name,role:r.role});
  for(const r of db.prepare(`SELECT entity_id,source_url,value_json,source_id,verification_state,claim_type FROM claims WHERE entity_type='person' ORDER BY retrieved_at DESC`).all() as {entity_id:string;source_url:string|null;value_json:string;source_id:string|null;verification_state:string;claim_type:string}[]) {
    const person=byId.get(r.entity_id); if(!person)continue;
    const url=httpUrl(r.source_url);if(url&&!person.sourceUrls.includes(url))person.sourceUrls.push(url);
    if(r.claim_type==='education' && r.verification_state==='confirmed' && r.source_url===person.yearSourceUrl) {
      try { const value=JSON.parse(r.value_json); if(value.yearMeaning && value.graduationYear===person.graduationYear && value.universityId)person.yearChecked=true; } catch { /* preserve malformed historical claim without promoting it */ }
    }
  }
  for(const p of byId.values()) if(p.yearSourceUrl&&!p.sourceUrls.includes(p.yearSourceUrl))p.sourceUrls.unshift(p.yearSourceUrl);
  return [...byId.values()];
}
function httpUrl(value:string|null):string|null{if(!value)return null;try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&url.hostname?value:null;}catch{return null;}}
export function filterPeopleCorpus(opts:PeopleOptions={}):PersonCorpusRow[]{
  const q=(opts.q||'').trim().toLocaleLowerCase();
  return loadPeopleCorpus().filter(p=>(!q||[p.name,...p.campuses.map(c=>c.name),...p.projects.map(c=>c.name)].join(' ').toLocaleLowerCase().includes(q)) && (!opts.campus||p.campuses.some(c=>c.id===opts.campus)) && (!opts.status||p.founderStatus===opts.status) && (!opts.year || (opts.year==='known'?p.graduationYear!=null:opts.year==='unknown'?p.graduationYear==null:String(p.graduationYear)===opts.year)));
}
export function peopleCorpusToCsv(rows:PersonCorpusRow[]):string{
  const escape=(value:unknown)=>{const raw=String(value??'');const safe=/^[=+@\-\t\r]/.test(raw)?`'${raw}`:raw;return `"${safe.replace(/"/g,'""')}"`;};
  const headers=['person_id','name','school_ids','schools','class_year','year_verification','year_source_url','year_evidence','founder_status','enrollment_status','profile_verification','project_ids','projects_and_roles','source_urls'];
  return [headers,...rows.map(p=>[p.id,p.name,p.campuses.map(c=>c.id).join(' | '),p.campuses.map(c=>c.name).join(' | '),p.graduationYear,p.yearChecked?'Explicit individual class year verified':p.graduationYear==null?'Unknown':'Stored year; not rechecked',p.yearSourceUrl,p.yearEvidence,p.founderStatus,p.enrollmentStatus,p.verification,p.projects.map(c=>c.id).join(' | '),p.projects.map(c=>`${c.name} (${c.role})`).join(' | '),p.sourceUrls.join(' | ')])].map(r=>r.map(escape).join(',')).join('\r\n')+'\r\n';
}
