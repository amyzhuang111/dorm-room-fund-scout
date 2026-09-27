// Match public headlines to startups already in Campus Scout.
// A hit requires the startup name plus a founder, school, or company domain.
// Ambiguous names need a stronger second signal so common words do not attach.

import type { MatchConfidence, NewsCategory } from "./news-types";

const GENERIC = new Set([
  "app",
  "capital",
  "collective",
  "common",
  "company",
  "design",
  "digital",
  "energy",
  "future",
  "global",
  "group",
  "health",
  "holdings",
  "human",
  "labs",
  "market",
  "media",
  "mobile",
  "network",
  "online",
  "partners",
  "people",
  "platform",
  "science",
  "social",
  "solutions",
  "startup",
  "studio",
  "studios",
  "student",
  "system",
  "technologies",
  "technology",
  "university",
  "venture",
  "ventures",
  "works",
  "alpha",
  "anchor",
  "apex",
  "apollo",
  "beacon",
  "beta",
  "bridge",
  "canvas",
  "catalyst",
  "central",
  "compass",
  "cursor",
  "delta",
  "echo",
  "flux",
  "forge",
  "frontier",
  "general",
  "harbor",
  "horizon",
  "liberty",
  "matrix",
  "mercury",
  "mosaic",
  "national",
  "nexus",
  "nova",
  "orbit",
  "phoenix",
  "pioneer",
  "premier",
  "prime",
  "prism",
  "public",
  "pulse",
  "relay",
  "rocket",
  "sigma",
  "simple",
  "spark",
  "standard",
  "stride",
  "summit",
  "titan",
  "union",
  "vector",
  "vertex",
]);

const COMMON_FIRST = new Set([
  "james", "john", "robert", "michael", "david", "william", "richard", "joseph", "thomas", "charles",
  "christopher", "daniel", "matthew", "anthony", "mark", "donald", "steven", "paul", "andrew", "joshua",
  "kenneth", "kevin", "brian", "george", "timothy", "ronald", "edward", "jason", "jeffrey", "ryan",
  "jacob", "gary", "nicholas", "eric", "jonathan", "stephen", "larry", "justin", "scott", "brandon",
  "benjamin", "samuel", "raymond", "gregory", "frank", "alexander", "patrick", "jack", "dennis", "jerry",
  "tyler", "aaron", "jose", "adam", "nathan", "henry", "douglas", "zachary", "peter", "kyle", "noah",
  "ethan", "jeremy", "walter", "christian", "keith", "roger", "terry", "austin", "sean", "gerald",
  "carl", "harold", "dylan", "arthur", "lawrence", "jordan", "jesse", "bryan", "billy", "bruce",
  "gabriel", "joe", "logan", "albert", "alan", "eugene", "russell", "vincent", "philip", "bobby",
  "johnny", "bradley", "mary", "jennifer", "linda", "elizabeth", "barbara", "susan", "jessica", "sarah",
  "karen", "lisa", "nancy", "betty", "margaret", "sandra", "ashley", "kimberly", "emily", "donna",
  "michelle", "carol", "amanda", "dorothy", "melissa", "deborah", "stephanie", "rebecca", "sharon",
  "laura", "cynthia", "kathleen", "amy", "angela", "shirley", "anna", "brenda", "pamela", "emma",
  "nicole", "helen", "samantha", "katherine", "christine", "debra", "rachel", "carolyn", "janet",
  "catherine", "heather", "diane", "julie", "joyce", "victoria", "alex", "chris", "mike", "matt",
  "ben", "sam", "tom", "dan", "joe", "nick", "tony", "steve", "bill", "bob",
]);

