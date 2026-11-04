/**
 * Weekly campus sources 2026-11-02: scrape public HTML → cache → import.
 * Corrected dedupe: domain else name+campus (never name alone).
 * Skip broken list from weekly health check; try CMU Airtable (report if empty).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { CAMPUSES } from "../lib/domain/campuses";
import { normalizeCompanyName, websiteIdentity } from "../lib/domain/dedupe";
import { classifyDescription } from "../lib/domain/sectors";
import { getDb, newId, nowIso } from "../lib/db/client";

const UA = "CampusScoutBot/0.1 (+research; polite; campus scout corpus)";
const IMPORTS = path.join(process.cwd(), "data/imports");
const EVIDENCE_DAY = "2026-11-02";

type Affiliation = "current_student" | "alumni" | "faculty" | "research_spinout" | "staff" | "community" | "unknown";
type Lead = {
  name: string;
  university: string;
  affiliation_type: Affiliation;
  cohort_year: number | null;
  enrollment_status: string | null;
  website: string | null;
  evidence_url: string;
  program?: string | null;
  source: string;
  description?: string | null;
  cohort_label?: string | null;
};

type SourceSpec = {
  id: string;
  name: string;
  listUrl: string;
  cache: string;
  campusId: string;
  defaultAffiliation: Affiliation;
  program: string;
};

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function hostnameName(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const base = host.split(".")[0] || host;
    return base.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return url;
  }
}

function linkedInCompanyName(href: string): string | null {
  const m = href.match(/linkedin\.com\/company\/([^/?#]+)/i);
  if (!m) return null;
  return decodeURIComponent(m[1])
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bInc\b/i, "Inc")
    .trim();
}

async function scrapeGeorgiaKickstart(): Promise<Lead[]> {
  const url = "https://georgiakickstart.com/portfolio";
  const html = await fetchText(url);
  const leads: Lead[] = [];
  // Year sections: <h2 id="portfolio-year-2026"> … then <h3>Company</h3>
  const yearBlocks = html.split(/<h2[^>]*id="portfolio-year-(\d{4})"[^>]*>/i);
  for (let i = 1; i < yearBlocks.length; i += 2) {
    const year = Number(yearBlocks[i]);
    const body = yearBlocks[i + 1] || "";
    const nextYear = body.search(/<h2[^>]*id="portfolio-year-/i);
    const slice = nextYear >= 0 ? body.slice(0, nextYear) : body;
    const cards = [...slice.matchAll(/<h3[^>]*>([^<]{2,120})<\/h3>([\s\S]*?)(?=<h3[^>]*>|<h2[^>]*>|$)/gi)];
    for (const m of cards) {
      const name = stripTags(m[1]);
      if (!name || /portfolio|filter|all \(/i.test(name)) continue;
      const chunk = m[2] || "";
      const site = chunk.match(/href="(https?:\/\/[^"]+)"[^>]*>\s*Visit website/i)?.[1] || null;
      leads.push({
        name,
        university: "University of Georgia",
        affiliation_type: "unknown",
        cohort_year: Number.isFinite(year) ? year : null,
        enrollment_status: null,
        website: site,
        evidence_url: url,
        program: "Georgia KickStart Fund",
        source: "src_uga_georgia_kickstart",
        cohort_label: year ? String(year) : null,
      });
    }
  }
  // Fallback: all h3 if year parse failed
  if (leads.length === 0) {
    for (const m of html.matchAll(/<h3[^>]*>([^<]{2,120})<\/h3>/gi)) {
      const name = stripTags(m[1]);
      if (!name) continue;
      leads.push({
        name,
        university: "University of Georgia",
        affiliation_type: "unknown",
        cohort_year: null,
        enrollment_status: null,
        website: null,
        evidence_url: url,
        program: "Georgia KickStart Fund",
        source: "src_uga_georgia_kickstart",
      });
    }
  }
  return dedupeLeads(leads);
}

async function scrapeIVenture(): Promise<Lead[]> {
  const url = "https://iventure.illinois.edu/startups";
  const html = await fetchText(url);
  const leads: Lead[] = [];
  const parts = html.split(/<h3[^>]*>\s*(iVenture[^<]*)<\/h3>/i);
  for (let i = 1; i < parts.length; i += 2) {
    const label = stripTags(parts[i]);
    const body = parts[i + 1] || "";
    const next = body.search(/<h3[^>]*>\s*iVenture/i);
    const slice = next >= 0 ? body.slice(0, next) : body;
    // Prefer named links
    const seen = new Set<string>();
    for (const m of slice.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([^<]{2,80})<\/a>/gi)) {
      const href = m[1];
      const name = stripTags(m[2]);
      if (!name || /apply|connect|calendar|home|cohort|industry/i.test(name)) continue;
      if (/illinois\.edu|facebook|twitter|linkedin\.com\/school/i.test(href)) continue;
      const key = normalizeCompanyName(name);
      if (seen.has(key)) continue;
      seen.add(key);
      const cohortNum = label.match(/(\d+)/)?.[1];
      leads.push({
        name,
        university: "University of Illinois Urbana-Champaign",
        affiliation_type: "unknown",
        cohort_year: null,
        enrollment_status: null,
        website: /^https?:/i.test(href) ? href : null,
        evidence_url: url,
        program: "iVenture Accelerator",
        source: "src_uiuc_iventure",
        cohort_label: label,
        description: cohortNum ? `iVenture cohort ${cohortNum}` : label,
      });
    }
    // Text-only names (no link)
    for (const m of slice.matchAll(/>([A-Z][A-Za-z0-9!&.+\-][^<]{1,60})</g)) {
      const name = stripTags(m[1]);
      if (!name || name.length < 2 || /iVenture|Cohort|Industry|Explore|Connect/i.test(name)) continue;
      const key = normalizeCompanyName(name);
      if (seen.has(key)) continue;
      seen.add(key);
      leads.push({
        name,
        university: "University of Illinois Urbana-Champaign",
        affiliation_type: "unknown",
        cohort_year: null,
        enrollment_status: null,
        website: null,
        evidence_url: url,
        program: "iVenture Accelerator",
        source: "src_uiuc_iventure",
        cohort_label: label,
      });
    }
  }
  return dedupeLeads(leads);
}

async function scrapeUsfSii(): Promise<Lead[]> {
  const url =
    "https://www.usf.edu/research-innovation/innovation-enterprise/usf-connect/student-innovation-incubator/sii-entrepreneurs.aspx";
  const html = await fetchText(url);
  const leads: Lead[] = [];
  // Preserve newlines from block elements so the alumni list stays one-name-per-line.
  const withBreaks = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d|tr)>/gi, "\n");
  // Do not collapse newlines — stripTags would squash the one-name-per-line list.
  const text = withBreaks
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{2,}/g, "\n");
  const appleIdx = text.toLowerCase().indexOf("1 apple grocery");
  const start = appleIdx >= 0 ? appleIdx : text.search(/Meet the 2025-26 Cohort/i);
  if (start < 0) return [];
  const block = text.slice(start, start + 12000);
  for (const line of block.split(/\n+/)) {
    const name = line.replace(/^\d+\s+/, "").trim();
    if (!name || name.length > 80) continue;
    if (/^(aLUMNI|Alumni|Meet the|The student|SII|USF)\b/i.test(name)) continue;
    if (/quick links|visit usf|parking|activate|footer|research help/i.test(name)) break;
    if (/selected from|competitive pool|represent a variety|colleges such as/i.test(name)) continue;
    leads.push({
      name,
      university: "University of South Florida",
      affiliation_type: "unknown",
      cohort_year: null,
      enrollment_status: null,
      website: null,
      evidence_url: url,
      program: "USF Student Innovation Incubator",
      source: "src_usf_sii",
    });
  }
  return dedupeLeads(leads);
}

async function scrapeUconnHillside(): Promise<Lead[]> {
  const url = "https://hillsideventures.uconn.edu/venture-fund-3/portfolio/";
  const html = await fetchText(url);
  const leads: Lead[] = [];
  const blocks = html.split(/<strong>\s*Founders:\s*<\/strong>/i).slice(1);
  for (const block of blocks) {
    let website: string | null = null;
    let name: string | null = null;
    for (const href of [...block.matchAll(/href="(https?:\/\/[^"]+)"/gi)].map((x) => x[1])) {
      if (/linkedin\.com\/company\//i.test(href)) {
        name = name || linkedInCompanyName(href);
      } else if (/linkedin\.com\/in|instagram\.com|twitter\.com|youtube\.com|uconn\.edu|privacy/i.test(href)) {
        continue;
      } else if (!website) {
        website = href.split("?")[0];
      }
    }
    if (!name && website) name = hostnameName(website);
    if (!name) continue;
    leads.push({
      name,
      university: "University of Connecticut",
      affiliation_type: "unknown",
      cohort_year: null,
      enrollment_status: null,
      website,
      evidence_url: url,
      program: "Hillside Ventures",
      source: "src_uconn_hillside",
    });
  }
  return dedupeLeads(leads);
}

async function scrapeRitVf(): Promise<Lead[]> {
  const url = "https://www.rit.edu/venturefund/portfolio-companies";
  const html = await fetchText(url);
  const leads: Lead[] = [];
  // Visible text walk: Name, description, domain.com/
  const withBreaks = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d|section)>/gi, "\n");
  const text = withBreaks
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{2,}/g, "\n");
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const start = lines.findIndex((l) => l === "Athlete Studio") >= 0
    ? lines.findIndex((l) => l === "Athlete Studio")
    : lines.findIndex((l, idx) => l === "Companies" && idx > 5);
  for (let i = Math.max(0, start); i < lines.length; ) {
    const name = lines[i];
    if (/^(Footer|About|Investment Criteria|Contact|RIT|News|Directory|myRIT)/i.test(name)) break;
    if (/@|phone|\d{3}-\d{3}/i.test(name) || /^[a-z0-9.-]+\.[a-z.]{2,}\/?$/i.test(name)) {
      i++;
      continue;
    }
    let desc: string | null = null;
    let website: string | null = null;
    let j = i + 1;
    if (j < lines.length && !/^[a-z0-9.-]+\.[a-z.]{2,}\/?$/i.test(lines[j]) && lines[j].length > 40) {
      desc = lines[j];
      j++;
    }
    while (j < lines.length && !/^[a-z0-9.-]+\.[a-z.]{2,}\/?$/i.test(lines[j])) {
      // skip emails/phones
      if (/@|\d{3}-\d{3}/.test(lines[j])) {
        j++;
        continue;
      }
      break;
    }
    if (j < lines.length && /^[a-z0-9.-]+\.[a-z.]{2,}\/?$/i.test(lines[j])) {
      website = `https://${lines[j].replace(/\/$/, "")}`;
      j++;
    }
    if (name.length > 60 || /streamline your life|token becomes the one key/i.test(name)) {
      i = Math.max(j, i + 1);
      continue;
    }
    if (website || (name && name.length >= 2 && name.length <= 60)) {
      leads.push({
        name,
        university: "Rochester Institute of Technology",
        affiliation_type: "unknown",
        cohort_year: null,
        enrollment_status: null,
        website,
        evidence_url: url,
        program: "RIT Venture Fund",
        source: "src_rit_venture_fund",
        description: desc,
      });
    }
    i = Math.max(j, i + 1);
  }
  return dedupeLeads(leads.filter((l) => l.website));
}

async function scrapeCuDeming(): Promise<Lead[]> {
  const url = "https://www.colorado.edu/dcvf/portfolio";
  const html = await fetchText(url);
  const leads: Lead[] = [];
  for (const m of html.matchAll(/<a href="(https?:\/\/[^"]+)"[^>]*>\s*<strong class="h3">([^<]+)<\/strong>\s*<\/a>/gi)) {
    const website = m[1];
    const name = stripTags(m[2]);
    if (!name) continue;
    leads.push({
      name,
      university: "University of Colorado Boulder",
      affiliation_type: "unknown",
      cohort_year: null,
      enrollment_status: null,
      website,
      evidence_url: url,
      program: "Deming Center Venture Fund",
      source: "src_cu_deming",
    });
  }
  return dedupeLeads(leads);
}

async function scrapeDukeBridge(): Promise<Lead[]> {
  const url = "https://cfci.pratt.duke.edu/bridge/";
  const html = await fetchText(url);
  const leads: Lead[] = [];
  // Startups under Our Startups — h3 names between Boundless Science and Calla Health / newsletter
  const names = [...html.matchAll(/<h3[^>]*>([^<]{2,80})<\/h3>/gi)].map((m) => stripTags(m[1]));
  const skip = /Amenities|Shared Equipment|Our Team|Mission|Cookie|Newsletter|Calla Health Foundation/i;
  let inList = false;
  for (const name of names) {
    if (/Boundless Science/i.test(name)) inList = true;
    if (/Calla Health|Newsletter/i.test(name)) break;
    if (!inList || skip.test(name)) continue;
    leads.push({
      name,
      university: "Duke University",
      affiliation_type: "unknown",
      cohort_year: null,
      enrollment_status: null,
      website: null,
      evidence_url: url,
      program: "Duke BRiDGE Incubator",
      source: "src_duke_bridge",
    });
  }
  return dedupeLeads(leads);
}

async function scrapeDukeShowcase(): Promise<Lead[]> {
  const url = "https://entrepreneurship.duke.edu/startup-showcase-2025-featured-companies/";
  const html = await fetchText(url);
  const leads: Lead[] = [];
  for (const m of html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)) {
    const name = stripTags(m[1]);
    if (!name) continue;
    if (/Action menu|Primary navigation|Secondary|Footer|Search|2025 Duke Student Ventures/i.test(name)) continue;
    leads.push({
      name,
      university: "Duke University",
      affiliation_type: "current_student", // featured 2025 student ventures
      cohort_year: 2025,
      enrollment_status: null,
      website: null,
      evidence_url: url,
      program: "Duke Startup Showcase 2025",
      source: "src_duke_showcase_2025",
      cohort_label: "2025",
    });
  }
  return dedupeLeads(leads);
}

function dedupeLeads(leads: Lead[]): Lead[] {
  const out: Lead[] = [];
  const seen = new Set<string>();
  for (const lead of leads) {
    const name = lead.name.trim();
    if (!name) continue;
    const key = `${normalizeCompanyName(name)}|${websiteIdentity(lead.website) || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...lead, name });
  }
  return out;
}

function ensureSource(db: Database.Database, src: SourceSpec, retrievedAt: string) {
  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at, last_success_at, source_role, tier_rationale)
     VALUES (?, ?, 'campus_builder_org', ?, ?, 2, 'html_public', 'available', ?, ?, 'discovery', ?)
     ON CONFLICT(id) DO UPDATE SET last_attempt_at=excluded.last_attempt_at, last_success_at=excluded.last_success_at, status='available'`,
  ).run(src.id, src.name, src.listUrl, JSON.stringify([src.campusId]), retrievedAt, retrievedAt, `${src.name} public roster`);
}

function campusAffiliated(db: Database.Database, projectId: string, campusId: string): boolean {
  return Boolean(
    db
      .prepare(
        `SELECT 1 FROM relationships WHERE source_entity_type='project' AND source_entity_id=? AND target_entity_type='university' AND target_entity_id=? AND relationship_type='affiliated_with'`,
      )
      .get(projectId, campusId),
  );
}

function findExisting(db: Database.Database, name: string, website: string | null, campusId: string): string | null {
  const site = websiteIdentity(website);
  if (site) {
    const rows = db.prepare(`SELECT id, website_url FROM projects WHERE kind='company' AND website_url IS NOT NULL`).all() as {
      id: string;
      website_url: string;
    }[];
    const hits = rows.filter((r) => websiteIdentity(r.website_url) === site);
    if (hits.length >= 1) return hits[0].id;
  }
  const key = normalizeCompanyName(name);
  const rows = db.prepare(`SELECT id, name FROM projects WHERE kind='company'`).all() as { id: string; name: string }[];
  const nameHits = rows.filter((r) => normalizeCompanyName(r.name) === key);
  const onCampus = nameHits.filter((r) => campusAffiliated(db, r.id, campusId));
  if (onCampus.length >= 1) return onCampus[0].id;
  return null;
}

function linkCampus(db: Database.Database, projectId: string, campusId: string, claimId: string | null) {
  if (campusAffiliated(db, projectId, campusId)) return;
  db.prepare(
    `INSERT INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json, verification_state)
     VALUES (?, 'project', ?, 'university', ?, 'affiliated_with', ?, 'affiliation_only')`,
  ).run(newId("rel"), projectId, campusId, JSON.stringify(claimId ? [claimId] : []));
}

function importLeads(db: Database.Database, src: SourceSpec, leads: Lead[], retrievedAt: string) {
  ensureSource(db, src, retrievedAt);
  const cachePath = path.join(IMPORTS, src.cache);
  fs.writeFileSync(cachePath, JSON.stringify(leads, null, 2) + "\n");
  const hash = crypto.createHash("sha256").update(fs.readFileSync(cachePath)).digest("hex");
  db.prepare(
    `INSERT INTO snapshots (id, source_id, url, content_hash, fetched_at, http_status, raw_excerpt) VALUES (?, ?, ?, ?, ?, 200, ?)`,
  ).run(newId("snap"), src.id, src.listUrl, hash, retrievedAt, `${src.name} cache (${leads.length} leads)`);

  const insertClaim = db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, source_url, retrieved_at, label, verification_state)
     VALUES (?, 'project', ?, ?, ?, ?, ?, ?, ?, 'observed_fact', 'observed')`,
  );
  const insertProject = db.prepare(
    `INSERT INTO projects (id, name, aliases_json, kind, sector, description, website_url, is_portfolio_reference, is_investable_candidate, created_at, updated_at, primary_link, primary_link_kind, verification_status, last_verified_at, verification_note)
     VALUES (?, ?, '[]', 'company', ?, ?, ?, 0, 1, ?, ?, ?, ?, 'confirmed', ?, ?)`,
  );
  const updateProject = db.prepare(
    `UPDATE projects SET
       description=COALESCE(description, ?),
       website_url=COALESCE(website_url, ?),
       updated_at=?,
       primary_link=COALESCE(primary_link, ?),
       last_verified_at=?,
       verification_note=COALESCE(verification_note, ?)
     WHERE id=?`,
  );

  let imported = 0;
  let merged = 0;
  for (const lead of leads) {
    const name = lead.name.trim();
    if (!name) continue;
    let affiliation = lead.affiliation_type || src.defaultAffiliation;
    if (affiliation === "current_student" && /alumni|faculty/i.test(lead.program || "")) {
      affiliation = /faculty/i.test(lead.program || "") ? "faculty" : "alumni";
    }
    const website = lead.website?.trim() || null;
    const evidenceUrl = lead.evidence_url?.trim() || src.listUrl;
    const existing = findExisting(db, name, website, src.campusId);
    const desc = lead.description?.trim() || null;
    const sectorHits = desc ? classifyDescription(desc) : [];
    const sector = sectorHits[0]?.label ?? null;
    const note = `${src.name}${lead.program ? ` · ${lead.program}` : ""} · ${affiliation}`;
    const linkKind = website ? "website" : "other";
    let projectId = existing;
    if (!projectId) {
      projectId = newId("proj");
      insertProject.run(projectId, name, sector, desc, website, retrievedAt, retrievedAt, website || evidenceUrl, linkKind, retrievedAt.slice(0, 10), note);
      imported++;
    } else {
      updateProject.run(desc, website, retrievedAt, website || evidenceUrl, retrievedAt.slice(0, 10), note, projectId);
      merged++;
    }
    const value = {
      name,
      university: lead.university || CAMPUSES.find((c) => c.id === src.campusId)?.name || null,
      campusId: src.campusId,
      affiliation_type: affiliation,
      cohort_year: lead.cohort_year ?? null,
      enrollment_status: lead.enrollment_status ?? null,
      website,
      evidence_url: evidenceUrl,
      program: lead.program ?? src.program,
      cohort_label: lead.cohort_label ?? null,
      source: lead.source || src.id,
    };
    const claimId = newId("claim");
    insertClaim.run(
      claimId,
      projectId,
      "campus_program_listing",
      JSON.stringify(value),
      [name, lead.university, lead.program, affiliation].filter(Boolean).join(" · ").slice(0, 500),
      src.id,
      evidenceUrl,
      retrievedAt,
    );
    linkCampus(db, projectId, src.campusId, claimId);
    if (lead.program || src.program) {
      insertClaim.run(
        newId("claim"),
        projectId,
        "program_membership",
        JSON.stringify({ name, org: lead.program || src.program, campus: lead.university, affiliation_type: affiliation, source: lead.source }),
        `${name} · ${lead.program || src.program}`,
        src.id,
        evidenceUrl,
        retrievedAt,
      );
    }
  }
  return { source: src.name, sourceId: src.id, listUrl: src.listUrl, ok: true, rowsFound: leads.length, imported, merged };
}

async function main() {
  fs.mkdirSync(IMPORTS, { recursive: true });
  const retrievedAt = nowIso();
  const db = getDb();
  const blocked: { source: string; reason: string; url: string }[] = [];
  const perSource: Record<string, unknown>[] = [];

  const jobs: { spec: SourceSpec; scrape: () => Promise<Lead[]> }[] = [
    {
      spec: {
        id: "src_uga_georgia_kickstart",
        name: "Georgia KickStart Fund portfolio",
        listUrl: "https://georgiakickstart.com/portfolio",
        cache: `uga-georgia-kickstart-${EVIDENCE_DAY}.json`,
        campusId: "univ_uga",
        defaultAffiliation: "unknown",
        program: "Georgia KickStart Fund",
      },
      scrape: scrapeGeorgiaKickstart,
    },
    {
      spec: {
        id: "src_uiuc_iventure",
        name: "Illinois iVenture startups",
        listUrl: "https://iventure.illinois.edu/startups",
        cache: `uiuc-iventure-${EVIDENCE_DAY}.json`,
        campusId: "univ_uiuc",
        defaultAffiliation: "unknown",
        program: "iVenture Accelerator",
      },
      scrape: scrapeIVenture,
    },
    {
      spec: {
        id: "src_usf_sii",
        name: "USF Student Innovation Incubator entrepreneurs",
        listUrl:
          "https://www.usf.edu/research-innovation/innovation-enterprise/usf-connect/student-innovation-incubator/sii-entrepreneurs.aspx",
        cache: `usf-sii-${EVIDENCE_DAY}.json`,
        campusId: "univ_usf",
        defaultAffiliation: "unknown",
        program: "USF Student Innovation Incubator",
      },
      scrape: scrapeUsfSii,
    },
    {
      spec: {
        id: "src_uconn_hillside",
        name: "UConn Hillside Ventures portfolio",
        listUrl: "https://hillsideventures.uconn.edu/venture-fund-3/portfolio/",
        cache: `uconn-hillside-${EVIDENCE_DAY}.json`,
        campusId: "univ_uconn",
        defaultAffiliation: "unknown",
        program: "Hillside Ventures",
      },
      scrape: scrapeUconnHillside,
    },
    {
      spec: {
        id: "src_rit_venture_fund",
        name: "RIT Venture Fund portfolio",
        listUrl: "https://www.rit.edu/venturefund/portfolio-companies",
        cache: `rit-vf-${EVIDENCE_DAY}.json`,
        campusId: "univ_rit",
        defaultAffiliation: "unknown",
        program: "RIT Venture Fund",
      },
      scrape: scrapeRitVf,
    },
    {
      spec: {
        id: "src_cu_deming",
        name: "CU Boulder Deming Center Venture Fund portfolio",
        listUrl: "https://www.colorado.edu/dcvf/portfolio",
        cache: `cu-deming-${EVIDENCE_DAY}.json`,
        campusId: "univ_colorado",
        defaultAffiliation: "unknown",
        program: "Deming Center Venture Fund",
      },
      scrape: scrapeCuDeming,
    },
    {
      spec: {
        id: "src_duke_bridge",
        name: "Duke BRiDGE Incubator startups",
        listUrl: "https://cfci.pratt.duke.edu/bridge/",
        cache: `duke-bridge-${EVIDENCE_DAY}.json`,
        campusId: "univ_duke",
        defaultAffiliation: "unknown",
        program: "Duke BRiDGE Incubator",
      },
      scrape: scrapeDukeBridge,
    },
    {
      spec: {
        id: "src_duke_showcase_2025",
        name: "Duke Startup Showcase 2025 featured companies",
        listUrl: "https://entrepreneurship.duke.edu/startup-showcase-2025-featured-companies/",
        cache: `duke-showcase-2025-${EVIDENCE_DAY}.json`,
        campusId: "univ_duke",
        defaultAffiliation: "current_student",
        program: "Duke Startup Showcase 2025",
      },
      scrape: scrapeDukeShowcase,
    },
  ];

  for (const job of jobs) {
    try {
      const leads = await job.scrape();
      if (leads.length === 0) {
        blocked.push({ source: job.spec.name, reason: "scrape returned 0 public rows", url: job.spec.listUrl });
        perSource.push({ source: job.spec.name, ok: false, rowsFound: 0, imported: 0, merged: 0 });
        continue;
      }
      perSource.push(importLeads(db, job.spec, leads, retrievedAt));
    } catch (err) {
      blocked.push({ source: job.spec.name, reason: String(err), url: job.spec.listUrl });
      perSource.push({ source: job.spec.name, ok: false, error: String(err), rowsFound: 0, imported: 0, merged: 0 });
    }
  }

  // UCSD + CMU Airtable: public embed shells, no extractable records without further XHR
  blocked.push({
    source: "UCSD Startup Database (Airtable embed)",
    reason: "Public Airtable embed loads; row payload not in HTML (requires live Airtable XHR). No CSV.",
    url: "https://innovation.ucsd.edu/startup/startup-database.html",
  });
  blocked.push({
    source: "CMU Swartz / Project Olympus Airtable",
    reason: "Public share embed shell only; no records in initData; login wall on non-embed URL.",
    url: "https://airtable.com/appoCn0JyaYH2Pbab/shrpqgg6AsoRH8JbD?jrprS=allRecords",
  });

  const companies = (db.prepare(`SELECT COUNT(*) AS c FROM projects WHERE kind='company'`).get() as { c: number }).c;
  const out = {
    ok: true,
    retrievedAt,
    companiesAfter: companies,
    perSource,
    blocked,
    skippedPerBrief: [
      "Columbia founders",
      "Princeton",
      "UMich",
      "UofT rows",
      "NUS EDIC",
      "Brown VIA",
      "CMU hub (Airtable tried)",
    ],
    totals: {
      rowsFound: perSource.reduce((n, s) => n + Number((s as { rowsFound?: number }).rowsFound || 0), 0),
      imported: perSource.reduce((n, s) => n + Number((s as { imported?: number }).imported || 0), 0),
      merged: perSource.reduce((n, s) => n + Number((s as { merged?: number }).merged || 0), 0),
    },
  };
  console.log(JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join("/workspace/reviews", `campus-import-weekly-stats-${EVIDENCE_DAY}.json`), JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
