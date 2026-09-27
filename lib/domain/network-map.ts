// Full evidence graph for the Network map. Nodes and edges come from
// affiliations, founder roles, program memberships, sourced investor facts,
// and confirmed DRF portfolio matches. Campuses in the same region start
// near each other. One free ForceAtlas2 pass, with gentle gravity toward
// the middle, lets that seed become an irregular galaxy: dense at the core,
// thin at the edges, with no clipped boundary.

import fs from "node:fs";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import noverlap from "graphology-layout-noverlap";
import { databasePath, getDb } from "../db/client";
import { CAMPUSES } from "./campuses";
import { REGIONS, placeCampuses, regionForCampus, type RegionMarker } from "./network-regions";
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
  /** Campus or hub organization. Its label is drawn at the cluster center on the fitted view. */
  anchor?: boolean;
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
  regions: RegionMarker[];
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
  /** Campus or hub organization. Its label sits on the cluster centroid. */
  anchor?: boolean;
  /** Campuses recorded on the node, used when it has no campus edge. */
  campuses?: string[];
}

/** Springs for one global ForceAtlas2 pass. Campus links hold people near their campus. Founding and investment links are shorter, so shared nodes sit between campuses. */
const LAYOUT_WEIGHT: Record<MapEdgeType, number> = {
  founded: 2.8,
  co_founder: 2.2,
  member_of: 1.6,
  invested_in: 2,
  studied_at: 0.32,
  at_campus: 0.32,
};

const LAYOUT_VERSION = "18";
/** How far apart region seeds start. ForceAtlas2 is free to move them. */
const SEED_RADIUS = 340;

/** The owner is dropping this organization. It must not seed a cluster. */
function droppedOrganization(label: string): boolean {
  return /^pennapps organising team$/i.test(label.trim());
}

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

  const universities = db.prepare(`SELECT id, name FROM universities ORDER BY name`).all() as { id: string; name: string }[];
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
  const droppedOrgs = new Set(organizations.nodes.filter((org) => droppedOrganization(org.label)).map((org) => org.id));
  organizations.nodes = organizations.nodes.filter((org) => !droppedOrgs.has(org.id));
  organizations.edges = organizations.edges.filter((edge) => !droppedOrgs.has(edge.source) && !droppedOrgs.has(edge.target));
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
      campuses: campusIds.filter((id) => id),
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
    node.layoutPx = org.tier === "S" ? 7 : org.tier === "A" ? 6.2 : org.tier === "B" ? 5.4 : 4.8;
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

  const campusLabels = new Map(universities.map((uni) => [uni.id, campusName.get(uni.id) ?? uni.name]));
  const regions = settleForceAtlas(simNodes, edges, campusLabels);

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
      ...(at.anchor ? { anchor: true } : {}),
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
    regions,
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

/** Organizations this connected seed their own cluster (YC, Mayfield) instead of sitting inside a campus. */
const HUB_DEGREE = 36;

/**
 * One global ForceAtlas2 pass. Nodes are seeded on their campus or hub so
 * communities start apart, then shared membership, founding, and investment
 * edges pull those communities toward each other. linLog and
 * outboundAttractionDistribution keep a hub from swallowing the map.
 */
