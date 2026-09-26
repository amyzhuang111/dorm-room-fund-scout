// Enrollment status for Founder Scout. Computed only from text we already
// stored (class-year tokens, "Class of", "graduated in", current-student
// wording, Contrary/DRF labels, and confirmed LinkedIn education dates).
// A missing year stays Unknown. Nothing here is inferred from age.

export const ENROLLMENT_AS_OF_YEAR = 2026;
/** Graduated in AS_OF_YEAR, or in the three calendar years before it: 2023–2026. */
export const RECENT_GRAD_WINDOW_YEARS = 3;

export const ENROLLMENT_STATUSES = ["current_student", "recent_grad", "older_alumni", "unknown"] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const DEFAULT_ENROLLMENT_FOCUS: EnrollmentStatus[] = ["current_student", "recent_grad"];

const RECENT_MIN_YEAR = ENROLLMENT_AS_OF_YEAR - RECENT_GRAD_WINDOW_YEARS;

export interface EvidenceSnippet {
  excerpt: string;
  sourceUrl: string | null;
  sourceId: string | null;
  claimType?: string | null;
  valueJson?: string | null;
  verificationState?: string | null;
}

export interface EnrollmentDecision {
  status: EnrollmentStatus;
  label: string | null;
  gradYear: number | null;
  evidence: string | null;
  sourceUrl: string | null;
  sourceId: string | null;
}

interface YearHit {
  year: number;
  label: string;
  excerpt: string;
  sourceUrl: string | null;
  sourceId: string | null;
}

interface PhraseHit {
  excerpt: string;
  sourceUrl: string | null;
  sourceId: string | null;
}

const EMPTY: EnrollmentDecision = {
  status: "unknown",
  label: null,
  gradYear: null,
  evidence: null,
  sourceUrl: null,
  sourceId: null,
};

// Venue and contest codes that print as CODE 'YY. They are not school class years.
// CHI '26 is the CHI conference. WACV '23 is a vision conference. IMO '24 is an olympiad.
const EVENT_CODES = new Set([
  "CHI",
  "NEURIPS",
  "NIPS",
  "ICML",
  "ICLR",
  "CVPR",
  "ECCV",
  "ICCV",
  "WACV",
  "BMVC",
  "ACL",
  "EMNLP",
  "NAACL",
  "EACL",
  "AAAI",
  "IJCAI",
  "KDD",
  "SIGGRAPH",
  "UIST",
  "CSCW",
  "MICCAI",
  "ICRA",
  "IROS",
  "RSS",
  "ICASSP",
  "INTERSPEECH",
  "SIGIR",
  "RECSYS",
  "ICSE",
  "FSE",
  "PLDI",
  "POPL",
  "SOSP",
  "OSDI",
  "NSDI",
  "SIGCOMM",
  "CCS",
  "NDSS",
  "AISTATS",
  "COLING",
  "MLSYS",
  "CORL",
  "COGSCI",
  "HRI",
  "IUI",
  "SIGMOD",
  "VLDB",
  "CIKM",
  "WSDM",
  "COLM",
  "IMO",
  "IOI",
  "USAMO",
]);

function eventCode(token: string): boolean {
  const code = token.split("'")[0].replace(/\s+/g, "").toUpperCase();
  return EVENT_CODES.has(code);
}

function lastName(personName: string): string | null {
  const parts = personName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((part) => part.length > 1 && !["jr", "sr", "ii", "iii", "iv"].includes(part));
  return parts.length ? parts[parts.length - 1] : null;
}

function mentionsPerson(text: string, personName: string): boolean {
  const name = lastName(personName);
  if (!name) return false;
  const norm = text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(norm);
}

function fullYear(raw: number): number | null {
  const year = raw < 100 ? 2000 + raw : raw;
  if (year < 1980 || year > 2040) return null;
  return year;
}

function labelFromYear(year: number): string {
  return `'${String(year).slice(2)}`;
}

