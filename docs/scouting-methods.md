# Scouting methods

Repeatable free searches for student founders, stealth companies, and people who are building but do not have a public product yet. Run these about once a semester, or when a campus refresh is requested. Every row that lands in `data/campus-universe.db` still needs a page that states the person, the school, and the company or the "building" claim. Do not fill gaps from memory. Do not turn a missing page into a negative score.

Voice transcripts garble names. Check the spoken words against a public page before import. Two confirmed decodes: "Fulvers" is Fulcrum (`withfulcrum.com`, Columbia), and "62 by Sonnet2" is Sixtytwo (`sixtytwo.ai`), co-founded by Jessie Dong and Sonnet Xu, who met before freshman year at Stanford.

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

## What not to store

- A LinkedIn "Stealth AI Startup" or "Stealth Startup" page with thousands of employees is a placeholder bucket. Keep the person as `stealth or potential founder` and do not create a company with that name.
- Someone who says they turned down Stanford or Harvard, or deferred instead of enrolling, is not affiliated to that school.
- An officer, club president, or accelerator employee describing their own program is not an independent endorsement. A club founder is not a startup founder unless the page names a company.
- Scraper profiles (revenue estimates, guessed class years, guessed co-founders) are not sources.
- Reddit claims in `CLAUDE.md` stay out of the database until a real thread is read.
