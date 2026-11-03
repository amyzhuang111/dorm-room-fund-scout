// Official 2026 campus founder-sourcing and public discovery expansion.
// "implemented" denotes database-ingested official roster or bounded project
// sample; social tools and directories without per-entity validation remain
// discovery-only. Never infer founders or enrollment from attendance alone.
import type { SourceCatalogueEntry } from "./source-quality";

export const CAMPUS_FOUNDER_SOURCE_EXPANSION: SourceCatalogueEntry[] = [
  {
    "id": "cat_discovery_brown_bl_ab26",
    "name": "Brown B-Lab 2026 venture teams",
    "campus": "univ_brown",
    "sourceType": "accelerator",
    "url": "https://entrepreneurship.brown.edu/build-your-venture/b-lab/2026",
    "founderScoutTier": "A",
    "startupScoutTier": "A",
    "role": "discovery",
    "dimensions": {
      "campusPurity": "medium",
      "earliness": "high",
      "buildEvidence": "medium",
      "selectivity": "medium",
      "novelty": "medium",
      "identityQuality": "high",
      "extractability": "medium"
    },
    "tierRationale": "Brown's official 2026 cohort names 9 ventures and 12 public venture-team members; includes one Toronto and one Columbia person.",
    "whyItMatters": "Brown's official 2026 cohort names 9 ventures and 12 public venture-team members; includes one Toronto and one Columbia person.",
    "whatToExtract": [
      "names of venture teams",
      "named founder or team-member roles",
      "cohort and class year",
      "official company or demo websites",
      "public citations"
    ],
    "whatNotToInfer": [
      "Use the stated school for each person; team member is not equivalent to legal cofounder."
    ],
    "status": "implemented",
    "statusNote": "2026 official venture roster imported via batch 20 on 2026-11-03. Source-linked entities were deduplicated against existing records. Any person labeled team_member is not automatically a confirmed founder.",
    "dbSourceId": "src_v3_entrepreneurship_brown_edu"
  },
  {
    "id": "cat_discovery_brown_venture_prize26",
    "name": "Brown Venture Prize 2026 finalists",
    "campus": "univ_brown",
    "sourceType": "competition",
    "url": "https://entrepreneurship.brown.edu/build-your-venture/brown-venture-prize/2026-brown-venture-prize-finalists-and-judges",
    "founderScoutTier": "A",
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
    "tierRationale": "Official list of eight Brown finalists with named students and external-university teammates.",
    "whyItMatters": "Official list of eight Brown finalists with named students and external-university teammates.",
    "whatToExtract": [
      "names of venture teams",
      "named founder or team-member roles",
      "cohort and class year",
      "official company or demo websites",
      "public citations"
    ],
    "whatNotToInfer": [
      "Prize finalist is not proof of funding or each individual's legal founder title."
    ],
    "status": "implemented",
    "statusNote": "2026 official venture roster imported via batch 24 on 2026-11-03. Source-linked entities were deduplicated against existing records. Any person labeled team_member is not automatically a confirmed founder.",
    "dbSourceId": "src_v3_entrepreneurship_brown_edu"
  },
  {
    "id": "cat_discovery_yale_tsai_fall26",
    "name": "Yale Tsai CITY Fall 2026 VDP ventures",
    "campus": "univ_yale",
    "sourceType": "accelerator",
    "url": "https://city.yale.edu/stories/2026/10/13/big-ideas-bold-ventures-meet-tsai-citys-fall-2026-vdp-cohorts",
    "founderScoutTier": "A",
    "startupScoutTier": "A",
    "role": "discovery",
    "dimensions": {
      "campusPurity": "medium",
      "earliness": "high",
      "buildEvidence": "medium",
      "selectivity": "medium",
      "novelty": "medium",
      "identityQuality": "high",
      "extractability": "medium"
    },
    "tierRationale": "Official fall 2026 Accelerator and Venture Ready roster links named students, class years, ventures and descriptions.",
    "whyItMatters": "Official fall 2026 Accelerator and Venture Ready roster links named students, class years, ventures and descriptions.",
    "whatToExtract": [
      "names of venture teams",
      "named founder or team-member roles",
      "cohort and class year",
      "official company or demo websites",
      "public citations"
    ],
    "whatNotToInfer": [
      "The 98 Launch Pad projects are not all named; project/team participation does not establish incorporation."
    ],
    "status": "implemented",
    "statusNote": "2026 official venture roster imported via batch 22 on 2026-11-03. Source-linked entities were deduplicated against existing records. Any person labeled team_member is not automatically a confirmed founder.",
    "dbSourceId": "src_v3_city_yale_edu"
  },
  {
    "id": "cat_discovery_yale_tsai_spring26",
    "name": "Yale Tsai CITY Spring 2026 Accelerator ventures",
    "campus": "univ_yale",
    "sourceType": "accelerator",
    "url": "https://city.yale.edu/stories/2026/2/20/spring-2026-venture-development-programs-the-builders-shaping-whats-next",
    "founderScoutTier": "A",
    "startupScoutTier": "A",
    "role": "discovery",
    "dimensions": {
      "campusPurity": "medium",
      "earliness": "high",
      "buildEvidence": "medium",
      "selectivity": "medium",
      "novelty": "medium",
      "identityQuality": "high",
      "extractability": "medium"
    },
    "tierRationale": "Spring 2026 named startup cohort, useful to catch builders graduating this year.",
    "whyItMatters": "Spring 2026 named startup cohort, useful to catch builders graduating this year.",
    "whatToExtract": [
      "names of venture teams",
      "named founder or team-member roles",
      "cohort and class year",
      "official company or demo websites",
      "public citations"
    ],
    "whatNotToInfer": [
      "Class years are historical evidence and do not mean current employment or founder status."
    ],
    "status": "unconfigured",
    "statusNote": "Discovery source; not all items have been individually verified or ingested."
  },
  {
    "id": "cat_discovery_duke_showcase_26",
    "name": "Duke Startup Showcase 2026 featured companies",
    "campus": "univ_duke",
    "sourceType": "event",
    "url": "https://entrepreneurship.duke.edu/startup-showcase-2026-featured-companies/",
    "founderScoutTier": "A",
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
    "tierRationale": "35 official named company-plus-student entries with class years and descriptions.",
    "whyItMatters": "35 official named company-plus-student entries with class years and descriptions.",
    "whatToExtract": [
      "names of venture teams",
      "named founder or team-member roles",
      "cohort and class year",
      "official company or demo websites",
      "public citations"
    ],
    "whatNotToInfer": [
      "A featured team representative need not be the sole or legal founder."
    ],
    "status": "implemented",
    "statusNote": "2026 official venture roster imported via batch 23 on 2026-11-03. Source-linked entities were deduplicated against existing records. Any person labeled team_member is not automatically a confirmed founder.",
    "dbSourceId": "src_v3_entrepreneurship_duke_edu"
  },
  {
    "id": "cat_discovery_mit_delta_v_2026",
    "name": "MIT delta v Demo Day 2026",
    "campus": "univ_mit",
    "sourceType": "accelerator",
    "url": "https://entrepreneurship.mit.edu/accelerator/2026-delta-v/",
    "founderScoutTier": "B",
    "startupScoutTier": "A",
    "role": "discovery",
    "dimensions": {
      "campusPurity": "medium",
      "earliness": "high",
      "buildEvidence": "medium",
      "selectivity": "medium",
      "novelty": "medium",
      "identityQuality": "high",
      "extractability": "medium"
    },
    "tierRationale": "Official 2026 Demo Day company descriptions and product websites.",
    "whyItMatters": "Official 2026 Demo Day company descriptions and product websites.",
    "whatToExtract": [
      "names of venture teams",
      "named founder or team-member roles",
      "cohort and class year",
      "official company or demo websites",
      "public citations"
    ],
    "whatNotToInfer": [
      "MIT delta v includes some non-MIT participants; do not assume student school or invent missing founder names."
    ],
    "status": "implemented",
    "statusNote": "2026 official venture roster imported via batch 21 on 2026-11-03. Source-linked entities were deduplicated against existing records. Any person labeled team_member is not automatically a confirmed founder.",
    "dbSourceId": "src_v3_entrepreneurship_mit_edu"
  },
  {
    "id": "cat_discovery_mit_sandbox_zenith",
    "name": "MIT Sandbox Zenith funded team directory",
    "campus": "univ_mit",
    "sourceType": "portfolio_directory",
    "url": "https://sandbox.mit.edu/sandbox-zenith-teams",
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
    "tierRationale": "Long chronological directory of active and 2026 student venture projects with value propositions.",
    "whyItMatters": "Long chronological directory of active and 2026 student venture projects with value propositions.",
    "whatToExtract": [
      "names of venture teams",
      "named founder or team-member roles",
      "cohort and class year",
      "official company or demo websites",
      "public citations"
    ],
    "whatNotToInfer": [
      "Funding is an MIT Sandbox grant, not equity financing; the page generally omits named people and incorporation."
    ],
    "status": "unconfigured",
    "statusNote": "Discovery source; not all items have been individually verified or ingested."
  },
  {
    "id": "cat_discovery_mit_sandbox_program",
    "name": "MIT Sandbox student venture program",
    "campus": "univ_mit",
    "sourceType": "accelerator",
    "url": "https://sandbox.mit.edu/",
    "founderScoutTier": "B",
    "startupScoutTier": "B",
    "role": "discovery",
    "dimensions": {
      "campusPurity": "medium",
      "earliness": "high",
      "buildEvidence": "medium",
      "selectivity": "medium",
      "novelty": "medium",
      "identityQuality": "high",
      "extractability": "medium"
    },
    "tierRationale": "Student entrepreneurship and grant program with hundreds of active teams.",
    "whyItMatters": "Student entrepreneurship and grant program with hundreds of active teams.",
    "whatToExtract": [
      "names of venture teams",
      "named founder or team-member roles",
      "cohort and class year",
      "official company or demo websites",
      "public citations"
    ],
    "whatNotToInfer": [
      "A grant or team listing is not proof of an incorporated startup or verified founder identity."
    ],
    "status": "unconfigured",
    "statusNote": "Discovery source; not all items have been individually verified or ingested."
  },
  {
    "id": "cat_discovery_mit_100k_launch26",
    "name": "MIT $100K 2026 Launch finalists",
    "campus": "univ_mit",
    "sourceType": "competition",
    "url": "https://www.mit100k.org/launch2022-copy",
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
    "tierRationale": "Public 2026 finalist company names; MIT Sloan names Uplift Microhome cofounders and schools.",
    "whyItMatters": "Public 2026 finalist company names; MIT Sloan names Uplift Microhome cofounders and schools.",
    "whatToExtract": [
      "names of venture teams",
      "named founder or team-member roles",
      "cohort and class year",
      "official company or demo websites",
      "public citations"
    ],
    "whatNotToInfer": [
      "The competition is open to Greater Boston teams, including Harvard students; verify each school."
    ],
    "status": "implemented",
    "statusNote": "2026 official venture roster imported via batch 25 on 2026-11-03. Source-linked entities were deduplicated against existing records. Any person labeled team_member is not automatically a confirmed founder.",
    "dbSourceId": "src_v3_mit100k_org"
  },
  {
    "id": "cat_discovery_mit_100k_accelerate26",
    "name": "MIT $100K 2026 Accelerate finalists",
    "campus": "univ_mit",
    "sourceType": "competition",
    "url": "https://www.mit100k.org/accelerate",
    "founderScoutTier": "B",
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
    "tierRationale": "2026 finalist and award roster including early-stage teams.",
    "whyItMatters": "2026 finalist and award roster including early-stage teams.",
    "whatToExtract": [
      "names of venture teams",
      "named founder or team-member roles",
      "cohort and class year",
      "official company or demo websites",
      "public citations"
    ],
    "whatNotToInfer": [
      "Competition listing alone does not establish founder names or current MIT enrollment."
    ],
    "status": "unconfigured",
    "statusNote": "Discovery source; not all items have been individually verified or ingested."
  },
  {
    "id": "cat_discovery_stanford_bases_challenge",
    "name": "Stanford BASES $150K Challenge",
    "campus": "univ_stanford",
    "sourceType": "competition",
    "url": "https://bases.stanford.edu/challenge",
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
    "tierRationale": "University challenge with more than 250 competing companies and non-dilutive prizes.",
    "whyItMatters": "University challenge with more than 250 competing companies and non-dilutive prizes.",
    "whatToExtract": [
      "names of venture teams",
      "named founder or team-member roles",
      "cohort and class year",
      "official company or demo websites",
      "public citations"
    ],
    "whatNotToInfer": [
      "Competition explicitly draws teams from other schools; do not assign all ventures to Stanford."
    ],
    "status": "unconfigured",
    "statusNote": "Discovery source; not all items have been individually verified or ingested."
  },
  {
    "id": "cat_discovery_stanford_venture_studio26",
    "name": "Stanford GSB Venture Studio Demo Day 2026",
    "campus": "univ_stanford",
    "sourceType": "event",
    "url": "https://www.gsb.stanford.edu/experience/about/centers-institutes/ghces/celebration/stanford-venture-studio-demo-day-showcases",
    "founderScoutTier": "A",
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
    "tierRationale": "Official GSB story names 2026 startup teams, founder biographies and venture descriptions.",
    "whyItMatters": "Official GSB story names 2026 startup teams, founder biographies and venture descriptions.",
    "whatToExtract": [
      "names of venture teams",
      "named founder or team-member roles",
      "cohort and class year",
      "official company or demo websites",
      "public citations"
    ],
    "whatNotToInfer": [
      "The story mixes solo creators and teams and is not a comprehensive class roster."
    ],
    "status": "unconfigured",
    "statusNote": "Discovery source; not all items have been individually verified or ingested."
  },
  {
    "id": "cat_discovery_stanford_threshold26",
    "name": "Stanford Threshold Ventures Fellows 2026 roster",
    "campus": "univ_stanford",
    "sourceType": "accelerator",
    "url": "https://stvp.stanford.edu/threshold-ventures-fellows-program-alumni",
    "founderScoutTier": "A",
    "startupScoutTier": "C",
    "role": "discovery",
    "dimensions": {
      "campusPurity": "medium",
      "earliness": "high",
      "buildEvidence": "medium",
      "selectivity": "medium",
      "novelty": "medium",
      "identityQuality": "high",
      "extractability": "medium"
    },
    "tierRationale": "Named 2026 technology and venture fellows; useful founder-potential leads before incorporation.",
    "whyItMatters": "Named 2026 technology and venture fellows; useful founder-potential leads before incorporation.",
    "whatToExtract": [
      "names of venture teams",
      "named founder or team-member roles",
      "cohort and class year",
      "official company or demo websites",
      "public citations"
    ],
    "whatNotToInfer": [
      "A fellowship means neither a current company nor founding status."
    ],
    "status": "unconfigured",
    "statusNote": "Discovery source; not all items have been individually verified or ingested."
  },
  {
    "id": "cat_discovery_ucdavis_bigbang26",
    "name": "UC Davis Big Bang 2026 competition winners",
    "campus": "univ_ucdavis",
    "sourceType": "competition",
    "url": "https://innovate.ucdavis.edu/2026-big-bang-winners",
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
    "tierRationale": "Official 2026 winner and finalist teams, project descriptions and university affiliations.",
    "whyItMatters": "Official 2026 winner and finalist teams, project descriptions and university affiliations.",
    "whatToExtract": [
      "names of venture teams",
      "named founder or team-member roles",
      "cohort and class year",
      "official company or demo websites",
      "public citations"
    ],
    "whatNotToInfer": [
      "The event includes teams from multiple universities; verify the school of individual participants."
    ],
    "status": "unconfigured",
    "statusNote": "Discovery source; not all items have been individually verified or ingested."
  },
  {
    "id": "cat_discovery_princeton_elab26",
    "name": "Princeton eLab Summer Accelerator",
    "campus": "univ_princeton",
    "sourceType": "accelerator",
    "url": "https://kellercenter.princeton.edu/programs/elab-accelerator-incubator-programs/details/elab-summer-accelerator",
    "founderScoutTier": "A",
    "startupScoutTier": "A",
    "role": "discovery",
    "dimensions": {
      "campusPurity": "medium",
      "earliness": "high",
      "buildEvidence": "medium",
      "selectivity": "medium",
      "novelty": "medium",
      "identityQuality": "high",
      "extractability": "medium"
    },
    "tierRationale": "Current Princeton student accelerator with source-linked cohort and demo-day story archive.",
    "whyItMatters": "Current Princeton student accelerator with source-linked cohort and demo-day story archive.",
    "whatToExtract": [
      "names of venture teams",
      "named founder or team-member roles",
      "cohort and class year",
      "official company or demo websites",
      "public citations"
    ],
    "whatNotToInfer": [
      "Program listing is not a full 2026 team roster; verify named teams per story."
    ],
    "status": "unconfigured",
    "statusNote": "Discovery source; not all items have been individually verified or ingested."
  },
  {
    "id": "cat_discovery_illinois_iventure12",
    "name": "Illinois iVenture 2026 Cohort 12",
    "campus": "univ_uiuc",
    "sourceType": "accelerator",
    "url": "https://giesbusiness.illinois.edu/news/2026/06/24/iventure-cohort-12-building-the-future-with-artificial-intelligence",
    "founderScoutTier": "B",
    "startupScoutTier": "A",
    "role": "discovery",
    "dimensions": {
      "campusPurity": "medium",
      "earliness": "high",
      "buildEvidence": "medium",
      "selectivity": "medium",
      "novelty": "medium",
      "identityQuality": "high",
      "extractability": "medium"
    },
    "tierRationale": "15 official 2026 venture teams: 13 current student and two alumni companies.",
    "whyItMatters": "15 official 2026 venture teams: 13 current student and two alumni companies.",
    "whatToExtract": [
      "names of venture teams",
      "named founder or team-member roles",
      "cohort and class year",
      "official company or demo websites",
      "public citations"
    ],
    "whatNotToInfer": [
      "Do not reclassify alumni companies as current students; the article does not name every founder."
    ],
    "status": "unconfigured",
    "statusNote": "Discovery source; not all items have been individually verified or ingested."
  },
  {
    "id": "cat_discovery_ucla_summer_accelerator",
    "name": "Startup UCLA Summer Accelerator",
    "campus": "univ_ucla",
    "sourceType": "accelerator",
    "url": "https://crowdfunding.ucla.edu/project/50242",
    "founderScoutTier": "B",
    "startupScoutTier": "B",
    "role": "discovery",
    "dimensions": {
      "campusPurity": "medium",
      "earliness": "high",
      "buildEvidence": "medium",
      "selectivity": "medium",
      "novelty": "medium",
      "identityQuality": "high",
      "extractability": "medium"
    },
    "tierRationale": "Student/alumni venture accelerator and demo day in 2026.",
    "whyItMatters": "Student/alumni venture accelerator and demo day in 2026.",
    "whatToExtract": [
      "names of venture teams",
      "named founder or team-member roles",
      "cohort and class year",
      "official company or demo websites",
      "public citations"
    ],
    "whatNotToInfer": [
      "Campus program includes alumni; verify current student status independently."
    ],
    "status": "unconfigured",
    "statusNote": "Discovery source; not all items have been individually verified or ingested."
  },
  {
    "id": "cat_discovery_columbia_almaworks",
    "name": "Columbia CORE Almaworks Accelerator",
    "campus": "univ_columbia",
    "sourceType": "accelerator",
    "url": "https://innovationresources.columbia.edu/content/almaworks",
    "founderScoutTier": "B",
    "startupScoutTier": "B",
    "role": "discovery",
    "dimensions": {
      "campusPurity": "medium",
      "earliness": "high",
      "buildEvidence": "medium",
      "selectivity": "medium",
      "novelty": "medium",
      "identityQuality": "high",
      "extractability": "medium"
    },
    "tierRationale": "Student-affiliated accelerator and fellowship with dozens of graduated ventures.",
    "whyItMatters": "Student-affiliated accelerator and fellowship with dozens of graduated ventures.",
    "whatToExtract": [
      "names of venture teams",
      "named founder or team-member roles",
      "cohort and class year",
      "official company or demo websites",
      "public citations"
    ],
    "whatNotToInfer": [
      "Almaworks includes alumni and students from NYC; program affiliation is not current Columbia enrollment."
    ],
    "status": "unconfigured",
    "statusNote": "Discovery source; not all items have been individually verified or ingested."
  },
  {
    "id": "cat_discovery_columbia_student_resources",
    "name": "Columbia student entrepreneurship opportunity directory",
    "campus": "univ_columbia",
    "sourceType": "directory",
    "url": "https://innovationresources.columbia.edu/columbia-student",
    "founderScoutTier": "C",
    "startupScoutTier": "C",
    "role": "corroboration",
    "dimensions": {
      "campusPurity": "medium",
      "earliness": "high",
      "buildEvidence": "medium",
      "selectivity": "medium",
      "novelty": "medium",
      "identityQuality": "medium",
      "extractability": "medium"
    },
    "tierRationale": "Directory of 57 university resources and programs for finding additional founder cohorts.",
    "whyItMatters": "Directory of 57 university resources and programs for finding additional founder cohorts.",
    "whatToExtract": [
      "names of venture teams",
      "named founder or team-member roles",
      "cohort and class year",
      "official company or demo websites",
      "public citations"
    ],
    "whatNotToInfer": [
      "Programs are leads; membership is not verification of a startup or its founders."
    ],
    "status": "unconfigured",
    "statusNote": "Discovery source; not all items have been individually verified or ingested."
  },
  {
    "id": "cat_discovery_treehacks26_winners",
    "name": "TreeHacks 2026 prize-winning Devpost builds",
    "campus": "univ_stanford",
    "sourceType": "hackathon",
    "url": "https://treehacks-2026.devpost.com/project-gallery",
    "founderScoutTier": "S",
    "startupScoutTier": "B",
    "role": "discovery",
    "dimensions": {
      "campusPurity": "low",
      "earliness": "high",
      "buildEvidence": "high",
      "selectivity": "medium",
      "novelty": "medium",
      "identityQuality": "medium",
      "extractability": "high"
    },
    "tierRationale": "Real 2026 shipped projects with team-member Devpost pages, in addition to the existing TreeHacks scan.",
    "whyItMatters": "Real 2026 shipped projects with team-member Devpost pages, in addition to the existing TreeHacks scan.",
    "whatToExtract": [
      "project name and detail URL",
      "team member Devpost profiles",
      "public demos and GitHub repos",
      "prize evidence (not a score)"
    ],
    "whatNotToInfer": [
      "TreeHacks draws students globally; no individual school is confirmed from participation; hacks are projects, not companies."
    ],
    "status": "implemented",
    "statusNote": "2026 Devpost gallery: a bounded 24-project sample was imported on 2026-11-03. Hackathon builds are projects, not confirmed companies; host-school affiliation is unverified.",
    "dbSourceId": "src_treehacks26_winners"
  },
  {
    "id": "cat_discovery_calhacks13_devpost",
    "name": "Cal Hacks 13.0 (2026) projects",
    "campus": "univ_berkeley",
    "sourceType": "hackathon",
    "url": "https://cal-hacks-13-0.devpost.com/project-gallery",
    "founderScoutTier": "A",
    "startupScoutTier": "B",
    "role": "discovery",
    "dimensions": {
      "campusPurity": "low",
      "earliness": "high",
      "buildEvidence": "high",
      "selectivity": "medium",
      "novelty": "medium",
      "identityQuality": "medium",
      "extractability": "high"
    },
    "tierRationale": "2026 hackathon with 652 projects, galleries and named build teams.",
    "whyItMatters": "2026 hackathon with 652 projects, galleries and named build teams.",
    "whatToExtract": [
      "project name and detail URL",
      "team member Devpost profiles",
      "public demos and GitHub repos",
      "prize evidence (not a score)"
    ],
    "whatNotToInfer": [
      "The Berkeley-hosted event includes non-Berkeley hackers, and a hackathon build is not automatically a startup."
    ],
    "status": "implemented",
    "statusNote": "2026 Devpost gallery: a bounded 24-project sample was imported on 2026-11-03. Hackathon builds are projects, not confirmed companies; host-school affiliation is unverified.",
    "dbSourceId": "src_calhacks13_devpost"
  },
  {
    "id": "cat_discovery_hackprinceton_spring26",
    "name": "HackPrinceton Spring 2026 projects",
    "campus": "univ_princeton",
    "sourceType": "hackathon",
    "url": "https://hackprinceton-spring-26.devpost.com/project-gallery",
    "founderScoutTier": "A",
    "startupScoutTier": "B",
    "role": "discovery",
    "dimensions": {
      "campusPurity": "low",
      "earliness": "high",
      "buildEvidence": "high",
      "selectivity": "medium",
      "novelty": "medium",
      "identityQuality": "medium",
      "extractability": "high"
    },
    "tierRationale": "131 public 2026 projects with team links, winners and demonstrations.",
    "whyItMatters": "131 public 2026 projects with team links, winners and demonstrations.",
    "whatToExtract": [
      "project name and detail URL",
      "team member Devpost profiles",
      "public demos and GitHub repos",
      "prize evidence (not a score)"
    ],
    "whatNotToInfer": [
      "Attending Princeton's hackathon does not prove Princeton enrollment."
    ],
    "status": "implemented",
    "statusNote": "2026 Devpost gallery: a bounded 24-project sample was imported on 2026-11-03. Hackathon builds are projects, not confirmed companies; host-school affiliation is unverified. The public cards in this sample did not expose named people; 0 new people.",
    "dbSourceId": "src_hackprinceton_spring26"
  },
  {
    "id": "cat_discovery_hackharvard26",
    "name": "HackHarvard 2026 projects",
    "campus": "univ_harvard",
    "sourceType": "hackathon",
    "url": "https://hackharvard2026.devpost.com/project-gallery",
    "founderScoutTier": "A",
    "startupScoutTier": "B",
    "role": "discovery",
    "dimensions": {
      "campusPurity": "low",
      "earliness": "high",
      "buildEvidence": "high",
      "selectivity": "medium",
      "novelty": "medium",
      "identityQuality": "medium",
      "extractability": "high"
    },
    "tierRationale": "88 public 2026 projects with team links and product demos.",
    "whyItMatters": "88 public 2026 projects with team links and product demos.",
    "whatToExtract": [
      "project name and detail URL",
      "team member Devpost profiles",
      "public demos and GitHub repos",
      "prize evidence (not a score)"
    ],
    "whatNotToInfer": [
      "Attending Harvard's hackathon does not prove Harvard enrollment."
    ],
    "status": "implemented",
    "statusNote": "2026 Devpost gallery: a bounded 24-project sample was imported on 2026-11-03. Hackathon builds are projects, not confirmed companies; host-school affiliation is unverified.",
    "dbSourceId": "src_hackharvard26_devpost"
  },
  {
    "id": "cat_discovery_hackillinois26",
    "name": "HackIllinois 2026 projects",
    "campus": "univ_uiuc",
    "sourceType": "hackathon",
    "url": "https://hackillinois-2026.devpost.com/project-gallery",
    "founderScoutTier": "A",
    "startupScoutTier": "B",
    "role": "discovery",
    "dimensions": {
      "campusPurity": "low",
      "earliness": "high",
      "buildEvidence": "high",
      "selectivity": "medium",
      "novelty": "medium",
      "identityQuality": "medium",
      "extractability": "high"
    },
    "tierRationale": "Recent UIUC hackathon builds and teams, including hardware and AI.",
    "whyItMatters": "Recent UIUC hackathon builds and teams, including hardware and AI.",
    "whatToExtract": [
      "project name and detail URL",
      "team member Devpost profiles",
      "public demos and GitHub repos",
      "prize evidence (not a score)"
    ],
    "whatNotToInfer": [
      "A prize-winning build is not evidence of current UIUC student status or incorporated business."
    ],
    "status": "implemented",
    "statusNote": "2026 Devpost gallery: a bounded 24-project sample was imported on 2026-11-03. Hackathon builds are projects, not confirmed companies; host-school affiliation is unverified.",
    "dbSourceId": "src_hackillinois26_devpost"
  },
  {
    "id": "cat_discovery_twitter_x_builder_search",
    "name": "X / Twitter build-in-public startup discovery",
    "campus": null,
    "sourceType": "directory",
    "url": "https://x.com/search",
    "founderScoutTier": "B",
    "startupScoutTier": "C",
    "role": "corroboration",
    "dimensions": {
      "campusPurity": "low",
      "earliness": "high",
      "buildEvidence": "medium",
      "selectivity": "medium",
      "novelty": "medium",
      "identityQuality": "medium",
      "extractability": "medium"
    },
    "tierRationale": "Original public founder posts can reveal stealth projects, demos, cofounder requests, and product launches before accelerators.",
    "whyItMatters": "Original public founder posts can reveal stealth projects, demos, cofounder requests, and product launches before accelerators.",
    "whatToExtract": [
      "names of venture teams",
      "named founder or team-member roles",
      "cohort and class year",
      "official company or demo websites",
      "public citations"
    ],
    "whatNotToInfer": [
      "Search and indexing are incomplete; do not infer a school or company from a bio alone or use engagement as Founder Signal."
    ],
    "status": "unconfigured",
    "statusNote": "Discovery source; not all items have been individually verified or ingested."
  },
  {
    "id": "cat_discovery_github_trending_builders",
    "name": "GitHub Trending and project creators",
    "campus": null,
    "sourceType": "code_host",
    "url": "https://github.com/trending",
    "founderScoutTier": "B",
    "startupScoutTier": "C",
    "role": "corroboration",
    "dimensions": {
      "campusPurity": "low",
      "earliness": "high",
      "buildEvidence": "medium",
      "selectivity": "medium",
      "novelty": "medium",
      "identityQuality": "medium",
      "extractability": "medium"
    },
    "tierRationale": "Discover new open-source builders and shipped repos, then trace public team identities.",
    "whyItMatters": "Discover new open-source builders and shipped repos, then trace public team identities.",
    "whatToExtract": [
      "names of venture teams",
      "named founder or team-member roles",
      "cohort and class year",
      "official company or demo websites",
      "public citations"
    ],
    "whatNotToInfer": [
      "Trending projects are not proof of student status or that maintainers founded a company."
    ],
    "status": "unconfigured",
    "statusNote": "Discovery source; not all items have been individually verified or ingested."
  },
  {
    "id": "cat_discovery_product_hunt_launches",
    "name": "Product Hunt recent launches",
    "campus": null,
    "sourceType": "directory",
    "url": "https://www.producthunt.com/",
    "founderScoutTier": "C",
    "startupScoutTier": "B",
    "role": "corroboration",
    "dimensions": {
      "campusPurity": "low",
      "earliness": "high",
      "buildEvidence": "medium",
      "selectivity": "medium",
      "novelty": "medium",
      "identityQuality": "medium",
      "extractability": "medium"
    },
    "tierRationale": "Discover products and their makers for cross-checking student founder leads.",
    "whyItMatters": "Discover products and their makers for cross-checking student founder leads.",
    "whatToExtract": [
      "names of venture teams",
      "named founder or team-member roles",
      "cohort and class year",
      "official company or demo websites",
      "public citations"
    ],
    "whatNotToInfer": [
      "Maker attribution and school affiliation require official corroboration; do not treat launch upvotes as founder scores."
    ],
    "status": "unconfigured",
    "statusNote": "Discovery source; not all items have been individually verified or ingested."
  },
  {
    "id": "cat_discovery_indie_hackers_founders",
    "name": "Indie Hackers founder projects",
    "campus": null,
    "sourceType": "directory",
    "url": "https://www.indiehackers.com/",
    "founderScoutTier": "C",
    "startupScoutTier": "B",
    "role": "corroboration",
    "dimensions": {
      "campusPurity": "low",
      "earliness": "high",
      "buildEvidence": "medium",
      "selectivity": "medium",
      "novelty": "medium",
      "identityQuality": "medium",
      "extractability": "medium"
    },
    "tierRationale": "Builder discussion and startup launch posts for early discovery.",
    "whyItMatters": "Builder discussion and startup launch posts for early discovery.",
    "whatToExtract": [
      "names of venture teams",
      "named founder or team-member roles",
      "cohort and class year",
      "official company or demo websites",
      "public citations"
    ],
    "whatNotToInfer": [
      "Some content requires login or is blocked to automated readers; no school can be inferred from an alias."
    ],
    "status": "unconfigured",
    "statusNote": "Discovery source; not all items have been individually verified or ingested."
  }
];
