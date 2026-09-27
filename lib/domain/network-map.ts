// Full evidence graph for the Network map. Nodes and edges come from
// affiliations, founder roles, program memberships, sourced investor facts,
// and confirmed DRF portfolio matches. The five DRF regions are one connected
// cloud. Region color is a soft affinity: campuses of the same color sit near
// each other, and a campus does not sit deep inside another region's core,
// but the borders overlap. Shared programs, investors, and cosine similarity
// pull those borders together. Campus-specific hubs sit inside their school.
// National programs sit in the connective space between the regions they link.
// Explicit program lines are drawn on top of this layout.

import fs from "node:fs";
import { forceCollide, forceSimulation, forceX, forceY } from "d3-force";
import { databasePath, getDb } from "../db/client";
import { undergradEnrollment } from "./campus-enrollment";
import { CAMPUSES } from "./campuses";
import { connectionSignal, founderSignalWeight, mentionsAccelerator, perCapitaSignal, signalFields, sqrtScores, startupSignalWeight, type SignalParts } from "./network-signal-size";
import { REGIONS, packRegionCenters, regionForCampus, regionInk, type RegionMarker } from "./network-regions";
import type { HotspotSectionId, HotspotTier } from "./hotspot-model";
import { featuredNationalKey } from "./featured-national";
import { demoteDuplicateOuter, rimPlacementFor, type RimBand, type RimTier } from "./rim-tier";
import { hotspotGraphPatch, organizationMap } from "./hotspots";
import { confirmedLinkedIn, readLinkedInCandidate } from "./person-link";
import { sectorLabel } from "./sectors";
import { cosineSimilarity, groupVector, linksWithinGroups, nearestSimilar, relaxRegionBodies, relaxSimilarity, similarityVectors, type SimilarityPoint } from "./similarity-layout";
import { drfWorksAtEdges } from "./drf-alumni";

export type MapNodeType = "person" | "startup" | "campus" | "investor" | "program" | "organization";
export type MapEdgeType = "founded" | "co_founder" | "studied_at" | "invested_in" | "member_of" | "at_campus" | "works_at";

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
  linkedinStatus?: "confirmed" | "likely" | "unverified";
  /** Directory tier for an organization node. Absent on every other type. */
  orgTier?: HotspotTier;
  /**
   * Outer rim for S/A fellowships and cross-campus accelerators.
   * Inward for low-tier programs, clubs, hackathon teams, and campus accelerators.
   * Placement and labels only — not Founder Signal.
   */
  rimBand?: "outer" | "inward";
  /** S+ is the lead program. S is the tier-1 ring. A stays on the outer rim a step behind. */
  rimTier?: RimTier;
  /** Campus this club or hub was tucked into. Node and label use that campus shade. */
  homeCampus?: string;
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
  label?: string;
  rimBand?: RimBand | null;
  rimTier?: RimTier | null;
  /** Set when this hub was tucked into one campus. Its color follows that campus. */
  homeCampus?: string;
  /** Startup sector tag. Used to build campus and hub similarity. */
  sector?: string | null;
}

