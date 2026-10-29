// Fetch public news for startups and founders already in campus-universe.db.
//
// Free sources only. Google News RSS, plus site: search for TechCrunch, Axios
// Pro Rata, Business Insider, Forbes (30 Under 30), Fortune Term Sheet,
// VentureBeat, The Information, Crunchbase News, PR Newswire, and Business Wire.
// Outlet RSS where the publisher serves one. Hacker News, public YC launch
// posts (Bookface is login-only), Product Hunt, Reddit Atom feeds (the public
// JSON is blocked), campus papers, and company blog RSS. X has no free API:
// try a public Nitter mirror, then Google News and Bing site:x.com /
// site:twitter.com snippets, and skip X if none of those return a feed.
// A headline is stored only when the startup name appears with a founder,
// school, or company domain.
//
// Idempotent and resumable. Re-running skips targets fetched inside
// --fresh-hours unless the last attempt errored. Shared feeds always refresh.
//
//   npm run news:fetch
//   npm run news:fetch -- --limit 20
//   npm run news:fetch -- --feeds-only
//   npm run news:fetch -- --priority-only --max-targets 400 --fresh-hours 24
//
// Priority is Penn and Berkeley, then S/S+/A signal tiers, then funded startups.
// The daily GitHub Action uses --priority-only --max-targets 400 so the job
// stays inside the free Actions minute quota. A full local run has no cap.

import { CAMPUSES } from "../../lib/domain/campuses";
import { getDb, newId, nowIso } from "../../lib/db/client";
import {
  articleKey,
  classifyCategory,
  domainNeedles,
  isAmbiguousName,
  matchArticle,
  schoolPhrases,
  searchableName,
  tokensOf,
  type NewsEntity,
  type NewsFounderRef,
} from "../../lib/domain/news-match";
import { parseRss, plainText, type RssItem } from "../../lib/domain/news-rss";
import type { MatchConfidence } from "../../lib/domain/news-types";
import { classifySourceType, strongerConfidence } from "../../lib/domain/news-types";

const UA = "CampusScout/1.0 (news fetch; student sourcing)";

const CAMPUS_RSS: { key: string; sourceName: string; url: string }[] = [
  { key: "crimson", sourceName: "The Harvard Crimson", url: "https://www.thecrimson.com/feeds/section/news/" },
  { key: "stanford-daily", sourceName: "The Stanford Daily", url: "https://stanforddaily.com/feed/" },
  { key: "the-tech", sourceName: "The Tech", url: "https://thetech.com/feed" },
  { key: "michigan-daily", sourceName: "The Michigan Daily", url: "https://www.michigandaily.com/feed/" },
  { key: "imprint", sourceName: "Imprint", url: "https://uwimprint.ca/feed/" },
  { key: "chicago-maroon", sourceName: "Chicago Maroon", url: "https://chicagomaroon.com/feed" },
];

const CAMPUS_SITES: { key: string; sourceName: string; site: string }[] = [
  { key: "dp", sourceName: "The Daily Pennsylvanian", site: "thedp.com" },
  { key: "dailycal", sourceName: "The Daily Californian", site: "dailycal.org" },
  { key: "stanford-daily-site", sourceName: "The Stanford Daily", site: "stanforddaily.com" },
  { key: "crimson-site", sourceName: "The Harvard Crimson", site: "thecrimson.com" },
  { key: "the-tech-site", sourceName: "The Tech", site: "thetech.com" },
  { key: "yale-daily", sourceName: "Yale Daily News", site: "yaledailynews.com" },
  { key: "princetonian", sourceName: "The Daily Princetonian", site: "dailyprincetonian.com" },
  { key: "spectator", sourceName: "Columbia Daily Spectator", site: "columbiaspectator.com" },
  { key: "brown-herald", sourceName: "Brown Daily Herald", site: "browndailyherald.com" },
  { key: "cornell-sun", sourceName: "Cornell Daily Sun", site: "cornellsun.com" },
  { key: "chronicle", sourceName: "The Chronicle", site: "dukechronicle.com" },
  { key: "imprint-site", sourceName: "Imprint", site: "uwimprint.ca" },
];

const OUTLET_RSS: { key: string; sourceName: string; url: string; feed: string }[] = [
  { key: "business-insider", sourceName: "Business Insider", url: "https://www.businessinsider.com/rss", feed: "business_insider" },
  { key: "forbes", sourceName: "Forbes", url: "https://www.forbes.com/innovation/feed2", feed: "forbes" },
  { key: "fortune", sourceName: "Fortune", url: "https://fortune.com/feed/", feed: "fortune" },
  { key: "the-information", sourceName: "The Information", url: "https://www.theinformation.com/feed", feed: "the_information" },
  { key: "crunchbase", sourceName: "Crunchbase News", url: "https://news.crunchbase.com/feed/", feed: "crunchbase" },
  { key: "prnewswire", sourceName: "PR Newswire", url: "https://www.prnewswire.com/rss/news-releases-list.rss", feed: "press_release" },
  { key: "businesswire", sourceName: "Business Wire", url: "https://feed.businesswire.com/rss/home/?rss=G1QFDERJXkJeEFpQWg==", feed: "press_release" },
  { key: "product-hunt", sourceName: "Product Hunt", url: "https://www.producthunt.com/feed", feed: "product_hunt" },
  { key: "venturebeat", sourceName: "VentureBeat", url: "https://venturebeat.com/feed/", feed: "venturebeat" },
];

