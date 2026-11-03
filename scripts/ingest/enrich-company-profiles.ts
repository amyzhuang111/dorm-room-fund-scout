// Fill company_facts from claims already stored, then from public YC and
// a16z Speedrun company pages, then from a company's own website.
//
// A fact is written only when the page states it. Batch year is not a
// founded year. YC's standard deal is not copied in as a raise. A founder's
// previous company raise is not this company's funding.
//
//   npx tsx scripts/ingest/enrich-company-profiles.ts

import * as cheerio from "cheerio";
import { getDb, newId, nowIso } from "../../lib/db/client";
import { isOfficialProductHost } from "../../lib/domain/company-link";

const SOURCE_ID = "src_company_profile";
const CONCURRENCY = 8;

type Origin = "existing_claim" | "stored_description" | "yc_page" | "speedrun_page" | "company_site" | "press";

interface Draft {
  projectId: string;
  factKey: string;
  valueText: string;
  amountUsd: number | null;
  amountStatus: "announced" | "undisclosed" | null;
  detail: Record<string, unknown>;
  sourceUrl: string;
  excerpt: string;
  origin: Origin;
}

interface CompanyRow {
  id: string;
  name: string;
  description: string | null;
  website_url: string | null;
  primary_link: string | null;
}

const SINGLETON = new Set(["description", "founded_year", "funding_total", "hq", "team_size", "website", "company_linkedin"]);

function twoSentences(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const parts = clean.split(/(?<=[.!?])\s+/).filter(Boolean);
  return parts.slice(0, 2).join(" ").slice(0, 420);
}

function usableDescription(text: string | null | undefined): string | null {
  if (!text) return null;
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length < 12) return null;
  if (/not yet researched|description not yet/i.test(trimmed)) return null;
  return twoSentences(trimmed);
}

function slugFrom(url: string | null | undefined, host: string): string | null {
  if (!url) return null;
  const match = url.match(new RegExp(`${host}/companies/([a-z0-9-]+)`, "i"));
  return match ? match[1].toLowerCase() : null;
}

function formatUsd(amount: number): string {
  if (amount >= 1_000_000_000) {
    const billions = amount / 1_000_000_000;
    return `$${Number.isInteger(billions) ? billions.toFixed(0) : billions.toFixed(1)}B`;
  }
  if (amount >= 1_000_000) {
    const millions = amount / 1_000_000;
    return `$${Number.isInteger(millions) ? millions.toFixed(0) : millions.toFixed(1)}M`;
  }
  if (amount >= 1_000) return `$${Math.round(amount / 1_000)}K`;
  return `$${Math.round(amount)}`;
}

function amountFrom(number: string, unit: string | undefined): number | null {
  const value = Number(number.replace(/,/g, ""));
  if (!Number.isFinite(value) || value <= 0) return null;
  const normalized = (unit ?? "").toLowerCase();
  if (normalized === "b" || normalized === "billion") return value * 1_000_000_000;
  if (normalized === "m" || normalized === "million") return value * 1_000_000;
  if (normalized === "k" || normalized === "thousand") return value * 1_000;
  if (value >= 1_000_000) return value;
  return null;
}

function titleStage(stage: string): string {
  const lower = stage.toLowerCase();
  if (lower === "pre-seed") return "Pre-seed";
  if (lower === "seed") return "Seed";
  return lower.replace(/\b\w/g, (char) => char.toUpperCase());
}

const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec";

function cleanLead(raw: string): string[] {
  return raw
    .replace(/\s+to\s+.*/i, "")
    .replace(/\([^)]*\)/g, "")
    .split(/\s+and\s+|,/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part.length > 1 && part.length < 40 && /^[A-Z]/.test(part));
}

function parseFunding(text: string, wide = false): { amountUsd: number; amountText: string; stage: string | null; leads: string[]; date: string | null; index: number; length: number } | null {
  if (/\b(prev|previous|previously|formerly|prior company|2x founders)\b/i.test(text)) return null;
  if (/\b(prize|award)\b/i.test(text) && !/\braised\b/i.test(text)) return null;
  const patterns = [
    /(?:raised(?:\s+an)?|backed by(?:\s+a)?|closes)\s+\$(\d+(?:\.\d+)?)\s*(million|billion|m|b|k)?(?:\s+in)?\s*(pre-seed|seed|series\s+[a-d])?/i,
    /\$(\d+(?:\.\d+)?)\s*(million|billion|m|b|k)?\s+(pre-seed|seed|series\s+[a-d])\s+round/i,
  ];
  let match: RegExpMatchArray | null = null;
  for (const pattern of patterns) {
    match = text.match(pattern);
    if (match?.[0].includes("$")) break;
    match = null;
  }
  if (!match || match.index == null) return null;
  const amountUsd = amountFrom(match[1], match[2]);
  if (amountUsd == null) return null;
  const window = text.slice(match.index, Math.min(text.length, match.index + (wide ? 1600 : 650)));
  let stage = match[3] ? titleStage(match[3]) : null;
  if (!stage) {
    const stageHit = window.match(/\b(pre-seed|seed|series\s+[a-d])\b/i);
    if (stageHit) stage = titleStage(stageHit[1]);
  }
  const leadHit = window.match(/(?:led|orchestrated) by ([A-Z][^.]{2,60})/);
  const dateSlice = text.slice(Math.max(0, match.index - (wide ? 220 : 40)), match.index + match[0].length);
  const dateHits = [...dateSlice.matchAll(new RegExp(`\\b(${MONTHS})\\.?\\s+(?:\\d{1,2},?\\s+)?(20\\d{2})\\b`, "gi"))];
  const dateHit = dateHits.at(-1);
  const month = dateHit ? (dateHit[1].toLowerCase().startsWith("jan") ? "January" : dateHit[1].replace(/\.$/, "")) : null;
  const date = month && dateHit ? `${month} ${dateHit[2]}` : null;
  return {
    amountUsd,
    amountText: formatUsd(amountUsd),
    stage,
    leads: leadHit ? cleanLead(leadHit[1]) : [],
    date,
    index: match.index,
    length: match[0].length,
  };
}

