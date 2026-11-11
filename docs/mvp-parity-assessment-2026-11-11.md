# Campus Scout: MVP parity assessment — November 11, 2026

## This release

The explorer fits the available viewport instead of imposing a fixed minimum height. The database list scrolls independently; search and the Filters control remain at the top of that panel. The layout reflows across phone, tablet and desktop widths. On smaller screens, rankings remain available through the Rankings tab. The desktop retains the globe, database, leading campuses and current-view totals together.

City/cluster exploration now stays inside the home workspace, preserving its header and filters. Company hover cards allow a 300 ms pointer transition and remain open while hovered or keyboard-focused. Selecting a company pins its detail sheet until explicitly closed. The map observes its container size, including width changes, and can recover after a slow style load.

The interface adds consistent SVG icons and translucent white panels with cobalt accents. Existing company logos remain source-backed. Donate opens a support dialog. An actual donation destination must be supplied through `NEXT_PUBLIC_SCOUT_SUPPORT_URL` (Buy Me a Coffee or Ko-fi) before payment can be enabled. Browsing remains free; there are no subscriptions.

## Technical findings

| Area | Finding and consequence |
| --- | --- |
| Stack/hosting | Next.js 16, React 19, TypeScript, MapLibre; GitHub-connected Vercel deployment. |
| Current storage | SQLite is already SQL. Public JSON snapshots serve the map and directories; CSV is an ingestion/review/export format. There is no inherent 2,000-user CSV threshold. The important limitations are durable writes, concurrent requests, payload size and cache consistency. |
| Persistence | Production copies the bundled SQLite database into Vercel `/tmp`. Instance-local changes are not durable shared storage. |
| Queries | SQLite synchronous calls are spread across domain modules, APIs and server actions. A PostgreSQL connection string alone cannot switch these callers. They need an asynchronous repository layer and a coordinated read/write cutover. |
| Counts | Reconciliation passes for all 238 campuses: 2,572 companies, 3,726 indexed founders; Harvard 249 companies; USC 15. A company may belong to multiple campuses, so campus totals overlap. |
| Data quality | In the tested directory snapshot, 48 companies lack campus, 867 lack named founders, 1,765 lack founded year, and 2,558 lack operating status. Missing values remain unknown until evidence is reviewed. |
| Saved lists | The old hosted store used a single `default` row and a public route. This release requires a verified server session for hosted storage and derives a separate owner key. Anonymous visitors retain local browser saves. The old shared row is preserved but never automatically assigned to anyone. |
| Sourcing | The review pipeline already stages directory/profile observations for review. No unreviewed candidates are imported. Keyword discovery and quality iteration remain separate from approval. |

## Recommended database and migration status

Use **Neon PostgreSQL**, with a pooled, least-privilege application connection, a separate direct migration connection, and separate preview/production databases. Keep CDN-cached public projections for fast browsing; keep raw evidence and personal saved lists private. CSV remains useful as the review boundary.

`npm run db:postgres:migrate` now supports a read-only preflight and an explicit import into a new `scout_import_<batch>` schema. It never switches production or replaces an existing schema. Imports are transactional, preserve relational tables and source IDs, verify every table's row count and SHA-256 row digest, recreate indexes/foreign keys, and reject mismatched repeated imports.

The local PostgreSQL-engine test passed for **33 tables, 129,824 rows, 24 explicit indexes and 28 foreign keys**, using a scratch corpus with the ingestion steps applied. It also verifies rollback, CHECK/UNIQUE/FK enforcement and idempotency. SQLite had allowed 304 NULL audit IDs; these values are preserved, with a separate generated internal key for those audit rows. Company/founder identities are unchanged.

This is **tested migration tooling, not a completed hosted migration**. The test used PGlite's PostgreSQL engine, not a Neon network connection. Vercel currently returns 403 for project environment access. Team authorization is required to inspect/connect the production database. The latest main-branch corpus must be re-snapshotted and verified at cutover; the tested scratch snapshot does not establish the latest production news checksum.

## Remaining work and acceptance criteria

1. **SQL cutover:** authorize the Vercel team and connect Neon; import a fresh corpus; port runtime reads, ingestion and writes to an async PostgreSQL repository; gate mutations by role; publish all count/directory projections from one version; test preview before changing production. Preserve the prior deployment/database for rollback.
2. **Data expansion:** iterate one keyword/search path at a time, retain source URL/excerpt/date/confidence, deduplicate, export review CSV, and import only approved rows. Prioritize the 48 missing campuses and 867 missing founder names. Do not infer biographies or graduation years from initials.
3. **Interaction completion:** verify the exact network-map drawing when supplied; continue end-to-end checks of directory → detail → founder/network → return. The current share URL preserves filters and selected records; geographic camera-position sharing/image export remains separate scope.
4. **Launch:** supply the donation URL and custom domain; confirm DNS access; run staging load tests with a defined peak-concurrency target. “2,000 users” must distinguish total users from simultaneous requests. Measure p95 latency, error rate, pool pressure, mobile rendering and source freshness before claiming capacity.

## Reproduce the migration check

Create a scratch copy of the latest SQLite file, apply the repository's prebuild steps to that copy with `CAMPUS_UNIVERSE_DB_PATH`, then:

```sh
npm run db:postgres:migrate -- --source /absolute/scratch.db --schema scout_import_review --report /absolute/report.json
CAMPUS_MIGRATION_TEST_SOURCE=/absolute/scratch.db npm run test:postgres-migration
```

Only when the target database has been selected, set the server-only `CAMPUS_POSTGRES_MIGRATION_URL` and append `--apply`. This imports and verifies a staging schema; it does not activate an application backend. Never put a connection string into client code or a review CSV.

References: [Neon pooling](https://neon.com/docs/connect/connection-pooling), [Postgres.js transactions](https://github.com/porsager/postgres#transactions), [PGlite](https://github.com/electric-sql/pglite).