function pushYear(hits: YearHit[], year: number | null, label: string, snippet: EvidenceSnippet) {
  if (year == null) return;
  hits.push({
    year,
    label,
    excerpt: snippet.excerpt,
    sourceUrl: snippet.sourceUrl,
    sourceId: snippet.sourceId,
  });
}

// School-code tokens printed on Penn pages: W'26, C'27, ENG'29, SEAS'24,
// G'EE27, M&T'18, and the spaced form SEAS '25.
function classTokenHits(snippet: EvidenceSnippet, hits: YearHit[]) {
  // Sources print both ASCII and curly apostrophes. Treat them as the same token.
  const text = snippet.excerpt.replace(/[’‘ʼ]/g, "'");
  // Quote is required. G'EE27 keeps school letters between the quote and the year.
  // SP2'25 keeps a digit in the school code. GEng'27 is mixed case.
  const tight = /\b((?:M&T|SEAS|Nu|GEng|[A-Z]{1,5}\d?)'(?:[A-Z]{1,4})?'?(\d{2}))\b/g;
  for (const match of text.matchAll(tight)) {
    const token = match[1];
    if (token.length > 14) continue;
    if (eventCode(token)) continue;
    pushYear(hits, fullYear(parseInt(match[2], 10)), token, snippet);
  }
  const spaced = /\b((?:M&T|SEAS|[A-Z]{1,5})\s+'(\d{2}))\b/g;
  for (const match of text.matchAll(spaced)) {
    if (eventCode(match[1])) continue;
    pushYear(hits, fullYear(parseInt(match[2], 10)), match[1].replace(/\s+/, ""), snippet);
  }
  // Bios print "mit '23" in lowercase. School codes stay case-sensitive above.
  const mit = /\bmit\s+'(\d{2})\b/gi;
  for (const match of text.matchAll(mit)) {
    const year = fullYear(parseInt(match[1], 10));
    pushYear(hits, year, year ? `MIT'${match[1]}` : "", snippet);
  }
  // Haas prints degree codes without an apostrophe: MBA 26, EWMBA 25, BS 27.
  const degree = /\b(BS|BA|MBA|EWMBA|EMBA)\s+'?(\d{2})\b/g;
  for (const match of text.matchAll(degree)) {
    const year = fullYear(parseInt(match[2], 10));
    pushYear(hits, year, year ? `${match[1]}'${match[2]}` : "", snippet);
  }
  // Columbia prints the year first: '27CBS, '26SIPA, '26CBS/SEAS.
  const yearFirst = /(?:^|[\s(—–-])'((?:\d{2}))([A-Z]{2,8}(?:\/[A-Z]{2,8})?)\b/g;
  for (const match of text.matchAll(yearFirst)) {
    const token = `'${match[1]}${match[2]}`;
    pushYear(hits, fullYear(parseInt(match[1], 10)), token, snippet);
  }
  // Multi-word or mixed-case school labels the single-token pattern misses.
  const named = /\b(MBAxMS|MS ChemE|MS CS|S\.B\.|Extension School)\s+'(\d{2})\b/g;
  for (const match of text.matchAll(named)) {
    pushYear(hits, fullYear(parseInt(match[2], 10)), `${match[1]} '${match[2]}`, snippet);
  }
}

function classOfHits(snippet: EvidenceSnippet, hits: YearHit[]) {
  const re = /\bclass of\s+'?(\d{2,4})\b/gi;
  for (const match of snippet.excerpt.matchAll(re)) {
    const year = fullYear(parseInt(match[1], 10));
    pushYear(hits, year, year ? labelFromYear(year) : "", snippet);
  }
}

function graduatedHits(snippet: EvidenceSnippet, hits: YearHit[]) {
  const patterns = [
    /\bgraduated in\s+(\d{4})\b/gi,
    /\bgraduation year(?:\(s\))?\s+((?:\d{4})(?:\/\d{4})*)/gi,
    /\bexpected graduation year(?:\(s\))?\s+((?:\d{4})(?:\/\d{4})*)/gi,
  ];
  for (const re of patterns) {
    for (const match of snippet.excerpt.matchAll(re)) {
      for (const part of match[1].split("/")) {
        const year = fullYear(parseInt(part, 10));
        pushYear(hits, year, year ? labelFromYear(year) : "", snippet);
      }
    }
  }
}

function linkedInHits(snippet: EvidenceSnippet, hits: YearHit[], phrases: PhraseHit[]) {
  if (snippet.claimType !== "linkedin_education") return;
  if (snippet.verificationState === "unverified") return;
  let value: { startYear?: number | null; endYear?: number | null; school?: string } = {};
  try {
    value = JSON.parse(snippet.valueJson || "{}");
  } catch {
    return;
  }
  const end = fullYear(Number(value.endYear));
  if (end) {
    pushYear(hits, end, labelFromYear(end), snippet);
    return;
  }
  const start = fullYear(Number(value.startYear));
  if (start) phrases.push({ excerpt: snippet.excerpt, sourceUrl: snippet.sourceUrl, sourceId: snippet.sourceId });
}

// Wording that says the person is enrolled, with no year attached.
// "senior design" is a course name, not a class standing.
function precededByFormer(text: string, index: number): boolean {
  const prior = text.slice(Math.max(0, index - 48), index);
  return /\b(former|formerly|previously|ex-)\b/i.test(prior);
}

function livePhrase(text: string, re: RegExp): boolean {
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  const copy = new RegExp(re.source, flags);
  for (const match of text.matchAll(copy)) {
    if (!precededByFormer(text, match.index ?? 0)) return true;
  }
  return false;
}

function currentStudentPhrase(snippet: EvidenceSnippet): boolean {
  const text = snippet.excerpt.replace(/[’‘ʼ]/g, "'");
  if (/alumnus=false/i.test(text)) return true;
  if (/\bcurrent student\b/i.test(text)) return true;
  if (/\bcurrently a student\b/i.test(text)) return true;
  // Freshman/sophomore are class standings. Junior/senior also name job titles
  // ("Senior Software Engineer"), so those count only next to enrollment wording.
  if (/\b(freshman|sophomore)\b/i.test(text)) return true;
  if (/\bis\s+an?\s+(junior|senior)\b(?!\s+(engineer|software|research|manager|director|designer|developer|associate|analyst|scientist|advisor|fellow|product|member|lead))/i.test(text)) return true;
  if (/\b(junior|senior)\s+(year|studying|majoring)\b/i.test(text)) return true;
  if (livePhrase(text, /\b(engineering|wharton|college)\s+(senior|junior)\b/i)) return true;
  if (livePhrase(text, /\b(wharton|college|engineering|university)\s+first[- ]year\b/i)) return true;
  if (livePhrase(text, /\buniversity\s+student\b/i)) return true;
  if (livePhrase(text, /\bstudent at the university\b/i)) return true;
  if (livePhrase(text, /\b(master'?s|graduate|undergraduate|doctoral|phd)\s+student\b/i)) return true;
  if (livePhrase(text, /\bengineering students\b/i)) return true;
  if (livePhrase(text, /\b(?:math\s*\+\s*)?cs\s+student\b/i)) return true;
  // Field-of-study majors only. "a major step" and "across major media" do not count.
  if (
    livePhrase(
      text,
      /\b(?:information systems|computer science|electrical engineering|mechanical engineering|operations research|data science|cognitive science|political science|environmental science|bioengineering|biophysics|biochemistry|communications|finance|economics|business|mathematics|statistics|psychology|neuroscience|biology|chemistry|physics|design|engineering|systems|research)\s+major\b/i
    )
  )
    return true;
  return false;
}

// "2022 Wharton graduate Nick Fleisher and 2023 College graduate Liam Germain"
// names two years. Keep a year only when this person's name is in that clause.
function namedProseYearHits(snippet: EvidenceSnippet, hits: YearHit[], personName: string) {
  const text = snippet.excerpt.replace(/[’‘ʼ]/g, "'");
  if (!mentionsPerson(text, personName)) return;
  const grad = /\b((?:19|20)\d{2})\s+(?:[A-Za-z.&']+\s+){0,16}graduates?\b((?:(?!(?:19|20)\d{2})[\s\S]){0,240})/gi;
  for (const match of text.matchAll(grad)) {
    const tail = match[2];
    if (!mentionsPerson(tail, personName)) continue;
    const year = fullYear(parseInt(match[1], 10));
    pushYear(hits, year, year ? labelFromYear(year) : "", snippet);
  }
  const fellows = /\b((?:19|20)\d{2})\s+graduating fellows\b/gi;
  for (const match of text.matchAll(fellows)) {
    const year = fullYear(parseInt(match[1], 10));
    pushYear(hits, year, year ? labelFromYear(year) : "", snippet);
  }
  const congrats = /\bcongratulations to the ((?:19|20)\d{2}) graduates\b/gi;
  for (const match of text.matchAll(congrats)) {
    const year = fullYear(parseInt(match[1], 10));
    pushYear(hits, year, year ? labelFromYear(year) : "", snippet);
  }
}

function expectedDegreeHits(snippet: EvidenceSnippet, hits: YearHit[]) {
  const re = /\bexpected(?:\s+graduation)?\s+(?:in\s+)?(?:[A-Za-z.]+\s+){0,2}((?:19|20)\d{2})\b/gi;
  for (const match of snippet.excerpt.matchAll(re)) {
    const year = fullYear(parseInt(match[1], 10));
    pushYear(hits, year, year ? labelFromYear(year) : "", snippet);
  }
}

function bucketForYear(year: number): EnrollmentStatus {
  if (year > ENROLLMENT_AS_OF_YEAR) return "current_student";
  if (year >= RECENT_MIN_YEAR && year <= ENROLLMENT_AS_OF_YEAR) return "recent_grad";
  return "older_alumni";
}

export function decideEnrollment(snippets: EvidenceSnippet[], options?: { personName?: string | null }): EnrollmentDecision {
  const years: YearHit[] = [];
  const phrases: PhraseHit[] = [];
  const personName = options?.personName?.trim() || null;
  for (const snippet of snippets) {
    if (!snippet.excerpt && snippet.claimType !== "linkedin_education") continue;
    if (
      snippet.claimType === "linkedin_candidate" ||
      snippet.claimType === "linkedin_search_attempt" ||
      snippet.claimType === "profile_link"
    )
      continue;
    classTokenHits(snippet, years);
    classOfHits(snippet, years);
    graduatedHits(snippet, years);
    expectedDegreeHits(snippet, years);
    if (personName) namedProseYearHits(snippet, years, personName);
    linkedInHits(snippet, years, phrases);
    if (currentStudentPhrase(snippet)) {
      phrases.push({ excerpt: snippet.excerpt, sourceUrl: snippet.sourceUrl, sourceId: snippet.sourceId });
    }
    if (
      personName &&
      mentionsPerson(snippet.excerpt, personName) &&
      (/organization composed of students/i.test(snippet.excerpt) || /team of UC Berkeley students/i.test(snippet.excerpt))
    ) {
      phrases.push({ excerpt: snippet.excerpt, sourceUrl: snippet.sourceUrl, sourceId: snippet.sourceId });
    }
  }

  if (years.length > 0) {
    const latest = Math.max(...years.map((h) => h.year));
    const hit = years.find((h) => h.year === latest && h.label) ?? years.find((h) => h.year === latest)!;
    return {
      status: bucketForYear(latest),
      label: hit.label || labelFromYear(latest),
      gradYear: latest,
      evidence: hit.excerpt,
      sourceUrl: hit.sourceUrl,
      sourceId: hit.sourceId,
    };
  }

  const phrase = phrases[0];
  if (phrase) {
    return {
      status: "current_student",
      label: null,
      gradYear: null,
      evidence: phrase.excerpt,
      sourceUrl: phrase.sourceUrl,
      sourceId: phrase.sourceId,
    };
  }

  return EMPTY;
}

export function enrollmentBadge(status: string | null | undefined, label: string | null | undefined): string {
  if (status === "current_student") return label ? `Student · ${label}` : "Student";
  if (status === "recent_grad") return label ? `New grad · ${label}` : "New grad";
  if (status === "older_alumni") return label ? `Alumni · ${label}` : "Alumni";
  return "Unknown";
}

export function enrollmentBoost(status: string | null | undefined): number {
  if (status === "current_student") return 2;
  if (status === "recent_grad") return 1;
  return 0;
}

/** Founder list order: current students, then people who left school, then recent grads. */
export function founderListRank(status: string | null | undefined, leftSchool: boolean | number | null | undefined): number {
  if (status === "current_student") return 3;
  if (leftSchool) return 2;
  if (status === "recent_grad") return 1;
  return 0;
}

export function bestEnrollmentBoost(statuses: (string | null | undefined)[]): number {
  return statuses.reduce((best, status) => Math.max(best, enrollmentBoost(status)), 0);
}

export function selectedEnrollment(param: string | undefined): EnrollmentStatus[] {
  if (!param) return [...DEFAULT_ENROLLMENT_FOCUS];
  if (param === "none") return [];
  const allowed = new Set<string>(ENROLLMENT_STATUSES);
  const picked = param.split(",").filter((part): part is EnrollmentStatus => allowed.has(part));
  return ENROLLMENT_STATUSES.filter((status) => picked.includes(status));
}

/** Null means the default focus, so the query string can omit it. */
export function enrollmentQuery(selected: EnrollmentStatus[]): string | null {
  const canon = ENROLLMENT_STATUSES.filter((status) => selected.includes(status));
  if (canon.length === 0) return "none";
  if (canon.length === DEFAULT_ENROLLMENT_FOCUS.length && DEFAULT_ENROLLMENT_FOCUS.every((status, i) => canon[i] === status)) return null;
  return canon.join(",");
}

export function matchesEnrollment(status: string | null | undefined, selected: EnrollmentStatus[]): boolean {
  const value = (status && (ENROLLMENT_STATUSES as readonly string[]).includes(status) ? status : "unknown") as EnrollmentStatus;
  return selected.includes(value);
}

export function companyMatchesEnrollment(
  founders: { enrollmentStatus?: string | null }[],
  selected: EnrollmentStatus[]
): boolean {
  if (founders.length === 0) return selected.includes("unknown");
  return founders.some((founder) => matchesEnrollment(founder.enrollmentStatus, selected));
}

export function yearFromUnknown(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number" && value > 1900 && value < 2100) return value;
  if (typeof value === "string") {
    const match = value.match(/\b(19|20)\d{2}\b/);
    return match ? Number(match[0]) : null;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return yearFromUnknown(record.year) ?? yearFromUnknown(record.text);
  }
  return null;
}

export interface LinkedInEducationEntry {
  schoolName?: string;
  startDate?: unknown;
  endDate?: unknown;
  period?: string;
}

/** Education dates from a confirmed profile. Unmatched schools are ignored. */
export function linkedInEducationFact(
  entries: LinkedInEducationEntry[],
  schoolMatches: (school: string) => boolean
): { school: string; startYear: number | null; endYear: number | null } | null {
  const matching = entries.filter((entry) => entry.schoolName && schoolMatches(entry.schoolName));
  if (matching.length === 0) return null;
  let best: { school: string; startYear: number | null; endYear: number | null } | null = null;
  for (const entry of matching) {
    const startYear = yearFromUnknown(entry.startDate) ?? yearFromUnknown(entry.period?.split("-")[0]);
    const endYear = yearFromUnknown(entry.endDate);
    const fact = { school: entry.schoolName!, startYear, endYear };
    if (!best) {
      best = fact;
      continue;
    }
    const bestRank = best.endYear ?? (best.startYear ? 9999 : 0);
    const rank = endYear ?? (startYear ? 9999 : 0);
    if (rank > bestRank) best = fact;
  }
  if (!best || (best.startYear == null && best.endYear == null)) return null;
  return best;
}
