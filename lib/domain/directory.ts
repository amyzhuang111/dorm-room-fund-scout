import fs from "node:fs";
import path from "node:path";
import { getDb } from "../db/client";
import { campusSlug, shortCampusLabel } from "./campuses";
import { classifyDescription, isBoilerplateDescription, primaryTag, sectorLabel } from "./sectors";

export interface DirectoryCard {
  id: string;
  name: string;
  description: string | null;
  school: string | null;
  schoolId: string | null;
  schoolSlug: string | null;
  sectorId: string | null;
  sector: string | null;
  stage: string | null;
  /** News category already stored for this company. Never a made-up tag. */
  signalLabel: "Funding" | "Launch" | "Award" | "Acquisition" | null;
  signalKind: "funding" | "launch" | "award" | "acquisition" | null;
  /** Rows in `signals` for this company. */
  signals: number;
  /** People linked to this company. Used for search, not a score. */
  founders: string[];
  /** Latest signal date as YYYY-MM-DD, with missing parts as 00. Empty when none are stored. */
  latestSignalAt: string | null;
  /** A logo or favicon URL already stored for this company. Never invented. */
  logoUrl: string | null;
  /** Founded year from company_facts.founded_year when stored. */
  foundedYear: number | null;
  /** operating_status fact when stored: acquired | dead. */
  operatingStatus: "acquired" | "dead" | null;
  /** Normalized HQ city from company_facts.hq when stored. */
  hqRegion: string | null;
  /** First investor/program fact when stored (e.g. Y Combinator, SkyDeck). */
  primaryProgram: string | null;
}

export interface DirectoryFilter {
  id: string;
  label: string;
  count: number;
}

export interface DirectoryData {
  cards: DirectoryCard[];
  sectors: DirectoryFilter[];
  kinds: DirectoryFilter[];
}

const STAGE_LABEL: Record<string, string> = {
  "pre-seed": "Pre-seed",
  seed: "Seed",
  "series a": "Series A",
  "series b": "Series B",
  "series c": "Series C",
  venture: "Venture",
};

const SIGNAL_LABEL = {
  funding: "Funding",
  launch: "Launch",
  award: "Award",
  acquisition: "Acquisition",
} as const;

const DIRECTORY_LIMIT = 14;
const LEADERBOARD_LIMIT = 14;
const LOGO_FACT_KEYS = new Set(["logo", "favicon", "logo_url", "favicon_url"]);
const STAGE_ORDER = ["Pre-seed", "Seed", "Series A", "Series B", "Series C", "Venture"];

export type DirectorySort = "name" | "recent" | "stage";

export function directorySortOf(value: string | undefined): DirectorySort {
  if (value === "name" || value === "stage") return value;
  return "recent";
}

function httpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = value.trim();
  if (!/^https?:\/\//i.test(text)) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}


/** Hosts that are never a company mark (aggregators, schools, incubators, social). */
const NON_COMPANY_HOST =
  /(?:^|\.)(google|github|linkedin|twitter|x|notion|medium|devpost|producthunt|facebook|instagram|youtube|crunchbase|angel|wellfound|substack|businesswire|techcrunch|geekwire|pulse2|freeventures|velocityincubator|ycombinator|techstars|startupschool|skydeck|venturelab|southparkcommons|luma|pitchbook)\./i;

const SCHOOL_OR_NEWS_HOST =
  /(?:\.edu|\.ac\.uk|university|utoronto|emorybusiness|thedp\.com|thedartmouth\.com|hypepotamus|grepbeat|entrepreneurs\.|speedrun\.a16z|campuspress|squarespace|wixsite|notion\.site)/i;

/** Deterministic favicon URL from a website host (google s2). LogoMark rejects the 16px default stub. */
export function faviconFromWebsiteHost(websiteUrl: string | null | undefined): string | null {
  const direct = httpUrl(websiteUrl);
  if (!direct) return null;
  try {
    const host = new URL(direct).hostname.replace(/^www\./i, "");
    if (!host || host === "localhost" || !host.includes(".")) return null;
    if (NON_COMPANY_HOST.test(host + ".") || SCHOOL_OR_NEWS_HOST.test(host)) return null;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
  } catch {
    return null;
  }
}

/** A logo or favicon only when that URL is already stored. A website is not a logo. */
export function logoUrlFromStored(factKey: string, valueText: string | null, detailJson: string | null): string | null {
  if (LOGO_FACT_KEYS.has(factKey)) {
    const direct = httpUrl(valueText);
    if (direct) return direct;
  }
  if (!detailJson) return null;
  try {
    const detail = JSON.parse(detailJson) as Record<string, unknown>;
    for (const key of ["logo", "favicon", "logoUrl", "logo_url", "faviconUrl", "favicon_url"]) {
      const value = detail[key];
      if (typeof value !== "string") continue;
      const url = httpUrl(value);
      if (url) return url;
    }
  } catch {
    return null;
  }
  return null;
}

/** Sort key for a stored signal date. Year-only and month-only dates stay behind fuller dates in that period. */
export function signalSortKey(raw: string | null | undefined): string {
  if (!raw) return "";
  const text = raw.trim();
  const full = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (full) return `${full[1]}-${full[2]}-${full[3]}`;
  const month = text.match(/^(\d{4})-(\d{2})/);
  if (month) return `${month[1]}-${month[2]}-00`;
  const year = text.match(/^(\d{4})/);
  if (year) return `${year[1]}-00-00`;
  return "";
}

function oneLine(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const match = flat.match(/^.{24,}?[.!?](?:\s|$)/);
  const sentence = (match ? match[0] : flat).trim();
  if (sentence.length <= 160) return sentence;
  const cut = sentence.slice(0, 160);
  const space = cut.lastIndexOf(" ");
  return space > 60 ? cut.slice(0, space) : cut;
}

function stageLabel(raw: string | null): string | null {
  if (!raw) return null;
  return STAGE_LABEL[raw.trim().toLowerCase()] ?? null;
}


function hqRegionOf(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = raw.trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  if (lower.includes("san francisco") || lower === "sf" || lower.startsWith("sf,")) return "San Francisco";
  if (lower.includes("new york") || lower.includes("nyc") || lower === "ny") return "New York";
  if (lower.includes("los angeles") || lower.includes("l.a.") || lower === "la") return "Los Angeles";
  if (lower.includes("palo alto") || lower.includes("stanford") || lower.includes("menlo park") || lower.includes("mountain view")) return "Bay Area";
  if (lower.includes("boston") || lower.includes("cambridge")) return "Boston";
  if (lower.includes("seattle")) return "Seattle";
  if (lower.includes("austin")) return "Austin";
  if (lower.includes("london")) return "London";
  if (lower.includes("toronto")) return "Toronto";
  // Keep a short stored city when it is already a single token/city.
  const short = text.split(",")[0]?.trim() || text;
  return short.length <= 24 ? short : short.slice(0, 24);
}

let directoryMemo: DirectoryData | null = null;

function readPrecomputedDirectory(): DirectoryData | null {
  if (process.env.CAMPUS_SCOUT_IGNORE_PRECOMPUTE === "1") return null;
  try {
    const file = path.join(process.cwd(), "public", "data", "sample-directory.json");
    if (!fs.existsSync(file)) return null;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as DirectoryData;
    if (!parsed?.cards?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Reads companies, schools, sectors, and signal rows. Prefer build-time JSON on the hot path. */
export function loadDirectory(): DirectoryData {
  if (directoryMemo) return directoryMemo;
  const precomputed = readPrecomputedDirectory();
  if (precomputed) {
    directoryMemo = precomputed;
    return directoryMemo;
  }
  directoryMemo = buildDirectoryFromDb();
  return directoryMemo;
}

/** SQLite build used by precompute-map-cache. */
export function buildDirectoryFromDb(): DirectoryData {
  const db = getDb();
  const companies = db
    .prepare(
      `SELECT id, name, description
         FROM projects
        WHERE kind = 'company' AND is_investable_candidate = 1`,
    )
    .all() as { id: string; name: string; description: string | null }[];

  const signalCount = new Map<string, number>();
  for (const row of db.prepare(`SELECT project_id, COUNT(*) as n FROM signals GROUP BY project_id`).all() as { project_id: string; n: number }[]) {
    signalCount.set(row.project_id, row.n);
  }

  const sectorByProject = new Map<string, string>();
  for (const row of db
    .prepare(`SELECT project_id, tag FROM project_sector_tags ORDER BY is_primary DESC, tag`)
    .all() as { project_id: string; tag: string }[]) {
    if (!sectorByProject.has(row.project_id)) sectorByProject.set(row.project_id, row.tag);
  }

  const stageByProject = new Map<string, string>();
  for (const row of db
    .prepare(`SELECT project_id, detail_json FROM company_facts WHERE fact_key = 'funding_round'`)
    .all() as { project_id: string; detail_json: string | null }[]) {
    if (stageByProject.has(row.project_id)) continue;
    let stage: string | null = null;
    try {
      const detail = JSON.parse(row.detail_json || "{}") as { stage?: unknown };
      if (typeof detail.stage === "string") stage = stageLabel(detail.stage);
    } catch {
      stage = null;
    }
    if (stage) stageByProject.set(row.project_id, stage);
  }

  const signalByProject = new Map<string, DirectoryCard["signalKind"]>();
  for (const row of db
    .prepare(
      `SELECT m.project_id as project_id, a.category as category
         FROM news_mentions m
         JOIN news_articles a ON a.id = m.article_id
        WHERE m.project_id IS NOT NULL
          AND a.category IN ('funding', 'launch', 'award', 'acquisition')
        ORDER BY a.published_at DESC`,
    )
    .all() as { project_id: string; category: DirectoryCard["signalKind"] }[]) {
    if (!row.category || signalByProject.has(row.project_id)) continue;
    signalByProject.set(row.project_id, row.category);
  }

  const schoolByProject = new Map<string, { id: string; name: string; n: number }>();
  for (const row of db
    .prepare(
      `SELECT r.project_id as project_id, u.id as university_id, u.name as name, COUNT(*) as n
         FROM person_project_roles r
         JOIN affiliations a ON a.person_id = r.person_id AND a.university_id IS NOT NULL
         JOIN universities u ON u.id = a.university_id
        GROUP BY r.project_id, u.id`,
    )
    .all() as { project_id: string; university_id: string; name: string; n: number }[]) {
    const prev = schoolByProject.get(row.project_id);
    if (!prev || row.n > prev.n || (row.n === prev.n && row.name.localeCompare(prev.name) < 0)) {
      schoolByProject.set(row.project_id, { id: row.university_id, name: row.name, n: row.n });
    }
  }

  const foundersByProject = new Map<string, string[]>();
  for (const row of db
    .prepare(
      `SELECT r.project_id as project_id, p.name as name
         FROM person_project_roles r
         JOIN people p ON p.id = r.person_id
        WHERE trim(p.name) != ''`,
    )
    .all() as { project_id: string; name: string }[]) {
    const list = foundersByProject.get(row.project_id) ?? [];
    if (!list.includes(row.name)) list.push(row.name);
    foundersByProject.set(row.project_id, list);
  }

  const latestSignal = new Map<string, string>();
  for (const row of db.prepare(`SELECT project_id, source_date, created_at FROM signals`).all() as {
    project_id: string;
    source_date: string | null;
    created_at: string;
  }[]) {
    const key = signalSortKey(row.source_date) || signalSortKey(row.created_at);
    const prev = latestSignal.get(row.project_id);
    if (key && (!prev || key > prev)) latestSignal.set(row.project_id, key);
  }

  const hqByProject = new Map<string, string>();
  for (const row of db
    .prepare(`SELECT project_id, value_text FROM company_facts WHERE fact_key = 'hq'`)
    .all() as { project_id: string; value_text: string | null }[]) {
    if (hqByProject.has(row.project_id)) continue;
    const region = hqRegionOf(row.value_text);
    if (region) hqByProject.set(row.project_id, region);
  }

  const programByProject = new Map<string, string>();
  for (const row of db
    .prepare(`SELECT project_id, value_text FROM company_facts WHERE fact_key = 'investor'`)
    .all() as { project_id: string; value_text: string | null }[]) {
    if (programByProject.has(row.project_id)) continue;
    const name = String(row.value_text ?? "").trim();
    if (name) programByProject.set(row.project_id, name);
  }

  const foundedYearByProject = new Map<string, number>();
  for (const row of db
    .prepare(`SELECT project_id, value_text FROM company_facts WHERE fact_key = 'founded_year'`)
    .all() as { project_id: string; value_text: string | null }[]) {
    if (foundedYearByProject.has(row.project_id)) continue;
    const year = Number(String(row.value_text ?? "").trim());
    if (Number.isFinite(year) && year >= 1990 && year <= 2100) foundedYearByProject.set(row.project_id, year);
  }

  const operatingStatusByProject = new Map<string, "acquired" | "dead">();
  for (const row of db
    .prepare(`SELECT project_id, value_text FROM company_facts WHERE fact_key = 'operating_status'`)
    .all() as { project_id: string; value_text: string | null }[]) {
    const value = String(row.value_text ?? "").trim().toLowerCase();
    if (value === "acquired" || value === "dead") operatingStatusByProject.set(row.project_id, value);
  }

  const logoByProject = new Map<string, string>();
  for (const row of db
    .prepare(
      `SELECT project_id, fact_key, value_text, detail_json
         FROM company_facts
        WHERE fact_key IN ('logo', 'favicon', 'logo_url', 'favicon_url')
           OR detail_json LIKE '%"logo"%'
           OR detail_json LIKE '%"favicon"%'
           OR detail_json LIKE '%"logoUrl"%'
           OR detail_json LIKE '%"faviconUrl"%'
           OR detail_json LIKE '%"logo_url"%'
           OR detail_json LIKE '%"favicon_url"%'`,
    )
    .all() as { project_id: string; fact_key: string; value_text: string; detail_json: string }[]) {
    if (logoByProject.has(row.project_id)) continue;
    const url = logoUrlFromStored(row.fact_key, row.value_text, row.detail_json);
    if (url) logoByProject.set(row.project_id, url);
  }

  const websiteByProject = new Map<string, string>();
  for (const row of db
    .prepare(`SELECT id, website_url FROM projects WHERE website_url IS NOT NULL AND trim(website_url) != ''`)
    .all() as { id: string; website_url: string }[]) {
    websiteByProject.set(row.id, row.website_url);
  }
  // Own-domain primary links only when the host is unique to one project (not a shared listing page).
  const primaryHostCount = new Map<string, number>();
  const primaryByProject = new Map<string, string>();
  for (const row of db
    .prepare(`SELECT id, primary_link FROM projects WHERE primary_link IS NOT NULL AND trim(primary_link) != ''`)
    .all() as { id: string; primary_link: string }[]) {
    const direct = httpUrl(row.primary_link);
    if (!direct) continue;
    try {
      const host = new URL(direct).hostname.replace(/^www\./i, "");
      if (!host) continue;
      primaryHostCount.set(host, (primaryHostCount.get(host) ?? 0) + 1);
      primaryByProject.set(row.id, direct);
    } catch {
      /* ignore */
    }
  }

  const cards: DirectoryCard[] = [];
  for (const company of companies) {
    const school = schoolByProject.get(company.id);
    const short = school ? shortCampusLabel(school.id, school.name) : null;
    const description = company.description && !isBoilerplateDescription(company.description) ? oneLine(company.description) : null;
    let sectorId = sectorByProject.get(company.id) ?? null;
    if (!sectorId && description) {
      const hit = primaryTag(classifyDescription(description, company.name));
      if (hit) sectorId = hit.tag;
    }
    const signalKind = signalByProject.get(company.id) ?? null;
    const storedLogo = logoByProject.get(company.id) ?? null;
    let site = websiteByProject.get(company.id);
    if (!site) {
      const primary = primaryByProject.get(company.id);
      if (primary) {
        try {
          const host = new URL(primary).hostname.replace(/^www\./i, "");
          if ((primaryHostCount.get(host) ?? 0) === 1) site = primary;
        } catch {
          /* ignore */
        }
      }
    }
    const derivedLogo = storedLogo ?? faviconFromWebsiteHost(site);
    cards.push({
      id: company.id,
      name: company.name,
      description,
      school: short,
      schoolId: school?.id ?? null,
      schoolSlug: short ? campusSlug(short) : null,
      sectorId,
      sector: sectorId ? sectorLabel(sectorId) : null,
      stage: stageByProject.get(company.id) ?? null,
      signalKind,
      signalLabel: signalKind ? SIGNAL_LABEL[signalKind] : null,
      signals: signalCount.get(company.id) ?? 0,
      founders: foundersByProject.get(company.id) ?? [],
      latestSignalAt: latestSignal.get(company.id) ?? null,
      logoUrl: derivedLogo,
      foundedYear: foundedYearByProject.get(company.id) ?? null,
      operatingStatus: operatingStatusByProject.get(company.id) ?? null,
      hqRegion: hqByProject.get(company.id) ?? null,
      primaryProgram: programByProject.get(company.id) ?? null,
    });
  }
  cards.sort((a, b) => b.signals - a.signals || a.name.localeCompare(b.name));

  const sectorCounts = new Map<string, number>();
  const kindCounts = new Map<string, number>();
  for (const card of cards) {
    if (card.sectorId) sectorCounts.set(card.sectorId, (sectorCounts.get(card.sectorId) ?? 0) + 1);
    if (card.signalKind) kindCounts.set(card.signalKind, (kindCounts.get(card.signalKind) ?? 0) + 1);
  }
  const sectors = [...sectorCounts.entries()]
    .map(([id, count]) => ({ id, label: sectorLabel(id), count }))
    .filter((item) => item.count >= 10)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 12);
  const kinds = (Object.keys(SIGNAL_LABEL) as DirectoryCard["signalKind"][])
    .filter((id): id is NonNullable<DirectoryCard["signalKind"]> => Boolean(id && kindCounts.get(id)))
    .map((id) => ({ id, label: SIGNAL_LABEL[id], count: kindCounts.get(id) ?? 0 }));

  return { cards, sectors, kinds };
}

export function filterDirectory(cards: DirectoryCard[], sector: string | undefined, kind: string | undefined, campus?: string): DirectoryCard[] {
  return cards.filter((card) => {
    if (sector && card.sectorId !== sector) return false;
    if (kind && card.signalKind !== kind) return false;
    if (campus && card.schoolId !== campus) return false;
    return true;
  });
}

export function searchDirectory(cards: DirectoryCard[], query: string | undefined): DirectoryCard[] {
  const tokens = (query ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return cards;
  return cards.filter((card) => {
    const haystack = [card.name, card.description ?? "", ...card.founders].join("\n").toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });
}

export function sortDirectory(cards: DirectoryCard[], sort: DirectorySort): DirectoryCard[] {
  const copy = [...cards];
  if (sort === "name") {
    copy.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    return copy;
  }
  if (sort === "stage") {
    const rank = (stage: string | null) => {
      if (!stage) return STAGE_ORDER.length + 1;
      const index = STAGE_ORDER.indexOf(stage);
      return index === -1 ? STAGE_ORDER.length : index;
    };
    copy.sort((a, b) => rank(a.stage) - rank(b.stage) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    return copy;
  }
  copy.sort((a, b) => {
    const left = a.latestSignalAt ?? "";
    const right = b.latestSignalAt ?? "";
    if (left !== right) {
      if (!left) return 1;
      if (!right) return -1;
      return right.localeCompare(left);
    }
    return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });
  return copy;
}

export function directoryPage(cards: DirectoryCard[], pages = 1): DirectoryCard[] {
  return cards.slice(0, Math.max(1, pages) * DIRECTORY_LIMIT);
}

export function leaderboardPage(cards: DirectoryCard[], pages = 1): DirectoryCard[] {
  return cards
    .filter((card) => card.signals > 0)
    .sort((a, b) => b.signals - a.signals || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .slice(0, Math.max(1, pages) * LEADERBOARD_LIMIT);
}

export const DIRECTORY_PAGE_SIZE = DIRECTORY_LIMIT;
export const LEADERBOARD_PAGE_SIZE = LEADERBOARD_LIMIT;
