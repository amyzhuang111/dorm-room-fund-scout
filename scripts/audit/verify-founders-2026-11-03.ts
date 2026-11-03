/**
 * Verify unverified founders/projects against public evidence.
 * Marks verified only when evidence confirms: (1) person is a founder of the company,
 * AND (2) school affiliation with class year 2023-or-later (or current student).
 * Pre-2023 / wrong affiliation → exclusion list (no silent delete).
 *
 *   npx tsx scripts/audit/verify-founders-2026-11-03.ts
 *   LIMIT=50 npx tsx scripts/audit/verify-founders-2026-11-03.ts
 */
import * as cheerio from "cheerio";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { getDb, newId, nowIso } from "../../lib/db/client";
import { loadFounderTable, loadProjectRows } from "../../lib/domain/founder-table";

const CONCURRENCY = Number(process.env.CONCURRENCY || 5);
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : Infinity;
const CACHE = path.join("/tmp/backfill-2026-11-03/founder-html");
const REPORT = path.join("/tmp/backfill-2026-11-03/founder-verify-report.json");
const SOURCE_ID = "src_founder_verify_2026_11_03";
const UA =
  "Mozilla/5.0 (compatible; CampusScoutVerify/1.0; +https://github.com/amyzhuang111/dorm-room-fund-scout)";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
function cachePath(url: string) {
  return path.join(CACHE, `${createHash("sha1").update(url).digest("hex")}.html`);
}
async function fetchHtml(url: string): Promise<string | null> {
  fs.mkdirSync(CACHE, { recursive: true });
  const cached = cachePath(url);
  if (fs.existsSync(cached)) {
    const age = Date.now() - fs.statSync(cached).mtimeMs;
    if (age < 6 * 3600_000) return fs.readFileSync(cached, "utf8");
  }
  try {
    await sleep(150 + Math.random() * 200);
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html" },
      signal: AbortSignal.timeout(14000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length > 40) fs.writeFileSync(cached, text);
    return text;
  } catch {
    return null;
  }
}
async function mapPool<T>(items: T[], n: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  async function worker() {
    for (;;) {
      const idx = i++;
      if (idx >= items.length) return;
      await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, () => worker()));
}
function pageText(html: string) {
  const $ = cheerio.load(html);
  $("script,style,noscript,svg").remove();
  return $("body").text().replace(/\s+/g, " ").trim();
}
function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function nameIn(text: string, name: string) {
  const n = norm(name);
  if (!n || n.length < 3) return false;
  const t = norm(text);
  if (t.includes(n)) return true;
  const parts = n.split(" ").filter((p) => p.length > 1);
  if (parts.length >= 2) {
    const first = parts[0];
    const last = parts[parts.length - 1];
    return t.includes(first) && t.includes(last);
  }
  return false;
}

interface Exclusion {
  personId: string;
  name: string;
  company: string | null;
  campus: string | null;
  year: number | null;
  reason: string;
  evidenceUrl: string | null;
}

