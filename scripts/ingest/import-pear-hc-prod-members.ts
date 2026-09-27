// Public members for Pear Fellows, Pear Garage, Human Capital's Delta
// Fellowship, and Prod. A person or startup is written only when a fetched
// page names them. The affiliation role (or the claim, when no campus is
// printed) uses the phrase the hotspot matcher accepts.
//
// Not written, on purpose:
// - Pear partners on the Garage page (Khalil Fuller, Mar Hershenson, Arash Afrakhteh).
// - King Alandy Dy, who has a Garage testimonial and is not in the alumni list.
// - The 2026 Pear Fellows LinkedIn cohort graphic (names are in an image).
// - The current HC Fellowship page, which lists no fellows.
// - Delta fellows the Medium post says stayed unnamed.
// - Nataly Delcid. GovTech says she helps run Prod, via someone passing a
//   request, and she did not confirm it.
// - Asher Spector. GV names him as Ben's brother at Flapping Airplanes, not as a Prod member.
// - Companies that are not already in the database (Affinity, Formfunction,
//   Nightfall, Pesto, Sanas, Decart).
//
// Sam Shapiro (Mayfield Fellows 2012) and Vivek Nair (Multifactor) are
// different people from the Pear alumni of those names, so they are not merged.
//
// Run: npx tsx scripts/ingest/import-pear-hc-prod-members.ts

import type Database from "better-sqlite3";
import { getDb, newId, nowIso } from "../../lib/db/client";
import { recomputePersonEnrollment } from "../../lib/domain/enrollment-store";
import { personIdsForPlace, projectIdsForPlace } from "../../lib/domain/hotspots";

const PEAR_FELLOWS = "https://pear.vc/programs/dorm/fellows/";
const PEAR_GARAGE = "https://pear.vc/programs/dorm/garage/";
const DELTA_2020 = "https://techcrunch.com/2020/09/13/human-capital-announces-the-winners-of-its-delta-fellowship-program/";
const DELTA_2021 = "https://medium.com/@human-capital/the-future-founder-archive-the-2nd-cohort-of-delta-fellows-6af6e0c4fe25";
const PROD_PRESS = "https://www.govtech.com/education/higher-ed/ivy-league-student-groups-help-members-launch-startups-court-vcs";
const PROD_GV = "https://www.gv.com/news/why-we-invested-in-flapping-airplanes";

const PRIZE_PROJECTS = ["proj_Ki3ntD-zKe2w", "proj_VNDfASR8GTZg", "proj_EkVVrRBiS6Gz"];

interface Source {
  id: string;
  name: string;
  url: string;
}

interface Member {
  name: string;
  org: "pear-fellows" | "pear-garage" | "human-capital" | "prod";
  role: string;
  universityId: string | null;
  extraUniversityIds?: string[];
  source: Source;
  excerpt: string;
  reuse: "kiara" | "ben" | null;
}

interface CompanyLink {
  name: string;
  source: Source;
  excerpt: string;
}

const SRC_FELLOWS: Source = { id: "src_pear_fellows", name: "Pear Fellows", url: PEAR_FELLOWS };
const SRC_GARAGE: Source = { id: "src_pear_garage", name: "Pear Garage", url: PEAR_GARAGE };
const SRC_DELTA_2020: Source = { id: "src_delta_fellowship_2020", name: "Delta Fellowship cohort 1 (TechCrunch)", url: DELTA_2020 };
const SRC_DELTA_2021: Source = { id: "src_delta_fellowship_2021", name: "Delta Fellowship cohort 2 (Human Capital)", url: DELTA_2021 };
const SRC_PROD: Source = { id: "src_prod_govtech", name: "Prod (GovTech / MassLive)", url: PROD_PRESS };
const SRC_GV: Source = { id: "src_prod_gv", name: "Prod founder (GV)", url: PROD_GV };

