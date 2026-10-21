// Real ingestion from the Jerome Fisher Program in Management & Technology's
// (M&T) public "Alumni Profiles" page (fisher.wharton.upenn.edu) — closes
// cat_mt_penn (previously "unconfigured") at its correctly-cautious tier:
// Founder Scout S as a SEARCH POOL only, standalone evidence strength
// deliberately D. M&T is an admissions cohort, not a builder org — per
// CLAUDE.md's own instruction, membership alone is NEVER Founder Signal.
// This adapter follows that instruction literally: it does NOT create a
// 'founder' role for anyone just for being M&T alumni. It only records:
// (a) the person + their M&T class year as an affiliation (identity-graph
// seed, useful for cross-referencing if they show up building something
// elsewhere later), and (b) a real 'founder' role ONLY where the alumni
// profile's own published text explicitly discloses one.
//
// The list page (/alumni-profiles/) only renders 10 profiles server-side
// (a "List Category Posts" plugin block, likely capped/most-recent — no
// pagination found) — bounded to exactly those 10, not a guess at a larger
// number. Two class-year formats exist across the list ("mt-for-life" posts
// with parenthetical class years, "alumni" post-type posts with a trailing
// comma-separated class year) — hand-transcribed below rather than
// regex-parsed, matching this codebase's own GRASP-adapter precedent for
// hand-extraction at small N ("Founder names are hand-extracted... not a
// generic regex — this exact dataset has phrasing a regex would misparse").
//
// Of the 10 profiles, 2 explicitly self-disclose a real founder claim in
// their own published text (checked directly, not guessed — the other 8
// are genuine career updates with no founder language at all):
//   - Arjun Srinivas (M&T'07): "I spun my senior design work out and formed
//     a Company, Innova Dynamics, with my co-founders Alex Mittal, Cal
//     Peng, and Priyanka Agarwal (who were all also M&T'07)." Later
//     acquired by TPK Holdings — disclosed as such in the claim excerpt,
//     not hidden, since it's not a live pre-seed candidate. The 3 named
//     co-founders are recorded too, but flagged in their own claim excerpt
//     as corroborated only by Arjun's own account, not by a profile of
//     their own on this site.
//   - Bret Pearlman (M&T'89): author bio at the end of his post reads
//     "Bret Pearlman (M&T'89) is the Co-Founder and Managing Director of
//     Elevation Partners." A real growth-equity firm, not a startup — still
//     recorded honestly as what the source actually says, not filtered out.
//
// Run: npx tsx scripts/ingest/fetch-mt-alumni.ts

import crypto from "node:crypto";
import { getDb, newId, nowIso } from "../../lib/db/client";
import { previousSnapshotHash } from "../../lib/ingest/dedup";

const SOURCE_ID = "src_mt_penn";
const UNIV_ID = "univ_penn";
const ORG_PROJECT_ID = "proj_mt_penn";
const LIST_URL = "https://fisher.wharton.upenn.edu/alumni-profiles/";

interface Member {
  name: string;
  classYear: string;
  url: string;
}

// Hand-transcribed from the list page's own link text (see header note).
const MEMBERS: Member[] = [
  { name: "Reed Ginsberg", classYear: "M&T'18, MEng'19", url: "https://fisher.wharton.upenn.edu/mt-for-life/where-are-they-now-reed-ginsberg-mt-18-meng-19/" },
  { name: "Bret Pearlman", classYear: "M&T'89", url: "https://fisher.wharton.upenn.edu/mt-for-life/where-are-they-now-bret-pearlman-mt-89/" },
  { name: "Simon Oh", classYear: "M&T'18", url: "https://fisher.wharton.upenn.edu/mt-for-life/where-are-they-now-simon-oh-mt-18/" },
  { name: "Jeff Kessler", classYear: "M&T'16", url: "https://fisher.wharton.upenn.edu/mt-for-life/where-are-they-now-jeff-kessler-mt-16/" },
  { name: "Kimberly Gallant", classYear: "M&T'08", url: "https://fisher.wharton.upenn.edu/mt-for-life/where-are-they-now-kim-gallant-mt-08/" },
  { name: "Arjun Srinivas", classYear: "M&T'07", url: "https://fisher.wharton.upenn.edu/alumni/arjun-srinivas-mt-07/" },
  { name: "Alaric Qin", classYear: "M&T'16", url: "https://fisher.wharton.upenn.edu/alumni/alaric-qin-mt-16/" },
  { name: "Neha Mathur", classYear: "M&T'14", url: "https://fisher.wharton.upenn.edu/alumni/neha-mathur-mt-14/" },
  { name: "Ryan Marschang", classYear: "M&T'14", url: "https://fisher.wharton.upenn.edu/alumni/ryan-marschang-mt-14/" },
  { name: "Sonali K. Shah", classYear: "M&T'96", url: "https://fisher.wharton.upenn.edu/alumni/sonali-k-shah-mt-96/" },
];

