// People named on public program pages gathered for the founder-signals table.
// A row is inserted only when that page prints the name. Namesake collisions
// that are not the same campus record are omitted below, not merged.
//
//   npx tsx scripts/ingest/import-founder-signals.ts

import crypto from "node:crypto";
import { getDb, newId, nowIso } from "../../lib/db/client";
import { normalizeCompanyName } from "../../lib/domain/dedupe";
import { recomputePersonEnrollment } from "../../lib/domain/enrollment-store";
import { assembleProjectFacts } from "../../lib/domain/facts";
import { evaluateAllGates } from "../../lib/screening/gates";

const WAF = "https://ai-analytics.wharton.upenn.edu/for-students/wharton-analytics-fellows/";
const BOARD = "https://ai-analytics.wharton.upenn.edu/about/student-advisory-board/";
const HUNT = "https://huntsman.upenn.edu/";
const VIP = "https://venturelab.upenn.edu/vip-peer-advisors";
const PBC = "https://pennblockchain.com/about-us";
const PBC_CONF = "https://pennblockchain.com/";
const MET = "https://met.berkeley.edu/current-students/student-board/";

interface ClaimIn {
  sourceName: string;
  url: string;
  excerpt: string;
}

interface CompanyIn {
  name: string;
  description: string;
  url: string;
  excerpt: string;
}

interface PersonIn {
  name: string;
  campusId: "univ_penn" | "univ_berkeley";
  campus: string;
  signalKey: string;
  status: "potential" | "founder";
  potentialSignal: string | null;
  role: string;
  claims: ClaimIn[];
  company?: CompanyIn;
}

const BOARD_SRC = "Wharton AI & Analytics Initiative Student Advisory Board";
const WAF_SRC = "Wharton Analytics Fellows";

function board(name: string, signalKey: string, role: string, excerpt: string, potentialSignal: string): PersonIn {
  return {
    name,
    campusId: "univ_penn",
    campus: "Penn",
    signalKey,
    status: "potential",
    potentialSignal,
    role,
    claims: [{ sourceName: BOARD_SRC, url: BOARD, excerpt }],
  };
}

