"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { GeoJSONSource, Map as LibreMap, MapLayerMouseEvent } from "maplibre-gl";
import type { FeatureCollection, Point } from "geojson";
import type { CompanyCity, CompanyLocations } from "@/lib/domain/company-locations";
import { preferLogoCompanies, type FacetCompany } from "@/lib/domain/sample-facets";
import { officeMapPoints } from "@/lib/client/office-map-points";
import { LogoMark } from "@/components/sample-instrument";
import styles from "./company-location-map.module.css";

const sourceId = "company-hq-cities";
const layerIds = ["company-city-dots", "company-city-counts", "company-city-labels"];
const officeSourceId = "company-office-points";
const officeLayerIds = ["company-office-dots", "company-office-labels"];
type CityView = Omit<CompanyCity, "companies"> & { companies: (CompanyCity["companies"][number] & { name: string; sector?: string | null; logoUrl?: string | null; school?: string | null; schoolId?: string | null })[] };
type HoverCard = { x: number; y: number; name: string; logoUrl?: string | null; school?: string | null; sector?: string | null; city: string; companyId?: string; count?: number };

/** City totals belong to the overview, never to a building on the street map. */
const streetZoom = 10;
function frameCity(map: LibreMap, city: CityView) {
  const points = city.companies.flatMap(co => co.office ? [co.office.coordinates] : []);
  if (!points.length) {
    map.flyTo({center:city.coordinates,zoom:8.5,duration:700});
    return;
  }
  const {height} = map.getContainer().getBoundingClientRect();
  map.fitBounds([
    [Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1]))],
    [Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))],
  ], {padding:{top:innerWidth<640?150:70,bottom:Math.min(height*0.5,350),left:36,right:60},maxZoom:14,duration:700});
}

