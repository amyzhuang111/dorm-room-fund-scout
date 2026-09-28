// Fill confirmed LinkedIn profile URLs for founders the site displays.
//
//   npx tsx scripts/ingest/fix-founder-linkedin.ts --scan
//   npx tsx scripts/ingest/fix-founder-linkedin.ts --apply
//   npx tsx scripts/ingest/fix-founder-linkedin.ts --report /opt/cursor/artifacts/founders-missing-linkedin.csv
//
// --scan reads company websites and stored source pages for people who are
// missing a linkedin.com/in alias. A URL is kept only when that page's text
// next to the link contains the person's first and last name, and the same
// snippet does not also name a different missing founder. Results are written
// to data/exports/founder-linkedin-scan-2026-09-28.json. Nothing is guessed
// from a name.
//
// --apply is idempotent. It stores the hand-checked Sixtytwo profiles below
// plus every data/exports/founder-linkedin-fix-2026-09-28*.json and the scan
// file. Confirmed rows become a linkedin:https://www.linkedin.com/in/<slug>
// alias and a corroborated linkedin_alias_discovered claim. A slug already
// stored on someone else is refused. People who already have a profile URL
// are left alone. Enrollment columns are not rewritten.
//
// --report lists promoted founders who still have no confirmed profile.

import fs from "node:fs";
import path from "node:path";
import { getDb, newId, nowIso } from "../../lib/db/client";
import { listFounders } from "../../lib/domain/queries";

const SOURCE_ID = "src_linkedin_search_web";
const SCAN_PATH = path.join("data", "exports", "founder-linkedin-scan-2026-09-28.json");
const FIX_GLOB_DIR = path.join("data", "exports");
const UA = "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0";

interface Judgment {
  person_id: string;
  full_name: string;
  status: "confirmed" | "not_found";
  linkedin_url?: string | null;
  profile_title?: string | null;
  evidence?: string | null;
  evidence_url?: string | null;
  query?: string | null;
  match_basis?: "school" | "company" | "role" | "own_page" | null;
  reason?: string | null;
}

// Hand-checked against public LinkedIn snippets on 2026-09-28.
// Sixtytwo (sixtytwo.ai) is the company behind a search for "62".
// Jessie Dong's profile is titled Jessie Dong, lists Stanford CS, and
// reposted Notable Capital's NextGen post naming her and Sonnet Xu as
// co-founders of Sixtytwo. Sonnet Xu's profile is titled Sonnet Xu, lists
// Stanford CS & AI and GPU work, and reposted the same post.
// School-only hits for common names. The profile names the school and not the
// company, so it is not enough to tell this person from someone else.
const REJECT_SLUGS: { person_id: string; slug: string }[] = [
  { person_id: "person_GuVmpF6M09X-", slug: "justin-a-zhang" },
  { person_id: "person_3ICxLgTrLkZg", slug: "kaylee-kim-bb3052330" },
  { person_id: "person_68CdqkY83Jzy", slug: "natalie-lopez-47248b250" },
  { person_id: "person_Ur_0ScZzTXHK", slug: "taehyung-kim-987183247" },
  { person_id: "person_ygX5C_nqubD-", slug: "elliot-jang-857253205" },
  { person_id: "person_niMsli6PWaXe", slug: "karan-shah-919347a3" },
  { person_id: "person_U7cVlJRddkux", slug: "sam-kovar" },
  { person_id: "person_OnFgkB9RiEnN", slug: "robert-pak" },
  { person_id: "person_2mwfDFfREZhV", slug: "jerry-zho" },
  { person_id: "person_9mBILvjtONUf", slug: "chauhanyash000" },
  { person_id: "person_sJhu1o0YMaGe", slug: "andrea-olsen-0987654321" },
  { person_id: "person_K_AN4WGuq51Z", slug: "yameng-zhang-5145479a" },
  { person_id: "person_UqRjIg4aPl5u", slug: "noahwilson3" },
  { person_id: "person_gxSe9_QjYprV", slug: "andrew-chiu-87a558242" },
  { person_id: "person_xVg7UDTmJo1q", slug: "matthew-s-lew" },
  { person_id: "person_YpqaWvc96u4P", slug: "ciciwang7" },
  { person_id: "person_WZQbAk2r-R4q", slug: "tonyadamwu" },
  { person_id: "person_3QmPEuZRMULA", slug: "jiayi-sadie-zhao" },
  { person_id: "person_xr1nnzFoYrIF", slug: "travis-kimm" },
  { person_id: "person_nnWhPk_1xpUU", slug: "chloeahughes" },
  { person_id: "person_ZBYtqAhKp1GN", slug: "elisa-benham-981664166" },
  { person_id: "person_j4E_R7VtCZ73", slug: "mattjkahn" },
];

