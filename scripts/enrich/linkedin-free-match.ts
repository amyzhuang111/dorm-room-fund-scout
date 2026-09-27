// Free LinkedIn matching. A profile URL is accepted only when the title or
// snippet contains the full name plus at least one of school, startup, or
// program. Confirmed means an independent page links that exact profile, or
// the name, school, and startup all match. A strong match on fewer of those
// is likely. Common names with a single signal, and two profiles that match
// equally, are ambiguous and are not stored. Nothing is invented from a name.

export type SignalKind = "school" | "startup" | "program";
export type Confidence = "confirmed" | "likely";

export interface MatchHit {
  url: string;
  title: string;
  snippet: string;
  query?: string;
  fromSite?: boolean;
}

export interface AcceptMatch {
  outcome: "accept";
  confidence: Confidence;
  url: string;
  signals: SignalKind[];
  title: string;
  snippet: string;
  query: string;
  fromSite: boolean;
}

export interface AmbiguousMatch {
  outcome: "ambiguous";
  reason: string;
}

export interface RejectMatch {
  outcome: "reject";
}

export type JudgeResult = AcceptMatch | AmbiguousMatch | RejectMatch;

const GENERIC_ORG = new Set([
  "lab",
  "labs",
  "studio",
  "studios",
  "venture",
  "ventures",
  "capital",
  "partner",
  "partners",
  "university",
  "college",
  "project",
  "projects",
  "team",
  "company",
  "startup",
  "startups",
  "app",
  "apps",
  "ai",
  "inc",
  "llc",
  "ltd",
  "group",
  "club",
  "house",
  "fund",
  "foundation",
  "institute",
  "program",
  "hackathon",
  "the",
  "and",
]);

const DEGREE = new Set([
  "phd",
  "md",
  "ms",
  "ma",
  "bs",
  "ba",
  "mba",
  "jr",
  "sr",
  "ii",
  "iii",
  "iv",
  "scm",
  "meng",
  "msc",
  "bsc",
  "beng",
  "sc",
  "mph",
  "mphil",
  "ab",
  "sb",
]);

const COMMON_FIRST = new Set(
  `james john robert michael william david richard joseph thomas charles christopher daniel matthew anthony mark donald steven paul andrew joshua kenneth kevin brian george timothy ronald edward jason jeffrey ryan jacob gary nicholas eric jonathan stephen larry justin scott brandon benjamin samuel raymond gregory alexander patrick jack dennis jerry tyler aaron jose adam nathan henry douglas zachary peter kyle noah ethan jeremy walter christian keith roger terry austin sean gerald carl harold dylan arthur lawrence jordan jesse bryan billy bruce gabriel joe logan albert willie alan juan wayne elijah randy vincent mason roy ralph bobby russell eugene louis harry alex sam ben chris mike matt dan tom jim bob bill nick tony amy jennifer jessica ashley sarah emily hannah samantha elizabeth lauren megan rachel nicole amanda stephanie rebecca kayla anna maria sophia olivia emma ava isabella mia charlotte amelia grace chloe lily alexis victoria natalie allison katherine katie kate julia michelle angela melissa lisa nancy karen betty helen sandra donna carol ruth sharon laura kimberly deborah dorothy andrea alice annie ann anne wei jing ming xin yu hao yi jun lei fang ying min hong`.split(
    /\s+/
  )
);

const COMMON_LAST = new Set(
  `smith johnson williams brown jones garcia miller davis rodriguez martinez hernandez lopez gonzalez wilson anderson thomas taylor moore jackson martin lee white harris thompson robinson clark lewis walker young allen king wright scott green baker adams nelson hill ramirez campbell mitchell roberts carter phillips evans turner torres parker collins edwards stewart flores morris nguyen murphy rivera cook rogers morgan peterson cooper reed bailey bell gomez kelly howard ward cox diaz richardson wood watson brooks bennett gray james reyes cruz hughes price myers long foster sanders ross morales powell sullivan russell ortiz jenkins gutierrez perry butler barnes fisher li wang zhang chen liu singh patel kim wu xu zhao huang lin yang chang gupta shah kumar das gao guo he lu luo song sun tan xu zhou zhu`.split(
    /\s+/
  )
);

export const CAMPUS_ALIASES: Record<string, string[]> = {
  univ_penn: ["Penn", "UPenn", "Wharton", "University of Pennsylvania", "SEAS"],
  univ_berkeley: ["Berkeley", "UC Berkeley", "Haas"],
  univ_stanford: ["Stanford", "Stanford University"],
  univ_mit: ["MIT", "Massachusetts Institute of Technology"],
  univ_harvard: ["Harvard", "Harvard University"],
  univ_waterloo: ["Waterloo", "University of Waterloo"],
  univ_cmu: ["CMU", "Carnegie Mellon", "Carnegie Mellon University"],
  univ_columbia: ["Columbia", "Columbia University"],
  univ_brown: ["Brown", "Brown University"],
  univ_cornell: ["Cornell", "Cornell University"],
  univ_yale: ["Yale", "Yale University"],
  univ_princeton: ["Princeton", "Princeton University"],
  univ_duke: ["Duke", "Duke University"],
  univ_gatech: ["Georgia Tech", "Georgia Institute of Technology"],
  univ_michigan: ["Michigan", "University of Michigan"],
};