export function CompanyLocationLayer({ map, enabled, companies, highlightCampusIds, expanded, onExpand, rotationEnabled, onRotationChange }: { map: LibreMap | null; enabled: boolean; companies: FacetCompany[]; highlightCampusIds?: Set<string> | null; expanded: boolean; onExpand: (value:boolean)=>void; rotationEnabled: boolean; onRotationChange: (value:boolean)=>void }) {
  const [data, setData] = useState<CompanyLocations | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [hover, setHover] = useState<HoverCard | null>(null);
  const [visible, setVisible] = useState<string[]>([]);
  const [limit, setLimit] = useState(24);
  const [collapsed, setCollapsed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [onlyAddresses, setOnlyAddresses] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/company-locations.json", {signal: controller.signal}).then(async (r) => {
      if (r.ok) return r.json();
      const fallback = await fetch("/api/company-locations", {signal: controller.signal});
      if (!fallback.ok) throw new Error("Locations unavailable");
      return fallback.json();
    })
      .then((payload: CompanyLocations) => { setData(payload); setFailed(false); }).catch(e => { if (e.name !== "AbortError") setFailed(true); });
    return () => controller.abort();
  }, [attempt]);
  const cities = useMemo<CityView[]>(() => {
    const cards = new Map(companies.filter(c => highlightCampusIds == null || (c.schoolId && highlightCampusIds.has(c.schoolId))).map(c => [c.id,c]));
    const text = query.trim().toLocaleLowerCase("en-US");
    return (data?.cities ?? []).map(city => ({ ...city, companies: city.companies.flatMap(co => {
      const card = cards.get(co.id);
      if (!card || (text && ![card.name, city.city, co.hq, co.office?.address, card.school, card.sector, ...(card.founders ?? [])].filter(Boolean).join(" ").toLocaleLowerCase("en-US").includes(text))) return [];
      return [{ ...co, name: card.name, sector: card.sector, logoUrl: card.logoUrl ?? null, school: card.school ?? null, schoolId: card.schoolId ?? null }];
    }).sort((a,b) => Number(Boolean(b.office))-Number(Boolean(a.office)) || a.name.localeCompare(b.name,"en-US")) })).filter(c => c.companies.length);
  }, [companies, data, highlightCampusIds, query]);
  const geo = useMemo<FeatureCollection<Point>>(() => ({type:"FeatureCollection",features:cities.map(c => ({type:"Feature",geometry:{type:"Point",coordinates:c.coordinates},properties:{id:c.id,name:c.city,count:c.companies.length,countLabel:c.companies.length.toLocaleString("en-US")}}))}), [cities]);
  const officeGeo = useMemo(() => officeMapPoints(cities), [cities]);

  useEffect(() => {
    if (!map) return;
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {type:"geojson", data:geo,cluster:true,clusterRadius:44,clusterMaxZoom:5,clusterProperties:{companiesTotal:["+",["get","count"]]}});
      map.addLayer({id:layerIds[0],type:"circle",source:sourceId,maxzoom:streetZoom,paint:{"circle-color":"#2F4FD8","circle-opacity":0.98,"circle-radius":["interpolate",["linear"],["coalesce",["get","companiesTotal"],["get","count"]],1,10,10,15,100,21,700,29],"circle-stroke-color":"#FFFFFF","circle-stroke-width":2}});
      map.addLayer({id:layerIds[1],type:"symbol",source:sourceId,maxzoom:streetZoom,layout:{"text-field":["number-format",["coalesce",["get","companiesTotal"],["get","count"]],{"locale":"en-US","max-fraction-digits":0}],"text-font":["Noto Sans Bold"],"text-size":12,"text-allow-overlap":false,"text-ignore-placement":false},paint:{"text-color":"#FFFFFF"}});
      map.addLayer({id:layerIds[2],type:"symbol",source:sourceId,minzoom:3,maxzoom:streetZoom,layout:{"text-field":["concat",["get","name"]," · city total"],"text-font":["Noto Sans Regular"],"text-size":12,"text-anchor":"top","text-offset":[0,2.4],"text-allow-overlap":false},paint:{"text-color":"#2F4FD8","text-halo-color":"#FFFFFF","text-halo-width":2}});
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
    const update = () => {
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
      if (city) {setSelected(id);setSelectedCompany(null);setOnlyAddresses(true);setLimit(24);setCollapsed(false);onExpand(true);frameCity(map,city);}
    };
    const chooseOffice = (event:MapLayerMouseEvent) => {
      if(!enabled)return;
      const ids: string[] = JSON.parse(event.features?.[0]?.properties.companyIds ?? "[]");
      const id=ids[0];
      const city=cities.find(c=>c.companies.some(co=>co.id===id));
      const office=city?.companies.find(co=>co.id===id)?.office;
      if(city && office){setSelected(city.id);setSelectedCompany(id);setCollapsed(innerWidth<640);onExpand(true);map.flyTo({center:office.coordinates,zoom:16,offset:[0,-70],duration:700});}
    };
    map.on("click",layerIds[0],choose);
    map.on("click",officeLayerIds[0],chooseOffice);
    const enter=()=>{if(enabled)map.getCanvas().style.cursor="pointer";};
    const leave=()=>{map.getCanvas().style.cursor="";};
    map.on("mouseenter",layerIds[0],enter);map.on("mouseleave",layerIds[0],leave);
    map.on("mouseenter",officeLayerIds[0],enter);map.on("mouseleave",officeLayerIds[0],leave);
    const hoverCity = (event: MapLayerMouseEvent) => {
      if (!enabled) return;
      const feature = event.features?.[0];
      if (!feature || feature.properties?.cluster) { setHover(null); return; }
      const id = String(feature.properties?.id ?? "");
      const city = cities.find((c) => c.id === id);
      if (!city) { setHover(null); return; }
      const top = city.companies[0];
      setHover({
        x: event.point.x,
        y: event.point.y,
        name: top?.name ?? city.city,
        logoUrl: top?.logoUrl,
        school: top?.school,
        sector: top?.sector,
        city: city.city,
        companyId: top?.id,
        count: city.companies.length,
      });
    };
    const hoverOffice = (event: MapLayerMouseEvent) => {
      if (!enabled) return;
      const ids: string[] = JSON.parse(event.features?.[0]?.properties.companyIds ?? "[]");
      const id = ids[0];
      const city = cities.find((c) => c.companies.some((co) => co.id === id));
      const co = city?.companies.find((c) => c.id === id);
      if (!city || !co) { setHover(null); return; }
      setHover({
        x: event.point.x,
        y: event.point.y,
        name: co.name,
        logoUrl: co.logoUrl,
        school: co.school,
        sector: co.sector,
        city: city.city,
        companyId: co.id,
        count: 1,
      });
    };
    const clearHover = () => setHover(null);
    map.on("mousemove", layerIds[0], hoverCity);
    map.on("mousemove", officeLayerIds[0], hoverOffice);
    map.on("mouseleave", layerIds[0], clearHover);
    map.on("mouseleave", officeLayerIds[0], clearHover);
    return () => {
      map.off("moveend",update);
      map.off("click",layerIds[0],choose);
      map.off("click",officeLayerIds[0],chooseOffice);
      map.off("mouseenter",layerIds[0],enter);
      map.off("mouseleave",layerIds[0],leave);
      map.off("mouseenter",officeLayerIds[0],enter);
      map.off("mouseleave",officeLayerIds[0],leave);
      map.off("mousemove", layerIds[0], hoverCity);
      map.off("mousemove", officeLayerIds[0], hoverOffice);
      map.off("mouseleave", layerIds[0], clearHover);
      map.off("mouseleave", officeLayerIds[0], clearHover);
      setHover(null);
    };
  }, [map,geo,officeGeo,cities,enabled,onExpand]);

  if (!enabled) return null;
  const selectedCity=cities.find(c=>c.id===selected);
  const inView=cities.filter(c=>visible.includes(c.id));
  const shownCities=selectedCity?[selectedCity]:query.trim()?cities:inView;
  const allShown=shownCities.flatMap(city=>city.companies.map(co=>({...co,city:city.city,cityId:city.id})));
  const addressShown=allShown.filter(co=>co.office);
  const shown=onlyAddresses?addressShown:allShown;
  const mapped=cities.reduce((n,c)=>n+c.companies.length,0);
  const addressMapped=cities.reduce((n,c)=>n+c.companies.filter(co=>co.office).length,0);
  const focused=selectedCity?.companies.find(co=>co.id===selectedCompany);
  const point=focused?.office?.coordinates;
  const buildingCompanies=point ? selectedCity?.companies.filter(co=>co.office?.coordinates[0]===point[0] && co.office?.coordinates[1]===point[1]) ?? [] : [];
  const coordinateLabel=point ? `${Math.abs(point[1]).toFixed(5)}° ${point[1]>=0?"N":"S"}, ${Math.abs(point[0]).toFixed(5)}° ${point[0]>=0?"E":"W"}` : "";
  function focusCity(id:string) {
    const city=cities.find(c=>c.id===id);
    setSelected(city?.id??null);setSelectedCompany(null);setOnlyAddresses(true);setLimit(24);setCollapsed(false);
    if(city&&map){onExpand(true);frameCity(map,city);}
  }
  function focusCompany(id:string,cityId:string){
    const city=cities.find(c=>c.id===cityId), co=city?.companies.find(c=>c.id===id);
    if(!city||!co)return;
    setSelected(city.id);setSelectedCompany(id);setCollapsed(innerWidth<640);onExpand(true);
    if(co.office)map?.flyTo({center:co.office.coordinates,zoom:16,offset:[0,-70],duration:700});
    else map?.flyTo({center:city.coordinates,zoom:8.5,duration:700});
  }
  function resetView() {
    setSelected(null);setSelectedCompany(null);
    if (!map) return;
    const {width,height}=map.getContainer().getBoundingClientRect();
    const diameter=Math.min(width,Math.max(160,height-(expanded?300:160)))*0.9;
    const globeZoom=Math.min(3,Math.max(0.4,Math.log2(diameter*Math.PI/512)));
    map.flyTo({center:[-72,36],zoom:globeZoom,offset:expanded?[0,-90]:[0,-40],duration:700});
  }
  const dockItems = preferLogoCompanies(shown).slice(0, 28);
  const peekItems = preferLogoCompanies(allShown).slice(0, 16);

  return <div className={styles.layer} data-company-location-map="" data-map-zoom={zoom.toFixed(1)}>
    <div className={styles.toolbar}>
      <label><span className="sr-only">Find a company or city</span><input value={query} onChange={e=>{setQuery(e.target.value);setSelected(null);setSelectedCompany(null);setOnlyAddresses(false);setCollapsed(false);setLimit(24);}} placeholder="Find a company or city" /></label>
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
    {hover ? (
      <div
        className={styles.hoverCard}
        style={{ left: Math.min(hover.x + 14, (typeof window !== "undefined" ? window.innerWidth : 390) - 220), top: Math.max(8, hover.y - 72) }}
        data-fold-hq-hover=""
        role="status"
      >
        <LogoMark name={hover.name} logoUrl={hover.logoUrl ?? null} size={28} />
        <div className={styles.hoverBody}>
          <p className={styles.hoverName}>{hover.name}</p>
          <p className={styles.hoverMeta}>
            {hover.school ? hover.school : hover.city}
            {hover.sector ? ` · ${hover.sector}` : ""}
            {hover.count && hover.count > 1 ? ` · ${hover.count.toLocaleString("en-US")} in city` : ""}
          </p>
          {hover.companyId ? (
            <Link href={`/startup/${encodeURIComponent(hover.companyId)}?from=map`} className={styles.hoverLink}>Open record</Link>
          ) : null}
        </div>
      </div>
    ) : null}
    {!expanded && peekItems.length > 0 ? (
      <aside className={styles.logoPeek} aria-label="Current view logos" data-map-logo-peek="">
        <div className={styles.logoPeekHead}>
          <p>Current view <strong>{allShown.length.toLocaleString("en-US")}</strong></p>
          <button type="button" onClick={() => onExpand(true)}>Open sheet</button>
        </div>
        <div className={styles.logoDock} data-map-logo-dock="peek">
          {peekItems.map((co) => (
            <button
              key={co.id}
              type="button"
              className={styles.logoChip}
              title={co.name}
              onClick={() => { focusCompany(co.id, co.cityId); }}
            >
              <LogoMark name={co.name} logoUrl={co.logoUrl ?? null} size={22} />
              <span>{co.name}</span>
            </button>
          ))}
        </div>
      </aside>
    ) : null}
    <section className={styles.results} aria-label="Startups on the map">
      <div className={styles.resultHeading}><div><h3>{selectedCity?selectedCity.city:query.trim()?"Search results":"Current view"} <strong>{allShown.length.toLocaleString("en-US")}</strong> startups</h3><p>{addressShown.length.toLocaleString("en-US")} sourced address pins · {(allShown.length-addressShown.length).toLocaleString("en-US")} city only. {zoom>=streetZoom?"Street view shows address pins only.":"Numbered circles are city totals."}</p>
        <nav className={styles.dbCta} aria-label="Open the full database">
          <Link href="/companies">Full database</Link>
          <Link href="/data">Data table</Link>
          <Link href="/networks">Networks</Link>
        </nav>
      </div><button aria-expanded={!collapsed} aria-label={collapsed?"Show startups in view":"Collapse startups in view"} onClick={()=>setCollapsed(v=>!v)}>{collapsed?"Show":"Hide"}</button></div>
      {focused && <div className={styles.locationDetail} data-company-location-detail="">
        <div><strong>{focused.name}</strong><button aria-label="Close location details" onClick={()=>setSelectedCompany(null)}>×</button></div>
        {buildingCompanies.length>1 && <div className={styles.buildingCompanies} role="group" aria-label="Companies at this building"><span>At this building:</span>{buildingCompanies.map(co=><button key={co.id} aria-pressed={co.id===focused.id} onClick={()=>setSelectedCompany(co.id)}>{co.name}</button>)}</div>}
        <p>{focused.office ? focused.office.address : `Recorded HQ city: ${selectedCity?.city}. Exact business address not verified.`}</p>
        {point && <p className={styles.coordinates}>{coordinateLabel}</p>}
        {focused.office && <p>Address reviewed <time dateTime={focused.office.checkedAt}>{new Date(`${focused.office.checkedAt}T00:00:00Z`).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"})}</time></p>}
        <p>{focused.office ? "Published business address matched to city records. Building point, not a surveyed office entrance." : "No company pin is placed until its business address is sourced."}</p>
        <nav aria-label="Location evidence"><a href={focused.office?.sourceUrl??focused.sourceUrl} target="_blank" rel="noopener noreferrer">{focused.office?"Business address source":"HQ city source"} ↗</a>{point && <><a href={focused.office?.coordinateSource} target="_blank" rel="noopener noreferrer">Coordinate source ↗</a><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${point[1]},${point[0]}`)}`} target="_blank" rel="noopener noreferrer">Open Google Maps ↗</a></>}{!point && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${focused.name} ${selectedCity?.city}`)}`} target="_blank" rel="noopener noreferrer">Search Google Maps ↗</a>}</nav>
      </div>}
      {!collapsed && <>
        <div className={styles.resultFilters} aria-label="Location precision">
          <button aria-pressed={onlyAddresses} onClick={()=>{setOnlyAddresses(true);setLimit(24);}}>Address pins ({addressShown.length.toLocaleString("en-US")})</button>
          <button aria-pressed={!onlyAddresses} onClick={()=>{setOnlyAddresses(false);setLimit(24);}}>All companies ({allShown.length.toLocaleString("en-US")})</button>
        </div>
        {dockItems.length > 0 ? (
          <div className={styles.logoDock} data-map-logo-dock="sheet" aria-label="Logos in current view">
            {dockItems.map((co) => (
              <button
                key={`dock-${co.id}`}
                type="button"
                className={styles.logoChip}
                title={co.name}
                aria-pressed={selectedCompany === co.id}
                onClick={() => focusCompany(co.id, co.cityId)}
              >
                <LogoMark name={co.name} logoUrl={co.logoUrl ?? null} size={24} />
                <span>{co.name}</span>
              </button>
            ))}
          </div>
        ) : null}
        {failed ? <p>Locations unavailable. <button onClick={()=>{setFailed(false);setAttempt(v=>v+1);}}>Retry</button></p> : !data || !companies.length ? <p>Loading recorded HQ locations…</p> : shown.length ? <ul className={styles.companyList}>{shown.slice(0,limit).map(co=><li key={co.id} data-company-location-card={co.id} data-location-precision={co.office?"address":"city"}><div className={styles.cardTitle}><LogoMark name={co.name} logoUrl={co.logoUrl ?? null} size={18} /><Link href={`/startup/${encodeURIComponent(co.id)}`}>{co.name}</Link></div><span>{co.office?co.office.address:`City only · ${co.city}`}</span><button aria-label={co.office?`Show ${co.name} coordinates`:`View ${co.name} city`} onClick={()=>focusCompany(co.id,co.cityId)}>{co.office?"Coordinates ↗":"View city ↗"}</button><a href={co.office?.sourceUrl??co.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={`${co.office?"Business address":"HQ city"} source for ${co.name}`}>Source ↗</a></li>)}{shown.length>limit?<li><button onClick={()=>setLimit(n=>n+24)}>Load {Math.min(24,shown.length-limit)} more</button></li>:null}</ul> : <p>{onlyAddresses?"No sourced business address pins in this view. Choose All companies to see recorded HQ cities.":query?"No matching HQ locations. Try another city or clear the search.":"No recorded HQ locations in view. Zoom out or choose a city."}</p>}
        <div className={styles.coverage}><span>{mapped.toLocaleString("en-US")} mapped in this filter{data?` · ${addressMapped.toLocaleString("en-US")} with a sourced business address · ${data.unmapped.toLocaleString("en-US")} dataset HQs unmapped`:""}</span>{query?<button onClick={()=>setQuery("")}>Clear search</button>:null}{selectedCity?<button onClick={()=>{setSelected(null);setSelectedCompany(null);}}>Follow map view</button>:null}<a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer">City centers: GeoNames</a></div>
      </>}
    </section>
  </div>;
}
