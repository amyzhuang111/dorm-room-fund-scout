/**
 * Nature-map poster graph: every founder + company, campus-colored clusters,
 * force-packed layout, compact JSON (≤210 KiB) + separate deals file.
 */
import fs from "fs";
import path from "path";
import { forceSimulation, forceManyBody, forceCollide, forceX, forceY, forceLink } from "d3-force";
import { loadFounderNetworkLinks, buildFounderNetworksPage } from "../lib/domain/founder-networks";
import { assignFounderNetworkCampusColors } from "../components/network-style";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "public/data/founder-networks-poster.json");
const OUT_DEALS = path.join(ROOT, "public/data/founder-networks-deals.json");

type SimNode = {
  id: string;
  kind: 0 | 1 | 2; // founder, company, hub
  campus: number; // -1 hub
  deg: number;
  r: number;
  x: number;
  y: number;
  hubId?: string;
  label?: string;
  fx?: number | null;
  fy?: number | null;
};

const { links, meta } = loadFounderNetworkLinks();
const page = buildFounderNetworksPage();

const founderIds = [...new Set(links.map((l) => l.founderId))];
const companyIds = [...new Set(links.map((l) => l.companyId))];

// Campus table (founders with unknown campus → "other")
const campusCount = new Map<string, number>();
const founderCampusId = new Map<string, string>();
for (const fid of founderIds) {
  const campuses = meta.founderCampuses.get(fid) ?? [];
  const cid = campuses[0] ?? "other";
  founderCampusId.set(fid, cid);
  campusCount.set(cid, (campusCount.get(cid) ?? 0) + 1);
}
const campusIds = [...campusCount.entries()]
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .map(([id]) => id);
const campusIndex = new Map(campusIds.map((id, i) => [id, i]));
const colorMap = assignFounderNetworkCampusColors(
  campusIds.filter((id) => id !== "other").map((id) => ({ id, label: meta.uniLabels.get(id) ?? id })),
);
const campuses = campusIds.map((id) => ({
  id,
  label: id === "other" ? "Other" : shortCampus(meta.uniLabels.get(id) ?? id),
  color: id === "other" ? "#94a3b8" : colorMap.get(id) ?? "#94a3b8",
  n: campusCount.get(id) ?? 0,
}));

function shortCampus(label: string): string {
  return label
    .replace(/^University of /i, "")
    .replace(/ University$/i, "")
    .replace(/^The /i, "")
    .replace("Massachusetts Institute of Technology", "MIT")
    .replace("California, Berkeley", "Berkeley")
    .replace("Pennsylvania", "Penn")
    .slice(0, 18);
}

// Degrees
const founderDeg = new Map<string, number>();
const companyDeg = new Map<string, number>();
const hubDeg = new Map<string, number>();
for (const l of links) {
  founderDeg.set(l.founderId, (founderDeg.get(l.founderId) ?? 0) + 1);
  companyDeg.set(l.companyId, (companyDeg.get(l.companyId) ?? 0) + 1);
  hubDeg.set(l.networkId, (hubDeg.get(l.networkId) ?? 0) + 1);
}

