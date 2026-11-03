# Campus Scout 2026 university venture + people expansion

**Implemented November 3, 2026.** Eight 2026 cohorts/competition source directories were processed in seven idempotent batches (12–18). There are **177 sourced company-roster records** across the seven batches. After rebasing onto the latest `main` campus database, the verified workflow reported **76 newly created unique companies** and **261 newly created people**. Other records were already in the live base database and were linked/deduplicated, not blindly duplicated.

The official Rice Business Plan Competition 2026 PDF includes **42 ventures and 106 named team contacts**, not 106 proven cofounders. The output discards their email addresses. Northwestern and NYU team-member roles also remain `team_member` unless a page specifically establishes founder status. Harvard public venture profiles provide 17 named founder links where explicitly available. Alumni/faculty/competition participation never automatically establishes current enrollment.

## Imported batches

| Batch | Official university source | Sourced company rows |
| --- | --- | ---: |
| 12 | Cornell eLab 2026–27 student cohort | 33 |
| 13 | Northwestern VentureCat 2026 semifinalists | 25 |
| 14 | CMU VentureBridge 2026 cohort | 13 |
| 15 | NYU Entrepreneurs Challenge 2026 team directory | 27 |
| 16 | Georgia Tech CREATE-X / UChicago New Venture Challenge 2026 | 12 |
| 17 | Rice Business Plan Competition 2026 | 42 |
| 18 | Harvard President's Innovation Challenge 2026 | 25 |

Original datasets are in `data/imports/v3-campus-founders-batch12-*.json` through `batch18-*.json`; batch17 is generated from the official Rice PDF by `scripts/ingest/build-rbpc-2026.py`. The GitHub Actions workflow `.github/workflows/campus-2026-import.yml` ran the importer, `PRAGMA integrity_check`, and `npm run test:directory` successfully, then committed the updated canonical `data/campus-universe.db`. The import is idempotent and reports ambiguities rather than fabricating matches.

## Sources and additional directory entries

- Cornell eLab: https://crea.cornell.edu/elab/elab-welcomes-33-student-startups-to-fall-cohort/
- Northwestern VentureCat: https://www.venturecat.northwestern.edu/about/2026-semifinalists-track-winners.html
- NYU Entrepreneurs Challenge: https://nyusternberkleycenter.com/2026-team-directory/
- Harvard Innovation Labs: https://innovationlabs.harvard.edu/articles/announcing-the-2026-harvard-presidents-innovation-challenge-finalists
- CMU VentureBridge: https://www.cmu.edu/swartz-center-for-entrepreneurship/resources-funding-and-talent/venturebridge/venturebridge-2026-cohort-and-fellows-launch.html
- Rice RBPC competition company PDF: https://rbpc.rice.edu/sites/rbpc/files/2026-04/RBPC-2026-Competition-Company-Database.pdf
- UChicago NVC: https://polsky.uchicago.edu/2026/05/21/10-startups-to-compete-for-over-1-million-at-30th-annual-edward-l-kaplan-71-new-venture-challenge-finals/
- Georgia Tech CREATE-X: https://news.gatech.edu/news/2026/08/31/create-x-demo-day-meet-founders-building-whats-next
- Columbia Entrepreneurship startup directory: https://entrepreneurship.columbia.edu/startup-directory/
- Columbia Startup & Investor directory: https://startups.columbia.edu/startups
- NYU featured startups: https://entrepreneur.nyu.edu/featured-nyu-startups/
- Waterloo Startups: https://www.waterloostartups.com/
- Berkeley Startup Cluster: https://berkeleystartupcluster.com/startups/

The source catalogue contains **13 additional entries**, eight with 2026 cohorts imported and five discovery/reference directories only. The latter are not bulk copied: mixed alumni/faculty rosters require person-level verification, and Crunchbase-powered Columbia data must not be republished wholesale. Berkeley Startup Cluster's city-based business list is not proof of UC Berkeley affiliation.

Existing UI layouts, company pages, map, overlays, and design styling were not modified as part of this expansion. Review and monitor student/alumni status and source quality as new cohorts publish.
