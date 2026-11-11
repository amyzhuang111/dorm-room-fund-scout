# Funding-stage filters and LSE directory

Funding stage is available in the home Filters panel and company directory. The selected stage carries through share URLs, directory navigation, founder scope, campus rankings and CSV exports. Stage counts apply the other selected filters, so they reflect the current search/campus context.

Stages: Pre-seed, Seed, Series A/B/C/D, Series E+, Venture (unspecified round), Accelerator (round unknown), Student project (round unverified), and Stage unknown. Empty stages stay selectable. Unknown does not mean bootstrapped or unfunded. The legacy mixed “pre-seed / student project” label does not count as a confirmed Pre-seed round.

The directory selects the highest explicitly recorded financing round across a company's stored funding facts instead of relying on SQLite row order. Program membership cannot overwrite a named round. This is a historical recorded-stage filter, not confirmation of a company's latest financing. Source review is still required to establish currency.

Rebuilt snapshot on November 11, 2026: 2,572 companies; Pre-seed 21, Seed 77, Series A 16, Series B 7, Series C 2, Accelerator 806, mixed student-project label 35, unknown 1,608. These buckets sum to the company total. Stage-only founder counts are restricted to founders linked to matching companies.

LSE ventures (https://startbook.app/events/lse/ventures) is registered under LSE in the source catalogue and discovery plan. Search `/signals/sources?q=LSE`. The tracking parameter is omitted. The public HTML was retrieved, but it contained a client-rendered loading shell; venture rows have not been verified or imported. The registry says “Not configured,” with reference-only priority until roster quality can be assessed. Inspect the rendered roster or an authorized export, preserve source evidence, and stage a review CSV before publishing approved rows.

Checks: stage normalization and evidence distinctions; order-independent round selection; company/founder/ranking agreement; URL continuity; CSV scope; full corpus reconciliation; TypeScript and production build. CI also exercises Seed filtering, counts, CSV, directory navigation, and the LSE source link at desktop and 375px widths. No database binary changes are included.
