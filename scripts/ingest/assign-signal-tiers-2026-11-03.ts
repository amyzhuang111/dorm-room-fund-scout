/**
 * Assign every person and investable company a signal_tier from evidence.
 * Real program / YC / top-VC / existing basis wins. Otherwise Unranked.
 *
 *   npx tsx scripts/ingest/assign-signal-tiers-2026-11-03.ts
 */
import fs from "node:fs";
import { getDb, nowIso } from "../../lib/db/client";
import { NATIONAL_PROGRAMS, investorFactIsTopVc } from "../../lib/domain/national-programs";
import { preferSignalTier, type SignalTier } from "../../lib/domain/signal-tier";
import { PROGRAM_DIRECTORY, membershipDirectory, programTierLine } from "../../lib/domain/program-signals";

const REPORT = "/tmp/backfill-2026-11-03/assign-signal-tiers-report.json";

type Cand = { tier: SignalTier | "Unranked"; basis: string };

function matchNational(text: string): { tier: SignalTier; basis: string } | null {
  const lower = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  let best: { tier: SignalTier; basis: string; len: number } | null = null;
  for (const prog of NATIONAL_PROGRAMS) {
    for (const alias of prog.aliases) {
      const a = alias.toLowerCase();
      if (!a || a.length < 2) continue;
      const re = new RegExp(`(?:^|\\s)${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`);
      if (!re.test(` ${lower} `) && !lower.includes(a)) continue;
      const tier = prog.tier as SignalTier;
      if (!best || a.length > best.len || (a.length === best.len && preferSignalTier(best.tier, tier) === tier && best.tier !== tier)) {
        best = { tier, basis: `${prog.label}. Matched “${alias}”.`, len: a.length };
      }
    }
  }
  return best ? { tier: best.tier, basis: best.basis } : null;
}

function stronger(a: Cand | null, b: Cand): Cand {
  if (!a) return b;
  if (a.tier === "Unranked") return b.tier === "Unranked" ? a : b;
  if (b.tier === "Unranked") return a;
  const pick = preferSignalTier(a.tier, b.tier);
  if (pick === b.tier && b.tier !== a.tier) return b;
  return a;
}

