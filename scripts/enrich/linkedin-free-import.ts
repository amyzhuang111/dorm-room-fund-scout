// Free LinkedIn URLs for people who do not already have one.
//
// Does not call Apify, does not log in to LinkedIn, and does not read a
// profile behind LinkedIn's login wall. Search uses Google, Bing, and
// DuckDuckGo HTML. A URL is stored only when the result title or snippet
// contains the full name plus school, startup, or program. Two signals, or a
// link on the founder's own page or their startup's page, is confirmed. One
// signal is likely. Common names with one signal, and ties, are skipped.
//
//   npx tsx scripts/enrich/linkedin-free-import.ts
//   npx tsx scripts/enrich/linkedin-free-import.ts --limit 25
//   npx tsx scripts/enrich/linkedin-free-import.ts --harvest-only
//   npx tsx scripts/enrich/linkedin-free-import.ts --search-only
//   npx tsx scripts/enrich/linkedin-free-import.ts --apply
//   npx tsx scripts/enrich/linkedin-free-import.ts --stats
//
// Resumable: data/imports/linkedin-free-checkpoint.json records every person.
// Accepted rows are also appended to data/imports/linkedin-free-results.jsonl
// so --apply can rewrite them onto a newer database without searching again.
// Existing linkedin.com/in aliases, including Apify-verified ones, are left
// untouched.

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
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

const SOURCE_ID = "src_linkedin_free_search";
const CHECKPOINT_PATH = path.join(process.cwd(), "data/imports/linkedin-free-checkpoint.json");
const RESULTS_PATH = path.join(process.cwd(), "data/imports/linkedin-free-results.jsonl");
const FOCUS_CAMPUSES = new Set(["univ_penn", "univ_berkeley", "univ_stanford", "univ_mit", "univ_harvard"]);
const UA = "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0";
const CDP_PORT = 9555;
const SEARCH_DISPLAY = ":99";
const SEARCH_GAP_MS = 4000;

type Outcome = "confirmed" | "likely" | "ambiguous" | "not_found" | "existing" | "skipped_name";

interface CheckpointEntry {
  outcome: Outcome;
  url?: string;
  confidence?: "confirmed" | "likely";
  at: string;
  reason?: string;
}

interface Checkpoint {
  baseline?: { confirmed: number; likely: number; missing: number; at: string };
  people: Record<string, CheckpointEntry>;
}

interface StoredResult {
  person_id: string;
  name: string;
  url: string;
  confidence: "confirmed" | "likely";
  signals: string[];
  query: string;
  snippet: string;
  title: string;
  source_url: string;
  engine: string;
  at: string;
}

interface Person {
  id: string;
  name: string;
  displayName: string;
  tokens: string[];
  aliasesJson: string;
  founderStatus: string | null;
  verificationStatus: string | null;
  campusIds: string[];
  schools: string[];
  startups: string[];
  programs: string[];
  ownUrls: string[];
  startupUrls: string[];
  commonName: boolean;
  priority: number;
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

function loadCheckpoint(): Checkpoint {
  try {
    const parsed = JSON.parse(fs.readFileSync(CHECKPOINT_PATH, "utf8")) as Checkpoint;
    parsed.people ??= {};
    return parsed;
  } catch {
    return { people: {} };
  }
}

function saveCheckpoint(checkpoint: Checkpoint) {
  fs.mkdirSync(path.dirname(CHECKPOINT_PATH), { recursive: true });
  const tmp = `${CHECKPOINT_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(checkpoint));
  fs.renameSync(tmp, CHECKPOINT_PATH);
}

function appendResult(row: StoredResult) {
  fs.mkdirSync(path.dirname(RESULTS_PATH), { recursive: true });
  fs.appendFileSync(RESULTS_PATH, `${JSON.stringify(row)}\n`);
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function skipHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return ["linkedin.com", "facebook.com", "instagram.com", "twitter.com", "x.com", "google.com", "youtube.com", "tiktok.com", "duckduckgo.com"].some(
      (domain) => host === domain || host.endsWith(`.${domain}`)
    );
  } catch {
    return true;
  }
}

function ownUrls(aliasesJson: string): string[] {
  let aliases: string[] = [];
  try {
    const parsed = JSON.parse(aliasesJson) as unknown;
    aliases = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
  const urls: string[] = [];
  for (const alias of aliases) {
    if (alias.startsWith("devpost:http")) urls.push(alias.slice("devpost:".length));
    else if (alias.startsWith("site:http")) urls.push(alias.slice("site:".length));
    else if (alias.startsWith("github:")) {
      const handle = alias.slice("github:".length).replace(/^https?:\/\/github\.com\//, "").split("/")[0];
      if (/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(handle)) urls.push(`https://github.com/${handle}`);
    }
  }
  return [...new Set(urls)].filter((url) => !skipHost(url));
}

function hasLinkedInAlias(aliasesJson: string): boolean {
  return aliasesJson.includes("linkedin.com/in/");
}

