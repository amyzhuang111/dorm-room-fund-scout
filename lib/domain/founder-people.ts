import type { FounderAffiliationFact, FounderTableRow } from "./founder-table";

export interface PresentEnrollment {
  state: "unknown";
  summary: string;
}

function sourceDate(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/\/(20\d{2})\/(\d{1,2})\/(\d{1,2})\//);
  if (!match) return null;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

/** Present enrollment is unknown unless a source states it. A class year, a departure, or an inferred window is not that statement. */
export function presentEnrollment(row: Pick<FounderTableRow, "year" | "enrollmentStatus" | "enrollmentBasis" | "enrollmentEvidence" | "enrollmentSourceUrl" | "leftSchool" | "affiliations">): PresentEnrollment {
  const evidence = row.enrollmentEvidence?.trim() || "";
  const reasons: string[] = [];
  if (row.enrollmentBasis === "inferred" || /no class year is stated/i.test(evidence)) {
    reasons.push("The stored status was inferred from dated activity, not from a class year or a graduation record.");
  }
  if (row.leftSchool) reasons.push("Left school is on record. A class year is not a completed degree.");
  if (/degree completion is not established|not proof of degree/i.test(evidence)) {
    reasons.push("The class-year source says degree completion is not established.");
  }
  const studentSource = row.affiliations.find((item) => /current student|current_student/i.test(`${item.role ?? ""} ${item.status ?? ""}`));
  if (studentSource) {
    const asOf = sourceDate(studentSource.sourceUrl);
    reasons.push(asOf ? `A source dated ${asOf} says current student. That date is not a 2026 enrollment check.` : "A stored affiliation says current student, without a source date that checks 2026.");
  }
  if (!reasons.length && (row.enrollmentStatus === "current_student" || row.enrollmentStatus === "recent_grad")) {
    const dated = sourceDate(row.enrollmentSourceUrl);
    reasons.push(dated ? `The stored ${row.enrollmentStatus.replace(/_/g, " ")} label is not a separate graduation or 2026 enrollment record. Source date ${dated}.` : `The stored ${row.enrollmentStatus.replace(/_/g, " ")} label is not a graduation record.`);
  }
  return { state: "unknown", summary: `Present enrollment is unknown. ${reasons.join(" ")}`.trim() };
}

export function companyIdentityNote(row: Pick<FounderTableRow, "company" | "companyClaimState" | "companyClaimUrl">): string | null {
  if (!row.company) return null;
  if (!row.companyClaimUrl && !row.companyClaimState) return "Stored founder role. No source claim is attached to this role.";
  if (row.companyClaimState === "unverified") return "Stored role. The attached claim is unverified.";
  return null;
}

export function affiliationIsEvent(item: Pick<FounderAffiliationFact, "role" | "excerpt">): boolean {
  return /hack|devpost|team member|prize|gallery/i.test(`${item.role ?? ""} ${item.excerpt ?? ""}`);
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** A stored excerpt that names a later month than the source URL is not that URL's statement. */
export function claimDateNote(excerpt: string | null | undefined, url: string | null | undefined): string | null {
  const published = sourceDate(url);
  if (!excerpt || !published) return null;
  const later = excerpt.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(20\d{2})\b/i);
  if (!later) return null;
  const month = MONTHS[later[1].slice(0, 3).toLowerCase()];
  const stamp = `${later[2]}-${String(month).padStart(2, "0")}`;
  if (stamp <= published.slice(0, 7)) return null;
  return `The stored excerpt mentions ${later[0]}. The source URL is dated ${published}. Those are not the same statement.`;
}

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
