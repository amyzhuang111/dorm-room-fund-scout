// Gap scan for student founders and startups missing from campus-universe.db.
// Free public pages only: YC company pages (via the public Algolia directory),
// a16z Speedrun company pages, the Columbia Startup Lab cohort pages, and the
// 2026 Startup Columbia winners page.
//
// A campus is attached only when the page text names that school in an
// affiliation context. Customer mentions are dropped. Nothing is written to
// the database. The JSON file is the input for import-v3-campus-founders.ts.
//
//   npx tsx scripts/ingest/scan-missing-campus-founders.ts /tmp/campus-founder-scan.json

import * as cheerio from "cheerio";
import fs from "node:fs";
import { getDb } from "../../lib/db/client";
import { normalizeCompanyName, normalizePersonName, websiteIdentity } from "../../lib/domain/dedupe";
import { parseSpeedrunCompany } from "./fetch-penn-depth";

interface Enrollment {
  status: "current_student" | "recent_grad" | "older_alumni";
  basis: "verified" | "inferred";
  label: string | null;
  gradYear: number | null;
  evidence: string;
}

interface FounderOut {
  name: string;
  aliases: string[];
  campusId: string | null;
  affiliationRole: string;
  founderStatus: "founder";
  potentialSignal: null;
  verificationStatus: "confirmed" | "partial";
  verificationNote: string;
  enrollment: Enrollment | null;
  leftSchool?: boolean;
  excerpt: string;
}

interface FundingOut {
  stage: string;
  amountUsd: number | null;
  amountText: string;
  date: string | null;
  leads: string[];
  investors: string[];
  excerpt: string;
  sourceUrl: string;
}

interface InvestorOut {
  name: string;
  excerpt: string;
  sourceUrl: string;
  batch?: string;
  kind?: string;
}

interface CompanyOut {
  name: string;
  description: string | null;
  website: string | null;
  sourceUrl: string;
  excerpt: string;
  orgPlace: string;
  campusIds: string[];
  founders: FounderOut[];
  funding?: FundingOut[];
  investors?: InvestorOut[];
}

interface School {
  id: string;
  label: string;
  pattern: RegExp;
  exclude?: RegExp;
}

