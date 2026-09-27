// Full evidence graph for the Network map. Nodes and edges come from
// affiliations, founder roles, program memberships, sourced investor facts,
// and confirmed DRF portfolio matches. Positions are a cached ForceAtlas2
// layout: each campus and large organization is settled on its own, then
// the clusters are packed on a ring so the browser only draws.

import fs from "node:fs";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import noverlap from "graphology-layout-noverlap";
import { databasePath, getDb } from "../db/client";
import { CAMPUSES } from "./campuses";
import type { HotspotSectionId, HotspotTier } from "./hotspot-model";
import { hotspotGraphPatch, organizationMap } from "./hotspots";
import { confirmedLinkedIn } from "./person-link";
import { sectorLabel } from "./sectors";

export type MapNodeType = "person" | "startup" | "campus" | "investor" | "program" | "organization";
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
  /** verified | inferred. Inferred buckets show as est. on the map. */
  enrollBasis?: "verified" | "inferred" | null;
  /** Graduation year when a sourced class year exists. */
  year: number | null;
  /** True when this person has a sourced founder role on a startup in the map. */
  founder: boolean;
  /** Incident edges. Drives node size together with funding. */
  degree: number;
  potential: boolean;
  /** Stored linkedin.com/in path. Omitted when the person has neither a confirmed alias nor an unverified candidate. */
  linkedinUrl?: string;
  linkedinStatus?: "confirmed" | "unverified";
  /** Directory tier for an organization node. Absent on every other type. */
  orgTier?: HotspotTier;
  /** Hotspot sections this organization appears in. */
  orgSections?: HotspotSectionId[];
  /** People with a stored link to this organization. */
  linkedPeople?: number;
  /** Linked people who also have a founder role on a startup in the map. */
  linkedFounders?: number;
  /** Investable startups with a stored link to this organization. */
  linkedStartups?: number;
}

export interface MapEdge {
  source: string;
  target: string;
  type: MapEdgeType;
}

export interface MapGraph {
  nodes: MapNode[];
  edges: MapEdge[];
  counts: { people: number; startups: number; campuses: number; investors: number; programs: number; organizations: number };
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
  layoutPx?: number;
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

const LAYOUT_VERSION = "8";

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

