// Same-school co-founders: two or more founders of one startup attended the
// same campus in overlapping years. A class year stands in for a four-year
// window when start and end dates are missing. Unknown years do not overlap.

export const SAME_SCHOOL_FOUNDER_POINTS = 4;
export const SAME_SCHOOL_STARTUP_POINTS = 2;
export const SAME_SCHOOL_BADGE = "Same school";
export const SAME_SCHOOL_TITLE = "Two or more co-founders attended the same campus in overlapping years.";

const DEGREE_YEARS = 4;

export interface Attendance {
  personId: string;
  universityId: string;
  gradYear: number | null;
  startYear: number | null;
  endYear: number | null;
}

export interface CofounderAttendance extends Attendance {
  projectId: string;
}

export interface YearSpan {
  start: number;
  end: number;
}

export function yearInText(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const match = raw.match(/\b(19|20)\d{2}\b/);
  if (!match) return null;
  const year = Number(match[0]);
  if (year < 1970 || year > 2040) return null;
  return year;
}

export function attendanceSpan(row: Attendance): YearSpan | null {
  const start = row.startYear;
  const end = row.endYear ?? row.gradYear;
  if (start != null && end != null) {
    return { start: Math.min(start, end), end: Math.max(start, end) };
  }
  if (row.gradYear != null) return { start: row.gradYear - (DEGREE_YEARS - 1), end: row.gradYear };
  if (start != null) return { start, end: start + (DEGREE_YEARS - 1) };
  if (row.endYear != null) return { start: row.endYear - (DEGREE_YEARS - 1), end: row.endYear };
  return null;
}

export function spansOverlap(a: YearSpan, b: YearSpan): boolean {
  return a.start <= b.end && b.start <= a.end;
}

export interface SameSchoolHit {
  projectId: string;
  universityId: string;
  personIds: string[];
}

export function sameSchoolCofounderHits(rows: readonly CofounderAttendance[]): SameSchoolHit[] {
  const groups = new Map<string, CofounderAttendance[]>();
  for (const row of rows) {
    if (!row.projectId || !row.personId || !row.universityId) continue;
    const key = `${row.projectId}\t${row.universityId}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  const hits: SameSchoolHit[] = [];
  for (const [key, list] of groups) {
    const byPerson = new Map<string, YearSpan[]>();
    for (const row of list) {
      const span = attendanceSpan(row);
      if (!span) continue;
      const spans = byPerson.get(row.personId) ?? [];
      spans.push(span);
      byPerson.set(row.personId, spans);
    }
    const people = [...byPerson.entries()];
    if (people.length < 2) continue;
    const overlapped = new Set<string>();
    for (let i = 0; i < people.length; i++) {
      for (let j = i + 1; j < people.length; j++) {
        const overlaps = people[i][1].some((left) => people[j][1].some((right) => spansOverlap(left, right)));
        if (!overlaps) continue;
        overlapped.add(people[i][0]);
        overlapped.add(people[j][0]);
      }
    }
    if (overlapped.size < 2) continue;
    const [projectId, universityId] = key.split("\t");
    hits.push({ projectId, universityId, personIds: [...overlapped].sort() });
  }
  hits.sort((a, b) => a.projectId.localeCompare(b.projectId) || a.universityId.localeCompare(b.universityId));
  return hits;
}

export function scoreBonus(score: number | null, points: number, eligible: boolean): { score: number | null; applied: number } {
  if (!eligible || score == null) return { score, applied: 0 };
  const next = Math.min(100, Math.round((score + points) * 10) / 10);
  const applied = Math.round((next - score) * 10) / 10;
  return { score: next, applied };
}