interface FounderClaim {
  personName: string; // must match a Member.name above, or be a co-founder named only in another person's text
  companyName: string;
  companyDescription: string;
  excerpt: string;
  sourceUrl: string;
  corroboration: "own_profile" | "named_by_cofounder_only";
  /** Acquired companies and non-startups stay in the identity graph and stay out of Startup Scout. */
  investable: boolean;
}

const FOUNDER_CLAIMS: FounderClaim[] = [
  {
    personName: "Arjun Srinivas",
    companyName: "Innova Dynamics",
    companyDescription:
      "Material-science startup spun out of Arjun Srinivas's M&T senior design work (M&T'07). Grew to 35+ people (SF HQ, Japan, Taiwan), raised $30M+ across 3 rounds, acquired by Taiwan-based TPK Holdings (TPE:3673) — an exit, not a live pre-seed candidate; recorded as real founder-experience evidence for the identity graph, not a current investment target.",
    excerpt:
      "Arjun Srinivas's own M&T alumni profile: \"Prior to graduation, I spun my senior design work out and formed a Company, Innova Dynamics, with my co-founders Alex Mittal, Cal Peng, and Priyanka Agarwal (who were all also M&T '07). In nine years, we grew the company to 35+ people... raised over $30M... completed an acquisition with the Taiwan-based TPK Holdings.\"",
    sourceUrl: "https://fisher.wharton.upenn.edu/alumni/arjun-srinivas-mt-07/",
    corroboration: "own_profile",
    investable: false,
  },
  {
    personName: "Alex Mittal",
    companyName: "Innova Dynamics",
    companyDescription: "Same company as Arjun Srinivas's entry above — see that claim for the full description.",
    excerpt:
      "Named by Arjun Srinivas in his own M&T alumni profile as one of his 3 co-founders on Innova Dynamics (\"my co-founders Alex Mittal, Cal Peng, and Priyanka Agarwal, who were all also M&T '07\") — corroborated only by Arjun's own account, not by a profile of Alex Mittal's own on this site.",
    sourceUrl: "https://fisher.wharton.upenn.edu/alumni/arjun-srinivas-mt-07/",
    corroboration: "named_by_cofounder_only",
    investable: false,
  },
  {
    personName: "Cal Peng",
    companyName: "Innova Dynamics",
    companyDescription: "Same company as Arjun Srinivas's entry above — see that claim for the full description.",
    excerpt:
      "Named by Arjun Srinivas in his own M&T alumni profile as one of his 3 co-founders on Innova Dynamics (\"my co-founders Alex Mittal, Cal Peng, and Priyanka Agarwal, who were all also M&T '07\") — corroborated only by Arjun's own account, not by a profile of Cal Peng's own on this site.",
    sourceUrl: "https://fisher.wharton.upenn.edu/alumni/arjun-srinivas-mt-07/",
    corroboration: "named_by_cofounder_only",
    investable: false,
  },
  {
    personName: "Priyanka Agarwal",
    companyName: "Innova Dynamics",
    companyDescription: "Same company as Arjun Srinivas's entry above — see that claim for the full description.",
    excerpt:
      "Named by Arjun Srinivas in his own M&T alumni profile as one of his 3 co-founders on Innova Dynamics (\"my co-founders Alex Mittal, Cal Peng, and Priyanka Agarwal, who were all also M&T '07\") — corroborated only by Arjun's own account, not by a profile of Priyanka Agarwal's own on this site.",
    sourceUrl: "https://fisher.wharton.upenn.edu/alumni/arjun-srinivas-mt-07/",
    corroboration: "named_by_cofounder_only",
    investable: false,
  },
  {
    personName: "Bret Pearlman",
    companyName: "Elevation Partners",
    companyDescription:
      "A real growth-equity/private-equity firm, not a startup — recorded honestly as what the source discloses, not filtered for fitting a pre-seed thesis. Never itself a pre-seed candidate (is_investable_candidate=0).",
    excerpt:
      "Author bio at the end of Bret Pearlman's own M&T alumni profile: \"Bret Pearlman (M&T'89) is the Co-Founder and Managing Director of Elevation Partners.\"",
    sourceUrl: "https://fisher.wharton.upenn.edu/mt-for-life/where-are-they-now-bret-pearlman-mt-89/",
    corroboration: "own_profile",
    investable: false,
  },
];

