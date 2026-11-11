import manifest from '../../data/imports/lse-startbook-2026-11-11.json';
import { getDb } from '../db/client';
import { benchmark } from '../scoring/benchmark';
import type { Ratings } from '../scoring/rubric';
import { normalizeFundingStage } from './funding-stage';

export function lseDirectory() {
  const db = getDb();
  const membership = db.prepare(`SELECT entity_id,value_json FROM claims WHERE source_id='src_lse_startbook' AND claim_type='directory_membership' AND entity_type='project'`).all() as {entity_id:string;value_json:string}[];
  const byKey = new Map(membership.map(row => [JSON.parse(row.value_json).key as string,row.entity_id]));
  const assessments = db.prepare(`SELECT a.project_id,a.ratings_json,a.rationale_json,a.evaluator FROM assessments a
    WHERE a.project_id IN (SELECT entity_id FROM claims WHERE source_id='src_lse_startbook' AND claim_type='directory_membership')
    ORDER BY a.created_at DESC,a.id DESC`).all() as {project_id:string;ratings_json:string;rationale_json:string;evaluator:string}[];
  const latest = new Map<string,typeof assessments[number]>();
  for (const assessment of assessments) if (!latest.has(assessment.project_id)) latest.set(assessment.project_id,assessment);
  return manifest.companies.flatMap(row => {
    const projectId = byKey.get(row.key);
    if (!projectId) return [];
    const assessment = latest.get(projectId);
    const ratings = (assessment ? JSON.parse(assessment.ratings_json) : row.review.ratings) as Ratings;
    const notes = assessment ? JSON.parse(assessment.rationale_json).notes as string : row.review.notes;
    return [{...row,projectId,ratings,notes,benchmark:benchmark(ratings),stage:normalizeFundingStage(row.reportedStage),evaluator:assessment?.evaluator ?? row.review.evaluator}];
  }).sort((a,b) => (b.benchmark.qualityScore ?? -1) - (a.benchmark.qualityScore ?? -1) || a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
}
export type LseRow = ReturnType<typeof lseDirectory>[number];
export function filterLse(rows:LseRow[], params: {q?:string;tier?:string;stage?:string}) {
  const q=params.q?.trim().toLowerCase();
  return rows.filter(row => (!q || `${row.name} ${row.description} ${row.founders.map(f=>f.name).join(' ')}`.toLowerCase().includes(q))
    && (!params.tier || row.benchmark.tier===params.tier)
    && (!params.stage || (params.stage==='unknown' ? !row.stage : row.stage===params.stage)));
}
export function lseCsv(rows:LseRow[]) {
  const keys=['ability_to_build','domain_knowledge_access','entrepreneurial_execution','differentiated_insight','customer_pain_market','learning_validation','next_milestone_financing'] as const;
  const data:unknown[][]=[['company','named_people_and_roles','recorded_stage','source_stage_label','fundraising_status','benchmark_tier','score_100','evidence_coverage_percent',...keys,'assessment_note','evaluator','source_url','campus_scout_url']];
  for(const r of rows) data.push([r.name,r.founders.map(f=>`${f.name} (${f.role})`).join('; '),r.stage ?? 'Unknown',r.reportedStage,r.fundraisingStatus,r.benchmark.tier,r.benchmark.qualityScore,Math.round(r.benchmark.coverage*100),...keys.map(k=>r.ratings[k]),r.notes,r.evaluator,r.sourceUrl,`https://dorm-room-fund-scout.vercel.app/startup/${r.projectId}`]);
  return data.map(row=>row.map(value=>{
    let text=String(value ?? '');
    if(/^[\s]*[=+@-]/.test(text)) text=`'${text}`;
    return `"${text.replaceAll('"','""')}"`;
  }).join(',')).join('\r\n');
}
