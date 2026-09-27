// LinkedIn URLs from pages that already list the profile. No search engine
// and no paid API. A YC founder card, a person's GitHub social account, their
// Devpost/GitHub/personal page, or a startup or club team page that names them
// next to the profile is confirmed. Name plus school alone is likely.
//
//   npx tsx scripts/enrich/linkedin-direct-sources.ts
//   npx tsx scripts/enrich/linkedin-direct-sources.ts --founders-only
//   npx tsx scripts/enrich/linkedin-direct-sources.ts --stats
//   npx tsx scripts/enrich/linkedin-direct-sources.ts --apply
//
// Resumable via data/imports/linkedin-direct-checkpoint.json.

import fs from "node:fs";
import path from "node:path";
import { getDb, newId, nowIso } from "../../lib/db/client";
import {
  isCommonName,
  judgeHits,
  mentionsFullName,
  nameTokens,
  nearbyLinkedIn,
  normalizeLinkedInUrl,
  schoolPhrases,
  slugLooksLikeName,
  usableOrgName,
  type AcceptMatch,
  type MatchHit,
} from "./linkedin-free-match";

const SOURCE_ID = "src_linkedin_direct";
const CHECKPOINT_PATH = path.join(process.cwd(), "data/imports/linkedin-direct-checkpoint.json");
const RESULTS_PATH = path.join(process.cwd(), "data/imports/linkedin-direct-results.jsonl");
const CAMPUS_RANK: Record<string, number> = { univ_penn: 0, univ_berkeley: 1, univ_brown: 2, univ_stanford: 2 };
const UA = "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0";
const GITHUB_GAP_MS = 1200;

const GITHUB_SKIP = new Set(
  "about features topics site orgs org new login signup customer-stories customer stories apps settings explore notifications pull issues marketplace collections sponsors pricing security readme blob tree commit commits".split(
    /\s+/
  )
);

interface Person {
  id: string;
  name: string;
  tokens: string[];
  founder: boolean;
  rank: number;
  schools: string[];
  startups: string[];
  programs: string[];
  commonName: boolean;
  pages: string[];
  github: string[];
}

interface Checkpoint {
  baseline?: { confirmed: number; likely: number; missing: number; at: string };
  urls: Record<string, string>;
  github: Record<string, string>;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadCheckpoint(): Checkpoint {
  try {
    const parsed = JSON.parse(fs.readFileSync(CHECKPOINT_PATH, "utf8")) as Checkpoint;
    parsed.urls ??= {};
    parsed.github ??= {};
    return parsed;
  } catch {
    return { urls: {}, github: {} };
  }
}

function saveCheckpoint(checkpoint: Checkpoint) {
  fs.mkdirSync(path.dirname(CHECKPOINT_PATH), { recursive: true });
  const tmp = `${CHECKPOINT_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(checkpoint));
  fs.renameSync(tmp, CHECKPOINT_PATH);
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function skipHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return ["linkedin.com", "facebook.com", "instagram.com", "twitter.com", "x.com", "google.com", "youtube.com", "tiktok.com", "loom.com", "duckduckgo.com"].some(
      (domain) => host === domain || host.endsWith(`.${domain}`)
    );
  } catch {
    return true;
  }
}

export function parseYcFounders(html: string): { name: string; url: string }[] {
  const decoded = html.replace(/&quot;/g, '"');
  const found: { name: string; url: string }[] = [];
  const seen = new Set<string>();
  for (const match of decoded.matchAll(/"full_name":"([^"]+)"/g)) {
    const window = decoded.slice(match.index ?? 0, (match.index ?? 0) + 4000);
    const linked = window.match(/"linkedin_url":"(https:\/\/www\.linkedin\.com\/in\/[^"]+)"/);
    const url = normalizeLinkedInUrl(linked?.[1] ?? "");
    if (!url || seen.has(`${match[1]}|${url}`)) continue;
    if (!slugLooksLikeName(url, match[1])) continue;
    seen.add(`${match[1]}|${url}`);
    found.push({ name: match[1], url });
  }
  return found;
}

export function githubHandles(html: string, name: string): string[] {
  const handles = new Set<string>();
  for (const match of html.matchAll(/https?:\/\/github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))(?!\/|[A-Za-z0-9-])/g)) {
    const handle = match[1];
    if (GITHUB_SKIP.has(handle.toLowerCase())) continue;
    handles.add(handle);
  }
  const list = [...handles];
  const named = list.filter((handle) => slugLooksLikeName(`https://www.linkedin.com/in/${handle}`, name));
  if (named.length > 0) return named;
  return list.length === 1 ? list : [];
}

function isCampusHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return host.endsWith(".edu") || host.endsWith(".ac.uk") || host.endsWith(".edu.au") || host.endsWith(".ca");
  } catch {
    return true;
  }
}