const OUTLET_SITES: { key: string; sourceName: string; feed: string; query: string }[] = [
  { key: "tc-site", sourceName: "TechCrunch", feed: "techcrunch", query: "site:techcrunch.com (startup OR raises OR launched OR founder)" },
  { key: "axios", sourceName: "Axios", feed: "axios", query: 'site:axios.com ("Pro Rata" OR raises OR startup)' },
  { key: "bi-site", sourceName: "Business Insider", feed: "business_insider", query: "site:businessinsider.com (startup OR raises OR founder)" },
  { key: "forbes-30", sourceName: "Forbes", feed: "forbes", query: 'site:forbes.com ("30 Under 30" OR startup)' },
  { key: "fortune-ts", sourceName: "Fortune", feed: "fortune", query: 'site:fortune.com ("Term Sheet" OR raises OR startup)' },
  { key: "vb-site", sourceName: "VentureBeat", feed: "venturebeat", query: "site:venturebeat.com (startup OR raises OR launched)" },
  { key: "info-site", sourceName: "The Information", feed: "the_information", query: "site:theinformation.com (startup OR raises OR founder)" },
  { key: "cb-site", sourceName: "Crunchbase News", feed: "crunchbase", query: "site:news.crunchbase.com (raises OR startup OR seed)" },
  { key: "prn-site", sourceName: "PR Newswire", feed: "press_release", query: "site:prnewswire.com (startup OR raises OR launched)" },
  { key: "bw-site", sourceName: "Business Wire", feed: "press_release", query: "site:businesswire.com (startup OR raises OR launched)" },
  { key: "reddit-site", sourceName: "Reddit", feed: "reddit", query: 'site:reddit.com ("r/startups" OR "r/ycombinator" OR "r/venturecapital")' },
  { key: "x-site", sourceName: "X", feed: "x", query: "site:x.com (startup OR raises OR launched OR founder)" },
  { key: "twitter-site", sourceName: "X", feed: "x", query: "site:twitter.com (startup OR raises OR launched OR founder)" },
];

const REDDIT_FEEDS: { key: string; url: string }[] = [
  { key: "startups", url: "https://www.reddit.com/r/startups/new/.rss" },
  { key: "ycombinator", url: "https://www.reddit.com/r/ycombinator/new/.rss" },
  { key: "entrepreneur", url: "https://www.reddit.com/r/Entrepreneur/new/.rss" },
  { key: "venturecapital", url: "https://www.reddit.com/r/venturecapital/new/.rss" },
];

const X_MIRRORS = ["https://nitter.tiekoetter.com/search/rss?f=tweets&q=startup"];

const PRESS_ALIASES: Record<string, string[]> = {
  univ_penn: ["Wharton", "UPenn"],
  univ_berkeley: ["UC Berkeley"],
};

interface LoadedCompany extends NewsEntity {
  tier: string | null;
  universityIds: string[];
  funded: boolean;
  score: number;
  websiteUrl: string | null;
}

interface LoadedFounder {
  personId: string;
  name: string;
  tier: string | null;
  verified: boolean;
  universityIds: string[];
  companies: { projectId: string; name: string }[];
  schoolPhrases: string[];
  score: number;
}

interface Incoming {
  title: string;
  url: string;
  publishedAt: string | null;
  snippet: string;
  sourceName: string;
  feed: string;
}

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(
  url: string,
  accept = "application/rss+xml, application/xml, text/xml, */*",
  timeoutMs = 20000
): Promise<{ status: number; body: string; headers: Headers }> {
  const response = await fetch(url, {
    headers: { "user-agent": UA, accept },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });
  const body = await response.text();
  return { status: response.status, body, headers: response.headers };
}

let googleChain: Promise<void> = Promise.resolve();
let googleEnabled = true;
let googleFailures = 0;
let xMirrorStatus = "not-tried";
let xSearchItems = 0;
let redditStatus = "not-tried";

function googleTurn<T>(fn: () => Promise<T>): Promise<T> {
  const run = googleChain.then(async () => {
    await sleep(220);
    return fn();
  });
  googleChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function noteGoogleFailure(status: number, body: string): void {
  googleFailures += 1;
  const blocked = status === 429 || status === 503 || /captcha|unusual traffic/i.test(body.slice(0, 500));
  if (blocked || googleFailures >= 8) {
    googleEnabled = false;
    console.warn(`[news] Google News paused after ${googleFailures} failures (last status ${status}).`);
  }
}

async function googleRss(query: string): Promise<RssItem[]> {
  if (!googleEnabled) return [];
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const { status, body } = await googleTurn(() => fetchText(url));
  if (status !== 200 || !body.includes("<rss")) {
    noteGoogleFailure(status, body);
    throw new Error(`google news ${status}`);
  }
  googleFailures = 0;
  return parseRss(body);
}

function quote(value: string): string {
  return `"${value.replace(/"/g, "").trim()}"`;
}

function companyQuery(company: LoadedCompany): string {
  const ors = company.founders.slice(0, 2).map((founder) => quote(founder.name));
  if (company.schoolPhrases[0]) ors.push(quote(company.schoolPhrases[0]));
  ors.push("startup");
  return `${quote(company.names[0])} (${ors.join(" OR ")})`;
}

function founderQuery(founder: LoadedFounder): string {
  const ors = founder.companies.slice(0, 2).map((company) => quote(company.name));
  if (founder.schoolPhrases[0]) ors.push(quote(founder.schoolPhrases[0]));
  ors.push("startup");
  return `${quote(founder.name)} (${ors.join(" OR ")})`;
}

async function hackerNews(query: string): Promise<Incoming[]> {
  const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=8`;
  const { status, body } = await fetchText(url, "application/json");
  if (status !== 200) throw new Error(`hacker news ${status}`);
  const parsed = JSON.parse(body) as {
    hits?: { title?: string; url?: string | null; story_text?: string | null; created_at?: string; objectID?: string }[];
  };
  const items: Incoming[] = [];
  for (const hit of parsed.hits ?? []) {
    const title = (hit.title ?? "").trim();
    const link = hit.url || (hit.objectID ? `https://news.ycombinator.com/item?id=${hit.objectID}` : "");
    if (!title || !link.startsWith("http")) continue;
    const snippet = plainText(hit.story_text ?? "").slice(0, 400);
    items.push({
      title: title.slice(0, 300),
      url: link,
      publishedAt: hit.created_at ?? null,
      snippet,
      sourceName: "Hacker News",
      feed: "hacker_news",
    });
  }
  return items;
}

