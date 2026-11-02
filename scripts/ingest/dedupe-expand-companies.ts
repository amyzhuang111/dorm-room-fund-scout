/**
 * Post-ingest company dedupe for expand imports.
 *
 * 1) planDedupe / applyDedupe
 * 2) Force-merge remaining investable exact-norm name groups (keep richest)
 * 3) Force-merge remaining same websiteIdentity groups (keep richest)
 * 4) Collapse exact duplicate signals
 * 5) Write reviews/campus-dedupe-list-<date>.md + data/corpus-snapshot.json
 *
 *   npx tsx scripts/ingest/dedupe-expand-companies.ts
 *   npx tsx scripts/ingest/dedupe-expand-companies.ts --dry-run
 */
import fs from "node:fs";
import path from "node:path";
import { getDb } from "../../lib/db/client";
import {
  applyDedupe,
  mergeRecordedPair,
  normalizeCompanyName,
  planDedupe,
  websiteIdentity,
} from "../../lib/domain/dedupe";
import { buildPeakShell } from "../../lib/domain/peak-shell";
import { buildDirectoryFromDb, clearDirectoryMemo } from "../../lib/domain/directory";

const SHARED_PORTAL_HOST =
  /ycombinator\.com|skydeck\.berkeley|dormroomfund\.com|linkedin\.com|github\.com|freeventures\.org|desaiaccelerator\.com|luma\.com|pulse2\.com|hypepotamus\.com|medium\.com|twitter\.com|x\.com|crunchbase\.com|producthunt\.com|devpost\.com|angel\.co|wellfound\.com|techcrunch\.com|substack\.com|notion\.so|google\.com|youtube\.com|facebook\.com|instagram\.com|tiktok\.com|berkeley\.edu|mit\.edu|stanford\.edu|upenn\.edu|harvard\.edu|columbia\.edu|cmu\.edu|gatech\.edu|uwaterloo\.ca|cornell\.edu|eventbrite\.com|linktr\.ee|bit\.ly|t\.co|uclaunch\.com|businesswire\.com|browndailyherald\.com|neo\.com|emorybusiness\.com|mccloskey\.team|geekwire\.com|entrepreneurs\.utoronto\.ca|queensjournal\.ca|laurentian\.ca|enterprise\.cam\.ac\.uk|prnewswire\.com|globenewswire\.com|newswire\.com|einpresswire\.com|forbes\.com|bloomberg\.com|wsj\.com|nytimes\.com|theguardian\.com|wired\.com|venturebeat\.com|axios\.com|msn\.com|yahoo\.com|reddit\.com|wikipedia\.org|apps\.apple\.com|play\.google\.com/;

function isSharedPortalHost(host: string | null | undefined): boolean {
  return !host || SHARED_PORTAL_HOST.test(host);
}

const dryRun = process.argv.includes("--dry-run");
const ROOT = process.cwd();
const stamp = new Date().toISOString().slice(0, 10);
const LIST_PATH = path.join("/workspace/reviews", `campus-dedupe-list-${stamp}.md`);
const SNAP_PATH = path.join(ROOT, "data", "corpus-snapshot.json");

type Card = {
  id: string;
  name: string;
  website_url: string | null;
  primary_link: string | null;
  created_at: string;
  description: string | null;
  sigs: number;
  founders: number;
  claims: number;
};

type MergeRow = {
  survivorId: string;
  survivorName: string;
  dropId: string;
  dropName: string;
  reason: string;
  phase: string;
};

function richness(c: Card): number {
  return (websiteIdentity(c.website_url) ? 4 : 0) + c.claims * 2 + c.founders * 2 + c.sigs + (c.description ? 1 : 0);
}

function loadCards(db: ReturnType<typeof getDb>): Card[] {
  return db
    .prepare(
      `SELECT id, name, website_url, primary_link, created_at, description,
        (SELECT COUNT(*) FROM signals s WHERE s.project_id = projects.id) AS sigs,
        (SELECT COUNT(*) FROM person_project_roles r WHERE r.project_id = projects.id) AS founders,
        (SELECT COUNT(*) FROM claims c WHERE c.entity_type = 'project' AND c.entity_id = projects.id) AS claims
       FROM projects WHERE kind = 'company' AND is_investable_candidate = 1`,
    )
    .all() as Card[];
}

