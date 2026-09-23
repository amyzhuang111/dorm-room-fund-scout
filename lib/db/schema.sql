-- Campus Universe schema. SQLite. All JSON-ish fields stored as TEXT (JSON.stringify).
-- Evidence-first: nothing here that materially affects a screening/quality decision
-- should exist without a row in `claims` (or an explicit user_note) backing it.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS universities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  aliases_json TEXT NOT NULL DEFAULT '[]',
  country TEXT,
  lat REAL,
  lon REAL,
  coord_source TEXT,          -- where the coordinate came from (must be sourced, never guessed)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  family TEXT NOT NULL,        -- e.g. 'campus_builder_org', 'hackathon', 'portfolio_directory', 'code_host'
  url TEXT NOT NULL,
  campuses_json TEXT NOT NULL DEFAULT '[]',
  priority INTEGER NOT NULL DEFAULT 3,
  ingestion_mode TEXT NOT NULL DEFAULT 'unconfigured', -- unconfigured | html_scrape | api | manual
  status TEXT NOT NULL DEFAULT 'unconfigured',         -- unconfigured | available | blocked | failed | checked_no_new
  last_attempt_at TEXT,
  last_success_at TEXT,
  error TEXT,
  refresh_suggestion TEXT,
  discovered_lead_count INTEGER NOT NULL DEFAULT 0,
  reviewed_relevant_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  -- Source-quality tiering (see lib/domain/source-quality.ts). Two independent
  -- tiers because the same source can be great for finding founders and
  -- mediocre for finding startups, or vice versa — prestige is not tier.
  founder_scout_tier TEXT,      -- S | A | B | C | D
  startup_scout_tier TEXT,      -- S | A | B | C | D
  quality_dimensions_json TEXT NOT NULL DEFAULT '{}', -- {campusPurity, earliness, buildEvidence, selectivity, novelty, identityQuality, extractability}
  source_role TEXT,             -- discovery | corroboration | verification | reference
  tier_rationale TEXT,
  tier_override_by TEXT,
  tier_override_at TEXT,
  tier_override_reason TEXT,

  -- Community (Reddit/student-discussion) signal — a SOURCE-RANKING input
  -- only, never a Founder Signal / eligibility input (see
  -- lib/domain/community-signal.ts). Preserves the evidence behind a human's
  -- source classification; never mechanically scored from raw comment text.
  community_signal_json TEXT NOT NULL DEFAULT '[]', -- CommunitySignalCategory[]
  community_confidence TEXT,    -- high | medium | low | insufficient
  reddit_mention_count INTEGER,
  reddit_independent_mentions INTEGER,
  reddit_positive_mentions INTEGER,
  reddit_negative_mentions INTEGER,
  community_rationale TEXT,
  reddit_last_checked_at TEXT
);

CREATE TABLE IF NOT EXISTS snapshots (
  id TEXT PRIMARY KEY,
  source_id TEXT REFERENCES sources(id),
  url TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  http_status INTEGER,
  raw_excerpt TEXT             -- short excerpt only, not full page, kept for audit
);

CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  aliases_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS affiliations (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES people(id),
  university_id TEXT NOT NULL REFERENCES universities(id),
  role TEXT,                   -- e.g. 'undergrad', 'masters', 'phd', 'hackathon participant'
  status TEXT NOT NULL DEFAULT 'unverified', -- current_student | recent_grad | older_alumni | unverified
  start_date TEXT,
  end_date TEXT,
  claim_id TEXT REFERENCES claims(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  aliases_json TEXT NOT NULL DEFAULT '[]',
  kind TEXT NOT NULL DEFAULT 'project', -- person | project | company
  sector TEXT,
  description TEXT,
  website_url TEXT,
  is_portfolio_reference INTEGER NOT NULL DEFAULT 0, -- existing DRF investment: reference only, never a new target
  is_investable_candidate INTEGER NOT NULL DEFAULT 1, -- 0 for e.g. a builder org's own internal tools (still valuable as ability-to-build evidence, but not itself something to screen/score as an investment)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS person_project_roles (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES people(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  role TEXT,                   -- founder | contributor | ...
  start_date TEXT,
  end_date TEXT,
  claim_id TEXT REFERENCES claims(id)
);

CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,   -- person | project | affiliation | funding_event | ...
  entity_id TEXT NOT NULL,
  claim_type TEXT NOT NULL,    -- affiliation | funding | product | customer | portfolio_status | ...
  value_json TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  source_id TEXT REFERENCES sources(id),
  snapshot_id TEXT REFERENCES snapshots(id),
  source_url TEXT NOT NULL,
  published_date TEXT,         -- date the underlying fact was published/announced, if known
  retrieved_at TEXT NOT NULL,  -- when we fetched it
  label TEXT NOT NULL DEFAULT 'observed_fact', -- observed_fact | company_reported | user_note | analyst_inference
  verification_state TEXT NOT NULL DEFAULT 'unverified', -- unverified | corroborated | disputed
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS funding_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  amount REAL,
  currency TEXT DEFAULT 'USD',
  instrument TEXT,             -- equity | safe | grant | debt | unknown
  event_date TEXT,
  dedupe_key TEXT NOT NULL,    -- hash of project+instrument+amount+approx date, prevents double counting
  claim_id TEXT REFERENCES claims(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(dedupe_key)
);

CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  signal_type TEXT NOT NULL,   -- release | demo | affiliation_change | customer_claim | field_test | grant | pivot | continued_dev
  prior_observation TEXT,
  current_observation TEXT NOT NULL,
  source_date TEXT,
  significance_note TEXT,
  claim_ids_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS portfolio_memberships (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id), -- null until matched/reviewed
  matched_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_page INTEGER,
  category_tags_json TEXT NOT NULL DEFAULT '[]',
  retrieved_at TEXT NOT NULL,
  match_status TEXT NOT NULL DEFAULT 'unmatched', -- unmatched | confirmed | ambiguous | unrelated
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Founder Scout §65-67: a person's own bio/profile text can hint at a
-- company they're building ("co-founder @simstudioai"), but per §67 that
-- must never auto-create a Startup Scout candidate — it stays a reviewable
-- hint until a human confirms it (or it's auto-linked to an EXACT existing
-- project-name match, same discipline as portfolio_memberships/
-- match-portfolio.ts: no fuzzy matching, ambiguous stays for a human).
-- See lib/domain/company-detection.ts.
CREATE TABLE IF NOT EXISTS possible_companies (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES people(id),
  company_name_guess TEXT NOT NULL,
  detection_method TEXT NOT NULL, -- bio_keyword | ...
  evidence_excerpt TEXT NOT NULL,
  source_claim_id TEXT REFERENCES claims(id),
  source_url TEXT,
  match_status TEXT NOT NULL DEFAULT 'unreviewed', -- unreviewed | confirmed | rejected
  confirmed_project_id TEXT REFERENCES projects(id), -- set once confirmed (auto-linked or human-reviewed)
  detected_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT
);

CREATE TABLE IF NOT EXISTS assessments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  rubric_version TEXT NOT NULL,
  ratings_json TEXT NOT NULL,   -- { dimensionKey: 0-5 | null }
  rationale_json TEXT NOT NULL DEFAULT '{}',
  counterevidence_json TEXT NOT NULL DEFAULT '{}',
  coverage REAL NOT NULL,
  quality_score REAL,           -- null if coverage/required-dimension threshold not met
  evaluator TEXT NOT NULL DEFAULT 'manual',
  override_of_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS relationships (
  id TEXT PRIMARY KEY,
  source_entity_type TEXT NOT NULL,  -- university | person | project
  source_entity_id TEXT NOT NULL,
  target_entity_type TEXT NOT NULL,
  target_entity_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL,   -- enrolled_at | graduated_from | works_in_lab | participated_in_program | contributed_to_project | founded | referred_by | personal_connection
  evidence_claim_ids_json TEXT NOT NULL DEFAULT '[]',
  user_note TEXT,
  start_date TEXT,
  end_date TEXT,
  verification_state TEXT NOT NULL DEFAULT 'affiliation_only', -- affiliation_only | confirmed_personal | unverified
  owner TEXT,                        -- set when this edge is part of Amy's private "My connections" overlay
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  body TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT 'amy',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pipeline_entries (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE REFERENCES projects(id),
  status TEXT NOT NULL DEFAULT 'New', -- New|Researching|Meet|Contacted|Meeting|Diligence|Watching|Passed
  next_action TEXT,
  due_date TEXT,
  notes TEXT,
  pass_reason TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ingestion_runs (
  id TEXT PRIMARY KEY,
  source_id TEXT REFERENCES sources(id),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  fetch_count INTEGER NOT NULL DEFAULT 0,
  budget_config_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'running', -- running | completed | stopped_on_budget | failed
  error TEXT
);

CREATE TABLE IF NOT EXISTS screening_config (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  provenance TEXT NOT NULL,   -- public_policy | user_guidance | proposed_setting
  reason TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gate_results (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  gate_name TEXT NOT NULL,    -- affiliation | stage | prior_funding | business_model | portfolio_relationship | funding_availability
  result TEXT NOT NULL,       -- pass | needs_verification | outside_current_brief
  rationale TEXT NOT NULL,
  evaluated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, gate_name)
);

CREATE INDEX IF NOT EXISTS idx_claims_entity ON claims(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_affiliations_person ON affiliations(person_id);
CREATE INDEX IF NOT EXISTS idx_affiliations_university ON affiliations(university_id);
CREATE INDEX IF NOT EXISTS idx_ppr_project ON person_project_roles(project_id);
CREATE INDEX IF NOT EXISTS idx_ppr_person ON person_project_roles(person_id);
CREATE INDEX IF NOT EXISTS idx_relationships_source ON relationships(source_entity_type, source_entity_id);
CREATE INDEX IF NOT EXISTS idx_relationships_target ON relationships(target_entity_type, target_entity_id);
CREATE INDEX IF NOT EXISTS idx_gate_results_project ON gate_results(project_id);