function settleForceAtlas(simNodes: SimNode[], edges: MapEdge[], campusLabels: Map<string, string>): RegionMarker[] {
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
    home.set(node.id, campusHome(node.id) ?? bestHub(memberships.get(node.id) ?? []) ?? "loose");
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
  }
  for (const node of simNodes) if (!home.has(node.id)) home.set(node.id, "loose");

  const groups = new Map<string, SimNode[]>();
  for (const node of simNodes) {
    const key = home.get(node.id) ?? "loose";
    const list = groups.get(key) ?? [];
    list.push(node);
    groups.set(key, list);
  }

  // An organization only seeds a cluster when enough people call it their home.
  // Otherwise it sits with the campus or hub its members already share.
  const folded = new Set<string>();
  for (const [key, members] of groups) {
    const anchor = members.find((node) => node.id === key);
    if (!anchor || anchor.type !== "organization" || members.length >= 12) continue;
    folded.add(key);
  }
  for (const key of folded) {
    const members = groups.get(key) ?? [];
    const votes = new Map<string, number>();
    for (const personId of membersOf.get(key) ?? []) {
      const dest = home.get(personId);
      if (!dest || dest === key || folded.has(dest)) continue;
      votes.set(dest, (votes.get(dest) ?? 0) + 1);
    }
    let dest = "loose";
    let score = 0;
    for (const [id, count] of votes) {
      if (count > score) {
        score = count;
        dest = id;
      }
    }
    groups.delete(key);
    const list = groups.get(dest) ?? [];
    for (const member of members) {
      home.set(member.id, dest);
      list.push(member);
    }
    groups.set(dest, list);
  }

  const campusNodes = simNodes.filter((node) => node.type === "campus");
  const placed = placeCampuses(
    campusNodes.map((node) => ({ id: node.id, label: campusLabels.get(node.id) ?? node.id })),
    SEED_RADIUS,
  );
  const seats = placed.seats;
  const linkedCampuses = (node: SimNode): string[] => {
    const ids: string[] = [];
    if (node.type === "person") ids.push(...(campusesOf.get(node.id) ?? []));
    else if (node.type === "startup") for (const person of foundersOf.get(node.id) ?? []) ids.push(...(campusesOf.get(person) ?? []));
    else if (node.type === "program" || node.type === "organization") for (const person of membersOf.get(node.id) ?? []) ids.push(...(campusesOf.get(person) ?? []));
    else if (node.type === "investor") {
      for (const startup of portfolio.get(node.id) ?? []) for (const person of foundersOf.get(startup) ?? []) ids.push(...(campusesOf.get(person) ?? []));
    }
    return ids.filter((id) => seats.has(id));
  };
  const bridgeTarget = new Map<string, { x: number; y: number }>();
  const primary = new Map<string, string>();
  const spiralSeat = new Map<string, number>();
  for (const node of simNodes) {
    node.anchor = false;
    if (node.type === "campus") {
      const seat = seats.get(node.id);
      if (seat) {
        node.x = seat.x;
        node.y = seat.y;
        node.anchor = true;
      }
      continue;
    }
    const counts = new Map<string, number>();
    for (const id of linkedCampuses(node)) counts.set(id, (counts.get(id) ?? 0) + 1);
    if (counts.size === 0) for (const id of node.campuses ?? []) if (seats.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const total = ranked.reduce((sum, [, count]) => sum + count, 0);
    const top = ranked[0];
    const bridge = ranked.length >= 2 && !!top && top[1] / total < 0.62;
    if (!top) {
      let inherited: string | null = null;
      if (node.type === "person") {
        for (const org of memberships.get(node.id) ?? []) {
          inherited = (campusesOf.get(org) ?? []).find((id) => seats.has(id)) ?? null;
          if (inherited) break;
        }
      } else if (node.type === "organization" || node.type === "program") {
        inherited = (campusesOf.get(node.id) ?? []).find((id) => seats.has(id)) ?? null;
      }
      const seat = inherited ? seats.get(inherited) : undefined;
      if (inherited && seat) {
        primary.set(node.id, inherited);
        const n = spiralSeat.get(inherited) ?? 0;
        spiralSeat.set(inherited, n + 1);
        const theta = hashUnit(`${node.id}:a`) * Math.PI * 2;
        const unit = hashUnit(`${node.id}:r`);
        const dist = (4 + Math.pow(unit, 0.55) * (18 + 2.4 * Math.sqrt(n + 1))) * (0.72 + 0.56 * hashUnit(`${node.id}:s`));
        node.x = seat.x + Math.cos(theta) * dist;
        node.y = seat.y + Math.sin(theta) * dist;
        continue;
      }
      const theta = hashUnit(node.id) * Math.PI * 2;
      const dist = 20 + hashUnit(`${node.id}:r`) * 60;
      node.x = Math.cos(theta) * dist;
      node.y = Math.sin(theta) * dist;
      continue;
    }
    if (!bridge) {
      primary.set(node.id, top[0]);
      const seat = seats.get(top[0]);
      if (!seat) continue;
      const n = spiralSeat.get(top[0]) ?? 0;
      spiralSeat.set(top[0], n + 1);
      const theta = hashUnit(`${node.id}:a`) * Math.PI * 2;
      const unit = hashUnit(`${node.id}:r`);
      const dist = (4 + Math.pow(unit, 0.55) * (18 + 2.4 * Math.sqrt(n + 1))) * (0.72 + 0.56 * hashUnit(`${node.id}:s`));
      node.x = seat.x + Math.cos(theta) * dist;
      node.y = seat.y + Math.sin(theta) * dist;
      if (node.type === "organization" && (degree.get(node.id) ?? 0) >= HUB_DEGREE) node.anchor = true;
      continue;
    }
    let x = 0;
    let y = 0;
    let weight = 0;
    for (const [id, count] of ranked) {
      const seat = seats.get(id);
      if (!seat) continue;
      x += seat.x * count;
      y += seat.y * count;
      weight += count;
    }
    if (!weight) continue;
    const at = { x: (x / weight) * 0.55, y: (y / weight) * 0.55 };
    node.x = at.x;
    node.y = at.y;
    bridgeTarget.set(node.id, at);
    if ((node.type === "organization" || node.type === "investor") && (degree.get(node.id) ?? 0) >= HUB_DEGREE) node.anchor = true;
  }

  const g = new Graph({ type: "undirected" });
  for (const node of simNodes) g.addNode(node.id, { x: node.x, y: node.y });
  for (const edge of edges) {
    const weightValue = LAYOUT_WEIGHT[edge.type];
    if (!weightValue || edge.source === edge.target || !g.hasNode(edge.source) || !g.hasNode(edge.target)) continue;
    if (g.hasEdge(edge.source, edge.target)) {
      const existing = g.edge(edge.source, edge.target);
      if (weightValue > g.getEdgeAttribute(existing, "weight")) g.setEdgeAttribute(existing, "weight", weightValue);
      continue;
    }
    g.addEdge(edge.source, edge.target, { weight: weightValue });
  }
  // A light spring between campuses in the same region, so Philly stays next to Philly
  // without pinning anyone to a wedge.
  const campusIds = campusNodes.map((node) => node.id);
  for (let i = 0; i < campusIds.length; i++) {
    for (let j = i + 1; j < campusIds.length; j++) {
      const a = campusIds[i];
      const b = campusIds[j];
      if (regionForCampus(a, campusLabels.get(a) ?? "") !== regionForCampus(b, campusLabels.get(b) ?? "")) continue;
      if (g.hasEdge(a, b)) continue;
      g.addEdge(a, b, { weight: 1.1 });
    }
  }
  if (g.size > 0) {
    forceAtlas2.assign(g, {
      iterations: 150,
      settings: {
        barnesHutOptimize: true,
        barnesHutTheta: 0.5,
        gravity: 0.08,
        scalingRatio: 8,
        linLogMode: true,
        outboundAttractionDistribution: true,
        edgeWeightInfluence: 0.85,
        slowDown: 6,
        strongGravityMode: false,
        adjustSizes: false,
      },
      getEdgeWeight: "weight",
    });
  }
  for (const node of simNodes) {
    const at = g.getNodeAttributes(node.id);
    node.x = Number.isFinite(at.x) ? at.x : node.x;
    node.y = Number.isFinite(at.y) ? at.y : node.y;
  }
  for (const node of simNodes) {
    const target = bridgeTarget.get(node.id);
    if (!target) continue;
    node.x = node.x * 0.82 + target.x * 0.18;
    node.y = node.y * 0.82 + target.y * 0.18;
  }
  snapCampusCentroids(simNodes, primary);
  separateOverlaps(g, simNodes);
  for (const node of simNodes) {
    const at = g.getNodeAttributes(node.id);
    node.x = Number.isFinite(at.x) ? at.x : node.x;
    node.y = Number.isFinite(at.y) ? at.y : node.y;
  }
  snapCampusCentroids(simNodes, primary);
  gatherCampusOutliers(simNodes, primary);
  loosenRoundClusters(simNodes, primary);
  seatRegionLobes(simNodes, primary, campusLabels, linkedCampuses);
  separateSameRegionCampuses(simNodes, primary, campusLabels);
  fitLobes(simNodes, primary, campusLabels);
  pullMemberHubs(simNodes, edges);
  placeRegionLabels(placed.markers, simNodes);
  return placed.markers;
}

