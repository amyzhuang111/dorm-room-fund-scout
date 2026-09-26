// Berkeley potential-founder pass, narrowed enrollment excerpts, and sourced
// funding rounds. Every excerpt is copied from a page fetched for this import.
// Name-only LinkedIn hits are not stored. Run:
//   npx tsx scripts/ingest/apply-berkeley-funding-round.ts

import { getDb, newId, nowIso } from "../../lib/db/client";
import { isSignalTier, preferSignalTier, type SignalTier } from "../../lib/domain/signal-tier";

const NOW = nowIso();

const HACK_URL = "https://hackberkeley.org/about";
const HACK_SENTENCE =
  'We\'re an organization composed of students passionate about fostering a culture of hacking, entrepreneurship, and social good via the empowerment of technology.';
const BLUEPRINT_URL = "https://calblueprint.org/about";
const BLUEPRINT_SENTENCE =
  "We're a team of UC Berkeley students that develops software pro bono for nonprofits and promotes technology for social good.";

// Roles are the line printed under the name on the fetched team page.
// A name with no role line of its own is stored as "team".
const HACK_TEAM: { name: string; role: string }[] = [
  { name: "Abby Li", role: "Cubstart Lead" },
  { name: "Allison Wang", role: "Executive Director" },
  { name: "Carl Djapardi", role: "Tech Director" },
  { name: "Charlie Huang", role: "Executive Director" },
  { name: "Collin Hargreaves", role: "team" },
  { name: "Edward Kim", role: "Marketing Lead" },
  { name: "Eric Cao", role: "Tech Lead" },
  { name: "Gary Sun", role: "team" },
  { name: "Jane Dong", role: "team" },
  { name: "Javin Ku", role: "Marketing Director" },
  { name: "Jay Chong", role: "Logistics Director" },
  { name: "Jeffrey Gong", role: "Finance Lead" },
  { name: "Jessenia Chan", role: "team" },
  { name: "Jessica Chiu", role: "team" },
  { name: "Kaden Huang", role: "team" },
  { name: "Kelly Yang", role: "team" },
  { name: "Kiana Yassini", role: "team" },
  { name: "Kylie Marcisz", role: "team" },
  { name: "Lanna Xiao", role: "team" },
  { name: "Mauricio Yeverino Penunuri", role: "team" },
  { name: "Nastasia Golembusch", role: "team" },
  { name: "Nathan Rhee", role: "team" },
  { name: "Neha Gopal", role: "team" },
  { name: "Nicole Lee", role: "team" },
  { name: "Rodin Luo", role: "team" },
  { name: "Rosy Sun", role: "team" },
  { name: "Shahene Chaouachi", role: "team" },
  { name: "Sophia Choi", role: "team" },
  { name: "Steven Zhang", role: "team" },
  { name: "Sumin Cho", role: "team" },
  { name: "Tanisha Saxena", role: "team" },
  { name: "Trinity Nguyen", role: "team" },
  { name: "Victor Hui", role: "team" },
  { name: "Victor Pham", role: "team" },
  { name: "Wallace Tang", role: "team" },
  { name: "Yutong Cui", role: "team" },
];

