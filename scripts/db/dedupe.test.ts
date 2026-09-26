// Duplicate startups and people merge only on strong evidence. Same names with
// conflicting websites stay separate. Uses a throwaway database.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dbPath = path.join(os.tmpdir(), `dedupe-${process.pid}-${Date.now()}.db`);
for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(dbPath + suffix, { force: true });
fs.writeFileSync(dbPath, "");
process.env.CAMPUS_UNIVERSE_DB_PATH = dbPath;

async function main() {
  const { getDb } = await import("../../lib/db/client");
  const { applyDedupe, planDedupe, tableCounts } = await import("../../lib/domain/dedupe");
  const { applyEntityRedirects } = await import("../../lib/domain/feedback");
  const { clearRedirectCache, survivorId } = await import("../../lib/domain/entity-redirects");
  const db = getDb();

  db.prepare(`INSERT INTO universities (id, name, aliases_json) VALUES ('univ_penn', 'Penn', '[]'), ('univ_stanford', 'Stanford', '[]'), ('univ_berkeley', 'Berkeley', '[]')`).run();

  const insertPerson = db.prepare(
    `INSERT INTO people (id, name, aliases_json, enrollment_status, enrollment_grad_year, founder_status) VALUES (?, ?, ?, ?, ?, 'founder')`,
  );
  insertPerson.run("person_saif", "Saif Khawaja", '["linkedin:https://www.linkedin.com/in/saifnk"]', "older_alumni", 2023);
  insertPerson.run("person_emir_a", "Emir Karabeg", '["linkedin:https://www.linkedin.com/in/emir-karabeg"]', "recent_grad", 2024);
  insertPerson.run("person_emir_b", "Emir Karabeg", "[]", null, null);
  insertPerson.run("person_aliza_a", "Aliza Berger", '["linkedin:https://www.linkedin.com/in/aliza-berger"]', "current_student", 2027);
  insertPerson.run("person_aliza_b", "Aliza Berger", "[]", null, null);
  insertPerson.run("person_khush", "Khush Dakwala", "[]", "current_student", 2026);
  insertPerson.run("person_nastia", "Nastassja Kuznetsova", "[]", "older_alumni", 2022);
  insertPerson.run("person_other", "Other Person", "[]", null, null);
  insertPerson.run("person_david_penn", "David Lee", "[]", null, null);
  insertPerson.run("person_david_stanford", "David Lee", "[]", null, null);
  insertPerson.run("person_kevin_a", "Kevin Lu", '["linkedin:https://www.linkedin.com/in/kevin-lu-real"]', "older_alumni", 2021);
  insertPerson.run("person_kevin_b", "Kevin Lu", "[]", "older_alumni", 2021);
  insertPerson.run("person_tyler_a", "Tyler Sacharow", '["linkedin:https://www.linkedin.com/in/tyler-sacharow"]', "current_student", 2029);
  insertPerson.run("person_tyler_b", "Tyler Sacharow", '["linkedin:https://www.linkedin.com/in/tyler-sacharow-028972318"]', "current_student", 2029);
  insertPerson.run("person_eshaan_a", "Eshaan Kaipa", "[]", null, null);
  insertPerson.run("person_eshaan_b", "Eshaan Kaipa", "[]", null, null);
  insertPerson.run("person_story_a", "Eric Hashimoto", "[]", null, null);
  insertPerson.run("person_story_b", "Aarushi Singh", "[]", null, null);

  const insertProject = db.prepare(
    `INSERT INTO projects (id, name, aliases_json, kind, sector, description, website_url, primary_link, primary_link_kind, is_investable_candidate) VALUES (?, ?, '[]', ?, ?, ?, ?, ?, ?, 1)`,
  );
  insertProject.run(
    "proj_shinkei_corp",
    "Shinkei Systems Corp.",
    "company",
    "Robotics/hardware",
    "Shinkei Systems builds robotics that minimize fish waste and multiply shelf-life for the fishing industry.",
    null,
    "https://venturelab.upenn.edu/2022-startup-challenge-finalists",
    "accelerator",
  );
  insertProject.run(
    "proj_shinkei",
    "Shinkei Systems",
    "company",
    "Robotics/hardware",
    "Shinkei Systems builds robotics that minimizes fish waste and multiplies shelf-life.",
    "https://www.shinkei.systems/",
    null,
    null,
  );
  insertProject.run("proj_manifest_a", "Manifest", "company", null, "Gen Z mental health journal with millions of manifestations.", "https://manifestapp.xyz", null, null);
  insertProject.run("proj_manifest_b", "Manifest", "company", null, "Listed on Berkeley SkyDeck's public companies directory. SkyDeck does not publish founder names on this page.", "https://manifest.build", null, null);
  insertProject.run("proj_lckr", "LCKR", "company", null, "A sports and activities rental marketplace that turns curiosity into adventure.", "https://lckrhub.com/", null, null);
  insertProject.run("proj_lckr_hack", "LCKR", "project", null, "a sports and activities rental marketplace that turns curiosity into adventure", "https://devpost.com/software/lckr", null, null);
  insertProject.run("proj_munch", "Munch Industries", "company", null, "Munch is building food automation. Our first product is Orble, a customer-facing automatic bubble tea machine.", "http://www.orble-tea.com/", null, null);
  insertProject.run("proj_orble", "Orble", "company", null, "Sector/product description not yet researched beyond this competition listing.", "https://orble-tea.com", null, null);
  insertProject.run("proj_story_a", "Story Builder", "project", null, "Craft Tales, Embrace Books for children who want a printed keepsake.", "https://devpost.com/software/story-a", null, null);
  insertProject.run("proj_story_b", "Story Builder", "project", null, "A storytelling game where friends piece together a story word by word and then an AI model finds a book.", "https://devpost.com/software/story-b", null, null);
  insertProject.run("proj_keep", "Keep.ID", "project", null, "Revamp the Keep.ID application page and backend pdf engine for case workers.", "https://hack4impact.org/keep", null, null);
  insertProject.run("proj_bts", "Beat the Streets", "project", null, "Youth development nonprofit alliance that empowers wrestlers through mentoring programs.", "https://hack4impact.org/bts", null, null);
  insertProject.run("proj_gogo", "Guitars Over Guns", "project", null, "Impact reports for a music nonprofit that previously relied on static PDF files.", "https://hack4impact.org/gogo", null, null);
  insertProject.run("proj_wdb_a", "WDB — Spring 2023 technical project — backend", "project", null, "Spring 2023 technical project — backend", null, null, null);
  insertProject.run("proj_wdb_b", "WDB — Fall 2022 technical project — backend", "project", null, "Fall 2022 technical project — backend", null, null, null);
  insertProject.run("proj_robin", "Robin", "company", null, "A campus payments app.", "https://robin.example", null, null);
  insertProject.run("proj_bud", "Bud", "company", null, "A design tool later acquired.", "https://bud.example", null, null);
  insertProject.run("proj_cloak", "Cloak", "company", null, "Privacy software.", "https://cloak.example", null, null);
  insertProject.run("proj_payvo", "PayVo", "company", null, "Payments.", null, null, null);
  insertProject.run("proj_david_penn", "Northline", "company", null, "Penn project.", null, null, null);
  insertProject.run("proj_david_stanford", "Southline", "company", null, "Stanford project.", null, null, null);

  const aff = db.prepare(`INSERT INTO affiliations (id, person_id, university_id, role, status) VALUES (?, ?, ?, 'undergrad', 'unverified')`);
  for (const [id, person, campus] of [
    ["aff_saif", "person_saif", "univ_penn"],
    ["aff_emir_a", "person_emir_a", "univ_berkeley"],
    ["aff_emir_b", "person_emir_b", "univ_berkeley"],
    ["aff_aliza_a", "person_aliza_a", "univ_penn"],
    ["aff_aliza_b", "person_aliza_b", "univ_penn"],
    ["aff_khush", "person_khush", "univ_penn"],
    ["aff_nastia", "person_nastia", "univ_penn"],
    ["aff_david_penn", "person_david_penn", "univ_penn"],
    ["aff_david_stanford", "person_david_stanford", "univ_stanford"],
    ["aff_kevin_a", "person_kevin_a", "univ_penn"],
    ["aff_kevin_b", "person_kevin_b", "univ_penn"],
    ["aff_tyler_a", "person_tyler_a", "univ_penn"],
    ["aff_tyler_b", "person_tyler_b", "univ_penn"],
    ["aff_eshaan_a", "person_eshaan_a", "univ_penn"],
    ["aff_eshaan_b", "person_eshaan_b", "univ_penn"],
    ["aff_story_a", "person_story_a", "univ_penn"],
    ["aff_story_b", "person_story_b", "univ_penn"],
  ] as const) {
    aff.run(id, person, campus);
  }

  const role = db.prepare(`INSERT INTO person_project_roles (id, person_id, project_id, role) VALUES (?, ?, ?, ?)`);
  role.run("role_saif_a", "person_saif", "proj_shinkei_corp", "founder");
  role.run("role_saif_b", "person_saif", "proj_shinkei", "founder");
  role.run("role_emir_a", "person_emir_a", "proj_manifest_b", "founder");
  role.run("role_emir_sim", "person_emir_b", "proj_wdb_a", "team_member");
  role.run("role_aliza_a", "person_aliza_a", "proj_lckr", "founder");
  role.run("role_aliza_b", "person_aliza_b", "proj_lckr_hack", "team_member");
  role.run("role_khush", "person_khush", "proj_lckr_hack", "team_member");
  role.run("role_nastia_m", "person_nastia", "proj_munch", "founder");
  role.run("role_nastia_o", "person_nastia", "proj_orble", "founder");
  role.run("role_story_a", "person_story_a", "proj_story_a", "team_member");
  role.run("role_story_ab", "person_story_a", "proj_story_b", "team_member");
  role.run("role_story_b", "person_story_b", "proj_story_b", "team_member");
  role.run("role_wdb", "person_emir_a", "proj_wdb_b", "team_member");
  role.run("role_kevin_a", "person_kevin_a", "proj_robin", "founder");
  role.run("role_kevin_b", "person_kevin_b", "proj_bud", "founder");
  role.run("role_tyler_a", "person_tyler_a", "proj_cloak", "founder");
  role.run("role_tyler_b", "person_tyler_b", "proj_cloak", "founder");
  role.run("role_eshaan_a", "person_eshaan_a", "proj_payvo", "founder");
  role.run("role_eshaan_b", "person_eshaan_b", "proj_payvo", "founder");
  role.run("role_david_penn", "person_david_penn", "proj_david_penn", "founder");
  role.run("role_david_stanford", "person_david_stanford", "proj_david_stanford", "founder");

  // Emir A is also a Sim founder so the two Emir rows share a LinkedIn-less and LinkedIn copy of one company.
  insertProject.run("proj_sim_a", "Sim", "company", null, "", null, null, null);
  insertProject.run("proj_sim_b", "Sim", "company", null, "Build autonomous AI agents for enterprise systems that run across internal tools.", "https://sim.ai", null, null);
  role.run("role_sim_a", "person_emir_a", "proj_sim_a", "founder");
  role.run("role_sim_b", "person_emir_b", "proj_sim_b", "founder");
  db.prepare(`UPDATE people SET aliases_json = ? WHERE id = ?`).run('["linkedin:https://www.linkedin.com/in/emir-karabeg"]', "person_emir_b");

  db.prepare(`INSERT INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json) VALUES ('rel_saif_a', 'person', 'person_saif', 'project', 'proj_shinkei_corp', 'founded', '["claim_old"]')`).run();
  db.prepare(`INSERT INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json) VALUES ('rel_saif_b', 'person', 'person_saif', 'project', 'proj_shinkei', 'founded', '["claim_new"]')`).run();
  db.prepare(`INSERT INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json) VALUES ('rel_penn', 'project', 'proj_shinkei_corp', 'university', 'univ_penn', 'affiliated_with', '[]')`).run();
  db.prepare(`INSERT INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json) VALUES ('rel_penn_b', 'project', 'proj_shinkei', 'university', 'univ_penn', 'affiliated_with', '[]')`).run();

  const fact = db.prepare(
    `INSERT INTO company_facts (id, project_id, fact_key, value_text, source_url, excerpt, origin) VALUES (?, ?, ?, ?, ?, ?, 'test')`,
  );
  fact.run("fact_desc_corp", "proj_shinkei_corp", "description", "Longer fish-waste robotics description from Venture Lab.", "https://venturelab.upenn.edu/finalists", "excerpt corp");
  fact.run("fact_investor", "proj_shinkei_corp", "investor", "Venture Lab VIP-X", "https://venturelab.upenn.edu/vip", "vip");
  fact.run("fact_desc", "proj_shinkei", "description", "Shorter fish-waste description from the company site.", "https://www.shinkei.systems/", "excerpt site");
  fact.run("fact_site", "proj_shinkei", "website", "https://www.shinkei.systems/", "https://www.shinkei.systems/", "site");
  fact.run("fact_round", "proj_shinkei", "funding_round", "Seed", "https://www.shinkei.systems/news", "seed");
  db.prepare(`UPDATE company_facts SET amount_usd = 1000000, amount_status = 'announced', detail_json = '{"stage":"seed","amountText":"$1M"}' WHERE id = 'fact_round'`).run();
  db.prepare(
    `INSERT INTO funding_events (id, project_id, amount, currency, instrument, event_date, dedupe_key) VALUES ('fund_shinkei', 'proj_shinkei', 1000000, 'USD', 'equity', '2024-01-01', 'fund-key-shinkei')`,
  ).run();
  db.prepare(`INSERT INTO project_sector_tags (id, project_id, tag, is_primary, excerpt) VALUES ('tag_a', 'proj_shinkei_corp', 'robotics_hardware', 1, 'from the challenge page')`).run();
  db.prepare(`INSERT INTO project_sector_tags (id, project_id, tag, is_primary, excerpt) VALUES ('tag_b', 'proj_shinkei', 'robotics_hardware', 1, 'from the company site')`).run();
  db.prepare(`INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_url, retrieved_at) VALUES ('claim_corp', 'project', 'proj_shinkei_corp', 'program_listing', '{}', 'Venture Lab finalist', 'https://venturelab.upenn.edu/finalists', '2026-01-01')`).run();
  db.prepare(`INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_url, retrieved_at) VALUES ('claim_site', 'project', 'proj_shinkei', 'program_listing', '{}', 'Company site', 'https://www.shinkei.systems/', '2026-01-02')`).run();
  db.prepare(`INSERT INTO notes (id, entity_type, entity_id, body) VALUES ('note_corp', 'project', 'proj_shinkei_corp', 'met the founder')`).run();
  db.prepare(`INSERT INTO pipeline_entries (id, project_id, status, notes) VALUES ('pipe_corp', 'proj_shinkei_corp', 'Researching', 'from the challenge row')`).run();
  db.prepare(`INSERT INTO gate_results (id, project_id, gate_name, result, rationale) VALUES ('gate_corp', 'proj_shinkei_corp', 'stage', 'pass', 'early')`).run();
  db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_url, retrieved_at, verification_state) VALUES ('claim_kevin', 'person', 'person_kevin_b', 'linkedin_candidate', '{"linkedin":"https://www.linkedin.com/in/kevin-lu-real"}', 'name matched; school and company did not', 'https://example.com', '2026-01-01', 'unverified')`,
  ).run();

  const redirected = applyEntityRedirects(
    [
      {
        entityType: "project",
        entityId: "proj_shinkei_corp",
        nameKey: "shinkei systems corp",
        domainKey: null,
        action: "hide",
        note: "not now",
        at: "2026-01-01T00:00:00.000Z",
      },
      {
        entityType: "project",
        entityId: "proj_shinkei",
        nameKey: "shinkei systems",
        domainKey: "shinkei.systems",
        action: "like",
        note: "",
        at: "2026-02-01T00:00:00.000Z",
      },
    ],
    { proj_shinkei_corp: "proj_shinkei" },
  );
  assert.equal(redirected.length, 1);
  assert.equal(redirected[0].entityId, "proj_shinkei");
  assert.equal(redirected[0].action, "like");
  const hiddenOnly = applyEntityRedirects(
    [
      {
        entityType: "project",
        entityId: "proj_shinkei_corp",
        nameKey: "shinkei systems corp",
        domainKey: null,
        action: "hide",
        note: "not now",
        at: "2026-01-01T00:00:00.000Z",
      },
    ],
    { proj_shinkei_corp: "proj_shinkei" },
  );
  assert.equal(hiddenOnly[0].action, "hide");
  assert.equal(hiddenOnly[0].entityId, "proj_shinkei");

  const plan = planDedupe(db);
  const startupDrops = new Set(plan.startupMerges.flatMap((group) => group.drop.map((drop) => drop.id)));
  const peopleDrops = new Set(plan.peopleMerges.flatMap((group) => group.drop.map((drop) => drop.id)));
  assert.ok(startupDrops.has("proj_shinkei_corp") || startupDrops.has("proj_shinkei"));
  assert.ok(startupDrops.has("proj_lckr_hack"));
  assert.ok(startupDrops.has("proj_orble") || startupDrops.has("proj_munch"));
  assert.ok(startupDrops.has("proj_sim_a") || startupDrops.has("proj_sim_b"));
  assert.equal(startupDrops.has("proj_manifest_a") || startupDrops.has("proj_manifest_b"), false);
  assert.equal(startupDrops.has("proj_story_a") || startupDrops.has("proj_story_b"), false);
  assert.equal(startupDrops.has("proj_keep") || startupDrops.has("proj_bts") || startupDrops.has("proj_gogo"), false);
  assert.equal(startupDrops.has("proj_wdb_a") || startupDrops.has("proj_wdb_b"), false);
  assert.ok(peopleDrops.has("person_emir_a") || peopleDrops.has("person_emir_b"));
  assert.ok(peopleDrops.has("person_aliza_a") || peopleDrops.has("person_aliza_b"));
  assert.ok(peopleDrops.has("person_eshaan_a") || peopleDrops.has("person_eshaan_b"));
  assert.equal(peopleDrops.has("person_david_penn") || peopleDrops.has("person_david_stanford"), false);
  assert.equal(peopleDrops.has("person_kevin_a") || peopleDrops.has("person_kevin_b"), false);
  assert.equal(peopleDrops.has("person_tyler_a") || peopleDrops.has("person_tyler_b"), false);
  assert.ok(plan.ambiguous.some((pair) => pair.leftName === "Manifest" && pair.rightName === "Manifest"));
  assert.ok(plan.ambiguous.some((pair) => pair.leftId === "person_tyler_a" || pair.rightId === "person_tyler_a"));
  assert.ok(plan.ambiguous.some((pair) => pair.detail.includes("unverified LinkedIn")));

  applyDedupe(db, plan);
  clearRedirectCache();

  const shinkeiLeft = db.prepare(`SELECT id, website_url, primary_link, description FROM projects WHERE id IN ('proj_shinkei', 'proj_shinkei_corp')`).all() as {
    id: string;
    website_url: string | null;
    primary_link: string | null;
    description: string | null;
  }[];
  assert.equal(shinkeiLeft.length, 1);
  const shinkei = shinkeiLeft[0];
  assert.match(shinkei.website_url ?? "", /shinkei\.systems/);
  assert.match(shinkei.primary_link ?? "", /venturelab\.upenn\.edu/);
  const droppedShinkei = shinkei.id === "proj_shinkei" ? "proj_shinkei_corp" : "proj_shinkei";
  assert.equal(survivorId("project", droppedShinkei), shinkei.id);
  const investors = db.prepare(`SELECT value_text FROM company_facts WHERE project_id = ? AND fact_key = 'investor'`).all(shinkei.id) as { value_text: string }[];
  assert.ok(investors.some((row) => row.value_text === "Venture Lab VIP-X"));
  const descriptions = db.prepare(`SELECT value_text FROM company_facts WHERE project_id = ? AND fact_key = 'description'`).all(shinkei.id) as { value_text: string }[];
  assert.ok(descriptions.length >= 2);
  const rounds = db.prepare(`SELECT value_text FROM company_facts WHERE project_id = ? AND fact_key = 'funding_round'`).all(shinkei.id) as { value_text: string }[];
  assert.equal(rounds.length, 1);
  assert.equal((db.prepare(`SELECT COUNT(*) AS c FROM funding_events WHERE project_id = ?`).get(shinkei.id) as { c: number }).c, 1);
  assert.equal((db.prepare(`SELECT COUNT(*) AS c FROM person_project_roles WHERE project_id = ? AND person_id = 'person_saif'`).get(shinkei.id) as { c: number }).c, 1);
  assert.equal((db.prepare(`SELECT COUNT(*) AS c FROM relationships WHERE target_entity_id = ? AND relationship_type = 'founded'`).get(shinkei.id) as { c: number }).c, 1);
  const evidence = db.prepare(`SELECT evidence_claim_ids_json FROM relationships WHERE target_entity_id = ? AND relationship_type = 'founded'`).get(shinkei.id) as { evidence_claim_ids_json: string };
  assert.match(evidence.evidence_claim_ids_json, /claim_old/);
  assert.match(evidence.evidence_claim_ids_json, /claim_new/);
  assert.equal((db.prepare(`SELECT body FROM notes WHERE entity_id = ?`).get(shinkei.id) as { body: string }).body, "met the founder");
  assert.equal((db.prepare(`SELECT status FROM pipeline_entries WHERE project_id = ?`).get(shinkei.id) as { status: string }).status, "Researching");
  assert.equal((db.prepare(`SELECT COUNT(*) AS c FROM project_sector_tags WHERE project_id = ? AND tag = 'robotics_hardware'`).get(shinkei.id) as { c: number }).c, 1);
  const claims = db.prepare(`SELECT excerpt FROM claims WHERE entity_id = ?`).all(shinkei.id) as { excerpt: string }[];
  assert.ok(claims.some((claim) => claim.excerpt === "Venture Lab finalist"));
  assert.ok(claims.some((claim) => claim.excerpt === "Company site"));

  const lckr = db.prepare(`SELECT id, kind, website_url, primary_link FROM projects WHERE name = 'LCKR'`).all() as {
    id: string;
    kind: string;
    website_url: string | null;
    primary_link: string | null;
  }[];
  assert.equal(lckr.length, 1);
  assert.equal(lckr[0].kind, "company");
  assert.match(lckr[0].website_url ?? "", /lckrhub\.com/);
  assert.match(lckr[0].primary_link ?? "", /devpost\.com/);
  assert.equal(survivorId("project", "proj_lckr_hack"), lckr[0].id);
  const alizas = db.prepare(`SELECT id FROM people WHERE name = 'Aliza Berger'`).all() as { id: string }[];
  assert.equal(alizas.length, 1);
  assert.match(String((db.prepare(`SELECT aliases_json FROM people WHERE id = ?`).get(alizas[0].id) as { aliases_json: string }).aliases_json), /linkedin\.com\/in\/aliza-berger/);
  assert.equal((db.prepare(`SELECT role FROM person_project_roles WHERE person_id = ? AND project_id = ?`).get(alizas[0].id, lckr[0].id) as { role: string }).role, "founder");
  assert.equal((db.prepare(`SELECT COUNT(*) AS c FROM person_project_roles WHERE project_id = ? AND person_id = 'person_khush'`).get(lckr[0].id) as { c: number }).c, 1);

  assert.equal((db.prepare(`SELECT COUNT(*) AS c FROM projects WHERE name = 'Manifest'`).get() as { c: number }).c, 2);
  assert.equal((db.prepare(`SELECT COUNT(*) AS c FROM projects WHERE name = 'Story Builder'`).get() as { c: number }).c, 2);
  assert.equal((db.prepare(`SELECT COUNT(*) AS c FROM projects WHERE website_url LIKE '%hack4impact.org%'`).get() as { c: number }).c, 3);
  assert.equal((db.prepare(`SELECT COUNT(*) AS c FROM projects WHERE name LIKE 'WDB%'`).get() as { c: number }).c, 2);
  assert.equal((db.prepare(`SELECT COUNT(*) AS c FROM people WHERE name = 'David Lee'`).get() as { c: number }).c, 2);
  assert.equal((db.prepare(`SELECT COUNT(*) AS c FROM people WHERE name = 'Kevin Lu'`).get() as { c: number }).c, 2);
  assert.equal((db.prepare(`SELECT COUNT(*) AS c FROM people WHERE name = 'Tyler Sacharow'`).get() as { c: number }).c, 2);
  assert.equal((db.prepare(`SELECT COUNT(*) AS c FROM people WHERE name = 'Eshaan Kaipa'`).get() as { c: number }).c, 1);
  assert.equal((db.prepare(`SELECT COUNT(*) AS c FROM projects WHERE name IN ('Munch Industries', 'Orble')`).get() as { c: number }).c, 1);
  assert.equal((db.prepare(`SELECT COUNT(*) AS c FROM projects WHERE name = 'Sim'`).get() as { c: number }).c, 1);

  const again = planDedupe(db);
  assert.equal(again.startupMerges.length, 0);
  assert.equal(again.peopleMerges.length, 0);
  const totals = tableCounts(db);
  assert.ok(totals.people < 18);
  assert.ok(totals.companies < 16);

  console.log("dedupe tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
