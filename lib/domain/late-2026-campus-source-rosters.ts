// 2026 public university startup sources. "implemented" entries have
// verified source records in data/campus-universe.db; discovery entries do not.
import type { SourceCatalogueEntry } from "./source-quality";

export const LATE_2026_CAMPUS_SOURCE_ROSTERS: SourceCatalogueEntry[] = [
  {
    "id": "cat_new_hbs_rock2026",
    "name": "HBS Rock Venture Catalyst — 2026 founder roster",
    "campus": "univ_harvard",
    "sourceType": "accelerator",
    "url": "https://www.hbs.edu/news/releases/2026-rock-venture-catalyst",
    "founderScoutTier": "A",
    "startupScoutTier": "A",
    "role": "discovery",
    "dimensions": {
      "campusPurity": "high",
      "earliness": "high",
      "buildEvidence": "medium",
      "selectivity": "medium",
      "novelty": "medium",
      "identityQuality": "high",
      "extractability": "high"
    },
    "tierRationale": "Harvard Business School explicitly names 61 MBA 2027 founders across 51 venture teams.",
    "whyItMatters": "Harvard Business School explicitly names 61 MBA 2027 founders across 51 venture teams.",
    "whatToExtract": [
      "venture and team name",
      "explicitly named founder or team roles",
      "graduation year when stated",
      "website / public product evidence",
      "dated program cohort and university"
    ],
    "whatNotToInfer": [
      "Exact Founder/Co-Founder titles and MBA graduation years; cohort funding is non-dilutive program support, not a VC round."
    ],
    "status": "implemented",
    "statusNote": "Imported in official-source batch26 and deduplicated in campus-universe.db on 2026-11-03. Named founders, alumni and team members retain their evidenced roles.",
    "dbSourceId": "src_v3_hbs_edu"
  },
  {
    "id": "cat_new_hae_2026",
    "name": "Harvard Alumni Entrepreneurs — 2026 Accelerator",
    "campus": "univ_harvard",
    "sourceType": "accelerator",
    "url": "https://www.harvardae.org/news/2026/announcing-the-2026-accelerator-cohort",
    "founderScoutTier": "B",
    "startupScoutTier": "B",
    "role": "discovery",
    "dimensions": {
      "campusPurity": "high",
      "earliness": "high",
      "buildEvidence": "medium",
      "selectivity": "medium",
      "novelty": "medium",
      "identityQuality": "high",
      "extractability": "high"
    },
    "tierRationale": "Publicly names 12 Harvard alumni accelerator founders and their companies.",
    "whyItMatters": "Publicly names 12 Harvard alumni accelerator founders and their companies.",
    "whatToExtract": [
      "venture and team name",
      "explicitly named founder or team roles",
      "graduation year when stated",
      "website / public product evidence",
      "dated program cohort and university"
    ],
    "whatNotToInfer": [
      "These are alumni founders, not a current Harvard student roster; no exact graduation years."
    ],
    "status": "implemented",
    "statusNote": "Imported in official-source batch29 and deduplicated in campus-universe.db on 2026-11-03. Named founders, alumni and team members retain their evidenced roles.",
    "dbSourceId": "src_v3_harvardae_org"
  },
  {
    "id": "cat_new_ucdavis_littlebang_2026",
    "name": "UC Davis Little Bang 2026 — award teams",
    "campus": "univ_ucdavis",
    "sourceType": "competition",
    "url": "https://innovate.ucdavis.edu/little-bang-2026-winners",
    "founderScoutTier": "B",
    "startupScoutTier": "B",
    "role": "discovery",
    "dimensions": {
      "campusPurity": "high",
      "earliness": "high",
      "buildEvidence": "medium",
      "selectivity": "medium",
      "novelty": "medium",
      "identityQuality": "high",
      "extractability": "high"
    },
    "tierRationale": "UC Davis 2026 pitch competition publishes eight projects and individual named team participants.",
    "whyItMatters": "UC Davis 2026 pitch competition publishes eight projects and individual named team participants.",
    "whatToExtract": [
      "venture and team name",
      "explicitly named founder or team roles",
      "graduation year when stated",
      "website / public product evidence",
      "dated program cohort and university"
    ],
    "whatNotToInfer": [
      "Project pitch and student venture participation do not prove incorporation or an individual's founder title."
    ],
    "status": "implemented",
    "statusNote": "Imported in official-source batch31 and deduplicated in campus-universe.db on 2026-11-03. Named founders, alumni and team members retain their evidenced roles.",
    "dbSourceId": "src_v3_innovate_ucdavis_edu"
  },
  {
    "id": "cat_new_ucla_draper_2026",
    "name": "UCLA Anderson Draper Innovation Showcase — 2026 top ten",
    "campus": "univ_ucla",
    "sourceType": "event",
    "url": "https://www.anderson.ucla.edu/about/centers/price-center-for-entrepreneurship-and-innovation/anderson-venture-accelerator/our-companies",
    "founderScoutTier": "C",
    "startupScoutTier": "B",
    "role": "discovery",
    "dimensions": {
      "campusPurity": "high",
      "earliness": "high",
      "buildEvidence": "medium",
      "selectivity": "medium",
      "novelty": "medium",
      "identityQuality": "high",
      "extractability": "high"
    },
    "tierRationale": "Official accelerator lists ten 2026 presenting companies.",
    "whyItMatters": "Official accelerator lists ten 2026 presenting companies.",
    "whatToExtract": [
      "venture and team name",
      "explicitly named founder or team roles",
      "graduation year when stated",
      "website / public product evidence",
      "dated program cohort and university"
    ],
    "whatNotToInfer": [
      "It includes alumni and cross-campus startups; founder names, enrollment and funding must be checked separately."
    ],
    "status": "implemented",
    "statusNote": "Imported in official-source batch32 and deduplicated in campus-universe.db on 2026-11-03. Named founders, alumni and team members retain their evidenced roles.",
    "dbSourceId": "src_v3_anderson_ucla_edu"
  },
  {
    "id": "cat_new_dartmouth_magnuson_2026",
    "name": "Dartmouth Magnuson 2026 Startup Competition finalists",
    "campus": "univ_dartmouth",
    "sourceType": "competition",
    "url": "https://luma.com/awwuqnaj",
    "founderScoutTier": "B",
    "startupScoutTier": "B",
    "role": "discovery",
    "dimensions": {
      "campusPurity": "high",
      "earliness": "high",
      "buildEvidence": "medium",
      "selectivity": "medium",
      "novelty": "medium",
      "identityQuality": "high",
      "extractability": "high"
    },
    "tierRationale": "Organized Dartmouth Magnuson student startup pitch event names ten 2026 venture finalists.",
    "whyItMatters": "Organized Dartmouth Magnuson student startup pitch event names ten 2026 venture finalists.",
    "whatToExtract": [
      "venture and team name",
      "explicitly named founder or team roles",
      "graduation year when stated",
      "website / public product evidence",
      "dated program cohort and university"
    ],
    "whatNotToInfer": [
      "No founders or schools for individual participants printed on this event page; venue is not enrollment."
    ],
    "status": "implemented",
    "statusNote": "Imported in official-source batch32 and deduplicated in campus-universe.db on 2026-11-03. Named founders, alumni and team members retain their evidenced roles.",
    "dbSourceId": "src_v3_luma_com"
  },
  {
    "id": "cat_new_ucla_anderson_accel",
    "name": "UCLA Anderson Venture Accelerator",
    "campus": "univ_ucla",
    "sourceType": "accelerator",
    "url": "https://www.anderson.ucla.edu/about/centers/price-center-for-entrepreneurship-and-innovation/anderson-venture-accelerator",
    "founderScoutTier": "B",
    "startupScoutTier": "A",
    "role": "discovery",
    "dimensions": {
      "campusPurity": "high",
      "earliness": "high",
      "buildEvidence": "medium",
      "selectivity": "medium",
      "novelty": "medium",
      "identityQuality": "high",
      "extractability": "medium"
    },
    "tierRationale": "Multi-cohort portfolio and active accelerators including 2026 Draper Innovation Showcase.",
    "whyItMatters": "Multi-cohort portfolio and active accelerators including 2026 Draper Innovation Showcase.",
    "whatToExtract": [
      "venture and team name",
      "explicitly named founder or team roles",
      "graduation year when stated",
      "website / public product evidence",
      "dated program cohort and university"
    ],
    "whatNotToInfer": [
      "Membership includes UCLA alumni and outsiders; program brand does not equal present student enrollment."
    ],
    "status": "unconfigured",
    "statusNote": "Discovery/source-monitoring only; no company or person entries imported from this directory."
  },
  {
    "id": "cat_new_uc_launch_portfolio",
    "name": "UC LAUNCH (all University of California campuses)",
    "campus": "univ_berkeley",
    "sourceType": "accelerator",
    "url": "https://www.uclaunch.com/about",
    "founderScoutTier": "B",
    "startupScoutTier": "A",
    "role": "discovery",
    "dimensions": {
      "campusPurity": "high",
      "earliness": "high",
      "buildEvidence": "medium",
      "selectivity": "medium",
      "novelty": "medium",
      "identityQuality": "high",
      "extractability": "medium"
    },
    "tierRationale": "Long-running zero-equity startup program recruiting 20 teams from across the UC system per semester.",
    "whyItMatters": "Long-running zero-equity startup program recruiting 20 teams from across the UC system per semester.",
    "whatToExtract": [
      "venture and team name",
      "explicitly named founder or team roles",
      "graduation year when stated",
      "website / public product evidence",
      "dated program cohort and university"
    ],
    "whatNotToInfer": [
      "University of California system-wide, not just UC Berkeley; all ten campuses and alumni/faculty may qualify."
    ],
    "status": "unconfigured",
    "statusNote": "Discovery/source-monitoring only; no company or person entries imported from this directory."
  },
  {
    "id": "cat_new_berkeley_begin",
    "name": "Berkeley BEGIN innovation ecosystem directory",
    "campus": "univ_berkeley",
    "sourceType": "directory",
    "url": "https://begin.berkeley.edu/",
    "founderScoutTier": "C",
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
    "tierRationale": "Official UC Berkeley gateway linking entrepreneurship resources, communities and events.",
    "whyItMatters": "Official UC Berkeley gateway linking entrepreneurship resources, communities and events.",
    "whatToExtract": [
      "venture and team name",
      "explicitly named founder or team roles",
      "graduation year when stated",
      "website / public product evidence",
      "dated program cohort and university"
    ],
    "whatNotToInfer": [
      "This is a directory of resources, not a primary list of named founders or their current startups."
    ],
    "status": "unconfigured",
    "statusNote": "Discovery/source-monitoring only; no company or person entries imported from this directory."
  },
  {
    "id": "cat_new_princeton_tigerlaunch",
    "name": "Princeton TigerLaunch student founder competition",
    "campus": "univ_princeton",
    "sourceType": "competition",
    "url": "https://tigerlaunch.com/",
    "founderScoutTier": "B",
    "startupScoutTier": "A",
    "role": "discovery",
    "dimensions": {
      "campusPurity": "high",
      "earliness": "high",
      "buildEvidence": "medium",
      "selectivity": "medium",
      "novelty": "medium",
      "identityQuality": "high",
      "extractability": "medium"
    },
    "tierRationale": "Student-run competition recruiting startup founders across countries and universities.",
    "whyItMatters": "Student-run competition recruiting startup founders across countries and universities.",
    "whatToExtract": [
      "venture and team name",
      "explicitly named founder or team roles",
      "graduation year when stated",
      "website / public product evidence",
      "dated program cohort and university"
    ],
    "whatNotToInfer": [
      "Do not assign participants to Princeton simply because TigerLaunch is hosted there."
    ],
    "status": "unconfigured",
    "statusNote": "Discovery/source-monitoring only; no company or person entries imported from this directory."
  },
  {
    "id": "cat_new_bruin_entrepreneurs_startuplabs",
    "name": "Bruin Entrepreneurs Startup Labs 2026",
    "campus": "univ_ucla",
    "sourceType": "accelerator",
    "url": "https://bruinentrepreneurs.org/startuplabs/",
    "founderScoutTier": "A",
    "startupScoutTier": "B",
    "role": "discovery",
    "dimensions": {
      "campusPurity": "high",
      "earliness": "high",
      "buildEvidence": "medium",
      "selectivity": "medium",
      "novelty": "medium",
      "identityQuality": "high",
      "extractability": "medium"
    },
    "tierRationale": "Student-run equity-free accelerator culminating in Demo Days for UCLA-founded startups.",
    "whyItMatters": "Student-run equity-free accelerator culminating in Demo Days for UCLA-founded startups.",
    "whatToExtract": [
      "venture and team name",
      "explicitly named founder or team roles",
      "graduation year when stated",
      "website / public product evidence",
      "dated program cohort and university"
    ],
    "whatNotToInfer": [
      "Program accepts UCLA students alumni and faculty; verify individual founder school and current class year."
    ],
    "status": "unconfigured",
    "statusNote": "Discovery/source-monitoring only; no company or person entries imported from this directory."
  }
];
