# Campus import results — 2026-11-02

**Branch:** `cursor/campus-undergradvc`  
**Base scoring SHA:** `12e3f85`  
**Import tip SHA:** `2cfff46` (queue batch 2); weekly `d4c2126`; priority `c6c58d0`  
**Preview:** https://campus-scout-g1rlgzupu-amys-projects-d3dfb125.vercel.app  
**Inspect:** https://vercel.com/amys-projects-d3dfb125/campus-scout/9ozPzDLDsqUB9nbrdsxXvgkD6JB9  
**Rules:** public pages only · no logins · rate-limit · no personal contact info · corrected dedupe (domain else name+campus+founders; never name alone) · fields: `university`, `affiliation_type`, `cohort_year`, `enrollment_status` (only when source states it), `website`, `evidence_url` · never present alumni/faculty as current_student.

**ETA (remaining 36-list after this priority ship):** ~4–7 hours wall-clock for viable public HTML/JSON sources (NYU, UofT, Velocity/Waterloo fallback, SuperScout free, Brown, Yale, MIT delta v refresh, Imperial/Cambridge/NUS/HKUST/HKU/SMU, BuildList filtered); plus blocked/JS sources that need browser or stay reported. Amy UI (Database/Account/Support/Feedback) still after imports.

## Priority batch (ship first)

| # | Source | Status | Found | Imported | Merged | Notes |
|---:|---|---|---:|---:|---:|---|
| 1 | UndergradVC `/startups` | **done** | 855 | 798 | 57 | RSC public HTML; competition signals dated when year present |
| — | UBC Tech Map (FRV) | **done** | 74 | 72 | 2 | CC BY 4.0; startups only |
| — | SFU Tech Map (FRV) | **done** | 84 | 84 | 0 | CC BY 4.0; startups only |
| 9 | Harvard Innovation Labs ventures | **done** | 606 | 584 | 22 | Lab filters → 100 current_student, 100 alumni, rest unknown |
| 20 | Northwestern Garage resident startups | **done** | 62 | 55 | 7 | affiliation_type=current_student (resident list) |
| 13 | Cornell eLab (2024–2027 cohorts) | **done** | 126 | 101 | 25 | cohort_year set; current_student |
| 12 | Princeton Keller eLab | **blocked** | — | — | — | Cloudflare 403 on public HTML |
| 11 | Penn VIP-X alumni page | **done** | 120 | 46 | 74 | affiliation_type=**alumni** (never current_student) |
| 16 | Free Ventures portfolio | **blocked** | — | — | — | Empty JS shell (2655 B); no public JSON |
| 17 | Entrepreneurs @ Berkeley companies | **blocked** | — | — | — | Next.js client flight; no SSR list |
| 18 | Berkeley SkyDeck companies | **partial** | 12 | 2 | 10 | Grid JS-rendered; only preloaded slugs from HTML. Full merge needs browser or existing `src_skydeck` |

**Priority batch totals (this run’s JSON caches):** found 926 · imported 788 · merged 138  
**(+ earlier UGVC+FRV):** found 1013 · imported 954 · merged 59

## Full 36 + extras (queue status)

