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

/** Distinct campus islands: 1–2 big central masses + separated satellite blobs (Nature). */
function campusXY(ci: number): { x: number; y: number } {
  const n = campuses[ci]?.n ?? 1;
  // Twin central masses (Nature NA / Europe style) with a clear cleft
  if (ci === 0) return { x: -95, y: -40 };
  if (ci === 1) return { x: 110, y: -5 };
  // Near-core majors: still attached to the central cloud but not fused
  if (ci < 5) {
    const k = ci - 2;
    const ang = -Math.PI * 0.55 + k * 1.15;
    const rad = 210 + k * 18;
    return { x: Math.cos(ang) * rad, y: Math.sin(ang) * rad };
  }
  // Mid ring
  if (ci < 12) {
    const k = ci - 5;
    const ang = (k / 7) * Math.PI * 2 + 0.2;
    const rad = 320 + (k % 2) * 30;
    return { x: Math.cos(ang) * rad, y: Math.sin(ang) * rad };
  }
  // Far satellites — white space + haze gaps like Nature AU/CN/JP/SA
  const j = ci - 12;
  const satN = Math.max(1, campuses.length - 12);
  const ang = (j / satN) * Math.PI * 2 + 0.55;
  const rad = 460 + (j % 6) * 42 + Math.sqrt(Math.max(1, n)) * 2.2;
  return { x: Math.cos(ang) * rad, y: Math.sin(ang) * rad * 0.95 };
}

for (const fid of founderIds) {
  const cid = founderCampusId.get(fid) ?? "other";
  const ci = campusIndex.get(cid) ?? campusIndex.get("other") ?? 0;
  const home = campusXY(ci);
  const deg = founderDeg.get(fid) ?? 1;
  // Screen-ish radius 3–14px (sqrt of connectedness); stored in world units ≈ px after normalize
  const r = Math.max(3.2, Math.min(16, 3.2 + Math.sqrt(deg) * 1.55));
  const campN = campusCount.get(cid) ?? 1;
  // Tight seed so collide packs into a solid blob
  const jitter = 8 + Math.sqrt(campN) * 0.7;
  const id = `fo:${fid}`;
  indexOf.set(id, nodes.length);
  nodes.push({
    id,
    kind: 0,
    campus: ci,
    deg,
    r,
    x: home.x + (hash(fid) - 0.5) * jitter * 2,
    y: home.y + (hash(fid + "y") - 0.5) * jitter * 2,
  });
}

