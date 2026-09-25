// Free LinkedIn lookup. Does not call Apify and does not open linkedin.com.
//
//   npx tsx scripts/ingest/search-linkedin-web.ts --dry-run
//   npx tsx scripts/ingest/search-linkedin-web.ts --tier 1
//   npx tsx scripts/ingest/search-linkedin-web.ts --tier 1 --max-tier 2
//
// For each person still missing a confirmed linkedin.com/in URL, this asks
// DuckDuckGo's HTML endpoint, then Marginalia, and also reads the person's
// company site and personal site. A URL is confirmed only when it is a
// linkedin.com/in profile and the result title, snippet, or page text shows
// the full name plus the school or one of their companies. A company site
// or personal site that names the person and links a profile counts as the
// company/person evidence. Name-only matches are stored as linkedin_candidate
// (verification_state unverified). Nothing is built from a name.
//
// Resumable: each person gets a linkedin_web_search_attempt claim before the
// next person. Re-running skips anyone already attempted or already confirmed.
// --tier N (default 1) and --max-tier M (default: same as --tier) bound which
// priority band to walk. Priority matches data/exports/linkedin-queue.csv.

import { getDb, newId, nowIso } from "../../lib/db/client";
import { recomputePersonEnrollment } from "../../lib/domain/enrollment-store";

const SOURCE_ID = "src_linkedin_search_web";
const DELAY_MS = 1400;
const MAX_CANDIDATES = 3;
const MAX_PAGE_BYTES = 500_000;

const SCHOOL_PATTERNS: Record<string, RegExp> = {
  univ_penn: /university of pennsylvania|\bupenn\b|\bwharton\b|penn engineering/i,
  univ_berkeley: /university of california,?\s*berkeley|uc berkeley|\bberkeley\b/i,
  univ_waterloo: /university of waterloo|\bwaterloo\b/i,
  univ_stanford: /\bstanford\b/i,
  univ_mit: /massachusetts institute of technology|\bmit\b/i,
  univ_harvard: /\bharvard\b/i,
};

const SCHOOL_QUERY: Record<string, string> = {
  univ_penn: "University of Pennsylvania",
  univ_berkeley: "UC Berkeley",
  univ_waterloo: "University of Waterloo",
  univ_stanford: "Stanford University",
  univ_mit: "MIT",
  univ_harvard: "Harvard University",
};

const CAMPUS_RANK: Record<string, number> = {
  univ_penn: 0,
  univ_berkeley: 1,
  univ_stanford: 2,
  univ_mit: 3,
  univ_harvard: 4,
  univ_waterloo: 5,
};

const UA = "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0";

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  return process.argv[i + 1] ?? null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function splitName(full: string): { first: string; last: string } {
  const parts = full
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z'-]/g, ""))
    .filter((t) => t.length > 1);
  if (parts.length < 2) return { first: "", last: "" };
  return { first: parts[0], last: parts[parts.length - 1] };
}

