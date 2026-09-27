// Neo Scholars and Accel Scholars.
//
// Neo's 2023, 2024, and 2025 cohort posts name the class in an image, not in
// the HTML. Names and schools below were read from those images
// (substack-post-media roster graphics on the three posts). The post itself
// says how many scholars the image contains: 32, 32, and 18.
//
// Earlier Neo years are not published as a full list. The people below from
// 2017–2022 are only the ones a Neo page names, with the year printed on that
// page. That year is the scholar cohort (Michael Truell was an MIT freshman
// in 2019 and is labeled '20), not a graduation year.
//
// Accel has not published a full roster. The 2017 launch note says the
// inaugural class had 25 scholars and does not name them. The people below
// are the ones a public Accel Scholars page actually names.
//
// Run: npx tsx scripts/ingest/fetch-scholar-cohorts.ts

import type Database from "better-sqlite3";
import { getDb, newId, nowIso } from "../../lib/db/client";
import { normalizeCompanyName } from "../../lib/domain/dedupe";
import { recomputePersonEnrollment } from "../../lib/domain/enrollment-store";

const NEO_2023 = "https://neo.substack.com/p/meet-the-2023-neo-scholars";
const NEO_2024 = "https://neo.substack.com/p/meet-the-2024-neo-scholars";
const NEO_2025 = "https://neo.substack.com/p/meet-the-2025-neo-scholars";
const NEO_ALUMNI = "https://neo.substack.com/p/future-tech-leaders-neo-scholar-applications";
const NEO_CURSOR = "https://neo.substack.com/p/the-cursor-prehistory";
const NEO_CHAI = "https://neo.substack.com/p/chai-discoverys-gene-ius-launch";
const NEO_PAGE = "https://neo.com/scholars";
const ACCEL_TALK = "https://www.krentsel.com/assets/talks/krentsel-gradschool-101-what-why-how.pdf";
const ACCEL_KAIZEN = "https://www.accel.com/news/accel-seed-investment-in-kaizen-improving-technology-for-local-governments";

const SCHOOL_IDS: Record<string, string> = {
  MIT: "univ_mit",
  "Georgia Tech": "univ_gatech",
  Cambridge: "univ_cambridge",
  "Lafayette College": "univ_lafayette",
  "University of Michigan": "univ_michigan",
  "UT Austin": "univ_utexas",
  Yale: "univ_yale",
  Stanford: "univ_stanford",
  Harvard: "univ_harvard",
  "UC Berkeley": "univ_berkeley",
  Duke: "univ_duke",
  "Carnegie Mellon": "univ_cmu",
  Columbia: "univ_columbia",
  Waterloo: "univ_waterloo",
  Laurentian: "univ_laurentian",
  "University of Toronto": "univ_toronto",
  "University of Pennsylvania": "univ_penn",
  "University of Virginia": "univ_uva",
  Princeton: "univ_princeton",
  NYU: "univ_nyu",
  "Harvey Mudd": "univ_hmc",
  Cornell: "univ_cornell",
  "Queen's University": "univ_queens",
  Brown: "univ_brown",
  "Notre Dame": "univ_notredame",
};

interface ClaimSource {
  id: string;
  name: string;
  url: string;
  excerpt: string;
}

interface Scholar {
  name: string;
  school: string | null;
  program: "neo" | "accel";
  cohort: number | null;
  sources: ClaimSource[];
  company?: { name: string; role: "founder" | "co-founder" };
}

function imageCohort(year: number, url: string, sourceId: string, sourceName: string, rows: [string, string][]): Scholar[] {
  return rows.map(([name, school]) => ({
    name,
    school,
    program: "neo",
    cohort: year,
    sources: [
      {
        id: sourceId,
        name: sourceName,
        url,
        excerpt: `Neo's "${sourceName}" post lists ${name} at ${school} in the ${year} cohort.`,
      },
    ],
  }));
}