const SCHOOLS: School[] = [
  { id: "univ_penn", label: "University of Pennsylvania", pattern: /\buniversity of pennsylvania\b|\bupenn\b|\bwharton\b|\bpenn engineering\b|\b(?:at|from)\s+penn\b/i, exclude: /penn state/i },
  { id: "univ_berkeley", label: "UC Berkeley", pattern: /\buc berkeley\b|\bu\.c\. berkeley\b|\buniversity of california,?\s+berkeley\b|\bberkeley eecs\b|\bhaas school\b|\bat berkeley\b/i, exclude: /lawrence berkeley|berkeley lab/i },
  { id: "univ_columbia", label: "Columbia University", pattern: /\bcolumbia university\b|\bcolumbia college\b|\bcolumbia engineering\b|\bat columbia\b|\bfrom columbia\b/i, exclude: /british columbia|district of columbia|columbia sportswear|columbia records|columbia pictures/i },
  { id: "univ_stanford", label: "Stanford University", pattern: /\bstanford university\b|\bat stanford\b|\bstanford\b/i },
  { id: "univ_mit", label: "MIT", pattern: /\bmassachusetts institute of technology\b|\bmit\b/i },
  { id: "univ_harvard", label: "Harvard University", pattern: /\bharvard university\b|\bharvard college\b|\bharvard business school\b|\bhbs\b|\bat harvard\b/i, exclude: /harvard business review/i },
  { id: "univ_princeton", label: "Princeton University", pattern: /\bprinceton university\b|\bat princeton\b/i },
  { id: "univ_cmu", label: "Carnegie Mellon University", pattern: /\bcarnegie mellon\b|\bcmu\b/i },
  { id: "univ_gatech", label: "Georgia Institute of Technology", pattern: /\bgeorgia tech\b|\bgeorgia institute of technology\b/i },
  { id: "univ_michigan", label: "University of Michigan", pattern: /\buniversity of michigan\b|\bumich\b/i, exclude: /michigan state/i },
  { id: "univ_waterloo", label: "University of Waterloo", pattern: /\buniversity of waterloo\b|\buwaterloo\b|\bat waterloo\b/i },
  { id: "univ_brown", label: "Brown University", pattern: /\bbrown university\b|\bat brown\b/i },
  { id: "univ_cornell_tech", label: "Cornell Tech", pattern: /cornell tech/i },
  { id: "univ_cornell", label: "Cornell University", pattern: /\bcornell university\b|\bat cornell\b/i, exclude: /cornell tech/i },
  { id: "univ_duke", label: "Duke University", pattern: /\bduke university\b|\bat duke\b/i },
  { id: "univ_yale", label: "Yale University", pattern: /\byale university\b|\byale college\b|\bat yale\b/i },
  { id: "univ_nyu", label: "New York University", pattern: /\bnyu\b|new york university/i },
  { id: "univ_ucla", label: "UCLA", pattern: /\bucla\b/i },
  { id: "univ_usc", label: "University of Southern California", pattern: /\buniversity of southern california\b|\bat usc\b/i },
  { id: "univ_caltech", label: "Caltech", pattern: /\bcaltech\b|california institute of technology/i },
  { id: "univ_uchicago", label: "University of Chicago", pattern: /university of chicago|\buchicago\b/i },
  { id: "univ_uiuc", label: "University of Illinois Urbana-Champaign", pattern: /urbana-champaign|\buiuc\b|university of illinois/i },
  { id: "univ_utexas", label: "University of Texas at Austin", pattern: /university of texas at austin|\but austin\b/i },
  { id: "univ_uw", label: "University of Washington", pattern: /university of washington/i },
  { id: "univ_rice", label: "Rice University", pattern: /\brice university\b|\bat rice\b/i },
  { id: "univ_northwestern", label: "Northwestern University", pattern: /\bnorthwestern university\b|\bat northwestern\b/i },
  { id: "univ_dartmouth", label: "Dartmouth College", pattern: /\bdartmouth college\b|\bat dartmouth\b/i },
  { id: "univ_georgetown", label: "Georgetown University", pattern: /\bgeorgetown university\b|\bat georgetown\b/i },
  { id: "univ_emory", label: "Emory University", pattern: /\bemory university\b|\bat emory\b/i },
  { id: "univ_unc", label: "University of North Carolina at Chapel Hill", pattern: /university of north carolina|\bunc chapel hill\b|\bat unc\b/i },
  { id: "univ_vanderbilt", label: "Vanderbilt University", pattern: /\bvanderbilt university\b|\bat vanderbilt\b/i },
  { id: "univ_washu", label: "Washington University in St. Louis", pattern: /washington university in st\.?\s*louis|\bwashu\b|\bwustl\b/i },
  { id: "univ_notredame", label: "University of Notre Dame", pattern: /university of notre dame|\bat notre dame\b/i },
  { id: "univ_uva", label: "University of Virginia", pattern: /university of virginia|\bat uva\b/i },
  { id: "univ_bu", label: "Boston University", pattern: /boston university/i },
  { id: "univ_hmc", label: "Harvey Mudd College", pattern: /harvey mudd|\bhmc\b/i },
  { id: "univ_toronto", label: "University of Toronto", pattern: /university of toronto|\buoft\b/i },
  { id: "univ_queens", label: "Queen's University", pattern: /queen'?s university/i },
  { id: "univ_cambridge", label: "University of Cambridge", pattern: /university of cambridge|\bcambridge university\b/i },
  { id: "univ_lafayette", label: "Lafayette College", pattern: /lafayette college/i },
  { id: "univ_laurentian", label: "Laurentian University", pattern: /laurentian university/i },
];

const SEARCHES = [
  "University of Pennsylvania",
  "UPenn",
  "Wharton",
  "UC Berkeley",
  "Berkeley",
  "Columbia",
  "Stanford",
  "MIT",
  "Harvard",
  "Princeton",
  "Carnegie Mellon",
  "Georgia Tech",
  "University of Michigan",
  "Waterloo",
  "Brown University",
  "Cornell",
  "Duke University",
  "Yale",
  "NYU",
  "UCLA",
  "University of Southern California",
  "Caltech",
  "University of Chicago",
  "University of Illinois",
  "UT Austin",
  "University of Washington",
  "Rice University",
  "Northwestern",
  "Dartmouth",
  "Georgetown",
  "Emory",
  "North Carolina",
  "Vanderbilt",
  "Washington University",
  "Notre Dame",
  "University of Virginia",
  "Boston University",
  "Harvey Mudd",
  "University of Toronto",
  "Queen's University",
  "Cambridge",
  "Lafayette College",
  "Laurentian",
];

const AFFILIATION = /\b(student|students|freshm\w*|sophomore|junior|senior|studied|studying|study|alumni|alums?\b|graduated|undergrad|undergraduate|phd|ph\.d|class of|backgrounds?|researchers from|engineers from|spin-?off|degree|mba|dropout|dropped out|left|fellow|founder|majoring)\b/i;
const CUSTOMER = /\b(using|used by|customers?|partnership with|partnered with|researchers at leading|already using|payment option|hospitals?|launched at|including the)\b/i;

const CSL_2026 = "https://entrepreneurship.columbia.edu/2026/07/13/welcome-to-the-2026-2027-cohort-of-the-columbia-startup-lab/";
const CSL_2025 = "https://entrepreneurship.columbia.edu/2025/06/25/welcome-to-the-2025-2026-cohort-of-the-columbia-startup-lab/";
const STARTUP_COLUMBIA = "https://entrepreneurship.columbia.edu/2026/04/29/congratulations-2026-startup-columbia-winners/";

function fetchText(url: string): Promise<string> {
  return fetch(url, {
    headers: { "user-agent": "campus-universe-research-bot/0.1 (manual, bounded)" },
    signal: AbortSignal.timeout(15000),
  }).then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
    return res.text();
  });
}

