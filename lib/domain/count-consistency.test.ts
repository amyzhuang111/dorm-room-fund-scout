import assert from 'node:assert/strict';
import fs from 'node:fs';
import { filterFacetCompanies } from './sample-facets';
import { filterWorkspace, rankGroups, workspaceFilters, workspaceFounders } from './scout-workspace';
import type { FacetCompany } from './sample-facets';
import type { FounderLead } from './founder-index';
import { founderProjectRows, campusFounderProjectRows } from './founder-view';
import { discoveryHref } from './discovery-navigation';
import { facetsFromSearchParams } from './facet-url';
import type { ProjectTableRow } from './founder-table';

const read = (file: string) => JSON.parse(fs.readFileSync(`public/data/${file}`, 'utf8'));
const cards: FacetCompany[] = read('sample-directory.json').cards;
const founders: FounderLead[] = read('founders.json');
const universities: {id:string;name:string;companyCount:number;founderCount:number}[] = read('hero-stats.json').universities;
const table: {founderCount:number;rows:ProjectTableRow[]} = read('founder-table.json');
const empty = workspaceFilters(new URLSearchParams());
assert.equal(new Set(cards.map(c=>c.id)).size, cards.length, 'company IDs must be unique');
assert.equal(new Set(founders.map(f=>f.id)).size, founders.length, 'founder IDs must be unique');
assert.equal(table.founderCount, founders.length, 'full founder index and table must agree');
const ranked = rankGroups(cards,'campus');
const knownCampuses = new Set(universities.map(u=>u.id));
assert.ok(ranked.every(row=>knownCampuses.has(row.id)), 'every ranked campus has a directory entry');
for (const values of [
  ...['campus','founders','year','sector','region','team','status','logo'].map(missing=>({missing})),
  {campus:'univ_penn'}, {campus:'univ_usc'}, {hqRegion:'missing'},
  {network:'Y Combinator'}, {q:'robot'}, {status:'unknown'},
  {campus:'univ_penn',q:'robot'}, {campus:'missing'},
]) {
  const params = new URLSearchParams();
  for (const [key,value] of Object.entries(values)) if (typeof value === 'string') params.set(key,value);
  const workspace = filterWorkspace(cards,workspaceFilters(params));
  const url = new URL(discoveryHref('companies',params),'https://example.test');
  const directory = filterFacetCompanies(cards,facetsFromSearchParams(url.searchParams));
  assert.deepEqual(new Set(workspace.map(c=>c.id)),new Set(directory.map(c=>c.id)),`Full directory preserves ${params}`);
}
assert.deepEqual(rankGroups([...cards].reverse(),'campus'), ranked, 'rankings must not depend on card order');
assert.deepEqual(rankGroups([...cards,...cards],'campus'), ranked, 'duplicate input rows must not inflate rankings');
for (const campus of universities) {
  const filters = {...empty,campus:campus.id};
  const workspace = filterWorkspace(cards,filters);
  const directory = filterFacetCompanies(cards,{campus:campus.id});
  assert.deepEqual(new Set(workspace.map(c=>c.id)),new Set(directory.map(c=>c.id)),`${campus.name}: dashboard/directory company sets`);
  assert.equal(workspace.length,campus.companyCount,`${campus.name}: campus page company count`);
  assert.equal(ranked.find(g=>g.id===campus.id)?.companies ?? 0,workspace.length,`${campus.name}: ranking count`);
  const people = workspaceFounders(founders,workspace,filters);
  assert.equal(people.length,campus.founderCount,`${campus.name}: campus/globe founder count`);
  const grouped = founderProjectRows(table.rows,people.map(f=>f.id));
  assert.deepEqual(new Set(grouped.flatMap(row=>row.people.map(p=>p.id))),new Set(people.map(p=>p.id)),`${campus.name}: founder directory rows`);
  const campusRows = campusFounderProjectRows(table.rows,campus.id);
  assert.deepEqual(new Set(campusRows.flatMap(row=>row.people.map(p=>p.id))),new Set(people.map(p=>p.id)),`${campus.name}: founder table campus filter`);
}
const multi: FacetCompany = {id:'multi',name:'Multi Campus',schoolId:'univ_penn',campusIds:['univ_penn','univ_mit'],signals:1};
assert.equal(filterFacetCompanies([multi],{campus:'univ_mit'}).length,1,'secondary campus is included');
const person: FounderLead = {id:'f',name:'A Founder',campusId:'univ_penn',campusIds:['univ_penn','univ_mit'],campus:'Penn',companyId:'other',companyIds:['other','multi'],company:'Other',programs:[],sector:null,gradYear:null,signalTypes:[],role:'Founder',signalSourceByType:{},programSourceByLabel:{}};
assert.equal(workspaceFounders([person],[multi],{...empty,campus:'univ_mit',sector:'AI'}).length,1,'secondary campus and company joins are retained');
console.log(JSON.stringify({companies:cards.length,indexedFounders:founders.length,campusesChecked:universities.length,top:ranked.slice(0,5),usc:ranked.find(r=>r.id==='univ_usc')},null,2));
console.log('Count reconciliation passed for every campus, directory, founder group, and ranking.');
