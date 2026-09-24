// Source-quality tiering. The core rule this file exists to enforce:
// prestige is not tier. A source gets two INDEPENDENT tiers — one for
// finding founders early, one for finding startups — because the same
// source can be great at one and mediocre at the other (SkyDeck: weak
// founder signal, decent startup corroboration; a hackathon: the reverse).
//
// Tiers are never inferred from institutional prestige. They're a judgment
// call across 7 dimensions (campus purity, earliness, evidence of building,
// selectivity+density, novelty vs. what a VC database already shows,
// identity quality, extractability) — see QUALITY_DIMENSION_GUIDE below for
// what each means. The dimensions make the tier reproducible; they aren't
// separately surfaced as scores in the UI.

import type { CommunitySignal } from "./community-signal";

export type Tier = "S" | "A" | "B" | "C" | "D";
export type DimensionLevel = "high" | "medium" | "low";
export type SourceRole = "discovery" | "corroboration" | "verification" | "reference";
export type SourceType =
  | "hackathon"
  | "accelerator"
  | "lab_or_research"
  | "student_club"
  | "competition"
  | "code_host"
  | "portfolio_directory"
  | "manual"
  | "directory"
  | "event";

export interface QualityDimensions {
  campusPurity?: DimensionLevel;
  earliness?: DimensionLevel;
  buildEvidence?: DimensionLevel;
  selectivity?: DimensionLevel;
  novelty?: DimensionLevel;
  identityQuality?: DimensionLevel;
  extractability?: DimensionLevel;
}

export const TIER_MEANING: Record<Tier, string> = {
  S: "Exceptional sourcing source — use aggressively, likely to surface exceptional people/projects before they're obvious.",
  A: "Strong — consistently useful, part of default ingestion and monitoring.",
  B: "Useful — real signal but requires filtering; good corroborating/discovery source.",
  C: "Weak — occasionally useful but noisy/downstream/broad. Presence here should not make a candidate interesting by itself.",
  D: "Reference only — weak for novel sourcing, but useful for validation, entity resolution, or funding verification.",
};

export const ROLE_LABEL: Record<SourceRole, string> = {
  discovery: "Discovery",
  corroboration: "Corroboration",
  verification: "Verification",
  reference: "Reference",
};

// Everything the brief's campus-specific sourcing strategy (Sept 2026 revision)
// describes — implemented, planned, and deliberately-skipped alike. `dbSourceId`
// links a row to its live `sources` table entry when one exists; entries
// without it are catalogue-only (not yet, or never going to be, ingested).
export interface SourceCatalogueEntry {
  id: string;
  dbSourceId?: string;
  name: string;
  campus: string | null; // null = not campus-specific / global
  sourceType: SourceType;
  url: string;
  founderScoutTier: Tier;
  startupScoutTier: Tier;
  role: SourceRole;
  dimensions: QualityDimensions;
  tierRationale: string;
  whyItMatters: string;
  whatToExtract: string[];
  whatNotToInfer: string[];
  status: "implemented" | "unconfigured" | "checked_and_skipped";
  statusNote?: string;
}