  const peopleColumns = new Set((db.prepare(`PRAGMA table_info(people)`).all() as { name: string }[]).map((column) => column.name));
  const basisSql = peopleColumns.has("enrollment_basis") ? "enrollment_basis" : "NULL AS enrollment_basis";
  const people = db
    .prepare(
      `SELECT id, name, aliases_json, founder_status, enrollment_status, enrollment_label, enrollment_grad_year, signal_tier, ${basisSql} FROM people
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
    enrollment_basis: string | null;
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
  const founderIds = new Set<string>();
  for (const ids of foundersByCompany.values()) for (const id of ids) founderIds.add(id);
  const organizations = organizationMap({ personIds, startupIds, founderIds, universityIds: uniIds });
  for (const edge of organizations.edges) addEdge(edge.source, edge.target, edge.type);

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
    return node;
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
  for (const org of organizations.nodes) {
    const node = pushNode(org.id, "organization", org.campuses, org.tier, null);
    node.layoutPx = org.tier === "S" ? 4.2 : org.tier === "A" ? 3.6 : org.tier === "B" ? 3.1 : 2.6;
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

  const emit = (node: Omit<MapNode, "year" | "founder" | "degree"> & { year?: number | null; founder?: boolean }) => {
    const at = pos.get(node.id);
    if (!at) return;
    node.x = Math.round(at.x * 10) / 10;
    node.y = Math.round(at.y * 10) / 10;
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
      enroll: person.enrollment_status === "current_student" || person.enrollment_status === "recent_grad" || person.enrollment_status === "older_alumni" ? person.enrollment_status : null,
      enrollBasis: person.enrollment_basis === "inferred" || person.enrollment_basis === "verified" ? person.enrollment_basis : null,
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
  for (const org of organizations.nodes) {
    emit({
      id: org.id,
      type: "organization",
      label: org.label,
      x: 0,
      y: 0,
      r: 8,
      campus: org.campuses[0] ?? null,
      campuses: org.campuses.length > 1 ? org.campuses : undefined,
      sector: null,
      tier: null,
      stage: null,
      enroll: null,
      potential: false,
      orgTier: org.tier,
      orgSections: org.sections,
      linkedPeople: org.linkedPeople,
      linkedFounders: org.linkedFounders,
      linkedStartups: org.linkedStartups,
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
      organizations: nodes.filter((node) => node.type === "organization").length,
    },
  };
  return graph;
}

/** Organizations this connected become their own island (YC, Mayfield, PennApps) instead of a spoke into a campus disc. */
const HUB_DEGREE = 36;

/**
 * ForceAtlas2 runs once per cluster, then the clusters are packed apart.
 * A single global pass pulls every campus into one hairball through YC,
 * Mayfield, and the investor bridges. Positions stay fixed after this returns.
 */
function settleForceAtlas(simNodes: SimNode[], edges: MapEdge[]) {
  const byId = new Map(simNodes.map((node) => [node.id, node]));
  const degree = new Map<string, number>();
  const memberships = new Map<string, string[]>();
  const membersOf = new Map<string, string[]>();
  const foundersOf = new Map<string, string[]>();
  const campusesOf = new Map<string, string[]>();
  const portfolio = new Map<string, string[]>();
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    if (edge.type === "member_of") {
      const orgs = memberships.get(edge.source) ?? [];
      orgs.push(edge.target);
      memberships.set(edge.source, orgs);
      const people = membersOf.get(edge.target) ?? [];
      people.push(edge.source);
      membersOf.set(edge.target, people);
    } else if (edge.type === "founded") {
      const founders = foundersOf.get(edge.target) ?? [];
      founders.push(edge.source);
      foundersOf.set(edge.target, founders);
    } else if (edge.type === "studied_at" || edge.type === "at_campus") {
      const campuses = campusesOf.get(edge.source) ?? [];
      campuses.push(edge.target);
      campusesOf.set(edge.source, campuses);
    } else if (edge.type === "invested_in") {
      const startups = portfolio.get(edge.source) ?? [];
      startups.push(edge.target);
      portfolio.set(edge.source, startups);
    }
  }

  const hubs = new Set<string>();
  for (const node of simNodes) {
    if (node.type === "organization" && (degree.get(node.id) ?? 0) >= HUB_DEGREE) hubs.add(node.id);
  }

  const home = new Map<string, string>();
  for (const node of simNodes) {
    if (node.type === "campus" || hubs.has(node.id)) home.set(node.id, node.id);
  }

  const bestHub = (ids: string[]): string | null => {
    let best: string | null = null;
    let score = -1;
    for (const id of ids) {
      if (!hubs.has(id)) continue;
      const next = degree.get(id) ?? 0;
      if (next > score) {
        score = next;
        best = id;
      }
    }
    return best;
  };
  const campusHome = (id: string): string | null => (campusesOf.get(id) ?? []).find((campus) => byId.get(campus)?.type === "campus") ?? null;
  const majority = (votes: Map<string, number>): string | null => {
    let best: string | null = null;
    let score = 0;
    for (const [key, count] of votes) {
      if (count > score) {
        score = count;
        best = key;
      }
    }
    return best;
  };

  for (const node of simNodes) {
    if (node.type !== "person" || home.has(node.id)) continue;
    home.set(node.id, bestHub(memberships.get(node.id) ?? []) ?? campusHome(node.id) ?? "loose");
  }
  for (const node of simNodes) {
    if (node.type !== "startup" || home.has(node.id)) continue;
    const votes = new Map<string, number>();
    for (const person of foundersOf.get(node.id) ?? []) {
      const key = home.get(person);
      if (key) votes.set(key, (votes.get(key) ?? 0) + 1);
    }
    home.set(node.id, majority(votes) ?? campusHome(node.id) ?? "loose");
  }
  for (const node of simNodes) {
    if (home.has(node.id) || (node.type !== "program" && node.type !== "organization")) continue;
    const votes = new Map<string, number>();
    for (const person of membersOf.get(node.id) ?? []) {
      const key = home.get(person);
      if (key && key !== "loose") votes.set(key, (votes.get(key) ?? 0) + 1);
    }
    home.set(node.id, majority(votes) ?? campusHome(node.id) ?? "loose");
  }
  const bridgeNodes: SimNode[] = [];
  const bridgeIds = new Set<string>();
  for (const node of simNodes) {
    if (node.type !== "investor" || home.has(node.id)) continue;
    const votes = new Map<string, number>();
    let total = 0;
    for (const startup of portfolio.get(node.id) ?? []) {
      const key = home.get(startup);
      if (!key || key === "loose") continue;
      total += 1;
      votes.set(key, (votes.get(key) ?? 0) + 1);
    }
    let best: string | null = null;
    let score = 0;
    for (const [key, count] of votes) {
      if (count > score) {
        score = count;
        best = key;
      }
    }
    if (best && score >= Math.max(3, total * 0.55)) home.set(node.id, best);
    else {
      bridgeNodes.push(node);
      bridgeIds.add(node.id);
    }
  }
  for (const node of simNodes) if (!home.has(node.id) && !bridgeIds.has(node.id)) home.set(node.id, "loose");

  const groups = new Map<string, SimNode[]>();
  for (const node of simNodes) {
    if (bridgeIds.has(node.id)) continue;
    const key = home.get(node.id) ?? "loose";
    const list = groups.get(key) ?? [];
    list.push(node);
    groups.set(key, list);
  }

  const packed: { nodes: SimNode[]; r: number }[] = [];
  for (const [key, nodes] of groups) {
    layoutCluster(nodes, edges, key);
    let r = 20;
    for (const node of nodes) r = Math.max(r, Math.hypot(node.x, node.y) + 12);
    packed.push({ nodes, r });
  }
  packed.sort((a, b) => b.r - a.r || b.nodes.length - a.nodes.length);
  const ordered: typeof packed = [];
  const pending = [...packed];
  while (pending.length) {
    ordered.push(pending.shift()!);
    if (pending.length) ordered.push(pending.pop()!);
  }
  const gap = 56;
  const circumference = ordered.reduce((sum, group) => sum + group.r * 2 + gap, 0);
  const ring = Math.max(120, (circumference / (2 * Math.PI)) * 1.12);
  let angle = -Math.PI / 2;
  for (const group of ordered) {
    const step = (group.r * 2 + gap) / ring;
    angle += step / 2;
    const cx = Math.cos(angle) * ring;
    const cy = Math.sin(angle) * ring;
    angle += step / 2;
    for (const node of group.nodes) {
      node.x += cx;
      node.y += cy;
    }
  }
  placeBridgeInvestors(bridgeNodes, portfolio, byId);
}

/** Lay one campus or organization out around its anchor, then stop. */
function layoutCluster(nodes: SimNode[], edges: MapEdge[], key: string) {
  const anchor = nodes.find((node) => node.id === key) ?? nodes.find((node) => node.type === "campus" || node.type === "organization");
  if (nodes.length === 1) {
    nodes[0].x = 0;
    nodes[0].y = 0;
    return;
  }
  const g = new Graph({ type: "undirected" });
  let seat = 0;
  for (const node of nodes) {
    if (anchor && node.id === anchor.id) {
      node.x = 0;
      node.y = 0;
    } else {
      const angle = seat * 2.399963229728653;
      const dist = 7 * Math.sqrt(seat + 1);
      seat += 1;
      node.x = Math.cos(angle) * dist;
      node.y = Math.sin(angle) * dist;
    }
    g.addNode(node.id, { x: node.x, y: node.y });
  }
  const ids = new Set(nodes.map((node) => node.id));
  let linked = 0;
  for (const edge of edges) {
    const weight = LAYOUT_WEIGHT[edge.type];
    if (!weight || edge.source === edge.target || !ids.has(edge.source) || !ids.has(edge.target)) continue;
    if (!g.hasNode(edge.source) || !g.hasNode(edge.target)) continue;
    if (g.hasEdge(edge.source, edge.target)) {
      const existing = g.edge(edge.source, edge.target);
      if (weight > g.getEdgeAttribute(existing, "weight")) g.setEdgeAttribute(existing, "weight", weight);
      continue;
    }
    g.addEdge(edge.source, edge.target, { weight });
    linked += 1;
  }
  if (linked > 0) {
    forceAtlas2.assign(g, {
      iterations: Math.round(Math.min(160, 48 + nodes.length * 0.1)),
      settings: {
        barnesHutOptimize: nodes.length > 90,
        barnesHutTheta: 0.55,
        gravity: 0.55,
        scalingRatio: 12,
        linLogMode: true,
        outboundAttractionDistribution: true,
        edgeWeightInfluence: 0.45,
        slowDown: 5,
        strongGravityMode: false,
        adjustSizes: false,
      },
      getEdgeWeight: "weight",
    });
  }
  for (const node of nodes) {
    const at = g.getNodeAttributes(node.id);
    node.x = Number.isFinite(at.x) ? at.x : node.x;
    node.y = Number.isFinite(at.y) ? at.y : node.y;
  }
  let cx = 0;
  let cy = 0;
  for (const node of nodes) {
    cx += node.x;
    cy += node.y;
  }
  cx /= nodes.length;
  cy /= nodes.length;
  for (const node of nodes) {
    node.x -= cx;
    node.y -= cy;
    g.setNodeAttribute(node.id, "x", node.x);
    g.setNodeAttribute(node.id, "y", node.y);
  }
  if (anchor) {
    anchor.x = 0;
    anchor.y = 0;
    g.setNodeAttribute(anchor.id, "x", 0);
    g.setNodeAttribute(anchor.id, "y", 0);
  }
  let reach = 1;
  for (const node of nodes) reach = Math.max(reach, Math.hypot(node.x, node.y));
  const target = 12 + 1.35 * Math.sqrt(nodes.length);
  const scale = target / reach;
  for (const node of nodes) {
    node.x *= scale;
    node.y *= scale;
    g.setNodeAttribute(node.id, "x", node.x);
    g.setNodeAttribute(node.id, "y", node.y);
  }
  separateOverlaps(g, nodes);
  for (const node of nodes) {
    const at = g.getNodeAttributes(node.id);
    node.x = at.x;
    node.y = at.y;
  }
}

/** Investors that fund several clusters sit between those clusters, on the startups they actually back. */
function placeBridgeInvestors(nodes: SimNode[], portfolio: Map<string, string[]>, byId: Map<string, SimNode>) {
  if (!nodes.length) return;
  let n = 0;
  for (const node of nodes) {
    let x = 0;
    let y = 0;
    let count = 0;
    for (const startup of portfolio.get(node.id) ?? []) {
      const at = byId.get(startup);
      if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) continue;
      x += at.x;
      y += at.y;
      count += 1;
    }
    if (!count) {
      const angle = n * 2.399963229728653;
      const dist = 40 * Math.sqrt(n + 1);
      node.x = Math.cos(angle) * dist;
      node.y = Math.sin(angle) * dist;
    } else {
      node.x = x / count;
      node.y = y / count;
    }
    n += 1;
  }
  const g = new Graph({ type: "undirected" });
  for (const node of nodes) g.addNode(node.id, { x: node.x, y: node.y, size: 28 });
  noverlap.assign(g, { maxIterations: 40, settings: { margin: 18, ratio: 1.1, expansion: 1.3, gridSize: 20, speed: 4 } });
  for (const node of nodes) {
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
  organization: 4,
  campus: 7,
};

/** Push colliding nodes apart in graph units that survive the camera fit (a few screen pixels). */
function separateOverlaps(g: Graph, simNodes: SimNode[]) {
  const byId = new Map(simNodes.map((node) => [node.id, node]));
  g.forEachNode((id) => {
    const sim = byId.get(id);
    const px = sim?.layoutPx ?? OVERLAP_PX[sim?.type ?? "person"] ?? 2.6;
    g.setNodeAttribute(id, "size", Math.max(2.4, px));
  });
  noverlap.assign(g, {
    maxIterations: simNodes.length > 500 ? 80 : 70,
    settings: {
      margin: 0.35,
      ratio: 1,
      expansion: 1.1,
      gridSize: 28,
      speed: 2.4,
    },
  });
}
