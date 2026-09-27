// Read news rows for the News page, homepage strip, and detail blocks.

import { getDb } from "../db/client";
import type { MatchConfidence, NewsCampus, NewsCategory, NewsListItem, NewsParty, NewsSourceType } from "./news-types";
import { isNewsCategory, isNewsSourceType, newsDayKey } from "./news-types";

export interface NewsFilters {
  campusId?: string;
  tier?: string;
  category?: NewsCategory;
  sourceType?: NewsSourceType;
  from?: string;
  to?: string;
  search?: string;
  projectId?: string;
  personId?: string;
  /** Founder page: stories that name this person or one of these companies. */
  personOrProjects?: { personId: string; projectIds: string[] };
  limit?: number;
}

interface MentionRow {
  id: string;
  headline: string;
  url: string;
  source_name: string;
  published_at: string | null;
  snippet: string | null;
  category: string;
  match_confidence: MatchConfidence;
  feed: string;
  source_type: string;
  project_id: string;
  person_id: string;
  project_name: string | null;
  project_tier: string | null;
  person_name: string | null;
  person_tier: string | null;
}

function aggregate(rows: MentionRow[], campusesFor: (projectId: string, personId: string) => NewsCampus[]): NewsListItem[] {
  const byId = new Map<string, NewsListItem>();
  for (const row of rows) {
    let item = byId.get(row.id);
    if (!item) {
      item = {
        id: row.id,
        headline: row.headline,
        url: row.url,
        sourceName: row.source_name,
        publishedAt: row.published_at,
        snippet: row.snippet,
        category: isNewsCategory(row.category) ? row.category : "other",
        confidence: row.match_confidence,
        feed: row.feed,
        sourceType: isNewsSourceType(row.source_type) ? row.source_type : "press",
        startups: [],
        founders: [],
        campuses: [],
      };
      byId.set(row.id, item);
    }
    if (row.project_id && row.project_name && !item.startups.some((startup) => startup.id === row.project_id)) {
      item.startups.push({ id: row.project_id, name: row.project_name, tier: row.project_tier });
    }
    if (row.person_id && row.person_name && !item.founders.some((founder) => founder.id === row.person_id)) {
      item.founders.push({ id: row.person_id, name: row.person_name, tier: row.person_tier });
    }
  }
  for (const item of byId.values()) {
    const seen = new Set<string>();
    const campuses: NewsCampus[] = [];
    for (const startup of item.startups) {
      for (const campus of campusesFor(startup.id, "")) {
        if (seen.has(campus.id)) continue;
        seen.add(campus.id);
        campuses.push(campus);
      }
    }
    for (const founder of item.founders) {
      for (const campus of campusesFor("", founder.id)) {
        if (seen.has(campus.id)) continue;
        seen.add(campus.id);
        campuses.push(campus);
      }
    }
    item.campuses = campuses;
    item.startups.sort((a, b) => a.name.localeCompare(b.name));
    item.founders.sort((a, b) => a.name.localeCompare(b.name));
    item.campuses.sort((a, b) => a.name.localeCompare(b.name));
  }
  return [...byId.values()];
}

function partyHasTier(parties: NewsParty[], tier: string): boolean {
  return parties.some((party) => party.tier === tier);
}

