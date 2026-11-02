// Builds the /networks desk from stored claims, investor facts, program
// signals, and relationships. Every founder link is directed: network to
// founder of an investable company. Prior employers are omitted because
// the corpus has almost no works_at rows.

import fs from "node:fs";
import { getDb } from "../db/client";
import { shortCampusLabel } from "./campuses";
import {
  NATIONAL_PROGRAMS,
  claimProgramTexts,
  programsInText,
} from "./national-programs";
import { sectorLabel } from "./sectors";
import {
  CONCENTRATION_THRESHOLDS,
  type ConcentrationBand,
  type FounderNetworksPage,
  type GraphEdge,
  type GraphNode,
  type GraphPayload,
  type MatrixCell,
  type NetworkKind,
  type NetworkMember,
  type NetworkSummary,
  type SectorConcentration,
} from "./founder-networks-model";

interface NetDef {
  id: string;
  label: string;
  kind: NetworkKind;
}

const CAMPUS_AND_LAB: NetDef[] = [
  { id: "vipx", label: "Penn Venture Lab VIP-X", kind: "accelerator" },
  { id: "skydeck", label: "Berkeley SkyDeck", kind: "accelerator" },
  { id: "elab", label: "Cornell eLab", kind: "accelerator" },
  { id: "velocity", label: "Velocity", kind: "accelerator" },
  { id: "mit_deltav", label: "MIT delta v", kind: "accelerator" },
  { id: "cardinal", label: "Cardinal Ventures", kind: "accelerator" },
  { id: "brown_vp", label: "Brown Venture Prize", kind: "program" },
  { id: "nyu_launchpad", label: "NYU Summer Launchpad", kind: "program" },
  { id: "venturecat", label: "VentureCat", kind: "program" },
  { id: "tsai", label: "Tsai CITY", kind: "program" },
  { id: "columbia_sl", label: "Columbia Startup Lab", kind: "lab" },
  { id: "grasp", label: "Penn GRASP Lab", kind: "lab" },
  { id: "mayfield", label: "Mayfield Fellows Program", kind: "program" },
  { id: "innovate_x_la", label: "Das Family Innovate X LA", kind: "program" },
  { id: "cal_launchpad", label: "Cal Launchpad", kind: "program" },
  { id: "summer_venture_studio", label: "Summer Venture Studio", kind: "program" },
];

const SOURCE_URL_RULES: { test: RegExp; id: string; label: string; kind: NetworkKind }[] = [
  { test: /ycombinator\.com/i, id: "yc", label: "Y Combinator", kind: "accelerator" },
  { test: /skydeck\.berkeley/i, id: "skydeck", label: "Berkeley SkyDeck", kind: "accelerator" },
  { test: /venturelab\.upenn|vip-?x/i, id: "vipx", label: "Penn Venture Lab VIP-X", kind: "accelerator" },
  { test: /speedrun\.a16z/i, id: "speedrun", label: "a16z Speedrun", kind: "accelerator" },
  { test: /grasp\.upenn/i, id: "grasp", label: "Penn GRASP Lab", kind: "lab" },
  { test: /velocityincubator|uwaterloo\.ca\/velocity/i, id: "velocity", label: "Velocity", kind: "accelerator" },
  { test: /entrepreneurship\.mit\.edu\/(?:accelerator|delta)/i, id: "mit_deltav", label: "MIT delta v", kind: "accelerator" },
  { test: /elab\.cornell/i, id: "elab", label: "Cornell eLab", kind: "accelerator" },
];

