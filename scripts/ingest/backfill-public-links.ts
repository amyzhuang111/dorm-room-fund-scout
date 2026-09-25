// Backfill LinkedIn and website links that are already on a source page.
// Never builds a LinkedIn URL from a person's name.
//
// 1. YC company pages already stored a product website in the claim JSON
//    while projects.website_url stayed the YC page. Copy that recorded URL.
// 2. A person's own claim excerpt that already contains linkedin.com/in/.
// 3. GitHub user API for people with a github:login alias (bio and blog).
// 4. The public E@B companies and founders pages.
// 5. A company website, /team, and /about — a LinkedIn link is stored only
//    when that founder's full name appears in the same block of text.
//
// Apify is not called. scripts/ingest/fetch-linkedin-apify.ts stays gated
// on APIFY_API_TOKEN.
//
// Run: npx tsx scripts/ingest/backfill-public-links.ts

import * as cheerio from "cheerio";
import { getDb, newId, nowIso } from "../../lib/db/client";

const SOURCE_ID = "src_public_link_backfill";
const DELAY_MS = 800;
const MAX_SITE_FETCHES = 80;

const LINKEDIN_RE = /https?:\/\/(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9_%-]+/i;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function cleanLinkedin(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(LINKEDIN_RE);
  if (!m) return null;
  return m[0].replace(/\/$/, "");
}

function aliasesOf(json: string): string[] {
  try {
    const parsed = JSON.parse(json || "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((a): a is string => typeof a === "string") : [];
  } catch {
    return [];
  }
}

function hasLinkedin(aliases: string[]): boolean {
  return aliases.some((a) => a.startsWith("linkedin:") && a.includes("linkedin.com/in/"));
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "campus-universe-research-bot/0.1 (manual, bounded)", accept: "text/html,application/json" },
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });
    if (res.status === 429) {
      console.log(`  429 from ${url} — stopping this kind of fetch.`);
      return "RATE_LIMIT";
    }
    if (!res.ok) return null;
    const type = res.headers.get("content-type") || "";
    if (type.includes("pdf") || type.includes("image") || type.includes("zip")) return null;
    return await res.text();
  } catch (e) {
    console.log(`  skip ${url}: ${(e as Error).message}`);
    return null;
  }
}