function allLinkedIns(html: string): string[] {
  const found = html.match(/https?:\/\/(?:[\w.-]+\.)?linkedin\.com\/in\/[A-Za-z0-9\-_%]{3,100}/gi) ?? [];
  const urls = new Set<string>();
  for (const raw of found) {
    const url = normalizeLinkedInUrl(raw);
    if (url) urls.add(url);
  }
  return [...urls];
}

function citeUrl(text: string): string | null {
  const direct = text.match(/https?:\/\/(?:[\w.-]+\.)?linkedin\.com\/in\/[A-Za-z0-9\-_%]{3,100}/i);
  if (direct) return normalizeLinkedInUrl(direct[0]);
  const crumb = text.match(/linkedin\.com\s*(?:›|\/)\s*([A-Za-z0-9\-_%]{3,100})/i);
  if (!crumb || /^(pub|dir|in|company|school)$/i.test(crumb[1])) return null;
  return normalizeLinkedInUrl(`https://www.linkedin.com/in/${crumb[1]}`);
}

interface Baseline {
  confirmed: number;
  likely: number;
  missing: number;
}

function countCoverage(db: ReturnType<typeof getDb>): Baseline {
  const confirmed = (
    db.prepare(`SELECT COUNT(*) AS c FROM people WHERE aliases_json LIKE '%linkedin.com/in%'`).get() as { c: number }
  ).c;
  const likely = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT entity_id) AS c FROM claims
         WHERE entity_type = 'person' AND claim_type = 'linkedin_candidate' AND verification_state = 'likely'
           AND entity_id NOT IN (SELECT id FROM people WHERE aliases_json LIKE '%linkedin.com/in%')`
      )
      .get() as { c: number }
  ).c;
  const people = (db.prepare(`SELECT COUNT(*) AS c FROM people`).get() as { c: number }).c;
  return { confirmed, likely, missing: people - confirmed - likely };
}

function ensureSource(db: ReturnType<typeof getDb>) {
  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at)
     VALUES (?, 'LinkedIn public web search', 'code_host', 'https://www.google.com/search', '[]', 2, 'html_scrape', 'available', ?)
     ON CONFLICT(id) DO UPDATE SET last_attempt_at = excluded.last_attempt_at`
  ).run(SOURCE_ID, nowIso());
}

function storeMatch(db: ReturnType<typeof getDb>, person: { id: string; name: string }, match: AcceptMatch, engine: string): Outcome {
  const now = nowIso();
  const evidence = {
    linkedin: match.url,
    confidence: match.confidence,
    query: match.query,
    snippet: match.snippet,
    title: match.title,
    signals: match.signals,
    fromSite: match.fromSite,
    engine,
  };
  const excerpt = `${person.name}: ${match.confidence} LinkedIn ${match.url}. Signals: ${match.signals.join(", ") || "site link"}. Query: ${match.query}. Snippet: ${match.snippet}`.slice(0, 900);
  const outcome = db.transaction((): Outcome => {
    const row = db.prepare(`SELECT aliases_json FROM people WHERE id = ?`).get(person.id) as { aliases_json: string } | undefined;
    if (!row) return "not_found";
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
        `SELECT 1 AS ok FROM claims
         WHERE entity_type = 'person' AND entity_id = ? AND claim_type = 'linkedin_candidate' AND source_url = ? LIMIT 1`
      )
      .get(person.id, match.url) as { ok: number } | undefined;
    if (existing) return "existing";
    db.prepare(
      `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, source_url, retrieved_at, label, verification_state)
       VALUES (?, 'person', ?, 'linkedin_candidate', ?, ?, ?, ?, ?, 'observed_fact', 'likely')`
    ).run(newId("claim"), person.id, JSON.stringify({ ...evidence, reason: "name plus one of school, startup, or program" }), excerpt, SOURCE_ID, match.url, now);
    return "likely";
  })();
  if (outcome === "confirmed" || outcome === "likely") {
    appendResult({
      person_id: person.id,
      name: person.name,
      url: match.url,
      confidence: match.confidence,
      signals: match.signals,
      query: match.query,
      snippet: match.snippet,
      title: match.title,
      source_url: match.fromSite ? match.query : match.url,
      engine,
      at: now,
    });
  }
  return outcome;
}

