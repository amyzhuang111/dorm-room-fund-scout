// Official campus and competition directories discovered 2026-11-03.
// Sources with status 'implemented' have batch imports in data/campus-universe.db;
// unconfigured discovery/reference directories are listed but NOT bulk copied.
import type { SourceCatalogueEntry } from "./source-quality";

export const EXPANDED_CAMPUS_DIRECTORIES: SourceCatalogueEntry[] = [
  {
    "id": "cat_exp_cornell_elab_2026",
    "name": "Cornell eLab — 2026–27 student teams",
    "campus": "univ_cornell",
    "sourceType": "accelerator",
    "url": "https://crea.cornell.edu/elab/elab-welcomes-33-student-startups-to-fall-cohort/",
    "founderScoutTier": "A",
    "startupScoutTier": "A",
    "role": "discovery",
    "dimensions": {
      "campusPurity": "high",
      "earliness": "high",
      "buildEvidence": "medium",
      "selectivity": "medium",
      "novelty": "medium",
      "identityQuality": "medium",
      "extractability": "medium"
    },
    "tierRationale": "2026/official directory: The university names 33 student ventures and 53 founder-to-venture links in its 2026–27 cohort. Ranking reflects sourcing quality, not institutional prestige or founder score.",
    "whyItMatters": "The university names 33 student ventures and 53 founder-to-venture links in its 2026–27 cohort.",
    "whatToExtract": [
      "company or team name",
      "named founder or team-member evidence",
      "school and program affiliation",
      "cohort or graduation year where stated",
      "public product and website links where present"
    ],
    "whatNotToInfer": [
      "Names and class years are verified by Cornell; the roster alone does not verify incorporation, traction, funding, or websites."
    ],
    "status": "implemented",
    "statusNote": "2026 public roster ingested in batch 12 into Campus Scout's SQLite database. Company and people identity are deduplicated against existing records. Team members are not automatically founders or current students.",
    "dbSourceId": "src_v3_crea_cornell_edu"
  },
  {
    "id": "cat_exp_northwestern_venturecat_2026",
    "name": "Northwestern VentureCat — 2026 semifinalists",
    "campus": "univ_northwestern",
    "sourceType": "competition",
    "url": "https://www.venturecat.northwestern.edu/about/2026-semifinalists-track-winners.html",
    "founderScoutTier": "A",
    "startupScoutTier": "A",
    "role": "discovery",
    "dimensions": {
      "campusPurity": "high",
      "earliness": "high",
      "buildEvidence": "medium",
      "selectivity": "medium",
      "novelty": "medium",
      "identityQuality": "medium",
      "extractability": "medium"
    },
    "tierRationale": "2026/official directory: The official 2026 student-startup roster names teams, schools, class years, company descriptions and some company links. Ranking reflects sourcing quality, not institutional prestige or founder score.",
    "whyItMatters": "The official 2026 student-startup roster names teams, schools, class years, company descriptions and some company links.",
    "whatToExtract": [
      "company or team name",
      "named founder or team-member evidence",
      "school and program affiliation",
      "cohort or graduation year where stated",
      "public product and website links where present"
    ],
    "whatNotToInfer": [
      "A named team member is not automatically a cofounder; use the source's exact team role and confirm legal founders independently."
    ],
    "status": "implemented",
    "statusNote": "2026 public roster ingested in batch 13 into Campus Scout's SQLite database. Company and people identity are deduplicated against existing records. Team members are not automatically founders or current students.",
    "dbSourceId": "src_v3_venturecat_northwestern_edu"
  },
  {
    "id": "cat_exp_nyu_entrepreneurs_challenge_2026",
    "name": "NYU Entrepreneurs Challenge — 2026 team directory",
    "campus": "univ_nyu",
    "sourceType": "competition",
    "url": "https://nyusternberkleycenter.com/2026-team-directory/",
    "founderScoutTier": "A",
    "startupScoutTier": "A",
    "role": "discovery",
    "dimensions": {
      "campusPurity": "high",
      "earliness": "high",
      "buildEvidence": "medium",
      "selectivity": "medium",
      "novelty": "medium",
      "identityQuality": "medium",
      "extractability": "medium"
    },
    "tierRationale": "2026/official directory: Official NYU competition directory includes student teams, venture descriptions and founder/class details for many entries. Ranking reflects sourcing quality, not institutional prestige or founder score.",
    "whyItMatters": "Official NYU competition directory includes student teams, venture descriptions and founder/class details for many entries.",
    "whatToExtract": [
      "company or team name",
      "named founder or team-member evidence",
      "school and program affiliation",
      "cohort or graduation year where stated",
      "public product and website links where present"
    ],
    "whatNotToInfer": [
      "Differentiate 2026–28 students from 2010–24 alumni and unaffiliated teammates; do not assign everyone a 2026 NYU student status."
    ],
    "status": "implemented",
    "statusNote": "2026 public roster ingested in batch 15 into Campus Scout's SQLite database. Company and people identity are deduplicated against existing records. Team members are not automatically founders or current students.",
    "dbSourceId": "src_v3_nyusternberkleycenter_com"
  },
  {
    "id": "cat_exp_harvard_pic_2026",
    "name": "Harvard i-lab — 2026 President’s Innovation Challenge",
    "campus": "univ_harvard",
    "sourceType": "competition",
    "url": "https://innovationlabs.harvard.edu/articles/announcing-the-2026-harvard-presidents-innovation-challenge-finalists",
    "founderScoutTier": "B",
    "startupScoutTier": "A",
    "role": "discovery",
    "dimensions": {
      "campusPurity": "medium",
      "earliness": "high",
      "buildEvidence": "medium",
      "selectivity": "medium",
      "novelty": "medium",
      "identityQuality": "medium",
      "extractability": "medium"
    },
    "tierRationale": "2026/official directory: The 2026 finalists announcement explicitly separates student venture tracks from alumni and affiliate tracks. Ranking reflects sourcing quality, not institutional prestige or founder score.",
    "whyItMatters": "The 2026 finalists announcement explicitly separates student venture tracks from alumni and affiliate tracks.",
    "whatToExtract": [
      "company or team name",
      "named founder or team-member evidence",
      "school and program affiliation",
      "cohort or graduation year where stated",
      "public product and website links where present"
    ],
    "whatNotToInfer": [
      "Only student-track ventures should be treated as student cohorts; finalist status is not funding or student-founder proof for each named team member."
    ],
    "status": "implemented",
    "statusNote": "2026 public roster ingested in batch 18 into Campus Scout's SQLite database. Company and people identity are deduplicated against existing records. Team members are not automatically founders or current students.",
    "dbSourceId": "src_v3_innovationlabs_harvard_edu"
  },
  {
    "id": "cat_exp_cmu_venturebridge_2026",
    "name": "CMU VentureBridge — 2026 portfolio and fellows",
    "campus": "univ_cmu",
    "sourceType": "accelerator",
    "url": "https://www.cmu.edu/swartz-center-for-entrepreneurship/resources-funding-and-talent/venturebridge/venturebridge-2026-cohort-and-fellows-launch.html",
    "founderScoutTier": "B",
    "startupScoutTier": "A",
    "role": "discovery",
    "dimensions": {
      "campusPurity": "medium",
      "earliness": "high",
      "buildEvidence": "medium",
      "selectivity": "medium",
      "novelty": "medium",
      "identityQuality": "medium",
      "extractability": "medium"
    },
    "tierRationale": "2026/official directory: CMU identifies research-affiliated teams, alumni-founded ventures and named founders across technical categories. Ranking reflects sourcing quality, not institutional prestige or founder score.",
    "whyItMatters": "CMU identifies research-affiliated teams, alumni-founded ventures and named founders across technical categories.",
    "whatToExtract": [
      "company or team name",
      "named founder or team-member evidence",
      "school and program affiliation",
      "cohort or graduation year where stated",
      "public product and website links where present"
    ],
    "whatNotToInfer": [
      "The 2026 portfolio is mixed faculty, PhD, alumni and fellows; do not call every team a current student venture."
    ],
    "status": "implemented",
    "statusNote": "2026 public roster ingested in batch 14 into Campus Scout's SQLite database. Company and people identity are deduplicated against existing records. Team members are not automatically founders or current students.",
    "dbSourceId": "src_v3_cmu_edu"
  },
  {
    "id": "cat_exp_rice_rbpc_2026",
    "name": "Rice Business Plan Competition — 2026 student startups",
    "campus": null,
    "sourceType": "competition",
    "url": "https://rbpc.rice.edu/2026/2026-startups",
    "founderScoutTier": "B",
    "startupScoutTier": "A",
    "role": "discovery",
    "dimensions": {
      "campusPurity": "low",
      "earliness": "high",
      "buildEvidence": "medium",
      "selectivity": "medium",
      "novelty": "medium",
      "identityQuality": "medium",
      "extractability": "medium"
    },
    "tierRationale": "2026/official directory: The competition names 42 student-led startups and their participating universities across the world. Ranking reflects sourcing quality, not institutional prestige or founder score.",
    "whyItMatters": "The competition names 42 student-led startups and their participating universities across the world.",
    "whatToExtract": [
      "company or team name",
      "named founder or team-member evidence",
      "school and program affiliation",
      "cohort or graduation year where stated",
      "public product and website links where present"
    ],
    "whatNotToInfer": [
      "A Rice-hosted competition does not imply Rice enrollment; use the university stated beside each company and verify individual founders."
    ],
    "status": "implemented",
    "statusNote": "2026 public roster ingested in batch 17 into Campus Scout's SQLite database. Company and people identity are deduplicated against existing records. Team members are not automatically founders or current students.",
    "dbSourceId": "src_v3_rbpc_rice_edu"
  },
  {
    "id": "cat_exp_uchicago_nvc_2026",
    "name": "UChicago Polsky — 2026 New Venture Challenge",
    "campus": "univ_uchicago",
    "sourceType": "competition",
    "url": "https://polsky.uchicago.edu/2026/05/21/10-startups-to-compete-for-over-1-million-at-30th-annual-edward-l-kaplan-71-new-venture-challenge-finals/",
    "founderScoutTier": "B",
    "startupScoutTier": "A",
    "role": "discovery",
    "dimensions": {
      "campusPurity": "medium",
      "earliness": "high",
      "buildEvidence": "medium",
      "selectivity": "medium",
      "novelty": "medium",
      "identityQuality": "medium",
      "extractability": "medium"
    },
    "tierRationale": "2026/official directory: The 2026 NVC finalist article names 10 ventures and their business descriptions. Ranking reflects sourcing quality, not institutional prestige or founder score.",
    "whyItMatters": "The 2026 NVC finalist article names 10 ventures and their business descriptions.",
    "whatToExtract": [
      "company or team name",
      "named founder or team-member evidence",
      "school and program affiliation",
      "cohort or graduation year where stated",
      "public product and website links where present"
    ],
    "whatNotToInfer": [
      "The New Venture Challenge includes student and executive MBA tracks; verify individual student status and financing separately."
    ],
    "status": "implemented",
    "statusNote": "2026 public roster ingested in batch 16 into Campus Scout's SQLite database. Company and people identity are deduplicated against existing records. Team members are not automatically founders or current students.",
    "dbSourceId": "src_v3_polsky_uchicago_edu"
  },
  {
    "id": "cat_exp_gatech_createx_2026",
    "name": "Georgia Tech CREATE-X — 2026 Demo Day",
    "campus": "univ_gatech",
    "sourceType": "accelerator",
    "url": "https://news.gatech.edu/news/2026/08/31/create-x-demo-day-meet-founders-building-whats-next",
    "founderScoutTier": "B",
    "startupScoutTier": "B",
    "role": "discovery",
    "dimensions": {
      "campusPurity": "medium",
      "earliness": "medium",
      "buildEvidence": "medium",
      "selectivity": "medium",
      "novelty": "medium",
      "identityQuality": "medium",
      "extractability": "medium"
    },
    "tierRationale": "2026/official directory: The official news report describes a large 2026 startup showcase and names student-built projects. Ranking reflects sourcing quality, not institutional prestige or founder score.",
    "whyItMatters": "The official news report describes a large 2026 startup showcase and names student-built projects.",
    "whatToExtract": [
      "company or team name",
      "named founder or team-member evidence",
      "school and program affiliation",
      "cohort or graduation year where stated",
      "public product and website links where present"
    ],
    "whatNotToInfer": [
      "CREATE-X also serves faculty and alumni; do not infer that an attendee is a current Georgia Tech student."
    ],
    "status": "implemented",
    "statusNote": "2026 public roster ingested in batch 16 into Campus Scout's SQLite database. Company and people identity are deduplicated against existing records. Team members are not automatically founders or current students.",
    "dbSourceId": "src_v3_news_gatech_edu"
  },
  {
    "id": "cat_exp_columbia_entrepreneurship_directory",
    "name": "Columbia Entrepreneurship — Startup Directory",
    "campus": "univ_columbia",
    "sourceType": "directory",
    "url": "https://entrepreneurship.columbia.edu/startup-directory/",
    "founderScoutTier": "C",
    "startupScoutTier": "B",
    "role": "discovery",
    "dimensions": {
      "campusPurity": "medium",
      "earliness": "medium",
      "buildEvidence": "medium",
      "selectivity": "medium",
      "novelty": "medium",
      "identityQuality": "medium",
      "extractability": "medium"
    },
    "tierRationale": "2026/official directory: Columbia Entrepreneurship maintains a public self-submitted directory of ventures founded by Columbians. Ranking reflects sourcing quality, not institutional prestige or founder score.",
    "whyItMatters": "Columbia Entrepreneurship maintains a public self-submitted directory of ventures founded by Columbians.",
    "whatToExtract": [
      "company or team name",
      "named founder or team-member evidence",
      "school and program affiliation",
      "cohort or graduation year where stated",
      "public product and website links where present"
    ],
    "whatNotToInfer": [
      "Alumni, students and other Columbians can appear; verify enrollment, founders, and source recency per venture."
    ],
    "status": "unconfigured",
    "statusNote": "Public directory verified; self-submissions are lead generation, not independent verification."
  },
  {
    "id": "cat_exp_columbia_startup_investor_directory",
    "name": "Columbia — Startup & Investor Directory",
    "campus": "univ_columbia",
    "sourceType": "portfolio_directory",
    "url": "https://startups.columbia.edu/startups",
    "founderScoutTier": "D",
    "startupScoutTier": "C",
    "role": "reference",
    "dimensions": {
      "campusPurity": "low",
      "earliness": "high",
      "buildEvidence": "medium",
      "selectivity": "medium",
      "novelty": "medium",
      "identityQuality": "medium",
      "extractability": "medium"
    },
    "tierRationale": "2026/official directory: A large Columbia-related venture catalogue is useful for detecting missed names and cross-checking other sources. Ranking reflects sourcing quality, not institutional prestige or founder score.",
    "whyItMatters": "A large Columbia-related venture catalogue is useful for detecting missed names and cross-checking other sources.",
    "whatToExtract": [
      "company or team name",
      "named founder or team-member evidence",
      "school and program affiliation",
      "cohort or graduation year where stated",
      "public product and website links where present"
    ],
    "whatNotToInfer": [
      "The directory is Crunchbase-powered and often alumni-focused; do not bulk reproduce, infer current student status, or assume redistribution rights."
    ],
    "status": "unconfigured",
    "statusNote": "Use for per-record discovery and verification; no bulk import planned."
  },
  {
    "id": "cat_exp_nyu_featured_startups",
    "name": "NYU Entrepreneurship — Featured Startups",
    "campus": "univ_nyu",
    "sourceType": "portfolio_directory",
    "url": "https://entrepreneur.nyu.edu/featured-nyu-startups/",
    "founderScoutTier": "C",
    "startupScoutTier": "B",
    "role": "discovery",
    "dimensions": {
      "campusPurity": "medium",
      "earliness": "high",
      "buildEvidence": "medium",
      "selectivity": "medium",
      "novelty": "medium",
      "identityQuality": "medium",
      "extractability": "medium"
    },
    "tierRationale": "2026/official directory: NYU's living directory includes startups associated with its entrepreneurship programs. Ranking reflects sourcing quality, not institutional prestige or founder score.",
    "whyItMatters": "NYU's living directory includes startups associated with its entrepreneurship programs.",
    "whatToExtract": [
      "company or team name",
      "named founder or team-member evidence",
      "school and program affiliation",
      "cohort or graduation year where stated",
      "public product and website links where present"
    ],
    "whatNotToInfer": [
      "The directory explicitly mixes students, faculty, researchers, alumni and community members; verify precise school relationship."
    ],
    "status": "unconfigured",
    "statusNote": "Official living directory verified; individual program/year filtering recommended."
  },
  {
    "id": "cat_exp_waterloo_startup_directory",
    "name": "Waterloo Startups — alumni and faculty directory",
    "campus": "univ_waterloo",
    "sourceType": "portfolio_directory",
    "url": "https://www.waterloostartups.com/",
    "founderScoutTier": "D",
    "startupScoutTier": "C",
    "role": "reference",
    "dimensions": {
      "campusPurity": "low",
      "earliness": "medium",
      "buildEvidence": "medium",
      "selectivity": "medium",
      "novelty": "medium",
      "identityQuality": "medium",
      "extractability": "medium"
    },
    "tierRationale": "2026/official directory: A searchable listing of Waterloo alumni and faculty startups helps backfill cross-campus entities. Ranking reflects sourcing quality, not institutional prestige or founder score.",
    "whyItMatters": "A searchable listing of Waterloo alumni and faculty startups helps backfill cross-campus entities.",
    "whatToExtract": [
      "company or team name",
      "named founder or team-member evidence",
      "school and program affiliation",
      "cohort or graduation year where stated",
      "public product and website links where present"
    ],
    "whatNotToInfer": [
      "Alumni and faculty entries are not proof of current student founding or current activity; verify at source."
    ],
    "status": "unconfigured",
    "statusNote": "Directory landing page verified, but bulk feed/API access not established."
  },
  {
    "id": "cat_exp_berkeley_startup_cluster",
    "name": "Berkeley Startup Cluster — innovation companies",
    "campus": "univ_berkeley",
    "sourceType": "portfolio_directory",
    "url": "https://berkeleystartupcluster.com/startups/",
    "founderScoutTier": "D",
    "startupScoutTier": "C",
    "role": "reference",
    "dimensions": {
      "campusPurity": "low",
      "earliness": "medium",
      "buildEvidence": "medium",
      "selectivity": "medium",
      "novelty": "medium",
      "identityQuality": "medium",
      "extractability": "medium"
    },
    "tierRationale": "2026/official directory: A city-based innovation-business directory provides corroboration for Berkeley-area companies. Ranking reflects sourcing quality, not institutional prestige or founder score.",
    "whyItMatters": "A city-based innovation-business directory provides corroboration for Berkeley-area companies.",
    "whatToExtract": [
      "company or team name",
      "named founder or team-member evidence",
      "school and program affiliation",
      "cohort or graduation year where stated",
      "public product and website links where present"
    ],
    "whatNotToInfer": [
      "A business based in the city of Berkeley is not necessarily UC Berkeley-founded or student-founded."
    ],
    "status": "unconfigured",
    "statusNote": "Geographic corroboration only; never use location as campus affiliation."
  }
];
