import { getDb } from "../db/client";
import { campusSlug, shortCampusLabel } from "./campuses";
import { listFounders, listUniversities, type UniversitySummary } from "./queries";
import { relativeTime } from "./relative-time";

export { relativeTime };

export interface WeekItem {
  id: string;
  campus: string;
  campusSlug: string | null;
  type: string;
  event: string;
  at: string | null;
  url: string | null;
  /** Set only when the stored source or category is YC, GitHub, or funding. */
  tag: "YC" | "GitHub" | "Funding" | null;
}

export interface HeroStats {
  founders: number;
  campuses: number;
  tracked: number;
  monitored: number;
  signalsWeek: number;
  updatedAt: string | null;
  /** Newest stored signal or news time. The home feed uses this when the week is empty. */
  lastSignalAt: string | null;
  fresh: boolean;
  week: WeekItem[];
  recentCampusIds: string[];
  universities: (UniversitySummary & { slug: string })[];
}

export function latestDataTimestamp(): string | null {
  return latestTimestamp();
}

function latestTimestamp(): string | null {
  const db = getDb();
  const stamps: string[] = [];
  for (const sql of [
    `SELECT MAX(created_at) as t FROM signals`,
    `SELECT MAX(source_date) as t FROM signals`,
    `SELECT MAX(published_at) as t FROM news_articles`,
    `SELECT MAX(fetched_at) as t FROM news_articles`,
  ]) {
    try {
      const row = db.prepare(sql).get() as { t?: string | null } | undefined;
      if (row?.t) stamps.push(row.t);
    } catch {
      // A dataset without that table still has the other clocks.
    }
  }
  stamps.sort();
  return stamps.at(-1) ?? null;
}

interface FeedRow {
  id: string;
  at: string | null;
  type: string | null;
  event: string | null;
  campus: string | null;
  campus_id: string | null;
  url: string | null;
  source_name: string | null;
  source_type: string | null;
}

function signalTag(sourceName: string | null, category: string | null, sourceType: string | null): WeekItem["tag"] {
  const source = (sourceName ?? "").toLowerCase();
  const kind = `${category ?? ""} ${sourceType ?? ""}`.toLowerCase();
  if (source.includes("y combinator") || source === "yc") return "YC";
  if (source.includes("github")) return "GitHub";
  if (kind.includes("funding")) return "Funding";
  return null;
}

function weekFeed(db: ReturnType<typeof getDb>): { items: WeekItem[]; articleCount: number; campusIds: string[] } {
  let rows: FeedRow[] = [];
  try {
    rows = db.prepare(
      `SELECT a.id as id,
              a.published_at as at,
              a.category as type,
              a.url as url,
              a.source_name as source_name,
              a.source_type as source_type,
              COALESCE(p.name, a.headline) as event,
              u.id as campus_id,
              u.name as campus
         FROM news_articles a
         JOIN news_mentions m ON m.article_id = a.id
         LEFT JOIN projects p ON p.id = m.project_id
         JOIN affiliations af ON af.person_id = COALESCE(
           m.person_id,
           (SELECT ppr.person_id FROM person_project_roles ppr WHERE ppr.project_id = m.project_id LIMIT 1)
         )
         JOIN universities u ON u.id = af.university_id
        WHERE a.published_at >= datetime('now', '-7 days')
        ORDER BY a.published_at DESC`,
    ).all() as FeedRow[];
  } catch {
    rows = [];
  }
  const seenArticles = new Set<string>();
  const seenCampuses = new Set<string>();
  const items: WeekItem[] = [];
  const campusIds: string[] = [];
  for (const row of rows) {
    if (!seenArticles.has(row.id)) seenArticles.add(row.id);
    if (!row.campus_id || seenCampuses.has(row.campus_id)) continue;
    seenCampuses.add(row.campus_id);
    campusIds.push(row.campus_id);
    if (items.length >= 5) continue;
    const label = shortCampusLabel(row.campus_id, row.campus ?? row.campus_id);
    items.push({
      id: row.id,
      campus: label,
      campusSlug: campusSlug(label),
      type: row.type ?? "news",
      event: row.event ?? row.type ?? "News",
      at: row.at,
      url: row.url,
      tag: signalTag(row.source_name, row.type, row.source_type),
    });
  }
  return { items, articleCount: seenArticles.size, campusIds: campusIds.slice(0, 8) };
}

export function loadHeroStats(): HeroStats {
  const db = getDb();
  const universities = listUniversities().map((university) => ({
    ...university,
    slug: campusSlug(shortCampusLabel(university.id, university.name)),
  }));
  // Same promoted-founder list the /founders table renders. Summing per-campus
  // counts double-counts people who belong to more than one school.
  const people = listFounders();
  const founders = people.length;
  const campusIds = new Set<string>();
  const companyIds = new Set<string>();
  for (const person of people) {
    if (person.universityId) campusIds.add(person.universityId);
    for (const campus of person.campuses) {
      if (campus.universityId) campusIds.add(campus.universityId);
    }
    if (person.linkedCompany?.id) companyIds.add(person.linkedCompany.id);
    for (const project of person.projects) {
      if (project.kind === "company") companyIds.add(project.id);
    }
  }
  const campuses = campusIds.size;
  const tracked = companyIds.size;
  const monitored = universities.filter((university) => university.sourcesConfigured > 0).length;

  const feed = weekFeed(db);
  let signalRowsThisWeek = 0;
  try {
    const row = db.prepare(`SELECT COUNT(*) as c FROM signals WHERE created_at >= datetime('now', '-7 days')`).get() as { c: number };
    signalRowsThisWeek = row.c;
  } catch {
    signalRowsThisWeek = 0;
  }
  const signalsWeek = feed.articleCount + signalRowsThisWeek;
  const updatedAt = latestTimestamp();
  const fresh = feed.items.length > 0;

  return {
    founders,
    campuses,
    tracked,
    monitored,
    signalsWeek,
    updatedAt,
    lastSignalAt: feed.items[0]?.at ?? updatedAt,
    fresh,
    week: feed.items,
    recentCampusIds: feed.campusIds,
    universities,
  };
}

