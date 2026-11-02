/**
 * Refresh data/corpus-snapshot.json from the live DB + directory (no hardcodes).
 * Run after dedupe-expand-companies.ts and before precompute / checks.
 */
import fs from "node:fs";
import path from "node:path";
import { getDb } from "../../lib/db/client";
import { shortCampusLabel } from "../../lib/domain/campuses";
import { buildDirectoryFromDb, clearDirectoryMemo } from "../../lib/domain/directory";
import { buildPeakShell } from "../../lib/domain/peak-shell";
import { listUniversities } from "../../lib/domain/queries";
import { sampleSurfaceCounts } from "../../lib/domain/sample-facets";
import { buildFounderIndex } from "../../lib/domain/founder-index-build";

const SNAP_PATH = path.join(process.cwd(), "data", "corpus-snapshot.json");

function main() {
  clearDirectoryMemo();
  const directory = buildDirectoryFromDb();
  const shell = buildPeakShell(directory.cards);
  const db = getDb();
  const unis = listUniversities();
  const withCoords = unis.filter((u) => u.lat != null && u.lon != null);
  const surface = sampleSurfaceCounts(
    directory.cards,
    withCoords.map((u) => ({ id: u.id })),
  );
  const withFounders = unis
    .filter((u) => u.founderCount > 0)
    .sort((a, b) => b.founderCount - a.founderCount || a.name.localeCompare(b.name));

  const existing = fs.existsSync(SNAP_PATH) ? JSON.parse(fs.readFileSync(SNAP_PATH, "utf8")) : {};
  const signals = (db.prepare(`SELECT COUNT(*) AS c FROM signals`).get() as { c: number }).c;
  const signalsDated = (
    db.prepare(`SELECT COUNT(*) AS c FROM signals WHERE source_date IS NOT NULL AND trim(source_date) != ''`).get() as {
      c: number;
    }
  ).c;
  const sharePct = shell && shell.dated > 0 ? Math.round((shell.peakCount / shell.dated) * 100) : 0;

  const snapshot = {
    ...existing,
    generatedAt: new Date().toISOString(),
    dbPath: "data/campus-universe.db",
    investableCompanies: directory.cards.length,
    directoryCards: directory.cards.length,
    signals,
    signalsDated,
    signalsUndated: signals - signalsDated,
    people: (db.prepare(`SELECT COUNT(*) AS c FROM people`).get() as { c: number }).c,
    founders: (db.prepare(`SELECT COUNT(*) AS c FROM people WHERE founder_status = 'founder'`).get() as { c: number }).c,
    // Same corpus the home founder strip loads (public/data/founders.json).
    foundersIndexed: buildFounderIndex().length,
    foundersListed: surface.foundersListed,
    campuses: unis.length,
    campusesTotal: unis.length,
    campusesOnMap: withCoords.length,
    campusesWithFounders: withFounders.length,
    companiesWithSignal: directory.cards.filter((c) => c.signals > 0).length,
    ycMembership: (
      db
        .prepare(
          `SELECT COUNT(DISTINCT p.id) AS c
           FROM projects p
           JOIN company_facts f ON f.project_id = p.id
           WHERE p.kind = 'company' AND p.is_investable_candidate = 1
             AND f.fact_key = 'investor' AND f.value_text = 'Y Combinator'`,
        )
        .get() as { c: number }
    ).c,
    peak: shell
      ? {
          peakCount: shell.peakCount,
          peakId: shell.peakId,
          peakLabel: shell.peakLabel,
          dated: shell.dated,
          sharePct,
          inWindow: shell.inWindow,
          earlierValid: shell.earlierValid,
          undatedMonth: shell.undatedMonth,
          quiet: shell.quiet,
        }
      : null,
    campusFoundersTop: withFounders.slice(0, 10).map((u) => ({
      name: u.name,
      short: shortCampusLabel(u.id, u.name),
      founders: u.founderCount,
      companies: u.companyCount,
      country: u.country,
    })),
  };

  fs.writeFileSync(SNAP_PATH, JSON.stringify(snapshot, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        investable: snapshot.investableCompanies,
        signals: snapshot.signals,
        peak: snapshot.peak,
        foundersListed: snapshot.foundersListed,
        campusesOnMap: snapshot.campusesOnMap,
      },
      null,
      2,
    ),
  );
}

main();
