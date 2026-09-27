// Pre-college excellence is a person-level signal. It can raise a potential
// founder's rank. It is not an input to Founder Signal, eligibility, or
// investment score. Every row needs a public source URL. A match is
// confirmed only when the full name, a school, and a plausible class year
// all agree. A full-name match without that school and year is likely.

import { CAMPUSES } from "./campuses";

export const PRECOLLEGE_TIERS = [1, 2] as const;
export type PrecollegeTier = (typeof PRECOLLEGE_TIERS)[number];
export type PrecollegeMatchStatus = "confirmed" | "likely";

export const PRECOLLEGE_SIGNAL_TYPES = [
  "imo_medal",
  "ioi_medal",
  "ipho_medal",
  "icho_medal",
  "ibo_medal",
  "usamo_qualifier",
  "usajmo_qualifier",
  "regeneron_sts_finalist",
  "regeneron_sts_scholar",
  "isef_grand_award",
  "nsda_nationals_finalist",
  "toc_winner",
  "thiel_fellow",
  "hs_funded_founder",
  "aime_qualifier",
  "usaco_platinum",
  "conrad_challenge",
  "davidson_fellow",
  "nsda_national_rank",
  "scioly_nationals_medal",
  "rise_or_emergent",
  "coca_cola_scholar",
] as const;

export type PrecollegeSignalType = (typeof PRECOLLEGE_SIGNAL_TYPES)[number];

export interface PrecollegeSignalDef {
  type: PrecollegeSignalType;
  tier: PrecollegeTier;
  /** Short badge stem. A year or medal color is appended when the source states one. */
  badge: string;
  kind: "olympiad" | "exam" | "fellowship" | "founder";
}

export const PRECOLLEGE_CATALOG: Record<PrecollegeSignalType, PrecollegeSignalDef> = {
  imo_medal: { type: "imo_medal", tier: 1, badge: "IMO", kind: "olympiad" },
  ioi_medal: { type: "ioi_medal", tier: 1, badge: "IOI", kind: "olympiad" },
  ipho_medal: { type: "ipho_medal", tier: 1, badge: "IPhO", kind: "olympiad" },
  icho_medal: { type: "icho_medal", tier: 1, badge: "IChO", kind: "olympiad" },
  ibo_medal: { type: "ibo_medal", tier: 1, badge: "IBO", kind: "olympiad" },
  usamo_qualifier: { type: "usamo_qualifier", tier: 1, badge: "USAMO", kind: "exam" },
  usajmo_qualifier: { type: "usajmo_qualifier", tier: 1, badge: "USAJMO", kind: "exam" },
  regeneron_sts_finalist: { type: "regeneron_sts_finalist", tier: 1, badge: "Regeneron STS finalist", kind: "exam" },
  regeneron_sts_scholar: { type: "regeneron_sts_scholar", tier: 1, badge: "Regeneron STS scholar", kind: "exam" },
  isef_grand_award: { type: "isef_grand_award", tier: 1, badge: "ISEF grand award", kind: "exam" },
  nsda_nationals_finalist: { type: "nsda_nationals_finalist", tier: 1, badge: "NSDA Nationals finalist", kind: "exam" },
  toc_winner: { type: "toc_winner", tier: 1, badge: "TOC winner", kind: "exam" },
  thiel_fellow: { type: "thiel_fellow", tier: 1, badge: "Thiel Fellow", kind: "fellowship" },
  hs_funded_founder: { type: "hs_funded_founder", tier: 1, badge: "HS founder", kind: "founder" },
  aime_qualifier: { type: "aime_qualifier", tier: 2, badge: "AIME", kind: "exam" },
  usaco_platinum: { type: "usaco_platinum", tier: 2, badge: "USACO Platinum", kind: "exam" },
  conrad_challenge: { type: "conrad_challenge", tier: 2, badge: "Conrad Challenge", kind: "exam" },
  davidson_fellow: { type: "davidson_fellow", tier: 2, badge: "Davidson Fellow", kind: "fellowship" },
  nsda_national_rank: { type: "nsda_national_rank", tier: 2, badge: "NSDA national ranking", kind: "exam" },
  scioly_nationals_medal: { type: "scioly_nationals_medal", tier: 2, badge: "SciOly nationals", kind: "exam" },
  rise_or_emergent: { type: "rise_or_emergent", tier: 2, badge: "Rise / Emergent Ventures", kind: "fellowship" },
  coca_cola_scholar: { type: "coca_cola_scholar", tier: 2, badge: "Coca-Cola Scholar", kind: "fellowship" },
};

