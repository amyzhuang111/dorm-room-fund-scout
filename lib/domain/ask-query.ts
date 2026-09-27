// Structured search over Campus Scout. Tools call these functions.
// Nothing here invents a person, startup, organization, or investor:
// every hit id is a primary key or a hotspot/investor node id derived
// from stored names.

import fs from "node:fs";
import { databasePath, getDb } from "../db/client";
import { CAMPUSES, campusById, shortCampusLabel } from "./campuses";
import {
  bestCard,
  hasPhrase,
  hotspotHref,
  hotspotMapNodeId,
  investorNodeId,
  normHotspotName,
  samePlace,
  tierBandLabel,
  type HotspotTier,
} from "./hotspot-model";
import { directoryLabel, hotspotGroups, personIdsForPlace, projectIdsForPlace, type HotspotPlaceGroup } from "./hotspots";
import { sectorLabel } from "./sectors";
import { signalTierRank } from "./signal-tier";
import type { AskHit, AskKind, AskSource, AskToolResult } from "./ask-types";

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 30;

const HEALTH_FAMILY = ["healthtech", "biotech", "medtech"];

const SECTOR_ALIASES: Record<string, string[]> = {
  ai: ["ai_agents", "ai_infra", "vertical_ai"],
  "artificial intelligence": ["ai_agents", "ai_infra", "vertical_ai"],
  healthcare: HEALTH_FAMILY,
  "health care": HEALTH_FAMILY,
  health: HEALTH_FAMILY,
  healthtech: HEALTH_FAMILY,
  "health tech": HEALTH_FAMILY,
  "digital health": HEALTH_FAMILY,
  biotech: HEALTH_FAMILY,
  "bio tech": HEALTH_FAMILY,
  medtech: HEALTH_FAMILY,
  "med tech": HEALTH_FAMILY,
  medical: HEALTH_FAMILY,
  fintech: ["fintech"],
  climate: ["climate_energy"],
  robotics: ["robotics_hardware"],
  hardware: ["robotics_hardware"],
  edtech: ["edtech"],
  education: ["edtech"],
  crypto: ["crypto_web3"],
  web3: ["crypto_web3"],
  security: ["cybersecurity"],
  cybersecurity: ["cybersecurity"],
  consumer: ["consumer"],
  devtools: ["dev_tools"],
  "dev tools": ["dev_tools"],
};

const CITY_ALIASES: Record<string, string[]> = {
  nyc: ["new york", "nyc"],
  ny: ["new york", "nyc"],
  "new york": ["new york", "nyc"],
  "new york city": ["new york", "nyc"],
  sf: ["san francisco"],
  "san francisco": ["san francisco"],
  bay: ["san francisco", "palo alto", "oakland"],
  "bay area": ["san francisco", "palo alto", "oakland", "sunnyvale"],
  boston: ["boston"],
  philadelphia: ["philadelphia"],
  philly: ["philadelphia"],
  la: ["los angeles"],
  "los angeles": ["los angeles"],
  seattle: ["seattle"],
  london: ["london"],
};

// September 2026 is the 2026-27 academic year.
const STANDING_YEAR: Record<string, number> = {
  freshman: 2030,
  sophomore: 2029,
  junior: 2028,
  senior: 2027,
};

export interface PeopleQuery {
  campus?: string | null;
  enrollment?: "current_student" | "recent_grad" | "older_alumni" | null;
  standing?: "freshman" | "sophomore" | "junior" | "senior" | null;
  classYear?: number | null;
  organization?: string | null;
  sector?: string | null;
  investor?: string | null;
  city?: string | null;
  founderOnly?: boolean | null;
  building?: boolean | null;
  verification?: "confirmed" | "partial" | "unverified" | null;
  name?: string | null;
  /** When "tier", stronger Founder Scout tiers sort first. */
  sort?: "tier" | null;
  limit?: number | null;
}

export interface StartupQuery {
  campus?: string | null;
  sector?: string | null;
  investor?: string | null;
  city?: string | null;
  program?: string | null;
  /** Round stage such as "seed" or "series a". Matches sort ahead of other raises. */
  stage?: string | null;
  /** Rank startups that have a round, amount, or funding story ahead of the rest. */
  funding?: boolean | null;
  verification?: "confirmed" | "partial" | "unverified" | null;
  name?: string | null;
  limit?: number | null;
}

export interface OrganizationQuery {
  campus?: string | null;
  tier?: HotspotTier | null;
  topTier?: boolean | null;
  typeIncludes?: string | null;
  name?: string | null;
  minFounders?: number | null;
  limit?: number | null;
}

export interface InvestorQuery {
  name?: string | null;
  limit?: number | null;
}

interface PersonRec {
  id: string;
  name: string;
  enrollment: string | null;
  label: string | null;
  year: number | null;
  basis: string | null;
  founderStatus: string | null;
  verification: string | null;
  signalTier: string | null;
  campuses: string[];
  roles: { projectId: string; role: string | null }[];
  sourceUrl: string | null;
}

interface FundingRoundRec {
  stage: string | null;
  amountText: string | null;
  date: string | null;
  leads: string[];
  sourceUrl: string | null;
}

interface FundingEventRec {
  amount: number | null;
  instrument: string | null;
  date: string | null;
}

interface FundingNewsRec {
  headline: string;
  url: string | null;
}

