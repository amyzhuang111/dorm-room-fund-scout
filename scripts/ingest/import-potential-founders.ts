// Import potential founders (students and recent grads with a talent signal
// who have not founded a company):
//
//   npx tsx scripts/ingest/import-potential-founders.ts data/exports/playbook-scouted-2026-09-26-pass4.json
//
// founder_status becomes "potential" and potential_signal stores the reason.
// Stanford's David Lee and Cal Hacks' Eric Cao stay separate from the existing
// people with those names. Enrollment is recomputed from excerpts.

import crypto from "node:crypto";
import fs from "node:fs";
import { getDb, newId, nowIso } from "../../lib/db/client";
import { recomputePersonEnrollment } from "../../lib/domain/enrollment-store";
import { isSignalTier, preferSignalTier } from "../../lib/domain/signal-tier";

const SEARCH_URL = "https://html.duckduckgo.com/html/";

interface ScoutClaim {
  claim_type?: string;
  source_name?: string;
  source_url?: string | null;
  excerpt?: string;
  published_date?: string | null;
  retrieved_at?: string;
  label?: string;
  verification_state?: string;
}

interface PotentialPerson {
  id: string;
  name: string;
  founder_status?: string | null;
  potential_signal?: string | null;
  signal_tier?: string | null;
  signal_tier_basis?: string | null;
  campus_id?: string | null;
  stage?: string | null;
  stage_evidence?: string | null;
  linkedin?: string | null;
  linkedin_status?: string | null;
  linkedin_evidence?: string | null;
  source_url?: string | null;
  excerpt?: string | null;
  claims?: ScoutClaim[];
  additional_sources?: string[];
  repo_entity_id?: string;
  entity_type?: string;
}

function normName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(inc|llc|ltd|corp|co)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^the /, "");
}

function tokensOf(name: string): string[] {
  return normName(name).split(" ").filter(Boolean);
}

function cleanUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/https?:\/\/[^\s)]+/);
  return match ? match[0] : null;
}

function linkedInUrl(url: string | null | undefined): string | null {
  const clean = cleanUrl(url);
  if (!clean || !clean.includes("linkedin.com/in/")) return null;
  try {
    const parsed = new URL(clean);
    const slug = parsed.pathname.split("/in/")[1]?.split("/")[0];
    if (!slug) return null;
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const storedHost = host === "linkedin.com" ? "www.linkedin.com" : parsed.hostname.toLowerCase();
    return `https://${storedHost}/in/${slug}`;
  } catch {
    return null;
  }
}

function linkedInSlug(url: string | null | undefined): string | null {
  const canonical = linkedInUrl(url);
  if (!canonical) return null;
  return canonical.split("/in/")[1]?.toLowerCase() ?? null;
}

function sourceKey(url: string): string {
  const hash = crypto.createHash("sha1").update(url).digest("hex").slice(0, 12);
  return `src_scout_p4_${hash}`;
}

// These two names already belong to different people.
function separateReason(name: string): string | null {
  const n = normName(name);
  if (n === "david lee") return "Stanford IOAI student, not the Harvard PathCision David Lee";
  if (n === "eric cao") return "Cal Hacks tech director, not the Penn Electric Racing Eric Cao";
  return null;
}