const LAYOUT_VERSION = "36";
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
  if (tier === "S+") return 4.4;
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
        strongTier: startup.signal_tier === "S+" || startup.signal_tier === "S" || startup.signal_tier === "A" || input.drfStartups.has(startup.id),
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
  if (type === "program") return 9 + tierBoost(tier) + Math.min(5, Math.sqrt(degree) * 0.45);
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
  const linkedinByPerson = new Map<string, { url: string; status: "confirmed" | "likely" | "unverified" }>();
  for (const person of people) {
    const confirmed = confirmedLinkedIn(person.aliases_json);
    if (confirmed) linkedinByPerson.set(person.id, { url: confirmed, status: "confirmed" });
  }
  const candidateRows = db
    .prepare(
      `SELECT entity_id, value_json, verification_state FROM claims
       WHERE entity_type = 'person' AND claim_type = 'linkedin_candidate' AND verification_state IN ('unverified', 'likely')`
    )
    .all() as { entity_id: string; value_json: string; verification_state: string }[];
  for (const row of candidateRows) {
    if (!personIds.has(row.entity_id)) continue;
    const existing = linkedinByPerson.get(row.entity_id);
    if (existing?.status === "confirmed" || existing?.status === "likely") continue;
    const candidate = readLinkedInCandidate(row.value_json, row.verification_state);
    if (!candidate) continue;
    linkedinByPerson.set(row.entity_id, {
      url: candidate.url,
      status: candidate.confidence === "likely" ? "likely" : "unverified",
    });
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
      `SELECT p.id, p.name, p.signal_tier FROM projects p
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
    .all() as { id: string; name: string; signal_tier: string | null }[];
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

  for (const edge of drfWorksAtEdges()) {
    if (!personIds.has(edge.personId)) continue;
    investorNames.set(edge.investorId, edge.firm);
    addEdge(edge.personId, edge.investorId, "works_at");
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
    const node = pushNode(startup.id, "startup", campuses, startup.signal_tier, amountByProject.get(startup.id) ?? null);
    node.sector = sectorByProject.get(startup.id) ?? null;
  }
  for (const program of programs) {
    const campuses = campusesByCompany.get(program.id) ?? [];
    const node = pushNode(program.id, "program", campuses, null, null);
    node.label = program.name;
  }
  for (const org of organizations.nodes) {
    const node = pushNode(org.id, "organization", org.campuses, org.tier, null);
    node.label = org.label;
    node.layoutPx = org.tier === "S+" ? 8.4 : org.tier === "S" ? 7 : org.tier === "A" ? 6.2 : org.tier === "B" ? 5.4 : 4.8;
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
  const investedAnchors = new Set(investorAnchor.keys());
  const personSpot = new Map<string, { x: number; y: number }>();
  for (const node of simNodes) {
    if (node.type === "person") personSpot.set(node.id, { x: node.x, y: node.y });
  }
  for (const edge of edges) {
    if (edge.type !== "works_at" || investedAnchors.has(edge.target)) continue;
    const spot = personSpot.get(edge.source);
    if (!spot) continue;
    const prev = investorAnchor.get(edge.target) ?? { x: 0, y: 0, n: 0 };
    prev.x += spot.x;
    prev.y += spot.y;
    prev.n += 1;
    investorAnchor.set(edge.target, prev);
  }
  for (const [id, name] of investorNames) {
    const spot = investorAnchor.get(id);
    const nodeAnchor = spot && spot.n ? { x: spot.x / spot.n, y: spot.y / spot.n } : { x: 2800, y: 900 };
    simNodes.push({
      id,
      type: "investor",
      label: name,
      r: radius("investor", degree.get(id) ?? 0, null, null),
      x: nodeAnchor.x,
      y: nodeAnchor.y,
      anchorX: nodeAnchor.x,
      anchorY: nodeAnchor.y,
    });
  }

  const campusLabels = new Map(universities.map((uni) => [uni.id, campusName.get(uni.id) ?? uni.name]));
  const tintCampus = new Map<string, string>();
  for (const person of people) {
    const campusId = campusesByPerson.get(person.id)?.[0];
    if (campusId) tintCampus.set(person.id, campusId);
  }
  for (const startup of startups) {
    const fromFounders = (foundersByCompany.get(startup.id) ?? []).flatMap((id) => campusesByPerson.get(id) ?? []);
    const listed = campusesByCompany.get(startup.id);
    const campusId = listed?.length ? listed[0] : [...new Set(fromFounders)][0];
    if (campusId) tintCampus.set(startup.id, campusId);
  }
  const regions = settleForceAtlas(simNodes, edges, campusLabels, tintCampus);

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
      ...(at.rimBand ? { rimBand: at.rimBand } : {}),
      ...(at.rimTier ? { rimTier: at.rimTier } : {}),
      ...(at.homeCampus ? { homeCampus: at.homeCampus } : {}),
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
      tier: program.signal_tier,
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
 * One force simulation. Each region's campuses then pull toward that
 * region's centroid until the blobs form a compact cluster, and the clusters
 * are packed until neighboring regions touch. Hubs inside a campus stay in
 * that blob. National programs are seated afterwards.
 */
function settleForceAtlas(simNodes: SimNode[], edges: MapEdge[], campusLabels: Map<string, string>, tintCampus: Map<string, string>): RegionMarker[] {
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
  for (const node of simNodes) {
    const placement = node.label ? rimPlacementFor({ label: node.label, nodeType: node.type, degree: degree.get(node.id) ?? 0 }) : null;
    node.rimBand = placement?.band ?? null;
    node.rimTier = placement?.band === "outer" ? placement.tier : null;
  }
  demoteDuplicateOuter(simNodes, degree);

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
    const tint = tintCampus.get(node.id);
    if ((node.type === "person" || node.type === "startup") && tint && campusIdSet.has(tint)) {
      primary.set(node.id, tint);
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
      // A wide campus radius excavates the middle of a small cloud (Waterloo). People fill that middle.
      node.collide = 2;
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
      node.collide = node.rimBand === "outer" ? 14 : 12;
      node.anchor = node.rimBand === "outer";
    } else if (node.rimBand === "inward") {
      node.pull = 0.22;
      node.collide = 2.2;
    } else if (node.type === "person" || node.type === "startup") {
      // A wide radius packed each campus into a shell. A small one only keeps the dots from stacking.
      node.pull = node.type === "person" ? (loose ? 0.1 : 0.14) : loose ? 0.1 : 0.13;
      node.collide = 1.15;
    } else {
      node.pull = 0.16;
      node.collide = 3.3;
    }
  }

  const hubMembers = new Map<string, string[]>();
  const pushMember = (hubId: string, memberId: string) => {
    const hub = byId.get(hubId) as LiveNode | undefined;
    const member = byId.get(memberId) as LiveNode | undefined;
    if (!hub || !member || member.hub) return;
    if (!hub.hub && !featuredNationalKey(hub.label ?? "")) return;
    const list = hubMembers.get(hubId) ?? [];
    list.push(memberId);
    hubMembers.set(hubId, list);
  };
  for (const edge of edges) {
    if (edge.type === "studied_at" || edge.type === "at_campus" || edge.type === "works_at") continue;
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
    if (!covered || hub.rimBand === "outer") {
      keptMembers.push(mine);
      continue;
    }
    hub.hub = false;
    hub.anchor = false;
    hub.pull = 0.18;
    hub.collide = 3.4;
  }

  // A hub tied to one school sits inside that campus. Main ones are labeled at the fitted view when the label fits.
  const tuckIntoCampus = (node: LiveNode, campusId: string) => {
    const seat = seats.get(campusId);
    node.hub = false;
    node.anchor = false;
    node.homeCampus = campusId;
    node.rimBand = "inward";
    node.pull = 0.42;
    node.collide = 2.2;
    node.regionId = regionOfCampus(campusId);
    if (!seat) return;
    const jitter = organicOffset(node.id, Math.min(14, seat.spread * 0.35), false, hashUnit(campusId));
    node.tx = seat.x + jitter.x;
    node.ty = seat.y + jitter.y;
    node.x = node.tx;
    node.y = node.ty;
  };
  for (const hub of live) {
    if (!hub.hub) continue;
    const named = campusNamedInLabel(hub.label ?? "");
    const home = named ? null : dominantCampus(hub.id, hubMembers, primary);
    const campusId = named ?? home?.campus;
    if (!campusId) continue;
    tuckIntoCampus(hub, campusId);
  }
  for (const node of live) {
    if (node.hub || node.type === "person" || node.type === "startup" || node.type === "campus") continue;
    const named = campusNamedInLabel(node.label ?? "");
    if (!named) continue;
    tuckIntoCampus(node, named);
  }

  const cloudNodes = live.filter((node) => !node.hub && (node.type === "person" || node.type === "startup"));
  let gx = 0;
  let gy = 0;
  for (const node of cloudNodes) {
    gx += node.tx;
    gy += node.ty;
  }
  const cloudCount = Math.max(cloudNodes.length, 1);
  gx /= cloudCount;
  gy /= cloudCount;
  const cloudEdge = (angle: number) => {
    const dists: number[] = [];
    for (const node of cloudNodes) {
      const dx = node.tx - gx;
      const dy = node.ty - gy;
      if (Math.abs(angleDelta(Math.atan2(dy, dx), angle)) > 0.7) continue;
      dists.push(Math.hypot(dx, dy));
    }
    const pool = dists.length >= 12 ? dists : cloudNodes.map((node) => Math.hypot(node.tx - gx, node.ty - gy));
    pool.sort((a, b) => a - b);
    return pool[Math.min(pool.length - 1, Math.floor(pool.length * 0.92))] ?? 80;
  };
  const hubTargets = new Map<string, { x: number; y: number }>();
  const nationals = live
    .filter((node) => node.hub)
    .sort((a, b) => tierRank(a) - tierRank(b) || (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || a.id.localeCompare(b.id));
  const taken: number[] = [];
  for (const hub of nationals) {
    const spot = linkedCampusCenter(hub, hubMembers, primary, seats);
    let dx = spot.x - gx;
    let dy = spot.y - gy;
    if (Math.hypot(dx, dy) < 28) {
      const lean = dominantCampus(hub.id, hubMembers, primary);
      const seat = lean ? seats.get(lean.campus) : undefined;
      if (seat) {
        dx = seat.x - gx;
        dy = seat.y - gy;
      }
    }
    const angle = Math.atan2(dy, dx);
    const tierPad = hub.rimTier === "S+" ? 26 : hub.rimTier === "S" ? 18 : hub.rimBand === "outer" ? 14 : 10;
    let slot = 0;
    for (const prev of taken) if (Math.abs(angleDelta(prev, angle)) < 0.42) slot += 1;
    taken.push(angle);
    const along = (slot === 0 ? 0 : (slot % 2 === 0 ? 1 : -1) * Math.ceil(slot / 2)) * 16;
    const rim = cloudEdge(angle) + tierPad;
    const tx = gx + Math.cos(angle) * rim + Math.cos(angle + Math.PI / 2) * along;
    const ty = gy + Math.sin(angle) * rim + Math.sin(angle + Math.PI / 2) * along;
    hub.tx = tx;
    hub.ty = ty;
    hub.x = tx;
    hub.y = ty;
    hub.collide = hub.rimBand === "outer" ? 7 : 4;
    hubTargets.set(hub.id, { x: tx, y: ty });
  }

  const hubs = live.filter((node) => node.hub);
  // Hubs and organizations still separate from each other. People only separate from people, so a hub cannot carve a campus into an arc.
  const colliders = live.filter((node) => node.type !== "person" && node.type !== "startup" && node.collide > 0);
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
      "members",
      forceCollide<LiveNode>()
        .radius((node) => (node.type === "person" || node.type === "startup" ? node.collide : 0))
        .strength(0.35)
        .iterations(1),
    )
    .force("collide", (alpha) => {
      const strength = 0.55 * alpha;
      for (let i = 0; i < colliders.length; i++) {
        const a = colliders[i];
        for (let j = i + 1; j < colliders.length; j++) {
          const b = colliders[j];
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          const min = a.collide + b.collide;
          const dist2 = dx * dx + dy * dy;
          if (dist2 >= min * min) continue;
          let dist = Math.sqrt(dist2);
          if (dist < 1e-4) {
            dx = 1e-3;
            dy = 0;
            dist = 1e-3;
          }
          const push = ((min - dist) / dist) * strength;
          const ra = a.collide * a.collide;
          const rb = b.collide * b.collide;
          const wa = rb / (ra + rb);
          a.vx = (a.vx ?? 0) + dx * push * wa;
          a.vy = (a.vy ?? 0) + dy * push * wa;
          b.vx = (b.vx ?? 0) - dx * push * (1 - wa);
          b.vy = (b.vy ?? 0) - dy * push * (1 - wa);
        }
      }
    })
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
  // Repack after the simulation. The collide pass was leaving large campuses as hollow arcs, and nodes with no campus sat in a ring at the origin.
  pullCampusSatellites(live, primary);
  // The presence file puts Waterloo on Boston & Northeast, same as Toronto. Sit it beside Toronto, not in the Harvard/MIT knot.
  seatWaterlooBesideToronto(live, primary);
  // Draw each region's campuses into one cluster. Affinity circles touch, so the people clouds overlap.
  pullTowardRegionCentroids(live, primary);
  // Similarity rearranges campuses inside a region, leans shared-program borders together, and lets regions overlap slightly.
  pullCampusesBySimilarity(live, edges, primary, hubMembers);
  packCampusDiscs(live, primary);
  const campusOf = new Map(primary);
  for (const [id, weights] of bridgeWeight) {
    if (campusOf.has(id)) continue;
    let bestId = "";
    let bestN = -1;
    for (const [campus, n] of weights) {
      if (n > bestN || (n === bestN && campus < bestId)) {
        bestN = n;
        bestId = campus;
      }
    }
    if (bestId) campusOf.set(id, bestId);
  }
  const bridges = placeLinkedPrograms(live, hubMembers, primary, campusOf);
  // Hubs slide toward similar campuses. Bridge programs stay pinned in the space between regions.
  pullHubsBySimilarity(live, edges, primary, bridges);
  const markers: RegionMarker[] = [];
  for (const region of REGIONS) {
    const members = campusesByRegion.get(region.id) ?? [];
    if (!members.length) continue;
    markers.push({
      id: `region:${region.id}`,
      label: CANVAS_REGION_LABEL[region.id] ?? region.label,
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

/** Short names drawn faintly beside each color group. The legend keeps the official team name. */
const CANVAS_REGION_LABEL: Record<string, string> = {
  boston: "Northeast",
  ny: "Midwest",
  philly: "Southeast",
  west: "West Coast",
  international: "International",
};

/**
 * Same-color campuses stay a group. Springs inside a region tighten that
 * group. Springs across regions, including shared programs and investors,
 * lean the borders together. Whole regions may overlap slightly.
 */
function pullCampusesBySimilarity(live: LiveNode[], edges: MapEdge[], primary: Map<string, string>, hubMembers: Map<string, string[]>) {
  const vectors = layoutVectors(live, edges, primary);
  const counts = memberCounts(primary, live);
  const radiusOf = (id: string) => discRadius(counts.get(id) ?? 1);
  const byRegion = new Map<string, LiveNode[]>();
  const groupOf = new Map<string, string>();
  for (const campus of live) {
    if (campus.type !== "campus") continue;
    const key = campus.regionId || "international";
    const list = byRegion.get(key) ?? [];
    list.push(campus);
    byRegion.set(key, list);
    groupOf.set(campus.id, key);
  }
  const links = linksWithinGroups(
    nearestSimilar([...groupOf.keys()], vectors, 5, 0.22),
    (id) => groupOf.get(id),
  );
  const linksByRegion = new Map<string, { a: string; b: string; sim: number }[]>();
  for (const link of links) {
    const key = groupOf.get(link.a) ?? "";
    const list = linksByRegion.get(key) ?? [];
    list.push(link);
    linksByRegion.set(key, list);
  }
  for (const [key, group] of byRegion) {
    if (group.length < 2) continue;
    let cx = 0;
    let cy = 0;
    for (const campus of group) {
      cx += campus.x;
      cy += campus.y;
    }
    cx /= group.length;
    cy /= group.length;
    let maxR = 0;
    for (const campus of group) maxR = Math.max(maxR, Math.hypot(campus.x - cx, campus.y - cy));
    const points: SimilarityPoint[] = group.map((node) => ({ id: node.id, x: node.x, y: node.y, r: Math.max(6, radiusOf(node.id) * 0.42) }));
    relaxSimilarity(points, linksByRegion.get(key) ?? [], { iterations: 28, anchor: 0.72, spring: 0.28, gap: 10 });
    let nx = 0;
    let ny = 0;
    for (const point of points) {
      nx += point.x;
      ny += point.y;
    }
    nx /= points.length;
    ny /= points.length;
    const shiftX = cx - nx;
    const shiftY = cy - ny;
    const at = new Map(points.map((point) => [point.id, point]));
    const limit = maxR + 2;
    for (const campus of group) {
      const point = at.get(campus.id);
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
      let x = point.x + shiftX;
      let y = point.y + shiftY;
      const ox = x - cx;
      const oy = y - cy;
      const dist = Math.hypot(ox, oy);
      if (dist > limit && dist > 0) {
        x = cx + (ox / dist) * limit;
        y = cy + (oy / dist) * limit;
      }
      campus.x = x;
      campus.y = y;
      campus.tx = x;
      campus.ty = y;
    }
  }
  seatWaterlooBesideToronto(live, primary);
  settleCampusGaps(live, primary);
  const before = regionBodiesFrom(byRegion, radiusOf);
  const bodies = [...before.entries()].map(([id, body]) => ({ id, x: body.x, y: body.y, r: regionAffinityRadius(body.core) }));
  const regionLinks: { a: string; b: string; sim: number }[] = [];
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const left = (byRegion.get(bodies[i].id) ?? []).map((node) => node.id);
      const right = (byRegion.get(bodies[j].id) ?? []).map((node) => node.id);
      regionLinks.push({
        a: bodies[i].id,
        b: bodies[j].id,
        sim: cosineSimilarity(groupVector(left, vectors), groupVector(right, vectors)),
      });
    }
  }
  // Affinity circles may overlap a little. Dissimilar regions stay near a touch, not a gap of white.
  relaxRegionBodies(bodies, regionLinks, { iterations: 32, anchor: 0.48, spring: 0.42, gap: -6, spread: 10 });
  const next = new Map(bodies.map((body) => [body.id, body]));
  for (const [regionId, group] of byRegion) {
    const from = before.get(regionId);
    const to = next.get(regionId);
    if (!from || !to) continue;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    for (const campus of group) {
      campus.x += dx;
      campus.y += dy;
      campus.tx = campus.x;
      campus.ty = campus.y;
    }
  }
  const cores = regionCores(byRegion);
  const cross = mergeSimilarityLinks([
    ...topCrossRegionLinks([...groupOf.keys()], vectors, (id) => groupOf.get(id), 3, 0.18),
    ...sharedBridgeLinks(live, hubMembers, primary, groupOf),
  ]);
  leanCampusesAcrossRegions(byRegion, cross);
  settleCampusGaps(live, primary);
  recenterRegions(byRegion, cores);
  holdRegionCores(byRegion, cores);
  seatWaterlooBesideToronto(live, primary);
}

/** Cross-region leans may shift a border campus, but the color group's center stays put. */
function recenterRegions(byRegion: Map<string, LiveNode[]>, cores: Map<string, { x: number; y: number; r: number }>) {
  for (const [regionId, group] of byRegion) {
    const own = cores.get(regionId);
    if (!own || !group.length) continue;
    let x = 0;
    let y = 0;
    for (const campus of group) {
      x += campus.x;
      y += campus.y;
    }
    x /= group.length;
    y /= group.length;
    const dx = own.x - x;
    const dy = own.y - y;
    if (Math.hypot(dx, dy) < 0.05) continue;
    for (const campus of group) {
      campus.x += dx;
      campus.y += dy;
      campus.tx = campus.x;
      campus.ty = campus.y;
    }
  }
}

/** Keep the strongest spring when cosine and a shared program both link the same campuses. */
function mergeSimilarityLinks(links: { a: string; b: string; sim: number }[]): { a: string; b: string; sim: number }[] {
  const best = new Map<string, { a: string; b: string; sim: number }>();
  for (const link of links) {
    if (link.a === link.b) continue;
    const a = link.a < link.b ? link.a : link.b;
    const b = link.a < link.b ? link.b : link.a;
    const key = `${a}|${b}`;
    const prev = best.get(key);
    if (!prev || link.sim > prev.sim) best.set(key, { a, b, sim: link.sim });
  }
  return [...best.values()];
}

/** Top campuses in other regions by cosine. Same-color neighbors are ignored. */
function topCrossRegionLinks(
  ids: string[],
  vectors: Map<string, Map<string, number>>,
  groupOf: (id: string) => string | undefined,
  k: number,
  minSim: number,
): { a: string; b: string; sim: number }[] {
  const ranked = new Map<string, { other: string; sim: number }[]>();
  for (const id of ids) ranked.set(id, []);
  for (let i = 0; i < ids.length; i++) {
    const left = vectors.get(ids[i]);
    if (!left?.size) continue;
    for (let j = i + 1; j < ids.length; j++) {
      if (groupOf(ids[i]) === groupOf(ids[j])) continue;
      const right = vectors.get(ids[j]);
      if (!right?.size) continue;
      const sim = cosineSimilarity(left, right);
      if (sim < minSim) continue;
      ranked.get(ids[i])!.push({ other: ids[j], sim });
      ranked.get(ids[j])!.push({ other: ids[i], sim });
    }
  }
  const seen = new Set<string>();
  const out: { a: string; b: string; sim: number }[] = [];
  for (const [id, list] of ranked) {
    list.sort((a, b) => b.sim - a.sim || a.other.localeCompare(b.other));
    let kept = 0;
    for (const row of list) {
      if (kept >= k) break;
      kept += 1;
      const key = id < row.other ? `${id}|${row.other}` : `${row.other}|${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ a: id, b: row.other, sim: row.sim });
    }
  }
  return out;
}

