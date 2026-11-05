"use client";
import type { ReactNode } from "react";
import type { FacetCompany } from "@/lib/domain/sample-facets";
import { FLAG_LABEL, NOT_ON_RECORD, RECENCY_LABEL, sectorBuckets, STATUS_LABEL } from "@/lib/domain/sample-facets";
import { emptyFacets, type FacetState } from "./sample-instrument";

export function CompanyFilters({companies, campuses, facets, onChange}: {companies: FacetCompany[]; campuses: {id:string; name:string; country:string}[]; facets:FacetState; onChange:(next:FacetState)=>void}) {
  const set = (patch:Partial<FacetState>) => onChange({...facets,...patch});
  const values = (key: "sector" | "stage" | "hqRegion" | "signalKind") => [...new Set(companies.map(c=>c[key]).filter((v): v is string=>Boolean(v)))].sort((a,b)=>a.localeCompare(b));
  const options = (items:string[]) => items.map(v=><option key={v} value={v}>{v}</option>);
  const field = (label:string, value:string, change:(v:string)=>void, children:ReactNode) => <label className="block text-sm font-medium text-fg">{label}<select aria-label={label} className="mt-1 block min-h-11 w-full rounded-md border border-line bg-white px-3 text-sm text-fg" value={value} onChange={e=>change(e.target.value)}><option value="">All</option>{children}</select></label>;
  return <div className="space-y-4" data-company-filters="">
    <label className="block text-sm font-medium text-fg">Search<input type="search" value={facets.query} onChange={e=>set({query:e.target.value})} placeholder="Company or founder" className="mt-1 block min-h-11 w-full rounded-md border border-line bg-white px-3 text-sm" /></label>
    {field("Campus",facets.campus??"",v=>set({campus:v||null}),[...campuses].sort((a,b)=>a.name.localeCompare(b.name)).map(c=><option key={c.id} value={c.id}>{c.name}</option>))}
    {field("Sector",facets.sectorMissing?"__missing":facets.sector??"",v=>set({sector:v&&v!=="__missing"?v:null,sectorMissing:v==="__missing"}),<>{sectorBuckets(companies).filter(row=>row.id!==NOT_ON_RECORD).sort((a,b)=>a.label.localeCompare(b.label)).map(({id,label})=><option key={id} value={id}>{label}</option>)}<option value="__missing">Not on record</option></>)}
    {field("Stage",facets.stage??"",v=>set({stage:v||null}),options(values("stage")))}
    <details className="border-t border-line pt-2"><summary className="cursor-pointer py-2 text-sm font-semibold">More filters</summary><div className="space-y-4 pt-2">
      {field("Status",facets.status??"",v=>set({status:(v||null) as FacetState["status"]}),Object.entries(STATUS_LABEL).map(([v,label])=><option key={v} value={v}>{label}</option>))}
      {field("Founded year",facets.yearMissing?"__missing":String(facets.foundedYear??""),v=>set({foundedYear:v&&v!=="__missing"?Number(v):null,yearMissing:v==="__missing"}),<>{[...new Set(companies.map(c=>c.foundedYear).filter((y):y is number=>y!=null))].sort((a,b)=>b-a).map(y=><option key={y} value={y}>{y}</option>)}<option value="__missing">Not on record</option></>)}
      {field("Country",facets.country??"",v=>set({country:v||null}),options([...new Set(campuses.map(c=>c.country).filter(Boolean))].sort()))}
      {field("Headquarters",facets.hqRegion??"",v=>set({hqRegion:v||null}),<>{options(values("hqRegion"))}<option value="not_on_record">Not on record</option></>)}
      {field("Signal type",facets.kind??"",v=>set({kind:v||null}),values("signalKind").map(id=><option key={id} value={id}>{companies.find(c=>c.signalKind===id)?.signalLabel||id}</option>))}
      {field("Signal date",facets.recency??"",v=>set({recency:(v||null) as FacetState["recency"]}),Object.entries(RECENCY_LABEL).map(([v,label])=><option key={v} value={v}>{label}</option>))}
      {field("Highlights",facets.flag??"",v=>set({flag:(v||null) as FacetState["flag"]}),Object.entries(FLAG_LABEL).map(([v,label])=><option key={v} value={v}>{label}</option>))}
    </div></details>
    <button type="button" onClick={()=>onChange(emptyFacets())} className="min-h-11 text-sm font-semibold text-link">Clear filters</button>
  </div>;
}