export const SOURCE_CATALOGUE: SourceCatalogueEntry[] = [
  // ---------- PENN ----------
  {
    id: "cat_pennapps",
    name: "PennApps",
    campus: "univ_penn",
    sourceType: "hackathon",
    url: "https://pennapps.com/",
    founderScoutTier: "S",
    startupScoutTier: "A",
    role: "discovery",
    dimensions: { campusPurity: "medium", earliness: "high", buildEvidence: "high", selectivity: "medium", novelty: "high", identityQuality: "medium", extractability: "medium" },
    tierRationale:
      "Students build, teams form, projects are visible, execution is inspectable, very early. Campus purity is medium rather than high because PennApps draws hackers beyond Penn — every participant's university needs independent confirmation, not an assumption from attending.",
    whyItMatters: "Very early technical execution is directly observable, before anyone calls themselves a founder.",
    whatToExtract: ["teams", "projects", "GitHub links", "participants where public", "winners", "finalists", "repeat hackers", "project continuation after the event"],
    whatNotToInfer: [
      "Do not only watch prize winners — a project that keeps getting commits 3 months later can be a stronger founder signal than a sponsor prize.",
      "Winning ≠ elite founder.",
      "Attendance alone does not confirm Penn enrollment — verify independently.",
    ],
    status: "checked_and_skipped",
    statusNote:
      "Checked directly (2026-09-18): the live site is a pre-registration landing page for PennApps XXVII, not yet run — no gallery exists right now. The most recent past edition's real Devpost gallery (PennApps XXVI) was also checked; see the Devpost row for why that specific data wasn't ingested.",
  },
  {
    id: "cat_devpost_pennapps",
    dbSourceId: "src_pennapps_devpost",
    name: "Devpost (PennApps galleries)",
    campus: "univ_penn",
    sourceType: "directory",
    url: "https://pennapps-xxvi.devpost.com/project-gallery",
    founderScoutTier: "B",
    startupScoutTier: "C",
    role: "corroboration",
    dimensions: { campusPurity: "low", earliness: "high", buildEvidence: "high", selectivity: "medium", novelty: "high", identityQuality: "low", extractability: "high" },
    tierRationale:
      "Real projects and real team-member profiles, structurally easy to extract — but those profiles carry no school field, so there's no non-guessed way to confirm Penn affiliation from a submission alone. Strong build evidence, weak identity quality for this specific use — hence B/C rather than S/A despite the strong extraction.",
    whyItMatters: "Confirms what got built and by which named people; every affiliation is seeded 'unverified' so the gate correctly asks for research rather than assuming eligibility.",
    whatToExtract: ["project name + description", "team member names + Devpost profile URLs", "per-member contribution notes", "linked repos/demos", "prize/winner status"],
    whatNotToInfer: ["Submitting to a Penn-hosted hackathon does not by itself confirm the person is a Penn student — affiliation stays 'unverified' until independently confirmed.", "Winner status is one evidence record, not a ranking."],
    status: "implemented",
    statusNote:
      "Ingested a bounded sample (2026-09-18): page 1 of PennApps XXVI's real gallery, 24 projects, 71 real people, 25 total fetches (within the 30-fetch scan budget). Every person's affiliation was seeded 'unverified' — none of these were promoted to 'current student' from attendance alone.",
  },
  {
    id: "cat_grasp",
    dbSourceId: "src_grasp_startups",
    name: "GRASP ecosystem",
    campus: "univ_penn",
    sourceType: "lab_or_research",
    url: "https://www.grasp.upenn.edu/",
    founderScoutTier: "S",
    startupScoutTier: "B",
    role: "discovery",
    dimensions: { campusPurity: "high", earliness: "high", buildEvidence: "high", selectivity: "high", novelty: "high", identityQuality: "medium", extractability: "low" },
    tierRationale:
      "Deep-tech founder discovery for robotics/autonomy/CV/controls/hardware/embodied AI is exactly what a downstream accelerator can't surface. Tier drops to A rather than staying S whenever a student is only listed as lab personnel rather than clearly leading/building a specific project — that distinction has to be made per-person, not assumed campus-wide.",
    whyItMatters: "One of the few sources positioned to catch deep-tech founders before they're anywhere near fundable.",
    whatToExtract: ["named researchers/students", "project pages", "demos", "publications with student authorship", "spinout mentions"],
    whatNotToInfer: ["Being listed in a lab roster is weaker evidence than clearly leading or building a specific project — don't conflate the two."],
    status: "implemented",
    statusNote:
      "The Startups page itself renders nothing in raw HTML (fully AJAX via the Ajax Load More plugin) — guessing at its admin-ajax.php contract returned a wrong-but-200 response, so that path was abandoned rather than shipped. grasp.upenn.edu turned out to expose a real, documented WP REST API instead (/wp-json/wp/v2/startup) — used that. Ingested 2026-09-22: all 13 real GRASP-connected startups, with 6 named student/PhD founders hand-extracted from unambiguous founding statements on 4 of them (Alex Kushleyev + Daniel Mellinger/KMel, Matthew Piccoli/IQ Motion Control, Avik De + Gavin Kenneally/Ghost Robotics, Berkay Deniz Ilhan/Augean Robotics) — NOT a generic regex, to avoid misparsing an 'advised by'/'affiliated with' faculty mention (both appear in this dataset) as a founder claim. Faculty named as a company's research origin (Exyn's Dr. Vijay Kumar, Aptonomy's Dr. Mihail Pivtoraiko) were deliberately left unrecorded as person_project_roles — real, but not this tool's target candidate type. Scope was Startups only, not the site's `people` post type (1941 rows spanning all roles/decades with no bio content in the REST payload — would be exactly the roster-membership conflation this category's own whatNotToInfer warns against) or `project` (94 research posts whose REST `author` is the lab's web content manager, not the actual student — attributing a real name would need scraping each post's arbitrary external link, another guess). 35/50-fetch-equivalent budget; verified idempotent (0 new rows on a second run); tsc/build clean.",
  },
  {
    id: "cat_penn_labs",
    name: "Penn Labs",
    campus: "univ_penn",
    sourceType: "student_club",
    url: "https://pennlabs.org/",
    founderScoutTier: "A",
    startupScoutTier: "C",
    role: "discovery",
    dimensions: { campusPurity: "high", earliness: "high", buildEvidence: "high", selectivity: "medium", novelty: "high", identityQuality: "high", extractability: "high" },
    tierRationale:
      "Real Penn students who repeatedly ship real, deployed products, with a public roster and roles. Weak for Startup Scout on purpose — Penn Labs' own products (Penn Mobile, Penn Clubs, etc.) are internal tools, not startups, and must never be promoted into candidates themselves; only the people are the signal.",
    whyItMatters: "Discovers technical leads and repeat collaborators before they've ever pitched anything.",
    whatToExtract: ["team roster", "per-product roles", "join dates", "alumni status"],
    whatNotToInfer: [
      "Penn Mobile → project → contributors → founder/builder candidates is correct. Penn Mobile → startup candidate is not, unless independent company evidence exists.",
      "Club membership alone doesn't establish 'exceptional' — look for actual output, ownership, and repeat execution.",
    ],
    status: "implemented",
    dbSourceId: "src_penn_labs",
  },
  {
    id: "cat_venture_lab_challenge",
    name: "Venture Lab — Startup Challenge",
    campus: "univ_penn",
    sourceType: "competition",
    url: "https://venturelab.upenn.edu/2026-SC-PR",
    founderScoutTier: "B",
    startupScoutTier: "A",
    role: "discovery",
    dimensions: { campusPurity: "high", earliness: "medium", buildEvidence: "medium", selectivity: "high", novelty: "medium", identityQuality: "high", extractability: "high" },
    tierRationale:
      "Useful for formed startups with real, named Penn founders and dated class-year evidence — but less differentiated for Founder Scout, since entrants have already self-selected into entrepreneurship and a competition. This is our only real Startup Scout source at Penn so far, which is why it's A there despite the founder-side caveat.",
    whyItMatters: "The clearest real source of already-formed, Penn-affiliated pre-seed companies with named founders.",
    whatToExtract: ["company name", "prize category", "founder names + class years", "announcement date"],
    whatNotToInfer: ["Winner ≠ best DRF startup. Treat a placement as one evidence record among several needed, not a ranking."],
    status: "implemented",
    dbSourceId: "src_penn_startup_challenge",
  },
  {
    id: "cat_penn_mixers",
    name: "Generic Penn entrepreneurship organizations / mixers",
    campus: "univ_penn",
    sourceType: "event",
    url: "https://venturelab.upenn.edu/",
    founderScoutTier: "C",
    startupScoutTier: "C",
    role: "reference",
    dimensions: { campusPurity: "medium", earliness: "low", buildEvidence: "low", selectivity: "low", novelty: "low", identityQuality: "low", extractability: "low" },
    tierRationale: "Occasionally useful for names, but attendance/membership alone should carry little or no founder signal.",
    whyItMatters: "Can surface a name worth researching elsewhere; shouldn't be trusted on its own.",
    whatToExtract: ["names worth cross-checking elsewhere"],
    whatNotToInfer: ["Attendance/interest in entrepreneurship is not evidence of building anything."],
    status: "unconfigured",
  },
  {
    id: "cat_github_pennlabs",
    name: "GitHub (pennlabs org)",
    campus: "univ_penn",
    sourceType: "code_host",
    url: "https://github.com/pennlabs",
    founderScoutTier: "B",
    startupScoutTier: "D",
    role: "corroboration",
    dimensions: { buildEvidence: "high", identityQuality: "high", extractability: "high", novelty: "low" },
    tierRationale:
      "Real commit/release activity corroborates continued building on products we already track — strong for validating ability-to-build, but it doesn't discover new founders on its own and Penn Labs isn't a startup, so it's near-irrelevant for Startup Scout.",
    whyItMatters: "Turns a static team-roster claim into a dated, verifiable 'still actively maintained' signal.",
    whatToExtract: ["stars", "last-pushed date", "open issues", "repo description"],
    whatNotToInfer: ["Repo activity on an internal tool is not evidence the org (or its members) run an investable startup."],
    status: "implemented",
    dbSourceId: "src_github_pennlabs_org",
  },
  {
    id: "cat_drf_portfolio",
    name: "DRF Public Portfolio Directory",
    campus: null,
    sourceType: "portfolio_directory",
    url: "https://www.dormroomfund.com/portfolio",
    founderScoutTier: "D",
    startupScoutTier: "D",
    role: "reference",
    dimensions: { novelty: "low", identityQuality: "medium", extractability: "high" },
    tierRationale: "Reference/exclusion set by design — existing investments are excluded from new-target queues, never promoted as fresh candidates.",
    whyItMatters: "Prevents re-pitching DRF's own portfolio and frames pattern questions against past bets.",
    whatToExtract: ["company name", "category tags", "linked website"],
    whatNotToInfer: ["A pattern in past investments is not a rule for new ones, and current company state is not backdated to investment time."],
    status: "implemented",
    dbSourceId: "src_drf_portfolio_directory",
  },
  {
    id: "cat_manual_referrals",
    name: "Manual referrals",
    campus: null,
    sourceType: "manual",
    url: "(user-entered)",
    founderScoutTier: "S",
    startupScoutTier: "A",
    role: "discovery",
    dimensions: { buildEvidence: "medium", identityQuality: "high", novelty: "high", extractability: "high" },
    tierRationale:
      "Firsthand attributed knowledge is inherently high-signal — but this tier describes the ceiling, not the yield. Scale depends entirely on Amy's own network, not on any repeatable ingestion.",
    whyItMatters: "The only source that captures 'who kept building after the hackathon' when nothing else recorded it.",
    whatToExtract: ["whatever Amy directly observed — specific, not a vague endorsement"],
    whatNotToInfer: ["A referral is a labeled user_note claim, never an independently observed fact."],
    status: "implemented",
    dbSourceId: "src_manual_referrals",
  },
  {
    id: "cat_penn_innovation_fund",
    name: "Penn Innovation Fund",
    campus: "univ_penn",
    sourceType: "accelerator",
    url: "https://venturelab.upenn.edu/innovation-fund",
    founderScoutTier: "B",
    startupScoutTier: "A",
    role: "discovery",
    dimensions: { campusPurity: "high", earliness: "medium", extractability: "low" },
    tierRationale: "Same shape as the Startup Challenge — real formed Penn ventures, later-stage than a hackathon for founder discovery specifically.",
    whyItMatters: "Another real source of named, funded (small amounts), Penn-affiliated ventures.",
    whatToExtract: ["recipient venture names", "announcement dates"],
    whatNotToInfer: ["Fund recipient ≠ investment-ready by DRF's bar."],
    status: "checked_and_skipped",
    statusNote: "Checked (2026-09-18): the page is an application/FAQ page with no public recipient directory found. Would need a different page or a future refresh.",
  },
  {
    id: "cat_penn_vip",
    name: "Penn VIP / VIP-X",
    campus: "univ_penn",
    sourceType: "accelerator",
    url: "https://venturelab.upenn.edu/venture-initiation-program",
    founderScoutTier: "B",
    startupScoutTier: "A",
    role: "discovery",
    dimensions: { campusPurity: "high", earliness: "medium" },
    tierRationale: "Structurally similar to the Startup Challenge/Innovation Fund — useful, later-stage than a hackathon.",
    whyItMatters: "Another real formed-venture source at Penn, not yet ingested.",
    whatToExtract: ["venture profiles", "showcase announcements"],
    whatNotToInfer: ["Program acceptance ≠ investment-ready."],
    status: "unconfigured",
  },
  {
    id: "cat_hack4impact_penn",
    dbSourceId: "src_hack4impact_penn",
    name: "Hack4Impact (Penn chapter)",
    campus: "univ_penn",
    sourceType: "student_club",
    url: "https://upenn.hack4impact.org/",
    founderScoutTier: "A",
    startupScoutTier: "C",
    role: "discovery",
    dimensions: { campusPurity: "high", buildEvidence: "high" },
    tierRationale: "Real students shipping real software for nonprofit clients — direct build evidence, not just membership. Startup Scout weak on purpose: the org builds for clients, not its own ventures.",
    whyItMatters: "Community discussion (unverified — see community signal) recommends it alongside Penn Labs as a place to build real software.",
    whatToExtract: ["tech leads", "project leads", "repeat contributors", "shipped client projects"],
    whatNotToInfer: ["Membership alone remains weak — prioritize named leadership/technical-lead roles."],
    status: "implemented",
    statusNote:
      "Ingested (2026-09-21): upenn.hack4impact.org/projects embeds a clean Next.js __NEXT_DATA__ JSON payload — real project names + real team-member names, no HTML scraping needed. 7 real projects, 35 real people. Team roles are undifferentiated (a flat name list, same gap as a Devpost hackathon gallery) — seeded 'team_member', never 'founder'; affiliation seeded 'unverified'. People keyed by name only (no stronger identifier exposed in this data) — a real, accepted limitation, same class of risk as the Penn Venture Lab Startup Challenge's founder keying.",
  },
  {
    id: "cat_penn_electric_racing",
    dbSourceId: "src_penn_electric_racing",
    name: "Penn Electric Racing",
    campus: "univ_penn",
    sourceType: "student_club",
    url: "https://www.pennelectricracing.com/",
    founderScoutTier: "A",
    startupScoutTier: "C",
    role: "discovery",
    dimensions: { campusPurity: "high", buildEvidence: "high" },
    tierRationale: "A real, competitive Formula SAE Electric build team (10 custom cars since 2013) — practical embedded/hardware/controls/software engineering ownership, strong ability-to-build evidence.",
    whyItMatters: "Community discussion (unverified — see community signal) surfaces it as a place where software engineers do real build work, not just automotive specialists.",
    whatToExtract: ["technical leads", "subsystem owners (embedded/hardware/controls/software)", "repeat builders across seasons"],
    whatNotToInfer: ["Team membership alone isn't the signal — individual technical ownership is."],
    status: "implemented",
    statusNote:
      "Ingested (2026-09-23): pennelectricracing.com/team-members-2526's Squarespace gallery lists 67 real 2025-26 roster slides (62 unique people after de-duping repeated slide markup), each with a real self-written bio. Bounded to this single current season — the site's separate 2020-21 through 2024-25 archive pages exist but aren't pulled, so 'repeat builders across seasons' is honestly not attempted. No bio ever uses a leadership title ('Lead'/'Captain'/etc, checked across all 67) — every person seeded role='team_member' with subteam noted as text only (Mechanical/Electrical Hardware/Software/Operations), never elevated, per this source's own whatNotToInfer. 8 of 67 bios self-link the member's own personal LinkedIn profile, captured as a real alias — but LinkedIn profile content itself isn't fetched (no reliable logged-out access), so unlike WDB this does not feed company-detection. People keyed by name only, same accepted limitation as Hack4Impact.",
  },
  {
    id: "cat_penn_aerial_robotics",
    dbSourceId: "src_penn_aerial_robotics",
    name: "Penn Aerial Robotics (Penn AiR)",
    campus: "univ_penn",
    sourceType: "student_club",
    url: "https://www.pennaerial.com/",
    founderScoutTier: "A",
    startupScoutTier: "C",
    role: "discovery",
    dimensions: { campusPurity: "high", buildEvidence: "high" },
    tierRationale: "Real UAV/autonomy build team competing in SAE Aero Design and IARC — same logic as Electric Racing: strong only where individual technical ownership is visible.",
    whyItMatters: "Community discussion (unverified — see community signal) names it alongside Electric Racing as real build-work engineering orgs.",
    whatToExtract: ["autonomy/codebase leads", "subsystem owners", "competition results"],
    whatNotToInfer: ["Team membership alone isn't the signal — individual technical ownership is."],
    status: "unconfigured",
  },
  {
    id: "cat_mt_penn",
    dbSourceId: "src_mt_penn",
    name: "Jerome Fisher Program in Management & Technology (M&T)",
    campus: "univ_penn",
    sourceType: "lab_or_research",
    url: "https://fisher.wharton.upenn.edu/",
    founderScoutTier: "S",
    startupScoutTier: "D",
    role: "reference",
    dimensions: { campusPurity: "high", selectivity: "high" },
    tierRationale:
      "A dual-degree admissions cohort (Engineering + Wharton), not a builder org — Founder Scout tier reflects it as a high-density SEARCH POOL of small, selective, career-driven students with disclosed startup/tech/VC interest, never as direct build evidence. Standalone evidence strength is deliberately low (D) — NEVER assign founder points just for M&T membership.",
    whyItMatters: "Community discussion (unverified — see community signal) characterizes it as small, close-knit, extremely career-driven, with meaningful AI/startup participation — useful for identity-graph search, not scoring.",
    whatToExtract: ["members who separately show up building something real elsewhere — cross-reference only"],
    whatNotToInfer: ["M&T membership is not Founder Signal by itself, under any circumstance — it's an admissions cohort, not a build community."],
    status: "unconfigured",
  },
  {
    id: "cat_pennovation",
    dbSourceId: "src_pennovation",
    name: "Pennovation Works",
    campus: "univ_penn",
    sourceType: "accelerator",
    url: "https://pennovation.upenn.edu/",
    founderScoutTier: "C",
    startupScoutTier: "B",
    role: "discovery",
    dimensions: { campusPurity: "medium", earliness: "low" },
    tierRationale:
      "Formal entrepreneurship/innovation infrastructure (23-acre tech park, 100+ resident companies) — community signal is MIXED (unverified — see community signal): some discussion praises the resources, other threads argue the most interesting builders aren't concentrated in the formal center. Use for startup/company discovery, not as the best founder discovery layer.",
    whyItMatters: "A real, formal Penn innovation hub with resident companies — useful for Startup Scout discovery, not Founder Scout.",
    whatToExtract: ["resident/member company names", "showcase announcements"],
    whatNotToInfer: ["Formal infrastructure visibility ≠ where the strongest current-student founders actually are — that's a separate, community-sourced question."],
    status: "unconfigured",
  },

  // ---------- BERKELEY ----------
  {
    id: "cat_wdb",
    dbSourceId: "src_wdb_github",
    name: "Web Development at Berkeley",
    campus: "univ_berkeley",
    sourceType: "student_club",
    url: "https://webatberkeley.org/",
    founderScoutTier: "S",
    startupScoutTier: "B",
    role: "discovery",
    dimensions: { campusPurity: "high", earliness: "high", buildEvidence: "high", selectivity: "high", novelty: "high", identityQuality: "high", extractability: "medium" },
    tierRationale:
      "Direct access to Berkeley students who repeatedly design, build, and ship real client products — useful for identifying builders before they call themselves founders. Signal comes from actual output + ownership + repeat execution, never from membership alone.",
    whyItMatters: "One of Berkeley's densest concentrations of students actively shipping real technical work for real clients.",
    whatToExtract: ["project leads", "engineering leads", "repeat contributors across semesters", "independently shipped projects", "recurring team pairs"],
    whatNotToInfer: ["Do not automatically promote all members — club membership is not the signal, ownership + output is."],
    status: "implemented",
    statusNote:
      "webatberkeley.org itself has no team roster or per-project credits page (verified by direct inspection), and its Behance project showcase carries no credits field either — both dead ends. Real evidence instead comes from WDB's GitHub org (github.com/web-at-berkeley, public REST API, no auth): real commit-author credit across 2 external client repos (Kiwibot, Berkeley Investment Group), 2 of WDB's own internal tools, and 5 recent Training-initiative team-project repos. Ingested 2026-09-21: 9 projects, 21 people (real commit-based team_member credit, all affiliations seeded 'unverified'), 35/50 fetches used. One person's own public GitHub bio self-disclosed a real company (\"co-founder @simstudioai\" / company field \"Sim\") — recorded as a genuine founder candidate sourced to their own profile, not guessed.",
  },
  {
    id: "cat_calhacks",
    dbSourceId: "src_calhacks_devpost",
    name: "Cal Hacks",
    campus: "univ_berkeley",
    sourceType: "hackathon",
    url: "https://www.calhacks.io/",
    founderScoutTier: "S",
    startupScoutTier: "A",
    role: "discovery",
    dimensions: { campusPurity: "medium", earliness: "high", buildEvidence: "high", novelty: "high", extractability: "medium" },
    tierRationale: "Same shape as TreeHacks/PennApps: projects, teams, and repeat hackers visible very early. Winner status is one data point, not the ranking.",
    whyItMatters: "Projects, teams, technical ambition, and early startup formation, all inspectable.",
    whatToExtract: ["projects", "teams", "repeat hackers", "technical ambition signals", "early startup formation"],
    whatNotToInfer: ["Winner ≠ automatically best founder — inspect the team and the actual build.", "Devpost carries no school field — affiliation stays 'unverified' until independently confirmed."],
    status: "implemented",
    statusNote:
      "Ingested a bounded sample (2026-09-18) via Cal Hacks 12.0's real Devpost gallery: page 1, 24 projects, 67 real people, 25 total fetches. Every affiliation seeded 'unverified'.",
  },
  {
    id: "cat_berkeley_tech_orgs",
    name: "Strong Berkeley technical organizations",
    campus: "univ_berkeley",
    sourceType: "student_club",
    url: "https://www.berkeley.edu/",
    founderScoutTier: "A",
    startupScoutTier: "C",
    role: "discovery",
    dimensions: { selectivity: "medium" },
    tierRationale: "AI/ML builder groups, technical consulting/building orgs, open-source groups, engineering project teams — evaluate each individually; do not blanket-assign A to every Berkeley club.",
    whyItMatters: "Potential high-signal categories once a specific org demonstrates real technical output.",
    whatToExtract: ["specific project output", "technical selectivity", "builder density"],
    whatNotToInfer: ["Do not automatically make all Berkeley clubs A-tier — require demonstrated projects, technical output, and selectivity per-org."],
    status: "unconfigured",
  },
  {
    id: "cat_berkeley_labs",
    name: "Berkeley research labs",
    campus: "univ_berkeley",
    sourceType: "lab_or_research",
    url: "https://www.berkeley.edu/research/",
    founderScoutTier: "A",
    startupScoutTier: "C",
    role: "discovery",
    dimensions: { campusPurity: "high" },
    tierRationale: "Useful when students have ownership, real technical contribution, projects, and public repos — a directory listing alone is weaker than leading a meaningful project.",
    whyItMatters: "Deep technical evidence when ownership (not just membership) is confirmed.",
    whatToExtract: ["project ownership", "public repositories", "research prototypes"],
    whatNotToInfer: ["Being listed in a lab is weaker than leading a meaningful project — don't conflate the two."],
    status: "unconfigured",
  },
  {
    id: "cat_skydeck",
    name: "Berkeley SkyDeck",
    campus: "univ_berkeley",
    sourceType: "accelerator",
    url: "https://skydeck.berkeley.edu/",
    founderScoutTier: "C",
    startupScoutTier: "B",
    role: "corroboration",
    dimensions: { campusPurity: "low", earliness: "low", novelty: "low", extractability: "low" },
    tierRationale:
      "Not 'bad' — just relatively weak for finding non-obvious Berkeley student founders before everyone else. Not restricted to Berkeley students, includes alumni/faculty/global founders, and accelerator companies are already formalized and often already fundraising.",
    whyItMatters: "Confirms company existence, founder-company relationships, and funding/status history.",
    whatToExtract: ["company discovery", "company verification", "founder-company relationships", "funding/status validation", "historical pattern research"],
    whatNotToInfer: ["Do not heavily increase founder signal just because someone appears in SkyDeck."],
    status: "checked_and_skipped",
    statusNote: "Checked (2026-09-18): the public portfolio page is logo-only with no extractable names/founders in the HTML — not currently ingestible even at its correctly-weak tier.",
  },
  {
    id: "cat_eb_berkeley",
    dbSourceId: "src_eb_berkeley",
    name: "Entrepreneurs @ Berkeley (E@B)",
    campus: "univ_berkeley",
    sourceType: "student_club",
    url: "https://entrepreneurs.berkeley.edu/",
    founderScoutTier: "S",
    startupScoutTier: "B",
    role: "discovery",
    dimensions: { campusPurity: "high", selectivity: "high" },
    tierRationale:
      "Not previously in the catalogue at all — surfaced by real student-community discussion (see community signal), not an official-page sweep. Startup Scout kept at B rather than raised on Reddit alone: no public cohort/portfolio roster has been checked yet, only that current-undergrad members describe it as a selective, active founder community.",
    whyItMatters: "Community discussion repeatedly names it as where Berkeley's active current-student founders actually are, ahead of larger official-looking entrepreneurship infrastructure.",
    whatToExtract: ["cohort/member rosters if public", "project/company outcomes", "officer-disclosed selectivity numbers (label as insider, not independent)"],
    whatNotToInfer: ["A Reddit recommendation is not itself Founder Signal for any individual member — see lib/domain/community-signal.ts.", "An officer's own description of the club is operational detail, not an independent endorsement."],
    status: "unconfigured",
    statusNote:
      "Registered 2026-09-21 from Reddit discovery, not yet ingested. entrepreneurs.berkeley.edu redirects to entrepreneurs.studentorg.berkeley.edu, which returned HTTP 400 on a direct fetch check (2026-09-21) — live status/structure not yet confirmed, so no adapter built. URL kept because it's the real, named official site (not guessed), pending a working check.",
  },
  {
    id: "cat_free_ventures",
    dbSourceId: "src_free_ventures",
    name: "Free Ventures",
    campus: "univ_berkeley",
    sourceType: "accelerator",
    url: "https://www.freeventures.org/",
    founderScoutTier: "B",
    startupScoutTier: "A",
    role: "discovery",
    dimensions: { campusPurity: "high", extractability: "low" },
    tierRationale: "Berkeley-specific zero-equity accelerator — same shape as Penn's Venture Lab/Innovation Fund, real formed Berkeley ventures.",
    whyItMatters: "Would be a real Startup Scout source specifically for Berkeley, if ingestible.",
    whatToExtract: ["cohort company names", "founder names"],
    whatNotToInfer: ["Program acceptance ≠ investment-ready."],
    status: "checked_and_skipped",
    statusNote: "Checked (2026-09-18): the site is a client-side React SPA with no discovered public data API — nothing to ingest without one.",
  },
  {
    id: "cat_berkeley_directories",
    name: "Generic Berkeley entrepreneurship directories",
    campus: "univ_berkeley",
    sourceType: "directory",
    url: "https://www.berkeley.edu/",
    founderScoutTier: "D",
    startupScoutTier: "C",
    role: "reference",
    dimensions: {},
    tierRationale: "Use mainly for cross-checking and entity resolution, not ranking.",
    whyItMatters: "Occasional corroboration value.",
    whatToExtract: ["cross-checkable names/links"],
    whatNotToInfer: ["Not a ranking signal."],
    status: "unconfigured",
  },

  // ---------- STANFORD ----------
  {
    id: "cat_treehacks",
    dbSourceId: "src_treehacks_devpost",
    name: "TreeHacks",
    campus: "univ_stanford",
    sourceType: "hackathon",
    url: "https://treehacks.com/",
    founderScoutTier: "S",
    startupScoutTier: "A",
    role: "discovery",
    dimensions: { campusPurity: "medium", earliness: "high", buildEvidence: "high", novelty: "high", extractability: "medium" },
    tierRationale: "Students build during the event, teams and projects are visible, technical execution is observable, very early. New founder combinations form here.",
    whyItMatters: "One of Stanford's densest concentrations of students actively shipping new technical projects.",
    whatToExtract: ["participants where public", "teams", "projects", "winners", "finalists", "project descriptions", "Devpost/project URLs", "GitHub", "personal sites", "repeat participation"],
    whatNotToInfer: ["Winning is not required — strong builders may be on non-winning teams.", "Do not only ingest winners.", "Devpost carries no school field — affiliation stays 'unverified' until independently confirmed, same as PennApps."],
    status: "implemented",
    statusNote:
      "Ingested a bounded sample (2026-09-18) via TreeHacks 2026's real Devpost gallery: page 1, 24 projects, 82 real people, 25 total fetches. Every affiliation seeded 'unverified'.",
  },
  {
    id: "cat_stanford_labs",
    name: "Stanford engineering / CS project ecosystems",
    campus: "univ_stanford",
    sourceType: "lab_or_research",
    url: "https://engineering.stanford.edu/",
    founderScoutTier: "S",
    startupScoutTier: "B",
    role: "discovery",
    dimensions: { campusPurity: "high", buildEvidence: "high" },
    tierRationale: "Research project pages, technical projects, AI/systems/robotics labs, open-source work — tier is S/A depending on the specific lab/project, not a blanket rating.",
    whyItMatters: "Students shipping, leading repos, turning research into products, repeat collaborators.",
    whatToExtract: ["students shipping", "repo leadership", "research-to-product transitions", "repeat collaborators"],
    whatNotToInfer: ["Lab affiliation alone isn't the signal — look for who's actually leading and shipping."],
    status: "unconfigured",
  },
  {
    id: "cat_stanford_clubs",
    name: "Stanford student builder organizations",
    campus: "univ_stanford",
    sourceType: "student_club",
    url: "https://stanford.edu/",
    founderScoutTier: "A",
    startupScoutTier: "C",
    role: "discovery",
    dimensions: { selectivity: "medium" },
    tierRationale: "Use individually — do not assign A automatically to every Stanford club. Require demonstrated projects, technical output, selectivity, builder density.",
    whyItMatters: "High-signal only when the specific org demonstrates real output.",
    whatToExtract: ["demonstrated projects", "technical output"],
    whatNotToInfer: ["Club prestige is not tier."],
    status: "unconfigured",
  },
  {
    id: "cat_stanford_entrepreneurship_programs",
    name: "Stanford entrepreneurship programs / demo environments",
    campus: "univ_stanford",
    sourceType: "accelerator",
    url: "https://stanford.edu/",
    founderScoutTier: "B",
    startupScoutTier: "B",
    role: "discovery",
    dimensions: { earliness: "low" },
    tierRationale: "Useful for startup discovery, team formation, validation — but often later than project/hackathon sources.",
    whyItMatters: "Startup discovery and team-formation signal, later-stage.",
    whatToExtract: ["team formation", "startup discovery leads"],
    whatNotToInfer: ["Later-stage visibility ≠ early founder discovery."],
    status: "unconfigured",
  },
  {
    id: "cat_stanford_mixers",
    name: "Generic Stanford entrepreneurship events",
    campus: "univ_stanford",
    sourceType: "event",
    url: "https://stanford.edu/",
    founderScoutTier: "D",
    startupScoutTier: "C",
    role: "reference",
    dimensions: { buildEvidence: "low" },
    tierRationale: "Speaker events, networking mixers, newsletters, conference attendee lists. Attendance ≠ building.",
    whyItMatters: "Minimal — occasional name for cross-checking.",
    whatToExtract: ["names worth cross-checking elsewhere"],
    whatNotToInfer: ["Attendance is not a founder signal."],
    status: "unconfigured",
  },
  {
    id: "cat_bases_stanford",
    dbSourceId: "src_bases_stanford",
    name: "BASES (Business Association of Stanford Entrepreneurial Students)",
    campus: "univ_stanford",
    sourceType: "student_club",
    url: "https://bases.stanford.edu/",
    founderScoutTier: "S",
    startupScoutTier: "A",
    role: "discovery",
    dimensions: { campusPurity: "high", selectivity: "medium" },
    tierRationale:
      "One of the largest student-run entrepreneurship orgs in the world (founded 1996), running the 150K Challenge, E-Bootcamp, and the Freshman Battalion. Community discussion (unverified — see community signal) recommends it specifically as the entrepreneurship club and place to meet other startup-interested students.",
    whyItMatters: "Real challenge/cohort structure with a long track record — use challenge participants, active builders, leadership, teams, alumni company formation.",
    whatToExtract: ["150K Challenge participants/finalists", "E-Bootcamp cohorts", "leadership/officer roles", "alumni company formation"],
    whatNotToInfer: ["Membership alone is not Founder Signal — BASES is large and broad; look for named participation/leadership."],
    status: "unconfigured",
  },
  {
    id: "cat_cardinal_ventures",
    dbSourceId: "src_cardinal_ventures",
    name: "Cardinal Ventures",
    campus: "univ_stanford",
    sourceType: "accelerator",
    url: "(unverified — see tierRationale)",
    founderScoutTier: "A",
    startupScoutTier: "A",
    role: "discovery",
    dimensions: { campusPurity: "high", selectivity: "high" },
    tierRationale:
      "The only equity-free, student-run accelerator at Stanford (150+ graduated companies, $1B+ raised) — a real selection layer over Stanford founders, not just a discovery source. Community discussion (unverified — see community signal) points students toward it specifically. SECURITY NOTE (2026-09-21): the domain cardinalventures.org, which appeared as the official site in search results, was checked directly and is domain-squatted — it 302-redirects to an unrelated Indonesian online-gambling site (slotplaydemo.link), not Cardinal Ventures. URL deliberately left unset rather than guessed; do not link to cardinalventures.org anywhere. A real official URL still needs to be found (try sen.stanford.edu/opportunities/cardinal-ventures or a direct Stanford-hosted page first).",
    whyItMatters: "Treat as a selection/corroboration layer — companies here already cleared a real student-run bar.",
    whatToExtract: ["cohort company names", "founder names", "sector focus (DeepTech/BioTech per their own positioning)"],
    whatNotToInfer: ["Cohort acceptance corroborates, but the underlying company/founder evidence still needs to be checked directly."],
    status: "unconfigured",
  },
  {
    id: "cat_startx",
    dbSourceId: "src_startx",
    name: "StartX",
    campus: "univ_stanford",
    sourceType: "accelerator",
    url: "https://startx.com/",
    founderScoutTier: "B",
    startupScoutTier: "S",
    role: "discovery",
    dimensions: { campusPurity: "high", earliness: "low" },
    tierRationale:
      "No-equity, no-fee nonprofit accelerator requiring a Stanford tie per founder — 1800+ alumni, 700+ well-funded growth-stage startups. Community discussion (unverified — see community signal) recommends it as a startup resource/mentor network, but this is more downstream than a TreeHacks project or early builder community — use primarily for Startup Scout, not early founder discovery.",
    whyItMatters: "A real, well-documented Stanford-founder accelerator — strong for finding already-formed companies with a verified Stanford tie.",
    whatToExtract: ["cohort company names", "founder names + Stanford affiliation (StartX itself requires this)"],
    whatNotToInfer: ["Downstream of early discovery — a company here has already formed and applied; don't treat as a founder-discovery layer."],
    status: "unconfigured",
  },

  // ---------- HARVARD ----------
  {
    id: "cat_harvard_ilab",
    dbSourceId: "src_harvard_ilab",
    name: "Harvard Innovation Labs (i-lab)",
    campus: "univ_harvard",
    sourceType: "accelerator",
    url: "https://innovationlabs.harvard.edu/",
    founderScoutTier: "A",
    startupScoutTier: "S",
    role: "discovery",
    dimensions: { campusPurity: "high", earliness: "medium" },
    tierRationale:
      "Harvard's central innovation hub across all 13 schools (4,000+ teams/companies incubated, $7B+ raised) — real scale and track record. Community discussion (unverified — see community signal) repeatedly identifies it as the central entrepreneurship community. Founder Scout kept at A rather than S because 'walked into i-lab' and 'accepted team actively building in i-lab' are meaningfully different signals that need to be distinguished per-person, not assumed.",
    whyItMatters: "The clearest single Harvard entrepreneurship hub — but also search project/thesis artifacts directly (building independently, summer/startup internships, thesis-to-company), not only i-lab rosters, per the community discussion's own emphasis.",
    whatToExtract: ["Student i-lab accepted teams (not just visitors)", "Pagliuca Life Lab ventures", "President's Innovation Challenge participants"],
    whatNotToInfer: ["'Walked into i-lab' is not the same evidence as 'accepted team actively building in i-lab' — keep the distinction explicit."],
    status: "unconfigured",
  },

  // ---------- MIT ----------
  {
    id: "cat_mit_projects",
    name: "MIT technical project / research ecosystems",
    campus: "univ_mit",
    sourceType: "lab_or_research",
    url: "https://www.csail.mit.edu/",
    founderScoutTier: "S",
    startupScoutTier: "B",
    role: "discovery",
    dimensions: { campusPurity: "high", buildEvidence: "high" },
    tierRationale: "Prioritize projects, labs, GitHub, student technical teams, hackathons, research prototypes over generic entrepreneurship programs.",
    whyItMatters: "Same early-discovery logic as Stanford/Berkeley/Penn labs — before company formation, not after.",
    whatToExtract: ["projects", "GitHub", "student technical teams", "hackathons", "research prototypes"],
    whatNotToInfer: ["Generic entrepreneurship-program visibility is downstream of this."],
    status: "unconfigured",
  },
  {
    id: "cat_mit_deltav",
    dbSourceId: "src_mit_deltav",
    name: "MIT delta v",
    campus: "univ_mit",
    sourceType: "accelerator",
    url: "https://entrepreneurship.mit.edu/accelerator/program/",
    founderScoutTier: "B",
    startupScoutTier: "A",
    role: "discovery",
    dimensions: { campusPurity: "high", earliness: "low" },
    tierRationale:
      "Strong for Startup Scout — founders are actively building companies, a prototype/early product is expected, teams work full-time, GTM-oriented. Not automatically S for Founder Scout because the company already exists and the founder already self-identifies as one — relatively downstream vs. project discovery.",
    whyItMatters: "Real, full-time-committed MIT founders with expected prototypes — but caught later than a hackathon would.",
    whatToExtract: ["cohort company names", "founder names", "product/prototype stage"],
    whatNotToInfer: ["Cohort acceptance ≠ elite founder discovery — use heavily for startup sourcing, less for unique early founder discovery."],
    status: "implemented",
    statusNote:
      "Ingested (2026-09-21): entrepreneurship.mit.edu's real public 'Past Teams' page (11 cohort years, 2015-2025). Bounded to the 2025 cohort only (22 companies) — older cohorts aren't pre-seed candidates a decade later. Unlike Velocity, delta v's own page has no per-company founder listing (only an external link to each company's own site), so these companies are ingested with 'Founders not yet identified' rather than a guessed founder.",
  },
  {
    id: "cat_mit_mixers",
    name: "Generic MIT entrepreneurship event attendance",
    campus: "univ_mit",
    sourceType: "event",
    url: "https://entrepreneurship.mit.edu/",
    founderScoutTier: "D",
    startupScoutTier: "C",
    role: "reference",
    dimensions: { buildEvidence: "low" },
    tierRationale: "Interest ≠ execution.",
    whyItMatters: "Minimal.",
    whatToExtract: ["names worth cross-checking elsewhere"],
    whatNotToInfer: ["Attendance is not a founder signal."],
    status: "unconfigured",
  },

  // ---------- WATERLOO ----------
  {
    id: "cat_waterloo_projects",
    name: "Waterloo technical student projects",
    campus: "univ_waterloo",
    sourceType: "lab_or_research",
    url: "https://uwaterloo.ca/",
    founderScoutTier: "S",
    startupScoutTier: "B",
    role: "discovery",
    dimensions: { campusPurity: "high", buildEvidence: "high" },
    tierRationale: "Prioritize engineering projects, GitHub, technical teams, hackathons, builders emerging from co-op — especially repeat shippers across environments.",
    whyItMatters: "Waterloo's co-op structure means technical output is unusually visible early and often.",
    whatToExtract: ["engineering projects", "GitHub", "technical teams", "hackathons", "co-op builder patterns"],
    whatNotToInfer: ["Co-op placement alone isn't the signal — repeat shipping is."],
    status: "unconfigured",
  },
  {
    id: "cat_hackthenorth",
    name: "Hack the North",
    campus: "univ_waterloo",
    sourceType: "hackathon",
    url: "https://hackthenorth.com/",
    founderScoutTier: "S",
    startupScoutTier: "A",
    role: "discovery",
    dimensions: { campusPurity: "medium", earliness: "high", buildEvidence: "high" },
    tierRationale: "Same hackathon-discovery shape as TreeHacks/PennApps/Cal Hacks.",
    whyItMatters: "Canada's largest hackathon, hosted at Waterloo — dense builder discovery.",
    whatToExtract: ["teams", "projects", "winners", "finalists", "repeat hackers"],
    whatNotToInfer: ["Winning ≠ elite founder."],
    status: "unconfigured",
  },
  {
    id: "cat_velocity",
    dbSourceId: "src_velocity",
    name: "Velocity",
    campus: "univ_waterloo",
    sourceType: "accelerator",
    url: "https://www.velocityincubator.com/",
    founderScoutTier: "B",
    startupScoutTier: "A",
    role: "discovery",
    dimensions: { campusPurity: "medium", earliness: "low" },
    tierRationale: "Useful for real pre-seed companies, but don't assume every Velocity founder is a current Waterloo student — verify university relationship independently.",
    whyItMatters: "Real formed Waterloo-area pre-seed companies.",
    whatToExtract: ["cohort company names", "founder names"],
    whatNotToInfer: ["Velocity founder ≠ confirmed current Waterloo student without independent verification."],
    status: "implemented",
    statusNote:
      "Ingested (2026-09-20): velocityincubator.com's real public company directory (Webflow CMS, ~90 companies spanning 2009–2026) plus per-company detail pages with real named founders. Bounded to the 2025–2026 cohorts only (10 companies) — the full directory includes long-since-scaled companies (e.g. ApplyBoard, a 2015 cohort company now a large late-stage business), which aren't pre-seed candidates. Founder-Waterloo affiliation seeded 'unverified' per the tier rationale.",
  },

  // ---------- GLOBAL / NOT CAMPUS-SPECIFIC ----------
  {
    id: "cat_show_hn",
    name: "Show HN",
    campus: null,
    sourceType: "directory",
    url: "https://news.ycombinator.com/shownew",
    founderScoutTier: "D",
    startupScoutTier: "C",
    role: "reference",
    dimensions: { campusPurity: "low", identityQuality: "low" },
    tierRationale: "No campus signal at all and posts rarely expose affiliation — same identity-quality problem documented for Devpost.",
    whyItMatters: "Occasionally surfaces a real shipped product; can't confirm who or where on its own.",
    whatToExtract: ["product name/description", "author profile if linked"],
    whatNotToInfer: ["A Show HN post is not affiliation or quality evidence by itself."],
    status: "unconfigured",
  },
  {
    id: "cat_hf_spaces",
    name: "Hugging Face Spaces",
    campus: null,
    sourceType: "code_host",
    url: "https://huggingface.co/spaces",
    founderScoutTier: "C",
    startupScoutTier: "D",
    role: "corroboration",
    dimensions: { buildEvidence: "medium", identityQuality: "low" },
    tierRationale: "Decent technical-build corroboration once a creator is already identified some other way; not a discovery source on its own — no campus signal.",
    whyItMatters: "Corroborates AI/ML build evidence for someone already on the radar.",
    whatToExtract: ["space activity/likes", "linked models/datasets", "creator profile"],
    whatNotToInfer: ["A popular Space is not founder or startup evidence by itself."],
    status: "unconfigured",
  },
];

