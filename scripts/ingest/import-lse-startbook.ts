import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { getDb } from '../../lib/db/client';
import { computeRubric, RUBRIC_DIMENSIONS, RUBRIC_VERSION } from '../../lib/scoring/rubric';
import { BENCHMARK_VERSION } from '../../lib/scoring/benchmark';
import { normalizeFundingStage } from '../../lib/domain/funding-stage';
import { resolveCompanySectors } from '../../lib/domain/sectors';
import { evaluateAllGates } from '../../lib/screening/gates';
import type { StartbookBatch } from '../../lib/discovery/startbook';

export const LSE_SOURCE_ID = 'src_lse_startbook';
export const LSE_BATCH = 'lse-startbook-2026-11-11';
export const lseId = (kind: string, ...parts: string[]) => `${kind}_lse_${createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 18)}`;
const nameKey = (s: string) => s.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '');
const sharedHosts = /(^|\.)(linkedin\.com|facebook\.com|instagram\.com|startbook\.app|linktr\.ee|notion\.site|canva\.site|wixsite\.com|wordpress\.com)$/;
function ownHost(value: string | null) {
  try { const h = new URL(value!).hostname.toLowerCase().replace(/^www\./, ''); return sharedHosts.test(h) ? null : h; } catch { return null; }
}
function linkedinKey(value: string | null) {
  try { const u = new URL(value!); return /(^|\.)linkedin\.com$/.test(u.hostname) && u.pathname.startsWith('/in/') ? u.pathname.toLowerCase().replace(/\/$/, '') : null; } catch { return null; }
}
type Project = { id: string; name: string; website_url: string | null };
type Person = { id: string; name: string; aliases_json: string };

export function validateLseBatch(batch: StartbookBatch) {
  if (batch.expectedCount !== batch.companies.length || !batch.companies.length || new Set(batch.companies.map(c => c.key)).size !== batch.companies.length) throw new Error('Roster count/identity mismatch');
  for (const row of batch.companies) {
    if (!row.name || !row.sourceUrl.startsWith('https://startbook.app/events/lse/ventures/') || !row.snapshotSha256) throw new Error(`Invalid source: ${row.key}`);
    if (row.review.status !== 'reviewed' || !row.review.notes || !row.review.evaluator || !row.review.reviewedAt) throw new Error(`Review required: ${row.key}`);
    for (const dim of RUBRIC_DIMENSIONS) {
      const rating = row.review.ratings[dim.key];
      if (!(rating === null || Number.isInteger(rating) && rating! >= 0 && rating! <= 5)) throw new Error(`Missing/invalid rubric rating: ${row.key}/${dim.key}`);
    }
    for (const person of row.founders) {
      if (!person.key || person.name.trim().split(/\s+/).length < 2 || !person.sourceUrl?.startsWith('https://startbook.app/events/lse/founders/')) throw new Error(`Named founder source required: ${row.key}`);
    }
  }
}