const COMMON_LAST = new Set([
  "smith", "johnson", "williams", "brown", "jones", "garcia", "miller", "davis", "rodriguez", "martinez",
  "hernandez", "lopez", "gonzalez", "wilson", "anderson", "thomas", "taylor", "moore", "jackson", "martin",
  "lee", "perez", "thompson", "white", "harris", "sanchez", "clark", "ramirez", "lewis", "robinson",
  "walker", "young", "allen", "king", "wright", "scott", "torres", "nguyen", "hill", "flores", "green",
  "adams", "nelson", "baker", "hall", "rivera", "campbell", "mitchell", "carter", "roberts", "gomez",
  "phillips", "evans", "turner", "diaz", "parker", "cruz", "edwards", "collins", "reyes", "stewart",
  "morris", "morales", "murphy", "cook", "rogers", "gutierrez", "ortiz", "morgan", "cooper", "peterson",
  "bailey", "reed", "kelly", "howard", "ramos", "kim", "cox", "ward", "richardson", "watson", "brooks",
  "chavez", "wood", "james", "bennett", "gray", "mendoza", "ruiz", "hughes", "price", "alvarez",
  "castillo", "sanders", "patel", "myers", "long", "ross", "foster", "jimenez", "powell", "jenkins",
  "perry", "russell", "sullivan", "bell", "coleman", "butler", "henderson", "barnes", "gonzales",
  "fisher", "vasquez", "simmons", "romero", "jordan", "patterson", "alexander", "hamilton", "graham",
  "reynolds", "griffin", "wallace", "moreno", "west", "cole", "hayes", "bryant", "herrera", "gibson",
  "ellis", "tran", "medina", "aguilar", "stevens", "murray", "ford", "castro", "marshall", "owens",
  "harrison", "fernandez", "mcdonald", "woods", "washington", "kennedy", "wells", "vargas", "chen",
  "singh", "wang", "zhang", "liu", "yang", "huang", "wu", "zhou", "xu", "zhu", "lin", "guo",
]);

const SUFFIX = new Set(["jr", "sr", "ii", "iii", "iv", "phd", "md"]);
const SHORT_SCHOOL = new Set(["mit", "cmu", "nyu", "usc", "unc", "uva", "ucla", "uiuc"]);
const TLDS = new Set(["com", "ai", "io", "org", "co", "app", "dev", "so", "xyz", "net", "edu", "bio", "live", "inc", "run", "skin", "me", "vc", "fund", "tech", "studio"]);
const IGNORE_HOSTS = [
  "linkedin.com",
  "github.com",
  "github.io",
  "twitter.com",
  "x.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "youtu.be",
  "devpost.com",
  "ycombinator.com",
  "crunchbase.com",
  "wikipedia.org",
  "medium.com",
  "substack.com",
  "linktr.ee",
  "google.com",
  "notion.site",
  "notion.so",
  "carrd.co",
  "tiktok.com",
  "discord.gg",
  "discord.com",
  "bit.ly",
  "tinyurl.com",
];

const CATEGORY_RULES: { category: NewsCategory; re: RegExp }[] = [
  { category: "acquisition", re: /\b(acquired|acquires|acquisition|bought by|merger|merges with)\b/i },
  { category: "funding", re: /\b(raises|raised|raising|funding|series [a-e]\b|seed round|pre-seed|investment|invests|invested|led by|valuation|\$\s?\d|\d+(?:\.\d+)?\s?million|\d+(?:\.\d+)?\s?billion)\b/i },
  { category: "award", re: /\b(award|awarded|winner|wins|prize|30 under 30|under 30|fellowship|honou?r|named to)\b/i },
  { category: "launch", re: /\b(launch|launches|launched|launching|unveils|unveiled|debuts|debuted|introduces|now available|out of stealth|general availability)\b/i },
  { category: "profile", re: /\b(interview|q&a|profile|founder story|meet the|in conversation|how i built)\b/i },
];

export interface NewsFounderRef {
  personId: string;
  name: string;
}

export interface NewsEntity {
  projectId: string;
  names: string[];
  founders: NewsFounderRef[];
  schoolPhrases: string[];
  domains: string[];
}