function extraPages(url: string): string[] {
  let origin = "";
  try {
    origin = new URL(url).origin;
  } catch {
    return [];
  }
  if (skipHost(origin) || isCampusHost(url)) return [];
  return [`${origin}/about`, `${origin}/team`, `${origin}/about-us`, `${origin}/founders`];
}

function hopLinks(html: string): string[] {
  const urls = new Set<string>();
  for (const match of html.matchAll(/https?:\/\/[^"'\\\s>]+/g)) {
    const raw = match[0].replace(/&amp;/g, "&");
    try {
      const url = new URL(raw);
      const host = url.hostname.replace(/^www\./, "");
      if (host === "wellfound.com" || host === "angel.co" || host === "www.producthunt.com" || host === "producthunt.com") urls.add(url.origin + url.pathname);
    } catch {
      // ignore malformed hrefs
    }
  }
  return [...urls].slice(0, 4);
}

const pageCache = new Map<string, string | null>();

async function fetchHtml(url: string): Promise<string | null> {
  if (pageCache.has(url)) return pageCache.get(url) ?? null;
  if (skipHost(url)) {
    pageCache.set(url, null);
    return null;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": UA, Accept: "text/html" },
    });
    if (!response.ok) {
      pageCache.set(url, null);
      return null;
    }
    const buffer = await response.arrayBuffer();
    const slice = buffer.byteLength > 500_000 ? buffer.slice(0, 500_000) : buffer;
    const text = new TextDecoder("utf-8", { fatal: false }).decode(slice);
    pageCache.set(url, text);
    return text;
  } catch {
    pageCache.set(url, null);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function pool<T>(items: T[], size: number, worker: (item: T) => Promise<void>) {
  let index = 0;
  async function run() {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      await worker(current);
      await sleep(200);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, () => run()));
}

function ensureSource(db: ReturnType<typeof getDb>) {
  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at)
     VALUES (?, 'LinkedIn direct public pages', 'code_host', 'https://www.ycombinator.com/companies', '[]', 2, 'html_scrape', 'available', ?)
     ON CONFLICT(id) DO UPDATE SET last_attempt_at = excluded.last_attempt_at`
  ).run(SOURCE_ID, nowIso());
}

function hasLinkedInAlias(aliasesJson: string): boolean {
  return aliasesJson.includes("linkedin.com/in/");
}

function appendResult(row: Record<string, unknown>) {
  fs.mkdirSync(path.dirname(RESULTS_PATH), { recursive: true });
  fs.appendFileSync(RESULTS_PATH, `${JSON.stringify(row)}\n`);
}

function storeMatch(
  db: ReturnType<typeof getDb>,
  person: { id: string; name: string },
  match: AcceptMatch,
  pageUrl: string,
  record = true
): "confirmed" | "likely" | "existing" {
  const now = nowIso();
  const evidence = {
    linkedin: match.url,
    confidence: match.confidence,
    query: pageUrl,
    proofUrl: pageUrl,
    snippet: match.snippet,
    title: match.title,
    signals: match.signals,
    fromSite: match.fromSite,
    engine: "direct",
  };
  const excerpt = `${person.name}: ${match.confidence} LinkedIn ${match.url}. Signals: ${match.signals.join(", ") || "source link"}. Page: ${pageUrl}. Snippet: ${match.snippet}`.slice(0, 900);
  const outcome = db.transaction((): "confirmed" | "likely" | "existing" => {
    const row = db.prepare(`SELECT aliases_json FROM people WHERE id = ?`).get(person.id) as { aliases_json: string } | undefined;
    if (!row) return "existing";
    if (hasLinkedInAlias(row.aliases_json)) return "existing";
    if (match.confidence === "confirmed") {
      const aliases = JSON.parse(row.aliases_json || "[]") as string[];
      if (!aliases.some((alias) => alias.includes(match.url))) aliases.push(`linkedin:${match.url}`);
      db.prepare(`UPDATE people SET aliases_json = ? WHERE id = ?`).run(JSON.stringify(aliases), person.id);
      db.prepare(
        `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, source_url, retrieved_at, label, verification_state)
         VALUES (?, 'person', ?, 'linkedin_alias_discovered', ?, ?, ?, ?, ?, 'observed_fact', 'corroborated')`
      ).run(newId("claim"), person.id, JSON.stringify(evidence), excerpt, SOURCE_ID, match.url, now);
      db.prepare(
        `UPDATE claims SET verification_state = 'demoted'
         WHERE entity_type = 'person' AND entity_id = ? AND claim_type = 'linkedin_candidate' AND verification_state = 'likely'`
      ).run(person.id);
      return "confirmed";
    }
    const existing = db
      .prepare(
        `SELECT 1 AS ok FROM claims WHERE entity_type = 'person' AND entity_id = ? AND claim_type = 'linkedin_candidate' AND source_url = ? LIMIT 1`
      )
      .get(person.id, match.url) as { ok: number } | undefined;
    if (existing) return "existing";
    db.prepare(
      `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, source_url, retrieved_at, label, verification_state)
       VALUES (?, 'person', ?, 'linkedin_candidate', ?, ?, ?, ?, ?, 'observed_fact', 'likely')`
    ).run(newId("claim"), person.id, JSON.stringify(evidence), excerpt, SOURCE_ID, match.url, now);
    return "likely";
  })();
  if (record && (outcome === "confirmed" || outcome === "likely")) {
    appendResult({ person_id: person.id, name: person.name, url: match.url, confidence: match.confidence, page: pageUrl, at: now });
  }
  return outcome;
}

function resolvePersonId(db: ReturnType<typeof getDb>, personId: string): string {
  let current = personId;
  const seen = new Set<string>();
  while (!seen.has(current)) {
    seen.add(current);
    const row = db.prepare(`SELECT survivor_id FROM entity_redirects WHERE old_id = ? AND entity_type = 'person'`).get(current) as
      | { survivor_id: string }
      | undefined;
    if (!row?.survivor_id || row.survivor_id === current) break;
    current = row.survivor_id;
  }
  return current;
}

function applyResults(db: ReturnType<typeof getDb>) {
  if (!fs.existsSync(RESULTS_PATH)) {
    console.log("No results file to apply.");
    return;
  }
  ensureSource(db);
  const lines = fs.readFileSync(RESULTS_PATH, "utf8").split("\n").filter(Boolean);
  const seen = new Set<string>();
  let wrote = 0;
  let skipped = 0;
  for (const line of lines) {
    const row = JSON.parse(line) as { person_id: string; name: string; url: string; confidence: string; page: string };
    const key = `${row.person_id}|${row.url}`;
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    const personId = resolvePersonId(db, row.person_id);
    const person = db.prepare(`SELECT id, name FROM people WHERE id = ?`).get(personId) as { id: string; name: string } | undefined;
    if (!person) {
      console.log(`skip missing ${row.person_id} ${row.name}`);
      skipped += 1;
      continue;
    }
    if (personId !== row.person_id) console.log(`redirect ${row.name} ${row.person_id} -> ${person.id} ${person.name}`);
    const url = normalizeLinkedInUrl(row.url);
    const confidence = row.confidence === "confirmed" || row.confidence === "likely" ? row.confidence : null;
    if (!url || !confidence) {
      console.log(`skip bad row ${row.name} ${row.url}`);
      skipped += 1;
      continue;
    }
    const match: AcceptMatch = {
      outcome: "accept",
      confidence,
      url,
      signals: [],
      title: row.name,
      snippet: `${row.name} listed on ${row.page}`,
      query: row.page,
      fromSite: confidence === "confirmed",
    };
    const outcome = storeMatch(db, person, match, row.page, false);
    if (outcome === "confirmed" || outcome === "likely") wrote += 1;
    else skipped += 1;
  }
  db.pragma("wal_checkpoint(TRUNCATE)");
  console.log(`Applied ${wrote} rows, skipped ${skipped}.`);
}

function loadPeople(db: ReturnType<typeof getDb>): Person[] {
  const rows = db
    .prepare(
      `SELECT p.id, p.name, p.aliases_json, p.founder_status
       FROM people p
       WHERE p.aliases_json NOT LIKE '%linkedin.com/in%'`
    )
    .all() as { id: string; name: string; aliases_json: string; founder_status: string | null }[];
  const campuses = new Map<string, { id: string; name: string }[]>();
  for (const row of db.prepare(`SELECT a.person_id AS person_id, u.id AS id, u.name AS name FROM affiliations a JOIN universities u ON u.id = a.university_id`).all() as {
    person_id: string;
    id: string;
    name: string;
  }[]) {
    const list = campuses.get(row.person_id) ?? [];
    list.push({ id: row.id, name: row.name });
    campuses.set(row.person_id, list);
  }
  const dupes = new Map<string, number>();
  for (const row of db.prepare(`SELECT name FROM people`).all() as { name: string }[]) {
    const tokens = nameTokens(row.name);
    if (tokens.length < 2) continue;
    const key = `${tokens[0].toLowerCase()} ${tokens[tokens.length - 1].toLowerCase()}`;
    dupes.set(key, (dupes.get(key) ?? 0) + 1);
  }
  const tokensById = new Map<string, string[]>();
  for (const row of rows) tokensById.set(row.id, nameTokens(row.name));
  const startups = new Map<string, { name: string; kind: string; url: string | null; primary: string | null }[]>();
  for (const row of db
    .prepare(
      `SELECT r.person_id AS person_id, p.name AS name, p.kind AS kind, p.website_url AS website_url, p.primary_link AS primary_link
       FROM person_project_roles r JOIN projects p ON p.id = r.project_id`
    )
    .all() as { person_id: string; name: string; kind: string; website_url: string | null; primary_link: string | null }[]) {
    const list = startups.get(row.person_id) ?? [];
    list.push({ name: row.name, kind: row.kind, url: row.website_url, primary: row.primary_link });
    startups.set(row.person_id, list);
  }
  const evidence = new Map<string, string[]>();
  for (const row of db
    .prepare(`SELECT entity_id, source_url FROM claims WHERE entity_type = 'person' AND source_url LIKE 'http%'`)
    .all() as { entity_id: string; source_url: string }[]) {
    const list = evidence.get(row.entity_id) ?? [];
    list.push(row.source_url);
    evidence.set(row.entity_id, list);
  }
  const people: Person[] = [];
  for (const row of rows) {
    const campus = campuses.get(row.id) ?? [];
    const rank = campus.reduce((best, item) => Math.min(best, CAMPUS_RANK[item.id] ?? 9), 9);
    if (rank > 2 && row.founder_status !== "founder") continue;
    const tokens = tokensById.get(row.id) ?? [];
    if (tokens.length < 2) continue;
    const schools = [...new Set(campus.flatMap((item) => schoolPhrases(item.id, item.name)))];
    const orgs = startups.get(row.id) ?? [];
    const startupNames = [
      ...new Set(orgs.filter((item) => item.kind === "company").map((item) => usableOrgName(item.name)).filter((item): item is string => Boolean(item))),
    ];
    const programNames = [
      ...new Set(orgs.filter((item) => item.kind !== "company").map((item) => usableOrgName(item.name)).filter((item): item is string => Boolean(item))),
    ];
    const pages = new Set<string>();
    let aliases: string[] = [];
    try {
      const parsed = JSON.parse(row.aliases_json) as unknown;
      aliases = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
    } catch {
      aliases = [];
    }
    const github: string[] = [];
    for (const alias of aliases) {
      if (alias.startsWith("devpost:http")) pages.add(alias.slice("devpost:".length));
      else if (alias.startsWith("site:http")) pages.add(alias.slice("site:".length));
      else if (alias.startsWith("github:")) {
        const handle = alias.slice("github:".length).replace(/^https?:\/\/github\.com\//, "").split("/")[0];
        if (/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(handle)) github.push(handle);
      }
    }
    for (const url of evidence.get(row.id) ?? []) {
      if (!skipHost(url) && !url.includes("linkedin.com")) pages.add(url.split("#")[0]);
    }
    for (const org of orgs) {
      for (const raw of [org.url, org.primary]) {
        if (raw && raw.startsWith("http") && !skipHost(raw)) pages.add(raw.split("#")[0]);
      }
    }
    const key = `${tokens[0].toLowerCase()} ${tokens[tokens.length - 1].toLowerCase()}`;
    people.push({
      id: row.id,
      name: row.name,
      tokens,
      founder: row.founder_status === "founder",
      rank,
      schools,
      startups: startupNames,
      programs: programNames,
      commonName: isCommonName(tokens, dupes.get(key) ?? 1),
      pages: [...pages].filter((url) => !skipHost(url)).slice(0, 8),
      github,
    });
  }
  people.sort((a, b) => a.rank - b.rank || Number(b.founder) - Number(a.founder) || a.name.localeCompare(b.name));
  return people;
}

function nameKey(name: string): string {
  const tokens = nameTokens(name);
  if (tokens.length < 2) return "";
  return `${tokens[0].toLowerCase()} ${tokens[tokens.length - 1].toLowerCase()}`;
}

function acceptPage(db: ReturnType<typeof getDb>, person: Person, hits: MatchHit[], pageUrl: string, fromSite: boolean) {
  const judged = judgeHits({
    name: person.name,
    schools: person.schools,
    startups: person.startups,
    programs: person.programs,
    commonName: person.commonName,
    hits: hits.map((hit) => ({ ...hit, fromSite, query: pageUrl })),
  });
  if (judged.outcome !== "accept") return;
  const outcome = storeMatch(db, person, judged, pageUrl);
  if (outcome === "confirmed" || outcome === "likely") console.log(`${outcome} ${person.name} ${judged.url} [${judged.signals.join("+") || "source"}] ${pageUrl}`);
}

function matchHtml(db: ReturnType<typeof getDb>, html: string, pageUrl: string, people: Person[], index: Map<string, Person[]>) {
  if (/ycombinator\.com\/companies\//.test(pageUrl)) {
    for (const founder of parseYcFounders(html)) {
      const candidates = index.get(nameKey(founder.name)) ?? [];
      if (candidates.length !== 1 || candidates[0].commonName) continue;
      const one = candidates[0];
      acceptPage(db, one, [{ url: founder.url, title: founder.name, snippet: `${founder.name} on ${pageUrl}`, query: pageUrl, fromSite: true }], pageUrl, true);
    }
  }
  const text = stripTags(html);
  const mentioned = people.filter((person) => person.tokens.length >= 2 && mentionsFullName(text, person.name));
  const claimed = new Map<string, Person>();
  const tied = new Set<string>();
  const hitsByPerson = new Map<string, MatchHit[]>();
  for (const person of mentioned) {
    const near = nearbyLinkedIn(html, person.name);
    if (near.length !== 1) continue;
    const prev = claimed.get(near[0].url);
    if (prev && prev.id !== person.id) {
      tied.add(near[0].url);
      continue;
    }
    claimed.set(near[0].url, person);
    hitsByPerson.set(person.id, [{ url: near[0].url, title: person.name, snippet: near[0].excerpt, query: pageUrl, fromSite: true }]);
  }
  for (const [id, hits] of hitsByPerson) {
    if (tied.has(hits[0].url)) continue;
    const person = mentioned.find((item) => item.id === id);
    if (!person) continue;
    acceptPage(db, person, hits, pageUrl, true);
  }
  for (const person of mentioned) {
    if (hitsByPerson.has(person.id)) continue;
    const urls = [...new Set((html.match(/https?:\/\/(?:[\w.-]+\.)?linkedin\.com\/in\/[A-Za-z0-9\-_%]{3,100}/gi) ?? []).map((raw) => normalizeLinkedInUrl(raw)).filter((url): url is string => Boolean(url)))].filter(
      (url) => slugLooksLikeName(url, person.name)
    );
    if (urls.length !== 1) continue;
    const snippet = text.slice(0, 500);
    acceptPage(db, person, [{ url: urls[0], title: person.name, snippet, query: pageUrl }], pageUrl, false);
  }
}

interface GithubProfile {
  linkedin: string | null;
  name: string | null;
  bio: string | null;
  blog: string | null;
}

async function githubProfile(handle: string): Promise<{ profile: GithubProfile | null; remaining: number; resetAt: number }> {
  await sleep(GITHUB_GAP_MS);
  const response = await fetch(`https://api.github.com/users/${encodeURIComponent(handle)}/social_accounts`, {
    headers: { "User-Agent": "campus-scout", Accept: "application/vnd.github+json" },
  });
  const remaining = Number(response.headers.get("x-ratelimit-remaining") ?? "0");
  const resetAt = Number(response.headers.get("x-ratelimit-reset") ?? "0") * 1000;
  if (!response.ok) return { profile: null, remaining, resetAt };
  const accounts = (await response.json()) as { provider?: string; url?: string }[];
  const linkedin = accounts.map((account) => normalizeLinkedInUrl(account.url)).find((url): url is string => Boolean(url)) ?? null;
  return { profile: { linkedin, name: null, bio: null, blog: null }, remaining, resetAt };
}