const people: PersonIn[] = [
  {
    name: "Frank Ma",
    campusId: "univ_penn",
    campus: "Penn",
    signalKey: "Wharton Analytics Fellows",
    status: "potential",
    potentialSignal: "Wharton Analytics Fellows board member (W'27) listed on the Wharton AI & Analytics Initiative Student Advisory Board.",
    role: "Wharton Analytics Fellows board",
    claims: [
      {
        sourceName: WAF_SRC,
        url: WAF,
        excerpt:
          "Wharton Analytics Fellows board: My name is Frank Ma and I am a junior studying Finance, Statistics and Computer Science. Since joining WAF, I have worked on projects with Fox Entertainment and Orchard Global Asset Management.",
      },
      {
        sourceName: BOARD_SRC,
        url: BOARD,
        excerpt:
          "Frank Ma, W'27. Wharton AI & Analytics Initiative Student Advisory Board. Wharton Analytics Fellows: My name is Frank Ma and I am a junior studying Finance, Statistics and Computer Science.",
      },
    ],
  },
  {
    name: "Ashwin Ranjan",
    campusId: "univ_penn",
    campus: "Penn",
    signalKey: "Wharton Analytics Fellows",
    status: "potential",
    potentialSignal: "Wharton Analytics Fellows board member. The page says he is a sophomore studying Electrical Engineering and Math.",
    role: "Wharton Analytics Fellows board",
    claims: [
      {
        sourceName: WAF_SRC,
        url: WAF,
        excerpt:
          "Wharton Analytics Fellows board: My name is Ashwin Ranjan and I'm a sophomore studying Electrical Engineering and Math. With WAF, I've worked on developing drug pricing strategies with RXSense and nurse shift fulfillment with ShiftKey.",
      },
    ],
  },
  {
    name: "Ned Sekula",
    campusId: "univ_penn",
    campus: "Penn",
    signalKey: "Wharton Analytics Fellows",
    status: "potential",
    potentialSignal: "Wharton Analytics Fellows member (SEAS'27) on the Wharton AI & Analytics Initiative Student Advisory Board.",
    role: "Wharton Analytics Fellows board",
    claims: [
      {
        sourceName: WAF_SRC,
        url: WAF,
        excerpt:
          "Wharton Analytics Fellows board: My name is Ned Sekula, and I am an undergraduate at the University of Pennsylvania studying Computer Science and Classics. I have been in WAF since 25sp.",
      },
      {
        sourceName: BOARD_SRC,
        url: BOARD,
        excerpt: "Ned Sekula, SEAS'27. Wharton AI & Analytics Initiative Student Advisory Board. Wharton Analytics Fellows.",
      },
    ],
  },
  {
    name: "Val Tham",
    campusId: "univ_penn",
    campus: "Penn",
    signalKey: "Wharton Analytics Fellows",
    status: "potential",
    potentialSignal: "Wharton Analytics Fellows board member. The page says he is a junior studying Finance, Statistics and Computer Science.",
    role: "Wharton Analytics Fellows board",
    claims: [
      {
        sourceName: WAF_SRC,
        url: WAF,
        excerpt:
          "Wharton Analytics Fellows board: I'm Val Tham and I'm a junior studying Finance, Statistics and Computer Science. This is my second semester with WAF.",
      },
    ],
  },
  {
    name: "Nicholas Wu",
    campusId: "univ_penn",
    campus: "Penn",
    signalKey: "Wharton Analytics Fellows",
    status: "potential",
    potentialSignal: "Wharton Analytics Fellows board member. The page says he is a junior studying Finance and Computer Science.",
    role: "Wharton Analytics Fellows board",
    claims: [
      {
        sourceName: WAF_SRC,
        url: WAF,
        excerpt:
          "Wharton Analytics Fellows board: I'm Nicholas Wu and I'm a junior studying Finance and Computer Science. This is my third semester with WAF, and I have previously worked on projects with RxSense and Accenture.",
      },
    ],
  },
  board(
    "Bruno Basner",
    "Wharton AI & Analytics student leaders",
    "Wharton AI & Analytics Initiative Student Advisory Board",
    "Bruno Basner, W'26. Bruno Basner is a junior at Wharton, concentrating in Statistics and Finance. He is the Co-President of the Wharton Undergraduate Sports Business Club. Wharton AI & Analytics Initiative Student Advisory Board.",
    "Wharton AI & Analytics Initiative Student Advisory Board (W'26), Co-President of the Wharton Undergraduate Sports Business Club."
  ),
  board(
    "David Bromberg",
    "Wharton AI & Analytics student leaders",
    "Wharton AI & Analytics Initiative Student Advisory Board",
    "David Bromberg, WG'26. David Bromberg is an MBA candidate at the Wharton School. David serves as the Co-President of the Wharton AI & Analytics club. Wharton AI & Analytics Initiative Student Advisory Board.",
    "Wharton AI & Analytics Initiative Student Advisory Board (WG'26), Co-President of the Wharton AI & Analytics club."
  ),
  board(
    "Katherine Comer",
    "Wharton AI & Analytics student leaders",
    "Wharton AI & Analytics Initiative Student Advisory Board",
    "Katherine Comer, W'26, is studying Statistics at Wharton. She currently serves as the Editor-in-Chief of the Wharton Sports Analytics Journal. Wharton AI & Analytics Initiative Student Advisory Board.",
    "Wharton AI & Analytics Initiative Student Advisory Board (W'26)."
  ),
  board(
    "Anjali Dhupam",
    "Huntsman Program",
    "Huntsman Program; Wharton AI & Analytics Initiative Student Advisory Board",
    "Anjali Dhupam, W'27, C'27 is a junior from Atlanta, GA in the Huntsman Program studying business and international studies. Wharton AI & Analytics Initiative Student Advisory Board.",
    "Huntsman Program student (W'27, C'27) on the Wharton AI & Analytics Initiative Student Advisory Board."
  ),
  board(
    "Akhila Guttikonda",
    "Wharton AI & Analytics student leaders",
    "Wharton AI & Analytics Initiative Student Advisory Board",
    "Akhila Guttikonda, C'26 is a senior in the College, studying Neuroscience and Nutrition Science. Wharton AI & Analytics Initiative Student Advisory Board.",
    "Wharton AI & Analytics Initiative Student Advisory Board (C'26)."
  ),
  board(
    "Ignacio Hounie",
    "Wharton AI & Analytics student leaders",
    "Wharton AI & Analytics Initiative Student Advisory Board",
    "Ignacio Hounie, GrE'26 is a third-year doctoral candidate at the University of Pennsylvania in the School of Engineering and Applied Science. Wharton AI & Analytics Initiative Student Advisory Board.",
    "Wharton AI & Analytics Initiative Student Advisory Board (GrE'26), Penn Engineering doctoral candidate."
  ),
  board(
    "Akshit Kalra",
    "Wharton AI & Analytics student leaders",
    "Wharton AI & Analytics Initiative Student Advisory Board",
    "Akshit Kalra, WG'26 is an MBA candidate at the Wharton School, majoring in Entrepreneurship & Innovation. Wharton AI & Analytics Initiative Student Advisory Board.",
    "Wharton AI & Analytics Initiative Student Advisory Board (WG'26), Wharton MBA in Entrepreneurship & Innovation."
  ),
  board(
    "Athena Krikorian",
    "Wharton AI & Analytics student leaders",
    "Wharton AI & Analytics Initiative Student Advisory Board",
    "Athena Krikorian, C'27. Athena is a junior in the college studying Biology, Data Science, and Healthcare Management. Wharton AI & Analytics Initiative Student Advisory Board.",
    "Wharton AI & Analytics Initiative Student Advisory Board (C'27)."
  ),
  board(
    "Sean Lee",
    "AI@Penn",
    "AI@Penn Co-Founder and Co-President",
    "Sean Lee, W'27 is a junior at Wharton, concentrating in Finance and Entrepreneurship & Innovation. He is the Co-Founder and Co-President of AI@Penn. The page says he previously founded an AI chatbot startup for legal contract automation and does not name that company. Wharton AI & Analytics Initiative Student Advisory Board.",
    "AI@Penn Co-Founder and Co-President (W'27) on the Wharton AI & Analytics Initiative Student Advisory Board. The page says he previously founded an unnamed AI chatbot startup."
  ),
  board(
    "Leah Liu",
    "Wharton AI & Analytics student leaders",
    "Wharton AI & Analytics Initiative Student Advisory Board",
    "Leah Liu, GED'27 is a graduate candidate in Statistics at the University of Pennsylvania. She founded AIED@Penn, a student-led organization. Wharton AI & Analytics Initiative Student Advisory Board.",
    "Wharton AI & Analytics Initiative Student Advisory Board (GED'27). The page says she founded the student organization AIED@Penn."
  ),
  board(
    "Sijie Mei",
    "Wharton AI & Analytics student leaders",
    "Wharton AI & Analytics Initiative Student Advisory Board",
    "Sijie Mei, GED'27. Sijie is a dual-major M.S.Ed student in SMART and Intercultural Communication. Wharton AI & Analytics Initiative Student Advisory Board.",
    "Wharton AI & Analytics Initiative Student Advisory Board (GED'27)."
  ),
  board(
    "Siri Paruchuri",
    "Wharton AI & Analytics student leaders",
    "Wharton AI & Analytics Initiative Student Advisory Board",
    "Siri Paruchuri, W'28. Siri Paruchuri is a sophomore in Wharton. Wharton AI & Analytics Initiative Student Advisory Board.",
    "Wharton AI & Analytics Initiative Student Advisory Board (W'28)."
  ),
  board(
    "Alok Shah",
    "Wharton AI & Analytics student leaders",
    "Wharton AI & Analytics Initiative Student Advisory Board",
    "Alok Shah, SEAS'26. Alok is a CIS and Math major. He currently leads MLR@Penn. Wharton AI & Analytics Initiative Student Advisory Board.",
    "Wharton AI & Analytics Initiative Student Advisory Board (SEAS'26). The page says he leads MLR@Penn."
  ),
  board(
    "Samuel Sosa",
    "Wharton AI & Analytics student leaders",
    "Wharton AI & Analytics Initiative Student Advisory Board",
    "Samuel Sosa, SEAS'28. Samuel Sosa is a sophomore pursuing a BSE in Computer Science from the School of Engineering. Wharton AI & Analytics Initiative Student Advisory Board.",
    "Wharton AI & Analytics Initiative Student Advisory Board (SEAS'28)."
  ),
  board(
    "Felix Tam",
    "Wharton AI & Analytics student leaders",
    "Wharton AI & Analytics Initiative Student Advisory Board",
    "Felix Tam, WG'26 is currently an MBA Candidate at the Wharton School. He serves as Co-President of the Wharton AI & Analytics Club. Wharton AI & Analytics Initiative Student Advisory Board.",
    "Wharton AI & Analytics Initiative Student Advisory Board (WG'26), Co-President of the Wharton AI & Analytics Club."
  ),
  board(
    "Stefan Tsakalakis",
    "Wharton AI & Analytics student leaders",
    "Wharton AI & Analytics Initiative Student Advisory Board",
    "Stefan Tsakalakis, W'27 is a junior from San Francisco studying finance and marketing at Wharton. He has served as co-president of the AI Business Club for two years. Wharton AI & Analytics Initiative Student Advisory Board.",
    "Wharton AI & Analytics Initiative Student Advisory Board (W'27)."
  ),
  board(
    "Praja Tickoo",
    "Wharton AI & Analytics student leaders",
    "Wharton AI & Analytics Initiative Student Advisory Board",
    "Praja Tickoo, W'27 is a junior studying Economics at Wharton. He founded the AI Business Club at Penn and has served as co-president for the last two years. Wharton AI & Analytics Initiative Student Advisory Board.",
    "Wharton AI & Analytics Initiative Student Advisory Board (W'27). The page says he founded the AI Business Club at Penn."
  ),
  board(
    "Ethan Yu",
    "Wharton AI & Analytics student leaders",
    "Wharton AI & Analytics Initiative Student Advisory Board",
    "Ethan Yu, SEAS'26. Ethan Yu is a senior from Campbell, CA majoring in CIS, Mathematics, and Music and completing his masters in Robotics. Wharton AI & Analytics Initiative Student Advisory Board.",
    "Wharton AI & Analytics Initiative Student Advisory Board (SEAS'26)."
  ),
  board(
    "Hansheng Zhu",
    "AI@Penn",
    "AI@Penn Founder and Co-President",
    "Hans Zhu, SEAS'27. Hansheng Zhu is a junior in Penn Engineering's AI Program and the Founder/Co-President of AI@Penn. Wharton AI & Analytics Initiative Student Advisory Board.",
    "AI@Penn Founder and Co-President (SEAS'27) on the Wharton AI & Analytics Initiative Student Advisory Board."
  ),
  {
    name: "Alejandra Soria Andrade",
    campusId: "univ_penn",
    campus: "Penn",
    signalKey: "Huntsman Program",
    status: "potential",
    potentialSignal: "Huntsman Program student profile. The page prints Class Year: 2025.",
    role: "Huntsman Program student",
    claims: [
      {
        sourceName: "The Huntsman Program",
        url: HUNT,
        excerpt:
          "Alejandra Soria Andrade. Hometown: Guayaquil, Ecuador. Target Language: Portuguese. Class Year: 2025. The Huntsman Program in International Studies and Business.",
      },
    ],
  },
  {
    name: "Mia Liu",
    campusId: "univ_penn",
    campus: "Penn",
    signalKey: "Huntsman Program",
    status: "potential",
    potentialSignal: "Huntsman Program student. The page prints a student reflection by Mia Liu (C'28 W'28).",
    role: "Huntsman Program student",
    claims: [
      {
        sourceName: "The Huntsman Program",
        url: HUNT,
        excerpt: "Student Reflection by Mia Liu (C'28 W'28, French target). The Huntsman Program in International Studies and Business.",
      },
    ],
  },
  {
    name: "Eric Li",
    campusId: "univ_penn",
    campus: "Penn",
    signalKey: "Huntsman Program",
    status: "potential",
    potentialSignal: "Huntsman Program student. The page prints a student reflection by Eric Li (C'28 W'28).",
    role: "Huntsman Program student",
    claims: [
      {
        sourceName: "The Huntsman Program",
        url: HUNT,
        excerpt: "Student Reflection by Eric Li (C'28 W'28, Spanish target). The Huntsman Program in International Studies and Business.",
      },
    ],
  },
  vip("Sarah Luthra", "VIP Peer Advisors Co-President, M&T", "Sarah Luthra. Co-President. M&T: Computer Science and Business. Class of 2024. VIP Peer Advisors."),
  vip("Jake Brooks", "VIP Peer Advisors Co-President, M&T", "Jake Brooks. Co-President. M&T: Computer Science and Business. Class of 2024. VIP Peer Advisors."),
  vip("Ryan Gannon", "VIP Peer Advisors VP of Social Outreach, M&T", "Ryan Gannon. VP of Social Outreach. M&T: Computer Science and Business. Class of 2024. VIP Peer Advisors."),
  vip("Alexander Cho", "VIP Peer Advisors Secretary", "Alexander Cho. Secretary. Computer Science. Class of 2025. VIP Peer Advisors."),
  vip(
    "Leyla Theunissen",
    "VIP Peer Advisors Treasurer",
    "Leyla Theunissen. Treasurer. Computer Science and Cognitive Science. Class of 2025. VIP Peer Advisors."
  ),
  vip(
    "Anthony Kim",
    "VIP Peer Advisors VP of Bootcamps",
    "Anthony Kim. VP of Bootcamps. Mechanical Engineering and Applied Mechanics. Class of 2025. VIP Peer Advisors."
  ),
  vip(
    "Prakruthi Raghavendra",
    "VIP Peer Advisors VP of Marketing",
    "Prakruthi Raghavendra. VP of Marketing. Computer Science and Finance. Class of 2024. VIP Peer Advisors."
  ),
  pbc("Winnie Wang", "Penn Blockchain President", "Winnie Wang. President. CS @ Penn UG. About Penn Blockchain, the University of Pennsylvania's blockchain club."),
  {
    name: "Ellis Osborn",
    campusId: "univ_penn",
    campus: "Penn",
    signalKey: "Penn Blockchain",
    status: "founder",
    potentialSignal: null,
    role: "Penn Blockchain President",
    claims: [
      {
        sourceName: "Penn Blockchain about",
        url: PBC,
        excerpt: "Ellis Osborn. President. Finance, OIDD, CS @ Penn UG. About Penn Blockchain, the University of Pennsylvania's blockchain club.",
      },
      {
        sourceName: "Penn Blockchain Conference 2026",
        url: PBC_CONF,
        excerpt: "Penn Blockchain Conference speaker list: Ellis Osborn Co-Founder | Saturn. Contact list: Ellis Osborn Penn Blockchain President.",
      },
    ],
    company: {
      name: "Saturn",
      description: "Penn Blockchain Conference speaker list names Ellis Osborn as Co-Founder of Saturn.",
      url: PBC_CONF,
      excerpt: "Penn Blockchain Conference speaker list: Ellis Osborn Co-Founder | Saturn.",
    },
  },
  pbc("Hannah Fang", "Penn Blockchain President", "Hannah Fang. President. Math, CS @ Penn UG. About Penn Blockchain, the University of Pennsylvania's blockchain club."),
  pbc(
    "Mitchell Moos",
    "Penn Blockchain Governance Director",
    "Mitchell Moos. Governance Director. Wharton MBA. About Penn Blockchain, the University of Pennsylvania's blockchain club."
  ),
  pbc(
    "Kimberly Liang",
    "Penn Blockchain Governance Director",
    "Kimberly Liang. Governance Director. Finance, Stats, CS @ Penn UG. About Penn Blockchain, the University of Pennsylvania's blockchain club."
  ),
  pbc(
    "Lakshman Swaminathan",
    "Penn Blockchain Research Director",
    "Lakshman Swaminathan. Research Director. CS @ Penn UG. About Penn Blockchain, the University of Pennsylvania's blockchain club."
  ),
  pbc("Guru Bazawada", "Penn Blockchain Dev Director", "Guru Bazawada. Dev Director. Logic @ Penn UG. About Penn Blockchain, the University of Pennsylvania's blockchain club."),
  pbc(
    "Pragya Singh",
    "Penn Blockchain Dev Director",
    "Pragya Singh. Dev Director. CS, Finance, Stats @ Penn UG. About Penn Blockchain, the University of Pennsylvania's blockchain club."
  ),
  pbc(
    "Maggie Schwierking",
    "Penn Blockchain Investments Director",
    "Maggie Schwierking. Investments Director. CS, Finance @ Penn UG. About Penn Blockchain, the University of Pennsylvania's blockchain club."
  ),
  pbc(
    "Edwin Mui",
    "Penn Blockchain Infrastructure Director",
    "Edwin Mui. Infrastructure Director. CS, Cognitive Science @ Penn UG. About Penn Blockchain, the University of Pennsylvania's blockchain club."
  ),
  met("Erfan Ballew", "M.E.T. '28", "Co-President"),
  met("Jaansi Parsa", "M.E.T. '28", "Co-President"),
  met("Cyriana Lara", "M.E.T. '29", "Co-VP of Marketing & Engagement"),
  met("Jiayi Ji", "M.E.T. '29", "Co-VP of Marketing & Engagement"),
  met("Veer Sahasi", "M.E.T. '29", "VP of External Relations"),
  met("Ishita Samadhiya", "M.E.T. '29", "Co-VP of Diversity, Equity, and Inclusion"),
  met("Neha Gadde", "M.E.T. '29", "Co-VP of Diversity, Equity, and Inclusion"),
  met("Aryan Agarwal", "M.E.T. '29", "Co-VP of Social Integration"),
  met("Kabi Swamy", "M.E.T. '29", "Co-VP of Social Integration"),
  met("Vamika Singhal", "M.E.T. '29", "Co-VP of Student Resources"),
  met("Asmi Sawant", "M.E.T. '29", "Co-VP of Student Resources"),
  met("Tiffany Ling", "M.E.T. '29", "Co-VP of Finance"),
];