/**
 * Campuses that share a national program or investor pull toward each other,
 * so the schools on that program sit on the facing borders.
 */
function sharedBridgeLinks(
  live: LiveNode[],
  hubMembers: Map<string, string[]>,
  primary: Map<string, string>,
  groupOf: Map<string, string>,
): { a: string; b: string; sim: number }[] {
  const byId = new Map(live.map((node) => [node.id, node]));
  const best = new Map<string, number>();
  for (const [hubId, members] of hubMembers) {
    const hub = byId.get(hubId);
    if (!hub) continue;
    const byRegion = new Map<string, { id: string; n: number }[]>();
    const seen = new Set<string>();
    for (const memberId of members) {
      if (seen.has(memberId)) continue;
      seen.add(memberId);
      const campusId = primary.get(memberId);
      const regionId = campusId ? groupOf.get(campusId) : undefined;
      if (!campusId || !regionId) continue;
      const list = byRegion.get(regionId) ?? [];
      const row = list.find((item) => item.id === campusId);
      if (row) row.n += 1;
      else list.push({ id: campusId, n: 1 });
      byRegion.set(regionId, list);
    }
    if (byRegion.size < 2) continue;
    const weight = featuredNationalKey(hub.label ?? "") ? 0.92 : hub.type === "investor" ? 0.7 : 0.62;
    const tops = [...byRegion.values()].map((list) => list.sort((a, b) => b.n - a.n || a.id.localeCompare(b.id)).slice(0, 2));
    for (let i = 0; i < tops.length; i++) {
      for (let j = i + 1; j < tops.length; j++) {
        for (const a of tops[i]) {
          for (const b of tops[j]) {
            const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
            best.set(key, Math.max(best.get(key) ?? 0, weight));
          }
        }
      }
    }
  }
  return [...best.entries()].map(([key, sim]) => {
    const [a, b] = key.split("|");
    return { a, b, sim };
  });
}