const EXTRA_TEXT_RULES: { test: RegExp; id: string }[] = [
  { test: /vip-?x|penn venture lab|venture lab vip/i, id: "vipx" },
  { test: /skydeck/i, id: "skydeck" },
  { test: /cornell elab|elab \(cornell\)/i, id: "elab" },
  { test: /\bvelocity\b/i, id: "velocity" },
  { test: /delta\s*v/i, id: "mit_deltav" },
  { test: /cardinal ventures/i, id: "cardinal" },
  { test: /brown venture prize/i, id: "brown_vp" },
  { test: /nyu summer launchpad|summer launchpad/i, id: "nyu_launchpad" },
  { test: /venturecat/i, id: "venturecat" },
  { test: /tsai city/i, id: "tsai" },
  { test: /columbia startup lab/i, id: "columbia_sl" },
  { test: /\bgrasp\b/i, id: "grasp" },
  { test: /mayfield fellows/i, id: "mayfield" },
  { test: /innovate x la|das family innovate/i, id: "innovate_x_la" },
  { test: /cal launchpad/i, id: "cal_launchpad" },
  { test: /summer venture studio/i, id: "summer_venture_studio" },
];

const ACCELERATOR_PROGRAM_IDS = new Set(["yc", "speedrun", "founders_inc", "pear", "spc", "agi_house"]);

interface Link {
  networkId: string;
  label: string;
  kind: NetworkKind;
  founderId: string;
  companyId: string;
  sourceKey: string;
}

interface LinkMeta {
  companyNames: Map<string, string>;
  founderNames: Map<string, string>;
  founderCampuses: Map<string, string[]>;
  companyFounders: Map<string, Set<string>>;
  companySectors: Map<string, string>;
  uniLabels: Map<string, string>;
  corpusCompanies: number;
}

let pageCache: { stamp: string; page: FounderNetworksPage } | null = null;
let linkCache: { stamp: string; links: Link[]; meta: LinkMeta } | null = null;

function dbStamp(): string {
  try {
    const st = fs.statSync(/*turbopackIgnore: true*/ process.env.CAMPUS_UNIVERSE_DB || "data/campus-universe.db");
    return `${st.mtimeMs}:${st.size}`;
  } catch {
    return "missing";
  }
}

function kindForNational(id: string): NetworkKind {
  if (ACCELERATOR_PROGRAM_IDS.has(id)) return "accelerator";
  if (id === "emergent" || id === "fund_1517") return "investor";
  return "program";
}

function lookupExtra(id: string): NetDef | null {
  return CAMPUS_AND_LAB.find((item) => item.id === id) ?? null;
}

function netsFromText(raw: string): NetDef[] {
  const out: NetDef[] = [];
  const seen = new Set<string>();
  for (const program of programsInText(raw)) {
    if (seen.has(program.id)) continue;
    seen.add(program.id);
    out.push({ id: program.id, label: program.label, kind: kindForNational(program.id) });
  }
  for (const rule of EXTRA_TEXT_RULES) {
    if (!rule.test.test(raw)) continue;
    if (seen.has(rule.id)) continue;
    const def = lookupExtra(rule.id);
    if (!def) continue;
    seen.add(rule.id);
    out.push(def);
  }
  return out;
}

