import Database from "better-sqlite3";
import fs from "node:fs";
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

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 8000");
  const schema = fs.readFileSync(path.join(process.cwd(), "lib", "db", "schema.sql"), "utf8");
  db.exec(schema);
  migrate(db);
  _db = db;
  return db;
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

  addColumnIfMissing("projects", "primary_link", "primary_link TEXT");
  addColumnIfMissing("projects", "primary_link_kind", "primary_link_kind TEXT");
  addColumnIfMissing("projects", "signal_tier", "signal_tier TEXT");
  addColumnIfMissing("projects", "signal_tier_basis", "signal_tier_basis TEXT");
  addColumnIfMissing("people", "signal_tier", "signal_tier TEXT");
  addColumnIfMissing("people", "signal_tier_basis", "signal_tier_basis TEXT");
  addColumnIfMissing("people", "left_school", "left_school INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing("people", "founder_status", "founder_status TEXT");
  addColumnIfMissing("people", "potential_signal", "potential_signal TEXT");
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
