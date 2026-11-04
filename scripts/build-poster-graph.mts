/**
 * Nature-map poster graph: every corpus founder + company, campus-colored clusters,
 * force-packed layout, compact JSON (≤210 KiB) + separate deals file.
 */
import fs from "fs";
import path from "path";
import { forceSimulation, forceManyBody, forceCollide, forceX, forceY, forceLink } from "d3-force";
import {
  loadFounderNetworkLinks,
  buildFounderNetworksPage,
  partitionDealLists,
  isInvestorNetworkRef,
} from "../lib/domain/founder-networks";
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

// ALL founders on investable companies + ALL investable companies (not only mapped subset).
const linkedFounderIds = new Set(links.map((l) => l.founderId));
const linkedCompanyIds = new Set(links.map((l) => l.companyId));
const founderIds = [...meta.founderNames.keys()].sort();
const companyIds = [...meta.companyNames.keys()].sort();

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

function pastel(hex: string, amount = 0.38): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const rgb = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  const mixed = rgb.map((c) => Math.round(c + (255 - c) * amount));
  return `#${mixed.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

const campuses = campusIds.map((id) => {
  const base = id === "other" ? "#94a3b8" : colorMap.get(id) ?? "#94a3b8";
  // Saturated pastels: lighten only slightly so campus colors read on warm white.
  const isPenn = /penn|pennsylvania/i.test(`${id} ${meta.uniLabels.get(id) ?? ""}`);
  return {
    id,
    label: id === "other" ? "Other" : shortCampus(meta.uniLabels.get(id) ?? id),
    color: isPenn ? base : pastel(base, 0.14),
    n: campusCount.get(id) ?? 0,
  };
});

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

const founderDeg = new Map<string, number>();
const companyDeg = new Map<string, number>();
const hubDeg = new Map<string, number>();
for (const l of links) {
  founderDeg.set(l.founderId, (founderDeg.get(l.founderId) ?? 0) + 1);
  companyDeg.set(l.companyId, (companyDeg.get(l.companyId) ?? 0) + 1);
  hubDeg.set(l.networkId, (hubDeg.get(l.networkId) ?? 0) + 1);
}

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

const nodes: SimNode[] = [];
const indexOf = new Map<string, number>();

/** Distinct campus islands: twin central masses + mid ring + far satellites (Nature). */
function campusXY(ci: number): { x: number; y: number } {
  const n = campuses[ci]?.n ?? 1;
  if (ci === 0) return { x: -160, y: -64 };
  if (ci === 1) return { x: 180, y: -12 };
  if (ci < 5) {
    const k = ci - 2;
    const ang = -Math.PI * 0.55 + k * 1.15;
    const rad = 340 + k * 36;
    return { x: Math.cos(ang) * rad, y: Math.sin(ang) * rad };
  }
  if (ci < 12) {
    const k = ci - 5;
    const ang = (k / 7) * Math.PI * 2 + 0.25;
    const rad = 560 + (k % 2) * 70;
    return { x: Math.cos(ang) * rad, y: Math.sin(ang) * rad };
  }
  const j = ci - 12;
  const satN = Math.max(1, campuses.length - 12);
  const ang = (j / satN) * Math.PI * 2 + 0.55;
  const rad = 820 + (j % 6) * 70 + Math.sqrt(Math.max(1, n)) * 3.5;
  return { x: Math.cos(ang) * rad, y: Math.sin(ang) * rad * 0.9 };
}

for (const fid of founderIds) {
  const cid = founderCampusId.get(fid) ?? "other";
  const ci = campusIndex.get(cid) ?? campusIndex.get("other") ?? 0;
  const home = campusXY(ci);
  const deg = founderDeg.get(fid) ?? 0;
  // Screen-readable dots at rest: ~2–3.5px after fit.
  const r = deg <= 0 ? 2.2 : Math.max(2.0, Math.min(3.5, 2.0 + Math.sqrt(deg) * 0.55));
  const campN = campusCount.get(cid) ?? 1;
  // Soft float for unlinked founders near the campus cloud.
  const jitter = (deg <= 0 ? 14 : 7) + Math.sqrt(campN) * 0.55;
  const id = `fo:${fid}`;
  indexOf.set(id, nodes.length);
  nodes.push({
    id,
    kind: 0,
    campus: ci,
    deg: Math.max(1, deg),
    r,
    x: home.x + (hash(fid) - 0.5) * jitter * 2,
    y: home.y + (hash(fid + "y") - 0.5) * jitter * 2,
  });
}

for (const cid of companyIds) {
  const camp = companyCampusId.get(cid) ?? "other";
  const ci = campusIndex.get(camp) ?? 0;
  const home = campusXY(ci);
  const deg = companyDeg.get(cid) ?? 0;
  const invN = (meta.companyInvestors.get(cid) ?? []).length;
  const score = Math.max(deg, invN);
  const r = score <= 0 ? 1.5 : Math.max(1.5, Math.min(2.8, 1.5 + Math.sqrt(score) * 0.35));
  const campN = campusCount.get(camp) ?? 1;
  const jitter = (score <= 0 ? 12 : 6) + Math.sqrt(campN) * 0.45;
  const id = `co:${cid}`;
  indexOf.set(id, nodes.length);
  nodes.push({
    id,
    kind: 1,
    campus: ci,
    deg: Math.max(1, score),
    r,
    x: home.x + (hash(cid) - 0.5) * jitter * 2,
    y: home.y + (hash(cid + "y") - 0.5) * jitter * 2,
  });
}

for (const hub of hubs) {
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
  const r = Math.max(3.2, Math.min(5.5, 3.2 + Math.sqrt(deg) * 0.08));
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

type E = { s: number; t: number; k: number }; // k: 0 fo-co, 1 hub-fo, 2 cofounder, 3 shared-investor
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
  // Keep far more real hub-founder edges (YC still lightly sampled for file size).
  if (l.networkId === "yc") {
    if (hash(`${l.founderId}:yc`) < 0.22) addEdge(`net:yc`, `fo:${l.founderId}`, 1);
  } else if (hubSeen.has(l.networkId)) {
    addEdge(`net:${l.networkId}`, `fo:${l.founderId}`, 1);
  }
}

for (const cid of companyIds) {
  const fos = [...(meta.companyFounders.get(cid) ?? [])].filter((f) => indexOf.has(`fo:${f}`)).sort();
  for (let i = 0; i < fos.length; i++) {
    for (let j = i + 1; j < Math.min(fos.length, i + 5); j++) {
      addEdge(`fo:${fos[i]}`, `fo:${fos[j]}`, 2);
    }
  }
}

// Shared investor edges between companies (real company_facts only; no invented ties).
const invIndex = new Map<string, string[]>();
for (const cid of companyIds) {
  for (const name of meta.companyInvestors.get(cid) ?? []) {
    const key = name.trim().toLowerCase();
    if (!key) continue;
    const list = invIndex.get(key) ?? [];
    list.push(cid);
    invIndex.set(key, list);
  }
}
for (const [, cos] of invIndex) {
  if (cos.length < 2 || cos.length > 40) continue;
  const sample = cos.slice(0, 12);
  for (let i = 0; i < sample.length; i++) {
    for (let j = i + 1; j < sample.length; j++) {
      if (hash(`${sample[i]}|${sample[j]}`) < 0.35) addEdge(`co:${sample[i]}`, `co:${sample[j]}`, 3);
    }
  }
}

const simNodes = nodes.map((n, i) => ({ ...n, index: i }));
const simEdges = edges.map((e) => ({ source: e.s, target: e.t, k: e.k }));

const sim = forceSimulation(simNodes as any)
  .force("charge", forceManyBody().strength(-28).distanceMax(420))
  .force(
    "link",
    forceLink(simEdges as any)
      .id((d: any) => d.index)
      .distance((l: any) => (l.k === 1 ? 72 : l.k === 2 ? 4.0 : l.k === 3 ? 90 : 11))
      .strength((l: any) => (l.k === 1 ? 0.007 : l.k === 2 ? 0.3 : l.k === 3 ? 0.003 : 0.06)),
  )
  .force(
    "collide",
    forceCollide()
      .radius((d: any) => d.r + 0.7)
      .strength(0.9)
      .iterations(2),
  )
  .force(
    "x",
    forceX((d: any) => (d.kind === 2 ? d.x : campusXY(Math.max(0, d.campus)).x)).strength((d: any) => {
      if (d.kind === 2) return 0.006;
      const ci = Math.max(0, d.campus);
      return ci >= 12 ? 0.32 : ci >= 5 ? 0.22 : 0.12;
    }),
  )
  .force(
    "y",
    forceY((d: any) => (d.kind === 2 ? d.y : campusXY(Math.max(0, d.campus)).y)).strength((d: any) => {
      if (d.kind === 2) return 0.006;
      const ci = Math.max(0, d.campus);
      return ci >= 12 ? 0.32 : ci >= 5 ? 0.22 : 0.12;
    }),
  )
  .stop();
for (let i = 0; i < 380; i++) sim.tick();

for (let i = 0; i < simNodes.length; i++) {
  nodes[i].x = simNodes[i].x;
  nodes[i].y = simNodes[i].y;
}

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
const pad = 100;
const spanX = Math.max(1, maxX - minX);
const spanY = Math.max(1, maxY - minY);
const W = 1200;
const H = 900;
const scale = Math.min((W - pad * 2) / spanX, (H - pad * 2) / spanY);
const midX = (minX + maxX) / 2;
const midY = (minY + maxY) / 2;
for (const n of nodes) {
  n.x = W / 2 + (n.x - midX) * scale;
  n.y = H / 2 + (n.y - midY) * scale;
}

// Push campus islands outward after normalize so white gaps survive fit-to-canvas.
{
  const cx0 = W / 2;
  const cy0 = H / 2;
  type Cent = { sx: number; sy: number; n: number };
  const cents = new Map<number, Cent>();
  for (const n of nodes) {
    if (n.kind !== 0 || n.campus < 0) continue;
    const row = cents.get(n.campus) ?? { sx: 0, sy: 0, n: 0 };
    row.sx += n.x;
    row.sy += n.y;
    row.n += 1;
    cents.set(n.campus, row);
  }
  const delta = new Map<number, { dx: number; dy: number }>();
  for (const [ci, row] of cents) {
    const hx = row.sx / row.n;
    const hy = row.sy / row.n;
    const vx = hx - cx0;
    const vy = hy - cy0;
    const dist = Math.hypot(vx, vy) || 1;
    // Mid/far campuses get a stronger radial shove; twin cores stay nearer.
    const boost = ci < 2 ? 0.08 : ci < 5 ? 0.22 : ci < 12 ? 0.34 : 0.48;
    const push = Math.min(140, 36 + dist * boost);
    delta.set(ci, { dx: (vx / dist) * push, dy: (vy / dist) * push });
  }
  for (const n of nodes) {
    if (n.campus < 0) continue;
    const d = delta.get(n.campus);
    if (!d) continue;
    n.x += d.dx;
    n.y += d.dy;
  }
  // Re-center hubs on their member founders after the shove.
  for (const n of nodes) {
    if (n.kind !== 2 || !n.hubId) continue;
    const fos = links.filter((l) => l.networkId === n.hubId).map((l) => l.founderId);
    let sx = 0, sy = 0, c = 0;
    for (const f of fos.slice(0, 400)) {
      const ix = indexOf.get(`fo:${f}`);
      if (ix == null) continue;
      sx += nodes[ix].x;
      sy += nodes[ix].y;
      c += 1;
    }
    if (c) {
      n.x = sx / c;
      n.y = sy / c;
    }
  }
  // De-stack overlapping hub nodes (Penn VIP-X / Velocity / Startup Challenge cluster).
  {
    const hubsOnly = nodes.filter((n) => n.kind === 2);
    const minDist = 52;
    for (let pass = 0; pass < 48; pass++) {
      let moved = 0;
      for (let i = 0; i < hubsOnly.length; i++) {
        for (let j = i + 1; j < hubsOnly.length; j++) {
          const a = hubsOnly[i];
          const b = hubsOnly[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let d = Math.hypot(dx, dy);
          if (d < 0.01) {
            dx = (hash(a.id) - 0.5) * 2;
            dy = (hash(b.id) - 0.5) * 2;
            d = Math.hypot(dx, dy) || 1;
          }
          if (d >= minDist) continue;
          const push = (minDist - d) * 0.55;
          const nx = dx / d;
          const ny = dy / d;
          a.x -= nx * push * 0.5;
          a.y -= ny * push * 0.5;
          b.x += nx * push * 0.5;
          b.y += ny * push * 0.5;
          moved += 1;
        }
      }
      if (!moved) break;
    }
  }
}

const founderNets = new Map<string, { id: string; label: string; kind: string }[]>();
for (const l of links) {
  if (isInvestorNetworkRef(l.networkId, l.kind) || l.kind === "investor") continue;
  const list = founderNets.get(l.founderId) ?? [];
  if (!list.some((x) => x.id === l.networkId)) list.push({ id: l.networkId, label: l.label, kind: l.kind });
  founderNets.set(l.founderId, list);
}
let vip = 0,
  vipYc = 0;
for (const list of founderNets.values()) {
  const ids = new Set(list.map((x) => x.id));
  if (!ids.has("vipx")) continue;
  vip += 1;
  if (ids.has("yc")) vipYc += 1;
}
const topFunds = new Set(
  ["sequoia", "a16z", "andreessen", "general catalyst", "accel", "benchmark", "greylock", "lightspeed", "khosla", "founders fund", "bessemer"].map((s) =>
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
for (const cid of linkedCompanyIds) {
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
    `Only ${vipYc.toLocaleString("en-US")} of ${vip.toLocaleString("en-US")} VIP-X founders also show a YC tie. Most of that path is still open to other capital.`,
  );
}
calloutTexts.push(
  `${(cosTotal - cosWithTop).toLocaleString("en-US")} of ${cosTotal.toLocaleString("en-US")} mapped companies have no top-fund investor on file yet.`,
);
if (inv0) {
  calloutTexts.push(
    `${inv0.label} reaches ${inv0.founderCount.toLocaleString("en-US")} campus founders across ${inv0.companyCount.toLocaleString("en-US")} companies here. Top-fund coverage stays thin beside program hubs.`,
  );
}
if (barren[0]) {
  calloutTexts.push(
    `${barren[0].label}'s cluster has top-fund backing on only ${barren[0].topped.toLocaleString("en-US")} of ${barren[0].total.toLocaleString("en-US")} companies. A clear white space.`,
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
    `Y Combinator sits across campus colors with ${ycHub.founderCount.toLocaleString("en-US")} founders. The densest bridge in this cloud.`,
  );
}