async function mapPool<T>(items: T[], n: number, fn: (item: T, index: number) => Promise<void>) {
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: n }, () => worker()));
}

function clean(text: string): string {
  return text.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&#8217;|&rsquo;|’|‘/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function schoolHits(text: string): { id: string; label: string; excerpt: string }[] {
  const hits: { id: string; label: string; excerpt: string }[] = [];
  for (const school of SCHOOLS) {
    const flags = school.pattern.flags.includes("g") ? school.pattern.flags : `${school.pattern.flags}g`;
    const pattern = new RegExp(school.pattern.source, flags);
    for (const match of text.matchAll(pattern)) {
      const start = match.index ?? 0;
      const before = text.slice(Math.max(0, start - 70), start);
      const after = text.slice(start + match[0].length, start + match[0].length + 36);
      const local = `${before}${match[0]}${after}`.replace(/\s+/g, " ").trim();
      if (school.exclude?.test(local)) continue;
      if (/\bscholarships?\s+from\b/i.test(before)) continue;
      const degree = /\b(student|students|studied|studying|alumni|alums?\b|graduated|undergrad|undergraduate|phd|ph\.d|class of|degree|mba|dropout|dropped out|majoring|bachelor|b\.?s\.?|b\.?a\.?|m\.?s\.?|m\.?sc)\b/i.test(local);
      if (/\bhackathon\b/i.test(local) && !degree) continue;
      const atFrom = /\b(at|from|@)\s*$/i.test(before.slice(-20));
      const customer = CUSTOMER.test(local);
      if (customer && !degree) continue;
      if (!degree && !atFrom) continue;
      hits.push({ id: school.id, label: school.label, excerpt: local });
      break;
    }
  }
  return hits;
}

function nameInExcerpt(name: string, excerpt: string): boolean {
  const last = name.split(/\s+/).slice(-1)[0] ?? "";
  if (last.length < 3) return excerpt.toLowerCase().includes(name.toLowerCase());
  return excerpt.toLowerCase().includes(name.toLowerCase()) || new RegExp(`\\b${last}\\b`, "i").test(excerpt);
}