function loadPeople(db: ReturnType<typeof getDb>): Person[] {
  const rows = db
    .prepare(`SELECT id, name, aliases_json, founder_status, verification_status FROM people`)
    .all() as { id: string; name: string; aliases_json: string; founder_status: string | null; verification_status: string | null }[];
  const keys = new Map<string, number>();
  const tokensById = new Map<string, string[]>();
  for (const row of rows) {
    const tokens = nameTokens(row.name);
    tokensById.set(row.id, tokens);
    if (tokens.length < 2) continue;
    const key = `${tokens[0].toLowerCase()} ${tokens[tokens.length - 1].toLowerCase()}`;
    keys.set(key, (keys.get(key) ?? 0) + 1);
  }
  const campuses = new Map<string, { id: string; name: string }[]>();
  for (const row of db
    .prepare(
      `SELECT a.person_id AS person_id, u.id AS id, u.name AS name
       FROM affiliations a JOIN universities u ON u.id = a.university_id`
    )
    .all() as { person_id: string; id: string; name: string }[]) {
    const list = campuses.get(row.person_id) ?? [];
    list.push({ id: row.id, name: row.name });
    campuses.set(row.person_id, list);
  }
  const startups = new Map<string, string[]>();
  const programs = new Map<string, string[]>();
  const startupUrls = new Map<string, string[]>();
  for (const row of db
    .prepare(
      `SELECT ppr.person_id AS person_id, pr.name AS name, pr.kind AS kind, pr.website_url AS website_url, pr.primary_link AS primary_link
       FROM person_project_roles ppr JOIN projects pr ON pr.id = ppr.project_id`
    )
    .all() as { person_id: string; name: string; kind: string; website_url: string | null; primary_link: string | null }[]) {
    const usable = usableOrgName(row.name);
    if (row.kind === "company") {
      if (usable) {
        const list = startups.get(row.person_id) ?? [];
        if (!list.includes(usable)) list.push(usable);
        startups.set(row.person_id, list);
      }
      const urls = startupUrls.get(row.person_id) ?? [];
      for (const url of [row.website_url, row.primary_link]) {
        if (url && /^https?:\/\//i.test(url) && !skipHost(url) && !urls.includes(url)) urls.push(url);
      }
      startupUrls.set(row.person_id, urls);
    } else if (usable) {
      const list = programs.get(row.person_id) ?? [];
      if (!list.includes(usable)) list.push(usable);
      programs.set(row.person_id, list);
    }
  }
  const people: Person[] = [];
  for (const row of rows) {
    if (hasLinkedInAlias(row.aliases_json)) continue;
    const tokens = tokensById.get(row.id) ?? [];
    const campus = campuses.get(row.id) ?? [];
    const schoolSet = new Set<string>();
    for (const item of campus) {
      for (const phrase of schoolPhrases(item.id, item.name)) schoolSet.add(phrase);
    }
    const key = tokens.length >= 2 ? `${tokens[0].toLowerCase()} ${tokens[tokens.length - 1].toLowerCase()}` : "";
    const focus = campus.some((item) => FOCUS_CAMPUSES.has(item.id));
    const verified = row.verification_status === "confirmed";
    const priority = row.founder_status === "founder" && verified && focus ? 0 : row.founder_status === "founder" ? 1 : 2;
    people.push({
      id: row.id,
      name: row.name,
      displayName: tokens.join(" "),
      tokens,
      aliasesJson: row.aliases_json,
      founderStatus: row.founder_status,
      verificationStatus: row.verification_status,
      campusIds: campus.map((item) => item.id),
      schools: [...schoolSet],
      startups: startups.get(row.id) ?? [],
      programs: programs.get(row.id) ?? [],
      ownUrls: ownUrls(row.aliases_json),
      startupUrls: startupUrls.get(row.id) ?? [],
      commonName: tokens.length >= 2 && isCommonName(tokens, keys.get(key) ?? 1),
      priority,
    });
  }
  people.sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
  return people;
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      try {
        await fn(current);
      } catch (error) {
        console.error(error instanceof Error ? error.message : error);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, () => worker()));
}

const pageCache = new Map<string, string | null>();

