/**
 * Undo the 10 wrong norm-name-only merges from 2026-11-02 expand dedupe,
 * restore awards/signals/claims/roles/relationships/facts onto the correct
 * companies (sourced from data/campus-universe.db.bak-pre-audit), merge
 * KaigoHealth → Kaigo Health, then recompute corpus snapshot.
 *
 *   npx tsx scripts/ingest/restore-wrong-name-merges.ts
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { getDb } from "../../lib/db/client";
import { mergeRecordedPair } from "../../lib/domain/dedupe";
import { buildPeakShell } from "../../lib/domain/peak-shell";
import { buildDirectoryFromDb, clearDirectoryMemo } from "../../lib/domain/directory";

const ROOT = process.cwd();
const BAK_PATH = path.join(ROOT, "data", "campus-universe.db.bak-pre-audit");
const SNAP_PATH = path.join(ROOT, "data", "corpus-snapshot.json");

/** survivor → drops that were wrongly absorbed by name alone */
const WRONG_MERGES: { survivorId: string; dropId: string }[] = [
  { survivorId: "proj_76-1kHkuzKDM", dropId: "proj_yF8qWUDTXtWA" }, // Manifest
  { survivorId: "proj_BfJtD64Il5HC", dropId: "proj_vve0nATUapi5" }, // Scout UChicago
  { survivorId: "proj_BfJtD64Il5HC", dropId: "proj_8wpyd1klm2eL" }, // Scout Daily
  { survivorId: "proj_xksHiApDfWeq", dropId: "proj__i9SQS5Uck0z" }, // Fulcrum
  { survivorId: "proj_jRCyQwIq8J1u", dropId: "proj_yTsIek7JT4YO" }, // agora Penn
  { survivorId: "proj_nlgdLCJ8M8cu", dropId: "proj_cOIfI3taMvQK" }, // Pulse CMU
  { survivorId: "proj_T3K6iicFlqJ4", dropId: "proj_pub_4db7ca3deba2f128c3f3" }, // HINDSIGHT
  { survivorId: "proj_RHtZSDM-jOV6", dropId: "proj_pub_7ad6255f77867188bdcf" }, // Kindred Cornell Tech
  { survivorId: "proj_pub_cf2f2de9ee39ec601e00", dropId: "proj_pub_4abdf77ebf4b0438881c" }, // PipeLine Purdue
  { survivorId: "proj_pub_9edf5c725da9abad1219", dropId: "proj_pub_68d1d95bd91ec86ed713" }, // VAMP Georgetown
];

const KAIGO_SURVIVOR = "proj_tQeICzT-wWvh"; // Kaigo Health (has website)
const KAIGO_DROP = "proj_uXFMX5O-DwiH"; // KaigoHealth (junk Illini blurb)

function colsOf(db: Database.Database, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
}

function insertRow(db: Database.Database, table: string, row: Record<string, unknown>, cols: string[]) {
  const use = cols.filter((c) => c in row);
  const placeholders = use.map(() => "?").join(",");
  db.prepare(`INSERT OR REPLACE INTO ${table} (${use.join(",")}) VALUES (${placeholders})`).run(
    ...use.map((c) => row[c] ?? null),
  );
}