interface StartupRec {
  id: string;
  name: string;
  description: string | null;
  website: string | null;
  verification: string | null;
  sectors: string[];
  investors: { name: string; url: string; round: string | null }[];
  hqs: { text: string; url: string }[];
  rounds: FundingRoundRec[];
  fundingTotal: string | null;
  fundingEvents: FundingEventRec[];
  fundingNews: FundingNewsRec[];
  campuses: string[];
  founderIds: string[];
  programs: string[];
  sourceUrl: string | null;
}

interface Index {
  stamp: string;
  people: PersonRec[];
  startups: Map<string, StartupRec>;
  founderIds: Set<string>;
  programNames: string[];
}

let cache: Index | null = null;

function stamp(): string {
  try {
    const st = fs.statSync(databasePath());
    return `${st.mtimeMs}:${st.size}`;
  } catch {
    return "missing";
  }
}

function columnSet(table: string): Set<string> {
  const db = getDb();
  return new Set((db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((column) => column.name));
}

function loadIndex(): Index {
  const current = stamp();
  if (cache?.stamp === current) return cache;
  const db = getDb();
  const peopleColumns = columnSet("people");
  const projectColumns = columnSet("projects");
  const basisSql = peopleColumns.has("enrollment_basis") ? "enrollment_basis" : "NULL AS enrollment_basis";
  const sourceSql = peopleColumns.has("enrollment_source_url") ? "enrollment_source_url" : "NULL AS enrollment_source_url";
  const personVerify = peopleColumns.has("verification_status") ? "verification_status" : "NULL AS verification_status";
  const personTier = peopleColumns.has("signal_tier") ? "signal_tier" : "NULL AS signal_tier";
  const projectVerify = projectColumns.has("verification_status") ? "verification_status" : "NULL AS verification_status";

  const people = db
    .prepare(
      `SELECT id, name, enrollment_status, enrollment_label, enrollment_grad_year, founder_status, ${basisSql}, ${sourceSql}, ${personVerify}, ${personTier}
       FROM people
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
    enrollment_status: string | null;
    enrollment_label: string | null;
    enrollment_grad_year: number | null;
    founder_status: string | null;
    enrollment_basis: string | null;
    enrollment_source_url: string | null;
    verification_status: string | null;
    signal_tier: string | null;
  }[];

  const personById = new Map<string, PersonRec>();
  for (const row of people) {
    personById.set(row.id, {
      id: row.id,
      name: row.name,
      enrollment: row.enrollment_status,
      label: row.enrollment_label,
      year: row.enrollment_grad_year,
      basis: row.enrollment_basis,
      founderStatus: row.founder_status,
      verification: row.verification_status,
      signalTier: row.signal_tier,
      campuses: [],
      roles: [],
      sourceUrl: row.enrollment_source_url && row.enrollment_source_url.startsWith("http") ? row.enrollment_source_url : null,
    });
  }

  const affiliations = db.prepare(`SELECT person_id, university_id FROM affiliations`).all() as { person_id: string; university_id: string }[];
  for (const row of affiliations) {
    const person = personById.get(row.person_id);
    if (!person || !campusById(row.university_id)) continue;
    if (!person.campuses.includes(row.university_id)) person.campuses.push(row.university_id);
  }

  const roles = db.prepare(`SELECT person_id, project_id, role FROM person_project_roles`).all() as {
    person_id: string;
    project_id: string;
    role: string | null;
  }[];
  for (const row of roles) {
    const person = personById.get(row.person_id);
    if (!person) continue;
    person.roles.push({ projectId: row.project_id, role: row.role });
  }

  const claimPeople = db
    .prepare(
      `SELECT entity_id, MIN(source_url) AS source_url FROM claims
       WHERE entity_type = 'person' AND source_url LIKE 'http%'
       GROUP BY entity_id`
    )
    .all() as { entity_id: string; source_url: string }[];
  for (const row of claimPeople) {
    const person = personById.get(row.entity_id);
    if (person && !person.sourceUrl) person.sourceUrl = row.source_url;
  }

  const startupRows = db
    .prepare(
      `SELECT id, name, description, website_url, primary_link, ${projectVerify}
       FROM projects
       WHERE kind = 'company' AND is_investable_candidate = 1`
    )
    .all() as {
    id: string;
    name: string;
    description: string | null;
    website_url: string | null;
    primary_link: string | null;
    verification_status: string | null;
  }[];

  const startups = new Map<string, StartupRec>();
  for (const row of startupRows) {
    const website = row.website_url?.startsWith("http") ? row.website_url : row.primary_link?.startsWith("http") ? row.primary_link : null;
    startups.set(row.id, {
      id: row.id,
      name: row.name,
      description: row.description,
      website,
      verification: row.verification_status,
      sectors: [],
      investors: [],
      hqs: [],
      rounds: [],
      fundingTotal: null,
      fundingEvents: [],
      fundingNews: [],
      campuses: [],
      founderIds: [],
      programs: [],
      sourceUrl: website,
    });
  }

  const programByCompany = new Map<string, string[]>();
  const rememberProgram = (companyId: string, programName: string) => {
    const name = programName.replace(/\s+/g, " ").trim();
    if (!companyId || name.length < 3) return;
    const list = programByCompany.get(companyId) ?? [];
    if (!list.includes(name)) list.push(name);
    programByCompany.set(companyId, list);
  };
  const memberships = db
    .prepare(
      `SELECT co.id AS company_id, prog.name AS program_name
       FROM relationships r
       JOIN projects prog ON prog.id = r.target_entity_id
       JOIN projects co ON co.id = r.source_entity_id AND co.kind = 'company'
       WHERE r.relationship_type = 'part_of_program'`
    )
    .all() as { company_id: string; program_name: string }[];
  for (const row of memberships) rememberProgram(row.company_id, row.program_name);
  const sourcedPrograms = db
    .prepare(
      `SELECT DISTINCT p.id AS company_id, s.name AS program_name
       FROM claims c
       JOIN sources s ON s.id = c.source_id
       JOIN projects p ON p.id = c.entity_id AND p.kind = 'company'
       WHERE c.entity_type IN ('project', 'company')
         AND (
           lower(s.name) LIKE '%portfolio%'
           OR lower(s.name) LIKE '%accelerator%'
           OR lower(s.name) LIKE '%incubator%'
           OR lower(s.name) LIKE '%health-tech%'
           OR lower(s.name) LIKE '%health tech%'
         )`
    )
    .all() as { company_id: string; program_name: string }[];
  for (const row of sourcedPrograms) rememberProgram(row.company_id, row.program_name);

  const missingIds = [...programByCompany.keys()].filter((id) => !startups.has(id));
  if (missingIds.length) {
    const extra = db
      .prepare(
        `SELECT id, name, description, website_url, primary_link, ${projectVerify}
         FROM projects
         WHERE kind = 'company' AND id IN (${missingIds.map(() => "?").join(",")})`
      )
      .all(...missingIds) as {
      id: string;
      name: string;
      description: string | null;
      website_url: string | null;
      primary_link: string | null;
      verification_status: string | null;
    }[];
    for (const row of extra) {
      const website = row.website_url?.startsWith("http") ? row.website_url : row.primary_link?.startsWith("http") ? row.primary_link : null;
      startups.set(row.id, {
        id: row.id,
        name: row.name,
        description: row.description,
        website,
        verification: row.verification_status,
        sectors: [],
        investors: [],
        hqs: [],
        rounds: [],
        fundingTotal: null,
        fundingEvents: [],
        fundingNews: [],
        campuses: [],
        founderIds: [],
        programs: [],
        sourceUrl: website,
      });
    }
  }
  for (const [companyId, names] of programByCompany) {
    const startup = startups.get(companyId);
    if (startup) startup.programs = names;
  }

  const tags = db.prepare(`SELECT project_id, tag FROM project_sector_tags`).all() as { project_id: string; tag: string }[];
  for (const row of tags) startups.get(row.project_id)?.sectors.push(row.tag);
  for (const startup of startups.values()) {
    if (startup.programs.some(programImpliesHealth) && !startup.sectors.some((tag) => HEALTH_FAMILY.includes(tag))) {
      startup.sectors.push("healthtech");
    }
  }

  const facts = db
    .prepare(
      `SELECT project_id, fact_key, value_text, detail_json, source_url FROM company_facts
       WHERE fact_key IN ('investor', 'hq', 'funding_round', 'funding_total') AND length(trim(value_text)) >= 2`
    )
    .all() as {
    project_id: string;
    fact_key: string;
    value_text: string;
    detail_json: string | null;
    source_url: string;
  }[];
  for (const row of facts) {
    const startup = startups.get(row.project_id);
    if (!startup) continue;
    const url = row.source_url?.startsWith("http") ? row.source_url : "";
    const extra = parseJsonObject(row.detail_json);
    if (row.fact_key === "investor") {
      startup.investors.push({ name: row.value_text.trim(), url, round: asString(extra.round) });
    } else if (row.fact_key === "hq") {
      startup.hqs.push({ text: row.value_text.trim(), url });
    } else if (row.fact_key === "funding_round") {
      const stage = asString(extra.stage) || (!looksLikeMoney(row.value_text) ? row.value_text.trim() : null);
      const amountText = asString(extra.amountText) || (looksLikeMoney(row.value_text) ? row.value_text.trim() : null);
      startup.rounds.push({
        stage,
        amountText,
        date: asString(extra.date),
        leads: asStrings(extra.leads),
        sourceUrl: url || null,
      });
    } else if (row.fact_key === "funding_total" && !startup.fundingTotal) {
      startup.fundingTotal = row.value_text.trim();
    }
    if (url && !startup.sourceUrl) startup.sourceUrl = url;
  }
  for (const startup of startups.values()) {
    startup.rounds = uniqueRounds(startup.rounds).sort(
      (a, b) => (STAGE_RANK[normStage(b.stage)] ?? 0) - (STAGE_RANK[normStage(a.stage)] ?? 0) || (b.date ?? "").localeCompare(a.date ?? "")
    );
  }

  const events = db.prepare(`SELECT project_id, amount, instrument, event_date FROM funding_events`).all() as {
    project_id: string;
    amount: number | null;
    instrument: string | null;
    event_date: string | null;
  }[];
  for (const row of events) {
    const startup = startups.get(row.project_id);
    if (!startup || startup.rounds.length > 0) continue;
    startup.fundingEvents.push({
      amount: typeof row.amount === "number" ? row.amount : null,
      instrument: row.instrument,
      date: row.event_date,
    });
  }

  const newsRows = db
    .prepare(
      `SELECT nm.project_id, na.headline, na.url
       FROM news_mentions nm
       JOIN news_articles na ON na.id = nm.article_id
       WHERE na.category = 'funding' AND nm.project_id != ''`
    )
    .all() as { project_id: string; headline: string; url: string }[];
  const newsByProject = new Map<string, { headline: string; url: string | null; rank: number }[]>();
  for (const row of newsRows) {
    const headline = row.headline.replace(/\s+/g, " ").trim();
    if (headline.length < 8) continue;
    const list = newsByProject.get(row.project_id) ?? [];
    list.push({ headline, url: row.url?.startsWith("http") ? row.url : null, rank: fundingNewsRank(headline) });
    newsByProject.set(row.project_id, list);
  }
  for (const [projectId, list] of newsByProject) {
    const startup = startups.get(projectId);
    if (!startup) continue;
    const strong = list.filter((item) => item.rank > 0);
    const picked = (strong.length ? strong : list).sort((a, b) => b.rank - a.rank || a.headline.localeCompare(b.headline));
    const seenNews = new Set<string>();
    for (const item of picked) {
      const key = item.headline.toLowerCase();
      if (seenNews.has(key)) continue;
      seenNews.add(key);
      startup.fundingNews.push({ headline: item.headline, url: item.url });
      if (startup.fundingNews.length >= 2) break;
    }
  }

  const companyCampus = db
    .prepare(
      `SELECT source_entity_id AS id, target_entity_id AS campus
       FROM relationships
       WHERE relationship_type = 'affiliated_with' AND source_entity_type = 'project' AND target_entity_type = 'university'`
    )
    .all() as { id: string; campus: string }[];
  for (const row of companyCampus) {
    const startup = startups.get(row.id);
    if (!startup || !campusById(row.campus)) continue;
    if (!startup.campuses.includes(row.campus)) startup.campuses.push(row.campus);
  }

  const founderIds = new Set<string>();
  for (const person of personById.values()) {
    for (const role of person.roles) {
      const startup = startups.get(role.projectId);
      if (!startup) continue;
      if (!startup.campuses.length) {
        for (const campusId of person.campuses) {
          if (!startup.campuses.includes(campusId)) startup.campuses.push(campusId);
        }
      }
      if ((role.role ?? "").toLowerCase().includes("founder")) {
        founderIds.add(person.id);
        if (!startup.founderIds.includes(person.id)) startup.founderIds.push(person.id);
      }
    }
    if (person.founderStatus === "founder") founderIds.add(person.id);
  }

  const programNames = [...new Set([...programByCompany.values()].flat())];
  cache = { stamp: current, people: [...personById.values()], startups, founderIds, programNames };
  return cache;
}

const STAGE_RANK: Record<string, number> = {
  "pre-seed": 1,
  seed: 2,
  "series a": 3,
  "series b": 4,
  "series c": 5,
  "series d": 6,
  "series e": 7,
};

function parseJsonObject(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

function looksLikeMoney(value: string): boolean {
  return /\$|\d/.test(value);
}

function normStage(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function uniqueRounds(rounds: FundingRoundRec[]): FundingRoundRec[] {
  const seen = new Set<string>();
  const out: FundingRoundRec[] = [];
  for (const round of rounds) {
    const key = `${normStage(round.stage)}|${(round.amountText ?? "").toLowerCase()}|${round.date ?? ""}|${round.leads.join(",").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(round);
  }
  return out;
}

function fundingNewsRank(headline: string): number {
  return /(\braises?\b|\braised\b|\braising\b|\bseries\s+[a-e]\b|\bpre-seed\b|\bseed\b|\$\s?\d|\d+(?:\.\d+)?\s*(?:million|billion)\b)/i.test(headline) ? 1 : 0;
}

function clipText(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return (space > 80 ? cut.slice(0, space) : cut).trim();
}

function formatMoney(amount: number | null): string | null {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return null;
  const trimNum = (value: number) => (value >= 10 ? value.toFixed(0) : value.toFixed(1)).replace(/\.0$/, "");
  if (amount >= 1_000_000_000) return `$${trimNum(amount / 1_000_000_000)}B`;
  if (amount >= 1_000_000) return `$${trimNum(amount / 1_000_000)}M`;
  if (amount >= 1_000) return `$${trimNum(amount / 1_000)}k`;
  return `$${Math.round(amount)}`;
}

function roundLabel(round: FundingRoundRec): string {
  const parts = [round.stage, round.amountText].filter((part): part is string => Boolean(part));
  let text = parts.join(" ");
  if (round.date) text = text ? `${text} (${round.date})` : round.date;
  if (round.leads.length) text = text ? `${text} led by ${round.leads.slice(0, 3).join(", ")}` : `led by ${round.leads.slice(0, 3).join(", ")}`;
  return text;
}

function eventLabel(event: FundingEventRec): string {
  const amount = formatMoney(event.amount);
  const kind = event.instrument && event.instrument !== "unknown" ? event.instrument : null;
  return [kind, amount, event.date].filter((part): part is string => Boolean(part)).join(" ");
}

function stageHit(value: string | null | undefined, query: string): boolean {
  const stage = normStage(value);
  const want = normStage(query);
  if (!stage || !want) return false;
  if (want === "seed") return stage === "seed" || stage === "seed round";
  return stage === want || stage.startsWith(`${want} `);
}

function textHasStage(text: string, query: string): boolean {
  const want = normStage(query);
  const hay = normStage(text);
  if (!want || !hay) return false;
  if (want === "seed") return /\bseed\b/.test(hay) && !/\bpre seed\b/.test(hay);
  return hay.includes(want);
}

function startupMatchesStage(startup: StartupRec, stage: string): boolean {
  if (startup.rounds.some((round) => stageHit(round.stage, stage) || textHasStage(round.amountText ?? "", stage))) return true;
  if (startup.investors.some((investor) => stageHit(investor.round, stage))) return true;
  if (startup.fundingNews.some((item) => textHasStage(item.headline, stage))) return true;
  return false;
}

function fundingRank(startup: StartupRec, stage?: string | null): number {
  let score = 0;
  if (stage && startupMatchesStage(startup, stage)) score += 100;
  if (startup.rounds.length) score += 20;
  if (startup.fundingTotal) score += 8;
  if (startup.fundingEvents.length) score += 12;
  if (startup.fundingNews.length) score += 6;
  if (startup.investors.length) score += 1;
  return score;
}

function fundingBlurb(startup: StartupRec): string | null {
  const parts: string[] = [];
  const rounds = startup.rounds.slice(0, 2).map(roundLabel).filter(Boolean);
  if (rounds.length) parts.push(`round: ${rounds.join("; ")}`);
  else {
    const events = startup.fundingEvents.slice(0, 2).map(eventLabel).filter(Boolean);
    if (events.length) parts.push(`round: ${events.join("; ")}`);
  }
  if (startup.fundingTotal) parts.push(`total: ${startup.fundingTotal}`);
  const news = startup.fundingNews[0]?.headline;
  if (news) parts.push(`funding news: ${clipText(news, 140)}`);
  return parts.length ? parts.join(" · ") : null;
}

function programImpliesHealth(name: string): boolean {
  return /\b(?:digital[\s-]?health|health[\s-]?tech|health[\s-]?care|med[\s-]?tech|bio[\s-]?tech|medical)\b/i.test(name);
}

function programNeedles(name: string): string[] {
  const norm = normHotspotName(name);
  const stripped = norm.replace(/\b(?:accelerator|portfolio|program|programme|cohort|companies|company)\b/g, " ").replace(/\s+/g, " ").trim();
  return [...new Set([norm, stripped].filter((phrase) => phrase.length >= 8))];
}

export function programInQuestion(question: string): string | undefined {
  const normQ = ` ${normHotspotName(question)} `;
  let best = "";
  let bestLen = 0;
  for (const name of loadIndex().programNames) {
    for (const needle of programNeedles(name)) {
      if (!normQ.includes(` ${needle} `)) continue;
      if (needle.length > bestLen) {
        best = name;
        bestLen = needle.length;
      }
    }
  }
  return best || undefined;
}

function clampLimit(limit: number | null | undefined): number {
  if (limit == null || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)));
}

