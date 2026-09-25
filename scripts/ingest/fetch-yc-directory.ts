// Y Combinator public company directory, filtered to companies whose own
// public page text ties a founder or the team to Penn or UC Berkeley.
//
// The directory's public search config (window.AlgoliaOpts on
// ycombinator.com/companies) lists company slugs. Founder bios are not in
// that index, so each company page is fetched and read from its Inertia
// payload (props.company.founders[].founder_bio and long_description).
//
// A person is affiliated to a campus only when the page names that person
// in the same sentence as the school, or their own bio names the school.
// A team-level mention ("backgrounds at University of Pennsylvania") links
// the company to the campus and does not guess which founder attended.
// Customer/user mentions ("researchers at UC Berkeley use our product")
// are not affiliations.
//
// Bounded to recent batches (2024–2026) and Active companies. Older YC
// companies are mostly past a pre-seed brief; they are not invented around.
// No funding totals are recorded — YC's standard deal is not copied onto
// companies whose pages do not state an amount.
//
// Run: npx tsx scripts/ingest/fetch-yc-directory.ts

import * as cheerio from "cheerio";
import { getDb, newId, nowIso } from "../../lib/db/client";
import { assembleProjectFacts } from "../../lib/domain/facts";
import { evaluateAllGates } from "../../lib/screening/gates";

const SOURCE_ID = "src_yc_directory";
const MAX_COMPANY_PAGES = 1500;
const CONCURRENCY = 6;

const BATCHES = [
  "Fall 2026",
  "Summer 2026",
  "Spring 2026",
  "Winter 2026",
  "Fall 2025",
  "Summer 2025",
  "Spring 2025",
  "Winter 2025",
  "Fall 2024",
  "Summer 2024",
  "Winter 2024",
  "Spring 2024",
];

const SCHOOLS: { id: string; label: string; pattern: RegExp }[] = [
  {
    id: "univ_penn",
    label: "University of Pennsylvania",
    pattern: /\buniversity of pennsylvania\b|\bupenn\b|\bwharton\b/i,
  },
  {
    id: "univ_berkeley",
    label: "UC Berkeley",
    pattern: /\buc berkeley\b|\bu\.c\. berkeley\b|\buniversity of california,?\s+berkeley\b|\bberkeley eecs\b|\bhaas school\b/i,
  },
];

const AFFILIATION_CONTEXT =
  /\b(student|students|freshm\w*|sophomore|junior|senior|studied|studying|study|alumni|alums?\b|graduated|undergrad|undergraduate|phd|ph\.d|class of|backgrounds?|researchers from|engineers from|spin-?off|degree|mba|met\b)\b/i;
const CUSTOMER_CONTEXT =
  /\b(using|used by|customers?|partnership with|partnered with|researchers at leading|already using|payment option|hospitals?|launched at|including the)\b/i;

interface Founder {
  userId: number | null;
  name: string;
  title: string | null;
  bio: string;
  linkedin: string | null;
}

interface SchoolHit {
  universityId: string;
  label: string;
  excerpt: string;
}

interface CompanyMatch {
  slug: string;
  name: string;
  oneLiner: string | null;
  website: string | null;
  batch: string | null;
  yearFounded: number | null;
  location: string | null;
  status: string | null;
  ycUrl: string;
  founders: Founder[];
  companySchools: SchoolHit[];
  founderSchools: { founder: Founder; hits: SchoolHit[] }[];
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": "campus-universe-research-bot/0.1 (manual, bounded)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

async function algoliaOpts(): Promise<{ app: string; key: string }> {
  const html = await fetchText("https://www.ycombinator.com/companies");
  const m = html.match(/window\.AlgoliaOpts = (\{.*?\});/);
  if (!m) throw new Error("YC companies page did not include a public Algolia search config.");
  const opts = JSON.parse(m[1]) as { app: string; key: string };
  if (!opts.app || !opts.key) throw new Error("YC Algolia config was missing app or key.");
  return opts;
}

async function slugsForBatch(opts: { app: string; key: string }, batch: string): Promise<{ slug: string; status: string | null }[]> {
  const out: { slug: string; status: string | null }[] = [];
  let page = 0;
  for (;;) {
    const res = await fetch(`https://${opts.app}-dsn.algolia.net/1/indexes/YCCompany_production/query`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-algolia-application-id": opts.app,
        "x-algolia-api-key": opts.key,
      },
      body: JSON.stringify({
        query: "",
        filters: `batch:"${batch}"`,
        hitsPerPage: 100,
        page,
        attributesToRetrieve: ["slug", "status"],
      }),
    });
    if (!res.ok) throw new Error(`Algolia HTTP ${res.status} for batch ${batch}`);
    const data = (await res.json()) as { hits: { slug: string; status?: string }[]; nbPages: number };
    for (const hit of data.hits) {
      if (hit.slug) out.push({ slug: hit.slug, status: hit.status ?? null });
    }
    page++;
    if (page >= data.nbPages) break;
  }
  return out;
}