function escapeReg(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function textHasName(text: string, first: string, last: string): boolean {
  if (!first || !last) return false;
  const gap = "(?:[^\\w]+|\\s+)";
  const pattern = new RegExp(
    `\\b${escapeReg(first)}\\b${gap}\\b${escapeReg(last)}\\b|\\b${escapeReg(last)}\\b${gap}\\b${escapeReg(first)}\\b`,
    "i"
  );
  return pattern.test(text);
}

function linkLabel(html: string, linkedinUrl: string): string {
  const slug = linkedinUrl.split("/in/")[1]?.split(/[?#/]/)[0]?.toLowerCase();
  if (!slug) return "";
  const idx = html.toLowerCase().indexOf(`/in/${slug}`);
  if (idx < 0) return "";
  const start = html.lastIndexOf("<a", idx);
  const end = html.indexOf("</a>", idx);
  if (start < 0 || end < 0 || idx - start > 400) return "";
  const anchorText = stripTags(html.slice(start, end + 4)).trim();
  if (anchorText.length >= 3) return anchorText;
  return stripTags(html.slice(Math.max(0, start - 140), start)).trim().slice(-80);
}

function normalizeLinkedIn(raw: string): string | null {
  const match = raw.match(/https?:\/\/(?:[\w.-]+\.)?linkedin\.com\/in\/[A-Za-z0-9\-_%]+/i);
  if (!match) return null;
  let url = match[0].replace(/\/+$/, "");
  url = url.replace(/^http:\/\//i, "https://").replace(/\/\/[\w.-]+\.linkedin\.com/i, "//www.linkedin.com");
  return url;
}

function extractLinkedIns(text: string): string[] {
  const found = text.match(/https?:\/\/(?:[\w.-]+\.)?linkedin\.com\/in\/[A-Za-z0-9\-_%]+/gi) ?? [];
  const urls = new Set<string>();
  for (const raw of found) {
    const url = normalizeLinkedIn(raw);
    if (url) urls.add(url);
  }
  return [...urls];
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function isSkippableHost(hostname: string): boolean {
  return (
    hostname === "linkedin.com" ||
    hostname.endsWith(".linkedin.com") ||
    hostname.endsWith("duckduckgo.com") ||
    hostname.endsWith("bing.com") ||
    hostname.endsWith("google.com") ||
    hostname.endsWith("marginalia.nu") ||
    hostname === "archive.org" ||
    hostname.endsWith(".archive.org") ||
    hostname.endsWith("facebook.com") ||
    hostname.endsWith("instagram.com") ||
    hostname === "t.co" ||
    hostname.endsWith("twitter.com") ||
    hostname === "x.com"
  );
}

interface Hit {
  url: string;
  title: string;
  snippet: string;
  engine: string;
}

async function fetchText(url: string): Promise<{ ok: boolean; status: number; text: string; finalUrl: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
    });
    const finalUrl = res.url || url;
    if (isSkippableHost(hostOf(finalUrl))) return { ok: false, status: res.status, text: "", finalUrl };
    const buf = await res.arrayBuffer();
    const slice = buf.byteLength > MAX_PAGE_BYTES ? buf.slice(0, MAX_PAGE_BYTES) : buf;
    const text = new TextDecoder("utf-8", { fatal: false }).decode(slice);
    return { ok: res.ok, status: res.status, text, finalUrl };
  } catch {
    return { ok: false, status: 0, text: "", finalUrl: url };
  } finally {
    clearTimeout(timer);
  }
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

let ddgDisabled = false;

async function searchDuckDuckGo(query: string): Promise<Hit[]> {
  if (ddgDisabled) return [];
  const body = new URLSearchParams({ q: query, kl: "us-en" });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  let html = "";
  try {
    const response = await fetch("https://html.duckduckgo.com/html/", {
      method: "POST",
      signal: controller.signal,
      headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", Accept: "text/html" },
      body,
    });
    html = await response.text();
  } catch {
    ddgDisabled = true;
    return [];
  } finally {
    clearTimeout(timer);
  }
  if (!html.includes("result__a")) {
    ddgDisabled = true;
    return [];
  }
  const hits: Hit[] = [];
  const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const href = match[1].replace(/&amp;/g, "&");
    const uddg = href.match(/uddg=([^&]+)/);
    const url = decodeURIComponent(uddg?.[1] ?? href);
    const title = stripTags(match[2]);
    const after = html.slice(match.index, match.index + 1200);
    const snippetMatch = after.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td|div)>/i);
    const snippet = snippetMatch ? stripTags(snippetMatch[1]) : "";
    if (url.startsWith("http")) hits.push({ url, title, snippet, engine: "duckduckgo" });
  }
  return hits;
}

function marginaliaHits(html: string): Hit[] {
  const hits: Hit[] = [];
  const seen = new Set<string>();
  const re = /<h2[^>]*>\s*<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const target = match[1].replace(/&amp;/g, "&");
    if (target.includes("web.archive.org")) continue;
    const host = hostOf(target);
    if (!host || isSkippableHost(host) || seen.has(target)) continue;
    seen.add(target);
    hits.push({ url: target, title: stripTags(match[2]), snippet: "", engine: "marginalia" });
    if (hits.length >= 4) break;
  }
  return hits;
}

async function searchMarginalia(query: string): Promise<Hit[]> {
  let url = `https://search.marginalia.nu/search?query=${encodeURIComponent(query)}`;
  let html = "";
  for (let hop = 0; hop < 3; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { "User-Agent": UA, Accept: "text/html" } });
      html = await response.text();
    } catch {
      return [];
    } finally {
      clearTimeout(timer);
    }
    const hits = marginaliaHits(html);
    if (hits.length > 0) return hits;
    const redirect = html.match(/location\.replace\('([^']+)'\)/);
    if (!redirect) return [];
    const path = redirect[1].replace(/\\\//g, "/").replace(/\\-/g, "-");
    url = new URL(path, "https://search.marginalia.nu").href;
  }
  return marginaliaHits(html);
}

interface PersonRow {
  id: string;
  name: string;
  campus_id: string;
  school_name: string;
  companies: string;
  sites: string;
  aliases_json: string;
  enrollment_status: string;
  is_founder_role: number;
}

