import { strict as assert } from 'node:assert';
import { filterWorkspace, workspaceFilters, rankGroups, workspaceCsv, workspaceFounders, hasNamedFounder } from './scout-workspace';
import type { FacetCompany } from './sample-facets';
import type { FounderLead } from './founder-index';
const companies: FacetCompany[] = [
 {id:'a',name:'Alpha, Inc',schoolId:'penn',school:'Penn',campusIds:['penn','mit'],campuses:['Penn','MIT'],signals:3,founders:['Amy Smith'],hqRegion:'New York',operatingStatus:'active',programs:['YC','YC'],sourceUrls:['https://example.com/a']},
 {id:'b',name:'=BAD()',schoolId:null,signals:0,founders:['A. B.'],programs:[]},
];
const empty = workspaceFilters(new URLSearchParams());
assert.deepEqual(filterWorkspace(companies,{...empty,campus:'mit'}).map(c=>c.id),['a']);
assert.deepEqual(filterWorkspace(companies,{...empty,campus:'missing'}).map(c=>c.id),['b']);
assert.equal(filterWorkspace(companies,{...empty,status:'active',region:'New York',network:'YC'}).length,1);
assert.equal(filterWorkspace(companies,{...empty,status:'unknown'}).length,1);
assert.equal(rankGroups(companies,'network')[0].companies,1);
assert.equal(rankGroups(companies,'campus').length,2);
assert.equal(hasNamedFounder(companies[1]),false);
const csv=workspaceCsv('companies',companies,[]);
assert.ok(csv.includes('"Alpha, Inc"'));
assert.ok(csv.includes("'=BAD()"));
assert.ok(csv.includes('Penn | MIT'));
assert.ok(csv.includes('https://example.com/a'));
const founder: FounderLead={id:'f',name:'Amy Smith',campusId:'mit',campus:'MIT',programs:[],sector:null,gradYear:null,signalTypes:[],company:'Alpha, Inc',companyId:'a',role:'Founder',signalSourceByType:{},programSourceByLabel:{}};
assert.equal(workspaceFounders([founder,founder],companies,{...empty,campus:'mit'}).length,1);
assert.equal(workspaceFounders([founder],[],{...empty,status:'closed'}).length,0);
assert.equal(workspaceFounders([founder],[],{...empty,q:'nobody'}).length,0);
console.log('Workspace checks passed: campus joins, intersecting filters, deduped rankings, missing fields, CSV safety, founder scope.');