// Company primary campus = mode of its founders
const companyCampusId = new Map<string, string>();
for (const cid of companyIds) {
  const fos = [...(meta.companyFounders.get(cid) ?? [])];
  const tally = new Map<string, number>();
  for (const f of fos) {
    const c = founderCampusId.get(f) ?? "other";
    tally.set(c, (tally.get(c) ?? 0) + 1);
  }
  let best = "other";
  let bestN = -1;
  for (const [k, n] of tally) {
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  companyCampusId.set(cid, best);
}

// Top hubs for dark nodes (programs + investors with enough reach)
const hubDefs = [
  ...page.topNetworks.filter((n) => n.kind !== "investor").slice(0, 16),
  ...page.investorHubs.slice(0, 8),
];
const hubSeen = new Set<string>();
const hubs = hubDefs.filter((h) => {
  if (hubSeen.has(h.id)) return false;
  hubSeen.add(h.id);
  return true;
});

// Campus centroids in overlapping organic ring (Nature-like)
const nCamp = Math.max(1, campuses.length);
const nodes: SimNode[] = [];
const indexOf = new Map<string, number>();

for (let i = 0; i < campuses.length; i++) {
  // skip placing campus marker nodes — founders fill the cloud
}

function campusXY(ci: number): { x: number; y: number } {
  // Organic blob: golden-angle spiral with jitter so clusters touch
  const t = (ci + 0.35) / Math.max(1, nCamp - 0.2);
  const ang = t * Math.PI * 2 * 0.85 - Math.PI * 0.55;
  const rad = 220 + (ci % 3) * 28 + (ci > 6 ? 40 : 0);
  return { x: Math.cos(ang) * rad * 1.15, y: Math.sin(ang) * rad * 0.92 };
}

for (const fid of founderIds) {
  const cid = founderCampusId.get(fid) ?? "other";
  const ci = campusIndex.get(cid) ?? campusIndex.get("other") ?? 0;
  const home = campusXY(ci);
  const deg = founderDeg.get(fid) ?? 1;
  const r = Math.max(1.1, Math.min(4.8, 1.0 + Math.sqrt(deg) * 0.85));
  const jitter = 55 + Math.sqrt(campusCount.get(cid) ?? 1) * 3.2;
  const id = `fo:${fid}`;
  indexOf.set(id, nodes.length);
  nodes.push({
    id,
    kind: 0,
    campus: ci,
    deg,
    r,
    x: home.x + (hash(fid) - 0.5) * jitter * 2.2,
    y: home.y + (hash(fid + "y") - 0.5) * jitter * 2.0,
  });
}

for (const cid of companyIds) {
  const camp = companyCampusId.get(cid) ?? "other";
  const ci = campusIndex.get(camp) ?? 0;
  const home = campusXY(ci);
  const deg = companyDeg.get(cid) ?? 1;
  const r = Math.max(0.9, Math.min(3.6, 0.85 + Math.sqrt(deg) * 0.7));
  const id = `co:${cid}`;
  indexOf.set(id, nodes.length);
  nodes.push({
    id,
    kind: 1,
    campus: ci,
    deg,
    r,
    x: home.x + (hash(cid) - 0.5) * 90,
    y: home.y + (hash(cid + "y") - 0.5) * 80,
  });
}

for (const hub of hubs) {
  // Place hub at mean of its linked founders
  const fos = links.filter((l) => l.networkId === hub.id).map((l) => l.founderId);
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const f of fos.slice(0, 400)) {
    const ix = indexOf.get(`fo:${f}`);
    if (ix == null) continue;
    sx += nodes[ix].x;
    sy += nodes[ix].y;
    n += 1;
  }
  const deg = hub.founderCount || hubDeg.get(hub.id) || 1;
  const r = Math.max(4.5, Math.min(14, 3.5 + Math.sqrt(deg) * 0.22));
  const id = `net:${hub.id}`;
  indexOf.set(id, nodes.length);
  nodes.push({
    id,
    kind: 2,
    campus: -1,
    deg,
    r,
    x: n ? sx / n : 0,
    y: n ? sy / n : 0,
    hubId: hub.id,
    label: hub.label,
  });
}

// Edges for layout + draw: founder-company + hub-founder (sampled for YC) + cofounder
type E = { s: number; t: number; k: number }; // k: 0 fo-co, 1 hub-fo, 2 cofounder
const edges: E[] = [];
const edgeSeen = new Set<string>();
function addEdge(a: string, b: string, k: number) {
  const ia = indexOf.get(a);
  const ib = indexOf.get(b);
  if (ia == null || ib == null) return;
  const key = ia < ib ? `${ia}|${ib}|${k}` : `${ib}|${ia}|${k}`;
  if (edgeSeen.has(key)) return;
  edgeSeen.add(key);
  edges.push({ s: ia, t: ib, k });
}

for (const l of links) {
  addEdge(`fo:${l.founderId}`, `co:${l.companyId}`, 0);
  // Hub-founder: keep all non-YC; strongly subsample YC for draw (layout uses force on subset)
  if (l.networkId === "yc") {
    if (hash(`${l.founderId}:yc`) < 0.08) addEdge(`net:yc`, `fo:${l.founderId}`, 1);
  } else if (hubSeen.has(l.networkId)) {
    addEdge(`net:${l.networkId}`, `fo:${l.founderId}`, 1);
  }
}

