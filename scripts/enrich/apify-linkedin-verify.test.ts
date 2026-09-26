// Fixture test for LinkedIn profile verification. Uses a throwaway database
// and mocked actor output. Does not call Apify.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dbPath = path.join(os.tmpdir(), `apify-linkedin-verify-${process.pid}-${Date.now()}.db`);
for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(dbPath + suffix, { force: true });
fs.writeFileSync(dbPath, "");
process.env.CAMPUS_UNIVERSE_DB_PATH = dbPath;

function profile(
  first: string,
  last: string,
  school: string,
  end: number | "Present" | null,
  headline = "Builder"
) {
  const education =
    end === "Present"
      ? [{ schoolName: school, startDate: { year: 2023, text: "2023" }, endDate: { text: "Present" }, period: "2023 - Present" }]
      : end == null
        ? [{ schoolName: school }]
        : [{ schoolName: school, endDate: { year: end, text: String(end) } }];
  return { firstName: first, lastName: last, headline, education, status: 200 };
}

async function main() {
  const { getDb, nowIso } = await import("../../lib/db/client");
  const verify = await import("./linkedin-verify");
  const { runVerify } = await import("./apify-linkedin-verify");

  const thousand = verify.estimateVerify(1000);
  assert.equal(thousand.runs, 25);
  assert.equal(thousand.usd.toFixed(2), "4.00");
  assert.equal(thousand.perThousand.toFixed(2), "4.00");
  assert.equal(verify.estimateVerify(0).usd, 0);
  assert.deepEqual(verify.packBatches([["a"], ["b"], ["c"]], 2), [["a", "b"], ["c"]]);
  assert.equal(verify.actorInput(["https://www.linkedin.com/in/ada"]).profileScraperMode, verify.PROFILE_MODE);
  assert.deepEqual(verify.actorInput(["https://www.linkedin.com/in/ada"]).queries, ["https://www.linkedin.com/in/ada"]);

  const vanity = verify.assignProfiles(
    ["https://www.linkedin.com/in/stella-lin-4588bb22a"],
    [
      {
        status: 200,
        query: { publicIdentifier: "stella-lin-4588bb22a" },
        publicIdentifier: "stella-lin-upenn",
        linkedinUrl: "https://www.linkedin.com/in/stella-lin-upenn",
        firstName: "Stella",
        lastName: "Lin",
        education: [{ schoolName: "University of Pennsylvania", endDate: { year: 2025, text: "2025" } }],
      },
    ]
  );
  assert.equal(vanity.get("https://www.linkedin.com/in/stella-lin-4588bb22a")?.lastName, "Lin");
  const missing = verify.assignProfiles(
    ["https://www.linkedin.com/in/missing-person"],
    [{ status: 404, query: { publicIdentifier: "missing-person" } }]
  );
  assert.equal(missing.get("https://www.linkedin.com/in/missing-person"), null);

  const db = getDb();
  const insertUni = db.prepare(`INSERT INTO universities (id, name, aliases_json, country) VALUES (?, ?, ?, 'USA')`);
  for (const [id, name, aliases] of [
    ["univ_penn", "University of Pennsylvania", ["Penn", "UPenn"]],
    ["univ_berkeley", "University of California, Berkeley", ["UC Berkeley", "Berkeley"]],
    ["univ_mit", "Massachusetts Institute of Technology", ["MIT"]],
    ["univ_waterloo", "University of Waterloo", ["Waterloo"]],
  ] as const) {
    insertUni.run(id, name, JSON.stringify(aliases));
  }

  const insertPerson = db.prepare(
    `INSERT INTO people (id, name, aliases_json, founder_status, enrollment_status) VALUES (?, ?, ?, ?, ?)`
  );
  const insertAff = db.prepare(`INSERT INTO affiliations (id, person_id, university_id, status) VALUES (?, ?, ?, 'unverified')`);
  const insertClaim = db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_url, retrieved_at, label, verification_state)
     VALUES (?, 'person', ?, 'linkedin_candidate', ?, 'candidate', ?, ?, 'observed_fact', 'unverified')`
  );

  function add(
    id: string,
    name: string,
    universityId: string,
    urls: string[],
    founder: string | null = "founder",
    enrollment: string | null = null,
    aliases = "[]"
  ) {
    insertPerson.run(id, name, aliases, founder, enrollment);
    insertAff.run(`aff_${id}`, id, universityId);
    urls.forEach((url, index) => {
      insertClaim.run(
        `claim_${id}_${index}`,
        id,
        JSON.stringify({ linkedin: url }),
        url,
        nowIso()
      );
    });
  }

  const adaA = "https://www.linkedin.com/in/ada-lovelace";
  const adaB = "https://www.linkedin.com/in/ada-other";
  const potA = "https://www.linkedin.com/in/quinn-old";
  const potB = "https://www.linkedin.com/in/quinn-new";
  const memA = "https://www.linkedin.com/in/zoe-member";
  const alanA = "https://www.linkedin.com/in/alan-turing";
  const graceA = "https://www.linkedin.com/in/grace-hopper";
  const kenA = "https://www.linkedin.com/in/ken-thompson";
  const kenB = "https://www.linkedin.com/in/ken-thompson-2";

  add("person_ada", "Ada Lovelace", "univ_penn", [adaA, adaB]);
  add("person_pot", "Quinn Potential", "univ_penn", [potA, potB], "potential", "recent_grad");
  add("person_mem", "Zoe Member", "univ_penn", [memA], null, "current_student");
  add("person_alan", "Alan Turing", "univ_berkeley", [alanA]);
  add("person_grace", "Grace Hopper", "univ_mit", [graceA]);
  add("person_ken", "Ken Thompson", "univ_waterloo", [kenA, kenB]);
  add("person_plain", "No Candidate", "univ_penn", []);
  add(
    "person_existing",
    "Donald Knuth",
    "univ_penn",
    ["https://www.linkedin.com/in/donald-extra"],
    "founder",
    null,
    JSON.stringify(["linkedin:https://www.linkedin.com/in/donald-knuth"])
  );

  const queue = verify.loadVerifyQueue(db, null);
  assert.deepEqual(
    queue.map((person) => person.id),
    ["person_ada", "person_pot", "person_mem", "person_alan", "person_grace", "person_ken"]
  );
  assert.deepEqual(verify.loadVerifyQueue(db, "univ_penn").map((person) => person.id), [
    "person_ada",
    "person_pot",
    "person_mem",
  ]);

  const ada = queue.find((person) => person.id === "person_ada");
  const pot = queue.find((person) => person.id === "person_pot");
  const mem = queue.find((person) => person.id === "person_mem");
  const alan = queue.find((person) => person.id === "person_alan");
  const ken = queue.find((person) => person.id === "person_ken");
  assert.ok(ada && pot && mem && alan && ken);

  const wharton = verify.judgeProfiles(
    ada,
    [adaA],
    new Map([[adaA, profile("Ada", "Lovelace", "The Wharton School", 2024, "Founder, Analytical Engines")]])
  );
  assert.equal(wharton.outcome, "confirmed");
  assert.equal(wharton.selected?.url, adaA);
  assert.equal(wharton.graduationYear, 2024);
  assert.equal(wharton.headline, "Founder, Analytical Engines");
  assert.equal(wharton.selected?.campusMatch, true);

  const pennName = verify.judgeProfiles(
    ada,
    [adaA],
    new Map([[adaA, profile("Ada", "Lovelace", "University of Pennsylvania", 2025)]])
  );
  assert.equal(pennName.outcome, "confirmed");

  const haas = verify.judgeProfiles(
    alan,
    [alanA],
    new Map([[alanA, profile("Alan", "Turing", "Haas School of Business", 2024)]])
  );
  assert.equal(haas.outcome, "confirmed");
  assert.equal(haas.selected?.matchedSchool, "Haas School of Business");

  const ucb = verify.judgeProfiles(
    alan,
    [alanA],
    new Map([[alanA, profile("Alan", "Turing", "University of California, Berkeley", 2018)]])
  );
  assert.equal(ucb.outcome, "confirmed");
  assert.equal(ucb.graduationYear, 2018);

  const caltech = verify.judgeProfiles(
    alan,
    [alanA],
    new Map([[alanA, profile("Alan", "Turing", "California Institute of Technology", 2024)]])
  );
  assert.equal(caltech.outcome, "rejected");

  const wrongName = verify.judgeProfiles(
    ada,
    [adaA],
    new Map([[adaA, profile("Grace", "Hopper", "University of Pennsylvania", 2024)]])
  );
  assert.equal(wrongName.outcome, "rejected");
  assert.equal(wrongName.urls[0]?.nameMatch, false);
  assert.equal(wrongName.urls[0]?.campusMatch, true);

  const twoOld = verify.judgeProfiles(
    ada,
    [adaA, adaB],
    new Map([
      [adaA, profile("Ada", "Lovelace", "University of Pennsylvania", 2012)],
      [adaB, profile("Ada", "Lovelace", "The Wharton School", 2018)],
    ])
  );
  assert.equal(twoOld.outcome, "unverified");
  assert.equal(twoOld.selected, null);

  const preferOne = verify.judgeProfiles(
    pot,
    [potA, potB],
    new Map([
      [potA, profile("Quinn", "Potential", "University of Pennsylvania", 2012)],
      [potB, profile("Quinn", "Potential", "The Wharton School", 2024, "Student founder")],
    ])
  );
  assert.equal(preferOne.outcome, "confirmed");
  assert.equal(preferOne.selected?.url, potB);
  assert.equal(preferOne.graduationYear, 2024);

  const preferNoneRecent = verify.judgeProfiles(
    pot,
    [potA, potB],
    new Map([
      [potA, profile("Quinn", "Potential", "University of Pennsylvania", 2010)],
      [potB, profile("Quinn", "Potential", "The Wharton School", 2018)],
    ])
  );
  assert.equal(preferNoneRecent.outcome, "unverified");

  const twoRecent = verify.judgeProfiles(
    mem,
    [potA, potB],
    new Map([
      [potA, profile("Zoe", "Member", "University of Pennsylvania", 2024)],
      [potB, profile("Zoe", "Member", "The Wharton School", 2026)],
    ])
  );
  assert.equal(twoRecent.outcome, "unverified");

  const ongoing = verify.judgeProfiles(
    mem,
    [memA, potA],
    new Map([
      [potA, profile("Zoe", "Member", "University of Pennsylvania", 2011)],
      [memA, profile("Zoe", "Member", "The Wharton School", "Present", "Penn student")],
    ])
  );
  assert.equal(ongoing.outcome, "confirmed");
  assert.equal(ongoing.selected?.url, memA);
  assert.equal(ongoing.graduationYear, null);
  assert.equal(ongoing.headline, "Penn student");

  const singleOldStudent = verify.judgeProfiles(
    mem,
    [memA],
    new Map([[memA, profile("Zoe", "Member", "University of Pennsylvania", 2015)]])
  );
  assert.equal(singleOldStudent.outcome, "confirmed");
  assert.equal(singleOldStudent.graduationYear, 2015);

  const absent = verify.judgeProfiles(ada, [adaA], new Map([[adaA, null]]));
  assert.equal(absent.outcome, "rejected");
  assert.match(absent.reason, /returned no profile/);

  const outPath = path.join(os.tmpdir(), `apify-linkedin-verify-out-${process.pid}.jsonl`);
  fs.rmSync(outPath, { force: true });
  let scrapeCalls = 0;
  const blocked = await runVerify({
    db,
    campusId: null,
    limit: 2,
    dryRun: false,
    yes: false,
    mock: false,
    outPath,
    hasToken: false,
    scrape: async () => {
      scrapeCalls++;
      return [];
    },
  });
  assert.equal(blocked, 0);
  assert.equal(scrapeCalls, 0);
  assert.equal(fs.existsSync(outPath), false);

  const missingToken = await runVerify({
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

  const dry = await runVerify({
    db,
    campusId: "univ_penn",
    limit: 5,
    dryRun: true,
    yes: true,
    mock: false,
    outPath,
    hasToken: true,
    scrape: async () => {
      throw new Error("dry-run called Apify");
    },
  });
  assert.equal(dry, 0);
  assert.equal(fs.existsSync(outPath), false);

  const scrape = async (urls: string[]) => {
    if (urls.length > 1) throw new Error("rate limit");
    return urls.map((url) => ({
      status: 200,
      query: { publicIdentifier: url.split("/in/")[1] },
      linkedinUrl: url,
      firstName: "Nobody",
      lastName: "Else",
      headline: "Unrelated",
      education: [{ schoolName: "Other University", endDate: { year: 2024, text: "2024" } }],
    }));
  };
  const first = await runVerify({
    db,
    campusId: null,
    limit: 2,
    dryRun: false,
    yes: true,
    mock: false,
    outPath,
    hasToken: false,
    scrape,
  });
  assert.equal(first, 0);
  const firstLines = fs.readFileSync(outPath, "utf8").trim().split(/\n/);
  assert.deepEqual(
    firstLines.map((line) => JSON.parse(line).person_id),
    ["person_ada", "person_pot"]
  );
  assert.equal(JSON.parse(firstLines[0]).actor, "harvestapi/linkedin-profile-scraper");
  assert.equal(JSON.parse(firstLines[0]).outcome, "rejected");

  const second = await runVerify({
    db,
    campusId: null,
    limit: 2,
    dryRun: false,
    yes: true,
    mock: false,
    outPath,
    hasToken: false,
    scrape,
  });
  assert.equal(second, 0);
  const secondLines = fs.readFileSync(outPath, "utf8").trim().split(/\n/);
  assert.deepEqual(
    secondLines.map((line) => JSON.parse(line).person_id),
    ["person_ada", "person_pot", "person_mem", "person_alan"]
  );

  const fixture = path.join(os.tmpdir(), `apify-linkedin-verify-fixture-${process.pid}.jsonl`);
  const adaLine = verify.buildResultLine(
    ada,
    new Map([
      [adaA, profile("Ada", "Lovelace", "The Wharton School", 2024, "Founder, Analytical Engines")],
      [adaB, profile("Someone", "Else", "University of Pennsylvania", 2024)],
    ]),
    "2026-09-26T00:00:00.000Z"
  );
  const alanLine = verify.buildResultLine(
    alan,
    new Map([[alanA, profile("Alan", "Turing", "Stanford University", 2020, "Mathematician")]]),
    "2026-09-26T00:00:00.000Z"
  );
  const kenLine = verify.buildResultLine(
    ken,
    new Map([
      [kenA, profile("Ken", "Thompson", "University of Waterloo", 2024, "Plan 9")],
      [kenB, profile("Ken", "Thompson", "University of Waterloo", 2025, "Bell Labs")],
    ]),
    "2026-09-26T00:00:00.000Z"
  );
  assert.equal(adaLine.outcome, "confirmed");
  assert.equal(alanLine.outcome, "rejected");
  assert.equal(kenLine.outcome, "unverified");
  const graceLine = {
    ...verify.buildResultLine(queue.find((person) => person.id === "person_grace")!, new Map([[graceA, profile("Grace", "Hopper", "Massachusetts Institute of Technology", 2024)]]), "2026-09-26T00:00:00.000Z"),
    mock: true,
  };
  const existingLine = verify.buildResultLine(
    {
      ...ada,
      id: "person_existing",
      name: "Donald Knuth",
      urls: ["https://www.linkedin.com/in/donald-extra"],
    },
    new Map([
      [
        "https://www.linkedin.com/in/donald-extra",
        profile("Donald", "Knuth", "University of Pennsylvania", 2024),
      ],
    ]),
    "2026-09-26T00:00:00.000Z"
  );
  fs.writeFileSync(
    fixture,
    [adaLine, alanLine, kenLine, graceLine, existingLine].map((line) => JSON.stringify(line)).join("\n") + "\n"
  );

  const aliasesOf = (id: string) =>
    (db.prepare(`SELECT aliases_json FROM people WHERE id = ?`).get(id) as { aliases_json: string }).aliases_json;
  const claimsOf = (id: string) =>
    db
      .prepare(
        `SELECT claim_type, verification_state, source_url, value_json FROM claims WHERE entity_id = ? ORDER BY claim_type, source_url`
      )
      .all(id) as { claim_type: string; verification_state: string; source_url: string; value_json: string }[];

  const beforeAliases = aliasesOf("person_ada");
  const preview = verify.importVerifiedLinkedIn(db, fixture, true);
  assert.equal(preview.dryRun, true);
  assert.equal(preview.confirmed, 1);
  assert.equal(preview.demoted, 1);
  assert.equal(preview.rejected, 1);
  assert.equal(preview.leftUnverified, 1);
  assert.equal(preview.skipped, 2);
  assert.equal(aliasesOf("person_ada"), beforeAliases);
  assert.equal(claimsOf("person_ada").every((claim) => claim.verification_state === "unverified"), true);

  const imported = verify.importVerifiedLinkedIn(db, fixture, false);
  assert.equal(imported.confirmed, 1);
  assert.equal(imported.demoted, 1);
  assert.equal(imported.rejected, 1);
  assert.equal(imported.leftUnverified, 1);
  assert.equal(imported.skipped, 2);

  assert.match(aliasesOf("person_ada"), /linkedin:https:\/\/www\.linkedin\.com\/in\/ada-lovelace/);
  const adaClaims = claimsOf("person_ada");
  const alias = adaClaims.find((claim) => claim.claim_type === "linkedin_alias_discovered");
  assert.ok(alias);
  assert.equal(alias.verification_state, "corroborated");
  const aliasValue = JSON.parse(alias.value_json) as { headline?: string; graduation_year?: number };
  assert.equal(aliasValue.headline, "Founder, Analytical Engines");
  assert.equal(aliasValue.graduation_year, 2024);
  const education = adaClaims.find((claim) => claim.claim_type === "linkedin_education");
  assert.ok(education);
  assert.equal(JSON.parse(education.value_json).endYear, 2024);
  assert.equal(
    (db.prepare(`SELECT enrollment_status, enrollment_grad_year FROM people WHERE id = 'person_ada'`).get() as {
      enrollment_status: string;
      enrollment_grad_year: number;
    }).enrollment_grad_year,
    2024
  );
  assert.equal(adaClaims.find((claim) => claim.source_url === adaA)?.verification_state, "corroborated");
  assert.equal(adaClaims.find((claim) => claim.source_url === adaB)?.verification_state, "demoted");

  const alanClaims = claimsOf("person_alan");
  assert.equal(alanClaims.length, 1);
  assert.equal(alanClaims[0]?.verification_state, "rejected");
  const alanValue = JSON.parse(alanClaims[0]?.value_json ?? "{}") as { headline?: string; decision?: string };
  assert.equal(alanValue.decision, "rejected");
  assert.equal(alanValue.headline, "Mathematician");
  assert.equal(aliasesOf("person_alan").includes("linkedin.com/in/"), false);

  const kenClaims = claimsOf("person_ken");
  assert.equal(kenClaims.length, 2);
  assert.equal(kenClaims.every((claim) => claim.verification_state === "unverified"), true);
  assert.equal(JSON.parse(kenClaims[0]?.value_json ?? "{}").headline === "Plan 9" || JSON.parse(kenClaims[1]?.value_json ?? "{}").headline === "Plan 9", true);
  assert.equal(aliasesOf("person_ken").includes("linkedin.com/in/"), false);

  assert.equal(claimsOf("person_grace").every((claim) => claim.verification_state === "unverified"), true);
  assert.equal(aliasesOf("person_grace").includes("linkedin.com/in/"), false);
  assert.match(aliasesOf("person_existing"), /donald-knuth"/);
  assert.equal(claimsOf("person_existing").some((claim) => claim.claim_type === "linkedin_alias_discovered"), false);

  const again = verify.importVerifiedLinkedIn(db, fixture, false);
  assert.equal(again.confirmed, 0);
  assert.equal(again.skipped >= 1, true);

  fs.rmSync(outPath, { force: true });
  fs.rmSync(fixture, { force: true });
  db.close();
  for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(dbPath + suffix, { force: true });
  console.log("apify linkedin verify fixture test passed");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
