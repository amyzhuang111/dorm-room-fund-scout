# Campus Scout — Fall 2026 founder-source expansion

**Created 2026-11-03.** This batch grows the platform beyond classic venture databases, treating live student accelerators, demo days, campus funds, competition cohorts, technical hackathons, GitHub and X/Twitter as separate **evidence channels**. The new directory entries are in `lib/domain/campus-founder-source-expansion.ts`.

## Seven venture imports

Source | Batch | Roster companies | Named people linked | What is established
--- | --- | ---: | ---: | ---
Stanford Ventures (formerly Cardinal Ventures), Fall 2025 and Spring 2026 | 19 | 27 | 56 | Official table **explicitly calls people founders**
Brown B-Lab 2026 | 20 | 9 | 12 | Named venture teams; not always confirmed legal founders
MIT delta v Demo Day 2026 | 21 | 13 | 0 | Companies and websites; no founder names in this public page
Yale Tsai CITY Fall 2026 | 22 | 21 | 30 | Student venture teams and class years, not legal founder title for every participant
Duke Startup Showcase 2026 | 23 | 35 | 35 | Named featured students; avoid assuming every student is a cofounder
Brown Venture Prize 2026 | 24 | 8 | 16 | Named finalist teams, including students from other universities
MIT $100K Launch 2026 | 25 | 7 | 2 | Official MIT Sloan names the Uplift Microhome cofounders and separate MIT/HBS affiliations
**Total sourced roster** | | **120** | **151** | Net-new unique counts must be taken from the database import logs after deduplication

Source pages:

- Stanford Ventures: https://svfund.stanford.edu/accelerator/25-26/
- Brown B-Lab: https://entrepreneurship.brown.edu/build-your-venture/b-lab/2026
- MIT delta v: https://entrepreneurship.mit.edu/accelerator/2026-delta-v/
- Yale Tsai CITY: https://city.yale.edu/stories/2026/10/13/big-ideas-bold-ventures-meet-tsai-citys-fall-2026-vdp-cohorts
- Duke Showcase: https://entrepreneurship.duke.edu/startup-showcase-2026-featured-companies/
- Brown Venture Prize: https://entrepreneurship.brown.edu/build-your-venture/brown-venture-prize/2026-brown-venture-prize-finalists-and-judges
- MIT $100K: https://www.mit100k.org/launch2022-copy and https://mitsloan.mit.edu/press/classroom-to-crisis-solution-uplift-microhome-wins-2026-mit-100k-competition

## Five 2026 hackathon cohorts (bounded evidence import)

`scripts/ingest/fetch-2026-campus-hackathon-winners.ts` uses the existing shared Devpost ingestion library. To keep the initial import bounded, it scans only entries marked as winners and imports up to 24 projects/event, with an explicit 90-fetch/event budget. Sources:

- TreeHacks 2026: https://treehacks-2026.devpost.com/project-gallery (378 submissions; previously partially ingested)
- Cal Hacks 13.0: https://cal-hacks-13-0.devpost.com/project-gallery (652 submissions)
- HackPrinceton Spring '26: https://hackprinceton-spring-26.devpost.com/project-gallery (131 submissions)
- HackHarvard 2026: https://hackharvard2026.devpost.com/project-gallery (88 submissions)
- HackIllinois 2026: https://hackillinois-2026.devpost.com/project-gallery

**Important:** a hackathon submission is `kind='project'`, **not** a confirmed incorporated company. Linked people receive `team_member` roles, not founder; university affiliation is always `unverified` because participating in Stanford/Penn/Harvard/Princeton/Illinois-hosted events does not prove enrollment. The script does not attempt private profile scraping or X login.

## Source inventory and priorities

High-yield official 2026 rosters: Stanford Ventures / Cardinal Ventures, Yale Tsai CITY, Brown B-Lab and Brown Venture Prize, Duke Startup Showcase, MIT delta v, MIT $100K, Illinois iVenture, UC Davis Big Bang, Princeton eLab, Stanford GSB Venture Studio, and Stanford Threshold Ventures fellows.

High-volume tech-builder discovery: TreeHacks, Cal Hacks 13, HackHarvard, HackPrinceton, HackIllinois, plus existing PennApps, Hack the North, and campus engineering GitHub organizations. Those point to possible founders with **build evidence**, not proof of incorporation.

Global/social discovery: X (Twitter) public build-in-public posts, GitHub Trending, Product Hunt, Indie Hackers, and the already-catalogued Show HN / YC / a16z Speedrun. Social signals should never be treated as student identity proof.

## Repeatable X/Twitter and public-web queries

Search via a public search engine, and **open the original post** before treating it as evidence. Example queries:

```text
site:x.com ("Stanford" OR "MIT" OR "Berkeley") ("building" OR "launching" OR "shipped") (startup OR product) after:2026-06-01
site:x.com ("Penn" OR "Wharton" OR "Yale") ("cofounder" OR "we launched") (AI OR SaaS OR startup)
site:twitter.com "TreeHacks 2026" ("demo" OR "launched" OR "github")
site:x.com "Cardinal Ventures" (founder OR demo)
site:x.com ("Harvard" OR "Brown" OR "Columbia") "student founder"
site:github.com "TreeHacks 2026" ("demo" OR "project")
```

If an original post is inaccessible or not attributable to the named person, do **not** create a confirmed person/company relationship. Only use X as a **discovery lead**, then establish person ↔ school ↔ product using an official program page, founder's public profile, or linked product/GitHub evidence. Do not infer founder identity from follower count, prize wins, investment announcements, generic university references, or a name match.

## Data quality and operations

- **Identity:** Same display names across teams or institutions are not enough to merge people. Use LinkedIn/Devpost identity links plus campus context.
- **Cohort:** A 2026 program listing cannot establish the person's current enrollment unless it actually states a class year. Treat 2026 graduation as recent-graduate; do not invent timelines.
- **Team vs founder:** Only an official source that clearly says *founder* promotes to `founder`; otherwise keep `team_member`/potential.
- **Money:** Competition prize, grant, accelerator participation, and equity funding are separate signals. Do not fabricate rounds.
- **Coverage:** These 28 source entries are an incremental, high-yield expansion. They are **not an exhaustive index of every university worldwide**; absence of a source/record is not negative evidence.
- **No unauthorized bulk copying:** Colombia/Columbia Crunchbase-backed directories and social networks are used as leads, not replicated databases.

## Running, testing, deploying

GitHub Actions `.github/workflows/campus-discovery-2026-import.yml` processes all seven JSON batches and the five bounded Devpost galleries on the PR branch, runs SQLite `PRAGMA integrity_check` and `npm run test:directory`, then commits the canonical `data/campus-universe.db` to the PR branch. Merge only after the DB and source code have been reconciled with current `main` and the Vercel build succeeds.

The original named deployment URL is immutable; once production updates, use the latest `campus-scout` deployment/domain.
