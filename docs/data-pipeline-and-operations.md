# Data pipeline and operations

How data gets into Campus Scout, what the site shows from it, and how to run
and review the moving parts. Written 2026-11-04 from the code and the live
data; numbers are as of that date and will drift. Where something is a
judgment call or an unverified assumption, it says so.

## 1. The shape of the system

- **One database, committed to git.** `data/campus-universe.db` (SQLite, ~42 MB)
  holds universities, people, companies ("projects"), claims, signals, sources.
  There is no hosted database for this data.
- **Vercel serves it read-only.** On Vercel the file is copied to `/tmp` when a
  server instance starts (`lib/db/client.ts`). Writes made on the live site
  (for example pipeline status) are lost when the instance recycles. Only the
  per-user Shortlist/Pipeline store can be durable, and only if Postgres or
  Upstash is configured (`lib/user-pipeline/store.ts`).
- **Data changes through git.** A change to the database is a commit of the
  `.db` file. A push to `main` deploys. `vercel.json` enables deploys for `main`
  only, yet pull requests also get preview builds; that is observed, and the
  cause is probably the Vercel projects' own settings (not checked).
- **Build-time files.** `npm run build` first runs `prebuild`, which imports
  the user-submitted scouting list and generates static JSON into
  `public/data/` (gitignored): `sample-directory.json`, `founders.json`,
  `globe-map.json`, `network-map.json`, `hero-stats.json`, `shell.json`,
  `candidates.json`, `founder-networks-page.json`,
  `founder-networks-graph.json`, and `founder-table.json`. Pages read these
  instead of querying at request time. **A locally checked-out copy has no
  `public/data/` until you run `npm run prebuild`.**

### Scheduled jobs (`.github/workflows/`)

| Workflow | When | What it does |
|---|---|---|
| `news-fetch.yml` | daily 11:17 UTC | Fetches news, **commits the database straight to `main`** |
| `collect-sources.yml` | Mondays 09:41 UTC, or manual | Runs approved collectors, audits, **opens a PR** (never pushes to `main`) |
| `verify-*.yml` | on PRs | Build, type-check, and a few data audits |

Both database-writing jobs share the concurrency group `news-fetch`, so they
never run at the same time.

**One-time repo setting:** "Allow GitHub Actions to create and approve pull
requests" must be on (Settings → Actions → General), or the collector cannot
open its PR. It is on as of 2026-11-04.

### The binary-conflict rule

`campus-universe.db` cannot be merged. If two branches both change it, the
second one conflicts and there is nothing to resolve by hand. Rules of thumb:

- Merge database PRs promptly, one at a time.
- If `main`'s database changed after your PR branched, **re-run the job or
  script on the newer file** instead of fixing the conflict.
- Before merging, check that `main`'s database is unchanged since your branch's
  base: `git diff --quiet $(git merge-base HEAD origin/main) origin/main -- data/campus-universe.db`.
  (Comparing against your own branch will always say "changed".)

### Never open the committed database casually

`getDb()` applies the schema, runs migrations, and switches to WAL mode, which
can leave `-wal`/`-shm` files and touch the file. For experiments, **copy the
database and point at the copy**:

```bash
cp data/campus-universe.db /tmp/scratch.db
CAMPUS_UNIVERSE_DB_PATH=/tmp/scratch.db npx tsx scripts/collect/run.ts --dry-run
```

`CAMPUS_UNIVERSE_DB_PATH` is honored by `getDb()` and by the scripts below.

## 2. What counts as what (the numbers glossary)

The same word means different things on different pages. This is the key to
not being confused by the counts.

| Where | Number | Meaning |
|---|---|---|
| Homepage / `/companies` | **Vetted companies** (1,573 in the committed database; the live site showed 1,586, which appears to be the build-time import of user-submitted leads, a guess not confirmed by running the import) | `projects` with `kind = 'company'` and `is_investable_candidate = 1` |
| Homepage | **Founders** | Distinct *people* (by person id) with any role on a vetted company: `countFoundersListed()` in `lib/domain/directory.ts` |
| `/founders` | **Founders** (larger) | *Promoted* people (below), across every company and project, including hackathon entries |
| `/networks` | founders on the map / with a mapped network | Unique founders in the network graph vs. those with at least one network link |
| `/companies?unverified=1` | **Unverified companies** | Hidden companies whose founders' recency is not confirmed (section 5). **Never included in vetted counts** |

### Which people appear on the site ("promoted")

`lib/domain/promotion.ts` decides. A person is shown only if they have at least
one of:

1. a role on a project of `kind = 'company'` (company founder),
2. a leadership-style role (team lead, director, technical lead),
3. a specific, non-generic role on a project, or
4. real roles on two or more projects (repeat builder).

Generic roles (`team_member`, `contributor`, `member`, unknown) alone do **not**
qualify. This is why hackathon sourcing adds many people to the database but
few to the site: most Devpost participants are generic team members. On
2026-11-04 the database held 6,826+ people; the site showed about 3,480.

## 3. Source collectors

