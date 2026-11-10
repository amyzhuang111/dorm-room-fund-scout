'use client';
import { useState } from 'react';
import type { TileCampus } from './tile-globe';

/** Orthographic coordinates keep the map useful when WebGL or remote tiles fail. */
export function CampusGlobeFallback({campuses,onSelect,selectedId,highlightCampusIds}:{campuses:TileCampus[];onSelect:(id:string)=>void;selectedId?:string|null;highlightCampusIds?:Set<string>|null}) {
  const [longitude,setLongitude]=useState(-72);
  const rad=Math.PI/180, latitude=25*rad;
  function project(lon:number,lat:number){const p=lat*rad,l=(lon-longitude)*rad;return {x:300+245*Math.cos(p)*Math.sin(l),y:280-245*(Math.cos(latitude)*Math.sin(p)-Math.sin(latitude)*Math.cos(p)*Math.cos(l)),visible:Math.sin(latitude)*Math.sin(p)+Math.cos(latitude)*Math.cos(p)*Math.cos(l)>0};}
  const paths:string[]=[];
  for(let lat=-60;lat<=60;lat+=30){let d='';let pen=false;for(let lon=-180;lon<=180;lon+=3){const p=project(lon,lat);if(p.visible){d+=`${pen?'L':'M'}${p.x.toFixed(1)},${p.y.toFixed(1)} `;pen=true;}else pen=false;}paths.push(d);}
  for(let lon=-180;lon<180;lon+=30){let d='';let pen=false;for(let lat=-90;lat<=90;lat+=3){const p=project(lon,lat);if(p.visible){d+=`${pen?'L':'M'}${p.x.toFixed(1)},${p.y.toFixed(1)} `;pen=true;}else pen=false;}paths.push(d);}
  return <div className="relative flex h-full w-full flex-col items-center justify-center bg-white" aria-label="Simplified campus globe">
    <svg viewBox="0 0 600 570" className="h-[85%] w-full max-w-[800px]" aria-label="Campus coordinates on a simplified globe">
      <circle cx="300" cy="280" r="245" fill="#f8faff" stroke="#c8d5f4" strokeWidth="1.5" />
      {paths.map((d,i)=><path key={i} d={d} fill="none" stroke="#dbe4f7" strokeWidth=".8" />)}
      {campuses.map(c=>{const p=project(c.lon,c.lat);if(!p.visible)return null;return <g key={c.id} role="button" tabIndex={0} aria-label={`${c.name}, ${c.founders.toLocaleString('en-US')} founders`} onClick={()=>onSelect(c.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(c.id);}}} style={{cursor:'pointer'}} opacity={highlightCampusIds&&!highlightCampusIds.has(c.id)?.18:1}><title>{c.name}</title><circle cx={p.x} cy={p.y} r={selectedId===c.id?8:4} fill={selectedId===c.id?'#1639bc':'#4269de'} stroke="white" strokeWidth="1" />{selectedId===c.id&&<text x={p.x+12} y={p.y+4} fontSize="11" fill="#2446ad">{c.name}</text>}</g>;})}
    </svg>
    <div className="absolute bottom-9 flex items-center gap-3 rounded-lg border border-blue-100 bg-white px-3 py-1 text-[10px] text-blue-700"><button type="button" aria-label="Rotate simplified globe west" className="min-h-9 min-w-9" onClick={()=>setLongitude(v=>v-40)}>←</button><span>Simplified globe · map tiles unavailable</span><button type="button" aria-label="Rotate simplified globe east" className="min-h-9 min-w-9" onClick={()=>setLongitude(v=>v+40)}>→</button></div>
  </div>;
}
