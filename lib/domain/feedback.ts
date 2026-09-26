// Reviewer feedback (like / pass / hide). Matching uses the stable entity id
// first, then a normalized name plus domain so a re-ingest that mints a new
// id still honors a hide. There is no auth in this app; see
// components/feedback-provider.tsx for where the records live.

export type FeedbackAction = "like" | "pass" | "hide";
export type FeedbackEntityType = "person" | "project";

export interface FeedbackRecord {
  entityType: FeedbackEntityType;
  entityId: string;
  nameKey: string;
  domainKey: string | null;
  action: FeedbackAction;
  note: string;
  at: string;
}

export interface FeedbackTarget {
  entityType: FeedbackEntityType;
  entityId: string;
  name: string;
  /** Hostname of the official site or primary public page, when one exists. */
  domain: string | null;
  sectors: string[];
  universityIds: string[];
  sourceIds: string[];
  /** People on this company, or this person plus co-builders. */
  personIds: string[];
}

export const FEEDBACK_COOKIE = "scout_feedback";
const COOKIE_BUDGET = 3600;

export function nameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function domainKey(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export function matchesFeedback(record: FeedbackRecord, target: { entityType: FeedbackEntityType; entityId: string; name: string; domain: string | null }): boolean {
  if (record.entityType !== target.entityType) return false;
  if (record.entityId === target.entityId) return true;
  const targetName = nameKey(target.name);
  if (!record.nameKey || record.nameKey !== targetName) return false;
  const tokens = targetName.split(" ").filter(Boolean);
  if (record.domainKey && target.domain && record.domainKey === target.domain) return true;
  if (!record.domainKey && !target.domain && tokens.length >= 2) return true;
  if (tokens.length >= 2 && (!record.domainKey || !target.domain)) return true;
  return false;
}

export function recordsFor(records: FeedbackRecord[], action: FeedbackAction, target: { entityType: FeedbackEntityType; entityId: string; name: string; domain: string | null }): FeedbackRecord | null {
  return records.find((r) => r.action === action && matchesFeedback(r, target)) ?? null;
}

export function isHidden(records: FeedbackRecord[], target: { entityType: FeedbackEntityType; entityId: string; name: string; domain: string | null }): boolean {
  return records.some((r) => r.action === "hide" && matchesFeedback(r, target));
}

export interface Boost {
  score: number;
  note: string;
}

export function boostFor(target: FeedbackTarget, likes: FeedbackTarget[]): Boost | null {
  let best: Boost | null = null;
  for (const liked of likes) {
    if (liked.entityId === target.entityId && liked.entityType === target.entityType) continue;
    const reasons: string[] = [];
    const sharedSector = target.sectors.find((s) => liked.sectors.includes(s));
    if (sharedSector) reasons.push(`shared sector: ${sharedSector}`);
    const sharedSchool = target.universityIds.find((s) => liked.universityIds.includes(s));
    if (sharedSchool) reasons.push("shared school");
    const sharedSource = target.sourceIds.find((s) => liked.sourceIds.includes(s));
    if (sharedSource) reasons.push("shared program");
    const sharedPerson = target.personIds.find((s) => liked.personIds.includes(s));
    if (sharedPerson) reasons.push(target.entityType === "person" ? "shared project" : "shared founder");
    if (reasons.length === 0) continue;
    const note = `Boosted because you liked ${liked.name} · ${reasons[0]}`;
    if (!best || reasons.length > best.score) best = { score: reasons.length, note };
  }
  return best;
}

export function parseFeedbackCookie(raw: string | undefined | null): FeedbackRecord[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as FeedbackRecord[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((r) => r && (r.action === "like" || r.action === "pass" || r.action === "hide") && r.entityId && r.entityType);
  } catch {
    return [];
  }
}

export function serializeFeedbackCookie(records: FeedbackRecord[]): string {
  const ranked = [...records].sort((a, b) => {
    const rank = (action: FeedbackAction) => (action === "hide" ? 0 : action === "like" ? 1 : 2);
    return rank(a.action) - rank(b.action) || b.at.localeCompare(a.at);
  });
  let kept = ranked;
  while (kept.length > 0 && encodeURIComponent(JSON.stringify(kept)).length > COOKIE_BUDGET) {
    kept = kept.slice(0, -1);
  }
  return encodeURIComponent(JSON.stringify(kept));
}

export function upsertFeedback(records: FeedbackRecord[], next: FeedbackRecord): FeedbackRecord[] {
  const without = records.filter((r) => !(r.entityType === next.entityType && (r.entityId === next.entityId || (r.nameKey === next.nameKey && r.domainKey === next.domainKey))));
  return [...without, next];
}

export function removeFeedback(records: FeedbackRecord[], target: { entityType: FeedbackEntityType; entityId: string; name: string; domain: string | null }): FeedbackRecord[] {
  return records.filter((r) => !matchesFeedback(r, target));
}

/** Follow old_id → survivor_id, including chains, without looping. */
export function resolveRedirect(id: string, redirects: Record<string, string>): string {
  let current = id;
  const seen = new Set<string>();
  while (redirects[current] && !seen.has(current)) {
    seen.add(current);
    current = redirects[current];
  }
  return current;
}

// Likes, passes, and never-show rows live in the browser and in Upstash, keyed
// by entity id. After a merge, point those keys at the surviving id.
export function applyEntityRedirects(records: FeedbackRecord[], redirects: Record<string, string>): FeedbackRecord[] {
  if (!redirects || Object.keys(redirects).length === 0) return records;
  let changed = false;
  const rewritten = records.map((record) => {
    const entityId = resolveRedirect(record.entityId, redirects);
    if (entityId === record.entityId) return record;
    changed = true;
    return { ...record, entityId };
  });
  if (!changed) return records;
  const byKey = new Map<string, FeedbackRecord>();
  for (const record of rewritten) {
    const key = `${record.entityType}:${record.entityId}`;
    const prev = byKey.get(key);
    if (!prev || (record.at || "") >= (prev.at || "")) byKey.set(key, record);
  }
  return [...byKey.values()];
}