function main() {
  if (!fs.existsSync(BAK_PATH)) throw new Error(`Missing bak DB at ${BAK_PATH}`);
  const bak = new Database(BAK_PATH, { readonly: true });
  const db = getDb();

  const projectCols = colsOf(bak, "projects");
  const factCols = colsOf(bak, "company_facts");
  const fundingCols = colsOf(bak, "funding_events");
  const sectorCols = colsOf(bak, "project_sector_tags");
  const relCols = colsOf(bak, "relationships");

  const before = (
    db.prepare(`SELECT COUNT(*) AS c FROM projects WHERE kind = 'company' AND is_investable_candidate = 1`).get() as {
      c: number;
    }
  ).c;

  const run = db.transaction(() => {
    const survivorsRestored = new Set<string>();

    for (const { survivorId, dropId } of WRONG_MERGES) {
      const dropRow = bak.prepare(`SELECT * FROM projects WHERE id = ?`).get(dropId) as Record<string, unknown> | undefined;
      const survBak = bak.prepare(`SELECT * FROM projects WHERE id = ?`).get(survivorId) as Record<string, unknown> | undefined;
      if (!dropRow) throw new Error(`bak missing drop ${dropId}`);
      if (!survBak) throw new Error(`bak missing survivor ${survivorId}`);

      const already = db.prepare(`SELECT id FROM projects WHERE id = ?`).get(dropId);
      if (!already) insertRow(db, "projects", dropRow, projectCols);

      // Restore survivor fields that absorbProject may have overwritten
      if (!survivorsRestored.has(survivorId)) {
        db.prepare(
          `UPDATE projects SET
             aliases_json = ?, description = ?, website_url = ?, primary_link = ?, primary_link_kind = ?,
             sector = ?, signal_tier = ?, signal_tier_basis = ?,
             is_portfolio_reference = ?, is_investable_candidate = ?, updated_at = ?
           WHERE id = ?`,
        ).run(
          survBak.aliases_json,
          survBak.description,
          survBak.website_url,
          survBak.primary_link,
          survBak.primary_link_kind,
          survBak.sector,
          survBak.signal_tier,
          survBak.signal_tier_basis,
          survBak.is_portfolio_reference,
          survBak.is_investable_candidate,
          new Date().toISOString(),
          survivorId,
        );
        survivorsRestored.add(survivorId);
      }

      // Signals that belonged to the drop
      for (const row of bak.prepare(`SELECT id FROM signals WHERE project_id = ?`).all(dropId) as { id: string }[]) {
        const cur = db.prepare(`SELECT id FROM signals WHERE id = ?`).get(row.id);
        if (cur) db.prepare(`UPDATE signals SET project_id = ? WHERE id = ?`).run(dropId, row.id);
      }

      // Claims
      for (const row of bak.prepare(`SELECT id FROM claims WHERE entity_id = ?`).all(dropId) as { id: string }[]) {
        const cur = db.prepare(`SELECT id FROM claims WHERE id = ?`).get(row.id);
        if (cur) db.prepare(`UPDATE claims SET entity_id = ? WHERE id = ?`).run(dropId, row.id);
      }

      // Roles
      for (const row of bak.prepare(`SELECT id FROM person_project_roles WHERE project_id = ?`).all(dropId) as {
        id: string;
      }[]) {
        const cur = db.prepare(`SELECT id FROM person_project_roles WHERE id = ?`).get(row.id);
        if (cur) db.prepare(`UPDATE person_project_roles SET project_id = ? WHERE id = ?`).run(dropId, row.id);
      }

      // Relationships — retarget if still present; else reinsert from bak
      for (const row of bak
        .prepare(`SELECT * FROM relationships WHERE source_entity_id = ? OR target_entity_id = ?`)
        .all(dropId, dropId) as Record<string, unknown>[]) {
        const cur = db.prepare(`SELECT id FROM relationships WHERE id = ?`).get(row.id) as { id: string } | undefined;
        if (cur) {
          db.prepare(
            `UPDATE relationships SET source_entity_id = ?, target_entity_id = ? WHERE id = ?`,
          ).run(row.source_entity_id, row.target_entity_id, row.id);
        } else {
          insertRow(db, "relationships", row, relCols);
        }
      }

      // Facts
      for (const row of bak.prepare(`SELECT * FROM company_facts WHERE project_id = ?`).all(dropId) as Record<
        string,
        unknown
      >[]) {
        const cur = db.prepare(`SELECT id FROM company_facts WHERE id = ?`).get(row.id);
        if (cur) db.prepare(`UPDATE company_facts SET project_id = ? WHERE id = ?`).run(dropId, row.id);
        else insertRow(db, "company_facts", row, factCols);
      }

      // Funding
      for (const row of bak.prepare(`SELECT * FROM funding_events WHERE project_id = ?`).all(dropId) as Record<
        string,
        unknown
      >[]) {
        const cur = db.prepare(`SELECT id FROM funding_events WHERE id = ?`).get(row.id);
        if (cur) db.prepare(`UPDATE funding_events SET project_id = ? WHERE id = ?`).run(dropId, row.id);
        else insertRow(db, "funding_events", row, fundingCols);
      }

      // Sector tags
      for (const row of bak.prepare(`SELECT * FROM project_sector_tags WHERE project_id = ?`).all(dropId) as Record<
        string,
        unknown
      >[]) {
        const cur = db.prepare(`SELECT id FROM project_sector_tags WHERE id = ?`).get(row.id);
        if (cur) db.prepare(`UPDATE project_sector_tags SET project_id = ? WHERE id = ?`).run(dropId, row.id);
        else insertRow(db, "project_sector_tags", row, sectorCols);
      }

      // Drop the wrong redirect
      db.prepare(`DELETE FROM entity_redirects WHERE old_id = ?`).run(dropId);

      console.log(`restored ${dropRow.name} (${dropId}) out of ${survivorId}`);
    }

    // Explicit Kaigo merge (same company; name spacing differs so norm keys diverge)
    const kaigoDrop = db.prepare(`SELECT id, name FROM projects WHERE id = ?`).get(KAIGO_DROP) as
      | { id: string; name: string }
      | undefined;
    const kaigoSurv = db.prepare(`SELECT id, name FROM projects WHERE id = ?`).get(KAIGO_SURVIVOR) as
      | { id: string; name: string }
      | undefined;
    if (kaigoDrop && kaigoSurv) {
      const ok = mergeRecordedPair(
        db,
        "project",
        KAIGO_SURVIVOR,
        KAIGO_DROP,
        "manual: KaigoHealth / Kaigo Health same company (compact name + shared product)",
      );
      console.log(`Kaigo merge ${kaigoDrop.name} → ${kaigoSurv.name}: ${ok}`);
    } else {
      console.log("Kaigo rows missing; skip", { kaigoDrop, kaigoSurv });
    }
  });

  run();

  try {
    db.pragma("wal_checkpoint(TRUNCATE)");
  } catch {
    /* ignore */
  }
  clearDirectoryMemo();

  const after = (
    db.prepare(`SELECT COUNT(*) AS c FROM projects WHERE kind = 'company' AND is_investable_candidate = 1`).get() as {
      c: number;
    }
  ).c;
  const afterSignals = (db.prepare(`SELECT COUNT(*) AS c FROM signals`).get() as { c: number }).c;
  const afterPeople = (db.prepare(`SELECT COUNT(*) AS c FROM people`).get() as { c: number }).c;
  const afterFounders = (
    db.prepare(`SELECT COUNT(*) AS c FROM people WHERE founder_status = 'founder'`).get() as { c: number }
  ).c;
  const afterCampuses = (db.prepare(`SELECT COUNT(*) AS c FROM universities`).get() as { c: number }).c;

  const directory = buildDirectoryFromDb();
  const shell = buildPeakShell(directory.cards);
  const withSignal = directory.cards.filter((c) => c.signals > 0).length;
  const ycFacts = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT p.id) AS c
         FROM projects p
         JOIN company_facts f ON f.project_id = p.id
         WHERE p.kind = 'company' AND p.is_investable_candidate = 1
           AND f.fact_key = 'investor' AND f.value_text = 'Y Combinator'`,
      )
      .get() as { c: number }
  ).c;
  const datedSignals = (
    db
      .prepare(`SELECT COUNT(*) AS c FROM signals WHERE source_date IS NOT NULL AND trim(source_date) != ''`)
      .get() as { c: number }
  ).c;

  const snapshot = {
    generatedAt: new Date().toISOString(),
    dbPath: "data/campus-universe.db",
    investableCompanies: after,
    signals: afterSignals,
    datedSignals,
    undatedSignals: afterSignals - datedSignals,
    people: afterPeople,
    founders: afterFounders,
    campuses: afterCampuses,
    withSignal,
    ycCompanies: ycFacts,
    peak: shell
      ? { peakCount: shell.peakCount, dated: shell.dated, sharePct: Math.round((shell.peakCount / shell.dated) * 100) }
      : null,
    restore: {
      beforeInvestable: before,
      afterInvestable: after,
      restoredDrops: WRONG_MERGES.length,
      kaigoMerged: true,
    },
  };
  fs.writeFileSync(SNAP_PATH, JSON.stringify(snapshot, null, 2) + "\n");
  console.log(JSON.stringify(snapshot.restore, null, 2));
  console.log(`investable ${before} → ${after}; signals ${afterSignals}; wrote ${SNAP_PATH}`);

  // Sanity: all restored IDs present and distinct
  for (const { survivorId, dropId } of WRONG_MERGES) {
    const s = db.prepare(`SELECT id, name, website_url FROM projects WHERE id = ?`).get(survivorId);
    const d = db.prepare(`SELECT id, name, website_url FROM projects WHERE id = ?`).get(dropId);
    if (!s || !d) throw new Error(`restore incomplete ${survivorId}/${dropId}`);
  }
  if (db.prepare(`SELECT id FROM projects WHERE id = ?`).get(KAIGO_DROP)) {
    throw new Error("Kaigo drop still present");
  }

  bak.close();
}

main();
