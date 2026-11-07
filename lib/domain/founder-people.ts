import type { FounderTableRow } from "./founder-table";

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
