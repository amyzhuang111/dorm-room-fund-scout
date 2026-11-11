import type { ProjectTableRow } from './founder-table';

/** Preserve the same founder set when the grouped table replaces its first page. */
export function founderProjectRows(rows: ProjectTableRow[], allowedIds?: readonly string[]): ProjectTableRow[] {
  if (!allowedIds) return rows;
  const allowed = new Set(allowedIds);
  return rows.map(row => ({ ...row, people: row.people.filter(person => allowed.has(person.id)) })).filter(row => row.people.length > 0);
}

export function campusFounderProjectRows(rows: ProjectTableRow[], campus: string): ProjectTableRow[] {
  if (!campus) return rows;
  return rows.map(row => ({ ...row, people: row.people.filter(person => (person.campusIds ?? row.campusIds).includes(campus)) })).filter(row => row.people.length > 0);
}
