import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getDb } from "../db/client";
import { buildNetworkAtlas } from "./network-atlas-data";
import { atlasLayout, atlasConnectors, anchorAtlasSelection, atlasSummary, safeAtlasUrl } from "./network-atlas";

// Guard the integration: a mobile merge previously restored the legacy graph
// while all atlas data tests still passed for an unused component.
const networkPage = readFileSync("components/networks-app.tsx", "utf8");
assert.match(networkPage, /<NetworkAtlas\s*\/>/, "Networks must mount the full-record atlas");
assert.doesNotMatch(networkPage, /<NetworksGraph\b/, "Legacy graph must not replace the atlas");

const data = buildNetworkAtlas();
const connectorFixture = { nodes: [{id:"a",name:"A",kind:"founder" as const,places:[],links:[]},{id:"b",name:"B",kind:"startup" as const,places:[],links:[]}], groups:[{id:"g1",name:"One",kind:"club",members:[0,0]},{id:"g2",name:"Two",kind:"program",members:[0]}], companies:[[0,1],[0,1]] as [number,number][],generatedAt:"" };
assert.deepEqual(atlasConnectors(connectorFixture),[{i:0,id:"a",affiliations:2,direct:1,score:3,networkTypes:2,campuses:0}],"Duplicate records must not inflate superconnector counts");
const moving = [{x:900,y:-600},{x:930,y:-580}];
const anchored = anchorAtlasSelection(moving,0,1000,640);
assert.deepEqual(anchored[0],{x:320,y:288});
assert.equal(anchored[1].x-anchored[0].x,30,"Anchoring must preserve relative connections");
assert.deepEqual(anchorAtlasSelection(moving,0,375,480)[0],{x:187.5,y:42});
assert.equal(anchorAtlasSelection(moving,null,1000,640),moving);
assert.equal(atlasSummary("A treatment recommendation tool.Albert Katz; Will Hu"),"A treatment recommendation tool.");
assert.equal(atlasConnectors({...connectorFixture,groups:connectorFixture.groups.slice(0,1)}).length,0,"One large accelerator alone does not make a superconnector");
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