export interface ArticleMatch {
  projectId: string;
  personIds: string[];
  confidence: MatchConfidence;
  reason: string;
}

export function fold(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").replace(/[’‘]/g, "'").toLowerCase();
}

export function tokensOf(value: string): string[] {
  return fold(value).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isAmbiguousName(name: string): boolean {
  const tokens = tokensOf(name);
  if (tokens.length === 0) return true;
  const strong = tokens.filter((token) => token.length >= (tokens.length === 1 ? 6 : 5) && !GENERIC.has(token));
  return strong.length === 0;
}

export function isCommonNamePair(name: string): boolean {
  const parts = tokensOf(name).filter((token) => !SUFFIX.has(token));
  if (parts.length < 2) return true;
  return COMMON_FIRST.has(parts[0]) && COMMON_LAST.has(parts[parts.length - 1]);
}

export function phraseIn(foldedText: string, phrase: string): boolean {
  const tokens = tokensOf(phrase);
  if (tokens.length === 0) return false;
  if (tokens.some((token) => token.length < 2) && tokens.length === 1) return false;
  const body = tokens.map(escapeRegExp).join("[^\\p{L}\\p{N}]+");
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${body}(?=$|[^\\p{L}\\p{N}])`, "u").test(foldedText);
}

export function founderIn(foldedText: string, name: string): boolean {
  const parts = tokensOf(name).filter((token) => !SUFFIX.has(token));
  if (parts.length < 2) return false;
  if (parts[0].length < 2 || parts[parts.length - 1].length < 2) return false;
  if (phraseIn(foldedText, parts.join(" "))) return true;
  if (parts.length < 3) return false;
  const first = escapeRegExp(parts[0]);
  const last = escapeRegExp(parts[parts.length - 1]);
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${first}[^\\p{L}\\p{N}]+\\p{L}\\.?[^\\p{L}\\p{N}]+${last}(?=$|[^\\p{L}\\p{N}])`, "u").test(foldedText);
}

export function schoolPhrases(input: { name?: string | null; shortLabel?: string | null; aliases?: string[] }): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const phrase of [input.name, input.shortLabel, ...(input.aliases ?? [])]) {
    if (!phrase) continue;
    const folded = fold(phrase.trim());
    if (!folded || seen.has(folded)) continue;
    const compact = folded.replace(/[^\p{L}\p{N}]+/gu, "");
    if (compact.length < 3) continue;
    if (compact.length < 4 && !SHORT_SCHOOL.has(compact)) continue;
    if (compact === "cal" || compact === "gt" || compact === "uw") continue;
    seen.add(folded);
    out.push(phrase.trim());
  }
  return out;
}

export function domainNeedles(websiteUrl: string | null | undefined): string[] {
  if (!websiteUrl) return [];
  let host = "";
  try {
    host = new URL(websiteUrl).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return [];
  }
  if (!host || host === "localhost" || host.endsWith(".edu")) return [];
  if (IGNORE_HOSTS.some((skip) => host === skip || host.endsWith(`.${skip}`))) return [];
  const labels = host.split(".").filter((label) => label && !TLDS.has(label));
  const needles = [host];
  const longest = [...labels].sort((a, b) => b.length - a.length)[0];
  if (longest && longest.length >= 6 && !GENERIC.has(longest) && !SHORT_SCHOOL.has(longest)) needles.push(longest);
  return [...new Set(needles)];
}

export function classifyCategory(title: string, snippet: string): NewsCategory {
  for (const rule of CATEGORY_RULES) {
    if (rule.re.test(title)) return rule.category;
  }
  const body = `${title}\n${snippet}`;
  for (const rule of CATEGORY_RULES) {
    if (rule.re.test(body)) return rule.category;
  }
  return "other";
}

