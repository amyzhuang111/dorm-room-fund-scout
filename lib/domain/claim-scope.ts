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
  /** A date written in the enrollment statement. A review stamp and a URL path are not this date. */
  sourceAsOf: string | null;
  /** A Checked or Reviewed stamp in the evidence. It does not prove enrollment on that day. */
  reviewDate: string | null;
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

function isReviewStamp(before: string): boolean {
  return /\b(checked|reviewed|retrieved|review)\b/i.test(before);
}

/** Dates written in the evidence. A stamp after Checked or Reviewed is a review date, not publication. */
export function evidenceDates(text: string | null | undefined): { asserted: string | null; review: string | null } {
  if (!text) return { asserted: null, review: null };
  let asserted: string | null = null;
  let review: string | null = null;
  const take = (index: number, stamp: string) => {
    const before = text.slice(Math.max(0, index - 48), index);
    if (isReviewStamp(before)) review ??= stamp;
    else asserted ??= stamp;
  };
  for (const match of text.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) {
    take(match.index ?? 0, `${match[1]}-${match[2]}-${match[3]}`);
  }
  for (const match of text.matchAll(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+(\d{1,2}),?\s+(20\d{2})\b/gi)) {
    const value = MONTHS[match[1].slice(0, 3).toLowerCase()];
    if (!value) continue;
    take(match.index ?? 0, `${match[3]}-${String(value).padStart(2, "0")}-${match[2].padStart(2, "0")}`);
  }
  return { asserted, review };
}

export function evidenceDate(text: string | null | undefined): string | null {
  return evidenceDates(text).asserted;
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
  const dates = evidenceDates(evidence);
  const sourceAsOf = dates.asserted;
  const reviewDate = dates.review;
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
        ? `The stored evidence states that this person was pursuing a degree or enrolled${sourceAsOf ? ` as of ${sourceAsOf}` : " as of the source"}. ${sourceAsOf ? "That date is written in the evidence." : "No publication date is written in that evidence."} This is not a separate check of enrollment today.`
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
    reviewDate,
    claimDateNote: dateNote,
  };
}

/** Visible enrollment line shared by the header, the lower badge, the list, and the tooltip. */
export function enrollmentPhrase(scope: PersonScope): string {
  if (scope.present === "graduated") return "Degree stated by the source";
  if (scope.present === "current_student") {
    return scope.sourceAsOf ? `Enrolled as of ${scope.sourceAsOf} in the source` : "Enrolled as stated in the source. No publication date is written in that evidence.";
  }
  return "Present enrollment unknown";
}

/** A stored affiliation label is not a quotation of the source page. */
export function storedAffiliationLine(role: string | null | undefined, status: string | null | undefined): string {
  const roleText = role?.replace(/_/g, " ") ?? "";
  const statusText = status?.replace(/_/g, " ") ?? "";
  if (/current student/i.test(`${roleText} ${statusText}`)) {
    return `Stored affiliation label: ${statusText || roleText}. That label is not a quotation of the source page.`;
  }
  return [roleText, statusText].filter(Boolean).join(" · ");
}

/** A stored gate that says evidence is missing must not hide a supported enrollment statement that simply has no date. */
export function displayedGateLine(raw: string, people: PersonScopeInput[]): string {
  if (!/no dated affiliation evidence|campus affiliation still has no date/i.test(raw)) return raw;
  const supported = people
    .map((person) => ({ name: person.name?.trim() || "A founder", scope: readPersonScope(person) }))
    .filter((person) => person.scope.present !== "unknown");
  if (!supported.length) return raw;
  return supported
    .map((person) =>
      person.scope.sourceAsOf
        ? `${person.name}: enrollment is stated in the source as of ${person.scope.sourceAsOf}.`
        : `${person.name}: enrollment is stated in the source. No publication date is written in that evidence.`
    )
    .join(" ");
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
