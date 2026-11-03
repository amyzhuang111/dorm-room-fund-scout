// Student and new-grad startups missing from the campus database.
//
// Photon was identified from photon.codes plus a Luma speaker bio and
// Daniel Tian's GitHub: the company is the messaging-agent startup, and
// its CEO dropped out of Penn's M&T program. Photonium (YC X25) is a
// different name and is not imported here.
//
// The other rows are the companies a bounded scan of YC batches Winter
// 2024 through Fall 2026, the a16z Speedrun company API (318 companies),
// Pear's public company index (205), and Free Ventures' embedded
// portfolio found that were not already stored and whose own page states
// a 2023–2026 class year, a current-student fact, or a dropout from a
// covered campus. Speedrun matches and recent Free Ventures batches were
// already in the database. Pear's school mentions were older companies.
//
// Run: npx tsx scripts/ingest/import-student-founder-gap.ts

import crypto from "node:crypto";
import { getDb, newId, nowIso } from "../../lib/db/client";
import { recomputePersonEnrollment } from "../../lib/domain/enrollment-store";
import { assembleProjectFacts } from "../../lib/domain/facts";
import { classifyDescription } from "../../lib/domain/sectors";
import { evaluateAllGates } from "../../lib/screening/gates";

interface FounderIn {
  name: string;
  role: string;
  universityId: string | null;
  affiliationRole: string;
  leftSchool: boolean;
  linkedin: string | null;
  github: string | null;
  excerpt: string;
  sourceUrl: string;
  sourceId: string;
}

interface RoundIn {
  stage: string;
  amountUsd: number | null;
  amountText: string;
  date: string | null;
  leads: string[];
  investors: string[];
  excerpt: string;
  sourceUrl: string;
  sourceId: string;
}

interface CompanyIn {
  name: string;
  website: string | null;
  description: string;
  descriptionUrl: string;
  descriptionSourceId: string;
  founders: FounderIn[];
  rounds: RoundIn[];
  investors: { name: string; excerpt: string; sourceUrl: string; sourceId: string; batch?: string; kind?: string }[];
}

const PHOTON = "https://photon.codes/";
const LUMA = "https://luma.com/tinyfish-hvv6";
const DANIEL_LI = "https://www.linkedin.com/in/danieltian316";
const RYAN_LI = "https://www.linkedin.com/in/ryanzhuuuu";
const CRIMSON = "https://www.thecrimson.com/article/2024/3/27/thiel-fellowship-startups-2024/";
const RAMBUS =
  "https://www.rambus.com/blogs/from-dorm-room-beginnings-to-a-pioneer-in-the-ai-chip-revolution-how-etched-is-collaborating-with-rambus-to-achieve-their-vision/";
const TC_MACH_2023 = "https://techcrunch.com/2023/07/13/meet-the-19-year-old-mit-drop-out-replacing-gunpowder-for-the-defense-industry/";
const TC_MACH_2025 =
  "https://techcrunch.com/2025/03/04/mach-industries-founded-by-21-year-old-ethan-thornton-lands-us-army-contract-builds-weapons-factory/";

const SRC_PHOTON = "src_photon_public";
const SRC_YC = "src_yc_directory";
const SRC_THIEL = "src_thiel_fellowship_student_founders";

