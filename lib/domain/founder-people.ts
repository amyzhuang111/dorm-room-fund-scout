import type { FounderTableRow } from "./founder-table";

export function founderYearFacts(row: Pick<FounderTableRow, "year" | "enrollmentEvidence" | "enrollmentStatus" | "leftSchool">): {
  label: string;
  value: string | null;
  note: string | null;
} {
  const evidence = row.enrollmentEvidence?.trim() || null;
  const classYear = row.year != null && (evidence == null || /class|['’]\d{2}\b|tandon/i.test(evidence) || evidence.length > 0);
  const notes: string[] = [];
  if (row.leftSchool) notes.push("Left school is on record");
  if (row.enrollmentStatus) notes.push(`Enrollment status stored as ${row.enrollmentStatus.replace(/_/g, " ")}`);
  if (evidence) notes.push(evidence);
  return {
    label: classYear && row.year != null ? "Class year" : "Year on record",
    value: row.year != null ? String(row.year) : null,
    note: notes.length ? notes.join(". ") : null,
  };
}

export interface FounderPeopleQuery {
  text?: string;
  campus?: string | null;
}

/** Named people only. Campus matches a stored campus id. Text matches stored name, campus, company, or signal. */
export function filterFounderPeople(rows: FounderTableRow[], query: FounderPeopleQuery = {}): FounderTableRow[] {
  const campus = query.campus?.trim() || "";
  const words = (query.text ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter((row) => {
    if (campus && row.campusId !== campus && !row.campusIds.includes(campus)) return false;
    if (!words.length) return true;
    const hay = [row.name, row.campus ?? "", row.company ?? "", row.signal ?? "", row.signalType ?? "", row.year != null ? String(row.year) : ""]
      .join("\n")
      .toLowerCase();
    return words.every((word) => hay.includes(word));
  });
}
