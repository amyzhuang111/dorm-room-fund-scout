export interface PersonScopeInput {
  name?: string | null;
  year?: number | null;
  status?: string | null;
  basis?: string | null;
  evidence?: string | null;
  sourceUrl?: string | null;
  leftSchool?: boolean | null;
  roleClaimState?: string | null;
  roleClaimUrl?: string | null;
  roleClaimExcerpt?: string | null;
  affiliationSaysCurrentStudent?: boolean | null;
  affiliationSourceUrl?: string | null;
}

export interface PersonScope {
  classYear: number | null;
  classYearText: string | null;
  departure: boolean;
  present: "unknown" | "current_student" | "graduated";
  presentText: string;
  roleState: "no_claim" | "unverified" | "recorded";
  roleText: string;
  sourceAsOf: string | null;
  claimDateNote: string | null;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

export function sourceDate(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/\/(20\d{2})\/(\d{1,2})\/(\d{1,2})\//);
  if (!match) return null;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

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

function explicitGraduation(evidence: string): boolean {
  return /\bgraduated\b|\bcompleted (?:a |their |the )?degree\b|\breceived (?:a |their |the )?(?:ba|bs|degree)\b/i.test(evidence);
}

function classYearOnly(evidence: string, year: number | null): boolean {
  if (year == null && !/class of|class year|'\d{2}\b/i.test(evidence)) return false;
  return !explicitGraduation(evidence);
}

/** Separate class year, departure, graduation, present enrollment, and the person-role claim. */
export function readPersonScope(input: PersonScopeInput): PersonScope {
  const evidence = input.evidence?.trim() || "";
  const year = input.year ?? null;
  const departure = Boolean(input.leftSchool);
  const sourceAsOf = sourceDate(input.affiliationSourceUrl) || sourceDate(input.sourceUrl);
  const classYearText = year != null ? `Class of ${year}` : null;
  const dateNote = claimDateNote(input.roleClaimExcerpt, input.roleClaimUrl);
  const roleState = !input.roleClaimUrl && !input.roleClaimState ? "no_claim" : input.roleClaimState === "unverified" || !input.roleClaimState ? "unverified" : "recorded";
  const roleText =
    roleState === "no_claim"
      ? "Stored person-role. No source claim is attached to this role."
      : roleState === "unverified"
        ? "Stored person-role. The attached claim is unverified."
        : "Stored person-role has a source claim. That claim does not verify every other field.";

  const reasons: string[] = [];
  let present: PersonScope["present"] = "unknown";
  if (explicitGraduation(evidence) && !departure && input.basis === "verified") {
    present = "graduated";
  } else if (
    input.status === "current_student" &&
    input.basis === "verified" &&
    sourceAsOf?.startsWith("2026") &&
    !departure &&
    !/not established|not proof of degree|no class year is stated/i.test(evidence)
  ) {
    present = "current_student";
  } else {
    if (input.basis === "inferred" || /no class year is stated/i.test(evidence)) {
      reasons.push("The stored status was inferred from dated activity, not from a class year or a graduation record.");
    }
    if (departure) reasons.push("Left school is on record. A class year is not a completed degree.");
    if (/degree completion is not established|not proof of degree/i.test(evidence)) {
      reasons.push("The class-year source says degree completion is not established.");
    }
    if (input.affiliationSaysCurrentStudent) {
      reasons.push(sourceAsOf ? `A source dated ${sourceAsOf} says current student. That date is not a 2026 enrollment check.` : "A stored affiliation says current student, without a source date that checks 2026.");
    } else if (classYearOnly(evidence, year) && (input.status === "recent_grad" || input.status === "current_student" || input.status === "older_alumni")) {
      reasons.push("A class year is not present enrollment and is not a graduation record.");
    }
    if (!reasons.length && (input.status === "current_student" || input.status === "recent_grad")) {
      reasons.push(sourceAsOf ? `The stored ${input.status.replace(/_/g, " ")} label is not a separate graduation or 2026 enrollment record. Source date ${sourceAsOf}.` : `The stored ${input.status.replace(/_/g, " ")} label is not a graduation record.`);
    }
  }

  const presentText =
    present === "graduated"
      ? "A source states a completed degree. That is not inferred from the class year alone."
      : present === "current_student"
        ? `A 2026 source lists current student${sourceAsOf ? ` (${sourceAsOf})` : ""}.`
        : `Present enrollment is unknown. ${reasons.join(" ")}`.trim();

  return { classYear: year, classYearText, departure, present, presentText, roleState, roleText, sourceAsOf, claimDateNote: dateNote };
}

export function eligibilityLines(people: PersonScopeInput[]): string[] {
  const lines: string[] = [];
  for (const person of people) {
    const scope = readPersonScope(person);
    const who = person.name?.trim() || "A founder";
    if (scope.present === "unknown") lines.push(`${who}: ${scope.presentText}`);
    if (scope.roleState !== "recorded") lines.push(`${who}: ${scope.roleText}`);
    if (scope.claimDateNote) lines.push(`${who}: ${scope.claimDateNote}`);
  }
  return lines;
}
