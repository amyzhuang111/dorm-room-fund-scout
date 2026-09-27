"use server";

import { revalidatePath } from "next/cache";
import { requireMemberAction } from "../auth/guard";
import { getDb, newId } from "../db/client";

const VALID_STATUSES = ["New", "Researching", "Contact planned", "Contacted", "Meeting", "Diligence", "Passed"];

export async function updatePipelineEntry(formData: FormData) {
  await requireMemberAction();
  const projectId = String(formData.get("projectId") || "");
  const status = String(formData.get("status") || "New");
  const nextAction = String(formData.get("nextAction") || "").trim() || null;
  const dueDate = String(formData.get("dueDate") || "").trim() || null;
  const notes = String(formData.get("notes") || "").trim() || null;
  const passReason = String(formData.get("passReason") || "").trim() || null;

  if (!projectId || !VALID_STATUSES.includes(status)) return;

  const db = getDb();
  const existing = db.prepare(`SELECT project_id FROM pipeline_entries WHERE project_id = ?`).get(projectId);
  if (existing) {
    db.prepare(
      `UPDATE pipeline_entries SET status=?, next_action=?, due_date=?, notes=?, pass_reason=?, updated_at=datetime('now') WHERE project_id=?`
    ).run(status, nextAction, dueDate, notes, passReason, projectId);
  } else {
    db.prepare(
      `INSERT INTO pipeline_entries (id, project_id, status, next_action, due_date, notes, pass_reason) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(newId("pipe"), projectId, status, nextAction, dueDate, notes, passReason);
  }

  revalidatePath("/startup/discover");
  revalidatePath("/startup/shortlist");
  revalidatePath("/startup/pipeline");
}
