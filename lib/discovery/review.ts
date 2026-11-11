import { createHash } from 'node:crypto';
import { parseCsv } from '../ingest/csv';
import { encodeCsv } from '../display/csv';

export type Evidence = {
  url: string;
  excerpt: string;
  kind: 'profile_bio' | 'company_bio' | 'campus_directory' | 'search_snippet';
  supports: ('founder' | 'company' | 'campus' | 'linkedin')[];
};
export type Observation = {
  pathId: string; query: string; founderName: string; companyName: string;
  campusId: string; campusName: string; linkedinUrl: string; companyWebsite: string;
  description: string; retrievedAt: string;
  profileStatus: 'not_attempted' | 'fetched' | 'blocked' | 'failed';
  evidence: Evidence[]; notes: string;
};
export type Catalog = {
  campuses: {id:string;name:string}[];
  companies: {id:string;name:string;website:string|null}[];
  people: {id:string;name:string;linkedinUrls:string[];campusIds:string[];companyIds:string[]}[];
};
export type StagedRow = Observation & {
  rowId:string; digest:string; companyId:string; personId:string;
  issues:string[]; duplicate:string; ready:boolean;
};
export type Batch = {version:1;id:string;createdAt:string;rows:StagedRow[]};
export type ApprovedBatch = {version:1;id:string;createdAt:string;rows:(StagedRow & {decision:'approve';reviewer:string;reviewedAt:string})[]};
export const fingerprint = (value:unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const identityKey = (value:string) => value.normalize('NFKC').toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]/gu,'');
export function publicUrl(value:string):string {
  try { const u=new URL(value); if(u.protocol!=='https:' || u.username || u.password || !u.hostname.includes('.')) return ''; u.hash=''; return u.href; } catch { return ''; }
}
export function linkedinUrl(value:string):string {
  try { const u=new URL(value); if(!/(^|\.)linkedin\.com$/.test(u.hostname) || !/^\/in\/[^/]+\/?$/.test(u.pathname)) return ''; return `https://www.linkedin.com${u.pathname.replace(/\/$/,'')}`; } catch { return ''; }
}
function domain(value:string) { try { return new URL(value).hostname.replace(/^www\./,''); } catch { return ''; } }
function hashable(row:Omit<StagedRow,'digest'>|StagedRow) {
  const {digest:_,...rest}=row as StagedRow; return rest;
}
const validDate = (value:string) => /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
export function stageBatch(id:string, observations:Observation[], catalog:Catalog, now=new Date().toISOString()):Batch {
  if(!/^[a-z0-9][a-z0-9_-]{2,80}$/.test(id)) throw Error('Use a unique, plain batch ID.');
  const seen=new Set<string>();
  const rows=observations.map(raw=>{
    const row:Observation={...raw,linkedinUrl:linkedinUrl(raw.linkedinUrl),evidence:raw.evidence.map(e=>({...e,excerpt:e.excerpt.trim()}))};
    const issues:string[]=[];
    if(!row.founderName.trim() || row.founderName.trim().length<4 || /^[A-Z .]{1,5}$/.test(row.founderName)) issues.push('Full founder name missing');
    if(!row.companyName.trim() || /^(stealth( startup)?|unknown|n\/a)$/i.test(row.companyName.trim())) issues.push('Named company missing');
    if(!catalog.campuses.some(c=>c.id===row.campusId && c.name===row.campusName)) issues.push('Known campus identity required');
    if(!validDate(row.retrievedAt)) issues.push('Retrieval timestamp missing');
    for(const field of ['founder','company','campus'] as const) {
      if(!row.evidence.some(e=>e.kind!=='search_snippet' && e.supports.includes(field) && publicUrl(e.url) && e.excerpt.length>=12)) issues.push(`Direct ${field} evidence required`);
    }
    if(row.evidence.some(e=>!publicUrl(e.url) || e.excerpt.length>1400)) issues.push('Evidence URL or excerpt is invalid');
    if(row.companyWebsite && !publicUrl(row.companyWebsite)) issues.push('Invalid company website');
    if(raw.linkedinUrl && !row.linkedinUrl) issues.push('Invalid LinkedIn profile URL');
    const companies=catalog.companies.filter(c=>(row.companyWebsite && domain(c.website??'')===domain(row.companyWebsite)) || identityKey(c.name)===identityKey(row.companyName));
    if(companies.length>1) issues.push('Ambiguous company: resolve identity before restaging');
    const companyId=companies.length===1?companies[0].id:'';
    const exact=row.linkedinUrl?catalog.people.filter(p=>p.linkedinUrls.some(u=>linkedinUrl(u)===row.linkedinUrl)):[];
    const named=catalog.people.filter(p=>identityKey(p.name)===identityKey(row.founderName));
    const contextual=named.filter(p=>(companyId && p.companyIds.includes(companyId)) || p.campusIds.includes(row.campusId));
    const people=exact.length?exact:contextual;
    if(people.length>1 || (!people.length && named.length)) issues.push('Ambiguous person: resolve identity before restaging');
    if(exact.some(p=>identityKey(p.name)!==identityKey(row.founderName))) issues.push('Profile identity conflicts with recorded name');
    const personId=people.length===1?people[0].id:'';
    const key=row.linkedinUrl || [identityKey(row.founderName),identityKey(row.companyName),row.campusId].join(':');
    if(seen.has(key)) issues.push('Duplicate profile within this batch');
    seen.add(key);
    const staged:Omit<StagedRow,'digest'>={...row,rowId:`lead_${fingerprint([id,key]).slice(0,18)}`,companyId,personId,issues,duplicate:[companyId&&'Existing company',personId&&'Existing person'].filter(Boolean).join('; ') || 'New candidate',ready:issues.length===0};
    return {...staged,digest:fingerprint(staged)};
  });
  return {version:1,id,createdAt:now,rows};
}
export const REVIEW_COLUMNS=['row_id','decision','reviewer','reviewed_at','founder_name','company_name','campus','campus_id','linkedin_url','company_website','description','profile_status','quality','existing_company_id','existing_person_id','issues','source_urls','evidence','search_query','path','retrieved_at','notes','row_digest'] as const;
function displayCells(row:StagedRow):string[] {
  return [row.rowId,'hold','','',row.founderName,row.companyName,row.campusName,row.campusId,row.linkedinUrl,row.companyWebsite,row.description,row.profileStatus,row.ready?'Ready for review':'Needs evidence',row.companyId,row.personId,row.issues.join('; '),row.evidence.map(e=>e.url).join(' | '),row.evidence.map(e=>`${e.kind} [${e.supports.join(',')}]: ${e.excerpt}`).join(' | '),row.query,row.pathId,row.retrievedAt,row.notes,row.digest];
}
export function reviewCsv(batch:Batch) { return encodeCsv([[...REVIEW_COLUMNS],...batch.rows.map(displayCells)]); }
export function approveCsv(batch:Batch,text:string,now=new Date().toISOString()):ApprovedBatch {
  const csv=parseCsv(text.replace(/^\uFEFF/,''));
  if(JSON.stringify(csv[0])!==JSON.stringify(REVIEW_COLUMNS)) throw Error('Review CSV columns changed. Export a new review sheet.');
  const seen=new Set<string>(), approved:ApprovedBatch['rows']=[];
  for(const cells of csv.slice(1)) {
    if(cells.length!==REVIEW_COLUMNS.length) throw Error('Invalid CSV row width.');
    const row=batch.rows.find(r=>r.rowId===cells[0]);
    if(!row || seen.has(row.rowId)) throw Error('Unknown or repeated row ID.');
    seen.add(row.rowId);
    if(fingerprint(hashable(row))!==row.digest) throw Error('Staged snapshot was edited. Restage before reviewing.');
    const expected=parseCsv(encodeCsv([displayCells(row)]).replace(/^\uFEFF/,''))[0];
    if(cells.some((value,i)=>i>3 && value!==expected[i])) throw Error(`${row.rowId}: facts changed after staging. Restage the edited observation and review again.`);
    const decision=cells[1].trim().toLowerCase();
    if(!['approve','reject','hold'].includes(decision)) throw Error(`${row.rowId}: decision must be approve, reject, or hold.`);
    if(decision!=='approve') continue;
    if(!row.ready || row.issues.length) throw Error(`${row.rowId}: unresolved evidence or identity issues.`);
    if(!cells[2].trim() || !validDate(cells[3]) || Date.parse(cells[3])>Date.parse(now)+300000 || Date.parse(cells[3])<Date.parse(batch.createdAt)) throw Error(`${row.rowId}: reviewer and a valid review timestamp after staging are required.`);
    approved.push({...row,decision:'approve',reviewer:cells[2].trim(),reviewedAt:cells[3]});
  }
  if(seen.size!==batch.rows.length) throw Error('Review sheet is missing staged rows. Mark them reject or hold instead.');
  return {version:1,id:batch.id,createdAt:batch.createdAt,rows:approved};
}
export function qualityReport(batch:Batch) {
  return [...new Set(batch.rows.map(r=>r.pathId))].map(pathId=>{
    const rows=batch.rows.filter(r=>r.pathId===pathId);
    return {pathId,candidates:rows.length,profileAttempts:rows.filter(r=>r.profileStatus!=='not_attempted').length,profilesFetched:rows.filter(r=>r.profileStatus==='fetched').length,profilesBlocked:rows.filter(r=>r.profileStatus==='blocked').length,readyForReview:rows.filter(r=>r.ready).length,newPeople:rows.filter(r=>r.ready&&!r.personId).length,newCompanies:rows.filter(r=>r.ready&&!r.companyId).length,needsEvidence:rows.filter(r=>!r.ready).length};
  });
}