export function schoolPhrases(campusId: string, universityName: string | null | undefined): string[] {
  const phrases = new Set<string>();
  const name = (universityName ?? "").replace(/\s+/g, " ").trim();
  if (name.length >= 4) phrases.add(name);
  for (const alias of CAMPUS_ALIASES[campusId] ?? []) phrases.add(alias);
  const of = name.match(/^(?:University|College) of (.+)$/i);
  if (of && of[1].length >= 5) phrases.add(of[1].replace(/,.*/, "").trim());
  return [...phrases].filter((phrase) => phrase.length >= 3);
}

export function usableOrgName(name: string | null | undefined): string | null {
  const cleaned = (name ?? "").replace(/\s+/g, " ").trim();
  if (cleaned.length < 4 || cleaned.length > 80) return null;
  const words = cleaned.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const distinctive = words.filter((word) => word.length >= 3 && !GENERIC_ORG.has(word));
  if (distinctive.length === 0) return null;
  if (distinctive.every((word) => word.length < 4) && distinctive.join("").length < 5) return null;
  return cleaned;
}

export function nameTokens(name: string): string[] {
  const latin = name.replace(/[\u3400-\u9fff]/g, " ");
  const parts = latin
    .replace(/['’]\d{2}\b/g, " ")
    .split(/[^A-Za-z0-9]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2 && !/^\d+$/.test(part) && !DEGREE.has(part.toLowerCase()));
  return parts;
}

export function mentionsFullName(text: string, name: string): boolean {
  const tokens = nameTokens(name);
  if (tokens.length < 2) return false;
  return tokens.every((token) => new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text));
}

export function isCommonName(tokens: string[], duplicateCount: number): boolean {
  if (duplicateCount > 1) return true;
  if (tokens.length < 2) return false;
  const first = tokens[0].toLowerCase();
  const last = tokens[tokens.length - 1].toLowerCase();
  if (COMMON_FIRST.has(first) && COMMON_LAST.has(last)) return true;
  // A short given name plus a very common surname (Nam Nguyen, Bo Li) is not
  // distinctive enough for a one-signal match.
  return COMMON_LAST.has(last) && first.length <= 4;
}

export function slugLooksLikeName(url: string, name: string): boolean {
  const slug = (url.split("/in/")[1] ?? "").toLowerCase();
  const tokens = nameTokens(name).map((token) => token.toLowerCase());
  if (tokens.length < 2 || slug.length < 3) return false;
  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  const compact = slug.replace(/[^a-z]/g, "");
  const firstStem = first.slice(0, Math.min(5, first.length));
  const firstOk = first.length >= 3 && compact.startsWith(firstStem);
  if (!firstOk) return false;
  if (last.length >= 4) return compact.includes(last.slice(0, Math.min(6, last.length)));
  const boundary = new RegExp(`(^|[^a-z])${last.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(slug);
  const glued = compact.endsWith(last);
  return boundary || glued;
}

export function normalizeLinkedInUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = raw.match(/https?:\/\/(?:[\w.-]+\.)?linkedin\.com\/in\/([A-Za-z0-9\-_%]{3,100})/i);
  if (!match) return null;
  let slug = match[1].replace(/\/+$/, "");
  try {
    slug = decodeURIComponent(slug);
  } catch {
    slug = match[1];
  }
  slug = slug.replace(/[^A-Za-z0-9\-_%]/g, "");
  if (slug.length < 3) return null;
  if (/^(pub|dir|directory|company|school|in)$/i.test(slug)) return null;
  return `https://www.linkedin.com/in/${slug}`;
}

function escapeReg(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasPhrase(text: string, phrase: string): boolean {
  const cleaned = phrase.replace(/\s+/g, " ").trim();
  if (cleaned.length < 3) return false;
  return new RegExp(`\\b${escapeReg(cleaned)}\\b`, "i").test(text);
}

function textHasTokens(text: string, tokens: string[]): boolean {
  return tokens.every((token) => new RegExp(`\\b${escapeReg(token)}\\b`, "i").test(text));
}

function matchedPhrases(text: string, phrases: string[], nameTokensLower: Set<string>): string[] {
  const found: string[] = [];
  const ordered = [...phrases].sort((a, b) => b.length - a.length);
  for (const phrase of ordered) {
    const words = phrase.toLowerCase().split(/\s+/);
    if (words.length === 1 && nameTokensLower.has(words[0])) continue;
    if (words.every((word) => nameTokensLower.has(word))) continue;
    if (hasPhrase(text, phrase)) found.push(phrase);
  }
  return found;
}

interface Scored {
  url: string;
  signals: SignalKind[];
  title: string;
  snippet: string;
  query: string;
  fromSite: boolean;
  score: number;
}

function scoreHit(hit: MatchHit, name: string, tokens: string[], schools: string[], startups: string[], programs: string[]): Scored | null {
  const url = normalizeLinkedInUrl(hit.url);
  if (!url || !slugLooksLikeName(url, name)) return null;
  const text = `${hit.title}\n${hit.snippet}`;
  if (!textHasTokens(text, tokens)) return null;
  const nameTokensLower = new Set(tokens.map((token) => token.toLowerCase()));
  const signals: SignalKind[] = [];
  if (matchedPhrases(text, schools, nameTokensLower).length > 0) signals.push("school");
  if (matchedPhrases(text, startups, nameTokensLower).length > 0) signals.push("startup");
  if (matchedPhrases(text, programs, nameTokensLower).length > 0) signals.push("program");
  if (hit.fromSite) {
    return {
      url,
      signals,
      title: hit.title,
      snippet: hit.snippet,
      query: hit.query ?? "",
      fromSite: true,
      score: 3,
    };
  }
  if (signals.length === 0) return null;
  return {
    url,
    signals,
    title: hit.title,
    snippet: hit.snippet,
    query: hit.query ?? "",
    fromSite: false,
    score: signals.length,
  };
}

export function judgeHits(input: {
  name: string;
  schools: string[];
  startups: string[];
  programs: string[];
  commonName: boolean;
  hits: MatchHit[];
}): JudgeResult {
  const tokens = nameTokens(input.name);
  if (tokens.length < 2) return { outcome: "reject" };
  const scored: Scored[] = [];
  for (const hit of input.hits) {
    const row = scoreHit(hit, input.name, tokens, input.schools, input.startups, input.programs);
    if (row) scored.push(row);
  }
  if (scored.length === 0) return { outcome: "reject" };
  const byUrl = new Map<string, Scored>();
  for (const row of scored) {
    const prev = byUrl.get(row.url);
    if (!prev) {
      byUrl.set(row.url, row);
      continue;
    }
    const signals = [...new Set<SignalKind>([...prev.signals, ...row.signals])];
    const fromSite = prev.fromSite || row.fromSite;
    byUrl.set(row.url, {
      url: row.url,
      signals,
      title: row.title || prev.title,
      snippet: row.snippet.length >= prev.snippet.length ? row.snippet : prev.snippet,
      query: row.query || prev.query,
      fromSite,
      score: fromSite ? 3 : signals.length,
    });
  }
  const ranked = [...byUrl.values()].sort((a, b) => b.score - a.score || b.signals.length - a.signals.length);
  const top = ranked[0];
  const tied = ranked.filter((row) => row.score === top.score && row.url !== top.url);
  if (tied.length > 0) return { outcome: "ambiguous", reason: "more than one LinkedIn profile matched equally" };
  if (input.commonName && !top.fromSite && top.signals.length < 2) {
    return { outcome: "ambiguous", reason: "common name matched only one signal" };
  }
  // Confirmed when an independent page links this exact profile, or the
  // snippet names the person together with both their school and startup.
  // One of those, or school plus a program, is a strong match: likely.
  const schoolAndStartup = top.signals.includes("school") && top.signals.includes("startup");
  const confidence: Confidence = top.fromSite || schoolAndStartup ? "confirmed" : "likely";
  return {
    outcome: "accept",
    confidence,
    url: top.url,
    signals: top.signals,
    title: top.title.replace(/\s+/g, " ").trim().slice(0, 240),
    snippet: top.snippet.replace(/\s+/g, " ").trim().slice(0, 400),
    query: top.query,
    fromSite: top.fromSite,
  };
}

export function nearbyLinkedIn(html: string, fullName: string): { url: string; excerpt: string }[] {
  const tokens = nameTokens(fullName);
  if (tokens.length < 2) return [];
  const found: { url: string; excerpt: string }[] = [];
  const seen = new Set<string>();
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,180}?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const href = match[1].replace(/&amp;/g, "&");
    if (!/linkedin\.com\/in\//i.test(href)) continue;
    const absolute = href.startsWith("http") ? href : `https://${href.replace(/^\/+/, "")}`;
    const url = normalizeLinkedInUrl(absolute);
    if (!url || seen.has(url) || !slugLooksLikeName(url, fullName)) continue;
    const anchor = match[2]
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
    const before = html
      .slice(Math.max(0, match.index - 160), match.index)
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim()
      .slice(-80);
    const excerpt = `${before} ${anchor}`.trim();
    if (!textHasTokens(excerpt, tokens)) continue;
    seen.add(url);
    found.push({ url, excerpt: excerpt.slice(0, 400) });
  }
  return found;
}