const BLUEPRINT_TEAM: { name: string; role: string }[] = [
  ["Aditya Pawar", "President"],
  ["Aiden Mathew", "VP of Projects"],
  ["Dylan Toh", "VP of External"],
  ["Esha Bansiya", "VP of Operations"],
  ["Kevin Yamashita", "VP of Design"],
  ["Neha Hussain", "VP of Technology"],
  ["Rachael Chen", "Internal VP"],
  ["Charlotte Law", "Project Leader"],
  ["Dhruva Bhat", "Project Leader"],
  ["Ethan Gu", "Project Leader"],
  ["Nataliia Kulieshova", "Project Leader"],
  ["Sai Tunguturu", "Project Leader"],
  ["Chuning Shang", "Designer"],
  ["Jesslyn Ruswan", "Designer"],
  ["Melissa Co", "Designer"],
  ["Philip Park", "Designer"],
  ["Yash Saswade", "Designer"],
  ["Ann James", "External Director"],
  ["Bhavita Peddi", "External Director"],
  ["Haeum Lee", "External Director"],
  ["Justin Fu", "External Director"],
  ["Liana Kong", "External Director"],
  ["Kyle Ramachandran", "External Director"],
  ["Piper Yu", "External Director"],
  ["Abhi Bellapu", "Project Developer"],
  ["Adam Kamal", "Project Developer"],
  ["Anh Vo", "Project Developer"],
  ["Carolyn Zhuang", "Project Developer"],
  ["Chelsy Zhu", "Project Developer"],
  ["Emily Markova", "Project Developer"],
  ["Emily Peng", "Project Developer"],
  ["Justin Keyo", "Developer"],
  ["Lucas Han", "Project Developer"],
  ["Lucas Ng", "Project Developer"],
  ["Manya Dhingra", "Project Developer"],
  ["Mike Morales", "Project Developer"],
  ["Niranjana Sankar", "Project Developer"],
  ["Nishka Jain", "Project Developer"],
  ["Pranav Sant", "Project Developer"],
  ["Ronald Li", "Project Developer"],
  ["Sania Bidurukontam", "Project Developer"],
  ["Stephen Hung", "Project Developer"],
  ["Tanay Pant", "Project Developer"],
  ["Wenhao (Max) Yu", "Project Developer"],
  ["William Lin", "Project Developer"],
  ["Alex Wang", "Social"],
  ["Austin Wu", "Social"],
  ["Avani Kulshreshtha", "Social"],
  ["Creighton Tucker", "Social"],
  ["Deena Sun", "Social"],
  ["Inaya Yusuf", "Social"],
  ["Jeannine Ruiz", "Social"],
  ["Joshua Huang", "Social"],
  ["Madison Lee", "Social"],
  ["Nathan Tam", "Social"],
  ["Saahil Sukhija", "Social"],
  ["Samuel Hudson", "Social"],
  ["Sarah Mou", "Social"],
  ["Sashank Balusu", "Social"],
  ["Torin Nayak", "Social"],
].map(([name, role]) => ({ name, role }));

function normName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hackTier(role: string): SignalTier {
  if (/executive director/i.test(role)) return "A";
  if (/director|lead/i.test(role)) return "B";
  return "talent";
}

interface Round {
  projectName: string;
  create?: {
    description: string;
    primaryLink: string;
    campusId?: string;
    founders: { name: string; excerpt: string; campusId?: string | null }[];
  };
  factKey: "funding_round" | "funding_total";
  valueText: string;
  amountUsd: number;
  stage?: string;
  amountText?: string;
  date?: string | null;
  leads?: string[];
  sourceUrl: string;
  excerpt: string;
}

