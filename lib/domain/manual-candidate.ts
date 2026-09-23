import { getDb, newId, nowIso } from "../db/client";
import { assembleProjectFacts } from "./facts";
import { evaluateAllGates } from "../screening/gates";

const SOURCE_ID = "src_manual_referrals";

export type FounderStatus = "current_student" | "recent_grad" | "older_alumni" | "unverified";

export interface ManualReferralInput {
  companyName: string;
  description?: string | null;
  websiteUrl?: string | null;
  universityId: string;
  founderNames: string[];
  founderStatus: FounderStatus;
  noteBody: string;
  referrer: string;
}

function ensureManualReferralSource() {
  const db = getDb();
  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at, last_success_at)
     VALUES (?, 'Manual referrals', 'manual_referral', '(user-entered)', '[]', 1, 'manual', 'available', ?, ?)
     ON CONFLICT(id) DO NOTHING`
  ).run(SOURCE_ID, nowIso(), nowIso());
}

// A firsthand lead Amy enters herself — e.g. "who kept building after the
// hackathon," per the brief's discovery-loop guidance. Labeled as a user_note
// claim, never dressed up as an independently observed fact, and immediately
// screened through the same deterministic gates every other candidate goes
// through (no special-casing for manually entered leads). Shared by both the
// single-entry Server Action and the CSV importer.
export function createManualCandidate(input: ManualReferralInput): { projectId: string } {
  const db = getDb();
  ensureManualReferralSource();
  const retrievedAt = nowIso();

  const projectId = newId("proj");
  db.prepare(
    `INSERT INTO projects (id, name, aliases_json, kind, sector, description, website_url, is_portfolio_reference, is_investable_candidate)
     VALUES (?, ?, '[]', 'company', NULL, ?, ?, 0, 1)`
  ).run(projectId, input.companyName, input.description ?? null, input.websiteUrl ?? null);

  const claimId = newId("claim");
  const excerpt = `Manual referral from ${input.referrer}: ${input.noteBody}`;
  db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, source_url, retrieved_at, label, verification_state)
     VALUES (?, 'project', ?, 'manual_referral', ?, ?, ?, '(user-entered)', ?, 'user_note', 'unverified')`
  ).run(claimId, projectId, JSON.stringify({ company: input.companyName, referrer: input.referrer }), excerpt, SOURCE_ID, retrievedAt);

  const findPerson = db.prepare(`SELECT id FROM people WHERE name = ?`);
  const insertPerson = db.prepare(`INSERT INTO people (id, name, aliases_json) VALUES (?, ?, '[]')`);
  const insertAffiliation = db.prepare(
    `INSERT INTO affiliations (id, person_id, university_id, role, status, claim_id) VALUES (?, ?, ?, 'Manually referred founder', ?, ?)`
  );
  const insertRole = db.prepare(`INSERT INTO person_project_roles (id, person_id, project_id, role, claim_id) VALUES (?, ?, ?, 'founder', ?)`);
  const insertRel = db.prepare(
    `INSERT INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json, user_note, verification_state)
     VALUES (?, 'person', ?, 'project', ?, 'founded', ?, ?, 'affiliation_only')`
  );

  for (const name of input.founderNames) {
    let person = findPerson.get(name) as { id: string } | undefined;
    const personId = person?.id ?? newId("person");
    if (!person) insertPerson.run(personId, name);
    insertAffiliation.run(newId("aff"), personId, input.universityId, input.founderStatus, claimId);
    insertRole.run(newId("ppr"), personId, projectId, claimId);
    insertRel.run(newId("rel"), personId, projectId, JSON.stringify([claimId]), input.noteBody);
  }

  // Screen immediately — a manually entered lead goes through the exact same gates as an ingested one.
  const facts = assembleProjectFacts(db, projectId);
  const outcomes = evaluateAllGates(facts);
  const upsertGate = db.prepare(
    `INSERT INTO gate_results (id, project_id, gate_name, result, rationale, evaluated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(project_id, gate_name) DO UPDATE SET result=excluded.result, rationale=excluded.rationale, evaluated_at=excluded.evaluated_at`
  );
  for (const o of outcomes) upsertGate.run(newId("gate"), projectId, o.gate, o.result, o.rationale);

  return { projectId };
}
