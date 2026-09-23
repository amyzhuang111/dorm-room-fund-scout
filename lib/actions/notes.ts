"use server";

import { revalidatePath } from "next/cache";
import { getDb, newId } from "../db/client";

export async function addNote(formData: FormData) {
  const entityType = String(formData.get("entityType") || "");
  const entityId = String(formData.get("entityId") || "");
  const body = String(formData.get("body") || "").trim();
  const author = String(formData.get("author") || "amy").trim() || "amy";

  if (!entityType || !entityId || !body) return;

  const db = getDb();
  db.prepare(`INSERT INTO notes (id, entity_type, entity_id, body, author) VALUES (?, ?, ?, ?, ?)`).run(
    newId("note"),
    entityType,
    entityId,
    body,
    author
  );

  revalidatePath("/startup/discover");
  revalidatePath("/startup/shortlist");
}