function batchFromText(text: string): string | null {
  const season = text.match(/\b(Winter|Spring|Summer|Fall)\s+(20\d{2})\b/);
  if (season) return `${season[1]} ${season[2]}`;
  const code = text.match(/\bYC\s+([WSXF])(\d{2})\b/i);
  if (!code) return null;
  const names: Record<string, string> = { W: "Winter", S: "Summer", X: "Spring", F: "Fall" };
  return `${names[code[1].toUpperCase()]} 20${code[2]}`;
}

function cohortFromText(text: string): string | null {
  const match = text.match(/\bSR\s*0*(\d+)\b/i);
  return match ? `SR${match[1].padStart(3, "0")}` : null;
}

function acceleratorFromSource(sourceName: string | null, sourceUrl: string): { name: string; kind: string } | null {
  const blob = `${sourceName ?? ""} ${sourceUrl}`.toLowerCase();
  if (blob.includes("ycombinator.com") || blob.includes("y combinator")) return { name: "Y Combinator", kind: "accelerator" };
  if (blob.includes("speedrun")) return { name: "a16z Speedrun", kind: "accelerator" };
  if (blob.includes("skydeck")) return { name: "Berkeley SkyDeck", kind: "accelerator" };
  if (blob.includes("delta v")) return { name: "MIT delta v", kind: "accelerator" };
  if (blob.includes("velocity")) return { name: "Velocity", kind: "accelerator" };
  if (blob.includes("vip-x")) return { name: "Venture Lab VIP-X", kind: "accelerator" };
  if (blob.includes("uc launch") || blob.includes("uclaunch")) return { name: "UC LAUNCH", kind: "accelerator" };
  if (blob.includes("free ventures") || blob.includes("freeventures")) return { name: "Free Ventures", kind: "accelerator" };
  return null;
}

function explicitBackers(text: string): { name: string; kind: string }[] {
  const found: { name: string; kind: string }[] = [];
  const add = (name: string, kind: string) => {
    const clean = name.replace(/\s+/g, " ").trim();
    if (!clean || found.some((item) => item.name.toLowerCase() === clean.toLowerCase())) return;
    found.push({ name: clean, kind });
  };
  if (/backed by Berkeley Skydeck Fund/i.test(text)) add("Berkeley SkyDeck Fund", "investor");
  if (/backed by Cardinal Ventures/i.test(text) || /^Cardinal Ventures \(recent team\)/i.test(text.trim())) add("Cardinal Ventures", "accelerator");
  const list = text.match(/backed by ([^.]+)/i);
  if (list && !/\$/.test(list[1]) && !/speedrun|skydeck fund|cardinal ventures/i.test(list[1])) {
    const blob = list[1].replace(/\s+and several other.*/i, "").replace(/\s+and\s+/gi, ", ");
    const parts = blob.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2 && parts.every((part) => part.length >= 2 && part.length <= 40 && !/\b(the|company|startup|round|is|dedicated)\b/i.test(part))) {
      for (const part of parts) add(part, "investor");
    }
  }
  return found;
}

function isCompetitionSource(sourceName: string | null): boolean {
  return /hack|devpost|winners|showcase|semifinalist|raising capital|innovation challenge|startup challenge/i.test(sourceName ?? "");
}

async function fetchText(url: string, timeoutMs = 12000): Promise<string> {
  const response = await fetch(url, {
    headers: { "user-agent": "campus-universe-research-bot/0.1 (company profile)", accept: "text/html" },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function mapPool<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: n }, () => worker()));
}

function pageText(html: string): string {
  const $ = cheerio.load(html);
  $("script,style,noscript,svg").remove();
  return $("body").text().replace(/\s+/g, " ").trim();
}

