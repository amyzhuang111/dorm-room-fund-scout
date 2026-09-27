// Fills an enrollment bucket when decideEnrollment found no class year.
// A stated year or a stated class standing is verified. A cohort, founding
// year, or roster year used as a stand-in is inferred. Every person gets one
// of current_student, recent_grad (graduated 2023–2026), or older_alumni.

import { ENROLLMENT_AS_OF_YEAR, type EnrollmentStatus } from "./founder-status";

export type EnrollmentBasis = "verified" | "inferred";

export interface InferSnippet {
  excerpt: string;
  sourceUrl: string | null;
  sourceId: string | null;
}

export interface InferInput {
  personName: string;
  snippets: InferSnippet[];
  affiliationRoles: string[];
  foundedYears: number[];
  hasCampusAffiliation: boolean;
}

export interface InferResult {
  status: Exclude<EnrollmentStatus, "unknown">;
  basis: EnrollmentBasis;
  label: string | null;
  gradYear: number | null;
  reason: string;
  sourceUrl: string | null;
  sourceId: string | null;
  leftSchool: boolean;
}

const RECENT_MIN = ENROLLMENT_AS_OF_YEAR - 3;

function fullYear(raw: number): number | null {
  const year = raw < 100 ? 2000 + raw : raw;
  if (year < 1990 || year > 2032) return null;
  return year;
}

function bucketForYear(year: number): Exclude<EnrollmentStatus, "unknown"> {
  if (year > ENROLLMENT_AS_OF_YEAR) return "current_student";
  if (year >= RECENT_MIN && year <= ENROLLMENT_AS_OF_YEAR) return "recent_grad";
  return "older_alumni";
}

function labelFromYear(year: number): string {
  return `'${String(year).slice(2)}`;
}

function norm(text: string): string {
  return text.replace(/[’‘ʼ]/g, "'").replace(/\s+/g, " ").trim();
}

function leftSchoolText(text: string): boolean {
  return /\b(dropouts?|dropped out|took leave|on leave|left school|left college)\b/i.test(text) ||
    /\bleft (penn|stanford|harvard|mit|berkeley|georgetown|ucla|yale|columbia|princeton|cmu|waterloo|uchicago|unc|duke)\b/i.test(text);
}

