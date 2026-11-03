"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { GeoJSONSource, Map as LibreMap, MapLayerMouseEvent } from "maplibre-gl";
import type { FeatureCollection, Point } from "geojson";
import type { CompanyCity, CompanyLocations } from "@/lib/domain/company-locations";
import type { FacetCompany } from "@/lib/domain/sample-facets";
import styles from "./company-location-map.module.css";

const sourceId = "company-hq-cities";
const layerIds = ["company-city-dots", "company-city-counts", "company-city-labels"];
type CityView = Omit<CompanyCity, "companies"> & { companies: (CompanyCity["companies"][number] & { name: string; sector?: string | null })[] };

export function CompanyLocationLayer({ map, enabled, companies, highlightCampusIds, expanded, onExpand }: { map: LibreMap | null; enabled: boolean; companies: FacetCompany[]; highlightCampusIds?: Set<string> | null; expanded: boolean; onExpand: (value:boolean)=>void }) {
  const [data, setData] = useState<CompanyLocations | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [visible, setVisible] = useState<string[]>([]);
  const [limit, setLimit] = useState(24);
  const [collapsed, setCollapsed] = useState(false);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/company-locations", {signal: controller.signal}).then(r => { if (!r.ok) throw new Error("Locations unavailable"); return r.json(); })
      .then((payload: CompanyLocations) => { setData(payload); setFailed(false); }).catch(e => { if (e.name !== "AbortError") setFailed(true); });
    return () => controller.abort();
  }, [attempt]);
  const cities = useMemo<CityView[]>(() => {
    const cards = new Map(companies.filter(c => highlightCampusIds == null || (c.schoolId && highlightCampusIds.has(c.schoolId))).map(c => [c.id,c]));
    const text = query.trim().toLocaleLowerCase("en-US");
    return (data?.cities ?? []).map(city => ({ ...city, companies: city.companies.flatMap(co => {
      const card = cards.get(co.id);
      if (!card || (text && ![card.name, city.city, co.hq, card.school, card.sector, ...(card.founders ?? [])].filter(Boolean).join(" ").toLocaleLowerCase("en-US").includes(text))) return [];
      return [{ ...co, name: card.name, sector: card.sector }];
    }).sort((a,b) => a.name.localeCompare(b.name,"en-US")) })).filter(c => c.companies.length);
  }, [companies, data, highlightCampusIds, query]);
  const geo = useMemo<FeatureCollection<Point>>(() => ({type:"FeatureCollection",features:cities.map(c => ({type:"Feature",geometry:{type:"Point",coordinates:c.coordinates},properties:{id:c.id,name:c.city,count:c.companies.length,countLabel:c.companies.length.toLocaleString("en-US")}}))}), [cities]);

  useEffect(() => {
    if (!map) return;
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {type:"geojson", data:geo});
      map.addLayer({id:layerIds[0],type:"circle",source:sourceId,paint:{"circle-color":"#2F4FD8","circle-opacity":0.94,"circle-radius":["interpolate",["linear"],["get","count"],1,10,10,15,100,20,700,27],"circle-stroke-color":"#FFFFFF","circle-stroke-width":2}});
      map.addLayer({id:layerIds[1],type:"symbol",source:sourceId,layout:{"text-field":["get","countLabel"],"text-font":["Noto Sans Bold"],"text-size":12,"text-allow-overlap":false,"text-ignore-placement":false},paint:{"text-color":"#FFFFFF"}});
      map.addLayer({id:layerIds[2],type:"symbol",source:sourceId,minzoom:3,layout:{"text-field":["get","name"],"text-font":["Noto Sans Regular"],"text-size":12,"text-anchor":"top","text-offset":[0,2.4],"text-allow-overlap":false},paint:{"text-color":"#2F4FD8","text-halo-color":"#FFFFFF","text-halo-width":2}});
    }
    (map.getSource(sourceId) as GeoJSONSource).setData(geo);
    for (const id of layerIds) map.setLayoutProperty(id,"visibility",enabled?"visible":"none");
    const update = () => {
      const bounds=map.getBounds(), center=map.getCenter(), z=map.getZoom();
      const radians=Math.PI/180;
      setZoom(z);
      setVisible(cities.filter(c => {
        if (!bounds.contains(c.coordinates)) return false;
        if (z>=4) return true;
        const [lon,lat]=c.coordinates;
        return Math.sin(lat*radians)*Math.sin(center.lat*radians)+Math.cos(lat*radians)*Math.cos(center.lat*radians)*Math.cos((lon-center.lng)*radians)>0;
      }).map(c=>c.id));
    };
    update(); map.on("moveend",update);
    const choose = (event:MapLayerMouseEvent) => {
      if (!enabled) return;
      const id=String(event.features?.[0]?.properties.id??"");
      const city=cities.find(c=>c.id===id);
      if (city) {setSelected(id);setLimit(24);setCollapsed(false);if(innerWidth<640)onExpand(true);map.flyTo({center:city.coordinates,zoom:11.5,duration:700});}
    };
    map.on("click",layerIds[0],choose);
    const enter=()=>{if(enabled)map.getCanvas().style.cursor="pointer";};
    const leave=()=>{map.getCanvas().style.cursor="";};
    map.on("mouseenter",layerIds[0],enter);map.on("mouseleave",layerIds[0],leave);
    return () => {map.off("moveend",update);map.off("click",layerIds[0],choose);map.off("mouseenter",layerIds[0],enter);map.off("mouseleave",layerIds[0],leave);};
  }, [map,geo,cities,enabled,onExpand]);

  if (!enabled) return null;
  const selectedCity=cities.find(c=>c.id===selected);
  const inView=cities.filter(c=>visible.includes(c.id));
  const shownCities=selectedCity?[selectedCity]:inView;
  const shown=shownCities.flatMap(city=>city.companies.map(co=>({...co,city:city.city,cityId:city.id})));
  const mapped=cities.reduce((n,c)=>n+c.companies.length,0);
  function focusCity(id:string) {
    const city=cities.find(c=>c.id===id);
    setSelected(city?.id??null);setLimit(24);setCollapsed(false);
    if(city){if(innerWidth<640)onExpand(true);map?.flyTo({center:city.coordinates,zoom:11.5,duration:700});}
  }
  return <div className={styles.layer} data-company-location-map="" data-map-zoom={zoom.toFixed(1)}>
    <div className={styles.toolbar}>
      <label><span className="sr-only">Find a company or city</span><input value={query} onChange={e=>{setQuery(e.target.value);setSelected(null);setLimit(24);}} placeholder="Find a company or city" /></label>
      <label><span className="sr-only">Go to HQ city</span><select value={selectedCity?.id??""} onChange={e=>focusCity(e.target.value)}><option value="">Go to city</option>{cities.map(c=><option key={c.id} value={c.id}>{c.city} ({c.companies.length.toLocaleString("en-US")})</option>)}</select></label>
      <button className={styles.mobileExplore} disabled={!map || !data} onClick={()=>onExpand(true)}>{data ? `Explore ${mapped.toLocaleString("en-US")} mapped startup HQs ↗` : "Loading HQ locations…"}</button>
    </div>
    <div className={styles.zoom} aria-label="Map controls">
      <button aria-label="Zoom in" disabled={!map||zoom>=17} onClick={()=>map?.zoomIn()}>+</button>
      <button aria-label="Zoom out" disabled={!map||zoom<=0.35} onClick={()=>map?.zoomOut()}>−</button>
      <button aria-label="Reset globe view" disabled={!map} onClick={()=>{setSelected(null);map?.flyTo({center:[-72,36],zoom:1.4});}}>◎</button>
      <button aria-label={expanded?"Exit expanded map":"Expand map"} onClick={()=>onExpand(!expanded)}>{expanded?"×":"⤢"}</button>
    </div>
    <section className={styles.results} aria-label="Startups on the map">
      <div className={styles.resultHeading}><div><h3>{selectedCity?selectedCity.city:"Current view"} <strong>{shown.length.toLocaleString("en-US")}</strong> startups</h3><p>City-level HQ locations · office addresses not on record</p></div><button aria-expanded={!collapsed} aria-label={collapsed?"Show startups in view":"Collapse startups in view"} onClick={()=>setCollapsed(v=>!v)}>{collapsed?"Show":"Hide"}</button></div>
      {!collapsed && <>
        {failed ? <p>Locations unavailable. <button onClick={()=>{setFailed(false);setAttempt(v=>v+1);}}>Retry</button></p> : !data || !companies.length ? <p>Loading recorded HQ locations…</p> : shown.length ? <ul className={styles.companyList}>{shown.slice(0,limit).map(co=><li key={co.id}><Link href={`/startup/${encodeURIComponent(co.id)}`}>{co.name}</Link><span>{co.city}</span><a href={co.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={`HQ source for ${co.name}`}>Source ↗</a></li>)}{shown.length>limit?<li><button onClick={()=>setLimit(n=>n+24)}>Load {Math.min(24,shown.length-limit)} more</button></li>:null}</ul> : <p>{query?"No matching HQ locations in view. Try another city or clear the search.":"No recorded HQ locations in view. Zoom out or choose a city."}</p>}
        <div className={styles.coverage}><span>{mapped.toLocaleString("en-US")} mapped in this filter{data?` · ${data.unmapped.toLocaleString("en-US")} without a mapped city in the catalog`:""}</span>{query?<button onClick={()=>setQuery("")}>Clear search</button>:null}{selectedCity?<button onClick={()=>setSelected(null)}>Follow map view</button>:null}<a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer">City centers: GeoNames</a></div>
      </>}
    </section>
  </div>;
}
