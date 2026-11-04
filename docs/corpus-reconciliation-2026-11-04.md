# Corpus recovery and class-year evidence, 2026-11-04

The exported backend at `fa09249f2b0b6665f8fae8a684aade58e89564ab` contained people, projects and evidence absent from the later database at `4b8d256ee7759c528faa0e52627fdef8b6ba3b04`. The old export included the existing scouting-list prebuild import. This recovery runs after that same import, preserves every existing person/project field, and inserts only missing rows. It does not replace the SQLite binary.

The compressed recovery payload is UTF-8 JSON, gzip-compressed and base64-encoded. Decode with `gunzipSync(Buffer.from(text.trim(), 'base64'))`. The adjacent manifest contains the table counts, identity matches, ambiguous same-name candidates and original commit references. The payload is evidence recovery, not a new verification of all underlying claims. Original claim dates, URLs, labels and states remain intact.

On the compared database the recovery inserts 994 people, 488 projects, 1,703 claims, 211 snapshots, 22 sources, 949 affiliations, 1,028 project roles, 533 company facts, 196 signals, 1,478 relationships and 90 sector tags. Thirty-nine IDs redirect to existing identities using a company-specific URL or the same person name and linked project with no conflicting school. Fifty same-name cases remain separate: name equality is not enough to merge people or startups. All person and project IDs from the export are present or redirected after recovery.

It also assigns deterministic IDs to 4,397 existing company facts with null IDs. Fourteen pre-existing affiliations/roles referenced claims absent from both snapshots. Their relationships are retained, the dangling claim pointer is cleared, and the old pointer is recorded in `accuracy_audit`. No supporting claim is fabricated. Foreign-key checks pass after the transaction.

## Compatibility with the concurrent recovery

PR #158 added an independent recovery from PR #147 while this work was in progress. Both imports are retained: this migration runs first; the existing recovery then supplies its additional gate results and news evidence. `recovered-lib.ts` respects reviewed identity redirects, remaps dependent entity IDs (including JSON values), and avoids duplicate affiliations, roles and company facts. On the combined dataset it adds 3,042 gate results and 44 news rows without creating extra people or projects. A combined fresh-copy/repeat-import test covers this order.

## Class-year import

`verified-class-years-2026-11-04.json` contains 97 person/venture observations for 96 people. Sources were opened on 2026-11-04:

- Cornell eLab's September 28, 2026 fall roster (32 named ventures; the earlier 33-team URL redirects to this version).
- Cornell eLab's February 10, 2026 spring roster (15 ventures).
- Cornell eLab's February 28, 2025 spring roster (13 ventures).
- University of Waterloo Engineering's June 13, 2025 profile of Jocelyne Murphy, cofounder of Wygo.

The individual class years printed beside names are imported, including graduate degree labels. Cohort dates are never substituted for graduation years. These sources establish a reported class year and named venture association, not completed degrees, current enrollment, incorporation, funding or current company operations. Existing conflicting years are retained and reported. This batch adds 18 missing people and one missing venture (MUMU FurnCycle), fills 20 previously blank years, and confirms 77 other observations with no year conflicts. Sheng Cui is listed with two ventures and counted once in the people view.

The Library copy of `DRF alumni LinkedIn rechecked.xlsx` has 197 rows but no populated Class Year cells. `founders-linkedin-researched-v2.xlsx` contains some years embedded in names, but does not establish independently sourced class years. `Startup_Scouting_Tracker_Polished.xlsx` provides leads; its Web/Harmonic labels do not substitute for source URLs. Private USV notes are not included in the new public import.

## Views and counts

- `/data`: every stored project/company, including unverified and excluded records; searchable status/type/campus filters. Its CSV applies the same filters and includes source URLs and stored verification status.
- `/data/people`: one row per person ID, with all linked roles, schools, years, evidence and source URLs. Includes removed and potential records with visible labels. Its CSV uses the same filters.
- `/founders`: the existing scouting desk, with separate people and project-group counts and a link to all people.
- Shared headline counts read the deployed database; the client snapshot refreshes after ingestion. Curated directory/map eligibility remains a separate count from all stored records.

With the three existing reviewed-company patches applied, validation yields 7,353 people, 7,145 projects (including companies), 2,294 companies in the scouting list, 1,493 stored class years and 96 individually checked class years. These are deployment-specific counts, not constants in the application.

## Validation

- Fresh-copy import preserves existing people/project rows, resolves all old IDs, passes foreign keys and has no null company fact IDs.
- Repeating both migrations leaves all database rows unchanged.
- Corpus/people view totals equal direct database counts; scoped CSVs use the same filters as their pages.
- Class-year tests check Cornell 2028 and Waterloo 2025 against their specific source URLs.
- Formula-like spreadsheet cells are escaped in the CSV exports.

Run `node scripts/ingest/reconcile-corpus-2026-11-04.test.mjs` and `node --import tsx lib/domain/corpus-reconciliation.test.ts`. The recovery test optionally accepts `CORPUS_TEST_BASE_DB` pointing at an unmodified database copy. Both import transactions record their completion in `corpus_migrations`, preventing repeat deployments from overwriting later edits once the migrated database is committed.
