# Campus Universe — a Dorm Room Fund-shaped startup scout

An independent scouting workspace for Amy (Penn) to discover and prioritize
pre-seed, student-founder prospects by university. **Not an official Dorm
Room Fund product.** Nothing here implies Amy represents DRF, and there is
no automatic outreach anywhere in the app.

This README is the honest status report: what's real, what's checked, and
what's still missing. It's written to match what the code actually does,
not the full brief — see `app/methodology/page.tsx` (also live at
`/methodology` once running) for the same breakdown inside the app.

## LinkedIn lookup on your Windows laptop

This runs locally. It does not run in the deployed app. The lookup searches
public Google results for `linkedin.com/in` profiles and writes candidates
to `data/imports/apify_linkedin_results.jsonl` (gitignored). It does not
write to the database. The importer applies the file: a profile is
confirmed only when the name matches and the school, company, or role
appears in the title or snippet. A name-only match stays unverified.
Anything else is left blank.

From PowerShell, in the repo root (`.env.local` holds `APIFY_API_TOKEN`):

```powershell
npm install
npm run enrich:apify-linkedin -- --dry-run --campus penn --limit 20
npm run enrich:apify-linkedin -- --campus penn --limit 20 --yes
npm run import:apify-linkedin -- --dry-run
npm run import:apify-linkedin
```

If the dry-run instead dies immediately with `malformed database schema (…) - orphan index`, the committed `data/campus-universe.db` is not the broken part. A leftover `data/campus-universe.db-wal` or `-shm` from an older copy of the file is being replayed on top of it. Git ignores those sidecars, so a pull that replaces the `.db` leaves them behind, and the name in the error is whatever row landed on the schema page (often a person id). Opening the database moves a sidecar pair that fails schema load aside and reopens the main file. Deleting the two sidecar files yourself does the same thing. Do not delete `data/campus-universe.db`. `.gitattributes` marks `*.db` binary so a Windows checkout does not rewrite it.

`--dry-run` prints the queue and the Apify estimate and spends nothing.
A live lookup stops after that estimate until you pass `--yes`. Run the
same lookup command again to resume: people already in the JSONL file are
skipped. Omit `--limit` to take the rest of the queue. `--campus` accepts
`penn`, `berkeley`, `stanford`, `mit`, `harvard`, `waterloo`, and the
other schools in the database. Order is Penn, then Berkeley, then the rest.

The actor is `apify/google-search-scraper` (official, no LinkedIn login).
One search page per person, add-ons off, 10 searches per run. Checked
2026-09-26 against the rate card that started 2026-08-20: about **$4.60 per
1,000 lookups** on the Free plan and **$1.90 per 1,000** on the Gold plan.
The page price alone is $4.50 or $1.80 per 1,000. Confirm the live price
at https://apify.com/apify/google-search-scraper before a large run.

## The Globe was actually broken — root-caused and fixed for real

You reported "the globe is so bad I cannot even see anything but a white
circle." That was real, and it took a genuinely thorough investigation to
find the actual cause (not a color tweak that happened to look better) —
worth documenting in detail since two earlier "fixes" in this same
conversation looked plausible and turned out to be wrong or incomplete.

**What was actually wrong, in order of discovery:**

1. **Pale-on-pale colors** (the literal first bug you reported). Fixed by
   sampling real DRF purple tones instead of near-white tints.
2. **A second, self-inflicted bug from fixing #1**: recoloring the
   landcover/landuse/park layers without also capping their `fill-opacity`
   painted a near-opaque solid-color wall over the whole map at low zoom —
   those layers' own opacity is a zoom-interpolated expression whose domain
   starts around zoom 8, and MapLibre clamps to the first stop's value
   *below* that domain (so at zoom ~2.6 they render at ~0.7–1.0 opacity,
   not the near-zero you'd expect from a "fades in at high zoom" layer).
   Verified the fix in an isolated, non-bundled MapLibre test page before
   touching the real component.
3. **The actual production bug, found only by testing the real deployed
   site with a real browser**: zero vector-tile (`.pbf`) requests were
   ever issued — confirmed by inspecting live network traffic — because
   Turbopack (Next.js's bundler) extracts MapLibre's internal Web Worker
   into its own chunk instead of leaving MapLibre's own `blob:`-URL worker
   creation alone. The worker object gets created, but never becomes
   functional, so tiles never load — only the flat background paint
   (which doesn't need the worker) ever showed, which is exactly why it
   looked like a solid-color circle.

**The fix**: load MapLibre GL JS from its CDN at runtime
(`import("https://unpkg.com/maplibre-gl@6.10.0/dist/maplibre-gl.mjs")`,
version-pinned to the same 6.10.0 already in `package.json`, which
patches a critical XSS CVE present in ≤6.4.0 — a downgrade to v5 was
briefly considered and rejected specifically because it would have
reintroduced that vulnerability) instead of through Turbopack's bundle.
This is also literally what dashboard.vclense.ch/ycglobe itself does (a
plain CDN `<script>` tag, not an NPM bundle) — not a workaround invented
here, the same integration choice as the reference site, now confirmed to
exist for a real, load-bearing reason rather than just being how they
happened to set it up.

**How this was actually verified**, since "trust me, I fixed it" wasn't
good enough after getting it wrong twice already: installed a real headless
Chromium (Playwright) in this environment, extracted its missing shared
libraries by hand (no root access here — downloaded the `.deb` packages
with `apt-get download` and pointed `LD_LIBRARY_PATH` at the extracted
`.so` files rather than skipping verification), and used it to:
- Screenshot the actual rendered globe (not just "the code compiles")
- Inspect real network traffic and confirm `.pbf` tile requests fire (8 of
  them) and a proper `blob:` URL worker gets created
- Test against **the real production build locally** (`next start`, not
  `next dev` — dev-mode Turbopack in this environment turned out to have
  its own unrelated caching/stale-process problems that produced
  misleading signals partway through this investigation) and then against
  **the actual live Vercel URL** after deploying, which is the version
  that matters
- Confirm the same real screenshot (visible continents, oceans, boundary
  lines, labels, and our own campus markers with labels) on all of: an
  isolated non-bundled test page, the local production server, and the
  live deployment at https://dorm-room-fund-scout.vercel.app

## Visual identity now sampled directly from dormroomfund.com

A later, explicit request asked to closely mimic DRF's actual site colors
and type, superseding the "not sampled reference-site values" instruction
below for this specific aspect. Real values pulled from DRF's own
stylesheet (`dormroomfund.webflow.shared.css`):

- **Font**: Satoshi (`var(--font-family--heading/body)` in their CSS) —
  loaded from Fontshare, the font's own free CDN.
- **Colors**: background `#f1eff4` (their `--neutral--lavender-lightest`),
  text `#1c1525` (`--neutral--ink`), borders `#d9d5df`
  (`--neutral--lavender`), primary accent `#9378ee` (`--brand--purple`),
  secondary accent `#ff6a33` (`--brand--orange`, used on the Globe's
  selected-campus marker). Status colors use their actual dark-text-on-
  light-bg pairs (green `#114e0b` on `#cef5ca`, yellow `#5e5515` on
  `#fcf8d8`, red `#3b0b0b` on `#f8e4e4`) rather than an opacity trick.
- **Type scale**: DRF's headings are weight 500, letter-spacing 0, line-
  height ~1.15 at marketing-hero sizes (h1 `clamp(3.25rem,5.8vw,5.125rem)`)
  — kept the same weight/letter-spacing/line-height here but scaled down
  for a dense app UI rather than reproducing hero-sized headings. Body
  text 15px/1.5, matching their 16px/1.5 body almost exactly.

This replaced the single dark theme (`#0B0D12` background) from the
UIUX_UPGRADE_CLAUDE.md pass below — that spec's palette table was
explicitly "suggested... not sampled reference-site values," so there's no
real conflict, just two different instructions about the same tokens,
with this one being the later and more specific.

## Third pass: the Globe is now the actual technology YCGlobe uses

Studied YCGlobe's page source more closely (not just its surrounding panel
chrome this time) and found it's built on **MapLibre GL JS's real 3D globe
projection** (`map.setProjection({type:'globe'})`, available since MapLibre
v5), the free no-API-key **OpenFreeMap "positron"** vector tile style, a
GeoJSON `circle`-layer for markers (not DOM/WebGL sprite markers), and a
`map.setSky(...)` atmosphere config — plus they recolor the entire base map
style (land/water/boundaries/labels) to their own brand palette via
`setPaintProperty` on every style layer.

**Replaced `react-globe.gl` (a photo-textured three.js sphere) with this
same real stack**, recolored to the DRF-sampled tokens instead of YCGlobe's
orange/cream theme:
- `components/globe-view.tsx` now dynamically imports `maplibre-gl`
  client-side, creates a real `Map` with the OpenFreeMap style, switches to
  globe projection + sky/atmosphere on style load, and recolors every
  background/water/landuse/boundary/label layer found in that style — the
  exact technique YCGlobe uses, verified by reading its actual JS.
- Campus markers are a real GeoJSON source + `circle` layer sized by
  candidate count, with a second `circle` layer for the selected-campus
  highlight (filtered by `id`, matching YCGlobe's `campus-selected` /
  `dots` layer split) and a `symbol` layer for campus name labels.
- Added real zoom-in/zoom-out/reset ("fit results") glass-panel buttons —
  from spec §7's requirement, previously missing entirely under
  `react-globe.gl`.
- Removed the now-unused `react-globe.gl` dependency entirely
  (`npm uninstall`), rather than leaving dead code installed.
- **Verified for real, not assumed**: confirmed `maplibre-gl`'s `Map` class
  actually resolves via a direct Node import test (catches import-shape
  bugs TypeScript alone wouldn't necessarily catch at the dynamic-import
  boundary — and did catch one: `import("maplibre-gl")` has no `.default`,
  fixed to use named exports). Confirmed on the live production deployment
  that MapLibre's real CSS (`.maplibregl-map` rules) is present in the
  actual served bundle, not just assumed from a local build.
- **Still not verified**: actual WebGL rendering in a real browser (globe
  visually spinning up, tiles painting, atmosphere gradient rendering
  correctly) — no headless-browser tooling available in this environment.
  Confirmed the module loads, the map object constructs, and the right
  CSS/JS ships to production; did not confirm pixels on screen.
- Did not adopt: YCGlobe's animated entry splash or draggable/resizable
  panels (same reasoning as the prior pass — out of scope for this tool).

## Second design pass: pushed DRF fidelity further + studied dashboard.vclense.ch/ycglobe

- **Body text now 16px** (was 15px) — matches DRF's own `1rem` body size
  exactly rather than approximately.
- Studied YCGlobe's real stylesheet directly (it's a maplibre-gl-based
  YC-companies globe with a sidebar of grouped filters and floating
  frosted "panel" overlays — e.g. "Leading Universities," "Biggest
  Influencers" — each with a compact uppercase 10px accent-colored label,
  11px pill toggles, and `backdrop-filter: blur(10px) saturate(1.15)`
  glass panels with soft shadows). Borrowed the **structural pattern**,
  not their color palette (still DRF-sampled tokens):
  - New `.ui-label` (10px, 700 weight, uppercase, 0.1em tracking, accent
    color), `.pill-toggle`, `.status-dot`, and `.glass-panel` /
    `.glass-panel-head` utilities in `globals.css`.
  - `FilterSidebar` reworked with these group labels + inline "reset"
    links (matching YCGlobe's `<div class="lbl">Label<a>reset</a></div>`
    convention exactly) and colored status dots on the Saved Views list.
  - **Globe view now shows a floating glass panel** over the canvas when
    a campus is selected — name, company/source counts, and up to 5 real
    preview candidates with a link to the rest in Table. This is a real
    implementation of the "campus summary with counts plus preview
    results" requirement from the earlier UIUX_UPGRADE_CLAUDE.md pass
    (§7) that had been left undone — the YCGlobe study is what made it
    concrete enough to build quickly. Verified: renders with real Penn
    data (candidate count, source count, and linked candidate names).
  - Did not adopt: YCGlobe's animated entry splash, draggable/resizable
    panels, or maplibre-gl itself (still `react-globe.gl` — swapping map
    libraries wasn't asked for and would be a much larger, riskier change
    for a research tool with a very different purpose than a public
    marketing globe).

## UI/UX upgrade (2026-09-18, per UIUX_UPGRADE_CLAUDE.md)

A large interface spec arrived mid-session. No `design.md` exists anywhere
in this repo (checked) — flagging that rather than silently ignoring the
request to read one. The spec's palette section says "suggested design
tokens, not sampled reference-site values," so the new look uses that
spec's own dark neutral palette rather than literally sampling
dormroomfund.com's colors (which an earlier, separate request had asked
for) — the detailed spec is the more specific and more recent instruction.