export function urlKey(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = "";
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const drop = new Set(["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id", "oc", "gclid", "fbclid", "mc_cid", "mc_eid"]);
    const params = [...url.searchParams.entries()]
      .filter(([key]) => !drop.has(key.toLowerCase()))
      .sort(([a], [b]) => a.localeCompare(b));
    const qs = params.length ? `?${params.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&")}` : "";
    const path = url.pathname.replace(/\/+$/, "") || "/";
    return `${host}${path}${qs}`;
  } catch {
    return fold(raw.trim());
  }
}

export function articleKey(input: { url: string; headline: string; sourceName: string; publishedAt: string | null }): string {
  const head = fold(input.headline).replace(/\s+/g, " ").trim().slice(0, 180);
  const day = input.publishedAt ? input.publishedAt.slice(0, 10) : "";
  if (head.length < 12) return urlKey(input.url);
  return `h:${head}|${fold(input.sourceName)}|${day}`;
}

const SHORT_CODES = new Set(["mit", "cmu", "nyu", "usc", "unc", "uva", "ucla", "uiuc"]);
const CAMPUS_NEAR = /student|university|institute|campus|alumn|founder|graduat|undergrad|professor|dropout|researcher|engineer|startup|college|freshm|sophomore|junior|senior|dorm|eecs|wharton|haas/;

function withoutPennLookalikes(foldedText: string): string {
  return foldedText
    .replace(/indiana university of pennsylvania/g, " ")
    .replace(/california university of pennsylvania/g, " ")
    .replace(/pennsylvania state(?: university)?/g, " ")
    .replace(/penn state/g, " ");
}

function isPennPhrase(phrase: string): boolean {
  const folded = fold(phrase);
  return folded === "penn" || folded === "upenn" || folded === "wharton" || folded.includes("pennsylvania");
}

function schoolPhraseIn(foldedText: string, phrase: string): boolean {
  const tokens = tokensOf(phrase);
  if (tokens.length === 0) return false;
  const body = tokens.map(escapeRegExp).join("[^\\p{L}\\p{N}]+");
  const re = new RegExp(`(?:^|[^\\p{L}\\p{N}])(${body})(?=$|[^\\p{L}\\p{N}])`, "gu");
  const compact = tokens.join("");
  let match: RegExpExecArray | null;
  while ((match = re.exec(foldedText))) {
    if (!SHORT_CODES.has(compact)) return true;
    const window = foldedText.slice(Math.max(0, match.index - 48), match.index + match[0].length + 48);
    if (/\(\s*mit\s*\)|mit licen[sc]e/.test(window) && !/massachusetts/.test(window)) continue;
    if (!CAMPUS_NEAR.test(window)) continue;
    return true;
  }
  return false;
}

function schoolHit(foldedText: string, phrases: string[]): string | null {
  const pennText = withoutPennLookalikes(foldedText);
  const ranked = [...phrases].sort((a, b) => b.length - a.length);
  for (const phrase of ranked) {
    const haystack = isPennPhrase(phrase) ? pennText : foldedText;
    if (schoolPhraseIn(haystack, phrase)) return phrase;
  }
  return null;
}

