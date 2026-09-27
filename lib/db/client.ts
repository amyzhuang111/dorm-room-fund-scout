import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const BUNDLED_DB_PATH = path.join(process.cwd(), "data", "campus-universe.db");

// Vercel's Lambda filesystem is read-only outside /tmp — but SQLite needs to
// write a -wal/-shm (or rollback journal) file next to the .db file even for
// plain reads. So on Vercel we copy the bundled, ingested database into /tmp
// on cold start and open it there. Writes (e.g. pipeline status updates) then
// only live for that lambda instance's lifetime — real, but not durable across
// cold starts/instances. Locally (or any non-Vercel host with a persistent
// disk) we just open data/campus-universe.db directly, and writes are durable.
const DB_PATH =
  process.env.CAMPUS_UNIVERSE_DB_PATH ||
  (process.env.VERCEL ? path.join("/tmp", "campus-universe.db") : BUNDLED_DB_PATH);

export function databasePath(): string {
  return DB_PATH;
}

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  if (DB_PATH !== BUNDLED_DB_PATH && !fs.existsSync(DB_PATH)) {
    if (fs.existsSync(BUNDLED_DB_PATH)) {
      fs.copyFileSync(BUNDLED_DB_PATH, DB_PATH);
    } else {
      console.error(
        "campus-universe.db was not found in this deployment. Serving an empty database until the bundled file is included."
      );
    }
  }

  const db = openDatabase(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 8000");
  const schema = fs.readFileSync(path.join(process.cwd(), "lib", "db", "schema.sql"), "utf8");
  db.exec(schema);
  migrate(db);
  _db = db;
  return db;
}

function isMalformedSchema(err: unknown): boolean {
  return err instanceof Error && err.message.includes("malformed database schema");
}

function sidecarPaths(dbPath: string): string[] {
  return [`${dbPath}-wal`, `${dbPath}-shm`];
}

// sqlite3_close() checkpoints the WAL. If the WAL is what made the schema
// unreadable, that checkpoint writes the bad pages into the main file.
// Move the sidecars out of the way first, and tolerate a Windows lock by
// copying then deleting.
function discardSidecars(dbPath: string): string[] {
  const parked: string[] = [];
  for (const file of sidecarPaths(dbPath)) {
    if (!fs.existsSync(/*turbopackIgnore: true*/ file)) continue;
    const dest = path.join(
      os.tmpdir(),
      `${path.basename(file)}.stale-${process.pid}-${Date.now()}`
    );
    try {
      fs.renameSync(/*turbopackIgnore: true*/ file, dest);
    } catch {
      fs.copyFileSync(/*turbopackIgnore: true*/ file, dest);
      fs.rmSync(/*turbopackIgnore: true*/ file, { force: true });
    }
    parked.push(dest);
  }
  return parked;
}