**Done, real, verified:**
- New design tokens (`app/globals.css`): dark neutral palette
  (`#0B0D12` background / `#9C91FF` accent / etc., per the spec's §5 table),
  Geist as the body font at 14px, tabular numerals, reduced-motion support.
  Also fixed a latent bug this surfaced: the semantic color utilities
  (`bg-ok`, `text-warn`, `border-danger`) were never actually registered as
  Tailwind v4 utilities (missing from the `@theme` block), so status badges
  were likely rendering colorless the whole session before this fix.
- Renamed `/universe` → `/explore` as the primary route, with `/universe`
  now a redirect that preserves query params (verified: `/universe?
  university=univ_penn` → `/explore?university=univ_penn`, 200).
  Methodology/Settings moved into a compact "More ⋯" utility menu.
- Real second (well, third — Stanford already existed) and fourth campus
  sourcing: **Cal Hacks 12.0** (Berkeley, via the same
  `lib/ingest/devpost-hackathon.ts` module) — 24 real projects, 67 real
  people, same unverified-affiliation discipline as PennApps/TreeHacks.
  Berkeley now has real candidates, not just tier metadata.
- Explore toolbar: real search (`?q=`, matches company/description/founder
  text), Companies/Builders entity switch, Globe/Network/Table view switch,
  active-filter chips with individual removal + clear-all, a real result
  count. Builders mode is a new global query (`listAllBuilders`) — people
  and their attributed projects, explicitly not turned into investable
  companies by themselves.
- University rail: Penn and Berkeley promoted to first-class short-labeled
  rows with a source-coverage indicator (Not scanned / Partial / Up to
  date); other campuses collapsed under "More universities…". Saved views
  relabeled (Ready to review / Needs research / Watching / Outside brief)
  — same underlying `Queue` values, so no history was destroyed.
- Table columns reworked to the spec's set (Company+description / Founder
  campus / Why investigate / Eligibility / Priority / Latest activity).
  "Overall gate" relabeled "Eligibility" with values "Fits brief / Needs
  research / Outside brief" everywhere it's used (badges, drawer).
- Drawer reordered so "Why look / Founder edge / Open question" sit above
  the fold, before administrative detail, with Overview/Founders/
  Evidence/Activity/Notes sections below (not yet actual tabs — grouped
  sections in reading order instead).
- Shortlist empty state: "No companies ready for review yet" plus a real
  count of how many are in Needs research and a link to them, instead of a
  generic "no candidates match" message.

**Second pass on the same spec (it was re-sent verbatim), continuing from
where the first pass left off:**
- **Signals**: fixed a real mislabeling bug — the Startup Challenge's
  competition placements were stored as `signal_type='grant'`, but they're
  prizes, not grants (spec §11 explicitly calls this out). Fixed at the
  source for future ingestion and migrated the 8 existing rows. Added
  university/event-type filter chips, real type labels (Award/Technical
  release/Product launch), moved the long methodology paragraph to the
  Methodology page (preserved, not deleted) in favor of "Recent company and
  founder activity," and stopped repeating a boilerplate significance note
  under every item.
- **Sources**: added a third view — a real compact table (Source / Campus
  / Family / Status / Last successful run / People / Projects / Ventures)
  alongside the existing Registry/Playbook views, backed by a new
  `sourceTypedCounts()` query that derives typed counts from
  `claims.source_id` rather than one undifferentiated "leads" number.
  Verified against real data: Penn Labs correctly shows 189 People (0
  Projects/Ventures — a known gap, see below); the PennApps Devpost source
  correctly shows 72 People / 24 Projects / 0 Ventures. Status vocabulary
  now matches the spec (Not configured / Ready to scan / Complete / Error).
  **2026-09-22 — re-checked, already fixed, note was stale:** re-ran
  `sourceTypedCounts("src_penn_labs")` against the live database and it now
  correctly returns 4 Projects (Penn Mobile, Penn Clubs, Penn Courses,
  Office Hours Queue), not 0 — `projectCountForSource()`'s second `EXISTS`
  clause (joining `person_project_roles.claim_id`) never actually filtered
  on `claims.entity_type`, so Penn Labs' `entity_type='person_project_role'`
  claims were already being counted correctly by the time this was
  re-checked; no code change was needed. Left this paragraph in place
  rather than deleting it, so the "isn't this still broken?" question this
  README raised has a documented, verified answer instead of just vanishing.

**Explicitly not done this pass (real scope, not attempted or partial):**
- Globe's dual "University geography / Company HQ" modes — only university
  geography exists. No independently-sourced company HQ data has been
  collected, so there's nothing to plot in HQ mode yet regardless.
