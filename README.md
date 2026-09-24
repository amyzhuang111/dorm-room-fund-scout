# Campus Universe — a Dorm Room Fund-shaped startup scout

An independent scouting workspace for Amy (Penn) to discover and prioritize
pre-seed, student-founder prospects by university. **Not an official Dorm
Room Fund product.** Nothing here implies Amy represents DRF, and there is
no automatic outreach anywhere in the app.

This README is the honest status report: what's real, what's checked, and
what's still missing. It's written to match what the code actually does,
not the full brief — see `app/methodology/page.tsx` (also live at
`/methodology` once running) for the same breakdown inside the app.

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

No environment variables are required. No paid API key, search provider,
or LLM key is needed for anything currently implemented — the whole
pipeline runs on public-page fetches you can inspect yourself. A
`CAMPUS_UNIVERSE_DB_PATH` env var can override where the SQLite file lives
(default: `data/campus-universe.db`, gitignored, created automatically on
first run).

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
