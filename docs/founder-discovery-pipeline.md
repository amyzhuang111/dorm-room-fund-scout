# Founder discovery and exploration — 11 November 2026

## Delivered

The globe now offers explicit Globe / Network map / Directory navigation, campus starting points, a floating campus leaderboard, and a Saved shortcut. Company and founder cards link to their exact network nodes. The network retains the previous filtered view and offers a return link; selecting and closing nodes updates the URL. Rankings continue to use the shared company corpus.

The discovery CLI supports query planning, limited public-profile retrieval, evidence staging, CSV review, transactional imports and a per-path quality report. Publication consumes reviewed JSON before rebuilding public data indexes. There is no unauthenticated import endpoint.

## Pilot findings

Ten candidate observations were researched on 11 November. These are a small, deliberately inspected trial, not a representative search benchmark. LinkedIn discovery results were followed with company and campus sources where available. Retrieval status records the research browser result, not a successful run of the CLI fetcher.

| Search path and follow-ups | Candidates | LinkedIn attempts | Fetched | Blocked | Ready for human review | New founder/company pairs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Stanford founder / student / AI | 3 | 2 | 1 | 1 | 2 | 0 |
| USC co-founder | 5 | 3 | 0 | 3 | 4 | 2 |
| Penn founder / building | 2 | 1 | 0 | 1 | 0 | 0 |
| Total | 10 | 6 | 1 | 5 | 6 | 2 |

New review-ready pairs: Christian Yeghnazar / Lattice Partners; Elijah Fernandez / CEREVITY. These are campus-affiliated discovery candidates, not confirmed current students or investment recommendations. Existing-record enrichment: Carmel Limcaoco and Rhea Malhotra / Kita; Victor Ong / Bilisense; Christine Ly / DermaVision Technologies. Four rows remain unresolved, including one false positive caused by a liked post about another founder.

**All ten rows default to hold. No pilot candidates have been imported or added to live totals.** Six have sufficient evidence to request a human decision; this is not an approval. The exact sources, dates, duplicate matches, short excerpts/paraphrases and reasons are in `data/discovery/pilot-2026-11-11/review.csv`.

The sample supports iterating on USC founder keywords plus official company/university corroboration. It does not support scheduling a LinkedIn-only scraper. Current keyword search is performed with the exported query plan or an existing search provider; an unattended search-provider adapter and schedule are not configured. Profile retrieval stops at access blocks and obeys robots rules; it does not use authenticated sessions, proxy rotation, or bypasses.

## Operating the review loop

Run from the repository root. Keep the committed binary database untouched. Use a copy of the fully rebuilt corpus for matching, so recovered records are not rediscovered as new entities.

```sh
npm run discovery -- plan --out /tmp/discovery-queries.json
npm run discovery -- fetch --input /tmp/profile-urls.json --out /tmp/profile-captures.json
npm run discovery -- stage --input observations.json --db /tmp/corpus.db --batch trial-002 --out /tmp/trial-002
npm run discovery -- review --snapshot /tmp/trial-002/batch.json --csv /tmp/trial-002/review.csv --out /tmp/approved.json
npm run discovery -- apply --input /tmp/approved.json --db /tmp/staging.db --apply
```

`profile-urls.json` is an array of `{url,pathId,query}` from the query trial (maximum ten). The fetch command extracts only the subject's biography/headline/education, never posts or reactions. Captures are raw research input; explicitly assemble `Observation[]` with field-level evidence using the pilot observations as the schema example. Missing campus, unclear identities and search snippets alone cannot pass staging.

The reviewer changes only `decision` (`approve`, `reject`, `hold`), `reviewer` and `reviewed_at` (ISO timestamp). Do not delete rows. If a fact needs correction, edit the observations, restage and review a fresh CSV. The row digest binds approval to the reviewed facts; it is an integrity check, not a signature. Write access to the repository and its reviewed PR process are the publication authority.

Validate approved rows against a scratch database. Commit the approved JSON under `data/discovery/approved/` in a reviewed PR. `prebuild` replays it before public JSON/index generation. Replays are idempotent; failures roll back the whole batch. New identity conflicts require another review. Imports only add entities/relationships/evidence or fill missing website/profile fields; they preserve existing facts and do not infer graduation year, enrollment, team size, funding or eligibility. Approval never makes an entire record “confirmed.”

## Technical assessment and remaining scope

The application is Next.js/TypeScript on Vercel, with SQLite and precomputed public JSON. The existing 43.7 MB binary SQLite corpus is committed to Git; runtime writes to Vercel `/tmp` are not durable. Search, campus rankings and directory counts must be rebuilt from the same approved dataset. Current reconciliation passes for 2,572 companies, 3,726 indexed founders and 238 campuses; USC remains 15 companies and Harvard leads with 249.

Recommended database: managed PostgreSQL, with Neon as the preferred fit for the current stack. This is a recommendation, not a provisioned or migrated database. Keep separate staging and published tables/views. Preserve stable entity IDs, sources, claims, affiliations and relationships; add import batches, candidate rows, field-level evidence and reviewer audit records. Publish a reviewed batch and a dataset version in one transaction, then invalidate/rebuild all public projections from that version. Store credentials only in deployment secrets and require authenticated reviewer access.

Remaining build scope:

1. Select/provision PostgreSQL; port the SQLite-specific query layer; migrate and reconcile all entities/relationships and counts, then switch production reads and durable writes. Migration is not included in this release.
2. Run a second small query trial with verified company/campus corroboration, measure *new approved records* per path, and only then connect an authorized search provider and schedule. Additions require CSV review first.
3. Add authenticated review UI and optional direct database publishing once durable storage is ready. Retain rejection reasons and source snapshots with bounded retention.
4. Supply the actual donation destination and custom domain before connecting them. The existing donation control remains conditional on a configured URL; no destination is invented. Domain/DNS setup is not completed here.

## Validation

Automated checks cover changed facts, missing evidence, duplicate identities, explicit approval, rollback, idempotency, robots handling, biography-only extraction, safe return URLs and cross-view count reconciliation. TypeScript validation passes. The committed database is unchanged. Desktop/mobile and production journey checks are performed as part of release verification.
