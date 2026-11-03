# Campus sources import — 2026-11-02 (America/New_York)

**Branch:** `cursor/sources-import-2026-11-02` (from scoring-r56 / “main is r56”)  
**Cutoff:** class of 2023+ (Amy confirmed). No held 2021–2022 list.  
**Rules:** public pages only · reuse cleared · never merge same-name companies without domain/founders · faculty ≠ student startup · fields: university, affiliation_type, cohort/grad year, enrollment_status, website, evidence_url.

## Totals (shared snapshot)

| Metric | Value |
|---|---:|
| Investable on site | **1,225** (was 1,172/1,173) |
| Companies total | 5,665 |
| Excluded older alumni (&lt;2023) | 235 companies |
| Unverified recency | 4,171 companies |
| Verified founder-people with grad year 2021 or 2022 (excluded from site eligibility) | **87** |
| This import: startups found / imported / merged | 97 / 81 / 16 |
| This import: founders created / linked | 99 / 130 |

## Per source

### Already in corpus (morning weekly on undergradvc DB lineage) — kept
| Source | Status |
|---|---|
| Georgia KickStart | added earlier · kept |
| Illinois iVenture | added earlier · kept |
| USF SII | added earlier · kept |
| UConn Hillside | added earlier · kept |
| RIT Venture Fund | added earlier · kept |
| CU Deming | added earlier · kept |
| Duke BRiDGE | added earlier · kept |
| Duke Showcase 2025 | added earlier · kept |

### Newly imported this branch
| Source | Status | Startups | Founders linked | Notes |
|---|---|---:|---:|---|
| Princeton Student Ventures | **added** | 33 (28 new / 5 merge) | 67 | Student-founded roster; evidence https://www.psv.vc/portfolio |
| BC Accelerate@Shea 2026 | **added** | 12 (11/1) | 19 | current_student cohort |
| NYU Summer Launchpad 2026 | **added** | 10 (all merge w/ prior NYU claims) | 25 | Class years on page; 1 founder class of 2021 excluded from eligibility |
| UQ ilab Chapter 2 2026 | **added** | 10 new | 16 | current_student accelerator cohort |
| UH Calvin Shindo SVF | **added** | 2 | 3 | Hohonu=faculty → not student startup; Reeler=alumni no grad year → unverified |
| Ole Miss Rebel SVF | **added** | 30 | 0 | Names only; no founders on page → unverified recency |

### Skipped
| Source | Why |
|---|---|
| Columbia founders | Crunchbase-backed; reuse unresolved |
| CampusHunt | Unverified |
| UCSD Startup DB | Airtable rows not in public HTML |
| BuildList /map + /companies | No campus/student/grad-year fields |
| Nebraska Husker VF | Founders’ UNL affiliation not stated |
| Waterloo SVF investments | No founder/campus/grad evidence (Velocity remains Waterloo source) |

## 2021–2022 alums
Per Amy: **no held list**. Grad years still stored. **87** founder-people in the corpus have verified grad year 2021 or 2022 and do not qualify under the 2023 site cutoff (companies only stay on-site if another founder is current/2023+).

## Artifacts
- Script: `scripts/import-sources-pm-2026-11-02.ts`
- Stats: `reviews/campus-import-sources-pm-stats-2026-11-02.json`
- Sources doc: `reviews/campus-import-sources-36.md`
- Snapshot: `data/corpus-snapshot.json` → investableCompanies 1225