const HAND: Judgment[] = [
  {
    person_id: "person_gGo7iBSclGYt",
    full_name: "Jessie Dong",
    status: "confirmed",
    linkedin_url: "https://www.linkedin.com/in/-jessie-dong-",
    profile_title: "Jessie Dong",
    evidence:
      "Profile title Jessie Dong, Bachelor of Science in Computer Science at Stanford. The profile reposted Notable Capital's NextGen Pitch Day post naming Jessie Dong and Sonnet Xu as co-founders of Sixtytwo (sixtytwo.ai).",
    evidence_url: "https://www.linkedin.com/posts/notablecapital_congratulations-to-the-grand-prize-winners-activity-7483262855593488384-IDiJ",
    query: "Jessie Dong Sixtytwo Stanford linkedin",
    match_basis: "company",
  },
  {
    person_id: "person_xfR0ckUZgO9X",
    full_name: "Sonnet Xu",
    status: "confirmed",
    linkedin_url: "https://www.linkedin.com/in/sonnetxu",
    profile_title: "Sonnet Xu",
    evidence:
      "Profile title Sonnet Xu, Stanford CS and AI, with recent GPU work. The profile reposted Notable Capital's NextGen Pitch Day post naming Sonnet Xu and Jessie Dong as co-founders of Sixtytwo (sixtytwo.ai).",
    evidence_url: "https://www.linkedin.com/posts/notablecapital_congratulations-to-the-grand-prize-winners-activity-7483262855593488384-IDiJ",
    query: "Sonnet Xu Sixtytwo Stanford linkedin",
    match_basis: "company",
  },
];

