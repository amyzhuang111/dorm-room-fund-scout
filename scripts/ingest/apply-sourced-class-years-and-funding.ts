// Sourced class years and funding amounts. Every excerpt is copied from a
// page read for this import. A missing year or amount stays Unknown.
//   npx tsx scripts/ingest/apply-sourced-class-years-and-funding.ts

import crypto from "node:crypto";
import { getDb, newId, nowIso } from "../../lib/db/client";
import { recomputePersonEnrollment } from "../../lib/domain/enrollment-store";
import { assembleProjectFacts } from "../../lib/domain/facts";
import { evaluateAllGates } from "../../lib/screening/gates";

const NOW = nowIso();

interface YearClaim {
  personId: string;
  name: string;
  gradYear: number;
  status: "current_student" | "recent_grad";
  campus: string;
  sourceUrl: string;
  sourceName: string;
  excerpt: string;
}

// Checked and left Unknown: Andrew Choy (LinkedIn names him as a Berkeley
// student and Codeology president, no graduation year), Maggie Dong (CS & DS
// at Berkeley, high-school class of 2023 only), Tejas Prabhune (a resume says
// May 2025 and a later LinkedIn education line says 2022–2026).
const YEARS: YearClaim[] = [
  {
    personId: "person_EZQvWyD7xAwy",
    name: "Jathin Singaraju",
    gradYear: 2027,
    status: "current_student",
    campus: "University of California, Berkeley",
    sourceUrl:
      "https://www.facebook.com/berkeleymet/posts/congratulations-to-the-following-met-students-jathin-pranav-singaraju-met-27-roh/1059233199234240/",
    sourceName: "UC Berkeley M.E.T.",
    excerpt:
      "UC Berkeley Management, Entrepreneurship, & Technology Program: Jathin Pranav Singaraju (M.E.T. '27) received first place in the Snap Inc. Challenge at CalHacks.",
  },
  {
    personId: "person_vI7O67ER4eTn",
    name: "Abdullahi Aden",
    gradYear: 2027,
    status: "current_student",
    campus: "University of California, Berkeley",
    sourceUrl: "https://www.linkedin.com/in/adenabdullahi",
    sourceName: "LinkedIn",
    excerpt:
      "Bachelor's degree Computer Science at University of California, Berkeley 2018 - 2027. Working to complete my final 30 units.",
  },
  {
    personId: "person_05JOqKbUEnhP",
    name: "Anushka Levaku",
    gradYear: 2026,
    status: "recent_grad",
    campus: "University of Pennsylvania",
    sourceUrl: "https://eent.engineering.upenn.edu/resources-and-events/student-ventures-committee/",
    sourceName: "Penn Engineering",
    excerpt:
      "Penn Engineering's 2025-2026 Student Ventures Committee lists Anushka Levaku: Bachelors in Computer Science, 2026.",
  },
  {
    personId: "person_fFqWz32udgW4",
    name: "Lindsay Park",
    gradYear: 2026,
    status: "recent_grad",
    campus: "University of Pennsylvania",
    sourceUrl: "https://eent.engineering.upenn.edu/resources-and-events/student-ventures-committee/",
    sourceName: "Penn Engineering",
    excerpt:
      "Penn Engineering's 2025-2026 Student Ventures Committee lists Lindsay Park: Masters in Integrated Product Design, 2026.",
  },
  {
    personId: "person_OlkogTWVNN-J",
    name: "Zihao Zhou",
    gradYear: 2026,
    status: "recent_grad",
    campus: "University of Pennsylvania",
    sourceUrl: "https://www.linkedin.com/in/zihao-z",
    sourceName: "LinkedIn",
    excerpt: "Bachelor of Science - BS Computer Science at University of Pennsylvania 2022 - 2026.",
  },
  {
    personId: "person_xgD80nc_TeyU",
    name: "Zora Mardjoko",
    gradYear: 2026,
    status: "recent_grad",
    campus: "University of Pennsylvania",
    sourceUrl: "https://www.upennthetatau.com/zora-mardjoko",
    sourceName: "Theta Tau UPenn",
    excerpt: "University of Pennsylvania Theta Tau lists Zora Mardjoko, Major: CIS, May 2026.",
  },
  {
    personId: "person_w9NOIF2fQsv4",
    name: "Aaryan Shah",
    gradYear: 2026,
    status: "recent_grad",
    campus: "Stanford University",
    sourceUrl: "https://stvp.stanford.edu/news/building-future-meet-stvps-2026-graduating-fellows",
    sourceName: "Stanford Technology Ventures Program",
    excerpt:
      "Building the Future: Meet STVP's 2026 Graduating Fellows. Aaryan Shah (BS in Biomedical Data Science; BS in Computer Science) is joining Canvas Medical as an applied AI engineer.",
  },
  {
    personId: "person_WPSLoxsbIEVa",
    name: "Emmet Kenney",
    gradYear: 2026,
    status: "recent_grad",
    campus: "Stanford University",
    sourceUrl: "https://stvp.stanford.edu/news/building-future-meet-stvps-2026-graduating-fellows",
    sourceName: "Stanford Technology Ventures Program",
    excerpt:
      "Building the Future: Meet STVP's 2026 Graduating Fellows. Emmet Kenney (BS in Science, Technology & Society; MA in Sustainability Science & Practice) will pursue a career in the NFL while exploring a future in consulting.",
  },
  {
    personId: "person_bkhWE4oOXk6H",
    name: "Hannah Gao",
    gradYear: 2028,
    status: "current_student",
    campus: "Stanford University",
    sourceUrl: "https://stanforddaily.com/2026/02/15/12th-annual-treehacks/",
    sourceName: "The Stanford Daily",
    excerpt:
      "The Stanford Daily (Feb. 15, 2026) names sponsorships director Hannah Gao '28 among the TreeHacks organizers who interviewed Sam Altman.",
  },
  {
    personId: "person_x-naBlqGYhYe",
    name: "Rachel Fernandez",
    gradYear: 2028,
    status: "current_student",
    campus: "Stanford University",
    sourceUrl: "https://stanforddaily.com/2026/02/15/12th-annual-treehacks/",
    sourceName: "The Stanford Daily",
    excerpt:
      "The Stanford Daily (Feb. 15, 2026) names logistics director Rachel Fernandez '28 among the TreeHacks organizers who interviewed Sam Altman.",
  },
  {
    personId: "person_9rezHv1SLzHh",
    name: "Thijs Simonian",
    gradYear: 2028,
    status: "current_student",
    campus: "Stanford University",
    sourceUrl: "https://stanforddaily.com/2026/02/15/12th-annual-treehacks/",
    sourceName: "The Stanford Daily",
    excerpt:
      "The Stanford Daily (Feb. 15, 2026) names TreeHacks technology director Thijs Simonian '28.",
  },
  {
    personId: "person_-RDgNtXddkUk",
    name: "Sanjith Udupa",
    gradYear: 2028,
    status: "current_student",
    campus: "Massachusetts Institute of Technology",
    sourceUrl: "https://sanjithu.com/resume.pdf",
    sourceName: "sanjithu.com",
    excerpt:
      "Massachusetts Institute of Technology — BS, Electrical Engineering and Computer Science MAY 2028 (EXPECTED).",
  },
];

