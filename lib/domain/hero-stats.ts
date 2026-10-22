import { getDb } from "../db/client";
import { campusSlug, shortCampusLabel } from "./campuses";
import { listFounders, listUniversities, type UniversitySummary } from "./queries";
import { relativeTime } from "./relative-time";
import { SIGNALS_THIS_WEEK_LABEL } from "./signal-copy";

export { relativeTime, SIGNALS_THIS_WEEK_LABEL };

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
  /** Stored article category, such as funding or launch. Empty when the row has none. */
  category: string;
  /** Stored snippet. Null when the article has no snippet. */
  detail: string | null;
  /** True when this article's stored publish time is inside the last 7 days. */
  thisWeek: boolean;
}

export interface CampusSignalBrief {
  current: number;
  previous: number;
  latest: string | null;
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
  universities: (UniversitySummary & { slug: string; signalWeek: number; signalPrev: number; latestSignal: string | null })[];
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
  snippet: string | null;
}

function signalTag(sourceName: string | null, category: string | null, sourceType: string | null): WeekItem["tag"] {
  const source = (sourceName ?? "").toLowerCase();
  const kind = `${category ?? ""} ${sourceType ?? ""}`.toLowerCase();
  if (source.includes("y combinator") || source === "yc") return "YC";
  if (source.includes("github")) return "GitHub";
  if (kind.includes("funding")) return "Funding";
  return null;
}

const ARTICLE_FROM = `FROM news_articles a
         JOIN news_mentions m ON m.article_id = a.id
         LEFT JOIN projects p ON p.id = m.project_id
         JOIN affiliations af ON af.person_id = COALESCE(
           m.person_id,
           (SELECT ppr.person_id FROM person_project_roles ppr WHERE ppr.project_id = m.project_id LIMIT 1)
         )
         JOIN universities u ON u.id = af.university_id`;

const ARTICLE_SQL = `SELECT a.id as id,
              a.published_at as at,
              a.category as type,
              a.url as url,
              a.source_name as source_name,
              a.source_type as source_type,
              a.snippet as snippet,
              COALESCE(p.name, a.headline) as event,
              u.id as campus_id,
              u.name as campus
         ${ARTICLE_FROM}`;

export function signalsThisWeek(universityId?: string): number {
  try {
    const row = getDb()
      .prepare(
        `SELECT COUNT(DISTINCT a.id) as c ${ARTICLE_FROM}
          WHERE a.published_at >= datetime('now', '-7 days')${universityId ? " AND u.id = ?" : ""}`,
      )
      .get(...(universityId ? [universityId] : [])) as { c: number };
    return row.c;
  } catch {
    return 0;
  }
}

export function signalWeeksByCampus(): Map<string, CampusSignalBrief> {
  const briefs = new Map<string, CampusSignalBrief>();
  try {
    const db = getDb();
    const counts = db
      .prepare(
        `SELECT u.id as id,
                COUNT(DISTINCT CASE WHEN a.published_at >= datetime('now', '-7 days') THEN a.id END) as current,
                COUNT(DISTINCT CASE WHEN a.published_at < datetime('now', '-7 days') AND a.published_at >= datetime('now', '-14 days') THEN a.id END) as previous
           ${ARTICLE_FROM}
          WHERE a.published_at >= datetime('now', '-14 days')
          GROUP BY u.id`,
      )
      .all() as { id: string; current: number; previous: number }[];
    for (const row of counts) briefs.set(row.id, { current: row.current, previous: row.previous, latest: null });
    const latest = db
      .prepare(
        `SELECT u.id as id, COALESCE(p.name, a.headline) as event
           ${ARTICLE_FROM}
          WHERE a.published_at IS NOT NULL
          ORDER BY a.published_at DESC`,
      )
      .all() as { id: string; event: string | null }[];
    const seen = new Set<string>();
    for (const row of latest) {
      if (!row.id || seen.has(row.id) || !row.event) continue;
      seen.add(row.id);
      const brief = briefs.get(row.id) ?? { current: 0, previous: 0, latest: null };
      brief.latest = row.event;
      briefs.set(row.id, brief);
    }
  } catch {
    return briefs;
  }
  return briefs;
}

function articleRows(db: ReturnType<typeof getDb>, weekOnly: boolean): FeedRow[] {
  try {
    const where = weekOnly ? `WHERE a.published_at >= datetime('now', '-7 days')` : `WHERE a.published_at IS NOT NULL`;
    return db.prepare(`${ARTICLE_SQL} ${where} ORDER BY a.published_at DESC`).all() as FeedRow[];
  } catch {
    return [];
  }
}

function toWeekItem(row: FeedRow): WeekItem {
  const label = shortCampusLabel(row.campus_id ?? "", row.campus ?? row.campus_id ?? "");
  return {
    id: row.id,
    campus: label,
    campusSlug: campusSlug(label),
    type: row.type ?? "news",
    event: row.event ?? "",
    at: row.at,
    url: row.url,
    tag: signalTag(row.source_name, row.type, row.source_type),
    category: row.type ?? "",
    detail: row.snippet?.trim() || null,
    thisWeek: false,
  };
}

function weekFeed(db: ReturnType<typeof getDb>): { items: WeekItem[]; articleCount: number; campusIds: string[] } {
  const weekRows = articleRows(db, true);
  const latestRows = articleRows(db, false);
  const weekArticles = new Set<string>();
  const campusIds: string[] = [];
  const seenCampuses = new Set<string>();
  for (const row of weekRows) {
    weekArticles.add(row.id);
    if (!row.campus_id || seenCampuses.has(row.campus_id)) continue;
    seenCampuses.add(row.campus_id);
    campusIds.push(row.campus_id);
  }
  const items: WeekItem[] = [];
  const seenArticles = new Set<string>();
  for (const row of latestRows) {
    if (seenArticles.has(row.id) || !row.campus_id) continue;
    seenArticles.add(row.id);
    items.push({ ...toWeekItem(row), thisWeek: weekArticles.has(row.id) });
    if (items.length >= 8) break;
  }
  return { items, articleCount: weekArticles.size, campusIds: campusIds.slice(0, 8) };
}

export function loadHeroStats(): HeroStats {
  const db = getDb();
  const briefs = signalWeeksByCampus();
  const universities = listUniversities().map((university) => {
    const brief = briefs.get(university.id);
    return {
      ...university,
      slug: campusSlug(shortCampusLabel(university.id, university.name)),
      signalWeek: brief?.current ?? 0,
      signalPrev: brief?.previous ?? 0,
      latestSignal: brief?.latest ?? null,
    };
  });
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
  const signalsWeek = signalsThisWeek();
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

