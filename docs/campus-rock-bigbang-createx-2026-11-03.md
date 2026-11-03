# Campus Scout 2026 cohort expansion — Rock / CREATE-X / Big Bang

Source date: 2026-11-03. All source records here are public and cite a first-party university/program page. **Do not infer founder, enrollment, incorporation, funding, or product status from a mere event attendee.** Non-public emails and private student data are never copied.

## Primary 2026 cohort imports

| Data file | Public source | Source entries | Public people links | Evidence role |
| --- | --- | ---: | ---: | --- |
| batch26-hbs-rock-2026.json | [HBS Rock Venture Catalyst](https://www.hbs.edu/news/releases/2026-rock-venture-catalyst) | 51 startups | 61 | Explicit `Founder`/`Co-Founder`, MBA 2027 |
| batch27-yale-tsai-spring-2026.json | [Yale Tsai CITY Spring](https://city.yale.edu/stories/2026/2/20/spring-2026-venture-development-programs-the-builders-shaping-whats-next) | 9 ventures | 12 | Named venture team participant (not independently proven cofounder) |
| batch28-ucdavis-bigbang-2026.json | [UC Davis Big Bang 2026](https://innovate.ucdavis.edu/2026-big-bang-winners) | 8 startups | 24 | Team lead vs team member |
| batch29-harvard-alumni-2026.json | [Harvard Alumni Entrepreneurs 2026](https://www.harvardae.org/news/2026/announcing-the-2026-accelerator-cohort) | 12 companies | 12 | Named Harvard **alumni** founders; current enrollment not asserted |
| batch30-createx-demo-2026.json | [Georgia Tech CREATE-X Demo Day](https://create-x.gatech.edu/2026-demo-day) | Generated from official HTML (≥65 validated) | 0 | Companies only; source does not list founders in table |
| batch31-ucdavis-littlebang-2026.json | [UC Davis Little Bang 2026](https://innovate.ucdavis.edu/little-bang-2026-winners) | 8 projects | 17 | Named pitch competitors, not automatically founders |
| batch32-ucla-dartmouth-2026.json | [UCLA Draper 2026 top 10](https://www.anderson.ucla.edu/about/centers/price-center-for-entrepreneurship-and-innovation/anderson-venture-accelerator/our-companies), [Dartmouth 2026 Magnuson finalists](https://luma.com/awwuqnaj) | 20 ventures | 0 | Venture names only; no invented founders |

Total of 108 manually reviewed source entries (before dedup), plus the Georgia Tech 2026 roster imported programmatically from its official publicly accessible HTML table. 126 named person-venture links, including 73 **explicitly described founders** in Harvard's two programs, and 53 named team members.

## Important data-quality protections

- Source snippets preserve named-person evidence and the specific role. A team-member contest record is `team_member`, not `founder`.
- HBS's MBA 2027 class years support current-student status as of 2026. Harvard Alumni Entrepreneurs is explicitly alumni, without an invented graduation year. UC Davis competition winners are not all current UC Davis students: the source includes UC Santa Cruz and a mixed Sacramento State team.
- A contest prize, non-dilutive award or program acceptance is **not** an equity financing round.
- Georgia Tech CREATE-X entries are company rows without founders until a first-party roster or independent founding record identifies real people. The builder uses table column names and hard-fails if the official table cannot be parsed; it cannot invent names when the page changes.
- The source list is **not exhaustive**, and absence from it is not evidence against a founder. This update intentionally preserves the app's existing map/layout/cards/UI.

## Additional discovery directories (not bulk-copied)

HBS Rock Center, Harvard Alumni Entrepreneurs, UC Davis Little Bang, UCLA Anderson Venture Accelerator, UCLA 2026 Draper showcase, Dartmouth Magnuson student startup competition, UC LAUNCH (all UC campuses), Berkeley BEGIN, Princeton TigerLaunch, and Bruin Entrepreneurs Startup Labs. Official source URLs are retained in `lib/domain/late-2026-campus-source-rosters.ts`.

## Validation and deployment

The branch-only workflow `.github/workflows/campus-rock-bigbang-createx-2026.yml` builds the CREATE-X file from the official live page, imports all seven batches with existing idempotent campus importer, runs SQLite integrity and `npm run test:directory`, and commits the updated binary `data/campus-universe.db` and the generated CREATE-X JSON to the PR branch. Review import log net-new counts and any ambiguities before merging. Vercel production deployment must succeed independently.