function schoolHitsIn(text: string): SchoolHit[] {
  const hits: SchoolHit[] = [];
  for (const school of SCHOOLS) {
    const m = school.pattern.exec(text);
    if (!m) continue;
    const excerpt = text
      .slice(Math.max(0, m.index - 110), Math.min(text.length, m.index + m[0].length + 110))
      .replace(/\s+/g, " ")
      .trim();
    const customer = CUSTOMER_CONTEXT.test(excerpt);
    const affiliated = AFFILIATION_CONTEXT.test(excerpt);
    if (customer && !affiliated) continue;
    if (!affiliated && !/\b(at|from)\b/i.test(excerpt)) continue;
    hits.push({ universityId: school.id, label: school.label, excerpt });
  }
  return hits;
}

function nameInExcerpt(name: string, excerpt: string): boolean {
  const last = name.split(/\s+/).slice(-1)[0];
  if (!last || last.length < 3) return excerpt.toLowerCase().includes(name.toLowerCase());
  return excerpt.toLowerCase().includes(name.toLowerCase()) || new RegExp(`\\b${last}\\b`, "i").test(excerpt);
}

function parseCompany(html: string, slug: string): CompanyMatch | null {
  const $ = cheerio.load(html);
  const raw = $("[data-page]").attr("data-page");
  if (!raw) return null;
  let data: { props?: { company?: Record<string, unknown> } };
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const co = data.props?.company;
  if (!co || typeof co.name !== "string") return null;
  const status = typeof co.ycdc_status === "string" ? co.ycdc_status : null;
  if (status && /inactive|acquired|public|dead/i.test(status)) return null;

  const founders: Founder[] = Array.isArray(co.founders)
    ? (co.founders as Record<string, unknown>[])
        .map((f) => ({
          userId: typeof f.user_id === "number" ? f.user_id : null,
          name: typeof f.full_name === "string" ? f.full_name.trim() : "",
          title: typeof f.title === "string" ? f.title : null,
          bio: typeof f.founder_bio === "string" ? f.founder_bio : "",
          linkedin: typeof f.linkedin_url === "string" && f.linkedin_url.startsWith("http") ? f.linkedin_url : null,
        }))
        .filter((f) => f.name)
    : [];

  const long = typeof co.long_description === "string" ? co.long_description : "";
  const companySchools = schoolHitsIn(long);
  const founderSchools: CompanyMatch["founderSchools"] = [];

  for (const founder of founders) {
    const own = schoolHitsIn(founder.bio);
    const fromTeam = companySchools.filter((hit) => nameInExcerpt(founder.name, hit.excerpt));
    const hits = [...own];
    for (const hit of fromTeam) {
      if (!hits.some((h) => h.universityId === hit.universityId)) hits.push(hit);
    }
    if (hits.length) founderSchools.push({ founder, hits });
  }

  if (companySchools.length === 0 && founderSchools.length === 0) return null;

  return {
    slug,
    name: String(co.name),
    oneLiner: typeof co.one_liner === "string" ? co.one_liner : null,
    website: typeof co.website === "string" ? co.website : null,
    batch: typeof co.batch_name === "string" ? co.batch_name : typeof co.batch === "string" ? co.batch : null,
    yearFounded: typeof co.year_founded === "number" ? co.year_founded : null,
    location: typeof co.location === "string" ? co.location : null,
    status,
    ycUrl: `https://www.ycombinator.com/companies/${slug}`,
    founders,
    companySchools,
    founderSchools,
  };
}