const COMPANIES: CompanyIn[] = [
  {
    name: "Photon",
    website: "https://photon.codes/",
    description:
      "Photon builds infrastructure for deploying AI agents into messaging platforms people already use. Spectrum is Photon's developer platform for connecting AI agents to messaging channels such as iMessage, WhatsApp, Telegram, Slack, Discord, and Instagram.",
    descriptionUrl: PHOTON,
    descriptionSourceId: SRC_PHOTON,
    founders: [
      {
        name: "Daniel Tian",
        role: "co-founder",
        universityId: "univ_penn",
        affiliationRole: "M&T dropout",
        leftSchool: true,
        linkedin: DANIEL_LI,
        github: "https://github.com/danieltyx",
        excerpt:
          "Luma event bio: \"Daniel Tian is co-founder and CEO of Photon. He dropped out of the University of Pennsylvania M&T program and is part of Z Fellow.\" GitHub bio on github.com/danieltyx: \"University of Pennsylvania M&T.\" Public LinkedIn headline at linkedin.com/in/danieltian316: \"cofounder@photon.codes ; cs+wharton @ m&t ; z-fellow.\" Class year is not printed.",
        sourceUrl: LUMA,
        sourceId: SRC_PHOTON,
      },
      {
        name: "Ryan Zhu",
        role: "co-founder",
        universityId: null,
        affiliationRole: "",
        leftSchool: false,
        linkedin: RYAN_LI,
        github: null,
        excerpt:
          "Public LinkedIn headline at linkedin.com/in/ryanzhuuuu: \"cofounder @photon.codes | founder @adventure-x.org | zfellow.\" The profile matches the Photon cofounder name. No covered-campus class year is printed on a page read for this import.",
        sourceUrl: RYAN_LI,
        sourceId: SRC_PHOTON,
      },
    ],
    rounds: [],
    investors: [],
  },
  {
    name: "Slashy",
    website: "https://www.slashy.com/",
    description: "Cursor for Email. Y Combinator Summer 2025.",
    descriptionUrl: "https://www.ycombinator.com/companies/slashy",
    descriptionSourceId: SRC_YC,
    founders: [
      {
        name: "Harsha Gaddipati",
        role: "founder",
        universityId: null,
        affiliationRole: "",
        leftSchool: false,
        linkedin: "https://www.linkedin.com/in/harsha-gaddipati-032bb820a/",
        github: null,
        excerpt:
          "Y Combinator's Slashy page (Summer 2025) lists Harsha Gaddipati as Founder/CEO. Bio: \"Changing email with Slashy :) Sign up at slashy.com.\" No school or class year is printed.",
        sourceUrl: "https://www.ycombinator.com/companies/slashy",
        sourceId: SRC_YC,
      },
      {
        name: "Dhruv Roongta",
        role: "founder",
        universityId: "univ_gatech",
        affiliationRole: "CS sophomore",
        leftSchool: false,
        linkedin: "https://www.linkedin.com/in/dhruv-roongta-421a7b214/",
        github: null,
        excerpt:
          "Y Combinator's Slashy page lists Dhruv Roongta as Founder. Bio: \"Previously, was a sophomore studying Computer Science at Georgia Tech, interned at Groq, Pulse (S24), and Greptile (W24). He also won several prizes at both CalHacks and HackMIT.\"",
        sourceUrl: "https://www.ycombinator.com/companies/slashy",
        sourceId: SRC_YC,
      },
    ],
    rounds: [],
    investors: [
      {
        name: "Y Combinator",
        batch: "Summer 2025",
        kind: "accelerator",
        excerpt: "Y Combinator company page lists Slashy in the Summer 2025 batch. The page does not state a dollar amount.",
        sourceUrl: "https://www.ycombinator.com/companies/slashy",
        sourceId: SRC_YC,
      },
    ],
  },
  {
    name: "Automax.ai",
    website: "https://automax.ai",
    description: "AI native real-estate appraisal firm. Y Combinator Fall 2025.",
    descriptionUrl: "https://www.ycombinator.com/companies/automax-ai",
    descriptionSourceId: SRC_YC,
    founders: [
      {
        name: "Humza Ahmed",
        role: "founder",
        universityId: "univ_waterloo",
        affiliationRole: "dropout",
        leftSchool: true,
        linkedin: "https://www.linkedin.com/in/h4ahmed/",
        github: null,
        excerpt:
          "Y Combinator's Automax.ai page (Fall 2025) lists Humza Ahmed as Founder/CEO. Bio: \"Founder @ Automax.ai | Building Agents to automate property valuations Dropped out @uwaterloo se | Prev ML research @Huawei.\" Class year is not printed.",
        sourceUrl: "https://www.ycombinator.com/companies/automax-ai",
        sourceId: SRC_YC,
      },
    ],
    rounds: [],
    investors: [
      {
        name: "Y Combinator",
        batch: "Fall 2025",
        kind: "accelerator",
        excerpt: "Y Combinator company page lists Automax.ai in the Fall 2025 batch. The page does not state a dollar amount.",
        sourceUrl: "https://www.ycombinator.com/companies/automax-ai",
        sourceId: SRC_YC,
      },
    ],
  },
  {
    name: "Sorce",
    website: "https://sorce.jobs",
    description: "Tinder for jobs. Y Combinator Fall 2025.",
    descriptionUrl: "https://www.ycombinator.com/companies/sorce",
    descriptionSourceId: SRC_YC,
    founders: [
      {
        name: "Oluwapelumi Dada",
        role: "founder",
        universityId: null,
        affiliationRole: "",
        leftSchool: false,
        linkedin: "https://www.linkedin.com/in/oldada",
        github: null,
        excerpt:
          "Y Combinator's Sorce page (Fall 2025) lists Oluwapelumi Dada as Founder/CEO. Bio: \"working on sorce; prev. tesla, dell.\" No school or class year is printed.",
        sourceUrl: "https://www.ycombinator.com/companies/sorce",
        sourceId: SRC_YC,
      },
      {
        name: "Daniel Ajayi",
        role: "founder",
        universityId: "univ_mit",
        affiliationRole: "CS '25",
        leftSchool: false,
        linkedin: "https://www.linkedin.com/in/dan-ajayi/",
        github: null,
        excerpt: "Y Combinator's Sorce page lists Daniel Ajayi as Founder/CTO. Bio: \"22 | cto @sorcejobs | mit cs '25 | prev citadel securities & nvidia.\"",
        sourceUrl: "https://www.ycombinator.com/companies/sorce",
        sourceId: SRC_YC,
      },
      {
        name: "David Alade",
        role: "founder",
        universityId: null,
        affiliationRole: "",
        leftSchool: false,
        linkedin: "https://www.linkedin.com/in/david-alade/",
        github: null,
        excerpt:
          "Y Combinator's Sorce page lists David Alade as Founder/COO. Bio: \"Northeastern '25, prev JPMC, network science institute.\" Northeastern is not a campus in this database, so no campus affiliation is stored.",
        sourceUrl: "https://www.ycombinator.com/companies/sorce",
        sourceId: SRC_YC,
      },
    ],
    rounds: [],
    investors: [
      {
        name: "Y Combinator",
        batch: "Fall 2025",
        kind: "accelerator",
        excerpt: "Y Combinator company page lists Sorce in the Fall 2025 batch. The page does not state a dollar amount.",
        sourceUrl: "https://www.ycombinator.com/companies/sorce",
        sourceId: SRC_YC,
      },
    ],
  },
  {
    name: "Prox",
    website: "https://useprox.com",
    description: "AI product specialists for equipment manufacturers. Y Combinator Fall 2025.",
    descriptionUrl: "https://www.ycombinator.com/companies/prox",
    descriptionSourceId: SRC_YC,
    founders: [
      {
        name: "Dima Yanovsky",
        role: "founder",
        universityId: "univ_mit",
        affiliationRole: "'25",
        leftSchool: false,
        linkedin: "https://www.linkedin.com/in/yanovsk/",
        github: null,
        excerpt: "Y Combinator's Prox page (Fall 2025) lists Dima Yanovsky as Founder. Bio: \"mit '25.\"",
        sourceUrl: "https://www.ycombinator.com/companies/prox",
        sourceId: SRC_YC,
      },
      {
        name: "Gregory Makodzeba",
        role: "founder",
        universityId: null,
        affiliationRole: "",
        leftSchool: false,
        linkedin: "https://www.linkedin.com/in/gregory-makodzeba/",
        github: null,
        excerpt:
          "Y Combinator's Prox page lists Gregory Makodzeba as Founder. Bio: \"founded Rektoff (built security systems protecting >$100B; clients: Solana). led DevRel at Runtime Verification (among clients: NASA, Boeing). studied aviation management and computer science.\" No covered campus or class year is printed.",
        sourceUrl: "https://www.ycombinator.com/companies/prox",
        sourceId: SRC_YC,
      },
    ],
    rounds: [],
    investors: [
      {
        name: "Y Combinator",
        batch: "Fall 2025",
        kind: "accelerator",
        excerpt: "Y Combinator company page lists Prox in the Fall 2025 batch. The page does not state a dollar amount.",
        sourceUrl: "https://www.ycombinator.com/companies/prox",
        sourceId: SRC_YC,
      },
    ],
  },
  {
    name: "10x Science",
    website: "https://10xscience.com",
    description: "The AI-native platform for next-generation protein characterization. Y Combinator Winter 2026.",
    descriptionUrl: "https://www.ycombinator.com/companies/10x-science",
    descriptionSourceId: SRC_YC,
    founders: [
      {
        name: "David Roberts",
        role: "founder",
        universityId: null,
        affiliationRole: "",
        leftSchool: false,
        linkedin: "https://www.linkedin.com/in/davidstephenroberts/",
        github: null,
        excerpt:
          "Y Combinator's 10x Science page (Winter 2026) lists David Roberts as Founder/CEO. Bio says he is a chemistry postdoc in Prof. Carolyn Bertozzi's lab at Stanford and received a B.S. at UC San Diego in 2016. A postdoc appointment and a 2016 bachelor's degree are not stored as a 2023–2026 or current-student affiliation.",
        sourceUrl: "https://www.ycombinator.com/companies/10x-science",
        sourceId: SRC_YC,
      },
      {
        name: "Andrew Reiter",
        role: "founder",
        universityId: "univ_stanford",
        affiliationRole: "PhD student",
        leftSchool: false,
        linkedin: "https://www.linkedin.com/in/andrew-r-593066136",
        github: null,
        excerpt:
          "Y Combinator's 10x Science page lists Andrew Reiter as Founder/COO. Bio: \"I later became a Ph.D. student and NSF-GRFP fellow in the Department of Biology at Stanford University.\" The same bio names the Broad Institute of MIT and Harvard as a lab he joined, not as a degree.",
        sourceUrl: "https://www.ycombinator.com/companies/10x-science",
        sourceId: SRC_YC,
      },
      {
        name: "Vishnu Tejus",
        role: "founder",
        universityId: null,
        affiliationRole: "",
        leftSchool: false,
        linkedin: "https://www.linkedin.com/in/vishnutejus",
        github: null,
        excerpt:
          "Y Combinator's 10x Science page lists Vishnu Tejus as Founder/CTO. Bio says he forward-deployed in research labs at the University of Washington, UCSF, and Stanford. Lab work is not stored as a degree affiliation.",
        sourceUrl: "https://www.ycombinator.com/companies/10x-science",
        sourceId: SRC_YC,
      },
    ],
    rounds: [],
    investors: [
      {
        name: "Y Combinator",
        batch: "Winter 2026",
        kind: "accelerator",
        excerpt: "Y Combinator company page lists 10x Science in the Winter 2026 batch. The page does not state a dollar amount.",
        sourceUrl: "https://www.ycombinator.com/companies/10x-science",
        sourceId: SRC_YC,
      },
    ],
  },
  {
    name: "Etched",
    website: "https://www.etched.com/",
    description:
      "Etched builds specialized chips designed to accelerate AI inference. Rambus describes the company as founded in 2022 by Harvard dropouts Gavin Uberti, Chris Zhu, and Robert Wachen.",
    descriptionUrl: RAMBUS,
    descriptionSourceId: SRC_THIEL,
    founders: [
      {
        name: "Gavin Uberti",
        role: "co-founder",
        universityId: "univ_harvard",
        affiliationRole: "'25",
        leftSchool: true,
        linkedin: null,
        github: null,
        excerpt:
          "The Harvard Crimson (March 27, 2024) lists Gavin J. Uberti '25 among Harvard students awarded $100,000 Thiel Fellowship grants, working on Etched.ai. Rambus: \"Etched, founded by Harvard dropouts Gavin Uberti, Chris Zhu, and Robert Wachen in 2022\" and \"they made the daring decision to drop out of Harvard.\"",
        sourceUrl: CRIMSON,
        sourceId: SRC_THIEL,
      },
      {
        name: "Christopher Zhu",
        role: "co-founder",
        universityId: "univ_harvard",
        affiliationRole: "'24",
        leftSchool: true,
        linkedin: null,
        github: null,
        excerpt:
          "The Harvard Crimson (March 27, 2024) lists Christoper G. Zhu '24 among Harvard students awarded $100,000 Thiel Fellowship grants, working on Etched.ai. Rambus names Chris Zhu as a founder who dropped out of Harvard.",
        sourceUrl: CRIMSON,
        sourceId: SRC_THIEL,
      },
      {
        name: "Robert Wachen",
        role: "co-founder",
        universityId: "univ_harvard",
        affiliationRole: "'24",
        leftSchool: true,
        linkedin: null,
        github: null,
        excerpt:
          "The Harvard Crimson (March 27, 2024) lists Robert S. Wachen '24 among Harvard students awarded $100,000 Thiel Fellowship grants, working on Etched.ai. Rambus names Robert Wachen as a founder who dropped out of Harvard.",
        sourceUrl: CRIMSON,
        sourceId: SRC_THIEL,
      },
    ],
    rounds: [
      {
        stage: "grant",
        amountUsd: 100000,
        amountText: "$100,000",
        date: "2024-03",
        leads: ["Thiel Fellowship"],
        investors: [],
        excerpt:
          "The Harvard Crimson (March 27, 2024): \"Five Harvard students were awarded $100,000 grants by the Thiel Fellowship\" including Gavin J. Uberti '25, Christoper G. Zhu '24, and Robert S. Wachen '24, working on Etched.ai. The article states the grant amount per fellowship, not a priced equity round.",
        sourceUrl: CRIMSON,
        sourceId: SRC_THIEL,
      },
    ],
    investors: [
      {
        name: "Thiel Fellowship",
        kind: "grant",
        excerpt:
          "The Harvard Crimson names the Etched founders among Harvard students awarded $100,000 Thiel Fellowship grants in the 2024 class.",
        sourceUrl: CRIMSON,
        sourceId: SRC_THIEL,
      },
    ],
  },
  {
    name: "Cognition",
    website: "https://cognition.com/",
    description:
      "Cognition AI is an applied AI lab. The Harvard Crimson describes Devin, its AI software engineer, and names Walden Yan '24 as a co-founder.",
    descriptionUrl: CRIMSON,
    descriptionSourceId: SRC_THIEL,
    founders: [
      {
        name: "Walden Yan",
        role: "co-founder",
        universityId: "univ_harvard",
        affiliationRole: "'24",
        leftSchool: false,
        linkedin: null,
        github: null,
        excerpt:
          "The Harvard Crimson (March 27, 2024): the 2024 Thiel Fellowship class includes \"Walden Yan '24, who co-founded Cognition AI.\" He was one of five Harvard students awarded a $100,000 grant. The article says fellows have to drop out; it does not quote Yan as having already left, so left_school stays unset.",
        sourceUrl: CRIMSON,
        sourceId: SRC_THIEL,
      },
    ],
    rounds: [
      {
        stage: "grant",
        amountUsd: 100000,
        amountText: "$100,000",
        date: "2024-03",
        leads: ["Thiel Fellowship"],
        investors: [],
        excerpt:
          "The Harvard Crimson (March 27, 2024): \"Five Harvard students were awarded $100,000 grants by the Thiel Fellowship,\" including \"Walden Yan '24, who co-founded Cognition AI.\"",
        sourceUrl: CRIMSON,
        sourceId: SRC_THIEL,
      },
    ],
    investors: [
      {
        name: "Thiel Fellowship",
        kind: "grant",
        excerpt: "The Harvard Crimson says Walden Yan '24, co-founder of Cognition AI, was awarded a $100,000 Thiel Fellowship grant.",
        sourceUrl: CRIMSON,
        sourceId: SRC_THIEL,
      },
    ],
  },
  {
    name: "Mach Industries",
    website: "https://machindustries.com/",
    description:
      "Mach is developing hydrogen-powered platforms for the military, including unmanned aerial vehicles (UAVs), munitions and hydrogen generation systems.",
    descriptionUrl: TC_MACH_2023,
    descriptionSourceId: SRC_THIEL,
    founders: [
      {
        name: "Ethan Thornton",
        role: "founder",
        universityId: "univ_mit",
        affiliationRole: "dropout",
        leftSchool: true,
        linkedin: null,
        github: null,
        excerpt:
          "TechCrunch (July 13, 2023) calls Ethan Thornton \"Mach Industries founder\" and \"the 19-year-old MIT dropout.\" He \"did end up finishing his first year at MIT this past spring\" and then left: \"I felt like I was doing college halfway, and [Mach] halfway.\" Class year is not printed.",
        sourceUrl: TC_MACH_2023,
        sourceId: SRC_THIEL,
      },
    ],
    rounds: [
      {
        stage: "seed",
        amountUsd: 5700000,
        amountText: "$5.7 million",
        date: "2023-06",
        leads: ["Sequoia Capital"],
        investors: ["Marque VC", "Champion Hill Ventures"],
        excerpt:
          "TechCrunch (July 13, 2023): \"Mach's seed round, which included participation from Marque VC and Champion Hill Ventures, came to $5.7 million.\" TechCrunch (March 4, 2025): Sequoia's Stephanie Zhan and Shaun Maguire \"led Mach's $5.7 million seed round announced in June 2023.\"",
        sourceUrl: TC_MACH_2023,
        sourceId: SRC_THIEL,
      },
      {
        stage: "series a",
        amountUsd: 79000000,
        amountText: "$79 million",
        date: "2023-10",
        leads: ["Bedrock Capital"],
        investors: [],
        excerpt:
          "TechCrunch (March 4, 2025): \"A few months later, in October 2023, Geoff Lewis, founder of Bedrock Capital, led Mach's $79 million Series A.\" The same article's section heading says \"Teen founder, $85 million in funding.\"",
        sourceUrl: TC_MACH_2025,
        sourceId: SRC_THIEL,
      },
    ],
    investors: [
      {
        name: "Sequoia Capital",
        kind: "lead",
        excerpt: "TechCrunch (March 4, 2025): Sequoia led Mach's $5.7 million seed round announced in June 2023.",
        sourceUrl: TC_MACH_2025,
        sourceId: SRC_THIEL,
      },
      {
        name: "Marque VC",
        excerpt: "TechCrunch (July 13, 2023): Mach's seed round included participation from Marque VC.",
        sourceUrl: TC_MACH_2023,
        sourceId: SRC_THIEL,
      },
      {
        name: "Champion Hill Ventures",
        excerpt: "TechCrunch (July 13, 2023): Mach's seed round included participation from Champion Hill Ventures.",
        sourceUrl: TC_MACH_2023,
        sourceId: SRC_THIEL,
      },
      {
        name: "Bedrock Capital",
        kind: "lead",
        excerpt: "TechCrunch (March 4, 2025): Geoff Lewis, founder of Bedrock Capital, led Mach's $79 million Series A in October 2023.",
        sourceUrl: TC_MACH_2025,
        sourceId: SRC_THIEL,
      },
      {
        name: "Thiel Fellowship",
        kind: "grant",
        excerpt:
          "TechCrunch (July 13, 2023): Thornton joined \"the newest class of Peter Thiel's Thiel Fellowship in February.\" The article does not print the grant dollar amount.",
        sourceUrl: TC_MACH_2023,
        sourceId: SRC_THIEL,
      },
    ],
  },
];

