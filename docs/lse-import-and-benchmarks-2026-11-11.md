# LSE directory import and company benchmarks

The public Startbook roster contained 142 ventures on 2026-11-11. The initial HTML shell did not contain the roster; the rendered page and the public data endpoints used by its frontend did. All 142 venture profiles and 179 named people's public profiles were retrieved without authentication. No contact details, private records, pitch decks or temporary media URLs are published.

## Import

- 141 new companies; Marymount Labs matched its existing company record using the product and named founder, corroborated by [NUS Medicine](https://medicine.nus.edu.sg/news/nus-medicine-data-accelerator-programme-driving-health-innovations/).
- 178 named founders imported. One additional listed person is an Operations Lead; retained as a sourced team-member claim, not added to founder counts.
- Aithena, KINO and Solis are distinct from same-name companies already in the corpus. Their different products/domains/campuses were checked. Shared LinkedIn domains are not company identity matches.
- 68 founder profiles explicitly report an LSE degree category. These create source-reported education associations with unverified current enrollment. Generic graduation years are preserved in education claims, not promoted to confirmed LSE class years. “I did not attend LSE” does not create an education association.
- Every company receives LSE **directory membership**. This is not an assertion that every founder attended LSE or that a company is headquartered in London. Campus rankings use the same canonical company and founder sets as the rest of the app.
- 29 profiles report Pre-seed and 16 report Seed. Other stages (prototype, ideation, revenue-funded, friends and family) remain their original source labels; they do not become a verified financing round. No funding event, round date, operating status or total raised is invented.
- Rebuilt corpus: 2,713 companies and 3,904 indexed founders/people. LSE has 142 companies and 69 founders with recorded LSE affiliation (68 new education associations plus one existing). The broader source roster has 179 named people; these are different, explicitly labelled scopes.
- Existing good records, source claims, tiers, exclusions and assessments are preserved. Import IDs are stable; repeated builds do not duplicate rows. The binary database is not committed.

## Benchmark methodology

All 142 ventures received an explicit source assessment by Codex, authorized by the user's instruction to import and benchmark. This is not presented as a human review or independent validation of the companies' claims.

The existing `2026-09-18.v1` rubric remains authoritative: build 20%, domain/access 15%, execution 10%, differentiated insight 15%, customer pain/market 20%, learning/validation 10%, next milestone/financing 10%. Ratings use the existing 0–5 anchors. Unusually specific self-reported evidence can support a 4; no exceptional/corroborated 5 ratings are assigned in this batch. Unknowns are null, never zero. The shared calculator requires 70% weighted coverage plus build, domain and customer pain before publishing a headline score.

New **display bands**, version `2026-11-11.v1`, translate the existing weighted score into a benchmark: A ≥80, B ≥65, C ≥50, D <50. These are transparent product thresholds introduced in this change, not previously defined investment cutoffs. They are separate from S+/S/A/B/C/D program/investor sourcing tiers and from eligibility gates. The batch yields 6 B, 77 C, 13 D and 46 Unassessed; none meet A. No sourcing tier is awarded just for appearing in LSE's directory.

Each assessment stores the ratings, review rationale, source profile, available evidence-field names, review identity and raw snapshot digest. Notes flag old roadmaps, unsupported growth/clinical claims and source inconsistencies. Every profile has been reviewed; 46 lack enough evidence to score. Those are research priorities, not negative company judgments. Unresolved enrollment and funding gates remain unresolved even for stronger benchmarks.

## Repeating the pipeline

1. `python scripts/discovery/collect-startbook-lse.py --output /tmp/lse-review.json` extracts public profiles into a sanitized **pending** JSON and review CSV. It does not approve or import anything. Public endpoint authentication/errors stop the collection; no hidden-data option is used.
2. Review identities, claims, stale fields, source dates and all seven ratings. Set the explicit review status and reviewer identity only after reviewing; save a new versioned manifest for a new batch. The current reviewed manifest lives in `data/imports/lse-startbook-2026-11-11.json`.
3. The prebuild importer rejects missing/pending reviews and invalid ratings, and atomically imports the reviewed batch before rebuilding all shared snapshots. Do not change a previously imported manifest in place to revise decisions: create a new versioned batch/assessment so history remains append-only.

## User journey and validation

`/signals/sources` links to `/directories/lse`, which shows all reviewed ventures sorted by score, searchable by company/founder and filterable by benchmark and recorded stage. Every company links to its actual dossier. Criteria, weights, rationale and source links are expandable. CSV exports exactly the selected view, including unknowns and all seven ratings. Company dossiers show the benchmark and seven-factor breakdown alongside assessment history.

Validation covers import rollback, idempotence, no table shrinkage or new foreign-key violations, same-name collisions, non-founder exclusion, stage semantics, education exclusions, rubric coverage and boundaries, filtered CSV parity, TypeScript, production build, and every-campus count reconciliation. Local browser execution is constrained in the workspace; deployed pages and endpoints are checked separately. No production SQL migration or custom-domain change is part of this import.