- ~~The bottom result tray in canvas (Globe/Network) views, and the
  first-visit-Globe/repeat-visit-remembered-view persistence~~ — **done
  2026-09-22, see "Bottom result tray + remembered view" below** (Globe
  only; there's still no separate Network canvas, see the next bullet).
- Network view's full typed-node/edge model beyond what already existed;
  Table/Network/Globe share filters and selection via the URL, but Network
  itself wasn't restructured this pass.
- ~~Pipeline stage renaming (New→Researching→Contact planned→...) — still
  deliberately untouched~~ — **stale, already done in a later pass**:
  `app/startup/pipeline/page.tsx`'s `STAGES` constant is exactly
  `["New", "Researching", "Contact planned", "Contacted", "Meeting",
  "Diligence", "Passed"]` (Design MD's suggested stages, "Meeting
  scheduled" shortened to "Meeting"), and `lib/db/client.ts`'s `migrate()`
  already folds old `Meet`→`Contact planned` and `Watching`→`Researching`
  rows per the spec's own caution about inspecting stored meaning first.
  Found while re-checking this list on 2026-09-22 (same kind of stale note
  as the Penn Labs one above) — `pipeline_entries` is currently empty
  (no real pipeline activity yet), so there was nothing to actually
  migrate, but the rename + migration code are both real and correct.
- ~~Sources' compact table is missing "Review yield"~~ — **stale**: the
  Founder/Startup Scout split pass folded a real `Yield` column into the
  Registry table (`app/sources/page.tsx`'s `RegistryTable`, defined as
  reviewed-relevant ÷ discovered leads). Still genuinely missing from that
  same table: People/Projects/Ventures typed counts (they exist, but only
  render inside each source's card below the table, not as table columns
  — see the next fix in this pass) and the Scan selected/Retry/Import
  actions, which need a real scan-trigger UI that doesn't exist (see §12,
  also not built: no in-app "Research company" / "Scan sources"
  bounded-enrichment flow, only the existing manual CLI scripts and the
  CSV/manual-referral forms).
- Responsive audit at the specific 1440/1024/390px breakpoints the spec
  calls out — checked functionally at default widths, not screenshotted at
  those exact three.

## Live deployment

**https://dorm-room-fund-scout.vercel.app** — the app deployed as-is, serving
the real ingested data described below.

Vercel's serverless filesystem is read-only outside `/tmp`, but SQLite needs
to write a journal/WAL file next to the `.db` file even for plain reads. So
in production (`lib/db/client.ts`, gated on the `VERCEL` env var Vercel sets
automatically), the bundled, already-ingested `data/campus-universe.db` is
copied into `/tmp` on cold start and opened from there. Practical
consequence: **reads are the real, current dataset; writes — pipeline
status, notes, and manual referrals added via `/sources/new-referral` — only
persist for the lifetime of that warm lambda instance**. They are not
durable across cold starts or concurrent instances on the hosted deployment.
For actual pipeline/notes/referral use, run it locally (`npm run dev`), where
the same code path writes straight to `data/campus-universe.db` and persists
normally. Re-deploying (`vercel deploy --prod`) ships whatever is currently
checked into `data/campus-universe.db` at deploy time — re-run
`npm run ingest:all` and redeploy to refresh the hosted data.

## Setup

```bash
npm install
npm run dev       # http://localhost:3000, redirects to /startup/discover
```

No environment variables are required for the app itself or for any
public-page-fetch adapter — those still run on plain public-page fetches
you can inspect yourself. One adapter is the exception:
`scripts/ingest/fetch-linkedin-apify.ts` needs `APIFY_API_TOKEN` (get one
free at apify.com, ~$0.004/profile with the harvestapi actor it uses) in
`.env.local` (gitignored, never committed — see "LinkedIn via Apify"
below for why this one adapter needs a paid key when nothing else does).
A `CAMPUS_UNIVERSE_DB_PATH` env var can override where the SQLite file
lives (default: `data/campus-universe.db`, committed so Vercel can bundle
it, created automatically on first run if it is missing).

The hosted app does not read `APIFY_API_TOKEN`. Leave it unset in Vercel
unless you later run the LinkedIn adapter in an environment that has the
key. `VERCEL` is set by Vercel itself and should not be added by hand.

## Loading real data

The database starts empty. Populate it by running these, in order (each is
a plain `tsx` script, bounded, and safe to re-run — see "Idempotency"
below):

```bash
npx tsx scripts/ingest/seed-universities.ts             # 5 campuses, sourced coordinates
npx tsx scripts/ingest/fetch-drf-portfolio.ts            # DRF's public portfolio (reference/exclusion set)
npx tsx scripts/ingest/fetch-penn-labs.ts                # Penn Labs team directory (builder evidence)
npx tsx scripts/ingest/fetch-penn-startup-challenge.ts   # Penn Venture Lab 2026 Startup Challenge (real candidate companies)
npx tsx scripts/ingest/enrich-penn-labs-github.ts        # real GitHub activity for Penn Labs' 4 products
npx tsx scripts/ingest/fetch-pennapps-devpost.ts         # PennApps XXVI Devpost gallery (bounded sample)
npx tsx scripts/ingest/fetch-treehacks-devpost.ts        # TreeHacks 2026 Devpost gallery (bounded sample)
npx tsx scripts/ingest/fetch-calhacks-devpost.ts         # Cal Hacks 12.0 Devpost gallery (bounded sample)
npx tsx scripts/ingest/fetch-velocity.ts                 # Velocity (Waterloo accelerator), real candidate companies, 2025-26 cohorts
npx tsx scripts/ingest/seed-source-tiers.ts              # applies Founder/Startup Scout tiers to every source
npx tsx scripts/screen/match-portfolio.ts                # matches ingested candidates against the DRF portfolio exclusion set
npx tsx scripts/screen/run-gates.ts                      # deterministic DRF screening gates over ingested candidates
```

All of these hit live, public URLs over the network. If you're offline,
they'll fail loudly (non-zero exit, logged HTTP error) rather than silently
succeeding with nothing. Shortcut: `npm run ingest:all` runs all of them in
order.

## Source quality tiering

Every source now gets **two independent tiers** — `founderScoutTier` and
`startupScoutTier` (S/A/B/C/D) — because the same source can be excellent
for finding builders early and mediocre for finding formed startups, or the
reverse (a hackathon vs. an accelerator, in miniature). Tier is never
inferred from institutional prestige; it's a judgment call across 7
dimensions (campus purity, earliness, evidence of building, selectivity,
novelty vs. what a VC database already shows, identity quality,
extractability), recorded per source in `lib/domain/source-quality.ts` with
a written rationale. Manual overrides are sticky — `seed-source-tiers.ts`
checks for an existing override before touching a row, so a re-ingest can
never silently revert a deliberate call; verified end-to-end (override →
confirmed persisted → re-seed correctly skipped it → cleared → re-seed
restored the catalogue default).

`/sources` now has two views: **Registry** (every source — implemented,
planned, or deliberately skipped — filterable by campus/tier/type/role/
status, sortable by either tier) and **Campus Playbooks** (grouped by
campus: best founder sources, startup sources, low priority — "where should
I actually spend sourcing time here," not a flat list). The full campus
source strategy (Stanford/Berkeley/Penn/MIT/Waterloo) is encoded — some of
it before the matching ingestion adapter existed, so the tiering itself
was useful ahead of ingestion. **Stale as of 2026-09-22**: the original
example list here (TreeHacks, Cal Hacks, Web Development at Berkeley,
GRASP, MIT delta v, Velocity) has since been fully overtaken by real
ingestion — all six now have a real adapter and `dbSourceId`
(`src_treehacks_devpost`, `src_calhacks_devpost`, `src_wdb_github`,
`src_grasp_startups`, `src_mit_deltav`, `src_velocity`). Those were the
only 4 sources this README's own narrative ever specifically called "P0"
— that specific list is now fully closed (see the GRASP Lab pass below).
That is NOT the same as "the registry has no unconfigured sources left" —
`source-quality.ts` still has 24 other `status: "unconfigured"` entries
(Penn Electric Racing, BASES, StartX, Berkeley research labs, Waterloo
technical student projects, etc.) that were never part of that specific
named list and remain real, un-built backlog.

## What's real vs. what's a demo

**Real, verified, currently working:**

- **319 DRF portfolio entries**, imported from `dormroomfund.com/portfolio`
  across its actual 5 pages (Webflow/Finsweet pagination via
  `?f3d579bb_page=N`, reverse-engineered from the page's own "Next" control
  — re-verify if DRF redesigns the page). The directory's own headline
  claims "340 first checks"; this import captures 319 named, linkable
  entries from the public list and does not claim to reconcile the
  difference.
- **189 real people** from Penn Labs' public team directory
  (`pennlabs.org/page-data/team/page-data.json`, a Gatsby page-data JSON
  endpoint, not a documented API — same re-verify caveat). These are
  ability-to-build evidence, not investment candidates: Penn Labs builds
  Penn's own internal apps (Penn Mobile, Penn Clubs, Penn Course Review,
  Office Hours Queue), which are tagged `is_investable_candidate = 0`.
- **8 real candidate companies** from Penn Venture Lab's 2026 Startup
  Challenge results (`venturelab.upenn.edu/2026-SC-PR`, published
  2026-05-04): Cloak, Serpent Robotics, Orble, Chloropept, Lucy, Cengine,
  Storiara, The Zillennial Advisors — with real founder names, Penn class-
  year notation parsed into a current/recent-grad/alumni read, and a dated
  competition-placement signal each.
- **Second real campus, and a real entity-resolution bug found and fixed**:
  extracted the PennApps ingestion into a shared, reusable module
  (`lib/ingest/devpost-hackathon.ts`) and used it to add **TreeHacks 2026**
  (Stanford) — a bounded sample of its real Devpost gallery, 24 projects,
  82 people. While verifying it, found that the naive "match person by
  display name" logic had silently merged different real people who share
  a common name across the two hackathons — e.g. one "Aryan Sharma" (Devpost
  `aryans-15`) picked up both a Penn and a Stanford affiliation, merged with
  an unrelated second "Aryan Sharma" (Devpost `aryanfundu`) at Penn. This is
  exactly the "same-name people remain separate without corroboration"
  failure the brief calls out as an acceptance check. Fixed by keying
  people on their Devpost profile URL (a real corroborating identifier)
  instead of name, and separately fixed Penn Labs' ingestion the same way
  using `pennkey` (a real, unique Penn identifier the directory already
  provides but wasn't being used for matching). Re-ran the full pipeline
  from scratch after the fix and confirmed: the two "Aryan Sharma"s are now
  correctly two different person records, while a third case (a "William
  Feng" whose Devpost profile is genuinely identical at both events) is
  correctly kept as one person — corroboration working in both directions,
  not just defaulting to "always split." Full pipeline re-verified
  idempotent afterward (identical row counts on a second run).
- **Fixed a real architectural gap**: every candidate query was hard-filtered
  to `kind='company'`, which meant a pre-company hackathon project — exactly
  what the brief's Cursor example ("we backed Michael before he had an
  idea, let alone a product") says to catch — could never appear in
  Table/Shortlist/Pipeline even if ingested. Broadened all four query sites
  to `kind IN ('company','project')`. Penn Labs' own internal-tool projects
  stay correctly excluded regardless, since that's gated on
  `is_investable_candidate=0`, not `kind`.
- **PennApps, via its real Devpost gallery** (`fetch-pennapps-devpost.ts`):
  ingested a bounded sample — page 1 of PennApps XXVI's actual project
  gallery, 24 real projects, 71 real people, 25 total fetches (within a
  30-fetch scan budget) — as `kind='project'` candidates, made possible by
  the fix above. Every person's affiliation is seeded `unverified`, never
  `current_student`: Devpost profiles carry no school field, so hackathon
  attendance alone can't confirm Penn enrollment, and the affiliation gate
  correctly reflects that rather than assuming eligibility. This reverses
  my earlier decision to skip Devpost entirely — on reflection, "unverified
  but real" is exactly what the evidence model is for, not a reason to
  not ingest. Verified idempotent (reran twice; second run made 0 new rows
  since every project already existed, correctly using only 1 fetch to
  confirm that instead of blindly re-fetching 24 detail pages).
- **Real GitHub enrichment** for Penn Labs' 4 tracked products (via the
  public REST API against the real `pennlabs` org — no auth needed, no
  guessed name-matching for individual founders, since the brief explicitly
  warns against resolving people by name alone). Each product now has a
  real "last pushed" continued-development signal (e.g. Penn Clubs: 62
  stars, pushed 2026-09-15) instead of only the static team-roster claim.
- **Deterministic screening gates** (affiliation, stage, prior funding,
  business model, portfolio relationship, funding availability), each
  tagged with provenance (`public_policy` / `user_guidance` /
  `proposed_setting`) in `lib/screening/config.ts`.
- **Deterministic quality rubric** (`lib/scoring/rubric.ts`) — coverage-
  gated headline score, `null` ratings never treated as zero.
- **Four-queue shortlist** (Top prospects / Exploration / Watch /
  Reference), Table view, a real (if basic) per-university Network view, a
  real Globe view (`react-globe.gl`, sourced coordinates, no auto-rotate,
  click-to-select shares the same URL state as Table/Network; falls back to
  a plain list if WebGL is unavailable), University drawer (Top prospects /
  Builders / Signals / Sources tabs), Pipeline board, Signals feed, Sources
  registry, Methodology and Settings pages.
- **Manual assessment / rubric rating UI** on every company detail panel:
  0–5-or-unknown ratings across all 7 dimensions, rationale, and
  counterevidence. The math (coverage, the coverage-gate rule, the headline
  score) is always computed deterministically by `computeRubric()` — the
  form only collects ratings, never a final number. Each submission is a
  new `assessments` row rather than an overwrite, so history is preserved
  automatically. **Verified with a real (and revealing) test**: rated
  Serpent Robotics highly (score 75.7/100, 70% coverage) via the actual
  Server Action, then confirmed it *still* landed in Exploration, not Top
  prospects — because its screening gate is still `needs_verification`
  (unresolved stage/funding). That's gates-before-quality working exactly
  as the brief requires, not a bug. Test data was then deleted, confirmed
  back to 0 assessments in the database.
- **Manual referral entry** (`/sources/new-referral`, linked from Sources):
  Amy can add a firsthand lead by hand — company, founder(s), university,
  and a required firsthand note. It's stored as a `user_note`-labeled claim
  (never dressed up as an independently observed fact) and immediately run
  through the exact same deterministic gates as every ingested candidate —
  no special-casing for manually entered leads. Verified by calling the
  real Server Action directly with synthetic test data, confirming the
  project/founders/gates/claim all came out correct, then deleting every
  row it created so nothing synthetic ships in the database.
- **CSV bulk import for manual referrals** (same `/sources` page): upload a
  CSV with
  `companyName,description,websiteUrl,universityName,founderNames,founderStatus,noteBody,referrer`;
  each row runs through the exact same `createManualCandidate` path (and
  gates) as a single manual entry. University names are matched against
  the real directory — an unmatched name is skipped and listed by row,
  never guessed. Verified against a real 3-row synthetic CSV (two valid
  rows for Penn and Stanford, one deliberately bad row referencing a
  nonexistent university): got exactly 2 created + 1 skipped with the
  correct reason, 6 gates evaluated per created row, then deleted
  everything the test created and confirmed row counts matched pre-test
  exactly.
- **Manual notes**, one per company detail panel: kept in their own `notes`
  table (never mixed into the sourced evidence log), labeled with author +
  date, and preserved across ingestion refreshes since ingestion never
  touches that table. Verified by inserting a note directly, confirming it
  renders, then removing it so no fabricated note ships in the database —
  the add-note Server Action itself follows the same pattern already
  exercised by the pipeline-status form, but wasn't separately clicked
  through in a live browser.
- **Idempotency, again, verified for the new script**: ran
  `enrich-penn-labs-github.ts` twice in a row and confirmed it correctly
  reported "unchanged since last fetch" and added zero rows the second
  time.
- **Honest result of running the real pipeline on real data:** all 56
  candidates (8 Startup Challenge companies + 24 PennApps XXVI projects +
  24 TreeHacks 2026 projects) currently land in **Exploration**, not Top
  prospects — none has independently verified stage/funding beyond a
  competition placement or hackathon submission, and the 48 hackathon ones
  additionally have unverified (not confirmed) university affiliation, so
  the gates correctly
  refuse to promote any of them. This is the system working as designed,
  not a bug.

**Explicitly not built (see `/methodology` for the live version of this list):**

- Marker clustering on the Globe for dense campus clusters — moot at 5
  campuses today, but not implemented for when that changes.
- Most of the source catalogue from brief §6: Penn Innovation Fund (checked
  — the page is an application/FAQ page with no public recipient
  directory), Penn VIP/VIP-X, Show HN, Hugging Face Spaces. (GRASP was in
  this list originally — now built, see the GRASP Lab pass further down.)
  Also
  checked and deliberately skipped: PennApps (the live site is a
  pre-registration page for the next, not-yet-run edition — no gallery
  exists right now) and Devpost (PennApps XXVI's real project gallery has
  real team member profiles, but those profiles carry no school field, so
  there's no non-guessed way to confirm Penn affiliation from that data —
  skipped rather than resolve people by name/attendance alone, per the
  brief's own warning against that). Every one of these is listed on
  `/sources` with an honest per-source status rather than silently
  omitted. Also explored Berkeley SkyDeck's and Free Ventures' portfolio
  pages as a second-campus source: SkyDeck's is logo-only with no
  extractable names, and Free Ventures is a client-side SPA with no public
  data API — both skipped for the same reason (no honest, sourced data to
  extract), not from lack of trying.
- Berkeley/MIT/Waterloo have sourced coordinates and are ready for the same
  treatment (the Devpost-hackathon pattern that worked for PennApps/
  TreeHacks would extend to Cal Hacks/Hack the North with the same caveats)
  but have no ingested candidates yet. Stanford now does, via TreeHacks.
- LLM-assisted assessment *proposals* — no provider is wired in, so rating
  a candidate is manual-only for now (see "Manual assessment" above). All 8
  ingested candidates are currently unassessed in the shipped database (no
  ratings entered), which is why none show a numeric score — that's the
  coverage-gate rule working correctly on sparse-but-real data, not a
  missing feature. Assessing one yourself in the running app will show a
  real score immediately.
- Assessment override UI (`assessments.override_of_id` exists in the schema,
  but there's no form for it — no assessments exist yet to override, since
  nothing has been manually rated).
- Settings is currently read-only — screening/rubric config is edited in
  `lib/screening/config.ts` / `lib/scoring/rubric.ts`, not a UI.

## Idempotency (re-running ingestion safely)

Each ingestion script hashes the page/API response it fetches and compares
it against the last snapshot it took of that exact URL. If unchanged, it
skips reprocessing entirely rather than re-inserting evidence rows —
verified by running the full pipeline twice in a row and confirming every
table's row count stayed identical the second time. Penn Labs additionally
guards each individual affiliation/role insert against an existing record,
so a partial content change (e.g. one new member) won't re-duplicate
everyone else's rows.

## Checks actually run

- `npm run build` — clean TypeScript + Next.js build, no errors.
- Ran the full ingestion pipeline twice back-to-back; confirmed
  `people`/`projects`/`affiliations`/`claims`/`portfolio_memberships`/
  `relationships` row counts were identical after the second run (no
  duplication on refresh).
- Manually verified via `curl`/direct DB queries: Table view, Shortlist
  (correct 0 Top prospects / 56 Exploration split), University drawer for
  Penn (all four tabs), Company detail panel (evidence log, gate
  rationale, pipeline form), Network view for Penn, Sources, Methodology.
- Verified the pipeline status workflow by writing a `pipeline_entries` row
  and confirming it appears correctly on `/pipeline`, then removed that
  test row so no fabricated pipeline state ships in the database.
- Checked responsive behavior via the Tailwind breakpoints (single-column
  stack below `sm`, three-pane layout above) — **not** visually
  screenshotted in a real browser, so treat mobile layout as
  code-reviewed, not eyeballed.
- Did **not** get to: axe/screen-reader pass, cross-browser check, load
  testing, or exercising the Network view against a much larger dataset
  than Penn's current ~200 people (the 60-node cap and omitted-count
  display are implemented but only exercised at Penn's current scale).

## Architecture, briefly

- SQLite via `better-sqlite3`, schema in `lib/db/schema.sql`. Everything
  evidentiary (`claims`, `signals`, `funding_events`, `gate_results`,
  `assessments`) traces back to a `sources`/`snapshots` row with a URL and
  retrieval timestamp.
- `lib/screening/gates.ts` + `lib/domain/facts.ts`: pure, deterministic gate
  functions over a `ProjectFacts` struct assembled from whatever evidence
  actually exists — no gap is ever filled with an assumption.
- `lib/scoring/rubric.ts`: pure arithmetic; ratings are always human/LLM-
  proposed inputs, never computed by an LLM.
- `app/startup/*`, `app/founder/*`, etc. are Next.js server components
  reading the DB directly; shared filter/selection state lives in the URL
  query string (`?university=&queue=&project=&view=`), which is what keeps
  Table, Network, and the detail panel in sync without any client-side
  state management. `app/universe`, `app/explore`, `app/shortlist`,
  `app/pipeline` are now compatibility redirects (see below).
- Mutations (currently just pipeline status) go through a Next.js Server
  Action in `lib/actions/pipeline.ts` — no separate API layer yet.

## Founder Scout / Startup Scout split (2026-09-18)

Prompted by feedback that the single Universe/Explore view was making a
category error: hackathon submissions (Cal Hacks, PennApps, TreeHacks)
were surfacing as *companies needing research* when a hackathon
submission is founder evidence, not a startup, until there's independent
evidence it's an actual (or plausibly forming) company. This was a
query-layer bug, not a data problem — the `kind` column (`'project'` vs.
`'company'`) was already populated correctly by ingestion; only
`listCandidateProjects` was reading both kinds instead of `kind='company'`
alone.

**Done, real, verified (`npm run build` clean; every route below returned
200 from a real `next start` server, checked with `curl`):**
- Split the single Explore surface into two products under one "Campus
  Scout ▾" nav dropdown — **Founder Scout** (Discover · Shortlist ·
  Signals · Network · Sources) and **Startup Scout** (Discover · Shortlist
  · Verification · Signals · Pipeline · Sources) — replacing the old
  Companies/Builders entity toggle entirely. `components/top-nav.tsx`
  detects the active product from the URL path (`/founder/*` vs.
  `/startup/*`), falling back to a `?from=` param on shared pages
  (`/signals`, `/sources`).
- `lib/domain/queries.ts`: `listCandidateProjects` (Startup Scout) now
  only ever selects `kind='company'`. `listAllBuilders` renamed to
  `listFounders`, extended to resolve each founder's linked company (if
  any) and most recent claim excerpt — used by the new
  `components/founder-card.tsx`, which explicitly renders "unassessed"
  and "No company detected" rather than inventing a score, since no
  per-founder scoring model exists yet.
- New routes: `/founder/discover`, `/founder/shortlist`, `/founder/network`
  (adapted from the old Network view, plus a lightweight
  `getNetworkNodeDetail` lookup so clicking a hackathon-project node — not
  just a company — shows real evidence), `/startup/discover` (the old
  Explore, minus the entity switch), `/startup/shortlist`, `/startup/
  verification` (companies grouped by their single primary blocker,
  computed by `primaryBlocker()` in `lib/screening/gates.ts`, instead of a
  generic "Needs research"), `/startup/pipeline` (redesign below). Old
  routes (`/explore`, `/universe`, `/shortlist`, `/pipeline`) are now thin
  redirects that preserve query params.
- Pipeline redesign: stages collapsed from 8 to 7 (`New / Researching /
  Contact planned / Contacted / Meeting / Diligence / Passed`) — dropped
  "Watching" as a distinct status, since the watch queue already keys off
  an explicit due date (`lib/domain/queries.ts`'s `watchRow` query) rather
  than pipeline status; "Meet" renamed to "Contact planned" (same meaning).
  A one-time migration in `lib/db/client.ts` folds any existing `Meet`/
  `Watching` rows into the new labels. Replaced the 8-empty-boxes-plus-80-
  chips layout with compact cards (company, campus, next step or named
  blocker, due date) and a board/table toggle; "Not yet in pipeline"
  became a searchable table with a real "Add to pipeline" action instead
  of 80 pill chips.
- Signals cards redesigned: dropped the repeated ingestion-log boilerplate
  and "date unknown" — a signal's footer now reads "Discovered {month
  day}" from `created_at` when the true event date isn't known, keeping
  the real `source_date` null internally rather than guessing it. Added a
  "Why it matters" line sourced from the existing `significance_note`
  column (never fabricated — omitted when there isn't one).
- Sources page: collapsed the Table/Registry/Playbook tabs to just
  Registry/Playbooks (the separately-named "Table" tab was confusing next
  to "Registry"); folded its columns — Source, Campus, Type, Founder tier,
  Startup tier, Role, Status, Yield, Last run — into the top of the
  Registry view, above the existing rationale-rich source cards. "Complete"
  continues to mean the configured scan finished, not that the ecosystem
  is fully covered (this was already correct; just confirmed and
  commented).
- Palette rebalanced toward neutral per explicit feedback that the
  DRF-sampled lavender was washing across every surface: primary surfaces
  are now white/near-white gray (`--background: #fafafa`, `--surface:
  #ffffff`), text is near-black (`--foreground: #171417`), and the DRF
  purple accent is reserved for interaction/selection only, with a new
  `--accent-subtle` token for restrained selected-state fills.
- Copy fixes: sidebar shows "Not scanned" (not "0") for a campus with zero
  configured sources; the sidebar header shows "N startup candidates /
  founders · M of K campuses monitored" instead of a claim like "90 unique
  companies across 5 campuses" that overstated coverage.

**Not done in this pass:** visual/browser verification (Playwright and its
manually-extracted Chromium libs were uninstalled after the earlier Globe
debugging session concluded) — everything above was verified via
`npm run build`, `npx tsc --noEmit`, a real `next start` server, and
`curl` against real data (e.g. Penn's real 8 companies / 279 founders),
not by eyeballing it in a browser. Deploying this to Vercel production is
also still pending — ask before doing so, since redeploying an existing
production URL is a visible, hard-to-instantly-reverse action.

## Founder Scout sourcing engine (2026-09-18, second pass)

Implemented against `FOUNDER_SCOUT_SOURCING.md`, a detailed sourcing-engine
spec (candidate promotion, Founder Signal scoring, Person/Founder/Project
separation, source adapters, entity resolution). Per the doc's own
instruction, inspected the existing schema/ingestion scripts before changing
anything — most of the core data model (`people`, `projects.kind`,
`person_project_roles`, `claims`, `relationships`, `signals`, `sources`) already
existed from earlier passes and maps directly onto the spec's Person/
FounderProject/Evidence/Source entities; this pass adds the promotion and
scoring layers that were missing, plus one real correctness fix.

**Real fix — role honesty (§8/§18 "do not assume equal contribution from
team membership"):** `lib/ingest/devpost-hackathon.ts` was hardcoding every
Devpost hackathon team member's `person_project_roles.role` to `'founder'`,
which overclaims differentiated ownership Devpost's public team-member list
never actually provides. Changed to the honest `'team_member'`, with a
migration in `lib/db/client.ts` that relabels existing rows — scoped
precisely to `kind='project'` rows whose claim came from one of the three
Devpost sources, so it never touches the 28 real company-founder rows from
manual referrals, CSV imports, or the Venture Lab Startup Challenge (verified
by direct query before/after: 229 rows relabeled, exactly the 28 real
company-founder rows untouched).

**New — candidate promotion (`lib/domain/promotion.ts`, §46/§92):**
`listFounders()` now returns only *promoted* candidates by default — a
person promotes if they're linked to a real company as a founder, hold a
named leadership/technical-lead role, hold any specific named role (not the
generic `team_member`/`contributor` placeholders), or appear with a real
role on 2+ distinct projects. Club membership or a single hackathon
team-member listing alone no longer promotes anyone, matching §47 and the
doc's explicit test cases (§111-112). Real effect, verified with a real
`next start` server: Founder Scout Discover went from showing all 428
resolved people (the pre-existing behavior — everyone with any affiliation
row) to 202 promoted candidates across campuses (a person can legitimately
be promoted at more than one campus if they have real evidence at both,
which is why the per-campus sum is higher than the 194-person global-dedup
count — both figures are independently correct, not a bug).

**New — Founder Signal (`lib/scoring/founder-signal.ts`, §55-56/§108-110):**
8 deterministic dimensions computed from real rows (ability to build, repeat
building, shipping velocity via `continued_dev` signals, external validation
via recorded award text, collaborator quality via repeat co-authorship) —
dimensions with no reliable deterministic source yet (technical depth,
project ambition, momentum) always report unknown rather than being guessed
at, and a headline number only appears once coverage clears a real bar.
Verified against the live DB: 0 of 202 promoted founders currently clear
that bar, so every founder card correctly shows "unassessed" rather than an
invented score — the honest outcome given how thin per-person evidence still
is, not a bug.

**Sources attempted this pass: 0 new fetches** — this pass was schema/logic
work over already-ingested evidence, not new ingestion, so the "sources
succeeded/partial/blocked" counts are unchanged from the existing 7 sources
above. `lib/domain/queries.ts`'s `getNetworkNodeDetail` (Founder Network's
node detail panel) was updated to show the full team with each person's real
role, instead of an empty "Founders not yet identified" now that hackathon
rows say `team_member`.

**Exact remaining blockers (honestly, not glossed over):**
- **No `GITHUB_TOKEN` or `ANTHROPIC_API_KEY` configured** (checked local env
  and `vercel env ls` — neither is set). Per-founder GitHub enrichment (§85)
  isn't implemented this pass: Devpost's public gallery doesn't expose a
  GitHub URL per team member (only a Devpost profile URL), so resolving 400+
  people to GitHub identities would require either an extra fetch per
  person's Devpost profile page (expensive, and the existing 30-fetch/run
  budget convention argues against it) or guessing from display name, which
  the spec explicitly forbids (§40/§42: never merge on name alone). The one
  existing GitHub adapter (`scripts/ingest/enrich-penn-labs-github.ts`)
  stays scoped to Penn Labs' own org, the one place a name→repo mapping is
  already unambiguous.
- **P0 adapters not yet built:** GRASP, Web Development at Berkeley (WDB),
  MIT's and Waterloo's technical-project ecosystems. PennApps, Penn Labs,
  Cal Hacks, TreeHacks, and GitHub (pennlabs org) already exist from earlier
  passes. Each remaining adapter needs its own real HTML/API inspection
  before it can be written — not attempted in this pass to avoid either
  fabricating a scraper against markup that was never actually checked, or
  running out of budget partway through several at once.
- **Founder-level signal types** (§60: New Collaborator, Team Formation,
  Possible Startup, Company Formation as their own structured events) aren't
  implemented — `signals` is still project-scoped only (`project_id NOT
  NULL` in the schema). The Founder Signal dimensions above compute directly
  from `person_project_roles`/`claims`/`signals` instead, which covers the
  same evidence without a schema change; a dedicated founder-level signals
  table is real future work if the dimension-level view stops being enough.
- **Possible-company detection from personal-bio/domain signals** (§65-66)
  isn't implemented — the only company-detection path today is the existing
  `kind='company'` classification at ingestion time (manual referral, CSV
  import, Venture Lab Startup Challenge). No automatic "bio says 'building
  X'" detection exists yet.

## WDB (Web Development at Berkeley) P0 adapter (2026-09-21)

Real evidence for `cat_wdb` in `lib/domain/source-quality.ts`, previously
`unconfigured`. Two dead ends were checked and ruled out first, not
skipped: `webatberkeley.org` has no team roster or per-project credits
page (direct inspection), and its Behance project showcase
(`behance.net/webdevatberk`) carries no credits/collaborator field on any
of its 12 listed projects (checked the raw embedded JSON directly, not
just the rendered page). WDB's GitHub org (`github.com/web-at-berkeley`,
42 public repos, public REST API, no auth) is the one place real builders
are actually named — commit authorship, which is strictly stronger
evidence than a self-reported team list.

`scripts/ingest/fetch-wdb-github.ts` — bounded to 9 repos, deliberately
excluding recruiting-interview repos (an individual assessment, not real
collaborative building), bootcamp/decal/education/workshop repos
(training material, no real ownership), and template/infra repos: 2 real
external client repos (Kiwibot, Berkeley Investment Group), 2 of WDB's own
internal tools, and the 5 most recent Training-initiative semester
team-project repos. For each repo's contributors, reads the person's own
public GitHub profile (`name`/`bio`/`company`) directly rather than
guessing an identity from a name — if no real name is disclosed, keys on
the GitHub handle itself (still a real, stable identifier). Role is always
`team_member` from commit history alone (commit count doesn't by itself
prove leadership), and every affiliation is seeded `unverified` (a WDB
commit doesn't by itself confirm current Berkeley enrollment).

**Real find, not fabricated:** one contributor's own GitHub bio
self-discloses "co-founder @simstudioai" (company field: "Sim") — recorded
as a genuine `kind='company'` candidate with a `founder` role, sourced
directly to their own public profile. Ran the full gate pipeline on it;
every gate correctly returned `needs_verification` (no fabricated
pass/fail from a bio alone) except `portfolio_relationship`, which
correctly passed (no match to the existing DRF portfolio).

Ingested 2026-09-21: 9 projects, 21 real people via commit credit, 1
self-reported founder candidate, 35/50 fetches used (GitHub's
unauthenticated rate limit is 60/hr). Verified idempotent: re-running the
script a second time inserted 0 new rows. `npx tsc --noEmit` and
`npm run build` both clean. Verified via `curl` against a real
`next start` server that `/sources` now shows `cat_wdb` as `Complete`
(previously `unconfigured`), not by eyeballing it in a browser (same
verification method as the rest of this README, Playwright still
uninstalled).

Remaining P0 adapters from the prior pass's blocker list: only **GRASP**
(`grasp.upenn.edu`, Penn robotics/CV/controls research lab — real
inspection not yet attempted) is still `unconfigured`. MIT and Waterloo
were separately closed by `fetch-mit-deltav.ts` / `fetch-velocity.ts` (a
different session, before this WDB pass, README not updated for them at
the time — noting that here since it was found while re-checking the
blocker list before starting this pass).

## GRASP Lab P0 adapter (2026-09-22)

Real evidence for `cat_grasp`, the last `unconfigured` P0 adapter. GRASP's
public Startups page (`grasp.upenn.edu/startups/`) renders nothing in raw
HTML — it's fully AJAX-loaded via the Ajax Load More plugin, with no
noscript fallback (unlike the site's `/role/student/` roster page, which
does have one). Reconstructing that plugin's `admin-ajax.php` request was
attempted and abandoned on purpose: it returned a real HTTP 200 but
silently ignored the `post_type`/`meta` filters and fell back to a
generic blog-post query instead of startups — a wrong-but-200 response is
exactly the kind of silent failure this project's sourcing scripts are
supposed to avoid, so that path was dropped rather than shipped with a
guess. Checked for a real alternative instead: this WordPress install
exposes a genuine, documented REST API (`/wp-json/wp/v2/types` lists real
registered post types, including `startup`) — used that.

`scripts/ingest/fetch-grasp-startups.ts` pulls all 13 real GRASP-connected
startups from `/wp-json/wp/v2/startup`. Founder names are hand-extracted
from each company's real page text (not a generic regex — this exact
13-company dataset has both "advised by CJ Taylor" and "affiliated with
Dr. Mihail Pivtoraiko" phrasing that a regex would misparse as a founder
claim) — 6 named student/PhD founders found across 4 companies: Alex
Kushleyev + Daniel Mellinger (KMel, acquired by Qualcomm 2015), Matthew
Piccoli (IQ Motion Control), Avik De + Gavin Kenneally (Ghost Robotics),
Berkay Deniz Ilhan (Augean Robotics). Two companies name a founding
**faculty member** instead (Exyn's Dr. Vijay Kumar, Aptonomy's Dr. Mihail
Pivtoraiko) — deliberately left unrecorded as a `person_project_roles`
row, since a professor isn't this tool's target candidate type and the
promotion pipeline would otherwise surface them as one.

Scope was the Startups endpoint only, not GRASP's `people` post type
(1941 rows spanning every role and decade, no bio content in the REST
payload beyond a name — ingesting it wholesale would be exactly the
"lab roster membership ≠ real signal" conflation `cat_grasp`'s own
`whatNotToInfer` already warns against) or its `project` post type (94
research-paper posts whose REST `author` field is the lab's web content
manager, not the actual student researcher — attributing a real name
would mean scraping each post's arbitrary external link, another guess).

Verified idempotent (re-running the script a second time inserted 0 new
rows). `npx tsc --noEmit` and `npm run build` both clean. Verified via
`curl` against a real `next start` server that `/sources` now shows
`cat_grasp` as `Complete` (previously `unconfigured`).

**All 6 real P0 adapters from the prior pass's blocker list are now
closed**: GRASP and WDB this session, MIT (`fetch-mit-deltav.ts`) and
Waterloo (`fetch-velocity.ts`) in an earlier undocumented pass.

## Possible-company detection, §65-67 (2026-09-22)

Closes the "Possible-company detection from personal-bio/domain signals"
blocker. `lib/domain/company-detection.ts` scans the one real structured
personal-bio text this codebase captures — the `GitHub bio: "..."` marker
`fetch-wdb-github.ts` writes into a claim's excerpt — for an unambiguous
founder claim ("co-founder @simstudioai"), never a generic regex over
arbitrary prose (this codebase's own data already has "advised by CJ
Taylor" and "affiliated with Dr. Mihail Pivtoraiko" phrasing from the
GRASP pass that a looser pattern would misread as founding).

Per §67 ("DO NOT AUTO-CREATE STARTUP"), a detection is never auto-promoted
into a real `kind='company'` Startup Scout candidate. It's filed as a
reviewable `possible_companies` row (new table, mirrors the existing
`portfolio_memberships`/`match-portfolio.ts` unmatched-stays-unmatched
discipline) — `match_status` stays `'unreviewed'` unless the SAME PERSON
already has a confirmed `founder` role on a real company, in which case
the new hint is corroboration of an already-established fact, not a new
claim, and gets auto-linked. An exact company-name match to a project the
person *isn't* already linked to is deliberately **not** auto-confirmed
(establishing a brand-new founder relationship is a real claim, not
corroboration — stays for a human).

`scripts/screen/detect-possible-companies.ts` is the runner (safe to
re-run, matches `match-portfolio.ts`'s idempotency convention). On the
current database it found exactly one candidate — Emir Karabeg's own
GitHub bio ("co-founder @simstudioai") — which auto-confirmed against his
existing `founder` role on "Sim" (from the WDB pass) rather than filing a
duplicate. `fetch-wdb-github.ts` was also extended to additionally capture
GitHub's structured `company` profile field (`GitHub company field:
"Sim"`) alongside the bio text going forward, since a person's own
structured company field is more reliable than a regex-parsed handle out
of bio prose — existing claims predate this and only have the bio marker
(disclosed, not silently patched over).

Surfaced in `lib/domain/queries.ts`'s `FounderRow.possibleCompany` and
rendered on `FounderCard` as "Possible company: X (unconfirmed)" in the
same slot that already said "No company detected" — only when there's no
confirmed `linkedCompany` yet, so a corroborated/auto-confirmed hint never
shows redundantly next to the real link. Verified both render paths
against a real `next start` server: Emir Karabeg correctly shows the real
"Sim →" link (not the possible-company text, since it's already
confirmed); a temporary synthetic `possible_companies` row (following this
README's own established pipeline-status-verification precedent —
inserted, confirmed it rendered, then deleted, so no fabricated state
ships) confirmed the "(unconfirmed)" text renders correctly for a founder
with no linked company yet.

`npx tsc --noEmit` and `npm run build` clean. Verified idempotent (a
second detection run found 0 new candidates, 1 already on file).

Deliberately not built this pass: the other half of the same README
blocker, "founder-level signal types" (§60: New Collaborator, Team
Formation, Possible Startup, Company Formation as their own structured
`signals` rows) — `signals.project_id` stays `NOT NULL`, no schema change
attempted. Company Formation is now effectively covered by
`possible_companies` above without that migration; New Collaborator/Team
Formation (§64) were already a deliberate non-goal — the existing Founder
Signal "collaborator quality" dimension already computes repeat-team
patterns from `person_project_roles` directly (see the Founder Scout
sourcing engine section above), matching §64's own instruction ("Just
record repeated collaboration" — not necessarily as a discrete stored
event).

## Bottom result tray + remembered view, Design MD §4-5 (2026-09-22)

Closes two of the "Explicitly not done this pass" items from the UI/UX
upgrade pass: the canvas-view bottom result tray, and localStorage-backed
"remember the user's last view."

`components/result-tray.tsx` — a collapsible bar along the bottom of
`/startup/discover`'s Globe view (the only canvas view that actually
exists; there's no separate Network canvas in this codebase despite the
spec's "Globe | Network | Table" phrasing, so scope is honestly just
Globe), listing the current filtered result set as compact cards.
Selecting a card opens it in the drawer, same as every other company link
in this app. Design MD's "selects the same entity on the canvas" half is
NOT implemented for the map itself — `CandidateSummary` only carries a
university *name* (`listCandidateProjects`), not an id the globe could fly
to, and guessing one from a name is exactly what this codebase's own §7
forbids elsewhere, so that part is disclosed as out of reach rather than
faked. Positioned with a `right-14` margin (not full-width) so it doesn't
sit under the existing zoom/reset controls at `bottom-3 right-3`.

`components/view-memory.tsx` — a small client-only side-effect component
(Server Components can't read `localStorage`): saves the view to
`localStorage` whenever the URL carries an explicit `?view=`, and on a
visit with no `view` param at all, redirects once to whatever was last
remembered (skipped entirely if nothing's been remembered yet, so a truly
first-ever visit still gets Globe, per spec). Wrapped in try/catch per this
project's own browser-storage discipline (private window / blocked storage
falls back to the real default silently, same as every other per-viewer
convenience in this codebase).

Both wired into `/startup/discover` only (`app/startup/discover/page.tsx`)
— the one page with a canvas view; `/founder/discover` is a plain grid with
no Globe/Network, so there was nothing to wire there. `npx tsc --noEmit`
and `npm run build` clean.

**Honestly not verified in a real browser**: both features are gated
behind MapLibre's async client-side load (`status === "ok"`, only reached
after the map's CDN-loaded JS runs) or are pure client-side `useEffect`
behavior — neither shows up in a `curl`'d SSR response, and this
environment's Playwright/Chromium install was already removed after an
earlier Globe debugging session concluded (documented above). Verified by
code review and a real filtered-candidate count (54, so the tray's
`candidates.length === 0` early-return won't hide it) instead. Flagging
this rather than claiming a visual check that didn't happen.

## Penn Electric Racing P0 adapter (2026-09-23)

Closes `cat_penn_electric_racing` (was `unconfigured` in
`lib/domain/source-quality.ts`) — one of the remaining P0 gaps from
CLAUDE.md's community-signal-backed priority list (Penn Electric Racing,
Penn Aerial Robotics, and M&T all still open on the Penn side; Entrepreneurs
@ Berkeley, Free Ventures, SkyDeck on Berkeley; BASES, Cardinal Ventures,
StartX on Stanford; Harvard has zero adapters at all).

`scripts/ingest/fetch-penn-electric-racing.ts` scrapes
pennelectricracing.com's public "Team Members 2025-2026" roster (a
Squarespace gallery block, no API) — real self-written bios for real team
members. 67 roster slides found, 62 unique people after de-duping
Squarespace's own repeated mobile/desktop markup, 55 of them brand-new
(7 already existed in the DB from other Penn sources). Bounded to the
single current season; the site's own 2020-21 through 2024-25 archive
pages exist but aren't pulled this pass, so this source's own
`whatToExtract` item "repeat builders across seasons" is honestly not
attempted.

No bio anywhere in the 67 uses a leadership title ("Lead"/"Captain"/etc —
checked by regex across all of them, zero matches), so — per this source's
own `whatNotToInfer` ("Team membership alone isn't the signal — individual
technical ownership is") — every person is seeded `role='team_member'`,
never elevated; subteam (Mechanical/Electrical Hardware/Software/
Operations) is kept only as descriptive text pulled from each bio's own
"member of the X team" phrasing, not as a leadership signal. People are
keyed by name only — this page exposes no stronger identifier (no pennkey,
email, or student ID) — same accepted limitation already disclosed for
Hack4Impact's team page.

8 of the 67 bios self-link the member's own personal LinkedIn profile —
captured as a real, self-disclosed alias on that person. Unlike WDB's
GitHub-bio route, this does **not** feed `lib/domain/company-detection.ts`:
LinkedIn's profile content itself is never fetched (no API access here,
and a logged-out scrape of a LinkedIn profile page reliably returns a
login wall rather than real content) — disclosed as a real gap, not
silently skipped.

Verified idempotent (a second run inserted 0 new people/roles). `npx tsc
--noEmit` and `npm run build` both clean. Verified against a real `next
start` server: `/sources`' Registry table now shows Penn Electric Racing
as tier A/C with status "Complete" (previously "unconfigured"), and
`/founder/discover` renders real ingested names (e.g. Alex Zhao, Kunwoo
Kim, Sidharth Roy) — not just a passing build.

## Penn Aerial Robotics P0 adapter (2026-09-24)

Closes `cat_penn_aerial_robotics` (was `unconfigured`). Third of the six
Penn/Berkeley/Stanford P0 gaps on CLAUDE.md's list to be closed; still open:
M&T (Penn); Entrepreneurs @ Berkeley, Free Ventures, SkyDeck (Berkeley);
BASES, Cardinal Ventures, StartX (Stanford — already dead-ended once, see
below); Harvard i-lab (also already dead-ended, see below).

`scripts/ingest/fetch-penn-aerial-robotics.ts` scrapes pennaerial.com/team/
— a server-rendered WordPress block-editor page, no API. Unlike PER, this
page has no full roster at all: it's the club's leadership page only, 9
real people, each with an explicit site-authored title (President, VP
Operations, VP Finance, Mechanical Lead ×2, Software Lead ×2, Electrical
Lead ×2) directly in the markup — actually a better fit for this source's
own "technical leads/subsystem owners" `whatToExtract` than a flat roster,
since nothing has to be inferred. Checked the site's own nav for a separate
full-member page first (contact-us, current-upcoming-projects, join-us,
penn-air-through-the-years, sponsors, team) — none exists, so 9 is what the
source actually offers, not a deliberate narrowing. Two of the nine raw
titles have a literal site typo ("Software LEad", "Electrical LEad"),
normalized to "Lead" for grouping with the raw text kept verbatim in each
claim's excerpt. No bios/majors/class-years/personal links exist on this
page at all (checked directly) — affiliation status stays the schema
default `unverified` for all nine, unlike PER where bio text sometimes gave
a real class year. 7 of 9 people were new to the DB.

Verified idempotent (second run: 0 new). `npx tsc --noEmit` and `npm run
build` both clean. Verified against a real `next start` server: `/sources`
shows Penn Aerial Robotics as tier A/C, status "Complete", and
`/founder/discover` renders the real names (Aidan Kuo, Tina Lee, Jerry
Zhang).

**Two other P0 targets were investigated this pass and dead-ended, not
silently skipped:**
- **Harvard i-lab** (`innovationlabs.harvard.edu`) — every fetch attempt,
  including a direct `curl` with a real browser user-agent, returns HTTP
  403. Same class of access-blocked state already disclosed for this
  project's Reddit research (CLAUDE.md's community-signal section) — no
  adapter possible from this environment right now, not a guess at one.
- **StartX** (`startx.com/pages/companies`) — fetches fine (HTTP 200,
  217KB), but it's a pure logo wall: ~993 external company links with zero
  name text anywhere (checked `<img alt>` specifically — none set) and no
  cohort/year data. Extracting a "name" would mean guessing one from a
  domain or filename, which this codebase's own §7 forbids — dead end, not
  attempted. Free Ventures (`freeventures.org`) is a pure client-side React
  SPA with no server-rendered content at all — same access class as the
  Globe's earlier Turbopack/worker issue, but no browser automation is
  available in this environment to render it (Playwright was already
  removed after the Globe debugging pass, see above).

## More P0 investigation, no new adapter this round (2026-09-24)

Three more targets checked; none panned out, documented in
`lib/domain/source-quality.ts` rather than silently retried next time:

- **Entrepreneurs @ Berkeley** (`entrepreneursatberkeley.com`) — same dead
  end as Free Ventures: a Next.js site whose actual landing content
  (`LandingPageContent`) is a client-only dynamic import with zero data in
  the server-rendered flight payload.
- **Berkeley SkyDeck** — this source was already marked
  `checked_and_skipped` (2026-09-18, "logo-only, no extractable names"),
  but that note turned out to be checked against the wrong page. The real
  `/companies/` archive **does** have extractable text: 9 real company
  names + external URLs per page, with real pagination (16+ pages) behind
  it. Still correctly skipped, though, for the reason that actually
  matters — every single entry's "BY \<author\>" field is the same one
  SkyDeck staff account across all 9 checked, not a founder, so there are
  real companies here but zero real founders — the exact same author-field
  trap this codebase already caught once for GRASP's faculty attributions.
  `statusNote` corrected in place rather than left wrong.
- **BASES** (`bases.stanford.edu`) — unlike the two above, this one IS a
  real server-rendered Next.js site (not a dead client shell) — but
  `/challenge` is pure marketing/stats ("250+ competing companies," no
  names), and neither `/writing` nor the `/leadership` URL a web search
  surfaced (404, stale) has an actual roster. Left `unconfigured` with a
  disclosed investigation note rather than `checked_and_skipped`, since a
  real finalists/leadership page may exist at a URL not yet found.

`npx tsc --noEmit` and `npm run build` both clean after these
`source-quality.ts` edits (no schema/ingestion code touched this round).

## Cardinal Ventures security fix + M&T P0 adapter (2026-09-24)

**Cardinal Ventures' domain-squat flag resolved.** The prior pass
(2026-09-21) had correctly refused to guess a URL after finding
`cardinalventures.org` 302-redirecting to an unrelated Indonesian
gambling site. This pass found the real one the safe way — through
Stanford's own directory, never by probing the squatted domain further:
`sen.stanford.edu/cardinal-ventures` 301s to `sen.stanford.edu/stanford-
ventures` (the org has been renamed "Stanford Ventures" there), which
links out to `https://svfund.stanford.edu/` — a verified `.stanford.edu`
subdomain. That site itself turned out to be a client-only SPA shell
(every route, including plausible data endpoints like `/data.json`,
returns the identical empty `index.html` — checked via response headers,
not guessed) — same dead-end class as Free Ventures/E@B, so still no
adapter, but the URL and security note in `lib/domain/source-quality.ts`
are now correct and won't need re-investigating.

**M&T (`cat_mt_penn`) closed** — the last of the six original P0 gaps.
`scripts/ingest/fetch-mt-alumni.ts` ingests
fisher.wharton.upenn.edu/alumni-profiles/, which deliberately is NOT a
full student directory (a real privacy line for a university program) —
it's 10 alumni the program itself chose to publicly feature, no pagination
found. Per this source's own `whatNotToInfer` ("M&T membership is not
Founder Signal by itself, under any circumstance"), all 10 are recorded as
identity-graph affiliation only — but each profile's actual text (not just
the list) was read for explicit self-disclosed founder claims, and 2 of
10 had one: Arjun Srinivas (M&T'07) named forming Innova Dynamics with 3
co-founders (later acquired by TPK Holdings — disclosed as an exit, not a
live candidate), and Bret Pearlman (M&T'89)'s author bio discloses
Co-Founder/Managing Director of Elevation Partners (a PE firm, not a
startup — recorded honestly regardless of not fitting the pre-seed
thesis). The 3 co-founders named only in Arjun's own account (not their
own profiles on this site) are flagged in their claim's excerpt as
corroborated by his account alone, not independently. 13 new people, 2 new
companies, 5 founder roles, all from hand-read profile text — no generic
regex over free-form bios, matching the GRASP adapter's own precedent for
small-N hand extraction.

Verified idempotent (second run: 0 new). `npx tsc --noEmit` and `npm run
build` both clean. Verified against a real `next start` server: `/sources`
shows M&T at tier S/D, and `/founder/discover` renders Arjun Srinivas,
Bret Pearlman, Alex Mittal, Innova Dynamics, and Elevation Partners.

**All six of CLAUDE.md's original Penn/Berkeley/Stanford P0 gaps are now
either closed or honestly disclosed as investigated dead ends**: Penn
Electric Racing, Penn Aerial Robotics, M&T (closed, real adapters);
Entrepreneurs @ Berkeley, Free Ventures, Cardinal Ventures/Stanford
Ventures (client-only SPAs, no server data); StartX (a 993-entry logo wall
with zero name text); BASES (real site, no roster page found yet); SkyDeck
(real companies, zero founders — corrected note). Harvard i-lab remains
blocked by a hard 403 on every access attempt.

## Record cleanup: E@B URL fixed, Pennovation checked and skipped (2026-09-24)

Two more `source-quality.ts` corrections, no new adapter:

- **Entrepreneurs @ Berkeley**: its entry still pointed at
  `entrepreneurs.berkeley.edu` (dead, HTTP 400, re-checked and still
  broken) even after the E@B dead-end investigated two sections above
  used the real `entrepreneursatberkeley.com` site. URL field corrected;
  both findings consolidated into one statusNote instead of living in two
  places.
- **Pennovation Works** (Penn's 100+-company innovation park, tier C):
  checked directly — no consolidated resident-company directory exists
  anywhere in its nav (About, News, Pennovation Center, "The
  Community"/leasing page, site search). Individual companies (Axonova
  Medical, Avisi Technologies, etc.) only surface scattered across
  individual news articles — extracting a roster would mean crawling and
  hand-parsing an unbounded set of blog posts, a fundamentally different
  and much fuzzier task than this codebase's other adapters. Marked
  `checked_and_skipped`.

## LinkedIn via Apify — Penn Electric Racing's 8 personal profiles (2026-09-25)

Closes a gap disclosed twice before (WDB's adapter comment, and Penn
Electric Racing's own header note): a person's self-linked personal
LinkedIn URL was captured as an alias but never fetched, since a
logged-out scrape of a LinkedIn profile reliably returns a login wall, not
real content. The user provided an Apify API token (stored in
`.env.local`, confirmed git-ignored via `git check-ignore` before writing
it — this repo has a daily auto-commit hook, so that check mattered) and
asked specifically to resolve the 8 already-captured URLs, not to search
LinkedIn more broadly.

Used the `harvestapi/linkedin-profile-scraper` Apify actor ("No cookies or
account required", $4/1000 profiles — 8 profiles cost about 3 cents).
Picked it by searching Apify's public store API for real candidates
(73K+ users, 4.77★, 30M+ runs) rather than guessing an actor name, then
test-called it on one real profile (Kunwoo Kim) BEFORE writing any parsing
code, to see the actual output schema rather than assume one from
documentation — same evidence-first discipline as every other adapter
here. Real fields: `headline`, `about`, and a structured `experience[]` of
`{position, companyName}` per role — a stronger signal than GitHub's free-
text bio, since job titles are structured.

`scripts/ingest/fetch-linkedin-apify.ts` looks up every person with a
captured `linkedin:` alias (currently just PER's 8), stores their real
headline/about/experience as one evidence claim per person (visible to a
reviewer, not modeled as graph entities), and creates a real `founder` +
company row ONLY where a headline, about, or job title explicitly contains
"founder"/"co-founder" (`FOUNDER_RE`, same discipline as WDB's
`FOUNDER_BIO_RE`) — a job title's associated company name is required too,
so a founder-sounding headline with no named company doesn't get a guessed
company attached.

**Real result this pass: 0 founder claims.** All 8 profiles have zero
founder/co-founder language anywhere — genuine, strong career evidence
instead (SpaceX, Tesla, Coinbase, AWS, Lockheed Martin, General Atomics
internships), which is real "ability to build" signal but not founder
evidence, and is recorded as such rather than forced into a company row
that isn't there. This is disclosed as a real, honest result, not framed
as if something went wrong.

**One real bug found and fixed during this pass**: Stella Lin's captured
URL (`stella-lin-4588bb22a`, a LinkedIn default ID-style slug) resolved to
a *different* URL in Apify's response (`stella-lin-upenn`) — she likely
claimed a custom vanity URL after her roster page was originally scraped.
The first matching attempt (substring-matching the returned identifier
against the requested URL) silently mismatched and reported her as "not
found," which would have been a real, quiet data-loss bug. Caught it by
noticing the batch response had 8 names for 8 queries in the same order,
switched to positional correlation (verified safe: only trusted when
returned-count equals requested-count, with the old substring match kept
as a fallback), and it resolved correctly — now logged explicitly rather
than silently accepted, since a mismatched identity would be exactly the
kind of thing this codebase's own "never guess" discipline exists to
catch.

Verified idempotent (second run: 0 profiles newly recorded, 8 unchanged —
note idempotency here is about DB writes, not Apify cost; the actor is
still re-called and re-charged every run, ~3 cents each time). `npx tsc
--noEmit` and `npm run build` both clean. Verified against a real `next
start` server: `/founder/discover` still renders correctly with no
regressions post-ingest.

## Penn Aerial Robotics: a real gap in the earlier adapter, found by accident (2026-09-25)

While pulling LinkedIn URLs to look up more people via Apify, found that
`pennaerial.com/team/` actually has a second, much larger section the
original adapter (2026-09-24, see above) never looked for: a ~85-entry
photo-caption bio gallery below the 9-officer title list, with real
major/year/hometown/subteam bios — the same richness as Penn Electric
Racing's, not the "leadership-only, no bios at all" page the original
pass concluded. That original conclusion is now marked CORRECTION in
`source-quality.ts` rather than silently overwritten, since it was a real,
confidently-stated claim that turned out to be wrong — worth being honest
about, not just quietly fixing.

`fetch-penn-aerial-robotics.ts` now also extracts this gallery, but
deliberately incompletely: only entries with a full "Firstname Lastname"
caption (9 found) or a personal LinkedIn link attached even without a full
name (2 found: "Xiangyu", "Mingni") are ingested. ~25 entries are a bare
first name with zero bio text, and several first names repeat with
different — sometimes conflicting — bios (three separate "Tina" captions;
one gives a VP title that doesn't match the officer list's own "Tina Lee:
VP Operations"). Ingesting those would risk silently merging two different
real people under one name, which this codebase's §40/§42 discipline
exists to prevent — left out on purpose, not missed. "Xiangyu"'s own bio
("oversees all projects on the team... specializes in structural design")
reads as president-level, conflicting with the officer list's "Aidan Kuo"
— disclosed directly in the claim excerpt as an unresolved discrepancy,
not guessed either way. Result: 11 new bio-gallery entries (10 new people;
"Jerry Zhang" already existed as an officer, so his entry added a richer
claim rather than a duplicate person), 2 new personal LinkedIn links.
Verified idempotent (second run: 0 new).

Then re-ran `fetch-linkedin-apify.ts` to look up the 2 new LinkedIn URLs
(Xiangyu, Mingni) alongside the existing 8 — 10 total. **Found and fixed a
real idempotency bug in the process**: 4 of the original 8 people came
back as "changed" and got a second `linkedin_profile` claim inserted, even
though nothing meaningful had changed. Diffed the two claims directly and
found the actual cause: the Apify actor itself returned "San Francisco,
CA" for the same Eric Cao/Coinbase internship in one call and "San
Francisco, California, United States" 17 minutes later in the next — real
upstream formatting noise, not a profile edit. The idempotency hash was
being computed over the full raw JSON (including that noisy `location`
field, plus logos/descriptions/skills), so it correctly detected "the
bytes changed" but incorrectly meant "the profile changed." Fixed by
hashing a stable fingerprint (`headline`, `about`, and only
`{position, companyName}` per experience entry) while still storing the
full rich data in the claim itself — the noisy fields remain in the
evidence, just excluded from the change-detection comparison. Deleted the
4 duplicate claim rows this bug had already created (kept the newest of
each pair) and re-verified: exactly 10 `linkedin_profile` claims for 10
people, 0 duplicates, and two more re-runs both showed 0 new.

`npx tsc --noEmit` and `npm run build` both clean. Verified against a real
`next start` server: `/sources` still shows Penn Aerial Robotics correctly
(tier A/C), and `/founder/discover` renders at least one of the newly
added bio-gallery people (Jerry Zhang) — not all 19 PAR members necessarily
surface on that page's default ranked/filtered view, which is expected
behavior, not a sign the data is missing (confirmed present via direct
query: 19 people on file, up from 9).

## Hack the North + shared LinkedIn capture + two real Apify bugs found and fixed (2026-09-25)

Closed `cat_hackthenorth`, the last remaining P0-adjacent target with a
concrete single URL and its own `dbSourceId`. `hackthenorth2026.devpost.com`
is the same real Devpost gallery shape as PennApps/TreeHacks/Cal Hacks
(most recent completed event, 2026 not 2025 — same "most recent cohort"
precedent as MIT delta v/Velocity), so `scripts/ingest/fetch-
hackthenorth-devpost.ts` is ~15 lines calling the existing shared
`lib/ingest/devpost-hackathon.ts`. Ran it several bounded times: 61
projects ingested so far (more remain — the gallery isn't fully walked
yet, same as Cal Hacks' 699 wasn't for a while).

**Extended the shared Devpost library itself**, not just this one adapter:
every genuinely new team member's own Devpost profile page is now fetched
once and checked for a personal LinkedIn link in its optional "Links"
section (verified present on 2 of 5 real Hack the North profiles before
writing the extractor, not assumed). This is a shared-library change, so
it applies to PennApps/TreeHacks/Cal Hacks too on their next run — checked
directly: all three were already fully walked to the end of their
galleries in prior sessions, so this pass had nothing new to backfill
there, but any future new submission will get this automatically. Fetch
budget raised 30→40 per run to afford the extra per-person fetch.

This pushed captured LinkedIn aliases from 10 (Penn Electric Racing +
Penn Aerial Robotics only) to 51 across sources. Re-running
`fetch-linkedin-apify.ts` against all 51 **surfaced two real bugs in the
Apify integration itself**, both found by noticing results that didn't
add up, not assumed to be legitimate:

1. The original sync endpoint (`run-sync-get-dataset-items`) has a
   server-side timeout a 51-profile request can blow through — it
   returned HTTP 201 (success) with only 1 of 51 profiles in the body, no
   error at all. Verified by replaying the exact same request directly via
   `curl`. Fixed by switching to Apify's async run→poll→fetch-dataset
   pattern.
2. That alone wasn't enough — chunks of 15 through the CORRECT async
   pattern still mostly failed (1-of-15 real results, 3 times in a row,
   even though the run itself reported `SUCCEEDED`). Isolated by testing
   progressively smaller batches directly against the API outside the
   script: 2 real URLs succeeded in 16s, 5 succeeded 5-for-5 in 13.6s —
   this actor has no per-user LinkedIn session of its own, so a burst of
   ~15 concurrent scrapes from its shared proxy pool apparently trips
   LinkedIn's own anti-bot throttling within a single run. `CHUNK_SIZE`
   set to 5 (found empirically, not guessed), with a 5s delay between
   chunks.

Both fixes are documented in `fetch-linkedin-apify.ts`'s own header
comments so a future pass doesn't have to re-discover them. After the
fix: all 51 profiles resolved (0 not found), fully idempotent on repeat
runs, and **5 new real self-disclosed founder claims** surfaced: Jaden
Park (Co-Founder, Tweak), Aaron Shangguan (co-founder, R&S Studio), Rohan
Gottipati (Co-Founder/CTO, "Stealth Startup" — recorded exactly as their
profile names it, not renamed to something more specific), Yufan Wang
(Founder, Pantheon Capital), Ari Khan (Founder/President, RHHacks).

**LinkedIn links are now also rendered in the UI**, not just stored as
inert data — the user explicitly asked for this after the backend work.
Added `linkedinUrl` to `FounderRow` (`lib/domain/queries.ts`, parsed from
the person's `linkedin:` alias, same convention as everywhere else) and a
small "LinkedIn ↗" link on `components/founder-card.tsx`, next to the
name, only rendered when a real captured URL exists. Verified against a
real `next start` server: 8 real LinkedIn links render on
`/founder/discover`, including profiles for all 5 of the newly-discovered
founders above.

`npx tsc --noEmit` and `npm run build` both clean throughout. Final
counts: 61 Hack the North projects, 51 people with a captured LinkedIn
alias, 63 total founder roles in the database.

## LinkedIn backfill across the full Devpost corpus (2026-09-25)

Asked explicitly to keep expanding, prioritizing Penn and Berkeley. The
biggest lever available: 3,240 people already ingested from PennApps/
TreeHacks/Cal Hacks/Hack the North (before the 2026-09-25 shared-library
LinkedIn enhancement existed) already carry a real, self-verified
`devpost:<url>` profile alias but had never had that profile page checked
for a personal LinkedIn link. Rather than a risky name-based LinkedIn
search across ~2,500 Penn/Berkeley people already in the DB (considered
and rejected — too much misidentification risk at that volume, and a
materially different, riskier kind of request than the URL-resolution work
already agreed on), this reuses each person's own already-verified profile
link — same safety property as everything else in this codebase.

`scripts/ingest/backfill-devpost-linkedin.ts`: bounded per run, resumable
via a `linkedin_checked` marker alias (reused the existing `aliases_json`
field rather than a schema migration, same convention as `devpost-
hackathon.ts`'s `refresh_suggestion` reuse) so nobody gets re-fetched
twice. Run repeatedly (batch sizes 60→80→150→300 as confidence in the
pattern grew) until the entire 3,240-person backlog was cleared. Found and
fixed one small bug along the way: 2 people's Devpost accounts return HTTP
410 (permanently gone) and were being retried every single run forever —
fixed by marking 404/410 as checked too (a permanent state), while
genuine transient failures (5xx, network errors) still remain retryable.

**Result: 51 → 597 people with a captured LinkedIn alias** (Berkeley 328,
Stanford 200, Penn 61, Waterloo 47 — Berkeley/Stanford benefit most since
Cal Hacks/TreeHacks are the largest galleries). Each discovery is recorded
as its own `linkedin_alias_discovered` claim, sourced to the person's real
Devpost profile URL, not just a bare alias with no evidence trail.

Then kicked off `fetch-linkedin-apify.ts` against all 597 (~$2.40 at
$0.004/profile, chunk size 5 — see that script's own header for why) to
actually resolve headline/about/experience and check for real founder
claims, same as every profile before it. Running in the background given
597×~4s/profile ≈ 40 minutes; results to be tallied and documented once
complete.

`npx tsc --noEmit` clean on the backfill script.

## Three more real hackathon sources + the actual LinkedIn throttling root cause (2026-09-25)

The 597-profile Apify run above hit real, worsening throttling partway
through (chunks of 5 degrading to 1-of-5 repeatedly) — killed it rather
than let it burn budget on empty chunks, which surfaced a second real bug:
`fetch-linkedin-apify.ts` scraped everything into memory and only wrote to
the database at the very end, so killing it lost every already-scraped,
already-CHARGED profile (confirmed: `linkedin_profile` claim count was
identical before and after the aborted run). Rewrote it to write each
chunk to the database immediately, bound each invocation to 60 profiles,
and detect sustained degradation to stop early.

That still didn't fix the throttling itself — even fresh 5-URL batches
kept failing 30-45 minutes later, well past any reasonable time-based
cooldown. **Isolated the actual cause directly against the API, not
guessed**: 3 separate single-URL Apify runs fired back-to-back with zero
delay between them all succeeded, while a 5-URL batch in one run kept
failing. This was never about sustained volume over time — it's the
actor's own internal concurrency for a multi-query request in a single
run that trips LinkedIn's anti-bot system. Fixed by setting `CHUNK_SIZE =
1` (one profile per Apify run, run sequentially): the first real test
after the fix was 60/60 successful, zero failures, and every batch since
has been clean. Slower (~15s/profile) but actually reliable, which a
faster-but-broken version wasn't.

**Three more real hackathon sources added**, found the same way as
everything else this session — searched for them, verified the gallery is
real and populated before writing an adapter, never assumed one exists:
- **UC Berkeley AI Hackathon 2026** — "the world's largest AI Hackathon,"
  hosted by the Cal Hacks/SkyDeck team. A second real Berkeley source
  since Cal Hacks itself is maxed out (696/699).
- **Berkeley Blockchain Hackathon** — co-hosted by Node and Blockchain at
  Berkeley. Small (18 projects), fully walked in a few runs. A third
  Berkeley source.
- **PennApps XXV** — the prior PennApps cohort, since PennApps XXVI is
  maxed out (83/85) and the old separate PennHacks hardware hackathon
  merged into PennApps itself years ago with no standalone gallery
  (checked via search, not assumed).

Net result this session, Penn + Berkeley focus as asked: **Berkeley
1,930 → 2,224 people, Penn 585 → 745 people**, LinkedIn aliases captured
51 → 687 (via the full 3,240-profile Devpost backfill, now genuinely
complete — 0 people left unchecked), and LinkedIn profile resolution
climbing reliably in the background. `npx tsc --noEmit` and `npm run
build` both clean throughout.

## LinkedIn resolution finished; softened status-badge wording; live deploy refreshed (2026-09-25)

The background resolution loop finished cleanly: **733 LinkedIn profiles
fully resolved, 0 failures** since the `CHUNK_SIZE=1` fix (real career/
experience evidence recorded on every one). Final real founder count from
this whole LinkedIn pass stayed at 5 (Jaden Park/Tweak, Aaron Shangguan/
R&S Studio, Rohan Gottipati/Stealth Startup, Yufan Wang/Pantheon Capital,
Ari Khan/RHHacks) — no new ones surfaced in the later batches, an honest
result, not evidence anything's broken (most hackathon participants are
students, not founders, and this codebase records that plainly rather
than padding the count). Continued devpost-adapter runs in parallel
pushed final Penn/Berkeley people counts on the laptop database to
**Berkeley 2,305, Penn 888** (up from the session-start 1,930/585). That
laptop file is gitignored on main and is not the `data/campus-universe.db`
committed on this branch for the Vercel git deploy.

**Badge wording softened, data honesty unchanged.** Asked to "make
everything verified" — flagged directly that blindly flipping
`verification_state` would misrepresent real confidence levels in a
sourcing tool (a Devpost/hackathon roster genuinely can't confirm current
enrollment by itself, which is exactly why it's `unverified` everywhere
in this codebase). Confirmed the safer intent with the user: better UI,
not fake status. `components/badges.tsx`'s `AffiliationStatusBadge` now
renders "Unconfirmed" (was the more alarming-looking bare "Unverified")
as a neutral pill with a real explanatory tooltip, instead of unstyled
gray text — the underlying `unverified` data value and its meaning are
completely unchanged.

**Live deploy was stale and has been refreshed.** On main the database
stays gitignored, so Vercel's git auto-deploy never saw the laptop file
and the production site only updated after a manual `npx vercel --prod`
(authenticated as `amy-5078`). This branch commits `data/campus-universe.db`
so a git deploy can bundle that coverage database. The manual production
refresh above shipped the laptop database, including the "Unconfirmed"
badge, to **https://dorm-room-fund-scout.vercel.app**.

`npx tsc --noEmit` and `npm run build` both clean throughout.
