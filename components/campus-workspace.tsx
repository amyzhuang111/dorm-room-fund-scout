'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import type { TileCampus } from './tile-globe';
import { fundingStageBuckets, fundingStageLabel } from '@/lib/domain/funding-stage';
import type { FacetCompany } from '@/lib/domain/sample-facets';
import { STATUS_LABEL } from '@/lib/domain/sample-facets';
import type { FounderLead } from '@/lib/domain/founder-index';
import { fetchSampleDirectory } from '@/lib/domain/sample-directory-client';
import { COVERAGE_FIELDS, PANELS, campusIds, filterWorkspace, panelOf, rankGroups, workspaceCsv, workspaceFilters } from '@/lib/domain/scout-workspace';
import { workspaceFounders } from '@/lib/domain/scout-workspace';
import { discoveryHref } from '@/lib/domain/discovery-navigation';
import { networkExplorationHref } from '@/lib/domain/exploration-navigation';
import { absoluteDate } from '@/lib/domain/relative-time';
import { StartupCardSheet, FounderCardSheet } from './startup-directory-card';
import { useDialogFocus } from './use-dialog-focus';
import styles from './campus-workspace.module.css';
import { ScoutIcon } from './scout-icon';
import { LogoMark } from './sample-instrument';

const TileGlobe = dynamic(() => import('./tile-globe').then(m => m.TileGlobe), { ssr: false, loading: () => <div className={styles.loading}>Loading campus map…</div> });
const number = (n: number) => n.toLocaleString('en-US');

