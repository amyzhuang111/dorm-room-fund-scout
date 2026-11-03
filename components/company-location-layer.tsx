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
const officeSourceId = "company-office-points";
const officeLayerIds = ["company-office-dots", "company-office-labels"];
type CityView = Omit<CompanyCity, "companies"> & { companies: (CompanyCity["companies"][number] & { name: string; sector?: string | null })[] };

export function CompanyLocationLayer({ map, enabled, companies, highlightCampusIds, expanded, onExpand, rotationEnabled, onRotationChange }: { map: LibreMap | null; enabled: boolean; companies: FacetCompany[]; highlightCampusIds?: Set<string> | null; expanded: boolean; onExpand: (value:boolean)=>void; rotationEnabled: boolean; onRotationChange: (value:boolean)=>void }) {
  const [data, setData] = useState<CompanyLocations | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
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
  const officeGeo = useMemo<FeatureCollection<Point>>(() => ({type:"FeatureCollection",features:cities.flatMap(city=>city.companies.flatMap(co=>co.office?[{type:"Feature" as const,geometry:{type:"Point" as const,coordinates:co.office.coordinates},properties:{id:co.id,cityId:city.id,name:co.name}}]:[]))}), [cities]);

  useEffect(() => {
    if (!map) return;
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {type:"geojson", data:geo,cluster:true,clusterRadius:44,clusterMaxZoom:5,clusterProperties:{companiesTotal:["+",["get","count"]]}});
      map.addLayer({id:layerIds[0],type:"circle",source:sourceId,paint:{"circle-color":"#2F4FD8","circle-opacity":0.98,"circle-radius":["interpolate",["linear"],["coalesce",["get","companiesTotal"],["get","count"]],1,10,10,15,100,21,700,29],"circle-stroke-color":"#FFFFFF","circle-stroke-width":2}});
      map.addLayer({id:layerIds[1],type:"symbol",source:sourceId,layout:{"text-field":["number-format",["coalesce",["get","companiesTotal"],["get","count"]],{"locale":"en-US","max-fraction-digits":0}],"text-font":["Noto Sans Bold"],"text-size":12,"text-allow-overlap":false,"text-ignore-placement":false},paint:{"text-color":"#FFFFFF"}});
      map.addLayer({id:layerIds[2],type:"symbol",source:sourceId,minzoom:3,layout:{"text-field":["get","name"],"text-font":["Noto Sans Regular"],"text-size":12,"text-anchor":"top","text-offset":[0,2.4],"text-allow-overlap":false},paint:{"text-color":"#2F4FD8","text-halo-color":"#FFFFFF","text-halo-width":2}});
    }
    (map.getSource(sourceId) as GeoJSONSource).setData(geo);
    for (const id of layerIds) map.setLayoutProperty(id,"visibility",enabled?"visible":"none");
    if (!map.getSource(officeSourceId)) {
      map.addSource(officeSourceId,{type:"geojson",data:officeGeo});
      map.addLayer({id:officeLayerIds[0],type:"circle",source:officeSourceId,minzoom:7,paint:{"circle-color":"#2F4FD8","circle-radius":8,"circle-stroke-width":3,"circle-stroke-color":"#FFFFFF"}});
      map.addLayer({id:officeLayerIds[1],type:"symbol",source:officeSourceId,minzoom:9,layout:{"text-field":["get","name"],"text-font":["Noto Sans Bold"],"text-size":13,"text-anchor":"bottom","text-offset":[0,-1.1],"text-allow-overlap":false},paint:{"text-color":"#203DA7","text-halo-color":"#FFFFFF","text-halo-width":2}});
    }
    (map.getSource(officeSourceId) as GeoJSONSource).setData(officeGeo);
    for (const id of officeLayerIds) map.setLayoutProperty(id,"visibility",enabled?"visible":"none");
    let lastUpdate = 0;
    const update = () => {
      if (performance.now()-lastUpdate<300) return;
      lastUpdate = performance.now();
      const bounds=map.getBounds(), center=map.getCenter(), z=map.getZoom();
      const radians=Math.PI/180;
      setZoom(z);
      setVisible(cities.filter(c => {
        if (!bounds.contains(c.coordinates) && !c.companies.some(co=>co.office && bounds.contains(co.office.coordinates))) return false;
        if (z>=4) return true;
        const [lon,lat]=c.coordinates;
        return Math.sin(lat*radians)*Math.sin(center.lat*radians)+Math.cos(lat*radians)*Math.cos(center.lat*radians)*Math.cos((lon-center.lng)*radians)>0;
      }).map(c=>c.id));
    };
    update(); map.on("moveend",update);
    const choose = async (event:MapLayerMouseEvent) => {
      if (!enabled) return;
      const feature=event.features?.[0];
      if(feature?.properties.cluster && feature.geometry.type==="Point"){
        const nextZoom=await (map.getSource(sourceId) as GeoJSONSource).getClusterExpansionZoom(Number(feature.properties.cluster_id));
        if(innerWidth<640)onExpand(true);
        map.flyTo({center:feature.geometry.coordinates as [number,number],zoom:nextZoom+0.2,duration:600});
        return;
      }
      const id=String(event.features?.[0]?.properties.id??"");
      const city=cities.find(c=>c.id===id);
      if (city) {setSelected(id);setSelectedCompany(null);setLimit(24);setCollapsed(false);if(innerWidth<640)onExpand(true);map.flyTo({center:city.coordinates,zoom:11.5,duration:700});}
    };
    const chooseOffice = (event:MapLayerMouseEvent) => {
      if(!enabled)return;
      const id=String(event.features?.[0]?.properties.id??"");
      const city=cities.find(c=>c.companies.some(co=>co.id===id));
      const office=city?.companies.find(co=>co.id===id)?.office;
      if(city && office){setSelected(city.id);setSelectedCompany(id);setCollapsed(innerWidth<640);onExpand(true);map.flyTo({center:office.coordinates,zoom:16,offset:innerWidth<640?[0,-70]:[0,0],duration:700});}
    };
    map.on("click",layerIds[0],choose);
    map.on("click",officeLayerIds[0],chooseOffice);
    const enter=()=>{if(enabled)map.getCanvas().style.cursor="pointer";};
    const leave=()=>{map.getCanvas().style.cursor="";};
    map.on("mouseenter",layerIds[0],enter);map.on("mouseleave",layerIds[0],leave);
    map.on("mouseenter",officeLayerIds[0],enter);map.on("mouseleave",officeLayerIds[0],leave);
    return () => {map.off("moveend",update);map.off("click",layerIds[0],choose);map.off("click",officeLayerIds[0],chooseOffice);map.off("mouseenter",layerIds[0],enter);map.off("mouseleave",layerIds[0],leave);map.off("mouseenter",officeLayerIds[0],enter);map.off("mouseleave",officeLayerIds[0],leave);};
  }, [map,geo,officeGeo,cities,enabled,onExpand]);

  if (!enabled) return null;
  const selectedCity=cities.find(c=>c.id===selected);
  const inView=cities.filter(c=>visible.includes(c.id));
  const shownCities=selectedCity?[selectedCity]:query.trim()?cities:inView;
  const shown=shownCities.flatMap(city=>city.companies.map(co=>({...co,city:city.city,cityId:city.id})));
  const mapped=cities.reduce((n,c)=>n+c.companies.length,0);
  const addressMapped=cities.reduce((n,c)=>n+c.companies.filter(co=>co.office).length,0);
  const focused=selectedCity?.companies.find(co=>co.id===selectedCompany);
  const point=focused?.office?.coordinates ?? selectedCity?.coordinates;
  const coordinateLabel=point ? `${Math.abs(point[1]).toFixed(5)}° ${point[1]>=0?"N":"S"}, ${Math.abs(point[0]).toFixed(5)}° ${point[0]>=0?"E":"W"}` : "";
  function focusCity(id:string) {
    const city=cities.find(c=>c.id===id);
    setSelected(city?.id??null);setSelectedCompany(null);setLimit(24);setCollapsed(false);
    if(city){if(innerWidth<640)onExpand(true);map?.flyTo({center:city.coordinates,zoom:11.5,duration:700});}
  }
  function focusCompany(id:string,cityId:string){
    const city=cities.find(c=>c.id===cityId), co=city?.companies.find(c=>c.id===id);
    if(!city||!co)return;
    setSelected(city.id);setSelectedCompany(id);setCollapsed(innerWidth<640);onExpand(true);
    map?.flyTo({center:co.office?.coordinates??city.coordinates,zoom:co.office?16:11.5,offset:innerWidth<640?[0,-70]:[0,0],duration:700});
  }
  function resetView() {
    setSelected(null);setSelectedCompany(null);
    if (!map) return;
    const {width,height}=map.getContainer().getBoundingClientRect();
    const diameter=Math.min(width,Math.max(160,height-(expanded?300:160)))*0.9;
    const globeZoom=Math.min(3,Math.max(0.4,Math.log2(diameter*Math.PI/512)));
    map.flyTo({center:[-72,36],zoom:globeZoom,offset:expanded?[0,-90]:[0,-40],duration:700});
  }
  return <div className={styles.layer} data-company-location-map="" data-map-zoom={zoom.toFixed(1)}>
    <div className={styles.toolbar}>
      <label><span className="sr-only">Find a company or city</span><input value={query} onChange={e=>{setQuery(e.target.value);setSelected(null);setSelectedCompany(null);setLimit(24);}} placeholder="Find a company or city" /></label>
      <label><span className="sr-only">Go to HQ city</span><select value={selectedCity?.id??""} onChange={e=>focusCity(e.target.value)}><option value="">Go to city</option>{cities.map(c=><option key={c.id} value={c.id}>{c.city} ({c.companies.length.toLocaleString("en-US")})</option>)}</select></label>
      <button className={styles.mobileExplore} disabled={!map || !data} onClick={()=>onExpand(true)}>{data ? `Explore ${mapped.toLocaleString("en-US")} mapped startup HQs ↗` : "Loading HQ locations…"}</button>
    </div>
    <div className={styles.zoom} aria-label="Map controls">
      <button aria-label="Zoom in" disabled={!map||zoom>=17} onClick={()=>map?.zoomIn()}>+</button>
      <button aria-label="Zoom out" disabled={!map||zoom<=0.35} onClick={()=>map?.zoomOut()}>−</button>
      <button aria-label="Reset globe view" disabled={!map} onClick={resetView}>◎</button>
      <button aria-label={rotationEnabled?"Pause globe rotation":"Start globe rotation"} aria-pressed={rotationEnabled} onClick={()=>onRotationChange(!rotationEnabled)}>{rotationEnabled?"Ⅱ":"↻"}</button>
      <button aria-label={expanded?"Exit expanded map":"Expand map"} onClick={()=>onExpand(!expanded)}>{expanded?"×":"⤢"}</button>
    </div>
    <section className={styles.results} aria-label="Startups on the map">
      <div className={styles.resultHeading}><div><h3>{selectedCity?selectedCity.city:query.trim()?"Search results":"Current view"} <strong>{shown.length.toLocaleString("en-US")}</strong> startups</h3><p>Numbers group recorded HQ cities. Named pins use sourced business addresses.</p></div><button aria-expanded={!collapsed} aria-label={collapsed?"Show startups in view":"Collapse startups in view"} onClick={()=>setCollapsed(v=>!v)}>{collapsed?"Show":"Hide"}</button></div>
      {focused && point && <div className={styles.locationDetail} data-company-location-detail="">
        <div><strong>{focused.name}</strong><button aria-label="Close location details" onClick={()=>setSelectedCompany(null)}>×</button></div>
        <p>{focused.office ? focused.office.address : `${selectedCity?.city}: city center only. Office address not on record.`}</p>
        <p className={styles.coordinates}>{coordinateLabel}</p>
        <p>{focused.office ? "Address point from city records; not a surveyed office entrance." : "These are city coordinates, not this company's office coordinates."}</p>
        <nav aria-label="Location evidence"><a href={focused.office?.sourceUrl??focused.sourceUrl} target="_blank" rel="noopener noreferrer">{focused.office?"Business address source":"HQ city source"} ↗</a><a href={focused.office?.coordinateSource??selectedCity?.coordinateSource} target="_blank" rel="noopener noreferrer">Coordinate source ↗</a><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${point[1]},${point[0]}`)}`} target="_blank" rel="noopener noreferrer">Open map ↗</a></nav>
      </div>}
      {!collapsed && <>
        {failed ? <p>Locations unavailable. <button onClick={()=>{setFailed(false);setAttempt(v=>v+1);}}>Retry</button></p> : !data || !companies.length ? <p>Loading recorded HQ locations…</p> : shown.length ? <ul className={styles.companyList}>{shown.slice(0,limit).map(co=><li key={co.id}><Link href={`/startup/${encodeURIComponent(co.id)}`}>{co.name}</Link><span>{co.office?"Business address":"City only"} · {co.city}</span><button aria-label={`Show ${co.name} location`} onClick={()=>focusCompany(co.id,co.cityId)}>Locate ↗</button><a href={co.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={`HQ source for ${co.name}`}>Source ↗</a></li>)}{shown.length>limit?<li><button onClick={()=>setLimit(n=>n+24)}>Load {Math.min(24,shown.length-limit)} more</button></li>:null}</ul> : <p>{query?"No matching HQ locations in view. Try another city or clear the search.":"No recorded HQ locations in view. Zoom out or choose a city."}</p>}
        <div className={styles.coverage}><span>{mapped.toLocaleString("en-US")} mapped in this filter{data?` · ${addressMapped.toLocaleString("en-US")} with a sourced business address · ${data.unmapped.toLocaleString("en-US")} dataset HQs unmapped`:""}</span>{query?<button onClick={()=>setQuery("")}>Clear search</button>:null}{selectedCity?<button onClick={()=>{setSelected(null);setSelectedCompany(null);}}>Follow map view</button>:null}<a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer">City centers: GeoNames</a></div>
      </>}
    </section>
  </div>;
}
