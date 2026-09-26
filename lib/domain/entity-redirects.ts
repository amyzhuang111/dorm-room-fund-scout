import fs from "node:fs";
import { databasePath, getDb } from "../db/client";
import { resolveRedirect } from "./feedback";

export type RedirectEntityType = "project" | "person";

interface RedirectTarget {
  entityType: RedirectEntityType;
  survivorId: string;
}

interface RedirectCache {
  key: string;
  byId: Record<string, RedirectTarget>;
  flat: Record<string, string>;
}

let cache: RedirectCache | null = null;

function cacheKey(): string {
  try {
    const st = fs.statSync(databasePath());
    return `${databasePath()}:${st.mtimeMs}:${st.size}`;
  } catch {
    return "missing";
  }
}

export function clearRedirectCache(): void {
  cache = null;
}

function loadRedirects(): RedirectCache {
  const key = cacheKey();
  if (cache?.key === key) return cache;
  const db = getDb();
  const rows = db.prepare(`SELECT old_id, entity_type, survivor_id FROM entity_redirects`).all() as {
    old_id: string;
    entity_type: string;
    survivor_id: string;
  }[];
  const raw: Record<string, string> = {};
  const types = new Map<string, RedirectEntityType>();
  for (const row of rows) {
    if (row.entity_type !== "project" && row.entity_type !== "person") continue;
    raw[row.old_id] = row.survivor_id;
    types.set(row.old_id, row.entity_type);
  }
  const byId: Record<string, RedirectTarget> = {};
  const flat: Record<string, string> = {};
  for (const id of Object.keys(raw)) {
    const survivorId = resolveRedirect(id, raw);
    const entityType = types.get(id);
    if (!entityType || !survivorId || survivorId === id) continue;
    byId[id] = { entityType, survivorId };
    flat[id] = survivorId;
  }
  cache = { key, byId, flat };
  return cache;
}

/** Surviving id for a merged-away project or person, or null when `id` is current. */
export function survivorId(entityType: RedirectEntityType, id: string): string | null {
  const row = loadRedirects().byId[id];
  if (!row || row.entityType !== entityType || row.survivorId === id) return null;
  return row.survivorId;
}

/** old id → survivor id, for likes / passes / never-show records. */
export function feedbackRedirects(): Record<string, string> {
  return loadRedirects().flat;
}

/** When a query param still carries a merged-away id, the URL to open instead. */
export function mergedParamHref(
  path: string,
  sp: Record<string, string | undefined>,
  key: string,
  entityType: RedirectEntityType,
): string | null {
  const id = sp[key];
  if (!id) return null;
  const next = survivorId(entityType, id);
  if (!next) return null;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (!v) continue;
    params.set(k, k === key ? next : v);
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}