function coverage(db: ReturnType<typeof getDb>) {
  const totals = db
    .prepare(
      `SELECT
         SUM(CASE WHEN aliases_json LIKE '%linkedin.com/in%' THEN 1 ELSE 0 END) AS confirmed,
         SUM(CASE WHEN aliases_json NOT LIKE '%linkedin.com/in%' AND EXISTS (
           SELECT 1 FROM claims c WHERE c.entity_type = 'person' AND c.entity_id = people.id
             AND c.claim_type = 'linkedin_candidate' AND c.verification_state = 'likely'
         ) THEN 1 ELSE 0 END) AS likely,
         SUM(CASE WHEN aliases_json NOT LIKE '%linkedin.com/in%' AND NOT EXISTS (
           SELECT 1 FROM claims c WHERE c.entity_type = 'person' AND c.entity_id = people.id
             AND c.claim_type = 'linkedin_candidate' AND c.verification_state = 'likely'
         ) THEN 1 ELSE 0 END) AS missing
       FROM people`
    )
    .get() as { confirmed: number; likely: number; missing: number };
  const campuses = db
    .prepare(
      `SELECT u.name AS name,
              COUNT(DISTINCT p.id) AS people,
              COUNT(DISTINCT CASE WHEN p.aliases_json LIKE '%linkedin.com/in%' THEN p.id END) AS confirmed,
              COUNT(DISTINCT CASE WHEN p.aliases_json NOT LIKE '%linkedin.com/in%' AND EXISTS (
                SELECT 1 FROM claims c WHERE c.entity_type = 'person' AND c.entity_id = p.id
                  AND c.claim_type = 'linkedin_candidate' AND c.verification_state = 'likely'
              ) THEN p.id END) AS likely
       FROM people p
       JOIN affiliations a ON a.person_id = p.id
       JOIN universities u ON u.id = a.university_id
       WHERE u.id IN ('univ_penn','univ_brown','univ_stanford','univ_berkeley','univ_mit','univ_harvard')
          OR u.id IN (
            SELECT a2.university_id FROM affiliations a2 GROUP BY a2.university_id ORDER BY COUNT(*) DESC LIMIT 10
          )
       GROUP BY u.id
       ORDER BY people DESC`
    )
    .all() as { name: string; people: number; confirmed: number; likely: number }[];
  return { totals, campuses };
}