export function listNews(filters: NewsFilters = {}): NewsListItem[] {
  const db = getDb();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'news_articles'").get();
  if (!tables) return [];
  const rows = db
    .prepare(
      `SELECT a.id, a.headline, a.url, a.source_name, a.published_at, a.snippet, a.category, a.match_confidence, a.feed, a.source_type,
              m.project_id, m.person_id,
              p.name AS project_name, p.signal_tier AS project_tier,
              pe.name AS person_name, pe.signal_tier AS person_tier
       FROM news_articles a
       JOIN news_mentions m ON m.article_id = a.id
       LEFT JOIN projects p ON p.id = m.project_id
       LEFT JOIN people pe ON pe.id = m.person_id`
    )
    .all() as MentionRow[];
  if (rows.length === 0) return [];

  const projectIds = [...new Set(rows.map((row) => row.project_id).filter(Boolean))];
  const personIds = [...new Set(rows.map((row) => row.person_id).filter(Boolean))];
  const byProject = new Map<string, NewsCampus[]>();
  const byPerson = new Map<string, NewsCampus[]>();
  if (projectIds.length) {
    const placeholders = projectIds.map(() => "?").join(",");
    const campusRows = db
      .prepare(
        `SELECT DISTINCT r.project_id AS owner_id, u.id AS university_id, u.name AS university_name
         FROM person_project_roles r
         JOIN affiliations a ON a.person_id = r.person_id
         JOIN universities u ON u.id = a.university_id
         WHERE r.project_id IN (${placeholders})`
      )
      .all(...projectIds) as { owner_id: string; university_id: string; university_name: string }[];
    for (const row of campusRows) {
      const list = byProject.get(row.owner_id) ?? [];
      if (!list.some((campus) => campus.id === row.university_id)) list.push({ id: row.university_id, name: row.university_name });
      byProject.set(row.owner_id, list);
    }
  }
  if (personIds.length) {
    const placeholders = personIds.map(() => "?").join(",");
    const campusRows = db
      .prepare(
        `SELECT DISTINCT a.person_id AS owner_id, u.id AS university_id, u.name AS university_name
         FROM affiliations a
         JOIN universities u ON u.id = a.university_id
         WHERE a.person_id IN (${placeholders})`
      )
      .all(...personIds) as { owner_id: string; university_id: string; university_name: string }[];
    for (const row of campusRows) {
      const list = byPerson.get(row.owner_id) ?? [];
      if (!list.some((campus) => campus.id === row.university_id)) list.push({ id: row.university_id, name: row.university_name });
      byPerson.set(row.owner_id, list);
    }
  }

  let items = aggregate(rows, (projectId, personId) => {
    if (projectId) return byProject.get(projectId) ?? [];
    if (personId) return byPerson.get(personId) ?? [];
    return [];
  });

  if (filters.projectId) items = items.filter((item) => item.startups.some((startup) => startup.id === filters.projectId));
  if (filters.personId) items = items.filter((item) => item.founders.some((founder) => founder.id === filters.personId));
  if (filters.personOrProjects) {
    const { personId, projectIds } = filters.personOrProjects;
    const projects = new Set(projectIds);
    items = items.filter(
      (item) => item.founders.some((founder) => founder.id === personId) || item.startups.some((startup) => projects.has(startup.id))
    );
  }
  if (filters.campusId) items = items.filter((item) => item.campuses.some((campus) => campus.id === filters.campusId));
  if (filters.tier) {
    const tier = filters.tier;
    items = items.filter((item) => partyHasTier(item.startups, tier) || partyHasTier(item.founders, tier));
  }
  if (filters.category) items = items.filter((item) => item.category === filters.category);
  if (filters.sourceType) items = items.filter((item) => item.sourceType === filters.sourceType);
  if (filters.from) items = items.filter((item) => newsDayKey(item.publishedAt) >= filters.from!);
  if (filters.to) items = items.filter((item) => newsDayKey(item.publishedAt) && newsDayKey(item.publishedAt) <= filters.to!);
  if (filters.search) {
    const q = filters.search.toLowerCase();
    items = items.filter((item) => {
      const hay = [item.headline, item.snippet, item.sourceName, ...item.startups.map((startup) => startup.name), ...item.founders.map((founder) => founder.name)]
        .filter(Boolean)
        .join("\n")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  items.sort((a, b) => {
    const aKey = a.publishedAt ?? "";
    const bKey = b.publishedAt ?? "";
    if (aKey === bKey) return a.headline.localeCompare(b.headline);
    if (!aKey) return 1;
    if (!bKey) return -1;
    return aKey < bKey ? 1 : -1;
  });
  return items.slice(0, filters.limit ?? 400);
}

export function newsForProject(projectId: string): NewsListItem[] {
  return listNews({ projectId, limit: 5 });
}

export function newsForPerson(personId: string): NewsListItem[] {
  const db = getDb();
  const projectIds = (
    db
      .prepare(
        `SELECT project_id FROM person_project_roles
         WHERE person_id = ? AND lower(COALESCE(role, '')) LIKE '%founder%'`
      )
      .all(personId) as { project_id: string }[]
  ).map((row) => row.project_id);
  return listNews({ personOrProjects: { personId, projectIds }, limit: 5 });
}
