// Shared news types and display helpers. No database and no network.

export const NEWS_CATEGORIES = ["funding", "launch", "acquisition", "award", "profile", "other"] as const;
export type NewsCategory = (typeof NEWS_CATEGORIES)[number];

export const MATCH_CONFIDENCE = ["high", "medium", "low"] as const;
export type MatchConfidence = (typeof MATCH_CONFIDENCE)[number];

export const NEWS_SOURCE_TYPES = ["press", "social", "launch", "press_release", "campus_paper"] as const;
export type NewsSourceType = (typeof NEWS_SOURCE_TYPES)[number];

export const SOURCE_TYPE_LABEL: Record<NewsSourceType, string> = {
  press: "Press",
  social: "Social",
  launch: "Launch",
  press_release: "Press release",
  campus_paper: "Campus paper",
};

export const CATEGORY_LABEL: Record<NewsCategory, string> = {
  funding: "Funding",
  launch: "Launch",
  acquisition: "Acquisition",
  award: "Award",
  profile: "Profile",
  other: "Other",
};

export interface NewsParty {
  id: string;
  name: string;
  tier: string | null;
}

export interface NewsCampus {
  id: string;
  name: string;
}

export interface NewsListItem {
  id: string;
  headline: string;
  url: string;
  sourceName: string;
  publishedAt: string | null;
  snippet: string | null;
  category: NewsCategory;
  confidence: MatchConfidence;
  feed: string;
  sourceType: NewsSourceType;
  startups: NewsParty[];
  founders: NewsParty[];
  campuses: NewsCampus[];
}

export function isNewsCategory(value: string | null | undefined): value is NewsCategory {
  return NEWS_CATEGORIES.includes(value as NewsCategory);
}

export function isNewsSourceType(value: string | null | undefined): value is NewsSourceType {
  return NEWS_SOURCE_TYPES.includes(value as NewsSourceType);
}

const CAMPUS_TEXT =
  /thedp\.com|daily pennsylvanian|dailycal\.org|daily californian|thecrimson\.com|harvard crimson|stanforddaily\.com|stanford daily|michigandaily\.com|michigan daily|yaledailynews\.com|yale daily news|dailyprincetonian\.com|daily princetonian|columbiaspectator\.com|columbia daily spectator|browndailyherald\.com|brown daily herald|cornellsun\.com|cornell daily sun|dukechronicle\.com|duke chronicle|uwimprint\.ca|chicagomaroon\.com|chicago maroon|thetech\.com/i;

export function classifySourceType(input: { feed: string; sourceName: string; url: string; title: string }): NewsSourceType {
  const blob = `${input.sourceName}\n${input.url}\n${input.title}`;
  const source = input.sourceName.trim().toLowerCase();
  if (input.feed === "campus_press" || source === "the tech" || source === "imprint" || CAMPUS_TEXT.test(blob)) return "campus_paper";
  if (input.feed === "press_release" || /prnewswire\.com|businesswire\.com|globenewswire\.com|pr newswire|business wire/i.test(blob)) return "press_release";
  if (
    input.feed === "yc_launch" ||
    input.feed === "product_hunt" ||
    /producthunt\.com|ycombinator\.com\/launches/i.test(blob) ||
    /^(launch hn|show hn)\b/i.test(input.title)
  ) {
    return "launch";
  }
  if (
    input.feed === "reddit" ||
    input.feed === "x" ||
    input.feed === "hacker_news" ||
    /reddit\.com/i.test(blob) ||
    /\s[-|]\s*(x\.com|twitter\.com)\s*$/i.test(input.title) ||
    /twitter\.com|(?:^|\/|\.)x\.com/i.test(input.url) ||
    source === "x" ||
    source === "twitter"
  ) {
    return "social";
  }
  return "press";
}

export function confidenceRank(value: MatchConfidence): number {
  if (value === "high") return 3;
  if (value === "medium") return 2;
  return 1;
}

export function strongerConfidence(a: MatchConfidence, b: MatchConfidence): MatchConfidence {
  return confidenceRank(a) >= confidenceRank(b) ? a : b;
}

export function newsDayKey(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function newsDayLabel(iso: string | null): string {
  if (!iso) return "Date unknown";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Date unknown";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function newsShortDate(iso: string | null): string {
  if (!iso) return "Date unknown";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Date unknown";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
