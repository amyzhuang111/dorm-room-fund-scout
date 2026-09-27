import { signalTierRank } from "./signal-tier";

// Membership in a founder program or residency. Shown as a badge on the
// person. The directory tier sets the badge's visual weight and the map
// node's size. It is not an input to the Founder Signal score, eligibility,
// or an investment score. confirmed means the official page names the
// person. likely means the page only supports a weaker link, such as a
// first name tied to a surname on a second page.

export const PROGRAM_SIGNAL_TYPES = [
  "founders_inc",
  "south_park_commons",
  "the_residency",
  "z_fellows",
  "emergent_ventures",
  "medici_1517",
  "contrary_venture_partners",
  "buildspace",
  "afore_fir_u",
  "pioneer",
  "kleiner_perkins_fellows",
  "agi_house",
  "hf0",
  "frontier_tower",
  "yale_hacker_house",
  "farmhouse",
  "gatech_hacker_house",
  "rice_residency",
  "foundher_house",
  "playa_house",
  "harvard_st_commons",
] as const;
export type ProgramSignalType = (typeof PROGRAM_SIGNAL_TYPES)[number];
export type ProgramMatchStatus = "confirmed" | "likely";

export const PROGRAM_SIGNAL_LABEL: Record<ProgramSignalType, string> = {
  founders_inc: "Founders Inc",
  south_park_commons: "South Park Commons",
  the_residency: "The Residency",
  z_fellows: "Z Fellow",
  emergent_ventures: "Emergent Ventures",
  medici_1517: "1517 Medici",
  contrary_venture_partners: "Contrary Venture Partner",
  buildspace: "Buildspace",
  afore_fir_u: "Afore FIR U",
  pioneer: "Pioneer",
  kleiner_perkins_fellows: "Kleiner Perkins Fellow",
  agi_house: "AGI House",
  hf0: "HF0",
  frontier_tower: "Frontier Tower",
  yale_hacker_house: "Yale Hacker House",
  farmhouse: "Farmhouse",
  gatech_hacker_house: "Georgia Tech Hacker House",
  rice_residency: "Rice Residency",
  foundher_house: "FoundHer House",
  playa_house: "Playa House",
  harvard_st_commons: "Harvard St. Commons",
};

export type DirectoryTier = "S" | "A" | "B" | "C";

export interface ProgramDirectory {
  tier: DirectoryTier;
  /** One sentence. The source URL is stored beside it, not inside this sentence. */
  rationale: string;
  sourceUrl: string;
}

/**
 * One hotspot-style tier per program. S anchors are the SPC Founder
 * Fellowship, Thiel, Emergent Ventures, and HF0. Kleiner Perkins stays S:
 * a small paid fellowship already in the directory. Z Fellows is A, just
 * below that top tier: one week and $10,000. A also covers Founders Inc
 * Off Season, AGI House, Contrary, 1517, and Afore. The Residency is B:
 * live-in houses in several cities, and the page names no residents or
 * acceptance rate. Houses with a small published cohort sit at B. Large
 * or archived programs sit at C.
 */