function hashUnit(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 33 + id.charCodeAt(i)) >>> 0;
  return (hash % 10000) / 10000;
}

/** Move each campus label onto the people who actually belong to it. */
function snapCampusCentroids(simNodes: SimNode[], primary: Map<string, string>) {
  const members = new Map<string, SimNode[]>();
  for (const node of simNodes) {
    const campus = primary.get(node.id);
    if (!campus) continue;
    const list = members.get(campus) ?? [];
    list.push(node);
    members.set(campus, list);
  }
  for (const node of simNodes) {
    if (node.type !== "campus") continue;
    const cluster = members.get(node.id) ?? [];
    node.anchor = true;
    if (cluster.length < 3) continue;
    let x = 0;
    let y = 0;
    for (const member of cluster) {
      x += member.x;
      y += member.y;
    }
    node.x = x / cluster.length;
    node.y = y / cluster.length;
  }
}

/** Keep a campus cloud from throwing a few nodes across the map. The core stays put. */
function gatherCampusOutliers(simNodes: SimNode[], primary: Map<string, string>) {
  const members = new Map<string, SimNode[]>();
  for (const node of simNodes) {
    if (node.type !== "person" && node.type !== "startup") continue;
    const campus = primary.get(node.id);
    if (!campus) continue;
    const list = members.get(campus) ?? [];
    list.push(node);
    members.set(campus, list);
  }
  for (const list of members.values()) {
    if (list.length < 12) continue;
    let cx = 0;
    let cy = 0;
    for (const node of list) {
      cx += node.x;
      cy += node.y;
    }
    cx /= list.length;
    cy /= list.length;
    const radii = list.map((node) => Math.hypot(node.x - cx, node.y - cy)).sort((a, b) => a - b);
    const median = radii[Math.floor(radii.length / 2)] || 1;
    const limit = Math.max(36, median * 2.5);
    for (const node of list) {
      const dx = node.x - cx;
      const dy = node.y - cy;
      const dist = Math.hypot(dx, dy);
      if (dist <= limit) continue;
      node.x = cx + (dx / dist) * limit;
      node.y = cy + (dy / dist) * limit;
    }
  }
}