// Same-company cofounders
for (const cid of companyIds) {
  const fos = [...(meta.companyFounders.get(cid) ?? [])].filter((f) => indexOf.has(`fo:${f}`)).sort();
  for (let i = 0; i < fos.length; i++) {
    for (let j = i + 1; j < Math.min(fos.length, i + 4); j++) {
      addEdge(`fo:${fos[i]}`, `fo:${fos[j]}`, 2);
    }
  }
}

// Force layout
const linkForce = forceLink(edges.map((e) => ({ source: e.s, target: e.t, k: e.k })))
  .id((d: any) => (typeof d === "number" ? d : d.index))
  .distance((l: any) => (l.k === 1 ? 28 : l.k === 2 ? 14 : 18))
  .strength((l: any) => (l.k === 1 ? 0.04 : 0.08));

// d3 forceLink needs nodes with index — use array directly
const simNodes = nodes.map((n, i) => ({ ...n, index: i }));
const simEdges = edges.map((e) => ({ source: e.s, target: e.t, k: e.k }));

forceSimulation(simNodes as any)
  .force("charge", forceManyBody().strength(-8).distanceMax(120))
  .force(
    "link",
    forceLink(simEdges as any)
      .id((d: any) => d.index)
      .distance((l: any) => (l.k === 1 ? 36 : l.k === 2 ? 12 : 16))
      .strength(0.06),
  )
  .force(
    "collide",
    forceCollide()
      .radius((d: any) => d.r + 0.6)
      .strength(0.7),
  )
  .force(
    "x",
    forceX()
      .x((d: any) => {
        if (d.kind === 2) return d.x;
        return campusXY(d.campus).x;
      })
      .strength(0.05),
  )
  .force(
    "y",
    forceY()
      .y((d: any) => {
        if (d.kind === 2) return d.y;
        return campusXY(d.campus).y;
      })
      .strength(0.05),
  )
  .stop();

for (let i = 0; i < 220; i++) (forceSimulation as any); // placate
// re-create and tick
const sim = forceSimulation(simNodes as any)
  .force("charge", forceManyBody().strength(-10).distanceMax(140))
  .force(
    "link",
    forceLink(simEdges as any)
      .id((d: any) => d.index)
      .distance((l: any) => (l.k === 1 ? 34 : l.k === 2 ? 11 : 15))
      .strength(0.07),
  )
  .force(
    "collide",
    forceCollide()
      .radius((d: any) => d.r + 0.5)
      .strength(0.85),
  )
  .force(
    "x",
    forceX((d: any) => (d.kind === 2 ? d.x : campusXY(Math.max(0, d.campus)).x)).strength(0.045),
  )
  .force(
    "y",
    forceY((d: any) => (d.kind === 2 ? d.y : campusXY(Math.max(0, d.campus)).y)).strength(0.045),
  )
  .stop();
for (let i = 0; i < 240; i++) sim.tick();

// Write back positions
for (let i = 0; i < simNodes.length; i++) {
  nodes[i].x = simNodes[i].x;
  nodes[i].y = simNodes[i].y;
}

// Normalize to ~1000x700 viewBox with margin for callouts
let minX = Infinity,
  maxX = -Infinity,
  minY = Infinity,
  maxY = -Infinity;
for (const n of nodes) {
  minX = Math.min(minX, n.x);
  maxX = Math.max(maxX, n.x);
  minY = Math.min(minY, n.y);
  maxY = Math.max(maxY, n.y);
}
const pad = 80;
const spanX = Math.max(1, maxX - minX);
const spanY = Math.max(1, maxY - minY);
const W = 1200;
const H = 780;
for (const n of nodes) {
  n.x = pad + ((n.x - minX) / spanX) * (W - pad * 2);
  n.y = pad + ((n.y - minY) / spanY) * (H - pad * 2);
}

// Sourced callouts (4–6)
const founderNets = new Map<string, Set<string>>();
for (const l of links) {
  const s = founderNets.get(l.founderId) ?? new Set();
  s.add(l.networkId);
  founderNets.set(l.founderId, s);
}
let vip = 0,
  vipYc = 0;