function printCoverage(db: ReturnType<typeof getDb>, baseline?: Checkpoint["baseline"]) {
  const now = coverage(db);
  console.log("\nLinkedIn coverage");
  if (baseline) console.log(`Before: confirmed ${baseline.confirmed}, likely ${baseline.likely}, missing ${baseline.missing}`);
  console.log(`After: confirmed ${now.totals.confirmed}, likely ${now.totals.likely}, missing ${now.totals.missing}`);
  const founders = db
    .prepare(
      `SELECT
         COUNT(*) AS founders,
         SUM(CASE WHEN aliases_json LIKE '%linkedin.com/in%' THEN 1 ELSE 0 END) AS confirmed,
         SUM(CASE WHEN aliases_json NOT LIKE '%linkedin.com/in%' AND EXISTS (
           SELECT 1 FROM claims c WHERE c.entity_type = 'person' AND c.entity_id = people.id
             AND c.claim_type = 'linkedin_candidate' AND c.verification_state = 'likely'
         ) THEN 1 ELSE 0 END) AS likely
       FROM people WHERE founder_status = 'founder'`
    )
    .get() as { founders: number; confirmed: number; likely: number };
  console.log(
    `Founders ${founders.founders}: confirmed ${founders.confirmed}, likely ${founders.likely}, missing ${founders.founders - founders.confirmed - founders.likely}`
  );
  for (const row of now.campuses) {
    const covered = row.confirmed + row.likely;
    const pct = row.people ? Math.round((covered / row.people) * 1000) / 10 : 0;
    console.log(`  ${row.name}: ${covered}/${row.people} (${pct}%) confirmed ${row.confirmed}, likely ${row.likely}`);
  }
}

