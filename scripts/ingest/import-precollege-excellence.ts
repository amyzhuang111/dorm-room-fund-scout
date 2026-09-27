// Record pre-college excellence from public text already stored on a person,
// then from data/imports/precollege-enrollments.json for people whose campus
// enrollment was checked on a public page.
//
//   npx tsx scripts/ingest/import-precollege-excellence.ts
//
// Confirmed means the excerpt names the person, names their school, and the
// award year fits the college class year. Anything that only matches the
// full name is stored as likely. Search-index summaries stay likely.
// Implausible years and excerpts that do not name the person are skipped.

import fs from "node:fs";
import path from "node:path";
import { getDb, newId, nowIso } from "../../lib/db/client";
import { recomputePersonEnrollment } from "../../lib/domain/enrollment-store";
import {
  detectPrecollegeMentions,
  independentCollegeGradYear,
  isSearchIndexExcerpt,
  judgePrecollegeMention,
  type PrecollegeMatchStatus,
  type PrecollegeSignalType,
} from "../../lib/domain/precollege";

const SOURCE_ID = "src_precollege_excellence";
const ENROLLMENT_FILE = path.join(process.cwd(), "data", "imports", "precollege-enrollments.json");

interface IncomingClaim {
  claim_type?: string;
  source_name?: string;
  source_url: string;
  excerpt: string;
  verification_state?: string;
}

interface IncomingPerson {
  name: string;
  aliases?: string[];
  university_id: string;
  role?: string;
  potential_signal: string;
  claims: IncomingClaim[];
}

interface IncomingUpdate {
  name: string;
  claims: IncomingClaim[];
}

interface Candidate {
  personId: string;
  signalType: PrecollegeSignalType;
  tier: 1 | 2;
  label: string;
  year: number | null;
  matchStatus: PrecollegeMatchStatus;
  sourceUrl: string;
  excerpt: string;
  searchIndex: boolean;
}

function normName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function prefer(current: Candidate, incoming: Candidate): Candidate {
  if (current.matchStatus !== incoming.matchStatus) return current.matchStatus === "confirmed" ? current : incoming;
  if (current.searchIndex !== incoming.searchIndex) return current.searchIndex ? incoming : current;
  if ((current.year == null) !== (incoming.year == null)) return current.year == null ? incoming : current;
  if (current.year != null && incoming.year != null && current.year !== incoming.year) return current.year > incoming.year ? current : incoming;
  return current.excerpt.length >= incoming.excerpt.length ? current : incoming;
}