function fromRss(items: RssItem[], sourceName: string, feed: string): Incoming[] {
  return items.map((item) => ({
    title: item.title,
    url: item.link,
    publishedAt: item.publishedAt,
    snippet: item.snippet,
    sourceName: item.sourceName || sourceName,
    feed,
  }));
}

function aliasesOf(json: string): string[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string" && searchableName(item) && !/^https?:/i.test(item));
  } catch {
    return [];
  }
}

function loadCompanies(db: ReturnType<typeof getDb>): LoadedCompany[] {
  const funded = new Set(
    (
      db
        .prepare(
          `SELECT project_id FROM funding_events
           UNION
           SELECT project_id FROM company_facts
           WHERE fact_key IN ('funding_total', 'funding_round') AND (amount_usd IS NOT NULL OR amount_status = 'announced')`
        )
        .all() as { project_id: string }[]
    ).map((row) => row.project_id)
  );
  const projects = db
    .prepare(
      `SELECT id, name, aliases_json, website_url, signal_tier
       FROM projects WHERE kind = 'company'`
    )
    .all() as { id: string; name: string; aliases_json: string; website_url: string | null; signal_tier: string | null }[];
  const roles = db
    .prepare(
      `SELECT r.project_id, pe.id AS person_id, pe.name
       FROM person_project_roles r
       JOIN people pe ON pe.id = r.person_id
       WHERE lower(COALESCE(r.role, '')) LIKE '%founder%'`
    )
    .all() as { project_id: string; person_id: string; name: string }[];
  const affs = db
    .prepare(`SELECT person_id, university_id FROM affiliations`)
    .all() as { person_id: string; university_id: string }[];
  const universities = db.prepare(`SELECT id, name FROM universities`).all() as { id: string; name: string }[];
  const uniName = new Map(universities.map((row) => [row.id, row.name]));
  const campusById = new Map(CAMPUSES.map((campus) => [campus.id, campus]));
  const affByPerson = new Map<string, string[]>();
  for (const row of affs) {
    const list = affByPerson.get(row.person_id) ?? [];
    list.push(row.university_id);
    affByPerson.set(row.person_id, list);
  }
  const foundersByProject = new Map<string, NewsFounderRef[]>();
  for (const row of roles) {
    if (tokensOf(row.name).length < 2) continue;
    const list = foundersByProject.get(row.project_id) ?? [];
    if (!list.some((founder) => founder.personId === row.person_id)) list.push({ personId: row.person_id, name: row.name });
    foundersByProject.set(row.project_id, list);
  }

  const companies: LoadedCompany[] = [];
  for (const project of projects) {
    const founders = foundersByProject.get(project.id) ?? [];
    const universityIds = [...new Set(founders.flatMap((founder) => affByPerson.get(founder.personId) ?? []))];
    const phrases: string[] = [];
    for (const universityId of universityIds) {
      const campus = campusById.get(universityId);
      phrases.push(
        ...schoolPhrases({
          name: uniName.get(universityId) ?? campus?.name,
          shortLabel: campus?.shortLabel,
          aliases: [...(campus?.aliases ?? []), ...(PRESS_ALIASES[universityId] ?? [])],
        })
      );
    }
    const names = [...new Set([project.name, ...aliasesOf(project.aliases_json)].map((name) => name.trim()).filter(Boolean))];
    const entity: LoadedCompany = {
      projectId: project.id,
      names,
      founders,
      schoolPhrases: [...new Set(phrases)],
      domains: domainNeedles(project.website_url),
      tier: project.signal_tier,
      universityIds,
      funded: funded.has(project.id),
      score: 0,
      websiteUrl: project.website_url,
    };
    if (!indexable(entity)) continue;
    entity.score = companyScore(entity);
    companies.push(entity);
  }
  companies.sort((a, b) => b.score - a.score || a.names[0].localeCompare(b.names[0]));
  return companies;
}

function indexable(entity: NewsEntity): boolean {
  if (!entity.names.some((name) => searchableName(name))) return false;
  const founder = entity.founders.some((item) => tokensOf(item.name).length >= 2);
  if (founder || entity.domains.length > 0) return true;
  return entity.names.some((name) => !isAmbiguousName(name)) && entity.schoolPhrases.length > 0;
}

function companyScore(company: LoadedCompany): number {
  let score = 0;
  if (company.universityIds.includes("univ_penn")) score += 10000;
  if (company.universityIds.includes("univ_berkeley")) score += 9000;
  if (company.universityIds.some((id) => id === "univ_stanford" || id === "univ_mit" || id === "univ_harvard")) score += 2000;
  if (company.tier === "S+" || company.tier === "S") score += 5000;
  else if (company.tier === "A") score += 4000;
  else if (company.tier === "B") score += 800;
  if (company.funded) score += 3000;
  if (company.domains.length) score += 200;
  return score;
}