function fellow(name: string, blurb: string, universityId: string | null): Member {
  return {
    name,
    org: "pear-fellows",
    role: "Pear Fellows",
    universityId,
    source: SRC_FELLOWS,
    excerpt: `Pear's fellows page lists ${name} in Pear Fellows${blurb}.`,
    reuse: null,
  };
}

function garage(name: string, blurb: string, universityId: string | null): Member {
  return {
    name,
    org: "pear-garage",
    role: "Pear Garage",
    universityId,
    source: SRC_GARAGE,
    excerpt: `Pear's Garage page lists ${name} under Pear Garage alumni${blurb}.`,
    reuse: null,
  };
}

function delta(name: string, excerpt: string, universityId: string | null, source: Source, extraUniversityIds?: string[]): Member {
  return {
    name,
    org: "human-capital",
    role: "Delta Fellowship",
    universityId,
    extraUniversityIds,
    source,
    excerpt,
    reuse: name === "Kiara Nirghin" ? "kiara" : null,
  };
}

const MEMBERS: Member[] = [
  fellow("Shaneez Mohinani", " as a Stanford GSB Fellow", "univ_stanford"),
  fellow("Joy Chen", " as a Wharton Fellow", "univ_penn"),
  fellow("Margaret Shen", " as a Harvard Business School Fellow", "univ_harvard"),
  fellow("Anaiy Somalwar", " as a Berkeley Fellow", "univ_berkeley"),
  fellow("Nicole Quinn", ", under Select Pear Fellows Alumni, at Lightspeed", null),
  fellow("Ibrahim Alsuwaidi", ", under Select Pear Fellows Alumni, at DCM", null),
  fellow("Sam Rosen", ", under Select Pear Fellows Alumni, at GIC", null),
  fellow("Sam Shapiro", ", under Select Pear Fellows Alumni, at DFJ", null),
  fellow("Ian Taylor", ", under Select Pear Fellows Alumni, at Sequoia", null),
  fellow("Anoushka Vaswani", ", under Select Pear Fellows Alumni, at Lightspeed", null),
  fellow("Jennifer Ngai", ", under Select Pear Fellows Alumni, at DST Global", null),
  fellow("Galym Imanbayev", ", under Select Pear Fellows Alumni, at Lightspeed", null),

  garage("Ray Zhou", " as Co-Founder/Co-CEO of Affinity", null),
  garage("Shubham Goel", " as Co-Founder/Co-CEO of Affinity", null),
  garage("Katherine Liu", " as Co-Founder of Formfunction", null),
  garage("Isaac Madan", " as Co-Founder of Nightfall AI", null),
  garage("Niveditha S. Iyer", ", with Stanford as the listed campus", "univ_stanford"),
  garage("Hongxia Zhong", " as Director of Engineering at Flex", null),
  garage("Vivek Nair", " as Co-Founder/CTO of Pesto", null),
  garage("Ryan Rice", "", null),
  garage("Neetish Sharma", "", null),

  delta(
    "Abu Qader",
    "TechCrunch (13 Sep 2020) lists Abu Qader, a Cornell junior, among the Delta Fellowship winners. Sixteen fellows were selected from more than 1,300 applications.",
    "univ_cornell",
    SRC_DELTA_2020
  ),
  delta(
    "Katie Mishra",
    "TechCrunch (13 Sep 2020) lists Katie Mishra, a Stanford junior, among the Delta Fellowship winners.",
    "univ_stanford",
    SRC_DELTA_2020
  ),
  delta(
    "Eeshan Tripathii",
    "TechCrunch (13 Sep 2020) lists Eeshan Tripathii, an MIT sophomore, among the Delta Fellowship winners. The surname is spelled as printed.",
    "univ_mit",
    SRC_DELTA_2020
  ),
  delta(
    "Shagun Maheshwari",
    "Human Capital's Medium post on the 2nd Delta Fellowship cohort includes a bio of Shagun Maheshwari as a Delta Fellow.",
    null,
    SRC_DELTA_2021
  ),
  delta(
    "Alishba Imran",
    "Human Capital's Medium post on the 2nd Delta Fellowship cohort includes a bio of Alishba Imran as a Delta Fellow.",
    null,
    SRC_DELTA_2021
  ),
  delta(
    "Arsh Dilbagi",
    "Human Capital's Medium post on the 2nd Delta Fellowship cohort includes a bio of Arsh Dilbagi, a Princeton graduate, as a Delta Fellow.",
    "univ_princeton",
    SRC_DELTA_2021
  ),
  delta(
    "Cole Bransford",
    "Human Capital's Medium post on the 2nd Delta Fellowship cohort includes a bio of Cole Bransford, a Princeton graduate, as a Delta Fellow.",
    "univ_princeton",
    SRC_DELTA_2021
  ),
  delta(
    "Ryan Ozminkowski",
    "Human Capital's Medium post on the 2nd Delta Fellowship cohort includes a bio of Ryan Ozminkowski, a Princeton graduate, as a Delta Fellow.",
    "univ_princeton",
    SRC_DELTA_2021
  ),
  delta(
    "Kiara Nirghin",
    "Human Capital's Medium post on the 2nd Delta Fellowship cohort includes a bio of Kiara Nirghin, a Computer Science student at Stanford, as a Delta Fellow.",
    "univ_stanford",
    SRC_DELTA_2021
  ),
  delta(
    "Nikhara Nirghin",
    "Human Capital's Medium post on the 2nd Delta Fellowship cohort includes a bio of Nikhara Nirghin as a Delta Fellow.",
    null,
    SRC_DELTA_2021
  ),
  delta(
    "Daven Subbiah",
    "Human Capital's Medium post on the 2nd Delta Fellowship cohort includes a bio of Daven Subbiah, who graduated from UC Berkeley, as a Delta Fellow.",
    "univ_berkeley",
    SRC_DELTA_2021
  ),
  delta(
    "Jagan Subbiah",
    "Human Capital's Medium post on the 2nd Delta Fellowship cohort includes a bio of Jagan Subbiah, who graduated from UC Berkeley, as a Delta Fellow.",
    "univ_berkeley",
    SRC_DELTA_2021
  ),
  delta(
    "Jon Wang",
    "Human Capital's Medium post on the 2nd Delta Fellowship cohort includes a bio of Jon Wang, who graduated from Stanford, as a Delta Fellow.",
    "univ_stanford",
    SRC_DELTA_2021
  ),
  delta(
    "Vikram Sreedhar",
    "Human Capital's Medium post on the 2nd Delta Fellowship cohort includes a bio of Vikram Sreedhar, a Stanford grad, as a Delta Fellow.",
    "univ_stanford",
    SRC_DELTA_2021
  ),
  delta(
    "Christal Wang",
    "Human Capital's Medium post on the 2nd Delta Fellowship cohort includes a bio of Christal Wang as a Delta Fellow.",
    null,
    SRC_DELTA_2021
  ),
  delta(
    "Maxim Serebryakov",
    "Human Capital's Medium post on the 2nd Delta Fellowship cohort includes a bio of Maxim Serebryakov, who studied at Stanford, as a Delta Fellow.",
    "univ_stanford",
    SRC_DELTA_2021
  ),
  delta(
    "Andrés Pérez Soderi",
    "Human Capital's Medium post on the 2nd Delta Fellowship cohort includes a bio of Andrés Pérez Soderi, who started Sanas while at Stanford, as a Delta Fellow.",
    "univ_stanford",
    SRC_DELTA_2021
  ),
  delta(
    "Shawn Zhang",
    "Human Capital's Medium post on the 2nd Delta Fellowship cohort includes a bio of Shawn Zhang, who studied at Stanford before helping create Sanas, as a Delta Fellow.",
    "univ_stanford",
    SRC_DELTA_2021
  ),
  delta(
    "Sharon Zhou",
    "Human Capital's Medium post on the 2nd Delta Fellowship cohort includes a bio of Sharon Zhou, a graduating Stanford PhD student who had also graduated from Harvard, as a Delta Fellow.",
    "univ_stanford",
    SRC_DELTA_2021,
    ["univ_harvard"]
  ),
  {
    name: "Ben Spector",
    org: "prod",
    role: "Prod fellowship",
    universityId: "univ_mit",
    source: SRC_GV,
    excerpt: `GV (28 Jan 2026) calls Ben Spector "the founder of Prod, the mysterious incubator behind companies like Cursor, Mercor, Etched, and Decart." Recorded here as founder of the Prod fellowship (prod.so).`,
    reuse: "ben",
  },
];