function main() {
  const db = getDb();
  const now = nowIso();
  const file = JSON.parse(fs.readFileSync(ENROLLMENT_FILE, "utf8")) as { people?: IncomingPerson[]; updates?: IncomingUpdate[] };
  const incoming = file.people ?? [];
  const updates = file.updates ?? [];

  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at, last_success_at, tier_rationale)
     VALUES (?, 'Pre-college excellence lists', 'reference', 'https://www.societyforscience.org/regeneron-sts/', '[]', 2, 'manual', 'available', ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET last_success_at = excluded.last_success_at, last_attempt_at = excluded.last_attempt_at`
  ).run(
    SOURCE_ID,
    now,
    now,
    "Official winner lists and public profile text. Source priority only. Not a Founder Signal input."
  );

  const insertPerson = db.prepare(
    `INSERT INTO people (id, name, aliases_json, founder_status, potential_signal, left_school, created_at)
     VALUES (?, ?, ?, 'potential', ?, 0, ?)`
  );
  const insertAffiliation = db.prepare(
    `INSERT INTO affiliations (id, person_id, university_id, role, status, claim_id) VALUES (?, ?, ?, ?, 'current_student', ?)`
  );
  const insertClaim = db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, source_url, retrieved_at, label, verification_state)
     VALUES (?, 'person', ?, ?, ?, ?, ?, ?, ?, 'observed_fact', ?)`
  );

  let addedPeople = 0;
  for (const person of incoming) {
    if (!person.name || !person.university_id || !person.claims?.length) {
      console.log(`skip enrollment row missing name, campus, or claims: ${person.name || "(unnamed)"}`);
      continue;
    }
    const existing = db.prepare(`SELECT id FROM people WHERE lower(name) = lower(?)`).all(person.name) as { id: string }[];
    const byNorm = existing.length
      ? existing
      : (db.prepare(`SELECT id, name FROM people`).all() as { id: string; name: string }[]).filter((row) => normName(row.name) === normName(person.name));
    let personId = byNorm.length === 1 ? byNorm[0].id : null;
    if (byNorm.length > 1) {
      console.log(`skip ${person.name}: ${byNorm.length} people already use that name`);
      continue;
    }
    if (!personId) {
      personId = newId("person");
      insertPerson.run(personId, person.name, JSON.stringify(person.aliases ?? []), person.potential_signal, now);
      addedPeople += 1;
    } else {
      db.prepare(
        `UPDATE people SET founder_status = COALESCE(founder_status, 'potential'), potential_signal = COALESCE(potential_signal, ?) WHERE id = ?`
      ).run(person.potential_signal, personId);
    }
    let firstClaim: string | null = null;
    for (const claim of person.claims) {
      if (!claim.source_url?.startsWith("http") || !claim.excerpt?.trim()) continue;
      const dup = db
        .prepare(`SELECT id FROM claims WHERE entity_type = 'person' AND entity_id = ? AND source_url = ? AND excerpt = ?`)
        .get(personId, claim.source_url, claim.excerpt) as { id: string } | undefined;
      if (dup) {
        firstClaim = firstClaim ?? dup.id;
        continue;
      }
      const claimId = newId("claim");
      insertClaim.run(
        claimId,
        personId,
        claim.claim_type || "source_mention",
        JSON.stringify({ origin: "precollege_enrollment" }),
        claim.excerpt,
        SOURCE_ID,
        claim.source_url,
        now,
        claim.verification_state || "corroborated"
      );
      firstClaim = firstClaim ?? claimId;
    }
    const aff = db.prepare(`SELECT id FROM affiliations WHERE person_id = ? AND university_id = ?`).get(personId, person.university_id) as { id: string } | undefined;
    if (!aff) insertAffiliation.run(newId("aff"), personId, person.university_id, person.role || "undergrad", firstClaim);
    recomputePersonEnrollment(db, personId);
  }

  for (const update of updates) {
    const hits = (db.prepare(`SELECT id, name FROM people`).all() as { id: string; name: string }[]).filter((row) => normName(row.name) === normName(update.name));
    if (hits.length !== 1) {
      console.log(`skip update ${update.name}: ${hits.length} name matches`);
      continue;
    }
    const personId = hits[0].id;
    for (const claim of update.claims ?? []) {
      if (!claim.source_url?.startsWith("http") || !claim.excerpt?.trim()) continue;
      const dup = db
        .prepare(`SELECT id FROM claims WHERE entity_type = 'person' AND entity_id = ? AND source_url = ? AND excerpt = ?`)
        .get(personId, claim.source_url, claim.excerpt) as { id: string } | undefined;
      if (dup) continue;
      insertClaim.run(
        newId("claim"),
        personId,
        claim.claim_type || "source_mention",
        JSON.stringify({ origin: "precollege_page" }),
        claim.excerpt,
        SOURCE_ID,
        claim.source_url,
        now,
        claim.verification_state || "corroborated"
      );
    }
  }

  db.prepare(`DELETE FROM precollege_signals`).run();
  db.prepare(`DELETE FROM claims WHERE claim_type = 'precollege_excellence'`).run();

  const people = db.prepare(`SELECT id, name, enrollment_grad_year, enrollment_evidence FROM people`).all() as {
    id: string;
    name: string;
    enrollment_grad_year: number | null;
    enrollment_evidence: string | null;
  }[];
  const universitiesByPerson = new Map<string, string[]>();
  for (const row of db.prepare(`SELECT person_id, university_id FROM affiliations`).all() as { person_id: string; university_id: string }[]) {
    const list = universitiesByPerson.get(row.person_id) ?? [];
    list.push(row.university_id);
    universitiesByPerson.set(row.person_id, list);
  }
  const campusName = new Map(
    (db.prepare(`SELECT id, name FROM universities`).all() as { id: string; name: string }[]).map((row) => [row.id, row.name])
  );

  const claims = db
    .prepare(
      `SELECT entity_id, excerpt, source_url FROM claims
       WHERE entity_type = 'person' AND source_url LIKE 'http%' AND trim(excerpt) != ''
         AND claim_type NOT IN ('linkedin_candidate', 'linkedin_search_attempt', 'precollege_excellence')`
    )
    .all() as { entity_id: string; excerpt: string; source_url: string }[];
  const claimsByPerson = new Map<string, { excerpt: string; source_url: string }[]>();
  for (const claim of claims) {
    const list = claimsByPerson.get(claim.entity_id) ?? [];
    list.push(claim);
    claimsByPerson.set(claim.entity_id, list);
  }

  const best = new Map<string, Candidate>();
  const skipped = { name: 0, year: 0, empty: 0 };
  for (const person of people) {
    const gradYear = independentCollegeGradYear(person.enrollment_evidence, person.enrollment_grad_year);
    const universityIds = universitiesByPerson.get(person.id) ?? [];
    for (const claim of claimsByPerson.get(person.id) ?? []) {
      const mentions = detectPrecollegeMentions(claim.excerpt);
      if (!mentions.length) {
        skipped.empty += 1;
        continue;
      }
      for (const mention of mentions) {
        const judged = judgePrecollegeMention({
          personName: person.name,
          excerpt: claim.excerpt,
          mention,
          collegeGradYear: gradYear,
          universityIds,
        });
        if (!judged.ok) {
          if (judged.reason === "name") skipped.name += 1;
          else skipped.year += 1;
          continue;
        }
        const candidate: Candidate = {
          personId: person.id,
          signalType: judged.signalType,
          tier: judged.tier,
          label: judged.label,
          year: judged.year,
          matchStatus: judged.matchStatus,
          sourceUrl: claim.source_url,
          excerpt: claim.excerpt.slice(0, 500),
          searchIndex: isSearchIndexExcerpt(claim.excerpt),
        };
        const key = `${candidate.personId}|${candidate.signalType}`;
        const prev = best.get(key);
        best.set(key, prev ? prefer(prev, candidate) : candidate);
      }
    }
  }

  const insertSignal = db.prepare(
    `INSERT INTO precollege_signals (id, person_id, signal_type, tier, label, year, match_status, school, source_url, excerpt, claim_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const tx = db.transaction(() => {
    for (const candidate of best.values()) {
      const claimId = newId("claim");
      insertClaim.run(
        claimId,
        candidate.personId,
        "precollege_excellence",
        JSON.stringify({
          signalType: candidate.signalType,
          tier: candidate.tier,
          label: candidate.label,
          year: candidate.year,
          matchStatus: candidate.matchStatus,
        }),
        candidate.excerpt,
        SOURCE_ID,
        candidate.sourceUrl,
        now,
        candidate.matchStatus === "confirmed" ? "corroborated" : "unverified"
      );
      const schools = (universitiesByPerson.get(candidate.personId) ?? []).map((id) => campusName.get(id) ?? id).join(", ");
      insertSignal.run(
        newId("pcs"),
        candidate.personId,
        candidate.signalType,
        candidate.tier,
        candidate.label,
        candidate.year,
        candidate.matchStatus,
        schools || null,
        candidate.sourceUrl,
        candidate.excerpt,
        claimId
      );
    }
  });
  tx();

  console.log(`new potential founders: ${addedPeople}`);
  console.log(`signals stored: ${best.size} (skipped unnamed excerpts ${skipped.name}, implausible years ${skipped.year})`);
  const counts = db
    .prepare(
      `SELECT COALESCE(u.name, 'No campus') as campus, s.signal_type, s.match_status, COUNT(*) as n
       FROM precollege_signals s
       JOIN people pe ON pe.id = s.person_id
       LEFT JOIN affiliations a ON a.person_id = pe.id
       LEFT JOIN universities u ON u.id = a.university_id
       GROUP BY campus, s.signal_type, s.match_status
       ORDER BY campus, s.signal_type, s.match_status`
    )
    .all();
  console.log(JSON.stringify(counts, null, 2));
}

main();