const NEO_IMAGE_2023 = imageCohort(2023, NEO_2023, "src_neo_scholars_2023", "Meet the 2023 Neo Scholars", [
  ["Adanna Abraham-Igwe", "MIT"],
  ["Aidan Pratt", "Georgia Tech"],
  ["Andrew Healey", "Cambridge"],
  ["Angela Busheska", "Lafayette College"],
  ["Anirudh Ramprasad", "University of Michigan"],
  ["Armel Talla", "UT Austin"],
  ["Austin Chen", "Yale"],
  ["Brendon Matusch", "Stanford"],
  ["Caine Ardayfio", "Harvard"],
  ["Cathy Zhou", "Stanford"],
  ["Charan Sriram", "UT Austin"],
  ["Chetan Nair", "Stanford"],
  ["Daniel Longo", "Stanford"],
  ["David Koplow", "MIT"],
  ["David Krajewski", "Carnegie Mellon"],
  ["Eric Li", "Harvard"],
  ["Inga Zhuravleva", "UC Berkeley"],
  ["Joe Zakielarz", "Duke"],
  ["Julian Quevedo", "Stanford"],
  ["Karen Li", "Harvard"],
  ["Madeline Park", "Columbia"],
  ["Maria Izzi", "Duke"],
  ["Mathurah Ravigulan", "Waterloo"],
  ["Matthew Espinoza", "Laurentian"],
  ["Mehmet Deniz Birlikci", "Carnegie Mellon"],
  ["Noredeen Al-Zu'bi", "Waterloo"],
  ["Robert Wachen", "Harvard"],
  ["Sachin Rammoorthy", "University of Michigan"],
  ["Shrey Pandya", "University of Michigan"],
  ["Sneha Sivakumar", "Yale"],
  ["Sophia Abolore", "University of Toronto"],
  ["Tinah Hong", "MIT"],
]);

const NEO_IMAGE_2024 = imageCohort(2024, NEO_2024, "src_neo_scholars_2024", "Meet the 2024 Neo Scholars", [
  ["Addison Spiegel", "MIT"],
  ["Angela Zhang", "University of Pennsylvania"],
  ["Areeb Khan", "University of Michigan"],
  ["Brooke Joseph", "Waterloo"],
  ["Charlie Meyer", "University of Virginia"],
  ["Christine Li", "Columbia"],
  ["Emily Zhang", "Stanford"],
  ["Eva Tuecke", "Harvard"],
  ["Gashon Hussein", "Stanford"],
  ["Grace Gerwe", "Yale"],
  ["Hannah Zhou", "Harvard"],
  ["Harry Sanders", "University of Michigan"],
  ["Houjun (Jack) Liu", "Stanford"],
  ["Hudzah Nazoordeen", "Waterloo"],
  ["Huxley Marvit", "Princeton"],
  ["Jacob Daitzman", "MIT"],
  ["Janelle Cai", "MIT"],
  ["Jeffrey Wang", "Harvard"],
  ["Luke Tchang", "Stanford"],
  ["Maksym Bondarenko", "Columbia"],
  ["Marcelo Chaman Mallqui", "Queen's University"],
  ["Mason Lee", "Brown"],
  ["Oluwatoni Akintola", "Notre Dame"],
  ["Oran Goodman", "NYU"],
  ["Pranav Ramesh", "Harvard"],
  ["Rajan Agarwal", "Waterloo"],
  ["Rayna Arora", "MIT"],
  ["Serena Mao", "Harvey Mudd"],
  ["Seth Goldin", "Yale"],
  ["Shreshth Rajan", "Harvard"],
  ["Soham Govande", "Stanford"],
  ["Tomas Salgado", "Cornell"],
]);

