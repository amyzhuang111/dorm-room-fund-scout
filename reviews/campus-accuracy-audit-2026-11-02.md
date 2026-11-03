# Campus Scout accuracy audit — 2026-11-02

**As-of date for recency rule:** November 2026 (America/New_York). A company stays investable only if ≥1 founder is a current student or recent alum with graduation year ≥ 2023. Otherwise `excluded_reason` is set and `is_investable_candidate=0`. Unverifiable recency is marked `unverified recency` (not treated as verified).

## Branches / SHAs / previews

| Branch | Tip SHA | Preview |
|--------|---------|---------|
| `cursor/campus-undergradvc` | `e34269226414daa6b6fac6fec8177afa781f5bf0` | https://campus-scout-3xyuy51zw-amys-projects-d3dfb125.vercel.app |
| `cursor/scoring-r32-from-d1c924b` | `52175b0b7ed0a6e8da0b65fe48ab41f6f4712441` | https://campus-scout-k5cngl225-amys-projects-d3dfb125.vercel.app |

Shared tooling on both: `scripts/audit/campus-accuracy-2026-11-02.py`, `scripts/audit/linkedin-verify-top300-2026-11-02.py`, `scripts/check-count-consistency.mjs`. Corpus counts after recency+dedupe live in `data/corpus-snapshot.json` (regenerate with `npx tsx scripts/ingest/enrich-corpus-snapshot.ts`).

## Starcloud

**Finding:** One company record only (`proj_WVXXbdzPDI1u`, YC S24). Public sources (starcloud.com/team, YC) confirm a single company. There was no second Starcloud row to merge; the bug was founder/eligibility contamination (founders marked recent when they are older alumni).

| Field | Value after fix |
|-------|-----------------|
| Investable | **0** |
| `excluded_reason` | `founders not current/recent (<2023)` |
| Website / description / logo / YC | Belong to this one company (unchanged identity) |

Founders (public LinkedIn verified via WebSearch snippets, no login):

| Person | LinkedIn | Education evidence | Enrollment after fix |
|--------|----------|--------------------|----------------------|
| Philip Johnston | https://www.linkedin.com/in/philipjohnst0n | Wharton MBA 2016–2018; Harvard MPA | older_alumni (not ≥2023) |
| Ezra Feilden | https://www.linkedin.com/in/ezrafeilden | Imperial PhD 2014–2017 | older_alumni |
| Adi Oltean | https://www.linkedin.com/in/adioltean | Bucharest degrees; Microsoft 1998–2021; SpaceX | older_alumni |

Note: earlier candidate slug `johnstonphilip` was **wrong**; verified handle is `philipjohnst0n`.

## Recency totals

### undergradvc (`e342692`)

| Bucket | Companies |
|--------|-----------|
| Before investable | 5,435 |
| Kept (null `excluded_reason`) | 1,191 |
| Excluded `founders not current/recent (<2023)` | 224 |
| `unverified recency` | 4,169 |
| **Investable after** | **1,158** |
| Company rows total | 5,584 |

### scoring-r32 (`52175b0`)

| Bucket | Companies |
|--------|-----------|
| Before investable | 2,508 |
| Kept (null `excluded_reason`) | 1,191 |
| Excluded `founders not current/recent (<2023)` | 224 |
| `unverified recency` | 1,242 |
| **Investable after** | **1,158** |
| Company rows total | 2,657 |

Starcloud is in the excluded sample on both branches.

## Cross-contamination audit (confirmed fixes only)

| Issue type | undergradvc | scoring-r32 | Action |
|------------|-------------|-------------|--------|
| Copied descriptions cleared | 296 | 243 | blanked only where duplicate text across unrelated companies was confirmed |
| Logo / domain mismatch | 4 | 4 | cleared bad logo refs |
| Campus without `evidence_url` | flagged | flagged | left marked; no invented URLs |
| Soft website mismatches | reviewed | reviewed | no invented sites |

**Agora false positive for name-only dedupe:** `proj_jRCyQwIq8J1u` (NYU clothing resale) vs `proj_yTsIek7JT4YO` (Penn campus marketplace) — different founders and campuses; **kept both**.

## LinkedIn verification (top 300 visible companies)

Source: `scripts/audit/linkedin-verify-top300-2026-11-02.py` + public WebSearch for Starcloud. **No LinkedIn login.** `linkedin_url` stored in `people.aliases_json` as `linkedin:<url>` **only when verified**.

| Metric | Count |
|--------|------:|
| Founders in top-300 pass | 566 |
| Verified | 204 |
| Unverified | 362 |
| Conflict | 0 |
| Coverage (verified / total) | 36.0% |

Results: `/workspace/reviews/campus-linkedin-verify-2026-11-02.json`.

## Count consistency (companies vs campuses vs founders)

**Prior confusion:** homepage “Top campuses” showed **2,782**, which was `foundersListed` (founder names on investable companies), not campus count and not investable companies (~5,435 pre-recency). Labels now say **“founder names on investable companies”** and **“campuses on map”**.