export function CampusWorkspace({ campuses, companyCount, founderCount, updatedAt, supportUrl }: {
  campuses: TileCampus[]; companyCount: number; founderCount: number; updatedAt: string | null; supportUrl?: string;
}) {
  const params = useSearchParams();
  const requested = panelOf(params.get('panel') ?? (params.get('view') === 'network' ? 'networks' : 'founders'));
  const panel = requested === 'companies' ? 'founders' : requested;
  const program = params.get('program') ?? '';
  const filters = useMemo(() => {
    const value = workspaceFilters(params);
    return panel === 'rankings' ? { ...value, campus: '' } : value;
  }, [params, panel]);
  const [companies, setCompanies] = useState<FacetCompany[]>([]);
  const [founders, setFounders] = useState<FounderLead[]>([]);
  const [companyState, setCompanyState] = useState('loading');
  const [founderState, setFounderState] = useState('loading');
  const [retry, setRetry] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [mapFocused, setMapFocused] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [shareLink, setShareLink] = useState('');
  const [feedback, setFeedback] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const workspaceRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousRootOverflow = document.documentElement.style.overflow;
    const footer = document.querySelector('footer');
    const footerHidden = footer?.hidden ?? false;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    if (footer) footer.hidden = true;
    window.scrollTo(0, 0);
    return () => { document.body.style.overflow = previousOverflow; document.documentElement.style.overflow = previousRootOverflow; if (footer) footer.hidden = footerHidden; };
  }, []);
  useEffect(() => {
    const header = document.querySelector<HTMLElement>('header[data-site-chrome]');
    if (!header) return;
    const measure = () => workspaceRef.current?.style.setProperty('--site-chrome-height', `${header.getBoundingClientRect().height}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  const [page, setPage] = useState(1);
  const resultRef = useRef<HTMLDivElement>(null);
  const context = params.toString();
  const update = useCallback((values: Record<string, string | null>, replace = false) => {
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(values)) { if (value) next.set(key, value); else next.delete(key); }
    const url = next.size ? `/?${next.toString()}` : '/';
    window.history[replace ? 'replaceState' : 'pushState'](null, '', url);
    setPage(1); resultRef.current?.scrollTo({ top: 0 });
  }, []);
  useEffect(() => {
    let cancelled = false;
    fetchSampleDirectory().then(rows => { if (!cancelled) { setCompanies(rows); setCompanyState('ready'); } }).catch(() => { if (!cancelled) setCompanyState('error'); });
    fetch('/data/founders.json', { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error('Unavailable'); return r.json(); }).then((rows: FounderLead[]) => { if (!Array.isArray(rows)) throw new Error('Invalid index'); if (!cancelled) { setFounders(rows); setFounderState('ready'); } }).catch(() => { if (!cancelled) setFounderState('error'); });
    return () => { cancelled = true; };
  }, [retry]);
  const stages = useMemo(() => fundingStageBuckets(filterWorkspace(companies, { ...filters, stage: '' })), [companies, filters]);
  const matched = useMemo(() => filterWorkspace(companies, filters), [companies, filters]);
  const people = useMemo(() => workspaceFounders(founders, matched, filters).filter(person => !program || person.programs.includes(program)), [founders, matched, filters, program]);
  const logos = useMemo(() => new Map(companies.map(company => [company.id, company.logoUrl ?? null])), [companies]);
  const programs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const person of founders) for (const label of person.programs) {
      const name = label.trim();
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 30);
  }, [founders]);
  const rankings = useMemo(() => rankGroups(matched, 'campus'), [matched]);
  const leadingCampuses = useMemo(() => rankGroups(filterWorkspace(companies,{...filters,campus:''}), 'campus').slice(0,5),[companies,filters]);
  const networks = useMemo(() => rankGroups(matched, 'network'), [matched]);
  const highlights = useMemo(() => new Set(matched.flatMap(campusIds)), [matched]);
  const sectors = useMemo(() => [...new Map(companies.filter(c => c.sectorId).map(c => [c.sectorId!, c.sector ?? c.sectorId!])).entries()].sort((a,b) => a[1].localeCompare(b[1])), [companies]);
  const regions = useMemo(() => [...new Set(companies.map(c => c.hqRegion).filter((x): x is string => !!x))].sort(), [companies]);
  const active = !!(filters.q || filters.campus || filters.sector || program || filters.region || filters.status || filters.stage || filters.network || filters.missing);
  const ready = companyState === 'ready' && (panel !== 'founders' || founderState === 'ready');
  const failed = companyState === 'error' || (panel === 'founders' && founderState === 'error');
  const entity = params.get('entity');
  const closeEntity = useCallback(() => update({ entity: null, entityType: null }), [update]);
  const currentCount = panel === 'founders' ? people.length : panel === 'rankings' ? rankings.length : panel === 'networks' ? networks.length : matched.length;
  const reset = () => update({ q:null,campus:null,sector:null,program:null,hqRegion:null,hq:null,status:null,stage:null,network:null,missing:null,sort:null });
  function exportCsv() {
    const blob = new Blob([workspaceCsv(panel, matched, people)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `campus-scout-${panel}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(`Exported ${number(panel === 'insights' ? COVERAGE_FIELDS.length : currentCount)} ${panel === 'insights' ? 'coverage fields' : panel} from this view.`);
  }
  async function share() {
    const url = window.location.href;
    try { await navigator.clipboard.writeText(url); setNotice('View link copied. Filters and open record are included.'); setShareLink(''); }
    catch { setShareLink(url); setNotice('Copy the view link below.'); }
  }
  const selectCampus = useCallback((id: string) => update({ campus: id || null, panel: 'founders' }), [update]);
  const selectFounder = (id: string) => { update({entity:id,entityType:'founder'}); return true; };
  const selectStartup = useCallback((id: string) => { update({entity:id,entityType:'startup'}); return true; }, [update]);
  const visiblePeople = people.slice(0, page * 24);
  const campusName=campuses.find(c=>c.id===filters.campus)?.name;
  const networkHref=networkExplorationHref({campus:campusName,returnTo:context?`/?${context}`:'/'});

  return <section ref={workspaceRef} className={styles.workspace} aria-label="Campus Scout workspace">
    <div className={styles.topline}>
      <div><span className={styles.eyebrow}>THE CAMPUS ECOSYSTEM</span><h1>Discover the next generation.</h1></div>
      <nav className={styles.viewModes} aria-label="Explore views"><span aria-current="page"><ScoutIcon name="globe" /> Globe</span><Link href={networkHref}><ScoutIcon name="network" /> Network</Link><Link href={discoveryHref('companies',new URLSearchParams(params))}><ScoutIcon name="directory" /> Directory</Link></nav>
      <div className={styles.topActions}><Link href="/work/shortlist" title="Saved companies"><ScoutIcon name="bookmark" /><span>Saved</span></Link><button onClick={share} title="Share this view"><ScoutIcon name="share" /><span>Share</span></button><button onClick={() => setFeedback(true)} title="Send feedback"><ScoutIcon name="message" /><span>Feedback</span></button><button className={styles.donate} onClick={() => setSupportOpen(true)}><ScoutIcon name="heart" /><span>Donate</span></button></div>
    </div>
    {notice && <div className={styles.notice} role="status">{notice}<button aria-label="Dismiss notification" onClick={()=>{setNotice('');setShareLink('');}}>×</button>{shareLink && <input aria-label="Shareable view link" readOnly value={shareLink} onFocus={e=>e.target.select()} />}</div>}
    <div className={`${styles.stage} ${mapFocused ? styles.mapFocused : ""}`}>
      <div className={styles.map} aria-label="Interactive campus globe">
        <TileGlobe embedded onMapFocusChange={setMapFocused} onCompanySelect={selectStartup} campuses={campuses} companies={matched} companyCount={companyState === 'ready' ? matched.length : active ? 0 : companyCount} foundersListed={founderState === 'ready' && companyState === 'ready' ? people.length : active ? 0 : founderCount} foundersLabel="indexed founders" selectedId={filters.campus} onSelect={selectCampus} dataThrough={updatedAt} highlightCampusIds={active ? highlights : null} />
      </div>
      <div className={styles.rightRail}><aside className={styles.summary} aria-label="Current view">
        <span className={styles.eyebrow}>CURRENT VIEW</span>
        <strong>{filters.campus ? campuses.find(c => c.id === filters.campus)?.name ?? 'Campus not recorded' : active ? 'Your filtered view' : 'Every campus. One view.'}</strong>
        <div><span><b>{companyState === 'ready' ? number(matched.length) : active ? '…' : number(companyCount)}</b> companies</span><span><b>{founderState === 'ready' && companyState === 'ready' ? number(people.length) : active ? '…' : number(founderCount)}</b> indexed founders</span></div>
        <p>{active ? `${number(highlights.size)} linked campuses · filters apply across panels` : `${number(campuses.length)} mapped campuses · source-backed records`}</p>
        {updatedAt && <small>Data updated {absoluteDate(updatedAt)}</small>}
      </aside>
      <aside className={styles.leaders} aria-label="Leading campuses">
        <div><span className={styles.eyebrow}>LEADING CAMPUSES</span><button onClick={()=>update({panel:'rankings',campus:null})}>View all ↗</button></div>
        <p>{Object.entries(filters).some(([key,value])=>!['campus','sort'].includes(key)&&value) ? 'Companies matching your filters' : 'Companies across campuses'}</p>
        {leadingCampuses.map((campus,index)=><button key={campus.id} className={styles.leaderRow} onClick={()=>selectCampus(campus.id)}><span>{String(index+1).padStart(2,'0')}</span><strong>{campus.name}</strong><b>{number(campus.companies)}</b></button>)}
        {!leadingCampuses.length&&<p>{companyState==='loading'?'Loading campuses…':'No campuses match these filters.'}</p>}
      </aside>
      </div>
      <aside className={`${styles.panel} ${expanded ? styles.expanded : ''}`} aria-label="Founders by campus, program, and sector" data-home-rail="">
        <div className={styles.panelHead}><span className={styles.eyebrow}>FOUNDERS</span><button className={styles.mobileExpand} onClick={() => setExpanded(v => !v)} aria-expanded={expanded}>{expanded ? 'Collapse' : 'Expand'}</button><Link className={`${styles.fullDirectory} block`} href={discoveryHref('companies', new URLSearchParams(params))}>Full directory ↗</Link></div>
        <nav className={styles.tabs} aria-label="Workspace panels">{PANELS.map(p => p.id === 'companies' ? <Link key={p.id} href={discoveryHref('companies', new URLSearchParams(params))} className="inline-flex">Companies</Link> : p.id === 'networks' ? <Link key={p.id} href={networkHref} className="inline-flex" title="Open the founder and startup network map">Networks</Link> : <button key={p.id} aria-pressed={panel === p.id} onClick={() => { update({ panel:p.id, ...(p.id === 'rankings' ? { campus:null } : {}) }); setExpanded(true); }}>{p.id === 'rankings' ? 'Schools' : p.label}</button>)}</nav>
        <div className={styles.search} data-founder-search=""><ScoutIcon name="search" /><input aria-label="Search founders by name, campus, program, or sector" placeholder="Founder, campus, program" value={filters.q} onChange={e => update({ q:e.target.value || null }, true)} /><button onClick={() => setFiltersOpen(v => !v)} aria-expanded={filtersOpen} aria-controls="workspace-filters"><ScoutIcon name="filters" /> Filters{active ? ' •' : ''}</button></div>
        <div className={styles.primaryFilters}>
          <Filter label="Campus" value={filters.campus} onChange={selectCampus} options={[["missing","Campus not recorded"],...campuses.map(c => [c.id,c.name] as [string,string]).sort((a,b)=>a[1].localeCompare(b[1]))]} />
          <Filter label="Program" value={program} onChange={v => update({ program: v || null })} options={programs.map(([name, count]) => [name, `${name} (${number(count)})`])} />
          <Filter label="Sector" value={filters.sector} onChange={v => update({ sector: v || null })} options={sectors} />
        </div>
        <div className={styles.schoolStrip} data-home-schools="" aria-label="Schools in this view">
          {leadingCampuses.slice(0, 5).map((campus) => <button key={campus.id} aria-pressed={filters.campus === campus.id} onClick={() => selectCampus(campus.id)}>{campus.name}<b>{number(campus.companies)}</b></button>)}
        </div>
        {filtersOpen && <div id="workspace-filters" className={styles.filters}>
          <Filter label="Funding stage" value={filters.stage} onChange={v => update({stage:v})} options={stages.map(s => [s.id, `${s.label} (${number(s.count)})`])} />
          <Filter label="HQ region" value={filters.region} onChange={v => update({hqRegion:v})} options={[["missing","HQ not recorded"],...regions.map(r=>[r,r] as [string,string])]} />
          <Filter label="Operating status" value={filters.status} onChange={v => update({status:v})} options={Object.entries(STATUS_LABEL)} />
          <Filter label="Missing information" value={filters.missing} onChange={v=>update({missing:v})} options={COVERAGE_FIELDS.map(f=>[f.id,f.label])} />
          <Filter label="Order" value={filters.sort} onChange={v=>update({sort:v})} options={[["signals","Most signals"],["name","A–Z"],["recent","Latest signal"]]} all={false} />
        </div>}
        {active && <div className={styles.activeFilters}><span>{[filters.campus && (campuses.find(c=>c.id===filters.campus)?.name ?? 'Campus missing'), filters.sector && (sectors.find(s=>s[0]===filters.sector)?.[1] ?? filters.sector), filters.region, filters.stage && fundingStageLabel(filters.stage), filters.status && STATUS_LABEL[filters.status as keyof typeof STATUS_LABEL], filters.network, filters.missing && `Missing ${COVERAGE_FIELDS.find(f=>f.id===filters.missing)?.label ?? filters.missing}`, filters.q && `“${filters.q}”`].filter(Boolean).join(' · ')}</span><button onClick={reset}>Clear all</button></div>}
        <div className={styles.resultTools}><span role="status">{ready ? `${number(currentCount)} ${panel === 'insights' ? 'companies analyzed' : panel === 'rankings' ? 'campuses ranked' : panel}` : failed ? 'Data unavailable' : 'Loading records…'}</span><button disabled={!ready} onClick={exportCsv}><ScoutIcon name="download" /> Export CSV</button></div>
        <div className={styles.results} ref={resultRef} key={panel}>
          {failed ? <div className={styles.empty}><p>We couldn’t load the records. Your filters are saved in the link.</p><button onClick={()=>{setCompanyState('loading');setFounderState('loading');setRetry(v=>v+1);}}>Try again</button></div> : !ready ? <div className={styles.empty}>Loading the source-backed index…</div> : <>
            {panel === 'founders' && visiblePeople.map(f => <button className={styles.founderRow} key={f.id} onClick={()=>update({entity:f.id,entityType:'founder'})}><LogoMark name={f.company || f.name} logoUrl={f.companyId ? logos.get(f.companyId) ?? null : null} size={28} /><span><strong>{f.name}</strong><span className={styles.campus}>{[f.campus || 'Campus not recorded', f.company || 'Company not recorded'].join(' · ')}</span></span></button>)}
            {(panel === 'rankings' || panel === 'networks') && <><p className={styles.explainer}>{panel === 'rankings' ? 'Ranked by distinct companies, highest first. Selecting a school lists founders at that campus. A company can belong to more than one campus, so campus totals overlap.' : 'Shared investor and program networks, ranked by linked companies. These are recorded affiliations.'}</p>{(panel==='rankings'?rankings:networks).map((g,i)=><button key={g.id} className={styles.rankRow} onClick={()=>update(panel==='rankings'?{campus:g.id,panel:'founders'}:{network:g.id,panel:'founders'})}><span className={styles.rank}>{String(i+1).padStart(2,'0')}</span><span className={styles.rankBody}><strong>{g.name}</strong><span className={styles.bar}><i style={{width:`${g.companies/((panel==='rankings'?rankings:networks)[0]?.companies||1)*100}%`}} /></span><small>{number(g.signals)} recorded signals</small></span><b>{number(g.companies)}</b></button>)}</>}
            {panel === 'insights' && <><div className={styles.insightIntro}><h2>Know what’s on record.</h2><p>Coverage across the {number(matched.length)} companies in your view. A recorded value is not a guarantee it is current. Missing fields stay visible.</p></div>{COVERAGE_FIELDS.map(f=>{const present=matched.filter(f.has).length;const pct=matched.length?Math.round(present/matched.length*100):0;return <button key={f.id} className={styles.coverage} onClick={()=>update({missing:f.id,panel:'companies'})}><span><strong>{f.label}</strong><b>{pct}%</b></span><span className={styles.bar}><i style={{width:`${pct}%`}} /></span><small>{number(present)} recorded · {number(matched.length-present)} missing →</small></button>;})}<p className={styles.explainer}>Founder names are shown in full when stored. Initial-only records need verification. Founded year, signal date, and verification date are separate fields. Social audience rankings need sourced follower counts.</p></>}
            {currentCount === 0 && <div className={styles.empty}><h2>No matching records</h2><p>Try fewer filters or a different search.</p><button onClick={reset}>Clear filters</button></div>}
            {panel==='founders'&&people.length>visiblePeople.length&&<button className={styles.more} onClick={()=>setPage(v=>v+1)}>Show 24 more</button>}
          </>}
        </div>
        <div className={styles.panelFoot}><button onClick={()=>window.dispatchEvent(new Event('campus-scout-open-ask'))}>Ask Scout</button><button onClick={()=>setFeedback(true)}>Suggest a correction</button></div>
      </aside>
    </div>
    {entity && (params.get('entityType')==='founder' ? <FounderCardSheet key={entity} id={entity} onClose={closeEntity} onFounderSelect={selectFounder} onStartupSelect={selectStartup} className={styles.detail} /> : <StartupCardSheet key={entity} id={entity} onClose={closeEntity} onFounderSelect={selectFounder} onStartupSelect={selectStartup} className={styles.detail} />)}
    {feedback && <FeedbackDialog context={context} onClose={()=>setFeedback(false)} />}
    {supportOpen && <SupportDialog url={supportUrl} onClose={()=>setSupportOpen(false)} />}
  </section>;
}

function Filter({label,value,onChange,options,all=true}:{label:string;value:string;onChange:(v:string)=>void;options:[string,string][];all?:boolean}) { return <label>{label}<select aria-label={label} value={value} onChange={e=>onChange(e.target.value)}>{all&&<option value="">All</option>}{options.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>; }
function FeedbackDialog({context,onClose}:{context:string;onClose:()=>void}) {
  const ref=useRef<HTMLDivElement>(null);
  useDialogFocus(true,ref,onClose);
  const [title,setTitle]=useState('');const [body,setBody]=useState('');const [source,setSource]=useState('');const [link,setLink]=useState('');
  function prepare(e:FormEvent){e.preventDefault();const url=new URL('https://github.com/amyzhuang111/dorm-room-fund-scout/issues/new');url.searchParams.set('title',title);url.searchParams.set('body',`${body}\n\nSource: ${source||'Not supplied'}\n\nView: ${window.location.origin}/?${context}`);setLink(url.toString());}
  return <div className={styles.modalBackdrop} onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div ref={ref} className={styles.feedback} role="dialog" aria-modal="true" aria-labelledby="feedback-title" tabIndex={-1}><button className={styles.close} aria-label="Close feedback" onClick={onClose}>×</button><span className={styles.eyebrow}>HELP IMPROVE THE INDEX</span><h2 id="feedback-title">Feedback & corrections</h2><p>Suggest a feature or correct a record. You’ll review and submit a public issue on GitHub.</p><form onSubmit={prepare}><label>Subject<input required maxLength={120} value={title} onChange={e=>{setTitle(e.target.value);setLink('');}} /></label><label>What should change?<textarea required rows={4} maxLength={2000} value={body} onChange={e=>{setBody(e.target.value);setLink('');}} /></label><label>Source URL (optional)<input type="url" value={source} onChange={e=>{setSource(e.target.value);setLink('');}} /></label><button type="submit">Prepare feedback</button>{link&&<a href={link} target="_blank" rel="noopener noreferrer">Review & submit on GitHub ↗</a>}</form></div></div>;
}

function SupportDialog({url,onClose}:{url?:string;onClose:()=>void}) {
  const ref=useRef<HTMLDivElement>(null);
  useDialogFocus(true, ref, onClose);
  return <div className={styles.modalBackdrop} onClick={onClose}><div ref={ref} className={styles.feedback} role="dialog" aria-modal="true" aria-labelledby="support-title" onClick={e=>e.stopPropagation()}>
    <button className={styles.close} aria-label="Close support dialog" onClick={onClose}>×</button>
    <ScoutIcon name="heart" /><h2 id="support-title">Keep curiosity free.</h2>
    <p>Campus Scout is free to explore. Optional donations help keep the data and tools available to everyone.</p>
    {url ? <a className={styles.supportLink} href={url} target="_blank" rel="noopener noreferrer">Make a donation ↗</a> : <p>Donations are not available yet. You can still support Campus Scout by sharing it or suggesting a correction.</p>}
    <small>Free access. No subscriptions.</small>
  </div></div>;
}