const NEO_IMAGE_2025 = imageCohort(2025, NEO_2025, "src_neo_scholars_2025", "Meet the 2025 Neo Scholars", [
  ["Ali Saffarini", "Harvard"],
  ["Ameya Jadhav", "Stanford"],
  ["Anika Somaia", "Columbia"],
  ["Claire Wang", "MIT"],
  ["Cooper Saye", "University of Michigan"],
  ["Emily Di Lauro", "Waterloo"],
  ["Emily Park", "UC Berkeley"],
  ["Gimran Abdullin", "MIT"],
  ["Hunter Pruett", "UC Berkeley"],
  ["Jason Gao", "University of Pennsylvania"],
  ["Jonathan Lei", "Harvard"],
  ["Jude Partovi", "Harvard"],
  ["Kevin Yang", "Harvard"],
  ["Mason Wang", "Stanford"],
  ["Nikita Mounier", "University of Pennsylvania"],
  ["Rohan Desai", "Harvey Mudd"],
  ["Teo Dimov", "Yale"],
  ["Tina Mai", "Stanford"],
]);

function named(input: Scholar): Scholar {
  return input;
}

const NAMED: Scholar[] = [
  named({
    name: "Aman Sanger",
    school: "MIT",
    program: "neo",
    cohort: 2020,
    company: { name: "Cursor", role: "co-founder" },
    sources: [
      {
        id: "src_neo_scholars_alumni",
        name: "Neo Scholars alumni note",
        url: NEO_ALUMNI,
        excerpt: "Neo's July 2024 note lists Cursor co-founder Aman Sanger among Neo Scholars in the 2020 cohort.",
      },
      {
        id: "src_neo_cursor_prehistory",
        name: "Cursor prehistory",
        url: NEO_CURSOR,
        excerpt: "The Cursor prehistory says Aman Sanger was an MIT student and a Cursor co-founder welcomed into Neo Scholars.",
      },
    ],
  }),
  named({
    name: "Michael Truell",
    school: "MIT",
    program: "neo",
    cohort: 2020,
    company: { name: "Cursor", role: "co-founder" },
    sources: [
      {
        id: "src_neo_scholars_alumni",
        name: "Neo Scholars alumni note",
        url: NEO_ALUMNI,
        excerpt: "Neo's July 2024 note lists Cursor co-founder Michael Truell among Neo Scholars in the 2020 cohort.",
      },
      {
        id: "src_neo_cursor_prehistory",
        name: "Cursor prehistory",
        url: NEO_CURSOR,
        excerpt: "The Cursor prehistory says Michael Truell was an MIT student and a Cursor co-founder welcomed into Neo Scholars.",
      },
    ],
  }),
  named({
    name: "Ben Spector",
    school: "MIT",
    program: "neo",
    cohort: null,
    company: { name: "Cursor", role: "co-founder" },
    sources: [
      {
        id: "src_neo_cursor_prehistory",
        name: "Cursor prehistory",
        url: NEO_CURSOR,
        excerpt:
          "The Cursor prehistory says Ben Spector became one of the Neo Scholars, was an MIT student, and later quit Cursor after starting the company with Michael Truell and Aman Sanger.",
      },
    ],
  }),
  named({
    name: "Brian Gu",
    school: null,
    program: "neo",
    cohort: 2017,
    sources: [
      {
        id: "src_neo_cursor_prehistory",
        name: "Cursor prehistory",
        url: NEO_CURSOR,
        excerpt: "The Cursor prehistory says Brian Gu was chosen in 2017 as one of the first Neo Scholars, in the 2017 cohort.",
      },
    ],
  }),
  named({
    name: "Matt Katz",
    school: null,
    program: "neo",
    cohort: 2020,
    company: { name: "Caldera", role: "co-founder" },
    sources: [
      {
        id: "src_neo_scholars_alumni",
        name: "Neo Scholars alumni note",
        url: NEO_ALUMNI,
        excerpt: "Neo's July 2024 note lists Caldera co-founder Matt Katz among Neo Scholars in the 2020 cohort.",
      },
    ],
  }),
  named({
    name: "Parker Jou",
    school: null,
    program: "neo",
    cohort: 2020,
    company: { name: "Caldera", role: "co-founder" },
    sources: [
      {
        id: "src_neo_scholars_alumni",
        name: "Neo Scholars alumni note",
        url: NEO_ALUMNI,
        excerpt: "Neo's July 2024 note lists Caldera co-founder Parker Jou among Neo Scholars in the 2020 cohort.",
      },
    ],
  }),
  named({
    name: "Walden Yan",
    school: "Harvard",
    program: "neo",
    cohort: 2022,
    company: { name: "Cognition", role: "co-founder" },
    sources: [
      {
        id: "src_neo_scholars_alumni",
        name: "Neo Scholars alumni note",
        url: NEO_ALUMNI,
        excerpt: "Neo's July 2024 note lists Cognition co-founder Walden Yan among Neo Scholars in the 2022 cohort.",
      },
    ],
  }),
  named({
    name: "Russell Kaplan",
    school: null,
    program: "neo",
    cohort: 2017,
    sources: [
      {
        id: "src_neo_scholars_alumni",
        name: "Neo Scholars alumni note",
        url: NEO_ALUMNI,
        excerpt: "Neo's July 2024 note lists Cognition president Russell Kaplan among Neo Scholars in the 2017 cohort. The note does not call him a founder.",
      },
    ],
  }),
  named({
    name: "Div Garg",
    school: null,
    program: "neo",
    cohort: 2022,
    company: { name: "MultiOn", role: "founder" },
    sources: [
      {
        id: "src_neo_scholars_alumni",
        name: "Neo Scholars alumni note",
        url: NEO_ALUMNI,
        excerpt: "Neo's July 2024 note lists MultiOn founder Div Garg among Neo Scholars in the 2022 cohort.",
      },
    ],
  }),
  named({
    name: "Molly Cantillon",
    school: null,
    program: "neo",
    cohort: 2022,
    company: { name: "NOX", role: "founder" },
    sources: [
      {
        id: "src_neo_scholars_alumni",
        name: "Neo Scholars alumni note",
        url: NEO_ALUMNI,
        excerpt: "Neo's July 2024 note lists NOX founder Molly Cantillon among Neo Scholars in the 2022 cohort.",
      },
    ],
  }),
  named({
    name: "Demi Guo",
    school: null,
    program: "neo",
    cohort: 2017,
    company: { name: "Pika", role: "co-founder" },
    sources: [
      {
        id: "src_neo_scholars_alumni",
        name: "Neo Scholars alumni note",
        url: NEO_ALUMNI,
        excerpt: "Neo's July 2024 note lists Pika co-founder Demi Guo among Neo Scholars in the 2017 cohort.",
      },
    ],
  }),
  named({
    name: "Jack Dent",
    school: null,
    program: "neo",
    cohort: 2017,
    company: { name: "Chai Discovery", role: "co-founder" },
    sources: [
      {
        id: "src_neo_chai",
        name: "Neo Scholars Chai Discovery note",
        url: NEO_CHAI,
        excerpt: "Ali Partovi writes that Jack Dent was one of the Neo Scholars in the 2017 cohort, the inaugural cohort, and a co-founder of Chai Discovery.",
      },
    ],
  }),
  named({
    name: "Joshua Meier",
    school: null,
    program: "neo",
    cohort: 2017,
    company: { name: "Chai Discovery", role: "co-founder" },
    sources: [
      {
        id: "src_neo_chai",
        name: "Neo Scholars Chai Discovery note",
        url: NEO_CHAI,
        excerpt:
          "Ali Partovi writes that Josh Meier was one of the Neo Scholars in the 2017 cohort, the inaugural cohort, and a co-founder of Chai Discovery. The Neo Scholars page spells his name Joshua Meier.",
      },
    ],
  }),
  named({
    name: "Linden Li",
    school: null,
    program: "neo",
    cohort: 2022,
    company: { name: "Applied Compute", role: "co-founder" },
    sources: [
      {
        id: "src_neo_scholars_page",
        name: "Neo Scholars page",
        url: NEO_PAGE,
        excerpt: "The Neo Scholars page lists Applied Compute co-founder Linden Li among Neo Scholars in the 2022 cohort.",
      },
    ],
  }),
  named({
    name: "Rhythm Garg",
    school: null,
    program: "neo",
    cohort: 2021,
    company: { name: "Applied Compute", role: "co-founder" },
    sources: [
      {
        id: "src_neo_scholars_page",
        name: "Neo Scholars page",
        url: NEO_PAGE,
        excerpt: "The Neo Scholars page lists Applied Compute co-founder Rhythm Garg among Neo Scholars in the 2021 cohort.",
      },
    ],
  }),
  named({
    name: "Yash Patil",
    school: null,
    program: "neo",
    cohort: 2021,
    company: { name: "Applied Compute", role: "co-founder" },
    sources: [
      {
        id: "src_neo_scholars_page",
        name: "Neo Scholars page",
        url: NEO_PAGE,
        excerpt: "The Neo Scholars page lists Applied Compute co-founder Yash Patil among Neo Scholars in the 2021 cohort.",
      },
    ],
  }),
  named({
    name: "Michelle Lim",
    school: null,
    program: "neo",
    cohort: 2019,
    company: { name: "Flint", role: "co-founder" },
    sources: [
      {
        id: "src_neo_scholars_page",
        name: "Neo Scholars page",
        url: NEO_PAGE,
        excerpt: "The Neo Scholars page lists Flint co-founder Michelle Lim among Neo Scholars in the 2019 cohort.",
      },
    ],
  }),
  named({
    name: "Nikhil Reddy",
    school: "UC Berkeley",
    program: "accel",
    cohort: 2017,
    company: { name: "Kaizen", role: "founder" },
    sources: [
      {
        id: "src_accel_kaizen",
        name: "Accel Scholars Kaizen note",
        url: ACCEL_KAIZEN,
        excerpt:
          "Amit Kumar's Accel note says Nikhil Reddy, from UC Berkeley, was part of the very first Accel Scholars cohort in 2017 and founded Kaizen.",
      },
    ],
  }),
  ...["Alex Krentsel", "Marsalis Gibson", "Alvin Wan", "Brijen Thananjeyan"].map(
    (name): Scholar => ({
      name,
      school: "UC Berkeley",
      program: "accel",
      cohort: 2017,
      sources: [
        {
          id: "src_accel_scholars_2017",
          name: "Accel Scholars 2017 talk",
          url: ACCEL_TALK,
          excerpt: `Alex Krentsel's Accel Scholars talk labels ${name} in the first Accel class, in the 2017 cohort. Accel's launch note describes Accel Scholars as the UC Berkeley program.`,
        },
      ],
    })
  ),
];

