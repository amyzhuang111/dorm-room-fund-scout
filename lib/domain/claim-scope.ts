export interface PersonScopeInput {
  name?: string | null;
  year?: number | null;
  /** Class-year review status, when a review row exists. */
  classYearSupport?: string | null;
  status?: string | null;
  basis?: string | null;
  evidence?: string | null;
  sourceUrl?: string | null;
  leftSchool?: boolean | null;
  roleClaimState?: string | null;
  roleClaimUrl?: string | null;
  roleClaimExcerpt?: string | null;
}

export interface PersonScope {
  classYear: number | null;
  classYearText: string;
  departure: boolean;
  present: "unknown" | "current_student" | "graduated";
  presentText: string;
  roleState: "no_claim" | "unverified" | "recorded";
  roleText: string;
  /** A date written in the evidence. A date parsed from a URL path is not used. */
  sourceAsOf: string | null;
  claimDateNote: string | null;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function sentences(text: string): string[] {
  const parts = text.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);
  return parts.length ? parts : [text.trim()].filter(Boolean);
}

function namesPerson(sentence: string, name: string | null | undefined): boolean {
  const cleaned = name?.replace(/[.*+?^${}()|[\]\\]/g, "").trim();
  if (!cleaned) return false;
  const parts = cleaned.split(/\s+/).filter((part) => part.length > 1);
  const low = sentence.toLowerCase();
  if (parts.length < 2) return low.includes(cleaned.toLowerCase());
  return low.includes(parts[0].toLowerCase()) && low.includes(parts[parts.length - 1].toLowerCase());
}

function negated(sentence: string): boolean {
  return /\b(not|no|never|without|n't)\b/i.test(sentence);
}

/** A sentence that states this person's own current enrollment. Tokens, alumni cohorts, and group labels do not qualify. */
function statesOwnEnrollment(sentence: string): boolean {
  if (negated(sentence)) return false;
  if (/current_student|listed as student founder|alumni entrepreneur|cohort of alumni/i.test(sentence)) return false;
  return /(?:is|was) (?:currently )?pursuing (?:his|her|their|a) (?:master'?s|bachelor'?s|ph\.?d|degree)/i.test(sentence)
    || /\b(?:is|was) enrolled\b/i.test(sentence)
    || /\bis a current student\b/i.test(sentence)
    || /\bcurrently enrolled\b/i.test(sentence)
    || /\bis an? (?:freshman|sophomore|junior|senior)\b/i.test(sentence);
}

function statesOwnDegree(sentence: string): boolean {
  if (negated(sentence)) return false;
  if (/degree completion is not established|not proof of degree/i.test(sentence)) return false;
  return /\bcompleted (?:his|her|their|a|the) degree\b/i.test(sentence) || /\bgraduated\b/i.test(sentence);
}

function ownSentences(evidence: string, name: string | null | undefined): string[] {
  return sentences(evidence).filter((sentence) => namesPerson(sentence, name));
}

/** A date written in the evidence text. URL paths are not publication dates. */
export function evidenceDate(text: string | null | undefined): string | null {
  if (!text) return null;
  const month = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+(\d{1,2}),?\s+(20\d{2})\b/i);
  if (month) {
    const key = month[1].slice(0, 3).toLowerCase();
    const value = MONTHS[key];
    if (!value) return null;
    return `${month[3]}-${String(value).padStart(2, "0")}-${month[2].padStart(2, "0")}`;
  }
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}

export function claimDateNote(excerpt: string | null | undefined, url: string | null | undefined): string | null {
  if (!excerpt || !url) return null;
  const later = excerpt.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(20\d{2})\b/i);
  const path = url.match(/\/(20\d{2})\/(\d{1,2})\/(\d{1,2})\//);
  if (!later || !path) return null;
  const month = MONTHS[later[1].slice(0, 3).toLowerCase()];
  const excerptStamp = `${later[2]}-${String(month).padStart(2, "0")}`;
  const pathStamp = `${path[1]}-${path[2].padStart(2, "0")}`;
  if (excerptStamp <= pathStamp) return null;
  return `The stored excerpt mentions ${later[0]}. The source URL path contains ${path[1]}/${path[2]}/${path[3]}. That path is not a verified publication date.`;
}

function classYearText(year: number | null, support: string | null | undefined): string {
  if (year == null) return "Class year not on record";
  if (support === "source_unavailable") return `Stored class year ${year}. The cited source could not be retrieved, so the year is not verified.`;
  if (support === "verified") return `Class of ${year}`;
  if (support) return `Stored class year ${year}. The year review is ${support.replace(/_/g, " ")}.`;
  return `Stored class year ${year}.`;
}

/** Separate class year, departure, graduation, present enrollment, and the person-role claim. */
export function readPersonScope(input: PersonScopeInput): PersonScope {
  const evidence = input.evidence?.trim() || "";
  const year = input.year ?? null;
  const departure = Boolean(input.leftSchool);
  const named = ownSentences(evidence, input.name);
  const enrolled = named.some(statesOwnEnrollment);
  const graduated = named.some(statesOwnDegree);
  const sourceAsOf = evidenceDate(evidence);
  const dateNote = claimDateNote(input.roleClaimExcerpt, input.roleClaimUrl);
  const roleState = !input.roleClaimUrl && !input.roleClaimState ? "no_claim" : input.roleClaimState === "unverified" || !input.roleClaimState ? "unverified" : "recorded";
  const roleText =
    roleState === "no_claim"
      ? "Stored person-role. No source claim is attached to this role."
      : roleState === "unverified"
        ? "Stored person-role. The attached claim is unverified."
        : "Stored person-role has a source claim. That claim does not verify every other field.";

  let present: PersonScope["present"] = "unknown";
  const supported = input.basis === "verified";
  if (graduated && !departure && supported) present = "graduated";
  else if (enrolled && !departure && supported && !/alumni entrepreneur|cohort of alumni/i.test(evidence)) present = "current_student";

  const reasons: string[] = [];
  if (present === "unknown") {
    if (input.basis === "inferred" || /no class year is stated/i.test(evidence)) {
      reasons.push("The stored status was inferred from dated activity, not from a class year or a graduation record.");
    }
    if (departure) reasons.push("Left school is on record. A class year is not a completed degree.");
    if (/degree completion is not established|not proof of degree/i.test(evidence)) {
      reasons.push("The class-year source says degree completion is not established.");
    }
    if (/alumni entrepreneur|cohort of alumni/i.test(evidence)) {
      reasons.push("The stored evidence describes an alumni cohort. That is not a statement of present enrollment.");
    }
    if (!reasons.length && (input.status === "current_student" || input.status === "recent_grad")) {
      reasons.push("The stored status is not backed by a statement that this person is enrolled or completed a degree.");
    }
  }

  const presentText =
    present === "graduated"
      ? "The stored evidence states that this person completed a degree. That statement is as of the source, not a new check."
      : present === "current_student"
        ? `The stored evidence states that this person was pursuing a degree or enrolled${sourceAsOf ? ` as of ${sourceAsOf}` : " as of the source"}. That is not a separate check of enrollment today.`
        : `Present enrollment is unknown. ${reasons.join(" ")}`.trim();

  return {
    classYear: year,
    classYearText: classYearText(year, input.classYearSupport),
    departure,
    present,
    presentText,
    roleState,
    roleText,
    sourceAsOf,
    claimDateNote: dateNote,
  };
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