async function fetchHtml(url: string): Promise<string | null> {
  if (pageCache.has(url)) return pageCache.get(url) ?? null;
  await sleep(180);
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

async function fetchStartupHtml(url: string): Promise<string | null> {
  const home = await fetchHtml(url);
  if (home && /linkedin\.com\/in\//i.test(home)) return home;
  let origin = "";
  try {
    origin = new URL(url).origin;
  } catch {
    return home;
  }
  for (const suffix of ["/team", "/about", "/about-us", "/founders"]) {
    const extra = await fetchHtml(`${origin}${suffix}`);
    if (extra && /linkedin\.com\/in\//i.test(extra)) return extra;
  }
  return home;
}

function ownHit(html: string, person: Person, pageUrl: string): MatchHit | null {
  if (!mentionsFullName(stripTags(html), person.name)) return null;
  const near = nearbyLinkedIn(html, person.name);
  if (near.length === 1) {
    return { url: near[0].url, title: person.displayName, snippet: near[0].excerpt, query: pageUrl, fromSite: true };
  }
  if (near.length > 1) return null;
  const all = allLinkedIns(html).filter((url) => slugLooksLikeName(url, person.name));
  if (all.length !== 1) return null;
  return { url: all[0], title: person.displayName, snippet: stripTags(html).slice(0, 320), query: pageUrl, fromSite: true };
}

function ensureSearchDisplay() {
  if (fs.existsSync("/tmp/.X11-unix/X99")) return;
  const display = spawn("Xvfb", [SEARCH_DISPLAY, "-screen", "0", "1280x900x24"], { detached: true, stdio: "ignore" });
  display.unref();
}

class SearchBrowser {
  private ws: WebSocket | null = null;
  private nextId = 0;
  private pending = new Map<number, { resolve: (value: { result?: { result?: { value?: unknown } } }) => void; reject: (error: Error) => void }>();
  private listeners = new Set<(message: { method?: string; params?: { request?: { url?: string }; requestId?: string; frame?: { url?: string } } }) => void>();
  private chrome: ChildProcess | null = null;
  private lastSearch = 0;
  disabledUntil = new Map<string, number>();
  private searchCount = 0;

  enginesExhausted(): boolean {
    return ["google", "bing", "duckduckgo"].every((engine) => (this.disabledUntil.get(engine) ?? 0) > Date.now());
  }

  async recycle() {
    this.ws?.close();
    this.ws = null;
    this.pending.clear();
    if (this.chrome?.pid) {
      try {
        process.kill(-this.chrome.pid, "SIGKILL");
      } catch {
        try {
          process.kill(this.chrome.pid, "SIGKILL");
        } catch {
          // already exited
        }
      }
    }
    this.chrome = null;
    for (let attempt = 0; attempt < 20 && (await this.cdpUp()); attempt += 1) await sleep(200);
    await this.start();
  }

  async start() {
    ensureSearchDisplay();
    for (let attempt = 0; attempt < 20 && !fs.existsSync("/tmp/.X11-unix/X99"); attempt += 1) await sleep(100);
    const ready = await this.cdpUp();
    if (!ready) {
      this.chrome = spawn(
        "google-chrome",
        [
          "--no-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          `--user-data-dir=/tmp/linkedin-free-chrome-${Date.now()}`,
          `--remote-debugging-port=${CDP_PORT}`,
          "--window-size=1200,900",
          "about:blank",
        ],
        { detached: true, stdio: "ignore", env: { ...process.env, DISPLAY: SEARCH_DISPLAY } }
      );
      this.chrome.unref();
      for (let attempt = 0; attempt < 20; attempt += 1) {
        if (await this.cdpUp()) break;
        await sleep(250);
      }
    }
    const list = JSON.parse(await httpGet(`http://127.0.0.1:${CDP_PORT}/json/list`)) as { type: string; webSocketDebuggerUrl: string }[];
    const page = list.find((target) => target.type === "page");
    if (!page) throw new Error("Chrome did not open a page");
    this.ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      this.ws!.onopen = () => resolve();
      this.ws!.onerror = () => reject(new Error("Chrome DevTools socket failed"));
    });
    this.ws.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as { id?: number; error?: { message?: string }; method?: string; params?: { request?: { url?: string }; requestId?: string; frame?: { url?: string } }; result?: { result?: { value?: unknown } } };
      if (message.id && this.pending.has(message.id)) {
        const waiter = this.pending.get(message.id)!;
        this.pending.delete(message.id);
        if (message.error) waiter.reject(new Error(message.error.message || "cdp error"));
        else waiter.resolve(message);
      }
      for (const listener of this.listeners) listener(message);
    };
    await this.send("Page.enable");
    await this.send("Network.enable");
  }

  private async cdpUp(): Promise<boolean> {
    try {
      await httpGet(`http://127.0.0.1:${CDP_PORT}/json/version`);
      return true;
    } catch {
      return false;
    }
  }

  private send(method: string, params: Record<string, unknown> = {}, timeout = 20_000) {
    const id = ++this.nextId;
    return new Promise<{ result?: { result?: { value?: unknown } } }>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`timeout ${method}`));
      }, timeout);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.ws?.send(JSON.stringify({ id, method, params }));
    });
  }

  async search(query: string, person: Person): Promise<{ hits: MatchHit[]; blocked: boolean }> {
    const engines = ["google", "bing", "duckduckgo"];
    this.searchCount += 1;
    const start = this.searchCount % engines.length;
    const order = [...engines.slice(start), ...engines.slice(0, start)].filter((engine) => (this.disabledUntil.get(engine) ?? 0) < Date.now());
    const tried = order.length > 0 ? order : ["google"];
    let blocked = false;
    for (const engine of tried) {
      const gap = SEARCH_GAP_MS - (Date.now() - this.lastSearch);
      if (gap > 0) await sleep(gap);
      this.lastSearch = Date.now();
      try {
        const result =
          engine === "google" ? await this.searchGoogle(query, person) : engine === "bing" ? await searchBing(query, person) : await searchDuckDuckGo(query, person);
        if (result.blocked) {
          blocked = true;
          this.disabledUntil.set(engine, Date.now() + 90_000);
          console.log(`  ${engine} blocked, rotating`);
          continue;
        }
        const hits = result.hits.map((hit) => ({ ...hit, query }));
        if (hits.length > 0) return { hits, blocked: false };
        if (engine === "google") return { hits: [], blocked: false };
      } catch (error) {
        blocked = true;
        this.disabledUntil.set(engine, Date.now() + 60_000);
        console.log(`  ${engine} error: ${error instanceof Error ? error.message : error}`);
      }
    }
    return { hits: [], blocked };
  }

  private async searchGoogle(query: string, person: Person): Promise<{ blocked: boolean; hits: MatchHit[] }> {
    const url = `https://www.google.com/search?hl=en&gbv=1&num=8&q=${encodeURIComponent(query)}`;
    await this.send("Page.navigate", { url });
    let preview = "";
    for (let attempt = 0; attempt < 16; attempt += 1) {
      await sleep(250);
      const evaluated = await this.send("Runtime.evaluate", {
        expression: "document.body ? document.body.innerText.slice(0, 500) : ''",
        returnByValue: true,
      });
      preview = String(evaluated.result?.result?.value ?? "");
      if (/Search Results|No results found|unusual traffic|Before you continue|detected unusual/i.test(preview)) break;
    }
    const locationEval = await this.send("Runtime.evaluate", { expression: "location.href", returnByValue: true });
    const location = String(locationEval.result?.result?.value ?? "");
    if (/\/sorry\/|unusual traffic|detected unusual|Before you continue to Google/i.test(`${location}\n${preview}`) && !/Search Results/i.test(preview)) {
      return { blocked: true, hits: [] };
    }
    const evaluated = await this.send("Runtime.evaluate", {
      expression: `(() => {
        const out = [];
        const seen = new Set();
        for (const a of document.querySelectorAll('a')) {
          const href = a.href || '';
          if (!/\\/goto\\?url=/.test(href) && !/linkedin\\.com\\/in\\//.test(href)) continue;
          let node = a.parentElement;
          let blob = '';
          for (let i = 0; i < 8 && node; i++) {
            const t = (node.innerText || '').trim();
            if (t.length > blob.length && t.length < 900) blob = t;
            if (t.length > 80 && t.length < 900) break;
            node = node.parentElement;
          }
          if (blob.length < 24 || seen.has(blob.slice(0, 120))) continue;
          seen.add(blob.slice(0, 120));
          out.push({ href, text: blob.slice(0, 700) });
          if (out.length >= 6) break;
        }
        return out;
      })()`,
      returnByValue: true,
    });
    const blocks = (evaluated.result?.result?.value ?? []) as { href: string; text: string }[];
    if (this.searchCount <= 3) {
      console.log(`  google preview: ${preview.replace(/\s+/g, " ").slice(0, 180)}`);
      console.log(`  google blocks: ${blocks.length}`);
    }
    const hits: MatchHit[] = [];
    let resolved = 0;
    for (const block of blocks) {
      if (!mentionsFullName(block.text, person.name)) continue;
      const lines = block.text.split("\n").map((line) => line.trim()).filter(Boolean);
      const title = lines[0] ?? "";
      const snippet = lines.slice(1).join(" ") || block.text;
      let linked = citeUrl(block.text);
      if (!linked && resolved < 1) {
        resolved += 1;
        linked = await this.resolveLinkedIn(block.href);
      }
      if (!linked) continue;
      hits.push({ url: linked, title, snippet: `${title} ${snippet}`.slice(0, 500), query });
    }
    return { blocked: false, hits };
  }

  private async resolveLinkedIn(href: string): Promise<string | null> {
    const direct = normalizeLinkedInUrl(href);
    if (direct) return direct;
    let captured: string | null = null;
    const listener = (message: { method?: string; params?: { request?: { url?: string }; requestId?: string; frame?: { url?: string } } }) => {
      const requestUrl = message.params?.request?.url || message.params?.frame?.url || "";
      const normalized = normalizeLinkedInUrl(requestUrl);
      if (normalized) captured = normalized;
      if (message.method === "Fetch.requestPaused" && message.params?.requestId) {
        this.send("Fetch.failRequest", { requestId: message.params.requestId, errorReason: "Aborted" }).catch(() => undefined);
      }
    };
    this.listeners.add(listener);
    try {
      await this.send("Fetch.enable", { patterns: [{ urlPattern: "*linkedin.com/*", requestStage: "Request" }] });
      await this.send("Page.navigate", { url: href });
      const started = Date.now();
      while (!captured && Date.now() - started < 4000) await sleep(150);
    } catch {
      captured = captured || null;
    } finally {
      await this.send("Fetch.disable").catch(() => undefined);
      this.listeners.delete(listener);
      await this.send("Page.navigate", { url: "about:blank" }).catch(() => undefined);
    }
    return captured;
  }
}

function httpGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      let body = "";
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => resolve(body));
    });
    request.on("error", reject);
  });
}

async function searchBing(query: string, person: Person): Promise<{ blocked: boolean; hits: MatchHit[] }> {
  const response = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(query)}&mkt=en-US&count=10`, {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
  });
  const html = await response.text();
  const hits: MatchHit[] = [];
  const blocks = html.split('class="b_algo"').slice(1, 8);
  const algoText = blocks.map((block) => stripTags(block)).join(" ");
  for (const block of blocks) {
    const href = block.match(/href="([^"]+)"/i)?.[1]?.replace(/&amp;/g, "&") ?? "";
    let url = normalizeLinkedInUrl(href);
    if (!url) {
      const encoded = href.match(/[?&]u=a1([^&]+)/);
      if (encoded) {
        try {
          const payload = decodeURIComponent(encoded[1]);
          const pad = payload + "=".repeat((4 - (payload.length % 4)) % 4);
          url = normalizeLinkedInUrl(Buffer.from(pad, "base64").toString("utf8"));
        } catch {
          url = null;
        }
      }
    }
    const text = stripTags(block).slice(0, 500);
    if (!url || !mentionsFullName(text, person.name)) continue;
    hits.push({ url, title: text.slice(0, 140), snippet: text, query });
  }
  if (hits.length === 0 && (blocks.length === 0 || !mentionsFullName(algoText, person.name))) return { blocked: true, hits: [] };
  return { blocked: false, hits };
}

let duckDuckGoDisabled = false;

async function searchDuckDuckGo(query: string, person: Person): Promise<{ blocked: boolean; hits: MatchHit[] }> {
  if (duckDuckGoDisabled) return { blocked: true, hits: [] };
  const response = await fetch("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", Accept: "text/html" },
    body: new URLSearchParams({ q: query, kl: "us-en" }),
  });
  const html = await response.text();
  if (!html.includes("result__a") || /anomaly-modal|bots use DuckDuckGo/i.test(html)) {
    duckDuckGoDisabled = true;
    return { blocked: true, hits: [] };
  }
  const hits: MatchHit[] = [];
  const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const href = match[1].replace(/&amp;/g, "&");
    const wrapped = href.match(/uddg=([^&]+)/);
    const url = normalizeLinkedInUrl(decodeURIComponent(wrapped?.[1] ?? href));
    const title = stripTags(match[2]);
    const after = html.slice(match.index, match.index + 900);
    const snippetMatch = after.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td|div)>/i);
    const snippet = snippetMatch ? stripTags(snippetMatch[1]) : "";
    const text = `${title} ${snippet}`;
    if (!url || !mentionsFullName(text, person.name)) continue;
    hits.push({ url, title, snippet: text.slice(0, 500), query });
  }
  return { blocked: false, hits };
}

function remember(checkpoint: Checkpoint, personId: string, entry: CheckpointEntry) {
  checkpoint.people[personId] = entry;
  saveCheckpoint(checkpoint);
}

function queriesFor(person: Person): string[] {
  const quoted = `"${person.displayName}"`;
  const school = person.schools.find((phrase) => phrase.length <= 42) ?? person.schools[0];
  const startup = [...person.startups].sort((a, b) => b.length - a.length)[0];
  const program = [...person.programs].sort((a, b) => b.length - a.length)[0];
  const queries: string[] = [];
  if (school) queries.push(`${quoted} ${school} site:linkedin.com/in`);
  if (startup) queries.push(`${quoted} "${startup}" linkedin`);
  else if (program) queries.push(`${quoted} "${program}" linkedin`);
  return queries.slice(0, 2);
}

function printStats(db: ReturnType<typeof getDb>, checkpoint: Checkpoint) {
  const now = countCoverage(db);
  const baseline = checkpoint.baseline;
  console.log("\nLinkedIn coverage");
  if (baseline) {
    console.log(`Before: confirmed ${baseline.confirmed}, likely ${baseline.likely}, missing ${baseline.missing} (at ${baseline.at})`);
  }
  console.log(`After: confirmed ${now.confirmed}, likely ${now.likely}, missing ${now.missing}`);
  const ambiguous = Object.values(checkpoint.people).filter((entry) => entry.outcome === "ambiguous").length;
  console.log(`Skipped as ambiguous: ${ambiguous}`);
  const rows = db
    .prepare(
      `SELECT u.name AS name,
              COUNT(DISTINCT p.id) AS people,
              COUNT(DISTINCT CASE WHEN p.aliases_json LIKE '%linkedin.com/in%' THEN p.id END) AS confirmed,
              COUNT(DISTINCT CASE WHEN p.aliases_json NOT LIKE '%linkedin.com/in%' AND EXISTS (
                SELECT 1 FROM claims c
                WHERE c.entity_type = 'person' AND c.entity_id = p.id AND c.claim_type = 'linkedin_candidate' AND c.verification_state = 'likely'
              ) THEN p.id END) AS likely
       FROM people p
       JOIN affiliations a ON a.person_id = p.id
       JOIN universities u ON u.id = a.university_id
       GROUP BY u.id
       ORDER BY people DESC
       LIMIT 10`
    )
    .all() as { name: string; people: number; confirmed: number; likely: number }[];
  console.log("Top 10 campuses");
  for (const row of rows) {
    const covered = row.confirmed + row.likely;
    const pct = row.people ? Math.round((covered / row.people) * 1000) / 10 : 0;
    console.log(`  ${row.name}: ${covered}/${row.people} (${pct}%) confirmed ${row.confirmed}, likely ${row.likely}`);
  }
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

async function applyResults(db: ReturnType<typeof getDb>) {
  if (!fs.existsSync(RESULTS_PATH)) {
    console.log("No results file to apply.");
    return;
  }
  ensureSource(db);
  const lines = fs.readFileSync(RESULTS_PATH, "utf8").split("\n").filter(Boolean);
  let wrote = 0;
  let skipped = 0;
  for (const line of lines) {
    const row = JSON.parse(line) as StoredResult;
    const personId = resolvePersonId(db, row.person_id);
    const person = db.prepare(`SELECT id, name FROM people WHERE id = ?`).get(personId) as { id: string; name: string } | undefined;
    if (!person) {
      console.log(`skip missing ${row.person_id} ${row.name}`);
      skipped += 1;
      continue;
    }
    if (personId !== row.person_id) console.log(`redirect ${row.name} ${row.person_id} -> ${person.id} ${person.name}`);
    const match: AcceptMatch = {
      outcome: "accept",
      confidence: row.confidence,
      url: row.url,
      signals: row.signals.filter((signal): signal is "school" | "startup" | "program" => signal === "school" || signal === "startup" || signal === "program"),
      title: row.title,
      snippet: row.snippet,
      query: row.query,
      fromSite: row.engine === "site",
    };
    const outcome = storeMatch(db, person, match, row.engine);
    if (outcome === "confirmed" || outcome === "likely") wrote += 1;
    else skipped += 1;
  }
  db.pragma("wal_checkpoint(TRUNCATE)");
  console.log(`Applied ${wrote} rows, skipped ${skipped}.`);
}

console.log = (...args: unknown[]) => {
  fs.writeSync(1, `${args.map((item) => (typeof item === "string" ? item : JSON.stringify(item))).join(" ")}\n`);
};

async function main() {
  const db = getDb();
  const checkpoint = loadCheckpoint();
  if (hasFlag("--stats")) {
    printStats(db, checkpoint);
    return;
  }
  if (hasFlag("--apply")) {
    await applyResults(db);
    printStats(db, checkpoint);
    return;
  }
  if (!checkpoint.baseline) {
    const baseline = countCoverage(db);
    checkpoint.baseline = { ...baseline, at: nowIso() };
    saveCheckpoint(checkpoint);
    console.log(`Baseline confirmed ${baseline.confirmed}, likely ${baseline.likely}, missing ${baseline.missing}`);
  }
  ensureSource(db);
  const limit = Number(argValue("--limit") ?? "0");
  let people = loadPeople(db).filter((person) => !checkpoint.people[person.id]);
  if (limit > 0) people = people.slice(0, limit);
  console.log(`Queue ${people.length} people without a LinkedIn URL`);

  const harvestOnly = hasFlag("--harvest-only");
  const searchOnly = hasFlag("--search-only");

  if (!searchOnly) {
    const ownGroups = new Map<string, Person[]>();
    const startupGroups = new Map<string, Person[]>();
    for (const person of people) {
      if (person.tokens.length < 2) continue;
      for (const url of person.ownUrls) {
        const list = ownGroups.get(url) ?? [];
        list.push(person);
        ownGroups.set(url, list);
      }
      for (const url of person.startupUrls) {
        const list = startupGroups.get(url) ?? [];
        list.push(person);
        startupGroups.set(url, list);
      }
    }
    console.log(`Harvest ${ownGroups.size} own pages and ${startupGroups.size} startup pages`);
    await pool([...ownGroups.entries()], 4, async ([url, owners]) => {
      const html = await fetchHtml(url);
      if (!html) return;
      for (const person of owners) {
        if (checkpoint.people[person.id]?.outcome === "confirmed") continue;
        const hit = ownHit(html, person, url);
        if (!hit) continue;
        const judged = judgeHits({
          name: person.name,
          schools: person.schools,
          startups: person.startups,
          programs: person.programs,
          commonName: person.commonName,
          hits: [hit],
        });
        if (judged.outcome !== "accept") continue;
        const outcome = storeMatch(db, person, judged, "site");
        if (outcome === "confirmed" || outcome === "likely") {
          remember(checkpoint, person.id, { outcome, url: judged.url, confidence: judged.confidence, at: nowIso() });
          console.log(`  site ${outcome} ${person.name} ${judged.url}`);
        }
      }
    });
    await pool([...startupGroups.entries()], 4, async ([url, owners]) => {
      const html = await fetchStartupHtml(url);
      if (!html) return;
      const claimed = new Map<string, { person: Person; hit: MatchHit }>();
      const tied = new Set<string>();
      for (const person of owners) {
        if (checkpoint.people[person.id]?.outcome === "confirmed") continue;
        const near = nearbyLinkedIn(html, person.name);
        if (near.length !== 1) continue;
        const hit: MatchHit = { url: near[0].url, title: person.displayName, snippet: near[0].excerpt, query: url, fromSite: true };
        const prev = claimed.get(hit.url);
        if (prev && prev.person.id !== person.id) {
          tied.add(hit.url);
          continue;
        }
        claimed.set(hit.url, { person, hit });
      }
      for (const [linked, entry] of claimed) {
        if (tied.has(linked)) continue;
        const judged = judgeHits({
          name: entry.person.name,
          schools: entry.person.schools,
          startups: entry.person.startups,
          programs: entry.person.programs,
          commonName: entry.person.commonName,
          hits: [entry.hit],
        });
        if (judged.outcome !== "accept") continue;
        const outcome = storeMatch(db, entry.person, judged, "site");
        if (outcome === "confirmed" || outcome === "likely") {
          remember(checkpoint, entry.person.id, { outcome, url: judged.url, confidence: judged.confidence, at: nowIso() });
          console.log(`  startup ${outcome} ${entry.person.name} ${judged.url}`);
        }
      }
    });
  }

  if (!harvestOnly) {
    const browser = new SearchBrowser();
    await browser.start();
    let scanned = 0;
    for (const person of people) {
      if (checkpoint.people[person.id]) continue;
      scanned += 1;
      if (person.tokens.length < 2) {
        remember(checkpoint, person.id, { outcome: "skipped_name", reason: "no full name", at: nowIso() });
        continue;
      }
      const fresh = db.prepare(`SELECT aliases_json FROM people WHERE id = ?`).get(person.id) as { aliases_json: string } | undefined;
      if (fresh && hasLinkedInAlias(fresh.aliases_json)) {
        remember(checkpoint, person.id, { outcome: "existing", at: nowIso() });
        continue;
      }
      const hits: MatchHit[] = [];
      let ambiguousReason = "";
      let blockedQueries = 0;
      let recycles = 0;
      const queries = queriesFor(person);
      for (let qi = 0; qi < queries.length; qi += 1) {
        const query = queries[qi];
        const found = await browser.search(query, person);
        if (found.blocked && found.hits.length === 0) {
          blockedQueries += 1;
          const googleBlocked = (browser.disabledUntil.get("google") ?? 0) > Date.now();
          if (googleBlocked && recycles < 1) {
            recycles += 1;
            blockedQueries -= 1;
            qi -= 1;
            console.log("  recycling search browser after Google block");
            browser.disabledUntil.delete("google");
            await browser.recycle();
            continue;
          }
          if (browser.enginesExhausted()) break;
          continue;
        }
        hits.push(...found.hits);
        const partial = judgeHits({
          name: person.name,
          schools: person.schools,
          startups: person.startups,
          programs: person.programs,
          commonName: person.commonName,
          hits,
        });
        if (partial.outcome === "accept" && partial.confidence === "confirmed") break;
        if (partial.outcome === "ambiguous") ambiguousReason = partial.reason;
      }
      const judged = judgeHits({
        name: person.name,
        schools: person.schools,
        startups: person.startups,
        programs: person.programs,
        commonName: person.commonName,
        hits,
      });
      if (blockedQueries > 0 && judged.outcome !== "accept" && judged.outcome !== "ambiguous" && !ambiguousReason) {
        console.log("Search engines are blocked. Stopping so the remaining people can be retried.");
        break;
      }
      if (hits.length === 0 && blockedQueries > 0 && (blockedQueries === queries.length || browser.enginesExhausted())) {
        console.log("Search engines are blocked. Stopping so the remaining people can be retried.");
        break;
      }
      if (judged.outcome === "accept") {
        const outcome = storeMatch(db, person, judged, judged.fromSite ? "site" : "search");
        remember(checkpoint, person.id, {
          outcome: outcome === "existing" ? "existing" : outcome,
          url: judged.url,
          confidence: judged.confidence,
          at: nowIso(),
        });
        console.log(`${scanned} ${outcome} ${person.name} ${judged.url} [${judged.signals.join("+") || "site"}]`);
      } else if (judged.outcome === "ambiguous" || ambiguousReason) {
        remember(checkpoint, person.id, { outcome: "ambiguous", reason: judged.outcome === "ambiguous" ? judged.reason : ambiguousReason, at: nowIso() });
        console.log(`${scanned} ambiguous ${person.name}`);
      } else {
        remember(checkpoint, person.id, { outcome: "not_found", at: nowIso() });
        console.log(`${scanned} not_found ${person.name}`);
      }
      if (scanned % 40 === 0) db.pragma("wal_checkpoint(PASSIVE)");
    }
  }

  db.pragma("wal_checkpoint(TRUNCATE)");
  printStats(db, checkpoint);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
