"use server";

import { revalidatePath } from "next/cache";
import { getDb, nowIso } from "../db/client";
import type { CommunityConfidence, CommunitySignalCategory } from "../domain/community-signal";

const VALID_CONFIDENCE: CommunityConfidence[] = ["high", "medium", "low", "insufficient"];

// Manual entry only, on purpose — see lib/domain/community-signal.ts's file
// header. Reddit's public JSON endpoints reject non-browser requests (403)
// from this deployment, and general web search doesn't index Reddit
// threads, so there is no automated fetch path today. This form is where a
// human enters what they actually read, with the confidence bar and
// insider-disclosure caveat spelled out in the rationale itself — never a
// mechanical score. Optional numeric fields (blank = not counted, not zero).
export async function setCommunitySignal(formData: FormData) {
  const sourceId = String(formData.get("sourceId") || "");
  const confidence = String(formData.get("confidence") || "") as CommunityConfidence;
  const categories = formData.getAll("categories").map(String) as CommunitySignalCategory[];
  const rationale = String(formData.get("rationale") || "").trim();

  if (!sourceId || !VALID_CONFIDENCE.includes(confidence) || !rationale) return;

  const toNullableInt = (key: string): number | null => {
    const raw = String(formData.get(key) || "").trim();
    if (raw === "") return null;
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 ? n : null;
  };

  const db = getDb();
  db.prepare(
    `UPDATE sources SET
       community_signal_json = ?,
       community_confidence = ?,
       reddit_mention_count = ?,
       reddit_independent_mentions = ?,
       reddit_positive_mentions = ?,
       reddit_negative_mentions = ?,
       community_rationale = ?,
       reddit_last_checked_at = ?
     WHERE id = ?`
  ).run(
    JSON.stringify(categories),
    confidence,
    toNullableInt("mentionCount"),
    toNullableInt("independentMentions"),
    toNullableInt("positiveMentions"),
    toNullableInt("negativeMentions"),
    rationale,
    nowIso(),
    sourceId
  );

  revalidatePath("/sources");
}

export async function clearCommunitySignal(formData: FormData) {
  const sourceId = String(formData.get("sourceId") || "");
  if (!sourceId) return;
  const db = getDb();
  db.prepare(
    `UPDATE sources SET
       community_signal_json = '[]', community_confidence = NULL,
       reddit_mention_count = NULL, reddit_independent_mentions = NULL,
       reddit_positive_mentions = NULL, reddit_negative_mentions = NULL,
       community_rationale = NULL, reddit_last_checked_at = NULL
     WHERE id = ?`
  ).run(sourceId);
  revalidatePath("/sources");
}
