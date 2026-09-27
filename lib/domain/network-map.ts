// Full evidence graph for the Network map. Nodes and edges come from
// affiliations, founder roles, program memberships, sourced investor facts,
// and confirmed DRF portfolio matches. The five DRF regions share one
// round universe: their centroids sit on a small ring and a single force
// pass pulls members gently toward those seats, so the colours touch and
// blend. High-degree organizations are pushed out to the rim.

import fs from "node:fs";
import { forceCollide, forceSimulation, forceX, forceY } from "d3-force";
import { databasePath, getDb } from "../db/client";
import { undergradEnrollment } from "./campus-enrollment";
import { CAMPUSES } from "./campuses";
import { connectionSignal, founderSignalWeight, mentionsAccelerator, perCapitaSignal, signalFields, sqrtScores, startupSignalWeight, type SignalParts } from "./network-signal-size";
import { REGIONS, regionForCampus, regionInk, type RegionMarker } from "./network-regions";
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
  /** Incident edges. */
  degree: number;
  /** Unweighted strong founders plus startups, or the node's own connection count. */
  signalCount: number;
  /** Weighted numerator. Funded, accelerator, and S/A or DRF signals count extra. */
  signalWeight: number;
  /** Undergraduate enrollment, member count, or 1 for a person or startup. */
  signalDenominator: number;
  /** signalWeight / signalDenominator. This is what the sqrt size scale uses. */
  signalRatio: number;
  /** 0–1 within the node's size group, after the sqrt. */
  signalScore: number;
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

const LAYOUT_VERSION = "20";
/** Organizations and programs at least this connected are rim hubs. */
const HUB_DEGREE = 22;
/** Investors need a larger book before they leave the cloud for the rim. */
const INVESTOR_HUB_DEGREE = 36;

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

function acceleratorBacked(rows: { project_id: string; value_text: string }[]): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    if (mentionsAccelerator(row.value_text)) ids.add(row.project_id);
  }
  return ids;
}

