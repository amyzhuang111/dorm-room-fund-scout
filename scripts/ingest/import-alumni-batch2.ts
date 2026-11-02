import fs from "node:fs";
import path from "node:path";
import { getDb, newId, nowIso } from "../../lib/db/client";
import { linkedinPersonSlug } from "../../lib/domain/dedupe";

const ROOT = process.cwd();
const FILE = path.join(ROOT, "data", "imports", "drf-alumni-confirmed-batch2.json");
const SOURCE_ID = "src_drf_alumni_batch2_confirmed";
const SOURCE_URL = "https://www.linkedin.com/"; // public profiles; batch is confirmed LinkedIn URLs

type Row = { name: string; school?: string; url?: string; status?: string };

const SCHOOL_ALIAS: Record<string, string> = {
  "uc san diego": "univ_ucsd",
  "university of california, san diego": "univ_ucsd",
  "uc berkeley": "univ_berkeley",
  "university of california, berkeley": "univ_berkeley",
  "university of pennsylvania": "univ_penn",
  penn: "univ_penn",
  upenn: "univ_penn",
  mit: "univ_mit",
  "massachusetts institute of technology": "univ_mit",
  stanford: "univ_stanford",
  "stanford university": "univ_stanford",
  harvard: "univ_harvard",
  "harvard university": "univ_harvard",
  "harvard college": "univ_harvard",
  yale: "univ_yale",
  "yale university": "univ_yale",
  columbia: "univ_columbia",
  "columbia university": "univ_columbia",
  cornell: "univ_cornell",
  "cornell university": "univ_cornell",
  princeton: "univ_princeton",
  "princeton university": "univ_princeton",
  brown: "univ_brown",
  "brown university": "univ_brown",
  dartmouth: "univ_dartmouth",
  "dartmouth college": "univ_dartmouth",
  duke: "univ_duke",
  "duke university": "univ_duke",
  northwestern: "univ_northwestern",
  "northwestern university": "univ_northwestern",
  "university of chicago": "univ_uchicago",
  uchicago: "univ_uchicago",
  nyu: "univ_nyu",
  "new york university": "univ_nyu",
  ucla: "univ_ucla",
  "university of california, los angeles": "univ_ucla",
  usc: "univ_usc",
  "university of southern california": "univ_usc",
  "georgia tech": "univ_gatech",
  "georgia institute of technology": "univ_gatech",
  cmu: "univ_cmu",
  "carnegie mellon": "univ_cmu",
  "carnegie mellon university": "univ_cmu",
  "university of michigan": "univ_michigan",
  michigan: "univ_michigan",
  uiuc: "univ_uiuc",
  "university of illinois": "univ_uiuc",
  "university of illinois at urbana-champaign": "univ_uiuc",
  "university of illinois urbana-champaign": "univ_uiuc",
  "ut austin": "univ_utexas",
  "university of texas at austin": "univ_utexas",
  "university of washington": "univ_uw",
  waterloo: "univ_waterloo",
  "university of waterloo": "univ_waterloo",
  toronto: "univ_toronto",
  "university of toronto": "univ_toronto",
  northeastern: "univ_northeastern",
  "northeastern university": "univ_northeastern",
  rice: "univ_rice",
  "rice university": "univ_rice",
  vanderbilt: "univ_vanderbilt",
  "vanderbilt university": "univ_vanderbilt",
  georgetown: "univ_georgetown",
  "georgetown university": "univ_georgetown",
  emory: "univ_emory",
  "emory university": "univ_emory",
  unc: "univ_unc",
  "unc chapel hill": "univ_unc",
  "university of north carolina": "univ_unc",
  "university of north carolina at chapel hill": "univ_unc",
  uva: "univ_uva",
  "university of virginia": "univ_uva",
  bu: "univ_bu",
  "boston university": "univ_bu",
  caltech: "univ_caltech",
  "california institute of technology": "univ_caltech",
  "harvey mudd": "univ_harvey_mudd",
  "harvey mudd college": "univ_harvey_mudd",
  washu: "univ_washu",
  "washington university in st. louis": "univ_washu",
  "washington university": "univ_washu",
  "notre dame": "univ_notre_dame",
  "university of notre dame": "univ_notre_dame",
  lafayette: "univ_lafayette",
  "lafayette college": "univ_lafayette",
  cambridge: "univ_cambridge",
  "university of cambridge": "univ_cambridge",
  "queen's": "univ_queens",
  queens: "univ_queens",
  "queen's university": "univ_queens",
  laurentian: "univ_laurentian",
  "laurentian university": "univ_laurentian",
};