const campusCentroid: { x: number; y: number; n: number; r: number }[] = campuses.map(() => ({ x: 0, y: 0, n: 0, r: 40 }));
for (const n of nodes) {
  if (n.kind !== 0 || n.campus < 0) continue;
  const c = campusCentroid[n.campus];
  c.x += n.x;
  c.y += n.y;
  c.n += 1;
}
for (let i = 0; i < campusCentroid.length; i++) {
  const c = campusCentroid[i];
  if (c.n) {
    c.x /= c.n;
    c.y /= c.n;
  }
  // Approximate cluster radius from member spread.
  let maxD = 24;
  for (const n of nodes) {
    if (n.kind !== 0 || n.campus !== i) continue;
    maxD = Math.max(maxD, Math.hypot(n.x - c.x, n.y - c.y));
  }
  c.r = Math.min(120, Math.max(28, maxD * 0.85));
}
const calloutAnchors = [
  campusCentroid[campusIndex.get("univ_penn") ?? 0],
  campusCentroid[campusIndex.get("univ_stanford") ?? 1],
  campusCentroid[campusIndex.get("univ_mit") ?? 2],
  campusCentroid[campusIndex.get(barren[0]?.id ?? "univ_berkeley") ?? 3],
  campusCentroid[campusIndex.get(barren[1]?.id ?? "univ_harvard") ?? 4],
  nodes[indexOf.get("net:yc") ?? 0] ? { x: nodes[indexOf.get("net:yc")!].x, y: nodes[indexOf.get("net:yc")!].y, n: 1, r: 40 } : campusCentroid[0],
];
const callouts = calloutTexts.slice(0, 6).map((text, i) => {
  const side = i % 2 === 0 ? "left" : "right";
  const anchor = calloutAnchors[i] ?? campusCentroid[i % campusCentroid.length] ?? { x: W / 2, y: H / 2, n: 1, r: 40 };
  const ax = anchor.x || W / 2;
  const ay2 = anchor.y || H / 2;
  const lx = side === "left" ? 10 : W - 228;
  const ly = Math.min(H - 80, Math.max(18, 40 + i * 110 + (side === "right" ? 30 : 0)));
  return { text, ax: round1(ax), ay: round1(ay2), lx: round1(lx), ly: round1(ly), side };
});

