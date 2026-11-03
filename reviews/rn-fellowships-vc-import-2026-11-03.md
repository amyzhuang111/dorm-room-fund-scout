# RN fellowships / DRF / VC exhaustive pass — 2026-11-03 (pass 2)

Branch: `cursor/data-backfill-2026-11-03`. Preview only. Eligibility: current student or class of 2023+ with public evidence. Never merge by name alone.

## Sync Labs S→C explanation (fixed)

Sync Labs (`synclabs.co`, `proj_sg-fSe6I5PxP`) is **not** YC. YC “Sync” is a different company (`sync.so`). An earlier assign pass labeled Sync Labs **C** from a stale “WUEC incubator” basis while the live investor fact is **Venture Lab VIP-X** (Penn). VIP-X is not in `NATIONAL_PROGRAMS`, so matchNational never upgraded it; existing C seeded projectCand and stuck. Manual fix (same basis as Felicity): **B · VIP-X**. Re-assign keeps B via existing-tier seed. Confirmed after this pass: still **B**.

## Investable delta

- Before this exhaustive pass: **1614**
- After: **1633** (+19: 12 new inserts + re-enables/merges)

## Fill rates (investable; stage = funding_round.detail.stage; sector = tags+column)

| Field | Before (n=1614) | After (n=1633) |
|---|---:|---:|
| founded_year | 772 | 792 |
| stage | 549 | 950 |
| website_url | 1001 | 1450 |
| investor | 531 | 547 |
| sector | 1106 | 1112 |
| description | 1612 | 1617 |
| funding_round_or_total | 551 | 952 |

## Per-source family table

| Family | Found | Kept | Excluded | Notes |
|---|---:|---:|---:|---|
| DRF portfolio (+ press) | 319 | 8 new/re-enabled (+Kinth prior) | ~311 | Daemo, AethexAI, Juniper, Shinkei (re), Endex, American Tractor, Flock AI, Tangram enrich. Year-excluded: Hadrius, EdVisorly, Taya, Snapp, Aviato (HS), Ash, Jolly, Faura |
| Z Fellows (all alumni named on site) | 22 | 7 | 15 | Cal AI, Aaru, Swsh, Phia, Judgment Labs + prior Greptile/Mach. Excl Bland/Posh/Nucleus/Fun/Mintlify |
| Thiel Fellowship | 35 | 5 | 30 | +Orchard Robotics; Endex/Swsh also Thiel |
| Pear / PearX | 8 | 6 | 2 | Unchanged (Bobyard, Andera, Phinity, Vals, Known, ResiQuant) |
| Afore | 40 | 1 | 39 | StormFree only |
| Contrary | 4 | 1 | 3 | Orchard (JS portfolio still opaque) |
| Neo Scholars | 18 | 0 | 18 | 2025 roster image-only; named portcos already in corpus |
| Rough Draft / F4 | 24 | 0 | 24 | Mature book; EdVisorly '21 |
| a16z Speedrun | 79 | 1 | 78 | Space (UofT dropout); Sutrix also Speedrun counted under YC |
| YC W23→now student/dropout/grad 2023+ | 25 scanned | 3 | 22 | Plyxl, Preload, Sutrix (bios with dropout/PhD student) |
| Columbia Startup Lab | 14 | 4 | 10 | Regbase, Arth, Spacely, Verteel (CBS current) |
| Kleiner Fellows | 39 | 0 | 39 | Internships, not founder cos |
| VC seed/Series A student/recent-grad | 8 | edges only | — | Orchard GC/Contrary; Phia Kleiner; Shinkei FF; etc. |

## Investor edges (this pass, sample)

DRF on Daemo, AethexAI, Juniper, Shinkei, Endex, American Tractor, Flock AI; Thiel on Endex/Orchard/Swsh; Z Fellows on Cal AI/Aaru/Swsh/Phia/Judgment Labs; YC on Plyxl/Preload/Sutrix; Speedrun on Space/Sutrix; Contrary+GC+Quiet on Orchard; Kleiner on Phia.

## Gates

Local production build + DOM gates on :3460 before preview deploy to **campus-scout** only (not the accidental `dorm-room-fund-scout-backfill` project).
