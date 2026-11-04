/**
 * Evidence-only company_facts backfill across every investable row.
 * Fills founded_year and stage first, then sector / website / funding from
 * facts and source pages already on file. Never invents pre-seed.
 *
 *   npx tsx scripts/ingest/backfill-company-facts-extend-2026-11-03.ts
 */
import * as cheerio from "cheerio";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { getDb, newId, nowIso } from "../../lib/db/client";
import { classifyDescription, isBoilerplateDescription, primaryTag } from "../../lib/domain/sectors";

const SOURCE_ID = "src_company_backfill_extend_2026_11_03";
const CACHE = path.join("/tmp/backfill-2026-11-03/html-extend");
const REPORT = path.join("/tmp/backfill-2026-11-03/company-backfill-extend-report.json");
const CONCURRENCY = Number(process.env.CONCURRENCY || 8);
const UA =
  "Mozilla/5.0 (compatible; CampusScoutBackfill/1.0; +https://github.com/amyzhuang111/dorm-room-fund-scout)";

type Draft = {
  projectId: string;
  factKey: string;
  valueText: string;
  amountUsd: number | null;
  amountStatus: "announced" | "undisclosed" | null;
  detail: Record<string, unknown>;
  sourceUrl: string;
  excerpt: string;
  origin: string;
};

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
    if (age < 12 * 3600_000) return fs.readFileSync(cached, "utf8");
  }
  try {
    await sleep(80 + Math.random() * 140);
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

function parseFoundedYear(text: string): { year: number; index: number; length: number } | null {
  const patterns = [
    /\bfounded\s+in\s+(20\d{2})\b/i,
    /\bfounded\s+(20\d{2})\b/i,
    /\bestablished\s+in\s+(20\d{2})\b/i,
    /\blaunched\s+in\s+(20\d{2})\b/i,
    /\bstarted\s+in\s+(20\d{2})\b/i,
    /\byear\s+founded[:\s]+(20\d{2})\b/i,
    /\bfounding\s+year[:\s]+(20\d{2})\b/i,
    /\b\(founded\s+(20\d{2})\)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m || m.index == null) continue;
    const year = Number(m[1]);
    if (year >= 2015 && year <= 2026) return { year, index: m.index, length: m[0].length };
  }
  return null;
}

function parseStageFromText(text: string): { stage: string; index: number; length: number; amountText?: string; amountUsd?: number } | null {
  const re =
    /\b((?:pre[-\s]?seed|seed|series\s+[a-d]|accelerator)\s+(?:round|financing|funding)?)\b(?:[^\d$]{0,40}\$?\s*(\d+(?:\.\d+)?)\s*(million|billion|m|b|k))?/gi;
  let best: ReturnType<typeof parseStageFromText> = null;
  for (const m of text.matchAll(re)) {
    if (m.index == null) continue;
    const raw = m[1].toLowerCase().replace(/\s+/g, " ").trim();
    let stage = "";
    if (/pre[-\s]?seed/.test(raw)) stage = "Pre-seed";
    else if (/^seed/.test(raw)) stage = "Seed";
    else if (/series a/.test(raw)) stage = "Series A";
    else if (/series b/.test(raw)) stage = "Series B";
    else if (/series c/.test(raw)) stage = "Series C";
    else if (/accelerator/.test(raw)) stage = "Accelerator";
    if (!stage) continue;
    let amountUsd: number | undefined;
    let amountText: string | undefined;
    if (m[2]) {
      const n = Number(m[2]);
      const u = (m[3] || "").toLowerCase();
      if (u === "b" || u === "billion") amountUsd = n * 1e9;
      else if (u === "m" || u === "million") amountUsd = n * 1e6;
      else if (u === "k") amountUsd = n * 1e3;
      if (amountUsd) amountText = m[0].match(/\$[\d.,]+\s*[kmb]?|\d+(?:\.\d+)?\s*(?:million|billion|m|b|k)/i)?.[0];
    }
    best = { stage, index: m.index, length: m[0].length, amountText, amountUsd };
    break;
  }
  return best;
}

