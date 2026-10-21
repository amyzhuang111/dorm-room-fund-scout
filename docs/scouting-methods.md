# Scouting methods

Repeatable free searches for student founders, stealth companies, and people who are building but do not have a public product yet. Run these about once a semester, or when a campus refresh is requested. Every row that lands in `data/campus-universe.db` still needs a page that states the person, the school, and the company or the "building" claim. Do not fill gaps from memory. Do not turn a missing page into a negative score.

Voice transcripts garble names. Check the spoken words against a public page before import. Confirmed decodes: "Fulvers" is Fulcrum (`withfulcrum.com`, Columbia; Sambhav Anand and Arjun Mangla), not the YC debugger also named Fulcrum. "Nori Robotics" is Antonio Sitong Li's humanoid company (`norirobotics.com`, Columbia, YC S26), not the UIUC wearables company Nori (`nori.ai`). "62 by Sonnet2" is Sixtytwo (`sixtytwo.ai`), co-founded by Jessie Dong and Sonnet Xu, who met before freshman year at Stanford. Forus (formerly Tandem, `withtandem.com`, now `forus.com`) is Sahir Jaggi's New York company. He is a Columbia alumnus, not a current student. It is not the office-leasing company Tandem at `tandemspace.com`. His LinkedIn lists a year as a venture partner at GC Venture Fellows, the directory name for the org formerly called Rough Draft Ventures.

People with no public product go in the import file's `potential` array. Set `potentialSignal` and the start of `verificationNote` to `stealth or potential founder`. That tier is not Founder Signal, eligibility, or an investment score. A named product, even a small one, is a company row with `founder` status.

Import with:

```bash
./node_modules/.bin/tsx scripts/ingest/import-v3-campus-founders.ts data/imports/v3-campus-founders-batch7.json
```

The importer is idempotent. Re-running attaches the same claim instead of inserting a second person.

## Queries that return pages

Replace `{campus}` with the school name students actually use (`Penn`, `Wharton`, `Berkeley`, `Columbia`, `Stanford`, `MIT`, `Harvard`, and the other schools in `lib/domain/campuses.ts`).

X / Twitter, via web search rather than the paid API:

```text
site:x.com "{campus}" (building OR "dropped out" OR stealth OR "we're hiring" OR launching) (founder OR startup)
site:x.com "{campus}" (founder OR building) (student OR dropout)
```

`site:x.com` returned no usable hits in the September 2026 run. Search `site:twitter.com` with the same words, then open the post. A bio that only says the campus plus "founder" is a lead, not a record, until a page states the company or that the company is still unnamed.

Hacker News:

```text
site:news.ycombinator.com "Launch HN" ("on leave" OR dropout OR "student at") {campus}
site:news.ycombinator.com "Show HN" (student OR dropout) {campus} (built OR building OR launched)
```

Y Combinator and a16z Speedrun, which are the highest-yield free rosters:

- Public Algolia on `https://www.ycombinator.com/companies` (`window.AlgoliaOpts`). Search the campus name, `dropped out`, and `on leave`. Fetch `https://www.ycombinator.com/companies/{slug}` and read the founder bio.
- Founder bios for a whole batch are also in the public mirror `https://devasheeshg.github.io/yc-api/meta.json` (2023–2026 batch files). Cite `https://www.ycombinator.com/companies/{slug}`, not the mirror. `yc-oss` company JSON has no bios. A job at a medical school is not enrollment. "Senior Consultant" is not a class year.
- Speedrun list: `https://speedrun-api.a16z.com/api/companies/companies/?limit=100&offset=0`. Bios are on `https://speedrun.a16z.com/companies/{slug}`, not in the list JSON.
- YC Work at a Startup: open the company's jobs page only to find the company slug, then cite the company page for the founder and the school.

A bio written as `@ Harvard` or `Harvard dropout` does not match a pattern that only looks for `at Harvard` or `Harvard University`. Read those bios by hand. `scripts/ingest/scan-missing-campus-founders.ts` is the bounded scanner for YC, Speedrun, and the Columbia Startup Lab pages.

Product Hunt, GitHub, Devpost, Luma, Partiful:

```text
site:producthunt.com maker (student OR dropout) {campus} founder
site:github.com "{campus}.edu" (founder OR "building") (startup OR stealth)
site:devpost.com {campus} (winner OR "grand prize") (student) 2025 OR 2026
site:lu.ma {campus} ("demo day" OR "pitch day") 2026
site:partiful.com {campus} ("demo day" OR founders)
```

Devpost and hackathon winners are project leads. Add one only when the page names a person and a product they are continuing, not for participation alone.

Campus demo days and prize pages (open the official write-up, not a recap that drops the names):

```text
{campus} ("demo day" OR "startup challenge" OR "President's Innovation Challenge" OR "$100K") 2026 (founded OR founder) (winners OR finalists)
```

Pages that worked in this run: Penn Venture Lab Startup Challenge, MIT $100K (`news.mit.edu`), Harvard SEAS President's Innovation Challenge, Innovate Carolina 1789 Student Venture Fund, Columbia Startup Lab, and Startup Columbia winners.