/** Break a packed disc into a lumpy cloud. Smaller campuses are already irregular. */
function loosenRoundClusters(simNodes: SimNode[], primary: Map<string, string>) {
  const members = new Map<string, SimNode[]>();
  for (const node of simNodes) {
    if (node.type !== "person" && node.type !== "startup") continue;
    const campus = primary.get(node.id);
    if (!campus) continue;
    const list = members.get(campus) ?? [];
    list.push(node);
    members.set(campus, list);
  }
  for (const [campusId, list] of members) {
    if (list.length < 80) continue;
    let cx = 0;
    let cy = 0;
    for (const node of list) {
      cx += node.x;
      cy += node.y;
    }
    cx /= list.length;
    cy /= list.length;
    const bins = 12;
    const samples: number[][] = Array.from({ length: bins }, () => []);
    for (const node of list) {
      const dx = node.x - cx;
      const dy = node.y - cy;
      const bin = Math.min(bins - 1, Math.floor((((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2)) * bins)));
      samples[bin].push(Math.hypot(dx, dy));
    }
    const outer = samples.map((radii) => {
      if (!radii.length) return 0;
      const sorted = [...radii].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length * 0.75)] ?? 0;
    });
    const occupied = outer.filter((radius) => radius > 0);
    const hi = Math.max(...occupied);
    const lo = Math.min(...occupied);
    if (occupied.length < 8 || hi / Math.max(lo, 1) > 1.22) continue;
    const phase = hashUnit(campusId) * Math.PI * 2;
    for (const node of list) {
      const dx = node.x - cx;
      const dy = node.y - cy;
      const angle = Math.atan2(dy, dx);
      const wobble = 1.12 + 0.26 * Math.sin(angle * 3 + phase) + 0.14 * Math.sin(angle * 5 + phase * 2.1);
      node.x = cx + dx * wobble * 1.08;
      node.y = cy + dy * wobble * 0.9;
    }
  }
}

