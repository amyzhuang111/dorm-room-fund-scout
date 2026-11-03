/**
 * Assert no duplicate investable normalized names / domains, and no exact duplicate signals.
 *   npx tsx scripts/check-corpus-dedupe.ts
 */
import fs from "node:fs";
import path from "node:path";
import { getDb } from "../lib/db/client";
import { normalizeCompanyName, websiteIdentity } from "../lib/domain/dedupe";

const db = getDb();
const rows = db
  .prepare(
    `SELECT id, name, website_url, primary_link FROM projects WHERE kind = 'company' AND is_investable_candidate = 1`,
  )
  .all() as { id: string; name: string; website_url: string | null; primary_link: string | null }[];

const byName = new Map<string, typeof rows>();
const byDomain = new Map<string, typeof rows>();
for (const r of rows) {
  const n = normalizeCompanyName(r.name);
  if (n) {
    const list = byName.get(n) ?? [];
    list.push(r);
    byName.set(n, list);
  }
  const w = websiteIdentity(r.website_url) || websiteIdentity(r.primary_link);
  const SHARED_PORTAL_HOST =
    /ycombinator\.com|skydeck\.berkeley|dormroomfund\.com|linkedin\.com|github\.com|freeventures\.org|desaiaccelerator\.com|luma\.com|pulse2\.com|hypepotamus\.com|medium\.com|twitter\.com|x\.com|crunchbase\.com|producthunt\.com|devpost\.com|angel\.co|wellfound\.com|techcrunch\.com|substack\.com|notion\.so|google\.com|youtube\.com|facebook\.com|instagram\.com|tiktok\.com|berkeley\.edu|mit\.edu|stanford\.edu|upenn\.edu|harvard\.edu|columbia\.edu|cmu\.edu|gatech\.edu|uwaterloo\.ca|cornell\.edu|eventbrite\.com|linktr\.ee|bit\.ly|t\.co|uclaunch\.com|businesswire\.com|browndailyherald\.com|neo\.com|emorybusiness\.com|mccloskey\.team|geekwire\.com|entrepreneurs\.utoronto\.ca|queensjournal\.ca|laurentian\.ca|enterprise\.cam\.ac\.uk|prnewswire\.com|globenewswire\.com|newswire\.com|einpresswire\.com|forbes\.com|bloomberg\.com|wsj\.com|nytimes\.com|theguardian\.com|wired\.com|venturebeat\.com|axios\.com|msn\.com|yahoo\.com|reddit\.com|wikipedia\.org|apps\.apple\.com|play\.google\.com/;
  if (w && !SHARED_PORTAL_HOST.test(w)) {
    const list = byDomain.get(w) ?? [];
    list.push(r);
    byDomain.set(w, list);
  }
}

// A shared name is not necessarily a shared company. See the source review in
// reviews/company-name-collision-agora.md. Match the exact records, sources and
// founder sets; any new record or changed identity still fails this audit.
const reviewedAgora = [
  { id: "proj_jRCyQwIq8J1u", source: "https://entrepreneur.nyu.edu/blog/2026/06/03/meet-the-2026-nyu-summer-launchpad-cohort/", founders: ["Christian Herren", "David Cui", "Tomer Ben Yaakov"] },
  { id: "proj_yTsIek7JT4YO", source: "https://www.thedp.com/article/2024/11/penn-startup-apps-trading-items", founders: ["Meha Gaba", "Yochi Hobson"] },
];
function isReviewedNameCollision(name: string, group: typeof rows): boolean {
  if (name !== normalizeCompanyName("Agora") || group.length !== reviewedAgora.length) return false;
  return reviewedAgora.every(review => {
    const row = group.find(r => r.id === review.id);
    if (!row || row.primary_link !== review.source) return false;
    const founders = db.prepare(`SELECT DISTINCT p.name FROM person_project_roles r JOIN people p ON p.id = r.person_id WHERE r.project_id = ?`).all(review.id) as { name: string }[];
    return JSON.stringify(founders.map(f => f.name).sort()) === JSON.stringify([...review.founders].sort());
  });
}
const nameCollisions = [...byName.entries()].filter(([, g]) => g.length > 1);
const reviewedNameCollisions = nameCollisions.filter(([name, group]) => isReviewedNameCollision(name, group));
const nameDups = nameCollisions.filter(([name, group]) => !isReviewedNameCollision(name, group));
const domainDups = [...byDomain.entries()].filter(([, g]) => g.length > 1);
const signalDups = db
  .prepare(
    `SELECT project_id, signal_type, IFNULL(source_date, '') AS sd, current_observation AS obs, COUNT(*) AS c
     FROM signals GROUP BY 1, 2, 3, 4 HAVING c > 1`,
  )
  .all() as { project_id: string; signal_type: string; sd: string; obs: string; c: number }[];

const snapPath = path.join(process.cwd(), "data", "corpus-snapshot.json");
let snap: { investableCompanies: number; signals: number; peak?: unknown } | null = null;
if (fs.existsSync(snapPath)) {
  snap = JSON.parse(fs.readFileSync(snapPath, "utf8"));
  const sigCount = (db.prepare(`SELECT COUNT(*) AS c FROM signals`).get() as { c: number }).c;
  if (snap!.investableCompanies !== rows.length || snap!.signals !== sigCount) {
    console.error(
      `snapshot mismatch: investable ${snap!.investableCompanies} vs ${rows.length}; signals ${snap!.signals} vs ${sigCount}`,
    );
    process.exit(1);
  }
}

let failed = false;
if (nameDups.length) {
  failed = true;
  console.error(`FAIL: ${nameDups.length} duplicate normalized investable names`);
  for (const [n, g] of nameDups.slice(0, 25)) console.error(`  ${n}: ${g.map((x) => x.id).join(", ")}`);
}
if (domainDups.length) {
  failed = true;
  console.error(`FAIL: ${domainDups.length} duplicate investable domains`);
  for (const [d, g] of domainDups.slice(0, 25)) console.error(`  ${d}: ${g.map((x) => x.id).join(", ")}`);
}
if (signalDups.length) {
  failed = true;
  console.error(`FAIL: ${signalDups.length} exact duplicate signal groups`);
  for (const s of signalDups.slice(0, 25)) console.error(`  ${s.project_id} ${s.signal_type} ${s.sd} x${s.c}`);
}
if (failed) process.exit(1);
console.log(
  JSON.stringify(
    { ok: true, investable: rows.length, nameGroups: byName.size, reviewedNameCollisions: reviewedNameCollisions.map(([name, group]) => ({ name, ids: group.map(r => r.id) })), domainGroups: byDomain.size, snapshot: snap },
    null,
    2,
  ),
);