Cohort pages that named founders in the September 2026 breadth pass: Cornell eLab 2025-26 (`eship.cornell.edu`), Penn VIP-X Spring 2026 and Fall 2025 (Venture Lab LinkedIn posts), Michigan Zell Entrepreneurs 2025-26 (`zli.umich.edu`), MIT delta v 2025 and the Investor Day lookbook, and CMU VentureBridge '26. Georgia Tech CREATE-X Demo Day lists companies and descriptions and does not name founders. TreeHacks 2025 winner write-ups name teammates and do not state each person's school, so they were not affiliated. Neo Scholars, Z Fellows, the Thiel Fellowship site, and the Pear Fellows post did not publish a name-and-school roster in the fetched text.

Substack, Medium, and community posts:

```text
site:substack.com {campus} (student OR dropout) (building OR "we launched" OR stealth)
site:medium.com {campus} student (founder OR "build log" OR launching)
```

Wellfound (AngelList), Techstars, Pioneer, and incorporation or pre-seed news:

```text
site:wellfound.com "{campus}" (student OR dropout) founder
site:techstars.com {campus} (student OR founder)
Pioneer.app cohort lists, searched as "Pioneer" {campus} founder student
"{campus} students" (pre-seed OR "raised $") (startup OR accelerator) 2025 OR 2026
Delaware OR "certificate of incorporation" {campus} student founder
```

TechCrunch articles in this run: Series (Yale; already stored), Breakthrough Ventures (Roman Scott and Itbaan Nafi, Stanford).

## Per-campus network zones

The Discover network for one campus (never All campuses) draws two zones. Outside is the left half. On campus is the right half. A tinted wedge and a vertical rule separate them. A tier band is a concentric arc: S+ and S sit closest to the campus hub, then A, B, C, and D, with a small letter on each band. People and startups stay further out, on the same side as the group they belong to. Campus people with no club edge stay on the on-campus side, outside the tier bands, instead of ringing the whole map. The letters are sourcing labels. They are not Founder Signal, eligibility, or an investment score.

The org list is `data/imports/campus_hotspots.csv`, one node per organization after these collapses:

- The same place in more than one hotspot section is one node. Mayfield Fellows Program is the single Stanford S-tier entry.
- Pear Fellows, Pear Dorm, and Pear Garage are one outside node, Pear Fellows / Pear Garage, at A.
- Berkeley SkyDeck's demo day and cohort track are one on-campus node at C.
- A national program that also has a campus chapter (a student fund's partners, GC Venture Fellows) is one node. The campus chapter stays on campus when the people in the room are students at that school.

Outside, even if a row was filed under the school: Y Combinator, a16z Speedrun, Neo, Z Fellows, Thiel, Contrary, Kleiner Perkins Fellows, Pear, Prod, Techstars, UC LAUNCH, and off-campus regional programs (NORCAT, Summer Company, Lab2Market). On campus: student clubs, campus accelerators and incubators, hackathons, entrepreneurship centers, and labs.

Berkeley letters from the hotspot revision stay as they were: Free Ventures A, Cal Hacks founder-side B (the startup section of that row is still A and does not pull Cal Hacks inward), Entrepreneurs at Berkeley B, Web Development at Berkeley A, SkyDeck C, AI Entrepreneurs at Berkeley A. BAIR, SAIL, CSAIL, CMU Robotics Institute, CMU Machine Learning Department, and GRASP stay A.

A row was added or retiered only after opening the organization's own page:

- Penn Labs moved from B to A. pennlabs.org publishes a roster and ships campus products. That matches the source-quality note already in the repo. The club's own apps are not startups.
- PennApps (pennapps.com, XXVII), Hack4Impact Penn (upenn.hack4impact.org), Penn Electric Racing (pennelectricracing.com), and Penn Aerial Robotics (pennaerial.com) were missing as organizations. Each is A.
- Codebase (codebase.studentorg.berkeley.edu) is a Berkeley client-project club at B, under Web Development at Berkeley.
- Accel Scholars (eecs.berkeley.edu/resources/undergrads/accel) is a Berkeley undergraduate program at A, on campus, because the page limits it to Berkeley. It is not drawn on other schools.
- BostonHacks (bostonhacks.org, 2025 at the George Sherman Union) is C.
- Vanderbilt Innovation and Entrepreneurship Society is C, from the Vanderbilt Anchor Link page for the organization.
- Columbia's Application Development Initiative (adicu.com) is B. DevFest stays a separate hackathon row.
- Freetail Hackers was not added beside HackTX. The HackTX organising-team row is that organization.
- ArchHacks was not added. The public pages found are the 2016 and 2017 events.

City houses (South Park Commons, HF0, and the others in the program-signal list) are outside, and they appear on a campus when a stored program signal ties a person at that school to the house. A directory row alone does not create a membership edge.

Refresh this list about once a semester, the same cadence as the rest of this file. Run `npm run audit:data` after edits. Do not add a second project row for a national program under each campus; the audit treats one organization affiliated with two universities as a conflict.

## What not to store

- A LinkedIn "Stealth AI Startup" or "Stealth Startup" page with thousands of employees is a placeholder bucket. Keep the person as `stealth or potential founder` and do not create a company with that name.
- Someone who says they turned down Stanford or Harvard, or deferred instead of enrolling, is not affiliated to that school.
- An officer, club president, or accelerator employee describing their own program is not an independent endorsement. A club founder is not a startup founder unless the page names a company.
- Scraper profiles (revenue estimates, guessed class years, guessed co-founders) are not sources.
- Reddit claims in `CLAUDE.md` stay out of the database until a real thread is read.
