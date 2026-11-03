/** Read-only discovery. Candidates require human verification before publication.
 * Usage: node scripts/enrich/discover-office-addresses.mjs --seeds ../office-research/company-seeds.json --out ../office-research/discovery
 * Never writes the company database or published locations file.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
const arg=(key,fallback)=>process.argv.includes(key)?process.argv[process.argv.indexOf(key)+1]:fallback;
const seeds=JSON.parse(fs.readFileSync(arg('--seeds','../office-research/company-seeds.json'),'utf8'));
const out=arg('--out','../office-research/discovery');
const limit=Number(arg('--limit','10000'));
const cityFilter=arg('--city','');
fs.mkdirSync(out,{recursive:true});
const shared=/^(?:www\.)?(?:ycombinator\.com|linkedin\.com|crunchbase\.com|prnewswire\.com|dormroomfund\.com|github\.com|devpost\.com|instagram\.com|x\.com|twitter\.com|facebook\.com|linktr\.ee|notion\.site|notion\.so|medium\.com|substack\.com)$/;
const host=url=>new URL(url).hostname.replace(/^www\./,'');
const clean=s=>s.replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'[email omitted]').replace(/\s+/g,' ').trim();
const street=/\b\d{1,6}\s+(?:(?:[NSEW]|North|South|East|West)\.?\s+)?(?:[\p{L}\d.'’\-]+\s+){0,7}(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Boulevard|Blvd\.?|Drive|Dr\.?|Lane|Ln\.?|Way|Court|Ct\.?|Place|Pl\.?|Plaza|Parkway|Pkwy\.?|Broadway|Market|Mission)\b[^.!?\n]{0,100}/giu;
const queue=seeds.filter(s=>!cityFilter||(s.hq?.value_text||'').toLowerCase().includes(cityFilter.toLowerCase())).sort((a,b)=>Number(/new york/i.test(b.hq?.value_text||''))-Number(/new york/i.test(a.hq?.value_text||''))).slice(0,limit);
let next=0,done=0;
const results=[];
async function fetchPage(url){
 const res=await fetch(url,{headers:{'user-agent':'CampusScoutPublicAddressResearch/1.0','accept':'text/html,application/xhtml+xml'},redirect:'follow',signal:AbortSignal.timeout(10000)});
 if(!res.ok)throw new Error(`HTTP ${res.status}`);
 if(!/html|text|json/i.test(res.headers.get('content-type')||''))throw new Error('Non-page response');
 const reader=res.body.getReader();let html='',size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>900000){await reader.cancel();break;}html+=new TextDecoder().decode(value);}
 return {url:res.url,html};
}
function bits(page){
 const $=cheerio.load(page.html),structured=[];
 $('script[type="application/ld+json"]').each((_,el)=>{try{const data=JSON.parse($(el).text());const visit=v=>{if(!v||typeof v!=='object')return;if(v.address||v.geo)structured.push(JSON.stringify({name:v.name,address:v.address,geo:v.geo}).slice(0,1600));for(const x of Object.values(v)){if(Array.isArray(x))x.forEach(visit);else if(typeof x==='object')visit(x);}};visit(data);}catch{}});
 const links=$('a[href]').toArray().map(el=>({text:clean($(el).text()),href:$(el).attr('href')})).flatMap(a=>{try{return [{...a,url:new URL(a.href,page.url).href}];}catch{return [];}});
 const maps=links.filter(a=>/google\.[^/]+\/maps|maps\.google|maps\.app\.goo|openstreetmap\.org|maps\.apple/.test(a.url)).map(a=>({text:a.text,url:a.url}));
 $('script,style,noscript,svg').remove();const text=clean($('body').text());
 const snippets=[...text.matchAll(street)].map(m=>text.slice(Math.max(0,m.index-140),Math.min(text.length,m.index+m[0].length+160)));
 return {title:clean($('title').text()),snippets:[...new Set(snippets)].slice(0,15),structured,maps,links,textLength:text.length};
}
async function research(seed){
 const file=path.join(out,`${seed.id}.json`);
 if(fs.existsSync(file))return JSON.parse(fs.readFileSync(file,'utf8'));
 const result={id:seed.id,name:seed.name,storedCity:seed.hq?.value_text||null,website:seed.website_url,checkedAt:new Date().toISOString(),status:'unverified',pages:[],errors:[]};
 try{
  if(!seed.website_url||!/^https?:\/\//.test(seed.website_url))throw new Error('No official website on record');
  if(shared.test(new URL(seed.website_url).hostname))throw new Error('Shared directory, not an official company website');
  const first=await fetchPage(seed.website_url),firstBits=bits(first);
  const root=host(first.url);if(shared.test(new URL(first.url).hostname))throw new Error('Redirected to a shared directory');
  const linked=firstBits.links.filter(a=>{try{return host(a.url)===root&&/contact|about|privacy|terms|location|company|legal/i.test(a.text+' '+new URL(a.url).pathname)&&!/[?#]|\.(pdf|zip|png|jpg)$/i.test(a.url);}catch{return false;}});
  const rank=a=>/contact|location/i.test(a.text+' '+a.url)?0:/about|company/i.test(a.text+' '+a.url)?1:/privacy/i.test(a.text+' '+a.url)?2:3;
  const urls=[...new Set(linked.sort((a,b)=>rank(a)-rank(b)).map(a=>a.url))].filter(u=>u!==first.url).slice(0,3);
  const add=(p,b)=>result.pages.push({url:p.url,title:b.title,textLength:b.textLength,snippets:b.snippets,structured:b.structured,maps:b.maps});
  add(first,firstBits);
  for(const url of urls){try{const p=await fetchPage(url);if(host(p.url)===root)add(p,bits(p));}catch(e){result.errors.push({url,error:e.message});}}
  result.status=result.pages.some(p=>p.snippets.length||p.structured.length||p.maps.length)?'candidate_needs_verification':'no_address_found_on_checked_pages';
 }catch(e){result.status='unavailable';result.errors.push({error:e.message});}
 fs.writeFileSync(file,JSON.stringify(result,null,2));return result;
}
await Promise.all(Array.from({length:6},async()=>{while(next<queue.length){const seed=queue[next++];const r=await research(seed);results.push(r);done++;if(done%25===0)console.log(`${done}/${queue.length}: ${results.filter(r=>r.status==='candidate_needs_verification').length} candidate companies`);}}));
const summary={total:results.length,counts:results.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{}),candidates:results.filter(r=>r.status==='candidate_needs_verification').map(r=>({id:r.id,name:r.name,city:r.storedCity,pages:r.pages.filter(p=>p.snippets.length||p.structured.length||p.maps.length)})),all:results.map(r=>({id:r.id,name:r.name,status:r.status}))};
fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify({total:summary.total,counts:summary.counts}));