function vip(name: string, role: string, excerpt: string): PersonIn {
  return {
    name,
    campusId: "univ_penn",
    campus: "Penn",
    signalKey: "VIP Peer Advisors",
    status: "potential",
    potentialSignal: `${role}. ${excerpt.includes("M&T") ? "Jerome Fisher M&T student on the VIP Peer Advisors board." : "VIP Peer Advisors board."}`,
    role,
    claims: [{ sourceName: "VIP Peer Advisors", url: VIP, excerpt }],
  };
}

function pbc(name: string, role: string, excerpt: string): PersonIn {
  return {
    name,
    campusId: "univ_penn",
    campus: "Penn",
    signalKey: "Penn Blockchain",
    status: "potential",
    potentialSignal: `${role}. The Penn Blockchain about page lists them in club leadership.`,
    role,
    claims: [{ sourceName: "Penn Blockchain about", url: PBC, excerpt }],
  };
}

function met(name: string, yearToken: string, title: string): PersonIn {
  const excerpt = `${name} (${yearToken}) ${title} of the UC Berkeley Management, Entrepreneurship, & Technology Student Board.`;
  return {
    name,
    campusId: "univ_berkeley",
    campus: "UC Berkeley",
    signalKey: "M.E.T.",
    status: "potential",
    potentialSignal: excerpt,
    role: `Management, Entrepreneurship, & Technology Student Board ${title}`,
    claims: [{ sourceName: "Berkeley M.E.T. Student Board", url: MET, excerpt }],
  };
}

