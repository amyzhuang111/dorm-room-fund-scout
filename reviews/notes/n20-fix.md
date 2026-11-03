# n20-fix (pre-QA)

Fixes on n20 between@1440 before QA.

## Bugs
1. **Duplicate media cards** — Keye×5, Lucidic AI×2. Dedupe by `companyId` while placing between cards; `data-networks-media-company` on each card; gate `scripts/check-networks-media-dedupe.mjs` asserts unique ids + 2023 pass.
2. **Pre-2023 companies** — Taya (and peers that fail the shared filter) drawn as company cards/nodes. Ship `public/data/networks-company-recency.json` (495 companies: current student or `enrollment_grad_year >= 2023`). Cards + kind===1 company nodes gated against it. Dated founder years `< 2023` no longer visible at scrub max.
3. **Penn callout** — Confirmed `231 of 319` on out zoom. Universe = shared poster `kind===0` founders with `campus === univ_penn` (poster campus `n=319` / totals.founders 1960). Backed via `founderIsTopBacked` (top-fund labels + YC/pathways in deals). Unbacked = 319 − 88 = 231.

## Gates
- media-dedupe: PASS (18 cards / 18 unique / Taya absent)
- overlay-6states: PASS (networks unobstructed 100%)
- visibility / legend / edges / labels / counts / deal-kinds / featured / no-dash: OK
- blob border: hit 0 (n=64)

## Shots / preview
- fresh between: `/workspace/reviews/shots/campus-scout/n20-fix-qa/networks-graph-zoomed-between-1440.png`