function pickSurvivor(group: Card[]): Card {
  return [...group].sort((a, b) => richness(b) - richness(a) || a.created_at.localeCompare(b.created_at))[0]!;
}

function collapseExactSignals(db: ReturnType<typeof getDb>): { kept: string; dropped: string }[] {
  const dups = db
    .prepare(
      `SELECT project_id, signal_type, IFNULL(source_date, '') AS sd, current_observation AS obs,
              group_concat(id) AS ids, COUNT(*) AS c
       FROM signals
       GROUP BY 1, 2, 3, 4
       HAVING c > 1`,
    )
    .all() as { ids: string; c: number }[];
  const out: { kept: string; dropped: string }[] = [];
  const del = db.prepare(`DELETE FROM signals WHERE id = ?`);
  for (const row of dups) {
    const ids = row.ids.split(",").filter(Boolean);
    const keep = ids[0]!;
    for (const id of ids.slice(1)) {
      if (!dryRun) del.run(id);
      out.push({ kept: keep, dropped: id });
    }
  }
  return out;
}

function mergeGroup(db: ReturnType<typeof getDb>, group: Card[], phase: string, reason: string, merges: MergeRow[]) {
  if (group.length < 2) return;
  const survivor = pickSurvivor(group);
  for (const drop of group) {
    if (drop.id === survivor.id) continue;
    // Skip if already redirected / deleted mid-loop
    const still = db.prepare(`SELECT id FROM projects WHERE id = ?`).get(drop.id);
    const surv = db.prepare(`SELECT id FROM projects WHERE id = ?`).get(survivor.id);
    if (!still || !surv) continue;
    merges.push({
      survivorId: survivor.id,
      survivorName: survivor.name,
      dropId: drop.id,
      dropName: drop.name,
      reason,
      phase,
    });
    if (!dryRun) {
      mergeRecordedPair(db, "project", survivor.id, drop.id, `${phase}: ${reason}`);
    }
  }
}

