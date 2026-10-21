// Public rosters for Penn and Berkeley hotspot organizations that had no
// linked people. A person is inserted only when a fetched page prints the
// name. The affiliation role names the organization so the network map can
// attach the person to that place.
//
// Run: npx tsx scripts/ingest/fetch-hotspot-members.ts

import * as cheerio from "cheerio";
import type Database from "better-sqlite3";
import { getDb, newId, nowIso } from "../../lib/db/client";
import { recomputePersonEnrollment } from "../../lib/domain/enrollment-store";
import {
  parseCenterCityFounders,
  parseFreeVenturesTeam,
  parseLaunchpadAbout,
  parseSkyDeckTeam,
  parseUcLaunchTeam,
  parseVipXHtml,
  type RosterMember,
} from "../../lib/domain/hotspot-members";

interface CampusMember {
  name: string;
  role: string;
  universityId: string;
  campusLabel: string;
  org: string;
  tier: string;
  sourceUrl: string;
  excerpt: string;
  linkedin: string | null;
}

const added: CampusMember[] = [];
const touched = new Set<string>();

function fetchText(url: string): Promise<string> {
  return fetch(url, {
    headers: { "user-agent": "campus-universe-research-bot/0.1 (manual, bounded)", accept: "text/html" },
    signal: AbortSignal.timeout(25000),
  }).then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
    return res.text();
  });
}

function ensureSource(db: Database.Database, id: string, name: string, url: string, campuses: string[], retrievedAt: string) {
  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at)
     VALUES (?, ?, 'campus_builder_org', ?, ?, 1, 'html_scrape', 'available', ?)
     ON CONFLICT(id) DO UPDATE SET last_attempt_at=excluded.last_attempt_at, status='available', url=excluded.url, name=excluded.name`
  ).run(id, name, url, JSON.stringify(campuses), retrievedAt);
}

function insertClaim(
  db: Database.Database,
  entityId: string,
  excerpt: string,
  sourceId: string,
  sourceUrl: string,
  value: unknown,
  retrievedAt: string
): string {
  const existing = db
    .prepare(`SELECT id FROM claims WHERE entity_id = ? AND source_url = ? AND claim_type = 'program_membership' LIMIT 1`)
    .get(entityId, sourceUrl) as { id: string } | undefined;
  if (existing) return existing.id;
  const id = newId("claim");
  db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, source_url, retrieved_at, label, verification_state)
     VALUES (?, 'person', ?, 'program_membership', ?, ?, ?, ?, ?, 'observed_fact', 'unverified')`
  ).run(id, entityId, JSON.stringify(value), excerpt.slice(0, 1400), sourceId, sourceUrl, retrievedAt);
  return id;
}

function findPerson(db: Database.Database, name: string, universityId: string, aliases: string[], org: string): string | null | "ambiguous" {
  for (const alias of aliases) {
    const row = db.prepare(`SELECT id FROM people WHERE aliases_json LIKE ? ESCAPE '\\'`).get(`%"${alias.replace(/[%_\\]/g, "\\$&")}"%`) as { id: string } | undefined;
    if (row) return row.id;
  }
  const matches = db.prepare(`SELECT id FROM people WHERE lower(name) = lower(?)`).all(name) as { id: string }[];
  const affiliated = matches.filter((row) => db.prepare(`SELECT 1 FROM affiliations WHERE person_id=? AND university_id=?`).get(row.id, universityId));
  if (affiliated.length === 1) return affiliated[0].id;
  if (affiliated.length > 1) {
    const campusWord = new Set(["penn", "berkeley", "cal", "university"]);
    const hint = org
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .find((token) => token.length >= 3 && !campusWord.has(token));
    const hinted = hint
      ? affiliated.filter((row) => {
          const roles = db.prepare(`SELECT role FROM affiliations WHERE person_id=?`).all(row.id) as { role: string | null }[];
          return roles.some((role) => (role.role ?? "").toLowerCase().includes(hint));
        })
      : [];
    if (hinted.length === 1) return hinted[0].id;
    return "ambiguous";
  }
  if (matches.length === 1) {
    const any = db.prepare(`SELECT 1 FROM affiliations WHERE person_id=?`).get(matches[0].id);
    if (!any) return matches[0].id;
  }
  return null;
}

