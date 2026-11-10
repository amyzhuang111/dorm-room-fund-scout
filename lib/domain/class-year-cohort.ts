/**
 * Campus class-year bars count a stored year. They do not read present
 * enrollment, a degree, a departure, a role, or company verification.
 */

export const RECENT_CLASS_YEAR_START = 2026;
export const RECENT_CLASS_YEAR_END = 2029;
export const EARLIER_CLASS_YEAR_START = 2016;
export const EARLIER_CLASS_YEAR_END = 2025;

export type ClassYearBand = "recent_class_years" | "earlier_class_years";

export interface ClassYearPerson {
  id: string;
  year: number | null;
}

export interface ClassYearCount {
  year: number;
  count: number;
}

export interface ClassYearBar {
  label: string;
  count: number;
}

function range(start: number, end: number): number[] {
  const years: number[] = [];
  for (let year = start; year <= end; year += 1) years.push(year);
  return years;
}

/** One stored class year per person. A null year is omitted. A repeated id keeps the first year. */
export function countClassYears(rows: ClassYearPerson[]): ClassYearCount[] {
  const seen = new Set<string>();
  const counts = new Map<number, number>();
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    if (row.year == null || !Number.isFinite(row.year)) continue;
    counts.set(row.year, (counts.get(row.year) ?? 0) + 1);
  }
  return [...counts.entries()].map(([year, count]) => ({ year, count })).sort((a, b) => a.year - b.year);
}

/** Recent band is 2026 to 2029, including years with a zero count. Earlier band is through 2025. */
export function classYearBars(counts: ClassYearCount[], band: ClassYearBand): ClassYearBar[] {
  const byYear = new Map(counts.map((item) => [item.year, item.count]));
  if (band === "recent_class_years") {
    return range(RECENT_CLASS_YEAR_START, RECENT_CLASS_YEAR_END).map((year) => ({
      label: String(year),
      count: byYear.get(year) ?? 0,
    }));
  }
  const earlier = counts.filter((item) => item.year < EARLIER_CLASS_YEAR_START).reduce((sum, item) => sum + item.count, 0);
  const bars = range(EARLIER_CLASS_YEAR_START, EARLIER_CLASS_YEAR_END).map((year) => ({
    label: String(year),
    count: byYear.get(year) ?? 0,
  }));
  return earlier > 0 ? [{ label: "2015 and earlier", count: earlier }, ...bars] : bars;
}

export function classYearBandTotal(bars: ClassYearBar[]): number {
  return bars.reduce((sum, bar) => sum + bar.count, 0);
}

export function classYearBandCaption(band: ClassYearBand, shown: number, foundersOnFile: number): string {
  const shownText = shown.toLocaleString("en-US");
  const totalText = foundersOnFile.toLocaleString("en-US");
  if (band === "recent_class_years") {
    return `Class years 2026 to 2029 on file. ${shownText} of ${totalText} founders. A class year is not present enrollment.`;
  }
  return `Class years through 2025 on file. ${shownText} of ${totalText} founders. A class year is not a graduation record.`;
}