function containsSequence(hay: string[], needle: string[]): boolean {
  if (needle.length < 2 || needle.length > hay.length) return false;
  for (let i = 0; i <= hay.length - needle.length; i++) {
    if (needle.every((token, j) => hay[i + j] === token)) return true;
  }
  return false;
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: npx tsx scripts/ingest/import-potential-founders.ts <file.json>");
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as {
    potential_founders?: PotentialPerson[];
    updates?: PotentialPerson[];
  };
  const incoming = data.potential_founders ?? [];
  const updates = data.updates ?? [];
  const db = getDb();
  const now = nowIso();

  const peopleByNorm = new Map<string, string[]>();
  const peopleBySlug = new Map<string, string[]>();
  const peopleTokens = new Map<string, string[]>();
  function rememberPerson(id: string, name: string, aliasesJson: string) {
    const n = normName(name);
    const list = peopleByNorm.get(n) ?? [];
    if (!list.includes(id)) list.push(id);
    peopleByNorm.set(n, list);
    peopleTokens.set(id, tokensOf(name));
    let aliases: string[] = [];
    try {
      aliases = JSON.parse(aliasesJson || "[]");
    } catch {
      aliases = [];
    }
    for (const alias of aliases) {
      const slug = linkedInSlug(alias.replace(/^linkedin:/, ""));
      if (!slug) continue;
      const sl = peopleBySlug.get(slug) ?? [];
      if (!sl.includes(id)) sl.push(id);
      peopleBySlug.set(slug, sl);
    }
  }
  for (const row of db.prepare(`SELECT id, name, aliases_json FROM people`).all() as { id: string; name: string; aliases_json: string }[]) {
    rememberPerson(row.id, row.name, row.aliases_json);
  }

  const beforePeople = (db.prepare(`SELECT COUNT(*) as c FROM people`).get() as { c: number }).c;
  const beforeLinkedIn = (db.prepare(`SELECT COUNT(*) as c FROM people WHERE aliases_json LIKE '%linkedin.com/in/%'`).get() as { c: number }).c;

  const skipped: string[] = [];
  const separate: string[] = [];
  const mergedPeople: string[] = [];
  const touched = new Set<string>();

  const insertClaim = db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, source_url, published_date, retrieved_at, label, verification_state)
     VALUES (?, 'person', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const claimExists = db.prepare(
    `SELECT id FROM claims WHERE entity_type = 'person' AND entity_id = ? AND claim_type = ? AND source_url = ? AND excerpt = ? LIMIT 1`
  );
  const upsertSource = db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at, last_success_at, discovered_lead_count)
     VALUES (?, ?, 'program', ?, ?, 2, 'manual', 'available', ?, ?, 1)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, url=excluded.url, last_attempt_at=excluded.last_attempt_at, last_success_at=excluded.last_success_at`
  );
  const insertPerson = db.prepare(
    `INSERT INTO people (id, name, aliases_json, signal_tier, signal_tier_basis, founder_status, potential_signal, left_school, created_at)
     VALUES (?, ?, '[]', ?, ?, 'potential', ?, 0, ?)`
  );
  const insertAff = db.prepare(
    `INSERT INTO affiliations (id, person_id, university_id, role, status, claim_id) VALUES (?, ?, ?, ?, 'unverified', ?)`
  );
  const affExists = db.prepare(`SELECT id FROM affiliations WHERE person_id = ? AND university_id = ? LIMIT 1`);

  function ensureSource(claim: ScoutClaim, campusId: string | null): string {
    const url = cleanUrl(claim.source_url) || SEARCH_URL;
    const id = sourceKey(url);
    upsertSource.run(id, claim.source_name || "Potential founder source", url, JSON.stringify(campusId ? [campusId] : []), now, now);
    return id;
  }

  function addClaim(personId: string, claim: ScoutClaim, campusId: string | null): string | null {
    const excerpt = (claim.excerpt || "").trim();
    const sourceUrl = cleanUrl(claim.source_url);
    if (!excerpt || !sourceUrl) return null;
    const claimType = claim.claim_type || "potential_founder_signal";
    const existing = claimExists.get(personId, claimType, sourceUrl, excerpt) as { id: string } | undefined;
    if (existing) return existing.id;
    const sourceId = ensureSource(claim, campusId);
    const id = newId("claim");
    insertClaim.run(
      id,
      personId,
      claimType,
      JSON.stringify({ excerpt }),
      excerpt,
      sourceId,
      sourceUrl,
      claim.published_date || null,
      claim.retrieved_at || now,
      claim.label || "observed_fact",
      claim.verification_state || "unverified"
    );
    return id;
  }

  function readAliases(personId: string): string[] {
    const row = db.prepare(`SELECT aliases_json FROM people WHERE id = ?`).get(personId) as { aliases_json: string };
    try {
      const parsed = JSON.parse(row.aliases_json || "[]") as unknown;
      return Array.isArray(parsed) ? parsed.filter((a): a is string => typeof a === "string") : [];
    } catch {
      return [];
    }
  }

  function storeLinkedIn(personId: string, person: PotentialPerson) {
    const url = linkedInUrl(person.linkedin);
    if (person.linkedin_status !== "confirmed" || !url) return;
    const aliases = readAliases(personId);
    const slug = linkedInSlug(url);
    const other = (peopleBySlug.get(slug || "") ?? []).filter((id) => id !== personId);
    if (other.length > 0) {
      skipped.push(`${person.name}: confirmed LinkedIn ${url} already belongs to ${other.join(", ")}; alias not copied`);
      return;
    }
    if (!aliases.some((alias) => linkedInSlug(alias.replace(/^linkedin:/, "")) === slug)) aliases.push(`linkedin:${url}`);
    if (!aliases.includes("linkedin_checked")) aliases.push("linkedin_checked");
    db.prepare(`UPDATE people SET aliases_json = ? WHERE id = ?`).run(JSON.stringify([...new Set(aliases)]), personId);
    const row = db.prepare(`SELECT name FROM people WHERE id = ?`).get(personId) as { name: string };
    rememberPerson(personId, row.name, JSON.stringify(aliases));
    const evidence = (person.linkedin_evidence || "").trim();
    if (evidence) {
      addClaim(
        personId,
        {
          claim_type: "linkedin_alias_discovered",
          source_name: "Confirmed LinkedIn",
          source_url: url,
          excerpt: `${person.name}: confirmed LinkedIn ${url}. ${evidence}`,
          label: "observed_fact",
          verification_state: "corroborated",
          retrieved_at: now,
        },
        person.campus_id ?? null
      );
    }
  }

  function applyTier(personId: string, tier: string | null | undefined, basis: string | null | undefined) {
    if (!isSignalTier(tier)) return;
    const row = db.prepare(`SELECT signal_tier FROM people WHERE id = ?`).get(personId) as { signal_tier: string | null };
    if (preferSignalTier(row.signal_tier, tier) !== tier || row.signal_tier === tier) return;
    db.prepare(`UPDATE people SET signal_tier = ?, signal_tier_basis = ? WHERE id = ?`).run(tier, basis ?? null, personId);
  }

  function hasCompanyFounderRole(personId: string): boolean {
    const row = db
      .prepare(
        `SELECT 1 as ok FROM person_project_roles ppr
         JOIN projects p ON p.id = ppr.project_id
         WHERE ppr.person_id = ? AND p.kind = 'company' AND ppr.role LIKE '%founder%' LIMIT 1`
      )
      .get(personId) as { ok: number } | undefined;
    return Boolean(row);
  }

  function matchPerson(person: PotentialPerson): { id: string; reason: string } | null {
    if (separateReason(person.name)) return null;
    const slug = linkedInSlug(person.linkedin);
    if (slug) {
      const hits = peopleBySlug.get(slug) ?? [];
      if (hits.length === 1) return { id: hits[0], reason: `linkedin ${slug}` };
      if (hits.length > 1) skipped.push(`${person.name}: LinkedIn slug ${slug} matches ${hits.length} people; left unmerged`);
    }
    const exact = peopleByNorm.get(normName(person.name)) ?? [];
    if (exact.length === 1) return { id: exact[0], reason: "normalized name" };
    const mine = tokensOf(person.name);
    if (mine.length < 2) return null;
    const contiguous: string[] = [];
    for (const [id, tokens] of peopleTokens) {
      if (tokens.length < 2) continue;
      if (tokens.join(" ") === mine.join(" ")) continue;
      if (containsSequence(tokens, mine) || containsSequence(mine, tokens)) contiguous.push(id);
    }
    const unique = [...new Set(contiguous)];
    if (unique.length === 1) return { id: unique[0], reason: "full name is part of one existing name" };
    return null;
  }

  function storeEvidence(personId: string, person: PotentialPerson) {
    let first: string | null = null;
    for (const claim of person.claims ?? []) {
      const id = addClaim(personId, claim, person.campus_id ?? null);
      if (!first && id) first = id;
    }
    const evidence = (person.stage_evidence || "").trim();
    const already = (person.claims ?? []).some((claim) => (claim.excerpt || "").trim() === evidence);
    if (evidence && !already) {
      addClaim(
        personId,
        {
          claim_type: "source_mention",
          source_name: person.claims?.[0]?.source_name,
          source_url: person.claims?.[0]?.source_url || person.source_url,
          excerpt: evidence,
          verification_state: "unverified",
          retrieved_at: now,
        },
        person.campus_id ?? null
      );
    }
    for (const url of person.additional_sources ?? []) {
      if (!cleanUrl(url)) continue;
      addClaim(
        personId,
        {
          claim_type: "potential_founder_signal",
          source_name: "Additional source",
          source_url: url,
          excerpt: person.excerpt || person.potential_signal || person.name,
          verification_state: person.claims?.[0]?.verification_state || "unverified",
          retrieved_at: now,
        },
        person.campus_id ?? null
      );
    }
    storeLinkedIn(personId, person);
    const campus = person.campus_id || null;
    if (campus && !affExists.get(personId, campus)) insertAff.run(newId("aff"), personId, campus, null, first);
    applyTier(personId, person.signal_tier, person.signal_tier_basis);
    if (!hasCompanyFounderRole(personId)) {
      db.prepare(`UPDATE people SET founder_status = 'potential', potential_signal = ? WHERE id = ?`).run(person.potential_signal ?? null, personId);
    } else {
      skipped.push(`${person.name} already has a company founder role; left founder_status unchanged`);
    }
    touched.add(personId);
  }

  const tx = db.transaction(() => {
    let inserted = 0;
    for (const person of incoming) {
      const apart = separateReason(person.name);
      const match = matchPerson(person);
      let personId: string;
      if (match && !apart) {
        personId = match.id;
        mergedPeople.push(`${person.name} -> ${personId} (${match.reason})`);
      } else {
        if (apart) separate.push(`${person.name} kept separate (${apart})`);
        personId = newId("person");
        insertPerson.run(
          personId,
          person.name,
          isSignalTier(person.signal_tier) ? person.signal_tier : null,
          person.signal_tier_basis ?? null,
          person.potential_signal ?? null,
          now
        );
        rememberPerson(personId, person.name, "[]");
        inserted += 1;
      }
      storeEvidence(personId, person);
    }
    console.log(`Potential founders inserted ${inserted}. Merged ${mergedPeople.length}.`);
    for (const line of mergedPeople) console.log("  merge person", line);
    for (const line of separate) console.log("  separate", line);

    let applied = 0;
    for (const update of updates) {
      const row = db.prepare(`SELECT id, name FROM people WHERE id = ?`).get(update.repo_entity_id) as { id: string; name: string } | undefined;
      if (!row) {
        skipped.push(`update ${update.name} missing ${update.repo_entity_id}`);
        continue;
      }
      if (normName(row.name) !== normName(update.name)) {
        skipped.push(`update name ${update.name} does not match ${row.name} (${row.id})`);
        continue;
      }
      storeEvidence(row.id, update);
      applied += 1;
    }
    console.log(`Updates applied ${applied} of ${updates.length}.`);

    const labeled = db
      .prepare(
        `UPDATE people SET founder_status = 'founder'
         WHERE founder_status IS NULL
           AND id IN (
             SELECT ppr.person_id FROM person_project_roles ppr
             JOIN projects p ON p.id = ppr.project_id
             WHERE p.kind = 'company' AND ppr.role LIKE '%founder%'
           )`
      )
      .run();
    console.log(`Existing company founders labeled founder_status=founder: ${labeled.changes}.`);

    const enrollmentChanges: string[] = [];
    for (const personId of touched) {
      const beforeRow = db.prepare(`SELECT name, enrollment_status FROM people WHERE id = ?`).get(personId) as {
        name: string;
        enrollment_status: string | null;
      };
      const decision = recomputePersonEnrollment(db, personId);
      db.prepare(`UPDATE affiliations SET status = ? WHERE person_id = ? AND status = 'unverified'`).run(
        decision.status === "unknown" ? "unverified" : decision.status,
        personId
      );
      const fileStage = updates.find((person) => person.repo_entity_id === personId)?.stage || incoming.find((person) => person.name === beforeRow.name)?.stage;
      if (fileStage && fileStage !== decision.status) {
        enrollmentChanges.push(`${beforeRow.name}: file said ${fileStage}, rules set ${decision.status}${decision.label ? " " + decision.label : ""}`);
      }
    }
    console.log(`Enrollment differences ${enrollmentChanges.length}.`);
    for (const line of enrollmentChanges) console.log("  enroll", line);
    console.log(`Skipped notes ${skipped.length}.`);
    for (const line of skipped) console.log("  skip", line);
  });

  tx();
  db.pragma("wal_checkpoint(TRUNCATE)");

  const afterPeople = (db.prepare(`SELECT COUNT(*) as c FROM people`).get() as { c: number }).c;
  const afterLinkedIn = (db.prepare(`SELECT COUNT(*) as c FROM people WHERE aliases_json LIKE '%linkedin.com/in/%'`).get() as { c: number }).c;
  const potential = db.prepare(`SELECT COUNT(*) as c FROM people WHERE founder_status = 'potential'`).get() as { c: number };
  const founders = db.prepare(`SELECT COUNT(*) as c FROM people WHERE founder_status = 'founder'`).get() as { c: number };
  const byCampus = db
    .prepare(
      `SELECT a.university_id as campus, COUNT(DISTINCT pe.id) as n
       FROM people pe JOIN affiliations a ON a.person_id = pe.id
       WHERE pe.founder_status = 'potential'
       GROUP BY a.university_id ORDER BY a.university_id`
    )
    .all();
  const byTier = db.prepare(`SELECT signal_tier as tier, COUNT(*) as n FROM people WHERE founder_status = 'potential' GROUP BY signal_tier ORDER BY signal_tier`).all();
  console.log("BEFORE", JSON.stringify({ people: beforePeople, linkedin: beforeLinkedIn }));
  console.log("AFTER", JSON.stringify({ people: afterPeople, linkedin: afterLinkedIn, potential: potential.c, founders: founders.c, byCampus, byTier }));
}

main();