function fold(value: string): string {
  return value
    .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function nameParts(name: string): { first: string; last: string } | null {
  const cleaned = name
    .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/(?:^|\s)'?\d{2}\b/g, " ")
    .replace(/[^A-Za-z'\- ]+/g, " ");
  const tokens = fold(cleaned)
    .split(/[^a-z]+/)
    .filter((token) => token.length >= 2 && !["jr", "sr", "ii", "iii", "iv"].includes(token));
  if (tokens.length < 2) return null;
  return { first: tokens[0], last: tokens[tokens.length - 1] };
}

function hasWord(text: string, word: string): boolean {
  if (word.length < 2) return false;
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`).test(fold(text));
}

function textHasName(text: string, name: string): boolean {
  const parts = nameParts(name);
  if (!parts) return false;
  return hasWord(text, parts.first) && hasWord(text, parts.last);
}

export function canonicalLinkedIn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = raw.match(/https?:\/\/(?:[\w.-]+\.)?linkedin\.com\/in\/([^/?#\s"'<>]+)/i);
  if (!match) return null;
  let slug = match[1].replace(/\/+$/, "");
  try {
    slug = decodeURIComponent(slug);
  } catch {
    // keep the raw slug
  }
  slug = slug.replace(/\/+$/, "");
  if (slug.length < 2 || slug.length > 100) return null;
  if (!/^[\p{L}\p{N}\-_%]+$/u.test(slug)) return null;
  return `https://www.linkedin.com/in/${slug}`;
}

function slugOf(url: string): string {
  return url.split("/in/")[1]?.toLowerCase() ?? "";
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function skipHost(hostname: string): boolean {
  return (
    !hostname ||
    hostname === "linkedin.com" ||
    hostname.endsWith(".linkedin.com") ||
    hostname.endsWith("facebook.com") ||
    hostname.endsWith("instagram.com") ||
    hostname.endsWith("twitter.com") ||
    hostname === "x.com" ||
    hostname.endsWith("google.com") ||
    hostname.endsWith("duckduckgo.com") ||
    hostname.endsWith("youtube.com") ||
    hostname.endsWith("tiktok.com")
  );
}

interface Target {
  id: string;
  name: string;
  campus: string;
  companies: string[];
  pages: string[];
}

function loadTargets(): Target[] {
  const db = getDb();
  const founders = listFounders();
  const missing = founders.filter((founder) => !founder.linkedinUrl);
  const pagesByPerson = new Map<string, Set<string>>();
  const ids = missing.map((founder) => founder.id);
  const chunk = 400;
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    const marks = slice.map(() => "?").join(",");
    const sources = db
      .prepare(
        `SELECT entity_id, source_url FROM claims
         WHERE entity_type = 'person' AND entity_id IN (${marks}) AND source_url LIKE 'http%'`
      )
      .all(...slice) as { entity_id: string; source_url: string }[];
    for (const row of sources) {
      if (skipHost(hostOf(row.source_url))) continue;
      const set = pagesByPerson.get(row.entity_id) ?? new Set<string>();
      set.add(row.source_url.split("#")[0]);
      pagesByPerson.set(row.entity_id, set);
    }
    const sites = db
      .prepare(
        `SELECT ppr.person_id as person_id, p.website_url as website_url
         FROM person_project_roles ppr
         JOIN projects p ON p.id = ppr.project_id
         WHERE ppr.person_id IN (${marks}) AND p.kind = 'company' AND p.website_url LIKE 'http%'`
      )
      .all(...slice) as { person_id: string; website_url: string }[];
    for (const row of sites) {
      if (skipHost(hostOf(row.website_url))) continue;
      const set = pagesByPerson.get(row.person_id) ?? new Set<string>();
      set.add(row.website_url.split("#")[0]);
      pagesByPerson.set(row.person_id, set);
    }
  }
  return missing.map((founder) => ({
    id: founder.id,
    name: founder.name,
    campus: founder.universityName || "Unknown",
    companies: founder.projects.filter((project) => project.kind === "company").map((project) => project.name),
    pages: [...(pagesByPerson.get(founder.id) ?? [])].slice(0, 6),
  }));
}

function contexts(html: string): { url: string; text: string }[] {
  const out: { url: string; text: string }[] = [];
  const re = /(?:https?:\/\/)?(?:[\w.-]+\.)?linkedin\.com\/in\/[A-Za-z0-9\-_%]+/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const raw = match[0].startsWith("http") ? match[0] : `https://${match[0]}`;
    const url = canonicalLinkedIn(raw);
    if (!url) continue;
    const start = Math.max(0, match.index - 220);
    const end = Math.min(html.length, match.index + match[0].length + 80);
    out.push({ url, text: stripTags(html.slice(start, end)).slice(0, 400) });
  }
  return out;
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": UA, Accept: "text/html" },
    });
    if (!response.ok) return "";
    if (skipHost(hostOf(response.url || url))) return "";
    const buf = await response.arrayBuffer();
    const slice = buf.byteLength > 500_000 ? buf.slice(0, 500_000) : buf;
    return new TextDecoder("utf-8", { fatal: false }).decode(slice);
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

async function scan(): Promise<void> {
  const targets = loadTargets();
  const byPage = new Map<string, Target[]>();
  for (const target of targets) {
    for (const page of target.pages) {
      const list = byPage.get(page) ?? [];
      list.push(target);
      byPage.set(page, list);
    }
  }
  console.log(`Scanning ${byPage.size} pages for ${targets.length} founders missing a profile.`);
  const found = new Map<string, Judgment>();
  const conflicts = new Set<string>();
  const pages = [...byPage.keys()];
  let cursor = 0;
  async function worker() {
    while (cursor < pages.length) {
      const page = pages[cursor++];
      const html = await fetchHtml(page);
      if (!html) continue;
      const hits = contexts(html);
      if (hits.length === 0) continue;
      const people = byPage.get(page) ?? [];
      for (const person of people) {
        const matches = hits.filter((hit) => textHasName(hit.text, person.name));
        const urls = [...new Set(matches.map((hit) => hit.url))];
        if (urls.length !== 1) continue;
        const url = urls[0];
        const shared = matches.some((hit) =>
          people.some((other) => other.id !== person.id && textHasName(hit.text, other.name))
        );
        if (shared) continue;
        const evidence = matches[0].text;
        const row: Judgment = {
          person_id: person.id,
          full_name: person.name,
          status: "confirmed",
          linkedin_url: url,
          profile_title: person.name,
          evidence: `Page ${page} names ${person.name} next to ${url}. Snippet: ${evidence}`,
          evidence_url: page,
          query: `${person.name} ${person.companies[0] ?? person.campus} linkedin`,
          match_basis: "own_page",
        };
        const prev = found.get(person.id);
        if (prev && canonicalLinkedIn(prev.linkedin_url) !== url) {
          conflicts.add(person.id);
          found.delete(person.id);
          continue;
        }
        if (!conflicts.has(person.id)) found.set(person.id, row);
      }
    }
  }
  await Promise.all(Array.from({ length: 8 }, () => worker()));
  const rows = [...found.values()].sort((a, b) => a.full_name.localeCompare(b.full_name));
  fs.mkdirSync(path.dirname(SCAN_PATH), { recursive: true });
  fs.writeFileSync(SCAN_PATH, JSON.stringify(rows, null, 2));
  console.log(`Scan kept ${rows.length} own-page profiles. Wrote ${SCAN_PATH}.`);
}

function judgmentFiles(): string[] {
  if (!fs.existsSync(FIX_GLOB_DIR)) return [];
  return fs
    .readdirSync(FIX_GLOB_DIR)
    .filter((name) => name.startsWith("founder-linkedin-fix-2026-09-28") && name.endsWith(".json"))
    .map((name) => path.join(FIX_GLOB_DIR, name));
}

function readJudgments(files: string[]): Judgment[] {
  const rows: Judgment[] = [...HAND];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    if (!Array.isArray(parsed)) throw new Error(`${file} must be a JSON array`);
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const item = row as Judgment;
      if (!item.person_id || !item.full_name || !item.status) continue;
      rows.push(item);
    }
  }
  return rows;
}