export function catalogueForCampus(campusId: string): SourceCatalogueEntry[] {
  return SOURCE_CATALOGUE.filter((e) => e.campus === campusId);
}

export function globalCatalogue(): SourceCatalogueEntry[] {
  return SOURCE_CATALOGUE.filter((e) => e.campus === null);
}

const TIER_RANK: Record<Tier, number> = { S: 0, A: 1, B: 2, C: 3, D: 4 };
export function compareTiers(a: Tier, b: Tier): number {
  return TIER_RANK[a] - TIER_RANK[b];
}

// A row from the live `sources` table — kept minimal/structural here to avoid
// a circular import with lib/domain/queries.ts (which imports this file).
export interface LiveSourceInfo {
  id: string;
  status: string;
  lastSuccessAt: string | null;
  discoveredLeadCount: number;
  reviewedRelevantCount: number;
  error: string | null;
  founderScoutTier: string | null;
  startupScoutTier: string | null;
  tierOverrideBy: string | null;
  tierOverrideAt: string | null;
  tierOverrideReason: string | null;
  communitySignal: CommunitySignal | null;
}

export interface SourceCard extends SourceCatalogueEntry {
  live?: LiveSourceInfo;
}

// Merges the static catalogue with live DB rows. For implemented sources, the
// DB's tier columns win (so a manual override actually takes effect) — the
// catalogue's why/extract/don't-infer text is still used since that's
// editorial content, not something an override changes.
export function buildSourceCards(liveSources: LiveSourceInfo[]): SourceCard[] {
  const liveById = new Map(liveSources.map((s) => [s.id, s]));
  return SOURCE_CATALOGUE.map((entry) => {
    const live = entry.dbSourceId ? liveById.get(entry.dbSourceId) : undefined;
    if (!live) return { ...entry };
    return {
      ...entry,
      founderScoutTier: (live.founderScoutTier as Tier) || entry.founderScoutTier,
      startupScoutTier: (live.startupScoutTier as Tier) || entry.startupScoutTier,
      live,
    };
  });
}