export const PROGRAM_DIRECTORY: Record<ProgramSignalType, ProgramDirectory> = {
  founders_inc: {
    tier: "A",
    rationale: "Off Season is six weeks for students and recent grads: 48 teams in 2025 and 100 in 2026, with first checks typically $100k–$250k.",
    sourceUrl: "https://f.inc/",
  },
  south_park_commons: {
    tier: "S",
    rationale: "The Founder Fellowship invests $400k for 7% and reserves $600k for the next external round.",
    sourceUrl: "https://www.southparkcommons.com/",
  },
  the_residency: {
    tier: "B",
    rationale: "Live-in houses in several cities, including a 12-week San Francisco residency and Arcadia in Berkeley (14 bedrooms, a former YC office). The page does not name residents or an acceptance rate.",
    sourceUrl: "https://www.livetheresidency.com/residencies",
  },
  z_fellows: {
    tier: "A",
    rationale: "One week and $10,000 for technical builders. Named alumni on their own pages include YC companies.",
    sourceUrl: "https://www.zfellows.com/",
  },
  emergent_ventures: {
    tier: "S",
    rationale: "Tyler Cowen posts small winner lists. Cohorts 36 through 59, August 2024 through September 2026, each name a person and a project.",
    sourceUrl: "https://marginalrevolution.com/marginalrevolution/2026/09/emergent-ventures-winners-59th-cohort.html",
  },
  medici_1517: {
    tier: "A",
    rationale: "No-strings grants of at least $1,000 for students and dropouts in North America. The page does not publish a roster.",
    sourceUrl: "https://www.1517fund.com/medici",
  },
  contrary_venture_partners: {
    tier: "A",
    rationale: "The Class of 2026 page says nearly 1,500 applications and 20 accepted. It is a scout class, so the tier is A.",
    sourceUrl: "https://contrary.com/blog/class-of-2026",
  },
  buildspace: {
    tier: "C",
    rationale: "Archived large open school. The homepage says it shut down and mentions nights and weekends.",
    sourceUrl: "https://buildspace.so/",
  },
  afore_fir_u: {
    tier: "A",
    rationale: "Two months in San Francisco for students, dropouts, and recent graduates, with a $20k–$100k+ check.",
    sourceUrl: "https://www.afore.vc/students",
  },
  pioneer: {
    tier: "B",
    rationale: "Funded 150+ companies from 2018 and stopped new investments in 2024. Testimonials do not name schools.",
    sourceUrl: "https://pioneer.app/",
  },
  kleiner_perkins_fellows: {
    tier: "S",
    rationale: "Small paid summer fellowship in Kleiner Perkins portfolio companies. The jobs page does not name the class.",
    sourceUrl: "https://jobs.ashbyhq.com/kleinerperkinsfellows",
  },
  agi_house: {
    tier: "A",
    rationale: "Curated San Francisco AI hacker house. Hackathons and build days draw strong AI founders and researchers. The homepage names roommates and companies without an acceptance rate.",
    sourceUrl: "https://agihouse.ai/",
  },
  hf0: {
    tier: "S",
    rationale: "Repeat-founder residency that backs 10 teams at a time.",
    sourceUrl: "https://www.hf0.com/",
  },
  frontier_tower: {
    tier: "C",
    rationale: "16-floor village at 995 Market Street. Public quotes use first initials and the site does not publish a cohort size.",
    sourceUrl: "https://frontiertower.io/",
  },
  yale_hacker_house: {
    tier: "B",
    rationale: "First cohort of 15 Yale students in San Francisco. The page does not publish an acceptance rate.",
    sourceUrl: "https://www.yalehackerhouse.com/",
  },
  farmhouse: {
    tier: "B",
    rationale: "Eight Stanford builders for summer 2026. The page does not publish an acceptance rate.",
    sourceUrl: "https://www.thefarm.haus/",
  },
  gatech_hacker_house: {
    tier: "B",
    rationale: "20 spots. Georgia Tech news says nearly 180 students applied, for August 2025 through May 2026.",
    sourceUrl: "https://news.gatech.edu/news/2025/04/11/computing-student-launches-first-ever-hacker-house-campus",
  },
  rice_residency: {
    tier: "C",
    rationale: "The 19 Nov 2025 Rice Thresher says the first cohort was opening applications and names two students.",
    sourceUrl: "https://ricethresher.org/article/rice-residency-hacker-house-opens-application-for-first-cohort-20251119",
  },
  foundher_house: {
    tier: "B",
    rationale: "KTVU says upwards of 60 women applied and eight were selected.",
    sourceUrl: "https://www.ktvu.com/news/2-college-students-created-all-female-hacker-house-san-francisco-mission-take-up-more-space-start-up-world",
  },
  playa_house: {
    tier: "B",
    rationale: "Ten residents joined in fall 2025. The 30 Jul 2026 UCSB Engineering article names four.",
    sourceUrl: "https://engineering.ucsb.edu/news/student-run-founder-house-sparks-success",
  },
  harvard_st_commons: {
    tier: "B",
    rationale: "harvardst.co names the house leads and a school for two of them, and does not publish an acceptance rate.",
    sourceUrl: "https://harvardst.co/",
  },
};

/** SPC members who are not named fellows sit in the broader no-equity residency. */
const SPC_RESIDENCY: ProgramDirectory = {
  tier: "A",
  rationale: "The residency runs six months at no cost and no equity, broader than the Founder Fellowship.",
  sourceUrl: "https://www.southparkcommons.com/",
};

export function membershipDirectory(program: ProgramSignalType, label: string): ProgramDirectory {
  if (program === "south_park_commons" && !/fellow|w'/i.test(label)) return SPC_RESIDENCY;
  return PROGRAM_DIRECTORY[program];
}

export function programTierLine(directory: ProgramDirectory): string {
  return `${directory.rationale} Source: ${directory.sourceUrl}`;
}

export const PROGRAM_SOURCE_ID: Record<ProgramSignalType, string> = {
  founders_inc: "src_founders_inc",
  south_park_commons: "src_south_park_commons",
  the_residency: "src_the_residency",
  z_fellows: "src_z_fellows",
  emergent_ventures: "src_emergent_ventures",
  medici_1517: "src_1517_medici",
  contrary_venture_partners: "src_contrary_venture_partners",
  buildspace: "src_buildspace",
  afore_fir_u: "src_afore_fir_u",
  pioneer: "src_pioneer",
  kleiner_perkins_fellows: "src_kleiner_perkins_fellows",
  agi_house: "src_agi_house",
  hf0: "src_hf0",
  frontier_tower: "src_frontier_tower",
  yale_hacker_house: "src_yale_hacker_house",
  farmhouse: "src_farmhouse",
  gatech_hacker_house: "src_gatech_hacker_house",
  rice_residency: "src_rice_residency",
  foundher_house: "src_foundher_house",
  playa_house: "src_playa_house",
  harvard_st_commons: "src_harvard_st_commons",
};

export interface ProgramSignalView {
  signalType: ProgramSignalType;
  label: string;
  year: number | null;
  matchStatus: ProgramMatchStatus;
  sourceUrl: string;
  tier?: DirectoryTier | null;
  tierRationale?: string | null;
  tierSourceUrl?: string | null;
}

export function isProgramSignalType(value: string): value is ProgramSignalType {
  return (PROGRAM_SIGNAL_TYPES as readonly string[]).includes(value);
}

export function isProgramMatchStatus(value: string): value is ProgramMatchStatus {
  return value === "confirmed" || value === "likely";
}

export function bestProgramSignals(signals: ProgramSignalView[]): ProgramSignalView[] {
  return [...signals].sort(
    (a, b) =>
      (a.matchStatus === b.matchStatus ? 0 : a.matchStatus === "confirmed" ? -1 : 1) ||
      signalTierRank(a.tier) - signalTierRank(b.tier) ||
      (b.year ?? 0) - (a.year ?? 0) ||
      a.label.localeCompare(b.label)
  );
}