function domainOf(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function main() {
  const db = getDb();
  const now = nowIso();

  const ensureSource = db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at, last_success_at)
     VALUES (?, ?, 'portfolio_directory', ?, ?, 1, 'manual', 'available', ?, ?)
     ON CONFLICT(id) DO UPDATE SET last_attempt_at=excluded.last_attempt_at, last_success_at=excluded.last_success_at, status='available'`
  );
  ensureSource.run(SRC_PHOTON, "Photon public pages", PHOTON, JSON.stringify(["univ_penn"]), now, now);
  ensureSource.run(
    SRC_THIEL,
    "Thiel Fellowship student founders (Crimson, TechCrunch, Rambus)",
    CRIMSON,
    JSON.stringify(["univ_harvard", "univ_mit"]),
    now,
    now
  );

  const findProjectByName = db.prepare(`SELECT id FROM projects WHERE kind='company' AND name = ?`);
  const findProjectByDomain = db.prepare(
    `SELECT id, website_url FROM projects WHERE kind='company' AND website_url IS NOT NULL`
  );
  const insertProject = db.prepare(
    `INSERT INTO projects (id, name, aliases_json, kind, description, website_url, primary_link, primary_link_kind, is_portfolio_reference, is_investable_candidate, created_at, updated_at)
     VALUES (?, ?, '[]', 'company', ?, ?, ?, 'directory', 0, 1, ?, ?)`
  );
  const insertClaim = db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, source_url, retrieved_at, label, verification_state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'observed_fact', 'unverified')`
  );
  const findClaim = db.prepare(
    `SELECT id FROM claims WHERE entity_type=? AND entity_id=? AND claim_type=? AND source_url=? AND excerpt=?`
  );
  const claimFor = (
    entityType: string,
    entityId: string,
    claimType: string,
    valueJson: string,
    excerpt: string,
    sourceId: string,
    sourceUrl: string
  ) => {
    const existing = findClaim.get(entityType, entityId, claimType, sourceUrl, excerpt) as { id: string } | undefined;
    if (existing) return existing.id;
    const id = newId("claim");
    insertClaim.run(id, entityType, entityId, claimType, valueJson, excerpt, sourceId, sourceUrl, now);
    return id;
  };
  const findPerson = db.prepare(`SELECT id FROM people WHERE name = ?`);
  const insertPerson = db.prepare(
    `INSERT INTO people (id, name, aliases_json, founder_status, left_school, created_at) VALUES (?, ?, ?, 'founder', ?, ?)`
  );
  const updateLeft = db.prepare(`UPDATE people SET left_school = 1, founder_status = 'founder' WHERE id = ?`);
  const updateFounder = db.prepare(`UPDATE people SET founder_status = 'founder' WHERE id = ?`);
  const readAliases = db.prepare(`SELECT aliases_json FROM people WHERE id = ?`);
  const writeAliases = db.prepare(`UPDATE people SET aliases_json = ? WHERE id = ?`);
  const findAff = db.prepare(`SELECT id FROM affiliations WHERE person_id = ? AND university_id = ?`);
  const insertAff = db.prepare(
    `INSERT INTO affiliations (id, person_id, university_id, role, status, claim_id) VALUES (?, ?, ?, ?, 'unverified', ?)`
  );
  const findRole = db.prepare(`SELECT id FROM person_project_roles WHERE person_id = ? AND project_id = ?`);
  const insertRole = db.prepare(
    `INSERT INTO person_project_roles (id, person_id, project_id, role, claim_id) VALUES (?, ?, ?, ?, ?)`
  );
  const findRel = db.prepare(
    `SELECT id FROM relationships WHERE source_entity_type=? AND source_entity_id=? AND target_entity_type=? AND target_entity_id=? AND relationship_type=?`
  );
  const insertRel = db.prepare(
    `INSERT INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json, verification_state)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'affiliation_only')`
  );
  const factExists = db.prepare(`SELECT id FROM company_facts WHERE project_id=? AND fact_key=? AND value_text=?`);
  const insertFact = db.prepare(
    `INSERT INTO company_facts (id, project_id, fact_key, value_text, amount_usd, amount_status, detail_json, source_url, excerpt, origin, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'press', ?)`
  );
  const insertFunding = db.prepare(
    `INSERT INTO funding_events (id, project_id, amount, currency, instrument, event_date, dedupe_key, claim_id)
     VALUES (?, ?, ?, 'USD', ?, ?, ?, ?)
     ON CONFLICT(dedupe_key) DO NOTHING`
  );
  const insertTag = db.prepare(
    `INSERT INTO project_sector_tags (id, project_id, tag, is_primary, excerpt, source_url) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_id, tag) DO NOTHING`
  );
  const upsertGate = db.prepare(
    `INSERT INTO gate_results (id, project_id, gate_name, result, rationale, evaluated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(project_id, gate_name) DO UPDATE SET result=excluded.result, rationale=excluded.rationale, evaluated_at=excluded.evaluated_at`
  );

  const existingDomains = new Map<string, string>();
  for (const row of findProjectByDomain.all() as { id: string; website_url: string }[]) {
    const host = domainOf(row.website_url);
    if (host) existingDomains.set(host, row.id);
  }

  const touchedPeople = new Set<string>();
  let createdCompanies = 0;
  let createdPeople = 0;

  const addAlias = (personId: string, alias: string) => {
    const row = readAliases.get(personId) as { aliases_json: string };
    const aliases = JSON.parse(row.aliases_json || "[]") as string[];
    if (!aliases.includes(alias)) {
      aliases.push(alias);
      writeAliases.run(JSON.stringify(aliases), personId);
    }
  };

  for (const company of COMPANIES) {
    const byName = findProjectByName.get(company.name) as { id: string } | undefined;
    const host = domainOf(company.website);
    const byDomain = host ? existingDomains.get(host) : undefined;
    let projectId = byName?.id || byDomain;
    if (!projectId) {
      projectId = newId("proj");
      insertProject.run(projectId, company.name, company.description, company.website, company.descriptionUrl, now, now);
      if (host) existingDomains.set(host, projectId);
      createdCompanies++;
      console.log(`company ${company.name} ${projectId}`);
    } else {
      console.log(`company exists ${company.name} ${projectId}`);
    }

    const descClaim = claimFor(
      "project",
      projectId,
      "product",
      JSON.stringify({ name: company.name, website: company.website }),
      company.description,
      company.descriptionSourceId,
      company.descriptionUrl
    );

    if (!factExists.get(projectId, "description", company.description)) {
      insertFact.run(newId("cf"), projectId, "description", company.description, null, null, "{}", company.descriptionUrl, company.description, now);
    }
    if (company.website && !factExists.get(projectId, "website", company.website)) {
      insertFact.run(
        newId("cf"),
        projectId,
        "website",
        company.website,
        null,
        null,
        "{}",
        company.descriptionUrl,
        `Website recorded from ${company.descriptionUrl}.`,
        now
      );
    }

    const campuses = new Set<string>();
    for (const founder of company.founders) {
      const matches = findPerson.all(founder.name) as { id: string }[];
      let personId: string;
      if (matches.length === 1) personId = matches[0].id;
      else if (matches.length > 1) {
        console.log(`skip ambiguous person ${founder.name}`);
        continue;
      } else {
        personId = newId("person");
        insertPerson.run(personId, founder.name, "[]", founder.leftSchool ? 1 : 0, now);
        createdPeople++;
      }
      touchedPeople.add(personId);
      if (founder.leftSchool) updateLeft.run(personId);
      else updateFounder.run(personId);
      if (founder.linkedin) addAlias(personId, `linkedin:${founder.linkedin.replace(/\/$/, "")}`);
      if (founder.github) addAlias(personId, `github:${founder.github}`);

      const claimId = claimFor(
        "person",
        personId,
        "affiliation",
        JSON.stringify({ name: founder.name, role: founder.role, company: company.name, universityId: founder.universityId }),
        founder.excerpt,
        founder.sourceId,
        founder.sourceUrl
      );
      if (!findRole.get(personId, projectId)) {
        insertRole.run(newId("ppr"), personId, projectId, founder.role, claimId);
      }
      if (!findRel.get("person", personId, "project", projectId, "founded")) {
        insertRel.run(newId("rel"), "person", personId, "project", projectId, "founded", JSON.stringify([claimId]));
      }
      if (founder.universityId) {
        campuses.add(founder.universityId);
        if (!findAff.get(personId, founder.universityId)) {
          insertAff.run(newId("aff"), personId, founder.universityId, founder.affiliationRole || founder.role, claimId);
        }
        if (!findRel.get("person", personId, "university", founder.universityId, "enrolled_at")) {
          insertRel.run(newId("rel"), "person", personId, "university", founder.universityId, "enrolled_at", JSON.stringify([claimId]));
        }
      }
    }

    for (const universityId of campuses) {
      if (!findRel.get("project", projectId, "university", universityId, "affiliated_with")) {
        insertRel.run(newId("rel"), "project", projectId, "university", universityId, "affiliated_with", JSON.stringify([descClaim]));
      }
    }

    for (const investor of company.investors) {
      if (factExists.get(projectId, "investor", investor.name)) continue;
      insertFact.run(
        newId("cf"),
        projectId,
        "investor",
        investor.name,
        null,
        null,
        JSON.stringify({ batch: investor.batch ?? null, kind: investor.kind ?? null }),
        investor.sourceUrl,
        investor.excerpt,
        now
      );
    }

    for (const round of company.rounds) {
      const claimId = claimFor(
        "project",
        projectId,
        "funding",
        JSON.stringify({ stage: round.stage, amountUsd: round.amountUsd, leads: round.leads }),
        round.excerpt,
        round.sourceId,
        round.sourceUrl
      );
      const amountText = round.amountText;
      if (!factExists.get(projectId, "funding_round", amountText)) {
        insertFact.run(
          newId("cf"),
          projectId,
          "funding_round",
          amountText,
          round.amountUsd,
          round.amountUsd ? "announced" : "undisclosed",
          JSON.stringify({ stage: round.stage, amountText, date: round.date, leads: round.leads }),
          round.sourceUrl,
          round.excerpt,
          now
        );
      }
      const dedupe = crypto.createHash("sha256").update(`${projectId}|${round.stage}|${round.amountUsd}|${round.date}`).digest("hex");
      insertFunding.run(newId("fund"), projectId, round.amountUsd, round.stage === "grant" ? "grant" : "equity", round.date, dedupe, claimId);
      for (const name of [...round.leads, ...round.investors]) {
        if (factExists.get(projectId, "investor", name)) continue;
        insertFact.run(
          newId("cf"),
          projectId,
          "investor",
          name,
          null,
          null,
          JSON.stringify({ round: round.stage, kind: round.leads.includes(name) ? "lead" : null }),
          round.sourceUrl,
          round.excerpt,
          now
        );
      }
    }

    const tags = classifyDescription(company.description, company.name);
    tags.forEach((tag, index) => {
      insertTag.run(newId("tag"), projectId, tag.tag, index === 0 ? 1 : 0, company.description.slice(0, 280), company.descriptionUrl);
    });
    if (tags[0]) db.prepare(`UPDATE projects SET sector=? WHERE id=? AND sector IS NULL`).run(tags[0].tag, projectId);

    const facts = assembleProjectFacts(db, projectId);
    for (const gate of evaluateAllGates(facts)) upsertGate.run(newId("gate"), projectId, gate.gate, gate.result, gate.rationale);
  }

  for (const personId of touchedPeople) recomputePersonEnrollment(db, personId);

  console.log(`created companies ${createdCompanies}, created people ${createdPeople}, enrollment refreshed ${touchedPeople.size}`);
}

main();