function regionOfNode(node: SimNode, primary: Map<string, string>, campusLabels: Map<string, string>): string | null {
  if (node.type === "campus") return regionForCampus(node.id, campusLabels.get(node.id) ?? "");
  const campus = primary.get(node.id);
  if (!campus) return null;
  return regionForCampus(campus, campusLabels.get(campus) ?? "");
}

/**
 * Park the five teams on an even ring. Each lobe keeps its internal shape.
 * International stays the small one. Oversized lobes shrink so none of them
 * covers half the map.
 */
function seatRegionLobes(
  simNodes: SimNode[],
  primary: Map<string, string>,
  campusLabels: Map<string, string>,
  linkedCampuses: (node: SimNode) => string[],
) {
  const groups = new Map<string, SimNode[]>();
  const strays: SimNode[] = [];
  for (const node of simNodes) {
    const region = regionOfNode(node, primary, campusLabels);
    if (!region) {
      strays.push(node);
      continue;
    }
    const list = groups.get(region) ?? [];
    list.push(node);
    groups.set(region, list);
  }
  const active = REGIONS.map((region) => region.id).filter((id) => (groups.get(id) ?? []).some((node) => node.type === "campus"));
  if (active.length < 2) return;
  const measured = active.map((id) => {
    const list = (groups.get(id) ?? []).filter((node) => node.type === "person" || node.type === "startup" || node.type === "campus");
    let cx = 0;
    let cy = 0;
    for (const node of list) {
      cx += node.x;
      cy += node.y;
    }
    const count = list.length || 1;
    cx /= count;
    cy /= count;
    const radii = list.map((node) => Math.hypot(node.x - cx, node.y - cy)).sort((a, b) => a - b);
    const radius = radii[Math.min(radii.length - 1, Math.floor(radii.length * 0.9))] || 1;
    return { id, cx, cy, radius, count: list.length };
  });
  const typical = [...measured.map((item) => item.radius)].sort((a, b) => a - b)[Math.floor(measured.length / 2)] ?? 80;
  const cap = Math.max(70, typical * 0.92);
  const ring = (cap * 3.05) / (2 * Math.sin(Math.PI / active.length));
  const byId = new Map(simNodes.map((node) => [node.id, node]));
  active.forEach((id, index) => {
    const stat = measured.find((item) => item.id === id);
    const list = groups.get(id) ?? [];
    if (!stat || !list.length) return;
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / active.length;
    const targetX = Math.cos(angle) * ring;
    const targetY = Math.sin(angle) * ring;
    const limit = id === "international" ? cap * 0.58 : cap;
    const scale = Math.min(limit / stat.radius, id === "international" ? 1 : 1.08);
    const maxOffset = limit * 1.22;
    for (const node of list) {
      let dx = (node.x - stat.cx) * scale;
      let dy = (node.y - stat.cy) * scale;
      const dist = Math.hypot(dx, dy);
      if (dist > maxOffset) {
        dx *= maxOffset / dist;
        dy *= maxOffset / dist;
      }
      node.x = targetX + dx;
      node.y = targetY + dy;
    }
  });
  for (const node of strays) {
    const ids = linkedCampuses(node).filter((id) => byId.get(id)?.type === "campus");
    if (!ids.length) {
      node.x *= 0.35;
      node.y *= 0.35;
      continue;
    }
    let x = 0;
    let y = 0;
    for (const id of ids) {
      const campus = byId.get(id);
      if (!campus) continue;
      x += campus.x;
      y += campus.y;
    }
    x /= ids.length;
    y /= ids.length;
    const jitter = 10 + hashUnit(node.id) * 16;
    const theta = hashUnit(`${node.id}:j`) * Math.PI * 2;
    node.x = x * 0.62 + Math.cos(theta) * jitter;
    node.y = y * 0.62 + Math.sin(theta) * jitter;
  }
}