for (const cid of companyIds) {
  const camp = companyCampusId.get(cid) ?? "other";
  const ci = campusIndex.get(camp) ?? 0;
  const home = campusXY(ci);
  const deg = companyDeg.get(cid) ?? 1;
  const invN = (meta.companyInvestors.get(cid) ?? []).length;
  const score = Math.max(deg, invN);
  const r = Math.max(3.0, Math.min(14, 3.0 + Math.sqrt(score) * 1.35));
  const campN = campusCount.get(camp) ?? 1;
  const jitter = 7 + Math.sqrt(campN) * 0.55;
  const id = `co:${cid}`;
  indexOf.set(id, nodes.length);
  nodes.push({
    id,
    kind: 1,
    campus: ci,
    deg: score,
    r,
    x: home.x + (hash(cid) - 0.5) * jitter * 2,
    y: home.y + (hash(cid + "y") - 0.5) * jitter * 2,
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
  const r = Math.max(5.5, Math.min(14, 5.5 + Math.sqrt(deg) * 0.22));
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

// Force layout — per-campus blobs with gaps between islands (weaker global packing)
const simNodes = nodes.map((n, i) => ({ ...n, index: i }));
const simEdges = edges.map((e) => ({ source: e.s, target: e.t, k: e.k }));

const sim = forceSimulation(simNodes as any)
  .force("charge", forceManyBody().strength(-28).distanceMax(280))
  .force(
    "link",
    forceLink(simEdges as any)
      .id((d: any) => d.index)
      .distance((l: any) => (l.k === 1 ? 42 : l.k === 2 ? 4 : 10))
      .strength((l: any) => (l.k === 1 ? 0.015 : l.k === 2 ? 0.22 : 0.08)),
  )
  .force(
    "collide",
    forceCollide()
      .radius((d: any) => d.r + 0.35)
      .strength(0.75)
      .iterations(2),
  )
  .force(
    "x",
    forceX((d: any) => (d.kind === 2 ? d.x : campusXY(Math.max(0, d.campus)).x)).strength((d: any) => {
      if (d.kind === 2) return 0.01;
      const ci = Math.max(0, d.campus);
      return ci >= 12 ? 0.16 : ci >= 5 ? 0.1 : 0.07;
    }),
  )
  .force(
    "y",
    forceY((d: any) => (d.kind === 2 ? d.y : campusXY(Math.max(0, d.campus)).y)).strength((d: any) => {
      if (d.kind === 2) return 0.01;
      const ci = Math.max(0, d.campus);
      return ci >= 12 ? 0.16 : ci >= 5 ? 0.1 : 0.07;
    }),
  )
  .stop();
for (let i = 0; i < 360; i++) sim.tick();

for (let i = 0; i < simNodes.length; i++) {
  nodes[i].x = simNodes[i].x;
  nodes[i].y = simNodes[i].y;
}

// Uniform scale → circular/organic cloud; wide pad leaves white margins for callouts
let minX = Infinity,
  maxX = -Infinity,
  minY = Infinity,
  maxY = -Infinity;
for (const n of nodes) {
  minX = Math.min(minX, n.x - n.r);
  maxX = Math.max(maxX, n.x + n.r);
  minY = Math.min(minY, n.y - n.r);
  maxY = Math.max(maxY, n.y + n.r);
}
const pad = 95; // white margin band for Nature-style callouts (keep room for leaders)
const spanX = Math.max(1, maxX - minX);
const spanY = Math.max(1, maxY - minY);
const W = 1200;
const H = 900; // nearer to square so normalize stays circular, not a squash
const scale = Math.min((W - pad * 2) / spanX, (H - pad * 2) / spanY);
const midX = (minX + maxX) / 2;
const midY = (minY + maxY) / 2;
for (const n of nodes) {
  n.x = W / 2 + (n.x - midX) * scale;
  n.y = H / 2 + (n.y - midY) * scale;
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
// Prefer anchoring callouts to major campus blob centroids (closer to what they describe)
const campusCentroid: { x: number; y: number; n: number }[] = campuses.map(() => ({ x: 0, y: 0, n: 0 }));
for (const n of nodes) {
  if (n.kind !== 0 || n.campus < 0) continue;
  const c = campusCentroid[n.campus];
  c.x += n.x;
  c.y += n.y;
  c.n += 1;
}
for (const c of campusCentroid) {
  if (c.n) {
    c.x /= c.n;
    c.y /= c.n;
  }
}
const calloutAnchors = [
  campusCentroid[campusIndex.get("univ_penn") ?? 0],
  campusCentroid[campusIndex.get("univ_stanford") ?? 1],
  campusCentroid[campusIndex.get("univ_mit") ?? 2],
  campusCentroid[campusIndex.get(barren[0]?.id ?? "univ_berkeley") ?? 3],
  campusCentroid[campusIndex.get(barren[1]?.id ?? "univ_harvard") ?? 4],
  nodes[indexOf.get("net:yc") ?? 0] ? { x: nodes[indexOf.get("net:yc")!].x, y: nodes[indexOf.get("net:yc")!].y, n: 1 } : campusCentroid[0],
];
const callouts = calloutTexts.slice(0, 6).map((text, i) => {
  const side = i % 2 === 0 ? "left" : "right";
  const anchor = calloutAnchors[i] ?? campusCentroid[i % campusCentroid.length] ?? { x: W / 2, y: H / 2, n: 1 };
  const ax = anchor.x || W / 2;
  const ay2 = anchor.y || H / 2;
  // True page margins (outside the cloud), staggered so boxes don't stack
  const lx = side === "left" ? 10 : W - 228;
  const ly = Math.min(H - 80, Math.max(18, 40 + i * 110 + (side === "right" ? 30 : 0)));
  return { text, ax: round1(ax), ay: round1(ay2), lx: round1(lx), ly: round1(ly), side };
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
