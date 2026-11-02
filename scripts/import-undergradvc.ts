/**
 * Import startups from https://www.undergradvc.com/startups
 *
 * Data source: the public /startups HTML embeds all venture listings in the
 * Next.js RSC payload (855 rows). robots.txt allows / and /startups; it
 * disallows /api — this script never calls /api.
 *
 *   npx tsx scripts/import-undergradvc.ts
 *
 * Maps each venture to a company with provenance source=undergradvc and the
 * per-row UndergradVC URL. Competition wins become dated signals only when a
 * real year/date appears in the source text. Nothing invented.
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

const SOURCE_ID = "src_undergradvc_startups";
const LIST_URL = "https://www.undergradvc.com/startups";
const UA = "CampusScoutBot/0.1 (+research; polite; campus scout corpus)";
const CACHE = path.join(process.cwd(), "data/imports/undergradvc-ventures-2026-11-02.json");
const CAMPUS_MAP = path.join(process.cwd(), "data/imports/campus-additions-undergradvc-frv.json");

type Venture = {
  slug: string;
  name: string;
  description: string | null;
  institutionSlug: string | null;
  programSlug: string | null;
  fundingSought: number | null;
  source: string | null;
  verificationStatus: string | null;
  outcomeTier: string | null;
  competitionPlace: string | null;
  prizeWon: number | null;
  institutionName: string | null;
  programName: string | null;
  programType: string | null;
  listingKind: string;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

function extractVentures(html: string): Venture[] {
  const pushes = [...html.matchAll(/<script>self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/g)].map((m) => m[1]);
  const big = pushes
    .map((p) => {
      try {
        const arr = JSON.parse(p);
        return typeof arr[1] === "string" ? arr[1] : "";
      } catch {
        return "";
      }
    })
    .join("\n");
  // Walk every "listingKind":"startup" object via brace scan from preceding {
  const out: Venture[] = [];
  const seen = new Set<string>();
  let pos = 0;
  while (true) {
    const p = big.indexOf('"listingKind":"startup"', pos);
    if (p < 0) break;
    const slugKey = big.lastIndexOf('"slug":', p);
    if (slugKey < 0) {
      pos = p + 1;
      continue;
    }
    const brace = big.lastIndexOf("{", slugKey);
// Manual brace scan with JSON.parse slice
        let depth = 0;
    let end = -1;
    for (let i = brace; i < big.length; i++) {
      const ch = big[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end > brace) {
      try {
        const obj = JSON.parse(big.slice(brace, end).replace(/:\$undefined/g, ":null")) as Venture;
        if (obj.listingKind === "startup" && obj.slug && !seen.has(obj.slug)) {
          seen.add(obj.slug);
          // Normalize $undefined leftovers
          for (const k of Object.keys(obj) as (keyof Venture)[]) {
            if ((obj as any)[k] === "$undefined") (obj as any)[k] = null;
          }
          out.push(obj);
        }
      } catch {
        /* skip malformed */
      }
    }
    pos = p + 1;
  }
  return out;
}

function normName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|of|at|in)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function placeLabel(place: string | null): string | null {
  if (!place) return null;
  const map: Record<string, string> = {
    "1": "1st place",
    "2": "2nd place",
    "3": "3rd place",
    "grand-prize": "Grand prize",
    finalist: "Finalist",
  };
  return map[place] ?? place.replace(/-/g, " ");
}

/** Only accept a real year/date that appears in source text — never invent. */
function extractSignalDate(description: string | null, programName: string | null): string | null {
  const text = `${description ?? ""} ${programName ?? ""}`;
  // Prefer ISO dates if present
  const iso = text.match(/\b(20[12]\d)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/);
  if (iso) return iso[0];
  const year = text.match(/\b(20[12]\d)\b/);
  return year ? year[1] : null;
}

