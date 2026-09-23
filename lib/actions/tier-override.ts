"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "../db/client";

const VALID_TIERS = ["S", "A", "B", "C", "D"];

// Manual tier overrides are sticky by design: seed-source-tiers.ts checks
// tier_override_by before touching a row, so a re-ingest or catalogue update
// can never silently revert someone's deliberate call. Who/when/why are
// always recorded.
export async function setTierOverride(formData: FormData) {
  const sourceId = String(formData.get("sourceId") || "");
  const founderTier = String(formData.get("founderScoutTier") || "");
  const startupTier = String(formData.get("startupScoutTier") || "");
  const reason = String(formData.get("reason") || "").trim();
  const overrideBy = String(formData.get("overrideBy") || "amy").trim() || "amy";

  if (!sourceId || !VALID_TIERS.includes(founderTier) || !VALID_TIERS.includes(startupTier) || !reason) return;

  const db = getDb();
  db.prepare(
    `UPDATE sources SET founder_scout_tier=?, startup_scout_tier=?, tier_override_by=?, tier_override_at=datetime('now'), tier_override_reason=?
     WHERE id=?`
  ).run(founderTier, startupTier, overrideBy, reason, sourceId);

  revalidatePath("/sources");
}

export async function clearTierOverride(formData: FormData) {
  const sourceId = String(formData.get("sourceId") || "");
  if (!sourceId) return;
  const db = getDb();
  db.prepare(
    `UPDATE sources SET tier_override_by=NULL, tier_override_at=NULL, tier_override_reason=NULL WHERE id=?`
  ).run(sourceId);
  revalidatePath("/sources");
}