const SCHOLARS: Scholar[] = [...NEO_IMAGE_2023, ...NEO_IMAGE_2024, ...NEO_IMAGE_2025, ...NAMED];

function roleFor(scholar: Scholar): string {
  const program = scholar.program === "neo" ? "Neo Scholars" : "Accel Scholars";
  return scholar.cohort ? `${program} ${scholar.cohort} cohort` : program;
}

function ensureSource(db: Database.Database, source: ClaimSource, retrievedAt: string) {
  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at)
     VALUES (?, ?, 'campus_builder_org', ?, '[]', 1, 'html_scrape', 'available', ?)
     ON CONFLICT(id) DO UPDATE SET last_attempt_at=excluded.last_attempt_at, status='available', url=excluded.url, name=excluded.name`
  ).run(source.id, source.name, source.url, retrievedAt);
}

function insertClaim(
  db: Database.Database,
  entityType: "person" | "project",
  entityId: string,
  excerpt: string,
  source: ClaimSource,
  value: unknown,
  retrievedAt: string
): string {
  const existing = db
    .prepare(`SELECT id FROM claims WHERE entity_type=? AND entity_id=? AND source_url=? AND claim_type='program_membership' LIMIT 1`)
    .get(entityType, entityId, source.url) as { id: string } | undefined;
  if (existing) return existing.id;
  const id = newId("claim");
  db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, source_url, retrieved_at, label, verification_state)
     VALUES (?, ?, ?, 'program_membership', ?, ?, ?, ?, ?, 'observed_fact', 'unverified')`
  ).run(id, entityType, entityId, JSON.stringify(value), excerpt.slice(0, 1400), source.id, source.url, retrievedAt);
  return id;
}