// The committed database's schema is a multi-page btree (page 1 points at
// leaf pages, including page 46 in the current file). SQLite does not tie a
// -wal/-shm to a database generation: after git replaces campus-universe.db,
// a leftover sidecar pair from the previous file is replayed on open. A frame
// that lands on a schema leaf makes SQLite parse ordinary rows as schema
// objects. The reported name is then a person id such as
// "person_JnrZGMsft6bk", and init fails with "orphan index" while the main
// file bytes are still the committed blob — until close() checkpoints.
//
// When sidecars are present, probe sqlite_master before using the connection.
// If that probe fails, put the pre-open bytes back and reopen without the
// sidecars. A WAL that still describes this file probes clean and is kept.
export function openDatabase(dbPath: string): Database.Database {
  const hasSidecar = sidecarPaths(dbPath).some((file) => fs.existsSync(/*turbopackIgnore: true*/ file));
  if (!hasSidecar || !fs.existsSync(/*turbopackIgnore: true*/ dbPath)) return new Database(dbPath);

  const backup = path.join(os.tmpdir(), `campus-universe-open-${process.pid}-${Date.now()}.db`);
  fs.copyFileSync(/*turbopackIgnore: true*/ dbPath, backup);
  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath);
    db.prepare("SELECT name FROM sqlite_master LIMIT 1").get();
    fs.rmSync(/*turbopackIgnore: true*/ backup, { force: true });
    return db;
  } catch (err) {
    if (!isMalformedSchema(err)) {
      fs.rmSync(/*turbopackIgnore: true*/ backup, { force: true });
      throw err;
    }
    const parked: string[] = [];
    if (db) {
      parked.push(...discardSidecars(dbPath));
      try {
        db.close();
      } catch {
        // close can still checkpoint; the backup restore below undoes it
      }
    }
    fs.copyFileSync(/*turbopackIgnore: true*/ backup, dbPath);
    fs.rmSync(/*turbopackIgnore: true*/ backup, { force: true });
    parked.push(...discardSidecars(dbPath));
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `SQLite could not read ${dbPath}: ${message}. A stale -wal/-shm was replaying onto this file. Moved it aside${
        parked.length ? ` (${parked.join(", ")})` : ""
      } and reopened the main database.`
    );
    return new Database(dbPath);
  }
}

