import { getDb } from "../db/client";
import { campusSlug, shortCampusLabel } from "./campuses";
import { listUniversities, type UniversitySummary } from "./queries";
import { relativeTime } from "./relative-time";

export { relativeTime };

export interface WeekItem {
  id: string;
  campus: string;
  campusSlug: string | null;
  type: string;
  at: string | null;
}

export interface HeroStats {
  founders: number;
  campuses: number;
  tracked: number;
  monitored: number;
  signalsWeek: number;
  updatedAt: string | null;
  week: WeekItem[];
  recentCampusIds: string[];
  universities: (UniversitySummary & { slug: string })[];
}

function latestTimestamp(): string | null {
  const db = getDb();
  const stamps: string[] = [];
  for (const sql of [
    `SELECT MAX(created_at) as t FROM signals`,
    `SELECT MAX(published_at) as t FROM news_mentions`,
    `SELECT MAX(created_at) as t FROM news_mentions`,
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

export function loadHeroStats(): HeroStats {
  const db = getDb();
  const universities = listUniversities().map((university) => ({
    ...university,
    slug: campusSlug(shortCampusLabel(university.id, university.name)),
  }));
  const founders = universities.reduce((sum, university) => sum + university.founderCount, 0);
  const campuses = universities.filter((university) => university.founderCount > 0).length;
  const tracked = universities.reduce((sum, university) => sum + university.companyCount, 0);
  const monitored = universities.filter((university) => university.sourcesConfigured > 0).length;

  let signalsWeek = 0;
  try {
    const row = db.prepare(`SELECT COUNT(*) as c FROM signals WHERE created_at >= datetime('now', '-7 days')`).get() as { c: number };
    signalsWeek = row.c;
  } catch {
    signalsWeek = 0;
  }

  let week: WeekItem[] = [];
  try {
    week = (
      db.prepare(
        `SELECT s.id, s.signal_type as type, s.created_at as at,
                (SELECT u.name FROM affiliations a
                   JOIN universities u ON u.id = a.university_id
                   JOIN person_project_roles ppr ON ppr.person_id = a.person_id
                  WHERE ppr.project_id = s.project_id LIMIT 1) as campus,
                (SELECT u.id FROM affiliations a
                   JOIN universities u ON u.id = a.university_id
                   JOIN person_project_roles ppr ON ppr.person_id = a.person_id
                  WHERE ppr.project_id = s.project_id LIMIT 1) as campus_id
           FROM signals s
          ORDER BY s.created_at DESC
          LIMIT 5`
      ).all() as { id: string; type: string; at: string | null; campus: string | null; campus_id: string | null }[]
    ).map((row) => ({
      id: row.id,
      campus: row.campus ?? "Campus not on record",
      campusSlug: row.campus_id ? campusSlug(shortCampusLabel(row.campus_id, row.campus ?? row.campus_id)) : null,
      type: row.type,
      at: row.at,
    }));
  } catch {
    week = [];
  }

  let recentCampusIds: string[] = [];
  try {
    recentCampusIds = (
      db.prepare(
        `SELECT a.university_id as id, COUNT(DISTINCT s.id) as c
           FROM signals s
           JOIN person_project_roles ppr ON ppr.project_id = s.project_id
           JOIN affiliations a ON a.person_id = ppr.person_id
          WHERE s.created_at >= datetime('now', '-7 days') AND a.university_id IS NOT NULL
          GROUP BY a.university_id
          ORDER BY c DESC
          LIMIT 8`
      ).all() as { id: string }[]
    ).map((row) => row.id);
  } catch {
    recentCampusIds = [];
  }

  return {
    founders,
    campuses,
    tracked,
    monitored,
    signalsWeek,
    updatedAt: latestTimestamp(),
    week,
    recentCampusIds,
    universities,
  };
}

