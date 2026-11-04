import assert from "node:assert/strict";
import { getDb } from "../db/client";
import { buildNetworkAtlas } from "./network-atlas-data";
import { atlasLayout, safeAtlasUrl } from "./network-atlas";

const data = buildNetworkAtlas();
const db = getDb();
const expectedCompanies = db.prepare("SELECT id FROM projects WHERE kind='company'").all() as {id:string}[];
const expectedFounders = db.prepare("SELECT id FROM people WHERE founder_status IN ('founder','confirmed')").all() as {id:string}[];
const ids = new Set(data.nodes.map(n=>n.id));
assert.equal(ids.size,data.nodes.length,"Each stored record gets exactly one tile");
for(const r of [...expectedCompanies,...expectedFounders]) assert.ok(ids.has(r.id),`Record omitted: ${r.id}`);
for(const n of data.nodes) {
  for(const p of n.places.filter(p=>p.campus)) assert.notEqual(p.country,"Location not yet verified",`Missing campus country: ${p.campus}`);
  for(const link of n.links) assert.ok(safeAtlasUrl(link.url));
}
for(const g of data.groups) {
  assert.equal(new Set(g.members).size,g.members.length);
  for(const i of g.members)assert.ok(data.nodes[i],`Dangling membership ${g.id}`);
}
for(const edge of data.companies)assert.ok(edge.every(i=>data.nodes[i]));
const positions=atlasLayout(data.nodes);
assert.equal(positions.length,data.nodes.length);
for(const p of positions)assert.ok([p.x,p.y,p.z].every(Number.isFinite));
assert.deepEqual(atlasLayout(data.nodes),positions,"Layout must remain stable across color changes and reloads");
assert.deepEqual(atlasLayout([]),[]);
assert.equal(safeAtlasUrl('javascript:alert(1)'),null);
assert.equal(safeAtlasUrl('data:text/html,bad'),null);
console.log(JSON.stringify({records:data.nodes.length,founders:data.nodes.filter(n=>n.kind==='founder').length,startups:expectedCompanies.length,networks:data.groups.length,campuses:new Set(data.nodes.flatMap(n=>n.places.filter(p=>p.campus).map(p=>p.campus))).size,withoutLocation:data.nodes.filter(n=>!n.places.length).length},null,2));