function classYear(text: string): number | null {
  const normalized = text.replace(/[’‘]/g, "'");
  const classOf = normalized.match(/\bclass of\s+(20\d{2})\b/i);
  if (classOf) return Number(classOf[1]);
  const tick = normalized.match(/'(\d{2})(?!\d)/);
  if (!tick) return null;
  const year = 2000 + Number(tick[1]);
  return year >= 1990 && year <= 2032 ? year : null;
}

function enrollmentForYear(year: number, evidence: string): Enrollment {
  const status = year > 2026 ? "current_student" : year >= 2023 ? "recent_grad" : "older_alumni";
  return { status, basis: "verified", label: `'${String(year).slice(2)}`, gradYear: year, evidence };
}

function recentEnough(batch: string | null): boolean {
  if (!batch) return true;
  const year = batch.match(/20\d{2}/);
  if (!year) return true;
  return Number(year[0]) >= 2023;
}

interface Known {
  names: Set<string>;
  hosts: Set<string>;
  people: Set<string>;
  urls: Set<string>;
}

function knownIndex(): Known {
  const db = getDb();
  const names = new Set<string>();
  const hosts = new Set<string>();
  const people = new Set<string>();
  const urls = new Set<string>();
  for (const row of db.prepare(`SELECT name, website_url FROM projects WHERE kind='company'`).all() as { name: string; website_url: string | null }[]) {
    names.add(normalizeCompanyName(row.name));
    const host = websiteIdentity(row.website_url);
    if (host) hosts.add(host);
  }
  for (const row of db.prepare(`SELECT name FROM people`).all() as { name: string }[]) people.add(normalizePersonName(row.name));
  for (const row of db.prepare(`SELECT source_url FROM claims`).all() as { source_url: string }[]) urls.add(row.source_url);
  return { names, hosts, people, urls };
}

function companyIsNew(known: Known, name: string, website: string | null): boolean {
  if (known.names.has(normalizeCompanyName(name))) return false;
  const host = websiteIdentity(website);
  if (host && known.hosts.has(host)) return false;
  return true;
}

function founderOut(name: string, campusId: string | null, role: string, note: string, status: "confirmed" | "partial", excerpt: string, enrollment: Enrollment | null, aliases: string[] = []): FounderOut {
  return {
    name,
    aliases,
    campusId,
    affiliationRole: role,
    founderStatus: "founder",
    potentialSignal: null,
    verificationStatus: status,
    verificationNote: note,
    enrollment,
    excerpt,
  };
}

async function algoliaOpts(): Promise<{ app: string; key: string }> {
  const html = await fetchText("https://www.ycombinator.com/companies");
  const match = html.match(/window\.AlgoliaOpts = (\{.*?\});/);
  if (!match) throw new Error("YC companies page did not include a public Algolia search config.");
  const opts = JSON.parse(match[1]) as { app: string; key: string };
  return opts;
}

async function searchSlugs(opts: { app: string; key: string }, query: string): Promise<{ slug: string; batch: string | null }[]> {
  const out: { slug: string; batch: string | null }[] = [];
  let page = 0;
  for (;;) {
    const res = await fetch(`https://${opts.app}-dsn.algolia.net/1/indexes/YCCompany_production/query`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-algolia-application-id": opts.app,
        "x-algolia-api-key": opts.key,
      },
      body: JSON.stringify({ query, hitsPerPage: 100, page, attributesToRetrieve: ["slug", "batch", "status"] }),
    });
    if (!res.ok) throw new Error(`Algolia HTTP ${res.status} for ${query}`);
    const data = (await res.json()) as { hits: { slug?: string; batch?: string; status?: string }[]; nbPages: number };
    for (const hit of data.hits) {
      if (!hit.slug) continue;
      if (hit.status && /inactive|acquired|public|dead/i.test(hit.status)) continue;
      if (!recentEnough(hit.batch ?? null)) continue;
      out.push({ slug: hit.slug, batch: hit.batch ?? null });
    }
    page++;
    if (page >= data.nbPages || page > 8) break;
  }
  return out;
}

interface YcFounder {
  name: string;
  title: string | null;
  bio: string;
  linkedin: string | null;
}

function parseYc(html: string): { name: string; oneLiner: string | null; website: string | null; batch: string | null; long: string; founders: YcFounder[] } | null {
  const raw = cheerio.load(html)("[data-page]").attr("data-page");
  if (!raw) return null;
  let data: { props?: { company?: Record<string, unknown> } };
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const co = data.props?.company;
  if (!co || typeof co.name !== "string") return null;
  const status = typeof co.ycdc_status === "string" ? co.ycdc_status : "";
  if (status && /inactive|acquired|public|dead/i.test(status)) return null;
  const founders: YcFounder[] = Array.isArray(co.founders)
    ? (co.founders as Record<string, unknown>[])
        .map((f) => ({
          name: typeof f.full_name === "string" ? f.full_name.trim() : "",
          title: typeof f.title === "string" ? f.title : null,
          bio: typeof f.founder_bio === "string" ? f.founder_bio : "",
          linkedin: typeof f.linkedin_url === "string" && f.linkedin_url.includes("linkedin.com/in/") ? f.linkedin_url.split("?")[0] : null,
        }))
        .filter((f) => f.name)
    : [];
  return {
    name: co.name,
    oneLiner: typeof co.one_liner === "string" ? co.one_liner : null,
    website: typeof co.website === "string" && co.website.startsWith("http") ? co.website : null,
    batch: typeof co.batch_name === "string" ? co.batch_name : typeof co.batch === "string" ? co.batch : null,
    long: typeof co.long_description === "string" ? co.long_description : "",
    founders,
  };
}

