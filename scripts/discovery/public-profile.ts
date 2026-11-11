import { load } from 'cheerio';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { linkedinUrl, publicUrl } from '../../lib/discovery/review';

export function extractPublicProfile(html:string,url:string) {
  const $=load(html);
  $('script,style,nav,footer,[data-section="activities"],.core-section-container[data-section="posts"]').remove();
  const name=$('h1').first().text().replace(/\s+/g,' ').trim();
  // Search snippets and activity/reaction posts are never interpreted as the subject's biography.
  const bio=$('[data-section="summary"] .core-section-container__content, section.summary .core-section-container__content').first().text().replace(/\s+/g,' ').trim();
  const education=$('[data-section="educations"] .education__list, section.education .education__list').first().text().replace(/\s+/g,' ').trim();
  const headline=$('.top-card-layout__headline').first().text().replace(/\s+/g,' ').trim();
  const blocked=(!name || !bio) && /authwall|sign in to view|security verification|captcha|join linkedin/i.test($('body').text());
  return {url:linkedinUrl(url)||publicUrl(url),name,bio:bio.slice(0,1200),education:education.slice(0,1200),headline:headline.slice(0,300),status:blocked?'blocked':name&&bio?'fetched':'needs_extractor'};
}
export function robotsAllows(text:string,pathname:string):boolean {
  let agents:string[]=[],rules:{allow:boolean;path:string}[]=[], groups:{agents:string[];rules:typeof rules}[]=[];
  for(const raw of text.split(/\r?\n/)) {
    const line=raw.split('#')[0].trim(), colon=line.indexOf(':'); if(colon<0) continue;
    const key=line.slice(0,colon).trim().toLowerCase(),value=line.slice(colon+1).trim();
    if(key==='user-agent') { if(rules.length){groups.push({agents,rules});agents=[];rules=[];} agents.push(value.toLowerCase()); }
    else if((key==='allow'||key==='disallow')&&agents.length&&value) rules.push({allow:key==='allow',path:value});
  }
  groups.push({agents,rules});
  const specific=groups.filter(g=>g.agents.includes('campusscoutdiscovery'));
  const applicable=(specific.length?specific:groups.filter(g=>g.agents.includes('*'))).flatMap(g=>g.rules);
  const matches=applicable.filter(r=>new RegExp('^'+r.path.split('*').map(s=>s.replace(/[.+?^{}()|[\]\\]/g,'\\$&')).join('.*')).test(pathname)).sort((a,b)=>b.path.length-a.path.length || Number(b.allow)-Number(a.allow));
  return matches[0]?.allow ?? true;
}
async function checkedUrl(raw:string,allowed:Set<string>) {
  const value=publicUrl(raw); if(!value) throw Error('Only public HTTPS URLs are accepted.');
  const u=new URL(value);
  if(!allowed.has(u.hostname) || (u.port && u.port!=='443') || isIP(u.hostname)) throw Error('Host is outside the explicit fetch allowlist.');
  const addresses=await lookup(u.hostname,{all:true});
  if(!addresses.length || addresses.some(({address})=>address.includes(':') ? /^(::|f[cd]|fe[89ab])/i.test(address) : /^(0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(address))) throw Error('Private network destinations are not allowed.');
  return u;
}
export async function fetchPublicProfile(raw:string,allowedHosts:string[]) {
  const allowed=new Set(allowedHosts),url=await checkedUrl(raw,allowed);
  const headers={'User-Agent':'CampusScoutDiscovery/1.0 (public profile research)','Accept':'text/html,text/plain'};
  const request=(u:string)=>fetch(u,{headers,redirect:'manual',signal:AbortSignal.timeout(15000)});
  const robots=await request(`${url.origin}/robots.txt`);
  if(robots.status!==404 && (!robots.ok || !robotsAllows(await robots.text(),url.pathname+url.search))) return {url:url.href,status:'blocked',reason:'Robots policy unavailable or disallows this path'};
  const response=await request(url.href);
  if([401,403,429,999].includes(response.status)) return {url:url.href,status:'blocked',reason:`HTTP ${response.status}; no retry or login attempted`};
  if(response.status>=300&&response.status<400) return {url:url.href,status:'blocked',reason:'Redirect requires manual source review'};
  if(!response.ok) return {url:url.href,status:'failed',reason:`HTTP ${response.status}`};
  if(!/text\/html/.test(response.headers.get('content-type')??'')) return {url:url.href,status:'failed',reason:'Not an HTML profile'};
  const reader=response.body?.getReader(); if(!reader) throw Error('No response body');
  let html='',size=0; const decoder=new TextDecoder();
  while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>2_000_000){await reader.cancel();throw Error('Page exceeds 2 MB limit');}html+=decoder.decode(part.value,{stream:true});}
  return extractPublicProfile(html,url.href);
}