function investorNetwork(name: string): NetDef | null {
  const label = name.trim();
  if (label.length < 2) return null;
  if (netsFromText(label).length > 0) return null;
  if (/^(investor|undisclosed|angel|friends and family)$/i.test(label)) return null;
  const id = `inv_${label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
  if (id === "inv_" || id.length < 6) return null;
  return { id, label, kind: "investor" };
}

function loadMeta(db: ReturnType<typeof getDb>): LinkMeta {
  const companies = db.prepare(`SELECT id, name FROM projects WHERE kind = 'company' AND is_investable_candidate = 1`).all() as {
    id: string;
    name: string;
  }[];
  const companyNames = new Map(companies.map((row) => [row.id, row.name]));
  const corpusCompanies = companies.length;

  const companyFounders = new Map<string, Set<string>>();
  const founderNames = new Map<string, string>();
  for (const row of db
    .prepare(
      `SELECT ppr.person_id, ppr.project_id, pe.name
       FROM person_project_roles ppr
       JOIN projects p ON p.id = ppr.project_id
       JOIN people pe ON pe.id = ppr.person_id
       WHERE p.kind = 'company' AND p.is_investable_candidate = 1
         AND lower(ppr.role) LIKE '%founder%'
         AND pe.founder_status = 'founder'`
    )
    .all() as { person_id: string; project_id: string; name: string }[]) {
    const set = companyFounders.get(row.project_id) ?? new Set();
    set.add(row.person_id);
    companyFounders.set(row.project_id, set);
    founderNames.set(row.person_id, row.name);
  }

  const founderCampuses = new Map<string, string[]>();
  for (const row of db.prepare(`SELECT person_id, university_id FROM affiliations`).all() as {
    person_id: string;
    university_id: string;
  }[]) {
    if (!founderNames.has(row.person_id)) continue;
    const list = founderCampuses.get(row.person_id) ?? [];
    if (!list.includes(row.university_id)) list.push(row.university_id);
    founderCampuses.set(row.person_id, list);
  }

  const uniLabels = new Map<string, string>();
  for (const row of db.prepare(`SELECT id, name FROM universities`).all() as { id: string; name: string }[]) {
    uniLabels.set(row.id, shortCampusLabel(row.id, row.name));
  }

  const companySectors = new Map<string, string>();
  for (const row of db
    .prepare(
      `SELECT project_id, tag FROM project_sector_tags
       WHERE project_id IN (SELECT id FROM projects WHERE kind = 'company' AND is_investable_candidate = 1)
       ORDER BY is_primary DESC, tag`
    )
    .all() as { project_id: string; tag: string }[]) {
    if (!companySectors.has(row.project_id)) companySectors.set(row.project_id, row.tag);
  }

  return { companyNames, founderNames, founderCampuses, companyFounders, companySectors, uniLabels, corpusCompanies };
}

function collectLinks(db: ReturnType<typeof getDb>, meta: LinkMeta): Link[] {
  const links: Link[] = [];
  const seen = new Set<string>();
  const investable = new Set(meta.companyNames.keys());
  const founderCompanies = new Map<string, Set<string>>();
  for (const [companyId, founders] of meta.companyFounders) {
    for (const founderId of founders) {
      const set = founderCompanies.get(founderId) ?? new Set();
      set.add(companyId);
      founderCompanies.set(founderId, set);
    }
  }

  const add = (net: NetDef, founderId: string, companyId: string, sourceKey: string) => {
    if (!investable.has(companyId)) return;
    if (!founderCompanies.get(founderId)?.has(companyId)) return;
    const key = `${net.id}|${founderId}|${companyId}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ networkId: net.id, label: net.label, kind: net.kind, founderId, companyId, sourceKey });
  };

  const addCompany = (net: NetDef, companyId: string, sourceKey: string) => {
    for (const founderId of meta.companyFounders.get(companyId) ?? []) add(net, founderId, companyId, sourceKey);
  };
  const addPerson = (net: NetDef, personId: string, sourceKey: string) => {
    for (const companyId of founderCompanies.get(personId) ?? []) add(net, personId, companyId, sourceKey);
  };

  const absorbTexts = (texts: string[], onNet: (net: NetDef) => void) => {
    const local = new Set<string>();
    for (const text of texts) {
      for (const net of netsFromText(text)) {
        if (local.has(net.id)) continue;
        local.add(net.id);
        onNet(net);
      }
    }
  };

  for (const claim of db
    .prepare(
      `SELECT c.entity_type, c.entity_id, c.claim_type, c.value_json, c.source_url, s.name AS source_name
       FROM claims c
       LEFT JOIN sources s ON s.id = c.source_id
       WHERE c.claim_type IN (
         'program_membership',
         'accelerator_membership',
         'accelerator_founder',
         'lab_spinout',
         'lab_spinout_founder',
         'program_listing',
         'funding',
         'bio_membership'
       )`
    )
    .all() as {
    entity_type: string;
    entity_id: string;
    claim_type: string;
    value_json: string;
    source_url: string | null;
    source_name: string | null;
  }[]) {
    const texts = claimProgramTexts(claim.value_json, claim.source_name);
    let org = "";
    try {
      const parsed = JSON.parse(claim.value_json || "{}") as { org?: string; program?: string };
      org = (parsed.org || parsed.program || "").trim();
    } catch {
      org = "";
    }
    const bag = [...texts, org, claim.source_url || ""].filter(Boolean);
    const nets = new Map<string, NetDef>();
    absorbTexts(bag, (net) => nets.set(net.id, net));
    for (const rule of SOURCE_URL_RULES) {
      if (claim.source_url && rule.test.test(claim.source_url)) {
        nets.set(rule.id, { id: rule.id, label: rule.label, kind: rule.kind });
      }
    }
    const sourceKey = `claims.${claim.claim_type}`;
    for (const net of nets.values()) {
      if (claim.entity_type === "person") addPerson(net, claim.entity_id, sourceKey);
      else if (claim.entity_type === "project") addCompany(net, claim.entity_id, sourceKey);
    }
  }

  for (const row of db.prepare(`SELECT project_id, value_text FROM company_facts WHERE fact_key = 'investor'`).all() as {
    project_id: string;
    value_text: string;
  }[]) {
    absorbTexts([row.value_text], (net) => addCompany(net, row.project_id, "company_facts.investor"));
    const inv = investorNetwork(row.value_text);
    if (inv) addCompany(inv, row.project_id, "company_facts.investor");
  }

  for (const row of db.prepare(`SELECT person_id, signal_type, label FROM program_signals`).all() as {
    person_id: string;
    signal_type: string;
    label: string;
  }[]) {
    const national = NATIONAL_PROGRAMS.find((item) => item.signalType === row.signal_type);
    if (national) {
      addPerson({ id: national.id, label: national.label, kind: kindForNational(national.id) }, row.person_id, "program_signals");
    }
    absorbTexts([row.label || ""], (net) => addPerson(net, row.person_id, "program_signals"));
  }

  for (const row of db
    .prepare(
      `SELECT r.relationship_type, r.source_entity_type, r.source_entity_id, p.name AS program_name
       FROM relationships r
       JOIN projects p ON p.id = r.target_entity_id
       WHERE r.relationship_type IN ('part_of_program', 'participated_in_program')`
    )
    .all() as {
    relationship_type: string;
    source_entity_type: string;
    source_entity_id: string;
    program_name: string;
  }[]) {
    absorbTexts([row.program_name], (net) => {
      if (row.relationship_type === "participated_in_program" && row.source_entity_type === "person") {
        addPerson(net, row.source_entity_id, "relationships.program");
      }
      if (row.relationship_type === "part_of_program" && row.source_entity_type === "project") {
        addCompany(net, row.source_entity_id, "relationships.program");
      }
    });
  }

  return links;
}