for (const s of founderNets.values()) {
  if (!s.has("vipx")) continue;
  vip += 1;
  if (s.has("yc")) vipYc += 1;
}
const topFunds = new Set(
  ["sequoia", "a16z", "andreessen", "general catalyst", "accel", "benchmark", "greylock", "lightspeed", "khosla", "founders fund"].map((s) =>
    s.toLowerCase(),
  ),
);
function isTop(name: string) {
  const k = name.toLowerCase();
  return [...topFunds].some((t) => k.includes(t));
}
let cosWithTop = 0;
let cosTotal = 0;
const campusNoTop = new Map<string, { total: number; topped: number }>();
for (const cid of companyIds) {
  cosTotal += 1;
  const inv = meta.companyInvestors.get(cid) ?? [];
  const topped = inv.some(isTop);
  if (topped) cosWithTop += 1;
  const camp = companyCampusId.get(cid) ?? "other";
  const row = campusNoTop.get(camp) ?? { total: 0, topped: 0 };
  row.total += 1;
  if (topped) row.topped += 1;
  campusNoTop.set(camp, row);
}
const barren = [...campusNoTop.entries()]
  .filter(([id, r]) => id !== "other" && r.total >= 8)
  .map(([id, r]) => ({ id, label: campuses[campusIndex.get(id)!]?.label ?? id, share: r.topped / r.total, total: r.total, topped: r.topped }))
  .sort((a, b) => a.share - b.share || b.total - a.total);

const inv0 = page.investorHubs[0];
const calloutTexts: string[] = [];
if (vip > 0) {
  calloutTexts.push(
    `Only ${vipYc.toLocaleString("en-US")} of ${vip.toLocaleString("en-US")} VIP-X founders also show a YC tie — most of that path is still open to other capital.`,
  );
}
calloutTexts.push(
  `${(cosTotal - cosWithTop).toLocaleString("en-US")} of ${cosTotal.toLocaleString("en-US")} mapped companies have no top-fund investor on file yet.`,
);
if (inv0) {
  calloutTexts.push(
    `${inv0.label} reaches ${inv0.founderCount.toLocaleString("en-US")} campus founders across ${inv0.companyCount.toLocaleString("en-US")} companies here — top-fund coverage stays thin beside program hubs.`,
  );
}
if (barren[0]) {
  calloutTexts.push(
    `${barren[0].label}'s cluster has top-fund backing on only ${barren[0].topped.toLocaleString("en-US")} of ${barren[0].total.toLocaleString("en-US")} companies — a clear white space.`,
  );
}
if (barren[1]) {
  calloutTexts.push(
    `${barren[1].label} shows the same gap: ${barren[1].topped.toLocaleString("en-US")} of ${barren[1].total.toLocaleString("en-US")} companies with a named top fund.`,
  );
}
const ycHub = hubs.find((h) => h.id === "yc");
if (ycHub) {
  calloutTexts.push(
    `Y Combinator sits across campus colors with ${ycHub.founderCount.toLocaleString("en-US")} founders — the densest bridge in this cloud.`,
  );
}
const callouts = calloutTexts.slice(0, 6).map((text, i) => {
  // Anchor to a point on the cloud edge; label in margin
  const side = i % 2 === 0 ? "left" : "right";
  const t = (i + 0.5) / 6;
  const ay = pad * 0.6 + t * (H - pad * 1.2);
  // find nearest node to (side edge, ay)
  const axTarget = side === "left" ? pad + 40 : W - pad - 40;
  let best = 0;
  let bestD = Infinity;
  for (let ni = 0; ni < nodes.length; ni++) {
    if (nodes[ni].kind === 1) continue;
    const d = Math.hypot(nodes[ni].x - axTarget, nodes[ni].y - ay);
    if (d < bestD) {
      bestD = d;
      best = ni;
    }
  }
  const ax = nodes[best].x;
  const ay2 = nodes[best].y;
  const lx = side === "left" ? 16 : W - 220;
  const ly = Math.min(H - 60, Math.max(20, ay2 - 20));
  return { text, ax: round1(ax), ay: round1(ay2), lx, ly, side };
});

// Compact parallel arrays
const x: number[] = [];
const y: number[] = [];
const r: number[] = [];
const kind: number[] = [];
const campus: number[] = [];
const deg: number[] = [];
for (const n of nodes) {
  x.push(round1(n.x));
  y.push(round1(n.y));
  r.push(round1(n.r));
  kind.push(n.kind);
  campus.push(n.campus);
  deg.push(Math.min(255, n.deg));
}

