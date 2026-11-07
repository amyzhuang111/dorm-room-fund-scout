import { claimDateNote, readPersonScope } from "./claim-scope";
import type { FounderAffiliationFact, FounderTableRow } from "./founder-table";

export { claimDateNote };

export interface PresentEnrollment {
  state: "unknown" | "current_student" | "graduated";
  summary: string;
}

/** Present enrollment is unknown unless a source states it. A class year, a departure, or an inferred window is not that statement. */
export function presentEnrollment(row: Pick<FounderTableRow, "year" | "enrollmentStatus" | "enrollmentBasis" | "enrollmentEvidence" | "enrollmentSourceUrl" | "leftSchool" | "affiliations" | "companyClaimState" | "companyClaimUrl" | "companyClaimExcerpt">): PresentEnrollment {
  const studentSource = row.affiliations.find((item) => /current student|current_student/i.test(`${item.role ?? ""} ${item.status ?? ""}`));
  const scope = readPersonScope({
    year: row.year,
    status: row.enrollmentStatus,
    basis: row.enrollmentBasis,
    evidence: row.enrollmentEvidence,
    sourceUrl: row.enrollmentSourceUrl,
    leftSchool: row.leftSchool,
    affiliationSaysCurrentStudent: Boolean(studentSource),
    affiliationSourceUrl: studentSource?.sourceUrl ?? null,
    roleClaimState: row.companyClaimState,
    roleClaimUrl: row.companyClaimUrl,
    roleClaimExcerpt: row.companyClaimExcerpt,
  });
  return { state: scope.present, summary: scope.presentText };
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