function ycCompany(parsed: NonNullable<ReturnType<typeof parseYc>>, url: string): CompanyOut | null {
  const companyHits = schoolHits(parsed.long);
  const founders: FounderOut[] = [];
  const campuses = new Set<string>();
  for (const founder of parsed.founders) {
    const own = schoolHits(founder.bio);
    const fromTeam = companyHits.filter((hit) => nameInExcerpt(founder.name, hit.excerpt));
    const hits = [...own];
    for (const hit of fromTeam) if (!hits.some((row) => row.id === hit.id)) hits.push(hit);
    if (!hits.length) continue;
    const hit = hits[0];
    campuses.add(hit.id);
    const year = classYear(founder.bio);
    const dropout = /\b(dropped out|dropout)\b/i.test(founder.bio);
    const aliases = founder.linkedin ? [`linkedin:${founder.linkedin.replace(/\/$/, "")}`] : [];
    founders.push(
      founderOut(
        founder.name,
        hit.id,
        `${parsed.batch ? `Y Combinator ${parsed.batch}, ` : ""}${hit.label}`,
        `Y Combinator lists ${founder.name} as a founder and the bio names ${hit.label}. ${year ? `Class year ${year} is printed.` : "No class year is printed."}`,
        "confirmed",
        `Y Combinator's page for ${parsed.name}${parsed.batch ? ` (${parsed.batch})` : ""} lists ${founder.name}${founder.title ? ` (${founder.title})` : ""}. Bio: "${hit.excerpt}"`,
        year ? enrollmentForYear(year, `The Y Combinator bio contains a class year for ${founder.name}: ${hit.excerpt}`) : null,
        aliases
      )
    );
    if (dropout) founders[founders.length - 1].leftSchool = true;
  }
  for (const hit of companyHits) campuses.add(hit.id);
  if (!founders.length && !companyHits.length) return null;
  if (!founders.length) return null;
  const batch = parsed.batch;
  const name = parsed.name === "Nori" && founders.some((f) => /nori robotics/i.test(f.excerpt)) ? "Nori Robotics" : parsed.name;
  return {
    name,
    description: parsed.oneLiner,
    website: parsed.website,
    sourceUrl: url,
    excerpt: `Y Combinator lists ${name}${batch ? ` (${batch})` : ""}. ${parsed.oneLiner ?? ""} ${founders.map((f) => f.excerpt).join(" ")}`.slice(0, 1200),
    orgPlace: batch ? `Y Combinator ${batch}` : "Y Combinator",
    campusIds: [...campuses],
    founders,
    investors: batch
      ? [{ name: "Y Combinator", excerpt: `Y Combinator company page lists ${name} in the ${batch} batch. The page does not state a dollar amount.`, sourceUrl: url, batch, kind: "accelerator" }]
      : [],
  };
}

async function scanYc(known: Known): Promise<CompanyOut[]> {
  const opts = await algoliaOpts();
  const slugs = new Map<string, string | null>();
  for (const query of SEARCHES) {
    const rows = await searchSlugs(opts, query);
    for (const row of rows) if (!slugs.has(row.slug)) slugs.set(row.slug, row.batch);
  }
  const pending = [...slugs.keys()].filter((slug) => !known.urls.has(`https://www.ycombinator.com/companies/${slug}`));
  console.log(`YC search slugs ${slugs.size}, pages not already cited ${pending.length}`);
  const companies: CompanyOut[] = [];
  let failed = 0;
  await mapPool(pending, 8, async (slug, index) => {
    if (index > 0 && index % 80 === 0) console.log(`  YC ${index}/${pending.length}, kept ${companies.length}`);
    const url = `https://www.ycombinator.com/companies/${slug}`;
    try {
      const html = await fetchText(url);
      const parsed = parseYc(html);
      if (!parsed || !recentEnough(parsed.batch)) return;
      const company = ycCompany(parsed, url);
      if (!company) return;
      if (!companyIsNew(known, company.name, company.website) && company.founders.every((f) => known.people.has(normalizePersonName(f.name)))) return;
      companies.push(company);
    } catch (error) {
      failed++;
      if (failed <= 6) console.log(`  skip ${slug}: ${(error as Error).message}`);
    }
  });
  console.log(`YC kept ${companies.length}, failed ${failed}`);
  return companies;
}

