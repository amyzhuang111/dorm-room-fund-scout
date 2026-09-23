// FOUNDER_SCOUT_SOURCING.md §65-67 — "Company detection": a person's own
// bio/profile text can hint at a company they're building, but §67 is
// explicit that a hackathon/GitHub/research project must NEVER
// auto-become a Startup Scout candidate from this alone. This module only
// ever produces a reviewable `possible_companies` row (see schema.sql) —
// promotion to a real `kind='company'` project stays a human decision,
// except when the SAME PERSON already has a confirmed 'founder' role on a
// real company (see rule 1 below), where auto-linking is corroboration of
// an already-established fact, not a guess.
//
// The only structured personal-bio text this codebase currently captures
// is the `GitHub bio: "..."` marker fetch-wdb-github.ts writes into a
// claim's excerpt (and, going forward, the `GitHub company field: "..."`
// marker alongside it — see that script's header). Scanning free-form
// claim excerpts generally would risk misreading language like "advised
// by" or "affiliated with" as a founding claim (exactly the mistake
// fetch-grasp-startups.ts's header explains avoiding) — so this only ever
// parses text inside that one specific, self-authored marker format, never
// arbitrary prose.
import type Database from "better-sqlite3";
import { newId } from "../db/client";

export interface DetectionCandidate {
  personId: string;
  personName: string;
  companyNameGuess: string;
  detectionMethod: "bio_keyword" | "bio_company_field";
  evidenceExcerpt: string;
  sourceClaimId: string;
  sourceUrl: string | null;
}

const BIO_RE = /GitHub bio: "([^"]*)"/;
const COMPANY_FIELD_RE = /GitHub company field: "([^"]*)"/;
// "co-founder @simstudioai" / "founder @harveyai" — a self-tagged handle.
const AT_HANDLE_RE = /\b(?:co-?founder|founder)\b[^@\n]{0,20}@([A-Za-z0-9][\w.-]{1,40})/i;
// "founder of Latency Labs" — a free-text company name, capped and
// terminated at sentence punctuation so it can't run past the real name.
const OF_PHRASE_RE = /\bfounder\s+of\s+([A-Z][\w&.'\- ]{1,60}?)(?=[.,;]|$)/i;

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function detectPossibleCompanies(db: Database.Database): DetectionCandidate[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT c.id as claim_id, c.excerpt, c.source_url, ppr.person_id as person_id, pe.name as person_name
       FROM claims c
       JOIN person_project_roles ppr ON ppr.claim_id = c.id
       JOIN people pe ON pe.id = ppr.person_id
       WHERE c.excerpt LIKE '%GitHub bio: "%'`
    )
    .all() as { claim_id: string; excerpt: string; source_url: string | null; person_id: string; person_name: string }[];

  const out: DetectionCandidate[] = [];
  const seen = new Set<string>(); // personId::normalizedGuess, so one bio quoted on several repo claims isn't reported twice

  for (const r of rows) {
    const bioMatch = r.excerpt.match(BIO_RE);
    if (!bioMatch) continue;
    const bio = bioMatch[1];

    // Prefer the person's own structured "company" field over a handle
    // parsed out of free-text bio prose, when both are present.
    const companyFieldMatch = r.excerpt.match(COMPANY_FIELD_RE);
    const hasFounderWord = /\b(co-?founder|founder)\b/i.test(bio);

    let guess: string | null = null;
    let method: DetectionCandidate["detectionMethod"] = "bio_keyword";
    if (hasFounderWord && companyFieldMatch?.[1]) {
      guess = companyFieldMatch[1].trim();
      method = "bio_company_field";
    } else {
      const atMatch = bio.match(AT_HANDLE_RE);
      const ofMatch = bio.match(OF_PHRASE_RE);
      guess = (atMatch?.[1] ?? ofMatch?.[1])?.trim() ?? null;
    }
    if (!guess) continue;

    const key = `${r.person_id}::${normalize(guess)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      personId: r.person_id,
      personName: r.person_name,
      companyNameGuess: guess,
      detectionMethod: method,
      evidenceExcerpt: `${r.person_name}'s own GitHub bio: "${bio}"`,
      sourceClaimId: r.claim_id,
      sourceUrl: r.source_url,
    });
  }
  return out;
}

export interface DetectionRunResult {
  inserted: number;
  autoConfirmed: number;
  skippedAlreadyKnown: number;
}

// Idempotent: never touches a possible_companies row that already exists
// for this (person, guess) pair, and never overwrites a row a human has
// already reviewed.
export function runCompanyDetection(db: Database.Database): DetectionRunResult {
  const candidates = detectPossibleCompanies(db);

  const findExisting = db.prepare(
    `SELECT id FROM possible_companies WHERE person_id = ? AND lower(trim(company_name_guess)) = lower(trim(?))`
  );
  const findFounderProject = db.prepare(
    `SELECT DISTINCT pj.id, pj.name FROM person_project_roles ppr JOIN projects pj ON pj.id = ppr.project_id
     WHERE ppr.person_id = ? AND ppr.role = 'founder' AND pj.kind = 'company'`
  );
  const insert = db.prepare(
    `INSERT INTO possible_companies (id, person_id, company_name_guess, detection_method, evidence_excerpt, source_claim_id, source_url, match_status, confirmed_project_id, reviewed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  let inserted = 0;
  let autoConfirmed = 0;
  let skippedAlreadyKnown = 0;

  for (const c of candidates) {
    if (findExisting.get(c.personId, c.companyNameGuess)) {
      skippedAlreadyKnown++;
      continue;
    }

    // Auto-confirm rule: this exact person is ALREADY a confirmed founder
    // of a real company — a new bio-based hint for them is corroboration
    // of that established fact, not a new claim about the world, so it's
    // safe to auto-link. Only when there's exactly one such company (2+
    // stays unreviewed rather than guessing which one the bio refers to).
    // Deliberately NOT auto-confirmed: an exact company-name match the
    // person isn't already linked to — per §67, establishing a brand-new
    // founder relationship (even off an exact name match) is a real new
    // claim, not corroboration, so it stays 'unreviewed' for a human.
    const founderProjects = findFounderProject.all(c.personId) as { id: string; name: string }[];

    const status: "confirmed" | "unreviewed" = founderProjects.length === 1 ? "confirmed" : "unreviewed";
    const confirmedProjectId = founderProjects.length === 1 ? founderProjects[0].id : null;

    insert.run(
      newId("posco"),
      c.personId,
      c.companyNameGuess,
      c.detectionMethod,
      c.evidenceExcerpt,
      c.sourceClaimId,
      c.sourceUrl,
      status,
      confirmedProjectId,
      status === "confirmed" ? new Date().toISOString() : null
    );
    inserted++;
    if (status === "confirmed") autoConfirmed++;
  }

  return { inserted, autoConfirmed, skippedAlreadyKnown };
}
