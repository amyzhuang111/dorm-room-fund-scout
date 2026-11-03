/**
 * Every VIP-X member AND every company tied to net:vipx in the graph
 * (any edge type, including network_tie / vip-alumni) must have claim
 * evidence that explicitly mentions VIP/VIP-X. A generic
 * venturelab.upenn.edu/VIP-X URL alone is not enough. Bare
 * "VIP-X Philadelphia" tags on Startup Challenge URLs do not count.
 *
 * Also fails if Storiara appears in members or on any net:vipx edge
 * (Lucy-style leftovers: members cleaned but network_tie remains, or a
 * company kept on VIP-X only because a founder had VIP evidence for a
 * different venture). Company-level VIP/VIP-X claim text is required.
 *
 * Usage:
 *   node scripts/check-vipx-evidence.mjs
 *   PAGE=... GRAPH=... DB=... node scripts/check-vipx-evidence.mjs
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const pageFile =
  process.env.PAGE || path.join(root, "public", "data", "founder-networks-page.json");
const graphFile =
  process.env.GRAPH || path.join(root, "public", "data", "founder-networks-graph.json");
const dbFile =
  process.env.DB || process.env.CAMPUS_UNIVERSE_DB || path.join(root, "data", "campus-universe.db");

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

const STORIARA_ID = "proj_wfmDtDLJpZMS";

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
  try {
    const parsed = JSON.parse(row.value_json || "{}");
    if (
      parsed &&
      typeof parsed.excerpt === "string" &&
      bareVipOnSc(parsed.excerpt, row.source_url) &&
      !VIP_TEXT.test(row.excerpt || "")
    ) {
      return false;
    }
  } catch {
    /* ignore */
  }
  return true;
}

function companyIdFromNode(node) {
  if (!node || typeof node !== "string") return null;
  const m = node.match(/^co:(.+)$/);
  return m ? m[1] : null;
}

/** Companies on VIP-X via roster members. */
const byCompany = new Map();
for (const m of members) {
  const cur = byCompany.get(m.companyId) || {
    name: m.companyName,
    founderIds: new Set(),
    via: new Set(["member"]),
  };
  cur.founderIds.add(m.founderId);
  cur.via.add("member");
  if (m.companyName) cur.name = m.companyName;
  byCompany.set(m.companyId, cur);
}

/** Companies on VIP-X via ANY graph edge touching net:vipx (incl. network_tie). */
const vipxGraphEdges = [];
if (fs.existsSync(graphFile)) {
  const graph = JSON.parse(fs.readFileSync(graphFile, "utf8"));
  for (const e of graph.edges || []) {
    const a = String(e.source || "");
    const b = String(e.target || "");
    if (!a.includes("net:vipx") && !b.includes("net:vipx")) continue;
    vipxGraphEdges.push(e);
    const co =
      companyIdFromNode(a.includes("net:vipx") ? b : a) ||
      companyIdFromNode(a) ||
      companyIdFromNode(b);
    if (!co) continue;
    const cur = byCompany.get(co) || {
      name: co,
      founderIds: new Set(),
      via: new Set(),
    };
    cur.via.add(`edge:${e.type || "unknown"}`);
    byCompany.set(co, cur);
  }
  // Enrich names from graph nodes when missing
  for (const n of graph.nodes || []) {
    if (!n?.id?.startsWith("co:")) continue;
    const id = n.id.slice(3);
    const cur = byCompany.get(id);
    if (cur && (!cur.name || cur.name === id) && n.label) cur.name = n.label;
  }
}

const failing = [];
for (const [companyId, info] of byCompany) {
  // Company-level evidence only. Founder-only VIP claims (another venture) must
  // not keep this company on VIP-X via members or network_tie.
  const typePh = MEMBER_TYPES.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT entity_id, excerpt, value_json, source_url FROM claims
       WHERE entity_id = ?
         AND claim_type IN (${typePh})`
    )
    .all(companyId, ...MEMBER_TYPES);
  const ok = rows.some(acceptable);
  if (!ok) {
    failing.push({
      companyId,
      name: info.name,
      via: [...info.via],
      sample: rows
        .filter(
          (r) =>
            VIP_TEXT.test(`${r.excerpt || ""} ${r.value_json || ""}`) ||
            /vip-?x|vip-alumni/i.test(r.source_url || "")
        )
        .slice(0, 3)
        .map((r) => ({ url: r.source_url, excerpt: String(r.excerpt || "").slice(0, 120) })),
    });
  }
}

let storiaraVipEdges = 0;
let storiaraInMembers = members.some(
  (m) => m.companyId === STORIARA_ID || /storiara/i.test(m.companyName || "")
);
for (const e of vipxGraphEdges) {
  const blob = `${e.source}|${e.target}`;
  if (blob.includes(STORIARA_ID)) storiaraVipEdges += 1;
}

const vipSummary = (page.topNetworks || []).find((n) => n.id === "vipx");
const edgeOnly = [...byCompany.entries()].filter(([, info]) => !info.via.has("member"));

console.log("vipxMembers", members.length);
console.log("vipxCompaniesChecked", byCompany.size);
console.log("vipxEdgeOnlyCompanies", edgeOnly.length);
console.log("vipxFounders", vipSummary?.founderCount ?? null);
console.log("vipxCompanies", vipSummary?.companyCount ?? null);
console.log("vipxGraphEdges", vipxGraphEdges.length);
console.log("storiaraVipEdges", storiaraVipEdges);
console.log("storiaraInMembers", storiaraInMembers);
console.log("failingCompanies", failing.length);
for (const f of failing) console.log("FAIL", f.name, f.via.join("+"), JSON.stringify(f.sample));

let exit = 0;
if (storiaraVipEdges > 0) {
  console.error("FAIL Storiara still has VIP-X graph edge(s) (Lucy-style network_tie leftover)");
  exit = 1;
}
if (storiaraInMembers) {
  console.error("FAIL Storiara still in membersByNetwork.vipx");
  exit = 1;
}
if (byCompany.has(STORIARA_ID)) {
  console.error("FAIL Storiara still reachable via VIP-X members or network_tie");
  exit = 1;
}
if (failing.length > 0) {
  console.error(
    "FAIL",
    failing.length,
    "VIP-X companies (members and/or network_tie) lack explicit VIP/VIP-X evidence text"
  );
  exit = 1;
}
if (exit === 0) {
  console.log(
    "OK every VIP-X member and net:vipx edge company has explicit VIP/VIP-X evidence (not URL-only / bare SC tag)"
  );
}
process.exit(exit);