const hubNodes = hubs.map((h) => {
  const ix = indexOf.get(`net:${h.id}`)!;
  return { id: h.id, label: h.label, kind: h.kind, i: ix, founders: h.founderCount };
});

// Edge arrays (uint-like)
const e0: number[] = [];
const e1: number[] = [];
const ek: number[] = [];
for (const e of edges) {
  e0.push(e.s);
  e1.push(e.t);
  ek.push(e.k);
}

// Featured founder: richest sourced investors
let featuredId: string | null = null;
let featuredScore = -1;
const deals: Record<string, any> = {};
for (const fid of founderIds) {
  const cos = [...(meta.companyFounders.entries())].filter(([, set]) => set.has(fid)).map(([id]) => id);
  const companyId = cos[0] ?? null;
  const investorsRaw = [...(companyId ? meta.companyInvestors.get(companyId) ?? [] : [])];
  const invSeen = new Set<string>();
  const investors: string[] = [];
  for (const name of investorsRaw) {
    const k = name.trim().toLowerCase();
    if (!k || invSeen.has(k)) continue;
    invSeen.add(k);
    investors.push(name.trim());
  }
  const netsRaw = [...(founderNets.get(fid) ?? [])].map((nid) => page.topNetworks.find((n) => n.id === nid)?.label ?? nid);
  const nets: string[] = [];
  const netSeen = new Set<string>();
  for (const name of netsRaw) {
    const k = name.trim().toLowerCase();
    if (!k || invSeen.has(k) || netSeen.has(k)) continue;
    netSeen.add(k);
    nets.push(name);
  }
  const hasTop = investors.some(isTop);
  const deal = {
    founderName: meta.founderNames.get(fid) ?? fid,
    companyName: companyId ? meta.companyNames.get(companyId) ?? null : null,
    companyId,
    stage: companyId ? meta.companyStages.get(companyId) ?? null : null,
    networks: nets.slice(0, 6),
    investors: investors.slice(0, 10),
    hasTopFund: hasTop,
  };
  // Only keep deals with something to show (or all founders with short stub)
  if (investors.length || nets.length) {
    deals[fid] = deal;
  }
  const score = investors.length * 3 + (hasTop ? 5 : 0) + nets.length;
  if (score > featuredScore) {
    featuredScore = score;
    featuredId = fid;
  }
}

const insights = calloutTexts.slice(0, 3);

const poster = {
  v: 1,
  w: W,
  h: H,
  totals: {
    founders: founderIds.length,
    companies: companyIds.length,
    links: links.length,
    companyTotal: page.totals.companyTotal,
    corpusCompanies: page.totals.corpusCompanies,
    founderLinks: page.totals.founderLinks,
    networks: page.totals.networks,
    foundersLinked: page.totals.foundersLinked,
  },
  campuses,
  hubs: hubNodes,
  x,
  y,
  r,
  kind,
  campus,
  deg,
  e0,
  e1,
  ek,
  callouts,
  insights,
  featuredId,
  investorHubs: page.investorHubs.slice(0, 8).map((h) => ({
    id: h.id,
    label: h.label,
    founders: h.founderCount,
    companies: h.companyCount,
  })),
  // id tables only for hubs + index→founder/company for hover (compact)
  foIds: founderIds,
  coIds: companyIds,
};

const dealsOut = { featuredId, deals };

fs.writeFileSync(OUT, JSON.stringify(poster));
fs.writeFileSync(OUT_DEALS, JSON.stringify(dealsOut));
const kib = fs.statSync(OUT).size / 1024;
const kibD = fs.statSync(OUT_DEALS).size / 1024;
console.log(
  JSON.stringify(
    {
      posterKiB: Math.round(kib * 10) / 10,
      dealsKiB: Math.round(kibD * 10) / 10,
      nodes: nodes.length,
      edges: edges.length,
      founders: founderIds.length,
      companies: companyIds.length,
      hubs: hubNodes.length,
      campuses: campuses.length,
      callouts: callouts.length,
      under210: kib <= 210,
    },
    null,
    2,
  ),
);

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