function normName(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function main() {
  const rows = JSON.parse(fs.readFileSync(FILE, "utf8")) as Row[];
  const db = getDb();
  const now = nowIso();

  db.prepare(
    `INSERT OR IGNORE INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, source_role)
     VALUES (?, ?, 'roster', ?, '[]', 2, 'manual', 'available', 'corroboration')`
  ).run(SOURCE_ID, "DRF alumni confirmed batch2 (public LinkedIn)", SOURCE_URL);

  db.prepare(`UPDATE sources SET last_success_at = ?, status = 'available' WHERE id = ?`).run(now, SOURCE_ID);

  const univs = db.prepare(`SELECT id, name FROM universities`).all() as { id: string; name: string }[];
  const byUniv = new Map(univs.map((u) => [normName(u.name), u.id]));
  for (const [k, id] of Object.entries(SCHOOL_ALIAS)) byUniv.set(k, id);

  const people = db.prepare(`SELECT id, name, aliases_json FROM people`).all() as {
    id: string;
    name: string;
    aliases_json: string;
  }[];
  const byLi = new Map<string, string>();
  const byPersonName = new Map<string, string[]>();
  for (const p of people) {
    let aliases: string[] = [];
    try {
      aliases = JSON.parse(p.aliases_json || "[]");
    } catch {
      aliases = [];
    }
    for (const a of aliases) {
      const slug = linkedinPersonSlug(a.startsWith("linkedin:") ? a.slice(9) : a);
      if (slug) byLi.set(slug, p.id);
    }
    const k = normName(p.name);
    const arr = byPersonName.get(k) || [];
    arr.push(p.id);
    byPersonName.set(k, arr);
  }

  let created = 0,
    linked = 0,
    skippedNoUrl = 0,
    skippedNoSchool = 0,
    affiliations = 0,
    claims = 0;

  const insertPerson = db.prepare(
    `INSERT INTO people (id, name, aliases_json, verification_status, last_verified_at, verification_note, founder_status)
     VALUES (?, ?, ?, 'confirmed', ?, ?, NULL)`
  );
  const updateAliases = db.prepare(`UPDATE people SET aliases_json = ?, verification_status = COALESCE(verification_status, 'confirmed'), last_verified_at = ? WHERE id = ?`);
  const insertAff = db.prepare(
    `INSERT INTO affiliations (id, person_id, university_id, role, status, created_at)
     VALUES (?, ?, ?, 'alumni', 'older_alumni', ?)`
  );
  const hasAff = db.prepare(`SELECT id FROM affiliations WHERE person_id = ? AND university_id = ? LIMIT 1`);
  const insertClaim = db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, source_url, retrieved_at, label, verification_state)
     VALUES (?, 'person', ?, 'alumni_roster', ?, ?, ?, ?, ?, 'observed_fact', 'corroborated')`
  );

  for (const row of rows) {
    const name = (row.name || "").trim();
    const url = (row.url || "").trim();
    const school = (row.school || "").trim();
    if (!name) continue;
    if (!url || !/^https?:\/\//i.test(url) || !url.includes("linkedin.com")) {
      skippedNoUrl++;
      continue;
    }
    const univId = byUniv.get(normName(school));
    if (!school || !univId) {
      skippedNoSchool++;
      continue;
    }

    const slug = linkedinPersonSlug(url);
    let personId: string | undefined = slug ? byLi.get(slug) : undefined;
    if (!personId) {
      const hits = byPersonName.get(normName(name)) || [];
      if (hits.length === 1) personId = hits[0];
    }

    const token = `linkedin:${url.split("?")[0].replace(/\/$/, "")}`;

    if (!personId) {
      personId = newId("person");
      insertPerson.run(personId, name, JSON.stringify([token]), now.slice(0, 10), `batch2 confirmed · ${school}`);
      created++;
      byPersonName.set(normName(name), [personId]);
      if (slug) byLi.set(slug, personId);
    } else {
      linked++;
      const existing = people.find((p) => p.id === personId);
      let aliases: string[] = [];
      try {
        aliases = JSON.parse(existing?.aliases_json || "[]");
      } catch {
        aliases = [];
      }
      if (!aliases.some((a) => linkedinPersonSlug(a.startsWith("linkedin:") ? a.slice(9) : a) === slug)) {
        aliases.push(token);
        updateAliases.run(JSON.stringify(aliases), now.slice(0, 10), personId);
      }
    }

    if (!hasAff.get(personId, univId)) {
      insertAff.run(newId("aff"), personId, univId, now);
      affiliations++;
    }

    insertClaim.run(
      newId("claim"),
      personId,
      JSON.stringify({ school, status: row.status || "confirmed", batch: "batch2" }),
      `${name} · ${school} (DRF alumni confirmed batch2)`,
      SOURCE_ID,
      url,
      now
    );
    claims++;
  }

  console.log(
    JSON.stringify(
      {
        created,
        linked,
        skippedNoUrl,
        skippedNoSchool,
        affiliations,
        claims,
        totalInput: rows.length,
        people: (db.prepare(`SELECT COUNT(*) c FROM people`).get() as { c: number }).c,
      },
      null,
      2
    )
  );
}

main();