function compact(value: string): string {
  return fold(value).replace(/[^a-z0-9]+/g, "");
}

function companyMentioned(companyName: string, evidence: string): boolean {
  const ev = fold(evidence);
  const spaced = fold(companyName).replace(/[^a-z0-9]+/g, " ").trim();
  if (spaced.length >= 4 && (hasWord(evidence, spaced) || ev.includes(spaced))) return true;
  const packed = compact(companyName);
  // Packed match covers "DHI-Tech" vs "DHI Tech" and "forEVA Health" vs "forEVAhealth".
  return packed.length >= 6 && compact(evidence).includes(packed);
}

function schoolMentioned(schoolName: string, evidence: string): boolean {
  const name = fold(schoolName).replace(/\s+/g, " ").trim();
  // The full school name must appear. A state or city token alone is not enough.
  return name.length >= 8 && fold(evidence).includes(name);
}

function evidenceSupports(db: ReturnType<typeof getDb>, personId: string, basis: string, evidence: string): boolean {
  if (basis === "own_page") return fold(evidence).includes("linkedin.com/in/");
  if (basis === "company") {
    const companies = db
      .prepare(
        `SELECT p.name as name FROM person_project_roles ppr
         JOIN projects p ON p.id = ppr.project_id
         WHERE ppr.person_id = ? AND p.kind = 'company'`
      )
      .all(personId) as { name: string }[];
    return companies.some((company) => companyMentioned(company.name, evidence));
  }
  if (basis === "school" || basis === "role") {
    const schools = db
      .prepare(
        `SELECT u.name as name FROM affiliations a
         JOIN universities u ON u.id = a.university_id
         WHERE a.person_id = ?`
      )
      .all(personId) as { name: string }[];
    return schools.some((school) => schoolMentioned(school.name, evidence));
  }
  return false;
}