// getDb() re-runs schema.sql on every process start, but CREATE TABLE IF NOT
// EXISTS can't add a column to a table that already exists from before that
// column was introduced. This adds any missing columns by hand, once, so
// existing databases (including the one already bundled/committed) pick up
// schema changes without needing a full re-ingest.
function migrate(db: Database.Database) {
  const addColumnIfMissing = (table: string, column: string, ddl: string) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    }
  };

  addColumnIfMissing("sources", "founder_scout_tier", "founder_scout_tier TEXT");
  addColumnIfMissing("sources", "startup_scout_tier", "startup_scout_tier TEXT");
  addColumnIfMissing("sources", "quality_dimensions_json", "quality_dimensions_json TEXT NOT NULL DEFAULT '{}'");
  addColumnIfMissing("sources", "source_role", "source_role TEXT");
  addColumnIfMissing("sources", "tier_rationale", "tier_rationale TEXT");
  addColumnIfMissing("sources", "tier_override_by", "tier_override_by TEXT");
  addColumnIfMissing("sources", "tier_override_at", "tier_override_at TEXT");
  addColumnIfMissing("sources", "tier_override_reason", "tier_override_reason TEXT");

  // Reddit / community-discussion signal — see lib/domain/community-signal.ts.
  // Source-ranking input only, never a Founder Signal / eligibility input.
  addColumnIfMissing("sources", "community_signal_json", "community_signal_json TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing("sources", "community_confidence", "community_confidence TEXT");
  addColumnIfMissing("sources", "reddit_mention_count", "reddit_mention_count INTEGER");
  addColumnIfMissing("sources", "reddit_independent_mentions", "reddit_independent_mentions INTEGER");
  addColumnIfMissing("sources", "reddit_positive_mentions", "reddit_positive_mentions INTEGER");
  addColumnIfMissing("sources", "reddit_negative_mentions", "reddit_negative_mentions INTEGER");
  addColumnIfMissing("sources", "community_rationale", "community_rationale TEXT");
  addColumnIfMissing("sources", "reddit_last_checked_at", "reddit_last_checked_at TEXT");

  addColumnIfMissing("people", "enrollment_status", "enrollment_status TEXT");
  addColumnIfMissing("people", "enrollment_label", "enrollment_label TEXT");
  addColumnIfMissing("people", "enrollment_evidence", "enrollment_evidence TEXT");
  addColumnIfMissing("people", "enrollment_source_url", "enrollment_source_url TEXT");
  addColumnIfMissing("people", "enrollment_source_id", "enrollment_source_id TEXT");
  addColumnIfMissing("people", "enrollment_grad_year", "enrollment_grad_year INTEGER");
  addColumnIfMissing("people", "enrollment_basis", "enrollment_basis TEXT");

  addColumnIfMissing("projects", "primary_link", "primary_link TEXT");
  addColumnIfMissing("projects", "primary_link_kind", "primary_link_kind TEXT");
  addColumnIfMissing("projects", "signal_tier", "signal_tier TEXT");
  addColumnIfMissing("projects", "signal_tier_basis", "signal_tier_basis TEXT");
  addColumnIfMissing("people", "signal_tier", "signal_tier TEXT");
  addColumnIfMissing("people", "signal_tier_basis", "signal_tier_basis TEXT");
  addColumnIfMissing("people", "left_school", "left_school INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing("people", "founder_status", "founder_status TEXT");
  addColumnIfMissing("people", "potential_signal", "potential_signal TEXT");
  addColumnIfMissing("people", "verification_status", "verification_status TEXT");
  addColumnIfMissing("people", "last_verified_at", "last_verified_at TEXT");
  addColumnIfMissing("people", "verification_note", "verification_note TEXT");
  addColumnIfMissing("projects", "verification_status", "verification_status TEXT");
  addColumnIfMissing("projects", "last_verified_at", "last_verified_at TEXT");
  addColumnIfMissing("projects", "verification_note", "verification_note TEXT");
  db.exec(`CREATE TABLE IF NOT EXISTS entity_redirects (
    old_id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    survivor_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    merged_at TEXT NOT NULL
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_entity_redirects_survivor ON entity_redirects(survivor_id)`);

  db.exec(`CREATE TABLE IF NOT EXISTS precollege_signals (
    id TEXT PRIMARY KEY,
    person_id TEXT NOT NULL REFERENCES people(id),
    signal_type TEXT NOT NULL,
    tier INTEGER NOT NULL,
    label TEXT NOT NULL,
    year INTEGER,
    match_status TEXT NOT NULL,
    school TEXT,
    source_url TEXT NOT NULL,
    excerpt TEXT NOT NULL,
    claim_id TEXT REFERENCES claims(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_precollege_person_signal
    ON precollege_signals(person_id, signal_type, IFNULL(year, 0), source_url)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_precollege_person ON precollege_signals(person_id)`);

  db.exec(`CREATE TABLE IF NOT EXISTS drf_alumni (
    id TEXT PRIMARY KEY,
    person_id TEXT NOT NULL REFERENCES people(id),
    name TEXT NOT NULL,
    drf_team TEXT,
    university_id TEXT,
    school_label TEXT,
    program_id TEXT,
    program_label TEXT,
    year_start INTEGER,
    year_end INTEGER,
    class_year INTEGER,
    current_firm TEXT,
    current_role TEXT,
    firm_type TEXT,
    firm_confidence TEXT,
    linkedin_confidence TEXT,
    linkedin_url TEXT,
    linkedin_source_url TEXT,
    location TEXT,
    verification_note TEXT,
    investor_id TEXT,
    source_url TEXT NOT NULL,
    firm_source_url TEXT,
    sources_json TEXT NOT NULL DEFAULT '[]',
    confidence TEXT NOT NULL,
    excerpt TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(person_id)
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_drf_alumni_person ON drf_alumni(person_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_drf_alumni_investor ON drf_alumni(investor_id)`);
  addColumnIfMissing("drf_alumni", "firm_type", "firm_type TEXT");
  addColumnIfMissing("drf_alumni", "firm_confidence", "firm_confidence TEXT");
  addColumnIfMissing("drf_alumni", "linkedin_confidence", "linkedin_confidence TEXT");
  addColumnIfMissing("drf_alumni", "linkedin_url", "linkedin_url TEXT");
  addColumnIfMissing("drf_alumni", "linkedin_source_url", "linkedin_source_url TEXT");
  addColumnIfMissing("drf_alumni", "location", "location TEXT");
  addColumnIfMissing("drf_alumni", "verification_note", "verification_note TEXT");

  db.exec(`CREATE TABLE IF NOT EXISTS program_signals (
    id TEXT PRIMARY KEY,
    person_id TEXT NOT NULL REFERENCES people(id),
    signal_type TEXT NOT NULL,
    label TEXT NOT NULL,
    year INTEGER,
    match_status TEXT NOT NULL,
    source_url TEXT NOT NULL,
    excerpt TEXT NOT NULL,
    claim_id TEXT REFERENCES claims(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_program_person_signal
    ON program_signals(person_id, signal_type, IFNULL(year, 0), source_url)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_program_person ON program_signals(person_id)`);
  addColumnIfMissing("program_signals", "tier", "tier TEXT");
  addColumnIfMissing("program_signals", "tier_rationale", "tier_rationale TEXT");
  addColumnIfMissing("program_signals", "tier_source_url", "tier_source_url TEXT");

  db.exec(`CREATE TABLE IF NOT EXISTS accuracy_audit (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    field TEXT,
    old_value TEXT,
    new_value TEXT,
    reason TEXT NOT NULL,
    evidence_url TEXT,
    checked_at TEXT NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_accuracy_audit_entity ON accuracy_audit(entity_type, entity_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_accuracy_audit_action ON accuracy_audit(action)`);
  db.exec(`CREATE TABLE IF NOT EXISTS accuracy_audit_runs (
    id TEXT PRIMARY KEY,
    checked_at TEXT NOT NULL,
    founders_checked INTEGER NOT NULL,
    startups_checked INTEGER NOT NULL,
    facts_checked INTEGER NOT NULL,
    summary_json TEXT NOT NULL
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS company_facts (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    fact_key TEXT NOT NULL,
    value_text TEXT NOT NULL,
    amount_usd REAL,
    amount_status TEXT,
    detail_json TEXT NOT NULL DEFAULT '{}',
    source_url TEXT NOT NULL,
    excerpt TEXT NOT NULL,
    origin TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS project_sector_tags (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    tag TEXT NOT NULL,
    is_primary INTEGER NOT NULL DEFAULT 0,
    excerpt TEXT NOT NULL,
    source_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(project_id, tag)
  )`);

  // Pipeline stages consolidated: "Meet" renamed to "Contact planned" (same
  // meaning, clearer label), and "Watching" dropped as a distinct status —
  // the watch queue now keys off due_date directly (see listCandidateProjects),
  // so existing "Watching" rows fold back into "Researching".
  addColumnIfMissing("news_articles", "source_type", "source_type TEXT NOT NULL DEFAULT 'press'");
  db.exec(`CREATE INDEX IF NOT EXISTS idx_news_articles_source_type ON news_articles(source_type)`);

  db.prepare(`UPDATE pipeline_entries SET status = 'Contact planned' WHERE status = 'Meet'`).run();
  db.prepare(`UPDATE pipeline_entries SET status = 'Researching' WHERE status = 'Watching'`).run();

  // FOUNDER_SCOUT_SOURCING.md §8/§18: a Devpost hackathon team-member listing
  // never tells us who owned what, so labeling every listed member 'founder'
  // (as earlier ingestion runs did) overclaims differentiated ownership.
  // Relabel only rows that came from a Devpost hackathon source on a
  // kind='project' record — real company-founder rows (manual referrals, CSV
  // imports, Venture Lab Startup Challenge, all kind='company') are untouched.
  db.prepare(
    `UPDATE person_project_roles SET role = 'team_member'
     WHERE role = 'founder'
       AND project_id IN (SELECT id FROM projects WHERE kind = 'project')
       AND claim_id IN (
         SELECT id FROM claims WHERE source_id IN ('src_pennapps_devpost', 'src_treehacks_devpost', 'src_calhacks_devpost')
       )`
  ).run();
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(9).toString("base64url")}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