### Source of truth (`data/corpus-snapshot.json` after recency + dedupe)

| Field | Meaning | undergradvc | scoring-r32 |
|-------|---------|------------:|------------:|
| `investableCompanies` | company + investable after recency | 1,158 | 1,158 |
| `foundersListed` | founder-name surface on investable cards | 1,982 | 1,982 |
| `foundersIndexed` | founders.json / buildFounderIndex length | 3,104 | 3,104 |
| `campusesOnMap` | universities with lat/lon | 157 | 74 |
| `campusesTotal` | universities | 166 | 83 |
| `ycMembership` | investable with YC fact | 304 | 304 |
| `signals` | signal rows | 1,476 | 1,090 |

### Page inventory

| Page | Count shown | Source |
|------|-------------|--------|
| Home fold “N companies” | investable companies | snapshot `investableCompanies` |
| Home “N campuses on map” | campuses with coordinates | snapshot `campusesOnMap` |
| Home founder-names line | founders on investable set | snapshot `foundersListed` |
| Home Top campuses subtitle | “X founder names on investable companies · Y campuses on map” | `foundersListed` + `campusesOnMap` (top list is a **subset**) |
| Home founders-indexed (when >0) | searchable founder index | snapshot `foundersIndexed` |
| `/companies` directory / filters | investable cards | directory builder |
| Campus pages | per-campus tallies from investable set | directory + affiliations |
| `/data` | corpus explorer | same investable directory |
| `/signals` | signal totals | DB `signals` |
| CSV `/data/export` | export of directory | same investable source |

`scripts/check-count-consistency.mjs` renders `/`, `/companies`, `/campuses`, `/data`, `/signals` and fails when counts that should match the snapshot differ. **Passed** on both branches after label + `foundersIndexed` alignment.

### Checks

| Check | undergradvc | scoring-r32 |
|-------|-------------|-------------|
| `check-count-consistency.mjs` | PASS | PASS |
| `check-founder-fold.mjs` | PASS | PASS |
| `check-facet-dom.mjs` | some pre-existing UI flags still fail; count reconciliation fixed | deploy build green |
| name-only dedupe Agora | intentional keep (different campuses) | same |

## Machine summaries

### undergradvc

```json
{
  "label": "undergradvc@e342692",
  "companies": 5584,
  "investable": 1158,
  "excluded_reason_counts": {
    "(null)": 1191,
    "founders not current/recent (<2023)": 224,
    "unverified recency": 4169
  },
  "starcloud": {
    "name": "Starcloud",
    "is_investable_candidate": 0,
    "excluded_reason": "founders not current/recent (<2023)",
    "website_url": "https://www.starcloud.com/"
  },
  "starcloud_founders": [
    {
      "id": "person_OzD9Og2zXj11",
      "name": "Philip Johnston",
      "enrollment_status": "older_alumni",
      "enrollment_grad_year": null,
      "verification_note": "Starcloud founder recency corrected 2026-11-02 | linkedin:verified"
    },
    {
      "id": "person_qp0LOFWhNEE_",
      "name": "Ezra Feilden",
      "enrollment_status": "older_alumni",
      "enrollment_grad_year": null,
      "verification_note": "Starcloud founder recency corrected 2026-11-02 | linkedin:verified"
    },
    {
      "id": "person_2NbIBk3_BAWn",
      "name": "Adi Oltean",
      "enrollment_status": "older_alumni",
      "enrollment_grad_year": null,
      "verification_note": "Starcloud founder recency corrected 2026-11-02 | linkedin:verified"
    }
  ],
  "linkedin_alias_verified_people": 201,
  "linkedin_alias_unverified_people": 352
}
```

### scoring-r32

```json
{
  "label": "scoring-r32@52175b0",
  "companies": 2657,
  "investable": 1158,
  "excluded_reason_counts": {
    "(null)": 1191,
    "founders not current/recent (<2023)": 224,
    "unverified recency": 1242
  },
  "starcloud": {
    "name": "Starcloud",
    "is_investable_candidate": 0,
    "excluded_reason": "founders not current/recent (<2023)",
    "website_url": "https://www.starcloud.com/"
  },
  "starcloud_founders": [
    {
      "id": "person_OzD9Og2zXj11",
      "name": "Philip Johnston",
      "enrollment_status": "older_alumni",
      "enrollment_grad_year": null,
      "verification_note": "Starcloud founder recency corrected 2026-11-02 | linkedin:verified"
    },
    {
      "id": "person_qp0LOFWhNEE_",
      "name": "Ezra Feilden",
      "enrollment_status": "older_alumni",
      "enrollment_grad_year": null,
      "verification_note": "Starcloud founder recency corrected 2026-11-02 | linkedin:verified"
    },
    {
      "id": "person_2NbIBk3_BAWn",
      "name": "Adi Oltean",
      "enrollment_status": "older_alumni",
      "enrollment_grad_year": null,
      "verification_note": "Starcloud founder recency corrected 2026-11-02 | linkedin:verified"
    }
  ],
  "linkedin_alias_verified_people": 201,
  "linkedin_alias_unverified_people": 352
}
```

