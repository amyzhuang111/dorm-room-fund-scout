// Real ingestion from Penn Venture Lab's 2026 Startup Challenge results
// (venturelab.upenn.edu/2026-SC-PR, published 2026-05-04). This is the first
// real Penn *investable-candidate* source (as opposed to Penn Labs, which is
// builder evidence about an internal-tools org, not startups).
//
// Class-year tokens like "ENG'29" are Penn's own notation for expected
// graduation year + school code (ENG=Engineering, W=Wharton, C=College,
// GEN=dual/combined degree, WG=Wharton MBA, EE=combined engineering degree).
// We interpret those tokens into a current/recent-grad/alumni read relative
// to today, and label that derived status as an analyst_inference (the raw
// token itself is quoted verbatim as the underlying observed fact).
//
// Run: npx tsx scripts/ingest/fetch-penn-startup-challenge.ts

import * as cheerio from "cheerio";
import crypto from "node:crypto";
import { getDb, newId, nowIso } from "../../lib/db/client";
import { previousSnapshotHash } from "../../lib/ingest/dedup";

const URL_ = "https://venturelab.upenn.edu/2026-SC-PR";
const SOURCE_ID = "src_penn_startup_challenge";
const UNIV_ID = "univ_penn";
const PROGRAM_PROJECT_ID = "proj_penn_venture_lab_startup_challenge";
const PUBLISHED_DATE = "2026-05-04"; // datePublished from the page's own metadata

interface Founder {
  name: string;
  classTokens: string[]; // e.g. ["ENG'29", "W'29"]
}
interface WinEntry {
  prize: string;
  company: string;
  founders: Founder[];
}