function studentProjectEvidence(text: string): boolean {
  return (
    /\bundergraduate\s+team\b/i.test(text) ||
    /\bstudent[-\s]?led\b/i.test(text) ||
    /\bstudent\s+(?:venture|startup|project|company)\b/i.test(text) ||
    /\bgraduate\s+team\b/i.test(text) ||
    /\b(?:mba|ms|phd)\s+['’]?\d{2}\b/i.test(text) ||
    /\bclass\s+of\s+20\d{2}\b/i.test(text) ||
    /\b(?:weinberg|seas|questrom|kellogg|som)\s+['’]\d{2}\b/i.test(text)
  );
}

function stageFromInvestorValue(value: string): string | null {
  const t = value.toLowerCase();
  if (/series\s*a\b/.test(t)) return "Series A";
  if (/series\s*b\b/.test(t)) return "Series B";
  if (/series\s*c\b/.test(t)) return "Series C";
  if (/\bseed\b/.test(t) && !/pre[-\s]?seed/.test(t)) return "Seed";
  if (/pre[-\s]?seed/.test(t)) return "Pre-seed";
  if (/\by\s*combinator\b|\byc\b/.test(t)) return "Accelerator";
  if (/speedrun|pearx|techstars|antler|hf0|south park commons/.test(t)) return "Accelerator";
  return null;
}

function isCompanySite(url: string | null | undefined): boolean {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  try {
    const host = new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
    if (!host.includes(".")) return false;
    const blocked =
      /(?:ycombinator|linkedin|crunchbase|twitter|x\.com|facebook|instagram|youtube|github|devpost|producthunt|wellfound|angel\.co|medium|substack|luma|pitchbook|techcrunch|grepbeat|\.edu$|thegarage|city\.yale|bu\.edu|cmu\.edu|illinois\.edu|entrepreneurship\.duke)/i;
    return !blocked.test(host);
  } catch {
    return false;
  }
}

function extractSiteLinks(html: string, companyName: string): string | null {
  const $ = cheerio.load(html);
  const candidates: string[] = [];
  $("a[href]").each((_, el) => {
    const href = String($(el).attr("href") || "").trim();
    if (!/^https?:\/\//i.test(href)) return;
    if (!isCompanySite(href)) return;
    const label = ($(el).text() || "").toLowerCase();
    if (/website|visit|learn more|official|site/.test(label) || label.includes(companyName.toLowerCase().slice(0, 6))) {
      candidates.unshift(href);
    } else {
      candidates.push(href);
    }
  });
  return candidates[0] || null;
}

async function main() {
  fs.mkdirSync(CACHE, { recursive: true });
  const db = getDb();
  const retrievedAt = nowIso();
  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at, last_success_at)
     VALUES (?, 'Company fact backfill extend 2026-11-03', 'reference', 'https://campus-scout.vercel.app/data', '[]', 3, 'html_scrape', 'available', ?, ?)
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
  for (const row of db.prepare(`SELECT project_id, fact_key, detail_json FROM company_facts`).all() as {
    project_id: string;
    fact_key: string;
    detail_json: string;
  }[]) {
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
    if (draft.factKey === "funding_round" && stageBy.has(draft.projectId) && draft.detail.stage) return false;
    drafts.push(draft);
    mark(draft.projectId, draft.factKey);
    if (draft.factKey === "funding_round" && draft.detail.stage) stageBy.add(draft.projectId);
    return true;
  }

  // Pass 0: promote website_url → website fact
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
        excerpt: `Company website on file: ${c.website_url}`,
        origin: "existing_claim",
      });
    }
  }

  // Pass 1: stage from investor fact values already on file
  const investorRows = db
    .prepare(`SELECT project_id, value_text, source_url, excerpt FROM company_facts WHERE fact_key='investor'`)
    .all() as { project_id: string; value_text: string; source_url: string; excerpt: string }[];
  for (const row of investorRows) {
    if (stageBy.has(row.project_id)) continue;
    const stage = stageFromInvestorValue(row.value_text || "");
    if (!stage) continue;
    put({
      projectId: row.project_id,
      factKey: "funding_round",
      valueText: `${stage}|${row.value_text}`,
      amountUsd: null,
      amountStatus: null,
      detail: { stage, fromInvestor: row.value_text },
      sourceUrl: row.source_url,
      excerpt: (row.excerpt || row.value_text).slice(0, 400),
      origin: "existing_claim",
    });
  }

  // Pass 2: mine description / claim excerpts already on file
  const textRows = db
    .prepare(
      `SELECT project_id, fact_key, value_text, source_url, excerpt FROM company_facts
       WHERE fact_key IN ('description','funding_round','funding_total','website')`
    )
    .all() as { project_id: string; fact_key: string; value_text: string; source_url: string; excerpt: string }[];

  const blobByProject = new Map<string, { text: string; sourceUrl: string }[]>();
  for (const row of textRows) {
    const text = `${row.excerpt || ""} ${row.value_text || ""}`.replace(/\s+/g, " ").trim();
    if (text.length < 20 || !row.source_url?.startsWith("http")) continue;
    const list = blobByProject.get(row.project_id) ?? [];
    list.push({ text, sourceUrl: row.source_url });
    blobByProject.set(row.project_id, list);
  }
  for (const row of db
    .prepare(
      `SELECT entity_id as project_id, excerpt, source_url, value_json FROM claims WHERE entity_type='project'`
    )
    .all() as { project_id: string; excerpt: string | null; source_url: string | null; value_json: string | null }[]) {
    const text = `${row.excerpt || ""} ${row.value_json || ""}`.replace(/\s+/g, " ").trim();
    if (text.length < 20 || !row.source_url?.startsWith("http")) continue;
    const list = blobByProject.get(row.project_id) ?? [];
    list.push({ text, sourceUrl: row.source_url });
    blobByProject.set(row.project_id, list);
  }

  for (const c of companies) {
    const blobs = blobByProject.get(c.id) || [];
    if (!has(c.id, "founded_year")) {
      for (const b of blobs) {
        const hit = parseFoundedYear(b.text);
        if (!hit) continue;
        put({
          projectId: c.id,
          factKey: "founded_year",
          valueText: String(hit.year),
          amountUsd: null,
          amountStatus: null,
          detail: {},
          sourceUrl: b.sourceUrl,
          excerpt: around(b.text, hit.index, hit.length),
          origin: "existing_claim",
        });
        break;
      }
    }

    if (!stageBy.has(c.id)) {
      let wrote = false;
      for (const b of blobs) {
        const raise = parseStageFromText(b.text);
        if (raise) {
          put({
            projectId: c.id,
            factKey: "funding_round",
            valueText: raise.amountText ? `${raise.stage}|${raise.amountText}` : raise.stage,
            amountUsd: raise.amountUsd ?? null,
            amountStatus: raise.amountUsd ? "announced" : null,
            detail: { stage: raise.stage, amountText: raise.amountText ?? null },
            sourceUrl: b.sourceUrl,
            excerpt: around(b.text, raise.index, raise.length),
            origin: "existing_claim",
          });
          wrote = true;
          break;
        }
      }
      // Student / campus venture only when the source text supports it and no priced stage exists
      if (!wrote && !stageBy.has(c.id)) {
        for (const b of blobs) {
          if (!studentProjectEvidence(b.text)) continue;
          // Require explicit student-project / undergraduate-team language, not merely a class year
          if (
            !/\bundergraduate\s+team\b/i.test(b.text) &&
            !/\bstudent[-\s]?led\b/i.test(b.text) &&
            !/\bstudent\s+(?:venture|startup|project|company)\b/i.test(b.text) &&
            !/\bgraduate\s+team\b/i.test(b.text)
          ) {
            continue;
          }
          put({
            projectId: c.id,
            factKey: "funding_round",
            valueText: "pre-seed / student project",
            amountUsd: null,
            amountStatus: null,
            detail: { stage: "pre-seed / student project" },
            sourceUrl: b.sourceUrl,
            excerpt: b.text.slice(0, 400),
            origin: "existing_claim",
          });
          break;
        }
      }
    }

    if (!(c.sector && c.sector.trim()) && !sectorTagged.has(c.id)) {
      for (const b of blobs) {
        if (isBoilerplateDescription(b.text)) continue;
        const hit = primaryTag(classifyDescription(b.text, c.name));
        if (!hit) continue;
        sectorWrites.push({ projectId: c.id, tag: hit.tag, sourceUrl: b.sourceUrl, excerpt: hit.excerpt || b.text.slice(0, 200) });
        sectorTagged.add(c.id);
        put({
          projectId: c.id,
          factKey: "sector",
          valueText: hit.tag,
          amountUsd: null,
          amountStatus: null,
          detail: {},
          sourceUrl: b.sourceUrl,
          excerpt: (hit.excerpt || b.text).slice(0, 400),
          origin: "existing_claim",
        });
        break;
      }
    }
  }

  // Pass 3: fetch company websites + evidence source pages still missing founded/stage/site
  const needFetch = companies.filter((c) => {
    const needFounded = !has(c.id, "founded_year");
    const needStage = !stageBy.has(c.id);
    const needSite = !has(c.id, "website") && !(c.website_url && isCompanySite(c.website_url));
    return needFounded || needStage || needSite;
  });

  const urlsByProject = new Map<string, string[]>();
  for (const c of needFetch) {
    const urls: string[] = [];
    if (c.website_url && isCompanySite(c.website_url)) urls.push(c.website_url);
    if (c.primary_link && isCompanySite(c.primary_link)) urls.push(c.primary_link);
    for (const b of blobByProject.get(c.id) || []) {
      if (b.sourceUrl.startsWith("http") && !urls.includes(b.sourceUrl)) urls.push(b.sourceUrl);
    }
    // Prefer company site first
    urls.sort((a, b) => Number(isCompanySite(b)) - Number(isCompanySite(a)));
    urlsByProject.set(c.id, urls.slice(0, 4));
  }

  let fetched = 0;
  let fetchFail = 0;
  await mapPool(needFetch, CONCURRENCY, async (c) => {
    const urls = urlsByProject.get(c.id) || [];
    for (const url of urls) {
      const html = await fetchHtml(url);
      if (!html) {
        fetchFail += 1;
        continue;
      }
      fetched += 1;
      const text = pageText(html);

      if (!has(c.id, "website") && !isCompanySite(url)) {
        const site = extractSiteLinks(html, c.name);
        if (site) {
          if (
            put({
              projectId: c.id,
              factKey: "website",
              valueText: site,
              amountUsd: null,
              amountStatus: null,
              detail: {},
              sourceUrl: url,
              excerpt: `Linked company site ${site} from source page`,
              origin: "press",
            })
          ) {
            websiteWrites.push({ projectId: c.id, url: site });
          }
        }
      }

      if (!has(c.id, "founded_year")) {
        const hit = parseFoundedYear(text);
        if (hit) {
          put({
            projectId: c.id,
            factKey: "founded_year",
            valueText: String(hit.year),
            amountUsd: null,
            amountStatus: null,
            detail: {},
            sourceUrl: url,
            excerpt: around(text, hit.index, hit.length),
            origin: isCompanySite(url) ? "company_site" : "press",
          });
        }
      }

      if (!stageBy.has(c.id)) {
        const raise = parseStageFromText(text);
        if (raise) {
          put({
            projectId: c.id,
            factKey: "funding_round",
            valueText: raise.amountText ? `${raise.stage}|${raise.amountText}` : raise.stage,
            amountUsd: raise.amountUsd ?? null,
            amountStatus: raise.amountUsd ? "announced" : null,
            detail: { stage: raise.stage, amountText: raise.amountText ?? null },
            sourceUrl: url,
            excerpt: around(text, raise.index, raise.length),
            origin: isCompanySite(url) ? "company_site" : "press",
          });
        }
      }

      if (has(c.id, "founded_year") && stageBy.has(c.id) && (has(c.id, "website") || c.website_url)) break;
    }
  });

  // Write
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
      if (["founded_year", "funding_total", "website", "sector"].includes(d.factKey)) {
        const exists = db.prepare(`SELECT 1 FROM company_facts WHERE project_id=? AND fact_key=? LIMIT 1`).get(d.projectId, d.factKey);
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
    for (const w of websiteWrites) updateWebsite.run(w.url, w.projectId);
    for (const d of drafts) {
      if (d.factKey === "website") updateWebsite.run(d.valueText, d.projectId);
    }
  });
  write();
  db.pragma("wal_checkpoint(TRUNCATE)");

  const byKey: Record<string, number> = {};
  for (const d of drafts) byKey[d.factKey] = (byKey[d.factKey] || 0) + 1;
  const report = {
    companies: companies.length,
    drafts: drafts.length,
    byKey,
    sectorWrites: sectorWrites.length,
    websiteWrites: websiteWrites.length,
    fetched,
    fetchFail,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