/** Ease campuses in the same team apart so their names can both sit on the lobe. */
function separateSameRegionCampuses(simNodes: SimNode[], primary: Map<string, string>, campusLabels: Map<string, string>) {
  const campuses = simNodes.filter((node) => node.type === "campus");
  const members = new Map<string, SimNode[]>();
  for (const node of simNodes) {
    const campus = primary.get(node.id);
    if (!campus) continue;
    const list = members.get(campus) ?? [];
    list.push(node);
    members.set(campus, list);
  }
  const shift = (campus: SimNode, dx: number, dy: number) => {
    campus.x += dx;
    campus.y += dy;
    for (const member of members.get(campus.id) ?? []) {
      member.x += dx;
      member.y += dy;
    }
  };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const node of simNodes) {
    minX = Math.min(minX, node.x);
    maxX = Math.max(maxX, node.x);
    minY = Math.min(minY, node.y);
    maxY = Math.max(maxY, node.y);
  }
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const minDist = span * (16 / 740);
  const regionOf = new Map(campuses.map((campus) => [campus.id, regionForCampus(campus.id, campusLabels.get(campus.id) ?? "")]));
  for (let iter = 0; iter < 8; iter++) {
    for (let i = 0; i < campuses.length; i++) {
      for (let j = i + 1; j < campuses.length; j++) {
        const a = campuses[i];
        const b = campuses[j];
        if (regionOf.get(a.id) !== regionOf.get(b.id)) continue;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);
        if (dist >= minDist) continue;
        if (dist < 1) {
          const angle = hashUnit(`${a.id}:${b.id}`) * Math.PI * 2;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          dist = 1;
        }
        const mid = Math.atan2((a.y + b.y) / 2, (a.x + b.x) / 2);
        const tx = Math.cos(mid + Math.PI / 2);
        const ty = Math.sin(mid + Math.PI / 2);
        const along = dx * tx + dy * ty;
        const dir = along >= 0 ? 1 : -1;
        const push = (minDist - Math.abs(along)) / 2;
        shift(a, -tx * dir * push, -ty * dir * push);
        shift(b, tx * dir * push, ty * dir * push);
      }
    }
  }
}

/** Shrink any team that still spills across the ring, so the five lobes stay similar and apart. */
function fitLobes(simNodes: SimNode[], primary: Map<string, string>, campusLabels: Map<string, string>) {
  const groups = new Map<string, SimNode[]>();
  for (const node of simNodes) {
    const region = regionOfNode(node, primary, campusLabels);
    if (!region) continue;
    const list = groups.get(region) ?? [];
    list.push(node);
    groups.set(region, list);
  }
  const stats = [...groups.entries()].map(([id, list]) => {
    const body = list.filter((node) => node.type === "person" || node.type === "startup" || node.type === "campus");
    const sample = body.length ? body : list;
    let cx = 0;
    let cy = 0;
    for (const node of sample) {
      cx += node.x;
      cy += node.y;
    }
    cx /= sample.length;
    cy /= sample.length;
    const radii = sample.map((node) => Math.hypot(node.x - cx, node.y - cy)).sort((a, b) => a - b);
    const radius = radii[Math.min(radii.length - 1, Math.floor(radii.length * 0.9))] || 1;
    return { id, list, cx, cy, radius, ring: Math.hypot(cx, cy) };
  });
  if (stats.length < 2) return;
  const meanRing = stats.reduce((sum, stat) => sum + stat.ring, 0) / stats.length;
  for (const stat of stats) {
    const fraction = stat.id === "international" ? 0.16 : 0.27;
    const limit = Math.max(80, meanRing * fraction);
    const scale = Math.min(1, limit / stat.radius);
    if (scale > 0.98) continue;
    for (const node of stat.list) {
      node.x = stat.cx + (node.x - stat.cx) * scale;
      node.y = stat.cy + (node.y - stat.cy) * scale;
    }
  }
}

