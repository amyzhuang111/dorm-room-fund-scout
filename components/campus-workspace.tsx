'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import type { TileCampus } from './tile-globe';
import type { FacetCompany } from '@/lib/domain/sample-facets';
import { statusOf, STATUS_LABEL } from '@/lib/domain/sample-facets';
import type { FounderLead } from '@/lib/domain/founder-index';
import { fetchSampleDirectory } from '@/lib/domain/sample-directory-client';
import { COVERAGE_FIELDS, PANELS, campusIds, campusNames, filterWorkspace, hasNamedFounder, panelOf, rankGroups, workspaceCsv, workspaceFilters } from '@/lib/domain/scout-workspace';
import { workspaceFounders } from '@/lib/domain/scout-workspace';
import { discoveryHref } from '@/lib/domain/discovery-navigation';
import { networkExplorationHref } from '@/lib/domain/exploration-navigation';
import { absoluteDate } from '@/lib/domain/relative-time';
import { StartupCardSheet, FounderCardSheet } from './startup-directory-card';
import { useDialogFocus } from './use-dialog-focus';
import styles from './campus-workspace.module.css';

const TileGlobe = dynamic(() => import('./tile-globe').then(m => m.TileGlobe), { ssr: false, loading: () => <div className={styles.loading}>Loading campus map…</div> });
const number = (n: number) => n.toLocaleString('en-US');

