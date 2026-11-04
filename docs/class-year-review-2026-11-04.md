# Class-year review — November 4, 2026

Campus Scout's class-year field sometimes contained a teammate's year or a company's founding date. This review screens every one of the 7,353 recovered people, verifies explicit individual class designations, and exposes unresolved records in the people index and its CSV.

## Result on current main plus the normal ingestion pipeline

| Outcome | People |
| --- | ---: |
| Individual class designation supported by a source | 1,009 |
| Stored year; cited source unavailable | 231 |
| Stored year; evidence needs further review | 279 |
| Conflicting published class years | 5 |
| No supported year found | 5,819 |
| Invalid company-founding inference removed | 10 |
| Total reviewed records | 7,353 |

There are 1,524 populated year fields after 41 fills and 10 invalid-year removals. Of these, 515 remain unverified. Forty-four existing years were corrected. These categories describe class-year evidence, not a complete identity, founder-role, funding, enrollment, or degree-completion verification. The previous workflow's 96 individually checked people are included in the 1,009 total.

## Evidence and interpretation

All 266 distinct sources cited by the original 1,493 year fields were attempted, plus 245 additional linked university pages and six additional sources for targeted checks. Of 517 distinct attempted sources, 342 yielded readable material or an explicitly recorded primary-source excerpt. Retrieval alone is never confirmation.

The manifest contains 1,268 person/school/year/source observations across 1,014 people, including the five unresolved conflicts. An exact name, its existing source association, an explicitly attached year, and a resolved institution are required. Class notation can describe an expected or historical class; it does not assert that someone earned the degree. Company founding, accelerator membership, competition dates, seniority, and a teammate's year are insufficient. Multiple degree years remain available as separate observations. The display retains an existing supported year, otherwise uses the latest explicitly stated degree/class year at the resolved school; it does not combine different people's years.

Automated matches from flattened PDF columns were excluded. The Columbia athletics program was reviewed as explicit name/college/year rows. Canyon Pergande's Wisconsin BBA year uses the official program's search-index text under “Class of 2024 Graduates,” with identity corroboration from Wisconsin's SideShift competition article; that retrieval method is included in the observation.

Examples of clear corrections: Octavius Kim 2024 → 2023; Agustin Garcinuno 2024 → 2023; Renee Migdal 2014 → 1983. Craig Thompson's WG 2021 and GEN 2022, and Josh Aviv's undergraduate 2015 and graduate 2017, are preserved separately. Conflicts for John Hopcroft, Lulu Ge, Michael Wong, Paris Mielke, and Joshua Baek retain the stored value but are excluded from the verified count.

The original spreadsheets did not provide a reliable bulk class-year source: the DRF alumni sheet's class-year column was empty, and the LinkedIn research sheet did not have a dedicated year column. A search-index education range is not automatically treated as completed graduation.

## Integration and safeguards

- `data/imports/class-year-review-2026-11-04.json` records observations, source-attempt hashes, explicit patches, conflicts, and the reviewed person IDs.
- `scripts/ingest/review-class-years-2026-11-04.mjs` runs after reviewed restores and before cache generation. It adds education claims and a `person_class_year_reviews` table, applies conditional year corrections, and preserves prior values in `accuracy_audit`.
- The import does not replace the SQLite binary or delete people, projects, roles, affiliations, or facts. It does not promote overall profile verification or current enrollment status.
- A changed year/source/evidence combination is preserved as a concurrent edit, with a conflict flag. A person added after the reviewed snapshot does not inherit a completed-review label. A year changed after review is also displayed as needing rechecking.
- `/data/people` exposes review filters and evidence for every record. `/data/people/export` applies identical filters and includes review status/reason/date, prior year, source coverage, all education observations, evidence gaps, and the scope limitation.

## Validation

The import was applied to a scratch copy of current main's database, after the complete recovery and reviewed-restore pipeline. Counts remain 7,353 people and 7,145 projects; current main's 2,475 scouting companies are preserved. Foreign-key checks pass. Tests cover teammate-year leakage, multiple degrees, company-founding inference, ambiguous PDF columns, conflicting sources, repeat idempotency, concurrent-edit preservation, new-record review status, unchanged profile statuses, source retention, filtered exports, and CSV formula escaping. TypeScript and the production build are checked before merge. No database binary or generated cache is included in this change.