const x: number[] = [];
const y: number[] = [];
const z: number[] = [];
const r: number[] = [];
const kind: number[] = [];
const campus: number[] = [];
const deg: number[] = [];
const year: number[] = []; // 0 always-on; >0 grad year; <0 = -(founded proxy year)
for (const n of nodes) {
  x.push(round1(n.x));
  y.push(round1(n.y));
  const shelf = n.kind === 2 ? 28 : n.campus < 0 ? 0 : ((n.campus % 7) - 3) * 18;
  z.push(round1(shelf + (n.kind === 0 ? (n.deg % 5) * 1.2 : 0)));
  r.push(round1(n.r));
  kind.push(n.kind);
  campus.push(n.campus);
  deg.push(Math.min(255, n.deg));
  if (n.kind === 0) {
    const fid = n.id.startsWith("fo:") ? n.id.slice(3) : "";
    const yv = meta.founderYears.get(fid) ?? 0;
    const k = meta.founderYearKind.get(fid);
    // Negative encodes founded-year proxy without a parallel yearKind array (keeps JSON under 210KiB).
    year.push(k === "founded" && yv > 0 ? -yv : yv);
  } else {
    year.push(0);
  }
}

const hubNodes = hubs.map((h) => {
  const ix = indexOf.get(`net:${h.id}`)!;
  return { id: h.id, label: h.label, kind: h.kind, i: ix, founders: h.founderCount };
});

