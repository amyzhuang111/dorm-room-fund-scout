# r58 — dossier links + evidence chip sources

Base: `45d94b2` (r57). Branch: `cursor/scoring-r58`.

## Root cause
`getProjectDetail` only looked up investable Scout candidates (`is_investable_candidate=1`, the 1,173 desk). Founder index `companyId` values can point at real `kind=company` rows that are non-investable (862 founders). Those `/startup/<id>` URLs 404'd (2 of the first 12 open-lane deck Opens: Geddit, Analogical Engines).

## Fix
- `candidateSummaryForDossier` falls back to a thin DB summary for any company id, so dossiers resolve for every founder deep link.
- Founder index now ships `signalSourceByType` / `programSourceByLabel`; mobile evidence chips link to those URLs in a new tab (no source → chip omitted).
- `scripts/check-deck-dossier-links.mjs` expands the mobile deck, crawls every peek/deck `/startup/` Open link, fails on non-200.