interface RoundIn {
  projectNames: string[];
  stage: string;
  amountUsd: number;
  amountText: string;
  date: string;
  leads: string[];
  investors: string[];
  sourceUrl: string;
  sourceName: string;
  excerpt: string;
  totalUsd?: number;
  totalText?: string;
}

const DYNA_URL =
  "https://www.prnewswire.com/news-releases/dyna-robotics-raises-120-million-to-advance-robotic-foundation-models-on-the-path-to-physical-artificial-general-intelligence-302556817.html";
const DYNA_SERIES_A =
  "Dyna Robotics today announced it has closed a $120 million Series A funding round, led by Robostrategy, CRV, and First Round Capital, with participation from Salesforce Ventures, NVentures (NVIDIA's venture capital arm), the Amazon Industrial Innovation Fund, Samsung Next, and LG Technology Ventures.";
const DYNA_SEED =
  "Dyna has made rapid progress since raising a $23.5 million seed round in March. First Round Capital: \"We're thrilled to lead their Seed and Series A.\"";

const ROUNDS: RoundIn[] = [
  {
    projectNames: ["Dyna Robotics"],
    stage: "Series A",
    amountUsd: 120_000_000,
    amountText: "$120M",
    date: "September 15, 2025",
    leads: ["Robostrategy", "CRV", "First Round Capital"],
    investors: [
      "Salesforce Ventures",
      "NVentures",
      "Amazon Industrial Innovation Fund",
      "Samsung Next",
      "LG Technology Ventures",
    ],
    sourceUrl: DYNA_URL,
    sourceName: "PR Newswire",
    excerpt: DYNA_SERIES_A,
  },
  {
    projectNames: ["Dyna Robotics"],
    stage: "Seed",
    amountUsd: 23_500_000,
    amountText: "$23.5M",
    date: "March 2025",
    leads: ["First Round Capital"],
    investors: [],
    sourceUrl: DYNA_URL,
    sourceName: "PR Newswire",
    excerpt: DYNA_SEED,
  },
  {
    projectNames: ["Keye"],
    stage: "Seed",
    amountUsd: 5_000_000,
    amountText: "$5M",
    date: "July 29, 2025",
    leads: ["Sorenson Capital", "General Catalyst", "Y Combinator"],
    investors: [],
    sourceUrl: "https://www.keye.co/post/keye-we-built-the-diligence-platform-we-wish-we-had",
    sourceName: "Keye",
    excerpt:
      "We're thrilled to announce our $5 million seed round, led by Sorenson Capital, General Catalyst, Y Combinator, and an exceptional group of strategic angels—from the COO of Shopify to the former CEO of InVision.",
  },
  {
    projectNames: ["Copperlane"],
    stage: "Seed",
    amountUsd: 4_100_000,
    amountText: "$4.1M",
    date: "June 12, 2026",
    leads: ["TQ Ventures"],
    investors: ["Y Combinator", "US News Digital Ventures", "Mercor", "Eight Capital"],
    sourceUrl: "https://www.housingwire.com/articles/copperlane-ai-mortgage-seed/",
    sourceName: "HousingWire",
    excerpt:
      "Copperlane, an AI-native mortgage origination platform, has raised $4.1 million in seed funding. The round was led by TQ Ventures, with participation from Y Combinator, US News Digital Ventures, Mercor, Eight Capital and others. Brianna Lin studied computer science and real estate at the University of Pennsylvania.",
  },
  {
    projectNames: ["Flagler Health"],
    stage: "Series B",
    amountUsd: 50_000_000,
    amountText: "$50M",
    date: "August 11, 2026",
    leads: ["Bessemer Venture Partners"],
    investors: ["SignalFire", "Alumni Ventures", "Streamlined", "186 Ventures", "Proof VC", "Tribeca Venture Partners", "Offscript"],
    totalUsd: 63_000_000,
    totalText: "$63M announced",
    sourceUrl:
      "https://www.financialcontent.com/article/bizwire-2026-8-11-flagler-health-raises-50-million-series-b-to-build-the-ai-operating-system-for-musculoskeletal-care",
    sourceName: "Business Wire",
    excerpt:
      "Flagler Health, an AI-native platform for musculoskeletal (MSK) healthcare, today announced it raised a $50 million Series B, bringing total funding raised to $63 million. The financing was led by Bessemer Venture Partners, with participation from SignalFire, Alumni Ventures, Streamlined, 186 Ventures, Proof VC, Tribeca Venture Partners, and Offscript. Learn more at https://www.flaglerhealth.io/.",
  },
  {
    projectNames: ["Shinkei Systems", "Shinkei Systems Corp."],
    stage: "Series A",
    amountUsd: 22_000_000,
    amountText: "$22M",
    date: "June 2025",
    leads: ["Founders Fund", "Interlagos"],
    investors: [],
    totalUsd: 30_000_000,
    totalText: "$30M announced",
    sourceUrl: "https://www.foodnavigator.com/Article/2025/09/26/shinkei-systems-launched-in-2021-is-expanding-rapidly-with-new-headquarters/",
    sourceName: "FoodNavigator",
    excerpt:
      "The move follows a $22 million Series A fundraise in June led by venture capital firms Founders Fund and Interlagos. The company has raised a total of $30 million since 2021. The tech startup, launched in 2021 by CEO Saif Khawaja and CTO Reed Ginsberg.",
  },
  {
    projectNames: ["Probook"],
    stage: "Seed",
    amountUsd: 6_000_000,
    amountText: "$6M",
    date: "June 23, 2026",
    leads: ["Sequoia Capital"],
    investors: [],
    sourceUrl:
      "https://www.globenewswire.com/news-release/2026/06/23/3316215/0/en/Probook-Raises-40M-from-Andreessen-Horowitz-and-Sequoia-to-Scale-the-AI-Operating-System-for-Home-Services.html",
    sourceName: "GlobeNewswire",
    excerpt:
      "Probook, the AI Operating System for home service businesses, today announced $40 million in funding. The investment comprises a $34 million Series A led by Andreessen Horowitz (a16z) and a $6 million Seed round led by Sequoia Capital. Sequoia also participated in the Series A. Probook founders Ben Cervantez, George Eliadis and Lewis Zhang.",
  },
  {
    projectNames: ["Probook"],
    stage: "Series A",
    amountUsd: 34_000_000,
    amountText: "$34M",
    date: "June 23, 2026",
    leads: ["Andreessen Horowitz"],
    investors: ["Sequoia Capital"],
    totalUsd: 40_000_000,
    totalText: "$40M announced",
    sourceUrl: "https://a16z.com/announcement/investing-in-probook/",
    sourceName: "Andreessen Horowitz",
    excerpt:
      "Today we are thrilled to announce that a16z is leading Probook’s $34 million Series A, bringing the company’s total funding to $40 million after a seed round led by Sequoia. CEO George Eliadis. Co-founders, CTO Lewis Zhang and Ben Cervantez.",
  },
  {
    projectNames: ["Revise Robotics"],
    stage: "Private placement",
    amountUsd: 3_617_975,
    amountText: "$3,617,975",
    date: "February 21, 2025",
    leads: [],
    investors: [],
    sourceUrl: "https://www.sec.gov/Archives/edgar/data/2069529/000206952925000001/0002069529-25-000001.txt",
    sourceName: "SEC Form D",
    excerpt:
      "Revise Robotics, Inc. Form D filed May 28, 2025, signed by Rupesh Jeyaram, Chief Executive Officer. Date of first sale 2025-02-21. Total amount sold 3617975. Total offering amount 3617975. Investors already invested: 34. Federal exemption 06b.",
  },
  {
    projectNames: ["BetterBasket"],
    stage: "Seed",
    amountUsd: 1_300_000,
    amountText: "$1.3M",
    date: "",
    leads: [],
    investors: [],
    sourceUrl: "https://aijourn.com/vagelis-viskadouros-built-betterbasket-from-the-grocery-problems-he-understood-firsthand/",
    sourceName: "The AI Journal",
    excerpt:
      "BetterBasket was accepted into Y Combinator’s Winter 2024 batch and raised $1.3 million in seed funding. The company develops software that supports grocery pricing and category management.",
  },
  {
    projectNames: ["Lumify Care"],
    stage: "Seed",
    amountUsd: 1_250_000,
    amountText: "$1.25M",
    date: "May 9, 2022",
    leads: [],
    investors: ["Y Combinator", "Flare Capital", "Gaingels", "Fresco Capital", "Crista Galli Ventures", "Mark Switaj"],
    sourceUrl: "https://www.citybiz.co/article/259749/lumify-care-raised-a-seed-round-and-launched-its-marketplace-app/",
    sourceName: "Technical.ly",
    excerpt:
      "Anthony Scarpone-Lambert was wrapping up his degree at the University of Pennsylvania. The startup recently raised a $1.25 million seed round with participation from Y Combinator, Flare Capital, Gaingels, Fresco Capital, Crista Galli Ventures, and individual investors, like Philly founder Mark Switaj, of Roundtrip.",
  },
  {
    projectNames: ["Neuralert"],
    stage: "Seed",
    amountUsd: 1_300_000,
    amountText: "$1.3M closed",
    date: "2022",
    leads: [],
    investors: [],
    sourceUrl: "https://pci.upenn.edu/presidents-innovation-prize-winner-lumify-care-and-pci-startup-neuralert-hit-major-milestones-in-2022/",
    sourceName: "Penn Center for Innovation",
    excerpt:
      "PCI startup Neuralert, the stroke detection device company, reports that it has $1.3 million of a $1.75 million seed round closed.",
  },
];

