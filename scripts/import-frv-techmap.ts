/**
 * Import startups/spinouts from FRV Campus Tech Maps (CC BY 4.0):
 *   https://ubc-techmap.vercel.app/data.json
 *   https://sfu-techmap.vercel.app/data.json
 *
 * Funding / programs / clubs / labs / events are NOT companies — listed in the
 * report and skipped (no campus-ecosystem table for those shapes).
 *
 *   npx tsx scripts/import-frv-techmap.ts
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { CAMPUSES } from "../lib/domain/campuses";
import { normalizeCompanyName, websiteIdentity } from "../lib/domain/dedupe";
import { classifyDescription } from "../lib/domain/sectors";
import { getDb, newId, nowIso } from "../lib/db/client";
import { assembleProjectFacts } from "../lib/domain/facts";
import { evaluateAllGates } from "../lib/screening/gates";

const UA = "CampusScoutBot/0.1 (+research; polite; campus scout corpus)";

type TechmapStartup = {
  name: string;
  one_liner?: string;
  vertical?: string;
  stage?: string;
  founded_year?: number | null;
  website?: string | null;
  student_founded?: boolean;
  ubc_affiliation?: string;
  sfu_affiliation?: string;
  sources?: string[];
  source_note?: string;
  last_verified?: string;
  tags?: string[];
};

type TechmapFile = {
  generated?: string;
  last_verified?: string;
  license?: string;
  source?: string;
  counts?: Record<string, number>;
  startups?: TechmapStartup[];
  funding?: unknown[];
  programs?: unknown[];
  clubs?: unknown[];
  labs?: unknown[];
  events?: unknown[];
};

const SOURCES = [
  {
    id: "src_frv_ubc_techmap",
    name: "UBC Tech Map (FRV)",
    campusId: "univ_ubc",
    listUrl: "https://ubc-techmap.vercel.app/",
    dataUrl: "https://ubc-techmap.vercel.app/data.json",
    cache: "data/imports/ubc-techmap-data.json",
    attribution: "UBC Tech Map — CC BY 4.0 — https://github.com/notjosh37/UBC-techmap",
  },
  {
    id: "src_frv_sfu_techmap",
    name: "SFU Tech Map (FRV)",
    campusId: "univ_sfu",
    listUrl: "https://sfu-techmap.vercel.app/",
    dataUrl: "https://sfu-techmap.vercel.app/data.json",
    cache: "data/imports/sfu-techmap-data.json",
    attribution: "SFU Tech Map — CC BY 4.0 — https://github.com/EthanCratchley/SFU-techmap",
  },
] as const;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url: string): Promise<TechmapFile> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return (await res.json()) as TechmapFile;
}

function ensureUniversities(db: Database.Database) {
  const stmt = db.prepare(
    `INSERT INTO universities (id, name, aliases_json, country, lat, lon, coord_source)
     VALUES (@id, @name, @aliases, @country, @lat, @lon, @coord_source)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, aliases_json=excluded.aliases_json,
       country=excluded.country, lat=excluded.lat, lon=excluded.lon, coord_source=excluded.coord_source`,
  );
  for (const u of CAMPUSES) {
    stmt.run({
      id: u.id,
      name: u.name,
      aliases: JSON.stringify(u.aliases),
      country: u.country,
      lat: u.lat,
      lon: u.lon,
      coord_source: u.coordSource,
    });
  }
}

function ensureSource(db: Database.Database, id: string, name: string, url: string, campusId: string, retrievedAt: string, rationale: string) {
  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at, last_success_at, source_role, tier_rationale)
     VALUES (?, ?, 'campus_builder_org', ?, ?, 2, 'json_fetch', 'available', ?, ?, 'discovery', ?)
     ON CONFLICT(id) DO UPDATE SET last_attempt_at=excluded.last_attempt_at, last_success_at=excluded.last_success_at, status='available'`,
  ).run(id, name, url, JSON.stringify([campusId]), retrievedAt, retrievedAt, rationale);
}

function linkCompanyCampus(db: Database.Database, projectId: string, campusId: string, claimId: string | null) {
  const existing = db
    .prepare(
      `SELECT id FROM relationships WHERE source_entity_type='project' AND source_entity_id=? AND target_entity_type='university' AND target_entity_id=? AND relationship_type='affiliated_with'`,
    )
    .get(projectId, campusId);
  if (existing) return;
  db.prepare(
    `INSERT INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json, verification_state)
     VALUES (?, 'project', ?, 'university', ?, 'affiliated_with', ?, 'affiliation_only')`,
  ).run(newId("rel"), projectId, campusId, JSON.stringify(claimId ? [claimId] : []));
}

function findExisting(db: Database.Database, name: string, website: string | null, campusId: string): string | null {
  // Corrected dedupe: domain/website first; else name+campus. NEVER name alone.
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
  if (!nameHits.length) return null;
  const onCampus = nameHits.filter((r) =>
    db
      .prepare(
        `SELECT 1 FROM relationships WHERE source_entity_type='project' AND source_entity_id=? AND target_entity_type='university' AND target_entity_id=? AND relationship_type='affiliated_with'`,
      )
      .get(r.id, campusId),
  );
  if (onCampus.length >= 1) return onCampus[0].id;
  return null;
}

function rowSourceUrl(startup: TechmapStartup, listUrl: string): string {
  const fromSources = (startup.sources || []).find((u) => /^https?:\/\//i.test(u));
  if (fromSources) return fromSources;
  if (startup.website && /^https?:\/\//i.test(startup.website)) return startup.website;
  return listUrl;
}

async function importOne(
  db: Database.Database,
  src: (typeof SOURCES)[number],
  retrievedAt: string,
): Promise<Record<string, unknown>> {
  ensureSource(db, src.id, src.name, src.listUrl, src.campusId, retrievedAt, src.attribution);

  let data: TechmapFile;
  let raw: string;
  if (process.env.FRV_USE_CACHE === "1" && fs.existsSync(src.cache)) {
    raw = fs.readFileSync(src.cache, "utf8");
    data = JSON.parse(raw);
    console.log(`using cache ${src.cache}`);
  } else {
    await sleep(400);
    console.log(`fetching ${src.dataUrl}`);
    data = await fetchJson(src.dataUrl);
    raw = JSON.stringify(data);
    fs.writeFileSync(src.cache, JSON.stringify(data, null, 2));
  }

  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  db.prepare(
    `INSERT INTO snapshots (id, source_id, url, content_hash, fetched_at, http_status, raw_excerpt) VALUES (?, ?, ?, ?, ?, 200, ?)`,
  ).run(newId("snap"), src.id, src.dataUrl, hash, retrievedAt, `${src.name} data.json (${data.startups?.length ?? 0} startups)`);

  const skippedSections = {
    funding: data.funding?.length ?? 0,
    programs: data.programs?.length ?? 0,
    clubs: data.clubs?.length ?? 0,
    labs: data.labs?.length ?? 0,
    events: data.events?.length ?? 0,
  };

  const startups = data.startups ?? [];
  let imported = 0;
  let merged = 0;
  const skipped: { name: string; reason: string }[] = [];
  const merges: { name: string; id: string; reason: string; sourceUrl: string }[] = [];

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

  for (const s of startups) {
    const name = (s.name || "").trim();
    if (!name) {
      skipped.push({ name: "(empty)", reason: "empty name" });
      continue;
    }
    const website = s.website?.trim() || null;
    const sourceUrl = rowSourceUrl(s, src.listUrl);
    const existing = findExisting(db, name, website, src.campusId);
    const desc = s.one_liner?.trim() || null;
    const sectorHits = desc ? classifyDescription(desc) : [];
    const sector = sectorHits[0]?.label ?? s.vertical ?? null;
    const note = `${src.attribution}`;
    const linkKind = website ? "website" : "other";

    let projectId = existing;
    if (!projectId) {
      projectId = newId("proj");
      insertProject.run(
        projectId,
        name,
        sector,
        desc,
        website,
        retrievedAt,
        retrievedAt,
        website || sourceUrl,
        linkKind,
        (s.last_verified || retrievedAt).slice(0, 10),
        note,
      );
      imported++;
    } else {
      updateProject.run(desc, website, retrievedAt, website || sourceUrl, (s.last_verified || retrievedAt).slice(0, 10), note, projectId);
      merged++;
      merges.push({
        name,
        id: projectId,
        reason: websiteIdentity(website) ? "website identity" : "normalized name (+ campus)",
        sourceUrl,
      });
    }

    const claimId = newId("claim");
    const value = {
      name,
      campusId: src.campusId,
      vertical: s.vertical ?? null,
      stage: s.stage ?? null,
      foundedYear: s.founded_year ?? null,
      studentFounded: s.student_founded ?? null,
      affiliation: s.ubc_affiliation ?? s.sfu_affiliation ?? null,
      website,
      license: data.license ?? "CC BY 4.0",
      techmap: src.listUrl,
      attribution: src.attribution,
      upstreamSources: s.sources ?? [],
    };
    const excerpt = [name, desc, src.attribution].filter(Boolean).join(" · ").slice(0, 500);
    insertClaim.run(claimId, projectId, "frv_techmap_listing", JSON.stringify(value), excerpt, src.id, sourceUrl, retrievedAt);
    linkCompanyCampus(db, projectId, src.campusId, claimId);

    if (s.founded_year && s.founded_year >= 1900 && s.founded_year <= 2100) {
      insertClaim.run(
        newId("claim"),
        projectId,
        "founded_year",
        JSON.stringify({ year: s.founded_year, source: src.id }),
        `${name} founded ${s.founded_year}`,
        src.id,
        sourceUrl,
        retrievedAt,
      );
    }

    try {
      assembleProjectFacts(db, projectId);
      evaluateAllGates(db, projectId);
    } catch {
      /* non-fatal */
    }
  }

  return {
    source: src.name,
    listUrl: src.listUrl,
    license: data.license ?? "CC BY 4.0",
    attribution: src.attribution,
    github: data.source ?? null,
    rowsFound: startups.length,
    imported,
    merged,
    skipped,
    merges,
    skippedSections,
    counts: data.counts ?? null,
  };
}