/** Pull campuses toward similar schools in other regions without unstacking a color group. */
function leanCampusesAcrossRegions(byRegion: Map<string, LiveNode[]>, links: { a: string; b: string; sim: number }[]) {
  const points = new Map<string, LiveNode>();
  for (const group of byRegion.values()) {
    for (const campus of group) points.set(campus.id, campus);
  }
  const start = new Map([...points].map(([id, campus]) => [id, { x: campus.x, y: campus.y }]));
  const live = links.filter((link) => points.has(link.a) && points.has(link.b) && link.sim > 0);
  for (let iter = 0; iter < 18; iter++) {
    const vx = new Map<string, number>();
    const vy = new Map<string, number>();
    const add = (id: string, x: number, y: number) => {
      vx.set(id, (vx.get(id) ?? 0) + x);
      vy.set(id, (vy.get(id) ?? 0) + y);
    };
    for (const [id, campus] of points) {
      const origin = start.get(id);
      if (!origin) continue;
      add(id, (origin.x - campus.x) * 0.55, (origin.y - campus.y) * 0.55);
    }
    for (const link of live) {
      const a = points.get(link.a)!;
      const b = points.get(link.b)!;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let dist = Math.hypot(dx, dy);
      if (dist < 1e-3) continue;
      const ideal = 22 + (1 - Math.min(1, link.sim)) * 26;
      if (dist <= ideal) continue;
      const mag = (Math.min(link.sim, 1) * 0.4 * (dist - ideal)) / dist;
      add(a.id, dx * mag, dy * mag);
      add(b.id, -dx * mag, -dy * mag);
    }
    for (const [id, campus] of points) {
      let x = vx.get(id) ?? 0;
      let y = vy.get(id) ?? 0;
      const step = Math.hypot(x, y);
      if (step > 5) {
        x = (x / step) * 5;
        y = (y / step) * 5;
      }
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      campus.x += x;
      campus.y += y;
      campus.tx = campus.x;
      campus.ty = campus.y;
    }
  }
}

function regionCores(byRegion: Map<string, LiveNode[]>): Map<string, { x: number; y: number; r: number }> {
  const cores = new Map<string, { x: number; y: number; r: number }>();
  for (const [regionId, group] of byRegion) {
    let x = 0;
    let y = 0;
    for (const campus of group) {
      x += campus.x;
      y += campus.y;
    }
    x /= group.length || 1;
    y /= group.length || 1;
    let r = 14;
    for (const campus of group) r = Math.max(r, Math.hypot(campus.x - x, campus.y - y));
    cores.set(regionId, { x, y, r });
  }
  return cores;
}

/**
 * Color stays an affinity. A campus may sit on another region's border, but
 * not in the inner part of that core, and it stays near its own group.
 */
function holdRegionCores(byRegion: Map<string, LiveNode[]>, cores: Map<string, { x: number; y: number; r: number }>) {
  for (let pass = 0; pass < 8; pass++) {
    for (const [regionId, group] of byRegion) {
      const own = cores.get(regionId);
      if (!own) continue;
      const leash = Math.max(18, own.r * 1.2);
      for (const campus of group) {
        let dx = campus.x - own.x;
        let dy = campus.y - own.y;
        let dist = Math.hypot(dx, dy);
        if (dist > leash && dist > 0) {
          campus.x = own.x + (dx / dist) * leash;
          campus.y = own.y + (dy / dist) * leash;
        }
        for (const [otherId, foreign] of cores) {
          if (otherId === regionId) continue;
          const fx = campus.x - foreign.x;
          const fy = campus.y - foreign.y;
          const fd = Math.hypot(fx, fy);
          const inner = Math.max(16, foreign.r * 0.62);
          if (fd >= inner) continue;
          if (fd < 1e-3) {
            campus.x = foreign.x + inner;
            campus.y = foreign.y;
          } else {
            campus.x = foreign.x + (fx / fd) * inner;
            campus.y = foreign.y + (fy / fd) * inner;
          }
        }
        campus.tx = campus.x;
        campus.ty = campus.y;
      }
    }
  }
}