export function applyLseBatch(db: Database.Database, batch: StartbookBatch) {
  validateLseBatch(batch);
  if (!db.prepare("SELECT 1 FROM universities WHERE id='univ_lse'").get()) throw new Error('LSE campus missing');
  const beforeFK = new Set((db.pragma('foreign_key_check') as unknown[]).map(row => JSON.stringify(row)));
  const projects = db.prepare("SELECT id,name,website_url FROM projects WHERE kind='company'").all() as Project[];
  const people = db.prepare('SELECT id,name,aliases_json FROM people').all() as Person[];
  const result: { key: string; projectId: string; disposition: string }[] = [];
  let createdPeople = 0;
  db.transaction(() => {
    db.prepare(`INSERT INTO sources (id,name,family,url,campuses_json,priority,ingestion_mode,status,source_role,last_attempt_at,last_success_at,discovered_lead_count,reviewed_relevant_count,tier_rationale)
      VALUES (?, 'LSE ventures — Startbook', 'campus_directory', ?, '["univ_lse"]', 2, 'api', 'available', 'discovery', ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET status='available',last_attempt_at=excluded.last_attempt_at,last_success_at=excluded.last_success_at,
      discovered_lead_count=excluded.discovered_lead_count,reviewed_relevant_count=excluded.reviewed_relevant_count`).run(
        LSE_SOURCE_ID, batch.sourceUrl, batch.retrievedAt, batch.retrievedAt, batch.companies.length, batch.companies.length,
        'Public venture and founder profiles reviewed. Self-reported business claims need corroboration; directory membership is not student status.');
    const claim = (type: string, entity: string, kind: string, value: unknown, excerpt: string, source: string, suffix: string) => {
      const id = lseId('claim', LSE_BATCH, suffix);
      db.prepare(`INSERT OR IGNORE INTO claims (id,entity_type,entity_id,claim_type,value_json,excerpt,source_id,source_url,retrieved_at,label,verification_state)
        VALUES (?,?,?,?,?,?,?,?,?,'company_reported','unverified')`).run(id,type,entity,kind,JSON.stringify(value),excerpt,LSE_SOURCE_ID,source,batch.retrievedAt);
      return id;
    };
    const relation = (fromType: string, from: string, toType: string, to: string, kind: string, cid: string) => {
      if (!db.prepare('SELECT 1 FROM relationships WHERE source_entity_type=? AND source_entity_id=? AND target_entity_type=? AND target_entity_id=? AND relationship_type=?').get(fromType,from,toType,to,kind)) {
        db.prepare(`INSERT INTO relationships (id,source_entity_type,source_entity_id,target_entity_type,target_entity_id,relationship_type,evidence_claim_ids_json,verification_state)
          VALUES (?,?,?,?,?,?,?,'affiliation_only')`).run(lseId('rel',from,to,kind),fromType,from,toType,to,kind,JSON.stringify([cid]));
      }
    };
    for (const row of batch.companies) {
      let existing = db.prepare('SELECT id,name,website_url FROM projects WHERE id=?').get(lseId('proj',row.key)) as Project | undefined;
      if (!existing && row.existingProjectId) {
        existing = projects.find(p => p.id === row.existingProjectId);
        if (!existing || nameKey(existing.name) !== nameKey(row.name) || !row.identitySourceUrl) throw new Error(`Reviewed identity changed: ${row.key}`);
      }
      if (!existing && ownHost(row.website)) {
        const matches = projects.filter(p => ownHost(p.website_url) === ownHost(row.website));
        if (matches.length > 1) throw new Error(`Ambiguous company domain: ${row.key}`);
        existing = matches[0];
      }
      const pid = existing?.id ?? lseId('proj',row.key);
      const note = 'Public LSE directory identity checked. Business metrics and education are self-reported; current enrollment, round date and investment eligibility remain unverified.';
      if (!existing) {
        db.prepare(`INSERT INTO projects (id,name,kind,description,website_url,sector,is_investable_candidate,signal_tier,signal_tier_basis,verification_status,verification_note,last_verified_at)
          VALUES (?,?,'company',?,?,?,1,'Unranked',?,'partial',?,?)`).run(pid,row.name,row.description || null,row.website,row.sectors.join(', '),
            'LSE directory membership alone has no program/investor tier in the existing playbook. See the separate evidence-based benchmark.',note,batch.retrievedAt);
        projects.push({ id: pid, name: row.name, website_url: row.website });
      } else if (row.website && !existing.website_url) {
        db.prepare('UPDATE projects SET website_url=? WHERE id=?').run(row.website,pid);
      }
      const cid = claim('project',pid,'directory_membership',{ directory:'LSE Startbook',key:row.key,snapshotSha256:row.snapshotSha256,reportedStage:row.reportedStage,fundraisingStatus:row.fundraisingStatus },
        `${row.name} appears in the public LSE venture directory. ${note}`,row.sourceUrl,`${row.key}:membership`);
      relation('project',pid,'university','univ_lse','affiliated_with',cid);
      const fact = (key: string, value: string | null, detail = {}) => {
        if (value) db.prepare(`INSERT OR IGNORE INTO company_facts (id,project_id,fact_key,value_text,detail_json,source_url,excerpt,origin)
          VALUES (?,?,?,?,?,?,?,'startbook_directory')`).run(lseId('fact',LSE_BATCH,row.key,key),pid,key,value,JSON.stringify(detail),row.sourceUrl,
            `Self-reported in LSE Startbook on ${batch.retrievedAt.slice(0,10)}: ${value}`);
      };
      fact('directory_membership','LSE Startbook',{ key:row.key, retrievedAt:batch.retrievedAt });
      fact('description',row.description); fact('website',row.website); fact('company_linkedin',row.companyLinkedin);
      fact('hq',row.hq); fact('team_size',row.teamSize);
      const stage = normalizeFundingStage(row.reportedStage);
      if (stage) fact('funding_round',stage,{ stage, date:null, evidenceType:'self_reported_stage', observedAt:batch.retrievedAt, note:'Directory stage label; no completed financing event or round date asserted.' });
      else fact('reported_stage',row.reportedStage);
      fact('fundraising_status',row.fundraisingStatus);
      resolveCompanySectors([],`${row.description} ${row.sectors.join(', ')}`,row.name).forEach((tag,index) => {
        db.prepare(`INSERT OR IGNORE INTO project_sector_tags (id,project_id,tag,is_primary,excerpt,source_url) VALUES (?,?,?,?,?,?)`).run(
          lseId('sector',pid,tag),pid,tag,index === 0 ? 1 : 0,row.description,row.sourceUrl);
      });
      for (const f of row.founders) {
        const isFounder = /founder|founding/i.test(f.role) || f.role === 'CEO';
        if (!isFounder) {
          claim('project',pid,'team_member',{name:f.name,role:f.role,sourceProfile:f.sourceUrl},`${f.name} is listed as ${f.role}; not counted as a founder.`,row.sourceUrl,`${row.key}:team:${f.key}`);
          continue;
        }
        let person = people.find(p => p.id === lseId('person',f.key));
        const linked = linkedinKey(f.linkedin);
        if (!person && linked) {
          const hits = people.filter(p => (JSON.parse(p.aliases_json) as string[]).some(alias => linkedinKey(alias.replace(/^(linkedin:|site:)/,'')) === linked));
          if (hits.length > 1) throw new Error(`Ambiguous founder profile: ${f.name}`);
          if (hits[0] && nameKey(hits[0].name) !== nameKey(f.name)) throw new Error(`Founder name conflict: ${f.name}`);
          person = hits[0];
        }
        const personId = person?.id ?? lseId('person',f.key);
        if (!person) {
          const aliases = JSON.stringify([`site:${f.sourceUrl}`]);
          db.prepare(`INSERT INTO people (id,name,aliases_json,founder_status,verification_status,verification_note,last_verified_at,signal_tier,signal_tier_basis)
            VALUES (?,?,?,?,'partial',?,?,'Unranked',?)`).run(personId,f.name,aliases,isFounder ? 'founder' : null,
              'Named in the public LSE venture profile; role and education are source-reported, not independently verified.',batch.retrievedAt,
              'Directory listing alone does not establish a sourcing tier.');
          people.push({id:personId,name:f.name,aliases_json:aliases}); createdPeople++;
        }
        const fc = claim('person',personId,'founder_role',{ company:row.name, role:f.role, sourceProfile:f.sourceUrl },
          `${f.name} is listed as ${f.role} for ${row.name}.`,row.sourceUrl,`${row.key}:person:${f.key}`);
        if (!db.prepare('SELECT 1 FROM person_project_roles WHERE person_id=? AND project_id=?').get(personId,pid)) {
          const role = isFounder && !/founder/i.test(f.role) ? `founder / ${f.role} (directory listing)` : f.role;
          db.prepare('INSERT INTO person_project_roles (id,person_id,project_id,role,claim_id) VALUES (?,?,?,?,?)').run(lseId('ppr',pid,personId),personId,pid,role,fc);
        }
        relation('person',personId,'project',pid,isFounder ? 'founded' : 'contributed_to_project',fc);
        if (f.linkedin) claim('person',personId,'linkedin_candidate',{linkedin:f.linkedin,confidence:'likely',reason:'Directly linked from the named public founder profile; not independently checked on LinkedIn.'},
          `The founder profile directly links this LinkedIn URL for ${f.name}.`,f.sourceUrl,`linkedin:${f.key}`);
        const education = claim('person',personId,'directory_education',{ qualification:f.lseQualification,reportedGraduationYear:f.reportedGraduationYear },
          `Directory-reported LSE qualification: ${f.lseQualification || 'not stated'}; university graduation year: ${f.reportedGraduationYear ?? 'not stated'}. Neither establishes current enrollment.`,f.sourceUrl,`education:${f.key}`);
        if (["Master's",'Undergraduate','PhD'].includes(f.lseQualification || '')) {
          if (!db.prepare("SELECT 1 FROM affiliations WHERE person_id=? AND university_id='univ_lse'").get(personId)) db.prepare(`INSERT INTO affiliations (id,person_id,university_id,role,status,claim_id)
            VALUES (?,?,'univ_lse',?,'unverified',?)`).run(lseId('aff',personId,'univ_lse'),personId,`Reported ${f.lseQualification}`,education);
          relation('person',personId,'university','univ_lse','affiliated_with',education);
        }
      }
      const rubric = computeRubric(row.review.ratings);
      db.prepare(`INSERT OR IGNORE INTO assessments (id,project_id,rubric_version,ratings_json,rationale_json,counterevidence_json,coverage,quality_score,evaluator,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).run(lseId('assessment',LSE_BATCH,row.key),pid,RUBRIC_VERSION,JSON.stringify(row.review.ratings),
          JSON.stringify({notes:row.review.notes,sourceUrl:row.sourceUrl,availableEvidenceFields:row.availableEvidenceFields,benchmarkVersion:BENCHMARK_VERSION,provisional:true}),
          JSON.stringify({notes:'Source-reported claims need independent corroboration. Missing ratings are unknown, not zero. No eligibility override.'}),
          rubric.coverage,rubric.qualityScore,row.review.evaluator,batch.retrievedAt);
      if (!existing) {
        const gates = evaluateAllGates({ affiliationStatus:'unverified',affiliationEvidenceDated:false,selfReportedStage:row.reportedStage,verifiedStage:null,
          fundingEvents:[],businessModelTags:row.businessModelTags,isConfirmedPortfolioMember:false,fundingAvailability:'unknown' });
        for (const gate of gates) db.prepare('INSERT OR IGNORE INTO gate_results (id,project_id,gate_name,result,rationale,evaluated_at) VALUES (?,?,?,?,?,?)').run(
          lseId('gate',pid,gate.gate),pid,gate.gate,gate.result,gate.rationale,batch.retrievedAt);
      }
      result.push({key:row.key,projectId:pid,disposition:existing ? 'matched' : 'created'});
    }
    if ((db.pragma('foreign_key_check') as unknown[]).some(row => !beforeFK.has(JSON.stringify(row)))) throw new Error('Import introduced foreign-key violations');
  })();
  return {companies:result.length,createdCompanies:result.filter(r => r.disposition==='created').length,createdPeople,results:result};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = process.env.CAMPUS_UNIVERSE_DB_PATH || 'data/campus-universe.db';
  if (!fs.existsSync(target)) throw new Error('Existing corpus required');
  const batch = JSON.parse(fs.readFileSync('data/imports/lse-startbook-2026-11-11.json','utf8')) as StartbookBatch;
  console.log(JSON.stringify(applyLseBatch(getDb(),batch)));
}
