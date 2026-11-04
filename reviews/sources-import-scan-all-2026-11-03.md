# Sources import — scan-all 2026-11-03

Branch: `cursor/data-backfill-2026-11-03`. Eligibility: current student or class of 2023+ with public evidence. Tech-transfer/faculty spinouts without student founders excluded (not inserted). Dedupe: website else name+campus(+founders); never name alone.

## Totals

- Leads parsed: **963**
- Eligible (kept for import): **171**
- Excluded (not inserted): **792**
- New investable companies inserted: **154**
- Matched existing (dedupe merge/update): **17**
- Founders created: **149**
- Investable companies before → after: **1225 → 1388**

## Per-source

| Source | Found | Kept | Excluded | Duplicates | New | Notes |
|---|---:|---:|---:|---:|---:|---|
| babson_beta | 27 | 23 | 4 | 8 | 15 | Undergrad/grad student finalists kept; alumni only if class year >=2023 |
| babson_etower | 81 | 0 | 81 | 0 | 0 | Most cards lack class year; only keep with explicit 2023+ / current-student evidence |
| bentley_phase03 | 6 | 6 | 0 | 4 | 2 | Phase 03 2025-26 awardees are current Bentley student founders per page |
| bucknell | 45 | 4 | 41 | 1 | 3 | Keep Club Ralley, Campus Swap, Forevergreen, Lyric's Lip Candy (current-student ventures per source scan); rest alumni without 2023+ year |
| calpoly_current | 9 | 0 | 9 | 0 | 0 | Excluded: incubator accepts non-students; no founder evidence |
| calpoly_graduated | 51 | 0 | 51 | 0 | 0 | Excluded: no per-company student-founder evidence |
| case_western | 49 | 0 | 49 | 0 | 0 | Excluded: tech-transfer portfolio |
| fordham | 5 | 0 | 5 | 0 | 0 | Excluded: no class-year/current-student evidence on portfolio cards |
| jhu | 87 | 0 | 87 | 0 | 0 | Archive HTML yielded 87 named student ventures; cohorts 2019-2021 → excluded under 2023+ rule |
| northeastern | 10 | 0 | 10 | 0 | 0 | Excluded: portfolio list lacks founder class-year evidence (JS-heavy; static names only) |
| osu_keenan | 18 | 18 | 0 | 1 | 17 | Keenan Center cohort companies are student ventures on public cohorts page; kept as current_student program evidence |
| rpi | 11 | 0 | 11 | 0 | 0 | Mostly excluded: mixed student/faculty successes without clear 2023+ student-founder evidence |
| scu_bva | 188 | 114 | 74 | 1 | 113 | Keep BVA cohort year >=2023; exclude older cohorts |
| ucsb_network | 6 | 6 | 0 | 2 | 4 | Cohort 1 student founder companies kept |
| umass | 34 | 0 | 34 | 0 | 0 | Excluded: tech-transfer / born-at-UMass portfolio without student founders |
| umn | 312 | 0 | 312 | 0 | 0 | Excluded all: tech-transfer commercialization (faculty/inventor) portfolio |
| wpi | 24 | 0 | 24 | 0 | 0 | Excluded: no student-founder/class-year evidence on roster |

## Exclude reason rollup

- **312** — UMN tech-transfer university startups — inventors are research/faculty spinouts, not student founders
- **87** — JHU student accelerator cohort year before 2023; no class-of-2023+ / current-student evidence on directory
- **81** — eTower directory — no public class-year/current-student evidence on card
- **74** — cohort before 2023
- **51** — CIE graduated incubator — mix of student/alumni/community; no per-company student-founder evidence
- **49** — tech-transfer/faculty spinout — no student-founder evidence
- **41** — alumni-heavy Bucknellian directory without class-year >=2023 evidence on page
- **34** — UMass innovation/tech-transfer portfolio — no student-founder evidence
- **24** — WPI IE startups roster — no per-company current-student or class-of-2023+ founder evidence
- **11** — successes page mix of student/faculty/alumni without clear 2023+ student-founder evidence
- **10** — venture portfolio — no public current-student or class-of-2023+ founder evidence on list page
- **9** — current CIE incubator — accepts external; no student-founder evidence on page
- **5** — Foundry portfolio — no public current-student or class-of-2023+ founder evidence on page
- **4** — alumni class before 2023

## Gates (local production on :3460)

- check-count-consistency: PASS (investable 1388, foundersListed 2257, foundersIndexed 3356, campusesOnMap 163, campusesTotal 170)
- check-no-dash: PASS
- check-overlay: PASS
- check-facet-dom: PASS (/data HTML ≤210 KB; facet sums == 1388)

## Snapshot totals (single shared)

- investableCompanies / directoryCards: **1388**
- foundersListed: **2257**
- foundersIndexed: **3356**
- people: **6192** / founders: **3051**
- campuses: **170** (on map **163**)
- generatedAt: 2026-11-03T07:55:15.188Z