function bandFor(share: number): ConcentrationBand {
  if (share >= CONCENTRATION_THRESHOLDS.concentratedMin) return "Concentrated";
  if (share >= CONCENTRATION_THRESHOLDS.moderateMin) return "Moderate";
  return "Broad";
}

export function loadFounderNetworkLinks(): { links: Link[]; meta: LinkMeta } {
  const stamp = dbStamp();
  if (linkCache?.stamp === stamp) return { links: linkCache.links, meta: linkCache.meta };
  const db = getDb();
  const meta = loadMeta(db);
  const links = collectLinks(db, meta);
  linkCache = { stamp, links, meta };
  return { links, meta };
}

export function buildFounderNetworksPage(): FounderNetworksPage {
  const stamp = dbStamp();
  if (pageCache?.stamp === stamp) return pageCache.page;
  const { links, meta } = loadFounderNetworkLinks();

  const byNetwork = new Map<
    string,
    { label: string; kind: NetworkKind; founders: Set<string>; companies: Set<string>; campuses: Set<string>; sourceKeys: Set<string> }
  >();
  const bySourceKey = new Map<string, number>();

  for (const link of links) {
    const row =
      byNetwork.get(link.networkId) ??
      {
        label: link.label,
        kind: link.kind,
        founders: new Set<string>(),
        companies: new Set<string>(),
        campuses: new Set<string>(),
        sourceKeys: new Set<string>(),
      };
    row.founders.add(link.founderId);
    row.companies.add(link.companyId);
    for (const campusId of meta.founderCampuses.get(link.founderId) ?? []) row.campuses.add(campusId);
    row.sourceKeys.add(link.sourceKey);
    byNetwork.set(link.networkId, row);
    bySourceKey.set(link.sourceKey, (bySourceKey.get(link.sourceKey) ?? 0) + 1);
  }

  const summaries: NetworkSummary[] = [...byNetwork.entries()]
    .map(([id, row]) => ({
      id,
      label: row.label,
      kind: row.kind,
      founderCount: row.founders.size,
      companyCount: row.companies.size,
      campusCount: row.campuses.size,
    }))
    .filter((row) => row.founderCount > 0)
    .sort((a, b) => b.founderCount - a.founderCount || a.label.localeCompare(b.label));

  const topNetworks = summaries.slice(0, 24);
  const topIds = new Set(topNetworks.map((row) => row.id));

  const membersByNetwork: Record<string, NetworkMember[]> = {};
  for (const net of topNetworks) {
    const members: NetworkMember[] = [];
    const seenMember = new Set<string>();
    for (const link of links) {
      if (link.networkId !== net.id) continue;
      const key = `${link.founderId}|${link.companyId}`;
      if (seenMember.has(key)) continue;
      seenMember.add(key);
      const campuses = meta.founderCampuses.get(link.founderId) ?? [];
      const campusId = campuses[0] ?? null;
      members.push({
        founderId: link.founderId,
        founderName: meta.founderNames.get(link.founderId) ?? link.founderId,
        companyId: link.companyId,
        companyName: meta.companyNames.get(link.companyId) ?? link.companyId,
        campusId,
        campusLabel: campusId ? meta.uniLabels.get(campusId) ?? campusId : null,
      });
    }
    members.sort((a, b) => a.founderName.localeCompare(b.founderName) || a.companyName.localeCompare(b.companyName));
    membersByNetwork[net.id] = members.slice(0, 80);
  }

  const campusFounderCount = new Map<string, number>();
  for (const link of links) {
    if (!topIds.has(link.networkId)) continue;
    for (const campusId of meta.founderCampuses.get(link.founderId) ?? []) {
      campusFounderCount.set(campusId, (campusFounderCount.get(campusId) ?? 0) + 1);
    }
  }
  const matrixCampuses = [...campusFounderCount.entries()]
    .sort((a, b) => b[1] - a[1] || (meta.uniLabels.get(a[0]) ?? a[0]).localeCompare(meta.uniLabels.get(b[0]) ?? b[0]))
    .slice(0, 8)
    .map(([id]) => id);

  const matrixRows = topNetworks.slice(0, 12).map((net) => {
    const foundersByCampus = new Map<string, Set<string>>();
    const allFounders = new Set<string>();
    for (const link of links) {
      if (link.networkId !== net.id) continue;
      allFounders.add(link.founderId);
      for (const campusId of meta.founderCampuses.get(link.founderId) ?? []) {
        if (!matrixCampuses.includes(campusId)) continue;
        const set = foundersByCampus.get(campusId) ?? new Set();
        set.add(link.founderId);
        foundersByCampus.set(campusId, set);
      }
    }
    const cells = matrixCampuses.map((campusId) => {
      const set = foundersByCampus.get(campusId) ?? new Set();
      return { count: set.size, founderIds: [...set] };
    });
    return {
      id: net.id,
      label: net.label,
      kind: net.kind,
      cells,
      all: { count: allFounders.size, founderIds: [...allFounders] },
    };
  });

  const sectorBuckets = new Map<string, Map<string, { label: string; count: number }>>();
  for (const link of links) {
    const sectorId = meta.companySectors.get(link.companyId);
    if (!sectorId) continue;
    const networks = sectorBuckets.get(sectorId) ?? new Map();
    const cur = networks.get(link.networkId) ?? { label: link.label, count: 0 };
    cur.count += 1;
    networks.set(link.networkId, cur);
    sectorBuckets.set(sectorId, networks);
  }

  const concentrationRows: SectorConcentration[] = [];
  for (const [sectorId, networks] of sectorBuckets) {
    const total = [...networks.values()].reduce((sum, row) => sum + row.count, 0);
    if (total < 10) continue;
    const ranked = [...networks.entries()]
      .map(([id, row]) => ({ id, label: row.label, count: row.count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    const top3 = ranked.slice(0, 3);
    const top3Count = top3.reduce((sum, row) => sum + row.count, 0);
    const top3Share = top3Count / total;
    concentrationRows.push({
      sectorId,
      label: sectorLabel(sectorId),
      founderLinks: total,
      top3Share,
      band: bandFor(top3Share),
      top3,
      sourceCount: ranked.length,
    });
  }
  concentrationRows.sort((a, b) => b.top3Share - a.top3Share || b.founderLinks - a.founderLinks || a.label.localeCompare(b.label));

  const byKind: Record<NetworkKind, number> = { accelerator: 0, program: 0, lab: 0, investor: 0 };
  for (const row of summaries) byKind[row.kind] += 1;

  const companiesLinked = new Set(links.map((link) => link.companyId)).size;
  const foundersLinked = new Set(links.map((link) => link.founderId)).size;

  const page: FounderNetworksPage = {
    generatedAt: new Date().toISOString(),
    corpusCompanies: meta.corpusCompanies,
    founderRule: "Founders are current students or alumni who graduated in 2023 or later, verified with public evidence.",
    totals: {
      networks: summaries.length,
      founderLinks: links.length,
      companiesLinked,
      foundersLinked,
      byKind,
      bySourceKey: Object.fromEntries([...bySourceKey.entries()].sort((a, b) => b[1] - a[1])),
      omitted: [
        {
          kind: "prior_employer",
          reason: "Only 2 works_at relationships exist in campus-universe.db, so prior-employer networks are omitted.",
        },
      ],
    },
    topNetworks,
    membersByNetwork,
    matrix: {
      columns: matrixCampuses.map((id) => ({ id, label: meta.uniLabels.get(id) ?? id })),
      rows: matrixRows,
      caption: `Cells count distinct founders linked to each network who also have an affiliation at that campus. All campuses totals every linked founder for the network, including campuses that are not columns. ${links.length.toLocaleString("en-US")} directed founder links across ${summaries.length.toLocaleString("en-US")} networks.`,
    },
    concentration: {
      rows: concentrationRows,
      thresholdsNote:
        "Concentrated means the top 3 networks hold 50% or more of founder links in that sector. Moderate is 35% to 49%. Broad is under 35%.",
      excludedNote: "Sectors with fewer than 10 observed founder links are excluded.",
    },
    howItWorks: [
      `Counts cover the verified investable corpus of ${meta.corpusCompanies.toLocaleString("en-US")} companies.`,
      "A founder link is directed: a stored accelerator, program, lab, or investor membership points at a founder of an investable company.",
      "The 2023+ rule keeps current students and alumni who graduated in 2023 or later. Older alumni are excluded from this desk.",
      "A founder can contribute to more than one network when their record shows more than one qualifying membership.",
      "Prior employers are omitted. The corpus does not yet store enough employer history to support that section.",
      "Co-founder edges on the graph join two investable companies that share a founder (serial founders). Same-company co-founders are not drawn as company-to-company edges.",
    ],
    graphPath: "/data/founder-networks-graph.json",
  };

  pageCache = { stamp, page };
  return page;
}

export function buildFounderNetworksGraph(): GraphPayload {
  const { links, meta } = loadFounderNetworkLinks();
  const page = buildFounderNetworksPage();
  const top = page.topNetworks.slice(0, 20);
  const topIds = new Set(top.map((row) => row.id));

  const companyDegree = new Map<string, number>();
  for (const link of links) {
    if (!topIds.has(link.networkId)) continue;
    companyDegree.set(link.companyId, (companyDegree.get(link.companyId) ?? 0) + 1);
  }

  const companyIds = [...companyDegree.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 420)
    .map(([id]) => id);
  const companySet = new Set(companyIds);

  const nodes: GraphNode[] = [];
  for (const net of top) {
    nodes.push({
      id: `net:${net.id}`,
      type: "network",
      label: net.label,
      kind: net.kind,
      size: Math.max(10, Math.min(28, 8 + Math.sqrt(net.founderCount))),
      x: 0,
      y: 0,
      companyId: null,
      networkId: net.id,
    });
  }
  for (const companyId of companyIds) {
    const degree = companyDegree.get(companyId) ?? 1;
    nodes.push({
      id: `co:${companyId}`,
      type: "company",
      label: meta.companyNames.get(companyId) ?? companyId,
      kind: null,
      size: Math.max(3, Math.min(12, 2 + Math.sqrt(degree) * 2)),
      x: 0,
      y: 0,
      companyId,
      networkId: null,
    });
  }

  const edges: GraphEdge[] = [];
  const edgeSeen = new Set<string>();
  const edgeCounts: Record<string, number> = { network_tie: 0, cofounder: 0 };

  for (const link of links) {
    if (!topIds.has(link.networkId) || !companySet.has(link.companyId)) continue;
    const source = `net:${link.networkId}`;
    const target = `co:${link.companyId}`;
    const key = `${source}->${target}`;
    if (edgeSeen.has(key)) continue;
    edgeSeen.add(key);
    edges.push({ source, target, type: "network_tie", sourceKey: link.sourceKey });
    edgeCounts.network_tie += 1;
  }

  const byFounder = new Map<string, string[]>();
  for (const companyId of companyIds) {
    for (const founderId of meta.companyFounders.get(companyId) ?? []) {
      const list = byFounder.get(founderId) ?? [];
      list.push(companyId);
      byFounder.set(founderId, list);
    }
  }
  for (const companies of byFounder.values()) {
    if (companies.length < 2) continue;
    for (let i = 0; i < companies.length; i++) {
      for (let j = i + 1; j < companies.length; j++) {
        const a = `co:${companies[i]}`;
        const b = `co:${companies[j]}`;
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        if (edgeSeen.has(key)) continue;
        edgeSeen.add(key);
        edges.push({ source: a, target: b, type: "cofounder", sourceKey: "person_project_roles.shared_founder" });
        edgeCounts.cofounder += 1;
      }
    }
  }

  return { nodes, edges, edgeCounts, generatedAt: new Date().toISOString() };
}

export function applyForceLayout(graph: GraphPayload): GraphPayload {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const d3 = require("d3-force") as typeof import("d3-force");
  type SimNode = GraphNode & { index?: number; vx?: number; vy?: number };
  const simNodes: SimNode[] = graph.nodes.map((node, index) => ({
    ...node,
    x: Math.cos((index / graph.nodes.length) * Math.PI * 2) * (120 + (index % 7) * 18),
    y: Math.sin((index / graph.nodes.length) * Math.PI * 2) * (120 + (index % 5) * 22),
  }));
  const byId = new Map(simNodes.map((node) => [node.id, node]));
  const simLinks = graph.edges
    .map((edge) => ({
      source: byId.get(edge.source)!,
      target: byId.get(edge.target)!,
      type: edge.type,
    }))
    .filter((edge) => edge.source && edge.target);

  const simulation = d3
    .forceSimulation(simNodes)
    .force(
      "link",
      d3
        .forceLink(simLinks)
        .id((node) => (node as SimNode).id)
        .distance((link) => ((link as { type: string }).type === "cofounder" ? 46 : 64))
        .strength(0.45)
    )
    .force(
      "charge",
      d3.forceManyBody().strength((node) => ((node as SimNode).type === "network" ? -420 : -28))
    )
    .force("center", d3.forceCenter(0, 0))
    .force(
      "collide",
      d3.forceCollide<SimNode>().radius((node) => node.size + 4)
    )
    .stop();

  for (let i = 0; i < 280; i++) simulation.tick();

  return {
    ...graph,
    nodes: simNodes.map((node) => ({
      id: node.id,
      type: node.type,
      label: node.label,
      kind: node.kind,
      size: node.size,
      x: Math.round((node.x ?? 0) * 10) / 10,
      y: Math.round((node.y ?? 0) * 10) / 10,
      companyId: node.companyId,
      networkId: node.networkId,
    })),
  };
}