async function mapPool<T, R>(items: T[], n: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      out[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

async function main() {
  const db = getDb();
  const retrievedAt = nowIso();
  const opts = await algoliaOpts();

  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at)
     VALUES (?, 'Y Combinator company directory', 'portfolio_directory', 'https://www.ycombinator.com/companies', ?, 2, 'api', 'available', ?)
     ON CONFLICT(id) DO UPDATE SET last_attempt_at=excluded.last_attempt_at, status='available'`
  ).run(SOURCE_ID, JSON.stringify(["univ_penn", "univ_berkeley"]), retrievedAt);

  const slugs: { slug: string; batch: string }[] = [];
  for (const batch of BATCHES) {
    if (slugs.length >= MAX_COMPANY_PAGES) break;
    const rows = await slugsForBatch(opts, batch);
    const active = rows.filter((r) => !r.status || /active/i.test(r.status));
    console.log(`${batch}: ${rows.length} companies, ${active.length} active`);
    for (const row of active) {
      if (slugs.length >= MAX_COMPANY_PAGES) break;
      slugs.push({ slug: row.slug, batch });
    }
  }
  console.log(`Fetching ${slugs.length} YC company pages (cap ${MAX_COMPANY_PAGES}).`);

  let failed = 0;
  const matches: CompanyMatch[] = [];
  await mapPool(slugs, CONCURRENCY, async (row, index) => {
    if (index > 0 && index % 100 === 0) console.log(`  scanned ${index}/${slugs.length}, matches so far ${matches.length}, failed ${failed}`);
    try {
      const html = await fetchText(`https://www.ycombinator.com/companies/${row.slug}`);
      const parsed = parseCompany(html, row.slug);
      if (parsed) matches.push(parsed);
    } catch (e) {
      failed++;
      if (failed <= 5) console.log(`  skip ${row.slug}: ${(e as Error).message}`);
    }
  });
  console.log(`Scan done. ${matches.length} companies mention Penn or Berkeley in an affiliation context. ${failed} page fetches failed.`);

  const findProject = db.prepare(`SELECT id FROM projects WHERE website_url = ?`);
  const insertProject = db.prepare(
    `INSERT INTO projects (id, name, aliases_json, kind, sector, description, website_url, is_portfolio_reference, is_investable_candidate)
     VALUES (?, ?, '[]', 'company', NULL, ?, ?, 0, 1)`
  );
  const findPerson = db.prepare(`SELECT id FROM people WHERE aliases_json LIKE ?`);
  const insertPerson = db.prepare(`INSERT INTO people (id, name, aliases_json) VALUES (?, ?, ?)`);
  const updateAliases = db.prepare(`UPDATE people SET aliases_json = ? WHERE id = ?`);
  const findAffiliation = db.prepare(`SELECT id FROM affiliations WHERE person_id = ? AND university_id = ? AND role = ?`);
  const insertAffiliation = db.prepare(
    `INSERT INTO affiliations (id, person_id, university_id, role, status, claim_id) VALUES (?, ?, ?, ?, 'unverified', ?)`
  );
  const findRole = db.prepare(`SELECT id FROM person_project_roles WHERE person_id = ? AND project_id = ?`);
  const insertRole = db.prepare(
    `INSERT INTO person_project_roles (id, person_id, project_id, role, claim_id) VALUES (?, ?, ?, 'founder', ?)`
  );
  const insertRel = db.prepare(
    `INSERT INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json, verification_state)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'affiliation_only')`
  );
  const hasRel = db.prepare(
    `SELECT id FROM relationships WHERE source_entity_type = ? AND source_entity_id = ? AND target_entity_type = ? AND target_entity_id = ? AND relationship_type = ?`
  );
  const insertClaim = db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, source_url, retrieved_at, label, verification_state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'observed_fact', 'unverified')`
  );
  const insertSignal = db.prepare(
    `INSERT INTO signals (id, project_id, signal_type, current_observation, significance_note, claim_ids_json)
     VALUES (?, ?, 'demo', ?, ?, ?)`
  );
  const upsertGate = db.prepare(
    `INSERT INTO gate_results (id, project_id, gate_name, result, rationale, evaluated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(project_id, gate_name) DO UPDATE SET result=excluded.result, rationale=excluded.rationale, evaluated_at=excluded.evaluated_at`
  );

  let newCompanies = 0;
  let newPeople = 0;
  let personalAffiliations = 0;

  for (const company of matches) {
    const existing = findProject.get(company.ycUrl) as { id: string } | undefined;
    let projectId = existing?.id;
    if (!projectId) {
      projectId = newId("proj");
      const description = company.oneLiner || null;
      insertProject.run(projectId, company.name, description, company.ycUrl);
      newCompanies++;
    }

    const schoolIds = new Set<string>([
      ...company.companySchools.map((h) => h.universityId),
      ...company.founderSchools.flatMap((f) => f.hits.map((h) => h.universityId)),
    ]);

    const claimId = newId("claim");
    const excerpts = [
      ...company.companySchools.map((h) => `${h.label}: "${h.excerpt}"`),
      ...company.founderSchools.flatMap((f) => f.hits.map((h) => `${f.founder.name} bio / named in text (${h.label}): "${h.excerpt}"`)),
    ];
    insertClaim.run(
      claimId,
      "project",
      projectId,
      "accelerator_membership",
      JSON.stringify({
        name: company.name,
        batch: company.batch,
        ycUrl: company.ycUrl,
        website: company.website,
        location: company.location,
        schools: [...schoolIds],
      }),
      `Y Combinator company page for ${company.name}${company.batch ? ` (${company.batch})` : ""}: ${excerpts.join(" | ")}`.slice(0, 1200),
      SOURCE_ID,
      company.ycUrl,
      retrievedAt
    );
    insertSignal.run(
      newId("sig"),
      projectId,
      `YC directory company${company.batch ? `, ${company.batch}` : ""}${company.oneLiner ? `: ${company.oneLiner}` : ""}.`,
      "YC listing is downstream of company formation. School text on the page is quoted above; it is not a funding amount.",
      JSON.stringify([claimId])
    );

    for (const universityId of schoolIds) {
      if (!hasRel.get("project", projectId, "university", universityId, "affiliated_with")) {
        insertRel.run(newId("rel"), "project", projectId, "university", universityId, "affiliated_with", JSON.stringify([claimId]));
      }
    }

    for (const founder of company.founders) {
      const alias = founder.userId != null ? `yc-user:${founder.userId}` : `yc-name:${company.slug}:${founder.name.toLowerCase()}`;
      const existingPerson = findPerson.get(`%"${alias}"%`) as { id: string; aliases_json?: string } | undefined;
      let personId = existingPerson?.id;
      if (!personId) {
        personId = newId("person");
        const aliases = [alias];
        if (founder.linkedin) aliases.push(`linkedin:${founder.linkedin.replace(/\/$/, "")}`);
        insertPerson.run(personId, founder.name, JSON.stringify(aliases));
        newPeople++;
      } else if (founder.linkedin) {
        const row = db.prepare(`SELECT aliases_json FROM people WHERE id = ?`).get(personId) as { aliases_json: string };
        const aliases = JSON.parse(row.aliases_json) as string[];
        const li = `linkedin:${founder.linkedin.replace(/\/$/, "")}`;
        if (!aliases.includes(li)) {
          aliases.push(li);
          updateAliases.run(JSON.stringify(aliases), personId);
        }
      }

      const founderClaim = newId("claim");
      insertClaim.run(
        founderClaim,
        "person",
        personId,
        "accelerator_founder",
        JSON.stringify({ name: founder.name, title: founder.title, company: company.name }),
        `Y Combinator's page for ${company.name} lists ${founder.name}${founder.title ? ` (${founder.title})` : ""} as a founder.${
          founder.bio ? ` Bio: "${founder.bio.replace(/\s+/g, " ").slice(0, 400)}"` : ""
        }`,
        SOURCE_ID,
        company.ycUrl,
        retrievedAt
      );
      if (!findRole.get(personId, projectId)) {
        insertRole.run(newId("ppr"), personId, projectId, founderClaim);
        insertRel.run(newId("rel"), "person", personId, "project", projectId, "founded", JSON.stringify([founderClaim]));
      }

      const personal = company.founderSchools.find((f) => f.founder.name === founder.name);
      if (!personal) continue;
      for (const hit of personal.hits) {
        const role = `YC founder; page names ${hit.label}`;
        if (!findAffiliation.get(personId, hit.universityId, role)) {
          insertAffiliation.run(newId("aff"), personId, hit.universityId, role, founderClaim);
          personalAffiliations++;
          console.log(`  person: ${founder.name} → ${hit.label} (${company.name})`);
        }
      }
    }

    const facts = assembleProjectFacts(db, projectId);
    for (const o of evaluateAllGates(facts)) upsertGate.run(newId("gate"), projectId, o.gate, o.result, o.rationale);
    console.log(`  company: ${company.name} [${[...schoolIds].join(", ")}] founders=${company.founders.length} personally affiliated=${company.founderSchools.length}`);
  }

  db.prepare(`UPDATE sources SET last_success_at=?, discovered_lead_count=?, error=NULL, refresh_suggestion=? WHERE id=?`).run(
    nowIso(),
    matches.length,
    `Scanned ${slugs.length} active company pages from batches ${BATCHES[0]} back through ${BATCHES[BATCHES.length - 1]}, cap ${MAX_COMPANY_PAGES}. ${failed} fetches failed. Older batches were not scanned.`,
    SOURCE_ID
  );
  console.log(`YC done: ${newCompanies} new companies, ${newPeople} new people, ${personalAffiliations} personal campus affiliations.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