function nameClassYear(name: string): number | null {
  const text = norm(name);
  const match = text.match(/(?:^|\s)(?:[A-Za-z]{1,5}\s*)?'(\d{2})\b/);
  if (!match) return null;
  return fullYear(parseInt(match[1], 10));
}

function standingHit(text: string): string | null {
  if (leftSchoolText(text) || /\b(former|formerly|alumni|alumnus|alumna)\b/i.test(text)) return null;
  const schoolStanding =
    /\b(penn|wharton|stanford|harvard|mit|berkeley|columbia|princeton|yale|duke|unc|georgetown|ucla)\s+(junior|senior|sophomore|freshman)s?\b/i;
  const standing = text.match(schoolStanding);
  if (standing) return standing[0];
  if (/\b(undergraduate|undergrad|phd|ph\.d\.|master'?s|doctoral)\s+students?\b/i.test(text)) {
    const m = text.match(/\b(?:undergraduate|undergrad|phd|ph\.d\.|master'?s|doctoral)\s+students?\b/i);
    return m ? m[0] : "student";
  }
  if (/\b(physics|computer science|cs|engineering)\s+students\b/i.test(text)) {
    const m = text.match(/\b(?:physics|computer science|cs|engineering)\s+students\b/i);
    return m ? m[0] : "students";
  }
  if (/\bcurrent student\b/i.test(text) || /\bcurrently (?:a|an) student\b/i.test(text)) return "current student";
  return null;
}

interface YearHit {
  year: number;
  kind: "cohort" | "founded" | "batch" | "roster";
  excerpt: string;
  sourceUrl: string | null;
  sourceId: string | null;
}

function pushYear(hits: YearHit[], year: number | null, kind: YearHit["kind"], snippet: InferSnippet, excerpt: string) {
  if (year == null) return;
  hits.push({ year, kind, excerpt, sourceUrl: snippet.sourceUrl, sourceId: snippet.sourceId });
}

function activityYears(snippets: InferSnippet[], foundedYears: number[]): YearHit[] {
  const hits: YearHit[] = [];
  for (const year of foundedYears) {
    if (year >= 1990 && year <= ENROLLMENT_AS_OF_YEAR) {
      hits.push({
        year,
        kind: "founded",
        excerpt: `Founded in ${year}`,
        sourceUrl: null,
        sourceId: null,
      });
    }
  }
  for (const snippet of snippets) {
    const text = norm(snippet.excerpt);
    for (const match of text.matchAll(/\b((?:19|20)\d{2})\s+cohort\b/gi)) {
      pushYear(hits, fullYear(parseInt(match[1], 10)), "cohort", snippet, match[0]);
    }
    for (const match of text.matchAll(/\bcohort\s+((?:19|20)\d{2})\b/gi)) {
      pushYear(hits, fullYear(parseInt(match[1], 10)), "cohort", snippet, match[0]);
    }
    for (const match of text.matchAll(/\bfounded(?:\s+in|:)?\s+((?:19|20)\d{2})\b/gi)) {
      pushYear(hits, fullYear(parseInt(match[1], 10)), "founded", snippet, match[0]);
    }
    for (const match of text.matchAll(/\bYC\s*([WSXF])\s*'?(\d{2})\b/gi)) {
      pushYear(hits, fullYear(parseInt(match[2], 10)), "batch", snippet, match[0]);
    }
    for (const match of text.matchAll(/\b((?:spring|summer|fall|winter)\s+)((?:20)\d{2})\b/gi)) {
      const window = text.slice(Math.max(0, (match.index ?? 0) - 40), (match.index ?? 0) + match[0].length + 40);
      if (/\b(yc|y combinator|speedrun|delta v|cohort|batch|fellow|hackathon|session)\b/i.test(window)) {
        pushYear(hits, fullYear(parseInt(match[2], 10)), "batch", snippet, match[0]);
      }
    }
    for (const match of text.matchAll(/\b(treehacks|cal hacks|hackmit|pennapps|hack the north|mhacks|hackgt|la hacks)\b[^.]{0,48}((?:20)\d{2})/gi)) {
      pushYear(hits, fullYear(parseInt(match[2], 10)), "roster", snippet, match[0]);
    }
    // Affiliation roles are short labels such as "BE senior design 2022".
    if (text.length < 80) {
      const labeled = text.match(/\b(20\d{2})\b/);
      if (labeled && /\b(design|hackathon|pennapps|cohort|class|fellow|member|contributor)\b/i.test(text)) {
        pushYear(hits, fullYear(parseInt(labeled[1], 10)), "roster", snippet, text);
      }
    }
    if (snippet.sourceUrl) {
      const urlYear = snippet.sourceUrl.match(/\/(20\d{2})(?:[/-]|$)/);
      if (urlYear && /\b(hack|devpost|fellow|cohort|delta|pennapps|treehacks)\b/i.test(snippet.sourceUrl)) {
        pushYear(hits, fullYear(parseInt(urlYear[1], 10)), "roster", snippet, snippet.sourceUrl);
      }
    }
  }
  return hits;
}

function fromHit(
  status: Exclude<EnrollmentStatus, "unknown">,
  basis: EnrollmentBasis,
  reason: string,
  hit: { excerpt: string; sourceUrl: string | null; sourceId: string | null } | null,
  gradYear: number | null,
  leftSchool: boolean,
  label: string | null
): InferResult {
  return {
    status,
    basis,
    label,
    gradYear,
    reason,
    sourceUrl: hit?.sourceUrl ?? null,
    sourceId: hit?.sourceId ?? null,
    leftSchool,
  };
}

function officerRole(roles: string[]): string | null {
  for (const role of roles) {
    if (/\b(managing director|board director)\b/i.test(role)) continue;
    if (/\b(organizer|organiser|co-director|director|president|officer)\b/i.test(role)) return role;
  }
  return null;
}

export function inferEnrollment(input: InferInput): InferResult {
  const snippets = input.snippets.filter((s) => s.excerpt && s.excerpt.trim());
  const blob = snippets.map((s) => s.excerpt).join("\n");
  const left = leftSchoolText(blob) || leftSchoolText(input.personName);
  const namedYear = nameClassYear(input.personName);
  if (namedYear != null) {
    const status = bucketForYear(namedYear);
    return fromHit(
      status,
      "verified",
      `Class year ${labelFromYear(namedYear)} is part of the recorded name.`,
      snippets[0] ?? null,
      namedYear,
      left,
      labelFromYear(namedYear)
    );
  }

  for (const snippet of snippets) {
    const standing = standingHit(norm(snippet.excerpt));
    if (standing) {
      return fromHit(
        "current_student",
        "verified",
        `The source calls them ${standing}.`,
        snippet,
        null,
        false,
        null
      );
    }
  }

  const roleSnippets: InferSnippet[] = input.affiliationRoles.filter(Boolean).map((role) => ({ excerpt: role, sourceUrl: null, sourceId: null }));
  const years = activityYears([...snippets, ...roleSnippets], input.foundedYears);
  const oldestFounded = years.filter((h) => h.kind === "founded").sort((a, b) => a.year - b.year)[0];
  if (oldestFounded && oldestFounded.year <= 2022) {
    return fromHit(
      "older_alumni",
      "inferred",
      `A company tied to this person was founded in ${oldestFounded.year}, before the 2023 recent-grad window.`,
      oldestFounded,
      oldestFounded.year,
      left,
      labelFromYear(oldestFounded.year)
    );
  }

  const cohorts = years.filter((h) => h.kind === "cohort").sort((a, b) => b.year - a.year);
  if (cohorts[0]) {
    const year = cohorts[0].year;
    const status = year >= 2025 ? "current_student" : bucketForYear(year);
    const why =
      year >= 2025
        ? `Named in the ${year} cohort of a student program that admits current students.`
        : year >= RECENT_MIN
          ? `Named in the ${year} cohort. By ${ENROLLMENT_AS_OF_YEAR} that class sits in the recent-grad window.`
          : `Named in the ${year} cohort, before the 2023 recent-grad window.`;
    return fromHit(status, "inferred", why, cohorts[0], null, left, null);
  }

  if (left) {
    const newest = [...years].sort((a, b) => b.year - a.year)[0];
    const year = newest?.year ?? null;
    if (year != null && year <= 2022) {
      return fromHit(
        "older_alumni",
        "inferred",
        `The record says they left school, and the newest dated evidence is ${year}.`,
        newest,
        null,
        true,
        null
      );
    }
    return fromHit(
      "recent_grad",
      "inferred",
      year
        ? `The record says they left school. The newest dated evidence is ${year}, inside 2023–${ENROLLMENT_AS_OF_YEAR}.`
        : "The record says they left school, and no graduation year before 2023 is stated.",
      newest ?? snippets[0] ?? null,
      null,
      true,
      null
    );
  }

  const officer = officerRole(input.affiliationRoles);
  if (officer) {
    const old = years.find((h) => h.year <= 2022);
    if (!old) {
      return fromHit(
        "current_student",
        "inferred",
        `Campus role “${officer}” reads as a current student officer, and no older graduation year is stated.`,
        snippets[0] ?? null,
        null,
        false,
        null
      );
    }
  }

  const newest = [...years].sort((a, b) => b.year - a.year)[0];
  if (newest) {
    const completedDegree = /\b(ba|bs|mba|ph\.?d|alum(?:ni|nus|na)?|graduated|degree in|dual degree)\b/i.test(blob);
    const priorRole = /\b(previously|prev\b|former|lecturer|professor|faculty|worked at)\b/i.test(blob);
    const stillEnrolled = /\b(student|undergrad|sophomore|freshman|junior|senior year)\b/i.test(blob) && !priorRole && !completedDegree;
    if (newest.year >= 2025 && stillEnrolled && input.hasCampusAffiliation) {
      return fromHit(
        "current_student",
        "inferred",
        `Newest dated evidence is ${newest.year} (${newest.excerpt}) and the text still describes them as a student.`,
        newest,
        null,
        false,
        null
      );
    }
    if (completedDegree && priorRole && !stillEnrolled) {
      return fromHit(
        "older_alumni",
        "inferred",
        `The text names a completed degree and an earlier role, and it does not give a class year in 2023 or later.`,
        newest,
        null,
        false,
        null
      );
    }
    if (newest.year >= RECENT_MIN) {
      return fromHit(
        "recent_grad",
        "inferred",
        `No class year is stated. The newest dated evidence is ${newest.year} (${newest.excerpt}), inside the 2023–${ENROLLMENT_AS_OF_YEAR} window.`,
        newest,
        null,
        false,
        null
      );
    }
    return fromHit(
      "older_alumni",
      "inferred",
      `No class year is stated. The newest dated evidence is ${newest.year}, before 2023.`,
      newest,
      null,
      false,
      labelFromYear(newest.year)
    );
  }

  const roster = input.affiliationRoles.find((role) => /team member|contributor|hackathon|pennapps|senior design|devpost/i.test(role));
  if (input.hasCampusAffiliation || roster) {
    return fromHit(
      "recent_grad",
      "inferred",
      roster
        ? `Listed as “${roster}”. That roster does not state a class year, so this is estimated in the 2023–${ENROLLMENT_AS_OF_YEAR} window rather than recorded as a current student.`
        : "Affiliated to a campus in Scout, and no graduation year, cohort, or founding year is stated, so this is estimated in the recent-grad window.",
      snippets[0] ?? null,
      null,
      false,
      null
    );
  }

  return fromHit(
    "recent_grad",
    "inferred",
    "No class year, cohort, campus affiliation, or founding year is on file, so the record is estimated in the recent-grad window rather than left unclassified.",
    snippets[0] ?? null,
    null,
    false,
    null
  );
}
