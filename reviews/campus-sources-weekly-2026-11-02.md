# campus sources weekly health check — 2026-11-02 (america/new_york)

checked: campus-import-sources-36.md (37 urls; brown has 2).  
import results: no /workspace/reviews/campus-import-results-*.md found (none to cross-check).  
prior weekly: no campus-sources-weekly-*.md found (first weekly file).  
did not edit sources file, site, db; no imports; no outreach.

## broken or empty sources

- columbia entrepreneurship directory — https://startups.columbia.edu/founders — http 200 but ~940b shell; title only, no startup rows (crunchbase-powered; public html empty)
- princeton keller teams/startups — https://kellercenter.princeton.edu/people/teams-startups-filtered — http 403 cloudflare challenge; webfetch 404; alt keller paths also 403
- waterloo startups directory — https://www.waterloostartups.com/directory — http 200 but spa shell; filters only, zero company cards in html/webfetch
- nus edic student start-ups — https://cde.nus.edu.sg/edic/student-start-ups/ — http 200, ~212b empty body; no content
- brown ventures in action — https://entrepreneurship.brown.edu/impact/brown-ventures-action — http 200; intro + “submit your venture” only; no venture cards listed (b-lab 2026 sibling url still ok: states nine ventures)
- umich wolverine entrepreneurs hub — https://entrepreneurs.umich.edu/ — http 200; hivebrite login wall; no public startup list
- u of t venture directory — https://entrepreneurs.utoronto.ca/our-startups/startups-directory/ — http 200; chrome loads but no startup rows in html (nav + submit form only)
- campushunt — https://campushunt.co/ — http 200; provisional/marketing; /discover shows ~8 student projects (hackathon/campus apps), not a real startup portfolio; /startups 404
- cmu swartz (listed hub) — https://www.cmu.edu/swartz-center-for-entrepreneurship/ — http 200 hub only; startups not on this url (airtable “directory link” on page is separate: https://airtable.com/appoCn0JyaYH2Pbab/shrpqgg6AsoRH8JbD?jrprS=allRecords loads)

note: free ventures https://www.freeventures.org/portfolio is js-spa for bare curl but webfetch shows real portfolio (page states 100+ alumni teams) — not flagged broken.

## new candidates

- https://georgiakickstart.com/portfolio — uga / georgia kickstart fund — 115 (page filter “all (115)”; also “more than 110”) — student venture fund portfolio, years 2019–2026
- https://iventure.illinois.edu/startups — uiuc / iventure accelerator — ~117 named startups across cohorts 1–11 + post-iventure (counted on page)
- https://www.usf.edu/research-innovation/innovation-enterprise/usf-connect/student-innovation-incubator/sii-entrepreneurs.aspx — usf sii — ~159 names on alumni/cohort list (counted list items apple grocery→zryne)
- https://innovation.ucsd.edu/startup/startup-database.html — uc san diego — 450+ active startups (stated on page; airtable dashboard)
- https://hillsideventures.uconn.edu/venture-fund-3/portfolio/ — uconn hillside ventures — 20 portfolio entries (counted investment blocks)
- https://www.rit.edu/venturefund/portfolio-companies — rit venture fund — 17 (stated “total investment companies”)
- https://www.colorado.edu/dcvf/portfolio — cu boulder deming center venture fund — 21 current investments (counted) + 2 exits named
- https://cfci.pratt.duke.edu/bridge/ — duke bridge incubator — 13 startups listed under “our startups”
- https://entrepreneurship.duke.edu/startup-showcase-2025-featured-companies/ — duke i&e — 33 featured 2025 student ventures (counted h2 names)
- https://pace.shidler.hawaii.edu/venture-fund/ — uh calvin shindo student venture fund — 2 named (hohonu, reeler); thin but real public portfolio mention

skipped unverified: ustaar.com/companies (search snippets show cohort names but curl/webfetch return empty shell); jhu student ventures (403); create-x portfolio paths 403/404; stanford founders (community, not a startup directory).

## added after check (amy, nov 2 ~2:09 am)
- 37 buildlist map https://buildlist.xyz/map: 200, ~100kb, loads. no startup count taken yet. only use entries with a campus or student link.
- 38 buildlist companies https://buildlist.xyz/companies: 200, ~617kb, loads. no startup count taken yet. only use founders who are current students or alums who graduated 2021 or later.

## scheduled run — nov 2, 9:00 am et

re-curled all 39 urls in campus-import-sources-36.md. liveness same as the 2:13 am check: all 200 except princeton keller (403). columbia 940b, nus edic 212b, free ventures 2655b, waterloo 4.6kb still shells.

new since 2:13 am: campus-import-results-2026-11-02.md (7:34 am) now exists. sources the import marked blocked/empty that the 2:13 am list did not flag:
- 2 superscout /universities — no company roster on free pages
- 4 frv /en/portfolio — featured logo names only, no campus tags (frv /companies 301s to the same page)
- 5 crimson founder files — wix; no company names in public html
- 6 bos network — logo alts only, no campus tags
- 15 yale city venture wall — logo wall, no names
- 16 free ventures — import got empty js shell (2655b); webfetch renders it, curl does not
- 17 e@b companies — next.js client-only, no ssr list
- 18 skydeck — partial: 12 slugs in html, grid js-rendered
- 19 startx community — js shell, ~0 roster rows
- 26 waterloo startups — feed error (velocity used as fallback)
- 29 ubc innovation portfolio — spin-off urls 404
- 30 imperial vcc — no public portfolio roster
- 31 accelerate cambridge — js filter ui, no rows in html/json
- 34 hkust — airtable interface embed, rows not harvested
- 35 hku tec — empty directory body; cpt is partners/labs
- 37/38 buildlist map + companies — no campus/student/grad-year fields, can't apply amy's filter
- also: cmu airtable no extractable records; ucsd startup db airtable blocked; rit venture fund only 9 of 17 rows parseable.

### new candidates (verified 9 am, http 200, names in page)
- https://www.psv.vc/portfolio — princeton student ventures — 33 (14 featured + 19 table rows, founders named). route around keller 403.
- https://business.unl.edu/student-resources/center-entrepreneurship/student-involvement/husker-venture-fund/investment-portfolio/ — nebraska husker venture fund — 26 investments 2021–2026. student-run fund; founders' unl affiliation not stated.
- https://uwaterloo.ca/school-of-accounting-and-finance/students/student-opportunities/student-venture-fund/svf-investments — waterloo student venture fund — 11 named investments (2017–2023) + exits section.
- https://olemisscie.com/programs/rebel-venture-capital-fund/ — ole miss rebel student venture fund — ~29 named; page states 52 funded. many are small lifestyle businesses.
- https://www.startatshea.com/accelerate-shea — boston college accelerate@shea 2026 — 12 student startups.
- https://ventures.uq.edu.au/pitch-night — u of queensland ventures chapter 2 2026 — 10 startups.
- https://entrepreneur.nyu.edu/blog/2026/06/03/meet-the-2026-nyu-summer-launchpad-cohort/ — nyu summer launchpad 2026 — 10 teams with class years (supplement to source 22).
