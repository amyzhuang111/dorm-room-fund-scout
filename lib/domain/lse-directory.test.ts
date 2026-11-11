import assert from 'node:assert/strict';
import { lseDirectory,filterLse,lseCsv } from './lse-directory';
import { RUBRIC_DIMENSIONS } from '../scoring/rubric';
import { benchmark } from '../scoring/benchmark';
const all=lseDirectory();
assert.equal(all.length,142);
assert.equal(new Set(all.map(r=>r.projectId)).size,142);
assert.equal(new Set(all.flatMap(r=>r.founders.map(f=>f.key))).size,179);
assert.equal(filterLse(all,{stage:'Seed'}).length,16);
assert.equal(filterLse(all,{stage:'Pre-seed'}).length,29);
assert.equal(filterLse(all,{stage:'unknown'}).length,97);
assert.equal(filterLse(all,{q:'Caitlin Galer-Unti'})[0]?.name,'Mariesme');
assert.equal(filterLse(all,{tier:'B'}).length,6);
for (const row of all) {
 assert.deepEqual(row.benchmark,benchmark(row.ratings));
 assert.equal(Object.keys(row.ratings).length,RUBRIC_DIMENSIONS.length);
 if (row.benchmark.tier!=='Unassessed') assert.ok(row.benchmark.coverage>=0.7);
}
for (const params of [{tier:'B'},{stage:'Seed'},{q:'Caitlin'},{q:'not-a-company-xyz'}]) {
 const filtered=filterLse(all,params), csv=lseCsv(filtered);
 assert.equal(csv.split('\r\n').length,filtered.length+1,'CSV exactly matches visible rows');
 assert.ok(filtered.every(r=>csv.includes(r.projectId)));
}
const dangerous={...all[0],name:'=HYPERLINK("unsafe")',notes:'Line one, "quote"'};
assert.ok(lseCsv([dangerous]).includes('"\'=HYPERLINK(""unsafe"")"'),'spreadsheet formula injection is neutralized');
assert.ok(lseCsv([dangerous]).includes('"Line one, ""quote"""'));
console.log('LSE ranking, stage/search filters, coverage, and filtered CSV parity passed.');