const e0: number[] = [];
const e1: number[] = [];
const ek: number[] = [];
for (const e of edges) {
  e0.push(e.s);
  e1.push(e.t);
  ek.push(e.k);
}

let featuredId: string | null = null;
let featuredScore = -1;
const deals: Record<string, any> = {};
for (const fid of founderIds) {
  const cos = [...meta.companyFounders.entries()].filter(([, set]) => set.has(fid)).map(([id]) => id);
  const companyId = cos.find((id) => linkedCompanyIds.has(id)) ?? cos[0] ?? null;
  const netRows = founderNets.get(fid) ?? [];
  const parted = partitionDealLists({
    networkLabels: netRows.map((n) => n.label),
    networkIds: netRows.map((n) => n.id),
    networkKinds: netRows.map((n) => n.kind),
    investorLabels: companyId ? meta.companyInvestors.get(companyId) ?? [] : [],
  });
  const hasTop = parted.investors.some(isTop);
  const deal = {
    founderName: meta.founderNames.get(fid) ?? fid,
    companyName: companyId ? meta.companyNames.get(companyId) ?? null : null,
    companyId,
    stage: companyId ? meta.companyStages.get(companyId) ?? null : null,
    networks: parted.networks.slice(0, 10),
    investors: parted.investors.slice(0, 12),
    hasTopFund: hasTop,
  };
  if (parted.investors.length || parted.networks.length) {
    deals[fid] = deal;
  }
  const score = parted.investors.length * 3 + (hasTop ? 5 : 0) + parted.networks.length;
  if (score > featuredScore) {
    featuredScore = score;
    featuredId = fid;
  }
}

