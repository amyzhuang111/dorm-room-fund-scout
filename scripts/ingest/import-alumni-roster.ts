// Loads the public alumni roster and the three LinkedIn passes into the
// generic people, campus, and company tables. Re-running updates the same ids.
// Fund names are not stored on fields the product renders. A "likely" match
// stays low confidence and does not become a confirmed founder or company.

import fs from "node:fs";
import path from "node:path";
import { getDb, nowIso } from "../../lib/db/client";
import { linkedinPersonSlug } from "../../lib/domain/dedupe";

const ROOT = process.cwd();
const ALUMNI_PATH = path.join(ROOT, "data", "imports", "drf_alumni.json");
const PASS2_PATH = path.join(ROOT, "data", "imports", "drf_linkedin_pass2.json");
const PASS3_PATH = path.join(ROOT, "data", "imports", "drf_linkedin_pass3.json");
const VERIFIED_PATH = path.join(ROOT, "data", "imports", "drf_linkedin_verified.json");

const PATCH_KEYS = [
  "linkedin_url",
  "linkedin_confidence",
  "linkedin_source_url",
  "current_firm",
  "current_role",
  "firm_confidence",
  "firm_source_url",
  "firm_type",
  "location",
  "verification_note",
  "proof_urls",
] as const;

const SCHOOL_ALIAS: Record<string, string> = {
  "uc san diego": "univ_ucsd",
  "university of california, san diego": "univ_ucsd",
  "northeastern university": "univ_northeastern",
};

type Row = Record<string, unknown> & { id: string; name: string };

function readList(file: string): Row[] {
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  if (!Array.isArray(parsed)) throw new Error(`${file} must be a list`);
  return parsed.filter((row): row is Row => Boolean(row) && typeof row === "object" && typeof (row as Row).id === "string" && typeof (row as Row).name === "string");
}

function text(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function year(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  const stored = text(value);
  return stored || null;
}

function norm(value: string): string {
  return value.normalize("NFKC").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();
}

function samePersonName(left: string, right: string): boolean {
  const a = norm(left).replace(/ /g, "");
  const b = norm(right).replace(/ /g, "");
  return a.length > 2 && a === b;
}

function linkedinUrl(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const slug = linkedinPersonSlug(raw);
  if (!slug) return null;
  return `https://www.linkedin.com/in/${slug}`;
}

function applyPatches(alumni: Row[], patches: Record<string, unknown>[]) {
  const byId = new Map(alumni.map((row) => [row.id, row]));
  for (const patch of patches) {
    const id = text(patch.id);
    const row = id ? byId.get(id) : undefined;
    if (!row) continue;
    for (const key of PATCH_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
      const value = patch[key];
      if (value == null || value === "") delete row[key];
      else row[key] = value;
    }
  }
}

function applyVerified(alumni: Row[], verified: { name?: unknown; school?: unknown; linkedin_url?: unknown }[]) {
  for (const entry of verified) {
    const name = text(entry.name);
    const school = text(entry.school);
    const url = linkedinUrl(entry.linkedin_url);
    if (!name || !url) continue;
    const named = alumni.filter((row) => samePersonName(row.name, name));
    const matched = school
      ? named.filter((row) => norm(text(row.school_label)) === norm(school) || norm(text(row.university_id)) === norm(school))
      : named;
    const chosen = matched.length === 1 ? matched : named.length === 1 ? named : [];
    if (chosen.length !== 1) continue;
    chosen[0].linkedin_url = url;
    chosen[0].linkedin_confidence = "confirmed";
  }
}

function slugId(prefix: string, value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 48);
  return `${prefix}${slug || "row"}`;
}