function ensureMember(db: Database.Database, member: CampusMember, sourceId: string, retrievedAt: string) {
  const aliases = member.linkedin ? [`linkedin:${member.linkedin.replace(/\/$/, "")}`] : [];
  const found = findPerson(db, member.name, member.universityId, aliases, member.org);
  if (found === "ambiguous") return;
  let id = found;
  let created = false;
  if (!id) {
    id = newId("person");
    db.prepare(`INSERT INTO people (id, name, aliases_json, founder_status, potential_signal) VALUES (?, ?, ?, NULL, NULL)`).run(id, member.name, JSON.stringify(aliases));
    created = true;
  } else if (aliases.length) {
    const row = db.prepare(`SELECT aliases_json FROM people WHERE id=?`).get(id) as { aliases_json: string };
    const existing = JSON.parse(row.aliases_json) as string[];
    for (const alias of aliases) if (!existing.includes(alias)) existing.push(alias);
    db.prepare(`UPDATE people SET aliases_json=? WHERE id=?`).run(JSON.stringify(existing), id);
  }
  const claimId = insertClaim(db, id, member.excerpt, sourceId, member.sourceUrl, { org: member.org, tier: member.tier, role: member.role, campus: member.campusLabel }, retrievedAt);
  const already = db.prepare(`SELECT id FROM affiliations WHERE person_id=? AND university_id=? AND role=?`).get(id, member.universityId, member.role);
  if (!already) {
    db.prepare(`INSERT INTO affiliations (id, person_id, university_id, role, status, claim_id) VALUES (?, ?, ?, ?, 'unverified', ?)`).run(
      newId("aff"),
      id,
      member.universityId,
      member.role,
      claimId
    );
  }
  touched.add(id);
  if (created) added.push(member);
}

function vipMembers(html: string, sourceUrl: string): CampusMember[] {
  return parseVipXHtml(html).map((member) => ({
    name: member.name,
    role: member.role,
    universityId: "univ_penn",
    campusLabel: "Penn",
    org: "VIP-X accelerator",
    tier: "B",
    sourceUrl,
    linkedin: null,
    excerpt: `VIP-X page lists ${member.line}${member.classYears.length ? ` Class year on the page: ${member.classYears.join(", ")}.` : ""}`,
  }));
}

function fromRoster(members: RosterMember[], input: { universityId: string; campusLabel: string; org: string; tier: string; sourceUrl: string; blurb: string }): CampusMember[] {
  return members.map((member) => ({
    name: member.name,
    role: member.role,
    universityId: input.universityId,
    campusLabel: input.campusLabel,
    org: input.org,
    tier: input.tier,
    sourceUrl: input.sourceUrl,
    linkedin: member.linkedin,
    excerpt: `${input.blurb} The page lists ${member.line}.`,
  }));
}