function main() {
  const db = getDb();
  const insertClaim = db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, source_url, published_date, retrieved_at, label, verification_state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 'observed_fact', 'unverified')`
  );
  const claimExists = db.prepare(
    `SELECT id FROM claims WHERE entity_type = ? AND entity_id = ? AND claim_type = ? AND source_url = ? AND excerpt = ? LIMIT 1`
  );
  const upsertSource = db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at, last_success_at, discovered_lead_count)
     VALUES (?, ?, 'press', ?, '[]', 2, 'manual', 'available', ?, ?, 1)
     ON CONFLICT(id) DO UPDATE SET last_success_at = excluded.last_success_at, name = excluded.name`
  );
  const factExists = db.prepare(`SELECT id FROM company_facts WHERE project_id = ? AND fact_key = ? AND value_text = ? LIMIT 1`);
  const insertFact = db.prepare(
    `INSERT INTO company_facts (id, project_id, fact_key, value_text, amount_usd, amount_status, detail_json, source_url, excerpt, origin, created_at)
     VALUES (?, ?, ?, ?, ?, 'announced', ?, ?, ?, 'press', ?)`
  );
  const insertFunding = db.prepare(
    `INSERT INTO funding_events (id, project_id, amount, currency, instrument, event_date, dedupe_key, claim_id)
     VALUES (?, ?, ?, 'USD', 'equity', ?, ?, ?)
     ON CONFLICT(dedupe_key) DO NOTHING`
  );
  const upsertGate = db.prepare(
    `INSERT INTO gate_results (id, project_id, gate_name, result, rationale, evaluated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(project_id, gate_name) DO UPDATE SET result=excluded.result, rationale=excluded.rationale, evaluated_at=excluded.evaluated_at`
  );

  function sourceIdFor(url: string, name: string): string {
    const id = `src_cited_${Buffer.from(url).toString("base64url").slice(0, 24)}`;
    upsertSource.run(id, name, url, NOW, NOW);
    return id;
  }

  function addClaim(entityType: string, entityId: string, claimType: string, excerpt: string, url: string, sourceName: string) {
    const existing = claimExists.get(entityType, entityId, claimType, url, excerpt) as { id: string } | undefined;
    if (existing) return existing.id;
    const id = newId("claim");
    insertClaim.run(id, entityType, entityId, claimType, JSON.stringify({ excerpt }), excerpt, sourceIdFor(url, sourceName), url, NOW);
    return id;
  }

  const touchedProjects = new Set<string>();

  const tx = db.transaction(() => {
    for (const row of YEARS) {
      const person = db.prepare(`SELECT id, name FROM people WHERE id = ?`).get(row.personId) as { id: string; name: string } | undefined;
      if (!person || person.name !== row.name) throw new Error(`person mismatch ${row.personId} ${row.name}`);
      addClaim("person", row.personId, "source_mention", row.excerpt, row.sourceUrl, row.sourceName);
    }
    for (const personId of YEARS.map((row) => row.personId)) recomputePersonEnrollment(db, personId);

    for (const round of ROUNDS) {
      for (const projectName of round.projectNames) {
        const project = db.prepare(`SELECT id FROM projects WHERE name = ? AND kind = 'company'`).get(projectName) as { id: string } | undefined;
        if (!project) throw new Error(`company missing ${projectName}`);
        const valueText = `${round.stage}|${round.amountText}`;
        const claimId = addClaim("project", project.id, "funding", round.excerpt, round.sourceUrl, round.sourceName);
        if (!factExists.get(project.id, "funding_round", valueText)) {
          insertFact.run(
            newId("fact"),
            project.id,
            "funding_round",
            valueText,
            round.amountUsd,
            JSON.stringify({ stage: round.stage, amountText: round.amountText, date: round.date, leads: round.leads }),
            round.sourceUrl,
            round.excerpt,
            NOW
          );
        }
        if (round.totalUsd && round.totalText && !factExists.get(project.id, "funding_total", round.totalText)) {
          insertFact.run(
            newId("fact"),
            project.id,
            "funding_total",
            round.totalText,
            round.totalUsd,
            JSON.stringify({}),
            round.sourceUrl,
            round.excerpt,
            NOW
          );
        }
        const dedupe = crypto.createHash("sha256").update(`${project.id}|${round.stage}|${round.amountUsd}|${round.date}`).digest("hex");
        insertFunding.run(newId("fund"), project.id, round.amountUsd, round.date, dedupe, claimId);
        for (const name of [...round.leads, ...round.investors]) {
          if (factExists.get(project.id, "investor", name)) continue;
          insertFact.run(
            newId("fact"),
            project.id,
            "investor",
            name,
            null,
            JSON.stringify({ batch: null, round: round.stage, kind: round.leads.includes(name) ? "lead" : null }),
            round.sourceUrl,
            round.excerpt,
            NOW
          );
        }
        touchedProjects.add(project.id);
        console.log("funding", projectName, valueText);
      }
    }

    for (const projectId of touchedProjects) {
      const facts = assembleProjectFacts(db, projectId);
      for (const gate of evaluateAllGates(facts)) {
        upsertGate.run(newId("gate"), projectId, gate.gate, gate.result, gate.rationale);
      }
    }
  });

  tx();

  const campuses = new Map<string, number>();
  for (const row of YEARS) {
    const stored = db.prepare(`SELECT name, enrollment_status, enrollment_grad_year, enrollment_source_url FROM people WHERE id = ?`).get(row.personId) as {
      name: string;
      enrollment_status: string;
      enrollment_grad_year: number | null;
      enrollment_source_url: string | null;
    };
    if (stored.enrollment_grad_year !== row.gradYear || stored.enrollment_status !== row.status) {
      throw new Error(`${stored.name} stored ${stored.enrollment_status} ${stored.enrollment_grad_year}, expected ${row.status} ${row.gradYear}`);
    }
    if (stored.enrollment_source_url !== row.sourceUrl) {
      throw new Error(`${stored.name} source ${stored.enrollment_source_url}`);
    }
    campuses.set(row.campus, (campuses.get(row.campus) ?? 0) + 1);
    console.log("year", stored.name, stored.enrollment_grad_year, stored.enrollment_status, row.campus);
  }

  db.pragma("wal_checkpoint(TRUNCATE)");
  console.log("class years filled", YEARS.length);
  for (const [campus, count] of campuses) console.log("  ", campus, count);
  console.log("startup rows with a new funding amount", touchedProjects.size);
}

main();
