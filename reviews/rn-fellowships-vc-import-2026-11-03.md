# RN fellowships / DRF / VC import — 2026-11-03

Branch: `cursor/data-backfill-2026-11-03`. Eligibility: current student or class of 2023+ with public evidence. Never merge by name alone (Ghost AI ≠ Ghost Robotics; Known ≠ other Known). Investor edges stored as `company_facts.fact_key='investor'` with `source_url`.

## Named examples (Amy)

- **Kinth**: never a `projects` row before; was unmatched DRF `portfolio_memberships` only. **Added** (Columbia current/2026, DRF+Dynamo+Equal). Materials in `/workspace/bot-archive/dd-kinth/`.
- **Bobyard**: never sourced. **Added** (Stanford dropout 2023, PearX S23, Series A 8VC/Pear/Primary).
- **Ghost**: corpus had only **Ghost Robotics** (different company). **Ghost AI** (Zain Javaid, a16z seed, ghost.ai) **excluded**: recent HS graduate who declined Yale; no college student / class-of-2023+ enrollment evidence.

## Prior +163 vs +154 discrepancy

Scan-all import inserted **154** new investable rows and matched **17** existing. `updateProject` sets `is_investable_candidate=1` on merges, so **9 of those 17** that were previously non-investable were re-enabled → **1225 + 154 + 9 = 1388**. Only LegalTime AI shows the scan-all verification note among merges because `COALESCE(verification_note, ?)` kept prior notes on the other 16.

## Totals (this import)

- Curated leads in JSON: **25**
- Eligible kept: **14**
- Excluded / edge-only: **11**
- New investable inserted: **8**
- Matched existing (merge/update): **6**
- Founders created: **12**
- Investor edges added: **38** (facts 1385 → 1423)
- Investable companies before → after: **1388 → 1396**

## Per curated source_key