const ROUNDS: Round[] = [
  {
    projectName: "SkyPilot",
    factKey: "funding_round",
    valueText: "Seed|$20M",
    amountUsd: 20_000_000,
    stage: "Seed",
    amountText: "$20M",
    date: "July 21, 2026",
    leads: ["Lux Capital"],
    sourceUrl:
      "https://www.prnewswire.com/news-releases/skypilot-launches-with-20m-to-accelerate-custom-intelligence-for-frontier-ai-teams-302830808.html",
    excerpt:
      "SkyPilot today announced it has launched from stealth with $20 million in seed funding. The funding round was led by Lux Capital, with participation from Amplify Partners, Coatue Management, Foundation Capital, Race Capital, The House Fund, and leading technology operators.",
  },
  {
    projectName: "Teragen Energy",
    factKey: "funding_round",
    valueText: "Pre-seed|$6M",
    amountUsd: 6_000_000,
    stage: "Pre-seed",
    amountText: "$6M",
    date: "September 9, 2026",
    leads: [],
    sourceUrl: "https://newsroom.haas.berkeley.edu/startup-teragen-energy-bets-on-fuel-cells-for-data-centers/",
    excerpt:
      "Teragen Energy, co-founded by CEO Ruofan Wang, PhD, EWMBA 25, Chief Commercial Officer Emerson Reiter, EMBA 24, and CTO Joshua Persky, just closed a $6 million pre-seed funding round.",
  },
  {
    projectName: "Phia",
    factKey: "funding_round",
    valueText: "Seed|$8M",
    amountUsd: 8_000_000,
    stage: "Seed",
    amountText: "$8M",
    date: "September 18, 2025",
    leads: ["Kleiner Perkins"],
    sourceUrl:
      "https://www.prnewswire.com/news-releases/phia-raises-8-million-seed-round-led-by-kleiner-perkins-to-build-the-ai-agent-for-shopping-302559880.html",
    excerpt:
      "Phia, the AI-powered shopping agent founded by Phoebe Gates and Sophia Kianni, today announced its $8 million seed round led by Kleiner Perkins, with participation from investors such as Hailey Bieber, Kris Jenner, Sara Blakely, Michael Rubin, Desiree Gruber, and Sheryl Sandberg.",
  },
  {
    projectName: "Dedalus Labs",
    factKey: "funding_round",
    valueText: "Seed|$11M",
    amountUsd: 11_000_000,
    stage: "Seed",
    amountText: "$11M",
    date: "October 15, 2025",
    leads: ["Kindred Ventures", "Saga Ventures"],
    sourceUrl: "https://www.dedaluslabs.ai/blog/dedalus-seed-round",
    excerpt:
      "Dedalus Labs has raised $11 million in seed funding to help developers build complex agents across any model and any tool in 5 lines of code. Kindred Ventures and Saga Ventures co-led the round, with participation from E14 Fund, Emergence Capital, Sunshine Lake, Transpose Platform, Liquid 2 Ventures, FPV Ventures, Twenty Two Ventures, Telescope Foundation, Spot VC, Operator Partners, and Y Combinator.",
  },
  {
    projectName: "Mercor",
    factKey: "funding_round",
    valueText: "Series C|$350M",
    amountUsd: 350_000_000,
    stage: "Series C",
    amountText: "$350M",
    date: "October 27, 2025",
    leads: ["Felicis"],
    sourceUrl: "https://www.mercor.com/blog/series-c/",
    excerpt:
      "Today, we're announcing our $350 million Series C funding, led by Felicis with participation from Benchmark, General Catalyst, and Robinhood Ventures. This round values Mercor at $10 billion.",
  },
  {
    projectName: "Orchard Robotics",
    factKey: "funding_round",
    valueText: "Series A|$22M",
    amountUsd: 22_000_000,
    stage: "Series A",
    amountText: "$22M",
    date: "September 3, 2025",
    leads: ["Quiet Capital", "Shine Capital"],
    sourceUrl:
      "https://digitalgroundmedia.com/technology/orchard-robotics-founded-by-a-thiel-fellow-cornell-dropout-raises-22m-for-farm-vision-ai/",
    excerpt:
      "On Wednesday, Orchard Robotics announced that it raised a $22 million Series A funding led by Quiet Capital and Shine Capital, and with participation from returning investors, including General Catalyst and Contrary.",
  },
  {
    projectName: "Series",
    factKey: "funding_round",
    valueText: "Pre-seed|$3.1M",
    amountUsd: 3_100_000,
    stage: "Pre-seed",
    amountText: "$3.1M",
    date: "April 7, 2025",
    leads: ["Parable"],
    sourceUrl: "https://hartfordbusiness.com/article/yale-students-raise-31m-in-14-days-for-ai-powered-social-platform/",
    excerpt:
      "A startup founded by two juniors at Yale University has secured $3.1 million in pre-seed funding to help launch a new AI-powered social platform. The pre-seed funding round was led by Parable, with participation from angel investor and CEO of Reddit Steve Huffman.",
  },
  {
    projectName: "Holly",
    factKey: "funding_total",
    valueText: "$2.2M announced",
    amountUsd: 2_200_000,
    sourceUrl: "https://innovationlabs.harvard.edu/articles/spring-2025-milestones",
    excerpt:
      "Holly, an AI platform reinventing government hiring, raised $2.2 million and launched a pilot with Long Beach, California, to streamline public sector recruiting.",
  },
  {
    projectName: "Edvisor",
    create: {
      description:
        "Edvisor gives instructors course packs that let them control access to AI and keep students engaged in the classroom.",
      primaryLink: "https://newsroom.haas.berkeley.edu/from-ultimate-cheating-machine-to-classroom-ally-edvisor-rethinks-ai-in-higher-ed/",
      campusId: "univ_berkeley",
      founders: [
        {
          name: "Rameez Mahmood",
          campusId: "univ_berkeley",
          excerpt:
            "Co-founders Rameez Mahmood, MBA 26, and Shariq Shah, a San Jose State computer science graduate. Through his startup, Edvisor, Mahmood is helping instructors rethink teaching and learning for an AI-native world.",
        },
        {
          name: "Shariq Shah",
          campusId: null,
          excerpt:
            "Alongside Edvisor co-founder Shariq Shah, whose AI homework helper Tutorly attracted roughly 500,000 users in three months, Mahmood saw both the promise and pitfalls of generative AI in education. Shah is described as a San Jose State computer science graduate.",
        },
      ],
    },
    factKey: "funding_round",
    valueText: "Pre-seed|$1.3M",
    amountUsd: 1_300_000,
    stage: "Pre-seed",
    amountText: "$1.3M",
    date: null,
    leads: ["Draper Associates"],
    sourceUrl: "https://newsroom.haas.berkeley.edu/from-ultimate-cheating-machine-to-classroom-ally-edvisor-rethinks-ai-in-higher-ed/",
    excerpt: "The startup already has traction, recently raising a $1.3 million pre-seed round led by Draper Associates.",
  },
  {
    projectName: "Knit Health",
    create: {
      description:
        "Knit Health is building a large clinical behavior model trained on how clinicians make decisions, incubated at UC Berkeley's Center for Healthcare Marketplace Innovation.",
      primaryLink:
        "https://newsroom.haas.berkeley.edu/uc-berkeley-researchers-entrepreneurs-create-first-healthcare-ai-model-trained-to-understand-clinical-decisions/",
      campusId: "univ_berkeley",
      founders: [
        {
          name: "Jonathan Kolstad",
          campusId: "univ_berkeley",
          excerpt:
            "Professor Jonathan Kolstad, CEO & co-founder, Knit Health. Kolstad is a professor and the Henry J. Kaiser Chair in Economic Analysis and Policy at UC Berkeley Haas.",
        },
        {
          name: "Jonas Knecht",
          campusId: "univ_berkeley",
          excerpt:
            "Jonas Knecht, Knit Health co-founder & co-CTO; UC Berkeley doctoral student in econometrics and computational precision health.",
        },
        {
          name: "Ted Robertson",
          campusId: "univ_berkeley",
          excerpt:
            "Ted Robertson, CHMI executive director; COO & co-founder, Knit Health.",
        },
        {
          name: "Maya Petersen",
          campusId: "univ_berkeley",
          excerpt:
            "Dr. Maya Petersen, a professor at UC Berkeley Public Health and the College of Computing, Data Science, and Society, is a Knit Health co-founder and chief scientist.",
        },
      ],
    },
    factKey: "funding_round",
    valueText: "Seed|$11.6M",
    amountUsd: 11_600_000,
    stage: "Seed",
    amountText: "$11.6M",
    date: "May 2026",
    leads: ["Uncork Capital", "Frist Cressey Ventures"],
    sourceUrl:
      "https://newsroom.haas.berkeley.edu/uc-berkeley-researchers-entrepreneurs-create-first-healthcare-ai-model-trained-to-understand-clinical-decisions/",
    excerpt:
      "Knit Health went live in May with $11.6 million in seed funding co-led by Uncork Capital and Frist Cressey Ventures (a pre-seed round was led by Moxxie Ventures, with participation from Coalition Operators).",
  },
];

