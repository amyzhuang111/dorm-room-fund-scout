// Reconciles ingested candidate projects against rows already stored in
// portfolio_memberships. This is what makes the portfolio-relationship gate's claim
// ("Matched to an existing portfolio entry by name, alias, or domain")
// actually true — without this step, portfolio_memberships.match_status
// never leaves 'unmatched' and evaluatePortfolioRelationshipGate() can never
// fire, so a re-pitched portfolio company would silently look like a fresh
// target. Exact normalized-name match only (project name or an alias) — no
// fuzzy/substring matching, since a false "confirmed" match would wrongly
// exclude an unrelated company from Startup Scout, and a guessed match is
// exactly what §7 elsewhere in this codebase forbids.
//
// Safe to re-run: only ever moves an 'unmatched' row to 'confirmed', never
// touches a row a person has already reviewed (confirmed/ambiguous/unrelated).
// Run: npx tsx scripts/screen/match-portfolio.ts

import { getDb } from "../../lib/db/client";

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function main() {
  const db = getDb();

  const projects = db.prepare(`SELECT id, name, aliases_json FROM projects`).all() as {
    id: string;
    name: string;
    aliases_json: string;
  }[];

  // Map every normalized name/alias to the set of project ids it could mean —
  // an ambiguous (name reused by 2+ projects) key is never auto-matched.
  const byNormalizedName = new Map<string, Set<string>>();
  for (const p of projects) {
    const names = [p.name, ...(JSON.parse(p.aliases_json || "[]") as string[])];
    for (const n of names) {
      const key = normalize(n);
      if (!key) continue;
      if (!byNormalizedName.has(key)) byNormalizedName.set(key, new Set());
      byNormalizedName.get(key)!.add(p.id);
    }
  }

  const unmatched = db.prepare(`SELECT id, matched_name FROM portfolio_memberships WHERE match_status = 'unmatched'`).all() as {
    id: string;
    matched_name: string;
  }[];

  const confirm = db.prepare(`UPDATE portfolio_memberships SET project_id = ?, match_status = 'confirmed' WHERE id = ?`);
  const markAmbiguous = db.prepare(`UPDATE portfolio_memberships SET match_status = 'ambiguous' WHERE id = ?`);

  let confirmed = 0;
  let ambiguous = 0;

  for (const row of unmatched) {
    const candidates = byNormalizedName.get(normalize(row.matched_name));
    if (!candidates || candidates.size === 0) continue; // no match — stays 'unmatched', never guessed
    if (candidates.size > 1) {
      markAmbiguous.run(row.id);
      ambiguous++;
      continue;
    }
    const [projectId] = candidates;
    confirm.run(projectId, row.id);
    confirmed++;
  }

  console.log(`Portfolio match: ${confirmed} confirmed, ${ambiguous} ambiguous (name shared by 2+ projects, needs manual review), ${unmatched.length - confirmed - ambiguous} still unmatched.`);
}

main();