async function main() {
  const db = getDb();
  db.pragma("busy_timeout = 8000");
  const retrievedAt = nowIso();

  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at)
     VALUES (?, 'Public pages (LinkedIn and website backfill)', 'code_host', 'https://github.com/', '[]', 2, 'html_scrape', 'available', ?)
     ON CONFLICT(id) DO UPDATE SET last_attempt_at=excluded.last_attempt_at, status='available'`
  ).run(SOURCE_ID, retrievedAt);

  const updateAliases = db.prepare(`UPDATE people SET aliases_json = ? WHERE id = ?`);
  const updateWebsite = db.prepare(`UPDATE projects SET website_url = ?, updated_at = ? WHERE id = ?`);
  const insertClaim = db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, source_url, retrieved_at, label, verification_state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'observed_fact', 'unverified')`
  );

  function rememberLinkedin(personId: string, aliases: string[], url: string, excerpt: string, sourceUrl: string) {
    const li = cleanLinkedin(url);
    if (!li || hasLinkedin(aliases)) return false;
    const next = [...aliases, `linkedin:${li}`];
    updateAliases.run(JSON.stringify(next), personId);
    aliases.splice(0, aliases.length, ...next);
    insertClaim.run(
      newId("claim"),
      "person",
      personId,
      "linkedin_alias_discovered",
      JSON.stringify({ linkedin: li }),
      excerpt,
      SOURCE_ID,
      sourceUrl,
      retrievedAt
    );
    return true;
  }

  let ycSites = 0;
  const ycRows = db
    .prepare(
      `SELECT p.id, p.website_url, c.source_url, json_extract(c.value_json, '$.website') AS site
       FROM projects p
       JOIN claims c ON c.entity_id = p.id AND c.source_id = 'src_yc_directory' AND c.claim_type = 'accelerator_membership'
       WHERE p.website_url LIKE '%ycombinator.com/companies/%'`
    )
    .all() as { id: string; website_url: string; source_url: string; site: string | null }[];
  const seenYc = new Set<string>();
  for (const row of ycRows) {
    if (seenYc.has(row.id)) continue;
    const site = (row.site || "").trim();
    if (!/^https?:\/\//i.test(site) || site.includes("ycombinator.com")) continue;
    seenYc.add(row.id);
    updateWebsite.run(site, retrievedAt, row.id);
    insertClaim.run(
      newId("claim"),
      "project",
      row.id,
      "website",
      JSON.stringify({ website: site, ycPage: row.source_url }),
      `Y Combinator company page ${row.source_url} records the company website as ${site}.`,
      SOURCE_ID,
      row.source_url,
      retrievedAt
    );
    ycSites++;
  }
  console.log(`YC: wrote ${ycSites} product website(s) that were already on the company page JSON.`);

  let fromClaims = 0;
  const claimPeople = db
    .prepare(
      `SELECT pe.id, pe.aliases_json, c.excerpt, c.source_url
       FROM people pe
       JOIN claims c ON c.entity_type = 'person' AND c.entity_id = pe.id
       WHERE pe.aliases_json NOT LIKE '%linkedin.com/in/%' AND c.excerpt LIKE '%linkedin.com/in/%'`
    )
    .all() as { id: string; aliases_json: string; excerpt: string; source_url: string }[];
  for (const row of claimPeople) {
    const aliases = aliasesOf(row.aliases_json);
    const li = cleanLinkedin(row.excerpt);
    if (!li) continue;
    if (
      rememberLinkedin(
        row.id,
        aliases,
        li,
        `A stored claim from ${row.source_url} includes this LinkedIn URL: ${li}.`,
        row.source_url
      )
    ) {
      fromClaims++;
    }
  }
  console.log(`Stored claims: ${fromClaims} LinkedIn URL(s) copied from excerpts that already quoted them.`);

  let githubLinkedin = 0;
  let githubSites = 0;
  const githubPeople = db
    .prepare(`SELECT id, name, aliases_json FROM people WHERE aliases_json LIKE '%github:%'`)
    .all() as { id: string; name: string; aliases_json: string }[];
  for (const person of githubPeople) {
    const aliases = aliasesOf(person.aliases_json);
    const login = aliases.find((a) => a.startsWith("github:"))?.slice("github:".length);
    if (!login || login.includes("/") || login.includes(" ")) continue;
    const sourceUrl = `https://github.com/${login}`;
    const body = await fetchText(`https://api.github.com/users/${encodeURIComponent(login)}`);
    if (body === "RATE_LIMIT") break;
    await sleep(DELAY_MS);
    if (!body || body === "RATE_LIMIT") continue;
    let profile: { bio?: string | null; blog?: string | null };
    try {
      profile = JSON.parse(body) as { bio?: string | null; blog?: string | null };
    } catch {
      continue;
    }
    const li = cleanLinkedin(`${profile.bio || ""} ${profile.blog || ""}`);
    if (
      li &&
      rememberLinkedin(
        person.id,
        aliases,
        li,
        `${person.name}'s GitHub profile (${sourceUrl}) contains ${li} in the bio or blog field.`,
        sourceUrl
      )
    ) {
      githubLinkedin++;
    }
    const blog = (profile.blog || "").trim();
    if (/^https?:\/\//i.test(blog) && !blog.includes("linkedin.com") && !blog.includes("github.com") && !aliases.some((a) => a.startsWith("site:"))) {
      const fresh = db.prepare(`SELECT aliases_json FROM people WHERE id = ?`).get(person.id) as { aliases_json: string };
      const next = [...aliasesOf(fresh.aliases_json), `site:${blog}`];
      updateAliases.run(JSON.stringify(next), person.id);
      insertClaim.run(
        newId("claim"),
        "person",
        person.id,
        "personal_website",
        JSON.stringify({ website: blog }),
        `${person.name}'s GitHub profile (${sourceUrl}) lists blog ${blog}.`,
        SOURCE_ID,
        sourceUrl,
        retrievedAt
      );
      githubSites++;
    }
  }
  console.log(`GitHub: ${githubLinkedin} LinkedIn URL(s), ${githubSites} personal site(s) from the public user API.`);

  let ebLinkedin = 0;
  const ebFounders = db
    .prepare(
      `SELECT pe.id, pe.name, pe.aliases_json FROM people pe
       JOIN affiliations a ON a.person_id = pe.id
       WHERE a.role LIKE 'E@B founder%'`
    )
    .all() as { id: string; name: string; aliases_json: string }[];
  const ebHtml = await fetchText("https://www.entrepreneursatberkeley.com/founders");
  if (ebHtml && ebHtml !== "RATE_LIMIT") {
    const $ = cheerio.load(ebHtml);
    for (const person of ebFounders) {
      const aliases = aliasesOf(person.aliases_json);
      if (hasLinkedin(aliases)) continue;
      let matched: string | null = null;
      $("a[href*='linkedin.com/in/']").each((_, el) => {
        if (matched) return;
        const href = $(el).attr("href") || "";
        const block = $(el).closest("div, li, article, section").text().replace(/\s+/g, " ");
        if (block.toLowerCase().includes(person.name.toLowerCase())) matched = cleanLinkedin(href);
      });
      if (
        matched &&
        rememberLinkedin(
          person.id,
          aliases,
          matched,
          `${person.name}'s name appears next to ${matched} on the Entrepreneurs @ Berkeley founders page.`,
          "https://www.entrepreneursatberkeley.com/founders"
        )
      ) {
        ebLinkedin++;
      }
    }
  }
  console.log(`E@B founders page: ${ebLinkedin} LinkedIn URL(s) next to a founder's name.`);

  const companies = db
    .prepare(
      `SELECT DISTINCT pr.id, pr.name, pr.website_url
       FROM projects pr
       JOIN person_project_roles ppr ON ppr.project_id = pr.id AND ppr.role LIKE '%founder%'
       JOIN people pe ON pe.id = ppr.person_id
       WHERE pr.kind = 'company' AND pr.website_url LIKE 'http%'
         AND pr.website_url NOT LIKE '%ycombinator.com%'
         AND pr.website_url NOT LIKE '%devpost.com%'
         AND pe.aliases_json NOT LIKE '%linkedin.com/in/%'`
    )
    .all() as { id: string; name: string; website_url: string }[];

  let siteFetches = 0;
  let siteLinkedin = 0;
  let rateLimited = false;
  for (const company of companies) {
    if (rateLimited || siteFetches >= MAX_SITE_FETCHES) break;
    const founders = db
      .prepare(
        `SELECT pe.id, pe.name, pe.aliases_json FROM person_project_roles ppr
         JOIN people pe ON pe.id = ppr.person_id
         WHERE ppr.project_id = ? AND ppr.role LIKE '%founder%' AND pe.aliases_json NOT LIKE '%linkedin.com/in/%'`
      )
      .all(company.id) as { id: string; name: string; aliases_json: string }[];
    if (founders.length === 0) continue;
    const base = company.website_url.replace(/\/$/, "");
    const paths = [company.website_url, `${base}/team`, `${base}/about`];
    for (const url of paths) {
      if (rateLimited || siteFetches >= MAX_SITE_FETCHES) break;
      if (founders.every((f) => hasLinkedin(aliasesOf(f.aliases_json)))) break;
      siteFetches++;
      const html = await fetchText(url);
      await sleep(DELAY_MS);
      if (html === "RATE_LIMIT") {
        rateLimited = true;
        break;
      }
      if (!html) continue;
      const $ = cheerio.load(html);
      $("a[href*='linkedin.com/in/']").each((_, el) => {
        const href = cleanLinkedin($(el).attr("href") || "");
        if (!href) return;
        const block = $(el).closest("div, li, article, section, p").text().replace(/\s+/g, " ").slice(0, 500).toLowerCase();
        const hits = founders.filter((f) => !hasLinkedin(aliasesOf(f.aliases_json)) && block.includes(f.name.toLowerCase()));
        if (hits.length !== 1) return;
        const person = hits[0];
        const aliases = aliasesOf(person.aliases_json);
        if (
          rememberLinkedin(
            person.id,
            aliases,
            href,
            `${person.name}'s name appears next to ${href} on ${url}.`,
            url
          )
        ) {
          siteLinkedin++;
          person.aliases_json = JSON.stringify(aliases);
        }
      });
    }
  }
  console.log(
    `Company sites: ${siteFetches} page fetch(es), ${siteLinkedin} LinkedIn URL(s) tied to a named founder. Cap ${MAX_SITE_FETCHES}. Rate limited: ${rateLimited}. Companies considered: ${companies.length}.`
  );

  db.prepare(`UPDATE sources SET last_success_at=?, error=NULL WHERE id=?`).run(nowIso(), SOURCE_ID);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