async function scanSpeedrun(known: Known): Promise<CompanyOut[]> {
  const slugs: string[] = [];
  for (let offset = 0; offset < 400; offset += 100) {
    const body = await fetchText(`https://speedrun-api.a16z.com/api/companies/companies/?limit=100&offset=${offset}`);
    const parsed = JSON.parse(body) as { results?: { slug: string }[] };
    const batch = parsed.results ?? [];
    for (const row of batch) if (row.slug) slugs.push(row.slug);
    if (batch.length < 100) break;
  }
  const companies: CompanyOut[] = [];
  let failed = 0;
  await mapPool(slugs, 6, async (slug) => {
    const url = `https://speedrun.a16z.com/companies/${slug}`;
    if (known.urls.has(url)) return;
    try {
      const html = await fetchText(url);
      const company = parseSpeedrunCompany(html);
      if (!company) return;
      const founders: FounderOut[] = [];
      const campuses = new Set<string>();
      for (const person of company.people) {
        if (!person.founder) continue;
        const hits = schoolHits(`${person.introduction} ${person.title}`);
        if (!hits.length) continue;
        const hit = hits[0];
        campuses.add(hit.id);
        const year = classYear(person.introduction);
        founders.push(
          founderOut(
            person.name,
            hit.id,
            `a16z Speedrun, ${hit.label}`,
            `The Speedrun page names ${person.name} and the bio names ${hit.label}. ${year ? `Class year ${year} is printed.` : "No class year is printed."}`,
            "confirmed",
            `a16z Speedrun's page for ${company.name} lists ${person.name}${person.title ? ` (${person.title})` : ""}. Bio: "${hit.excerpt}"`,
            year ? enrollmentForYear(year, `The Speedrun bio contains a class year for ${person.name}: ${hit.excerpt}`) : null,
            person.linkedin ? [`linkedin:${person.linkedin}`] : []
          )
        );
      }
      if (!founders.length) return;
      if (!companyIsNew(known, company.name, company.website) && founders.every((f) => known.people.has(normalizePersonName(f.name)))) return;
      companies.push({
        name: company.name,
        description: company.description || null,
        website: company.website,
        sourceUrl: url,
        excerpt: `a16z Speedrun lists ${company.name}. ${founders.map((f) => f.excerpt).join(" ")}`.slice(0, 1200),
        orgPlace: "a16z Speedrun",
        campusIds: [...campuses],
        founders,
        investors: [{ name: "a16z Speedrun", excerpt: `a16z Speedrun company page lists ${company.name}. The page does not state a dollar amount.`, sourceUrl: url, kind: "accelerator" }],
      });
    } catch (error) {
      failed++;
      if (failed <= 6) console.log(`  speedrun skip ${slug}: ${(error as Error).message}`);
    }
  });
  console.log(`Speedrun kept ${companies.length}, failed ${failed}`);
  return companies;
}

function paragraphs(html: string, startNeedle: string): { text: string; bold: boolean; links: string[] }[] {
  const start = html.indexOf(startNeedle);
  const chunk = start >= 0 ? html.slice(start, start + 140000) : html;
  const paras = chunk.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) ?? [];
  return paras
    .map((p) => {
      const links = [...p.matchAll(/href="(https?:\/\/[^"]+)"/gi)].map((m) => m[1]).filter((url) => !/columbia\.edu|facebook|twitter|linkedin|instagram/i.test(url));
      return { text: clean(p), bold: /<(b|strong)\b/i.test(p), links };
    })
    .filter((p) => p.text && p.text !== "\u00a0");
}

function parseCsl(html: string, sourceUrl: string, cohort: string): CompanyOut[] {
  const rows = paragraphs(html, "Get to know the ventures");
  const companies: CompanyOut[] = [];
  let current: { name: string; website: string | null; founders: string; description: string } | null = null;
  const flush = () => {
    if (!current) return;
    const founderBits = current.founders.split("|").map((part) => part.trim()).filter(Boolean);
    const founders = founderBits.map((bit) => {
      const [name, school] = bit.split(",").map((part) => part.trim());
      return founderOut(
        name,
        "univ_columbia",
        `${school || "Columbia"}, ${cohort}`,
        `The Columbia Startup Lab page lists ${name} with ${current!.name}. It does not print a class year or the title founder on this line. The page introduces the list as ventures and founders.`,
        "partial",
        `The ${cohort} page lists ${name}${school ? `, ${school}` : ""} under ${current!.name}.`,
        null
      );
    }).filter((f) => f.name && f.name.split(" ").length >= 2);
    if (founders.length && current.name.length > 1 && current.name.length < 80) {
      companies.push({
        name: current.name,
        description: current.description || null,
        website: current.website,
        sourceUrl,
        excerpt: `The ${cohort} page lists ${current.name}${current.description ? `: ${current.description}` : ""}.`,
        orgPlace: cohort,
        campusIds: ["univ_columbia"],
        founders,
      });
    }
    current = null;
  };
  for (const row of rows) {
    if (/our latest news|william v\. campbell/i.test(row.text)) break;
    if (row.bold && row.text.length < 80 && !row.text.includes(",")) {
      flush();
      current = { name: row.text, website: row.links[0] ?? null, founders: "", description: "" };
      continue;
    }
    if (!current) continue;
    if (row.text.includes(",") && row.text.length < 180 && !current.founders) current.founders = row.text;
    else if (!current.description) current.description = row.text;
  }
  flush();
  return companies;
}