/** Slide free hubs toward similar campuses and hubs. Campus discs and bridge programs stay fixed. */
function pullHubsBySimilarity(live: LiveNode[], edges: MapEdge[], primary: Map<string, string>, bridgeIds: Set<string>) {
  const vectors = layoutVectors(live, edges, primary);
  const counts = memberCounts(primary, live);
  const campuses = live.filter((node) => node.type === "campus");
  const hubs = live.filter((node) => isFreeHub(node));
  if (!hubs.length) return;
  const points: SimilarityPoint[] = [
    ...campuses.map((node) => ({ id: node.id, x: node.x, y: node.y, r: discRadius(counts.get(node.id) ?? 1), pinned: true })),
    ...hubs.map((node) => ({ id: node.id, x: node.x, y: node.y, r: 8, pinned: bridgeIds.has(node.id) })),
  ];
  const links = nearestSimilar(
    points.map((point) => point.id),
    vectors,
    4,
    0.2,
  ).filter((link) => hubs.some((hub) => hub.id === link.a || hub.id === link.b));
  relaxSimilarity(points, links, { iterations: 32, anchor: 0.18, spring: 0.5, gap: 28 });
  const at = new Map(points.map((point) => [point.id, point]));
  for (const hub of hubs) {
    const next = at.get(hub.id);
    if (!next || !Number.isFinite(next.x) || !Number.isFinite(next.y)) continue;
    hub.x = next.x;
    hub.y = next.y;
    hub.tx = next.x;
    hub.ty = next.y;
  }
  const placed = new Map<string, { x: number; y: number }>();
  for (const id of bridgeIds) {
    const node = live.find((item) => item.id === id);
    if (!node) continue;
    const key = featuredNationalKey(node.label ?? "");
    if (key && !placed.has(key)) placed.set(key, { x: node.x, y: node.y });
  }
  for (const hub of hubs) {
    const key = featuredNationalKey(hub.label ?? "");
    if (key && !placed.has(key)) placed.set(key, { x: hub.x, y: hub.y });
  }
  for (const node of live) {
    const key = featuredNationalKey(node.label ?? "");
    const spot = key ? placed.get(key) : undefined;
    if (!spot) continue;
    node.x = spot.x;
    node.y = spot.y;
    node.tx = spot.x;
    node.ty = spot.y;
  }
}

function layoutVectors(live: LiveNode[], edges: MapEdge[], primary: Map<string, string>) {
  return similarityVectors({
    nodes: live.map((node) => ({
      id: node.id,
      type: node.type,
      label: node.label,
      sector: node.sector,
      hub: isFreeHub(node),
    })),
    edges,
    primaryCampus: primary,
  });
}

function isFreeHub(node: LiveNode): boolean {
  if (node.homeCampus) return false;
  return Boolean(node.hub || featuredNationalKey(node.label ?? ""));
}

/** Separate discs inside one region. A campus is never pushed into another region's cluster. */
function settleCampusGaps(live: LiveNode[], primary: Map<string, string>) {
  const counts = memberCounts(primary, live);
  const radiusOf = (id: string) => discRadius(counts.get(id) ?? 1);
  const byRegion = new Map<string, LiveNode[]>();
  for (const campus of live) {
    if (campus.type !== "campus") continue;
    const key = campus.regionId || "international";
    const list = byRegion.get(key) ?? [];
    list.push(campus);
    byRegion.set(key, list);
  }
  for (const group of byRegion.values()) {
    for (let iter = 0; iter < 12; iter++) {
      const vx = new Map<string, number>();
      const vy = new Map<string, number>();
      for (const campus of group) {
        vx.set(campus.id, 0);
        vy.set(campus.id, 0);
      }
      separateCampusDiscs(group, radiusOf, vx, vy);
      for (const campus of group) {
        campus.x += vx.get(campus.id) ?? 0;
        campus.y += vy.get(campus.id) ?? 0;
        campus.tx = campus.x;
        campus.ty = campus.y;
      }
    }
  }
}