function main() {
  const alumni = readList(ALUMNI_PATH);
  applyPatches(alumni, JSON.parse(fs.readFileSync(PASS2_PATH, "utf8")) as Record<string, unknown>[]);
  applyPatches(alumni, JSON.parse(fs.readFileSync(PASS3_PATH, "utf8")) as Record<string, unknown>[]);
  applyVerified(alumni, JSON.parse(fs.readFileSync(VERIFIED_PATH, "utf8")) as { name?: unknown; school?: unknown; linkedin_url?: unknown }[]);

  const db = getDb();
  const retrievedAt = nowIso();
  const universities = new Map(
    (db.prepare(`SELECT id, lower(name) as name FROM universities`).all() as { id: string; name: string }[]).map((row) => [row.id, row.name]),
  );
  const universityByName = new Map<string, string>();
  for (const [id, name] of universities) universityByName.set(name, id);
  const projects = new Map(
    (db.prepare(`SELECT id, lower(name) as name FROM projects`).all() as { id: string; name: string }[]).flatMap((row) => [[row.id, row.id] as const, [row.name, row.id] as const]),
  );
  const peopleByName = new Map<string, string[]>();
  for (const row of db.prepare(`SELECT id, name FROM people`).all() as { id: string; name: string }[]) {
    const key = norm(row.name).replace(/ /g, "");
    const list = peopleByName.get(key) ?? [];
    list.push(row.id);
    peopleByName.set(key, list);
  }
  const personBySlug = new Map<string, { id: string; name: string }>();
  for (const row of db.prepare(`SELECT id, name, aliases_json FROM people`).all() as { id: string; name: string; aliases_json: string }[]) {
    let aliases: string[] = [];
    try {
      const parsed = JSON.parse(row.aliases_json || "[]") as unknown;
      if (Array.isArray(parsed)) aliases = parsed.filter((alias): alias is string => typeof alias === "string");
    } catch {
      aliases = [];
    }
    for (const alias of aliases) {
      const slug = linkedinPersonSlug(alias);
      if (slug) personBySlug.set(slug, { id: row.id, name: row.name });
    }
  }

  let createdPeople = 0;
  let mergedPeople = 0;
  let affiliations = 0;
  let confirmedCompanies = 0;
  let likelyClaims = 0;
  let campusesAdded = 0;

  const write = db.transaction(() => {
    for (const record of alumni) {
      const personKey = record.id.replace(/^dra_/, "");
      const lowPerson = text(record.confidence) === "likely";
      const url = linkedinUrl(record.linkedin_url);
      const linkedinLow = text(record.linkedin_confidence) === "likely";
      const slug = url ? linkedinPersonSlug(url) : null;
      const slugOwner = slug ? personBySlug.get(slug) : undefined;
      const nameKey = norm(record.name).replace(/ /g, "");
      const nameHits = peopleByName.get(nameKey) ?? [];
      let personId: string | null = null;
      if (slugOwner && samePersonName(slugOwner.name, record.name)) personId = slugOwner.id;
      else if (nameHits.length === 1) personId = nameHits[0];
      else personId = slugId("person_roster_", personKey);

      const existing = db.prepare(`SELECT id, aliases_json, founder_status, verification_status FROM people WHERE id = ?`).get(personId) as
        | { id: string; aliases_json: string; founder_status: string | null; verification_status: string | null }
        | undefined;
      if (!existing) {
        db.prepare(
          `INSERT INTO people (id, name, aliases_json, verification_status, last_verified_at, verification_note, founder_status)
           VALUES (?, ?, '[]', ?, ?, ?, NULL)`,
        ).run(
          personId,
          record.name,
          lowPerson ? "partial" : "confirmed",
          retrievedAt.slice(0, 10),
          lowPerson
            ? "Low confidence. The roster marks this person as likely, not confirmed."
            : "Confirmed on a public roster.",
        );
        createdPeople += 1;
        const list = peopleByName.get(nameKey) ?? [];
        list.push(personId);
        peopleByName.set(nameKey, list);
      } else {
        mergedPeople += 1;
        if (lowPerson && existing.verification_status !== "confirmed") {
          db.prepare(`UPDATE people SET verification_status = 'partial', verification_note = ? WHERE id = ?`).run(
            "Low confidence. The roster marks this person as likely, not confirmed.",
            personId,
          );
        }
      }

      if (url && slug && !linkedinLow) {
        const owner = personBySlug.get(slug);
        if (!owner || owner.id === personId) {
          const aliases = existing ? (JSON.parse(existing.aliases_json || "[]") as unknown[]) : [];
          const stored = Array.isArray(aliases) ? aliases.filter((alias): alias is string => typeof alias === "string") : [];
          const token = `linkedin:${url}`;
          if (!stored.some((alias) => linkedinPersonSlug(alias) === slug)) {
            stored.push(token);
            db.prepare(`UPDATE people SET aliases_json = ? WHERE id = ?`).run(JSON.stringify(stored), personId);
          }
          personBySlug.set(slug, { id: personId, name: record.name });
        }
      } else if (url && linkedinLow) {
        const claimId = `claim_roster_li_${personKey}`;
        db.prepare(
          `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_url, retrieved_at, label, verification_state)
           VALUES (?, 'person', ?, 'linkedin_candidate', ?, ?, ?, ?, 'observed_fact', 'likely')
           ON CONFLICT(id) DO UPDATE SET value_json = excluded.value_json, excerpt = excluded.excerpt, source_url = excluded.source_url, verification_state = 'likely'`,
        ).run(
          claimId,
          personId,
          JSON.stringify({ linkedin: url, confidence: "likely", reason: "Low confidence. The roster marks this profile as likely." }),
          "Low confidence. The roster marks this LinkedIn profile as likely, not confirmed.",
          text(record.linkedin_source_url) || text(record.source_url) || url,
          retrievedAt,
        );
        likelyClaims += 1;
      }

      const schoolLabel = text(record.school_label);
      let universityId = text(record.university_id);
      if (universityId && !universities.has(universityId)) universityId = "";
      if (!universityId && schoolLabel) {
        universityId = SCHOOL_ALIAS[norm(schoolLabel)] || universityByName.get(norm(schoolLabel)) || "";
      }
      if (!universityId && schoolLabel) {
        universityId = slugId("univ_", schoolLabel);
        if (!universities.has(universityId)) {
          db.prepare(`INSERT INTO universities (id, name, aliases_json) VALUES (?, ?, '[]')`).run(universityId, schoolLabel);
          universities.set(universityId, norm(schoolLabel));
          universityByName.set(norm(schoolLabel), universityId);
          campusesAdded += 1;
        }
      }
      const claimId = `claim_roster_${personKey}`;
      const sourceUrl = [record.source_url, record.linkedin_source_url, record.firm_source_url].map(text).find((value) => value.startsWith("http")) ?? "";
      const schoolNote = schoolLabel ? ` School: ${schoolLabel}.` : "";
      const excerpt = lowPerson
        ? `Low confidence. A public roster lists ${record.name}, and the source marks the match as likely.${schoolNote}`
        : `Public roster lists ${record.name}.${schoolNote}`;
      if (sourceUrl) {
        db.prepare(
          `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_url, retrieved_at, label, verification_state)
           VALUES (?, 'person', ?, 'roster_membership', ?, ?, ?, ?, 'observed_fact', ?)
           ON CONFLICT(id) DO UPDATE SET
             entity_id = excluded.entity_id, value_json = excluded.value_json, excerpt = excluded.excerpt,
             source_url = excluded.source_url, verification_state = excluded.verification_state`,
        ).run(
          claimId,
          personId,
          JSON.stringify({ confidence: lowPerson ? "likely" : "confirmed", role: text(record.current_role) || null }),
          excerpt,
          sourceUrl,
          retrievedAt,
          lowPerson ? "likely" : "corroborated",
        );
      }

      if (universityId) {
        const status = text(record.affiliation_status);
        const affiliationStatus = status === "current_student" || status === "recent_grad" || status === "older_alumni" ? status : "older_alumni";
        db.prepare(
          `INSERT INTO affiliations (id, person_id, university_id, role, status, start_date, end_date, claim_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             person_id = excluded.person_id, university_id = excluded.university_id, role = excluded.role,
             status = excluded.status, start_date = excluded.start_date, end_date = excluded.end_date, claim_id = excluded.claim_id`,
        ).run(
          `aff_roster_${personKey}`,
          personId,
          universityId,
          text(record.school_role) || "student",
          affiliationStatus,
          year(record.year_start),
          year(record.year_end),
          sourceUrl ? claimId : null,
        );
        affiliations += 1;
      }

      const firm = text(record.current_firm);
      const firmLow = text(record.firm_confidence) === "likely";
      const role = text(record.current_role);
      const founded = /\bfounder\b/i.test(role) || text(record.firm_type) === "founder";
      const foundedProject = text(record.founded_project_id);
      if (firm && founded && !firmLow && !lowPerson) {
        let projectId = foundedProject && projects.has(foundedProject) ? foundedProject : "";
        if (!projectId) {
          const matches = db.prepare(`SELECT id FROM projects WHERE lower(name) = lower(?)`).all(firm) as { id: string }[];
          if (matches.length === 1) projectId = matches[0].id;
          else if (matches.length === 0) {
            projectId = slugId("proj_roster_", firm);
            const investable = text(record.firm_type) === "vc" ? 0 : 1;
            db.prepare(
              `INSERT INTO projects (id, name, aliases_json, kind, is_investable_candidate, verification_status, last_verified_at, verification_note)
               VALUES (?, ?, '[]', 'company', ?, 'confirmed', ?, ?)`,
            ).run(projectId, firm, investable, retrievedAt.slice(0, 10), "Named on a public roster as a company this person founded.");
            projects.set(projectId, projectId);
            confirmedCompanies += 1;
          }
        }
        if (projectId) {
          db.prepare(
            `INSERT INTO person_project_roles (id, person_id, project_id, role, claim_id)
             VALUES (?, ?, ?, 'founder', ?)
             ON CONFLICT(id) DO UPDATE SET person_id = excluded.person_id, project_id = excluded.project_id, role = 'founder', claim_id = excluded.claim_id`,
          ).run(`ppr_roster_${personKey}`, personId, projectId, sourceUrl ? claimId : null);
          const status = db.prepare(`SELECT founder_status FROM people WHERE id = ?`).get(personId) as { founder_status: string | null };
          if (status.founder_status !== "removed") {
            db.prepare(`UPDATE people SET founder_status = 'founder' WHERE id = ? AND (founder_status IS NULL OR founder_status = 'potential')`).run(personId);
          }
        }
      } else if (firm && firmLow) {
        const firmSource = [record.firm_source_url, record.source_url].map(text).find((value) => value.startsWith("http")) ?? "";
        if (!firmSource) continue;
        db.prepare(
          `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_url, retrieved_at, label, verification_state)
           VALUES (?, 'person', ?, 'roster_membership', ?, ?, ?, ?, 'analyst_inference', 'likely')
           ON CONFLICT(id) DO UPDATE SET excerpt = excluded.excerpt, value_json = excluded.value_json, verification_state = 'likely'`,
        ).run(
          `claim_roster_firm_${personKey}`,
          personId,
          JSON.stringify({ firm, role: role || null, confidence: "likely" }),
          `Low confidence. The roster marks a role at ${firm} as likely, not confirmed.`,
          firmSource,
          retrievedAt,
        );
        likelyClaims += 1;
      }
    }
  });
  write();

  const people = db.prepare(`SELECT COUNT(*) as c FROM people`).get() as { c: number };
  const founders = db.prepare(`SELECT COUNT(*) as c FROM people WHERE founder_status = 'founder'`).get() as { c: number };
  const companies = db.prepare(`SELECT COUNT(*) as c FROM projects WHERE kind = 'company'`).get() as { c: number };
  const campuses = db.prepare(`SELECT COUNT(*) as c FROM universities`).get() as { c: number };
  const countries = db.prepare(`SELECT COUNT(DISTINCT country) as c FROM universities WHERE country IS NOT NULL AND trim(country) != ''`).get() as { c: number };
  const signals = db.prepare(`SELECT COUNT(*) as c FROM signals`).get() as { c: number };
  console.log(JSON.stringify({ createdPeople, mergedPeople, affiliations, confirmedCompanies, likelyClaims, campusesAdded, people: people.c, founders: founders.c, companies: companies.c, campuses: campuses.c, countries: countries.c, signals: signals.c }, null, 2));
}

main();