| Source | Found | Kept | Excluded | Duplicates | New | Investor edges | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| afore | 1 | 1 | 0 | 0 | 1 | 1 |  |
| drf_portfolio | 3 | 1 | 2 | 0 | 1 | 5 | top exclude: already investable; attaching DRF investor edge only (no new founder eligibility (1) |
| pear_garage_pearx | 6 | 6 | 0 | 1 | 5 | 19 |  |
| thiel_fellowship | 10 | 4 | 6 | 3 | 1 | 10 | top exclude: already in corpus as investable; attaching Thiel Fellowship investor edge only t (6) |
| vc_seed_series_a | 1 | 0 | 1 | 0 | 0 | 0 | top exclude: founder is recent high-school graduate who declined Yale; no college student or  (1) |
| z_fellows | 4 | 2 | 2 | 2 | 0 | 3 | top exclude: listed on Z Fellows directory but no public 2023+ student/alumni campus evidence (1) |

## Family-level scan stats (directories)

### drf_portfolio
- found: **319**, kept: **n/a**, excluded: **317**

### z_fellows
- found: **13**, kept: **3**, excluded: **10**
- Directory via recentfunding.com/accelerators/zfellows. Kept/enriched: Greptile, Mach Industries, Cognition/Etched investor edges. Mintlify excluded (class ~2022). Others lack 2023+ campus evidence this pass.

### thiel_fellowship
- found: **32**, kept: **4**, excluded: **28**
- Crimson 2024 class + Specter 2025/2026 lists. New/re-enabled: Juicebox. Edges: Mercor, Cognition, Etched, Cavalla, EveryTicker, Sentient Machines, Opt32, Praso, Swoop.

### pear_garage_pearx
- found: **8**, kept: **6**, excluded: **2**
- Public PearX page examples + press. Kept: Bobyard, Andera, Phinity Labs, Vals AI, Known, ResiQuant. ResiQuant founders are Stanford PhD students (current).

### afore
- found: **40**, kept: **1**, excluded: **39**
- Portfolio headers scraped from afore.vc/portfolio. Kept StormFree Labs (Brandeis '24). Others lack 2023+ founder evidence this pass.

### contrary
- found: **0**, kept: **0**, excluded: **0**
- contrary.com/companies is JS-rendered without a public static portfolio dump; no connector. Deferred structured scrape to a browser pass; not invented.

### neo_scholars
- found: **9**, kept: **0**, excluded: **9**
- Named in Neo Substack (Cursor, Cognition, Pika, etc.). Overlap with existing investable or pre-2023 founders; no net-new eligible inserts this pass beyond Thiel/Z edges already counted.

### rough_draft_ventures
- found: **24**, kept: **0**, excluded: **24**
- f4.fund RDV portfolio mostly mature companies (Spring Health, Fireflies, Instabase). EdVisorly/Solomon need founder-year evidence; not confirmed 2023+ this pass.

### a16z_speedrun
- found: **79**, kept: **0**, excluded: **79**
- speedrun.a16z.com companies API/list: 79 in SR007. 36 already investable with Speedrun facts; 42 not in DB. Founder bios not in list payload (images only); deferred individual page eligibility research — not bulk-imported without campus evidence.

### vc_seed_series_a
- found: **3**, kept: **0**, excluded: **1**
- Ghost AI (a16z seed) excluded: HS graduate, no college enrollment. Bobyard/Vals counted under PearX. Established-VC edges recorded on Mercor (Benchmark/GC), Mach (Sequoia), Andera (Lightspeed), Vals/Bobyard (a16z/8VC).

### yc_student_recent
- found: **0**, kept: **0**, excluded: **0**
- YC already heavily represented (567 investor facts). No additional student/recent-grad YC batch filter pass completed this turn beyond existing corpus.

## Investor edges added

- Kinth ← **Dorm Room Fund** (https://kinth.ai/)
- Kinth ← **Dorm Room Fund** (https://www.dormroomfund.com/portfolio)
- Kinth ← **Dynamo VC** (https://www.linkedin.com/in/arhon-strauss-753893236)
- Kinth ← **Equal VC** (https://www.linkedin.com/in/arhon-strauss-753893236)
- Bobyard ← **Pear VC** (https://pear.vc/bobyard-series-a/)
- Bobyard ← **8VC** (https://pear.vc/bobyard-series-a/)
- Bobyard ← **Primary Venture Partners** (https://pear.vc/bobyard-series-a/)
- Bobyard ← **Caffeinated Capital** (https://pear.vc/bobyard-series-a/)
- Bobyard ← **PearX** (https://pear.vc/pearx/)
- Andera ← **Pear VC** (https://pear.vc/andera-series-a/)
- Andera ← **PearX** (https://pear.vc/pearx/)
- Andera ← **Lightspeed Venture Partners** (https://lsvp.com/stories/audits-moment-has-arrived-why-we-invested-in-andera/)
- Phinity Labs ← **Pear VC** (https://pear.vc/pearx/)
- Phinity Labs ← **PearX** (https://pear.vc/pearx/)
- Phinity Labs ← **Uncork Capital** (https://uncorkcapital.com/blog/reinventing-chip-design-ai-era-phinity-labs)
- Vals AI ← **Pear VC** (https://pear.vc/pearx/)
- Vals AI ← **PearX** (https://pear.vc/pearx/)
- Vals AI ← **Andreessen Horowitz** (https://pear.vc/pearx/)
- Known ← **Pear VC** (https://pear.vc/pearx/)
- Known ← **PearX** (https://pear.vc/pearx/)
- Known ← **Forerunner Ventures** (https://techcrunch.com/2025/12/19/known-uses-voice-ai-to-help-you-go-on-more-in-person-dates/)
- ResiQuant ← **Pear VC** (https://pear.vc/inside-pearx-resiquants-s24-journey-from-dorm-room-to-pearx/)
- ResiQuant ← **PearX** (https://pear.vc/pearx/)
- StormFree Labs ← **Afore Capital** (https://www.afore.vc/portfolio)
- Juicebox ← **Thiel Fellowship** (https://insights.tryspecter.com/thiel-fellows-2026/)
- Greptile ← **Z Fellows** (https://recentfunding.com/accelerators/zfellows/)
- Mach Industries ← **Z Fellows** (https://recentfunding.com/accelerators/zfellows/)
- Mercor ← **Thiel Fellowship** (https://www.thecrimson.com/article/2024/3/27/thiel-fellowship-startups-2024/)
- Cognition ← **Z Fellows** (https://www.zfellows.com/)
- Etched ← **Z Fellows** (https://recentfunding.com/accelerators/zfellows/)
- Avoca ← **Z Fellows** (https://recentfunding.com/accelerators/zfellows/)
- Tempo ← **Dorm Room Fund** (https://www.dormroomfund.com/portfolio)
- Cavalla ← **Thiel Fellowship** (https://insights.tryspecter.com/thiel-fellows-2026/)
- EveryTicker ← **Thiel Fellowship** (https://insights.tryspecter.com/thiel-fellows-2026/)
- Sentient Machines ← **Thiel Fellowship** (https://insights.tryspecter.com/thiel-fellows-2026/)
- Opt32 ← **Thiel Fellowship** (https://insights.tryspecter.com/thiel-fellows-2026/)
- Praso ← **Thiel Fellowship** (https://insights.tryspecter.com/thiel-fellows-2026/)
- Swoop ← **Thiel Fellowship** (https://insights.tryspecter.com/thiel-fellows-2026/)