const COMPANIES: CompanyLink[] = ["Mercor", "Etched", "Cursor"].map((name) => ({
  name,
  source: SRC_PROD,
  excerpt: `GovTech (10 Mar 2026) reports that ${name} is one of "just three of the companies that have been through the program, Mercor, Etched and Cursor," referring to the Prod fellowship (prod.so).`,
}));

function ensureSource(db: Database.Database, source: Source, retrievedAt: string) {
  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at)
     VALUES (?, ?, 'campus_builder_org', ?, '[]', 1, 'manual', 'available', ?)
     ON CONFLICT(id) DO UPDATE SET last_attempt_at=excluded.last_attempt_at, status='available', url=excluded.url, name=excluded.name`
  ).run(source.id, source.name, source.url, retrievedAt);
}

function insertClaim(
  db: Database.Database,
  entityType: "person" | "project",
  entityId: string,
  excerpt: string,
  source: Source,
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

function alreadyClaimed(db: Database.Database, name: string, sourceUrl: string): string | null | "ambiguous" {
  const rows = db
    .prepare(
      `SELECT p.id FROM people p
       JOIN claims c ON c.entity_id = p.id AND c.entity_type = 'person' AND c.claim_type = 'program_membership' AND c.source_url = ?
       WHERE lower(p.name) = lower(?)`
    )
    .all(sourceUrl, name) as { id: string }[];
  if (rows.length === 1) return rows[0].id;
  if (rows.length > 1) return "ambiguous";
  return null;
}

function canReuse(db: Database.Database, member: Member, id: string): boolean {
  if (member.reuse === "kiara") {
    return Boolean(db.prepare(`SELECT 1 FROM affiliations WHERE person_id=? AND university_id='univ_stanford'`).get(id));
  }
  if (member.reuse === "ben") {
    return Boolean(
      db
        .prepare(
          `SELECT 1 FROM person_project_roles r JOIN projects p ON p.id = r.project_id
           WHERE r.person_id=? AND lower(p.name)='cursor' AND lower(coalesce(r.role,'')) LIKE '%founder%'`
        )
        .get(id)
    );
  }
  const affiliated = db.prepare(`SELECT 1 FROM affiliations WHERE person_id=?`).get(id);
  const roles = db.prepare(`SELECT 1 FROM person_project_roles WHERE person_id=?`).get(id);
  return !affiliated && !roles;
}

function findPerson(db: Database.Database, member: Member): string | null | "ambiguous" {
  const claimed = alreadyClaimed(db, member.name, member.source.url);
  if (claimed) return claimed;
  const matches = db.prepare(`SELECT id FROM people WHERE lower(name) = lower(?)`).all(member.name) as { id: string }[];
  const reusable = matches.filter((row) => canReuse(db, member, row.id));
  if (member.reuse) {
    if (reusable.length === 1) return reusable[0].id;
    if (reusable.length > 1) return "ambiguous";
    return null;
  }
  if (matches.length === 0) return null;
  if (reusable.length === 1 && matches.length === 1) return reusable[0].id;
  return null;
}

function ensureAffiliation(db: Database.Database, personId: string, universityId: string, role: string, claimId: string) {
  const existing = db.prepare(`SELECT id FROM affiliations WHERE person_id=? AND university_id=? AND role=?`).get(personId, universityId, role);
  if (existing) return;
  db.prepare(`INSERT INTO affiliations (id, person_id, university_id, role, status, claim_id) VALUES (?, ?, ?, ?, 'unverified', ?)`).run(
    newId("aff"),
    personId,
    universityId,
    role,
    claimId
  );
}

function main() {
  const retrievedAt = nowIso();
  const db = getDb();
  const created = new Set<string>();
  const reused: string[] = [];
  const skipped: string[] = [];
  const linked = new Map<Member["org"], Set<string>>();
  for (const org of ["pear-fellows", "pear-garage", "human-capital", "prod"] as const) linked.set(org, new Set());

  const tx = db.transaction(() => {
    for (const source of [SRC_FELLOWS, SRC_GARAGE, SRC_DELTA_2020, SRC_DELTA_2021, SRC_PROD, SRC_GV]) ensureSource(db, source, retrievedAt);
    for (const member of MEMBERS) {
      if (member.universityId && !db.prepare(`SELECT 1 FROM universities WHERE id=?`).get(member.universityId)) {
        throw new Error(`Missing university ${member.universityId} for ${member.name}`);
      }
      const found = findPerson(db, member);
      if (found === "ambiguous") {
        skipped.push(member.name);
        continue;
      }
      let id = found;
      if (!id) {
        id = newId("person");
        db.prepare(`INSERT INTO people (id, name, aliases_json, founder_status, potential_signal) VALUES (?, ?, '[]', NULL, NULL)`).run(id, member.name);
        created.add(id);
      } else if (!created.has(id)) {
        reused.push(`${member.name} → ${id}`);
      }
      const claimId = insertClaim(
        db,
        "person",
        id,
        member.excerpt,
        member.source,
        { org: member.role, campus: member.universityId },
        retrievedAt
      );
      const campuses = [member.universityId, ...(member.extraUniversityIds ?? [])].filter((campus): campus is string => Boolean(campus));
      for (const campus of campuses) ensureAffiliation(db, id, campus, member.role, claimId);
      linked.get(member.org)?.add(id);
      if (created.has(id)) recomputePersonEnrollment(db, id);
    }

    for (const company of COMPANIES) {
      const row = db.prepare(`SELECT id FROM projects WHERE kind='company' AND lower(name)=lower(?)`).get(company.name) as { id: string } | undefined;
      if (!row) {
        skipped.push(`company:${company.name}`);
        continue;
      }
      insertClaim(db, "project", row.id, company.excerpt, company.source, { org: "Prod fellowship", company: company.name }, retrievedAt);
      linked.get("prod")?.add(row.id);
    }
  });
  tx();
  db.pragma("wal_checkpoint(TRUNCATE)");

  const places = {
    "pear-fellows": "pear fellows",
    "pear-garage": "pear garage",
    "human-capital": "human capital fellowship",
    prod: "prod fellowship",
  } as const;
  const report: Record<string, { people: number; startups: number; created: number; reused: string[] }> = {};
  for (const [org, placeKey] of Object.entries(places)) {
    const people = new Set(personIdsForPlace(placeKey));
    const startups = new Set(projectIdsForPlace(placeKey));
    const ours = linked.get(org as Member["org"]) ?? new Set();
    const unexpectedPeople = [...people].filter((id) => !ours.has(id));
    const unexpectedStartups = [...startups].filter((id) => !ours.has(id));
    if (unexpectedPeople.length || unexpectedStartups.length) {
      throw new Error(`Unexpected links for ${org}: people ${unexpectedPeople.join(",")} startups ${unexpectedStartups.join(",")}`);
    }
    const createdHere = [...people].filter((id) => created.has(id)).length;
    report[org] = {
      people: people.size,
      startups: startups.size,
      created: createdHere,
      reused: reused.filter((line) => {
        const id = line.split(" → ")[1];
        return id ? people.has(id) || startups.has(id) : false;
      }),
    };
  }
  const prizeHits = PRIZE_PROJECTS.filter((id) => projectIdsForPlace("human capital fellowship").includes(id));
  if (prizeHits.length) throw new Error(`Human Capital matched prize or namesake projects: ${prizeHits.join(",")}`);

  console.log(JSON.stringify({ skipped, report }, null, 2));
}

main();