function parseWinners(html: string): CompanyOut[] {
  const anchor = html.indexOf("Founder of");
  const slice = anchor >= 0 ? html.slice(Math.max(0, anchor - 2500), anchor + 90000) : html;
  const rows = paragraphs(slice, slice.slice(0, 24));
  const companies: CompanyOut[] = [];
  for (let i = 0; i < rows.length; i++) {
    const founderLine = rows[i].text.match(/^Founders? of\s+(.+)$/i);
    if (!founderLine) continue;
    const companyName = founderLine[1].trim();
    let peopleLine = "";
    for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
      if (/'(\d{2})(?!\d)/.test(rows[j].text) || /\$[0-9,]/.test(rows[j].text)) {
        peopleLine = rows[j].text;
        break;
      }
    }
    const description = rows[i + 1] && !/^Founders? of\b/i.test(rows[i + 1].text) && !/prize|track|held by/i.test(rows[i + 1].text) ? rows[i + 1].text : null;
    const prize = peopleLine.match(/\$([0-9,]+)/);
    const people = peopleLine.split(/;|\|/).map((part) => part.replace(/^.*?:\s*/, "").trim()).filter((part) => /[A-Za-z]/.test(part) && part.split(" ").length >= 2 && part.split(" ").length <= 6);
    const founders = people.map((part) => {
      const year = classYear(part);
      const name = part.replace(/,?\s*(MBA[^,]*|'?\d{2}[A-Z/]*|MS[^,]*|MPH).*$/i, "").replace(/,?\s*'?\d{2}.*$/, "").trim();
      if (!name || name.split(" ").length < 2) return null;
      return founderOut(
        name,
        "univ_columbia",
        `Startup Columbia 2026${year ? `, '${String(year).slice(2)}` : ""}`,
        `Startup Columbia's winners page calls ${name} a founder of ${companyName}. ${year ? `The class year printed is ${year}.` : "No class year is printed on this line."}`,
        "confirmed",
        `Startup Columbia lists ${part} as a founder of ${companyName}.`,
        year ? enrollmentForYear(year, `Startup Columbia prints ${part} with ${companyName}.`) : null
      );
    }).filter((f): f is FounderOut => !!f);
    const newest = founders.reduce((max, f) => Math.max(max, f.enrollment?.gradYear ?? 0), 0);
    if (!founders.length || newest < 2023) continue;
    const amount = prize ? Number(prize[1].replace(/,/g, "")) : null;
    companies.push({
      name: companyName,
      description,
      website: null,
      sourceUrl: STARTUP_COLUMBIA,
      excerpt: `Startup Columbia's 2026 winners page lists ${companyName}${description ? `: ${description}` : ""}.`,
      orgPlace: "Startup Columbia 2026",
      campusIds: ["univ_columbia"],
      founders,
      funding: amount
        ? [{
            stage: "prize",
            amountUsd: amount,
            amountText: `$${prize![1]} Startup Columbia prize`,
            date: "2026-04-29",
            leads: [],
            investors: ["Startup Columbia"],
            excerpt: `Startup Columbia lists a $${prize![1]} prize for ${companyName}.`,
            sourceUrl: STARTUP_COLUMBIA,
          }]
        : [],
    });
  }
  return companies;
}

function canonCompany(name: string): string {
  const key = normalizeCompanyName(name);
  if (key === "blockbridge" || key === "blockbridg3") return "blockbridg3";
  return key;
}

function dedupeCompanies(rows: CompanyOut[]): CompanyOut[] {
  const map = new Map<string, CompanyOut>();
  for (const row of rows) {
    const key = canonCompany(row.name);
    if (!key) continue;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, row);
      continue;
    }
    const prevYears = prev.founders.filter((founder) => founder.enrollment?.gradYear).length;
    const nextYears = row.founders.filter((founder) => founder.enrollment?.gradYear).length;
    const chosen = nextYears > prevYears ? row : prev;
    const other = chosen === row ? prev : row;
    const funding = [...(chosen.funding ?? [])];
    for (const round of other.funding ?? []) {
      if (!funding.some((existing) => existing.amountText === round.amountText)) funding.push(round);
    }
    if (funding.length) chosen.funding = funding;
    if (!chosen.website && other.website) chosen.website = other.website;
    if (!chosen.description && other.description) chosen.description = other.description;
    map.set(key, chosen);
  }
  return [...map.values()];
}