export function CampusWorkspace({ campuses, companyCount, founderCount, updatedAt, supportUrl }: {
  campuses: TileCampus[]; companyCount: number; founderCount: number; updatedAt: string | null; supportUrl?: string;
}) {
  const params = useSearchParams();
  const panel = panelOf(params.get('panel') ?? (params.get('view') === 'network' ? 'networks' : null));
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [shareLink, setShareLink] = useState('');
  const [feedback, setFeedback] = useState(false);
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
  const matched = useMemo(() => filterWorkspace(companies, filters), [companies, filters]);
  const people = useMemo(() => workspaceFounders(founders, matched, filters), [founders, matched, filters]);
  const rankings = useMemo(() => rankGroups(matched, 'campus'), [matched]);
  const leadingCampuses = useMemo(() => rankGroups(filterWorkspace(companies,{...filters,campus:''}), 'campus').slice(0,5),[companies,filters]);
  const networks = useMemo(() => rankGroups(matched, 'network'), [matched]);
  const highlights = useMemo(() => new Set(matched.flatMap(campusIds)), [matched]);
  const sectors = useMemo(() => [...new Map(companies.filter(c => c.sectorId).map(c => [c.sectorId!, c.sector ?? c.sectorId!])).entries()].sort((a,b) => a[1].localeCompare(b[1])), [companies]);
  const regions = useMemo(() => [...new Set(companies.map(c => c.hqRegion).filter((x): x is string => !!x))].sort(), [companies]);
  const active = !!(filters.q || filters.campus || filters.sector || filters.region || filters.status || filters.network || filters.missing);
  const ready = companyState === 'ready' && (panel !== 'founders' || founderState === 'ready');
  const failed = companyState === 'error' || (panel === 'founders' && founderState === 'error');
  const entity = params.get('entity');
  const closeEntity = useCallback(() => update({ entity: null, entityType: null }), [update]);
  const currentCount = panel === 'founders' ? people.length : panel === 'rankings' ? rankings.length : panel === 'networks' ? networks.length : matched.length;
  const reset = () => update({ q:null,campus:null,sector:null,hqRegion:null,status:null,network:null,missing:null,sort:null });
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
  const selectCampus = useCallback((id: string) => update({ campus: id || null, panel: 'companies' }), [update]);
  const selectFounder = (id: string) => { update({entity:id,entityType:'founder'}); return true; };
  const selectStartup = (id: string) => { update({entity:id,entityType:'startup'}); return true; };
  const visibleCompanies = matched.slice(0, page * 24);
  const visiblePeople = people.slice(0, page * 24);
  const campusName=campuses.find(c=>c.id===filters.campus)?.name;
  const networkHref=networkExplorationHref({campus:campusName,returnTo:context?`/?${context}`:'/'});

  return <section className={styles.workspace} aria-label="Campus Scout workspace">
    <div className={styles.topline}>
      <div><span className={styles.eyebrow}>THE CAMPUS ECOSYSTEM</span><h1>Discover the next generation.</h1></div>
      <nav className={styles.viewModes} aria-label="Explore views"><span aria-current="page">◎ Globe</span><Link href={networkHref}>⌘ Network map</Link><Link href={discoveryHref('companies',new URLSearchParams(params))}>☷ Directory</Link></nav>
      <div className={styles.topActions}><Link href="/work/shortlist">☆ Saved</Link><button onClick={share}>Share view ↗</button><button onClick={() => setFeedback(true)}>Feedback</button>{supportUrl && <a href={supportUrl} target="_blank" rel="noopener noreferrer">Buy me a coffee ↗</a>}</div>
    </div>
    <div className={styles.stage}>
      <div className={styles.map} aria-label="Interactive campus globe">
        <TileGlobe campuses={campuses} companies={matched} companyCount={companyState === 'ready' ? matched.length : active ? 0 : companyCount} foundersListed={founderState === 'ready' && companyState === 'ready' ? people.length : active ? 0 : founderCount} foundersLabel="indexed founders" selectedId={filters.campus} onSelect={selectCampus} dataThrough={updatedAt} highlightCampusIds={active ? highlights : null} />
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
      <aside className={`${styles.panel} ${expanded ? styles.expanded : ''}`} aria-label="Browse campus database">
        <div className={styles.panelHead}><span className={styles.eyebrow}>SCOUT DATABASE</span><button className={styles.mobileExpand} onClick={() => setExpanded(v => !v)} aria-expanded={expanded}>{expanded ? 'Collapse ↓' : 'Expand ↑'}</button><Link className={`${styles.fullDirectory} block`} href={panel === 'founders' ? `/founders?${new URLSearchParams([...params.entries()].filter(([key]) => ['campus','q','sector','hqRegion','status','network','missing'].includes(key)))}` : panel === 'rankings' ? `/campuses?${new URLSearchParams([...params.entries()].filter(([key]) => ['q','sector','hqRegion','status','network','missing'].includes(key)))}` : panel === 'insights' ? '/data?scope=scout' : panel === 'networks' ? '/networks' : discoveryHref('companies', new URLSearchParams(params))}>Full directory ↗</Link></div>
        <nav className={styles.tabs} aria-label="Workspace panels">{PANELS.map(p => p.id === 'networks' ? <Link key={p.id} href={networkHref} className="inline-flex" title="Open the founder and startup network map">Networks ↗</Link> : <button key={p.id} aria-pressed={panel === p.id} onClick={() => { update({ panel:p.id, ...(p.id === 'rankings' ? { campus:null } : {}) }); setExpanded(true); }}>{p.label}</button>)}</nav>
        <div className={styles.search}><span aria-hidden="true">⌕</span><input aria-label="Search companies, founders and campuses" placeholder="Company, founder, campus…" value={filters.q} onChange={e => update({ q:e.target.value || null }, true)} /><button onClick={() => setFiltersOpen(v => !v)} aria-expanded={filtersOpen} aria-controls="workspace-filters">Filters{active ? ' •' : ''}</button></div>
        {!active&&!filtersOpen&&<div className={styles.startPoints} aria-label="Start exploring"><span>Start with</span><button onClick={()=>selectCampus('univ_penn')}>Penn</button><button onClick={()=>selectCampus('univ_berkeley')}>Berkeley</button><button onClick={()=>selectCampus('univ_stanford')}>Stanford</button><button onClick={()=>update({panel:'rankings',campus:null})}>Rankings ↗</button></div>}
        {filtersOpen && <div id="workspace-filters" className={styles.filters}>
          <Filter label="Campus" value={filters.campus} onChange={selectCampus} options={[["missing","Campus not recorded"],...campuses.map(c => [c.id,c.name] as [string,string]).sort((a,b)=>a[1].localeCompare(b[1]))]} />
          <Filter label="Industry" value={filters.sector} onChange={v => update({sector:v})} options={sectors} />
          <Filter label="HQ region" value={filters.region} onChange={v => update({hqRegion:v})} options={[["missing","HQ not recorded"],...regions.map(r=>[r,r] as [string,string])]} />
          <Filter label="Operating status" value={filters.status} onChange={v => update({status:v})} options={Object.entries(STATUS_LABEL)} />
          <Filter label="Missing information" value={filters.missing} onChange={v=>update({missing:v})} options={COVERAGE_FIELDS.map(f=>[f.id,f.label])} />
          <Filter label="Order" value={filters.sort} onChange={v=>update({sort:v})} options={[["signals","Most signals"],["name","A–Z"],["recent","Latest signal"]]} all={false} />
        </div>}
        {active && <div className={styles.activeFilters}><span>{[filters.campus && (campuses.find(c=>c.id===filters.campus)?.name ?? 'Campus missing'), filters.sector && (sectors.find(s=>s[0]===filters.sector)?.[1] ?? filters.sector), filters.region, filters.status && STATUS_LABEL[filters.status as keyof typeof STATUS_LABEL], filters.network, filters.missing && `Missing ${COVERAGE_FIELDS.find(f=>f.id===filters.missing)?.label ?? filters.missing}`, filters.q && `“${filters.q}”`].filter(Boolean).join(' · ')}</span><button onClick={reset}>Clear all</button></div>}
        <div className={styles.resultTools}><span role="status">{ready ? `${number(currentCount)} ${panel === 'insights' ? 'companies analyzed' : panel === 'rankings' ? 'campuses ranked' : panel}` : failed ? 'Data unavailable' : 'Loading records…'}</span><button disabled={!ready} onClick={exportCsv}>↓ Export CSV</button></div>
        <div className={styles.results} ref={resultRef} key={panel}>
          {failed ? <div className={styles.empty}><p>We couldn’t load the records. Your filters are saved in the link.</p><button onClick={()=>{setCompanyState('loading');setFounderState('loading');setRetry(v=>v+1);}}>Try again</button></div> : !ready ? <div className={styles.empty}>Loading the source-backed index…</div> : <>
            {panel === 'companies' && visibleCompanies.map(c => <CompanyRow key={c.id} company={c} onOpen={()=>update({entity:c.id,entityType:'startup'})} />)}
            {panel === 'founders' && visiblePeople.map(f => <button className={styles.founderRow} key={f.id} onClick={()=>update({entity:f.id,entityType:'founder'})}><span className={styles.monogram} aria-hidden="true">{f.name.slice(0,1)}</span><span><strong>{f.name}</strong><span className={styles.campus}>{f.campus || 'Campus not recorded'}{f.gradYear ? ` · Class of ${f.gradYear}` : ' · Class year not recorded'}</span><span>{[f.company,f.role].filter(Boolean).join(' · ') || 'Company not recorded'}</span></span><span aria-hidden="true">↗</span></button>)}
            {(panel === 'rankings' || panel === 'networks') && <><p className={styles.explainer}>{panel === 'rankings' ? 'Ranked by distinct companies, highest first. Selecting a campus opens its matching company list. A company can belong to more than one campus; campus totals overlap.' : 'Shared investor and program networks, ranked by linked companies. These are recorded affiliations, not inferred employment “mafias”.'}</p>{(panel==='rankings'?rankings:networks).map((g,i)=><button key={g.id} className={styles.rankRow} onClick={()=>update(panel==='rankings'?{campus:g.id,panel:'companies'}:{network:g.id,panel:'companies'})}><span className={styles.rank}>{String(i+1).padStart(2,'0')}</span><span className={styles.rankBody}><strong>{g.name}</strong><span className={styles.bar}><i style={{width:`${g.companies/((panel==='rankings'?rankings:networks)[0]?.companies||1)*100}%`}} /></span><small>{number(g.signals)} recorded signals</small></span><b>{number(g.companies)}</b></button>)}</>}
            {panel === 'insights' && <><div className={styles.insightIntro}><h2>Know what’s on record.</h2><p>Coverage across the {number(matched.length)} companies in your view. A recorded value is not a guarantee it is current. Missing fields stay visible.</p></div>{COVERAGE_FIELDS.map(f=>{const present=matched.filter(f.has).length;const pct=matched.length?Math.round(present/matched.length*100):0;return <button key={f.id} className={styles.coverage} onClick={()=>update({missing:f.id,panel:'companies'})}><span><strong>{f.label}</strong><b>{pct}%</b></span><span className={styles.bar}><i style={{width:`${pct}%`}} /></span><small>{number(present)} recorded · {number(matched.length-present)} missing →</small></button>;})}<p className={styles.explainer}>Founder names are shown in full when stored. Initial-only records need verification. Founded year, signal date, and verification date are separate fields. Social audience rankings need sourced follower counts.</p></>}
            {currentCount === 0 && <div className={styles.empty}><h2>No matching records</h2><p>Try fewer filters or a different search.</p><button onClick={reset}>Clear filters</button></div>}
            {((panel==='companies'&&matched.length>visibleCompanies.length)||(panel==='founders'&&people.length>visiblePeople.length))&&<button className={styles.more} onClick={()=>setPage(v=>v+1)}>Show 24 more</button>}
          </>}
        </div>
        <div className={styles.panelFoot}><span>Evidence first. Unknowns visible.</span><button onClick={()=>setFeedback(true)}>Suggest a correction ↗</button></div>
      </aside>
      <button className={styles.ask} onClick={()=>window.dispatchEvent(new Event('campus-scout-open-ask'))}><span aria-hidden="true">✧</span><span><strong>Ask Scout</strong><small>Find founders. Follow the evidence.</small></span><span aria-hidden="true">↗</span></button>
    </div>
    {notice && <div className={styles.notice} role="status">{notice}<button aria-label="Dismiss notification" onClick={()=>{setNotice('');setShareLink('');}}>×</button>{shareLink && <input aria-label="Shareable view link" readOnly value={shareLink} onFocus={e=>e.target.select()} />}</div>}
    {entity && (params.get('entityType')==='founder' ? <FounderCardSheet key={entity} id={entity} onClose={closeEntity} onFounderSelect={selectFounder} onStartupSelect={selectStartup} className={styles.detail} /> : <StartupCardSheet key={entity} id={entity} onClose={closeEntity} onFounderSelect={selectFounder} onStartupSelect={selectStartup} className={styles.detail} />)}
    {feedback && <FeedbackDialog context={context} onClose={()=>setFeedback(false)} />}
  </section>;
}