const insights = calloutTexts.slice(0, 3);
const campusLabels = campuses
  .map((c, i) => ({
    id: c.id,
    label: c.label,
    n: c.n,
    x: round1(campusCentroid[i].x),
    y: round1(campusCentroid[i].y),
    r: round1(campusCentroid[i].r),
  }))
  .filter((c) => c.n >= 8)
  .sort((a, b) => b.n - a.n)
  .slice(0, 14);

const poster = {
  v: 2,
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
    foundersShown: founderIds.length,
    companiesShown: companyIds.length,
    foundersWithYear: founderIds.filter((id) => (meta.founderYearKind.get(id) === "grad")).length,
    foundersWithProxy: founderIds.filter((id) => meta.founderYearKind.get(id) === "founded").length,
    foundersAlwaysOn: founderIds.filter((id) => !(meta.founderYears.get(id) ?? 0)).length,
    foundersNoYear: founderIds.filter((id) => !(meta.founderYears.get(id) ?? 0)).length,
    yearMin: 2023,
    yearMax: 2026,
  },
  campuses,
  hubs: hubNodes,
  campusLabels,
  x,
  y,
  z,
  r,
  kind,
  campus,
  deg,
  year,
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
      linkedFounders: linkedFounderIds.size,
      hubs: hubNodes.length,
      campuses: campuses.length,
      callouts: callouts.length,
      under210: kib <= 210,
      featuredId,
      featuredInvestors: featuredId ? deals[featuredId]?.investors?.slice(0, 3) : null,
      featuredNetworks: featuredId ? deals[featuredId]?.networks : null,
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