function loadFounders(db: ReturnType<typeof getDb>, companies: LoadedCompany[]): LoadedFounder[] {
  const people = db
    .prepare(`SELECT id, name, signal_tier, verification_status FROM people`)
    .all() as { id: string; name: string; signal_tier: string | null; verification_status: string | null }[];
  const byId = new Map(people.map((person) => [person.id, person]));
  const companyById = new Map(companies.map((company) => [company.projectId, company]));
  const grouped = new Map<string, LoadedFounder>();
  for (const company of companies) {
    for (const founder of company.founders) {
      const person = byId.get(founder.personId);
      if (!person) continue;
      const tierOk = person.signal_tier === "S+" || person.signal_tier === "S" || person.signal_tier === "A";
      const verified = person.verification_status === "confirmed" || person.verification_status === "partial";
      if (!tierOk && !verified) continue;
      if (tokensOf(person.name).length < 2) continue;
      let row = grouped.get(person.id);
      if (!row) {
        row = {
          personId: person.id,
          name: person.name,
          tier: person.signal_tier,
          verified,
          universityIds: [...company.universityIds],
          companies: [],
          schoolPhrases: [...company.schoolPhrases],
          score: 0,
        };
        grouped.set(person.id, row);
      }
      if (!row.companies.some((item) => item.projectId === company.projectId)) {
        row.companies.push({ projectId: company.projectId, name: company.names[0] });
      }
      for (const universityId of company.universityIds) {
        if (!row.universityIds.includes(universityId)) row.universityIds.push(universityId);
      }
      const linked = companyById.get(company.projectId);
      if (linked) {
        for (const phrase of linked.schoolPhrases) {
          if (!row.schoolPhrases.includes(phrase)) row.schoolPhrases.push(phrase);
        }
      }
    }
  }
  const founders = [...grouped.values()];
  for (const founder of founders) {
    let score = 0;
    if (founder.universityIds.includes("univ_penn")) score += 10000;
    if (founder.universityIds.includes("univ_berkeley")) score += 9000;
    if (founder.tier === "S+" || founder.tier === "S") score += 5000;
    else if (founder.tier === "A") score += 4000;
    if (founder.verified) score += 400;
    if (founder.companies.some((company) => companyById.get(company.projectId)?.funded)) score += 3000;
    founder.score = score;
  }
  founders.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return founders;
}

function isPriorityCompany(company: LoadedCompany): boolean {
  return company.score >= 2000;
}

function isPriorityFounder(founder: LoadedFounder): boolean {
  return founder.score >= 2000;
}

function backfillSourceTypes(db: ReturnType<typeof getDb>) {
  const rows = db.prepare(`SELECT id, feed, source_name, url, headline, source_type FROM news_articles`).all() as {
    id: string;
    feed: string;
    source_name: string;
    url: string;
    headline: string;
    source_type: string;
  }[];
  const update = db.prepare(`UPDATE news_articles SET source_type = ? WHERE id = ?`);
  const changed = db.transaction(() => {
    let n = 0;
    for (const row of rows) {
      const next = classifySourceType({ feed: row.feed, sourceName: row.source_name, url: row.url, title: row.headline });
      if (next === row.source_type) continue;
      update.run(next, row.id);
      n += 1;
    }
    return n;
  })();
  if (changed) console.log(`[news] retagged ${changed} articles with a source type`);
}

function blogUrls(website: string | null): string[] {
  if (!website) return [];
  let parsed: URL;
  try {
    parsed = new URL(website.startsWith("http") ? website : `https://${website}`);
  } catch {
    return [];
  }
  const host = parsed.hostname.replace(/^www\./, "");
  if (/(^|\.)(linkedin|twitter|facebook|instagram|github|youtube|tiktok|google|notion)\./.test(host) || host === "x.com" || host === "t.co") return [];
  const origin = `${parsed.protocol}//${parsed.host}`;
  return ["/feed", "/rss", "/feed.xml", "/blog/feed", "/blog/rss.xml", "/rss.xml"].map((path) => origin + path);
}

async function readCompanyBlog(name: string, urls: string[]): Promise<Incoming[]> {
  for (const url of urls) {
    try {
      const { status, body } = await fetchText(url, "application/rss+xml, application/atom+xml, application/xml, text/xml, */*", 8000);
      if (status !== 200 || !/<(rss|feed)\b/i.test(body.slice(0, 500))) continue;
      const items = parseRss(body);
      if (!items.length) continue;
      return fromRss(items, `${name} blog`, "company_blog");
    } catch {
      continue;
    }
  }
  return [];
}

function refilter(db: ReturnType<typeof getDb>, companies: LoadedCompany[]) {
  const articles = db.prepare(`SELECT id, headline, snippet, source_name, published_at, url, feed FROM news_articles`).all() as {
    id: string;
    headline: string;
    snippet: string | null;
    source_name: string;
    published_at: string | null;
    url: string;
    feed: string;
  }[];
  const removeMentions = db.prepare(`DELETE FROM news_mentions WHERE article_id = ?`);
  const removeArticle = db.prepare(`DELETE FROM news_articles WHERE id = ?`);
  const setConfidence = db.prepare(`UPDATE news_articles SET match_confidence = ? WHERE id = ?`);
  const insertMention = db.prepare(
    `INSERT INTO news_mentions (id, article_id, project_id, person_id, match_confidence, match_reason) VALUES (?, ?, ?, ?, ?, ?)`
  );
  let dropped = 0;
  const apply = db.transaction(() => {
    for (const article of articles) {
      const matches = matchArticle(article.headline, article.snippet ?? "", companies);
      removeMentions.run(article.id);
      if (matches.length === 0) {
        removeArticle.run(article.id);
        dropped += 1;
        continue;
      }
      const confidence = matches.reduce<MatchConfidence>((best, match) => strongerConfidence(best, match.confidence), "low");
      setConfidence.run(confidence, article.id);
      for (const match of matches) {
        const people = match.personIds.length ? match.personIds : [""];
        for (const personId of people) insertMention.run(newId("nmen"), article.id, match.projectId, personId, match.confidence, match.reason);
      }
    }
  });
  apply();
  console.log(`[news] refilter kept ${articles.length - dropped}, dropped ${dropped}`);
}