function hostIn(foldedText: string, host: string): boolean {
  const body = escapeRegExp(host);
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${body}(?=$|[^\\p{L}\\p{N}])`, "u").test(foldedText);
}

function domainHit(foldedText: string, domains: string[], matchedName: string): string | null {
  const nameCompact = tokensOf(matchedName).join("");
  const ranked = [...domains].sort((a, b) => b.length - a.length);
  for (const domain of ranked) {
    const literal = fold(domain);
    if (!literal.includes(".")) {
      const compact = literal.replace(/[^\p{L}\p{N}]+/gu, "");
      if (compact === nameCompact || tokensOf(matchedName).includes(compact)) continue;
    }
    if (hostIn(foldedText, literal)) return domain;
  }
  return null;
}

const STARTUP_CONTEXT = /\b(start-?ups?|founders?|co-?founders?|cofounders?|founded|raises|raised|raising|launch(?:es|ed|ing)?|compan(?:y|ies)|seeds?|series [a-e]|ventures?|y combinator)\b/;

function schoolContextOk(foldedText: string, name: string): boolean {
  if (STARTUP_CONTEXT.test(foldedText)) return true;
  const tokens = tokensOf(name);
  if (tokens.join("").length < 10) return false;
  const at = foldedText.indexOf(tokens[0]);
  if (at < 0) return false;
  const window = foldedText.slice(Math.max(0, at - 90), at + tokens.join(" ").length + 90);
  return /university|college|penn\b|berkeley|stanford|harvard|\bmit\b|wharton|waterloo|cornell|columbia|yale|princeton|cmu\b|nyu\b/.test(window);
}

function decide(input: {
  name: string;
  founders: NewsFounderRef[];
  school: string | null;
  domain: string | null;
  foldedText: string;
}): { confidence: MatchConfidence; reason: string; personIds: string[] } | null {
  const ambiguous = isAmbiguousName(input.name);
  const uncommon = input.founders.filter((founder) => !isCommonNamePair(founder.name));
  const common = input.founders.filter((founder) => isCommonNamePair(founder.name));
  const bits: string[] = [input.name];
  if (input.founders.length) bits.push(`founder ${input.founders.map((founder) => founder.name).join(", ")}`);
  if (input.school) bits.push(`school ${input.school}`);
  if (input.domain) bits.push(`domain ${input.domain}`);
  const reason = bits.join(" + ");
  const personIds = input.founders.map((founder) => founder.personId);

  if (ambiguous) {
    if (input.domain && (uncommon.length || input.school)) return { confidence: "high", reason, personIds };
    if (input.domain && common.length) return { confidence: "medium", reason, personIds };
    if (input.domain) return { confidence: "medium", reason, personIds };
    if (uncommon.length && input.school) return { confidence: "high", reason, personIds };
    if (uncommon.length) return { confidence: "medium", reason, personIds };
    if (common.length && input.school) return { confidence: "medium", reason, personIds };
    return null;
  }

  if (input.founders.length && (input.domain || input.school)) return { confidence: "high", reason, personIds };
  if (input.founders.length) return { confidence: "high", reason, personIds };
  if (input.domain) return { confidence: "medium", reason, personIds };
  if (input.school && schoolContextOk(input.foldedText, input.name)) return { confidence: "low", reason, personIds };
  return null;
}

export function matchArticle(title: string, snippet: string, entities: NewsEntity[]): ArticleMatch[] {
  const foldedText = fold(`${title}\n${snippet}`);
  const hits: ArticleMatch[] = [];
  for (const entity of entities) {
    const names = [...entity.names].sort((a, b) => tokensOf(b).join("").length - tokensOf(a).join("").length);
    let name: string | undefined;
    for (const candidate of names) {
      const probe = tokensOf(candidate)[0];
      if (!probe || (probe.length >= 3 && !foldedText.includes(probe))) continue;
      if (phraseIn(foldedText, candidate)) {
        name = candidate;
        break;
      }
    }
    if (!name) continue;
    const founders = entity.founders.filter((founder) => founderIn(foldedText, founder.name));
    const school = schoolHit(foldedText, entity.schoolPhrases);
    const domain = domainHit(foldedText, entity.domains, name);
    const decided = decide({ name, founders, school, domain, foldedText });
    if (!decided) continue;
    hits.push({
      projectId: entity.projectId,
      personIds: decided.personIds,
      confidence: decided.confidence,
      reason: decided.reason,
    });
  }
  if (hits.length > 8) return [];
  return hits.sort((a, b) => {
    const rank = { high: 3, medium: 2, low: 1 };
    return rank[b.confidence] - rank[a.confidence] || a.projectId.localeCompare(b.projectId);
  });
}

export function searchableName(name: string): boolean {
  return tokensOf(name).some((token) => token.length >= 3);
}