const OMITTED = [
  "Kevin Li: Penn Blockchain about page lists Investments Director, Data Science @ Penn Grad. An existing Penn Kevin Li is only a PennApps team member, so the namesake was left unmatched.",
  "Jasmine Wang: Penn Blockchain about page lists Treasurer, Finance @ Penn UG. The existing Penn Jasmine Wang is a Penn Labs designer marked alumnus, so the namesake was left unmatched.",
  "Brandon Wang: VIP Peer Advisors lists M&T Class of 2024 Brandon Wang. Two different Penn Brandon Wang records already exist, so this name was left unmatched.",
  "Sania Biddurukontam: the M.E.T. student board prints that spelling for the Co-VP of Finance (M.E.T. '29). An existing Berkeley M.E.T. record spells the name Sania Bidurukontam, so neither a merge nor a second person was written.",
];

function sourceKey(url: string): string {
  return `src_founder_signal_${crypto.createHash("sha1").update(url).digest("hex").slice(0, 12)}`;
}

function main() {
  const db = getDb();
  const now = nowIso();
  const createdPeople: string[] = [];
  const reusedPeople: string[] = [];
  const createdCompanies: string[] = [];
  const touched = new Set<string>();

  const upsertSource = db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at, last_success_at, discovered_lead_count)
     VALUES (?, ?, 'program', ?, ?, 2, 'manual', 'available', ?, ?, 1)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, last_attempt_at=excluded.last_attempt_at, last_success_at=excluded.last_success_at`
  );
  const claimExists = db.prepare(
    `SELECT id FROM claims WHERE entity_type = ? AND entity_id = ? AND source_url = ? AND excerpt = ? LIMIT 1`
  );
  const insertClaim = db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, source_url, published_date, retrieved_at, label, verification_state)
     VALUES (?, ?, ?, 'program_membership', ?, ?, ?, ?, NULL, ?, 'observed_fact', 'unverified')`
  );

  function ensureSource(claim: ClaimIn, campusId: string): string {
    const id = sourceKey(claim.url);
    upsertSource.run(id, claim.sourceName, claim.url, JSON.stringify([campusId]), now, now);
    return id;
  }

  function addClaim(entityType: "person" | "project", entityId: string, claim: ClaimIn, campusId: string): string | null {
    const existing = claimExists.get(entityType, entityId, claim.url, claim.excerpt) as { id: string } | undefined;
    if (existing) return existing.id;
    const sourceId = ensureSource(claim, campusId);
    const id = newId("claim");
    insertClaim.run(id, entityType, entityId, JSON.stringify({ excerpt: claim.excerpt }), claim.excerpt, sourceId, claim.url, now);
    return id;
  }

  function campusMatches(personId: string, campusId: string): { atCampus: number; anywhere: number } {
    const atCampus = db.prepare(`SELECT COUNT(*) as c FROM affiliations WHERE person_id = ? AND university_id = ?`).get(personId, campusId) as { c: number };
    const anywhere = db.prepare(`SELECT COUNT(*) as c FROM affiliations WHERE person_id = ?`).get(personId) as { c: number };
    return { atCampus: atCampus.c, anywhere: anywhere.c };
  }

  function resolvePerson(person: PersonIn): { id: string; created: boolean } | null {
    const matches = db.prepare(`SELECT id FROM people WHERE lower(name) = lower(?)`).all(person.name) as { id: string }[];
    const atCampus = matches.filter((row) => campusMatches(row.id, person.campusId).atCampus > 0);
    if (matches.length === 0) {
      const id = newId("person");
      db.prepare(
        `INSERT INTO people (id, name, aliases_json, founder_status, potential_signal, created_at)
         VALUES (?, ?, '[]', ?, ?, ?)`
      ).run(id, person.name, person.status, person.potentialSignal, now);
      createdPeople.push(`${person.name} (${person.campus}, ${person.signalKey})`);
      return { id, created: true };
    }
    if (atCampus.length === 1) return { id: atCampus[0].id, created: false };
    if (matches.length === 1 && campusMatches(matches[0].id, person.campusId).anywhere === 0) return { id: matches[0].id, created: false };
    console.log(`SKIP ambiguous ${person.name}: ${matches.length} existing people, ${atCampus.length} at ${person.campus}`);
    return null;
  }

  function applyStatus(personId: string, person: PersonIn) {
    const row = db.prepare(`SELECT founder_status FROM people WHERE id = ?`).get(personId) as { founder_status: string | null };
    if (person.status === "founder") {
      db.prepare(`UPDATE people SET founder_status = 'founder', potential_signal = NULL WHERE id = ?`).run(personId);
      return;
    }
    if (row.founder_status === "founder") return;
    db.prepare(`UPDATE people SET founder_status = 'potential', potential_signal = ? WHERE id = ?`).run(person.potentialSignal, personId);
  }

  function ensureCompany(person: PersonIn, personId: string, claimId: string | null) {
    const company = person.company;
    if (!company) return;
    const named = db.prepare(`SELECT id FROM projects WHERE lower(name) = lower(?) AND kind = 'company'`).all(company.name) as { id: string }[];
    const normalized = normalizeCompanyName(company.name);
    const byNorm = (db.prepare(`SELECT id, name FROM projects WHERE kind = 'company'`).all() as { id: string; name: string }[]).filter(
      (row) => normalizeCompanyName(row.name) === normalized
    );
    const hits = named.length ? named : byNorm;
    if (hits.length > 1) {
      console.log(`SKIP company ${company.name}: ${hits.length} matches`);
      return;
    }
    let id = hits[0]?.id;
    if (!id) {
      id = newId("proj");
      db.prepare(
        `INSERT INTO projects (id, name, aliases_json, kind, description, website_url, primary_link, primary_link_kind, is_portfolio_reference, is_investable_candidate)
         VALUES (?, ?, '[]', 'company', ?, NULL, ?, 'other', 0, 1)`
      ).run(id, company.name, company.description, company.url);
      createdCompanies.push(`${company.name} (${person.campus})`);
      const facts = assembleProjectFacts(db, id);
      const upsert = db.prepare(
        `INSERT INTO gate_results (id, project_id, gate_name, result, rationale, evaluated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(project_id, gate_name) DO UPDATE SET result=excluded.result, rationale=excluded.rationale, evaluated_at=excluded.evaluated_at`
      );
      for (const outcome of evaluateAllGates(facts)) upsert.run(newId("gate"), id, outcome.gate, outcome.result, outcome.rationale);
    }
    const projectClaim = addClaim("project", id, { sourceName: "Penn Blockchain Conference 2026", url: company.url, excerpt: company.excerpt }, person.campusId);
    const evidence = projectClaim || claimId;
    const uni = db
      .prepare(
        `SELECT id FROM relationships WHERE source_entity_type='project' AND source_entity_id=? AND target_entity_type='university' AND target_entity_id=? AND relationship_type='affiliated_with'`
      )
      .get(id, person.campusId);
    if (!uni) {
      db.prepare(
        `INSERT INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json, verification_state)
         VALUES (?, 'project', ?, 'university', ?, 'affiliated_with', ?, 'affiliation_only')`
      ).run(newId("rel"), id, person.campusId, JSON.stringify(evidence ? [evidence] : []));
    }
    const role = db.prepare(`SELECT id FROM person_project_roles WHERE person_id=? AND project_id=? AND role='founder'`).get(personId, id);
    if (!role) {
      db.prepare(`INSERT INTO person_project_roles (id, person_id, project_id, role, claim_id) VALUES (?, ?, ?, 'founder', ?)`).run(
        newId("ppr"),
        personId,
        id,
        evidence
      );
    }
    const founded = db
      .prepare(
        `SELECT id FROM relationships WHERE source_entity_type='person' AND source_entity_id=? AND target_entity_type='project' AND target_entity_id=? AND relationship_type='founded'`
      )
      .get(personId, id);
    if (!founded) {
      db.prepare(
        `INSERT INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json, verification_state)
         VALUES (?, 'person', ?, 'project', ?, 'founded', ?, 'affiliation_only')`
      ).run(newId("rel"), personId, id, JSON.stringify(evidence ? [evidence] : []));
    }
  }

  const tx = db.transaction(() => {
    // The first pass stored the board's doubled-d spelling as a second person.
    const duplicate = db.prepare(`SELECT id FROM people WHERE name = 'Sania Biddurukontam'`).get() as { id: string } | undefined;
    if (duplicate) {
      db.prepare(`DELETE FROM affiliations WHERE person_id = ?`).run(duplicate.id);
      db.prepare(`DELETE FROM person_project_roles WHERE person_id = ?`).run(duplicate.id);
      db.prepare(`DELETE FROM relationships WHERE source_entity_id = ? OR target_entity_id = ?`).run(duplicate.id, duplicate.id);
      db.prepare(`DELETE FROM claims WHERE entity_id = ?`).run(duplicate.id);
      db.prepare(`DELETE FROM people WHERE id = ?`).run(duplicate.id);
      console.log("Removed doubled-d duplicate Sania Biddurukontam", duplicate.id);
    }
    for (const person of people) {
      const resolved = resolvePerson(person);
      if (!resolved) continue;
      if (!resolved.created) reusedPeople.push(`${person.name} -> ${resolved.id} (${person.signalKey})`);
      let firstClaim: string | null = null;
      for (const claim of person.claims) {
        const id = addClaim("person", resolved.id, claim, person.campusId);
        if (!firstClaim && id) firstClaim = id;
      }
      const aff = db.prepare(`SELECT id FROM affiliations WHERE person_id=? AND university_id=? AND role=?`).get(resolved.id, person.campusId, person.role);
      if (!aff) {
        db.prepare(`INSERT INTO affiliations (id, person_id, university_id, role, status, claim_id) VALUES (?, ?, ?, ?, 'unverified', ?)`).run(
          newId("aff"),
          resolved.id,
          person.campusId,
          person.role,
          firstClaim
        );
      }
      applyStatus(resolved.id, person);
      ensureCompany(person, resolved.id, firstClaim);
      touched.add(resolved.id);
    }
    for (const personId of touched) {
      const decision = recomputePersonEnrollment(db, personId);
      db.prepare(`UPDATE affiliations SET status = ? WHERE person_id = ?`).run(decision.status === "unknown" ? "unverified" : decision.status, personId);
    }
  });

  tx();
  db.pragma("wal_checkpoint(TRUNCATE)");

  console.log(`Created people ${createdPeople.length}`);
  for (const line of createdPeople) console.log("  new", line);
  console.log(`Reused people ${reusedPeople.length}`);
  for (const line of reusedPeople) console.log("  reuse", line);
  console.log(`Created companies ${createdCompanies.length}`);
  for (const line of createdCompanies) console.log("  company", line);
  console.log("Omitted namesakes");
  for (const line of OMITTED) console.log("  omit", line);

  const ids = [...touched];
  const summary = db
    .prepare(
      `SELECT p.name, p.founder_status, p.enrollment_status, p.enrollment_basis, p.enrollment_label, a.university_id
       FROM people p JOIN affiliations a ON a.person_id = p.id
       WHERE p.id IN (${ids.map(() => "?").join(",")})
       ORDER BY a.university_id, p.name`
    )
    .all(...ids) as { name: string; founder_status: string; enrollment_status: string; enrollment_basis: string; enrollment_label: string | null; university_id: string }[];
  const byCampus: Record<string, { potential: number; founder: number }> = {};
  for (const row of summary) {
    const bucket = (byCampus[row.university_id] ??= { potential: 0, founder: 0 });
    if (row.founder_status === "founder") bucket.founder += 1;
    else bucket.potential += 1;
  }
  console.log("Enrollment sample", JSON.stringify(summary.slice(0, 8)));
  console.log("By campus among touched affiliations", JSON.stringify(byCampus));
}

main();
