/**
 * Incremental company_facts backfill for investable companies.
 * Only fills blank fields from public pages. Never guesses. Never deletes existing facts.
 *
 *   npx tsx scripts/ingest/backfill-company-facts-2026-11-03.ts
 *   LIMIT=100 npx tsx scripts/ingest/backfill-company-facts-2026-11-03.ts
 */
import * as cheerio from "cheerio";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { getDb, newId, nowIso } from "../../lib/db/client";
import { classifyDescription, isBoilerplateDescription, primaryTag } from "../../lib/domain/sectors";

const SOURCE_ID = "src_company_backfill_2026_11_03";
const CONCURRENCY = Number(process.env.CONCURRENCY || 6);
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : Infinity;
const CACHE = path.join("/tmp/backfill-2026-11-03/html");
const REPORT = path.join("/tmp/backfill-2026-11-03/company-backfill-report.json");
const UA =
  "Mozilla/5.0 (compatible; CampusScoutBackfill/1.0; +https://github.com/amyzhuang111/dorm-room-fund-scout)";

type Origin = "yc_page" | "company_site" | "press" | "accelerator_page" | "existing_claim";

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

const DIRECTORY_HOSTS = new Set([
  "ycombinator.com",
  "www.ycombinator.com",
  "linkedin.com",
  "www.linkedin.com",
  "crunchbase.com",
  "www.crunchbase.com",
  "techcrunch.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "github.com",
  "devpost.com",
  "producthunt.com",
  "wellfound.com",
  "angel.co",
  "medium.com",
  "substack.com",
  "luma.com",
  "pitchbook.com",
]);

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function cachePath(url: string) {
  const h = createHash("sha1").update(url).digest("hex");
  return path.join(CACHE, `${h}.html`);
}