Collectors turn a public source into people, projects and claims, **always with
affiliations marked `unverified`**: a Devpost profile has no school field, so
taking part in a campus-hosted hackathon cannot by itself confirm enrollment.

Only one collector type exists as a shared library: **Devpost hackathon
galleries** (`lib/ingest/devpost-hackathon.ts`). Other sources (YC directory,
UndergradVC, program pages, GitHub orgs) have one-off scripts in
`scripts/ingest/`, not a registry entry.

### Files

| File | Purpose |
|---|---|
| `data/collectors/registry.json` | The list of collectors. Only `status: "approved"` entries run. 42 approved as of 2026-11-04 |
| `data/collectors/candidates.json` | Proposals from discovery plus the review decision and reason for each (`reviewNote`) |
| `scripts/collect/run.ts` | Runs approved entries and audits the result |
| `scripts/collect/discover-devpost.ts` | Proposes Devpost events for universities with no people |
| `.github/workflows/collect-sources.yml` | Weekly bounded run that opens a PR |

Registry entry statuses: `approved` (runs), `candidate` (proposed, needs review),
`rejected`, `paused`. An entry's `options` map to the library config
(`maxProjectFetches`, `maxFetches`, `winnersOnly`, `captureLinkedIn`).

### Run it

```bash
npx tsx scripts/collect/run.ts --dry-run                 # show the plan, change nothing
npx tsx scripts/collect/run.ts --only <entry-id>         # one entry
npx tsx scripts/collect/run.ts --max-entries 5           # least recently run first (what CI does)
npx tsx scripts/collect/discover-devpost.ts --ids univ_rice,univ_gatech
npx tsx scripts/collect/discover-devpost.ts              # every university with no people
```

Use a scratch copy of the database for anything that is not `--dry-run`
(section 1). Each collector is bounded per run and resumes at the gallery page
it stopped at (stored in `sources.refresh_suggestion`), so repeated runs make
progress through large galleries.

### The verification audit

After a run, `run.ts` checks that every affiliation created during the run has
status `unverified`, and **exits non-zero if not**. In CI that stops the
workflow before a PR is opened. It was verified by hand, not by an automated
test: a planted non-`unverified` row was caught and clean data passed. There is
no regression test for it in the repo yet.

### Adding a hackathon

1. Run discovery for the university, or add an entry by hand with
   `status: "candidate"`.
2. **Review it** with the rules below. Never flip to `approved` on a keyword
   match alone.
3. Set `status: "approved"` and add a note saying why.
4. `--dry-run`, then run it once against a scratch copy and confirm the audit
   passes.

Review rules used for the first 69 candidates (27 approved, 4 held, 38 rejected):

- **Approve** only when the event's organizer or venue clearly names *that*
  university (check the Devpost API fields `organization_name` and
  `displayed_location`), **and** the event is from 2024 or later (earlier
  participants have mostly graduated).
- **Reject** wrong-university matches. Real examples caught: a Cornell event
  filed under Ithaca College; a University of Miami event under Miami
  University (Ohio); Arizona State's event under the University of Arizona; a
  Georgia Tech club under UGA; a **high-school** hackathon under Stevens.
- **Hold** when the link is ambiguous (campus not confirmed, multi-school
  event, or the database entry is a generic system rather than the campus).

Devpost's event home pages return 403 to this bot. Use the public
`https://devpost.com/api/hackathons` listing for event facts; do not work
around the block.

### LinkedIn capture

By default (`captureLinkedIn` is true) a collector reads each *new* person's
public Devpost profile and stores a personal LinkedIn URL if they listed one,
as a `linkedin:<url>` alias. These are leads, not confirmed identities. Set
`"captureLinkedIn": false` in the entry's `options` to turn it off per entry.

### Known quirks

- `treehacks-2026` appears twice in the registry (two original scripts covered
  it). Harmless, left alone.
- The weekly PR is a binary database change, so GitHub cannot show a diff. The
  run log and the PR's row counts are the review.

## 4. Source ranking and discovery coverage (state of play)

- The `sources` table has 424 rows, mostly entered by hand. Only about 50 have a
  founder or startup tier.
- A volume-based score (companies, founders and signals produced per source)
  does **not** agree with the hand-set tiers, and should not replace them:
  tiers are meant to reflect build evidence, not row counts. Many top-scoring
  "sources" are enrichment tools (LinkedIn search, company profile pages), not
  discovery sources, and several have misleading `family` labels. Splitting
  discovery from enrichment is still to do.
- Coverage on 2026-11-04: 170 universities; 76 with any person in the database;
  64 with at least one *visible* founder; 94 with nobody.
- Hackathon sourcing mostly adds people the site does not show (section 2).
  Visible coverage comes from **company** sources and from showing or
  verifying the existing hidden companies (section 5).

## 5. Hidden companies, the unverified view, and restoring companies

### The flag

`projects.is_investable_candidate` decides whether a company is in the vetted
directory. A hidden company normally carries `excluded_reason`. On 2026-11-04:

| `excluded_reason` | Companies | Meaning |
|---|---|---|
| `unverified recency` | 4,171 | Nobody has confirmed the founders are current students or recent grads. Mostly *no* founder is linked (only 471 have one) but 4,127 are tied to a campus |
| `founders not current/recent (<2023)` | 235 | Founders are known to be too old. Deliberately out of scope |
| `faculty startup (not student)` | 1 | Out of scope |
| (none) | 10 | Reviewed; see below |

### The Unverified view (`/companies?unverified=1`)

A switch on `/companies` between **Vetted** and **Unverified**. The unverified
view lists only the `unverified recency` group, each entry labeled
"Unverified", with a banner explaining it is a lead and not a finding. Rules it
follows:

- It is a **separate server-rendered view**, not part of the shared directory
  JSON, so the map, globe, filters and headline counts are untouched.
- **Vetted counts never include unverified companies.**
- Campus pages link to their own unverified companies (`?campus=<university id>`).
- Data comes from `lib/domain/unverified-companies.ts`: three grouped queries,
  memoized per database version (about 40 ms cold).

### Restoring a hidden company

Do not flip the flag by hand without a review: the 35 companies that had *no*
reason turned out to be a mix. On 2026-11-04 each was read individually:

- 25 restored: startup-like, founder recorded as a current student or recent
  grad.
- 8 kept hidden: a private-equity firm, an employer named in a bio, an
  accelerator, a nonprofit, a high-school hackathon, and three exited or
  acquired companies.
- 2 left hidden: no founder linked, so recency cannot be checked.

The decision list is `data/exports/restore-reviewed-companies-2026-11-04.json`
and the idempotent script is `scripts/data/restore-reviewed-companies.ts`
(only touches rows still hidden-without-reason; `--dry-run` supported). For a
new batch: review, write a new JSON list, copy the script, run against a
scratch copy, **diff every table** between before and after (only `projects`
should differ, only the reviewed rows), run the tests, then open a PR.

## 6. Performance lessons (so they are not re-learned)

Each of these was found by **profiling**, not guessing, and fixed with output
verified identical to the old behavior.

| Symptom | Cause | Fix |
|---|---|---|
| `/signals/sources` ~26 s | One function ran ~5 queries per source across 424 sources (N+1) | `sourceTypedCountsAll()`: three grouped queries; verified equal for all sources |
| `/signals` 5 s | Two correlated subqueries per signal (join + UNION + DISTINCT), 1,605 signals | One CTE of project→university joined once; verified identical on every column |
| `/founders` slow first load | Heavy table built per request (serverless cold start ~6 s) | Build once at deploy: `public/data/founder-table.json` (231 KB over the wire) |
| Local profile shows 80% in `fs.stat` | A staleness check re-`stat`ed files once per person | Throttled to once a second. **Note:** this mattered on this machine's slow `/mnt/c` disk, not on Vercel |

To profile a function: `node --cpu-prof --cpu-prof-dir=/tmp/prof --import tsx script.ts`,
then aggregate self time per function from the `.cpuprofile`. Measure on the
deployed preview too: local disks (especially WSL `/mnt/c`) can hide or invent
problems.

Remaining known cost: the first request to a cold serverless instance copies the
42 MB database (about 2-5 s). Only a hosted database removes that.

## 7. Tests

```bash
export CAMPUS_UNIVERSE_DB_PATH=/tmp/scratch.db   # a COPY of data/campus-universe.db
npm run test:directory test:startup-card test:data-audit ...   # see package.json "test:*"
npx tsx scripts/audit/check-founders-latest-2026.ts
npx tsc --noEmit
```

On 2026-11-04 the 18 `test:*` suites checked plus the two CI audits passed (20
of 20) against a fresh copy of the committed database.

**Tests that read the live database go stale.** Three failed because code or
data had moved on (a map radius constant, a company's campus list and
verification date, and a company that was later hidden). When a data-driven
test fails, first ask whether the *code* or the *data* changed on purpose;
prefer asserting behavior and invariants over one record's current values.

Lint: `npx eslint app components lib`. There are 10 known errors, all
`react-hooks` rules in the Networks graph and homepage client code. They are
left alone because changing hook behavior there cannot be verified without a
browser.

## 8. Open questions and unfinished work

- 471 unverified companies have a linked founder; confirming their graduation
  years against public pages would move real companies into the vetted set.
- 352 people carry only a `linkedin_unverified` marker with no URL (3,167 have
  a confirmed one). It looks like a deliberate demotion in the 2026-11-02
  accuracy pass; not confirmed.
- Two records (including AfterQuery) have a `last_verified_at` earlier than the
  fetch date in their own note.
- Held Devpost candidates: Cal Poly KiroHacks, Lehigh Valley Collegiate
  Hackathon, and two HackHayward events.
- Collectors for non-Devpost company sources (UndergradVC by school, YC by
  school, entrepreneurship-center pages, GitHub orgs) are not built.
- Nothing about layout or interaction was verified in a browser while writing
  this; the checks were served HTML, data and tests.
