import type Database from "better-sqlite3";

// If the last snapshot we took of this exact (source, url) has the same content
// hash, the source hasn't changed since we last processed it — skip re-inserting
// claims/affiliations/etc. entirely rather than duplicating them. This is what
// makes re-running an ingestion script a safe, idempotent "refresh" instead of a
// row-count-doubling operation.
export function previousSnapshotHash(db: Database.Database, sourceId: string, url: string): string | null {
  const row = db
    .prepare(`SELECT content_hash FROM snapshots WHERE source_id = ? AND url = ? ORDER BY fetched_at DESC LIMIT 1`)
    .get(sourceId, url) as { content_hash: string } | undefined;
  return row?.content_hash ?? null;
}