function main() {
  const db = getDb();
  const beforeInvestable = (
    db.prepare(`SELECT COUNT(*) AS c FROM projects WHERE kind = 'company' AND is_investable_candidate = 1`).get() as {
      c: number;
    }
  ).c;
  const beforeSignals = (db.prepare(`SELECT COUNT(*) AS c FROM signals`).get() as { c: number }).c;

  const merges: MergeRow[] = [];

  const plan = planDedupe(db);
  for (const group of plan.startupMerges) {
    for (const drop of group.drop) {
      merges.push({
        survivorId: group.survivorId,
        survivorName: group.survivorName,
        dropId: drop.id,
        dropName: drop.name,
        reason: group.reason,
        phase: "planDedupe",
      });
    }
  }
  if (!dryRun) applyDedupe(db, plan);

  // Remaining exact-norm name groups
  let cards = loadCards(db);
  const byNorm = new Map<string, Card[]>();
  for (const c of cards) {
    const n = normalizeCompanyName(c.name);
    if (!n) continue;
    const list = byNorm.get(n) ?? [];
    list.push(c);
    byNorm.set(n, list);
  }
  for (const [norm, group] of byNorm) {
    if (group.length < 2) continue;
    mergeGroup(db, group, "norm-name", `exact normalized name "${norm}"; keep richest; union founders/signals/provenance`, merges);
  }

  // Remaining same-domain groups
  cards = loadCards(db);
  const byWeb = new Map<string, Card[]>();
  for (const c of cards) {
    const w = websiteIdentity(c.website_url) || websiteIdentity(c.primary_link);
    if (!w) continue;
    // Skip portal hosts that many companies share
    if (isSharedPortalHost(w)) continue;
    const list = byWeb.get(w) ?? [];
    list.push(c);
    byWeb.set(w, list);
  }
  for (const [web, group] of byWeb) {
    if (group.length < 2) continue;
    // Only merge same-domain rows when normalized names also collide (true twins),
    // or when every row lacks a distinct name split (identical display names).
    const byLocalNorm = new Map<string, Card[]>();
    for (const c of group) {
      const n = normalizeCompanyName(c.name) || c.id;
      const list = byLocalNorm.get(n) ?? [];
      list.push(c);
      byLocalNorm.set(n, list);
    }
    for (const [, sub] of byLocalNorm) {
      if (sub.length < 2) continue;
      mergeGroup(
        db,
        sub,
        "domain",
        `same website identity "${web}" + same normalized name; keep richest; union founders/signals/provenance`,
        merges,
      );
    }
  }

  const signalDrops = collapseExactSignals(db);

  if (!dryRun) {
    try {
      db.pragma("wal_checkpoint(TRUNCATE)");
    } catch {
      /* ignore */
    }
    clearDirectoryMemo();
  }

  const afterInvestable = (
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

  clearDirectoryMemo();
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
  const undatedSignals = afterSignals - datedSignals;
  const sharePct = shell && shell.dated > 0 ? Math.round((shell.peakCount / shell.dated) * 100) : 0;

  const snapshot = {
    generatedAt: new Date().toISOString(),
    dbPath: "data/campus-universe.db",
    investableCompanies: afterInvestable,
    signals: afterSignals,
    people: afterPeople,
    founders: afterFounders,
    campuses: afterCampuses,
    companiesWithSignal: withSignal,
    ycMembership: ycFacts,
    signalsDated: datedSignals,
    signalsUndated: undatedSignals,
    directoryCards: directory.cards.length,
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
    dedupe: {
      companyMerges: merges.length,
      signalDrops: signalDrops.length,
      beforeInvestable,
      beforeSignals,
      afterInvestable,
      afterSignals,
    },
  };

  const lines: string[] = [
    `# Campus company dedupe list — ${stamp}`,
    "",
    dryRun ? "_Dry run — no rows changed._" : "_Applied._",
    "",
    `Before investable **${beforeInvestable}** / signals **${beforeSignals}** → after **${afterInvestable}** / **${afterSignals}**.`,
    "",
    `Company merges: **${merges.length}**. Exact signal drops: **${signalDrops.length}**.`,
    "",
    "## Company merges",
    "",
    "| Phase | Survivor | Drop | Reason |",
    "|---|---|---|---|",
  ];
  for (const m of merges) {
    lines.push(
      `| ${m.phase} | ${m.survivorName} (\`${m.survivorId}\`) | ${m.dropName} (\`${m.dropId}\`) | ${m.reason.replace(/\|/g, "/")} |`,
    );
  }
  lines.push("", "## Exact signal drops", "");
  lines.push(`Dropped **${signalDrops.length}** duplicate signal rows (kept first id in each exact key).`);
  if (signalDrops.length && signalDrops.length <= 40) {
    for (const s of signalDrops) lines.push(`- kept \`${s.kept}\` dropped \`${s.dropped}\``);
  }
  lines.push("", "## Corpus snapshot", "", "```json", JSON.stringify(snapshot, null, 2), "```", "");

  fs.mkdirSync(path.dirname(LIST_PATH), { recursive: true });
  fs.writeFileSync(LIST_PATH, lines.join("\n"));
  if (!dryRun) {
    fs.mkdirSync(path.dirname(SNAP_PATH), { recursive: true });
    fs.writeFileSync(SNAP_PATH, JSON.stringify(snapshot, null, 2) + "\n");
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        listPath: LIST_PATH,
        snapshotPath: dryRun ? null : SNAP_PATH,
        merges: merges.length,
        signalDrops: signalDrops.length,
        beforeInvestable,
        beforeSignals,
        afterInvestable,
        afterSignals,
        peak: snapshot.peak,
      },
      null,
      2,
    ),
  );
}

main();
