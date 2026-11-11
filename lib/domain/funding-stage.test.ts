import assert from 'node:assert/strict';
import { fundingStageBuckets, matchesFundingStage, normalizeFundingStage, preferredFundingStage } from './funding-stage';
import { filterWorkspace, workspaceFilters, workspaceFounders, rankGroups, workspaceCsv } from './scout-workspace';
import { filterFacetCompanies, type FacetCompany } from './sample-facets';
import { facetsFromSearchParams, browseHref } from './facet-url';
import { discoveryHref } from './discovery-navigation';
import type { FounderLead } from './founder-index';
import { SOURCE_CATALOGUE } from './source-quality';

const companies: FacetCompany[] = [
  {id:'pre',name:'Early',schoolId:'lse',signals:0,stage:'preseed'},
  {id:'seed',name:'Seed Co',schoolId:'lse',signals:1,stage:'Seed'},
  {id:'a',name:'Growth',schoolId:'mit',signals:2,stage:'Series A'},
  {id:'program',name:'Program',schoolId:'lse',signals:0,stage:'Accelerator'},
  {id:'student',name:'Project',schoolId:'lse',signals:0,stage:'pre-seed / student project'},
  {id:'missing',name:'Unknown',schoolId:'lse',signals:0,stage:null},
];
assert.equal(normalizeFundingStage('  SERIES-A '),'Series A');
assert.equal(normalizeFundingStage('Pre Seed'),'Pre-seed');
assert.equal(normalizeFundingStage('Series F'),'Series E+');
assert.equal(matchesFundingStage('Accelerator','Pre-seed'),false);
assert.equal(matchesFundingStage('pre-seed / student project','Pre-seed'),false);
assert.equal(matchesFundingStage(null,'unknown'),true);
assert.equal(matchesFundingStage('Seed','unknown'),false);
assert.equal(matchesFundingStage('Seed','not-a-stage'),false);
for(const records of [['Accelerator','Seed','Series A'],['Series A','Seed','Accelerator']]) {
  assert.equal(records.reduce<string|null>((current,next)=>preferredFundingStage(current,next),null),'Series A');
}
const buckets=fundingStageBuckets(companies);
assert.equal(buckets.reduce((total,row)=>total+row.count,0),companies.length);
assert.equal(buckets.find(row=>row.id==='Pre-seed')?.count,1);
assert.equal(buckets.find(row=>row.id==='unknown')?.count,1);

for(const stage of ['pre-seed','Seed','series_a','unknown','Accelerator']) {
  const params=new URLSearchParams({stage});
  const filters=workspaceFilters(params);
  const home=filterWorkspace(companies,filters).map(c=>c.id).sort();
  const href=discoveryHref('companies',params);
  const facets=facetsFromSearchParams(new URL(href,'https://example.com').searchParams);
  const directory=filterFacetCompanies(companies,facets).map(c=>c.id).sort();
  assert.deepEqual(home,directory,`Home and directory agree for ${stage}`);
  const shared=new URL(browseHref({facets}),'https://example.com');
  assert.deepEqual(filterWorkspace(companies,workspaceFilters(shared.searchParams)).map(c=>c.id).sort(),home);
}
const filters=workspaceFilters(new URLSearchParams({stage:'seed',campus:'lse'}));
const matched=filterWorkspace(companies,filters);
assert.deepEqual(matched.map(c=>c.id),['seed']);
assert.deepEqual(rankGroups(matched,'campus').map(c=>[c.id,c.companies]),[['lse',1]]);
const founder=(id:string,companyId:string|null):FounderLead=>({id,name:`Founder ${id}`,campusId:'lse',campus:'LSE',programs:[],sector:null,gradYear:null,signalTypes:[],company:'Company',companyId,role:'Founder',signalSourceByType:{},programSourceByLabel:{}});
assert.deepEqual(workspaceFounders([founder('s','seed'),founder('p','pre'),founder('u',null)],matched,filters).map(f=>f.id),['s']);
const csv=workspaceCsv('companies',matched,[]);
assert.ok(csv.includes('Seed Co'));
assert.ok(!csv.includes('Early'));
assert.equal(csv.trim().split('\n').length,2);
const source=SOURCE_CATALOGUE.find(s=>s.id==='cat_lse-startbook-ventures');
assert.equal(source?.url,'https://startbook.app/events/lse/ventures');
assert.equal(source?.campus,'univ_lse');
assert.equal(source?.status,'unconfigured');
console.log('Funding-stage checks passed: normalization, stage evidence, counts, URL continuity, founder scope, CSV, LSE registry.');