| # | Source | Status |
|---:|---|---|
| 1 | UndergradVC | done (priority) |
| 2 | SuperScout free pages only | **blocked** — `/universities` ecosystem pages; no public company roster |
| 3 | Dorm Room Fund portfolio | queued |
| 4 | FrontRow Ventures portfolio | queued |
| 5 | Crimson Founder Files | queued |
| 6 | BOS Network | queued |
| 7 | Columbia startups/founders | **flagged unresolved** — Crunchbase-powered reuse |
| 8 | CampusHunt | **provisional** — verify before import |
| 9 | Harvard i-lab ventures | done (priority) |
| 10 | MIT delta v 2026 | **done** (batch2) — 2025 past-teams + 2026 Demo Day sites; 35 rows, all merged |
| 11 | Penn VIP-X alumni | done (priority) |
| 12 | Princeton eLab | blocked (CF 403) |
| 13 | Cornell eLab | done (priority) |
| 14 | Brown B-Lab 2026 | **done** (batch2) — 9 ventures; 4 imported / 5 merged; current_student |
| 15 | Yale CITY venture wall | **blocked** — logo wall without company names on public HTML |
| 16 | Free Ventures | blocked (JS shell) |
| 17 | E@B companies | blocked (client-only) |
| 18 | SkyDeck | partial (12 HTML slugs); existing SkyDeck source remains |
| 19 | StartX community | queued / likely no public startup directory |
| 20 | Northwestern Garage | done (priority) |
| 21 | Purdue HIVE ventures | queued |
| 22 | NYU featured startups | **done** (batch2) — 152 found; 133 imported / 19 merged; affiliation unknown |
| 23 | UMich entrepreneurs (public only) | **skipped** — hivebrite login wall |
| 24 | CMU Swartz / Airtable | **blocked** — public embed tried; no records |
| 25 | UNC EVC ventures | queued — **skip contact emails/phones** |
| 26 | Waterloo Startups directory | **feed error** → use **Velocity** (#27) as fallback |
| 27 | Velocity incubator companies | **done** (batch2) — 2025+ only (12); 2 imported / 10 merged; affiliation unknown |
| 28 | UofT startups directory | **skipped** — empty public rows |
| 29 | UBC innovation portfolio | queued (alongside FRV techmap) |
| 30 | Imperial VCC / Enterprise Lab | **blocked** — competition page + Startups Magazine; no public portfolio roster |
| 31 | Accelerate Cambridge ventures | **blocked** — filter UI only; venture rows not in public HTML/JSON |
| 32 | NUS Furnace | **done** (batch2) — 45 (5 current / 40 alumni); 42 imported / 3 merged |
| 33 | NUS CDE student startups | **skipped** — empty body |
| 34 | HKUST startup companies | **blocked** — Airtable interface embed; row XHR not harvested |
| 35 | HKU TEC directory | **blocked** — directory body empty; `iw2026_company` CPT is partners/labs not startups |
| 36 | SMU IIE startups | **done** (batch2) — 401 (2021+); 401 imported; shared placeholder websites nulled |
| 37 | BuildList `/map` | **blocked** — public JSON lacks campus / student / graduation fields |
| 38 | BuildList `/companies` | **blocked** — no campus or grad-year fields to enforce 2021+ student/alum filter |


## Queue batch 2 (Velocity / NYU / Brown / MIT / Furnace / SMU)

| # | Source | Status | Found | Imported | Merged | Notes |
|---:|---|---|---:|---:|---:|---|
| 27 | Velocity 2025+ | **done** | 12 | 2 | 10 | affiliation unknown (accelerator ≠ enrollment) |
| 22 | NYU Featured Startups | **done** | 152 | 133 | 19 | affiliation unknown |
| 14 | Brown B-Lab 2026 | **done** | 9 | 4 | 5 | current_student; cohort_year=2026 |
| 10 | MIT delta v 2025+2026 | **done** | 35 | 0 | 35 | already in corpus; claims refreshed |
| 32 | NUS Furnace | **done** | 45 | 42 | 3 | Current Residents → current_student; Alumni → alumni |
| 36 | SMU IIE 2021+ | **done** | 401 | 401 | 0 | campus `univ_smu_sg`; shared CMS websites cleared |
| 2 | SuperScout free | **blocked** | — | — | — | no company roster on free uni pages |
| 37–38 | BuildList | **blocked** | — | — | — | no campus/grad fields for required filter |
| 15 | Yale CITY | **blocked** | — | — | — | nameless logo wall |
| 34 | HKUST | **blocked** | — | — | — | Airtable interface |
| 35 | HKU TEC | **blocked** | — | — | — | empty directory / wrong CPT |
| 30 | Imperial | **blocked** | — | — | — | no public portfolio list |
| 31 | Cambridge Accelerate | **blocked** | — | — | — | JS filter UI, no public rows |

**Batch 2 totals:** found 654 · imported 582 · merged 72

### Previously queued / blocked

| Source | Status |
|---|---|
| UCSD Startup DB (Airtable) | **blocked** — embed public but row XHR not harvested; no CSV |
| UW–Madison innovate directory | **no public startup list** — redirects to entrepreneurship hub |
| UVA Foundry | **no public startup list** — `/ventures` is program copy; list behind `app.uvafoundry.com` |
| Dealroom aggregates | **blocked** — Cloudflare 403 |
| Georgetown | queued |
| Stanford Founders | community page, not a startup directory |


## Weekly candidates (2026-11-02 health check)

| Source | Status | Found | Imported | Merged | Notes |
|---|---|---:|---:|---:|---|
| Georgia KickStart / UGA | **done** | 114 | 114 | 0 | public portfolio; cohort_year from year sections; affiliation unknown |
| Illinois iVenture | **done** | 169 | 166 | 3 | cohorts 1–11 + post; affiliation unknown |
| USF SII | **done** | 187 | 187 | 0 | alumni/cohort list; affiliation unknown (mixed page) |
| UConn Hillside | **done** | 20 | 19 | 1 | names from LinkedIn company / site; affiliation unknown |
| RIT Venture Fund | **done** | 9 | 9 | 0 | page claims 17; 9 with clear public domain rows in HTML |
| CU Deming | **done** | 22 | 22 | 0 | current investments (+ exits on page) |
| Duke BRiDGE | **done** | 12 | 12 | 0 | “our startups” h3 list |
| Duke Showcase 2025 | **done** | 33 | 28 | 5 | affiliation_type=current_student; cohort_year=2025 |
| UCSD Startup DB | **blocked** | — | — | — | Airtable embed public shell; row payload not in HTML |
| CMU Airtable (Project Olympus) | **blocked** | — | — | — | public share/embed tried; no extractable records |
| Columbia founders / Princeton / UMich / UofT / NUS EDIC / Brown VIA | **skipped** | — | — | — | per weekly broken list |

**Weekly first-import net new ≈ 557** (114+166+187+19+9+22+12+28). Companies in DB after weekly: **4956** (was 4399 post-priority).

Script: `scripts/import-weekly-2026-11-02.ts`. Stats: `/workspace/reviews/campus-import-weekly-stats-2026-11-02.json`.


## Affiliation field handling

Claims of type `campus_program_listing` / `undergradvc_listing` / `frv_techmap_listing` store JSON with:
`university`, `affiliation_type`, `cohort_year`, `enrollment_status` (null unless source states it), `website`, `evidence_url`.

VIP-X and Harvard Alumni Launch Lab forced to `alumni`. Garage + Cornell eLab cohort pages use `current_student`. Harvard Student i-lab → `current_student`. Pagliuca / unlabeled Harvard → `unknown` (not current_student).

## Next

1. Commit + Vercel preview for weekly import SHA (this update).  
2. Continue batch 2: Velocity (Waterloo fallback), NYU, SuperScout free, BuildList filtered, Brown/Yale/MIT, then APAC.  
3. Browser-assisted Free Ventures / E@B / SkyDeck / UCSD Airtable XHR only if public and robots allow.  
4. Amy UI on this branch after imports.
