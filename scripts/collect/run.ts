// Config-driven source collector runner.
//
//   npx tsx scripts/collect/run.ts                 run every `approved` entry
//   npx tsx scripts/collect/run.ts --only pennapps_devpost,treehacks_devpost
//   npx tsx scripts/collect/run.ts --dry-run       print the plan, touch nothing
//   npx tsx scripts/collect/run.ts --max-entries 3 bounded run (used by CI)
//
// Entries live in data/collectors/registry.json. Only `status: "approved"`
// entries run; `candidate` entries (from discovery) never do until a human
// flips them. After the run an audit enforces the verification rule: every
// affiliation created by this run must be 'unverified'. A violation fails the
// process so the scheduled workflow does not open a PR with unverified-as-
// verified data.
import fs from "node:fs";
import path from "node:path";
import { getDb } from "../../lib/db/client";
import { ingestDevpostHackathon, type DevpostHackathonConfig } from "../../lib/ingest/devpost-hackathon";

type Entry = {
  id: string;
  collector: "devpost";
  status: "approved" | "candidate" | "rejected" | "paused";
  sourceId: string;
  sourceName: string;
  galleryUrl: string;
  universityId: string;
  eventLabel: string;
  roleLabel: string;
  options?: Partial<DevpostHackathonConfig>;
};

const REGISTRY = path.join(process.cwd(), "data", "collectors", "registry.json");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const registry = JSON.parse(fs.readFileSync(REGISTRY, "utf8")) as { entries: Entry[] };
  const only = arg("only")?.split(",").map((s) => s.trim()).filter(Boolean);
  const maxEntries = Number(arg("max-entries") ?? Infinity);
  let todo = registry.entries.filter((e) => e.status === "approved" && (!only || only.includes(e.id)));
  const unknown = (only ?? []).filter((id) => !registry.entries.some((e) => e.id === id));
  if (unknown.length) throw new Error(`Unknown entry id(s): ${unknown.join(", ")}`);
  // Fair rotation for bounded runs: least-recently-attempted source first
  // (never-run sources lead). The collectors resume their own gallery page, so
  // repeated scheduled runs keep making forward progress.
  if (Number.isFinite(maxEntries)) {
    const attempts = new Map(
      (getDb().prepare(`SELECT id, last_attempt_at AS t FROM sources`).all() as { id: string; t: string | null }[]).map((r) => [r.id, r.t ?? ""]),
    );
    todo = [...todo].sort((a, b) => (attempts.get(a.sourceId) ?? "").localeCompare(attempts.get(b.sourceId) ?? ""));
  }
  todo = todo.slice(0, maxEntries);

  console.log(`${todo.length} collector(s) selected of ${registry.entries.length} in registry`);
  for (const e of todo) console.log(`  - ${e.id} [${e.collector}] ${e.galleryUrl} -> ${e.universityId}`);
  if (flag("dry-run")) return;

  const db = getDb();
  const baseline = (db.prepare(`SELECT datetime('now') AS t`).get() as { t: string }).t;
  const before = counts(db);

  let failed = 0;
  for (const e of todo) {
    console.log(`\n======== ${e.sourceName} ========`);
    try {
      if (e.collector === "devpost") {
        await ingestDevpostHackathon({
          sourceId: e.sourceId,
          sourceName: e.sourceName,
          galleryUrl: e.galleryUrl,
          universityId: e.universityId,
          eventLabel: e.eventLabel,
          roleLabel: e.roleLabel,
          ...(e.options ?? {}),
        });
      }
    } catch (err) {
      failed += 1;
      console.error(`FAILED ${e.id}:`, err instanceof Error ? err.message : err);
    }
  }

  const after = counts(db);
  console.log("\n---- run summary ----");
  for (const k of Object.keys(after) as (keyof typeof after)[]) console.log(`${k}: +${after[k] - before[k]} (now ${after[k]})`);

  // Verification audit: nothing this run created may claim more than 'unverified'.
  const bad = db
    .prepare(`SELECT COUNT(*) AS n FROM affiliations WHERE created_at >= ? AND status != 'unverified'`)
    .get(baseline) as { n: number };
  console.log(`audit: new affiliations not 'unverified' = ${bad.n}`);
  if (bad.n > 0) {
    console.error("AUDIT FAILED: a collector wrote an affiliation status above 'unverified'.");
    process.exit(2);
  }
  if (failed > 0) process.exit(1);
}

function counts(db: ReturnType<typeof getDb>) {
  const n = (t: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
  return { people: n("people"), projects: n("projects"), affiliations: n("affiliations"), claims: n("claims") };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