const FULCRUM_BLOG = "https://www.withfulcrum.com/blog/we%E2%80%99re-building-for-the-next-generation-of-insurance-brokerages";
const YOURSTORY = "https://yourstory.com/2023/07/two-indian-entrepreneurs-making-enterprises-nimble";
const SPC = "https://www.southparkcommons.com/companies/fulcrum/";

function handCompanies(): CompanyOut[] {
  return [
    {
      name: "Fulcrum",
      description: "AI platform for insurance brokerages that handles coverage analysis, proposals, policy checking, and certificate issuance.",
      website: "https://www.withfulcrum.com/",
      sourceUrl: YOURSTORY,
      excerpt: "Fulcrum, a company co-founded by Arjun Mangla and Sambhav Anand. Co-founders Mangla and Anand first met at Columbia University.",
      orgPlace: "South Park Commons",
      campusIds: ["univ_columbia"],
      founders: [
        founderOut(
          "Sambhav Anand",
          "univ_columbia",
          "Columbia University, Fulcrum co-founder",
          "YourStory says Sambhav Anand co-founded Fulcrum and was enrolled in a Columbia course taught by Arjun Mangla. No class year is printed.",
          "confirmed",
          "YourStory: Fulcrum, a company co-founded by Arjun Mangla and Sambhav Anand. Co-founders Mangla and Anand first met at Columbia University in the US. Mangla was a TA for a course Anand was enrolled in.",
          { status: "older_alumni", basis: "inferred", label: null, gradYear: null, evidence: "YourStory says Sambhav Anand was enrolled at Columbia, then worked at Oscar Health and Affirm before co-founding Fulcrum. No graduation year is printed." }
        ),
      ],
      investors: [
        { name: "South Park Commons", excerpt: "South Park Commons lists Fulcrum, founded by Arjun Mangla (BS, MS in Computer Science from Columbia) and Sambhav Anand.", sourceUrl: SPC, kind: "fund" },
        { name: "CRV", excerpt: "Fulcrum's blog, written by Arjun Mangla, announces $25 million in combined Seed and Series A funding led by CRV.", sourceUrl: FULCRUM_BLOG, kind: "lead" },
        { name: "Foundation Capital", excerpt: "Fulcrum's blog announces $25 million in combined Seed and Series A funding led by CRV, alongside South Park Commons and Foundation Capital.", sourceUrl: FULCRUM_BLOG, kind: "fund" },
      ],
      funding: [
        {
          stage: "seed and series a",
          amountUsd: 25000000,
          amountText: "$25 million Seed and Series A",
          date: "2026-01-27",
          leads: ["CRV"],
          investors: ["South Park Commons", "Foundation Capital"],
          excerpt: "Arjun Mangla, Co-founder and CEO, Fulcrum, Jan 27, 2026: this week, we're announcing $25 million in combined Seed and Series A funding led by CRV, alongside South Park Commons, Foundation Capital, and a group of angels from both insurance and technology.",
          sourceUrl: FULCRUM_BLOG,
        },
      ],
    },
  ];
}

async function main() {
  const outPath = process.argv[2] || "/tmp/campus-founder-scan.json";
  const known = knownIndex();
  const yc = await scanYc(known);
  const speedrun = await scanSpeedrun(known);
  const csl2026 = parseCsl(await fetchText(CSL_2026), CSL_2026, "Columbia Startup Lab 2026-2027");
  const csl2025 = parseCsl(await fetchText(CSL_2025), CSL_2025, "Columbia Startup Lab 2025-2026");
  const winners = parseWinners(await fetchText(STARTUP_COLUMBIA));
  console.log(`Startup Columbia winners parsed ${winners.length}`);
  const columbia = [...winners, ...csl2026, ...csl2025].filter((company) => companyIsNew(known, company.name, company.website) || company.founders.some((f) => !known.people.has(normalizePersonName(f.name))));
  const companies = dedupeCompanies([...handCompanies(), ...yc, ...speedrun, ...columbia]);
  const counts: Record<string, number> = {};
  for (const company of companies) for (const campus of company.campusIds) counts[campus] = (counts[campus] ?? 0) + 1;
  const payload = { retrievedAt: new Date().toISOString(), companies, potential: [], links: [] };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify({ file: outPath, companies: companies.length, byCampus: counts, columbiaPages: columbia.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
