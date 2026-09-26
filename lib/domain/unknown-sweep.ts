// Parsers for the Unknown sweep. A value is returned only when the page states
// it once, in a form we can quote. Two conflicting hits, a customer mention,
// or a bare guess return null so the field stays Unknown.

import { isOfficialProductHost } from "./company-link";

export interface SchoolHit {
  universityId: string;
  label: string;
  excerpt: string;
}

const SCHOOLS: { id: string; label: string; pattern: RegExp }[] = [
  { id: "univ_penn", label: "University of Pennsylvania", pattern: /\buniversity of pennsylvania\b|\bupenn\b|\bwharton\b/i },
  {
    id: "univ_berkeley",
    label: "UC Berkeley",
    pattern: /\buc berkeley\b|\bu\.c\. berkeley\b|\buniversity of california,?\s+berkeley\b|\bberkeley eecs\b|\bhaas school\b/i,
  },
  { id: "univ_stanford", label: "Stanford University", pattern: /\bstanford university\b/i },
  { id: "univ_harvard", label: "Harvard University", pattern: /\bharvard university\b|\bharvard college\b|\bharvard business school\b|\bharvard grad(?:uate)?\b/i },
  { id: "univ_mit", label: "Massachusetts Institute of Technology", pattern: /\bmassachusetts institute of technology\b|\bmit\b/i },
  { id: "univ_cmu", label: "Carnegie Mellon University", pattern: /\bcarnegie mellon(?: university)?\b/i },
  { id: "univ_princeton", label: "Princeton University", pattern: /\bprinceton university\b/i },
  { id: "univ_columbia", label: "Columbia University", pattern: /\bcolumbia university\b/i },
  { id: "univ_gatech", label: "Georgia Institute of Technology", pattern: /\bgeorgia institute of technology\b|\bgeorgia tech\b/i },
  { id: "univ_michigan", label: "University of Michigan", pattern: /\buniversity of michigan\b/i },
  { id: "univ_waterloo", label: "University of Waterloo", pattern: /\buniversity of waterloo\b|\buwaterloo\b/i },
];

const AFFILIATION_CONTEXT =
  /\b(student|students|freshm\w*|sophomore|junior|senior|studied|studying|study|alumni|alums?\b|graduated|undergrad|undergraduate|phd|ph\.d|class of|backgrounds?|researchers from|engineers from|spin-?off|degree|mba|major)\b/i;
const CUSTOMER_CONTEXT =
  /\b(using|used by|customers?|partnership with|partnered with|researchers at leading|already using|payment option|hospitals?|launched at|including the)\b/i;

function windowAround(text: string, index: number, length: number): string {
  return text
    .slice(Math.max(0, index - 110), Math.min(text.length, index + length + 110))
    .replace(/\s+/g, " ")
    .trim();
}

