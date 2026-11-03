# Campus Scout: source expansion — 2026-11-03

## What changed

- **33 Cornell eLab 2026–27 student ventures**, **53 team-founder links** (52 unique
  names; Sheng Cui is listed on both ekimul and Fandia), transcribed from
  [Cornell's official roster](https://crea.cornell.edu/elab/elab-welcomes-33-student-startups-to-fall-cohort/)
  into `data/imports/v3-campus-founders-batch12-cornell-2026.json`.
- **13 new source catalogue entries** across ten named campuses plus one
  multi-campus competition, all backed by linked public directories in
  `lib/domain/expanded-campus-directories.ts`.
- Existing source entries for Berkeley SkyDeck, MIT delta v, Penn Startup
  Challenge, and Waterloo Velocity were not duplicated.

## Applying the Cornell ventures to the searchable database

The source catalogue entries are in code, but **the startup records are
staged, not live** until the repository's idempotent importer has run against
`data/campus-universe.db` and the updated DB has been deployed. This change
intentionally does not modify the binary database.

Run from the project root with the DB available and the project dependencies
installed:

```sh
npx tsx scripts/ingest/import-v3-campus-founders.ts data/imports/v3-campus-founders-batch12-cornell-2026.json
npm run test:directory
npm run test:data-audit
npm run build
```

Review the importer's output (`newPeople`, `newCompanies`,
`newAffiliations`, `ambiguous`); do not equate all 33 staged records to 33
new unique DB companies until dedupe has run. Check the data audit before
committing and redeploying the updated DB.

## Provenance and limits

- Official Cornell eLab 2026–27 roster: named companies, students, and
  class years. It does **not** state websites, traction, funding, or
  incorporation, so those fields are left empty rather than invented.
- Company verification is partial, while the founder/team association is
  confirmed by the program roster. For `'27` and later, an expected class
  year indicates current enrollment as of Nov 2026; no current-student
  label is inferred from the `'26` entry for Throttle.
- Cornell names and team associations may overlap with existing records;
  the existing importer resolves companies/persons by name, campus, and
  relevant source instead of blindly duplicating rows.
- Northwestern VentureCat 2026, NYU Entrepreneurs Challenge 2026,
  Harvard President's Innovation Challenge 2026, CMU VentureBridge 2026,
  UChicago NVC 2026, and Georgia Tech CREATE-X 2026 are **source discovery
  entries**, not yet fully ingested founder records. Some programs mix current
  students, graduates, faculty, or alumni; validate each person's role.
- The Rice Business Plan Competition directory lists **42 student-led
  companies from many institutions**. It is a global source, not a claim
  that all of those teams attended Rice.
- The Columbia startup/investor directory is Crunchbase-powered; use it
  for individual-company discovery and corroboration, **not wholesale
  redistribution** of third-party database content.
- Geographic directories such as Berkeley Startup Cluster must never be
  treated as proof of university affiliation.

## Verification sources

- Cornell eLab: https://crea.cornell.edu/elab/elab-welcomes-33-student-startups-to-fall-cohort/
- Northwestern VentureCat: https://www.venturecat.northwestern.edu/about/2026-semifinalists-track-winners.html
- NYU 2026 Entrepreneurs Challenge: https://nyusternberkleycenter.com/2026-team-directory/
- Harvard PIC 2026: https://innovationlabs.harvard.edu/articles/announcing-the-2026-harvard-presidents-innovation-challenge-finalists
- CMU VentureBridge 2026: https://www.cmu.edu/swartz-center-for-entrepreneurship/resources-funding-and-talent/venturebridge/venturebridge-2026-cohort-and-fellows-launch.html
- Rice Business Plan Competition: https://rbpc.rice.edu/2026/2026-startups
- UChicago NVC 2026: https://polsky.uchicago.edu/2026/05/21/10-startups-to-compete-for-over-1-million-at-30th-annual-edward-l-kaplan-71-new-venture-challenge-finals/
- Georgia Tech CREATE-X: https://news.gatech.edu/news/2026/08/31/create-x-demo-day-meet-founders-building-whats-next
- Columbia Entrepreneurship: https://entrepreneurship.columbia.edu/startup-directory/
- Columbia investor/startup directory: https://startups.columbia.edu/startups
- NYU featured startups: https://entrepreneur.nyu.edu/featured-nyu-startups/
- Waterloo: https://www.waterloostartups.com/
- Berkeley Startup Cluster: https://berkeleystartupcluster.com/startups/