function main() {
  const db = getDb();
  const beforeBerkeley = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT pe.id) as c FROM people pe
         JOIN affiliations a ON a.person_id = pe.id
         WHERE pe.founder_status = 'potential' AND a.university_id = 'univ_berkeley'`
      )
      .get() as { c: number }
  ).c;
  const beforeFunding = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT project_id) as c FROM company_facts
         WHERE fact_key IN ('funding_round','funding_total') AND amount_usd IS NOT NULL`
      )
      .get() as { c: number }
  ).c;
  console.log("BEFORE berkeley potential", beforeBerkeley, "funding companies", beforeFunding);

  const peopleByNorm = new Map<string, string[]>();
  for (const row of db.prepare(`SELECT id, name FROM people`).all() as { id: string; name: string }[]) {
    const key = normName(row.name);
    const list = peopleByNorm.get(key) ?? [];
    list.push(row.id);
    peopleByNorm.set(key, list);
  }

  const insertClaim = db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, source_url, published_date, retrieved_at, label, verification_state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 'observed_fact', 'unverified')`
  );
  const claimExists = db.prepare(
    `SELECT id FROM claims WHERE entity_type = ? AND entity_id = ? AND claim_type = ? AND source_url = ? AND excerpt = ? LIMIT 1`
  );
  const upsertSource = db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at, last_success_at, discovered_lead_count)
     VALUES (?, ?, 'program', ?, ?, 2, 'manual', 'available', ?, ?, 1)
     ON CONFLICT(id) DO UPDATE SET last_success_at = excluded.last_success_at`
  );

  function sourceIdFor(url: string, name: string, campus: string | null): string {
    const id = `src_round_${Buffer.from(url).toString("base64url").slice(0, 24)}`;
    upsertSource.run(id, name, url, JSON.stringify(campus ? [campus] : []), NOW, NOW);
    return id;
  }

  function addClaim(entityType: string, entityId: string, claimType: string, excerpt: string, url: string, sourceName: string, campus: string | null) {
    const existing = claimExists.get(entityType, entityId, claimType, url, excerpt) as { id: string } | undefined;
    if (existing) return existing.id;
    const id = newId("claim");
    insertClaim.run(id, entityType, entityId, claimType, JSON.stringify({ excerpt }), excerpt, sourceIdFor(url, sourceName, campus), url, NOW);
    return id;
  }

  function hasCompany(personId: string): boolean {
    const row = db
      .prepare(
        `SELECT 1 as ok FROM person_project_roles ppr
         JOIN projects p ON p.id = ppr.project_id
         WHERE ppr.person_id = ? AND p.kind = 'company' AND ppr.role LIKE '%founder%' LIMIT 1`
      )
      .get(personId) as { ok: number } | undefined;
    return Boolean(row);
  }

  function berkeleyAffiliated(personId: string): boolean {
    const row = db.prepare(`SELECT 1 as ok FROM affiliations WHERE person_id = ? AND university_id = 'univ_berkeley' LIMIT 1`).get(personId) as
      | { ok: number }
      | undefined;
    return Boolean(row);
  }

  const FORCE: Record<string, string> = {
    "eric cao": "person_mG9Pq4e1oj7r",
    "carl djapardi": "person_GbpNsCTHB3M_",
  };
  const SKIP = new Set(["justin zhang"]);

  let insertedPeople = 0;
  let updatedPeople = 0;
  const skipped: string[] = [];

  function ensurePotential(name: string, roleLabel: string, tier: SignalTier, excerpt: string, url: string, sourceName: string) {
    const key = normName(name);
    if (SKIP.has(key)) {
      skipped.push(`${name}: skipped so a different person with this name is left alone`);
      return;
    }
    let personId = FORCE[key];
    if (!personId) {
      const hits = peopleByNorm.get(key) ?? [];
      if (hits.length > 1) {
        skipped.push(`${name}: ${hits.length} existing name matches; left unmerged`);
        return;
      }
      if (hits.length === 1) {
        const id = hits[0];
        if (hasCompany(id) && !berkeleyAffiliated(id)) {
          skipped.push(`${name}: existing record is a company founder outside Berkeley; left alone`);
          return;
        }
        if (hasCompany(id)) {
          skipped.push(`${name}: already a company founder; enrollment claim only`);
          addClaim("person", id, "source_mention", excerpt, url, sourceName, "univ_berkeley");
          return;
        }
        personId = id;
      }
    }
    const claimCampus = "univ_berkeley";
    if (!personId) {
      personId = newId("person");
      db.prepare(
        `INSERT INTO people (id, name, aliases_json, signal_tier, signal_tier_basis, founder_status, potential_signal, left_school, created_at)
         VALUES (?, ?, '[]', ?, ?, 'potential', ?, 0, ?)`
      ).run(personId, name, tier, `${roleLabel} on a public Berkeley student-team page`, roleLabel, NOW);
      const list = peopleByNorm.get(key) ?? [];
      list.push(personId);
      peopleByNorm.set(key, list);
      insertedPeople += 1;
    } else {
      updatedPeople += 1;
      const row = db.prepare(`SELECT signal_tier, founder_status, potential_signal FROM people WHERE id = ?`).get(personId) as {
        signal_tier: string | null;
        founder_status: string | null;
        potential_signal: string | null;
      };
      const nextTier = preferSignalTier(row.signal_tier, tier);
      if (nextTier && nextTier !== row.signal_tier) {
        db.prepare(`UPDATE people SET signal_tier = ?, signal_tier_basis = ? WHERE id = ?`).run(
          nextTier,
          `${roleLabel} on a public Berkeley student-team page`,
          personId
        );
      }
      if (!hasCompany(personId) && row.founder_status !== "founder") {
        db.prepare(`UPDATE people SET founder_status = 'potential', potential_signal = COALESCE(potential_signal, ?) WHERE id = ?`).run(
          roleLabel,
          personId
        );
      }
    }
    const claimId = addClaim("person", personId, "potential_founder_signal", excerpt, url, sourceName, claimCampus);
    const aff = db.prepare(`SELECT id FROM affiliations WHERE person_id = ? AND university_id = 'univ_berkeley' LIMIT 1`).get(personId) as
      | { id: string }
      | undefined;
    if (!aff) {
      db.prepare(`INSERT INTO affiliations (id, person_id, university_id, role, status, claim_id) VALUES (?, ?, 'univ_berkeley', ?, 'unverified', ?)`).run(
        newId("aff"),
        personId,
        roleLabel,
        claimId
      );
    }
  }

  const tx = db.transaction(() => {
    const cmuUrl = "https://www.cmu.edu/news/stories/archives/2026/september/cmu-undergraduates-balance-learning-entrepreneurship-and-innovation";
    const cmuExcerpt =
      "For information systems major Poom Eamsobhana and computer science major Parin Pengpun, their product Haru, which uses artificial intelligence for personal scheduling, is both a reflection of their experiences at CMU, and their willingness to explore and engage beyond the lecture hall.";
    for (const id of ["person_zKpgMWgGuHTp", "person_vfuAuJqvsgRD"]) {
      addClaim("person", id, "source_mention", cmuExcerpt, cmuUrl, "Carnegie Mellon University News", null);
    }

    const stvp = "https://stvp.stanford.edu/news/building-future-meet-stvps-2026-graduating-fellows";
    const stvpClaims: { id: string; excerpt: string }[] = [
      {
        id: "person_RWbVSFuhjvE_",
        excerpt:
          "Building the Future: Meet STVP's 2026 Graduating Fellows. Congratulations to the 2026 graduates. Alex Georgiou (MS in Mechanical Engineering) is scaling his 3D gel-printing startup, Printess Technologies, which has already sold to 35 research institutions on four continents.",
      },
      {
        id: "person_-CYAiKbN2sJJ",
        excerpt:
          "Building the Future: Meet STVP's 2026 Graduating Fellows. Congratulations to the 2026 graduates. J Yim (BS in Computer Science; BA in Theater & Performance Studies) is building Kint, an AI commerce platform.",
      },
      {
        id: "person_U6WgQqfKYPUY",
        excerpt:
          "Building the Future: Meet STVP's 2026 Graduating Fellows. Congratulations to the 2026 graduates. Yousef Al-Riyami (MS in Design) is co-founding the design studio Dabble to tackle challenges in the early stages of innovation.",
      },
    ];
    for (const claim of stvpClaims) addClaim("person", claim.id, "source_mention", claim.excerpt, stvp, "Stanford Technology Ventures Program", null);

    const dpHearing = "https://www.thedp.com/article/2026/02/penn-engineering-graduates-premature-hearing-device";
    const hearing =
      "Two 2025 School of Engineering and Applied Science graduates. The cofounders, Sophie Ishiwari and Gabby Daltoso, are building a device for premature infants.";
    const sophieHas = db
      .prepare(`SELECT 1 as ok FROM claims WHERE entity_id = 'person_pRlJnpYCDcz9' AND excerpt LIKE '%2025%' LIMIT 1`)
      .get() as { ok: number } | undefined;
    if (!sophieHas) addClaim("person", "person_pRlJnpYCDcz9", "source_mention", hearing, dpHearing, "The Daily Pennsylvanian", "univ_penn");
    const gabbyHas = db
      .prepare(`SELECT 1 as ok FROM claims WHERE entity_id = 'person_UuJ1aFirKTaq' AND excerpt LIKE '%2025%' LIMIT 1`)
      .get() as { ok: number } | undefined;
    if (!gabbyHas) addClaim("person", "person_UuJ1aFirKTaq", "source_mention", hearing, dpHearing, "The Daily Pennsylvanian", "univ_penn");

    for (const person of HACK_TEAM) {
      const roleLabel = person.role === "team" ? "Hackathons @ Berkeley team" : `Hackathons @ Berkeley ${person.role}`;
      const excerpt = `${person.name} is listed as ${person.role === "team" ? "a team member" : person.role} on the Hackathons @ Berkeley team page. The page states: "${HACK_SENTENCE}"`;
      ensurePotential(person.name, roleLabel, hackTier(person.role), excerpt, HACK_URL, "Hackathons at Berkeley");
    }
    for (const person of BLUEPRINT_TEAM) {
      const roleLabel = `Cal Blueprint ${person.role}`;
      const excerpt = `${person.name} is listed as ${person.role} in the current Team section of Cal Blueprint's about page, separate from the Alumni section. Cal Blueprint's homepage states: "${BLUEPRINT_SENTENCE}"`;
      ensurePotential(person.name, roleLabel, "talent", excerpt, BLUEPRINT_URL, "Cal Blueprint");
    }

    const insertProject = db.prepare(
      `INSERT INTO projects (id, name, aliases_json, kind, description, website_url, primary_link, primary_link_kind, is_investable_candidate, created_at, updated_at)
       VALUES (?, ?, '[]', 'company', ?, NULL, ?, 'press', 1, ?, ?)`
    );
    const insertRole = db.prepare(
      `INSERT INTO person_project_roles (id, person_id, project_id, role, claim_id) VALUES (?, ?, ?, 'founder', ?)`
    );
    const insertRel = db.prepare(
      `INSERT INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json, verification_state)
       VALUES (?, 'project', ?, 'university', ?, 'affiliated_with', ?, 'unverified')`
    );
    const factExists = db.prepare(
      `SELECT id FROM company_facts WHERE project_id = ? AND fact_key = ? AND value_text = ? LIMIT 1`
    );
    const insertFact = db.prepare(
      `INSERT INTO company_facts (id, project_id, fact_key, value_text, amount_usd, amount_status, detail_json, source_url, excerpt, origin, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'press', ?)`
    );

    for (const round of ROUNDS) {
      let project = db.prepare(`SELECT id, website_url FROM projects WHERE name = ? AND kind = 'company'`).get(round.projectName) as
        | { id: string; website_url: string | null }
        | undefined;
      if (!project && round.create) {
        const id = newId("proj");
        insertProject.run(id, round.projectName, round.create.description, round.create.primaryLink, NOW, NOW);
        project = { id, website_url: null };
        const founderClaimIds: string[] = [];
        for (const founder of round.create.founders) {
          const key = normName(founder.name);
          const hits = peopleByNorm.get(key) ?? [];
          let personId: string;
          if (hits.length === 1) personId = hits[0];
          else if (hits.length > 1) {
            skipped.push(`${founder.name}: ${hits.length} name matches; founder row not created`);
            continue;
          } else {
            personId = newId("person");
            db.prepare(
              `INSERT INTO people (id, name, aliases_json, founder_status, potential_signal, left_school, created_at)
               VALUES (?, ?, '[]', 'founder', NULL, 0, ?)`
            ).run(personId, founder.name, NOW);
            const list = peopleByNorm.get(key) ?? [];
            list.push(personId);
            peopleByNorm.set(key, list);
          }
          const claimId = addClaim("person", personId, "source_mention", founder.excerpt, round.sourceUrl, round.projectName, founder.campusId ?? null);
          founderClaimIds.push(claimId);
          if (!hasCompany(personId)) {
            db.prepare(`UPDATE people SET founder_status = 'founder' WHERE id = ?`).run(personId);
          }
          const role = db
            .prepare(`SELECT id FROM person_project_roles WHERE person_id = ? AND project_id = ? LIMIT 1`)
            .get(personId, project.id) as { id: string } | undefined;
          if (!role) insertRole.run(newId("ppr"), personId, project.id, claimId);
          if (founder.campusId) {
            const aff = db
              .prepare(`SELECT id FROM affiliations WHERE person_id = ? AND university_id = ? LIMIT 1`)
              .get(personId, founder.campusId) as { id: string } | undefined;
            if (!aff) {
              db.prepare(
                `INSERT INTO affiliations (id, person_id, university_id, role, status, claim_id) VALUES (?, ?, ?, 'founder', 'unverified', ?)`
              ).run(newId("aff"), personId, founder.campusId, claimId);
            }
          }
        }
        if (round.create.campusId) {
          const rel = db
            .prepare(
              `SELECT id FROM relationships WHERE source_entity_type = 'project' AND source_entity_id = ? AND target_entity_id = ? AND relationship_type = 'affiliated_with' LIMIT 1`
            )
            .get(project.id, round.create.campusId) as { id: string } | undefined;
          if (!rel) insertRel.run(newId("rel"), project.id, round.create.campusId, JSON.stringify(founderClaimIds));
        }
        console.log("created company", round.projectName, project.id);
      }
      if (!project) {
        skipped.push(`funding ${round.projectName}: company not in the database`);
        continue;
      }
      if (round.projectName === "SkyPilot" && !project.website_url) {
        db.prepare(`UPDATE projects SET website_url = ?, updated_at = ? WHERE id = ?`).run("https://skypilot.ai", NOW, project.id);
        const webFact = factExists.get(project.id, "website", "https://skypilot.ai") as { id: string } | undefined;
        if (!webFact) {
          insertFact.run(
            newId("fact"),
            project.id,
            "website",
            "https://skypilot.ai",
            null,
            null,
            JSON.stringify({}),
            round.sourceUrl,
            "Prospective customers can visit skypilot.ai to learn more.",
            NOW
          );
        }
      }
      const existing = factExists.get(project.id, round.factKey, round.valueText) as { id: string } | undefined;
      if (existing) continue;
      const detail =
        round.factKey === "funding_round"
          ? { stage: round.stage, amountText: round.amountText, date: round.date ?? null, leads: round.leads ?? [] }
          : {};
      insertFact.run(
        newId("fact"),
        project.id,
        round.factKey,
        round.valueText,
        round.amountUsd,
        "announced",
        JSON.stringify(detail),
        round.sourceUrl,
        round.excerpt,
        NOW
      );
      addClaim("project", project.id, "funding", round.excerpt, round.sourceUrl, round.projectName, null);
      for (const lead of round.leads ?? []) {
        const investorKey = lead;
        const already = factExists.get(project.id, "investor", investorKey) as { id: string } | undefined;
        if (already) continue;
        insertFact.run(
          newId("fact"),
          project.id,
          "investor",
          investorKey,
          null,
          null,
          JSON.stringify({ batch: null, round: round.stage ?? null, kind: "lead" }),
          round.sourceUrl,
          round.excerpt,
          NOW
        );
      }
      console.log("funding", round.projectName, round.valueText);
    }
  });

  tx();
  db.pragma("wal_checkpoint(TRUNCATE)");
  console.log(`People inserted ${insertedPeople}. Existing people touched ${updatedPeople}. Skipped ${skipped.length}.`);
  for (const line of skipped) console.log("  skip", line);
  if (!isSignalTier("talent")) throw new Error("tier helper missing");
}

main();