function around(text: string, index: number, length: number): string {
  return text.slice(Math.max(0, index - 90), Math.min(text.length, index + length + 90)).replace(/\s+/g, " ").trim();
}

async function main() {
  const db = getDb();
  const retrievedAt = nowIso();
  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at, last_success_at)
     VALUES (?, 'Company profile pages', 'reference', 'https://www.ycombinator.com/companies', '[]', 3, 'html_scrape', 'available', ?, ?)
     ON CONFLICT(id) DO UPDATE SET last_success_at=excluded.last_success_at, last_attempt_at=excluded.last_attempt_at, status='available'`
  ).run(SOURCE_ID, retrievedAt, retrievedAt);

  const companies = db
    .prepare(
      `SELECT id, name, description, website_url, primary_link FROM projects
       WHERE kind='company' AND is_investable_candidate=1`
    )
    .all() as CompanyRow[];

  const penn = new Set(
    (
      db
        .prepare(
          `SELECT DISTINCT ppr.project_id AS id FROM person_project_roles ppr
           JOIN affiliations a ON a.person_id = ppr.person_id
           WHERE ppr.role LIKE '%founder%' AND a.university_id = 'univ_penn'
           UNION
           SELECT source_entity_id FROM relationships
           WHERE relationship_type = 'affiliated_with' AND target_entity_id = 'univ_penn' AND source_entity_type = 'project'`
        )
        .all() as { id: string }[]
    ).map((row) => row.id)
  );
  const berkeley = new Set(
    (
      db
        .prepare(
          `SELECT DISTINCT ppr.project_id AS id FROM person_project_roles ppr
           JOIN affiliations a ON a.person_id = ppr.person_id
           WHERE ppr.role LIKE '%founder%' AND a.university_id = 'univ_berkeley'
           UNION
           SELECT source_entity_id FROM relationships
           WHERE relationship_type = 'affiliated_with' AND target_entity_id = 'univ_berkeley' AND source_entity_type = 'project'`
        )
        .all() as { id: string }[]
    ).map((row) => row.id)
  );

  const facts = new Map<string, Draft>();
  const singletons = new Set<string>();

  function put(draft: Draft) {
    if (!draft.sourceUrl.startsWith("http") || draft.excerpt.trim().length < 8) return;
    if (SINGLETON.has(draft.factKey)) {
      const key = `${draft.projectId}|${draft.factKey}`;
      if (singletons.has(key)) return;
      singletons.add(key);
      facts.set(key, draft);
      return;
    }
    const key = `${draft.projectId}|${draft.factKey}|${draft.valueText.toLowerCase()}`;
    const previous = facts.get(key);
    if (!previous) {
      facts.set(key, draft);
      return;
    }
    const previousBatch = previous.detail.batch;
    const nextBatch = draft.detail.batch;
    const previousLeads = Array.isArray(previous.detail.leads) ? previous.detail.leads.length : 0;
    const nextLeads = Array.isArray(draft.detail.leads) ? draft.detail.leads.length : 0;
    if ((!previousBatch && nextBatch) || (previousLeads === 0 && nextLeads > 0) || (!previous.detail.date && draft.detail.date)) {
      facts.set(key, draft);
    }
  }

  function recordRaise(projectId: string, raise: NonNullable<ReturnType<typeof parseFunding>>, sourceUrl: string, excerpt: string, origin: Origin) {
    if (raise.stage) {
      const totalKey = `${projectId}|funding_total`;
      const existingTotal = facts.get(totalKey);
      if (existingTotal && existingTotal.amountUsd === raise.amountUsd) {
        facts.delete(totalKey);
        singletons.delete(totalKey);
      }
      put({
        projectId,
        factKey: "funding_round",
        valueText: `${raise.stage}|${raise.amountText}`,
        amountUsd: raise.amountUsd,
        amountStatus: "announced",
        detail: { stage: raise.stage, amountText: raise.amountText, date: raise.date, leads: raise.leads },
        sourceUrl,
        excerpt,
        origin,
      });
    } else {
      put({
        projectId,
        factKey: "funding_total",
        valueText: `${raise.amountText} announced`,
        amountUsd: raise.amountUsd,
        amountStatus: "announced",
        detail: {},
        sourceUrl,
        excerpt,
        origin,
      });
    }
    for (const lead of raise.leads) {
      put({
        projectId,
        factKey: "investor",
        valueText: lead,
        amountUsd: null,
        amountStatus: null,
        detail: { batch: null, round: raise.stage, kind: "lead" },
        sourceUrl,
        excerpt,
        origin,
      });
    }
  }

  for (const company of companies) {
    const description = usableDescription(company.description);
    if (description && (company.website_url?.startsWith("http") || company.primary_link?.startsWith("http"))) {
      put({
        projectId: company.id,
        factKey: "description",
        valueText: description,
        amountUsd: null,
        amountStatus: null,
        detail: {},
        sourceUrl: (company.primary_link || company.website_url) as string,
        excerpt: description,
        origin: "stored_description",
      });
    }
    if (company.website_url && isOfficialProductHost(company.website_url)) {
      put({
        projectId: company.id,
        factKey: "website",
        valueText: company.website_url,
        amountUsd: null,
        amountStatus: null,
        detail: {},
        sourceUrl: company.website_url,
        excerpt: `Stored company website: ${company.website_url}`,
        origin: "stored_description",
      });
    }
  }

  const claims = db
    .prepare(
      `SELECT c.entity_id, c.excerpt, c.source_url, c.value_json, s.name AS source_name
       FROM claims c LEFT JOIN sources s ON s.id = c.source_id
       WHERE c.entity_type = 'project' AND c.source_url LIKE 'http%'`
    )
    .all() as { entity_id: string; excerpt: string; source_url: string; value_json: string; source_name: string | null }[];

  const companyIds = new Set(companies.map((company) => company.id));
  let existingRaises = 0;
  let existingInvestors = 0;

  for (const claim of claims) {
    if (!companyIds.has(claim.entity_id)) continue;
    let tags: string[] = [];
    try {
      const parsed = JSON.parse(claim.value_json || "{}") as { tags?: unknown };
      if (Array.isArray(parsed.tags)) tags = parsed.tags.filter((tag): tag is string => typeof tag === "string");
    } catch {
      tags = [];
    }
    const tagBlob = tags.join(", ");
    const text = `${claim.excerpt} ${tagBlob}`;

    const raise = parseFunding(text);
    if (raise) {
      const excerpt = /raised\s+\$|backed by|series\s+[a-d]|seed round/i.test(claim.excerpt) ? claim.excerpt : `${claim.excerpt} Tag: ${tagBlob}.`;
      recordRaise(claim.entity_id, raise, claim.source_url, excerpt.slice(0, 400), "existing_claim");
      existingRaises += 1;
    }

    if (/\bundisclosed\b/i.test(text) && /\b(raised|funding|round|seed|series)\b/i.test(text) && !/\b(prev|previous|previously)\b/i.test(text)) {
      put({
        projectId: claim.entity_id,
        factKey: "funding_total",
        valueText: "Undisclosed",
        amountUsd: null,
        amountStatus: "undisclosed",
        detail: {},
        sourceUrl: claim.source_url,
        excerpt: claim.excerpt.slice(0, 400),
        origin: "existing_claim",
      });
    }

    const named = acceleratorFromSource(claim.source_name, claim.source_url);
    const tagNamesYc = tags.some((tag) => /y combinator|^yc\b/i.test(tag));
    const competition = isCompetitionSource(claim.source_name) && !/vip-x/i.test(claim.source_name ?? "");
    if (!competition && (named || tagNamesYc)) {
      const accelerator = named ?? { name: "Y Combinator", kind: "accelerator" };
      const batch = accelerator.name === "Y Combinator" ? batchFromText(text) : accelerator.name === "a16z Speedrun" ? cohortFromText(text) : null;
      const excerpt = batch && !claim.excerpt.includes(batch) && tagBlob ? `${claim.excerpt} ${tagBlob}.`.slice(0, 400) : claim.excerpt.slice(0, 400);
      put({
        projectId: claim.entity_id,
        factKey: "investor",
        valueText: accelerator.name,
        amountUsd: null,
        amountStatus: null,
        detail: { batch, round: null, kind: accelerator.kind },
        sourceUrl: claim.source_url,
        excerpt,
        origin: "existing_claim",
      });
      existingInvestors += 1;
    }

    if (!/\b(prev|previous|previously|formerly)\b/i.test(claim.excerpt)) {
      for (const backer of explicitBackers(claim.excerpt)) {
        put({
          projectId: claim.entity_id,
          factKey: "investor",
          valueText: backer.name,
          amountUsd: null,
          amountStatus: null,
          detail: { batch: null, round: null, kind: backer.kind },
          sourceUrl: claim.source_url,
          excerpt: claim.excerpt.slice(0, 400),
          origin: "existing_claim",
        });
        existingInvestors += 1;
      }
    }

    const description = usableDescription(claim.excerpt);
    if (description && claim.excerpt.length < 280 && !/bio \/ named in text|does not establish/i.test(claim.excerpt)) {
      const company = companies.find((item) => item.id === claim.entity_id);
      if (company && !usableDescription(company.description)) {
        put({
          projectId: claim.entity_id,
          factKey: "description",
          valueText: description,
          amountUsd: null,
          amountStatus: null,
          detail: {},
          sourceUrl: claim.source_url,
          excerpt: description,
          origin: "existing_claim",
        });
      }
    }
  }

  const personRaises = db
    .prepare(
      `SELECT c.entity_id, c.excerpt, c.source_url FROM claims c
       WHERE c.entity_type = 'person' AND c.excerpt LIKE '%raised $%'`
    )
    .all() as { entity_id: string; excerpt: string; source_url: string }[];
  const founderCompanies = db
    .prepare(
      `SELECT ppr.person_id, p.id, p.name FROM person_project_roles ppr
       JOIN projects p ON p.id = ppr.project_id
       WHERE p.kind = 'company' AND ppr.role LIKE '%founder%'`
    )
    .all() as { person_id: string; id: string; name: string }[];
  for (const claim of personRaises) {
    const named = claim.excerpt.match(/([A-Z][\w.&'-]*) raised \$/);
    if (!named) continue;
    const company = founderCompanies.find((row) => row.person_id === claim.entity_id && row.name.toLowerCase() === named[1].toLowerCase());
    if (!company) continue;
    const raise = parseFunding(claim.excerpt);
    if (!raise) continue;
    recordRaise(company.id, raise, claim.source_url, claim.excerpt.slice(0, 400), "existing_claim");
    existingRaises += 1;
  }

  const sequoiaRows = companies.filter((company) => `${company.website_url ?? ""} ${company.primary_link ?? ""}`.includes("sequoiacap.com/companies/"));
  for (const company of sequoiaRows) {
    const pageUrl = (company.primary_link || company.website_url) as string;
    try {
      const html = await fetchText(pageUrl);
      const founded = html.match(/Founded\s*((?:19|20)\d{2})/i);
      if (founded) {
        put({
          projectId: company.id,
          factKey: "founded_year",
          valueText: founded[1],
          amountUsd: null,
          amountStatus: null,
          detail: {},
          sourceUrl: pageUrl,
          excerpt: `Founded ${founded[1]}`,
          origin: "press",
        });
      }
      const $ = cheerio.load(html);
      const links = $("a[href]")
        .map((_, el) => $(el).attr("href") ?? "")
        .get()
        .filter((href) => href.startsWith("http") && isOfficialProductHost(href) && !/sequoia|linkedin|twitter|facebook|instagram/i.test(href));
      const slug = company.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      const own = links.find((href) => {
        try {
          return new URL(href).hostname.replace(/^www\./, "").includes(slug);
        } catch {
          return false;
        }
      });
      if (own) {
        put({
          projectId: company.id,
          factKey: "website",
          valueText: own,
          amountUsd: null,
          amountStatus: null,
          detail: {},
          sourceUrl: pageUrl,
          excerpt: `Website listed on the investor page: ${own}`,
          origin: "press",
        });
        if (!isOfficialProductHost(company.website_url ?? "")) {
          db.prepare(`UPDATE projects SET website_url = ?, updated_at = ? WHERE id = ?`).run(own, retrievedAt, company.id);
          company.website_url = own;
        }
      }
    } catch (error) {
      console.log("sequoia fetch failed", pageUrl, error instanceof Error ? error.message : error);
    }
  }

  const pressRows = db
    .prepare(
      `SELECT DISTINCT entity_id, source_url FROM claims
       WHERE entity_type = 'project' AND source_url LIKE '%thedp.com/article%' AND excerpt LIKE '%raised%'`
    )
    .all() as { entity_id: string; source_url: string }[];
  for (const row of pressRows) {
    if (!companyIds.has(row.entity_id)) continue;
    try {
      const text = pageText(await fetchText(row.source_url));
      const raise = parseFunding(text, true);
      if (raise) recordRaise(row.entity_id, raise, row.source_url, around(text, raise.index, raise.length), "press");
      const foundedHits = [...text.matchAll(/\bfounded\s+(?:in\s+)?((?:19|20)\d{2})\b/gi)];
      if (foundedHits.length === 1) {
        const year = Number(foundedHits[0][1]);
        if (year >= 1990 && year <= 2026) {
          put({
            projectId: row.entity_id,
            factKey: "founded_year",
            valueText: String(year),
            amountUsd: null,
            amountStatus: null,
            detail: {},
            sourceUrl: row.source_url,
            excerpt: around(text, foundedHits[0].index ?? 0, foundedHits[0][0].length),
            origin: "press",
          });
        }
      }
      const basedHits = [...text.matchAll(/\b((?:[A-Z][a-z]+\s+){0,2}[A-Z][a-z]+)-based\b/g)]
        .map((hit) => ({
          place: hit[1]
            .split(/\s+/)
            .filter((word) => !/^(Their|The|This|Our|Its|A|An)$/.test(word))
            .join(" "),
          index: hit.index ?? 0,
          length: hit[0].length,
        }))
        .filter((hit) => hit.place.length > 1);
      if (basedHits.length === 1) {
        put({
          projectId: row.entity_id,
          factKey: "hq",
          valueText: basedHits[0].place,
          amountUsd: null,
          amountStatus: null,
          detail: {},
          sourceUrl: row.source_url,
          excerpt: around(text, basedHits[0].index, basedHits[0].length),
          origin: "press",
        });
      }
    } catch (error) {
      console.log("press fetch failed", row.source_url, error instanceof Error ? error.message : error);
    }
  }

  console.log(`Existing claims: ${existingRaises} raise phrases, ${existingInvestors} accelerator rows considered.`);

  const ycTargets: { projectId: string; slug: string }[] = [];
  const speedTargets: { projectId: string; slug: string }[] = [];
  const seenSlug = new Set<string>();
  for (const company of companies) {
    const urls = [company.primary_link, company.website_url];
    for (const claim of claims) {
      if (claim.entity_id === company.id) urls.push(claim.source_url);
    }
    for (const url of urls) {
      const yc = slugFrom(url, "ycombinator\\.com");
      if (yc && !seenSlug.has(`yc:${company.id}`)) {
        seenSlug.add(`yc:${company.id}`);
        ycTargets.push({ projectId: company.id, slug: yc });
      }
      const speed = slugFrom(url, "speedrun\\.a16z\\.com");
      if (speed && !seenSlug.has(`sr:${company.id}`)) {
        seenSlug.add(`sr:${company.id}`);
        speedTargets.push({ projectId: company.id, slug: speed });
      }
    }
  }

  const byId = new Map(companies.map((company) => [company.id, company]));
  let ycOk = 0;
  let speedOk = 0;
  let ycFail = 0;
  let speedFail = 0;

  console.log(`Fetching ${ycTargets.length} YC pages and ${speedTargets.length} Speedrun pages.`);

  await mapPool(ycTargets, CONCURRENCY, async (target) => {
    try {
      const html = await fetchText(`https://www.ycombinator.com/companies/${target.slug}`);
      const raw = cheerio.load(html)("[data-page]").attr("data-page");
      if (!raw) throw new Error("no data-page");
      const data = JSON.parse(raw) as { props?: { company?: Record<string, unknown> } };
      const co = data.props?.company;
      if (!co) throw new Error("no company");
      const pageUrl = `https://www.ycombinator.com/companies/${target.slug}`;
      const year = typeof co.year_founded === "number" ? co.year_founded : null;
      const team = typeof co.team_size === "number" ? co.team_size : null;
      const location = typeof co.location === "string" ? co.location.trim() : "";
      const batch = typeof co.batch_name === "string" ? co.batch_name.trim() : "";
      const oneLiner = typeof co.one_liner === "string" ? co.one_liner : "";
      const longDescription = typeof co.long_description === "string" ? co.long_description : "";
      const website = typeof co.website === "string" ? co.website : "";
      const linkedin = typeof co.linkedin_url === "string" ? co.linkedin_url : "";
      if (year && year >= 1990 && year <= 2026) {
        put({
          projectId: target.projectId,
          factKey: "founded_year",
          valueText: String(year),
          amountUsd: null,
          amountStatus: null,
          detail: {},
          sourceUrl: pageUrl,
          excerpt: `Founded: ${year}`,
          origin: "yc_page",
        });
      }
      if (team && team > 0 && team < 5000) {
        put({
          projectId: target.projectId,
          factKey: "team_size",
          valueText: String(team),
          amountUsd: null,
          amountStatus: null,
          detail: {},
          sourceUrl: pageUrl,
          excerpt: `Team size: ${team}`,
          origin: "yc_page",
        });
      }
      if (location) {
        put({
          projectId: target.projectId,
          factKey: "hq",
          valueText: location,
          amountUsd: null,
          amountStatus: null,
          detail: {},
          sourceUrl: pageUrl,
          excerpt: `Location: ${location}`,
          origin: "yc_page",
        });
      }
      if (batch) {
        put({
          projectId: target.projectId,
          factKey: "investor",
          valueText: "Y Combinator",
          amountUsd: null,
          amountStatus: null,
          detail: { batch, round: null, kind: "accelerator" },
          sourceUrl: pageUrl,
          excerpt: `Batch: ${batch}`,
          origin: "yc_page",
        });
      }
      const description = usableDescription(oneLiner);
      if (description) {
        put({
          projectId: target.projectId,
          factKey: "description",
          valueText: description,
          amountUsd: null,
          amountStatus: null,
          detail: {},
          sourceUrl: pageUrl,
          excerpt: description,
          origin: "yc_page",
        });
      }
      const ycRaise = parseFunding(longDescription);
      if (ycRaise && (longDescription.match(/(?:raised|backed by)\s+\$/gi) ?? []).length === 1) {
        recordRaise(target.projectId, ycRaise, pageUrl, around(longDescription, ycRaise.index, ycRaise.length), "yc_page");
      }
      if (website.startsWith("http") && isOfficialProductHost(website)) {
        put({
          projectId: target.projectId,
          factKey: "website",
          valueText: website,
          amountUsd: null,
          amountStatus: null,
          detail: {},
          sourceUrl: pageUrl,
          excerpt: `Website: ${website}`,
          origin: "yc_page",
        });
        const current = byId.get(target.projectId);
        if (current && !current.website_url) {
          db.prepare(`UPDATE projects SET website_url = ?, updated_at = ? WHERE id = ? AND (website_url IS NULL OR website_url = '')`).run(website, retrievedAt, target.projectId);
          current.website_url = website;
        }
      }
      if (linkedin.includes("linkedin.com/company/")) {
        put({
          projectId: target.projectId,
          factKey: "company_linkedin",
          valueText: linkedin,
          amountUsd: null,
          amountStatus: null,
          detail: {},
          sourceUrl: pageUrl,
          excerpt: `LinkedIn: ${linkedin}`,
          origin: "yc_page",
        });
      }
      ycOk += 1;
    } catch {
      ycFail += 1;
    }
  });
  console.log(`YC pages read ${ycOk}, failed ${ycFail}.`);

  await mapPool(speedTargets, CONCURRENCY, async (target) => {
    try {
      const html = await fetchText(`https://speedrun.a16z.com/companies/${target.slug}`);
      const match = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/);
      if (!match) throw new Error("no next data");
      const data = JSON.parse(match[1]) as { props?: { pageProps?: { company?: Record<string, unknown> } } };
      const co = data.props?.pageProps?.company;
      if (!co || typeof co.name !== "string") throw new Error("no company");
      const pageUrl = `https://speedrun.a16z.com/companies/${target.slug}`;
      const year = typeof co.founded_year === "number" ? co.founded_year : null;
      const team = typeof co.team_size === "number" ? co.team_size : null;
      const city = typeof co.city === "string" ? co.city.trim() : "";
      const state = typeof co.state === "string" ? co.state.trim() : "";
      const cohort = typeof co.cohort === "string" ? co.cohort.trim() : "";
      const preamble = typeof co.preamble === "string" ? co.preamble : "";
      const website = typeof co.website_url === "string" ? co.website_url : "";
      const linkedin = typeof co.linkedin_url === "string" ? co.linkedin_url : "";
      const place = [city, state].filter(Boolean).join(", ");
      if (year && year >= 1990 && year <= 2026) {
        put({
          projectId: target.projectId,
          factKey: "founded_year",
          valueText: String(year),
          amountUsd: null,
          amountStatus: null,
          detail: {},
          sourceUrl: pageUrl,
          excerpt: `Founded ${year}`,
          origin: "speedrun_page",
        });
      }
      if (team && team > 0 && team < 5000) {
        put({
          projectId: target.projectId,
          factKey: "team_size",
          valueText: String(team),
          amountUsd: null,
          amountStatus: null,
          detail: {},
          sourceUrl: pageUrl,
          excerpt: `${team} Employees`,
          origin: "speedrun_page",
        });
      }
      if (place) {
        put({
          projectId: target.projectId,
          factKey: "hq",
          valueText: place,
          amountUsd: null,
          amountStatus: null,
          detail: {},
          sourceUrl: pageUrl,
          excerpt: `Located in ${place}`,
          origin: "speedrun_page",
        });
      }
      put({
        projectId: target.projectId,
        factKey: "investor",
        valueText: "a16z Speedrun",
        amountUsd: null,
        amountStatus: null,
        detail: { batch: cohort || null, round: null, kind: "accelerator" },
        sourceUrl: pageUrl,
        excerpt: cohort ? `COHORT ${cohort}` : "a16z Speedrun company page",
        origin: "speedrun_page",
      });
      const description = usableDescription(preamble) || usableDescription(typeof co.description === "string" ? co.description : null);
      if (description) {
        put({
          projectId: target.projectId,
          factKey: "description",
          valueText: description,
          amountUsd: null,
          amountStatus: null,
          detail: {},
          sourceUrl: pageUrl,
          excerpt: description,
          origin: "speedrun_page",
        });
      }
      if (website.startsWith("http") && isOfficialProductHost(website)) {
        put({
          projectId: target.projectId,
          factKey: "website",
          valueText: website,
          amountUsd: null,
          amountStatus: null,
          detail: {},
          sourceUrl: pageUrl,
          excerpt: `Website: ${website}`,
          origin: "speedrun_page",
        });
        const current = byId.get(target.projectId);
        if (current && !current.website_url) {
          db.prepare(`UPDATE projects SET website_url = ?, updated_at = ? WHERE id = ? AND (website_url IS NULL OR website_url = '')`).run(website, retrievedAt, target.projectId);
          current.website_url = website;
        }
      }
      if (linkedin.includes("linkedin.com/company/")) {
        put({
          projectId: target.projectId,
          factKey: "company_linkedin",
          valueText: linkedin,
          amountUsd: null,
          amountStatus: null,
          detail: {},
          sourceUrl: pageUrl,
          excerpt: `LinkedIn: ${linkedin}`,
          origin: "speedrun_page",
        });
      }
      speedOk += 1;
    } catch {
      speedFail += 1;
    }
  });
  console.log(`Speedrun pages read ${speedOk}, failed ${speedFail}.`);

  const siteTargets = companies
    .filter((company) => company.website_url && isOfficialProductHost(company.website_url))
    .map((company) => ({
      company,
      rank: penn.has(company.id) ? 0 : berkeley.has(company.id) ? 1 : 2,
      needsFounded: !singletons.has(`${company.id}|founded_year`),
      needsFunding: !singletons.has(`${company.id}|funding_total`) && ![...facts.keys()].some((key) => key.startsWith(`${company.id}|funding_round|`)),
    }))
    .filter((item) => item.needsFounded || item.needsFunding)
    .sort((a, b) => a.rank - b.rank || a.company.name.localeCompare(b.company.name));

  const pennSites = siteTargets.filter((item) => item.rank === 0);
  const berkeleySites = siteTargets.filter((item) => item.rank === 1);
  const restSites = siteTargets.filter((item) => item.rank === 2).slice(0, 220);
  const toFetch = [...pennSites, ...berkeleySites, ...restSites];
  console.log(`Reading ${toFetch.length} company sites (Penn ${pennSites.length}, Berkeley ${berkeleySites.length}, other ${restSites.length}).`);

  let siteFacts = 0;
  let siteFail = 0;
  await mapPool(toFetch, CONCURRENCY, async (item) => {
    const url = item.company.website_url as string;
    try {
      const text = pageText(await fetchText(url, 7000));
      if (text.length < 40) return;
      if (item.needsFounded) {
        const hits = text.match(/\bfounded(?:\s+in|:)\s+(?:19|20)\d{2}\b/gi) ?? [];
        if (hits.length === 1) {
          const match = text.match(/\bfounded(?:\s+in|:)\s+((?:19|20)\d{2})\b/i);
          if (match) {
            const year = Number(match[1]);
            if (year >= 1990 && year <= 2026) {
              put({
                projectId: item.company.id,
                factKey: "founded_year",
                valueText: String(year),
                amountUsd: null,
                amountStatus: null,
                detail: {},
                sourceUrl: url,
                excerpt: around(text, match.index ?? 0, match[0].length),
                origin: "company_site",
              });
              siteFacts += 1;
            }
          }
        }
      }
      if (item.needsFunding) {
        const raise = parseFunding(text);
        const occurrences = text.match(/(?:raised(?:\s+an)?|backed by(?:\s+a)?)\s+\$\d/gi) ?? [];
        if (raise && occurrences.length === 1) {
          recordRaise(item.company.id, raise, url, around(text, raise.index, raise.length), "company_site");
          siteFacts += 1;
        }
      }
    } catch {
      siteFail += 1;
    }
  });
  console.log(`Company sites added ${siteFacts} facts, ${siteFail} fetches failed.`);

  const insert = db.prepare(
    `INSERT INTO company_facts (id, project_id, fact_key, value_text, amount_usd, amount_status, detail_json, source_url, excerpt, origin, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertClaim = db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, source_url, retrieved_at, label, verification_state)
     VALUES (?, 'project', ?, 'company_fact', ?, ?, ?, ?, ?, 'observed_fact', 'corroborated')`
  );

  const write = db.transaction(() => {
    db.prepare(`DELETE FROM company_facts`).run();
    db.prepare(`DELETE FROM claims WHERE claim_type = 'company_fact' AND source_id = ?`).run(SOURCE_ID);
    for (const draft of facts.values()) {
      insert.run(
        newId("fact"),
        draft.projectId,
        draft.factKey,
        draft.valueText,
        draft.amountUsd,
        draft.amountStatus,
        JSON.stringify(draft.detail),
        draft.sourceUrl,
        draft.excerpt.slice(0, 500),
        draft.origin,
        retrievedAt
      );
      if (draft.origin !== "stored_description" && draft.origin !== "existing_claim") {
        insertClaim.run(
          newId("claim"),
          draft.projectId,
          JSON.stringify({ fact_key: draft.factKey, value: draft.valueText, origin: draft.origin }),
          draft.excerpt.slice(0, 500),
          SOURCE_ID,
          draft.sourceUrl,
          retrievedAt
        );
      }
    }
  });
  write();
  db.pragma("wal_checkpoint(TRUNCATE)");

  const summary = db
    .prepare(
      `SELECT fact_key, origin, COUNT(DISTINCT project_id) AS n
       FROM company_facts
       GROUP BY fact_key, origin
       ORDER BY fact_key, origin`
    )
    .all();
  console.log(JSON.stringify(summary, null, 2));
  const coverage = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM projects WHERE kind='company' AND is_investable_candidate=1) AS companies,
         (SELECT COUNT(DISTINCT project_id) FROM company_facts WHERE fact_key='description') AS description,
         (SELECT COUNT(DISTINCT project_id) FROM company_facts WHERE fact_key='founded_year') AS founded,
         (SELECT COUNT(DISTINCT project_id) FROM company_facts WHERE fact_key IN ('funding_total','funding_round')) AS funding,
         (SELECT COUNT(DISTINCT project_id) FROM company_facts WHERE fact_key='investor') AS investors`
    )
    .get();
  console.log(JSON.stringify(coverage, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
