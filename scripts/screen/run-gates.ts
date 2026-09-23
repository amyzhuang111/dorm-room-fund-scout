// Evaluates DRF screening gates for every investable-candidate project that
// isn't a confirmed existing portfolio member, and persists gate_results.
// Deterministic — no LLM involved. Safe to re-run; results are upserted.
//
// Run: npx tsx scripts/screen/run-gates.ts

import { getDb, newId } from "../../lib/db/client";
import { assembleProjectFacts } from "../../lib/domain/facts";
import { evaluateAllGates } from "../../lib/screening/gates";

function main() {
  const db = getDb();
  const projects = db
    .prepare(`SELECT id, name FROM projects WHERE kind IN ('company','project') AND is_investable_candidate = 1`)
    .all() as { id: string; name: string }[];

  const upsert = db.prepare(
    `INSERT INTO gate_results (id, project_id, gate_name, result, rationale, evaluated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(project_id, gate_name) DO UPDATE SET result=excluded.result, rationale=excluded.rationale, evaluated_at=excluded.evaluated_at`
  );

  for (const p of projects) {
    const facts = assembleProjectFacts(db, p.id);
    const outcomes = evaluateAllGates(facts);
    for (const o of outcomes) {
      upsert.run(newId("gate"), p.id, o.gate, o.result, o.rationale);
    }
    console.log(`${p.name}: ${outcomes.map((o) => `${o.gate}=${o.result}`).join(", ")}`);
  }
  console.log(`\nEvaluated ${projects.length} candidate project(s).`);
}

main();