export interface PrecollegeMention {
  signalType: PrecollegeSignalType;
  tier: PrecollegeTier;
  label: string;
  years: number[];
}

export interface PrecollegeSignalView {
  signalType: PrecollegeSignalType;
  tier: PrecollegeTier;
  label: string;
  year: number | null;
  matchStatus: PrecollegeMatchStatus;
  sourceUrl: string;
}

const AWARD_YEAR_WORDS = new Set([
  "OLYMPIAD",
  "IMO",
  "IOI",
  "IPHO",
  "ICHO",
  "IBO",
  "USAMO",
  "USAJMO",
  "USACO",
  "AIME",
  "STS",
  "ISEF",
]);

export function isPrecollegeSignalType(value: string): value is PrecollegeSignalType {
  return (PRECOLLEGE_SIGNAL_TYPES as readonly string[]).includes(value);
}

export function precollegeTier(type: PrecollegeSignalType): PrecollegeTier {
  return PRECOLLEGE_CATALOG[type].tier;
}

/** Higher sorts first among potential founders. Tier 1 outranks tier 2. Confirmed outranks likely inside a tier. */
export function precollegeRankBoost(signals: PrecollegeSignalView[]): number {
  let best = 0;
  for (const signal of signals) {
    const score = (signal.tier === 1 ? 4 : 2) + (signal.matchStatus === "confirmed" ? 1 : 0);
    if (score > best) best = score;
  }
  return best;
}

export function bestPrecollegeSignals(signals: PrecollegeSignalView[]): PrecollegeSignalView[] {
  return [...signals].sort(
    (a, b) =>
      a.tier - b.tier ||
      (a.matchStatus === b.matchStatus ? 0 : a.matchStatus === "confirmed" ? -1 : 1) ||
      (b.year ?? 0) - (a.year ?? 0) ||
      a.label.localeCompare(b.label)
  );
}

export function matchesPrecollegeFilter(signals: PrecollegeSignalView[], filter: string | undefined): boolean {
  if (!filter || filter === "all") return true;
  if (filter === "any") return signals.length > 0;
  if (filter === "1") return signals.some((signal) => signal.tier === 1);
  if (filter === "2") return signals.some((signal) => signal.tier === 2);
  return true;
}

function straighten(text: string): string {
  return text.replace(/[’‘ʼ]/g, "'");
}

