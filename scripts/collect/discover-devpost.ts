// Source discovery for universities with no people on file.
//
//   npx tsx scripts/collect/discover-devpost.ts [--limit N] [--all]
//
// For each university with zero affiliated people (or every university with
// --all), search Devpost's public hackathon listing for ended events hosted by
// or named after that school, confirm the project gallery actually has
// projects, and write proposals to data/collectors/candidates.json.
//
// This NEVER ingests anything and NEVER edits registry.json: candidates are
// reviewed by a human and copied into the registry with status "approved".
import fs from "node:fs";
import path from "node:path";
import { getDb } from "../../lib/db/client";

const UA = "campus-universe-research-bot/0.1 (manual, bounded)";
const OUT = path.join(process.cwd(), "data", "collectors", "candidates.json");
const MIN_REGISTRATIONS = 100;
const PER_UNI = 3;
const DELAY_MS = 500;

type Hack = {
  id: number;
  title: string;
  url: string;
  open_state: string;
  organization_name: string | null;
  registrations_count: number;
  submission_period_dates: string;
  submission_gallery_url: string;
  displayed_location?: { location?: string };
  winners_announced?: boolean;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

function keywords(name: string, aliases: string[]): { exact: string[]; loose: string[] } {
  const base = name.replace(/^(the )?university of /i, "").replace(/ university$/i, "").replace(/ institute of technology$/i, "").trim();
  const all = [name, ...aliases, base].map((s) => s.trim()).filter(Boolean);
  // Short aliases (OSU, UMN, A&M) are ambiguous in free text; they may only match organization_name exactly.
  return { exact: all, loose: all.filter((s) => s.length >= 5) };
}

type Why = "organizer" | "venue" | "title";
const WHY_RANK: Record<Why, number> = { organizer: 0, venue: 1, title: 2 };
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');

function matches(h: Hack, kw: { exact: string[]; loose: string[] }): Why | null {
  const org = decode(h.organization_name ?? "").toLowerCase();
  const loc = decode(h.displayed_location?.location ?? "").toLowerCase();
  const title = decode(h.title);
  if (org && kw.exact.some((k) => org === k.toLowerCase() || org === `the ${k.toLowerCase()}`)) return "organizer";
  if (org && kw.loose.some((k) => org.includes(k.toLowerCase()))) return "organizer";
  if (loc && kw.loose.some((k) => loc.includes(k.toLowerCase()))) return "venue";
  if (kw.loose.some((k) => new RegExp(`\\b${esc(k)}\\b`, "i").test(title))) return "title";
  return null;
}

async function galleryHasProjects(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (!res.ok) return false;
    return (await res.text()).includes("gallery-item");
  } catch {
    return false;
  }
}

async function main() {
  const limit = Number(process.argv[process.argv.indexOf("--limit") + 1]) || Infinity;
  const all = process.argv.includes("--all");
  const idsArg = process.argv.indexOf("--ids");
  const ids = idsArg >= 0 ? process.argv[idsArg + 1].split(",").map((s) => s.trim()).filter(Boolean) : null;
  const db = getDb();
  const where = ids
    ? `WHERE id IN (${ids.map(() => "?").join(",")})`
    : all
      ? ""
      : "WHERE id NOT IN (SELECT university_id FROM affiliations WHERE university_id IS NOT NULL)";
  const unis = db
    .prepare(`SELECT id, name, aliases_json AS aliases FROM universities ${where} ORDER BY name`)
    .all(...(ids ?? [])) as { id: string; name: string; aliases: string | null }[];

  const registry = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "collectors", "registry.json"), "utf8")) as { entries: { galleryUrl: string }[] };
  const known = new Set(registry.entries.map((e) => e.galleryUrl));

  const candidates: any[] = [];
  const noResult: string[] = [];
  for (const u of unis.slice(0, limit)) {
    const aliases: string[] = u.aliases ? JSON.parse(u.aliases) : [];
    const kw = keywords(u.name, aliases);
    const found = new Map<number, { h: Hack; why: Why }>();
    for (const term of [...new Set([u.name, ...aliases.filter((a) => a.length >= 4)])].slice(0, 4)) {
      try {
        const d = await getJson(`https://devpost.com/api/hackathons?search=${encodeURIComponent(term)}&status[]=ended&order_by=recently-added`);
        for (const h of (d.hackathons ?? []) as Hack[]) {
          const why = matches(h, kw);
          if (why && h.registrations_count >= MIN_REGISTRATIONS && !known.has(h.submission_gallery_url)) found.set(h.id, { h, why });
        }
      } catch (e) {
        console.error(`search failed for "${term}":`, e instanceof Error ? e.message : e);
      }
      await sleep(DELAY_MS);
    }
    const ranked = [...found.values()].sort((a, b) => WHY_RANK[a.why] - WHY_RANK[b.why] || b.h.registrations_count - a.h.registrations_count).slice(0, PER_UNI);
    let kept = 0;
    for (const { h, why } of ranked) {
      if (!(await galleryHasProjects(h.submission_gallery_url))) { await sleep(DELAY_MS); continue; }
      kept += 1;
      candidates.push({
        id: slug(`${u.id}_${h.url.replace(/^https?:\/\//, "").split(".")[0]}`),
        collector: "devpost",
        status: "candidate",
        sourceId: `src_${slug(h.url.replace(/^https?:\/\//, "").split(".")[0])}_devpost`,
        sourceName: `${h.title} (Devpost gallery)`,
        galleryUrl: h.submission_gallery_url,
        universityId: u.id,
        eventLabel: h.title,
        roleLabel: `${h.title} team member`,
        options: { winnersOnly: !!h.winners_announced, captureLinkedIn: false, maxProjectFetches: 24, maxFetches: 90 },
        notes: `Discovered via Devpost search (${why} match); ${h.registrations_count} registrations; ${h.submission_period_dates}; organizer: ${h.organization_name ?? "n/a"}. NEEDS HUMAN REVIEW: confirm the event is genuinely tied to ${u.name}.`,
      });
      await sleep(DELAY_MS);
    }
    if (!kept) noResult.push(u.id);
    console.log(`${u.name}: ${kept} candidate(s)`);
  }
  fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), searched: Math.min(unis.length, limit), withCandidates: new Set(candidates.map((c) => c.universityId)).size, noCandidate: noResult, entries: candidates }, null, 2) + "\n");
  console.log(`\n${candidates.length} candidate(s) for ${new Set(candidates.map((c) => c.universityId)).size} universities -> ${path.relative(process.cwd(), OUT)}`);
  console.log(`${noResult.length} universities had no usable Devpost candidate (need other source types).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