function Filter({label,value,onChange,options,all=true}:{label:string;value:string;onChange:(v:string)=>void;options:[string,string][];all?:boolean}) { return <label>{label}<select value={value} onChange={e=>onChange(e.target.value)}>{all&&<option value="">All</option>}{options.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>; }
function CompanyRow({company:c,onOpen}:{company:FacetCompany;onOpen:()=>void}) {
  const [failed,setFailed]=useState(false);
  return <button className={styles.companyRow} onClick={onOpen} aria-label={`Preview ${c.name}`}>
    <span className={styles.logo} aria-hidden="true">{c.logoUrl&&!failed ? <img src={c.logoUrl} alt="" width="32" height="32" loading="lazy" onError={()=>setFailed(true)} /> : c.name.slice(0,2).toUpperCase()}</span>
    <span className={styles.companyBody}><span className={styles.companyTitle}><strong>{c.name}</strong><span>{c.verificationStatus === "confirmed" ? "✓ Confirmed" : "Verification pending"}</span></span><span className={styles.campus}>{campusNames(c).join(' · ') || 'Campus not recorded'}</span><span className={styles.names}>{c.founders?.length ? c.founders.join(' · ') : 'Founder names not recorded'}{c.founders?.length&&!hasNamedFounder(c)?' · Name needs verification':''}</span>{c.description&&<span className={styles.description}>{c.description}</span>}<span className={styles.metadata}>{[STATUS_LABEL[statusOf(c)],c.sector||'Industry unknown',c.hqRegion||'HQ unknown',c.foundedYear?`Founded ${c.foundedYear}`:'Founded year unknown',c.teamSize?`Team ${c.teamSize}`:'Team size unknown'].join(' · ')}</span></span>
  </button>;
}
function FeedbackDialog({context,onClose}:{context:string;onClose:()=>void}) {
  const ref=useRef<HTMLDivElement>(null);
  const close=useCallback(onClose,[onClose]);
  useDialogFocus(true,ref,close);
  const [title,setTitle]=useState('');const [body,setBody]=useState('');const [source,setSource]=useState('');const [link,setLink]=useState('');
  function prepare(e:FormEvent){e.preventDefault();const url=new URL('https://github.com/amyzhuang111/dorm-room-fund-scout/issues/new');url.searchParams.set('title',title);url.searchParams.set('body',`${body}\n\nSource: ${source||'Not supplied'}\n\nView: ${window.location.origin}/?${context}`);setLink(url.toString());}
  return <div className={styles.modalBackdrop} onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div ref={ref} className={styles.feedback} role="dialog" aria-modal="true" aria-labelledby="feedback-title" tabIndex={-1}><button className={styles.close} aria-label="Close feedback" onClick={onClose}>×</button><span className={styles.eyebrow}>HELP IMPROVE THE INDEX</span><h2 id="feedback-title">Feedback & corrections</h2><p>Suggest a feature or correct a record. You’ll review and submit a public issue on GitHub.</p><form onSubmit={prepare}><label>Subject<input required maxLength={120} value={title} onChange={e=>{setTitle(e.target.value);setLink('');}} /></label><label>What should change?<textarea required rows={4} maxLength={2000} value={body} onChange={e=>{setBody(e.target.value);setLink('');}} /></label><label>Source URL (optional)<input type="url" value={source} onChange={e=>{setSource(e.target.value);setLink('');}} /></label><button type="submit">Prepare feedback</button>{link&&<a href={link} target="_blank" rel="noopener noreferrer">Review & submit on GitHub ↗</a>}</form></div></div>;
}
