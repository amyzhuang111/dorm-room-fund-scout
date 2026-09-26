// Full evidence graph for the Network map. Nodes and edges come from
// affiliations, founder roles, program memberships, sourced investor facts,
// and confirmed DRF portfolio matches. Positions are a cached ForceAtlas2
// layout (seeded near campuses, then settled and stopped) so the browser
// only draws.

import fs from "node:fs";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import noverlap from "graphology-layout-noverlap";
import { databasePath, getDb } from "../db/client";
import { CAMPUSES } from "./campuses";
import { hotspotGraphPatch } from "./hotspots";
import { confirmedLinkedIn } from "./person-link";
import { sectorLabel } from "./sectors";

export type MapNodeType = "person" | "startup" | "campus" | "investor" | "program";
export type MapEdgeType = "founded" | "co_founder" | "studied_at" | "invested_in" | "member_of" | "at_campus";

export interface MapNode {
  id: string;
  type: MapNodeType;
  label: string;
  x: number;
  y: number;
  r: number;
  campus: string | null;
  campuses?: string[];
  sector: string | null;
  tier: string | null;
  stage: string | null;
  enroll: string | null;
  /** Graduation year when a sourced class year exists. Null stays unknown. */
  year: number | null;
  /** True when this person has a sourced founder role on a startup in the map. */
  founder: boolean;
  /** Incident edges. Drives node size together with funding. */
  degree: number;
  potential: boolean;
  /** Stored linkedin.com/in path. Omitted when the person has neither a confirmed alias nor an unverified candidate. */
  linkedinUrl?: string;
  linkedinStatus?: "confirmed" | "unverified";
}

export interface MapEdge {
  source: string;
  target: string;
  type: MapEdgeType;
}

export interface MapGraph {
  nodes: MapNode[];
  edges: MapEdge[];
  counts: { people: number; startups: number; campuses: number; investors: number; programs: number };
}

const STAGE_RANK: Record<string, number> = {
  "pre-seed": 1,
  seed: 2,
  "series a": 3,
  "series b": 4,
  "series c": 5,
  "series d": 6,
};

const DRF_ID = "inv_dorm_room_fund";

interface SimNode {
  id: string;
  type: MapNodeType;
  x: number;
  y: number;
  r: number;
  anchorX: number;
  anchorY: number;
}

/** Springs for ForceAtlas2. Campus affiliation is drawn, but it is not a spring — otherwise every student collapses onto a campus disc. */
const LAYOUT_WEIGHT: Record<MapEdgeType, number> = {
  founded: 3.2,
  co_founder: 2.6,
  member_of: 1.8,
  invested_in: 3,
  studied_at: 0,
  at_campus: 0,
};

const LAYOUT_VERSION = "4";

let cache: { stamp: string; graph: MapGraph } | null = null;

export function buildNetworkMap(): MapGraph {
  let stamp = "missing";
  try {
    const st = fs.statSync(databasePath());
    stamp = `${LAYOUT_VERSION}:${st.mtimeMs}:${st.size}`;
  } catch {
    stamp = "missing";
  }
  if (cache?.stamp === stamp) return cache.graph;
  const graph = assembleNetworkMap();
  cache = { stamp, graph };
  return graph;
}