function titleHasName(title: string, fullName: string): boolean {
  const parts = nameParts(fullName);
  if (!parts) return false;
  const titleTokens = fold(title)
    .split(/[^a-z]+/)
    .filter((token) => token.length >= 2);
  if (!titleTokens.includes(parts.last)) return false;
  return titleTokens[0] === parts.first;
}

function apply(): void {
  const extra = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const files = [...new Set([SCAN_PATH, ...judgmentFiles().sort(), ...extra])];
  const rows = readJudgments(files);
  const db = getDb();
  const taken = new Map<string, string>();
  for (const person of db.prepare(`SELECT id, aliases_json FROM people`).all() as { id: string; aliases_json: string }[]) {
    const url = canonicalLinkedIn(person.aliases_json);
    if (url) taken.set(slugOf(url), person.id);
  }
  const now = nowIso();
  const readPerson = db.prepare(
    `SELECT id, name, aliases_json FROM people WHERE id = ?`
  );
  const writeAliases = db.prepare(`UPDATE people SET aliases_json = ? WHERE id = ?`);
  const insertClaim = db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, source_url, retrieved_at, label, verification_state)
     VALUES (?, 'person', ?, ?, ?, ?, ?, ?, ?, 'observed_fact', ?)`
  );
  const hasAliasClaim = db.prepare(
    `SELECT 1 as ok FROM claims WHERE entity_id = ? AND claim_type = 'linkedin_alias_discovered' AND value_json LIKE ? LIMIT 1`
  );
  const hasAttempt = db.prepare(
    `SELECT 1 as ok FROM claims WHERE entity_id = ? AND claim_type = 'linkedin_web_search_attempt' AND excerpt = ? LIMIT 1`
  );

  let confirmed = 0;
  let notFound = 0;
  let skipped = 0;
  const tx = db.transaction(() => {
    for (const reject of REJECT_SLUGS) {
      const person = readPerson.get(reject.person_id) as { id: string; name: string; aliases_json: string } | undefined;
      if (!person) continue;
      const aliases = JSON.parse(person.aliases_json || "[]") as unknown[];
      const list = aliases.filter((alias): alias is string => typeof alias === "string");
      const next = list.filter((alias) => slugOf(canonicalLinkedIn(alias) || "") !== reject.slug);
      if (next.length !== list.length) {
        writeAliases.run(JSON.stringify(next), person.id);
        db.prepare(
          `DELETE FROM claims WHERE entity_id = ? AND claim_type = 'linkedin_alias_discovered' AND value_json LIKE ?`
        ).run(person.id, `%${reject.slug}%`);
        taken.delete(reject.slug);
        console.log(`reverted ${person.name} ${reject.slug}`);
      }
    }
    for (const row of rows) {
      const person = readPerson.get(row.person_id) as { id: string; name: string; aliases_json: string } | undefined;
      if (!person) {
        console.log(`skip missing person ${row.person_id} ${row.full_name}`);
        skipped++;
        continue;
      }
      if (fold(person.name) !== fold(row.full_name) && !textHasName(person.name, row.full_name) && !textHasName(row.full_name, person.name)) {
        console.log(`skip ${person.name}: judgment name ${row.full_name} does not match`);
        skipped++;
        continue;
      }
      if (row.status === "not_found") {
        const excerpt = `Public-web LinkedIn search for ${person.name}: ${row.query || row.reason || "no confident profile"}. No profile stored.`;
        if (!hasAttempt.get(person.id, excerpt)) {
          insertClaim.run(
            newId("claim"),
            person.id,
            "linkedin_web_search_attempt",
            JSON.stringify({ query: row.query ?? "", reason: row.reason ?? "", hits: 0, confirmed: 0 }),
            excerpt,
            SOURCE_ID,
            "https://html.duckduckgo.com/html/",
            now,
            "corroborated"
          );
          notFound++;
        } else skipped++;
        continue;
      }
      const url = canonicalLinkedIn(row.linkedin_url);
      if (url && REJECT_SLUGS.some((reject) => reject.person_id === person.id && reject.slug === slugOf(url))) {
        console.log(`skip ${person.name}: ${url} is only a same-school name match`);
        skipped++;
        continue;
      }
      const basis = row.match_basis;
      const title = (row.profile_title ?? "").trim();
      const evidence = (row.evidence ?? "").trim();
      if (!url || !basis || !["school", "company", "role", "own_page"].includes(basis) || evidence.length < 12 || !titleHasName(title, person.name)) {
        console.log(`skip ${person.name}: incomplete confirmed judgment`);
        skipped++;
        continue;
      }
      if (!evidenceSupports(db, person.id, basis, evidence)) {
        console.log(`skip ${person.name}: evidence does not mention their ${basis}`);
        skipped++;
        continue;
      }
      if (person.aliases_json.includes("linkedin.com/in/")) {
        skipped++;
        continue;
      }
      const owner = taken.get(slugOf(url));
      if (owner && owner !== person.id) {
        console.log(`skip ${person.name}: ${url} is already stored on ${owner}`);
        skipped++;
        continue;
      }
      const aliases = JSON.parse(person.aliases_json || "[]") as unknown[];
      const list = aliases.filter((alias): alias is string => typeof alias === "string");
      if (!list.some((alias) => alias.includes("linkedin.com/in/"))) list.push(`linkedin:${url}`);
      const sourceUrl = (row.evidence_url || url).trim();
      if (!hasAliasClaim.get(person.id, `%${slugOf(url)}%`)) {
        writeAliases.run(JSON.stringify(list), person.id);
        insertClaim.run(
          newId("claim"),
          person.id,
          "linkedin_alias_discovered",
          JSON.stringify({ linkedin: url, why: evidence, query: row.query ?? "", match_basis: basis, profile_title: title }),
          `${person.name}: confirmed LinkedIn ${url} because ${basis} matches the record. Evidence: ${evidence.slice(0, 500)}`,
          SOURCE_ID,
          sourceUrl.startsWith("http") ? sourceUrl : url,
          now,
          "corroborated"
        );
        taken.set(slugOf(url), person.id);
        confirmed++;
        console.log(`confirmed ${person.name} ${url}`);
      } else skipped++;
    }
  });
  tx();
  db.pragma("wal_checkpoint(TRUNCATE)");
  console.log(`Applied. Confirmed ${confirmed}. Not found recorded ${notFound}. Skipped ${skipped}.`);
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function report(): void {
  const outPath = process.argv.slice(2).find((arg) => !arg.startsWith("--")) || "/opt/cursor/artifacts/founders-missing-linkedin.csv";
  const founders = listFounders();
  const total = founders.length;
  const withUrl = founders.filter((founder) => founder.linkedinUrl).length;
  const lines = ["name,company,campus,reason"];
  const byCampus = new Map<string, number>();
  for (const founder of founders) {
    if (founder.linkedinUrl) continue;
    const campus = founder.universityName || "Unknown";
    byCampus.set(campus, (byCampus.get(campus) ?? 0) + 1);
    const companies = founder.projects.filter((project) => project.kind === "company").map((project) => project.name);
    let reason = "No public page in the database named this person next to a linkedin.com/in URL, and web search did not confirm a profile with this name plus their company or school.";
    if (founder.link?.kind === "likely") {
      reason = "A likely LinkedIn candidate is stored and shown as likely. It was not promoted to a saved profile because the match was not confirmed against both the name and the company or school.";
    } else if (founder.link?.kind === "unverified") {
      reason = "An unverified name-only LinkedIn candidate is stored. It was not saved as this person's profile.";
    }
    lines.push([founder.name, companies.join("; ") || "(no company)", campus, reason].map(csvEscape).join(","));
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join("\n") + "\n");
  console.log(`Displayed founders ${total}. With confirmed LinkedIn ${withUrl}. Still missing ${lines.length - 1}. Wrote ${outPath}.`);
  const campuses = [...byCampus.entries()].sort((a, b) => b[1] - a[1]);
  for (const [campus, count] of campuses) console.log(`${count}\t${campus}`);
}

async function main() {
  if (process.argv.includes("--scan")) await scan();
  else if (process.argv.includes("--apply")) apply();
  else if (process.argv.includes("--report")) report();
  else {
    console.error("Usage: npx tsx scripts/ingest/fix-founder-linkedin.ts --scan|--apply|--report [csv-path]");
    process.exit(1);
  }
}

main();