async function main() {
  const limit = Number(argValue("--limit") ?? "0");
  const freshHours = Number(argValue("--fresh-hours") ?? "20");
  const maxTargets = Number(argValue("--max-targets") ?? "0");
  const feedsOnly = hasFlag("--feeds-only");
  const priorityOnly = hasFlag("--priority-only");
  const freshMs = freshHours * 60 * 60 * 1000;

  const db = getDb();
  db.pragma("journal_mode = WAL");
  backfillSourceTypes(db);
  const companies = loadCompanies(db);
  const founders = loadFounders(db, companies);
  if (hasFlag("--refilter")) {
    refilter(db, companies);
    report(db);
    db.pragma("wal_checkpoint(TRUNCATE)");
    return;
  }
  const companyPool = (priorityOnly ? companies.filter(isPriorityCompany) : companies).slice(0, limit > 0 ? limit : undefined);
  const founderPool = (priorityOnly ? founders.filter(isPriorityFounder) : founders).slice(0, limit > 0 ? limit : undefined);
  console.log(`[news] ${companies.length} searchable startups, ${founders.length} founder queries. This run: ${companyPool.length} startups, ${founderPool.length} founders.`);

  const insertArticle = db.prepare(
    `INSERT INTO news_articles (id, url_key, url, headline, source_name, published_at, snippet, category, feed, source_type, match_confidence, fetched_at)
     VALUES (@id, @url_key, @url, @headline, @source_name, @published_at, @snippet, @category, @feed, @source_type, @match_confidence, @fetched_at)
     ON CONFLICT(url_key) DO UPDATE SET
       headline = excluded.headline,
       source_name = excluded.source_name,
       published_at = COALESCE(excluded.published_at, news_articles.published_at),
       snippet = CASE WHEN length(COALESCE(excluded.snippet, '')) > length(COALESCE(news_articles.snippet, '')) THEN excluded.snippet ELSE news_articles.snippet END,
       category = excluded.category,
       feed = excluded.feed,
       source_type = excluded.source_type,
       url = CASE WHEN news_articles.url LIKE '%news.google.com%' AND excluded.url NOT LIKE '%news.google.com%' THEN excluded.url ELSE news_articles.url END,
       match_confidence = CASE
         WHEN news_articles.match_confidence = 'high' OR excluded.match_confidence = 'high' THEN 'high'
         WHEN news_articles.match_confidence = 'medium' OR excluded.match_confidence = 'medium' THEN 'medium'
         ELSE excluded.match_confidence
       END,
       fetched_at = excluded.fetched_at
     RETURNING id`
  );
  const findMention = db.prepare(
    `SELECT id, match_confidence FROM news_mentions WHERE article_id = ? AND project_id = ? AND person_id = ?`
  );
  const insertMention = db.prepare(
    `INSERT INTO news_mentions (id, article_id, project_id, person_id, match_confidence, match_reason)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const updateMention = db.prepare(`UPDATE news_mentions SET match_confidence = ?, match_reason = ? WHERE id = ?`);
  const markLog = db.prepare(
    `INSERT INTO news_fetch_log (target_key, fetched_at, status, article_count, error)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(target_key) DO UPDATE SET fetched_at = excluded.fetched_at, status = excluded.status, article_count = excluded.article_count, error = excluded.error`
  );
  const readLog = db.prepare(`SELECT fetched_at, status FROM news_fetch_log WHERE target_key = ?`);

  function fresh(key: string): boolean {
    const row = readLog.get(key) as { fetched_at: string; status: string } | undefined;
    if (!row || row.status === "error") return false;
    return Date.now() - new Date(row.fetched_at).getTime() < freshMs;
  }

  const saveIncoming = db.transaction((items: Incoming[]) => {
    let stored = 0;
    for (const item of items) {
      const matches = matchArticle(item.title, item.snippet, companies);
      if (matches.length === 0) continue;
      const confidence = matches.reduce<MatchConfidence>((best, match) => strongerConfidence(best, match.confidence), "low");
      const row = insertArticle.get({
        id: newId("news"),
        url_key: articleKey({ url: item.url, headline: item.title, sourceName: item.sourceName, publishedAt: item.publishedAt }),
        url: item.url,
        headline: item.title,
        source_name: item.sourceName,
        published_at: item.publishedAt,
        snippet: item.snippet || null,
        category: classifyCategory(item.title, item.snippet),
        feed: item.feed,
        source_type: classifySourceType({ feed: item.feed, sourceName: item.sourceName, url: item.url, title: item.title }),
        match_confidence: confidence,
        fetched_at: nowIso(),
      }) as { id: string };
      for (const match of matches) {
        const people = match.personIds.length ? match.personIds : [""];
        for (const personId of people) {
          const existing = findMention.get(row.id, match.projectId, personId) as { id: string; match_confidence: MatchConfidence } | undefined;
          if (!existing) {
            insertMention.run(newId("nmen"), row.id, match.projectId, personId, match.confidence, match.reason);
          } else if (strongerConfidence(existing.match_confidence, match.confidence) === match.confidence && existing.match_confidence !== match.confidence) {
            updateMention.run(match.confidence, match.reason, existing.id);
          }
        }
      }
      stored += 1;
    }
    return stored;
  });

  async function runFeed(key: string, load: () => Promise<Incoming[]>): Promise<void> {
    try {
      const items = await load();
      const stored = saveIncoming(items);
      markLog.run(`feed:${key}`, nowIso(), "ok", stored, null);
      console.log(`[news] feed ${key}: ${items.length} items, ${stored} matched`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      markLog.run(`feed:${key}`, nowIso(), "error", 0, message.slice(0, 300));
      console.warn(`[news] feed ${key} failed: ${message}`);
    }
  }

  await runFeed("techcrunch", async () => {
    const main = await fetchText("https://techcrunch.com/feed/");
    const startups = await fetchText("https://techcrunch.com/category/startups/feed/");
    return [
      ...fromRss(parseRss(main.body), "TechCrunch", "techcrunch"),
      ...fromRss(parseRss(startups.body), "TechCrunch", "techcrunch"),
    ];
  });
  await runFeed("hn-front", async () => {
    const rss = await fetchText("https://news.ycombinator.com/rss");
    return fromRss(parseRss(rss.body), "Hacker News", "hacker_news");
  });
  for (const paper of CAMPUS_RSS) {
    await runFeed(`rss:${paper.key}`, async () => fromRss(parseRss((await fetchText(paper.url)).body), paper.sourceName, "campus_press"));
  }
  for (const paper of CAMPUS_SITES) {
    await runFeed(`site:${paper.key}`, async () => {
      const items = await googleRss(`site:${paper.site} (startup OR founder OR raises OR launched OR seed)`);
      return fromRss(items, paper.sourceName, "campus_press");
    });
  }
  await runFeed("hn-launch", async () => {
    const items: Incoming[] = [];
    for (let page = 0; page < 5; page += 1) {
      const { status, body } = await fetchText(
        `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent("Launch HN")}&tags=story&hitsPerPage=50&page=${page}`,
        "application/json"
      );
      if (status !== 200) throw new Error(`launch hn ${status}`);
      const parsed = JSON.parse(body) as { hits?: { title?: string; url?: string | null; created_at?: string; objectID?: string; story_text?: string | null }[] };
      for (const hit of parsed.hits ?? []) {
        const title = (hit.title ?? "").trim();
        const link = hit.url || (hit.objectID ? `https://news.ycombinator.com/item?id=${hit.objectID}` : "");
        if (!title || !link.startsWith("http")) continue;
        items.push({
          title: title.slice(0, 300),
          url: link,
          publishedAt: hit.created_at ?? null,
          snippet: plainText(hit.story_text ?? "").slice(0, 400),
          sourceName: "Hacker News",
          feed: "hacker_news",
        });
      }
      await sleep(150);
    }
    return items;
  });
  await runFeed("yc-launches", async () => {
    const items: Incoming[] = [];
    let pages = 1;
    for (let page = 0; page < pages && page < 20; page += 1) {
      const { status, body } = await fetchText(`https://www.ycombinator.com/launches?page=${page}`, "application/json");
      if (status !== 200 || !body.trim().startsWith("{")) break;
      const parsed = JSON.parse(body) as {
        nbPages?: number;
        hits?: { title?: string; tagline?: string; created_at?: string; search_path?: string; slug?: string; company?: { name?: string; url?: string } }[];
      };
      if (parsed.nbPages) pages = Math.min(parsed.nbPages, 20);
      for (const hit of parsed.hits ?? []) {
        const company = hit.company?.name?.trim() ?? "";
        const title = (hit.title ?? "").trim();
        if (!company || !title) continue;
        const path = hit.search_path?.startsWith("http")
          ? hit.search_path
          : `https://www.ycombinator.com/launches/${hit.slug ?? ""}`;
        const headline = title.toLowerCase().includes(company.toLowerCase()) ? title : `${company}: ${title}`;
        const snippet = [hit.tagline, hit.company?.url].filter(Boolean).join(" ").slice(0, 400);
        items.push({
          title: headline.slice(0, 300),
          url: path,
          publishedAt: hit.created_at ?? null,
          snippet,
          sourceName: "Y Combinator",
          feed: "yc_launch",
        });
      }
      await sleep(120);
    }
    return items;
  });

  for (const outlet of OUTLET_RSS) {
    await runFeed(`rss:${outlet.key}`, async () => fromRss(parseRss((await fetchText(outlet.url)).body), outlet.sourceName, outlet.feed));
  }
  for (const outlet of OUTLET_SITES) {
    await runFeed(`site:${outlet.key}`, async () => {
      const items = fromRss(await googleRss(outlet.query), outlet.sourceName, outlet.feed);
      if (outlet.feed === "x") xSearchItems += items.length;
      return items;
    });
  }
  await runFeed("bing-x", async () => {
    const query = "site:x.com (startup OR raises OR launched)";
    const { status, body } = await fetchText(`https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=RSS`);
    if (status !== 200) throw new Error(`bing ${status}`);
    const items = fromRss(parseRss(body), "X", "x");
    xSearchItems += items.length;
    return items;
  });
  await runFeed("bing-twitter", async () => {
    const query = "site:twitter.com (startup OR raises OR launched)";
    const { status, body } = await fetchText(`https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=RSS`);
    if (status !== 200) throw new Error(`bing ${status}`);
    const items = fromRss(parseRss(body), "X", "x");
    xSearchItems += items.length;
    return items;
  });

  let mirrorItems = 0;
  for (const url of X_MIRRORS) {
    try {
      const { status, body } = await fetchText(url, "application/rss+xml, application/atom+xml, application/xml, text/xml, */*", 12000);
      const parsed = status === 200 ? parseRss(body) : [];
      mirrorItems += parsed.length;
      if (parsed.length) {
        const stored = saveIncoming(fromRss(parsed, "X", "x"));
        console.log(`[news] x mirror matched ${stored} of ${parsed.length}`);
      }
    } catch (err) {
      console.warn(`[news] x mirror failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  xMirrorStatus = mirrorItems > 0 ? "ok" : "unavailable";

  const redditJson = await fetchText("https://www.reddit.com/r/startups/new.json?limit=5", "application/json");
  if (redditJson.status === 200 && redditJson.body.trim().startsWith("{")) {
    redditStatus = "json";
    const parsed = JSON.parse(redditJson.body) as { data?: { children?: { data?: { title?: string; url?: string; selftext?: string; permalink?: string; created_utc?: number } }[] } };
    const items: Incoming[] = [];
    for (const child of parsed.data?.children ?? []) {
      const post = child.data;
      if (!post?.title) continue;
      const link = post.url?.startsWith("http") ? post.url : post.permalink ? `https://www.reddit.com${post.permalink}` : "";
      if (!link.startsWith("http")) continue;
      items.push({
        title: post.title.slice(0, 300),
        url: link,
        publishedAt: post.created_utc ? new Date(post.created_utc * 1000).toISOString() : null,
        snippet: plainText(post.selftext ?? "").slice(0, 400),
        sourceName: "Reddit r/startups",
        feed: "reddit",
      });
    }
    const stored = saveIncoming(items);
    console.log(`[news] reddit json: ${items.length} items, ${stored} matched`);
  } else {
    redditStatus = redditJson.status === 403 ? "json-blocked-rss" : `json-${redditJson.status}-rss`;
    console.log(`[news] Reddit public JSON returned ${redditJson.status}. Using public Atom RSS.`);
    for (const paper of REDDIT_FEEDS) {
      if (fresh(`feed:reddit:${paper.key}`)) {
        console.log(`[news] reddit r/${paper.key} fresh`);
        continue;
      }
      try {
        const { status, body, headers } = await fetchText(paper.url, "application/atom+xml, application/rss+xml, */*");
        if (status === 429 || status === 403) {
          redditStatus = status === 403 ? "blocked" : "rate-limited";
          console.warn(`[news] reddit r/${paper.key} ${status}`);
          break;
        }
        const items = parseRss(body);
        const stored = saveIncoming(fromRss(items, `Reddit r/${paper.key}`, "reddit"));
        markLog.run(`feed:reddit:${paper.key}`, nowIso(), "ok", stored, null);
        console.log(`[news] reddit r/${paper.key}: ${items.length} items, ${stored} matched`);
        const remaining = Number(headers.get("x-ratelimit-remaining") ?? "1");
        const reset = Number(headers.get("x-ratelimit-reset") ?? "2");
        if (remaining <= 0) await sleep(Math.min(90, Math.max(2, reset + 1)) * 1000);
        else await sleep(1200);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        markLog.run(`feed:reddit:${paper.key}`, nowIso(), "error", 0, message.slice(0, 300));
        console.warn(`[news] reddit r/${paper.key} failed: ${message}`);
      }
    }
  }

  if (feedsOnly) {
    report(db);
    db.pragma("wal_checkpoint(TRUNCATE)");
    return;
  }

  let attempted = 0;
  let cursor = 0;
  async function worker(kind: "company" | "founder") {
    const pool = kind === "company" ? companyPool : founderPool;
    while (cursor < pool.length) {
      if (maxTargets && attempted >= maxTargets) return;
      const index = cursor;
      cursor += 1;
      const item = pool[index];
      const key = kind === "company" ? `company:${(item as LoadedCompany).projectId}` : `founder:${(item as LoadedFounder).personId}`;
      if (fresh(key)) continue;
      if (maxTargets && attempted >= maxTargets) return;
      attempted += 1;
      if (kind === "company") await searchCompany(item as LoadedCompany);
      else await searchFounder(item as LoadedFounder);
      if (attempted % 25 === 0) console.log(`[news] ${attempted} targets, google ${googleEnabled ? "on" : "paused"}`);
    }
  }

  async function searchCompany(company: LoadedCompany) {
    const key = `company:${company.projectId}`;
    if (fresh(key)) return;
    const items: Incoming[] = [];
    let error: string | null = null;
    if (googleEnabled) {
      try {
        items.push(...fromRss(await googleRss(companyQuery(company)), "Google News", "google_news"));
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
    } else {
      error = "google paused";
    }
    try {
      items.push(...(await hackerNews(quote(company.names[0]))));
    } catch (err) {
      error = error ?? (err instanceof Error ? err.message : String(err));
    }
    const stored = saveIncoming(items);
    if (stored > 0) console.log(`[news] ${company.names[0]} +${stored}`);
    markLog.run(key, nowIso(), error ? "error" : stored > 0 ? "ok" : "empty", stored, error);
  }

  async function searchFounder(founder: LoadedFounder) {
    const key = `founder:${founder.personId}`;
    if (fresh(key)) return;
    let error: string | null = null;
    const items: Incoming[] = [];
    if (googleEnabled) {
      try {
        items.push(...fromRss(await googleRss(founderQuery(founder)), "Google News", "google_news"));
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
    } else {
      error = "google paused";
    }
    if (founder.tier === "S+" || founder.tier === "S" || founder.tier === "A") {
      try {
        items.push(...(await hackerNews(quote(founder.name))));
      } catch (err) {
        error = error ?? (err instanceof Error ? err.message : String(err));
      }
    }
    const stored = saveIncoming(items);
    if (stored > 0) console.log(`[news] ${founder.name} +${stored}`);
    markLog.run(key, nowIso(), error ? "error" : stored > 0 ? "ok" : "empty", stored, error);
  }

  // Companies first, then founders. Two workers share one cursor per phase.
  cursor = 0;
  attempted = 0;
  await Promise.all([worker("company"), worker("company"), worker("company")]);
  const companyAttemptsDone = attempted;
  cursor = 0;
  await Promise.all([worker("founder"), worker("founder")]);
  console.log(`[news] queried ${companyAttemptsDone} startups and ${attempted - companyAttemptsDone} founders this run`);

  if (!feedsOnly) {
    const redditBudget = priorityOnly ? 6 : 12;
    let redditAttempts = 0;
    for (const company of companies.filter(isPriorityCompany)) {
      if (redditAttempts >= redditBudget || redditStatus === "blocked") break;
      const key = `reddit:${company.projectId}`;
      if (fresh(key)) continue;
      redditAttempts += 1;
      const url = `https://www.reddit.com/r/startups/search.rss?q=${encodeURIComponent(company.names[0])}&restrict_sr=1&sort=new`;
      try {
        const { status, body, headers } = await fetchText(url, "application/atom+xml, application/rss+xml, */*");
        if (status === 429 || status === 403) {
          markLog.run(key, nowIso(), "error", 0, `reddit ${status}`);
          console.warn(`[news] reddit name search paused (${status})`);
          break;
        }
        const stored = saveIncoming(fromRss(parseRss(body), "Reddit r/startups", "reddit"));
        if (stored > 0) console.log(`[news] reddit ${company.names[0]} +${stored}`);
        markLog.run(key, nowIso(), stored > 0 ? "ok" : "empty", stored, null);
        const remaining = Number(headers.get("x-ratelimit-remaining") ?? "1");
        const reset = Number(headers.get("x-ratelimit-reset") ?? "2");
        if (remaining <= 0) await sleep(Math.min(90, Math.max(2, reset + 1)) * 1000);
      } catch (err) {
        markLog.run(key, nowIso(), "error", 0, (err instanceof Error ? err.message : String(err)).slice(0, 300));
      }
    }
    console.log(`[news] reddit name searches ${redditAttempts}`);

    const blogPool = companies.filter(isPriorityCompany);
    const blogBudget = priorityOnly ? 80 : blogPool.length;
    let blogAttempts = 0;
    let blogCursor = 0;
    async function blogWorker() {
      while (blogCursor < blogPool.length && blogAttempts < blogBudget) {
        const company = blogPool[blogCursor];
        blogCursor += 1;
        if (!company) return;
        const key = `blog:${company.projectId}`;
        if (fresh(key)) continue;
        if (blogAttempts >= blogBudget) return;
        blogAttempts += 1;
        const urls = blogUrls(company.websiteUrl);
        if (!urls.length) {
          markLog.run(key, nowIso(), "empty", 0, null);
          continue;
        }
        try {
          const items = await readCompanyBlog(company.names[0], urls);
          const stored = saveIncoming(items);
          if (stored > 0) console.log(`[news] blog ${company.names[0]} +${stored}`);
          markLog.run(key, nowIso(), stored > 0 ? "ok" : "empty", stored, null);
        } catch (err) {
          markLog.run(key, nowIso(), "error", 0, err instanceof Error ? err.message : String(err));
        }
      }
    }
    await Promise.all([blogWorker(), blogWorker(), blogWorker(), blogWorker()]);
    console.log(`[news] company blogs checked ${blogAttempts}`);

    const xBudget = priorityOnly ? 40 : 120;
    let xAttempts = 0;
    for (const company of companies.filter(isPriorityCompany)) {
      if (xAttempts >= xBudget) break;
      const key = `x:${company.projectId}`;
      if (fresh(key)) continue;
      xAttempts += 1;
      const items: Incoming[] = [];
      let error: string | null = null;
      const query = `site:x.com ${quote(company.names[0])}`;
      if (googleEnabled) {
        try {
          const parsed = await googleRss(query);
          xSearchItems += parsed.length;
          items.push(...fromRss(parsed, "X", "x"));
        } catch (err) {
          error = err instanceof Error ? err.message : String(err);
        }
      } else {
        error = "google paused";
      }
      try {
        const { status, body } = await fetchText(`https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=RSS`);
        if (status === 200) {
          const parsed = parseRss(body);
          xSearchItems += parsed.length;
          items.push(...fromRss(parsed, "X", "x"));
        }
      } catch (err) {
        error = error ?? (err instanceof Error ? err.message : String(err));
      }
      const stored = saveIncoming(items);
      if (stored > 0) console.log(`[news] x ${company.names[0]} +${stored}`);
      markLog.run(key, nowIso(), error && stored === 0 ? "error" : stored > 0 ? "ok" : "empty", stored, stored > 0 ? null : error);
    }
    console.log(`[news] x name searches ${xAttempts}`);
  }

  report(db);
  db.pragma("wal_checkpoint(TRUNCATE)");
}

function report(db: ReturnType<typeof getDb>) {
  if (xMirrorStatus === "unavailable" && xSearchItems === 0) {
    console.log("[news] X skipped: no free API, and Nitter mirrors plus site:x.com / site:twitter.com search returned nothing.");
  } else if (xMirrorStatus === "unavailable") {
    console.log("[news] X has no free API. Nitter/RSSHub mirrors did not return a feed. Using Google News and Bing site:x.com and site:twitter.com snippets.");
  }
  const articles = (db.prepare(`SELECT COUNT(*) AS n FROM news_articles`).get() as { n: number }).n;
  const startups = (db.prepare(`SELECT COUNT(DISTINCT project_id) AS n FROM news_mentions WHERE project_id != ''`).get() as { n: number }).n;
  const founders = (db.prepare(`SELECT COUNT(DISTINCT person_id) AS n FROM news_mentions WHERE person_id != ''`).get() as { n: number }).n;
  const byCategory = db.prepare(`SELECT category, COUNT(*) AS n FROM news_articles GROUP BY category ORDER BY n DESC`).all();
  const byFeed = db.prepare(`SELECT feed, COUNT(*) AS n FROM news_articles GROUP BY feed ORDER BY n DESC`).all();
  const byConfidence = db.prepare(`SELECT match_confidence, COUNT(*) AS n FROM news_articles GROUP BY match_confidence`).all();
  const bySourceType = db.prepare(`SELECT source_type, COUNT(*) AS n FROM news_articles GROUP BY source_type ORDER BY n DESC`).all();
  const penn = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT m.project_id) AS n
         FROM news_mentions m
         JOIN person_project_roles r ON r.project_id = m.project_id
         JOIN affiliations a ON a.person_id = r.person_id
         WHERE m.project_id != '' AND a.university_id = 'univ_penn'`
      )
      .get() as { n: number }
  ).n;
  const berkeley = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT m.project_id) AS n
         FROM news_mentions m
         JOIN person_project_roles r ON r.project_id = m.project_id
         JOIN affiliations a ON a.person_id = r.person_id
         WHERE m.project_id != '' AND a.university_id = 'univ_berkeley'`
      )
      .get() as { n: number }
  ).n;
  const eligible = (db.prepare(`SELECT COUNT(*) AS n FROM news_fetch_log WHERE target_key LIKE 'company:%'`).get() as { n: number }).n;
  const summary = {
    articles,
    startups,
    founders,
    penn,
    berkeley,
    companyTargetsLogged: eligible,
    byCategory,
    byFeed,
    bySourceType,
    byConfidence,
    googleEnabled,
    xMirrorStatus,
    xSearchItems,
    redditStatus,
  };
  console.log(`NEWS_COVERAGE_JSON ${JSON.stringify(summary)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
