# Funding-stage filters and LSE directory

Funding stage is available in the home Filters panel and company directory. The selected stage carries through share URLs, directory navigation, founder scope, campus rankings and CSV exports. Stage counts apply the other selected filters, so they reflect the current search/campus context.

Stages: Pre-seed, Seed, Series A/B/C/D, Series E+, Venture (unspecified round), Accelerator (round unknown), Student project (round unverified), and Stage unknown. Empty stages stay selectable. Unknown does not mean bootstrapped or unfunded. The legacy mixed “pre-seed / student project” label does not count as a confirmed Pre-seed round.

The directory selects the highest explicitly recorded financing round across a company's stored funding facts instead of relying on SQLite row order. Program membership cannot overwrite a named round. This is a historical recorded-stage filter, not confirmation of a company's latest financing. Source review is still required to establish currency.

Snapshot before the LSE import on November 11, 2026: 2,572 companies; Pre-seed 21, Seed 77, Series A 16, Series B 7, Series C 2, Accelerator 806, mixed student-project label 35, unknown 1,608. These buckets sum to the company total. Stage-only founder counts are restricted to founders linked to matching companies.

LSE ventures (https://startbook.app/events/lse/ventures) is registered under LSE in the source catalogue and discovery plan. The 2026-11-11 follow-up retrieved the public roster and all venture/founder profiles, imported the reviewed records, and added `/directories/lse` with provisional rubric benchmarks and filtered CSV export. See `docs/lse-import-and-benchmarks-2026-11-11.md` for counts, evidence limits and the repeatable review pipeline. Directory membership does not imply founder enrollment or a financing round.

Checks: stage normalization and evidence distinctions; order-independent round selection; company/founder/ranking agreement; URL continuity; CSV scope; full corpus reconciliation; TypeScript and production build. CI also exercises Seed filtering, counts, CSV, directory navigation, and the LSE source link at desktop and 375px widths. No database binary changes are included.
