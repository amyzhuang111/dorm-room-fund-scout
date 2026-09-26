// Fixture test for the Apify LinkedIn importer and the lookup's dry-run /
// resume path. Uses a throwaway database. Does not call Apify.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dbPath = path.join(os.tmpdir(), `apify-linkedin-${process.pid}-${Date.now()}.db`);
for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(dbPath + suffix, { force: true });
fs.writeFileSync(dbPath, "");
process.env.CAMPUS_UNIVERSE_DB_PATH = dbPath;

function candidate(url: string, title: string, snippet: string) {
  return { url, title, snippet };
}

async function main() {
  const { getDb, newId, nowIso } = await import("../../lib/db/client");
  const match = await import("./linkedin-match");
  const { importApifyLinkedIn } = await import("./import-apify-linkedin");
  const { runLookup } = await import("./apify-linkedin-lookup");

  const thousand = match.estimateRun(1000);
  assert.equal(thousand.runs, 100);
  assert.equal(thousand.free.toFixed(2), "4.60");
  assert.equal(thousand.gold.toFixed(2), "1.90");
  assert.equal(match.estimateRun(0).free, 0);
  assert.equal(match.resolveCampusFlag("penn"), "univ_penn");
  assert.equal(match.resolveCampusFlag("UC Berkeley"), "univ_berkeley");
  assert.equal(match.resolveCampusFlag("nope"), null);

  const db = getDb();
  const insertUni = db.prepare(`INSERT INTO universities (id, name, aliases_json, country) VALUES (?, ?, ?, 'USA')`);
  for (const [id, name, aliases] of [
    ["univ_penn", "University of Pennsylvania", ["Penn", "UPenn"]],
    ["univ_berkeley", "University of California, Berkeley", ["UC Berkeley", "Berkeley"]],
    ["univ_mit", "Massachusetts Institute of Technology", ["MIT"]],
    ["univ_harvard", "Harvard University", ["Harvard"]],
    ["univ_stanford", "Stanford University", ["Stanford"]],
    ["univ_waterloo", "University of Waterloo", ["Waterloo"]],
    ["univ_cmu", "Carnegie Mellon University", ["CMU"]],
    ["univ_princeton", "Princeton University", ["Princeton"]],
  ] as const) {
    insertUni.run(id, name, JSON.stringify(aliases));
  }

  const insertPerson = db.prepare(`INSERT INTO people (id, name, aliases_json) VALUES (?, ?, ?)`);
  const insertAff = db.prepare(`INSERT INTO affiliations (id, person_id, university_id, status) VALUES (?, ?, ?, 'unverified')`);
  const insertProject = db.prepare(`INSERT INTO projects (id, name, kind) VALUES (?, ?, 'company')`);
  const insertRole = db.prepare(`INSERT INTO person_project_roles (id, person_id, project_id, role) VALUES (?, ?, ?, ?)`);

  function add(id: string, name: string, universityId: string, company: string, role: string, aliases = "[]") {
    insertPerson.run(id, name, aliases);
    insertAff.run(`aff_${id}`, id, universityId);
    insertProject.run(`proj_${id}`, company);
    insertRole.run(`role_${id}`, id, `proj_${id}`, role);
  }

  add("person_ada", "Ada Lovelace", "univ_penn", "Analytical Engines", "founder");
  add("person_alan", "Alan Turing", "univ_berkeley", "Enigma Works", "researcher");
  add("person_grace", "Grace Hopper", "univ_mit", "COBOL Systems", "founder");
  add("person_radia", "Radia Perlman", "univ_harvard", "Spanning Tree", "founder");
  add(
    "person_existing",
    "Donald Knuth",
    "univ_stanford",
    "TeX Project",
    "founder",
    JSON.stringify(["linkedin:https://www.linkedin.com/in/donald-knuth"])
  );
  add("person_two", "Ken Thompson", "univ_waterloo", "Deep Blue Labs", "founder");
  add("person_role", "Frances Allen", "univ_cmu", "Widgets Inc", "Frontend Engineer");
  add("person_generic", "Barbara Liskov", "univ_princeton", "Club Notes", "team_member");
  add("person_short", "Edsger Dijkstra", "univ_mit", "AI", "founder");

  db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_url, retrieved_at, label, verification_state)
     VALUES (?, 'person', 'person_alan', 'linkedin_candidate', ?, 'old candidate', 'https://www.linkedin.com/in/old-alan', ?, 'observed_fact', 'unverified')`
  ).run(newId("claim"), JSON.stringify({ linkedin: "https://www.linkedin.com/in/old-alan", reason: "seed" }), nowIso());

  const queue = match.loadQueue(db, null);
  assert.deepEqual(
    queue.map((person) => person.id),
    [
      "person_ada",
      "person_alan",
      "person_role",
      "person_radia",
      "person_short",
      "person_grace",
      "person_generic",
      "person_two",
    ]
  );
  assert.equal(queue.find((person) => person.id === "person_existing"), undefined);
  assert.deepEqual(queue.find((person) => person.id === "person_alan")?.existingUnverified, ["https://www.linkedin.com/in/old-alan"]);
  assert.deepEqual(match.loadQueue(db, "univ_penn").map((person) => person.id), ["person_ada"]);

  const ada = queue.find((person) => person.id === "person_ada");
  assert.ok(ada);
  const query = match.buildSearchQuery(ada, null);
  assert.match(query, /site:linkedin.com\/in/);
  assert.match(query, /"Ada Lovelace"/);
  assert.match(query, /"University of Pennsylvania"/);
  assert.match(query, /"Analytical Engines"/);

  const outPath = path.join(os.tmpdir(), `apify-linkedin-out-${process.pid}.jsonl`);
  fs.rmSync(outPath, { force: true });
  let searchCalls = 0;
  const blocked = await runLookup({
    db,
    campusId: null,
    limit: 2,
    dryRun: false,
    yes: false,
    mock: false,
    outPath,
    hasToken: false,
    search: async () => {
      searchCalls++;
      return new Map();
    },
  });
  assert.equal(blocked, 0);
  assert.equal(searchCalls, 0);
  assert.equal(fs.existsSync(outPath), false);

  const missingToken = await runLookup({
    db,
    campusId: null,
    limit: 1,
    dryRun: false,
    yes: true,
    mock: false,
    outPath,
    hasToken: false,
  });
  assert.equal(missingToken, 1);
  assert.equal(fs.existsSync(outPath), false);

  const dry = await runLookup({
    db,
    campusId: "univ_penn",
    limit: 5,
    dryRun: true,
    yes: true,
    mock: false,
    outPath,
    hasToken: true,
    search: async () => {
      throw new Error("dry-run called Apify");
    },
  });
  assert.equal(dry, 0);
  assert.equal(fs.existsSync(outPath), false);

  const search: Parameters<typeof runLookup>[0]["search"] = async (batch) => {
    const grouped = new Map<string, { url: string; title: string; snippet: string }[]>();
    for (const item of batch) {
      grouped.set(item.query.replace(/\s+/g, " ").trim().toLowerCase(), [
        { url: "https://www.linkedin.com/in/example-person", title: `${item.person.name} | LinkedIn`, snippet: "no school here" },
      ]);
    }
    return grouped;
  };
  const first = await runLookup({
    db,
    campusId: null,
    limit: 2,
    dryRun: false,
    yes: true,
    mock: false,
    outPath,
    hasToken: false,
    search,
  });
  assert.equal(first, 0);
  const firstLines = fs.readFileSync(outPath, "utf8").trim().split(/\n/);
  assert.equal(firstLines.length, 2);
  assert.equal(JSON.parse(firstLines[0]).person_id, "person_ada");
  assert.equal(JSON.parse(firstLines[1]).person_id, "person_alan");
  assert.equal(JSON.parse(firstLines[0]).actor, "apify/google-search-scraper");
  assert.ok(JSON.parse(firstLines[0]).candidates[0].signals);

  const second = await runLookup({
    db,
    campusId: null,
    limit: 2,
    dryRun: false,
    yes: true,
    mock: false,
    outPath,
    hasToken: false,
    search,
  });
  assert.equal(second, 0);
  const secondLines = fs.readFileSync(outPath, "utf8").trim().split(/\n/);
  assert.deepEqual(secondLines.map((line) => JSON.parse(line).person_id), ["person_ada", "person_alan", "person_role", "person_radia"]);

  const fixture = path.join(os.tmpdir(), `apify-linkedin-fixture-${process.pid}.jsonl`);
  const falseSignals = {
    name_match: false,
    school_match: false,
    company_match: false,
    role_match: false,
    matched_company: null,
    matched_role: null,
    decision: "reject",
  };
  const lines = [
    {
      person_id: "person_ada",
      name: "Ada Lovelace",
      query: 'site:linkedin.com/in "Ada Lovelace"',
      candidates: [
        {
          ...candidate(
            "https://uk.linkedin.com/in/ada-lovelace?trk=public",
            "Ada Lovelace - University of Pennsylvania | LinkedIn",
            "Founder of Analytical Engines"
          ),
          signals: falseSignals,
        },
      ],
    },
    {
      person_id: "person_alan",
      name: "Alan Turing",
      query: 'site:linkedin.com/in "Alan Turing"',
      candidates: [candidate("https://www.linkedin.com/in/alan-turing", "Alan Turing | LinkedIn", "Mathematician in London")],
    },
    {
      person_id: "person_grace",
      name: "Grace Hopper",
      query: 'site:linkedin.com/in "Grace Hopper"',
      candidates: [candidate("https://www.linkedin.com/in/grace-hopper", "Grace Hopper - COBOL Systems | LinkedIn", "United States Navy")],
    },
    {
      person_id: "person_radia",
      name: "Radia Perlman",
      query: 'site:linkedin.com/in "Radia Perlman"',
      candidates: [candidate("https://www.linkedin.com/in/someone-else", "Someone Else | LinkedIn", "Harvard University founder")],
    },
    {
      person_id: "person_existing",
      name: "Donald Knuth",
      query: 'site:linkedin.com/in "Donald Knuth"',
      candidates: [candidate("https://www.linkedin.com/in/donald-knuth-2", "Donald Knuth - Stanford University | LinkedIn", "TeX Project")],
    },
    {
      person_id: "person_two",
      name: "Ken Thompson",
      query: 'site:linkedin.com/in "Ken Thompson"',
      candidates: [
        candidate("https://www.linkedin.com/in/ken-thompson", "Ken Thompson - University of Waterloo | LinkedIn", "Bell Labs"),
        candidate("https://www.linkedin.com/in/ken-thompson-2", "Ken Thompson - University of Waterloo | LinkedIn", "Plan 9"),
      ],
    },
    {
      person_id: "person_role",
      name: "Frances Allen",
      query: 'site:linkedin.com/in "Frances Allen"',
      candidates: [candidate("https://www.linkedin.com/in/frances-allen", "Frances Allen | LinkedIn", "Frontend Engineer at IBM")],
    },
    {
      person_id: "person_generic",
      name: "Barbara Liskov",
      query: 'site:linkedin.com/in "Barbara Liskov"',
      candidates: [candidate("https://www.linkedin.com/in/barbara-liskov", "Barbara Liskov | LinkedIn", "A team member of a campus club")],
    },
    {
      person_id: "person_short",
      name: "Edsger Dijkstra",
      query: 'site:linkedin.com/in "Edsger Dijkstra"',
      candidates: [candidate("https://www.linkedin.com/in/edsger-dijkstra", "Edsger Dijkstra | LinkedIn", "AI researcher")],
    },
  ];
  fs.writeFileSync(fixture, lines.map((line) => JSON.stringify(line)).join("\n") + "\n");

  const before = match.linkedInCounts(db);
  assert.equal(before.confirmed, 1);
  const preview = importApifyLinkedIn(db, fixture, true);
  assert.equal(preview.dryRun, true);
  assert.equal(preview.confirmed, 3);
  assert.equal(preview.unverified, 5);
  assert.equal(preview.blank, 1);
  assert.equal(preview.skipped, 1);
  assert.deepEqual(match.linkedInCounts(db), before);
  assert.equal(
    (db.prepare(`SELECT aliases_json FROM people WHERE id = 'person_ada'`).get() as { aliases_json: string }).aliases_json.includes(
      "linkedin.com/in/"
    ),
    false
  );

  const imported = importApifyLinkedIn(db, fixture, false);
  assert.equal(imported.confirmed, 3);
  assert.equal(imported.unverified, 5);
  assert.equal(imported.blank, 1);
  assert.equal(imported.skipped, 1);
  assert.equal(imported.beforeConfirmed, 1);
  assert.equal(imported.afterConfirmed, 4);
  assert.equal(imported.afterUnverifiedOnly, 4);

  function aliasesOf(id: string): string {
    return (db.prepare(`SELECT aliases_json FROM people WHERE id = ?`).get(id) as { aliases_json: string }).aliases_json;
  }
  function claimsOf(id: string): { claim_type: string; verification_state: string; source_url: string }[] {
    return db
      .prepare(`SELECT claim_type, verification_state, source_url FROM claims WHERE entity_id = ? ORDER BY claim_type, source_url`)
      .all(id) as { claim_type: string; verification_state: string; source_url: string }[];
  }

  assert.match(aliasesOf("person_ada"), /linkedin:https:\/\/www\.linkedin\.com\/in\/ada-lovelace/);
  assert.equal(claimsOf("person_ada").some((claim) => claim.claim_type === "linkedin_alias_discovered" && claim.verification_state === "corroborated"), true);
  assert.equal(aliasesOf("person_alan").includes("linkedin.com/in/"), false);
  assert.equal(claimsOf("person_alan").filter((claim) => claim.claim_type === "linkedin_candidate").length, 2);
  assert.match(aliasesOf("person_grace"), /linkedin:https:\/\/www\.linkedin\.com\/in\/grace-hopper/);
  assert.match(aliasesOf("person_role"), /linkedin:https:\/\/www\.linkedin\.com\/in\/frances-allen/);
  assert.equal(aliasesOf("person_two").includes("linkedin.com/in/"), false);
  assert.equal(claimsOf("person_two").filter((claim) => claim.claim_type === "linkedin_candidate" && claim.verification_state === "unverified").length, 2);
  assert.equal(claimsOf("person_radia").length, 0);
  assert.equal(aliasesOf("person_generic").includes("linkedin.com/in/"), false);
  assert.equal(claimsOf("person_generic")[0]?.claim_type, "linkedin_candidate");
  assert.equal(aliasesOf("person_short").includes("linkedin.com/in/"), false);
  assert.equal(claimsOf("person_short")[0]?.verification_state, "unverified");
  assert.match(aliasesOf("person_existing"), /donald-knuth"/);
  assert.equal(claimsOf("person_existing").some((claim) => claim.claim_type === "linkedin_alias_discovered"), false);

  const again = importApifyLinkedIn(db, fixture, false);
  assert.equal(again.confirmed, 0);
  assert.equal(again.unverified, 0);
  assert.equal(again.blank, 1);
  assert.equal(again.skipped, 8);
  assert.equal(match.linkedInCounts(db).confirmed, 4);

  const mockFile = path.join(os.tmpdir(), `apify-linkedin-mock-${process.pid}.jsonl`);
  fs.writeFileSync(
    mockFile,
    JSON.stringify({
      person_id: "person_radia",
      name: "Radia Perlman",
      mock: true,
      query: "mock",
      candidates: [candidate("https://www.linkedin.com/in/radia-perlman", "Radia Perlman - Harvard University | LinkedIn", "Spanning Tree")],
    }) + "\n"
  );
  const mocked = importApifyLinkedIn(db, mockFile, false);
  assert.equal(mocked.skipped, 1);
  assert.equal(mocked.confirmed, 0);
  assert.equal(claimsOf("person_radia").length, 0);
  fs.rmSync(mockFile, { force: true });

  fs.rmSync(outPath, { force: true });
  fs.rmSync(fixture, { force: true });
  db.close();
  for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(dbPath + suffix, { force: true });
  console.log("apify linkedin fixture test passed");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