function ensureSource(db: Database.Database, retrievedAt: string) {
  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at, last_success_at, source_role, tier_rationale)
     VALUES (?, 'UndergradVC startups', 'campus_builder_org', ?, '[]', 2, 'html_scrape', 'available', ?, ?, 'discovery', ?)
     ON CONFLICT(id) DO UPDATE SET last_attempt_at=excluded.last_attempt_at, last_success_at=excluded.last_success_at, status='available'`,
  ).run(
    SOURCE_ID,
    LIST_URL,
    retrievedAt,
    retrievedAt,
    "Public UndergradVC /startups directory of campus-program ventures and competition winners.",
  );
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

function campusIndex(db: Database.Database) {
  const rows = db.prepare(`SELECT id, name, aliases_json FROM universities`).all() as {
    id: string;
    name: string;
    aliases_json: string;
  }[];
  const byNorm = new Map<string, string>();
  for (const r of rows) {
    byNorm.set(normName(r.name), r.id);
    for (const a of JSON.parse(r.aliases_json || "[]") as string[]) byNorm.set(normName(a), r.id);
  }
  const file = JSON.parse(fs.readFileSync(CAMPUS_MAP, "utf8")) as { mapping: Record<string, string> };
  return { byNorm, mapping: file.mapping };
}

function resolveCampus(name: string | null, idx: ReturnType<typeof campusIndex>): string | null {
  if (!name) return null;
  if (idx.mapping[name]) return idx.mapping[name];
  return idx.byNorm.get(normName(name)) ?? null;
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

function findExistingCompany(db: Database.Database, name: string, campusId: string | null): string | null {
  // Corrected dedupe: NEVER name alone. Match only name+campus (UGVC has no website/founders).
  if (!campusId) return null;
  const key = normalizeCompanyName(name);
  const rows = db
    .prepare(`SELECT id, name FROM projects WHERE kind='company'`)
    .all() as { id: string; name: string }[];
  const nameHits = rows.filter((r) => normalizeCompanyName(r.name) === key);
  if (nameHits.length === 0) return null;
  const onCampus = nameHits.filter((r) =>
    db
      .prepare(
        `SELECT 1 FROM relationships WHERE source_entity_type='project' AND source_entity_id=? AND target_entity_type='university' AND target_entity_id=? AND relationship_type='affiliated_with'`,
      )
      .get(r.id, campusId),
  );
  if (onCampus.length === 0) return null;
  if (onCampus.length === 1) return onCampus[0].id;
  const scored = onCampus
    .map((r) => {
      const claims = (db.prepare(`SELECT COUNT(*) AS c FROM claims WHERE entity_type='project' AND entity_id=?`).get(r.id) as { c: number }).c;
      return { id: r.id, claims };
    })
    .sort((a, b) => b.claims - a.claims);
  return scored[0]?.id ?? null;
}

async function main() {
  const retrievedAt = nowIso();
  const db = getDb();
  ensureSource(db, retrievedAt);
  ensureUniversities(db);
  const campuses = campusIndex(db);

  let ventures: Venture[];
  let htmlHash: string;
  if (process.env.UGVC_USE_CACHE === "1" && fs.existsSync(CACHE)) {
    ventures = JSON.parse(fs.readFileSync(CACHE, "utf8"));
    htmlHash = crypto.createHash("sha256").update(JSON.stringify(ventures)).digest("hex");
    console.log(`using cache ${CACHE} (${ventures.length} ventures)`);
  } else {
    console.log(`fetching ${LIST_URL}`);
    await sleep(400);
    const html = await fetchText(LIST_URL);
    htmlHash = crypto.createHash("sha256").update(html).digest("hex");
    ventures = extractVentures(html);
    fs.writeFileSync(CACHE, JSON.stringify(ventures, null, 2));
    console.log(`parsed ${ventures.length} ventures from RSC payload`);
  }

  db.prepare(
    `INSERT INTO snapshots (id, source_id, url, content_hash, fetched_at, http_status, raw_excerpt) VALUES (?, ?, ?, ?, ?, 200, ?)`,
  ).run(newId("snap"), SOURCE_ID, LIST_URL, htmlHash, retrievedAt, `UndergradVC startups directory (${ventures.length} ventures)`);

  const stats = {
    rowsFound: ventures.length,
    imported: 0,
    merged: 0,
    skipped: [] as { name: string; reason: string }[],
    signalsDated: 0,
    signalsSkippedNoDate: 0,
    newCampuses: 0,
  };

  const beforeUnis = (db.prepare(`SELECT COUNT(*) AS c FROM universities`).get() as { c: number }).c;

  const insertClaim = db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, source_url, retrieved_at, label, verification_state)
     VALUES (?, 'project', ?, ?, ?, ?, ?, ?, ?, 'observed_fact', 'observed')`,
  );
  const insertProject = db.prepare(
    `INSERT INTO projects (id, name, aliases_json, kind, sector, description, website_url, is_portfolio_reference, is_investable_candidate, created_at, updated_at, primary_link, primary_link_kind, verification_status, last_verified_at, verification_note)
     VALUES (?, ?, '[]', 'company', ?, ?, NULL, 0, 1, ?, ?, ?, 'other', 'confirmed', ?, ?)`,
  );
  const updateProject = db.prepare(
    `UPDATE projects SET description=COALESCE(description, ?), updated_at=?, primary_link=COALESCE(primary_link, ?), last_verified_at=?, verification_note=COALESCE(verification_note, ?) WHERE id=?`,
  );
  const insertSignal = db.prepare(
    `INSERT INTO signals (id, project_id, signal_type, current_observation, source_date, significance_note, claim_ids_json)
     VALUES (?, ?, 'competition_win', ?, ?, ?, ?)`,
  );

  const dedupeList: { keep: string; merge: string; reason: string; sourceUrl: string }[] = [];

  for (const v of ventures) {
    const name = (v.name || "").trim();
    if (!name) {
      stats.skipped.push({ name: v.slug, reason: "empty name" });
      continue;
    }
    const sourceUrl = `https://www.undergradvc.com/startups/${v.slug}`;
    const campusId = resolveCampus(v.institutionName, campuses);
    if (!campusId) {
      stats.skipped.push({ name, reason: `unmapped campus: ${v.institutionName}` });
      continue;
    }

    const existingId = findExistingCompany(db, name, campusId);
    let projectId = existingId;
    const desc = v.description?.trim() || null;
    const sectorHits = desc ? classifyDescription(desc) : [];
    const sector = sectorHits[0]?.label ?? null;
    const note = `UndergradVC ${v.outcomeTier ?? "listing"} · ${v.institutionName ?? "campus"}`;

    if (!projectId) {
      projectId = newId("proj");
      insertProject.run(projectId, name, sector, desc, retrievedAt, retrievedAt, sourceUrl, retrievedAt.slice(0, 10), note);
      stats.imported++;
    } else {
      updateProject.run(desc, retrievedAt, sourceUrl, retrievedAt.slice(0, 10), note, projectId);
      stats.merged++;
      dedupeList.push({
        keep: projectId,
        merge: name,
        reason: `normalized name+campus match (${campusId})`,
        sourceUrl,
      });
    }

    const claimId = newId("claim");
    const value = {
      name,
      campus: v.institutionName,
      campusId,
      program: v.programName && v.programName !== "$undefined" ? v.programName : null,
      programSlug: v.programSlug,
      outcomeTier: v.outcomeTier,
      competitionPlace: v.competitionPlace,
      prizeWon: v.prizeWon,
      source: "undergradvc",
      undergradvcUrl: sourceUrl,
    };
    const excerpt = [name, v.institutionName, v.programName !== "$undefined" ? v.programName : null, desc]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 500);
    insertClaim.run(claimId, projectId, "undergradvc_listing", JSON.stringify(value), excerpt, SOURCE_ID, sourceUrl, retrievedAt);
    linkCompanyCampus(db, projectId, campusId, claimId);

    if (v.programName && v.programName !== "$undefined") {
      insertClaim.run(
        newId("claim"),
        projectId,
        "program_membership",
        JSON.stringify({ name, org: v.programName, campus: v.institutionName, source: "undergradvc" }),
        `${name} · ${v.programName}`,
        SOURCE_ID,
        sourceUrl,
        retrievedAt,
      );
    }

    const isCompetition = v.outcomeTier === "competition-winner" || v.competitionPlace || v.prizeWon != null;
    if (isCompetition) {
      const date = extractSignalDate(desc, v.programName !== "$undefined" ? v.programName : null);
      if (date) {
        const place = placeLabel(v.competitionPlace);
        const prize = v.prizeWon != null ? `$${Number(v.prizeWon).toLocaleString("en-US")} prize` : null;
        const obs = [place, prize, v.programName !== "$undefined" ? v.programName : null, v.institutionName]
          .filter(Boolean)
          .join(" · ");
        const dup = db
          .prepare(
            `SELECT id FROM signals WHERE project_id=? AND signal_type='competition_win' AND IFNULL(source_date,'')=? AND current_observation=?`,
          )
          .get(projectId, date, obs);
        if (!dup) {
          insertSignal.run(newId("sig"), projectId, obs || "Competition winner", date, desc?.slice(0, 280) ?? null, JSON.stringify([claimId]));
          stats.signalsDated++;
        }
      } else {
        stats.signalsSkippedNoDate++;
      }
    }

    try {
      const facts = assembleProjectFacts(db, projectId);
      evaluateAllGates(facts);
    } catch {
      /* non-fatal */
    }
  }

  const afterUnis = (db.prepare(`SELECT COUNT(*) AS c FROM universities`).get() as { c: number }).c;
  stats.newCampuses = Math.max(0, afterUnis - beforeUnis);

  const reportDir = "/workspace/reviews";
  fs.mkdirSync(reportDir, { recursive: true });
  const dedupePath = path.join(reportDir, "undergradvc-dedupe-list-2026-11-02.md");
  const lines = [
    `# UndergradVC import dedupe list`,
    ``,
    `Retrieved: ${retrievedAt}`,
    `Rows found: ${stats.rowsFound}`,
    `New companies: ${stats.imported}`,
    `Merged into existing: ${stats.merged}`,
    `Skipped: ${stats.skipped.length}`,
    `Dated competition signals: ${stats.signalsDated}`,
    `Competition rows without a date (no signal): ${stats.signalsSkippedNoDate}`,
    ``,
    `## Merged`,
    ``,
    ...dedupeList.map((d) => `- **${d.merge}** → \`${d.keep}\` (${d.reason}) · ${d.sourceUrl}`),
    ``,
    `## Skipped`,
    ``,
    ...(stats.skipped.length ? stats.skipped.map((s) => `- ${s.name}: ${s.reason}`) : ["- (none)"]),
    ``,
  ];
  fs.writeFileSync(dedupePath, lines.join("\n"));

  console.log(JSON.stringify({ ok: true, ...stats, dedupePath, dedupeMerges: dedupeList.length }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