/** Campus named in this person's own excerpt. A customer mention, a hackathon host, or another person's school does not count. */
export function schoolHitsInPersonExcerpt(
  text: string,
  options?: { personName?: string | null; claimType?: string | null },
): SchoolHit[] {
  if (options?.claimType === "linkedin_candidate" || /school and company did not|unverified linkedin candidate/i.test(text)) return [];
  const hits: SchoolHit[] = [];
  const lastName = options?.personName?.trim().split(/\s+/).at(-1) ?? "";
  for (const school of SCHOOLS) {
    const match = school.pattern.exec(text);
    if (!match || match.index == null) continue;
    if (/\bwith\s+$/i.test(text.slice(Math.max(0, match.index - 24), match.index))) continue;
    const afterSchool = text.slice(match.index + match[0].length, match.index + match[0].length + 16);
    if (/^\s*spin-?out|^\s*spin-?off|devfest|hackathon|hackprinceton/i.test(afterSchool)) continue;
    const excerpt = windowAround(text, match.index, match[0].length);
    const customer = CUSTOMER_CONTEXT.test(excerpt);
    const affiliated = AFFILIATION_CONTEXT.test(excerpt) || /\bgrad(?:uate)?\b/i.test(excerpt);
    const atSchool = /(?:\bat|\bfrom|@)\s+$/i.test(text.slice(Math.max(0, match.index - 12), match.index));
    const employerList = /\b(previously|worked(?:\s+on)?)\b/i.test(text.slice(Math.max(0, match.index - 48), match.index));
    const ownBio = options?.claimType === "accelerator_founder" || /Bio:/i.test(text.slice(0, match.index));
    if (customer && !affiliated) continue;
    if (!affiliated && !atSchool && (!ownBio || employerList)) continue;
    const ownClaim = options?.claimType === "accelerator_founder" || options?.claimType === "source_mention";
    if (!ownClaim && lastName.length >= 3) {
      const preceding = text.slice(Math.max(0, match.index - 240), match.index);
      if (!new RegExp(`\\b${lastName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(preceding)) continue;
    }
    hits.push({ universityId: school.id, label: school.label, excerpt });
  }
  return hits;
}

export function foundedYearIn(text: string): { year: number; excerpt: string } | null {
  const matches = [...text.matchAll(/\bfounded(?:\s+in|:)?\s+((?:19|20)\d{2})\b/gi)];
  const years = [...new Set(matches.map((match) => Number(match[1])))].filter((year) => year >= 1990 && year <= 2026);
  if (years.length !== 1 || matches.length === 0) return null;
  const match = matches[0];
  return { year: years[0], excerpt: windowAround(text, match.index ?? 0, match[0].length) };
}

const PLACE_STOP = /^(the|our|a|an|their|this|its|remote|worldwide|global|online|stealth)$/i;

function cleanPlace(raw: string): string | null {
  let place = raw.replace(/\s+/g, " ").trim();
  place = place.split(/\s+(?:and|to|with|for|by|after|before)\s+/i)[0] ?? place;
  place = place.replace(/[.;].*$/, "").replace(/^(the|our|a|an|their|this|its)\s+/i, "").trim();
  if (!/^[A-Z][a-z]+/.test(place)) return null;
  if (place.length < 3 || place.length > 40) return null;
  const words = place.split(/\s+/);
  if (words.length > 4 || words.some((word) => PLACE_STOP.test(word))) return null;
  return place;
}

export function headquartersIn(text: string): { place: string; excerpt: string } | null {
  const patterns = [/\bheadquartered in ([^.]{3,60})/gi, /\bheadquarters in ([^.]{3,60})/gi, /\bbased in ([^.]{3,60})/gi];
  const hits: { place: string; excerpt: string }[] = [];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const place = cleanPlace(match[1] ?? "");
      if (!place) continue;
      hits.push({ place, excerpt: windowAround(text, match.index ?? 0, match[0].length) });
    }
  }
  const places = [...new Set(hits.map((hit) => hit.place.toLowerCase()))];
  if (places.length !== 1) return null;
  return hits[0] ?? null;
}

const LINKEDIN_SLUG_SKIP = new Set([
  "company",
  "share",
  "login",
  "school",
  "feed",
  "jobs",
  "in",
  "techcrunch",
  "hypepotamus",
  "pulse2news",
  "cardinalventures",
  "businessinsider",
  "prnewswire",
  "ycombinator",
]);

export function companyLinkedInIn(hrefs: string[]): string | null {
  const slugs = new Set<string>();
  for (const href of hrefs) {
    const match = href.match(/linkedin\.com\/company\/([A-Za-z0-9_%-]{2,})/i);
    if (!match) continue;
    const slug = decodeURIComponent(match[1]).replace(/\/$/, "").toLowerCase();
    if (LINKEDIN_SLUG_SKIP.has(slug)) continue;
    slugs.add(slug);
  }
  if (slugs.size !== 1) return null;
  return `https://www.linkedin.com/company/${[...slugs][0]}`;
}

export function teamSizeIn(text: string): { size: number; excerpt: string } | null {
  const matches = [...text.matchAll(/\b(?:team of|team size(?: of)?)\s+(\d{1,4})\b/gi)];
  const sizes = [...new Set(matches.map((match) => Number(match[1])))].filter((size) => size >= 1 && size <= 500);
  if (sizes.length !== 1 || matches.length === 0) return null;
  const match = matches[0];
  return { size: sizes[0], excerpt: windowAround(text, match.index ?? 0, match[0].length) };
}

export interface AnnouncedRaise {
  amountUsd: number;
  amountText: string;
  stage: string | null;
  excerpt: string;
}

function formatUsd(amount: number): string {
  if (amount >= 1_000_000_000) {
    const billions = amount / 1_000_000_000;
    return `$${Number.isInteger(billions) ? billions.toFixed(0) : billions.toFixed(1)}B`;
  }
  if (amount >= 1_000_000) {
    const millions = amount / 1_000_000;
    return `$${Number.isInteger(millions) ? millions.toFixed(0) : millions.toFixed(1)}M`;
  }
  if (amount >= 1_000) return `$${Math.round(amount / 1_000)}K`;
  return `$${Math.round(amount)}`;
}

function amountFrom(number: string, unit: string | undefined): number | null {
  const value = Number(number.replace(/,/g, ""));
  if (!Number.isFinite(value) || value <= 0) return null;
  const normalized = (unit ?? "").toLowerCase();
  if (normalized === "b" || normalized === "billion") return value * 1_000_000_000;
  if (normalized === "m" || normalized === "million") return value * 1_000_000;
  if (normalized === "k" || normalized === "thousand") return value * 1_000;
  if (value >= 10_000) return value;
  return null;
}

function titleStage(stage: string): string {
  const lower = stage.toLowerCase();
  if (lower === "pre-seed") return "Pre-seed";
  if (lower === "seed") return "Seed";
  return lower.replace(/\b\w/g, (char) => char.toUpperCase());
}

/** One announced raise on the page. A previous company's round, or two different raises, stays Unknown. */
export function announcedRaiseIn(text: string): AnnouncedRaise | null {
  const matches = [...text.matchAll(/\braised\s+\$(\d+(?:\.\d+)?)\s*(million|billion|m|b|k)?(?:\s+(pre-seed|seed|series\s+[a-d]))?/gi)];
  if (matches.length !== 1) return null;
  const raisedPhrases = text.match(/\braise[sd]?\s+\$|\braises\s+\$|\braising\s+\$/gi) ?? [];
  if (raisedPhrases.length !== 1) return null;
  const match = matches[0];
  const index = match.index ?? 0;
  const prior = text.slice(Math.max(0, index - 80), index);
  if (/\b(prev|previous|previously|formerly|prior company)\b/i.test(prior)) return null;
  if (/\bafter\s+(it|they|the company)\s+$/i.test(prior)) return null;
  const amountUsd = amountFrom(match[1], match[2]);
  if (amountUsd == null) return null;
  const stage = match[3] ? titleStage(match[3]) : null;
  return { amountUsd, amountText: formatUsd(amountUsd), stage, excerpt: windowAround(text, index, match[0].length) };
}

/** The page's own product link, when one anchor is labeled Website and the host is not a directory. */
export function labeledOfficialWebsite(anchors: { text: string; href: string }[]): string | null {
  const urls = new Set<string>();
  for (const anchor of anchors) {
    const label = anchor.text.replace(/\s+/g, " ").trim();
    if (!/^website$|^visit website$|^visit company$/i.test(label)) continue;
    if (!anchor.href.startsWith("http") || !isOfficialProductHost(anchor.href)) continue;
    urls.add(anchor.href.replace(/\/$/, ""));
  }
  if (urls.size !== 1) return null;
  return [...urls][0];
}

/**
 * When the stored website is a directory and the primary link is already the
 * product site, use the product site as the website and keep the directory link.
 */
const PUBLISHER_HOST = /(^|\.)(techcrunch|businessinsider|pulse2|prnewswire|hypepotamus|luma|forbes|medium|substack)\.com$|(^|\.)yespress\.io$/;

export function isPublisherPage(url: string): boolean {
  try {
    return PUBLISHER_HOST.test(new URL(url).hostname.replace(/^www\./, ""));
  } catch {
    return false;
  }
}

/** A one-word company name has to appear as its own word. Shared roundup pages fail this when they never name the company. */
export function excerptNamesCompany(excerpt: string, companyName: string): boolean {
  const name = companyName.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const tokens = name.split(" ").filter((token) => token.length >= 4 && !["company", "labs", "systems", "technologies", "inc", "llc", "the"].includes(token));
  const word = tokens[0] ?? name;
  if (word.length < 4) return false;
  return new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(excerpt);
}

export function headquartersExcerptOk(excerpt: string, companyName: string): boolean {
  return excerptNamesCompany(excerpt, companyName) || /\b(we are|we're|we’re|our)\b/i.test(excerpt);
}

export function preferOfficialWebsite(
  website: string | null,
  primary: string | null,
): { website: string; primary: string | null } | null {
  const site = primary && primary.startsWith("http") && isOfficialProductHost(primary) ? primary : null;
  if (!site) return null;
  const currentOfficial = !!website && website.startsWith("http") && isOfficialProductHost(website);
  if (currentOfficial) return null;
  return { website: site, primary: website && website.startsWith("http") ? website : primary };
}