function findPerson(db: Database.Database, name: string, universityId: string | null): string | null | "ambiguous" {
  const matches = db.prepare(`SELECT id FROM people WHERE lower(name) = lower(?)`).all(name) as { id: string }[];
  if (universityId) {
    const affiliated = matches.filter((row) => db.prepare(`SELECT 1 FROM affiliations WHERE person_id=? AND university_id=?`).get(row.id, universityId));
    if (affiliated.length === 1) return affiliated[0].id;
    if (affiliated.length > 1) return "ambiguous";
  }
  if (matches.length === 1) {
    const any = db.prepare(`SELECT 1 FROM affiliations WHERE person_id=?`).get(matches[0].id);
    if (!any) return matches[0].id;
    if (!universityId) return matches[0].id;
  }
  if (matches.length > 1 && !universityId) return "ambiguous";
  return null;
}

function ensureCompany(db: Database.Database, name: string, excerpt: string, source: ClaimSource, retrievedAt: string): string {
  const key = normalizeCompanyName(name);
  const rows = db.prepare(`SELECT id, name FROM projects WHERE kind='company'`).all() as { id: string; name: string }[];
  const hit = rows.find((row) => normalizeCompanyName(row.name) === key);
  let id = hit?.id;
  if (!id) {
    id = newId("proj");
    db.prepare(
      `INSERT INTO projects (id, name, aliases_json, kind, description, website_url, primary_link, primary_link_kind, is_portfolio_reference, is_investable_candidate)
       VALUES (?, ?, '[]', 'company', ?, NULL, ?, 'press', 0, 1)`
    ).run(id, name, excerpt, source.url);
  }
  insertClaim(db, "project", id, excerpt, source, { name, program: excerpt }, retrievedAt);
  return id;
}

