// Writes the directory tier, one-line rationale, and source onto the source
// row, the program project, the membership badge, and the person's signal
// badge. A stronger tier from a different program is left in place. A tier
// written for this program follows the program when that program's tier changes.

import type Database from "better-sqlite3";
import { membershipDirectory, PROGRAM_DIRECTORY, programTierLine, type ProgramSignalType } from "../../lib/domain/program-signals";
import { preferSignalTier } from "../../lib/domain/signal-tier";

export function writeSourceDirectoryTier(db: Database.Database, sourceId: string, program: ProgramSignalType) {
  const directory = PROGRAM_DIRECTORY[program];
  db.prepare(
    `UPDATE sources SET founder_scout_tier=?, startup_scout_tier=?, tier_rationale=?
     WHERE id=? AND tier_override_by IS NULL`
  ).run(directory.tier, directory.tier, programTierLine(directory), sourceId);
}

export function writeProjectDirectoryTier(db: Database.Database, projectId: string, program: ProgramSignalType) {
  const directory = PROGRAM_DIRECTORY[program];
  db.prepare(`UPDATE projects SET signal_tier=?, signal_tier_basis=? WHERE id=?`).run(directory.tier, programTierLine(directory), projectId);
}

export function writePersonDirectoryTier(db: Database.Database, personId: string, program: ProgramSignalType, label: string) {
  const directory = membershipDirectory(program, label);
  const line = programTierLine(directory);
  const current = db.prepare(`SELECT signal_tier, signal_tier_basis FROM people WHERE id=?`).get(personId) as
    | { signal_tier: string | null; signal_tier_basis: string | null }
    | undefined;
  if (!current) return;
  const basis = current.signal_tier_basis ?? "";
  if (basis.includes(directory.sourceUrl)) {
    // Fellowship and residency share one South Park Commons URL. A weaker
    // membership must not replace a stronger tier written for the other.
    const sharedUrl = directory.sourceUrl === "https://www.southparkcommons.com/";
    const weakerThanStored = preferSignalTier(current.signal_tier, directory.tier) !== directory.tier;
    const thisLine = basis === line || basis.startsWith(directory.rationale);
    if (sharedUrl && weakerThanStored && !thisLine) return;
    if (current.signal_tier === directory.tier && basis === line) return;
    db.prepare(`UPDATE people SET signal_tier=?, signal_tier_basis=? WHERE id=?`).run(directory.tier, line, personId);
    return;
  }
  if (preferSignalTier(current.signal_tier, directory.tier) !== directory.tier) return;
  if (current.signal_tier === directory.tier) return;
  db.prepare(`UPDATE people SET signal_tier=?, signal_tier_basis=? WHERE id=?`).run(directory.tier, line, personId);
}

export function membershipTierFields(program: ProgramSignalType, label: string) {
  const directory = membershipDirectory(program, label);
  return { tier: directory.tier, rationale: directory.rationale, sourceUrl: directory.sourceUrl };
}