const CLASS_TOKEN_RE = /'[A-Za-z]{0,4}\d{2}\.?$/; // e.g. ENG'29, W'29, G'EE27, W'27. (trailing period seen once in source)
// Some names in the source have a class token glued on with no comma, e.g. "Pedram Bayat ENG'27" —
// this is a formatting quirk in Penn's own press release, not something we invented.
const TRAILING_CLASS_TOKEN_RE = /\s+([A-Za-z]{0,4}'[A-Za-z]{0,4}\d{2}\.?)$/;

function parseFoundersText(rawText: string): Founder[] {
  // "Rishi Ambavanekar, ENG'29, W'29, Tyler Sacharow, C'29" -> two founders
  const text = rawText.replace(/^[,\s]+/, "").replace(/founded by\s*/i, "");
  const tokens = text
    .split(",")
    .map((t) => t.trim().replace(/\.$/, ""))
    .filter(Boolean);
  const founders: Founder[] = [];
  let current: Founder | null = null;
  for (const tok of tokens) {
    const isClassToken = CLASS_TOKEN_RE.test(tok) && tok.length <= 12;
    if (isClassToken && current) {
      current.classTokens.push(tok);
      continue;
    }
    // Name with a class token glued on with no separating comma.
    const glued = tok.match(TRAILING_CLASS_TOKEN_RE);
    if (glued && current === null) {
      // shouldn't happen (glued tokens always follow a name), but guard anyway
    }
    if (glued) {
      const namePart = tok.slice(0, tok.length - glued[0].length).trim();
      current = { name: namePart, classTokens: [glued[1]] };
      founders.push(current);
      continue;
    }
    current = { name: tok, classTokens: [] };
    founders.push(current);
  }
  return founders;
}

function interpretStatus(classTokens: string[], asOfYear: number): { status: string; gradYears: number[] } {
  const gradYears = classTokens
    .map((t) => {
      const m = t.replace(/\.$/, "").match(/(\d{2})$/);
      if (!m) return null;
      const yy = parseInt(m[1], 10);
      return 2000 + yy;
    })
    .filter((y): y is number => y != null);
  if (gradYears.length === 0) return { status: "unverified", gradYears: [] };
  // If any listed degree hasn't been reached yet, treat as currently enrolled.
  const maxYear = Math.max(...gradYears);
  const minYear = Math.min(...gradYears);
  if (maxYear > asOfYear) return { status: "current_student", gradYears };
  if (asOfYear - minYear <= 2) return { status: "recent_grad", gradYears };
  return { status: "older_alumni", gradYears };
}

async function main() {
  const db = getDb();
  const retrievedAt = nowIso();

  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at)
     VALUES (?, 'Penn Venture Lab — Startup Challenge results', 'university_venture_program', ?, ?, 1, 'html_scrape', 'available', ?)
     ON CONFLICT(id) DO UPDATE SET last_attempt_at=excluded.last_attempt_at, status='available'`
  ).run(SOURCE_ID, URL_, JSON.stringify([UNIV_ID]), retrievedAt);

  const res = await fetch(URL_, { headers: { "user-agent": "campus-universe-research-bot/0.1 (manual, bounded)" } });
  if (!res.ok) {
    db.prepare(`UPDATE sources SET status='failed', error=? WHERE id=?`).run(`HTTP ${res.status}`, SOURCE_ID);
    throw new Error(`HTTP ${res.status}`);
  }
  const html = await res.text();
  const hash = crypto.createHash("sha256").update(html).digest("hex");

  if (previousSnapshotHash(db, SOURCE_ID, URL_) === hash) {
    db.prepare(`UPDATE sources SET last_attempt_at=?, status='checked_no_new' WHERE id=?`).run(retrievedAt, SOURCE_ID);
    console.log("Startup Challenge page: content unchanged since last fetch — skipping re-ingestion (no duplicate rows created).");
    return;
  }

  const snapshotId = newId("snap");
  db.prepare(
    `INSERT INTO snapshots (id, source_id, url, content_hash, fetched_at, http_status, raw_excerpt)
     VALUES (?, ?, ?, ?, ?, 200, ?)`
  ).run(snapshotId, SOURCE_ID, URL_, hash, retrievedAt, "2026 Startup Challenge winners announcement");

  const startMarker = "The 2026 Startup Challenge winners are:";
  const endMarker = "2026 Startup Challenge Finals judges were";
  const startIdx = html.indexOf(startMarker);
  const endIdx = html.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1) throw new Error("Could not find winners section markers — page structure may have changed.");
  const sectionHtml = html.slice(startIdx, endIdx);

  const $ = cheerio.load(sectionHtml);
  const rootUl = $("body > ul").first();
  const entries: WinEntry[] = [];
  rootUl.children("li").each((_, prizeLi) => {
    const prize = $(prizeLi).clone().children("ul").remove().end().find("b").first().text().trim() ||
      $(prizeLi).clone().children("ul").remove().end().text().trim();
    $(prizeLi)
      .find("ul li")
      .each((__, companyLi) => {
        const $li = $(companyLi);
        // Use direct children only — some entries nest a stray <i>&nbsp;</i> inside the <b>,
        // which would otherwise get picked up by a plain `.find("i")` before the real founder text.
        const company = $li
          .children("b")
          .first()
          .text()
          .replace(/ /g, "")
          .trim()
          .replace(/,$/, "")
          .trim();
        const founderText = $li.children("i").first().text().replace(/ /g, "").trim();
        if (!company || !founderText) return;
        entries.push({ prize, company, founders: parseFoundersText(founderText) });
      });
  });

  console.log(`Parsed ${entries.length} prize entries from ${URL_}`);

  db.prepare(
    `INSERT INTO projects (id, name, aliases_json, kind, sector, description, website_url, is_portfolio_reference, is_investable_candidate)
     VALUES (?, 'Penn Venture Lab Startup Challenge', '[]', 'project', 'university_venture_program', 'Penn''s annual student startup competition (Venture Lab / Weiss Tech House).', ?, 0, 0)
     ON CONFLICT(id) DO NOTHING`
  ).run(PROGRAM_PROJECT_ID, URL_);
  db.prepare(
    `INSERT OR IGNORE INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json, verification_state)
     VALUES (?, 'project', ?, 'university', ?, 'affiliated_with', '[]', 'affiliation_only')`
  ).run(newId("rel"), PROGRAM_PROJECT_ID, UNIV_ID);

  const findPerson = db.prepare(`SELECT id FROM people WHERE name = ?`);
  const insertPerson = db.prepare(`INSERT INTO people (id, name, aliases_json) VALUES (?, ?, '[]')`);
  const findProject = db.prepare(`SELECT id FROM projects WHERE name = ?`);
  const insertProject = db.prepare(
    `INSERT INTO projects (id, name, aliases_json, kind, sector, description, website_url, is_portfolio_reference, is_investable_candidate)
     VALUES (?, ?, '[]', 'company', ?, ?, NULL, 0, 1)`
  );
  const insertClaim = db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, snapshot_id, source_url, published_date, retrieved_at, label, verification_state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unverified')`
  );
  const insertAffiliation = db.prepare(
    `INSERT INTO affiliations (id, person_id, university_id, role, status, claim_id) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const insertRole = db.prepare(
    `INSERT INTO person_project_roles (id, person_id, project_id, role, claim_id) VALUES (?, ?, ?, 'founder', ?)`
  );
  const insertRel = db.prepare(
    `INSERT INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json, verification_state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertSignal = db.prepare(
    `INSERT INTO signals (id, project_id, signal_type, current_observation, source_date, significance_note, claim_ids_json)
     VALUES (?, ?, 'award', ?, ?, ?, ?)`
  );

  const companiesSeen = new Map<string, string>(); // name -> project_id
  let newCompanies = 0;

  for (const entry of entries) {
    let projectId = companiesSeen.get(entry.company);
    const isNewCompany = !projectId;
    if (!projectId) {
      const existing = findProject.get(entry.company) as { id: string } | undefined;
      if (existing) {
        projectId = existing.id;
      } else {
        projectId = newId("proj");
        // Sector left null unless the company name itself is unambiguous (e.g. "Robotics" in the name) —
        // everything else stays unknown pending research, per brief section 1 ("unknown means unknown").
        const sector = /robotics/i.test(entry.company) ? "robotics" : null;
        insertProject.run(projectId, entry.company, sector, "Sector/product description not yet researched beyond this competition listing.");
        newCompanies++;
      }
      companiesSeen.set(entry.company, projectId);
    }

    const excerpt = `Venture Lab 2026 Startup Challenge press release: "${entry.prize}" — ${entry.company}, founded by ${entry.founders.map((f) => f.name).join(", ")}.`;
    const signalClaimId = newId("claim");
    insertClaim.run(
      signalClaimId,
      "project",
      projectId,
      "competition_award",
      JSON.stringify({ prize: entry.prize, company: entry.company }),
      excerpt,
      SOURCE_ID,
      snapshotId,
      URL_,
      PUBLISHED_DATE,
      retrievedAt,
      "observed_fact"
    );

    if (isNewCompany) {
      insertSignal.run(
        newId("sig"),
        projectId,
        `Won/placed in Penn Venture Lab's 2026 Startup Challenge: ${entry.prize}.`,
        PUBLISHED_DATE,
        "Independent judged competition placement is a concrete, dated execution signal (not a funding round, not self-reported traction).",
        JSON.stringify([])
      );
    }

    for (const founder of entry.founders) {
      let person = findPerson.get(founder.name) as { id: string } | undefined;
      let personId: string;
      if (!person) {
        personId = newId("person");
        insertPerson.run(personId, founder.name);
      } else {
        personId = person.id;
      }

      const { status, gradYears } = interpretStatus(founder.classTokens, 2026);
      const affExcerpt = `Listed as "${founder.name}, ${founder.classTokens.join(", ")}" in the ${entry.prize} entry for ${entry.company}. Class-year token(s) interpreted as expected graduation year(s) ${gradYears.join("/") || "unknown"}; relative to today (2026-09-18) that reads as ${status.replace("_", " ")}.`;
      const affClaimId = newId("claim");
      insertClaim.run(
        affClaimId,
        "affiliation",
        personId,
        "affiliation",
        JSON.stringify({ university: "University of Pennsylvania", rawTokens: founder.classTokens, gradYears, status }),
        affExcerpt,
        SOURCE_ID,
        snapshotId,
        URL_,
        PUBLISHED_DATE,
        retrievedAt,
        "analyst_inference"
      );

      insertAffiliation.run(newId("aff"), personId, UNIV_ID, "Startup Challenge founder", status, affClaimId);
      insertRole.run(newId("ppr"), personId, projectId, signalClaimId);
      insertRel.run(newId("rel"), "person", personId, "project", projectId, "founded", JSON.stringify([signalClaimId]), "affiliation_only");
      insertRel.run(newId("rel"), "project", projectId, "project", PROGRAM_PROJECT_ID, "participated_in_program", JSON.stringify([signalClaimId]), "affiliation_only");
    }
  }

  db.prepare(`UPDATE sources SET last_success_at=?, discovered_lead_count=? WHERE id=?`).run(nowIso(), companiesSeen.size, SOURCE_ID);

  console.log(`${companiesSeen.size} distinct companies (${newCompanies} newly created) from ${entries.length} prize entries.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
