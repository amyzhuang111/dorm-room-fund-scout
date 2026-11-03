/**
 * Every VIP-X member must have claim evidence that explicitly mentions VIP/VIP-X
 * (a generic venturelab.upenn.edu/VIP-X URL alone is not enough). Bare
 * "VIP-X Philadelphia" tags on Startup Challenge URLs do not count.
 *
 * Usage: node scripts/check-vipx-evidence.mjs
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const pageFile = path.join(root, "public", "data", "founder-networks-page.json");
const graphFile = path.join(root, "public", "data", "founder-networks-graph.json");
const dbFile = process.env.CAMPUS_UNIVERSE_DB || path.join(root, "data", "campus-universe.db");

if (!fs.existsSync(pageFile)) {
  console.error("FAIL missing", pageFile);
  process.exit(1);
}

const page = JSON.parse(fs.readFileSync(pageFile, "utf8"));
const members = page.membersByNetwork?.vipx || [];
const db = new Database(dbFile, { readonly: true });

const VIP_TEXT = /vip-?x|venture lab vip|vip[\s-]?alumni|vip[\s-]?peer/i;
const SC_URL = /startup-challenge|SC-PR|cloak-wins|semifinalist|\/\d{4}-startup-challenge/i;
const MEMBER_TYPES = [
  "program_membership",
  "accelerator_membership",
  "accelerator_founder",
  "lab_spinout",
  "lab_spinout_founder",
  "program_listing",
  "funding",
  "bio_membership",
  "product",
];

function bareVipOnSc(excerpt, url) {
  if (!SC_URL.test(url || "")) return false;
  const bare = String(excerpt || "")
    .replace(/<[^>]+>/g, "")
    .trim();
  return /^(VIP-X(?:\s+Philadelphia|\s+PHL|\s+San Francisco|\s+SF)?)$/i.test(bare);
}

function acceptable(row) {
  const text = `${row.excerpt || ""} ${row.value_json || ""}`;
  if (!VIP_TEXT.test(text)) return false;
  if (bareVipOnSc(row.excerpt, row.source_url)) return false;
  // Also reject when the ONLY vip mention is a bare label inside value_json.excerpt
  try {
    const parsed = JSON.parse(row.value_json || "{}");
    if (parsed && typeof parsed.excerpt === "string" && bareVipOnSc(parsed.excerpt, row.source_url) && !VIP_TEXT.test(row.excerpt || "")) {
      return false;
    }
  } catch {
    /* ignore */
  }
  return true;
}

const byCompany = new Map();
for (const m of members) {
  const cur = byCompany.get(m.companyId) || { name: m.companyName, founderIds: new Set() };
  cur.founderIds.add(m.founderId);
  byCompany.set(m.companyId, cur);
}

const failing = [];
for (const [companyId, info] of byCompany) {
  const ids = [companyId, ...info.founderIds];
  const placeholders = ids.map(() => "?").join(",");
  const typePh = MEMBER_TYPES.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT entity_id, excerpt, value_json, source_url FROM claims
       WHERE entity_id IN (${placeholders})
         AND claim_type IN (${typePh})`
    )
    .all(...ids, ...MEMBER_TYPES);
  const ok = rows.some(acceptable);
  if (!ok) {
    failing.push({
      companyId,
      name: info.name,
      sample: rows
        .filter((r) => VIP_TEXT.test(`${r.excerpt || ""} ${r.value_json || ""}`) || /vip-?x|vip-alumni/i.test(r.source_url || ""))
        .slice(0, 3)
        .map((r) => ({ url: r.source_url, excerpt: String(r.excerpt || "").slice(0, 120) })),
    });
  }
}

// Graph: no Storiara VIP edge
let storiaraVip = 0;
if (fs.existsSync(graphFile)) {
  const graph = JSON.parse(fs.readFileSync(graphFile, "utf8"));
  for (const e of graph.edges || []) {
    const blob = `${e.source}|${e.target}`;
    if (blob.includes("net:vipx") && blob.includes("proj_wfmDtDLJpZMS")) storiaraVip += 1;
  }
}

const vipSummary = (page.topNetworks || []).find((n) => n.id === "vipx");
console.log("vipxMembers", members.length);
console.log("vipxCompanies", byCompany.size);
console.log("vipxFounders", vipSummary?.founderCount ?? null);
console.log("storiaraVipEdges", storiaraVip);
console.log("failingCompanies", failing.length);
for (const f of failing) console.log("FAIL", f.name, JSON.stringify(f.sample));

if (storiaraVip > 0) {
  console.error("FAIL Storiara still has VIP-X graph edge(s)");
  process.exit(1);
}
if (members.some((m) => /storiara/i.test(m.companyName))) {
  console.error("FAIL Storiara still in membersByNetwork.vipx");
  process.exit(1);
}
if (failing.length > 0) {
  console.error("FAIL", failing.length, "VIP-X companies lack explicit VIP/VIP-X evidence text");
  process.exit(1);
}
console.log("OK every VIP-X member has explicit VIP/VIP-X evidence (not URL-only / bare SC tag)");
