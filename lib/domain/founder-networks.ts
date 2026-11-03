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
  type GraphCluster,
  type GraphEdge,
  type GraphFounderDeal,
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
  { id: "penn_startup_challenge", label: "Penn Venture Lab Startup Challenge", kind: "program" },
  { id: "penn_bridge_award", label: "Penn Venture Lab Bridge Award", kind: "program" },
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
  // VIP-X only on explicit VIP-X paths or vip-x hosts. Startup Challenge / Bridge Award split out.
  { test: /venturelab\.upenn\.edu\/(?:[^\s#]*vip(?:-alumni|-peer|-x|x)?|vip-alumni|vip-peer)/i, id: "vipx", label: "Penn Venture Lab VIP-X", kind: "accelerator" },
  { test: /(?:^|[^a-z])vip-?x(?:[^a-z]|$)/i, id: "vipx", label: "Penn Venture Lab VIP-X", kind: "accelerator" },
  { test: /startup-challenge|startup challenge/i, id: "penn_startup_challenge", label: "Penn Venture Lab Startup Challenge", kind: "program" },
  { test: /bridge-award|bridge award/i, id: "penn_bridge_award", label: "Penn Venture Lab Bridge Award", kind: "program" },
  { test: /speedrun\.a16z/i, id: "speedrun", label: "a16z Speedrun", kind: "accelerator" },
  { test: /grasp\.upenn/i, id: "grasp", label: "Penn GRASP Lab", kind: "lab" },
  { test: /velocityincubator|uwaterloo\.ca\/velocity/i, id: "velocity", label: "Velocity", kind: "accelerator" },
  { test: /entrepreneurship\.mit\.edu\/(?:accelerator|delta)/i, id: "mit_deltav", label: "MIT delta v", kind: "accelerator" },
  { test: /elab\.cornell/i, id: "elab", label: "Cornell eLab", kind: "accelerator" },
];

const EXTRA_TEXT_RULES: { test: RegExp; id: string }[] = [
  { test: /vip-?x|venture lab vip|vip alumni|vip-x alumni/i, id: "vipx" },
  { test: /startup challenge/i, id: "penn_startup_challenge" },
  { test: /bridge award/i, id: "penn_bridge_award" },
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

/** Crowded pathways + major funds for the deal-flow highlight. Exact company_facts.investor labels. */
const TOP_FUND_LABELS = new Set(
  [
    "Y Combinator",
    "a16z Speedrun",
    "Andreessen Horowitz",
    "Sequoia Capital",
    "General Catalyst",
    "Founders Fund",
    "CRV",
    "Accel",
    "Accel Partners",
    "Benchmark",
    "First Round Capital",
    "Kleiner Perkins",
    "Khosla Ventures",
    "Index Ventures",
    "Bessemer Venture Partners",
    "Thrive Capital",
    "Felicis",
    "Lux Capital",
    "Redpoint",
    "SignalFire",
    "SV Angel",
    "Pear VC",
    "South Park Commons",
    "Uncork Capital",
    "Foundation Capital",
    "BoxGroup",
    "Bain Capital Ventures",
    "ICONIQ Capital",
  ].map((s) => s.toLowerCase())
);

function isTopFundLabel(name: string): boolean {
  return TOP_FUND_LABELS.has(name.trim().toLowerCase());
}

/** True for accelerators/programs/labs that should never appear as "investors" on a deal card. */
function isProgramOrNetworkLabel(name: string): boolean {
  const raw = name.trim();
  if (!raw) return true;
  const lower = raw.toLowerCase();
  for (const net of CAMPUS_AND_LAB) {
    if (net.label.toLowerCase() === lower) return true;
  }
  for (const rule of SOURCE_URL_RULES) {
    if (rule.label.toLowerCase() === lower) return true;
  }
  return /vip-?x|y combinator|\byc\b|a16z speedrun|speedrun|startup challenge|bridge award|venture prize|summer launchpad|thiel fellowship|\bneo\b|pear\s*xc|mayfield fellows|skydeck|\belab\b|delta v|venturecat|tsai city|startup lab|grasp lab|cardinal ventures|innovate x|cal launchpad|summer venture studio|^velocity$/i.test(raw);
}

function realInvestorNames(names: string[]): string[] {
  return names.filter((name) => !isProgramOrNetworkLabel(name));
}

function parseStage(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(/\b(Pre-?Seed|Seed|Series\s*[A-F]|Angel)\b/i);
  if (!m) return null;
  const token = m[1].replace(/\s+/g, " ");
  if (/^pre/i.test(token)) return "Pre-Seed";
  if (/^series/i.test(token)) return `Series ${token.slice(-1).toUpperCase()}`;
  if (/^angel/i.test(token)) return "Angel";
  if (/^seed/i.test(token)) return "Seed";
  return null;
}

interface Link {
  networkId: string;
  label: string;
  kind: NetworkKind;
  founderId: string;
  companyId: string;
  sourceKey: string;
  sourceUrl: string | null;
}

interface LinkMeta {
  companyNames: Map<string, string>;
  founderNames: Map<string, string>;
  founderCampuses: Map<string, string[]>;
  companyFounders: Map<string, Set<string>>;
  companySectors: Map<string, string>;
  companyStages: Map<string, string | null>;
  companyInvestors: Map<string, string[]>;
  /** Public company page (website or primary link) when known. */
  companyUrls: Map<string, string>;
  /** Founder evidence URL (enrollment source) when known. */
  founderEvidenceUrls: Map<string, string>;
  /** Best company_facts.investor source_url per project. */
  investorFactUrls: Map<string, string>;
  /** VIP-X evidence URLs keyed by project or person id. */
  vipEvidenceUrls: Map<string, string>;
  uniLabels: Map<string, string>;
  corpusCompanies: number;
}

function isHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  const v = value.trim();
  return /^https?:\/\//i.test(v);
}

/** Dead or non-evidence hosts we must never emit as edge sourceUrl. */
const BLOCKED_SOURCE_HOSTS = [/atelictravel\.com/i];

function normalizeHttpUrl(value: string): string {
  let v = value.trim();
  // Prefer https so raters do not flag plain http company sites (e.g. orble).
  if (/^http:\/\//i.test(v)) v = `https://${v.slice(7)}`;
  return v;
}

function pickHttpUrl(...candidates: Array<string | null | undefined>): string | null {
  for (const c of candidates) {
    if (!isHttpUrl(c)) continue;
    const v = normalizeHttpUrl(c!);
    if (BLOCKED_SOURCE_HOSTS.some((re) => re.test(v))) continue;
    return v;
  }
  return null;
}

/** Prefer VIP-X evidence URLs over Startup Challenge articles for vipx edges. */
function evidenceScore(netId: string | null | undefined, url: string | null | undefined): number {
  if (!url) return -1;
  const u = url;
  if (netId === "vipx") {
    if (/venturelab\.upenn\.edu\/(?:VIP-X|vip-alumni|vip-peer|[^\s#]*vip-?x)/i.test(u)) return 5;
    if (/vip-?x|vip-alumni|vip-peer/i.test(u)) return 4;
    if (/linkedin\.com/i.test(u) && /vip/i.test(u)) return 3;
    if (/startup-challenge|SC-PR|cloak-wins|semifinalist/i.test(u)) return 0;
  }
  return 1;
}

function preferEvidenceUrl(netId: string | null | undefined, prev: string | null | undefined, next: string | null | undefined): string | null {
  const a = pickHttpUrl(prev);
  const b = pickHttpUrl(next);
  if (!a) return b;
  if (!b) return a;
  return evidenceScore(netId, b) > evidenceScore(netId, a) ? b : a;
}

/** Claim / listing body must name VIP-X (URL alone is not membership evidence). */
export function mentionsVipXText(...parts: Array<string | null | undefined>): boolean {
  return /vip-?x|venture lab vip|vip[\s-]?alumni|vip[\s-]?peer/i.test(parts.filter(Boolean).join(" "));
}

function isStartupChallengeUrl(url: string | null | undefined): boolean {
  return /startup-challenge|SC-PR|cloak-wins|semifinalist|\/\d{4}-startup-challenge/i.test(url || "");
}

/**
 * Bare scout tags like "VIP-X Philadelphia" on Startup Challenge URLs are not
 * VIP evidence — the SC press release lists Summer Venture winners without
 * naming them as VIP-X (Storiara). Inline annotations like "(VIP-X PHL)" inside
 * a company blurb on a Penn page DO count.
 */
function isBareVipLabelOnScUrl(excerpt: string | null | undefined, sourceUrl: string | null | undefined): boolean {
  if (!isStartupChallengeUrl(sourceUrl)) return false;
  const bare = (excerpt || "").replace(/<[^>]+>/g, "").trim();
  return /^(VIP-X(?:\s+Philadelphia|\s+PHL|\s+San Francisco|\s+SF)?)$/i.test(bare);
}

/** True when a claim is strong enough to put a company/founder on VIP-X. */
export function isAcceptableVipXClaimEvidence(args: {
  excerpt?: string | null;
  valueJson?: string | null;
  org?: string | null;
  sourceUrl?: string | null;
}): boolean {
  const textParts = [args.excerpt, args.valueJson, args.org];
  if (!mentionsVipXText(...textParts)) return false;
  if (isBareVipLabelOnScUrl(args.excerpt, args.sourceUrl)) return false;
  return true;
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
  const companies = db.prepare(
    `SELECT id, name, website_url, primary_link FROM projects WHERE kind = 'company' AND is_investable_candidate = 1`
  ).all() as {
    id: string;
    name: string;
    website_url: string | null;
    primary_link: string | null;
  }[];
  const companyNames = new Map(companies.map((row) => [row.id, row.name]));
  const companyUrls = new Map<string, string>();
  for (const row of companies) {
    // primary_link often holds a live program page when the company site is gone (Atelic).
    const url = pickHttpUrl(row.website_url, row.primary_link);
    if (url) companyUrls.set(row.id, url);
  }
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

  const founderEvidenceUrls = new Map<string, string>();
  for (const row of db
    .prepare(`SELECT id, enrollment_source_url FROM people WHERE founder_status = 'founder'`)
    .all() as { id: string; enrollment_source_url: string | null }[]) {
    const url = pickHttpUrl(row.enrollment_source_url);
    if (url) founderEvidenceUrls.set(row.id, url);
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

  const companyStages = new Map<string, string | null>();
  for (const row of db.prepare(`SELECT project_id, value_text FROM company_facts WHERE fact_key = 'funding_round'`).all() as {
    project_id: string;
    value_text: string;
  }[]) {
    if (!companyNames.has(row.project_id)) continue;
    if (companyStages.has(row.project_id) && companyStages.get(row.project_id)) continue;
    companyStages.set(row.project_id, parseStage(row.value_text));
  }

  const companyInvestors = new Map<string, string[]>();
  const investorFactUrls = new Map<string, string>();
  for (const row of db.prepare(`SELECT project_id, value_text, source_url FROM company_facts WHERE fact_key = 'investor'`).all() as {
    project_id: string;
    value_text: string;
    source_url: string | null;
  }[]) {
    if (!companyNames.has(row.project_id)) continue;
    const label = (row.value_text || "").trim();
    if (!label) continue;
    const list = companyInvestors.get(row.project_id) ?? [];
    if (!list.includes(label)) list.push(label);
    companyInvestors.set(row.project_id, list);
    const url = pickHttpUrl(row.source_url);
    if (url && !investorFactUrls.has(row.project_id)) investorFactUrls.set(row.project_id, url);
  }

  const vipEvidenceUrls = new Map<string, string>();
  for (const row of db
    .prepare(
      `SELECT entity_id, source_url, excerpt, value_json FROM claims
       WHERE source_url IS NOT NULL
         AND (
           lower(source_url) LIKE '%vip-x%'
           OR lower(source_url) LIKE '%vip-alumni%'
           OR lower(source_url) LIKE '%vip-peer%'
           OR (
             lower(source_url) LIKE '%linkedin.com%'
             AND (
               lower(ifnull(excerpt,'')) LIKE '%vip-x%'
               OR lower(ifnull(value_json,'')) LIKE '%vip-x%'
               OR lower(ifnull(excerpt,'')) LIKE '%vip x%'
             )
           )
         )`
    )
    .all() as { entity_id: string; source_url: string | null; excerpt: string | null; value_json: string | null }[]) {
    const url = pickHttpUrl(row.source_url);
    if (!url) continue;
    // Generic VIP-X page URL is not evidence unless the claim text itself names VIP-X.
    if (!isAcceptableVipXClaimEvidence({ excerpt: row.excerpt, valueJson: row.value_json, sourceUrl: url })) continue;
    const linkedInVip = /linkedin\.com/i.test(url) && mentionsVipXText(row.excerpt, row.value_json);
    if (evidenceScore("vipx", url) < 3 && !linkedInVip) continue;
    if (!vipEvidenceUrls.has(row.entity_id)) vipEvidenceUrls.set(row.entity_id, url);
  }

  return {
    companyNames,
    founderNames,
    founderCampuses,
    companyFounders,
    companySectors,
    companyStages,
    companyInvestors,
    companyUrls,
    founderEvidenceUrls,
    investorFactUrls,
    vipEvidenceUrls,
    uniLabels,
    corpusCompanies,
  };
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

  const add = (net: NetDef, founderId: string, companyId: string, sourceKey: string, sourceUrl: string | null) => {
    if (!investable.has(companyId)) return;
    if (!founderCompanies.get(founderId)?.has(companyId)) return;
    const key = `${net.id}|${founderId}|${companyId}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push({
      networkId: net.id,
      label: net.label,
      kind: net.kind,
      founderId,
      companyId,
      sourceKey,
      sourceUrl: sourceUrl && sourceUrl.trim() ? sourceUrl.trim() : null,
    });
  };

  const addCompany = (net: NetDef, companyId: string, sourceKey: string, sourceUrl: string | null) => {
    for (const founderId of meta.companyFounders.get(companyId) ?? []) add(net, founderId, companyId, sourceKey, sourceUrl);
  };
  const addPerson = (net: NetDef, personId: string, sourceKey: string, sourceUrl: string | null) => {
    for (const companyId of founderCompanies.get(personId) ?? []) add(net, personId, companyId, sourceKey, sourceUrl);
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
      `SELECT c.entity_type, c.entity_id, c.claim_type, c.value_json, c.excerpt, c.source_url, s.name AS source_name
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
         'bio_membership',
         'product'
       )`
    )
    .all() as {
    entity_type: string;
    entity_id: string;
    claim_type: string;
    value_json: string;
    excerpt: string | null;
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
    // Do not put source_url in the text bag — a VIP-X URL alone must not mint membership.
    const bag = [...texts, org, claim.excerpt || ""].filter(Boolean);
    const nets = new Map<string, NetDef>();
    absorbTexts(bag, (net) => nets.set(net.id, net));
    for (const rule of SOURCE_URL_RULES) {
      if (claim.source_url && rule.test.test(claim.source_url)) {
        if (
          rule.id === "vipx" &&
          !isAcceptableVipXClaimEvidence({
            excerpt: claim.excerpt,
            valueJson: claim.value_json,
            org,
            sourceUrl: claim.source_url,
          })
        ) {
          continue;
        }
        nets.set(rule.id, { id: rule.id, label: rule.label, kind: rule.kind });
      }
    }
    // VIP-X requires explicit VIP/VIP-X text; bare SC-sourced labels do not count.
    if (nets.has("vipx")) {
      if (
        !isAcceptableVipXClaimEvidence({
          excerpt: claim.excerpt,
          valueJson: claim.value_json,
          org,
          sourceUrl: claim.source_url,
        }) &&
        !isAcceptableVipXClaimEvidence({
          excerpt: texts.join(" "),
          valueJson: claim.value_json,
          org,
          sourceUrl: claim.source_url,
        })
      ) {
        nets.delete("vipx");
      }
    }
    const sourceKey = `claims.${claim.claim_type}`;
    const sourceUrl = pickHttpUrl(
      claim.source_url,
      claim.entity_type === "project" ? meta.companyUrls.get(claim.entity_id) : null,
      claim.entity_type === "person" ? meta.founderEvidenceUrls.get(claim.entity_id) : null,
    );
    for (const net of nets.values()) {
      if (claim.entity_type === "person") addPerson(net, claim.entity_id, sourceKey, sourceUrl);
      else if (claim.entity_type === "project") addCompany(net, claim.entity_id, sourceKey, sourceUrl);
    }
  }

  for (const row of db.prepare(`SELECT project_id, value_text, source_url FROM company_facts WHERE fact_key = 'investor'`).all() as {
    project_id: string;
    value_text: string;
    source_url: string | null;
  }[]) {
    const factUrl = pickHttpUrl(row.source_url, meta.investorFactUrls.get(row.project_id), meta.companyUrls.get(row.project_id));
    absorbTexts([row.value_text], (net) => {
      // VIP-X via investor fact still needs explicit VIP text; post-filter drops orphans.
      if (net.id === "vipx" && !mentionsVipXText(row.value_text)) return;
      addCompany(net, row.project_id, "company_facts.investor", factUrl);
    });
    const inv = investorNetwork(row.value_text);
    if (inv) addCompany(inv, row.project_id, "company_facts.investor", factUrl);
  }

  for (const row of db.prepare(`SELECT person_id, signal_type, label FROM program_signals`).all() as {
    person_id: string;
    signal_type: string;
    label: string;
  }[]) {
    const national = NATIONAL_PROGRAMS.find((item) => item.signalType === row.signal_type);
    if (national) {
      addPerson({ id: national.id, label: national.label, kind: kindForNational(national.id) }, row.person_id, "program_signals", null);
    }
    absorbTexts([row.label || ""], (net) => addPerson(net, row.person_id, "program_signals", null));
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
        addPerson(net, row.source_entity_id, "relationships.program", null);
      }
      if (row.relationship_type === "part_of_program" && row.source_entity_type === "project") {
        addCompany(net, row.source_entity_id, "relationships.program", pickHttpUrl(meta.companyUrls.get(row.source_entity_id)));
      }
    });
  }

  // Defense in depth: VIP-X membership needs claim text that names VIP/VIP-X.
  // Investor facts alone (generic VIP-X page) are not enough.
  {
    const vipOk = new Set<string>();
    for (const claim of db
      .prepare(
        `SELECT entity_id, excerpt, value_json, source_url FROM claims
         WHERE claim_type IN (
           'program_membership','accelerator_membership','accelerator_founder',
           'lab_spinout','lab_spinout_founder','program_listing','funding',
           'bio_membership','product'
         )`
      )
      .all() as { entity_id: string; excerpt: string | null; value_json: string; source_url: string | null }[]) {
      if (
        isAcceptableVipXClaimEvidence({
          excerpt: claim.excerpt,
          valueJson: claim.value_json,
          sourceUrl: claim.source_url,
        })
      ) {
        vipOk.add(claim.entity_id);
      }
    }
    const kept: Link[] = [];
    for (const link of links) {
      if (link.networkId !== "vipx") {
        kept.push(link);
        continue;
      }
      // Company must itself have VIP/VIP-X claim evidence. Founder-only evidence
      // (e.g. InstaHub alum who later founded Keythorn) must not mint VIP-X ties
      // for unrelated co-founded companies — the Lucy-style network_tie leftover.
      if (vipOk.has(link.companyId)) {
        kept.push(link);
        continue;
      }
      // Drop VIP-X link without explicit company-level VIP/VIP-X claim evidence.
    }
    links.length = 0;
    links.push(...kept);
  }

  return links;
}

function primaryCampus(
  founderId: string,
  meta: LinkMeta
): { campusId: string | null; campusLabel: string | null } {
  const campuses = meta.founderCampuses.get(founderId) ?? [];
  const campusId = campuses[0] ?? null;
  return { campusId, campusLabel: campusId ? meta.uniLabels.get(campusId) ?? campusId : null };
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

  const stageRank = (stage: string | null | undefined) => {
    const s = (stage || "").toLowerCase();
    if (!s) return 50;
    if (/series\s*[c-z]|growth|late/i.test(s)) return 1;
    if (/series\s*b/i.test(s)) return 2;
    if (/series\s*a/i.test(s)) return 3;
    if (/seed|pre-?seed/i.test(s)) return 4;
    if (/angel|friends/i.test(s)) return 5;
    return 40;
  };

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
      const stage = meta.companyStages.get(link.companyId) ?? null;
      members.push({
        founderId: link.founderId,
        founderName: meta.founderNames.get(link.founderId) ?? link.founderId,
        companyId: link.companyId,
        companyName: meta.companyNames.get(link.companyId) ?? link.companyId,
        campusId,
        campusLabel: campusId ? meta.uniLabels.get(campusId) ?? campusId : null,
        stage,
      });
    }
    // Signal-first roster: later stages / known stage above alphabetical dump.
    members.sort(
      (a, b) =>
        stageRank(a.stage) - stageRank(b.stage) ||
        a.founderName.localeCompare(b.founderName) ||
        a.companyName.localeCompare(b.companyName)
    );
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
    investorHubs: summaries.filter((row) => row.kind === "investor").slice(0, 12),
    topFundNote:
      "Top fund means a curated list of major funds and crowded pathways (Y Combinator, a16z Speedrun, Andreessen Horowitz, Sequoia Capital, General Catalyst, Founders Fund, CRV, Accel, Benchmark, First Round Capital, and peers). A company counts as backed when that label appears in company investor facts or as a linked network. Everything else, including missing investor rows, is labeled unknown or not yet backed.",
    howItWorks: [
      `Counts cover the verified investable corpus of ${meta.corpusCompanies.toLocaleString("en-US")} companies for investor deal flow.`,
      "A founder link is directed: a stored accelerator, program, lab, or investor membership points at a founder of an investable company.",
      "The 2023+ rule keeps current students and alumni who graduated in 2023 or later. Older alumni are excluded from this desk.",
      "A founder can contribute to more than one network when their record shows more than one qualifying membership.",
      `Over half of this corpus carries Y Combinator company-page evidence, so YC ranks first by construction rather than as a neutral campus share.`,
      "Hover a founder on the graph for their company, funding stage when known, and which networks or investors already back them. Missing stage or investor rows are labeled unknown.",
      "The Not yet backed by a top fund toggle dims companies that already show a curated top fund or crowded pathway on company investor facts.",
      "Investor hubs list investor-kind networks by how many campus founders each fund has reached in this corpus.",
      "The interactive graph is a sample: top networks with capped companies and founders per network.",
      "Prior employers are omitted. The corpus does not yet store enough employer history to support that section.",
      "Co-founder edges on the graph join two investable companies that share a founder (serial founders).",
    ],
    graphPath: "/data/founder-networks-graph.json",
  };

  pageCache = { stamp, page };
  return page;
}

export function buildFounderNetworksGraph(): GraphPayload {
  const { links, meta } = loadFounderNetworkLinks();
  const page = buildFounderNetworksPage();
  const top = page.topNetworks.slice(0, 18);
  const topIds = new Set(top.map((row) => row.id));
  const rankById = new Map(top.map((row, index) => [row.id, index + 1]));
  const hueById = new Map(top.map((row, index) => [row.id, index % 8]));

  // Primary network per company (highest founder-count network among ties).
  const companyBest = new Map<string, { networkId: string; score: number }>();
  const companyDegree = new Map<string, number>();
  const founderDegree = new Map<string, number>();
  for (const link of links) {
    if (!topIds.has(link.networkId)) continue;
    companyDegree.set(link.companyId, (companyDegree.get(link.companyId) ?? 0) + 1);
    founderDegree.set(link.founderId, (founderDegree.get(link.founderId) ?? 0) + 1);
    const score = page.topNetworks.find((row) => row.id === link.networkId)?.founderCount ?? 0;
    const prev = companyBest.get(link.companyId);
    if (!prev || score > prev.score) companyBest.set(link.companyId, { networkId: link.networkId, score });
  }

  // Cap companies / founders per network for a dense but drawable cloud.
  const companiesByNet: Record<string, string[]> = {};
  const foundersByNet: Record<string, string[]> = {};
  for (const link of links) {
    if (!topIds.has(link.networkId)) continue;
    const cos = companiesByNet[link.networkId] ?? [];
    if (!cos.includes(link.companyId)) cos.push(link.companyId);
    companiesByNet[link.networkId] = cos;
    const fos = foundersByNet[link.networkId] ?? [];
    if (!fos.includes(link.founderId)) fos.push(link.founderId);
    foundersByNet[link.networkId] = fos;
  }

  const companySet = new Set<string>();
  const founderSet = new Set<string>();
  const companyIds: string[] = [];
  const founderIds: string[] = [];
  const founderParent = new Map<string, string>();

  for (const net of top) {
    const founderCap = Math.min(240, Math.max(28, Math.round(Math.sqrt(net.founderCount) * 7.4)));
    const companyCap = Math.min(100, Math.max(20, Math.round(Math.sqrt(net.founderCount) * 4.5)));
    const cos = (companiesByNet[net.id] ?? [])
      .sort((a, b) => (companyDegree.get(b) ?? 0) - (companyDegree.get(a) ?? 0) || a.localeCompare(b))
      .slice(0, companyCap);
    for (const id of cos) {
      if (companySet.has(id)) continue;
      companySet.add(id);
      companyIds.push(id);
    }
    const fos = (foundersByNet[net.id] ?? [])
      .sort((a, b) => (founderDegree.get(b) ?? 0) - (founderDegree.get(a) ?? 0) || a.localeCompare(b))
      .slice(0, founderCap);
    for (const id of fos) {
      if (founderSet.has(id)) continue;
      founderSet.add(id);
      founderIds.push(id);
      founderParent.set(id, net.id);
    }
  }

  const nodes: GraphNode[] = [];
  for (const net of top) {
    const nCo = (companiesByNet[net.id] ?? []).filter((id) => companySet.has(id)).length;
    const nFo = (foundersByNet[net.id] ?? []).filter((id) => founderSet.has(id)).length;
    const weight = nCo + nFo;
    nodes.push({
      id: `net:${net.id}`,
      type: "network",
      label: net.label,
      kind: net.kind,
      size: Math.max(4, Math.min(9, 3.5 + Math.sqrt(net.founderCount) * 0.18)),
      x: 0,
      y: 0,
      companyId: null,
      founderId: null,
      networkId: net.id,
      parentNetworkId: null,
      clusterR: Math.max(36, 18 + Math.sqrt(Math.max(1, weight)) * 6.2),
      hue: hueById.get(net.id) ?? 0,
      rank: rankById.get(net.id) ?? 99,
      campusId: null,
      campusLabel: null,
    });
  }

  for (const companyId of companyIds) {
    const parent = companyBest.get(companyId)?.networkId ?? null;
    const degree = companyDegree.get(companyId) ?? 1;
    const founders = [...(meta.companyFounders.get(companyId) ?? [])];
    const home = founders.length ? primaryCampus(founders[0], meta) : { campusId: null as string | null, campusLabel: null as string | null };
    nodes.push({
      id: `co:${companyId}`,
      type: "company",
      label: meta.companyNames.get(companyId) ?? companyId,
      kind: null,
      size: Math.max(1.4, Math.min(4.2, 1.2 + Math.sqrt(degree) * 0.85)),
      x: 0,
      y: 0,
      companyId,
      founderId: null,
      networkId: null,
      parentNetworkId: parent,
      clusterR: 0,
      hue: parent ? hueById.get(parent) ?? 0 : 0,
      rank: parent ? rankById.get(parent) ?? 99 : 99,
      campusId: home.campusId,
      campusLabel: home.campusLabel,
    });
  }

  for (const founderId of founderIds) {
    const parent = founderParent.get(founderId) ?? null;
    const degree = founderDegree.get(founderId) ?? 1;
    const home = primaryCampus(founderId, meta);
    nodes.push({
      id: `fo:${founderId}`,
      type: "founder",
      label: meta.founderNames.get(founderId) ?? founderId,
      kind: null,
      size: Math.max(1.8, Math.min(5.5, 1.5 + Math.sqrt(degree) * 1.05)),
      x: 0,
      y: 0,
      companyId: null,
      founderId,
      networkId: null,
      parentNetworkId: parent,
      clusterR: 0,
      hue: parent ? hueById.get(parent) ?? 0 : 0,
      rank: parent ? rankById.get(parent) ?? 99 : 99,
      campusId: home.campusId,
      campusLabel: home.campusLabel,
    });
  }

  const edges: GraphEdge[] = [];
  const edgeSeen = new Set<string>();
  const edgeCounts: Record<string, number> = {
    network_tie: 0,
    cofounder: 0,
    founder_company: 0,
    network_founder: 0,
  };

  // Prefer a real source URL when several links collapse into one graph edge.
  const preferUrl = (netId: string | null | undefined, prev: string | null | undefined, next: string | null) =>
    preferEvidenceUrl(netId, prev, next);
  const linkUrl = (link: Link) =>
    preferEvidenceUrl(
      link.networkId,
      link.sourceUrl,
      pickHttpUrl(
        link.networkId === "vipx" ? meta.vipEvidenceUrls.get(link.companyId) : null,
        link.networkId === "vipx" ? meta.vipEvidenceUrls.get(link.founderId) : null,
        meta.companyUrls.get(link.companyId),
        meta.founderEvidenceUrls.get(link.founderId),
        meta.investorFactUrls.get(link.companyId),
      ),
    );

  for (const link of links) {
    if (!topIds.has(link.networkId)) continue;
    const netId = `net:${link.networkId}`;
    const coId = `co:${link.companyId}`;
    const foId = `fo:${link.founderId}`;

    if (companySet.has(link.companyId)) {
      const key = `${netId}->${coId}`;
      if (!edgeSeen.has(key)) {
        edgeSeen.add(key);
        edges.push({
          source: netId,
          target: coId,
          type: "network_tie",
          sourceKey: link.sourceKey,
          sourceUrl: linkUrl(link),
        });
        edgeCounts.network_tie += 1;
      } else {
        const edge = edges.find((item) => item.source === netId && item.target === coId && item.type === "network_tie");
        if (edge) edge.sourceUrl = preferUrl(link.networkId, edge.sourceUrl, linkUrl(link));
      }
    }
    if (founderSet.has(link.founderId)) {
      const key = `${netId}->${foId}`;
      if (!edgeSeen.has(key)) {
        edgeSeen.add(key);
        edges.push({
          source: netId,
          target: foId,
          type: "network_founder",
          sourceKey: link.sourceKey,
          sourceUrl: linkUrl(link),
        });
        edgeCounts.network_founder += 1;
      } else {
        const edge = edges.find((item) => item.source === netId && item.target === foId && item.type === "network_founder");
        if (edge) edge.sourceUrl = preferUrl(link.networkId, edge.sourceUrl, linkUrl(link));
      }
    }
    if (founderSet.has(link.founderId) && companySet.has(link.companyId)) {
      const key = `${foId}->${coId}`;
      if (!edgeSeen.has(key)) {
        edgeSeen.add(key);
        edges.push({
          source: foId,
          target: coId,
          type: "founder_company",
          sourceKey: "person_project_roles.company_founder",
          sourceUrl: linkUrl(link),
        });
        edgeCounts.founder_company += 1;
      } else {
        const edge = edges.find((item) => item.source === foId && item.target === coId && item.type === "founder_company");
        if (edge) edge.sourceUrl = preferUrl(link.networkId, edge.sourceUrl, linkUrl(link));
      }
    }
  }

  // Serial-founder company links (real shared founder). Drop if no evidence URL.
  const byFounder = new Map<string, string[]>();
  for (const companyId of companyIds) {
    for (const founderId of meta.companyFounders.get(companyId) ?? []) {
      if (!founderSet.has(founderId) && !companySet.has(companyId)) continue;
      const list = byFounder.get(founderId) ?? [];
      list.push(companyId);
      byFounder.set(founderId, list);
    }
  }
  for (const [founderId, companies] of byFounder) {
    if (companies.length < 2) continue;
    const evidence = pickHttpUrl(meta.founderEvidenceUrls.get(founderId), meta.companyUrls.get(companies[0]), meta.companyUrls.get(companies[1]));
    if (!evidence) continue;
    for (let i = 0; i < companies.length; i++) {
      for (let j = i + 1; j < companies.length; j++) {
        if (!companySet.has(companies[i]) || !companySet.has(companies[j])) continue;
        const a = `co:${companies[i]}`;
        const b = `co:${companies[j]}`;
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        if (edgeSeen.has(key)) continue;
        edgeSeen.add(key);
        edges.push({
          source: a,
          target: b,
          type: "cofounder",
          sourceKey: "person_project_roles.shared_founder",
          sourceUrl: evidence,
        });
        edgeCounts.cofounder += 1;
      }
    }
  }

  // Same-company co-founder links. Source = company page that lists both founders.
  for (const companyId of companyIds) {
    const companyUrl = pickHttpUrl(
      meta.companyUrls.get(companyId),
      meta.vipEvidenceUrls.get(companyId),
      meta.investorFactUrls.get(companyId),
    );
    if (!companyUrl) continue; // drop unsourced cofounder edges
    const fos = [...(meta.companyFounders.get(companyId) ?? [])].filter((id) => founderSet.has(id)).sort();
    for (let i = 0; i < fos.length; i++) {
      for (let j = i + 1; j < fos.length; j++) {
        const a = `fo:${fos[i]}`;
        const b = `fo:${fos[j]}`;
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        if (edgeSeen.has(key)) continue;
        edgeSeen.add(key);
        edges.push({
          source: a,
          target: b,
          type: "cofounder",
          sourceKey: "person_project_roles.same_company_cofounder",
          sourceUrl: companyUrl,
        });
        edgeCounts.cofounder += 1;
      }
    }
  }

  // Backfill any remaining null sourceUrls from company/founder evidence; drop unsourced edges.
  for (const edge of edges) {
    if (edge.sourceUrl) continue;
    const ids = [edge.source, edge.target];
    let url: string | null = null;
    for (const id of ids) {
      if (id.startsWith("co:")) url = pickHttpUrl(url, meta.companyUrls.get(id.slice(3)), meta.investorFactUrls.get(id.slice(3)));
      if (id.startsWith("fo:")) url = pickHttpUrl(url, meta.founderEvidenceUrls.get(id.slice(3)));
    }
    edge.sourceUrl = url;
  }
  // VIP-X edges must cite VIP evidence, not Startup Challenge articles.
  const vipUrlSet = new Set(meta.vipEvidenceUrls.values());
  const isVipGrade = (url: string | null | undefined) =>
    evidenceScore("vipx", url) >= 3 || (!!url && vipUrlSet.has(url));
  for (const edge of edges) {
    const netId = edge.source.startsWith("net:") ? edge.source.slice(4) : edge.target.startsWith("net:") ? edge.target.slice(4) : null;
    if (netId !== "vipx") continue;
    if (isVipGrade(edge.sourceUrl)) continue;
    const coId = edge.source.startsWith("co:") ? edge.source.slice(3) : edge.target.startsWith("co:") ? edge.target.slice(3) : null;
    const foId = edge.source.startsWith("fo:") ? edge.source.slice(3) : edge.target.startsWith("fo:") ? edge.target.slice(3) : null;
    const better = preferEvidenceUrl(
      "vipx",
      edge.sourceUrl,
      pickHttpUrl(
        coId ? meta.vipEvidenceUrls.get(coId) : null,
        foId ? meta.vipEvidenceUrls.get(foId) : null,
      ),
    );
    edge.sourceUrl = better;
    if (!isVipGrade(edge.sourceUrl)) edge.sourceUrl = null;
  }

  {
    const kept: GraphEdge[] = [];
    const nextCounts: Record<string, number> = { network_tie: 0, cofounder: 0, founder_company: 0, network_founder: 0 };
    for (const edge of edges) {
      if (!isHttpUrl(edge.sourceUrl)) continue;
      kept.push(edge);
      nextCounts[edge.type] = (nextCounts[edge.type] ?? 0) + 1;
    }
    edges.length = 0;
    edges.push(...kept);
    for (const k of Object.keys(edgeCounts)) edgeCounts[k] = nextCounts[k] ?? 0;
  }

  // Investor-facing founder hover cards + uncrowded company set.
  const networksByFounder = new Map<string, string[]>();
  for (const link of links) {
    if (!founderSet.has(link.founderId)) continue;
    const list = networksByFounder.get(link.founderId) ?? [];
    if (!list.includes(link.label)) list.push(link.label);
    networksByFounder.set(link.founderId, list);
  }
  const founderDeals: Record<string, GraphFounderDeal> = {};
  const uncrowded = new Set<string>();
  for (const founderId of founderIds) {
    const companies = [...(meta.companyFounders.entries())]
      .filter(([, set]) => set.has(founderId))
      .map(([companyId]) => companyId)
      .filter((companyId) => companySet.has(companyId) || meta.companyNames.has(companyId));
    // Prefer a company that is on the sampled graph; else first investable company.
    const companyId =
      companies.find((id) => companySet.has(id)) ??
      [...(meta.companyFounders.entries())].find(([, set]) => set.has(founderId))?.[0] ??
      null;
    const investors = realInvestorNames(companyId ? meta.companyInvestors.get(companyId) ?? [] : []);
    const networkLabels = networksByFounder.get(founderId) ?? [];
    const hasTopFund =
      investors.some((name) => isTopFundLabel(name)) || networkLabels.some((name) => isTopFundLabel(name));
    founderDeals[founderId] = {
      founderId,
      founderName: meta.founderNames.get(founderId) ?? founderId,
      companyId,
      companyName: companyId ? meta.companyNames.get(companyId) ?? companyId : null,
      stage: companyId ? meta.companyStages.get(companyId) ?? null : null,
      networks: networkLabels.slice(0, 8),
      investors: investors.slice(0, 8),
      hasTopFund,
    };
  }
  // Company is uncrowded only when neither investor facts nor sampled network ties show a top fund.
  const companyNetworkLabels = new Map<string, string[]>();
  for (const link of links) {
    if (!companySet.has(link.companyId)) continue;
    const list = companyNetworkLabels.get(link.companyId) ?? [];
    if (!list.includes(link.label)) list.push(link.label);
    companyNetworkLabels.set(link.companyId, list);
  }
  for (const companyId of companyIds) {
    const investors = meta.companyInvestors.get(companyId) ?? [];
    const nets = companyNetworkLabels.get(companyId) ?? [];
    const crowded =
      investors.some((name) => isTopFundLabel(name)) || nets.some((name) => isTopFundLabel(name));
    if (!crowded) uncrowded.add(companyId);
  }

  return {
    nodes,
    edges,
    clusters: [],
    edgeCounts,
    generatedAt: new Date().toISOString(),
    layout: "packed-glow",
    sample: { topNetworks: top.length, maxCompaniesPerNetwork: 100, maxFoundersPerNetwork: 240 },
    founderDeals,
    uncrowdedCompanyIds: [...uncrowded],
  };
}

/**
 * Designed desk layout: largest hub (YC) at the origin; remaining hubs on a
 * ring sorted by size so peripheral clusters read as labeled satellites
 * instead of a stock force pack.
 */
function packClusterCenters(items: { id: string; r: number }[]): Map<string, { x: number; y: number }> {
  const sorted = [...items].sort((a, b) => b.r - a.r || a.id.localeCompare(b.id));
  const out = new Map<string, { x: number; y: number }>();
  if (sorted.length === 0) return out;
  const core = sorted[0];
  out.set(core.id, { x: 0, y: 0 });
  const ring = sorted.slice(1);
  if (ring.length === 0) return out;
  const coreR = Math.max(28, core.r * 0.72);
  // Ring radius clears the YC cloud; slight oval so the desk feels composed.
  const baseR = coreR + 38 + Math.max(...ring.map((item) => item.r)) * 0.55;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const item = ring[i];
    // Start at upper-right; go clockwise so Penn/Speedrun land in readable arcs.
    const ang = -Math.PI / 2 + (i / n) * Math.PI * 2 + 0.18;
    const radial = baseR + (i % 3) * 6 + item.r * 0.12;
    out.set(item.id, {
      x: Math.cos(ang) * radial * 1.08,
      y: Math.sin(ang) * radial * 0.92,
    });
  }
  return out;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function packMembersInCluster(members: GraphNode[], cx: number, cy: number, clusterR: number): void {
  const n = members.length;
  if (n === 0) return;
  // Organic multi-lobe cloud: campus subclouds offset irregularly (not a flat disk).
  const byCampus = new Map<string, GraphNode[]>();
  for (const node of members) {
    const key = node.campusId ?? (node.type === "company" ? "co" : "unk");
    const list = byCampus.get(key) ?? [];
    list.push(node);
    byCampus.set(key, list);
  }
  const groups = [...byCampus.values()].sort((a, b) => b.length - a.length);
  const groupCenters: { x: number; y: number; rx: number; ry: number; nodes: GraphNode[] }[] = [];
  const gCount = groups.length;
  for (let g = 0; g < gCount; g++) {
    const nodes = groups[g];
    const weight = Math.sqrt(nodes.length);
    const gRx = Math.max(10, Math.min(clusterR * 0.64, 7 + weight * 5.6));
    const gRy = Math.max(9, Math.min(clusterR * 0.54, 6 + weight * 4.6));
    const seed = hash01Local(`g:${g}:${nodes[0]?.id ?? g}`);
    const ang = gCount === 1 ? seed * 0.8 : (g / gCount) * Math.PI * 2 + seed * 1.1;
    const dist =
      gCount === 1
        ? clusterR * 0.15
        : Math.min(clusterR * 0.85, 11 + weight * 4.8 + seed * clusterR * 0.15);
    groupCenters.push({
      x: cx + Math.cos(ang) * dist,
      y: cy + Math.sin(ang) * dist * (0.78 + seed * 0.2),
      rx: gRx,
      ry: gRy,
      nodes,
    });
  }
  for (const group of groupCenters) {
    const m = group.nodes.length;
    for (let i = 0; i < m; i++) {
      const node = group.nodes[i];
      const t = m === 1 ? 0 : i / Math.max(1, m - 0.35);
      // Density falloff + lobe stretch so the cloud is irregular, not a filled circle.
      const radiusT = Math.pow(t, 0.62);
      const ang = i * GOLDEN_ANGLE + hashAngle(node.id);
      const lobe = 0.82 + 0.28 * Math.sin(ang * 2.3 + hash01Local(node.id) * 6);
      const jx = (hash01Local(node.id) - 0.5) * 4.4;
      const jy = (hash01Local(node.id + ":y") - 0.5) * 4.4;
      node.x = Math.round((group.x + Math.cos(ang) * radiusT * group.rx * lobe + jx) * 10) / 10;
      node.y = Math.round((group.y + Math.sin(ang) * radiusT * group.ry * lobe + jy) * 10) / 10;
    }
  }
}

function hash01Local(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function hashAngle(id: string): number {
  return hash01Local(id) * Math.PI * 2;
}

/** Editorial packed-glow layout (build-time). Dense Nature-style cloud. */
export function applyForceLayout(graph: GraphPayload): GraphPayload {
  const networks = graph.nodes.filter((node) => node.type === "network").sort((a, b) => a.rank - b.rank);
  const members = graph.nodes.filter((node) => node.type === "company" || node.type === "founder");
  const byParent = new Map<string, GraphNode[]>();
  for (const node of members) {
    const parent = node.parentNetworkId;
    if (!parent) continue;
    const list = byParent.get(parent) ?? [];
    list.push(node);
    byParent.set(parent, list);
  }

  const pageEarly = buildFounderNetworksPage();
  const totalByNetEarly = new Map(pageEarly.topNetworks.map((row) => [row.id, row.founderCount]));

  for (const net of networks) {
    const kids = byParent.get(net.networkId ?? "") ?? [];
    const totalFounders = totalByNetEarly.get(net.networkId ?? "") ?? kids.length;
    // Area ∝ founders → r ∝ sqrt. YC (~985) should dominate ~35-40% of the fitted frame.
    net.clusterR = Math.max(32, Math.sqrt(Math.max(1, totalFounders)) * 5.6);
    // Hub glyph stays modest; founder cloud carries the mass.
    net.size = Math.max(4, Math.min(9, 3.5 + Math.sqrt(totalFounders) * 0.18));
  }

  // Pack on a tighter shell so neighboring clouds sit close (Nature poster density).
  const centers = packClusterCenters(
    networks.map((net) => ({ id: net.id, r: Math.max(20, net.clusterR * 0.55) }))
  );
  const xs0 = [...centers.values()].map((c) => c.x);
  const ys0 = [...centers.values()].map((c) => c.y);
  const spanX0 = Math.max(1, Math.max(...xs0) - Math.min(...xs0));
  const spanY0 = Math.max(1, Math.max(...ys0) - Math.min(...ys0));
  // Mild wide aspect only; do not fling small clusters into empty gutters.
  const targetAspect = 1.55;
  const stretchX = spanY0 * targetAspect > spanX0 ? Math.min(1.18, (spanY0 * targetAspect) / spanX0) : 1.0;
  for (const [id, c] of centers) {
    centers.set(id, { x: c.x * stretchX, y: c.y });
  }

  for (const net of networks) {
    const c = centers.get(net.id) ?? { x: 0, y: 0 };
    net.x = Math.round(c.x * 10) / 10;
    net.y = Math.round(c.y * 10) / 10;
    const kids = byParent.get(net.networkId ?? "") ?? [];
    kids.sort((a, b) => a.type.localeCompare(b.type) || b.size - a.size || a.id.localeCompare(b.id));
    packMembersInCluster(kids, net.x, net.y, net.clusterR);
  }

  // Investor insights: non-obvious, sourced desk facts (skip rank-repeating tallies).
  const callouts: Record<number, string> = {};
  const founderNets = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    if (edge.type !== "network_founder" && edge.type !== "network_tie") continue;
    const netId = edge.source.startsWith("net:") ? edge.source.slice(4) : "";
    const foId = edge.target.startsWith("fo:")
      ? edge.target.slice(3)
      : edge.source.startsWith("fo:")
        ? edge.source.slice(3)
        : "";
    if (!netId || !foId) continue;
    const set = founderNets.get(foId) ?? new Set<string>();
    set.add(netId);
    founderNets.set(foId, set);
  }
  let vipOnDesk = 0;
  let vipAlsoYc = 0;
  for (const nets of founderNets.values()) {
    if (!nets.has("vipx")) continue;
    vipOnDesk += 1;
    if (nets.has("yc")) vipAlsoYc += 1;
  }
  const companyNodes = members.filter((node) => node.type === "company").length;
  const uncrowdedN = (graph.uncrowdedCompanyIds ?? []).length;
  const invHubs = pageEarly.investorHubs ?? [];
  const topInv = invHubs[0];
  if (vipOnDesk > 0) {
    callouts[1] =
      `Only ${vipAlsoYc.toLocaleString("en-US")} of ${vipOnDesk.toLocaleString("en-US")} VIP-X founders on this desk also carry a YC tie — most of that pathway is still open to non-YC capital.`;
  }
  if (companyNodes > 0 && uncrowdedN > 0) {
    callouts[2] =
      `${uncrowdedN.toLocaleString("en-US")} of ${companyNodes.toLocaleString("en-US")} companies plotted here are not yet backed by a top fund on file.`;
  }
  if (topInv && topInv.founderCount > 0) {
    callouts[3] =
      `${topInv.label} reaches only ${topInv.founderCount.toLocaleString("en-US")} campus founders across ${topInv.companyCount.toLocaleString("en-US")} companies here — top-fund coverage stays thin beside program hubs.`;
  }
  // Attach by rank slots only when we actually have a sourced line.

  const founderCountByNet = new Map<string, number>();
  for (const edge of graph.edges) {
    if (edge.type !== "network_founder" && edge.type !== "network_tie") continue;
    const netId = edge.source.startsWith("net:") ? edge.source.slice(4) : "";
    if (!netId) continue;
    founderCountByNet.set(netId, (founderCountByNet.get(netId) ?? 0) + 1);
  }

  const totalByNet = totalByNetEarly;

  const clusters: GraphCluster[] = networks.map((net) => {
    const kids = byParent.get(net.networkId ?? "") ?? [];
    const companies = kids.filter((node) => node.type === "company").length;
    const shownFounders = kids.filter((node) => node.type === "founder").length;
    const totalFounders = totalByNet.get(net.networkId ?? "") ?? shownFounders;
    let labelR = net.clusterR * 0.55;
    if (kids.length) {
      let maxD = 0;
      for (const kid of kids) {
        const d = Math.hypot(kid.x - net.x, kid.y - net.y);
        if (d > maxD) maxD = d;
      }
      labelR = Math.max(10, Math.min(net.clusterR * 0.95, maxD + 4));
    }
    return {
      id: net.networkId ?? net.id,
      label: net.label,
      kind: (net.kind ?? "program") as NetworkKind,
      cx: net.x,
      cy: net.y,
      r: net.clusterR,
      labelR,
      hue: net.hue,
      rank: net.rank,
      companyCount: companies,
      founderCount: founderCountByNet.get(net.networkId ?? "") ?? shownFounders,
      shownFounders,
      totalFounders,
      callout: net.rank <= 3 ? callouts[net.rank] ?? null : null,
    };
  });

  return {
    ...graph,
    nodes: [...networks, ...members],
    clusters,
    layout: "packed-glow",
    sample: graph.sample ?? { topNetworks: networks.length, maxCompaniesPerNetwork: 100, maxFoundersPerNetwork: 120 },
    founderDeals: graph.founderDeals ?? {},
    uncrowdedCompanyIds: graph.uncrowdedCompanyIds ?? [],
  };
}
