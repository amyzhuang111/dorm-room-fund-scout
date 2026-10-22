import { getDb } from "../db/client";
import { campusSlug, shortCampusLabel } from "./campuses";
import { isBoilerplateDescription, sectorLabel } from "./sectors";

export interface DirectoryCard {
  id: string;
  name: string;
  description: string | null;
  school: string | null;
  schoolSlug: string | null;
  sectorId: string | null;
  sector: string | null;
  stage: string | null;
  /** News category already stored for this company. Never a made-up tag. */
  signalLabel: "Funding" | "Launch" | "Award" | "Acquisition" | null;
  signalKind: "funding" | "launch" | "award" | "acquisition" | null;
  /** Rows in `signals` for this company. */
  signals: number;
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

const DIRECTORY_LIMIT = 30;
const LEADERBOARD_LIMIT = 20;

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

export function loadDirectory(): DirectoryData {
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

  const cards: DirectoryCard[] = [];
  for (const company of companies) {
    const school = schoolByProject.get(company.id);
    if (!school) continue;
    const short = shortCampusLabel(school.id, school.name);
    const description = company.description && !isBoilerplateDescription(company.description) ? oneLine(company.description) : null;
    const sectorId = sectorByProject.get(company.id) ?? null;
    const signalKind = signalByProject.get(company.id) ?? null;
    cards.push({
      id: company.id,
      name: company.name,
      description,
      school: short,
      schoolSlug: campusSlug(short),
      sectorId,
      sector: sectorId ? sectorLabel(sectorId) : null,
      stage: stageByProject.get(company.id) ?? null,
      signalKind,
      signalLabel: signalKind ? SIGNAL_LABEL[signalKind] : null,
      signals: signalCount.get(company.id) ?? 0,
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

export function filterDirectory(cards: DirectoryCard[], sector: string | undefined, kind: string | undefined): DirectoryCard[] {
  return cards.filter((card) => {
    if (sector && card.sectorId !== sector) return false;
    if (kind && card.signalKind !== kind) return false;
    return true;
  });
}

export function directoryPage(cards: DirectoryCard[]): DirectoryCard[] {
  return cards.slice(0, DIRECTORY_LIMIT);
}

export function leaderboardPage(cards: DirectoryCard[]): DirectoryCard[] {
  return cards.filter((card) => card.signals > 0).slice(0, LEADERBOARD_LIMIT);
}

export const DIRECTORY_PAGE_SIZE = DIRECTORY_LIMIT;
export const LEADERBOARD_PAGE_SIZE = LEADERBOARD_LIMIT;
