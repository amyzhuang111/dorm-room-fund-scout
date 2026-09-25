// Retroactive LinkedIn backfill for everyone already ingested via a
// Devpost hackathon gallery (PennApps/TreeHacks/Cal Hacks/Hack the North)
// BEFORE lib/ingest/devpost-hackathon.ts learned to check personal profile
// pages for a LinkedIn link (2026-09-25, see that file's header comment).
// 3,240 people have a real, already-verified `devpost:<url>` alias but no
// `linkedin:` alias yet — this checks each one's own Devpost profile page
// the same safe way (a person's own self-linked profile, not a name
// guess) rather than leaving that pre-existing backlog stuck.
//
// Bounded per run (default 60 fetches) and resumable across runs without
// re-fetching the same person twice: everyone checked gets a
// `linkedin_checked` marker alias regardless of outcome (found or not),
// so a person with genuinely no LinkedIn on their Devpost profile isn't
// re-fetched forever. Same convention as devpost-hackathon.ts's own
// `refresh_suggestion` reuse — a lightweight marker instead of a schema
// migration for what's really just "already looked at this."
//
// Run: npx tsx scripts/ingest/backfill-devpost-linkedin.ts [count]
import { getDb, newId, nowIso } from "../../lib/db/client";

const SOURCE_ID = "src_devpost_linkedin_backfill";
const DEFAULT_BATCH = 60;
const DELAY_MS = 700;

function extractPersonalLinkedin(profileHtml: string): string | null {
  const m = profileHtml.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9_-]+/);
  return m ? m[0].replace(/\/$/, "") : null;
}

async function main() {
  const batchSize = parseInt(process.argv[2] || "", 10) || DEFAULT_BATCH;
  const db = getDb();
  const retrievedAt = nowIso();

  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at)
     VALUES (?, 'Devpost profile pages (LinkedIn backfill)', 'code_host', 'https://devpost.com/', '[]', 2, 'html_scrape', 'available', ?)
     ON CONFLICT(id) DO UPDATE SET last_attempt_at=excluded.last_attempt_at, status='available'`
  ).run(SOURCE_ID, retrievedAt);

  const people = db
    .prepare(
      `SELECT id, name, aliases_json FROM people
       WHERE aliases_json LIKE '%devpost:%' AND aliases_json NOT LIKE '%linkedin:%' AND aliases_json NOT LIKE '%linkedin_checked%'
       ORDER BY id LIMIT ?`
    )
    .all(batchSize) as { id: string; name: string; aliases_json: string }[];

  if (people.length === 0) {
    console.log("No more people with an unchecked devpost: alias — backfill is fully caught up.");
    return;
  }
  console.log(`Checking ${people.length} Devpost profile page(s) for a personal LinkedIn link...`);

  const updateAliases = db.prepare(`UPDATE people SET aliases_json = ? WHERE id = ?`);
  const insertClaim = db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, snapshot_id, source_url, retrieved_at, label, verification_state)
     VALUES (?, 'person', ?, 'linkedin_alias_discovered', ?, ?, ?, NULL, ?, ?, 'observed_fact', 'corroborated')`
  );

  let found = 0;
  let checked = 0;
  let failed = 0;

  for (const person of people) {
    const aliases: string[] = JSON.parse(person.aliases_json || "[]");
    const devpostAlias = aliases.find((a) => a.startsWith("devpost:"));
    if (!devpostAlias) continue;
    const profileUrl = devpostAlias.replace("devpost:", "");

    let html: string;
    try {
      const res = await fetch(profileUrl, { headers: { "user-agent": "campus-universe-research-bot/0.1 (manual, bounded)" } });
      if (res.status === 429) {
        console.log("Devpost returned 429. Stopping so this run can be resumed.");
        break;
      }
      if (!res.ok) {
        // 404/410 = the account is really gone, a permanent state, not a
        // transient failure — mark checked so it doesn't get re-fetched
        // forever. Anything else (5xx, network error) stays retryable.
        if (res.status === 404 || res.status === 410) {
          updateAliases.run(JSON.stringify([...aliases, "linkedin_checked"]), person.id);
          console.log(`  ${person.name}: Devpost profile permanently gone (HTTP ${res.status}) — marked checked, won't retry.`);
          failed++;
          continue;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      html = await res.text();
    } catch (e) {
      console.log(`  skip ${person.name}: fetch failed (${(e as Error).message})`);
      failed++;
      continue;
    }
    checked++;

    const li = extractPersonalLinkedin(html);
    const newAliases = [...aliases, "linkedin_checked"];
    if (li) {
      newAliases.push(`linkedin:${li}`);
      found++;
      const claimId = newId("claim");
      insertClaim.run(
        claimId,
        person.id,
        JSON.stringify({ linkedin: li }),
        `${person.name}'s Devpost profile (${profileUrl}) links their own personal LinkedIn: ${li}. Backfilled retroactively — this person was ingested before Devpost profile pages were checked for LinkedIn links.`,
        SOURCE_ID,
        profileUrl,
        retrievedAt
      );
    }
    updateAliases.run(JSON.stringify(newAliases), person.id);
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  const remaining = (
    db
      .prepare(`SELECT COUNT(*) c FROM people WHERE aliases_json LIKE '%devpost:%' AND aliases_json NOT LIKE '%linkedin:%' AND aliases_json NOT LIKE '%linkedin_checked%'`)
      .get() as { c: number }
  ).c;
  db.prepare(`UPDATE sources SET last_success_at=? WHERE id=?`).run(nowIso(), SOURCE_ID);

  console.log(`${checked} checked, ${found} personal LinkedIn link(s) found, ${failed} fetch failure(s). ${remaining} people still unchecked — re-run to continue.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