/** Draw a high-degree organization into the people it actually connects, instead of leaving it out on a fan of long edges. */
function pullMemberHubs(simNodes: SimNode[], edges: MapEdge[]) {
  const byId = new Map(simNodes.map((node) => [node.id, node]));
  const neighbors = new Map<string, SimNode[]>();
  const add = (id: string, other: SimNode) => {
    const list = neighbors.get(id);
    if (list) list.push(other);
    else neighbors.set(id, [other]);
  };
  for (const edge of edges) {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) continue;
    add(source.id, target);
    add(target.id, source);
  }
  let mapX = 0;
  let mapY = 0;
  for (const node of simNodes) {
    mapX += node.x;
    mapY += node.y;
  }
  mapX /= simNodes.length || 1;
  mapY /= simNodes.length || 1;
  for (const node of simNodes) {
    if (node.type !== "organization" && node.type !== "program" && node.type !== "investor") continue;
    const list = neighbors.get(node.id) ?? [];
    if (list.length < 6) continue;
    let x = 0;
    let y = 0;
    for (const other of list) {
      x += other.x;
      y += other.y;
    }
    x /= list.length;
    y /= list.length;
    const dx = x - mapX;
    const dy = y - mapY;
    const dist = Math.hypot(dx, dy) || 1;
    node.x = x + (dx / dist) * 18;
    node.y = y + (dy / dist) * 18;
  }
}

/** Park each region name just past its own cluster, outward from the cloud. Each label keeps its own radius. */
function placeRegionLabels(markers: RegionMarker[], simNodes: SimNode[]) {
  if (!markers.length || !simNodes.length) return;
  let cx = 0;
  let cy = 0;
  for (const node of simNodes) {
    cx += node.x;
    cy += node.y;
  }
  cx /= simNodes.length;
  cy /= simNodes.length;
  const byId = new Map(simNodes.map((node) => [node.id, node]));
  const centroids = markers.map((marker) => {
    const campuses = marker.campusIds.map((id) => byId.get(id)).filter((node): node is SimNode => !!node);
    let rx = 0;
    let ry = 0;
    for (const campus of campuses) {
      rx += campus.x;
      ry += campus.y;
    }
    const count = campuses.length || 1;
    return { marker, x: rx / count, y: ry / count };
  });
  const extent = new Map<string, number>();
  for (const node of simNodes) {
    let nearest = centroids[0];
    let nearestDist = Infinity;
    for (const centroid of centroids) {
      const dist = Math.hypot(node.x - centroid.x, node.y - centroid.y);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = centroid;
      }
    }
    if (!nearest) continue;
    extent.set(nearest.marker.id, Math.max(extent.get(nearest.marker.id) ?? 0, nearestDist));
  }
  for (const centroid of centroids) {
    const dx = centroid.x - cx;
    const dy = centroid.y - cy;
    const dist = Math.hypot(dx, dy) || 1;
    const halo = extent.get(centroid.marker.id) ?? 80;
    const reach = dist + Math.min(halo * 0.62, dist * 0.7) + 36;
    centroid.marker.x = cx + (dx / dist) * reach;
    centroid.marker.y = cy + (dy / dist) * reach;
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const node of simNodes) {
    minX = Math.min(minX, node.x);
    maxX = Math.max(maxX, node.x);
    minY = Math.min(minY, node.y);
    maxY = Math.max(maxY, node.y);
  }
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const gap = span * (88 / 740);
  for (let iter = 0; iter < 16; iter++) {
    for (let i = 0; i < markers.length; i++) {
      for (let j = i + 1; j < markers.length; j++) {
        const a = markers[i];
        const b = markers[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);
        if (dist >= gap) continue;
        if (dist < 1) {
          dx = 1;
          dy = 0;
          dist = 1;
        }
        const push = (gap - dist) / 2;
        a.x -= (dx / dist) * push;
        a.y -= (dy / dist) * push;
        b.x += (dx / dist) * push;
        b.y += (dy / dist) * push;
      }
    }
  }
}

const OVERLAP_PX: Record<MapNodeType, number> = {
  person: 2.1,
  startup: 2.6,
  investor: 4.2,
  program: 3.4,
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
    if (sim) {
      g.setNodeAttribute(id, "x", sim.x);
      g.setNodeAttribute(id, "y", sim.y);
    }
  });
  noverlap.assign(g, {
    maxIterations: simNodes.length > 500 ? 18 : 28,
    settings: {
      margin: 0.05,
      ratio: 1,
      expansion: 1.008,
      gridSize: 40,
      speed: 3,
    },
  });
}