async function main() {
  const db = getDb();
  const retrievedAt = nowIso();

  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at)
     VALUES (?, 'M&T (Jerome Fisher Program) — Alumni Profiles', 'lab_or_research', ?, ?, 2, 'html_scrape', 'available', ?)
     ON CONFLICT(id) DO UPDATE SET last_attempt_at=excluded.last_attempt_at, status='available'`
  ).run(SOURCE_ID, LIST_URL, JSON.stringify([UNIV_ID]), retrievedAt);

  const listRes = await fetch(LIST_URL, { headers: { "user-agent": "campus-universe-research-bot/0.1 (manual, bounded)" } });
  if (!listRes.ok) {
    db.prepare(`UPDATE sources SET status='failed', error=? WHERE id=?`).run(`HTTP ${listRes.status}`, SOURCE_ID);
    throw new Error(`HTTP ${listRes.status}`);
  }
  const listHtml = await listRes.text();
  const listHash = crypto.createHash("sha256").update(listHtml).digest("hex");

  let snapshotId: string;
  if (previousSnapshotHash(db, SOURCE_ID, LIST_URL) !== listHash) {
    snapshotId = newId("snap");
    db.prepare(
      `INSERT INTO snapshots (id, source_id, url, content_hash, fetched_at, http_status, raw_excerpt) VALUES (?, ?, ?, ?, ?, 200, ?)`
    ).run(snapshotId, SOURCE_ID, LIST_URL, listHash, retrievedAt, "M&T Alumni Profiles list page (10 profiles rendered)");
  } else {
    snapshotId = (
      db.prepare(`SELECT id FROM snapshots WHERE source_id = ? AND url = ? ORDER BY fetched_at DESC LIMIT 1`).get(SOURCE_ID, LIST_URL) as { id: string }
    ).id;
  }

  db.prepare(
    `INSERT INTO projects (id, name, aliases_json, kind, sector, description, website_url, is_portfolio_reference, is_investable_candidate)
     VALUES (?, 'M&T (Jerome Fisher Program in Management & Technology)', '[]', 'project', 'dual_degree_admissions_cohort', 'A selective Penn Engineering + Wharton dual-degree admissions cohort — NOT a builder org. Never itself founder evidence; a high-density identity-graph search pool only, per CLAUDE.md whatNotToInfer.', 'https://fisher.wharton.upenn.edu/', 0, 0)
     ON CONFLICT(id) DO NOTHING`
  ).run(ORG_PROJECT_ID);
  db.prepare(
    `INSERT OR IGNORE INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json, verification_state)
     VALUES (?, 'project', ?, 'university', ?, 'affiliated_with', '[]', 'affiliation_only')`
  ).run(newId("rel"), ORG_PROJECT_ID, UNIV_ID);

  const findPersonByName = db.prepare(`SELECT id FROM people WHERE name = ?`);
  const insertPerson = db.prepare(`INSERT INTO people (id, name, aliases_json) VALUES (?, ?, '[]')`);
  const findAffiliation = db.prepare(`SELECT id FROM affiliations WHERE person_id = ? AND university_id = ? AND role = ?`);
  const insertAffiliation = db.prepare(
    `INSERT INTO affiliations (id, person_id, university_id, role, status, claim_id) VALUES (?, ?, ?, ?, 'older_alumni', ?)`
  );
  const findPPRole = db.prepare(`SELECT id FROM person_project_roles WHERE person_id = ? AND project_id = ?`);
  const insertPPRole = db.prepare(`INSERT INTO person_project_roles (id, person_id, project_id, role, claim_id) VALUES (?, ?, ?, ?, ?)`);
  const insertRel = db.prepare(
    `INSERT INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json, verification_state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertClaim = db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, snapshot_id, source_url, retrieved_at, label, verification_state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'observed_fact', ?)`
  );
  const findProjectByName = db.prepare(`SELECT id FROM projects WHERE name = ? AND kind = 'company'`);
  const insertCompany = db.prepare(
    `INSERT INTO projects (id, name, aliases_json, kind, sector, description, is_portfolio_reference, is_investable_candidate)
     VALUES (?, ?, '[]', 'company', NULL, ?, 0, ?)`
  );

  function getOrCreatePerson(name: string): { id: string; isNew: boolean } {
    const existing = findPersonByName.get(name) as { id: string } | undefined;
    if (existing) return { id: existing.id, isNew: false };
    const id = newId("person");
    insertPerson.run(id, name);
    return { id, isNew: true };
  }

  let newPeople = 0;
  let newAffiliations = 0;

  for (const m of MEMBERS) {
    const { id: personId, isNew } = getOrCreatePerson(m.name);
    if (isNew) newPeople++;

    if (!findAffiliation.get(personId, UNIV_ID, "M&T alumnus")) {
      const excerpt = `M&T's public Alumni Profiles page lists "${m.name}" (${m.classYear}), with a dedicated "Where Are They Now?"/alumni profile at ${m.url}. Membership alone is NOT founder signal — see this org's own whatNotToInfer.`;
      const affClaimId = newId("claim");
      insertClaim.run(
        affClaimId,
        "affiliation",
        personId,
        "affiliation",
        JSON.stringify({ university: "University of Pennsylvania", program: "M&T", classYear: m.classYear }),
        excerpt,
        SOURCE_ID,
        snapshotId,
        m.url,
        retrievedAt,
        "unverified"
      );
      insertAffiliation.run(newId("aff"), personId, UNIV_ID, "M&T alumnus", affClaimId);
      newAffiliations++;

      if (!findPPRole.get(personId, ORG_PROJECT_ID)) {
        insertPPRole.run(newId("ppr"), personId, ORG_PROJECT_ID, "alumnus", affClaimId);
        insertRel.run(newId("rel"), "person", personId, "project", ORG_PROJECT_ID, "participated_in_program", JSON.stringify([affClaimId]), "affiliation_only");
      }
    }
  }

  let newCompanies = 0;
  let newFounderRoles = 0;

  for (const fc of FOUNDER_CLAIMS) {
    const { id: personId, isNew } = getOrCreatePerson(fc.personName);
    if (isNew) newPeople++;

    let companyId: string;
    const existingCo = findProjectByName.get(fc.companyName) as { id: string } | undefined;
    if (existingCo) {
      companyId = existingCo.id;
    } else {
      companyId = newId("proj");
      insertCompany.run(companyId, fc.companyName, fc.companyDescription, fc.investable ? 1 : 0);
      newCompanies++;
    }

    if (!findPPRole.get(personId, companyId)) {
      const claimId = newId("claim");
      insertClaim.run(
        claimId,
        "project",
        companyId,
        "self_reported_founder",
        JSON.stringify({ person: fc.personName, company: fc.companyName, corroboration: fc.corroboration }),
        fc.excerpt,
        SOURCE_ID,
        snapshotId,
        fc.sourceUrl,
        retrievedAt,
        fc.corroboration === "own_profile" ? "corroborated" : "unverified"
      );
      insertPPRole.run(newId("ppr"), personId, companyId, "founder", claimId);
      insertRel.run(newId("rel"), "person", personId, "project", companyId, "founded", JSON.stringify([claimId]), "affiliation_only");
      newFounderRoles++;
    }
  }

  const totalIngested = (
    db.prepare(`SELECT COUNT(DISTINCT person_id) c FROM person_project_roles WHERE project_id = ?`).get(ORG_PROJECT_ID) as { c: number }
  ).c;
  db.prepare(`UPDATE sources SET last_success_at=?, discovered_lead_count=? WHERE id=?`).run(nowIso(), totalIngested, SOURCE_ID);

  console.log(
    `${newPeople} new person(s), ${newAffiliations} new affiliation(s), ${newCompanies} new compan(y/ies), ${newFounderRoles} new founder role(s), ${totalIngested} total M&T alumni on file.`
  );
  console.log(
    "8 of 10 profiles had zero founder language and were recorded as identity-graph affiliation only, per this source's own whatNotToInfer. 2 explicit self-disclosed founder claims recorded: Arjun Srinivas + 3 named co-founders on Innova Dynamics (acquired — disclosed, not hidden), and Bret Pearlman on Elevation Partners (a PE firm, not a startup — recorded honestly regardless)."
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