console.log = (...args: unknown[]) => {
  fs.writeSync(1, `${args.map((item) => (typeof item === "string" ? item : JSON.stringify(item))).join(" ")}\n`);
};

async function main() {
  const db = getDb();
  if (hasFlag("--apply")) {
    applyResults(db);
    printCoverage(db);
    return;
  }
  const checkpoint = loadCheckpoint();
  if (!checkpoint.baseline) {
    const now = coverage(db).totals;
    checkpoint.baseline = { ...now, at: nowIso() };
    saveCheckpoint(checkpoint);
  }
  if (hasFlag("--stats")) {
    printCoverage(db, checkpoint.baseline);
    return;
  }
  ensureSource(db);
  const foundersOnly = hasFlag("--founders-only");
  const people = loadPeople(db).filter((person) => !foundersOnly || person.founder);
  const index = new Map<string, Person[]>();
  for (const person of people) {
    const key = nameKey(person.name);
    if (!key) continue;
    const list = index.get(key) ?? [];
    list.push(person);
    index.set(key, list);
  }
  console.log(`Direct sources for ${people.length} people without LinkedIn`);

  const ycUrls = [
    ...new Set(
      (db.prepare(`SELECT DISTINCT source_url FROM claims WHERE source_url LIKE '%ycombinator.com/companies/%'`).all() as { source_url: string }[])
        .map((row) => row.source_url.split("?")[0])
        .filter((url) => /ycombinator\.com\/companies\/[^/]+\/?$/.test(url))
    ),
  ];
  const ownersByUrl = new Map<string, Person[]>();
  const addPage = (url: string, person: Person | null) => {
    if (skipHost(url)) return;
    const list = ownersByUrl.get(url) ?? [];
    if (person && !list.some((item) => item.id === person.id)) list.push(person);
    ownersByUrl.set(url, list);
  };
  for (const url of ycUrls) addPage(url, null);
  const orderedPeople = [...people].sort((a, b) => a.rank - b.rank || Number(b.founder) - Number(a.founder) || a.name.localeCompare(b.name));
  for (const person of orderedPeople) {
    if (!person.founder && person.rank > 2) continue;
    for (const url of person.pages) {
      addPage(url, person);
      if (person.founder) {
        for (const extra of extraPages(url)) addPage(extra, person);
      }
    }
  }
  const queue = [...ownersByUrl.keys()]
    .filter((url) => !checkpoint.urls[url])
    .sort((a, b) => {
      const rankOf = (url: string) => Math.min(9, ...(ownersByUrl.get(url) ?? []).map((person) => person.rank));
      return rankOf(a) - rankOf(b) || a.localeCompare(b);
    });
  console.log(`Fetch ${queue.length} pages (${ycUrls.length} YC company pages)`);
  const hops: string[] = [];
  await pool(queue, 3, async (url) => {
    const html = await fetchHtml(url);
    checkpoint.urls[url] = html ? "fetched" : "miss";
    if (!html) return;
    matchHtml(db, html, url, ownersByUrl.get(url) ?? [], index);
    for (const hop of hopLinks(html)) {
      if (!checkpoint.urls[hop]) hops.push(hop);
    }
    if (Object.keys(checkpoint.urls).length % 40 === 0) saveCheckpoint(checkpoint);
  });
  saveCheckpoint(checkpoint);
  const hopQueue = [...new Set(hops)].filter((url) => !checkpoint.urls[url]).slice(0, 80);
  console.log(`Follow ${hopQueue.length} Wellfound, AngelList, or Product Hunt links`);
  await pool(hopQueue, 2, async (url) => {
    const html = await fetchHtml(url);
    checkpoint.urls[url] = html ? "fetched" : "miss";
    if (html) matchHtml(db, html, url, people.filter((person) => person.rank <= 2), index);
  });
  saveCheckpoint(checkpoint);

  const githubQueue: { person: Person; handle: string }[] = [];
  for (const person of people) {
    const fresh = db.prepare(`SELECT aliases_json FROM people WHERE id = ?`).get(person.id) as { aliases_json: string } | undefined;
    if (fresh && hasLinkedInAlias(fresh.aliases_json)) continue;
    for (const handle of person.github) githubQueue.push({ person, handle });
    for (const url of person.pages.filter((item) => item.includes("devpost.com/"))) {
      const html = pageCache.get(url) ?? (await fetchHtml(url));
      if (!html) continue;
      for (const handle of githubHandles(html, person.name)) githubQueue.push({ person, handle });
    }
  }
  const seenGithub = new Set<string>();
  console.log(`GitHub social accounts to check: ${githubQueue.length}`);
  for (const item of githubQueue) {
    const key = `${item.person.id}:${item.handle.toLowerCase()}`;
    if (checkpoint.github[key] || seenGithub.has(key)) continue;
    seenGithub.add(key);
    let result: Awaited<ReturnType<typeof githubProfile>>;
    try {
      result = await githubProfile(item.handle);
    } catch (error) {
      console.log(`github error ${item.handle}: ${error instanceof Error ? error.message : error}`);
      break;
    }
    checkpoint.github[key] = result.profile?.linkedin ?? "none";
    saveCheckpoint(checkpoint);
    if (result.remaining <= 2) {
      console.log("GitHub rate limit reached. Remaining handles stay in the checkpoint for the next run.");
      break;
    }
    const profile = result.profile;
    if (!profile) continue;
    const named = profile.name ? mentionsFullName(profile.name, item.person.name) || mentionsFullName(item.person.name, profile.name) : false;
    const slugOk = profile.linkedin ? slugLooksLikeName(profile.linkedin, item.person.name) : false;
    if (profile.linkedin && (named || slugOk)) {
      const snippet = `${profile.name ?? item.person.name}. ${profile.bio ?? ""}`.slice(0, 400);
      acceptPage(
        db,
        item.person,
        [{ url: profile.linkedin, title: profile.name ?? item.person.name, snippet, query: `https://github.com/${item.handle}`, fromSite: true }],
        `https://github.com/${item.handle}`,
        true
      );
    } else if (profile.blog && !skipHost(profile.blog)) {
      const html = await fetchHtml(profile.blog);
      if (html) matchHtml(db, html, profile.blog, [item.person], index);
    }
  }

  db.pragma("wal_checkpoint(TRUNCATE)");
  printCoverage(db, checkpoint.baseline);
}

const isEntry = /linkedin-direct-sources\.(ts|js)$/.test(process.argv[1] ?? "");
if (isEntry) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