function yearsIn(text: string): number[] {
  const years = new Set<number>();
  const flat = straighten(text);
  for (const match of flat.matchAll(/\b(20\d{2})\b/g)) {
    const year = Number(match[1]);
    if (year >= 1995 && year <= 2030) years.add(year);
  }
  // "Olympiad '22" is an award year. "Wachen '24" is a class year and is not.
  for (const match of flat.matchAll(/\b([A-Za-z][A-Za-z.'-]{1,40})\s+'(\d{2})\b/g)) {
    const word = match[1].replace(/\./g, "").toUpperCase();
    if (!AWARD_YEAR_WORDS.has(word)) continue;
    const year = 2000 + Number(match[2]);
    if (year >= 1995 && year <= 2030) years.add(year);
  }
  return [...years].sort((a, b) => a - b);
}

function windowAround(text: string, index: number, length: number, radius = 96): string {
  return text.slice(Math.max(0, index - radius), Math.min(text.length, index + length + radius));
}

function metalIn(text: string): "gold" | "silver" | "bronze" | null {
  const match = text.match(/\b(gold|silver|bronze)\b/i);
  if (!match) return null;
  return match[1].toLowerCase() as "gold" | "silver" | "bronze";
}

function hasMedalLanguage(text: string): boolean {
  return /\b(gold|silver|bronze|medall?ist|medals?)\b/i.test(text);
}

function labelFor(type: PrecollegeSignalType, years: number[], metal: "gold" | "silver" | "bronze" | null, override?: string): string {
  if (override) return override;
  const badge = PRECOLLEGE_CATALOG[type].badge;
  const color = metal ? ` ${metal}` : "";
  if (PRECOLLEGE_CATALOG[type].kind === "olympiad") {
    if (years.length === 1) return `${badge}${color} ${years[0]}`.replace(/\s+/g, " ").trim();
    if (years.length > 1) return `${badge}${color} ${years[years.length - 1]}`.replace(/\s+/g, " ").trim();
    return `${badge}${color}`.trim();
  }
  if (years.length === 1 && (type === "usamo_qualifier" || type === "usajmo_qualifier" || type === "aime_qualifier" || type === "usaco_platinum" || type === "thiel_fellow")) {
    return `${badge} ${years[0]}`;
  }
  return badge;
}

function pushMention(out: PrecollegeMention[], type: PrecollegeSignalType, window: string, labelOverride?: string) {
  const years = yearsIn(window);
  const metal = PRECOLLEGE_CATALOG[type].kind === "olympiad" ? metalIn(window) : null;
  const label = labelFor(type, years, metal, labelOverride);
  const key = `${type}|${label}|${years.join(",")}`;
  if (out.some((item) => `${item.signalType}|${item.label}|${item.years.join(",")}` === key)) return;
  out.push({ signalType: type, tier: precollegeTier(type), label, years });
}

const OLYMPIADS: { type: PrecollegeSignalType; re: RegExp }[] = [
  { type: "imo_medal", re: /International Mathematical Olympiad|\bIMO\b/gi },
  { type: "ioi_medal", re: /International Olympiad in Informatics|\bIOI\b/gi },
  { type: "ipho_medal", re: /International Physics Olympiad|\bIPhO\b/gi },
  { type: "icho_medal", re: /International Chemistry Olympiad|\bIChO\b/gi },
  { type: "ibo_medal", re: /International Biology Olympiad|\bIBO\b/gi },
];

function hackathonPrize(text: string): boolean {
  return /hackprinceton|cash prizes|hackathon/i.test(text) && !/science talent search|\bsts finalist\b|\bsts scholar\b|\btop 300\b/i.test(text);
}

/** Pull award mentions out of one excerpt. Hackathon sponsor lines and lookalike phrases are ignored. */
export function detectPrecollegeMentions(excerpt: string): PrecollegeMention[] {
  const text = excerpt ?? "";
  if (!text.trim()) return [];
  const out: PrecollegeMention[] = [];

  if (!hackathonPrize(text)) {
    for (const olympiad of OLYMPIADS) {
      for (const match of text.matchAll(olympiad.re)) {
        const slice = windowAround(text, match.index ?? 0, match[0].length);
        if (!hasMedalLanguage(slice)) continue;
        if (/\bcontestant\b/i.test(slice) && !hasMedalLanguage(slice.replace(/\bcontestant\b/gi, ""))) continue;
        pushMention(out, olympiad.type, slice);
      }
    }
  }

  for (const match of text.matchAll(/\bUSAJ?MO\b/gi)) {
    const slice = windowAround(text, match.index ?? 0, match[0].length);
    if (!/\b(qualifier|qualified|winner|medall?ist|medal|honorable)\b/i.test(slice)) continue;
    pushMention(out, /USAJMO/i.test(match[0]) ? "usajmo_qualifier" : "usamo_qualifier", slice);
  }

  if (!hackathonPrize(text)) {
    for (const match of text.matchAll(/science talent search|regeneron sts|\bsts\b/gi)) {
      const slice = windowAround(text, match.index ?? 0, match[0].length);
      if (/\bfinalist\b/i.test(slice)) pushMention(out, "regeneron_sts_finalist", slice);
      else if (/\b(top\s*300|scholar)\b/i.test(slice) && /science talent|regeneron sts/i.test(slice)) pushMention(out, "regeneron_sts_scholar", slice);
    }
  }

  if (/\bISEF\b/i.test(text) && /\bgrand (award|prize)\b/i.test(text)) {
    const match = text.match(/\bISEF\b/i);
    pushMention(out, "isef_grand_award", windowAround(text, match?.index ?? 0, 4));
  }

  if (/\bNSDA\b/i.test(text) && /\bnationals?\b/i.test(text) && /\bfinalist\b/i.test(text)) {
    pushMention(out, "nsda_nationals_finalist", text);
  }
  if (/\bTournament of Champions\b/i.test(text) && /\b(winner|champion)\b/i.test(text)) {
    pushMention(out, "toc_winner", text);
  } else if (/\bTOC\b/.test(text) && /\b(winner|champion)\b/i.test(text) && /debate/i.test(text)) {
    pushMention(out, "toc_winner", text);
  }

  if (/\bThiel Fellow(?:s|ship)?\b/i.test(text) && !/described as|latam|thiel-style|like the thiel|not a thiel/i.test(text)) {
    const match = text.match(/\bThiel Fellow(?:s|ship)?\b/i);
    const slice = windowAround(text, match?.index ?? 0, match?.[0].length ?? 12, 100);
    pushMention(out, "thiel_fellow", slice);
  }

  if (/\bAIME\b/i.test(text) && /\b(qualifier|qualified)\b/i.test(text)) {
    const match = text.match(/\bAIME\b/i);
    pushMention(out, "aime_qualifier", windowAround(text, match?.index ?? 0, 4));
  }

  if (/\bUSACO\s+Platinum\b/i.test(text)) {
    const match = text.match(/\bUSACO\s+Platinum\b/i);
    pushMention(out, "usaco_platinum", windowAround(text, match?.index ?? 0, match?.[0].length ?? 14));
  } else if (/\bUSACO\s+Finalist\b/i.test(text)) {
    const match = text.match(/\bUSACO\s+Finalist\b/i);
    pushMention(out, "usaco_platinum", windowAround(text, match?.index ?? 0, match?.[0].length ?? 14), "USACO finalist");
  }

  if (/\bConrad Challenge\b/i.test(text)) pushMention(out, "conrad_challenge", text);
  if (/\bDavidson Fellow/i.test(text)) pushMention(out, "davidson_fellow", text);
  if (/\bNSDA\b/i.test(text) && /\bnational\b/i.test(text) && /\b(top|rank)/i.test(text) && !/\bfinalist\b/i.test(text)) {
    pushMention(out, "nsda_national_rank", text);
  }
  if (/\bScience Olympiad\b/i.test(text) && /\bnationals?\b/i.test(text) && /\b(medal|gold|silver|bronze|champion)\b/i.test(text)) {
    pushMention(out, "scioly_nationals_medal", text);
  }
  if (/\bEmergent Ventures\b/i.test(text)) pushMention(out, "rise_or_emergent", text, "Emergent Ventures");
  if (/\bRise Global Winner\b|\bRise fellow\b/i.test(text)) pushMention(out, "rise_or_emergent", text, "Rise");
  if (/\bCoca-Cola Scholar/i.test(text)) pushMention(out, "coca_cola_scholar", text);

  if (
    /\bhigh school\b/i.test(text) &&
    /\b(co-?)?found(er|ed)\b/i.test(text) &&
    /(\$\s?\d|\brevenue\b|\braised\b|\bfunded\b|\bseed round\b)/i.test(text) &&
    !/\bThiel Fellow/i.test(text)
  ) {
    pushMention(out, "hs_funded_founder", text);
  }

  return out;
}

export function excerptNamesPerson(excerpt: string, personName: string): boolean {
  const norm = (value: string) =>
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const text = norm(excerpt);
  const parts = norm(personName)
    .split(/[^a-z]+/)
    .filter((part) => part.length > 1 && !["jr", "sr", "ii", "iii", "iv"].includes(part));
  if (parts.length < 2) return false;
  const last = parts[parts.length - 1];
  const first = parts[0];
  if (!new RegExp(`\\b${last.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text)) return false;
  if (new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text)) return true;
  if (first.length >= 5 && new RegExp(`\\b${first.slice(0, 4)}`).test(text)) return true;
  return false;
}

export function universityMentioned(excerpt: string, universityIds: string[]): boolean {
  const ids = new Set(universityIds.filter(Boolean));
  if (!ids.size) return false;
  for (const campus of CAMPUSES) {
    if (!ids.has(campus.id)) continue;
    const names = [campus.name, campus.shortLabel, ...campus.aliases].filter((name) => name.length >= 4 || name === "MIT" || name === "CMU" || name === "NYU");
    for (const name of names) {
      const pattern = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`\\b${pattern}\\b`, "i").test(excerpt)) return true;
    }
  }
  return false;
}

export function isSearchIndexExcerpt(excerpt: string): boolean {
  return /search[- ]index|via search\b|search summary/i.test(excerpt);
}

/**
 * A class year parsed from "Olympiad '22" is the award year, not college graduation.
 * A name token such as "Wachen '24" still counts as a class year.
 */
export function independentCollegeGradYear(evidence: string | null | undefined, gradYear: number | null | undefined): number | null {
  if (gradYear == null || Number.isNaN(gradYear)) return null;
  if (!evidence) return gradYear;
  const text = straighten(evidence);
  const yy = String(gradYear).slice(2);
  let classToken = false;
  let awardToken = false;
  if (new RegExp(`\\bclass of\\s*'?${gradYear}\\b`, "i").test(text)) classToken = true;
  for (const match of text.matchAll(new RegExp(`\\b([A-Za-z][A-Za-z.'-]{1,40})\\s+'${yy}\\b`, "g"))) {
    const word = match[1].replace(/\./g, "").toUpperCase();
    if (AWARD_YEAR_WORDS.has(word)) awardToken = true;
    else classToken = true;
  }
  if (new RegExp(`(?:Olympiad|IMO|IOI|IPhO|IChO|IBO|USAMO|USAJMO|USACO|AIME|STS)\\s*'?${yy}\\b`, "i").test(text)) awardToken = true;
  if (new RegExp(`(?:Olympiad|IMO|IOI|IPhO|IChO|IBO|USAMO|USAJMO|USACO|AIME|STS)\\s*'?${gradYear}\\b`, "i").test(text)) awardToken = true;
  if (awardToken && !classToken) return null;
  return gradYear;
}

export type YearPlausibility = "plausible" | "implausible" | "unknown";

export function awardYearPlausible(type: PrecollegeSignalType, awardYear: number | null, collegeGradYear: number | null): YearPlausibility {
  if (awardYear == null || collegeGradYear == null) return "unknown";
  if (type === "thiel_fellow" || type === "hs_funded_founder") {
    if (awardYear >= collegeGradYear - 8 && awardYear <= collegeGradYear + 2) return "plausible";
    return "implausible";
  }
  const hsSenior = collegeGradYear - 4;
  if (awardYear >= hsSenior - 4 && awardYear <= hsSenior + 1) return "plausible";
  return "implausible";
}

export interface PrecollegeJudgement {
  ok: true;
  matchStatus: PrecollegeMatchStatus;
  year: number | null;
  label: string;
  signalType: PrecollegeSignalType;
  tier: PrecollegeTier;
}

const LABEL_WITHOUT_YEAR = new Set<PrecollegeSignalType>([
  "regeneron_sts_finalist",
  "regeneron_sts_scholar",
  "isef_grand_award",
  "nsda_nationals_finalist",
  "toc_winner",
  "hs_funded_founder",
  "conrad_challenge",
  "davidson_fellow",
  "nsda_national_rank",
  "scioly_nationals_medal",
  "rise_or_emergent",
  "coca_cola_scholar",
]);

function displayLabel(mention: PrecollegeMention, year: number | null): string {
  if (mention.label === "USACO finalist" || mention.label === "Emergent Ventures" || mention.label === "Rise") return mention.label;
  if (LABEL_WITHOUT_YEAR.has(mention.signalType)) return mention.label;
  return labelFor(mention.signalType, year ? [year] : [], metalIn(mention.label));
}

export function judgePrecollegeMention(input: {
  personName: string;
  excerpt: string;
  mention: PrecollegeMention;
  collegeGradYear: number | null;
  universityIds: string[];
}): PrecollegeJudgement | { ok: false; reason: string } {
  if (!excerptNamesPerson(input.excerpt, input.personName)) return { ok: false, reason: "name" };
  const kept: number[] = [];
  for (const year of input.mention.years) {
    if (awardYearPlausible(input.mention.signalType, year, input.collegeGradYear) === "implausible") continue;
    kept.push(year);
  }
  if (input.mention.years.length > 0 && kept.length === 0) return { ok: false, reason: "year" };
  const year = kept.length ? kept[kept.length - 1] : null;
  const plausibility = awardYearPlausible(input.mention.signalType, year, input.collegeGradYear);
  const school = universityMentioned(input.excerpt, input.universityIds);
  const confirmed = school && !isSearchIndexExcerpt(input.excerpt) && plausibility === "plausible";
  return {
    ok: true,
    matchStatus: confirmed ? "confirmed" : "likely",
    year,
    label: displayLabel(input.mention, year),
    signalType: input.mention.signalType,
    tier: input.mention.tier,
  };
}
