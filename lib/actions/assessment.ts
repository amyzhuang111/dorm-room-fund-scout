"use server";

import { revalidatePath } from "next/cache";
import { getDb, newId } from "../db/client";
import { RUBRIC_DIMENSIONS, RUBRIC_VERSION, computeRubric, type Ratings } from "../scoring/rubric";

// Persists one assessment as a new row — never overwrites a prior one, so
// history and any earlier evaluator's ratings survive. The rubric math
// itself (coverage, quality score, the coverage-gate rule) always runs
// through computeRubric() here, deterministically; whoever fills the form
// only supplies 0–5-or-blank ratings, never a final score.
export async function saveAssessment(formData: FormData) {
  const projectId = String(formData.get("projectId") || "");
  const evaluator = String(formData.get("evaluator") || "amy").trim() || "amy";
  const notes = String(formData.get("notes") || "").trim();
  const counterevidence = String(formData.get("counterevidence") || "").trim();
  if (!projectId) return;

  const ratings: Ratings = {};
  for (const dim of RUBRIC_DIMENSIONS) {
    const raw = String(formData.get(`rating_${dim.key}`) || "").trim();
    if (raw === "" || raw === "unknown") {
      ratings[dim.key] = null;
    } else {
      const n = Number(raw);
      if (Number.isInteger(n) && n >= 0 && n <= 5) ratings[dim.key] = n as Ratings[typeof dim.key];
    }
  }

  const rubric = computeRubric(ratings);

  const db = getDb();
  db.prepare(
    `INSERT INTO assessments (id, project_id, rubric_version, ratings_json, rationale_json, counterevidence_json, coverage, quality_score, evaluator)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    newId("assess"),
    projectId,
    RUBRIC_VERSION,
    JSON.stringify(ratings),
    JSON.stringify({ notes }),
    JSON.stringify({ notes: counterevidence }),
    rubric.coverage,
    rubric.qualityScore,
    evaluator
  );

  revalidatePath("/startup/discover");
  revalidatePath("/startup/shortlist");
}