## Notes / limits

- No personal emails/phones collected.
- Unverifiable founder recency is explicit (`unverified recency`), not silently kept.
- Stale SQLite `-wal`/`-shm` after branch switches can replay onto `campus-universe.db`; sidecars discarded before commits.
- `public/data/*.json` is gitignored; previews regenerate via `prebuild` → `precompute-map-cache.ts`.

## Starcloud follow-up (2026-11-02)

### Was there a bad merge of two companies?

**No.** Exhaustive search of `projects`, `people`, `aliases_json`, `claims`, `entity_redirects` (table absent/empty of Starcloud), and every `data/imports/*` JSON/CSV found **one** company row: `proj_WVXXbdzPDI1u` (Starcloud). Imports never contained a second Starcloud/Star Cloud/Lumen Orbit company to merge away (only a false-positive `LumeNIRS` string hit).

### Evidence: one legal company, former names

YC OSS / GeekWire: **Lumen Orbit renamed to Starcloud** (orbital data centers). Aliases now stored on the row: `Lumen Orbit`, `Lumen Orbit, Inc.`, `Star Cloud`, `same_company_as:Lumen Orbit (renamed 2025)`. Website: https://www.starcloud.com/

### Distinct public companies that are NOT in this corpus

| Name | What | In DB? |
|------|------|--------|
| Starcloud (YC, ex Lumen Orbit) | Orbital data centers · Philip Johnston, Ezra Feilden, Adi Oltean | Yes · excluded older alumni |
| Star Cloud OÜ (Estonia) | Edtech / Opiq · founded 2014 | No — never imported |
| Star Cloud (Nanjing, 2015) | Campus student app · deadpooled · Tracxn | No — never imported |

Amy's "two Starclouds" matches the public namespace collision; this scout never held the second firm, so there is nothing to split. Misleading prior presentation was former-name + Penn/Wharton MBA affiliation on Philip (MBA 2016–2018), not a merge.

### Founder graduation years (public evidence)

| Founder | Grad year | Status | Evidence |
|---------|-----------|--------|----------|
| Philip Johnston | 2019 | older_alumni | Wharton MBA 2016–2018; Harvard MPA 2017–2019; Nottingham BSc 2005–2008. LinkedIn https://www.linkedin.com/in/philipjohnst0n |
| Ezra Feilden | 2017 | older_alumni | Imperial PhD Materials 2014–2017. LinkedIn + Imperial Spiral thesis record |
| Adi Oltean | pre-1998 career | older_alumni | Univ. Bucharest / Politehnica; Microsoft ~1998–2021 then SpaceX. LinkedIn https://www.linkedin.com/in/adioltean |

Company remains `is_investable_candidate=0`, `excluded_reason='founders not current/recent (<2023)'`. Penn affiliation role clarified as Wharton MBA alum, not a recent undergrad founder.

## Recency verification batches

### Batch 1 (top YC unverified by visibility)

- Kept: 7 · Excluded: 8 · Left unverified in batch: 0
- Totals after: investable 1165, excluded older 232, unverified 4154
- Artifact: `/workspace/reviews/recency-batch1-2026-11-02.json`

Kept examples: Human Behavior (Stanford 2023 dropout), Salem Robotics (UT Austin PhD current), ACX (Cambridge PhD 2024), AgentPhone (UIUC 2023), Aktoria (IISc 2025), Alex (Brown 2023), Alkera (Yale 2026).

Excluded examples: Molagri (UofT 2020), AICE (MIT 2021), Airgoods (Yale 2022), Alara (NYU 2014), Antigen (Berkeley 2021), AutoPallet (Olin 2019), Blaze (Duke/Cornell ≤2015), Cloudglue (UofT 2020).

### Batch 2 (next YC unverified)

- Kept: 7 · Excluded: 3 · Unverified in batch: 1
- Totals after: investable 1172, excluded older 235, unverified 4144
- Totals after sources import 2026-11-02 (class of 2023+ cutoff): investable **1225**, excluded older alumni 235, unverified recency 4171, founders with grad year 2021/2022 excluded from site eligibility: 87 (no held list)
- Artifact: `/workspace/reviews/recency-batch2-2026-11-02.json`

Kept: Atlas Discovery, Atlia, Avea, Aviern, AxionOrbital, Bluejay, Booko. Excluded: Arva AI (2021), Avelis (2021), Azalea (≤2022). Still unverified: Bernard (no public grad year).

### Site labeling

- `/methodology#founder-recency` shows kept / excluded older alumni / unverified recency from `corpus-snapshot.json`.
- `/data` banner repeats the funnel and states unverified are not counted as verified.
- Directory / home / globe continue to list only `is_investable_candidate=1`.