function main() {
  const db = getDb();
  const retrievedAt = nowIso();

  // program_signals on people
  const programSignalByPerson = new Map<string, Cand>();
  try {
    for (const row of db
      .prepare(
        `SELECT person_id, signal_type, label, tier, tier_rationale, tier_source_url, source_url
         FROM program_signals`
      )
      .all() as {
      person_id: string;
      signal_type: string;
      label: string;
      tier: string | null;
      tier_rationale: string | null;
      tier_source_url: string | null;
      source_url: string | null;
    }[]) {
      let cand: Cand | null = null;
      if (row.signal_type && row.signal_type in PROGRAM_DIRECTORY) {
        const directory = membershipDirectory(row.signal_type as keyof typeof PROGRAM_DIRECTORY, row.label || "");
        cand = { tier: directory.tier, basis: programTierLine(directory) };
      } else if (row.tier && ["S+", "S", "A", "B", "C", "D", "talent"].includes(row.tier)) {
        cand = {
          tier: row.tier as SignalTier,
          basis: row.tier_rationale || row.label || row.signal_type,
        };
        if (row.tier_source_url || row.source_url) {
          cand.basis = `${cand.basis} Source: ${row.tier_source_url || row.source_url}`;
        }
      }
      if (!cand) continue;
      programSignalByPerson.set(row.person_id, stronger(programSignalByPerson.get(row.person_id) ?? null, cand));
    }
  } catch (err) {
    console.warn("program_signals read skipped", err);
  }

  // Investor facts → project candidates
  const projectCand = new Map<string, Cand>();
  for (const row of db
    .prepare(`SELECT project_id, value_text, source_url, excerpt FROM company_facts WHERE fact_key='investor'`)
    .all() as { project_id: string; value_text: string; source_url: string; excerpt: string }[]) {
    const text = `${row.value_text} ${row.excerpt || ""}`;
    const nat = matchNational(text);
    if (nat) {
      projectCand.set(
        row.project_id,
        stronger(projectCand.get(row.project_id) ?? null, {
          tier: nat.tier,
          basis: `${nat.basis} Source: ${row.source_url}`,
        })
      );
      continue;
    }
    if (investorFactIsTopVc(row.value_text)) {
      projectCand.set(
        row.project_id,
        stronger(projectCand.get(row.project_id) ?? null, {
          tier: "A",
          basis: `Backed by top VC (${row.value_text}). Source: ${row.source_url}`,
        })
      );
    }
  }

  // Existing non-null tiers: keep if stronger / same with basis
  const people = db
    .prepare(`SELECT id, name, signal_tier, signal_tier_basis FROM people`)
    .all() as { id: string; name: string; signal_tier: string | null; signal_tier_basis: string | null }[];

  // Founders linked to investable companies (for person←project inheritance)
  const projectsByPerson = new Map<string, string[]>();
  for (const row of db
    .prepare(
      `SELECT ppr.person_id as person_id, ppr.project_id as project_id
       FROM person_project_roles ppr
       JOIN projects p ON p.id = ppr.project_id
       WHERE p.kind='company' AND p.is_investable_candidate=1`
    )
    .all() as { person_id: string; project_id: string }[]) {
    const list = projectsByPerson.get(row.person_id) ?? [];
    list.push(row.project_id);
    projectsByPerson.set(row.person_id, list);
  }

  const investable = db
    .prepare(`SELECT id, name, signal_tier, signal_tier_basis FROM projects WHERE kind='company' AND is_investable_candidate=1`)
    .all() as { id: string; name: string; signal_tier: string | null; signal_tier_basis: string | null }[];

  // Seed projectCand from existing project tiers and basis text
  for (const p of investable) {
    if (p.signal_tier && ["S+", "S", "A", "B", "C", "D", "talent"].includes(p.signal_tier) && p.signal_tier_basis) {
      projectCand.set(
        p.id,
        stronger(projectCand.get(p.id) ?? null, {
          tier: p.signal_tier as SignalTier,
          basis: p.signal_tier_basis,
        })
      );
    } else if (p.signal_tier_basis) {
      const nat = matchNational(p.signal_tier_basis);
      if (nat) {
        projectCand.set(
          p.id,
          stronger(projectCand.get(p.id) ?? null, { tier: nat.tier, basis: p.signal_tier_basis })
        );
      }
    }
  }

  // MIT delta v / WUEC / campus incubators from basis-like description? Skip inventing C without evidence.
  // Use existing basis patterns only.

  const updatePerson = db.prepare(`UPDATE people SET signal_tier=?, signal_tier_basis=? WHERE id=?`);
  const updateProject = db.prepare(`UPDATE projects SET signal_tier=?, signal_tier_basis=? WHERE id=?`);

  const personCounts: Record<string, number> = {};
  const projectCounts: Record<string, number> = {};
  const samples: Record<string, { name: string; basis: string }[]> = {};

  const write = db.transaction(() => {
    for (const person of people) {
      let cand: Cand | null = null;
      if (person.signal_tier && ["S+", "S", "A", "B", "C", "D", "talent"].includes(person.signal_tier) && person.signal_tier_basis) {
        cand = { tier: person.signal_tier as SignalTier, basis: person.signal_tier_basis };
      }
      const fromProgram = programSignalByPerson.get(person.id);
      if (fromProgram) cand = stronger(cand, fromProgram);
      if (person.signal_tier_basis) {
        const nat = matchNational(person.signal_tier_basis);
        if (nat) cand = stronger(cand, { tier: nat.tier, basis: person.signal_tier_basis });
      }
      for (const pid of projectsByPerson.get(person.id) || []) {
        const pc = projectCand.get(pid);
        if (!pc || pc.tier === "Unranked") continue;
        // Founder of YC/top program company inherits that project tier with explicit reason
        cand = stronger(cand, {
          tier: pc.tier as SignalTier,
          basis: `Linked company signal: ${pc.basis}`,
        });
      }
      const final: Cand = cand ?? {
        tier: "Unranked",
        basis: "No program, funding, or verified national-signal evidence on file.",
      };
      updatePerson.run(final.tier, final.basis.slice(0, 800), person.id);
      personCounts[final.tier] = (personCounts[final.tier] || 0) + 1;
      const bucket = samples[final.tier] || (samples[final.tier] = []);
      if (bucket.length < 12) bucket.push({ name: person.name, basis: final.basis.slice(0, 200) });
    }

    for (const project of investable) {
      let cand = projectCand.get(project.id) ?? null;
      if (
        project.signal_tier &&
        ["S+", "S", "A", "B", "C", "D", "talent"].includes(project.signal_tier) &&
        project.signal_tier_basis
      ) {
        cand = stronger(cand, { tier: project.signal_tier as SignalTier, basis: project.signal_tier_basis });
      }
      const final: Cand = cand ?? {
        tier: "Unranked",
        basis: "No program, funding, or verified national-signal evidence on file.",
      };
      updateProject.run(final.tier, final.basis.slice(0, 800), project.id);
      projectCounts[final.tier] = (projectCounts[final.tier] || 0) + 1;
      const key = `project:${final.tier}`;
      const bucket = samples[key] || (samples[key] = []);
      if (bucket.length < 12) bucket.push({ name: project.name, basis: final.basis.slice(0, 200) });
    }
  });
  write();
  db.pragma("wal_checkpoint(TRUNCATE)");

  const report = { retrievedAt, personCounts, projectCounts, samples };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ personCounts, projectCounts }, null, 2));
}

main();