async function main() {
  const retrievedAt = nowIso();
  const db = getDb();
  ensureUniversities(db);

  const perSource = [];
  for (const src of SOURCES) {
    perSource.push(await importOne(db, src, retrievedAt));
  }

  const reportDir = "/workspace/reviews";
  fs.mkdirSync(reportDir, { recursive: true });
  const dedupePath = path.join(reportDir, "frv-techmap-dedupe-list-2026-11-02.md");
  const lines = [
    `# FRV Campus Tech Map import (UBC + SFU)`,
    ``,
    `Retrieved: ${retrievedAt}`,
    `License: CC BY 4.0 (per-source attribution kept on each claim).`,
    ``,
  ];
  for (const s of perSource as any[]) {
    lines.push(`## ${s.source}`);
    lines.push(``);
    lines.push(`- URL: ${s.listUrl}`);
    lines.push(`- Attribution: ${s.attribution}`);
    lines.push(`- Rows found: ${s.rowsFound}`);
    lines.push(`- Imported (new): ${s.imported}`);
    lines.push(`- Merged: ${s.merged}`);
    lines.push(`- Skipped companies: ${s.skipped.length}`);
    lines.push(
      `- Skipped non-company sections (no ecosystem table): funding=${s.skippedSections.funding}, programs=${s.skippedSections.programs}, clubs=${s.skippedSections.clubs}, labs=${s.skippedSections.labs}, events=${s.skippedSections.events}`,
    );
    lines.push(``);
    lines.push(`### Merged`);
    lines.push(``);
    lines.push(...(s.merges.length ? s.merges.map((m: any) => `- **${m.name}** → \`${m.id}\` (${m.reason}) · ${m.sourceUrl}`) : ["- (none)"]));
    lines.push(``);
    lines.push(`### Skipped companies`);
    lines.push(``);
    lines.push(...(s.skipped.length ? s.skipped.map((x: any) => `- ${x.name}: ${x.reason}`) : ["- (none)"]));
    lines.push(``);
  }
  fs.writeFileSync(dedupePath, lines.join("\n"));
  console.log(JSON.stringify({ ok: true, perSource, dedupePath }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
