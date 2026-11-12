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
import { COVERAGE_FIELDS, campusIds, filterWorkspace, workspaceCsv, workspaceFilters } from '@/lib/domain/scout-workspace';
import { workspaceFounders } from '@/lib/domain/scout-workspace';
import { logoLooksBlank } from '@/components/corpus-row-mark';
import { discoveryHref } from '@/lib/domain/discovery-navigation';
import { networkExplorationHref } from '@/lib/domain/exploration-navigation';
import { absoluteDate } from '@/lib/domain/relative-time';
import { StartupCardSheet, FounderCardSheet } from './startup-directory-card';
import { useDialogFocus } from './use-dialog-focus';
import styles from './campus-workspace.module.css';
import { ScoutIcon } from './scout-icon';

const TileGlobe = dynamic(() => import('./tile-globe').then(m => m.TileGlobe), { ssr: false, loading: () => <div className={styles.loading}>Loading campus map…</div> });
const number = (n: number) => n.toLocaleString('en-US');

export function CampusWorkspace({ campuses, companyCount, founderCount, updatedAt, supportUrl }: {
  campuses: TileCampus[]; companyCount: number; founderCount: number; updatedAt: string | null; supportUrl?: string;
}) {
  const params = useSearchParams();
  const filters = useMemo(() => workspaceFilters(params), [params]);
  const [companies, setCompanies] = useState<FacetCompany[]>([]);
  const [founders, setFounders] = useState<FounderLead[]>([]);
  const [companyState, setCompanyState] = useState('loading');
  const [founderState, setFounderState] = useState('loading');
  const [retry, setRetry] = useState(0);
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
  const people = useMemo(() => workspaceFounders(founders, matched, filters), [founders, matched, filters]);
  const schools = useMemo(() => {
    const ranked = [...campuses].filter((campus) => campus.founders > 0).sort((a, b) => b.founders - a.founders || a.name.localeCompare(b.name));
    const top = ranked.slice(0, 5);
    if (filters.campus && !top.some((campus) => campus.id === filters.campus)) {
      const selected = campuses.find((campus) => campus.id === filters.campus);
      if (selected) return [selected, ...top.slice(0, 4)];
    }
    return top;
  }, [campuses, filters.campus]);
  const highlights = useMemo(() => new Set(matched.flatMap(campusIds)), [matched]);
  const sectors = useMemo(() => [...new Map(companies.filter(c => c.sectorId).map(c => [c.sectorId!, c.sector ?? c.sectorId!])).entries()].sort((a,b) => a[1].localeCompare(b[1])), [companies]);
  const regions = useMemo(() => [...new Set(companies.map(c => c.hqRegion).filter((x): x is string => !!x))].sort(), [companies]);
  const active = !!(filters.q || filters.campus || filters.sector || filters.region || filters.status || filters.stage || filters.network || filters.missing);
  const ready = companyState === 'ready' && founderState === 'ready';
  const failed = companyState === 'error' || founderState === 'error';
  const founderTotal = ready ? people.length : active ? null : founderCount;
  const entity = params.get('entity');
  const closeEntity = useCallback(() => update({ entity: null, entityType: null }), [update]);
  const reset = () => update({ q:null,campus:null,sector:null,hqRegion:null,hq:null,status:null,stage:null,network:null,missing:null,sort:null,panel:null });
  function exportCsv() {
    const blob = new Blob([workspaceCsv('founders', matched, people)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'campus-scout-founders.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(`Exported ${number(people.length)} founders from this view.`);
  }
  async function share() {
    const url = window.location.href;
    try { await navigator.clipboard.writeText(url); setNotice('View link copied. Filters and open record are included.'); setShareLink(''); }
    catch { setShareLink(url); setNotice('Copy the view link below.'); }
  }
  const selectCampus = useCallback((id: string) => update({ campus: id || null, panel: null }), [update]);
  const selectFounder = (id: string) => { update({entity:id,entityType:'founder'}); return true; };
  const selectStartup = useCallback((id: string) => { update({entity:id,entityType:'startup'}); return true; }, [update]);
  const visiblePeople = people.slice(0, page * 18);
  const campusName=campuses.find(c=>c.id===filters.campus)?.name;
  const networkHref=networkExplorationHref({campus:campusName,returnTo:context?`/?${context}`:'/'});

  return <section ref={workspaceRef} className={styles.workspace} data-map-focused={mapFocused ? "true" : undefined} aria-label="Campus Scout workspace">
    <div className={styles.topline}>
      <div className={styles.identity}><span className={styles.eyebrow}>Founders</span><h1>On the map</h1></div>
      <nav className={styles.viewModes} aria-label="Explore views"><span aria-current="page"><ScoutIcon name="globe" /> Globe</span><Link href={networkHref}><ScoutIcon name="network" /> Network</Link><Link href={discoveryHref('companies',new URLSearchParams(params))}><ScoutIcon name="directory" /> Companies</Link></nav>
      <div className={styles.topActions}><Link href="/work/shortlist" title="Saved companies"><ScoutIcon name="bookmark" /><span>Saved</span></Link><button onClick={share} title="Share this view"><ScoutIcon name="share" /><span>Share</span></button><button onClick={() => setFeedback(true)} title="Send feedback"><ScoutIcon name="message" /><span>Feedback</span></button><button className={styles.donate} onClick={() => setSupportOpen(true)}><ScoutIcon name="heart" /><span>Donate</span></button></div>
    </div>
    <div className={styles.stage}>
      <div className={styles.map} aria-label="Interactive campus globe">
        <TileGlobe embedded onMapFocusChange={setMapFocused} onCompanySelect={selectStartup} campuses={campuses} companies={matched} companyCount={companyState === 'ready' ? matched.length : active ? 0 : companyCount} foundersListed={founderTotal ?? 0} foundersLabel="indexed founders" selectedId={filters.campus} onSelect={selectCampus} dataThrough={updatedAt} highlightCampusIds={active ? highlights : null} />
      </div>
      <aside className={styles.rail} aria-label="Founders">
        <div className={styles.railHead}>
          <div className={styles.railTitle}>
            <span className={styles.eyebrow}>People</span>
            <strong>{campusName || (active ? "This view" : "Every campus")}</strong>
            <span>{founderTotal == null ? "Loading founders" : <>{number(founderTotal)} {active ? "in this view" : "indexed"}</>}</span>
          </div>
          <div className={styles.search}><ScoutIcon name="search" /><input aria-label="Search founders, companies, and campuses" placeholder="Founder, company, campus" value={filters.q} onChange={e => update({ q: e.target.value || null }, true)} /><button onClick={() => setFiltersOpen(v => !v)} aria-expanded={filtersOpen} aria-controls="workspace-filters"><ScoutIcon name="filters" /> Filters{active ? " ·" : ""}</button></div>
          {filtersOpen && <div id="workspace-filters" className={styles.filters}>
            <Filter label="Campus" value={filters.campus} onChange={selectCampus} options={[["missing","Campus not recorded"],...campuses.map(c => [c.id,c.name] as [string,string]).sort((a,b)=>a[1].localeCompare(b[1]))]} />
            <Filter label="Funding stage" value={filters.stage} onChange={v => update({stage:v})} options={stages.map(s => [s.id, `${s.label} (${number(s.count)})`])} />
            <Filter label="Industry" value={filters.sector} onChange={v => update({sector:v})} options={sectors} />
            <Filter label="HQ region" value={filters.region} onChange={v => update({hqRegion:v})} options={[["missing","HQ not recorded"],...regions.map(r=>[r,r] as [string,string])]} />
            <Filter label="Operating status" value={filters.status} onChange={v => update({status:v})} options={Object.entries(STATUS_LABEL)} />
            <Filter label="Missing information" value={filters.missing} onChange={v=>update({missing:v})} options={COVERAGE_FIELDS.map(f=>[f.id,f.label])} />
          </div>}
          {active && <div className={styles.activeFilters}><span>{[campusName, filters.sector && (sectors.find(s=>s[0]===filters.sector)?.[1] ?? filters.sector), filters.region, filters.stage && fundingStageLabel(filters.stage), filters.status && STATUS_LABEL[filters.status as keyof typeof STATUS_LABEL], filters.network, filters.missing && `Missing ${COVERAGE_FIELDS.find(f=>f.id===filters.missing)?.label ?? filters.missing}`, filters.q && `"${filters.q}"`].filter(Boolean).join(" · ")}</span><button onClick={reset}>Clear</button></div>}
        </div>
        <div className={styles.railBody} ref={resultRef}>
          <section className={styles.schools} aria-label="Schools with the most founders">
            <div className={styles.sectionHead}><span className={styles.eyebrow}>Schools</span><Link href="/campuses">All schools</Link></div>
            <ol>
              {schools.map((campus, index) => (
                <li key={campus.id}>
                  <button type="button" aria-pressed={filters.campus === campus.id} onClick={() => selectCampus(filters.campus === campus.id ? "" : campus.id)}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong>{campus.name}</strong>
                    <b>{number(campus.founders)}</b>
                  </button>
                </li>
              ))}
            </ol>
          </section>
          <section className={styles.people} aria-label="Founder list">
            {failed ? <p className={styles.empty}>The founder index did not load. <button onClick={() => { setCompanyState("loading"); setFounderState("loading"); setRetry(v => v + 1); }}>Try again</button></p> : !ready ? <p className={styles.empty}>Loading founders</p> : visiblePeople.length === 0 ? <p className={styles.empty}>No founders match. <button onClick={reset}>Clear filters</button></p> : (
              <ol>
                {visiblePeople.map((person) => (
                  <li key={person.id}>
                    <button type="button" className={styles.founderRow} onClick={() => update({ entity: person.id, entityType: "founder" })}>
                      <FounderMark name={person.company || person.name} companyId={person.companyId} />
                      <span>
                        <strong>{person.name}</strong>
                        <small>{[person.campus, person.company].filter(Boolean).join(" · ") || "Campus and company not recorded"}</small>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
            {ready && people.length > visiblePeople.length ? <button className={styles.more} onClick={() => setPage(v => v + 1)}>Show 18 more</button> : null}
          </section>
        </div>
        <div className={styles.railFoot}>
          <Link href="/founders">Full index</Link>
          <Link href="/companies">{companyState === "ready" ? number(matched.length) : number(companyCount)} companies</Link>
          <Link href="/data">Data</Link>
          <button onClick={exportCsv} disabled={!ready}>Export</button>
          <button onClick={() => window.dispatchEvent(new Event("campus-scout-open-ask"))}>Ask Scout</button>
          {updatedAt ? <span>Updated {absoluteDate(updatedAt)}</span> : null}
        </div>
      </aside>
    </div>
    {notice && <div className={styles.notice} role="status">{notice}<button aria-label="Dismiss notification" onClick={()=>{setNotice('');setShareLink('');}}>×</button>{shareLink && <input aria-label="Shareable view link" readOnly value={shareLink} onFocus={e=>e.target.select()} />}</div>}
    {entity && (params.get('entityType')==='founder' ? <FounderCardSheet key={entity} id={entity} onClose={closeEntity} onFounderSelect={selectFounder} onStartupSelect={selectStartup} className={styles.detail} /> : <StartupCardSheet key={entity} id={entity} onClose={closeEntity} onFounderSelect={selectFounder} onStartupSelect={selectStartup} className={styles.detail} />)}
    {feedback && <FeedbackDialog context={context} onClose={()=>setFeedback(false)} />}
    {supportOpen && <SupportDialog url={supportUrl} onClose={()=>setSupportOpen(false)} />}
  </section>;
}

function Filter({label,value,onChange,options,all=true}:{label:string;value:string;onChange:(v:string)=>void;options:[string,string][];all?:boolean}) { return <label>{label}<select aria-label={label} value={value} onChange={e=>onChange(e.target.value)}>{all&&<option value="">All</option>}{options.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>; }
function markInitials(name: string): string {
  const parts = name.replace(/[^A-Za-z0-9\s]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

function FounderMark({ name, companyId }: { name: string; companyId: string | null }) {
  const src = companyId ? `/company-logos/${companyId}.webp` : "";
  const [ok, setOk] = useState(Boolean(src));
  if (src && ok) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" width={28} height={28} className={styles.mark} onError={() => setOk(false)} onLoad={(event) => { if (logoLooksBlank(event.currentTarget)) setOk(false); }} />
    );
  }
  return <span className={styles.mark} aria-hidden="true">{markInitials(name)}</span>;
}
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
