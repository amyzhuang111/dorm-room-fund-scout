import { getDb } from "../db/client";

/** A campus program with at least three stored people on the relationship. */
export type HomeProgram = {
  id: string;
  name: string;
  people: number;
};

/**
 * Programs people actually joined. Project-to-project edges are left out so a
 * company is not counted as a member. Fewer than three people is omitted.
 */
export function loadHomePrograms(limit = 6): HomeProgram[] {
  const cap = Math.max(1, Math.min(8, limit));
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT p.id as id, p.name as name, COUNT(DISTINCT r.source_entity_id) as people
         FROM relationships r
         JOIN projects p ON p.id = r.target_entity_id
        WHERE r.relationship_type IN ('participated_in_program', 'part_of_program')
          AND r.source_entity_type = 'person'
          AND p.name IS NOT NULL
          AND trim(p.name) != ''
        GROUP BY p.id
       HAVING people >= 3
        ORDER BY people DESC, p.name COLLATE NOCASE ASC
        LIMIT ?`,
    )
    .all(cap) as { id: string; name: string; people: number }[];
  return rows.map((row) => ({
    id: row.id,
    name: row.name.replace(/\s+/g, " ").trim(),
    people: row.people,
  }));
}