async function main() {
  fs.mkdirSync(CACHE, { recursive: true });
  const db = getDb();
  const retrievedAt = nowIso();
  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at, last_success_at)
     VALUES (?, 'Founder verification 2026-11-03', 'reference', 'https://www.ycombinator.com/companies', '[]', 3, 'html_scrape', 'available', ?, ?)
     ON CONFLICT(id) DO UPDATE SET last_success_at=excluded.last_success_at, last_attempt_at=excluded.last_attempt_at, status='available'`
  ).run(SOURCE_ID, retrievedAt, retrievedAt);

  const beforeFounders = loadFounderTable();
  const beforeProjects = loadProjectRows();
  const before = {
    founders: beforeFounders.length,
    verifiedFounders: beforeFounders.filter((f) => f.verified).length,
    projects: beforeProjects.length,
    verifiedProjects: beforeProjects.filter((p) => p.verified).length,
  };

  // Unverified people who appear in founder table
  const unverified = beforeFounders.filter((f) => !f.verified).slice(0, Number.isFinite(LIMIT) ? LIMIT : undefined);
  console.log(`Unverified founders to check: ${unverified.length}`);

  // Collect existing claim/source URLs per person
  const claimUrls = new Map<string, string[]>();
  for (const row of db
    .prepare(
      `SELECT entity_id, source_url, excerpt, claim_type FROM claims
       WHERE entity_type='person' AND source_url IS NOT NULL AND source_url != ''`
    )
    .all() as { entity_id: string; source_url: string; excerpt: string; claim_type: string }[]) {
    const list = claimUrls.get(row.entity_id) ?? [];
    list.push(row.source_url);
    claimUrls.set(row.entity_id, list);
  }
  // affiliations with claim_id
  for (const row of db
    .prepare(
      `SELECT a.person_id as person_id, c.source_url as source_url
       FROM affiliations a JOIN claims c ON c.id = a.claim_id
       WHERE c.source_url IS NOT NULL AND c.source_url != ''`
    )
    .all() as { person_id: string; source_url: string }[]) {
    const list = claimUrls.get(row.person_id) ?? [];
    list.push(row.source_url);
    claimUrls.set(row.person_id, list);
  }
  // LinkedIn aliases
  const linkedinByPerson = new Map<string, string>();
  for (const row of db
    .prepare(
      `SELECT entity_id, value_json FROM claims
       WHERE entity_type='person' AND claim_type IN ('linkedin_alias_discovered','profile_link')`
    )
    .all() as { entity_id: string; value_json: string }[]) {
    try {
      const v = JSON.parse(row.value_json);
      const url = typeof v === "string" ? v : v?.url || v?.linkedin || v?.href;
      if (typeof url === "string" && /linkedin\.com\/in\//i.test(url) && !linkedinByPerson.has(row.entity_id)) {
        linkedinByPerson.set(row.entity_id, url);
      }
    } catch {
      /* ignore */
    }
  }

  // company website / YC for founder role check
  const companyMeta = new Map<string, { name: string; website: string | null; primary: string | null }>();
  for (const row of db
    .prepare(`SELECT id, name, website_url, primary_link FROM projects WHERE kind='company'`)
    .all() as { id: string; name: string; website_url: string | null; primary_link: string | null }[]) {
    companyMeta.set(row.id, { name: row.name, website: row.website_url, primary: row.primary_link });
  }
  for (const row of db
    .prepare(`SELECT project_id, value_text FROM company_facts WHERE fact_key='website'`)
    .all() as { project_id: string; value_text: string }[]) {
    const cur = companyMeta.get(row.project_id);
    if (cur && !cur.website) cur.website = row.value_text;
  }

  type Decision =
    | { personId: string; action: "confirm"; evidenceUrl: string; excerpt: string; year: number | null; note: string }
    | { personId: string; action: "exclude"; evidenceUrl: string | null; reason: string; year: number | null };

  const decisions: Decision[] = [];
  const exclusions: Exclusion[] = [];
  const audited: { personId: string; name: string; action: string; evidenceUrl: string | null; note: string }[] = [];

  await mapPool(unverified, CONCURRENCY, async (person) => {
    const urls: string[] = [];
    const li = linkedinByPerson.get(person.id);
    if (li) urls.push(li);
    for (const u of claimUrls.get(person.id) || []) {
      if (!urls.includes(u)) urls.push(u);
    }
    const company = person.companyId ? companyMeta.get(person.companyId) : null;
    if (company?.website) urls.push(company.website);
    if (company?.primary && /ycombinator\.com\/companies\//i.test(company.primary)) urls.push(company.primary);

    // Program/school pages from affiliations
    for (const row of db
      .prepare(
        `SELECT c.source_url as source_url FROM affiliations a
         LEFT JOIN claims c ON c.id = a.claim_id
         WHERE a.person_id = ? AND c.source_url IS NOT NULL`
      )
      .all(person.id) as { source_url: string }[]) {
      if (row.source_url && !urls.includes(row.source_url)) urls.push(row.source_url);
      }

    let confirmed: Decision | null = null;
    let exclude: Decision | null = null;

    for (const url of urls.slice(0, 6)) {
      // Skip LinkedIn if it requires login walls heavily — still try once
      const html = await fetchHtml(url);
      if (!html) continue;
      const text = pageText(html);
      if (!nameIn(text, person.name)) continue;

      const founderHit =
        /\b(co-?founder|founder|founding\s+(engineer|member|team))\b/i.test(text) &&
        (company ? nameIn(text, company.name) || nameIn(url, company.name) : true);

      // Class year / affiliation
      const yearMatches = [...text.matchAll(/\b(?:class of|graduat(?:ed|ing)|'|\u2019)?\s*((?:20(?:1\d|2\d)))\b/gi)];
      const years = yearMatches.map((m) => Number(m[1])).filter((y) => y >= 2000 && y <= 2032);
      const campus = person.campus || "";
      const campusHit =
        !campus ||
        nameIn(text, campus) ||
        /\b(penn|upenn|wharton|stanford|berkeley|mit|harvard|columbia|cornell|cmu|yale|princeton|ucla|nyu)\b/i.test(text);

      const recentYears = years.filter((y) => y >= 2023);
      const oldYears = years.filter((y) => y > 0 && y < 2023);

      if (founderHit && campusHit && (recentYears.length > 0 || /\b(current student|undergraduate|undergrad|class of 202[3-9]|class of 203)\b/i.test(text))) {
        const year = recentYears.sort()[0] ?? person.year ?? null;
        confirmed = {
          personId: person.id,
          action: "confirm",
          evidenceUrl: url,
          excerpt: text.slice(0, 280),
          year,
          note: `Founder role + 2023-or-later affiliation on ${url}`,
        };
        break;
      }

      // Explicit pre-2023 only (and no later year)
      if (founderHit && oldYears.length && !recentYears.length && /graduat|alumni|alum|class of/i.test(text)) {
        const year = Math.max(...oldYears);
        if (year < 2023) {
          exclude = {
            personId: person.id,
            action: "exclude",
            evidenceUrl: url,
            reason: `Evidence shows class/grad year ${year} (before 2023)`,
            year,
          };
        }
      }

      // Wrong person / not founder when company page lists other founders only
      if (company && /ycombinator\.com\/companies\//i.test(url)) {
        if (nameIn(text, company.name) && !nameIn(text, person.name)) {
          exclude = {
            personId: person.id,
            action: "exclude",
            evidenceUrl: url,
            reason: `YC company page for ${company.name} does not name ${person.name} as founder`,
            year: person.year,
          };
        }
      }
    }

    // Existing enrollment_grad_year already on file: flag old without deleting
    if (!confirmed && !exclude && person.year != null && person.year < 2023) {
      exclude = {
        personId: person.id,
        action: "exclude",
        evidenceUrl: null,
        reason: `Stored enrollment_grad_year ${person.year} is before 2023`,
        year: person.year,
      };
    }

    if (confirmed) {
      decisions.push(confirmed);
      audited.push({
        personId: person.id,
        name: person.name,
        action: "confirm",
        evidenceUrl: confirmed.evidenceUrl,
        note: confirmed.note,
      });
    } else if (exclude) {
      decisions.push(exclude);
      exclusions.push({
        personId: person.id,
        name: person.name,
        company: person.company,
        campus: person.campus,
        year: exclude.year,
        reason: exclude.reason,
        evidenceUrl: exclude.evidenceUrl,
      });
      audited.push({
        personId: person.id,
        name: person.name,
        action: "exclude",
        evidenceUrl: exclude.evidenceUrl,
        note: exclude.reason,
      });
    }
  });

  const insertClaim = db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, source_url, retrieved_at, label, verification_state)
     VALUES (?, 'person', ?, 'founder_verification', ?, ?, ?, ?, ?, 'observed_fact', 'corroborated')`
  );
  const updatePerson = db.prepare(
    `UPDATE people SET verification_status=?, last_verified_at=?, verification_note=? WHERE id=?`
  );
  // Also bump projects that gain a confirmed founder
  const updateProject = db.prepare(
    `UPDATE projects SET verification_status='confirmed', last_verified_at=?, verification_note=?
     WHERE id=? AND (verification_status IS NULL OR verification_status IN ('unverified','needs_verification','partial'))`
  );

  const apply = db.transaction(() => {
    for (const d of decisions) {
      if (d.action === "confirm") {
        updatePerson.run("confirmed", retrievedAt, d.note.slice(0, 400), d.personId);
        insertClaim.run(
          newId("claim"),
          d.personId,
          JSON.stringify({ status: "confirmed", year: d.year }),
          d.excerpt.slice(0, 500),
          SOURCE_ID,
          d.evidenceUrl,
          retrievedAt
        );
        // confirm linked company project if any
        const roles = db
          .prepare(
            `SELECT project_id FROM person_project_roles WHERE person_id=? AND role LIKE '%founder%'`
          )
          .all(d.personId) as { project_id: string }[];
        for (const r of roles) {
          updateProject.run(retrievedAt, `Founder verified via ${d.evidenceUrl}`.slice(0, 400), r.project_id);
        }
      } else if (d.action === "exclude") {
        // Flag only — do not delete
        updatePerson.run(
          "unverified",
          retrievedAt,
          `FLAG_EXCLUDE: ${d.reason}`.slice(0, 400),
          d.personId
        );
        if (d.evidenceUrl) {
          insertClaim.run(
            newId("claim"),
            d.personId,
            JSON.stringify({ status: "flag_exclude", year: d.year, reason: d.reason }),
            d.reason.slice(0, 500),
            SOURCE_ID,
            d.evidenceUrl,
            retrievedAt
          );
        }
      }
    }
  });
  apply();
  db.pragma("wal_checkpoint(TRUNCATE)");

  const afterFounders = loadFounderTable();
  const afterProjects = loadProjectRows();
  const after = {
    founders: afterFounders.length,
    verifiedFounders: afterFounders.filter((f) => f.verified).length,
    projects: afterProjects.length,
    verifiedProjects: afterProjects.filter((p) => p.verified).length,
  };

  // 10 audited samples for report
  const samples = audited.filter((a) => a.action === "confirm").slice(0, 10);
  while (samples.length < 10 && audited.length > samples.length) {
    const next = audited[samples.length];
    if (next) samples.push(next);
    else break;
  }

  const report = {
    before,
    after,
    confirmed: decisions.filter((d) => d.action === "confirm").length,
    flaggedExclude: exclusions.length,
    exclusions,
    samples,
    auditedCount: audited.length,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ before, after, confirmed: report.confirmed, flaggedExclude: report.flaggedExclude, samples: samples.length }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
