import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { approveCsv, qualityReport, reviewCsv, stageBatch, type Batch, type Observation } from '../../lib/discovery/review';
import { readCatalog } from './catalog';
import { fetchPublicProfile } from './public-profile';

async function main() {
const args=process.argv.slice(2), command=args.shift();
const option=(flag:string)=>{const i=args.indexOf(flag);return i<0?'':args[i+1]??'';};
const required=(flag:string)=>{const value=option(flag);if(!value || value.startsWith('--'))throw Error(`${flag} is required`);return value;};
const read=(file:string)=>JSON.parse(fs.readFileSync(file,'utf8'));
const write=(file:string,value:unknown)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');};
const config=read('data/discovery/paths.json');
if(command==='plan') {
  const plan={...config,generatedAt:new Date().toISOString(),paths:config.paths.map((p:{query:string})=>({...p,searchUrl:`https://www.google.com/search?q=${encodeURIComponent(p.query)}`}))};
  if(option('--out'))write(option('--out'),plan); else console.log(JSON.stringify(plan,null,2));
} else if(command==='fetch') {
  const input=read(required('--input')) as {url:string;pathId:string;query:string}[];
  if(!Array.isArray(input) || input.length>config.maxProfilesPerTrial)throw Error(`Use at most ${config.maxProfilesPerTrial} profile URLs per trial.`);
  const blockedHosts=new Set<string>(),results=[];
  for(const item of input) {
    const host=new URL(item.url).hostname;
    if(blockedHosts.has(host)){results.push({...item,status:'blocked',reason:'Host blocked earlier in this trial; no retry'});continue;}
    try {const result=await fetchPublicProfile(item.url,config.fetchHosts);results.push({...item,...result,retrievedAt:new Date().toISOString()});if(result.status==='blocked')blockedHosts.add(host);}
    catch(error){results.push({...item,status:'failed',reason:error instanceof Error?error.message:'Fetch failed',retrievedAt:new Date().toISOString()});}
    if(item!==input.at(-1))await new Promise(resolve=>setTimeout(resolve,1000));
  }
  write(required('--out'),results);console.log(JSON.stringify({profiles:results.length,fetched:results.filter(r=>r.status==='fetched').length,blocked:results.filter(r=>r.status==='blocked').length}));
} else if(command==='stage') {
  const dbPath=path.resolve(required('--db'));
  // Read-only: staging cannot mutate the source corpus, even if given its real path.
  const db=new Database(dbPath,{readonly:true,fileMustExist:true});
  try {
    const batch=stageBatch(required('--batch'),read(required('--input')) as Observation[],readCatalog(db));
    const out=required('--out');write(path.join(out,'batch.json'),batch);write(path.join(out,'review.csv'),reviewCsv(batch));write(path.join(out,'quality.json'),qualityReport(batch));
    console.log(JSON.stringify({batch:batch.id,rows:batch.rows.length,quality:qualityReport(batch),review:path.join(out,'review.csv')},null,2));
  } finally {db.close();}
} else if(command==='review') {
  const batch=read(required('--snapshot')) as Batch;
  const approved=approveCsv(batch,fs.readFileSync(required('--csv'),'utf8'));
  write(required('--out'),approved);console.log(`${approved.rows.length} explicitly approved rows; hold/reject rows excluded. No database writes.`);
} else if(command==='apply') {
  if(!args.includes('--apply'))throw Error('Use --apply only on a reviewed batch and a scratch/staging database first.');
  const dbPath=path.resolve(required('--db'));
  if(dbPath===path.resolve('data/campus-universe.db'))throw Error('Use a scratch/staging copy. Publish reviewed JSON through prebuild.');
  const db=new Database(dbPath,{fileMustExist:true});db.pragma('foreign_keys=ON');
  try {const {applyApprovedBatch}=await import('./apply');console.log(JSON.stringify(applyApprovedBatch(db,read(required('--input'))),null,2));}finally{db.close();}
} else {
  console.log(`Founder discovery trial (no scheduled or paid calls)\n\nplan [--out queries.json]\nfetch --input profile-urls.json --out captures.json\nstage --input observations.json --db /tmp/corpus.db --batch pilot-001 --out /tmp/review\nreview --snapshot /tmp/review/batch.json --csv /tmp/review/review.csv --out approved.json\napply --input approved.json --db /tmp/staging.db --apply\n\nSearch using the query plan or an existing search provider. Capture public About/Education sections, then record field-level evidence in observations.json. Never turn search snippets, liked posts, or guessed class years into facts. Review CSV changes only decision, reviewer, reviewed_at. Edit facts in observations.json and restage. Commit approved JSON in data/discovery/approved/ only after review.`);
}
}
main().catch(error=>{console.error(error instanceof Error?error.message:error);process.exitCode=1;});