function investorId(name: string): string {
  return `inv_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
}

/** Sourced graduation year. A missing year stays null — it is not guessed from age. */
export function classYear(gradYear: number | null, label: string | null): number | null {
  if (typeof gradYear === "number" && gradYear >= 1980 && gradYear <= 2040) return gradYear;
  if (!label) return null;
  const full = label.match(/\b((?:19|20)\d{2})\b/);
  if (full) {
    const year = Number(full[1]);
    if (year >= 1980 && year <= 2040) return year;
  }
  const tick = label.match(/'(\d{2})\b/);
  if (!tick) return null;
  const yy = Number(tick[1]);
  const year = yy >= 70 ? 1900 + yy : 2000 + yy;
  return year >= 1980 && year <= 2040 ? year : null;
}

function tierBoost(tier: string | null): number {
  if (tier === "S") return 3;
  if (tier === "A") return 2;
  if (tier === "B") return 1.2;
  return 0;
}

function radius(type: MapNodeType, degree: number, tier: string | null, amount: number | null): number {
  const money = amount && amount > 0 ? Math.min(3.5, Math.log10(amount) - 5.2) : 0;
  if (type === "campus") return 18;
  if (type === "investor") return 8 + Math.min(7, Math.sqrt(degree) * 0.7);
  if (type === "program") return 9 + Math.min(5, Math.sqrt(degree) * 0.45);
  if (type === "startup") return 5 + tierBoost(tier) + Math.max(0, money) + Math.min(2.5, Math.sqrt(degree) * 0.35);
  return 3.4 + tierBoost(tier) * 0.45 + Math.min(2, Math.sqrt(degree) * 0.28);
}

function assembleNetworkMap(): MapGraph {
  const db = getDb();
  const campusName = new Map(CAMPUSES.map((campus) => [campus.id, campus.shortLabel]));

  const universities = db.prepare(`SELECT id, name FROM universities`).all() as { id: string; name: string }[];
  const uniIds = new Set(universities.map((row) => row.id));

  const people = db
    .prepare(
      `SELECT id, name, aliases_json, founder_status, enrollment_status, enrollment_label, enrollment_grad_year, signal_tier FROM people
       WHERE id IN (SELECT person_id FROM affiliations)
          OR id IN (
            SELECT ppr.person_id FROM person_project_roles ppr
            JOIN projects p ON p.id = ppr.project_id
            WHERE p.kind = 'company' AND p.is_investable_candidate = 1 AND ppr.role LIKE '%founder%'
          )`
    )
    .all() as {
    id: string;
    name: string;
    aliases_json: string;
    founder_status: string | null;
    enrollment_status: string | null;
    enrollment_label: string | null;
    enrollment_grad_year: number | null;
    signal_tier: string | null;
  }[];
  const personIds = new Set(people.map((person) => person.id));
  const linkedinByPerson = new Map<string, { url: string; status: "confirmed" | "unverified" }>();
  for (const person of people) {
    const confirmed = confirmedLinkedIn(person.aliases_json);
    if (confirmed) linkedinByPerson.set(person.id, { url: confirmed, status: "confirmed" });
  }
  const candidateRows = db
    .prepare(
      `SELECT entity_id, value_json FROM claims
       WHERE entity_type = 'person' AND claim_type = 'linkedin_candidate' AND verification_state = 'unverified'`
    )
    .all() as { entity_id: string; value_json: string }[];
  for (const row of candidateRows) {
    if (!personIds.has(row.entity_id) || linkedinByPerson.has(row.entity_id)) continue;
    try {
      const value = JSON.parse(row.value_json) as { linkedin?: unknown };
      if (typeof value.linkedin === "string" && value.linkedin.includes("linkedin.com/in/")) {
        linkedinByPerson.set(row.entity_id, { url: value.linkedin, status: "unverified" });
      }
    } catch {
      // skip a malformed candidate
    }
  }

  const affiliations = db.prepare(`SELECT person_id, university_id FROM affiliations`).all() as { person_id: string; university_id: string }[];
  const campusesByPerson = new Map<string, string[]>();
  for (const row of affiliations) {
    if (!personIds.has(row.person_id) || !uniIds.has(row.university_id)) continue;
    const list = campusesByPerson.get(row.person_id) ?? [];
    if (!list.includes(row.university_id)) list.push(row.university_id);
    campusesByPerson.set(row.person_id, list);
  }

  const startups = db
    .prepare(
      `SELECT id, name, signal_tier FROM projects
       WHERE kind = 'company' AND is_investable_candidate = 1`
    )
    .all() as { id: string; name: string; signal_tier: string | null }[];
  const startupIds = new Set(startups.map((row) => row.id));

  const companyCampusRows = db
    .prepare(
      `SELECT source_entity_id AS id, target_entity_id AS campus
       FROM relationships
       WHERE relationship_type = 'affiliated_with' AND source_entity_type = 'project' AND target_entity_type = 'university'`
    )
    .all() as { id: string; campus: string }[];
  const campusesByCompany = new Map<string, string[]>();
  for (const row of companyCampusRows) {
    if (!uniIds.has(row.campus)) continue;
    const list = campusesByCompany.get(row.id) ?? [];
    if (!list.includes(row.campus)) list.push(row.campus);
    campusesByCompany.set(row.id, list);
  }

  const sectorRows = db
    .prepare(`SELECT project_id, tag, is_primary FROM project_sector_tags ORDER BY is_primary DESC, tag`)
    .all() as { project_id: string; tag: string; is_primary: number }[];
  const sectorByProject = new Map<string, string>();
  for (const row of sectorRows) {
    if (!sectorByProject.has(row.project_id)) sectorByProject.set(row.project_id, sectorLabel(row.tag));
  }

  const fundingRows = db
    .prepare(`SELECT project_id, fact_key, amount_usd, detail_json FROM company_facts WHERE fact_key IN ('funding_round', 'funding_total')`)
    .all() as { project_id: string; fact_key: string; amount_usd: number | null; detail_json: string }[];
  const stageByProject = new Map<string, { stage: string; rank: number }>();
  const amountByProject = new Map<string, number>();
  for (const row of fundingRows) {
    if (row.amount_usd && row.amount_usd > (amountByProject.get(row.project_id) ?? 0)) amountByProject.set(row.project_id, row.amount_usd);
    if (row.fact_key !== "funding_round") continue;
    let stage: string | null = null;
    try {
      const detail = JSON.parse(row.detail_json || "{}") as { stage?: unknown };
      if (typeof detail.stage === "string" && detail.stage.trim()) stage = detail.stage.trim();
    } catch {
      stage = null;
    }
    if (!stage) continue;
    const rank = STAGE_RANK[stage.toLowerCase()] ?? 0;
    const prev = stageByProject.get(row.project_id);
    if (!prev || rank >= prev.rank) stageByProject.set(row.project_id, { stage, rank });
  }

  const programs = db
    .prepare(
      `SELECT p.id, p.name FROM projects p
       WHERE p.kind = 'project' AND (
         p.id IN (
           SELECT source_entity_id FROM relationships
           WHERE relationship_type = 'affiliated_with' AND source_entity_type = 'project' AND target_entity_type = 'university'
         )
         OR p.id IN (
           SELECT project_id FROM person_project_roles GROUP BY project_id HAVING COUNT(DISTINCT person_id) >= 8
         )
       )`
    )
    .all() as { id: string; name: string }[];
  const programIds = new Set(programs.map((row) => row.id));

  const founderRows = db
    .prepare(
      `SELECT ppr.person_id, ppr.project_id
       FROM person_project_roles ppr
       JOIN projects p ON p.id = ppr.project_id
       WHERE p.kind = 'company' AND p.is_investable_candidate = 1 AND ppr.role LIKE '%founder%'`
    )
    .all() as { person_id: string; project_id: string }[];

  const memberRows = db
    .prepare(
      `SELECT person_id, project_id FROM person_project_roles
       WHERE project_id IN (SELECT p.id FROM projects p WHERE p.kind = 'project')`
    )
    .all() as { person_id: string; project_id: string }[];

  const investorRows = db
    .prepare(`SELECT project_id, value_text FROM company_facts WHERE fact_key = 'investor' AND length(trim(value_text)) >= 2`)
    .all() as { project_id: string; value_text: string }[];

  const drfRows = db
    .prepare(`SELECT project_id FROM portfolio_memberships WHERE match_status = 'confirmed' AND project_id IS NOT NULL`)
    .all() as { project_id: string }[];

  const foundersByCompany = new Map<string, string[]>();
  for (const row of founderRows) {
    if (!personIds.has(row.person_id) || !startupIds.has(row.project_id)) continue;
    const list = foundersByCompany.get(row.project_id) ?? [];
    if (!list.includes(row.person_id)) list.push(row.person_id);
    foundersByCompany.set(row.project_id, list);
  }

  const degree = new Map<string, number>();
  const bump = (id: string) => degree.set(id, (degree.get(id) ?? 0) + 1);

  const edgeKey = new Set<string>();
  const edges: MapEdge[] = [];
  const addEdge = (source: string, target: string, type: MapEdgeType) => {
    const key = `${source}|${target}|${type}`;
    if (edgeKey.has(key)) return;
    edgeKey.add(key);
    edges.push({ source, target, type });
    bump(source);
    bump(target);
  };

  for (const [personId, campuses] of campusesByPerson) {
    for (const campusId of campuses) addEdge(personId, campusId, "studied_at");
  }
  for (const [companyId, founders] of foundersByCompany) {
    for (const personId of founders) addEdge(personId, companyId, "founded");
    if (founders.length >= 2 && founders.length <= 8) {
      for (let i = 0; i < founders.length; i++) {
        for (let j = i + 1; j < founders.length; j++) addEdge(founders[i], founders[j], "co_founder");
      }
    }
  }
  for (const row of memberRows) {
    if (!programIds.has(row.project_id) || !personIds.has(row.person_id)) continue;
    addEdge(row.person_id, row.project_id, "member_of");
  }

  const investorNames = new Map<string, string>();
  for (const row of investorRows) {
    if (!startupIds.has(row.project_id)) continue;
    const name = row.value_text.replace(/\s+/g, " ").trim();
    if (!name) continue;
    const id = investorId(name);
    investorNames.set(id, name);
    addEdge(id, row.project_id, "invested_in");
  }
  const drfTargets = drfRows.filter((row) => startupIds.has(row.project_id));
  if (drfTargets.length) {
    investorNames.set(DRF_ID, "Dorm Room Fund");
    for (const row of drfTargets) addEdge(DRF_ID, row.project_id, "invested_in");
  }

  const hotspots = hotspotGraphPatch({ personIds, startupIds, universityIds: uniIds });
  for (const add of hotspots.campusAdds) {
    const list = campusesByCompany.get(add.id) ?? [];
    if (!list.includes(add.campusId)) list.push(add.campusId);
    campusesByCompany.set(add.id, list);
  }
  for (const edge of hotspots.edges) addEdge(edge.source, edge.target, edge.type);

  const counts = new Map<string, number>();
  for (const campuses of campusesByPerson.values()) {
    const id = campuses[0];
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const placed = universities
    .filter((row) => uniIds.has(row.id))
    .map((row) => ({ id: row.id, n: counts.get(row.id) ?? 0 }))
    .sort((a, b) => b.n - a.n || a.id.localeCompare(b.id));

  const anchor = new Map<string, { x: number; y: number }>();
  const ring = 2400;
  placed.forEach((row, index) => {
    const angle = (index / Math.max(placed.length, 1)) * Math.PI * 2 - Math.PI / 2;
    anchor.set(row.id, { x: Math.cos(angle) * ring, y: Math.sin(angle) * ring });
  });

  function primaryAnchor(ids: string[]): { x: number; y: number } {
    const known = ids.map((id) => anchor.get(id)).filter((item): item is { x: number; y: number } => !!item);
    if (!known.length) return { x: 0, y: 0 };
    return {
      x: known.reduce((sum, item) => sum + item.x, 0) / known.length,
      y: known.reduce((sum, item) => sum + item.y, 0) / known.length,
    };
  }

  const seat = new Map<string, number>();
  function spiral(key: string): { x: number; y: number } {
    const n = seat.get(key) ?? 0;
    seat.set(key, n + 1);
    const angle = n * 2.399963229728653;
    const dist = 18 * Math.sqrt(n + 0.5);
    return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist };
  }

  const simNodes: SimNode[] = [];
  const pushNode = (id: string, type: MapNodeType, campusIds: string[], tier: string | null, amount: number | null) => {
    const spot = primaryAnchor(campusIds);
    const key = campusIds.length ? [...campusIds].sort().join(",") : "none";
    const j = type === "campus" ? { x: 0, y: 0 } : spiral(key);
    const node: SimNode = {
      id,
      type,
      r: 4,
      x: spot.x + j.x,
      y: spot.y + j.y,
      anchorX: spot.x + (type === "program" ? j.x * 0.25 : 0),
      anchorY: spot.y + (type === "program" ? j.y * 0.25 : 0),
    };
    node.r = radius(type, degree.get(id) ?? 0, tier, amount);
    simNodes.push(node);
  };

  for (const uni of universities) {
    if (!anchor.has(uni.id)) continue;
    pushNode(uni.id, "campus", [uni.id], null, null);
  }
  for (const person of people) pushNode(person.id, "person", campusesByPerson.get(person.id) ?? [], person.signal_tier, null);
  for (const startup of startups) {
    const fromFounders = (foundersByCompany.get(startup.id) ?? []).flatMap((id) => campusesByPerson.get(id) ?? []);
    const campuses = campusesByCompany.get(startup.id) ?? [...new Set(fromFounders)];
    pushNode(startup.id, "startup", campuses, startup.signal_tier, amountByProject.get(startup.id) ?? null);
  }
  for (const program of programs) {
    const campuses = campusesByCompany.get(program.id) ?? [];
    pushNode(program.id, "program", campuses, null, null);
  }
  for (const program of hotspots.programs) {
    pushNode(program.id, "program", program.campuses, null, null);
  }

  const startupAnchor = new Map<string, { x: number; y: number }>();
  for (const node of simNodes) {
    if (node.type === "startup") startupAnchor.set(node.id, { x: node.x, y: node.y });
  }
  const investorAnchor = new Map<string, { x: number; y: number; n: number }>();
  for (const edge of edges) {
    if (edge.type !== "invested_in") continue;
    const spot = startupAnchor.get(edge.target);
    if (!spot) continue;
    const prev = investorAnchor.get(edge.source) ?? { x: 0, y: 0, n: 0 };
    prev.x += spot.x;
    prev.y += spot.y;
    prev.n += 1;
    investorAnchor.set(edge.source, prev);
  }
  for (const [id] of investorNames) {
    const spot = investorAnchor.get(id);
    const nodeAnchor = spot && spot.n ? { x: spot.x / spot.n, y: spot.y / spot.n } : { x: 2800, y: 900 };
    simNodes.push({
      id,
      type: "investor",
      r: radius("investor", degree.get(id) ?? 0, null, null),
      x: nodeAnchor.x,
      y: nodeAnchor.y,
      anchorX: nodeAnchor.x,
      anchorY: nodeAnchor.y,
    });
  }

  settleForceAtlas(simNodes, edges);

  const pos = new Map(simNodes.map((node) => [node.id, node]));
  const nodes: MapNode[] = [];
  const founderIds = new Set<string>();
  for (const ids of foundersByCompany.values()) for (const id of ids) founderIds.add(id);

  const emit = (node: Omit<MapNode, "year" | "founder" | "degree"> & { year?: number | null; founder?: boolean }) => {
    const at = pos.get(node.id);
    if (!at) return;
    node.x = Math.round(at.x);
    node.y = Math.round(at.y);
    node.r = Math.round(at.r * 10) / 10;
    nodes.push({
      ...node,
      year: node.year ?? null,
      founder: node.founder ?? false,
      degree: degree.get(node.id) ?? 0,
    });
  };

  for (const uni of universities) {
    if (!anchor.has(uni.id)) continue;
    emit({
      id: uni.id,
      type: "campus",
      label: campusName.get(uni.id) ?? uni.name,
      x: 0,
      y: 0,
      r: 18,
      campus: uni.id,
      sector: null,
      tier: null,
      stage: null,
      enroll: null,
      potential: false,
    });
  }
  for (const person of people) {
    const campuses = campusesByPerson.get(person.id) ?? [];
    const linkedin = linkedinByPerson.get(person.id);
    emit({
      id: person.id,
      type: "person",
      label: person.name,
      x: 0,
      y: 0,
      r: 3,
      campus: campuses[0] ?? null,
      campuses: campuses.length > 1 ? campuses : undefined,
      sector: null,
      tier: person.signal_tier,
      stage: null,
      enroll: person.enrollment_status ?? "unknown",
      year: classYear(person.enrollment_grad_year, person.enrollment_label),
      founder: founderIds.has(person.id),
      potential: person.founder_status === "potential",
      ...(linkedin ? { linkedinUrl: linkedin.url, linkedinStatus: linkedin.status } : {}),
    });
  }
  for (const startup of startups) {
    const fromFounders = (foundersByCompany.get(startup.id) ?? []).flatMap((id) => campusesByPerson.get(id) ?? []);
    const campuses = campusesByCompany.get(startup.id)?.length ? campusesByCompany.get(startup.id)! : [...new Set(fromFounders)];
    emit({
      id: startup.id,
      type: "startup",
      label: startup.name,
      x: 0,
      y: 0,
      r: 5,
      campus: campuses[0] ?? null,
      campuses: campuses.length > 1 ? campuses : undefined,
      sector: sectorByProject.get(startup.id) ?? null,
      tier: startup.signal_tier,
      stage: stageByProject.get(startup.id)?.stage ?? null,
      enroll: null,
      potential: false,
    });
  }
  for (const program of programs) {
    const campuses = campusesByCompany.get(program.id) ?? [];
    emit({
      id: program.id,
      type: "program",
      label: program.name,
      x: 0,
      y: 0,
      r: 9,
      campus: campuses[0] ?? null,
      campuses: campuses.length > 1 ? campuses : undefined,
      sector: null,
      tier: null,
      stage: null,
      enroll: null,
      potential: false,
    });
  }
  for (const program of hotspots.programs) {
    emit({
      id: program.id,
      type: "program",
      label: program.label,
      x: 0,
      y: 0,
      r: 9,
      campus: program.campuses[0] ?? null,
      campuses: program.campuses.length > 1 ? program.campuses : undefined,
      sector: null,
      tier: null,
      stage: null,
      enroll: null,
      potential: false,
    });
  }
  for (const [id, name] of investorNames) {
    emit({
      id,
      type: "investor",
      label: name,
      x: 0,
      y: 0,
      r: 8,
      campus: null,
      sector: null,
      tier: null,
      stage: null,
      enroll: null,
      potential: false,
    });
  }

  const keep = new Set(nodes.map((node) => node.id));
  const keptEdges = edges.filter((edge) => keep.has(edge.source) && keep.has(edge.target));
  const graph = {
    nodes,
    edges: keptEdges,
    counts: {
      people: nodes.filter((node) => node.type === "person").length,
      startups: nodes.filter((node) => node.type === "startup").length,
      campuses: nodes.filter((node) => node.type === "campus").length,
      investors: nodes.filter((node) => node.type === "investor").length,
      programs: nodes.filter((node) => node.type === "program").length,
    },
  };
  return graph;
}

/** Run ForceAtlas2 to a stop, then a noverlap pass so stacked nodes separate. Positions stay fixed after this returns. */
function settleForceAtlas(simNodes: SimNode[], edges: MapEdge[]) {
  const g = new Graph({ type: "undirected", multi: true });
  for (const node of simNodes) g.addNode(node.id, { x: node.x, y: node.y });
  for (const edge of edges) {
    const weight = LAYOUT_WEIGHT[edge.type];
    if (!weight || edge.source === edge.target || !g.hasNode(edge.source) || !g.hasNode(edge.target)) continue;
    g.addEdge(edge.source, edge.target, { weight });
  }
  const inferred = forceAtlas2.inferSettings(g);
  forceAtlas2.assign(g, {
    iterations: 220,
    settings: {
      ...inferred,
      barnesHutOptimize: true,
      barnesHutTheta: 0.5,
      gravity: 0.14,
      scalingRatio: 16,
      linLogMode: true,
      outboundAttractionDistribution: true,
      edgeWeightInfluence: 1,
      slowDown: 8,
      strongGravityMode: false,
      adjustSizes: false,
    },
    getEdgeWeight: "weight",
  });
  separateOverlaps(g, simNodes);
  for (const node of simNodes) {
    const at = g.getNodeAttributes(node.id);
    node.x = at.x;
    node.y = at.y;
  }
}

const OVERLAP_PX: Record<MapNodeType, number> = {
  person: 2.6,
  startup: 3.4,
  investor: 3.8,
  program: 3.6,
  campus: 7,
};

/** Push colliding nodes apart in graph units that survive the camera fit (a few screen pixels). */
function separateOverlaps(g: Graph, simNodes: SimNode[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  g.forEachNode((_, at) => {
    if (!Number.isFinite(at.x) || !Number.isFinite(at.y)) return;
    minX = Math.min(minX, at.x);
    minY = Math.min(minY, at.y);
    maxX = Math.max(maxX, at.x);
    maxY = Math.max(maxY, at.y);
  });
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const unit = span / 980;
  const byId = new Map(simNodes.map((node) => [node.id, node.type]));
  g.forEachNode((id) => {
    g.setNodeAttribute(id, "size", (OVERLAP_PX[byId.get(id) ?? "person"] ?? 2.6) * unit);
  });
  noverlap.assign(g, {
    maxIterations: 120,
    settings: {
      margin: 1.2 * unit,
      ratio: 1,
      expansion: 1.2,
      gridSize: 56,
      speed: 3,
    },
  });
}