function priorityOf(row: PersonRow): number {
  const focus = row.enrollment_status === "current_student" || row.enrollment_status === "recent_grad";
  if (row.is_founder_role && focus) return 1;
  if (row.is_founder_role) return 2;
  if (focus) return 3;
  return 4;
}

function personalSites(aliasesJson: string): string[] {
  let aliases: string[] = [];
  try {
    aliases = JSON.parse(aliasesJson || "[]");
  } catch {
    return [];
  }
  const urls: string[] = [];
  for (const alias of aliases) {
    if (alias.startsWith("site:http")) urls.push(alias.slice("site:".length));
    else if (/^https?:\/\//i.test(alias) && !alias.includes("linkedin.com")) urls.push(alias);
  }
  return urls;
}

function confirms(text: string, campusId: string, companies: string[]): boolean {
  const schoolRe = SCHOOL_PATTERNS[campusId];
  if (schoolRe && schoolRe.test(text)) return true;
  const hay = text.toLowerCase();
  for (const company of companies) {
    const needle = company.toLowerCase().trim();
    if (needle.length >= 4 && hay.includes(needle)) return true;
  }
  return false;
}

const pageCache = new Map<string, { text: string; links: string[]; html: string }>();

async function readPage(url: string): Promise<{ text: string; links: string[]; html: string } | null> {
  if (pageCache.has(url)) return pageCache.get(url)!;
  const host = hostOf(url);
  if (!host || isSkippableHost(host)) return null;
  await sleep(DELAY_MS);
  const page = await fetchText(url);
  if (!page.text) {
    const empty = { text: "", links: [], html: "" };
    pageCache.set(url, empty);
    return null;
  }
  const text = stripTags(page.text);
  const links = extractLinkedIns(page.text);
  const value = { text, links, html: page.text };
  pageCache.set(url, value);
  pageCache.set(page.finalUrl, value);
  return value;
}

function teamLink(html: string, pageUrl: string): string | null {
  const host = hostOf(pageUrl);
  const re = /href="([^"]+)"/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const href = match[1];
    if (!/team|about|people|founders|leadership/i.test(href)) continue;
    try {
      const abs = new URL(href, pageUrl);
      if (hostOf(abs.href) !== host) continue;
      if (isSkippableHost(hostOf(abs.href))) continue;
      return abs.href;
    } catch {
      continue;
    }
  }
  return null;
}