function text(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function resolveCampuses(input: string | null | undefined): string[] | null {
  const query = text(input)?.toLowerCase();
  if (!query) return null;
  const hits = CAMPUSES.filter((campus) => {
    const names = [campus.id, campus.shortLabel, campus.name, ...campus.aliases].map((item) => item.toLowerCase());
    return names.some((name) => name === query || query === name.replace(/ university$/, ""));
  });
  return hits.map((campus) => campus.id);
}

function resolveSectors(input: string | null | undefined): string[] | null {
  const query = text(input)?.toLowerCase();
  if (!query) return null;
  const spaced = query.replace(/[_-]+/g, " ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  const compact = spaced.replace(/ /g, "");
  return SECTOR_ALIASES[query] ?? SECTOR_ALIASES[spaced] ?? SECTOR_ALIASES[compact] ?? (compact === "digitalhealth" ? HEALTH_FAMILY : []);
}

function cityNeedles(input: string | null | undefined): string[] | null {
  const query = text(input)?.toLowerCase();
  if (!query) return null;
  return CITY_ALIASES[query] ?? [query];
}

function hqMatches(hq: string, needles: string[]): boolean {
  const textValue = hq.toLowerCase();
  return needles.some((needle) => needle.length >= 3 && textValue.includes(needle));
}

function investorMatches(name: string, query: string): boolean {
  const left = normHotspotName(name);
  const right = normHotspotName(query);
  if (!right || right.length < 2) return false;
  if (left.includes(right)) return true;
  const tokens = right.split(" ").filter((token) => token.length > 1);
  return tokens.length > 0 && tokens.every((token) => left.includes(token));
}

function placesForQuery(query: string): HotspotPlaceGroup[] {
  const groups = hotspotGroups();
  const exact = groups.filter((group) => samePlace(query, group.label) || samePlace(query, directoryLabel(group.cards)));
  if (exact.length) return exact;
  const norm = normHotspotName(query);
  if (norm.length < 4) return [];
  return groups.filter((group) => hasPhrase(group.placeKey, norm) || group.phrases.some((phrase) => phrase === norm || hasPhrase(norm, phrase)));
}

function yearMatches(person: PersonRec, year: number): boolean {
  if (person.year === year) return true;
  const label = person.label ?? "";
  if (!label) return false;
  const short = String(year).slice(-2);
  return label.includes(String(year)) || new RegExp(`['’]${short}\\b`).test(label);
}

function enrollCaption(person: PersonRec): string | null {
  const label =
    person.enrollment === "current_student" ? "Current student" : person.enrollment === "recent_grad" ? "Recent grad" : person.enrollment === "older_alumni" ? "Alumni" : null;
  if (!label) return null;
  return person.basis === "inferred" ? `${label} est.` : label;
}

function campusCaption(ids: string[]): string {
  return ids.map((id) => shortCampusLabel(id)).join(", ");
}

function sourcesFor(href: string, urls: (string | null | undefined)[]): AskSource[] {
  const sources: AskSource[] = [{ label: "Record", url: href }];
  const seen = new Set<string>([href]);
  for (const url of urls) {
    if (!url || !url.startsWith("http") || seen.has(url)) continue;
    seen.add(url);
    sources.push({ label: "Source", url });
  }
  return sources;
}

function personHref(person: PersonRec): string {
  const params = new URLSearchParams({
    founder: person.id,
    enroll: "current_student,recent_grad,older_alumni",
  });
  if (person.founderStatus === "potential") params.set("pool", "potential");
  return `/founder/discover?${params.toString()}`;
}

function startupIdsFor(person: PersonRec, index: Index, sector: string[] | null, investorIds: Set<string> | null, cityIds: Set<string> | null, founderOnly: boolean): string[] {
  const ids: string[] = [];
  for (const role of person.roles) {
    const startup = index.startups.get(role.projectId);
    if (!startup) continue;
    if (founderOnly && !(role.role ?? "").toLowerCase().includes("founder")) continue;
    if (sector && !startup.sectors.some((tag) => sector.includes(tag))) continue;
    if (investorIds && !investorIds.has(startup.id)) continue;
    if (cityIds && !cityIds.has(startup.id)) continue;
    if (!ids.includes(startup.id)) ids.push(startup.id);
  }
  return ids;
}

function startupSet(index: Index, predicate: (startup: StartupRec) => boolean): Set<string> | null {
  const ids = new Set<string>();
  for (const startup of index.startups.values()) {
    if (predicate(startup)) ids.add(startup.id);
  }
  return ids;
}

export function searchPeople(query: PeopleQuery): AskToolResult {
  const index = loadIndex();
  const campusIds = resolveCampuses(query.campus);
  if (campusIds && campusIds.length === 0) return { count: 0, matches: [] };
  const sectors = resolveSectors(query.sector);
  if (sectors && sectors.length === 0) return { count: 0, matches: [] };
  const orgQuery = text(query.organization);
  const orgs = orgQuery ? placesForQuery(orgQuery) : null;
  if (orgs && orgs.length === 0) return { count: 0, matches: [] };
  const orgPeople = orgs ? new Set(orgs.flatMap((group) => personIdsForPlace(group.placeKey))) : null;
  const investorQuery = text(query.investor);
  const investorIds = investorQuery
    ? startupSet(index, (startup) => startup.investors.some((investor) => investorMatches(investor.name, investorQuery)))
    : null;
  if (investorIds && investorIds.size === 0) return { count: 0, matches: [] };
  const needles = cityNeedles(query.city);
  const cityIds = needles ? startupSet(index, (startup) => startup.hqs.some((hq) => hqMatches(hq.text, needles))) : null;
  if (cityIds && cityIds.size === 0) return { count: 0, matches: [] };

  const standing = text(query.standing)?.toLowerCase();
  const classYear = query.classYear ?? (standing && STANDING_YEAR[standing] ? STANDING_YEAR[standing] : null);
  const enrollment = query.enrollment ?? (standing ? "current_student" : null);
  const founderOnly = query.founderOnly === true;
  const building = query.building === true;
  const startupConstrained = Boolean(sectors || investorIds || cityIds);
  const name = text(query.name)?.toLowerCase();
  const verification = text(query.verification);
  const limit = clampLimit(query.limit);

  const matched: { person: PersonRec; hit: AskHit }[] = [];
  for (const person of index.people) {
    if (name && !person.name.toLowerCase().includes(name)) continue;
    if (campusIds && !person.campuses.some((id) => campusIds.includes(id))) continue;
    if (enrollment && person.enrollment !== enrollment) continue;
    if (classYear != null && !yearMatches(person, classYear)) continue;
    if (orgPeople && !orgPeople.has(person.id)) continue;
    if (verification && person.verification !== verification) continue;
    const linked = startupIdsFor(person, index, sectors, investorIds, cityIds, founderOnly);
    if (startupConstrained && linked.length === 0) continue;
    if (founderOnly && !startupConstrained && !index.founderIds.has(person.id)) continue;
    if (building && linked.length === 0 && person.founderStatus !== "founder" && person.founderStatus !== "potential") continue;
    if (building && startupConstrained && linked.length === 0) continue;

    const startups = linked.slice(0, 4).map((id) => index.startups.get(id)!).filter(Boolean);
    const orgNodes = (orgs ?? []).filter((group) => personIdsForPlace(group.placeKey).includes(person.id)).slice(0, 2);
    const investorNames = investorQuery
      ? [...new Set(startups.flatMap((startup) => startup.investors.filter((investor) => investorMatches(investor.name, investorQuery)).map((investor) => investor.name)))]
      : [];
    const places = needles
      ? [...new Set(startups.flatMap((startup) => startup.hqs.filter((hq) => hqMatches(hq.text, needles)).map((hq) => hq.text)))]
      : [];
    const detail = [
      campusCaption(person.campuses),
      classYear != null && yearMatches(person, classYear) ? `Class of ${classYear}` : person.year ? `Class of ${person.year}` : null,
      enrollCaption(person),
      person.verification,
      orgNodes.map((group) => directoryLabel(group.cards)).join(", ") || null,
      startups
        .map((startup) => {
          const sector = startup.sectors[0] ? ` (${sectorLabel(startup.sectors[0])})` : "";
          const round = startup.rounds[0] ? ` [${roundLabel(startup.rounds[0])}]` : "";
          return `${startup.name}${sector}${round}`;
        })
        .join(", ") || null,
      investorNames.length ? `investors: ${investorNames.join(", ")}` : null,
      places.join(", ") || null,
    ]
      .filter(Boolean)
      .join(" · ");
    const href = personHref(person);
    const factUrls = startups.flatMap((startup) => [
      ...startup.investors.map((investor) => investor.url),
      ...startup.hqs.map((hq) => hq.url),
      startup.sourceUrl,
    ]);
    matched.push({
      person,
      hit: {
        id: person.id,
        kind: "person",
        name: person.name,
        href,
        detail,
        campuses: person.campuses,
        relatedIds: [
          ...startups.map((startup) => startup.id),
          ...orgNodes.map((group) => hotspotMapNodeId(group.placeKey)),
          ...startups.flatMap((startup) => startup.investors.filter((investor) => !investorQuery || investorMatches(investor.name, investorQuery)).map((investor) => investorNodeId(investor.name))),
          ...person.campuses,
        ],
        sources: sourcesFor(href, [person.sourceUrl, ...factUrls, ...startups.flatMap((startup) => startup.rounds.map((round) => round.sourceUrl)), ...startups.flatMap((startup) => startup.fundingNews.map((item) => item.url))]),
      },
    });
    if (query.sort !== "tier" && matched.length >= limit) break;
  }
  if (query.sort === "tier") {
    matched.sort((a, b) => signalTierRank(a.person.signalTier) - signalTierRank(b.person.signalTier) || a.person.name.localeCompare(b.person.name));
  }
  const matches = matched.slice(0, limit).map((row) => row.hit);
  return { count: matches.length, matches };
}

function startupMatchesProgram(startup: StartupRec, query: string): boolean {
  const needle = normHotspotName(query);
  if (needle.length < 4) return false;
  return startup.programs.some((name) => {
    const norm = normHotspotName(name);
    if (norm.includes(needle) || needle.includes(norm)) return true;
    return programNeedles(name).some((alias) => alias === needle || needle.includes(alias));
  });
}

function mixHealthStartups(rows: StartupRec[], limit: number): StartupRec[] {
  const programmed = rows.filter((startup) => startup.programs.some(programImpliesHealth)).sort((a, b) => a.name.localeCompare(b.name));
  const rest = rows.filter((startup) => !startup.programs.some(programImpliesHealth)).sort((a, b) => a.name.localeCompare(b.name));
  const mixed: StartupRec[] = [];
  const count = Math.max(programmed.length, rest.length);
  for (let index = 0; index < count && mixed.length < limit; index += 1) {
    if (programmed[index]) mixed.push(programmed[index]);
    if (mixed.length >= limit) break;
    if (rest[index]) mixed.push(rest[index]);
  }
  return mixed;
}

export function searchStartups(query: StartupQuery): AskToolResult {
  const index = loadIndex();
  const campusIds = resolveCampuses(query.campus);
  if (campusIds && campusIds.length === 0) return { count: 0, matches: [] };
  const sectors = resolveSectors(query.sector);
  if (sectors && sectors.length === 0) return { count: 0, matches: [] };
  const investorQuery = text(query.investor);
  const needles = cityNeedles(query.city);
  const name = text(query.name)?.toLowerCase();
  const verification = text(query.verification);
  const program = text(query.program);
  const stage = text(query.stage);
  const rows: StartupRec[] = [];
  for (const startup of index.startups.values()) {
    if (name && !startup.name.toLowerCase().includes(name)) continue;
    if (campusIds && !startup.campuses.some((id) => campusIds.includes(id))) continue;
    if (sectors && !startup.sectors.some((tag) => sectors.includes(tag))) continue;
    if (program && !startupMatchesProgram(startup, program)) continue;
    if (investorQuery && !startup.investors.some((investor) => investorMatches(investor.name, investorQuery))) continue;
    if (needles && !startup.hqs.some((hq) => hqMatches(hq.text, needles))) continue;
    if (verification && startup.verification !== verification) continue;
    rows.push(startup);
  }
  const limit = clampLimit(query.limit);
  const healthQuery = Boolean(sectors?.some((tag) => HEALTH_FAMILY.includes(tag)));
  const rankFunding = query.funding === true || Boolean(stage);
  const ordered = rankFunding
    ? [...rows].sort((a, b) => fundingRank(b, stage) - fundingRank(a, stage) || a.name.localeCompare(b.name)).slice(0, limit)
    : healthQuery
      ? mixHealthStartups(rows, limit)
      : [...rows].sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit);
  const matches = ordered.map((startup) => startupHit(startup, investorQuery));
  return { count: matches.length, matches };
}

function shortProgram(name: string): string {
  return name
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+(?:accelerator|portfolio|program|programme)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function investorCaption(investor: { name: string; round: string | null }): string {
  return investor.round ? `${investor.name} (${investor.round})` : investor.name;
}

function startupHit(startup: StartupRec, investorQuery?: string): AskHit {
  const href = `/startup/${startup.id}`;
  const investors = investorQuery ? startup.investors.filter((investor) => investorMatches(investor.name, investorQuery)) : startup.investors.slice(0, 4);
  const detail = [
    campusCaption(startup.campuses),
    startup.sectors.slice(0, 2).map((tag) => sectorLabel(tag)).join(", ") || null,
    startup.programs.slice(0, 2).map(shortProgram).filter(Boolean).join(", ") || null,
    startup.hqs[0]?.text ?? null,
    fundingBlurb(startup),
    investors.length ? `investors: ${investors.map(investorCaption).join(", ")}` : null,
    startup.verification,
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    id: startup.id,
    kind: "startup" as AskKind,
    name: startup.name,
    href,
    detail,
    campuses: startup.campuses,
    relatedIds: [
      ...startup.founderIds.slice(0, 8),
      ...investors.map((investor) => investorNodeId(investor.name)),
      ...startup.campuses,
    ],
    sources: sourcesFor(href, [
      startup.website,
      startup.sourceUrl,
      ...investors.map((investor) => investor.url),
      ...startup.hqs.map((hq) => hq.url),
      ...startup.rounds.map((round) => round.sourceUrl),
      ...startup.fundingNews.map((item) => item.url),
    ]),
  };
}

export function searchOrganizations(query: OrganizationQuery): AskToolResult {
  const index = loadIndex();
  const campusIds = resolveCampuses(query.campus);
  if (campusIds && campusIds.length === 0) return { count: 0, matches: [] };
  const name = text(query.name);
  const typeIncludes = text(query.typeIncludes)?.toLowerCase();
  const named = name ? placesForQuery(name) : null;
  if (named && named.length === 0) return { count: 0, matches: [] };
  const allowed = named ? new Set(named.map((group) => group.placeKey)) : null;
  const minFounders = query.minFounders == null ? 1 : query.minFounders;
  const knownPeople = new Set(index.people.map((person) => person.id));

  const rows = hotspotGroups()
    .filter((group) => !allowed || allowed.has(group.placeKey))
    .map((group) => {
      const card = bestCard(group.cards);
      const people = personIdsForPlace(group.placeKey).filter((id) => knownPeople.has(id));
      const founders = people.filter((id) => index.founderIds.has(id));
      const startups = projectIdsForPlace(group.placeKey).filter((id) => index.startups.has(id));
      return { group, card, people, founders, startups };
    })
    .filter((row) => {
      if (campusIds && !row.group.campusIds.some((id) => campusIds.includes(id))) return false;
      if (query.tier && row.card.tier !== query.tier) return false;
      if (query.topTier && row.card.tier !== "S+" && row.card.tier !== "S" && row.card.tier !== "A") return false;
      if (typeIncludes && !row.group.cards.some((card) => card.type.toLowerCase().includes(typeIncludes))) return false;
      if (row.founders.length < minFounders) return false;
      return true;
    })
    .sort((a, b) => b.founders.length - a.founders.length || b.people.length - a.people.length || directoryLabel(a.group.cards).localeCompare(directoryLabel(b.group.cards)));

  const matches = rows.slice(0, clampLimit(query.limit)).map((row) => {
    const label = directoryLabel(row.group.cards);
    const href = hotspotHref(row.card, "founder");
    const id = hotspotMapNodeId(row.group.placeKey);
    return {
      id,
      kind: "organization" as AskKind,
      name: label,
      href,
      detail: [
        tierBandLabel(row.card.tier),
        row.card.type || null,
        row.card.campus,
        `${row.founders.length} founders`,
        `${row.people.length} people`,
        row.startups.length ? `${row.startups.length} startups` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      campuses: row.group.campusIds.filter((campusId) => campusById(campusId)),
      relatedIds: row.group.campusIds.filter((campusId) => campusById(campusId)),
      sources: sourcesFor(href, [row.card.url]),
    };
  });
  return { count: matches.length, matches };
}

export function searchInvestors(query: InvestorQuery): AskToolResult {
  const index = loadIndex();
  const name = text(query.name);
  const grouped = new Map<string, { name: string; startups: StartupRec[]; url: string | null }>();
  for (const startup of index.startups.values()) {
    for (const investor of startup.investors) {
      if (name && !investorMatches(investor.name, name)) continue;
      const key = normHotspotName(investor.name);
      const row = grouped.get(key) ?? { name: investor.name, startups: [], url: investor.url || null };
      if (!row.startups.some((item) => item.id === startup.id)) row.startups.push(startup);
      if (!row.url && investor.url) row.url = investor.url;
      grouped.set(key, row);
    }
  }
  const matches = [...grouped.values()]
    .sort((a, b) => b.startups.length - a.startups.length || a.name.localeCompare(b.name))
    .slice(0, clampLimit(query.limit))
    .map((row) => {
      const href = `/startup/${row.startups[0].id}`;
      const campuses = [...new Set(row.startups.flatMap((startup) => startup.campuses))];
      return {
        id: investorNodeId(row.name),
        kind: "investor" as AskKind,
        name: row.name,
        href,
        detail: `${row.startups.length} startups in Campus Scout`,
        campuses,
        relatedIds: [...row.startups.slice(0, 8).map((startup) => startup.id), ...campuses],
        sources: sourcesFor(href, [row.url]),
      };
    });
  return { count: matches.length, matches };
}

/** True when this id was produced from the current database index. */
export function isKnownAskId(id: string): boolean {
  if (!id) return false;
  const index = loadIndex();
  if (index.people.some((person) => person.id === id)) return true;
  if (index.startups.has(id)) return true;
  if (id.startsWith("hsn_") && hotspotGroups().some((group) => hotspotMapNodeId(group.placeKey) === id)) return true;
  if (id.startsWith("inv_")) {
    for (const startup of index.startups.values()) {
      if (startup.investors.some((investor) => investorNodeId(investor.name) === id)) return true;
    }
  }
  if (id.startsWith("univ_") && campusById(id)) return true;
  return false;
}