function buildSignalSizes(input: {
  people: { id: string; signal_tier: string | null; verification_status: string | null }[];
  startups: { id: string; signal_tier: string | null; signal_tier_basis: string | null; verification_status: string | null }[];
  founderIds: Set<string>;
  foundersByCompany: Map<string, string[]>;
  campusesByPerson: Map<string, string[]>;
  campusesByCompany: Map<string, string[]>;
  amountByProject: Map<string, number>;
  stageByProject: Map<string, { stage: string; rank: number }>;
  acceleratorStartups: Set<string>;
  drfStartups: Set<string>;
  universities: { id: string }[];
  memberRows: { person_id: string; project_id: string }[];
  programIds: Set<string>;
  personIds: Set<string>;
  organizationEdges: { source: string; target: string; type: string }[];
  edges: MapEdge[];
  degree: Map<string, number>;
}): Map<string, SignalParts> {
  const startupWeight = new Map<string, number>();
  for (const startup of input.startups) {
    startupWeight.set(
      startup.id,
      startupSignalWeight({
        verification: startup.verification_status,
        funded: (input.amountByProject.get(startup.id) ?? 0) > 0 || input.stageByProject.has(startup.id),
        accelerator: mentionsAccelerator(startup.signal_tier_basis) || input.acceleratorStartups.has(startup.id),
        strongTier: startup.signal_tier === "S" || startup.signal_tier === "A" || input.drfStartups.has(startup.id),
      }),
    );
  }

  const bestStartup = new Map<string, number>();
  for (const [companyId, founders] of input.foundersByCompany) {
    const weight = startupWeight.get(companyId) ?? 0;
    for (const personId of founders) bestStartup.set(personId, Math.max(bestStartup.get(personId) ?? 0, weight));
  }
  const founderWeight = new Map<string, number>();
  for (const person of input.people) {
    if (!input.founderIds.has(person.id)) continue;
    const weight = founderSignalWeight({
      verification: person.verification_status,
      tier: person.signal_tier,
      startupWeight: bestStartup.get(person.id) ?? 0,
    });
    if (weight > 0) founderWeight.set(person.id, weight);
  }

  const campusCount = new Map<string, number>();
  const campusWeight = new Map<string, number>();
  const addCampus = (campusId: string, weight: number) => {
    if (!campusId || weight <= 0) return;
    campusCount.set(campusId, (campusCount.get(campusId) ?? 0) + 1);
    campusWeight.set(campusId, (campusWeight.get(campusId) ?? 0) + weight);
  };
  for (const [personId, weight] of founderWeight) {
    for (const campusId of input.campusesByPerson.get(personId) ?? []) addCampus(campusId, weight);
  }
  for (const startup of input.startups) {
    const weight = startupWeight.get(startup.id) ?? 0;
    if (weight <= 0) continue;
    const listed = input.campusesByCompany.get(startup.id) ?? [];
    const campuses = listed.length ? listed : [...new Set((input.foundersByCompany.get(startup.id) ?? []).flatMap((id) => input.campusesByPerson.get(id) ?? []))];
    for (const campusId of campuses) addCampus(campusId, weight);
  }

  const out = new Map<string, SignalParts>();
  const campusRatios = input.universities.map((uni) => (campusWeight.get(uni.id) ?? 0) / undergradEnrollment(uni.id));
  const campusScores = sqrtScores(campusRatios);
  input.universities.forEach((uni, index) => {
    out.set(
      uni.id,
      perCapitaSignal(campusCount.get(uni.id) ?? 0, campusWeight.get(uni.id) ?? 0, undergradEnrollment(uni.id), campusScores[index] ?? 0),
    );
  });

  const hubs: { id: string; count: number; weight: number; denominator: number }[] = [];
  const programPeople = new Map<string, Set<string>>();
  for (const row of input.memberRows) {
    if (!input.programIds.has(row.project_id) || !input.personIds.has(row.person_id)) continue;
    const people = programPeople.get(row.project_id) ?? new Set<string>();
    people.add(row.person_id);
    programPeople.set(row.project_id, people);
  }
  for (const [programId, people] of programPeople) {
    let count = 0;
    let weight = 0;
    for (const personId of people) {
      const personWeight = founderWeight.get(personId) ?? 0;
      if (personWeight <= 0) continue;
      count += 1;
      weight += personWeight;
    }
    hubs.push({ id: programId, count, weight, denominator: people.size });
  }

  const orgPeople = new Map<string, Set<string>>();
  const orgStartups = new Map<string, Set<string>>();
  for (const edge of input.organizationEdges) {
    if (edge.type !== "member_of") continue;
    if (input.personIds.has(edge.source)) {
      const people = orgPeople.get(edge.target) ?? new Set<string>();
      people.add(edge.source);
      orgPeople.set(edge.target, people);
    } else if (startupWeight.has(edge.source)) {
      const startups = orgStartups.get(edge.target) ?? new Set<string>();
      startups.add(edge.source);
      orgStartups.set(edge.target, startups);
    }
  }
  const orgIds = new Set([...orgPeople.keys(), ...orgStartups.keys()]);
  for (const orgId of orgIds) {
    let count = 0;
    let weight = 0;
    for (const personId of orgPeople.get(orgId) ?? []) {
      const personWeight = founderWeight.get(personId) ?? 0;
      if (personWeight <= 0) continue;
      count += 1;
      weight += personWeight;
    }
    for (const startupId of orgStartups.get(orgId) ?? []) {
      const companyWeight = startupWeight.get(startupId) ?? 0;
      if (companyWeight <= 0) continue;
      count += 1;
      weight += companyWeight;
    }
    const members = (orgPeople.get(orgId)?.size ?? 0) + (orgStartups.get(orgId)?.size ?? 0);
    hubs.push({ id: orgId, count, weight, denominator: Math.max(1, members) });
  }

  const portfolios = new Map<string, Set<string>>();
  for (const edge of input.edges) {
    if (edge.type !== "invested_in") continue;
    const book = portfolios.get(edge.source) ?? new Set<string>();
    book.add(edge.target);
    portfolios.set(edge.source, book);
  }
  for (const [investorId, book] of portfolios) {
    let count = 0;
    let weight = 0;
    for (const startupId of book) {
      const companyWeight = startupWeight.get(startupId) ?? 0;
      if (companyWeight <= 0) continue;
      count += 1;
      weight += companyWeight;
    }
    hubs.push({ id: investorId, count, weight, denominator: book.size });
  }

  const hubScores = sqrtScores(hubs.map((hub) => hub.weight / Math.max(1, hub.denominator)));
  hubs.forEach((hub, index) => {
    out.set(hub.id, perCapitaSignal(hub.count, hub.weight, hub.denominator, hubScores[index] ?? 0));
  });

  for (const person of input.people) out.set(person.id, connectionSignal(input.degree.get(person.id) ?? 0, 12));
  for (const startup of input.startups) out.set(startup.id, connectionSignal(input.degree.get(startup.id) ?? 0, 20));
  return out;
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
  const personVerifySql = peopleColumns.has("verification_status") ? "verification_status" : "NULL AS verification_status";
  const people = db
    .prepare(
      `SELECT id, name, aliases_json, founder_status, enrollment_status, enrollment_label, enrollment_grad_year, signal_tier, ${basisSql}, ${personVerifySql} FROM people
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
    verification_status: string | null;
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

  const projectColumns = new Set((db.prepare(`PRAGMA table_info(projects)`).all() as { name: string }[]).map((column) => column.name));
  const startupVerifySql = projectColumns.has("verification_status") ? "verification_status" : "NULL AS verification_status";
  const startupBasisSql = projectColumns.has("signal_tier_basis") ? "signal_tier_basis" : "NULL AS signal_tier_basis";
  const startups = db
    .prepare(
      `SELECT id, name, signal_tier, ${startupBasisSql}, ${startupVerifySql} FROM projects
       WHERE kind = 'company' AND is_investable_candidate = 1`
    )
    .all() as { id: string; name: string; signal_tier: string | null; signal_tier_basis: string | null; verification_status: string | null }[];
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
  const signalById = buildSignalSizes({
    people,
    startups,
    founderIds,
    foundersByCompany,
    campusesByPerson,
    campusesByCompany,
    amountByProject,
    stageByProject,
    acceleratorStartups: acceleratorBacked(investorRows),
    drfStartups: new Set(drfTargets.map((row) => row.project_id)),
    universities,
    memberRows,
    programIds,
    personIds,
    organizationEdges: organizations.edges,
    edges,
    degree,
  });

  const emit = (node: Omit<MapNode, "year" | "founder" | "degree" | "signalCount" | "signalWeight" | "signalDenominator" | "signalRatio" | "signalScore"> & { year?: number | null; founder?: boolean }) => {
    const at = pos.get(node.id);
    if (!at) return;
    node.x = Math.round(at.x * 10) / 10;
    node.y = Math.round(at.y * 10) / 10;
    node.r = Math.round(at.r * 10) / 10;
    const signal = signalById.get(node.id) ?? connectionSignal(degree.get(node.id) ?? 0, node.type === "startup" ? 20 : 12);
    nodes.push({
      ...node,
      year: node.year ?? null,
      founder: node.founder ?? false,
      degree: degree.get(node.id) ?? 0,
      ...signalFields(signal),
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

interface LiveNode extends SimNode {
  vx?: number;
  vy?: number;
  tx: number;
  ty: number;
  pull: number;
  collide: number;
  hub: boolean;
  regionId: string | null;
}

/**
 * Where each DRF team sits in the shared universe. Angles are standard
 * math angles with +y downward, matching the map: Philly on top, the West
 * Coast on the left, Boston low and central, NY on the right. International
 * is placed afterwards, tucked against the West Coast's lower edge.
 */
const REGION_POSE: Record<string, { angle: number; scale: number }> = {
  philly: { angle: -Math.PI / 2, scale: 0.32 },
  west: { angle: Math.PI, scale: 0.8 },
  ny: { angle: -0.02, scale: 0.74 },
  boston: { angle: Math.PI / 2.15, scale: 0.46 },
  international: { angle: Math.PI * 0.78, scale: 1 },
};

/**
 * One force simulation. Campus seats sit on a small ring so neighbouring
 * regions touch. Members are pulled gently toward a jittered point in that
 * seat — a large campus such as Penn therefore stays a dense core with a
 * soft edge instead of a packed disc. Hubs take a radial shove to the rim.
 */
function settleForceAtlas(simNodes: SimNode[], edges: MapEdge[], campusLabels: Map<string, string>): RegionMarker[] {
  const byId = new Map(simNodes.map((node) => [node.id, node]));
  const degree = new Map<string, number>();
  const membersOf = new Map<string, string[]>();
  const foundersOf = new Map<string, string[]>();
  const campusesOf = new Map<string, string[]>();
  const portfolio = new Map<string, string[]>();
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    if (edge.type === "member_of") {
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

  const campusIdSet = new Set(simNodes.filter((node) => node.type === "campus").map((node) => node.id));
  const linkedCampuses = (node: SimNode): string[] => {
    const ids: string[] = [];
    if (node.type === "person") ids.push(...(campusesOf.get(node.id) ?? []));
    else if (node.type === "startup") for (const person of foundersOf.get(node.id) ?? []) ids.push(...(campusesOf.get(person) ?? []));
    else if (node.type === "program" || node.type === "organization") for (const person of membersOf.get(node.id) ?? []) ids.push(...(campusesOf.get(person) ?? []));
    else if (node.type === "investor") {
      for (const startup of portfolio.get(node.id) ?? []) for (const person of foundersOf.get(startup) ?? []) ids.push(...(campusesOf.get(person) ?? []));
    }
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of ids) {
      if (!campusIdSet.has(id) || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    if (!out.length) for (const id of node.campuses ?? []) if (campusIdSet.has(id)) out.push(id);
    return out;
  };

  const primary = new Map<string, string>();
  const bridgeWeight = new Map<string, Map<string, number>>();
  for (const node of simNodes) {
    node.anchor = false;
    if (node.type === "campus") {
      primary.set(node.id, node.id);
      continue;
    }
    const counts = new Map<string, number>();
    for (const id of linkedCampuses(node)) counts.set(id, (counts.get(id) ?? 0) + 1);
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const total = ranked.reduce((sum, [, count]) => sum + count, 0);
    const top = ranked[0];
    if (!top) continue;
    if (ranked.length >= 2 && top[1] / total < 0.62) bridgeWeight.set(node.id, counts);
    else primary.set(node.id, top[0]);
  }

  const campusCount = new Map<string, number>();
  for (const node of simNodes) {
    if (node.type !== "person" && node.type !== "startup") continue;
    const campus = primary.get(node.id);
    if (!campus) continue;
    campusCount.set(campus, (campusCount.get(campus) ?? 0) + 1);
  }

  const campusesByRegion = new Map<string, { id: string; n: number }[]>();
  for (const campus of simNodes) {
    if (campus.type !== "campus") continue;
    const regionId = regionForCampus(campus.id, campusLabels.get(campus.id) ?? "");
    const list = campusesByRegion.get(regionId) ?? [];
    list.push({ id: campus.id, n: campusCount.get(campus.id) ?? 0 });
    campusesByRegion.set(regionId, list);
  }

  const regionCount = (regionId: string) => (campusesByRegion.get(regionId) ?? []).reduce((sum, campus) => sum + campus.n, 0);
  const regionRadius = (regionId: string, n: number) => {
    const fromCount = Math.sqrt(Math.max(n, 1)) * 2.2;
    if (regionId === "international") return Math.max(22, fromCount * 0.8);
    return Math.max(54, fromCount);
  };
  const radii = new Map(REGIONS.map((region) => [region.id, regionRadius(region.id, regionCount(region.id))]));
  const unit = Math.max(84, (radii.get("philly") ?? 100) * 0.68);
  const regionCenter = new Map<string, { x: number; y: number }>();
  for (const region of REGIONS) {
    if (!(campusesByRegion.get(region.id)?.length)) continue;
    const pose = REGION_POSE[region.id] ?? { angle: 0, scale: 1 };
    regionCenter.set(region.id, {
      x: Math.cos(pose.angle) * unit * pose.scale,
      y: Math.sin(pose.angle) * unit * pose.scale,
    });
  }
  const westCenter = regionCenter.get("west");
  if (westCenter && regionCenter.has("international")) {
    const lobe = Math.max(radii.get("west") ?? 70, 64);
    regionCenter.set("international", { x: westCenter.x - lobe * 0.05, y: westCenter.y + lobe * 0.58 });
  }

  const seats = new Map<string, { x: number; y: number; spread: number; loose: boolean }>();
  for (const [regionId, list] of campusesByRegion) {
    const center = regionCenter.get(regionId);
    if (!center) continue;
    const outward = Math.atan2(center.y, center.x);
    const regionR = radii.get(regionId) ?? 48;
    const regionN = Math.max(regionCount(regionId), 1);
    const sorted = [...list].sort((a, b) => b.n - a.n || a.id.localeCompare(b.id));
    const campusSpread = (n: number) => {
      const loose = n >= 350;
      const share = Math.sqrt(n / regionN);
      const spread = regionR * (loose ? 0.7 : 0.42) * Math.max(loose ? 0.85 : 0.55, share);
      return { spread: Math.max(loose ? 42 : 11, spread), loose };
    };
    const biggest = sorted[0];
    const second = sorted[1];
    const used = new Set<string>();
    if (biggest && second && second.n >= 80 && second.n > biggest.n * 0.45) {
      const a = campusSpread(biggest.n);
      const b = campusSpread(second.n);
      const gap = (a.spread + b.spread) * 0.36;
      const tangent = outward + Math.PI / 2;
      const place = (campus: { id: string; n: number }, spec: { spread: number; loose: boolean }, along: number, out: number) => {
        seats.set(campus.id, {
          x: center.x + Math.cos(tangent) * along + Math.cos(outward) * out,
          y: center.y + Math.sin(tangent) * along + Math.sin(outward) * out,
          spread: spec.spread,
          loose: spec.loose,
        });
        used.add(campus.id);
      };
      place(biggest, a, -gap * 0.5, gap * 0.08);
      place(second, b, gap * 0.5, -gap * 0.06);
    } else if (biggest) {
      const spec = campusSpread(biggest.n);
      seats.set(biggest.id, { x: center.x, y: center.y, spread: spec.spread, loose: spec.loose });
      used.add(biggest.id);
    }
    const rest = sorted.filter((campus) => !used.has(campus.id));
    const ring = (radii.get(regionId) ?? 48) * 0.62;
    rest.forEach((campus, index) => {
      const spec = campusSpread(campus.n);
      const angle = outward + (index / Math.max(rest.length, 1)) * Math.PI * 2;
      const dist = ring * (0.82 + (index % 3) * 0.1);
      seats.set(campus.id, {
        x: center.x + Math.cos(angle) * dist,
        y: center.y + Math.sin(angle) * dist,
        spread: spec.spread,
        loose: spec.loose,
      });
    });
  }

  const regionOfCampus = (id: string) => regionForCampus(id, campusLabels.get(id) ?? "");
  const live = simNodes as LiveNode[];
  for (const node of live) {
    node.vx = 0;
    node.vy = 0;
    node.hub = false;
    node.regionId = null;
    if (node.type === "campus") {
      const seat = seats.get(node.id);
      node.tx = seat?.x ?? 0;
      node.ty = seat?.y ?? 0;
      node.x = node.tx;
      node.y = node.ty;
      node.pull = 0.5;
      node.collide = 8;
      node.regionId = regionOfCampus(node.id);
      node.anchor = true;
      continue;
    }
    const hub = isRimHub(node, degree);
    const campus = primary.get(node.id);
    const weights = bridgeWeight.get(node.id);
    let tx = 0;
    let ty = 0;
    let loose = false;
    let regionId: string | null = null;
    if (campus && seats.has(campus)) {
      const seat = seats.get(campus)!;
      const jitter = organicOffset(node.id, seat.spread, seat.loose, hashUnit(campus));
      tx = seat.x + jitter.x;
      ty = seat.y + jitter.y;
      loose = seat.loose;
      regionId = regionOfCampus(campus);
    } else if (weights && weights.size) {
      let x = 0;
      let y = 0;
      let weight = 0;
      let topId: string | null = null;
      let topCount = 0;
      for (const [id, count] of weights) {
        const seat = seats.get(id);
        if (!seat) continue;
        x += seat.x * count;
        y += seat.y * count;
        weight += count;
        if (count > topCount) {
          topCount = count;
          topId = id;
        }
      }
      if (weight) {
        const jitter = organicOffset(node.id, 16, false, 0);
        tx = x / weight + jitter.x;
        ty = y / weight + jitter.y;
        regionId = topId ? regionOfCampus(topId) : null;
      }
    } else {
      const theta = hashUnit(node.id) * Math.PI * 2;
      const dist = 10 + hashUnit(`${node.id}:r`) * 28;
      tx = Math.cos(theta) * dist;
      ty = Math.sin(theta) * dist;
    }
    node.regionId = regionId;
    node.hub = hub;
    node.tx = tx;
    node.ty = ty;
    node.x = tx;
    node.y = ty;
    if (hub) {
      node.pull = 0;
      node.collide = 12;
      node.anchor = (degree.get(node.id) ?? 0) >= 28;
    } else if (loose && (node.type === "person" || node.type === "startup")) {
      node.pull = 0.1;
      node.collide = 0;
    } else if (node.type === "person") {
      node.pull = 0.14;
      node.collide = 2.05;
    } else if (node.type === "startup") {
      node.pull = 0.13;
      node.collide = 2.5;
    } else {
      node.pull = 0.16;
      node.collide = 3.3;
    }
  }

  const hubMembers = new Map<string, string[]>();
  const pushMember = (hubId: string, memberId: string) => {
    const hub = byId.get(hubId) as LiveNode | undefined;
    const member = byId.get(memberId) as LiveNode | undefined;
    if (!hub?.hub || !member || member.hub) return;
    const list = hubMembers.get(hubId) ?? [];
    list.push(memberId);
    hubMembers.set(hubId, list);
  };
  for (const edge of edges) {
    if (edge.type === "studied_at" || edge.type === "at_campus") continue;
    pushMember(edge.source, edge.target);
    pushMember(edge.target, edge.source);
  }

  const rankedHubs = live
    .filter((node) => node.hub)
    .sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || a.id.localeCompare(b.id));
  const keptMembers: Set<string>[] = [];
  for (const hub of rankedHubs) {
    const mine = new Set(hubMembers.get(hub.id) ?? []);
    const covered =
      mine.size >= 8 &&
      keptMembers.some((other) => {
        let shared = 0;
        for (const id of mine) if (other.has(id)) shared += 1;
        return shared / mine.size >= 0.72;
      });
    if (!covered) {
      keptMembers.push(mine);
      continue;
    }
    hub.hub = false;
    hub.anchor = false;
    hub.pull = 0.18;
    hub.collide = 3.4;
  }

  const hubsByRegion = new Map<string, LiveNode[]>();
  for (const node of live) {
    if (!node.hub) continue;
    const regionId = majorityRegion(node.id, hubMembers.get(node.id) ?? [], byId as Map<string, LiveNode>) ?? node.regionId ?? "none";
    node.regionId = regionId === "none" ? null : regionId;
    const list = hubsByRegion.get(regionId) ?? [];
    list.push(node);
    hubsByRegion.set(regionId, list);
  }

  const hubTargets = new Map<string, { x: number; y: number }>();
  for (const [regionId, group] of hubsByRegion) {
    const center = regionCenter.get(regionId) ?? { x: 0, y: 0 };
    const outward = Math.hypot(center.x, center.y) > 8 ? Math.atan2(center.y, center.x) : -Math.PI / 2;
    const body = live.filter((node) => !node.hub && node.regionId === (regionId === "none" ? null : regionId) && (node.type === "person" || node.type === "startup"));
    const radiiOfBody = body.map((node) => Math.hypot(node.tx - center.x, node.ty - center.y)).sort((a, b) => a - b);
    const outer = radiiOfBody.length ? radiiOfBody[Math.min(radiiOfBody.length - 1, Math.floor(radiiOfBody.length * 0.9))] : 48;
    const sorted = [...group].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || a.id.localeCompare(b.id));
    const arc = Math.min(Math.PI * 1.45, Math.max(1.15, 0.62 * sorted.length));
    sorted.forEach((hub, index) => {
      const members = hubMembers.get(hub.id) ?? [];
      let mx = 0;
      let my = 0;
      let count = 0;
      const seen = new Set<string>();
      for (const id of members) {
        if (seen.has(id)) continue;
        seen.add(id);
        const member = byId.get(id) as LiveNode | undefined;
        if (!member) continue;
        mx += member.tx;
        my += member.ty;
        count += 1;
      }
      let preferred = outward;
      if (count) {
        const dx = mx / count - center.x;
        const dy = my / count - center.y;
        if (Math.hypot(dx, dy) > outer * 0.2) preferred = Math.atan2(dy, dx);
      }
      const spacing = arc / Math.max(sorted.length, 1);
      const slot = index === 0 ? 0 : (index % 2 === 0 ? 1 : -1) * Math.ceil(index / 2) * spacing;
      let angle = preferred * 0.25 + (outward + slot) * 0.75;
      let rel = angle - outward;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      if (Math.abs(rel) > Math.PI * 0.82) angle = outward + Math.sign(rel || 1) * Math.PI * 0.82;
      const rim = outer + 46 + hashUnit(hub.id) * 20;
      const tx = center.x + Math.cos(angle) * rim;
      const ty = center.y + Math.sin(angle) * rim;
      hub.tx = tx;
      hub.ty = ty;
      hub.x = tx;
      hub.y = ty;
      hubTargets.set(hub.id, { x: tx, y: ty });
    });
  }

  const hubs = live.filter((node) => node.hub);
  const sim = forceSimulation(live)
    .velocityDecay(0.4)
    .alphaDecay(0.07)
    .force(
      "x",
      forceX<LiveNode>((node) => node.tx).strength((node) => (node.hub ? 0 : node.pull)),
    )
    .force(
      "y",
      forceY<LiveNode>((node) => node.ty).strength((node) => (node.hub ? 0 : node.pull)),
    )
    .force(
      "collide",
      forceCollide<LiveNode>()
        .radius((node) => node.collide)
        .strength(0.55)
        .iterations(1),
    )
    .force("radial", (alpha) => {
      for (const hub of hubs) {
        const target = hubTargets.get(hub.id);
        if (!target) continue;
        hub.vx = (hub.vx ?? 0) + (target.x - (hub.x ?? target.x)) * 0.7 * alpha;
        hub.vy = (hub.vy ?? 0) + (target.y - (hub.y ?? target.y)) * 0.7 * alpha;
      }
    })
    .stop();
  for (let tick = 0; tick < 28; tick++) sim.tick();

  snapCampusCentroids(simNodes, primary);
  const markers: RegionMarker[] = [];
  for (const region of REGIONS) {
    const members = campusesByRegion.get(region.id) ?? [];
    if (!members.length) continue;
    markers.push({
      id: region.id,
      label: region.label,
      fullLabel: region.fullLabel,
      x: 0,
      y: 0,
      color: regionInk(region.id),
      campusIds: members.map((member) => member.id),
    });
  }
  placeRegionLabels(markers, simNodes);
  return markers;
}

function isRimHub(node: SimNode, degree: Map<string, number>): boolean {
  const links = degree.get(node.id) ?? 0;
  if (node.type === "organization" || node.type === "program") return links >= HUB_DEGREE;
  if (node.type === "investor") return links >= INVESTOR_HUB_DEGREE;
  return false;
}

function majorityRegion(hubId: string, members: string[], byId: Map<string, LiveNode>): string | null {
  const votes = new Map<string, number>();
  const seen = new Set<string>();
  for (const id of members) {
    if (seen.has(id)) continue;
    seen.add(id);
    const regionId = byId.get(id)?.regionId;
    if (!regionId) continue;
    votes.set(regionId, (votes.get(regionId) ?? 0) + 1);
  }
  let best: string | null = byId.get(hubId)?.regionId ?? null;
  let score = 0;
  for (const [regionId, count] of votes) {
    if (count > score) {
      score = count;
      best = regionId;
    }
  }
  return best;
}

/** A large campus is a dense middle plus a few uneven bulges, so it fades instead of packing into a disc. */
function organicOffset(id: string, spread: number, loose: boolean, phaseUnit: number): { x: number; y: number } {
  const unit = Math.max(1e-4, hashUnit(`${id}:u`));
  const phase = phaseUnit * Math.PI * 2;
  if (loose) {
    const lobe = Math.floor(hashUnit(`${id}:lobe`) * 3);
    const inCore = hashUnit(`${id}:core`) < 0.46;
    const theta = inCore
      ? hashUnit(`${id}:a`) * Math.PI * 2
      : phase + lobe * ((Math.PI * 2) / 3) + (hashUnit(`${id}:a`) - 0.5) * 1.35;
    const ray = Math.min(2.15, Math.sqrt(-2 * Math.log(unit)));
    const dist = spread * (inCore ? ray * 0.42 : 0.48 + ray * 0.46);
    return { x: Math.cos(theta) * dist, y: Math.sin(theta) * dist * 0.86 };
  }
  const theta = hashUnit(`${id}:a`) * Math.PI * 2;
  const wobble = 0.84 + 0.26 * Math.sin(theta * 3 + phase);
  const dist = spread * (0.18 + 0.82 * Math.pow(unit, 0.62)) * wobble;
  return { x: Math.cos(theta) * dist, y: Math.sin(theta) * dist };
}

function hashUnit(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 33 + id.charCodeAt(i)) >>> 0;
  return (hash % 10000) / 10000;
}

/** Move each campus label onto the people and startups who actually belong to it. */
function snapCampusCentroids(simNodes: SimNode[], primary: Map<string, string>) {
  const members = new Map<string, SimNode[]>();
  for (const node of simNodes) {
    if (node.type !== "person" && node.type !== "startup") continue;
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

/** Park each region name just past its own coloured cloud, outward from the middle. Hubs sit further out, so they are not part of the measurement. */
function placeRegionLabels(markers: RegionMarker[], simNodes: SimNode[]) {
  if (!markers.length || !simNodes.length) return;
  let cx = 0;
  let cy = 0;
  let counted = 0;
  for (const node of simNodes) {
    if (node.type !== "person" && node.type !== "startup" && node.type !== "campus") continue;
    cx += node.x;
    cy += node.y;
    counted += 1;
  }
  if (!counted) return;
  cx /= counted;
  cy /= counted;
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
    if (node.type !== "person" && node.type !== "startup" && node.type !== "campus") continue;
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
    const halo = extent.get(centroid.marker.id) ?? 64;
    const edge = dist + halo;
    const reach = Math.min(edge * 0.92, dist + halo * 0.62 + 14);
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
  const gap = span * (72 / 740);
  for (let iter = 0; iter < 12; iter++) {
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