function main() {
  if (NEO_IMAGE_2023.length !== 32 || NEO_IMAGE_2024.length !== 32 || NEO_IMAGE_2025.length !== 18) {
    throw new Error(`Roster sizes drifted: ${NEO_IMAGE_2023.length}, ${NEO_IMAGE_2024.length}, ${NEO_IMAGE_2025.length}`);
  }
  for (const scholar of SCHOLARS) {
    if (scholar.school && !SCHOOL_IDS[scholar.school]) throw new Error(`Unknown school ${scholar.school}`);
    if (!scholar.sources.length) throw new Error(`No source for ${scholar.name}`);
    if (!/Neo Scholars|Accel Scholars/.test(scholar.sources[0].excerpt) && !/Neo Scholars|Accel Scholars/.test(roleFor(scholar))) {
      throw new Error(`Missing program phrase for ${scholar.name}`);
    }
  }

  const retrievedAt = nowIso();
  const db = getDb();
  const touched = new Set<string>();
  const created: string[] = [];
  const reused: string[] = [];
  const skipped: string[] = [];
  let affiliationsAdded = 0;
  let founderLinks = 0;
  const companiesCreated: string[] = [];

  const peopleBefore = (db.prepare(`SELECT COUNT(*) AS n FROM people`).get() as { n: number }).n;

  const tx = db.transaction(() => {
    for (const scholar of SCHOLARS) {
      for (const source of scholar.sources) ensureSource(db, source, retrievedAt);
      const universityId = scholar.school ? SCHOOL_IDS[scholar.school] : null;
      const found = findPerson(db, scholar.name, universityId);
      if (found === "ambiguous") {
        skipped.push(scholar.name);
        continue;
      }
      let id = found;
      if (!id) {
        id = newId("person");
        db.prepare(`INSERT INTO people (id, name, aliases_json, founder_status, potential_signal) VALUES (?, ?, '[]', NULL, NULL)`).run(id, scholar.name);
        created.push(scholar.name);
      } else {
        reused.push(`${scholar.name} → ${id}`);
      }
      const role = roleFor(scholar);
      const primary = scholar.sources[0];
      const claimId = insertClaim(db, "person", id, primary.excerpt, primary, { program: scholar.program, cohort: scholar.cohort, school: scholar.school, role }, retrievedAt);
      for (const source of scholar.sources.slice(1)) {
        insertClaim(db, "person", id, source.excerpt, source, { program: scholar.program, cohort: scholar.cohort, school: scholar.school, role }, retrievedAt);
      }
      if (universityId && !db.prepare(`SELECT id FROM affiliations WHERE person_id=? AND university_id=? AND role=?`).get(id, universityId, role)) {
        db.prepare(`INSERT INTO affiliations (id, person_id, university_id, role, status, claim_id) VALUES (?, ?, ?, ?, 'unverified', ?)`).run(
          newId("aff"),
          id,
          universityId,
          role,
          claimId
        );
        affiliationsAdded += 1;
      }
      if (scholar.company) {
        const companyExcerpt = `${roleFor(scholar).startsWith("Accel") ? "Accel Scholars" : "Neo Scholars"} note names ${scholar.name} as ${scholar.company.role} of ${scholar.company.name}.`;
        const before = db.prepare(`SELECT id FROM projects WHERE kind='company' AND lower(name)=lower(?)`).get(scholar.company.name) as { id: string } | undefined;
        const companyId = ensureCompany(db, scholar.company.name, companyExcerpt, primary, retrievedAt);
        if (!before && !companiesCreated.includes(scholar.company.name)) companiesCreated.push(scholar.company.name);
        if (!db.prepare(`SELECT id FROM person_project_roles WHERE person_id=? AND project_id=?`).get(id, companyId)) {
          db.prepare(`INSERT INTO person_project_roles (id, person_id, project_id, role, claim_id) VALUES (?, ?, ?, ?, ?)`).run(
            newId("ppr"),
            id,
            companyId,
            scholar.company.role,
            claimId
          );
          founderLinks += 1;
        }
        const rel = db
          .prepare(
            `SELECT id FROM relationships WHERE source_entity_type='person' AND source_entity_id=? AND target_entity_type='project' AND target_entity_id=? AND relationship_type='founded'`
          )
          .get(id, companyId);
        if (!rel) {
          db.prepare(
            `INSERT INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json, verification_state)
             VALUES (?, 'person', ?, 'project', ?, 'founded', ?, 'affiliation_only')`
          ).run(newId("rel"), id, companyId, JSON.stringify([claimId]));
        }
        const status = db.prepare(`SELECT founder_status FROM people WHERE id=?`).get(id) as { founder_status: string | null };
        if (status.founder_status !== "founder") {
          db.prepare(`UPDATE people SET founder_status='founder', potential_signal=NULL WHERE id=?`).run(id);
        }
      }
      touched.add(id);
    }
    for (const id of touched) recomputePersonEnrollment(db, id);
  });
  tx();
  db.pragma("wal_checkpoint(TRUNCATE)");

  const peopleAfter = (db.prepare(`SELECT COUNT(*) AS n FROM people`).get() as { n: number }).n;
  const rows = db
    .prepare(
      `SELECT a.role AS role, u.name AS school, p.enrollment_status AS status, p.enrollment_basis AS basis
       FROM affiliations a
       JOIN universities u ON u.id = a.university_id
       JOIN people p ON p.id = a.person_id
       WHERE a.role LIKE 'Neo Scholars%' OR a.role LIKE 'Accel Scholars%'`
    )
    .all() as { role: string; school: string; status: string; basis: string }[];
  const byProgramCampus: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const row of rows) {
    const program = row.role.startsWith("Accel") ? "Accel Scholars" : "Neo Scholars";
    const key = `${program} · ${row.school}`;
    byProgramCampus[key] = (byProgramCampus[key] ?? 0) + 1;
    const label = `${program} · ${row.status} · ${row.basis}`;
    byStatus[label] = (byStatus[label] ?? 0) + 1;
  }
  console.log(
    JSON.stringify(
      {
        roster: SCHOLARS.length,
        people: { before: peopleBefore, after: peopleAfter, created: created.length },
        reused,
        skipped,
        affiliationsAdded,
        founderLinks,
        companiesCreated,
        affiliationRows: rows.length,
        byProgramCampus,
        byStatus,
      },
      null,
      2
    )
  );
}

main();