async function main() {
  const retrievedAt = nowIso();
  const db = getDb();
  const vipUrl = "https://venturelab.upenn.edu/vip-alumni";
  const vipSfUrl = "https://venturelab.upenn.edu/programs/vip-x-san-francisco-cohorts";
  const fvPage = "https://www.freeventures.org/team";
  const launchUrl = "https://www.callaunchpad.org/about";
  const skyUrl = "https://skydeck.berkeley.edu/our_team/";
  const ucUrl = "https://www.uclaunch.com/team";
  const ccvUrl = "https://www.centercityventures.com/team";
  const ccvHome = "https://www.centercityventures.com/";

  const [vipHtml, vipSfHtml, fvHtml, launchHtml, skyHtml, ucHtml, ccvHtml, ccvHomeHtml] = await Promise.all([
    fetchText(vipUrl),
    fetchText(vipSfUrl),
    fetchText(fvPage),
    fetchText(launchUrl),
    fetchText(skyUrl),
    fetchText(ucUrl),
    fetchText(ccvUrl),
    fetchText(ccvHome),
  ]);

  const scriptSrc = cheerio.load(fvHtml)("script[src*='static/js/main']").attr("src");
  if (!scriptSrc) throw new Error("Free Ventures team page did not link its roster script.");
  const fvJs = await fetchText(new URL(scriptSrc, fvPage).toString());

  const vip = [...vipMembers(vipHtml, vipUrl), ...vipMembers(vipSfHtml, vipSfUrl)];
  const fv = parseFreeVenturesTeam(fvJs);
  const launch = parseLaunchpadAbout(launchHtml);
  const sky = parseSkyDeckTeam(skyHtml);
  const uc = parseUcLaunchTeam(ucHtml);
  const ccv = parseCenterCityFounders(ccvHtml);
  if (!/Wharton MBA Class of 2026/.test(ccvHomeHtml)) throw new Error("Center City Ventures homepage no longer states the Wharton MBA Class of 2026.");

  console.log(JSON.stringify({ vip: vip.length, freeVentures: fv.length, launchpad: launch.length, skydeck: sky.length, ucLaunch: uc.length, centerCity: ccv.length }));
  if (vip.length < 200) throw new Error("VIP-X pages parsed fewer named people than the public cohorts show.");
  if (fv.length < 10) throw new Error("Free Ventures team script parsed fewer people than the team page shows.");
  if (launch.length < 20) throw new Error("Launchpad about page parsed fewer F26 teammates than the page shows.");
  if (sky.length < 10) throw new Error("SkyDeck team page parsed fewer staff than the page shows.");
  if (uc.length < 5) throw new Error("UC LAUNCH team page parsed fewer officers than the page shows.");
  if (ccv.length < 2) throw new Error("Center City Ventures founding team was not on the team page.");

  const batches: { sourceId: string; name: string; url: string; campuses: string[]; members: CampusMember[] }[] = [
    { sourceId: "src_hotspot_vipx", name: "VIP-X cohorts", url: vipUrl, campuses: ["univ_penn"], members: vip },
    {
      sourceId: "src_hotspot_freeventures",
      name: "Free Ventures team",
      url: fvPage,
      campuses: ["univ_berkeley"],
      members: fromRoster(fv, {
        universityId: "univ_berkeley",
        campusLabel: "UC Berkeley",
        org: "Free Ventures",
        tier: "B",
        sourceUrl: fvPage,
        blurb: "Free Ventures team page.",
      }),
    },
    {
      sourceId: "src_hotspot_launchpad",
      name: "Cal Launchpad F26 team",
      url: launchUrl,
      campuses: ["univ_berkeley"],
      members: fromRoster(launch, {
        universityId: "univ_berkeley",
        campusLabel: "UC Berkeley",
        org: "Launchpad",
        tier: "B",
        sourceUrl: launchUrl,
        blurb: "Cal Launchpad about page, F26 Team.",
      }),
    },
    {
      sourceId: "src_hotspot_skydeck_team",
      name: "Berkeley SkyDeck team",
      url: skyUrl,
      campuses: ["univ_berkeley"],
      members: fromRoster(sky, {
        universityId: "univ_berkeley",
        campusLabel: "UC Berkeley",
        org: "Berkeley SkyDeck",
        tier: "C",
        sourceUrl: skyUrl,
        blurb: "Berkeley SkyDeck team page.",
      }),
    },
    {
      sourceId: "src_hotspot_uclaunch",
      name: "UC LAUNCH team",
      url: ucUrl,
      campuses: ["univ_berkeley"],
      members: fromRoster(uc, {
        universityId: "univ_berkeley",
        campusLabel: "UC Berkeley",
        org: "UC LAUNCH",
        tier: "C",
        sourceUrl: ucUrl,
        blurb: "UC LAUNCH team page.",
      }),
    },
    {
      sourceId: "src_hotspot_ccv",
      name: "Center City Ventures founding team",
      url: ccvUrl,
      campuses: ["univ_penn"],
      members: ccv.map((member) => ({
        name: member.name,
        role: member.role,
        universityId: "univ_penn",
        campusLabel: "Penn",
        org: "Center City Ventures",
        tier: "C",
        sourceUrl: ccvUrl,
        linkedin: null,
        excerpt: `Center City Ventures team page lists ${member.line}. The fund homepage says it is funded and operated by the Wharton MBA Class of 2026.`,
      })),
    },
  ];

  const peopleBefore = (db.prepare(`SELECT COUNT(*) AS n FROM people`).get() as { n: number }).n;
  const linkBefore = (db.prepare(`SELECT COUNT(*) AS n FROM affiliations`).get() as { n: number }).n;
  const tx = db.transaction(() => {
    for (const batch of batches) {
      ensureSource(db, batch.sourceId, batch.name, batch.url, batch.campuses, retrievedAt);
      for (const member of batch.members) ensureMember(db, member, batch.sourceId, retrievedAt);
    }
    for (const id of touched) recomputePersonEnrollment(db, id);
  });
  tx();
  db.pragma("wal_checkpoint(TRUNCATE)");

  const peopleAfter = (db.prepare(`SELECT COUNT(*) AS n FROM people`).get() as { n: number }).n;
  const linkAfter = (db.prepare(`SELECT COUNT(*) AS n FROM affiliations`).get() as { n: number }).n;
  const unknown = db.prepare(`SELECT COUNT(*) AS n FROM people WHERE id IN (${[...touched].map(() => "?").join(",")}) AND (enrollment_status IS NULL OR enrollment_status = 'unknown')`).get(...touched) as { n: number };
  if (unknown.n !== 0) throw new Error(`${unknown.n} new or updated people are still unclassified.`);
  const byOrg: Record<string, number> = {};
  const byCampus: Record<string, number> = {};
  for (const member of added) {
    byOrg[`${member.tier} · ${member.org}`] = (byOrg[`${member.tier} · ${member.org}`] ?? 0) + 1;
    byCampus[member.campusLabel] = (byCampus[member.campusLabel] ?? 0) + 1;
  }
  console.log(
    JSON.stringify(
      {
        people: { before: peopleBefore, after: peopleAfter, added: peopleAfter - peopleBefore },
        affiliations: { before: linkBefore, after: linkAfter, added: linkAfter - linkBefore },
        touched: touched.size,
        addedByCampus: byCampus,
        addedByOrg: byOrg,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
