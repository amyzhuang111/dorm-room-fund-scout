"use client";
import Link from "next/link";
import { useState } from "react";
import type { FacetCompany } from "@/lib/domain/sample-facets";

export function MapStartupResults({ companies, ready, query, campusId, compact = false }: { companies: FacetCompany[]; ready: boolean; query: string; campusId: string | null; compact?: boolean }) {
  const [limit, setLimit] = useState(12);
  const [filters, setFilters] = useState({ program: "", sector: "", year: "", signal: "", stage: "" });
  const update = (key: keyof typeof filters, value: string) => { setFilters(current => ({ ...current, [key]: value })); setLimit(12); };
  const programsOf = (c: FacetCompany) => [...new Set([...(c.programs ?? []), c.primaryProgram].filter((v): v is string => Boolean(v)))];
  const needle = query.trim().toLowerCase();
  const pool = companies.filter(c => {
    if (campusId === "missing" ? Boolean(c.schoolId) : campusId && c.schoolId !== campusId) return false;
    return !needle || [c.name, c.school, c.description, c.sector, ...(c.founders ?? []), ...programsOf(c)].join(" ").toLowerCase().includes(needle);
  });
  const matches = pool.filter(c => (!filters.program || programsOf(c).includes(filters.program)) && (!filters.sector || (filters.sector === "__missing" ? !c.sector : c.sector === filters.sector)) && (!filters.year || (filters.year === "__missing" ? c.foundedYear == null : String(c.foundedYear) === filters.year)) && (!filters.signal || (filters.signal === "__missing" ? !c.signalKind : c.signalKind === filters.signal)) && (!filters.stage || c.stage === filters.stage));
  const choices = (values: string[]) => [...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const select = (key: keyof typeof filters, label: string, values: string[], missing = false) => <label className="block min-w-0 text-xs font-medium text-fg-2">{label}<select aria-label={label} value={filters[key]} onChange={e=>update(key,e.target.value)} className="mt-1 min-h-11 w-full rounded border border-line bg-white px-2 text-sm text-fg"><option value="">All</option>{values.map(value=><option key={value} value={value}>{key === "signal" ? pool.find(c=>c.signalKind===value)?.signalLabel || value : value}</option>)}{missing && <option value="__missing">Not on record</option>}</select></label>;
  if (!ready) return <p role="status" className="py-3 text-sm text-fg-2">Loading startups…</p>;
  return <section aria-label="Startup results" data-map-startups="">
    {!compact && <div className="space-y-3 border-b border-line pb-3" data-startup-filters="">
      {select("program", "Program", choices(pool.flatMap(programsOf)))}
      <div className="grid grid-cols-2 gap-3">
        {select("sector", "Sector", choices(pool.map(c=>c.sector ?? "")), true)}
        {select("year", "Year founded", choices(pool.map(c=>c.foundedYear == null ? "" : String(c.foundedYear))).reverse(), true)}
        {select("signal", "Signal type", choices(pool.map(c=>c.signalKind ?? "")), true)}
        {select("stage", "Stage", choices(pool.map(c=>c.stage ?? "")))}
      </div>
      {Object.values(filters).some(Boolean) && <button type="button" className="min-h-11 text-sm font-semibold text-link" onClick={()=>{setFilters({program:"",sector:"",year:"",signal:"",stage:""});setLimit(12);}}>Clear startup filters</button>}
    </div>}
    <p role="status" className="py-2 text-sm text-fg-2">{matches.length.toLocaleString()} startups</p>
    {matches.length === 0 && <p className="py-3 text-sm">No startups match. Clear filters or try another search.</p>}
    <div className="divide-y divide-line">{matches.slice(0, compact ? 2 : limit).map(c => <Link key={c.id} href={`/startup/${encodeURIComponent(c.id)}?from=map`} className="block rounded px-1 py-3 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600">
      <p className="font-semibold text-fg">{c.name} <span aria-hidden="true">↗</span></p>
      <p className="mt-1 text-xs text-fg-2">{[c.school, c.sector, c.stage].filter(Boolean).join(" · ")}</p>
      {c.description && <p className="mt-2 line-clamp-2 text-sm text-fg-2">{c.description}</p>}
      {!!c.founders?.length && <p className="mt-2 text-xs text-fg-2">{c.founders.join(" · ")}</p>}
    </Link>)}</div>
    {!compact && matches.length > limit && <button type="button" className="min-h-11 w-full text-sm font-semibold text-link" onClick={() => setLimit(n => n + 12)}>Show more startups</button>}
  </section>;
}