async function main() {
  const dry = process.argv.includes("--dry-run");
  const tierStart = Math.max(1, parseInt(argValue("--tier") || "1", 10) || 1);
  const tierEnd = Math.max(tierStart, parseInt(argValue("--max-tier") || String(tierStart), 10) || tierStart);
  const limit = Math.max(1, parseInt(argValue("--limit") || "500", 10) || 500);
  const db = getDb();

  const rows = db
    .prepare(
      `SELECT pe.id as id, pe.name as name, pe.aliases_json as aliases_json,
              COALESCE(pe.enrollment_status, 'unknown') as enrollment_status,
              CASE WHEN EXISTS (
                SELECT 1 FROM person_project_roles ppr
                JOIN projects p ON p.id = ppr.project_id AND p.kind = 'company'
                WHERE ppr.person_id = pe.id
              ) THEN 1 ELSE 0 END as is_founder_role,
              COALESCE((
                SELECT a.university_id FROM affiliations a
                WHERE a.person_id = pe.id
                ORDER BY CASE a.university_id
                  WHEN 'univ_penn' THEN 0 WHEN 'univ_berkeley' THEN 1
                  WHEN 'univ_stanford' THEN 2 WHEN 'univ_mit' THEN 3
                  WHEN 'univ_harvard' THEN 4 WHEN 'univ_waterloo' THEN 5 ELSE 9 END
                LIMIT 1
              ), '') as campus_id,
              COALESCE((
                SELECT u.name FROM affiliations a JOIN universities u ON u.id = a.university_id
                WHERE a.person_id = pe.id
                ORDER BY CASE a.university_id
                  WHEN 'univ_penn' THEN 0 WHEN 'univ_berkeley' THEN 1 ELSE 9 END
                LIMIT 1
              ), '') as school_name,
              COALESCE((
                SELECT group_concat(name, ' | ') FROM (
                  SELECT DISTINCT p.name as name FROM person_project_roles ppr
                  JOIN projects p ON p.id = ppr.project_id AND p.kind = 'company'
                  WHERE ppr.person_id = pe.id
                )
              ), '') as companies,
              COALESCE((
                SELECT group_concat(site, ' ') FROM (
                  SELECT DISTINCT p.website_url as site FROM person_project_roles ppr
                  JOIN projects p ON p.id = ppr.project_id AND p.kind = 'company'
                  WHERE ppr.person_id = pe.id AND p.website_url IS NOT NULL AND p.website_url != ''
                )
              ), '') as sites
       FROM people pe
       WHERE pe.aliases_json NOT LIKE '%linkedin.com/in/%'
         AND pe.id NOT IN (SELECT entity_id FROM claims WHERE claim_type = 'linkedin_web_search_attempt')`
    )
    .all() as PersonRow[];

  const queue = rows
    .map((row) => ({ ...row, priority: priorityOf(row), campus_rank: CAMPUS_RANK[row.campus_id] ?? 9 }))
    .filter((row) => row.priority >= tierStart && row.priority <= tierEnd)
    .sort((a, b) => a.priority - b.priority || a.campus_rank - b.campus_rank || a.name.localeCompare(b.name));

  console.log(`Web search queue tiers ${tierStart}-${tierEnd}: ${queue.length} people. This invocation takes ${Math.min(limit, queue.length)}.`);
  if (dry) return;

  const now = nowIso();
  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at)
     VALUES (?, 'LinkedIn people search (public web)', 'code_host', 'https://html.duckduckgo.com/html/', '[]', 2, 'html_scrape', 'available', ?)
     ON CONFLICT(id) DO UPDATE SET last_attempt_at = excluded.last_attempt_at`
  ).run(SOURCE_ID, now);

  const insertClaim = db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, source_url, retrieved_at, label, verification_state)
     VALUES (?, 'person', ?, ?, ?, ?, ?, ?, ?, 'observed_fact', ?)`
  );
  const readAliases = db.prepare(`SELECT aliases_json FROM people WHERE id = ?`);
  const writeAliases = db.prepare(`UPDATE people SET aliases_json = ? WHERE id = ?`);

  const stats = new Map<string, { confirmed: number; unverified: number; notFound: number }>();
  function bump(campus: string, tier: number, key: "confirmed" | "unverified" | "notFound") {
    const id = `${tier}|${campus || "(no campus)"}`;
    const cur = stats.get(id) ?? { confirmed: 0, unverified: 0, notFound: 0 };
    cur[key] += 1;
    stats.set(id, cur);
  }

  const batch = queue.slice(0, limit);
  for (const person of batch) {
    const { first, last } = splitName(person.name);
    const companies = person.companies.split(" | ").map((s) => s.trim()).filter(Boolean);
    const schoolName = person.school_name || SCHOOL_QUERY[person.campus_id] || "";
    const companyBit = companies[0] ? ` "${companies[0]}"` : "";
    const query = schoolName ? `"${person.name}" "${schoolName}"${companyBit}` : `"${person.name}"${companyBit}`;
    console.log(`tier ${person.priority} ${person.campus_id || "-"} ${person.name} — ${query}`);

    const hits: Hit[] = [];
    try {
      await sleep(DELAY_MS);
      hits.push(...(await searchDuckDuckGo(query)));
      await sleep(DELAY_MS);
      hits.push(...(await searchMarginalia(query)));
    } catch (e) {
      console.log(`  search error: ${(e as Error).message}`);
    }

    const evidence = new Map<string, { text: string; where: string }>();
    function addEvidence(url: string | null, text: string, where: string) {
      if (!url) return;
      const normalized = normalizeLinkedIn(url);
      if (!normalized) return;
      const prev = evidence.get(normalized);
      if (!prev || text.length > prev.text.length) evidence.set(normalized, { text, where });
    }

    for (const hit of hits) {
      const direct = normalizeLinkedIn(hit.url);
      if (direct && textHasName(hit.title, first, last)) addEvidence(direct, `${hit.title}. ${hit.snippet}`, hit.engine);
      const blob = `${hit.title} ${hit.snippet}`;
      for (const url of extractLinkedIns(blob)) {
        const slug = url.split("/in/")[1]?.toLowerCase() ?? "";
        const idx = blob.toLowerCase().indexOf(slug);
        const around = idx >= 0 ? blob.slice(Math.max(0, idx - 80), idx + slug.length + 40) : hit.title;
        if (textHasName(around, first, last)) addEvidence(url, around, hit.engine);
      }
    }

    const ownSites = [...person.sites.split(/\s+/).filter(Boolean), ...personalSites(person.aliases_json)];
    const pagesToRead = new Set<string>();
    for (const site of ownSites) pagesToRead.add(site);
    for (const hit of hits) {
      if (!normalizeLinkedIn(hit.url) && !isSkippableHost(hostOf(hit.url))) pagesToRead.add(hit.url);
    }

    let pagesRead = 0;
    for (const pageUrl of pagesToRead) {
      if (pagesRead >= 4) break;
      const host = hostOf(pageUrl);
      const owned = ownSites.some((site) => hostOf(site) === host);
      if (!owned && pagesRead >= 2 && !ownSites.includes(pageUrl)) continue;
      pagesRead += 1;
      const page = await readPage(pageUrl);
      if (!page) continue;
      for (const url of page.links) {
        const label = linkLabel(page.html, url);
        if (textHasName(label, first, last)) addEvidence(url, label, pageUrl);
      }
    }

    if (evidence.size === 0) {
      for (const site of ownSites.slice(0, 2)) {
        const home = await readPage(site);
        if (!home?.html) continue;
        const next = teamLink(home.html, site);
        if (!next || pageCache.has(next)) continue;
        const team = await readPage(next);
        if (!team) continue;
        for (const url of team.links) {
          const label = linkLabel(team.html, url);
          if (textHasName(label, first, last)) addEvidence(url, label, next);
        }
      }
    }

    const named = [...evidence.entries()].filter(([, ev]) => textHasName(ev.text, first, last) || textHasName(ev.where, first, last));
    const confirmed = named.filter(([url, ev]) => {
      const owned = ownSites.some((site) => hostOf(ev.where) && hostOf(ev.where) === hostOf(site));
      if (owned && textHasName(ev.text, first, last)) return true;
      return confirms(`${ev.text} ${ev.where}`, person.campus_id, companies);
    });

    const attemptUrl = hits[0]?.url || ownSites[0] || "https://html.duckduckgo.com/html/";
    insertClaim.run(
      newId("claim"),
      person.id,
      "linkedin_web_search_attempt",
      JSON.stringify({
        query,
        engines: ddgDisabled ? ["marginalia", "sites"] : ["duckduckgo", "marginalia", "sites"],
        hits: hits.length,
        linkedinUrls: named.length,
        confirmed: confirmed.length,
      }),
      `Public-web LinkedIn search for ${person.name}: ${query}. ${hits.length} search hit(s), ${named.length} name-matched profile URL(s), ${confirmed.length} confirmed.`,
      SOURCE_ID,
      attemptUrl.startsWith("http") ? attemptUrl : "https://html.duckduckgo.com/html/",
      nowIso(),
      "corroborated"
    );

    if (confirmed.length === 1) {
      const [url, ev] = confirmed[0];
      const aliases = JSON.parse((readAliases.get(person.id) as { aliases_json: string }).aliases_json || "[]") as string[];
      if (!aliases.some((a) => a.includes("linkedin.com/in/"))) {
        aliases.push(`linkedin:${url}`);
        writeAliases.run(JSON.stringify(aliases), person.id);
      }
      const why = ownSites.some((site) => hostOf(ev.where) === hostOf(site))
        ? `the ${hostOf(ev.where)} page names ${person.name} and links this profile`
        : `the search result names ${person.name} and the school or company`;
      insertClaim.run(
        newId("claim"),
        person.id,
        "linkedin_alias_discovered",
        JSON.stringify({ linkedin: url, why, query }),
        `${person.name}: confirmed LinkedIn ${url} because ${why}. Evidence: ${ev.text.slice(0, 500)} Query: ${query}.`,
        SOURCE_ID,
        url,
        nowIso(),
        "corroborated"
      );
      recomputePersonEnrollment(db, person.id);
      bump(person.campus_id, person.priority, "confirmed");
      console.log(`  confirmed ${url}`);
    } else {
      const pool = confirmed.length > 1 ? confirmed : named;
      const reason = confirmed.length > 1 ? "more than one profile matched" : "name matched; school and company did not";
      let stored = 0;
      for (const [url, ev] of pool.slice(0, MAX_CANDIDATES)) {
        insertClaim.run(
          newId("claim"),
          person.id,
          "linkedin_candidate",
          JSON.stringify({ linkedin: url, reason, query }),
          `Unverified LinkedIn candidate for ${person.name}: ${url}. ${reason}. Evidence: ${ev.text.slice(0, 300)}`,
          SOURCE_ID,
          url,
          nowIso(),
          "unverified"
        );
        stored += 1;
      }
      if (stored > 0) {
        bump(person.campus_id, person.priority, "unverified");
        console.log(`  ${stored} unverified (${reason})`);
      } else {
        bump(person.campus_id, person.priority, "notFound");
        console.log("  not found");
      }
    }
  }

  db.pragma("wal_checkpoint(TRUNCATE)");
  console.log("Results by tier and campus:");
  for (const [key, value] of [...stats.entries()].sort()) {
    console.log(`  ${key}: confirmed ${value.confirmed}, unverified ${value.unverified}, not found ${value.notFound}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