async function fetchHtml(url: string): Promise<string | null> {
  fs.mkdirSync(CACHE, { recursive: true });
  const cached = cachePath(url);
  if (fs.existsSync(cached)) {
    const age = Date.now() - fs.statSync(cached).mtimeMs;
    if (age < 6 * 3600_000) return fs.readFileSync(cached, "utf8");
  }
  try {
    await sleep(120 + Math.random() * 180);
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(14000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length > 50) fs.writeFileSync(cached, text);
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

function around(text: string, index: number, length: number) {
  return text.slice(Math.max(0, index - 90), Math.min(text.length, index + length + 90)).replace(/\s+/g, " ").trim();
}

function formatUsd(amount: number): string {
  if (amount >= 1_000_000_000) {
    const b = amount / 1_000_000_000;
    return `$${Number.isInteger(b) ? b.toFixed(0) : b.toFixed(1)}B`;
  }
  if (amount >= 1_000_000) {
    const m = amount / 1_000_000;
    return `$${Number.isInteger(m) ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (amount >= 1_000) return `$${Math.round(amount / 1_000)}K`;
  return `$${Math.round(amount)}`;
}

function amountFrom(number: string, unit: string | undefined): number | null {
  const value = Number(number.replace(/,/g, ""));
  if (!Number.isFinite(value) || value <= 0) return null;
  const u = (unit ?? "").toLowerCase();
  if (u === "b" || u === "billion") return value * 1_000_000_000;
  if (u === "m" || u === "million") return value * 1_000_000;
  if (u === "k" || u === "thousand") return value * 1_000;
  if (value >= 1_000_000) return value;
  return null;
}

function titleStage(stage: string): string {
  const lower = stage.toLowerCase().replace(/\s+/g, " ").trim();
  if (lower === "pre-seed" || lower === "preseed") return "Pre-seed";
  if (lower === "seed") return "Seed";
  if (lower === "series a") return "Series A";
  if (lower === "series b") return "Series B";
  if (lower === "series c") return "Series C";
  if (lower === "accelerator") return "Accelerator";
  return lower.replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseFunding(text: string) {
  if (/\b(prev|previous|previously|formerly|prior company|2x founders)\b/i.test(text)) return null;
  if (/\b(prize|award)\b/i.test(text) && !/\braised\b/i.test(text)) return null;
  const patterns = [
    /(?:raised(?:\s+an)?|backed by(?:\s+a)?|closes(?:d)?|secured)\s+\$(\d+(?:\.\d+)?)\s*(million|billion|m|b|k)?(?:\s+in)?\s*(pre-?seed|seed|series\s+[a-d])?/i,
    /\$(\d+(?:\.\d+)?)\s*(million|billion|m|b|k)?\s+(pre-?seed|seed|series\s+[a-d])\s+round/i,
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
  const window = text.slice(match.index, Math.min(text.length, match.index + 650));
  let stage = match[3] ? titleStage(match[3]) : null;
  if (!stage) {
    const stageHit = window.match(/\b(pre-?seed|seed|series\s+[a-d])\b/i);
    if (stageHit) stage = titleStage(stageHit[1]);
  }
  return { amountUsd, amountText: formatUsd(amountUsd), stage, index: match.index, length: match[0].length };
}

function parseFoundedYear(text: string): { year: number; index: number; length: number } | null {
  const patterns = [
    /\b(?:founded|launched|started|established)\s+(?:in\s+)?(20(?:1\d|2\d))\b/i,
    /\bsince\s+(20(?:1\d|2\d))\b/i,
    /\b(?:founded|incepted)\s*[:\-]?\s*(20(?:1\d|2\d))\b/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (!m || m.index == null) continue;
    const year = Number(m[1]);
    if (year >= 2015 && year <= 2026) return { year, index: m.index, length: m[0].length };
  }
  return null;
}

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function isCompanySite(url: string | null | undefined): boolean {
  const host = hostOf(url);
  if (!host) return false;
  if (DIRECTORY_HOSTS.has(host) || DIRECTORY_HOSTS.has(`www.${host}`)) return false;
  if (host.endsWith("ycombinator.com")) return false;
  if (host.includes("linkedin.com")) return false;
  return true;
}

function ycSlug(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/ycombinator\.com\/companies\/([a-z0-9-]+)/i);
  return m ? m[1].toLowerCase() : null;
}

type YcCompany = { long_description?: string; one_liner?: string; name?: string; website?: string; year_founded?: number | string; founded?: number | string; batch?: string; batch_name?: string; tags?: unknown[]; founders?: { name?: string; full_name?: string }[] };
function extractInertiaCompany(html: string): YcCompany | null {
  const m = html.match(/data-page="([^"]+)"/);
  if (!m) return null;
  try {
    const decoded = cheerio.load(`<div id="x">${m[1]}</div>`)("#x").text();
    const page = JSON.parse(decoded.replace(/&quot;/g, '"'));
    return page?.props?.company ?? null;
  } catch {
    try {
      const page = JSON.parse(m[1].replace(/&quot;/g, '"'));
      return page?.props?.company ?? null;
    } catch {
      return null;
    }
  }
}

function normalizeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function namesMatch(a: string, b: string) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const ta = new Set(na.split(" ").filter((t) => t.length > 2));
  const tb = nb.split(" ").filter((t) => t.length > 2);
  if (!tb.length) return false;
  const hit = tb.filter((t) => ta.has(t)).length;
  return hit >= Math.min(2, tb.length);
}

async function main() {
  fs.mkdirSync(CACHE, { recursive: true });
  const db = getDb();
  const retrievedAt = nowIso();
  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at, last_success_at)
     VALUES (?, 'Company fact backfill 2026-11-03', 'reference', 'https://www.ycombinator.com/companies', '[]', 3, 'html_scrape', 'available', ?, ?)
     ON CONFLICT(id) DO UPDATE SET last_success_at=excluded.last_success_at, last_attempt_at=excluded.last_attempt_at, status='available'`
  ).run(SOURCE_ID, retrievedAt, retrievedAt);

  const companies = db
    .prepare(
      `SELECT id, name, description, website_url, primary_link, sector
       FROM projects WHERE kind='company' AND is_investable_candidate=1 ORDER BY name`
    )
    .all() as {
    id: string;
    name: string;
    description: string | null;
    website_url: string | null;
    primary_link: string | null;
    sector: string | null;
  }[];

  const existing = new Map<string, Set<string>>();
  const stageBy = new Set<string>();
  for (const row of db
    .prepare(`SELECT project_id, fact_key, detail_json FROM company_facts`)
    .all() as { project_id: string; fact_key: string; detail_json: string }[]) {
    if (!existing.has(row.project_id)) existing.set(row.project_id, new Set());
    existing.get(row.project_id)!.add(row.fact_key);
    if (row.fact_key === "funding_round") {
      try {
        const d = JSON.parse(row.detail_json || "{}") as { stage?: string };
        if (typeof d.stage === "string" && d.stage.trim()) stageBy.add(row.project_id);
      } catch {
        /* ignore */
      }
    }
  }
  const sectorTagged = new Set(
    (db.prepare(`SELECT DISTINCT project_id FROM project_sector_tags`).all() as { project_id: string }[]).map((r) => r.project_id)
  );

  const drafts: Draft[] = [];
  const sectorWrites: { projectId: string; tag: string; sourceUrl: string; excerpt: string }[] = [];
  const websiteWrites: { projectId: string; url: string }[] = [];
  const conflicts: { projectId: string; name: string; field: string; existing: string; candidate: string; sourceUrl: string }[] = [];

  function has(projectId: string, key: string) {
    return existing.get(projectId)?.has(key) ?? false;
  }
  function mark(projectId: string, key: string) {
    if (!existing.has(projectId)) existing.set(projectId, new Set());
    existing.get(projectId)!.add(key);
  }

  function put(draft: Draft) {
    if (!draft.sourceUrl.startsWith("http") || draft.excerpt.trim().length < 8) return false;
    if (["founded_year", "funding_total", "website", "sector"].includes(draft.factKey) && has(draft.projectId, draft.factKey)) {
      return false;
    }
    if (draft.factKey === "funding_round" && stageBy.has(draft.projectId) && draft.detail.stage) {
      return false;
    }
    drafts.push(draft);
    mark(draft.projectId, draft.factKey);
    if (draft.factKey === "funding_round" && draft.detail.stage) stageBy.add(draft.projectId);
    return true;
  }

  // Founders for name disambiguation
  const foundersByProject = new Map<string, string[]>();
  for (const row of db
    .prepare(
      `SELECT ppr.project_id as project_id, pe.name as name
       FROM person_project_roles ppr
       JOIN people pe ON pe.id = ppr.person_id
       WHERE ppr.role LIKE '%founder%'`
    )
    .all() as { project_id: string; name: string }[]) {
    const list = foundersByProject.get(row.project_id) ?? [];
    list.push(row.name);
    foundersByProject.set(row.project_id, list);
  }

  // Pass 0: promote known website_url into company_facts.website when missing
  for (const c of companies) {
    if (has(c.id, "website")) continue;
    if (c.website_url && isCompanySite(c.website_url)) {
      put({
        projectId: c.id,
        factKey: "website",
        valueText: c.website_url,
        amountUsd: null,
        amountStatus: null,
        detail: {},
        sourceUrl: c.website_url,
        excerpt: `Stored company website: ${c.website_url}`,
        origin: "existing_claim",
      });
    }
  }

  // Pass 0b: YC investor rows already on file → Accelerator stage when batch known
  for (const row of db
    .prepare(
      `SELECT project_id, value_text, detail_json, source_url, excerpt
       FROM company_facts WHERE fact_key='investor'`
    )
    .all() as { project_id: string; value_text: string; detail_json: string; source_url: string; excerpt: string }[]) {
    if (!/y combinator/i.test(row.value_text)) continue;
    if (stageBy.has(row.project_id)) continue;
    let batch: string | null = null;
    try {
      const d = JSON.parse(row.detail_json || "{}") as { batch?: string };
      if (typeof d.batch === "string" && d.batch.trim()) batch = d.batch.trim();
    } catch {
      /* ignore */
    }
    if (!batch) {
      const m = `${row.value_text} ${row.excerpt}`.match(/\b(Winter|Spring|Summer|Fall)\s+20\d{2}\b/);
      if (m) batch = m[0];
    }
    if (!batch) continue;
    put({
      projectId: row.project_id,
      factKey: "funding_round",
      valueText: `Accelerator|YC ${batch}`,
      amountUsd: null,
      amountStatus: null,
      detail: { stage: "Accelerator", batch, program: "Y Combinator" },
      sourceUrl: row.source_url,
      excerpt: row.excerpt?.slice(0, 400) || `Y Combinator ${batch}`,
      origin: "existing_claim",
    });
  }

  const needs = companies
    .map((c) => {
      const needFounded = !has(c.id, "founded_year");
      const needWebsite = !has(c.id, "website");
      const needFunding = !has(c.id, "funding_total") && !has(c.id, "funding_round");
      const needStage = !stageBy.has(c.id);
      const needSector = !(c.sector && c.sector.trim()) && !sectorTagged.has(c.id);
      return { c, needFounded, needWebsite, needFunding, needStage, needSector, any: needFounded || needWebsite || needFunding || needStage || needSector };
    })
    .filter((x) => x.any)
    .slice(0, Number.isFinite(LIMIT) ? LIMIT : undefined);

  console.log(`Companies needing fields: ${needs.length} (limit=${LIMIT})`);

  // Pass 1: YC pages
  const ycTargets = needs.filter((n) => ycSlug(n.c.primary_link) || ycSlug(n.c.website_url));
  console.log(`YC page fetches: ${ycTargets.length}`);
  let ycOk = 0;
  let ycFail = 0;
  await mapPool(ycTargets, CONCURRENCY, async (item) => {
    const slug = ycSlug(item.c.primary_link) || ycSlug(item.c.website_url);
    if (!slug) return;
    const url = `https://www.ycombinator.com/companies/${slug}`;
    const html = await fetchHtml(url);
    if (!html) {
      ycFail += 1;
      return;
    }
    const company = extractInertiaCompany(html);
    const text = pageText(html);
    if (company?.name && !namesMatch(company.name, item.c.name)) {
      // Try founder overlap
      const founders = (company.founders || []).map((f) => f?.name || f?.full_name || "").filter(Boolean);
      const ours = foundersByProject.get(item.c.id) || [];
      const overlap = founders.some((fn: string) => ours.some((o) => namesMatch(fn, o)));
      if (!overlap) {
        conflicts.push({
          projectId: item.c.id,
          name: item.c.name,
          field: "yc_identity",
          existing: item.c.name,
          candidate: company.name,
          sourceUrl: url,
        });
        return;
      }
    }
    ycOk += 1;

    if (item.needWebsite && company?.website && isCompanySite(company.website)) {
      if (put({
        projectId: item.c.id,
        factKey: "website",
        valueText: company.website,
        amountUsd: null,
        amountStatus: null,
        detail: {},
        sourceUrl: url,
        excerpt: `YC lists website ${company.website}`,
        origin: "yc_page",
      })) {
        websiteWrites.push({ projectId: item.c.id, url: company.website });
      }
    }

    if (item.needFounded) {
      const y =
        typeof company?.year_founded === "number"
          ? company.year_founded
          : typeof company?.founded === "number"
            ? company.founded
            : null;
      if (y && y >= 2015 && y <= 2026) {
        put({
          projectId: item.c.id,
          factKey: "founded_year",
          valueText: String(y),
          amountUsd: null,
          amountStatus: null,
          detail: {},
          sourceUrl: url,
          excerpt: `YC year_founded ${y}`,
          origin: "yc_page",
        });
      } else {
        const parsed = parseFoundedYear(text);
        if (parsed) {
          put({
            projectId: item.c.id,
            factKey: "founded_year",
            valueText: String(parsed.year),
            amountUsd: null,
            amountStatus: null,
            detail: {},
            sourceUrl: url,
            excerpt: around(text, parsed.index, parsed.length),
            origin: "yc_page",
          });
        }
      }
    }

    if (item.needStage) {
      const batch =
        typeof company?.batch === "string"
          ? company.batch
          : typeof company?.batch_name === "string"
            ? company.batch_name
            : null;
      if (batch && /\b20\d{2}\b/.test(batch)) {
        put({
          projectId: item.c.id,
          factKey: "funding_round",
          valueText: `Accelerator|YC ${batch}`,
          amountUsd: null,
          amountStatus: null,
          detail: { stage: "Accelerator", batch, program: "Y Combinator" },
          sourceUrl: url,
          excerpt: `Y Combinator batch ${batch}`,
          origin: "yc_page",
        });
      }
    }

    if (item.needFunding || item.needStage) {
      const raise = parseFunding(text);
      if (raise && (text.match(/(?:raised|closes|secured)\s+\$/gi) || []).length <= 2) {
        if (raise.stage) {
          put({
            projectId: item.c.id,
            factKey: "funding_round",
            valueText: `${raise.stage}|${raise.amountText}`,
            amountUsd: raise.amountUsd,
            amountStatus: "announced",
            detail: { stage: raise.stage, amountText: raise.amountText },
            sourceUrl: url,
            excerpt: around(text, raise.index, raise.length),
            origin: "yc_page",
          });
        } else if (item.needFunding) {
          put({
            projectId: item.c.id,
            factKey: "funding_total",
            valueText: `${raise.amountText} announced`,
            amountUsd: raise.amountUsd,
            amountStatus: "announced",
            detail: {},
            sourceUrl: url,
            excerpt: around(text, raise.index, raise.length),
            origin: "yc_page",
          });
        }
      }
    }

    if (item.needSector) {
      const tags: string[] = Array.isArray(company?.tags) ? company.tags.map(String) : [];
      const blob = `${tags.join(" ")} ${company?.long_description || company?.one_liner || ""}`.trim();
      if (blob && !isBoilerplateDescription(blob)) {
        const hit = primaryTag(classifyDescription(blob, item.c.name));
        if (hit) {
          sectorWrites.push({ projectId: item.c.id, tag: hit.tag, sourceUrl: url, excerpt: hit.excerpt || blob.slice(0, 200) });
          sectorTagged.add(item.c.id);
          put({
            projectId: item.c.id,
            factKey: "sector",
            valueText: hit.tag,
            amountUsd: null,
            amountStatus: null,
            detail: { label: hit.label },
            sourceUrl: url,
            excerpt: hit.excerpt || blob.slice(0, 200),
            origin: "yc_page",
          });
        }
      }
    }
  });
  console.log(`YC done ok=${ycOk} fail=${ycFail}`);

  // Pass 2: company websites
  const siteTargets = needs.filter((n) => {
    const url = n.c.website_url || (has(n.c.id, "website") ? null : null);
    // re-read drafts for website
    return true;
  });
  // Build website map including new drafts
  const websiteOf = new Map<string, string>();
  for (const c of companies) {
    if (c.website_url && isCompanySite(c.website_url)) websiteOf.set(c.id, c.website_url);
  }
  for (const d of drafts) {
    if (d.factKey === "website") websiteOf.set(d.projectId, d.valueText);
  }
  for (const w of websiteWrites) websiteOf.set(w.projectId, w.url);

  const siteJobs = needs.filter((n) => {
    const url = websiteOf.get(n.c.id);
    if (!url || !isCompanySite(url)) return false;
    return n.needFounded || n.needFunding || n.needStage || n.needSector || n.needWebsite;
  });
  console.log(`Company site fetches: ${siteJobs.length}`);
  let siteOk = 0;
  let siteFail = 0;
  await mapPool(siteJobs, CONCURRENCY, async (item) => {
    const url = websiteOf.get(item.c.id)!;
    const html = await fetchHtml(url);
    if (!html) {
      siteFail += 1;
      return;
    }
    const text = pageText(html);
    const $ = cheerio.load(html);
    const title = ($("title").first().text() || "").trim();
    // Soft identity check: title or body should mention company name token
    const token = normalizeName(item.c.name).split(" ").filter((t) => t.length > 2)[0];
    if (token && !normalizeName(`${title} ${text.slice(0, 2000)}`).includes(token)) {
      // Don't reject hard — many brand sites use product names — but skip funding/founded if too thin
      if (text.length < 200) {
        siteFail += 1;
        return;
      }
    }
    siteOk += 1;

    if (item.needWebsite && !has(item.c.id, "website")) {
      put({
        projectId: item.c.id,
        factKey: "website",
        valueText: url,
        amountUsd: null,
        amountStatus: null,
        detail: {},
        sourceUrl: url,
        excerpt: title ? `Site title: ${title}` : `Company website ${url}`,
        origin: "company_site",
      });
    }

    if (item.needFounded && !has(item.c.id, "founded_year")) {
      const parsed = parseFoundedYear(text);
      if (parsed) {
        put({
          projectId: item.c.id,
          factKey: "founded_year",
          valueText: String(parsed.year),
          amountUsd: null,
          amountStatus: null,
          detail: {},
          sourceUrl: url,
          excerpt: around(text, parsed.index, parsed.length),
          origin: "company_site",
        });
      }
    }

    if ((item.needFunding || item.needStage) && !stageBy.has(item.c.id)) {
      const raise = parseFunding(text);
      const occ = text.match(/(?:raised|closes|secured)\s+\$/gi) ?? [];
      if (raise && occ.length === 1) {
        if (raise.stage) {
          put({
            projectId: item.c.id,
            factKey: "funding_round",
            valueText: `${raise.stage}|${raise.amountText}`,
            amountUsd: raise.amountUsd,
            amountStatus: "announced",
            detail: { stage: raise.stage, amountText: raise.amountText },
            sourceUrl: url,
            excerpt: around(text, raise.index, raise.length),
            origin: "company_site",
          });
        } else if (item.needFunding && !has(item.c.id, "funding_total")) {
          put({
            projectId: item.c.id,
            factKey: "funding_total",
            valueText: `${raise.amountText} announced`,
            amountUsd: raise.amountUsd,
            amountStatus: "announced",
            detail: {},
            sourceUrl: url,
            excerpt: around(text, raise.index, raise.length),
            origin: "company_site",
          });
        }
      }
    }

    if (item.needSector && !sectorTagged.has(item.c.id)) {
      const meta =
        $('meta[name="description"]').attr("content") ||
        $('meta[property="og:description"]').attr("content") ||
        "";
      const blob = `${meta} ${text.slice(0, 2500)}`;
      if (!isBoilerplateDescription(blob)) {
        const hit = primaryTag(classifyDescription(blob, item.c.name));
        if (hit && hit.score >= 4) {
          sectorWrites.push({ projectId: item.c.id, tag: hit.tag, sourceUrl: url, excerpt: hit.excerpt });
          sectorTagged.add(item.c.id);
          put({
            projectId: item.c.id,
            factKey: "sector",
            valueText: hit.tag,
            amountUsd: null,
            amountStatus: null,
            detail: { label: hit.label },
            sourceUrl: url,
            excerpt: hit.excerpt,
            origin: "company_site",
          });
        }
      }
    }
  });
  console.log(`Sites done ok=${siteOk} fail=${siteFail}`);

  // Pass 3: DuckDuckGo HTML for companies still missing funding/stage that have a website or YC
  const searchJobs = process.env.SKIP_PRESS === "1" ? [] : needs
    .filter((n) => (n.needFunding || n.needStage) && !stageBy.has(n.c.id) && !has(n.c.id, "funding_total"))
    .slice(0, 180);
  console.log(`Press search jobs: ${searchJobs.length}`);
  let pressHits = 0;
  await mapPool(searchJobs, 3, async (item) => {
    const founders = (foundersByProject.get(item.c.id) || []).slice(0, 2).join(" ");
    const q = encodeURIComponent(`"${item.c.name}" ${founders} raised OR seed OR "series a" startup`.trim());
    const searchUrl = `https://html.duckduckgo.com/html/?q=${q}`;
    const html = await fetchHtml(searchUrl);
    if (!html) return;
    const $ = cheerio.load(html);
    const links: { href: string; snip: string }[] = [];
    $("a.result__a, a.result-link").each((_, el) => {
      const href = $(el).attr("href") || "";
      const snip = $(el).closest(".result").text().replace(/\s+/g, " ").trim().slice(0, 400);
      if (/^https?:/i.test(href) && !/duckduckgo\.com|youtube\.com|crunchbase\.com/i.test(href)) {
        links.push({ href, snip });
      }
    });
    // Also parse uddg redirect links
    $("a").each((_, el) => {
      const href = $(el).attr("href") || "";
      const m = href.match(/[?&]uddg=([^&]+)/);
      if (m) {
        try {
          const real = decodeURIComponent(m[1]);
          if (/^https?:/i.test(real) && !/duckduckgo|crunchbase/i.test(real)) {
            links.push({ href: real, snip: $(el).text().replace(/\s+/g, " ").trim().slice(0, 200) });
          }
        } catch {
          /* ignore */
        }
      }
    });
    const seen = new Set<string>();
    const candidates = links.filter((l) => {
      if (seen.has(l.href)) return false;
      seen.add(l.href);
      return /techcrunch|forbes|businessinsider|prnewswire|globenewswire|businesswire|venturebeat|axios|reuters|bloomberg|thedp\.com|news\.|seed|series/i.test(
        `${l.href} ${l.snip}`
      );
    }).slice(0, 3);

    for (const cand of candidates) {
      if (stageBy.has(item.c.id) || has(item.c.id, "funding_total")) break;
      const page = await fetchHtml(cand.href);
      if (!page) continue;
      const text = pageText(page);
      if (!namesMatch(item.c.name, text.slice(0, 3000)) && !normalizeName(text.slice(0, 3000)).includes(normalizeName(item.c.name).split(" ")[0] || "___")) {
        continue;
      }
      const raise = parseFunding(text);
      if (!raise) continue;
      const occ = text.match(/(?:raised|closes|secured)\s+\$/gi) ?? [];
      if (occ.length > 2) continue;
      pressHits += 1;
      if (raise.stage) {
        put({
          projectId: item.c.id,
          factKey: "funding_round",
          valueText: `${raise.stage}|${raise.amountText}`,
          amountUsd: raise.amountUsd,
          amountStatus: "announced",
          detail: { stage: raise.stage, amountText: raise.amountText },
          sourceUrl: cand.href,
          excerpt: around(text, raise.index, raise.length),
          origin: "press",
        });
      } else {
        put({
          projectId: item.c.id,
          factKey: "funding_total",
          valueText: `${raise.amountText} announced`,
          amountUsd: raise.amountUsd,
          amountStatus: "announced",
          detail: {},
          sourceUrl: cand.href,
          excerpt: around(text, raise.index, raise.length),
          origin: "press",
        });
      }
      break;
    }
  });
  console.log(`Press hits: ${pressHits}`);

  // Write drafts
  const insertFact = db.prepare(
    `INSERT INTO company_facts (id, project_id, fact_key, value_text, amount_usd, amount_status, detail_json, source_url, excerpt, origin, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertClaim = db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, source_url, retrieved_at, label, verification_state)
     VALUES (?, 'project', ?, 'company_fact', ?, ?, ?, ?, ?, 'observed_fact', 'corroborated')`
  );
  const upsertSector = db.prepare(
    `INSERT INTO project_sector_tags (id, project_id, tag, is_primary, excerpt, source_url, created_at)
     VALUES (?, ?, ?, 1, ?, ?, ?)
     ON CONFLICT(project_id, tag) DO UPDATE SET is_primary=1, excerpt=excluded.excerpt, source_url=COALESCE(excluded.source_url, project_sector_tags.source_url)`
  );
  const updateSectorCol = db.prepare(`UPDATE projects SET sector = ? WHERE id = ? AND (sector IS NULL OR trim(sector) = '')`);
  const updateWebsite = db.prepare(
    `UPDATE projects SET website_url = ? WHERE id = ? AND (website_url IS NULL OR trim(website_url) = '')`
  );

  const write = db.transaction(() => {
    for (const d of drafts) {
      // final guard against dup singleton
      if (["founded_year", "funding_total", "website", "sector"].includes(d.factKey)) {
        const exists = db
          .prepare(`SELECT 1 FROM company_facts WHERE project_id=? AND fact_key=? LIMIT 1`)
          .get(d.projectId, d.factKey);
        if (exists) continue;
      }
      if (d.factKey === "funding_round" && d.detail.stage) {
        const rows = db
          .prepare(`SELECT detail_json FROM company_facts WHERE project_id=? AND fact_key='funding_round'`)
          .all(d.projectId) as { detail_json: string }[];
        const already = rows.some((r) => {
          try {
            const x = JSON.parse(r.detail_json || "{}");
            return typeof x.stage === "string" && x.stage.trim();
          } catch {
            return false;
          }
        });
        if (already) continue;
      }
      insertFact.run(
        newId("fact"),
        d.projectId,
        d.factKey,
        d.valueText,
        d.amountUsd,
        d.amountStatus,
        JSON.stringify(d.detail),
        d.sourceUrl,
        d.excerpt.slice(0, 500),
        d.origin,
        retrievedAt
      );
      if (d.origin !== "existing_claim") {
        insertClaim.run(
          newId("claim"),
          d.projectId,
          JSON.stringify({ fact_key: d.factKey, value: d.valueText, origin: d.origin }),
          d.excerpt.slice(0, 500),
          SOURCE_ID,
          d.sourceUrl,
          retrievedAt
        );
      }
    }
    for (const s of sectorWrites) {
      upsertSector.run(newId("sectag"), s.projectId, s.tag, (s.excerpt || s.tag).slice(0, 500), s.sourceUrl, retrievedAt);
      updateSectorCol.run(s.tag, s.projectId);
    }
    for (const w of websiteWrites) {
      updateWebsite.run(w.url, w.projectId);
    }
    // also sync website facts to projects.website_url
    for (const d of drafts) {
      if (d.factKey === "website") updateWebsite.run(d.valueText, d.projectId);
    }
  });
  write();
  db.pragma("wal_checkpoint(TRUNCATE)");

  // Coverage after
  const invIds = new Set(companies.map((c) => c.id));
  function countFact(key: string) {
    return (
      db
        .prepare(`SELECT COUNT(DISTINCT project_id) AS n FROM company_facts WHERE fact_key=?`)
        .get(key) as { n: number }
    ).n;
  }
  let stageCount = 0;
  for (const row of db.prepare(`SELECT project_id, detail_json FROM company_facts WHERE fact_key='funding_round'`).all() as {
    project_id: string;
    detail_json: string;
  }[]) {
    if (!invIds.has(row.project_id)) continue;
    try {
      const d = JSON.parse(row.detail_json || "{}");
      if (typeof d.stage === "string" && d.stage.trim()) stageCount += 1;
    } catch {
      /* ignore */
    }
  }
  // distinct stage
  const stageSet = new Set<string>();
  for (const row of db.prepare(`SELECT project_id, detail_json FROM company_facts WHERE fact_key='funding_round'`).all() as {
    project_id: string;
    detail_json: string;
  }[]) {
    if (!invIds.has(row.project_id)) continue;
    try {
      const d = JSON.parse(row.detail_json || "{}");
      if (typeof d.stage === "string" && d.stage.trim()) stageSet.add(row.project_id);
    } catch {
      /* ignore */
    }
  }
  const sectorCount = (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM projects WHERE kind='company' AND is_investable_candidate=1 AND sector IS NOT NULL AND trim(sector)!=''`
      )
      .get() as { n: number }
  ).n;
  const fundingCount = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT project_id) AS n FROM company_facts WHERE fact_key IN ('funding_total','funding_round')`
      )
      .get() as { n: number }
  ).n;

  const report = {
    written: drafts.length,
    sectorWrites: sectorWrites.length,
    websiteWrites: websiteWrites.length,
    conflicts,
    coverage: {
      total: companies.length,
      stage: stageSet.size,
      founded: countFact("founded_year"),
      sector: sectorCount,
      funding: fundingCount,
      website: countFact("website"),
    },
    byOrigin: drafts.reduce(
      (acc, d) => {
        acc[d.origin] = (acc[d.origin] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    ),
    byKey: drafts.reduce(
      (acc, d) => {
        acc[d.factKey] = (acc[d.factKey] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    ),
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