function angleDelta(a: number, b: number): number {
  let delta = a - b;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function tierRank(node: LiveNode): number {
  if (node.rimTier === "S+") return 0;
  if (node.rimTier === "S") return 1;
  if (node.rimBand === "outer") return 2;
  return 3;
}

/** Campus named in the label, longest alias first. "HackMIT" counts as MIT. "Caltech" does not count as Cal. */
function campusNamedInLabel(label: string): string | null {
  if (/\bskydeck\b|\buc launch\b|\bcal\s*hacks\b/i.test(label)) return "univ_berkeley";
  if (/treehacks/i.test(label)) return "univ_stanford";
  if (/hack\s*the\s*north/i.test(label)) return "univ_waterloo";
  if (/pennapps|weiss tech house/i.test(label)) return "univ_penn";
  const spaced = ` ${label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
  const words = spaced.trim().split(" ").filter(Boolean);
  let best: { id: string; length: number } | null = null;
  for (const campus of CAMPUSES) {
    for (const token of [campus.shortLabel, campus.name, ...campus.aliases]) {
      const key = token.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (key.length < 3) continue;
      const word = spaced.includes(` ${key} `);
      const affix = words.some((part) => part !== key && (part.endsWith(key) || (key.length >= 5 && part.startsWith(key))));
      if (!word && !affix) continue;
      if (!best || key.length > best.length) best = { id: campus.id, length: key.length };
    }
  }
  return best?.id ?? null;
}

/** Campus that accounts for most of a hub's linked people and startups. */
function dominantCampus(hubId: string, hubMembers: Map<string, string[]>, primary: Map<string, string>): { campus: string; share: number } | null {
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  for (const id of hubMembers.get(hubId) ?? []) {
    if (seen.has(id)) continue;
    seen.add(id);
    const campus = primary.get(id);
    if (!campus) continue;
    counts.set(campus, (counts.get(campus) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const top = ranked[0];
  if (!top) return null;
  const total = ranked.reduce((sum, [, count]) => sum + count, 0);
  if (total < 3) return null;
  const second = ranked[1]?.[1] ?? 0;
  const share = top[1] / total;
  if (share >= 0.62 && top[1] >= second * 2) return { campus: top[0], share };
  return null;
}

function linkedCampusCenter(
  hub: LiveNode,
  hubMembers: Map<string, string[]>,
  primary: Map<string, string>,
  seats: Map<string, { x: number; y: number }>,
): { x: number; y: number } {
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  for (const id of hubMembers.get(hub.id) ?? []) {
    if (seen.has(id)) continue;
    seen.add(id);
    const campus = primary.get(id);
    if (!campus) continue;
    counts.set(campus, (counts.get(campus) ?? 0) + 1);
  }
  let x = 0;
  let y = 0;
  let weight = 0;
  for (const [id, count] of counts) {
    const seat = seats.get(id);
    if (!seat) continue;
    x += seat.x * count;
    y += seat.y * count;
    weight += count;
  }
  if (weight) return { x: x / weight, y: y / weight };
  return { x: hub.tx, y: hub.ty };
}

function isRimHub(node: SimNode, degree: Map<string, number>): boolean {
  if (node.rimBand === "inward") return false;
  const links = degree.get(node.id) ?? 0;
  if (node.rimBand === "outer") return links >= 2;
  if (node.type === "organization" || node.type === "program") return links >= HUB_DEGREE;
  if (node.type === "investor") return links >= INVESTOR_HUB_DEGREE;
  return false;
}

/** Filled disc around the campus seat. Reach stays near the old spread so neighboring campuses still touch. */
function organicOffset(id: string, spread: number, loose: boolean, phaseUnit: number): { x: number; y: number } {
  const unit = Math.max(1e-4, hashUnit(`${id}:u`));
  const theta = hashUnit(`${id}:a`) * Math.PI * 2;
  const reach = spread * (loose ? 1 : 0.85);
  const dist = reach * Math.sqrt(unit);
  const squash = 0.92 + 0.06 * Math.sin(phaseUnit * Math.PI * 2);
  return { x: Math.cos(theta) * dist, y: Math.sin(theta) * dist * squash };
}

function hashUnit(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 33 + id.charCodeAt(i)) >>> 0;
  return (hash % 10000) / 10000;
}

function discRadius(count: number): number {
  const n = Math.max(count, 1);
  const full = 0.78 * Math.sqrt(n);
  if (n <= 400) return Math.max(7, full);
  // Past a few hundred members, more people add less radius. Penn stays the largest disc, and CMU, Princeton, and Georgia Tech are not parked on the rim.
  const pivot = 0.78 * Math.sqrt(400);
  return pivot + (full - pivot) * 0.48;
}

/** Uniform disc. sqrt(unit) keeps the middle as full as the edge. */
function discPoint(id: string, radius: number): { x: number; y: number } {
  const unit = Math.max(1e-4, hashUnit(`${id}:disc`));
  const theta = hashUnit(`${id}:ang`) * Math.PI * 2;
  const dist = radius * Math.sqrt(unit);
  return { x: Math.cos(theta) * dist, y: Math.sin(theta) * dist };
}

function memberCounts(primary: Map<string, string>, live: LiveNode[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const node of live) {
    if (node.type !== "person" && node.type !== "startup") continue;
    const campus = primary.get(node.id);
    if (!campus) continue;
    counts.set(campus, (counts.get(campus) ?? 0) + 1);
  }
  return counts;
}

/** Waterloo stays on the Boston & Northeast team. Park it against Toronto, away from MIT, so its label is not in the Harvard/Brown pocket. */
function seatWaterlooBesideToronto(live: LiveNode[], primary: Map<string, string>) {
  const waterloo = live.find((node) => node.id === "univ_waterloo");
  const toronto = live.find((node) => node.id === "univ_toronto");
  if (!waterloo || !toronto) return;
  const mit = live.find((node) => node.id === "univ_mit");
  const counts = memberCounts(primary, live);
  const gap = discRadius(counts.get("univ_toronto") ?? 1) + discRadius(counts.get("univ_waterloo") ?? 1) + 8;
  let dx = toronto.x - (mit?.x ?? toronto.x);
  let dy = toronto.y - (mit?.y ?? toronto.y);
  if (Math.hypot(dx, dy) < 8) {
    dx = 16;
    dy = 6;
  }
  const len = Math.hypot(dx, dy) || 1;
  waterloo.x = toronto.x + (dx / len) * gap;
  waterloo.y = toronto.y + (dy / len) * gap;
}

/**
 * Radius used when seating whole regions. It is the campus-center core plus
 * a small pad, so people discs (which are larger) overlap the next color.
 */
function regionAffinityRadius(core: number): number {
  return Math.max(16, core * 0.92);
}

/** Where each regional team sits once its campuses have been pulled into one cluster. Same angles as the previous arrangement. */
const CLUSTER_ANGLE: Record<string, number> = {
  philly: -Math.PI / 2,
  west: Math.PI,
  ny: 0.04,
  boston: Math.PI / 2,
  international: Math.PI * 0.75,
};

/**
 * Pull every campus in a region toward that region's centroid, keeping discs
 * from covering each other, then set the clusters so their affinity circles
 * touch. People clouds extend past that circle and overlap. People and
 * internal clubs are repacked onto the campuses afterwards.
 */
function pullTowardRegionCentroids(live: LiveNode[], primary: Map<string, string>) {
  const counts = memberCounts(primary, live);
  const radiusOf = (id: string) => discRadius(counts.get(id) ?? 1);
  const campuses = live.filter((node) => node.type === "campus");
  const byRegion = new Map<string, LiveNode[]>();
  for (const campus of campuses) {
    const key = campus.regionId || "international";
    const list = byRegion.get(key) ?? [];
    list.push(campus);
    byRegion.set(key, list);
  }
  for (const group of byRegion.values()) {
    packAroundCentroid(group, counts, radiusOf);
    // A short gravity pass closes any gap the spiral left, without letting discs overlap.
    for (let iter = 0; iter < 24; iter++) {
      let cx = 0;
      let cy = 0;
      for (const campus of group) {
        cx += campus.x;
        cy += campus.y;
      }
      cx /= group.length || 1;
      cy /= group.length || 1;
      const vx = new Map<string, number>();
      const vy = new Map<string, number>();
      for (const campus of group) {
        vx.set(campus.id, (cx - campus.x) * 0.35);
        vy.set(campus.id, (cy - campus.y) * 0.35);
      }
      separateCampusDiscs(group, radiusOf, vx, vy);
      for (const campus of group) {
        campus.x += vx.get(campus.id) ?? 0;
        campus.y += vy.get(campus.id) ?? 0;
      }
    }
    pinWaterlooInGroup(group, radiusOf);
    for (let iter = 0; iter < 12; iter++) {
      const vx = new Map<string, number>();
      const vy = new Map<string, number>();
      for (const campus of group) {
        vx.set(campus.id, 0);
        vy.set(campus.id, 0);
      }
      separateCampusDiscs(group, radiusOf, vx, vy);
      for (const campus of group) {
        const hold = campus.id === "univ_waterloo" ? 0.15 : 1;
        campus.x += (vx.get(campus.id) ?? 0) * hold;
        campus.y += (vy.get(campus.id) ?? 0) * hold;
      }
    }
  }
  const bodies = regionBodiesFrom(byRegion, radiusOf);
  const targets = regionClusterCenters(bodies);
  for (const [regionId, group] of byRegion) {
    const from = bodies.get(regionId);
    const to = targets.get(regionId);
    if (!from || !to) continue;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    for (const campus of group) {
      campus.x += dx;
      campus.y += dy;
    }
  }
}

/** Seat campuses on the tightest ring around the region centroid that still keeps the discs apart. */
function packAroundCentroid(group: LiveNode[], counts: Map<string, number>, radiusOf: (id: string) => number) {
  const sorted = [...group].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.id.localeCompare(b.id));
  const placed: LiveNode[] = [];
  for (const campus of sorted) {
    if (!placed.length) {
      campus.x = 0;
      campus.y = 0;
      placed.push(campus);
      continue;
    }
    let spot: { x: number; y: number } | null = null;
    for (let dist = 0; dist <= 240 && !spot; dist += 1.25) {
      const steps = Math.max(12, Math.ceil((Math.PI * 2 * Math.max(dist, 1)) / 5));
      for (let step = 0; step < steps; step++) {
        const angle = (step / steps) * Math.PI * 2 + hashUnit(campus.id) * 0.4;
        const x = Math.cos(angle) * dist;
        const y = Math.sin(angle) * dist;
        const clear = placed.every((other) => Math.hypot(other.x - x, other.y - y) + 0.05 >= campusPairGap(campus, other, radiusOf));
        if (!clear) continue;
        spot = { x, y };
        break;
      }
    }
    campus.x = spot?.x ?? 0;
    campus.y = spot?.y ?? 0;
    placed.push(campus);
  }
}

function separateCampusDiscs(group: LiveNode[], radiusOf: (id: string) => number, vx: Map<string, number>, vy: Map<string, number>) {
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const a = group[i];
      const b = group[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let dist = Math.hypot(dx, dy);
      const min = campusPairGap(a, b, radiusOf);
      if (dist >= min) continue;
      if (dist < 1e-3) {
        dx = 1;
        dy = 0;
        dist = 1;
      }
      const push = ((min - dist) / dist) * 0.55;
      vx.set(a.id, (vx.get(a.id) ?? 0) - dx * push * 0.5);
      vy.set(a.id, (vy.get(a.id) ?? 0) - dy * push * 0.5);
      vx.set(b.id, (vx.get(b.id) ?? 0) + dx * push * 0.5);
      vy.set(b.id, (vy.get(b.id) ?? 0) + dy * push * 0.5);
    }
  }
}

/**
 * Centers sit closer than the two full people-discs, so schools in one region
 * overlap into a single stack. Queen's and Cambridge keep a little extra room
 * for their long names.
 */
function campusPairGap(a: LiveNode, b: LiveNode, radiusOf: (id: string) => number): number {
  const ra = radiusOf(a.id);
  const rb = radiusOf(b.id);
  const touch = ra + rb + 3.5;
  const stacked = Math.max(ra, rb) * 0.62 + Math.min(ra, rb) * 0.28 + 5;
  let gap = Math.min(touch, stacked);
  const pair = `${a.id}|${b.id}`;
  if (pair === "univ_queens|univ_cambridge" || pair === "univ_cambridge|univ_queens") gap = Math.max(gap, 28);
  else if (pair.includes("univ_laurentian") && (pair.includes("univ_queens") || pair.includes("univ_cambridge"))) gap = Math.max(gap, 24);
  return gap;
}

function pinWaterlooInGroup(group: LiveNode[], radiusOf: (id: string) => number) {
  const waterloo = group.find((node) => node.id === "univ_waterloo");
  const toronto = group.find((node) => node.id === "univ_toronto");
  if (!waterloo || !toronto) return;
  const mit = group.find((node) => node.id === "univ_mit");
  const gap = radiusOf("univ_toronto") + radiusOf("univ_waterloo") + 8;
  let dx = toronto.x - (mit?.x ?? toronto.x - 18);
  let dy = toronto.y - (mit?.y ?? toronto.y);
  const len = Math.hypot(dx, dy) || 1;
  waterloo.x = toronto.x + (dx / len) * gap;
  waterloo.y = toronto.y + (dy / len) * gap;
}

function regionBodiesFrom(byRegion: Map<string, LiveNode[]>, radiusOf: (id: string) => number): Map<string, { x: number; y: number; r: number; core: number }> {
  const bodies = new Map<string, { x: number; y: number; r: number; core: number }>();
  for (const [regionId, group] of byRegion) {
    let x = 0;
    let y = 0;
    for (const campus of group) {
      x += campus.x;
      y += campus.y;
    }
    x /= group.length || 1;
    y /= group.length || 1;
    let r = 12;
    let core = 14;
    for (const campus of group) {
      const dist = Math.hypot(campus.x - x, campus.y - y);
      r = Math.max(r, dist + radiusOf(campus.id));
      core = Math.max(core, dist);
    }
    bodies.set(regionId, { x, y, r, core });
  }
  return bodies;
}

function regionClusterCenters(bodies: Map<string, { x: number; y: number; r: number; core: number }>): Map<string, { x: number; y: number }> {
  // Pack on the campus-center core plus a pad. People clouds extend past it and overlap.
  return packRegionCenters(
    [...bodies.entries()].map(([id, body]) => ({ id, r: regionAffinityRadius(body.core) })),
    (id) => CLUSTER_ANGLE[id] ?? 0,
    0,
  );
}

/** Draw every smaller campus in until its disc touches the largest campus in the same region. */
function pullCampusSatellites(live: LiveNode[], primary: Map<string, string>) {
  const campuses = live.filter((node) => node.type === "campus");
  const counts = memberCounts(primary, live);
  const radiusOf = (id: string) => discRadius(counts.get(id) ?? 1);
  const byRegion = new Map<string, LiveNode[]>();
  for (const campus of campuses) {
    const key = campus.regionId ?? "";
    const list = byRegion.get(key) ?? [];
    list.push(campus);
    byRegion.set(key, list);
  }
  for (const group of byRegion.values()) {
    const anchor = group.reduce((best, campus) => (radiusOf(campus.id) > radiusOf(best.id) ? campus : best));
    for (const campus of group) {
      if (campus === anchor) continue;
      const dx = campus.x - anchor.x;
      const dy = campus.y - anchor.y;
      const dist = Math.hypot(dx, dy) || 1;
      const want = radiusOf(anchor.id) + radiusOf(campus.id) + 4;
      if (dist <= want + 1) continue;
      campus.x = anchor.x + (dx / dist) * want;
      campus.y = anchor.y + (dy / dist) * want;
    }
  }
}

/**
 * Each campus becomes one filled disc. People with no campus fold into the
 * nearest disc instead of sitting in the middle or in a side clump.
 */
function packCampusDiscs(live: LiveNode[], primary: Map<string, string>) {
  const campuses = live.filter((node) => node.type === "campus");
  const byId = new Map(campuses.map((campus) => [campus.id, campus]));
  const groups = new Map<string, LiveNode[]>();
  const claim = (campusId: string, node: LiveNode) => {
    const list = groups.get(campusId) ?? [];
    list.push(node);
    groups.set(campusId, list);
  };
  const nearestCampus = (node: LiveNode) => {
    let best: LiveNode | null = null;
    let bestDist = Infinity;
    for (const campus of campuses) {
      const dist = Math.hypot(node.x - campus.x, node.y - campus.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = campus;
      }
    }
    return best;
  };
  for (const node of live) {
    if (node.type !== "person" && node.type !== "startup") continue;
    const campusId = primary.get(node.id);
    const campus = (campusId && byId.get(campusId)) || nearestCampus(node);
    if (campus) claim(campus.id, node);
  }
  for (const [campusId, members] of groups) {
    const campus = byId.get(campusId);
    if (!campus) continue;
    const radius = discRadius(members.length);
    for (const node of members) {
      const at = discPoint(node.id, radius);
      node.x = campus.x + at.x;
      node.y = campus.y + at.y;
    }
  }
  for (const node of live) {
    if (node.type === "campus" || node.type === "person" || node.type === "startup" || node.hub) continue;
    if (featuredNationalKey(node.label ?? "")) continue;
    const named = node.homeCampus || campusNamedInLabel(node.label ?? "");
    const campus = (named && byId.get(named)) || nearestCampus(node);
    if (!campus) continue;
    const radius = Math.min(10, discRadius(groups.get(campus.id)?.length ?? 1) * 0.4);
    const at = discPoint(node.id, radius);
    node.x = campus.x + at.x;
    node.y = campus.y + at.y;
  }
}

/** Push a point out to just past each region's campus-center core, toward the other regions. */
function outsideRegionCores(x: number, y: number, centers: { x: number; y: number; core: number }[]): { x: number; y: number } {
  let px = x;
  let py = y;
  for (let iter = 0; iter < 8; iter++) {
    let moved = false;
    for (const center of centers) {
      let dx = px - center.x;
      let dy = py - center.y;
      let dist = Math.hypot(dx, dy);
      const edge = center.core + 6;
      if (dist >= edge) continue;
      if (dist < 1) {
        const other = centers.find((item) => item !== center);
        dx = (other?.x ?? center.x + 1) - center.x;
        dy = (other?.y ?? center.y) - center.y;
        dist = Math.hypot(dx, dy) || 1;
      }
      px = center.x + (dx / dist) * edge;
      py = center.y + (dy / dist) * edge;
      moved = true;
    }
    if (!moved) break;
  }
  return { x: px, y: py };
}

/**
 * Programs that reach two or more regions sit at the weighted midpoint of
 * those regions — the connective space, not a ring outside the clouds.
 * Returns the hub ids that should stay pinned there.
 */
function placeLinkedPrograms(live: LiveNode[], hubMembers: Map<string, string[]>, primary: Map<string, string>, campusOf: Map<string, string>): Set<string> {
  const campuses = new Map(live.filter((node) => node.type === "campus").map((node) => [node.id, node]));
  const counts = memberCounts(primary, live);
  const ranked = live
    .filter((node) => node.hub || featuredNationalKey(node.label ?? ""))
    .sort((a, b) => tierRank(a) - tierRank(b) || (hubMembers.get(b.id)?.length ?? 0) - (hubMembers.get(a.id)?.length ?? 0) || a.id.localeCompare(b.id));
  const seenKey = new Set<string>();
  const chosen: LiveNode[] = [];
  for (const node of ranked) {
    const key = featuredNationalKey(node.label ?? "") ?? `id:${node.id}`;
    if (seenKey.has(key)) continue;
    seenKey.add(key);
    chosen.push(node);
  }
  const radiusOf = (id: string) => discRadius(counts.get(id) ?? 1);
  const weightsFor = (node: LiveNode) => {
    const weights = new Map<string, number>();
    const seen = new Set<string>();
    for (const id of hubMembers.get(node.id) ?? []) {
      if (seen.has(id)) continue;
      seen.add(id);
      const campus = campusOf.get(id);
      if (!campus || !campuses.has(campus)) continue;
      weights.set(campus, (weights.get(campus) ?? 0) + 1);
    }
    return weights;
  };
  const byRegion = new Map<string, LiveNode[]>();
  for (const campus of campuses.values()) {
    const key = campus.regionId || "international";
    const list = byRegion.get(key) ?? [];
    list.push(campus);
    byRegion.set(key, list);
  }
  const bodies = regionBodiesFrom(byRegion, radiusOf);
  let cloudX = 0;
  let cloudY = 0;
  for (const body of bodies.values()) {
    cloudX += body.x;
    cloudY += body.y;
  }
  cloudX /= bodies.size || 1;
  cloudY /= bodies.size || 1;
  const taken: { x: number; y: number }[] = [];
  const clearOfCampuses = (x: number, y: number, bridging: boolean) => {
    for (const campus of campuses.values()) {
      if (Math.hypot(x - campus.x, y - campus.y) < Math.max(12, radiusOf(campus.id) * 0.42)) return false;
    }
    if (bridging) {
      for (const body of bodies.values()) {
        if (Math.hypot(x - body.x, y - body.y) < body.core + 4) return false;
      }
    }
    return taken.every((prev) => Math.hypot(prev.x - x, prev.y - y) >= 16);
  };
  const nudgeClear = (aim: { x: number; y: number }, bridging: boolean) => {
    if (clearOfCampuses(aim.x, aim.y, bridging)) return aim;
    for (let extra = 6; extra <= 48; extra += 6) {
      for (let step = 0; step < 18; step++) {
        const spin = (step / 18) * Math.PI * 2;
        const spot = { x: aim.x + Math.cos(spin) * extra, y: aim.y + Math.sin(spin) * extra };
        if (clearOfCampuses(spot.x, spot.y, bridging)) return spot;
      }
    }
    return aim;
  };
  const seatAt = (node: LiveNode, x: number, y: number) => {
    node.x = x;
    node.y = y;
    node.tx = x;
    node.ty = y;
    taken.push({ x, y });
  };
  const regionLinks = (node: LiveNode) => {
    const weights = weightsFor(node);
    const totals = new Map<string, { count: number; campusId: string; best: number }>();
    for (const [campusId, n] of weights) {
      const campus = campuses.get(campusId);
      const regionId = campus?.regionId || "international";
      const row = totals.get(regionId) ?? { count: 0, campusId, best: -1 };
      row.count += n;
      if (n > row.best || (n === row.best && campusId < row.campusId)) {
        row.best = n;
        row.campusId = campusId;
      }
      totals.set(regionId, row);
    }
    return [...totals.entries()]
      .map(([id, row]) => ({ id, count: row.count, campusId: row.campusId }))
      .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  };
  const placedKey = new Map<string, { x: number; y: number }>();
  const laneCount = new Map<string, number>();
  const programLane = (key: string) => {
    const n = laneCount.get(key) ?? 0;
    laneCount.set(key, n + 1);
    if (n === 0) return 0;
    const side = n % 2 === 0 ? 1 : -1;
    return side * Math.ceil(n / 2) * 12;
  };
  const bridges = new Set<string>();
  const bridgeKeys = new Set<string>();
  for (const node of chosen) {
    const links = regionLinks(node);
    const strong = links[0];
    const body = strong ? bodies.get(strong.id) : undefined;
    const featured = Boolean(featuredNationalKey(node.label ?? ""));
    let aim: { x: number; y: number } | null = null;
    let bridging = false;
    if (body && strong) {
      const linked = links.filter((row, index) => {
        if (!bodies.has(row.id)) return false;
        if (index === 0) return true;
        if (featured) return row.count >= 1;
        return row.count >= Math.max(2, strong.count * 0.12);
      });
      bridging = linked.length >= 2;
      const laneKey = linked.map((row) => row.id).join("|");
      const lane = programLane(laneKey);
      let wx = 0;
      let wy = 0;
      let ww = 0;
      for (const row of linked) {
        const center = bodies.get(row.id);
        if (!center) continue;
        wx += center.x * row.count;
        wy += center.y * row.count;
        ww += row.count;
      }
      wx /= ww || 1;
      wy /= ww || 1;
      if (bridging) {
        const centers = linked.map((row) => bodies.get(row.id)).filter((center): center is NonNullable<typeof center> => !!center);
        const seam = outsideRegionCores(wx, wy, centers);
        const left = bodies.get(linked[0].id);
        const right = bodies.get(linked[1].id);
        let dx = (right?.x ?? seam.x) - (left?.x ?? seam.x);
        let dy = (right?.y ?? seam.y) - (left?.y ?? seam.y);
        let dist = Math.hypot(dx, dy);
        if (dist < 1) {
          dx = 1;
          dy = 0;
          dist = 1;
        }
        aim = { x: seam.x + (-dy / dist) * lane, y: seam.y + (dx / dist) * lane };
      } else {
        let dx = cloudX - body.x;
        let dy = cloudY - body.y;
        let dist = Math.hypot(dx, dy);
        if (dist < 1) {
          dx = 0;
          dy = -1;
          dist = 1;
        }
        const along = Math.min(dist, body.core + 4);
        aim = {
          x: body.x + (dx / dist) * along + (-dy / dist) * lane,
          y: body.y + (dy / dist) * along + (dx / dist) * lane,
        };
      }
    }
    if (!aim) {
      aim = { x: cloudX, y: cloudY };
    }
    const spot = nudgeClear(aim, bridging);
    seatAt(node, spot.x, spot.y);
    const key = featuredNationalKey(node.label ?? "");
    if (bridging) {
      bridges.add(node.id);
      if (key) bridgeKeys.add(key);
    }
    if (key && !placedKey.has(key)) placedKey.set(key, spot);
  }
  for (const node of live) {
    const key = featuredNationalKey(node.label ?? "");
    if (!key) continue;
    if (bridgeKeys.has(key)) bridges.add(node.id);
    const at = placedKey.get(key);
    if (!at || (node.x === at.x && node.y === at.y)) continue;
    node.x = at.x;
    node.y = at.y;
    node.tx = at.x;
    node.ty = at.y;
  }
  return bridges;
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

/** Faint region name on the outer part of its own color group, away from the middle of the cloud. */
function placeRegionLabels(markers: RegionMarker[], simNodes: SimNode[]) {
  if (!markers.length || !simNodes.length) return;
  const byId = new Map(simNodes.map((node) => [node.id, node]));
  const campusNodes = simNodes.filter((node) => node.type === "campus");
  const blobs = markers.map((marker) => {
    const campuses = marker.campusIds.map((id) => byId.get(id)).filter((node): node is SimNode => !!node);
    let x = 0;
    let y = 0;
    for (const campus of campuses) {
      x += campus.x;
      y += campus.y;
    }
    const count = campuses.length || 1;
    x /= count;
    y /= count;
    const memberIds = new Set(campuses.map((campus) => campus.id));
    let reach = 28;
    for (const campus of campuses) reach = Math.max(reach, Math.hypot(campus.x - x, campus.y - y));
    for (const node of simNodes) {
      if (node.type !== "person" && node.type !== "startup") continue;
      let nearestId = "";
      let nearestDist = Infinity;
      for (const campus of campusNodes) {
        const dist = Math.hypot(node.x - campus.x, node.y - campus.y);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestId = campus.id;
        }
      }
      if (!memberIds.has(nearestId)) continue;
      reach = Math.max(reach, Math.hypot(node.x - x, node.y - y));
    }
    return { marker, x, y, reach };
  });
  let cx = 0;
  let cy = 0;
  for (const blob of blobs) {
    cx += blob.x;
    cy += blob.y;
  }
  cx /= blobs.length || 1;
  cy /= blobs.length || 1;
  for (const blob of blobs) {
    let dx = blob.x - cx;
    let dy = blob.y - cy;
    let dist = Math.hypot(dx, dy);
    if (dist < 1) {
      dx = 0;
      dy = -1;
      dist = 1;
    }
    const along = Math.max(32, blob.reach * 0.62);
    blob.marker.x = blob.x + (dx / dist) * along;
    blob.marker.y = blob.y + (dy / dist) * along;
  }
  const gap = 52;
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
