/** Count destinations and wording. No database imports, so client code can use this file. */

export const COUNTED_HREFS = {
  eligibleCompanies: "/data?membership=eligible-companies",
  eligibleCompanyPeople: "/data/people?membership=eligible-company-roles",
  fullIndex: "/founders",
  pins: "/campuses?pins=1",
  storedFounderCampuses: "/campuses?membership=stored-founder",
  promotedFounderCampuses: "/campuses?membership=promoted-founders",
} as const;

export function programPeopleHref(programId: string): string {
  return `/data/people?program=${encodeURIComponent(programId)}`;
}

export function sectorPeopleHref(tag: string): string {
  return `/data/people?membership=eligible-company-roles&sector=${encodeURIComponent(tag)}`;
}

export function programNameSearchHref(name: string): string {
  return `/data?q=${encodeURIComponent(name)}`;
}

/** Lead company under a campus. The campus list's own number is a different count. */
export const LEAD_COMPANY_RANKING =
  "The company under a campus is the eligible company filed to that campus with the most stored signal rows, then the earlier company name. Stored signal rows are a count of signal records, not distinct articles, a rolling week, source quality, or traction.";

export type EligibilityExamples = {
  company: {
    id: string;
    name: string;
    verificationStatus: string;
    verifiedAt: string | null;
    note: string | null;
  } | null;
  classYear: {
    id: string;
    name: string;
    year: number;
    enrollmentStatus: string;
  } | null;
  unknown: {
    id: string;
    name: string;
    company: string;
    verificationStatus: string;
  } | null;
};

function clip(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= 180) return clean;
  const cut = clean.slice(0, 180);
  const space = cut.lastIndexOf(" ");
  return `${space > 80 ? cut.slice(0, space) : cut}...`;
}

/** Sentences use only the fields passed in. They do not upgrade a source into confirmation. */
export function eligibilitySentences(examples: EligibilityExamples): string[] {
  const lines: string[] = [];
  if (examples.company) {
    const when = examples.company.verifiedAt ? `, dated ${examples.company.verifiedAt}` : "";
    const note = examples.company.note ? ` Stored note: ${clip(examples.company.note)}` : "";
    lines.push(
      `${examples.company.name} is stored as eligible. Its stored verification status is ${examples.company.verificationStatus || "blank"}${when}.${note} That stored note does not confirm every field or current enrollment.`,
    );
  }
  if (examples.classYear) {
    const status = examples.classYear.enrollmentStatus || "blank";
    lines.push(
      `${examples.classYear.name} has stored class year ${examples.classYear.year} and enrollment status ${status}. A class year is not current enrollment.`,
    );
  }
  if (examples.unknown) {
    lines.push(
      `${examples.unknown.name} is on ${examples.unknown.company} with stored profile verification ${examples.unknown.verificationStatus || "blank"}, and the person row has no class year and no enrollment status.`,
    );
  }
  return lines;
}
