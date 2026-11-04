// Parsers for the Unknown sweep. A value is returned only when the page states
// it once, in a form we can quote. Two conflicting hits, a customer mention,
// or a bare guess return null so the field stays Unknown.

import { isOfficialProductHost } from "./company-link";

export interface SchoolHit {
  universityId: string;
  label: string;
  excerpt: string;
  phrase: string;
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
  { id: "univ_tau", label: "Tel Aviv University", pattern: /\btel aviv university\b/i },
  { id: "univ_technion", label: "Technion", pattern: /\btechnion\b/i },
  { id: "univ_iit_bombay", label: "IIT Bombay", pattern: /\biit bombay\b|\bindian institute of technology,? bombay\b/i },
  { id: "univ_iit_delhi", label: "IIT Delhi", pattern: /\biit delhi\b|\bindian institute of technology,? delhi\b/i },
  { id: "univ_iit_madras", label: "IIT Madras", pattern: /\biit madras\b|\bindian institute of technology,? madras\b/i },
  { id: "univ_iit_kanpur", label: "IIT Kanpur", pattern: /\biit kanpur\b|\bindian institute of technology,? kanpur\b/i },
  { id: "univ_iit_kharagpur", label: "IIT Kharagpur", pattern: /\biit kharagpur\b|\bindian institute of technology,? kharagpur\b/i },
  { id: "univ_mcgill", label: "McGill University", pattern: /\bmcgill\b/i },
  { id: "univ_tsinghua", label: "Tsinghua University", pattern: /\btsinghua\b/i },
  { id: "univ_hebrew", label: "Hebrew University", pattern: /\bhebrew university\b/i },
  { id: "univ_oxford", label: "University of Oxford", pattern: /\buniversity of oxford\b|\boxford university\b/i },
  { id: "univ_cambridge", label: "University of Cambridge", pattern: /\buniversity of cambridge\b|\bcambridge university\b/i },
  { id: "univ_western", label: "Western University", pattern: /\bwestern university\b|\buniversity of western ontario\b/i },
  { id: "univ_ubc", label: "University of British Columbia", pattern: /\buniversity of british columbia\b|\bubc\b/i },
  { id: "univ_nus", label: "National University of Singapore", pattern: /\bnational university of singapore\b/i },
  { id: "univ_reichman", label: "Reichman University", pattern: /\breichman university\b|\bidc herzliya\b/i },
  { id: "univ_bgu", label: "Ben-Gurion University", pattern: /\bben[- ]gurion university\b/i },
  { id: "univ_peking", label: "Peking University", pattern: /\bpeking university\b/i },
  { id: "univ_delhi", label: "University of Delhi", pattern: /\bdelhi university\b|\buniversity of delhi\b/i },
  { id: "univ_sydney", label: "University of Sydney", pattern: /\buniversity of sydney\b/i },
  { id: "univ_monash", label: "Monash University", pattern: /\bmonash university\b|\bmonash\b/i },
  { id: "univ_unsw", label: "UNSW", pattern: /\buniversity of new south wales\b|\bunsw\b/i },
  { id: "univ_snu", label: "Seoul National University", pattern: /\bseoul national university\b/i },
  { id: "univ_mumbai", label: "University of Mumbai", pattern: /\buniversity of mumbai\b/i },
  { id: "univ_tcd", label: "Trinity College Dublin", pattern: /\btrinity college dublin\b/i },
  { id: "univ_melbourne", label: "University of Melbourne", pattern: /\buniversity of melbourne\b/i },
  { id: "univ_lse", label: "London School of Economics", pattern: /\blondon school of economics\b/i },
  { id: "univ_imperial", label: "Imperial College London", pattern: /\bimperial college\b/i },
  { id: "univ_suny", label: "SUNY", pattern: /\bstate university of new york\b|\bsuny\b/i },
  { id: "univ_csu", label: "California State University", pattern: /\bcalifornia state university\b/i },
  { id: "univ_bits", label: "BITS Pilani", pattern: /\bbits pilani\b/i },
  { id: "univ_cbs", label: "Copenhagen Business School", pattern: /\bcopenhagen business school\b/i },
  { id: "univ_calgary", label: "University of Calgary", pattern: /\buniversity of calgary\b/i },
  { id: "univ_york", label: "York University", pattern: /(?<!new )\byork university\b/i },
  { id: "univ_ucd", label: "University College Dublin", pattern: /\buniversity college dublin\b/i },
  { id: "univ_zhejiang", label: "Zhejiang University", pattern: /\bzhejiang university\b/i },
  { id: "univ_hec", label: "HEC Paris", pattern: /\bhec paris\b/i },
  { id: "univ_insead", label: "INSEAD", pattern: /\binsead\b/i },
  { id: "univ_eth", label: "ETH Zurich", pattern: /\beth zurich\b|\beth zürich\b/i },
  { id: "univ_lbs", label: "London Business School", pattern: /\blondon business school\b/i },
  { id: "univ_ucl", label: "University College London", pattern: /\buniversity college london\b|\bucl\b/i },
  { id: "univ_tum", label: "Technical University of Munich", pattern: /\btechnical university of munich\b|\btu munich\b/i },
  { id: "univ_esade", label: "ESADE", pattern: /\besade\b/i },
  { id: "univ_iese", label: "IESE", pattern: /\biese\b/i },
  { id: "univ_delft", label: "Delft University of Technology", pattern: /\bdelft university of technology\b|\btu delft\b/i },
  { id: "univ_lund", label: "Lund University", pattern: /\blund university\b/i },
  { id: "univ_edinburgh", label: "University of Edinburgh", pattern: /\buniversity of edinburgh\b/i },
  { id: "univ_kuleuven", label: "KU Leuven", pattern: /\bku leuven\b|\buniversity of leuven\b/i },
  { id: "univ_tokyo", label: "University of Tokyo", pattern: /\buniversity of tokyo\b/i },
  { id: "univ_dtu", label: "Technical University of Denmark", pattern: /\btechnical university of denmark\b/i },
  { id: "univ_erasmus", label: "Erasmus University Rotterdam", pattern: /\berasmus university\b/i },
  { id: "univ_copenhagen", label: "University of Copenhagen", pattern: /\buniversity of copenhagen\b/i },
  { id: "univ_kth", label: "KTH", pattern: /\bkth royal institute\b/i },
  { id: "univ_amsterdam", label: "University of Amsterdam", pattern: /\buniversity of amsterdam\b/i },
  { id: "univ_bocconi", label: "Bocconi University", pattern: /\bbocconi\b/i },
  { id: "univ_essec", label: "ESSEC", pattern: /\bessec\b/i },
  { id: "univ_chalmers", label: "Chalmers", pattern: /\bchalmers\b/i },
  { id: "univ_hhs", label: "Stockholm School of Economics", pattern: /\bstockholm school of economics\b/i },
  { id: "univ_uppsala", label: "Uppsala University", pattern: /\buppsala university\b/i },
  { id: "univ_escp", label: "ESCP", pattern: /\bescp\b/i },
  { id: "univ_warwick", label: "University of Warwick", pattern: /\buniversity of warwick\b/i },
  { id: "univ_fudan", label: "Fudan University", pattern: /\bfudan university\b/i },
  { id: "univ_polytechnique", label: "École Polytechnique", pattern: /\bécole polytechnique\b|\becole polytechnique\b/i },
  { id: "univ_weizmann", label: "Weizmann Institute", pattern: /\bweizmann institute\b/i },
  { id: "univ_polimi", label: "Politecnico di Milano", pattern: /\bpolitecnico di milano\b/i },
  { id: "univ_isb", label: "Indian School of Business", pattern: /\bindian school of business\b/i },
  { id: "univ_pepperdine", label: "Pepperdine University", pattern: /\bpepperdine\b/i },
  { id: "univ_iimc", label: "IIM Calcutta", pattern: /\biim calcutta\b|\bindian institute of management,? calcutta\b/i },
  { id: "univ_iimb", label: "IIM Bangalore", pattern: /\biim bangalore\b|\bindian institute of management,? bangalore\b/i },
  { id: "univ_ceibs", label: "CEIBS", pattern: /\bceibs\b|\bchina europe international business school\b/i },
  { id: "univ_fgv", label: "FGV", pattern: /\bgetulio vargas\b|\bfundação getulio vargas\b/i },
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
    const beforeSchool = text.slice(Math.max(0, match.index - 48), match.index);
    if (/\b(lecturer|professor|faculty|researcher|researched|post-?doctoral|postdoctoral|post-?doc)\b/i.test(beforeSchool)) continue;
    if (/\binstitute of\s+$/i.test(beforeSchool)) continue;
    const justAfter = text.slice(match.index + match[0].length, match.index + match[0].length + 18);
    if (/^\s*post-?doc/i.test(justAfter)) continue;
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
    if (lastName.length >= 3) {
      const preceding = text.slice(Math.max(0, match.index - 240), match.index);
      const named = new RegExp(`\\b${lastName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(preceding);
      const firstPerson = /\b(i'm|i am|i studied|i hold|i graduated|i earned|i received|my )\b/i.test(preceding);
      if (!named && !firstPerson) continue;
      const owner = preceding.match(/([A-Z][a-zA-Z'’-]+)\s*\([^)]*$/);
      if (owner && owner[1].toLowerCase() !== lastName.toLowerCase()) continue;
      const holder = preceding.match(/([A-Z][a-zA-Z'’-]+)\s+(?:holds|has|earned|received)\b[^.]{0,50}$/);
      if (holder && holder[1].toLowerCase() !== lastName.toLowerCase()) continue;
    }
    hits.push({ universityId: school.id, label: school.label, excerpt, phrase: match[0] });
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
