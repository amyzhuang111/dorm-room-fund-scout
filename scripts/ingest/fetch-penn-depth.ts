// Public Penn sources beyond PennApps XXVI, Penn Labs, and the 2026 Startup
// Challenge. Every person and company below is copied from a page this script
// fetches. A LinkedIn URL is stored only when that page's HTML contains it.
// Class-year tokens (ENG'25, W'26, …) are Penn's own notation; the status
// derived from them is labeled analyst_inference.
//
// Run: npx tsx scripts/ingest/fetch-penn-depth.ts
// Parse saved fixtures only: PENN_DRY=1 npx tsx scripts/ingest/fetch-penn-depth.ts

import * as cheerio from "cheerio";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getDb, newId, nowIso } from "../../lib/db/client";

const UNIV = "univ_penn";
const UA = "campus-universe-research-bot/0.1 (manual, bounded)";
const DRY = process.env.PENN_DRY === "1";
const TOKEN = String.raw`[A-Za-z]{1,8}'?\d{2}`;
const PENN_BIO_RE = /University of Pennsylvania|\bUPenn\b|\bWharton\b|Penn Engineering|\bPenn student\b|\bat Penn\b/i;

interface PersonHit {
  name: string;
  tokens: string[];
}

interface VentureHit {
  name: string;
  description: string;
  website: string | null;
  founders: PersonHit[];
  cohort?: string;
  raw: string;
}

function norm(s: string): string {
  return s.replace(/\u2019/g, "'").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,application/json" } });
  if (res.status === 429) {
    const err = new Error(`HTTP 429 fetching ${url}`);
    throw err;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

function companySite(href: string | undefined | null): string | null {
  if (!href || !/^https?:\/\//i.test(href)) return null;
  let host = "";
  try {
    host = new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
  const blocked = ["crunchbase.com", "linkedin.com", "facebook.com", "instagram.com", "twitter.com", "x.com", "youtube.com", "venturelab.upenn.edu", "google.com"];
  if (blocked.some((b) => host === b || host.endsWith(`.${b}`))) return null;
  return href;
}

function cleanName(name: string): string | null {
  const n = norm(name).replace(/[,\s]+$/g, "").replace(/^\(+|\)+$/g, "");
  if (!n) return null;
  const words = n.split(/\s+/);
  if (words.length < 2 || words.length > 5) return null;
  if (n.length > 48 || /\d/.test(n)) return null;
  if (/award|prize|winner|vip-x|website|founder|cohort|more$/i.test(n)) return null;
  return n;
}

function peopleFromFragment(fragment: string): PersonHit[] {
  const text = norm(fragment).replace(/\([A-Z][a-z'.\-]+\)/g, "");
  const out: PersonHit[] = [];
  const seen = new Set<string>();
  const word = String.raw`(?!${TOKEN}\b)[A-Z][A-Za-z'.\-]+`;
  const re = new RegExp(
    String.raw`(${word}(?:\s+${word}){1,3})(?:,\s*|\s+|\s*\(\s*)((?:${TOKEN})(?:(?:\s*,\s*|\s+)${TOKEN})*)`,
    "g"
  );
  for (const m of text.matchAll(re)) {
    const name = cleanName(m[1]);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const tokens = m[2].match(new RegExp(TOKEN, "g")) ?? [];
    out.push({ name, tokens });
  }
  return out;
}

function interpretStatus(tokens: string[], asOfYear: number): string {
  const years = tokens
    .map((t) => {
      const m = t.match(/(\d{2})$/);
      return m ? 2000 + parseInt(m[1], 10) : null;
    })
    .filter((y): y is number => y != null);
  if (years.length === 0) return "unverified";
  const maxYear = Math.max(...years);
  const minYear = Math.min(...years);
  if (maxYear > asOfYear) return "current_student";
  if (asOfYear - minYear <= 2) return "recent_grad";
  return "older_alumni";
}

export function parseVip(html: string): VentureHit[] {
  const $ = cheerio.load(html);
  const out: VentureHit[] = [];
  $(".PromoAccordion").each((_, acc) => {
    const cohort = norm($(acc).find(".PromoAccordion-title").first().text());
    $(acc)
      .find(".PromoAccordion-description")
      .children("ul")
      .each((__, ul) => {
        $(ul)
          .children("li")
          .each((___, li) => {
            const $li = $(li);
            const own = norm($li.clone().children("ul").remove().end().text());
            const nested = $li
              .find("li")
              .toArray()
              .map((el) => norm($(el).text()))
              .join(" ; ");
            if (!own || /^(founder|website)\b/i.test(own)) return;
            let label = norm($li.children("b").first().text() || $li.find("b").first().text()).replace(/[:\s]+$/g, "");
            if (!label || label.length > 60) {
              const leadMatch = own.match(/^([^:(]{2,60}?)(?:\s*:|\s*\()/);
              label = leadMatch ? norm(leadMatch[1]).replace(/:$/, "") : "";
            }
            if (!label || label.length > 60 || /^(founder|website)$/i.test(label)) return;
            const site =
              companySite($li.find("a[href]").toArray().map((a) => $(a).attr("href")).find((h) => companySite(h)) || null) ||
              null;
            const founders = peopleFromFragment(`${own} ; ${nested}`);
            const description = own.replace(label, "").replace(/^:\s*/, "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
            out.push({
              name: label.replace(/:$/, ""),
              description: description.slice(0, 500),
              website: site,
              founders,
              cohort,
              raw: own.slice(0, 400),
            });
          });
      });
  });
  return out;
}

export function parseStartupChallenge(html: string, year: number): VentureHit[] {
  const $ = cheerio.load(html);
  const out: VentureHit[] = [];
  $(".PromoCardA").each((_, card) => {
    const name = norm($(card).find(".PromoCardA-title").text());
    if (!name || name.length > 80) return;
    const href = $(card).find(".PromoCardA-media a").attr("href") || $(card).find("a[href^='http']").attr("href");
    const raw = norm($(card).find(".PromoCardA-description").text());
    const founders = peopleFromFragment(raw);
    const description = raw.replace(/\([^)]*\)/g, "").slice(0, 500);
    out.push({
      name,
      description,
      website: companySite(href),
      founders,
      cohort: String(year),
      raw: raw.slice(0, 400),
    });
  });
  return out;
}

export function parseSeasSeniorDesign(html: string): { title: string; people: PersonHit[]; blurb: string }[] {
  const $ = cheerio.load(html);
  const out: { title: string; people: PersonHit[]; blurb: string }[] = [];
  $("h4").each((_, h) => {
    const title = norm($(h).text());
    if (!title || /read more/i.test(title)) return;
    const studentsH = $(h)
      .nextAll("h5")
      .filter((__, e) => /students/i.test($(e).text()))
      .first();
    if (!studentsH.length) return;
    const peopleText = norm(studentsH.next("p").text());
    const people = peopleFromFragment(peopleText.replace(/\band\b/gi, ","));
    const blurb = norm($(h).nextAll("p").first().text()).slice(0, 400);
    if (people.length) out.push({ title, people, blurb });
  });
  return out;
}

export function parseBeSeniorDesign(html: string): { title: string; people: string[]; blurb: string }[] {
  const $ = cheerio.load(html);
  const out: { title: string; people: string[]; blurb: string }[] = [];
  $("p").each((_, p) => {
    const teamLine = norm($(p).text());
    if (!/^Team members:/i.test(teamLine)) return;
    const people = teamLine
      .replace(/^Team members:\s*/i, "")
      .split(/,|&|\band\b/)
      .map((part) => cleanName(part.replace(/\(.*?\)/g, "")))
      .filter((part): part is string => !!part);
    let prev = $(p).prev();
    let blurb = "";
    for (let i = 0; i < 4 && prev.length; i++) {
      const prevText = norm(prev.text());
      if (prevText && !/^Team members:/i.test(prevText) && !/^Accolades:/i.test(prevText)) {
        blurb = prevText;
        break;
      }
      prev = prev.prev();
    }
    let title = blurb.split(/\s+is\s+/)[0]?.trim() ?? "";
    const teamTitle = blurb.match(/Team\s+\d+\s*[-–]\s*([A-Za-z0-9][A-Za-z0-9 .'\-]{1,40})/);
    if (teamTitle) title = norm(teamTitle[1]);
    if (!title || title.length > 70 || people.length === 0) return;
    if (/team members|abstract/i.test(title)) return;
    out.push({ title, people, blurb: blurb.slice(0, 400) });
  });
  return out;
}

interface SpeedrunCompany {
  name: string;
  slug: string;
  website: string | null;
  description: string;
  people: { name: string; title: string; introduction: string; linkedin: string | null; founder: boolean }[];
}

export function parseSpeedrunCompany(html: string): SpeedrunCompany | null {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  const data = JSON.parse(m[1]) as {
    props?: { pageProps?: { dehydratedState?: { queries?: { state?: { data?: Record<string, unknown> } }[] } } };
  };
  const queries = data.props?.pageProps?.dehydratedState?.queries ?? [];
  for (const q of queries) {
    const d = q.state?.data;
    if (!d || typeof d !== "object") continue;
    const founders = d.founder_set;
    if (!Array.isArray(founders) || founders.length === 0) continue;
    const first = founders[0] as { introduction?: string };
    if (!first || typeof first.introduction !== "string") continue;
    const people = founders
      .map((f) => {
        const row = f as { first_name?: string; last_name?: string; title?: string; introduction?: string; linkedin_url?: string };
        const name = cleanName(`${row.first_name ?? ""} ${row.last_name ?? ""}`);
        const introduction = norm(row.introduction ?? "");
        const title = norm(row.title ?? "");
        if (!name || !introduction) return null;
        const lead = introduction.slice(0, 80);
        const founder = /founder/i.test(title) || /^(co[-\s]?founder|founder)\b/i.test(lead);
        const li = row.linkedin_url && /linkedin\.com\/in\//i.test(row.linkedin_url) ? row.linkedin_url.split("?")[0] : null;
        return { name, title, introduction, linkedin: li, founder };
      })
      .filter((p): p is NonNullable<typeof p> => !!p);
    const website = typeof d.website_url === "string" ? companySite(d.website_url) : null;
    return {
      name: String(d.name ?? ""),
      slug: String(d.slug ?? ""),
      website,
      description: norm(String(d.preamble || d.description || "")).slice(0, 500),
      people,
    };
  }
  return null;
}

function suspicious(ventures: VentureHit[], label: string) {
  const bad = ventures.filter((v) => !v.name || v.name.length < 2);
  const founderCount = ventures.reduce((n, v) => n + v.founders.length, 0);
  console.log(`${label}: ${ventures.length} ventures, ${founderCount} named people with a class-year token, ${ventures.filter((v) => v.founders.length === 0).length} with no parsed founder`);
  if (bad.length) console.log(`  unnamed: ${bad.length}`);
  for (const v of ventures.slice(0, 3)) {
    console.log(`  • ${v.name} [${v.cohort}] founders=${v.founders.map((f) => f.name).join(", ") || "—"} site=${v.website ?? "—"}`);
  }
}

async function dry() {
  const vip = parseVip(fs.readFileSync("/tmp/penn-src/vip.html", "utf8"));
  suspicious(vip, "VIP");
  for (const year of [2025, 2024, 2023, 2022]) {
    suspicious(parseStartupChallenge(fs.readFileSync(`/tmp/penn-src/sc${year}.html`, "utf8"), year), `SC ${year}`);
  }
  const seas = parseSeasSeniorDesign(fs.readFileSync("/tmp/penn-src/seas2025.html", "utf8"));
  console.log(`SEAS 2025: ${seas.length} projects`);
  for (const p of seas) console.log(`  • ${p.title}: ${p.people.map((x) => x.name).join(", ")}`);
  const be = parseBeSeniorDesign(fs.readFileSync("/tmp/penn-src/be2022.html", "utf8"));
  console.log(`BE 2022: ${be.length} projects`);
  for (const p of be.slice(0, 6)) console.log(`  • ${p.title}: ${p.people.join(", ")}`);
  for (const file of ["straia.html", "oleum.html"]) {
    const co = parseSpeedrunCompany(fs.readFileSync(`/tmp/penn-src/${file}`, "utf8"));
    const penn = co?.people.filter((p) => PENN_BIO_RE.test(p.introduction)) ?? [];
    console.log(`Speedrun ${file}: ${co?.name} penn-bios=${penn.map((p) => `${p.name} (${p.title}, founder=${p.founder})`).join("; ")}`);
  }
}

function mainDb() {
  const db = getDb();
  db.pragma("busy_timeout = 8000");
  const retrievedAt = nowIso();

  const ensureSource = db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at)
     VALUES (?, ?, ?, ?, ?, 1, 'html_scrape', 'available', ?)
     ON CONFLICT(id) DO UPDATE SET last_attempt_at=excluded.last_attempt_at, status='available', url=excluded.url, name=excluded.name`
  );
  const insertSnap = db.prepare(
    `INSERT INTO snapshots (id, source_id, url, content_hash, fetched_at, http_status, raw_excerpt) VALUES (?, ?, ?, ?, ?, 200, ?)`
  );
  const findProject = db.prepare(`SELECT id, website_url FROM projects WHERE lower(name) = lower(?) AND kind = ?`);
  const insertProject = db.prepare(
    `INSERT INTO projects (id, name, aliases_json, kind, sector, description, website_url, is_portfolio_reference, is_investable_candidate)
     VALUES (?, ?, '[]', ?, NULL, ?, ?, 0, ?)`
  );
  const setWebsite = db.prepare(`UPDATE projects SET website_url = ? WHERE id = ? AND (website_url IS NULL OR website_url = '')`);
  const findPerson = db.prepare(`SELECT id FROM people WHERE name = ? COLLATE NOCASE`);
  const insertPerson = db.prepare(`INSERT INTO people (id, name, aliases_json) VALUES (?, ?, '[]')`);
  const readAliases = db.prepare(`SELECT aliases_json FROM people WHERE id = ?`);
  const writeAliases = db.prepare(`UPDATE people SET aliases_json = ? WHERE id = ?`);
  const findClaim = db.prepare(
    `SELECT id FROM claims WHERE source_id = ? AND entity_id = ? AND claim_type = ? AND source_url = ?`
  );
  const insertClaim = db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, snapshot_id, source_url, published_date, retrieved_at, label, verification_state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unverified')`
  );
  const findAff = db.prepare(`SELECT id FROM affiliations WHERE person_id = ? AND university_id = ? AND role = ?`);
  const insertAff = db.prepare(
    `INSERT INTO affiliations (id, person_id, university_id, role, status, claim_id) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const findRole = db.prepare(`SELECT id FROM person_project_roles WHERE person_id = ? AND project_id = ? AND role = ?`);
  const insertRole = db.prepare(
    `INSERT INTO person_project_roles (id, person_id, project_id, role, claim_id) VALUES (?, ?, ?, ?, ?)`
  );
  const findRel = db.prepare(
    `SELECT id FROM relationships WHERE source_entity_type = ? AND source_entity_id = ? AND target_entity_type = ? AND target_entity_id = ? AND relationship_type = ?`
  );
  const insertRel = db.prepare(
    `INSERT INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json, verification_state)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'affiliation_only')`
  );

  function snap(sourceId: string, url: string, excerpt: string, html: string) {
    const hash = crypto.createHash("sha256").update(html).digest("hex");
    const id = newId("snap");
    insertSnap.run(id, sourceId, url, hash, retrievedAt, excerpt.slice(0, 180));
    return id;
  }

  function addAlias(personId: string, alias: string) {
    const row = readAliases.get(personId) as { aliases_json: string };
    const aliases = JSON.parse(row.aliases_json || "[]") as string[];
    if (aliases.includes(alias)) return;
    aliases.push(alias);
    writeAliases.run(JSON.stringify(aliases), personId);
  }

  function personIdFor(name: string): string {
    const rows = findPerson.all(name) as { id: string }[];
    if (rows.length === 1) return rows[0].id;
    if (rows.length > 1) {
      const id = newId("person");
      insertPerson.run(id, name);
      return id;
    }
    const id = newId("person");
    insertPerson.run(id, name);
    return id;
  }

  function claimOnce(args: {
    entityType: string;
    entityId: string;
    claimType: string;
    sourceId: string;
    sourceUrl: string;
    snapshotId: string;
    excerpt: string;
    value: unknown;
    label: string;
    published?: string | null;
  }): string | null {
    const existing = findClaim.get(args.sourceId, args.entityId, args.claimType, args.sourceUrl) as { id: string } | undefined;
    if (existing) return existing.id;
    const id = newId("claim");
    insertClaim.run(
      id,
      args.entityType,
      args.entityId,
      args.claimType,
      JSON.stringify(args.value),
      args.excerpt,
      args.sourceId,
      args.snapshotId,
      args.sourceUrl,
      args.published ?? null,
      retrievedAt,
      args.label
    );
    return id;
  }

  function linkUniversity(projectId: string, claimId: string | null) {
    if (findRel.get("project", projectId, "university", UNIV, "affiliated_with")) return;
    insertRel.run(newId("rel"), "project", projectId, "university", UNIV, "affiliated_with", JSON.stringify(claimId ? [claimId] : []));
  }

  function upsertProject(name: string, kind: "company" | "project", description: string, website: string | null, investable: boolean): string {
    const existing = findProject.get(name, kind) as { id: string; website_url: string | null } | undefined;
    if (existing) {
      if (website) setWebsite.run(website, existing.id);
      return existing.id;
    }
    const id = newId("proj");
    insertProject.run(id, name, kind, description, website, investable ? 1 : 0);
    return id;
  }

  const stats = {
    vipCompanies: 0,
    vipFounders: 0,
    scCompanies: 0,
    scFounders: 0,
    seasProjects: 0,
    seasPeople: 0,
    beProjects: 0,
    bePeople: 0,
    healthTech: 0,
    speedrunCompanies: 0,
    speedrunPeople: 0,
    dpCompanies: 0,
    contrary: 0,
    gary: 0,
  };

  async function ingestVentures(sourceId: string, sourceName: string, family: string, pageUrl: string, html: string, ventures: VentureHit[], yearHint: number) {
    ensureSource.run(sourceId, sourceName, family, pageUrl, JSON.stringify([UNIV]), retrievedAt);
    const snapshotId = snap(sourceId, pageUrl, ventures.map((v) => v.name).slice(0, 8).join(", "), html);
    for (const v of ventures) {
      if (!v.name) continue;
      const projectId = upsertProject(v.name, "company", v.description || `${sourceName}: ${v.name}`, v.website, true);
      const excerpt = `${sourceName}${v.cohort ? ` (${v.cohort})` : ""}: ${v.name}. ${v.raw}`;
      const claimId = claimOnce({
        entityType: "project",
        entityId: projectId,
        claimType: "program_listing",
        sourceId,
        sourceUrl: pageUrl,
        snapshotId,
        excerpt,
        value: { name: v.name, cohort: v.cohort, website: v.website },
        label: "observed_fact",
      });
      linkUniversity(projectId, claimId);
      if (sourceId === "src_penn_vip") stats.vipCompanies++;
      else stats.scCompanies++;
      for (const f of v.founders) {
        const pid = personIdFor(f.name);
        const status = interpretStatus(f.tokens, 2026);
        const affExcerpt = `${sourceName} lists ${f.name}${f.tokens.length ? ` (${f.tokens.join(", ")})` : ""} on ${v.name}. Class-year token interpreted relative to 2026 as ${status.replaceAll("_", " ")}.`;
        const affClaim = claimOnce({
          entityType: "person",
          entityId: pid,
          claimType: "affiliation",
          sourceId,
          sourceUrl: pageUrl,
          snapshotId,
          excerpt: affExcerpt,
          value: { university: "University of Pennsylvania", tokens: f.tokens, status, company: v.name },
          label: f.tokens.length ? "analyst_inference" : "observed_fact",
        });
        const role = sourceId === "src_penn_vip" ? "VIP founder" : `Startup Challenge ${yearHint} founder`;
        if (affClaim && !findAff.get(pid, UNIV, role)) insertAff.run(newId("aff"), pid, UNIV, role, status, affClaim);
        if (affClaim && !findRole.get(pid, projectId, "founder")) {
          insertRole.run(newId("ppr"), pid, projectId, "founder", affClaim);
          if (!findRel.get("person", pid, "project", projectId, "founded")) {
            insertRel.run(newId("rel"), "person", pid, "project", projectId, "founded", JSON.stringify([affClaim]));
          }
        }
        if (sourceId === "src_penn_vip") stats.vipFounders++;
        else stats.scFounders++;
      }
    }
  }

  return { db, ensureSource, snap, claimOnce, linkUniversity, upsertProject, personIdFor, addAlias, findAff, insertAff, findRole, insertRole, findRel, insertRel, stats, ingestVentures, retrievedAt };
}

async function live() {
  const ctx = mainDb();
  const { ensureSource, snap, claimOnce, linkUniversity, upsertProject, personIdFor, addAlias, findAff, insertAff, findRole, insertRole, findRel, insertRel, stats, ingestVentures } = ctx;

  const vipUrl = "https://venturelab.upenn.edu/vip-alumni";
  const vipHtml = await fetchText(vipUrl);
  const vip = parseVip(vipHtml);
  suspicious(vip, "VIP live");
  await ingestVentures("src_penn_vip", "Penn Venture Lab — VIP-X alumni", "university_venture_program", vipUrl, vipHtml, vip, 2026);

  for (const year of [2025, 2024, 2023, 2022]) {
    const url = `https://venturelab.upenn.edu/${year}-startup-challenge-finalists`;
    let html = "";
    try {
      html = await fetchText(url);
    } catch (e) {
      console.log(`Startup Challenge ${year}: ${(e as Error).message}`);
      continue;
    }
    const ventures = parseStartupChallenge(html, year);
    suspicious(ventures, `SC ${year} live`);
    if (ventures.length === 0) continue;
    await ingestVentures(
      "src_penn_startup_challenge_archive",
      "Penn Venture Lab — Startup Challenge finalists (2022–2025)",
      "university_venture_program",
      url,
      html,
      ventures,
      year
    );
    await sleep(400);
  }

  const seasUrl = "https://www.engineering.upenn.edu/stories/designing-the-future-penn-engineerings-2025-senior-design-project-competition/";
  const seasHtml = await fetchText(seasUrl);
  ensureSource.run("src_penn_seas_senior_design", "Penn Engineering Senior Design showcases", "student_project_showcase", seasUrl, JSON.stringify([UNIV]), ctx.retrievedAt);
  const seasSnap = snap("src_penn_seas_senior_design", seasUrl, "2025 Senior Design winners", seasHtml);
  for (const project of parseSeasSeniorDesign(seasHtml)) {
    const projectId = upsertProject(project.title, "project", project.blurb || project.title, null, false);
    const claimId = claimOnce({
      entityType: "project",
      entityId: projectId,
      claimType: "capstone_project",
      sourceId: "src_penn_seas_senior_design",
      sourceUrl: seasUrl,
      snapshotId: seasSnap,
      excerpt: `Penn Engineering 2025 Senior Design Project Competition: ${project.title}. ${project.blurb}`,
      value: { title: project.title },
      label: "observed_fact",
    });
    stats.seasProjects++;
    for (const person of project.people) {
      const pid = personIdFor(person.name);
      const status = interpretStatus(person.tokens, 2026);
      const affClaim = claimOnce({
        entityType: "person",
        entityId: pid,
        claimType: "affiliation",
        sourceId: "src_penn_seas_senior_design",
        sourceUrl: seasUrl,
        snapshotId: seasSnap,
        excerpt: `Listed as a student on ${project.title}: ${person.name} (${person.tokens.join(", ")}). Status relative to 2026: ${status.replaceAll("_", " ")}.`,
        value: { tokens: person.tokens, status },
        label: "analyst_inference",
      });
      if (affClaim && !findAff.get(pid, UNIV, "2025 Senior Design student")) {
        insertAff.run(newId("aff"), pid, UNIV, "2025 Senior Design student", status, affClaim);
      }
      if (claimId && !findRole.get(pid, projectId, "team_member")) {
        insertRole.run(newId("ppr"), pid, projectId, "team_member", claimId);
      }
      stats.seasPeople++;
    }
  }

  for (const year of [2024, 2023, 2022, 2021]) {
    const url = `https://belabs.seas.upenn.edu/seniordesign/${year}`;
    let html = "";
    try {
      html = await fetchText(url);
    } catch (e) {
      console.log(`BE senior design ${year}: ${(e as Error).message}`);
      continue;
    }
    const projects = parseBeSeniorDesign(html);
    console.log(`BE ${year}: ${projects.length} projects`);
    if (projects.length === 0) continue;
    const snapshotId = snap("src_penn_seas_senior_design", url, `BE senior design ${year}`, html);
    const status = 2026 - year <= 2 ? "recent_grad" : "older_alumni";
    for (const project of projects) {
      const projectId = upsertProject(project.title, "project", project.blurb, null, false);
      const claimId = claimOnce({
        entityType: "project",
        entityId: projectId,
        claimType: "capstone_project",
        sourceId: "src_penn_seas_senior_design",
        sourceUrl: url,
        snapshotId,
        excerpt: `Penn Bioengineering senior design ${year}: ${project.blurb} Team members: ${project.people.join(", ")}.`,
        value: { year, title: project.title },
        label: "observed_fact",
      });
      stats.beProjects++;
      for (const name of project.people) {
        const pid = personIdFor(name);
        const affClaim = claimOnce({
          entityType: "person",
          entityId: pid,
          claimType: "affiliation",
          sourceId: "src_penn_seas_senior_design",
          sourceUrl: url,
          snapshotId,
          excerpt: `${name} is listed on the Penn Bioengineering senior design ${year} page for ${project.title}. The page is a graduating-senior showcase, so status is recorded as ${status.replaceAll("_", " ")}.`,
          value: { year, status },
          label: "analyst_inference",
        });
        const role = `BE senior design ${year}`;
        if (affClaim && !findAff.get(pid, UNIV, role)) insertAff.run(newId("aff"), pid, UNIV, role, status, affClaim);
        if (claimId && !findRole.get(pid, projectId, "team_member")) insertRole.run(newId("ppr"), pid, projectId, "team_member", claimId);
        stats.bePeople++;
      }
    }
    await sleep(400);
  }

  ensureSource.run(
    "src_penn_health_tech",
    "Penn Health-Tech accelerator portfolio",
    "university_venture_program",
    "https://healthtech.upenn.edu/portfolio",
    JSON.stringify([UNIV]),
    ctx.retrievedAt
  );
  const seenHealth = new Set<string>();
  for (let page = 0; page < 8; page++) {
    const url =
      page === 0
        ? "https://healthtech.upenn.edu/portfolio"
        : `https://healthtech.upenn.edu/portfolio?type=All&sector=All&stage=All&cohort=All&page=${page}`;
    const html = await fetchText(url);
    const $ = cheerio.load(html);
    const cards: { name: string; intro: string; href: string }[] = [];
    $("a.project-card").each((_, el) => {
      const name = norm($(el).find("strong").first().text());
      const intro = norm($(el).find(".intro").text());
      const href = $(el).attr("href") || "";
      if (name && href && !seenHealth.has(href)) {
        seenHealth.add(href);
        cards.push({ name, intro, href });
      }
    });
    console.log(`Health-Tech page ${page}: ${cards.length} new cards`);
    if (cards.length === 0) break;
    const snapshotId = snap("src_penn_health_tech", url, cards.map((c) => c.name).slice(0, 6).join(", "), html);
    for (const card of cards) {
      const sourceUrl = new URL(card.href, "https://healthtech.upenn.edu").toString();
      const projectId = upsertProject(card.name, "company", card.intro || card.name, null, false);
      const claimId = claimOnce({
        entityType: "project",
        entityId: projectId,
        claimType: "program_listing",
        sourceId: "src_penn_health_tech",
        sourceUrl,
        snapshotId,
        excerpt: `Penn Health-Tech portfolio card: ${card.name}. ${card.intro} The portfolio page does not name a student founder on the card, so this row is not an investable Startup Scout candidate.`,
        value: { name: card.name },
        label: "observed_fact",
      });
      linkUniversity(projectId, claimId);
      stats.healthTech++;
    }
    await sleep(400);
  }

  ensureSource.run(
    "src_a16z_speedrun",
    "a16z Speedrun company pages",
    "accelerator",
    "https://speedrun.a16z.com/companies",
    JSON.stringify([UNIV]),
    ctx.retrievedAt
  );
  const slugs: string[] = [];
  for (let offset = 0; offset < 400; offset += 100) {
    const body = await fetchText(`https://speedrun-api.a16z.com/api/companies/companies/?limit=100&offset=${offset}`);
    const parsed = JSON.parse(body) as { results?: { slug: string }[] };
    const batch = parsed.results ?? [];
    for (const row of batch) if (row.slug) slugs.push(row.slug);
    if (batch.length < 100) break;
    await sleep(300);
  }
  console.log(`Speedrun slugs: ${slugs.length}`);
  if (process.env.SKIP_SPEEDRUN === "1") {
    console.log("SKIP_SPEEDRUN=1 — leaving the Speedrun rows already stored.");
  }
  for (const slug of process.env.SKIP_SPEEDRUN === "1" ? [] : slugs) {
    const url = `https://speedrun.a16z.com/companies/${slug}`;
    let html = "";
    try {
      html = await fetchText(url);
    } catch (e) {
      const msg = (e as Error).message;
      console.log(`speedrun ${slug}: ${msg}`);
      if (msg.includes("429")) break;
      continue;
    }
    const company = parseSpeedrunCompany(html);
    if (!company) continue;
    const pennPeople = company.people.filter((p) => PENN_BIO_RE.test(p.introduction));
    if (pennPeople.length === 0) {
      await sleep(350);
      continue;
    }
    const founders = pennPeople.filter((p) => p.founder);
    const snapshotId = snap("src_a16z_speedrun", url, company.name, html);
    if (founders.length) {
      const projectId = upsertProject(company.name, "company", company.description || company.name, company.website, true);
      const claimId = claimOnce({
        entityType: "project",
        entityId: projectId,
        claimType: "program_listing",
        sourceId: "src_a16z_speedrun",
        sourceUrl: url,
        snapshotId,
        excerpt: `a16z Speedrun page for ${company.name}. Penn-affiliated founder text: ${founders.map((p) => `${p.name} (${p.title}): ${p.introduction}`).join(" | ")}`,
        value: { slug, website: company.website },
        label: "observed_fact",
      });
      linkUniversity(projectId, claimId);
      stats.speedrunCompanies++;
      for (const p of founders) {
        const pid = personIdFor(p.name);
        if (p.linkedin) addAlias(pid, `linkedin:${p.linkedin}`);
        const affClaim = claimOnce({
          entityType: "person",
          entityId: pid,
          claimType: "affiliation",
          sourceId: "src_a16z_speedrun",
          sourceUrl: url,
          snapshotId,
          excerpt: `${p.name}, ${p.title} at ${company.name}, bio on the Speedrun page: "${p.introduction}"`,
          value: { company: company.name, title: p.title },
          label: "observed_fact",
        });
        if (affClaim && !findAff.get(pid, UNIV, "Speedrun founder")) insertAff.run(newId("aff"), pid, UNIV, "Speedrun founder", "unverified", affClaim);
        if (affClaim && !findRole.get(pid, projectId, "founder")) {
          insertRole.run(newId("ppr"), pid, projectId, "founder", affClaim);
          if (!findRel.get("person", pid, "project", projectId, "founded")) {
            insertRel.run(newId("rel"), "person", pid, "project", projectId, "founded", JSON.stringify([affClaim]));
          }
        }
        stats.speedrunPeople++;
      }
    }
    for (const p of pennPeople.filter((x) => !x.founder)) {
      const pid = personIdFor(p.name);
      if (p.linkedin) addAlias(pid, `linkedin:${p.linkedin}`);
      const affClaim = claimOnce({
        entityType: "person",
        entityId: pid,
        claimType: "affiliation",
        sourceId: "src_a16z_speedrun",
        sourceUrl: url,
        snapshotId,
        excerpt: `${p.name} is listed as ${p.title} at ${company.name}, not as a founder. Bio: "${p.introduction}"`,
        value: { company: company.name, title: p.title },
        label: "observed_fact",
      });
      if (affClaim && !findAff.get(pid, UNIV, p.title || "Speedrun team")) {
        insertAff.run(newId("aff"), pid, UNIV, p.title || "Speedrun team", "unverified", affClaim);
      }
      stats.speedrunPeople++;
    }
    console.log(`Speedrun Penn: ${company.name} — ${pennPeople.map((p) => p.name).join(", ")}`);
    await sleep(350);
  }

  const garyUrl = "https://www.garyzgao.com/";
  const garyHtml = await fetchText(garyUrl);
  const garyText = norm(cheerio.load(garyHtml)("body").text());
  if (/Co-Founder @ Chert/i.test(garyText) && /Wharton @ Penn/i.test(garyText)) {
    ensureSource.run("src_penn_personal_sites", "Public personal sites naming Penn founders", "directory", garyUrl, JSON.stringify([UNIV]), ctx.retrievedAt);
    const snapshotId = snap("src_penn_personal_sites", garyUrl, "Gary Gao / Chert", garyHtml);
    const li = garyHtml.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9_%-]+/i)?.[0] ?? null;
    const projectId = upsertProject(
      "Chert",
      "company",
      "Infrastructure for building conversational interfaces on iMessage. The founder's site says Chert is YC P26.",
      null,
      true
    );
    const claimId = claimOnce({
      entityType: "project",
      entityId: projectId,
      claimType: "program_listing",
      sourceId: "src_penn_personal_sites",
      sourceUrl: garyUrl,
      snapshotId,
      excerpt: "garyzgao.com: Co-Founder @ Chert · CS + Wharton @ Penn · Z-Fellow. Currently co-founder and CEO at Chert (YC P26). Previously studying CS + Business at Penn and Wharton. No product URL is printed on the page.",
      value: { company: "Chert" },
      label: "company_reported",
    });
    linkUniversity(projectId, claimId);
    const pid = personIdFor("Gary Gao");
    if (li) addAlias(pid, `linkedin:${li.split("?")[0]}`);
    const affClaim = claimOnce({
      entityType: "person",
      entityId: pid,
      claimType: "affiliation",
      sourceId: "src_penn_personal_sites",
      sourceUrl: garyUrl,
      snapshotId,
      excerpt: "garyzgao.com identifies Gary Gao as previously studying CS + Business at Penn and Wharton, and as co-founder and CEO of Chert. No class year is printed, so enrollment status stays unverified.",
      value: { company: "Chert" },
      label: "observed_fact",
    });
    if (affClaim && !findAff.get(pid, UNIV, "personal site")) insertAff.run(newId("aff"), pid, UNIV, "personal site", "unverified", affClaim);
    if (affClaim && !findRole.get(pid, projectId, "founder")) {
      insertRole.run(newId("ppr"), pid, projectId, "founder", affClaim);
      if (!findRel.get("person", pid, "project", projectId, "founded")) {
        insertRel.run(newId("rel"), "person", pid, "project", projectId, "founded", JSON.stringify([affClaim]));
      }
    }
    stats.gary++;
  }

  const contraryUrl = "https://contrary.com/blog/class-of-2026";
  const contraryHtml = await fetchText(contraryUrl);
  const contraryText = norm(cheerio.load(contraryHtml)("body").text());
  ensureSource.run("src_contrary_venture_partners", "Contrary student venture partners", "directory", contraryUrl, JSON.stringify([UNIV]), ctx.retrievedAt);
  const contrarySnap = snap("src_contrary_venture_partners", contraryUrl, "Class of 2026", contraryHtml);
  for (const m of contraryText.matchAll(/([A-Z][a-z]+ [A-Z][a-z]+) - Penn/g)) {
    const name = cleanName(m[1]);
    if (!name) continue;
    const window = contraryText.slice(m.index ?? 0, (m.index ?? 0) + 500);
    if (!/student at Penn|at Penn M&T|sophomore at Penn/i.test(window)) continue;
    const pid = personIdFor(name);
    const affClaim = claimOnce({
      entityType: "person",
      entityId: pid,
      claimType: "affiliation",
      sourceId: "src_contrary_venture_partners",
      sourceUrl: contraryUrl,
      snapshotId: contrarySnap,
      excerpt: `Contrary Class of 2026 lists ${name} - Penn. ${window.slice(0, 320)} This is a venture-partner listing, not a company founder role.`,
      value: { program: "Contrary Class of 2026" },
      label: "observed_fact",
    });
    if (affClaim && !findAff.get(pid, UNIV, "Contrary venture partner")) {
      insertAff.run(newId("aff"), pid, UNIV, "Contrary venture partner", "current_student", affClaim);
    }
    stats.contrary++;
  }

  const dpPages: { url: string; company: string; founder: string; website: string | null; must: string[]; excerpt: string; status: string }[] = [
    {
      url: "https://www.thedp.com/article/2026/04/penn-veterinary-artificial-intelligence-startup-jerome-fisher-2026",
      company: "Spoodle",
      founder: "Seher Taneja",
      website: "https://www.spoodle.co/",
      must: ["Seher Taneja", "Spoodle", "spoodle.co", "Wharton and Engineering senior"],
      excerpt:
        "The Daily Pennsylvanian (April 21, 2026) profiles Wharton and Engineering senior Seher Taneja, building Spoodle, a veterinary AI startup. The article says she is graduating the next month from the M&T program and refers to her co-founder without naming them. The unnamed co-founder is not stored.",
      status: "recent_grad",
    },
    {
      url: "https://www.thedp.com/article/2026/04/penn-startup-boba-tea-vending-machine-orble",
      company: "Munch Industries",
      founder: "",
      website: null,
      must: ["Munch Industries", "Natassja Kuznetsova", "Corina Chen"],
      excerpt:
        "The Daily Pennsylvanian describes Munch Industries, started in 2022 through a SEAS senior design project, and its Orble boba vending pilot. It names Natassja Kuznetsova as current CEO (2023 Engineering graduate) and Corina Chen as CTO (Wharton and Engineering sophomore). It does not call either a founder, so no founder role is stored.",
      status: "unverified",
    },
  ];
  ensureSource.run("src_daily_pennsylvanian", "The Daily Pennsylvanian startup articles", "news", dpPages[0].url, JSON.stringify([UNIV]), ctx.retrievedAt);
  for (const page of dpPages) {
    const html = await fetchText(page.url);
    const text = norm(cheerio.load(html)("body").text());
    if (!page.must.every((bit) => text.includes(bit) || html.includes(bit))) {
      console.log(`DP skip ${page.url}: expected phrases missing`);
      continue;
    }
    const snapshotId = snap("src_daily_pennsylvanian", page.url, page.company, html);
    const projectId = upsertProject(page.company, "company", page.excerpt, page.website, true);
    const claimId = claimOnce({
      entityType: "project",
      entityId: projectId,
      claimType: "news_mention",
      sourceId: "src_daily_pennsylvanian",
      sourceUrl: page.url,
      snapshotId,
      excerpt: page.excerpt,
      value: { company: page.company },
      label: "observed_fact",
      published: "2026-04-21",
    });
    linkUniversity(projectId, claimId);
    stats.dpCompanies++;
    if (page.founder) {
      const pid = personIdFor(page.founder);
      const affClaim = claimOnce({
        entityType: "person",
        entityId: pid,
        claimType: "affiliation",
        sourceId: "src_daily_pennsylvanian",
        sourceUrl: page.url,
        snapshotId,
        excerpt: page.excerpt,
        value: { company: page.company },
        label: "analyst_inference",
      });
      if (affClaim && !findAff.get(pid, UNIV, "DP profile")) insertAff.run(newId("aff"), pid, UNIV, "DP profile", page.status, affClaim);
      if (affClaim && !findRole.get(pid, projectId, "founder")) {
        insertRole.run(newId("ppr"), pid, projectId, "founder", affClaim);
        if (!findRel.get("person", pid, "project", projectId, "founded")) {
          insertRel.run(newId("rel"), "person", pid, "project", projectId, "founded", JSON.stringify([affClaim]));
        }
      }
    } else {
      for (const named of [
        { name: "Natassja Kuznetsova", role: "CEO", status: "older_alumni" },
        { name: "Corina Chen", role: "CTO", status: "current_student" },
      ]) {
        if (!text.includes(named.name)) continue;
        const pid = personIdFor(named.name);
        const affClaim = claimOnce({
          entityType: "person",
          entityId: pid,
          claimType: "affiliation",
          sourceId: "src_daily_pennsylvanian",
          sourceUrl: page.url,
          snapshotId,
          excerpt: page.excerpt,
          value: { company: page.company, title: named.role },
          label: "analyst_inference",
        });
        if (affClaim && !findAff.get(pid, UNIV, named.role)) insertAff.run(newId("aff"), pid, UNIV, named.role, named.status, affClaim);
      }
    }
    await sleep(400);
  }

  console.log(JSON.stringify(stats, null, 2));
}

const isDirectRun = import.meta.url === pathToFileURL(path.resolve(process.argv[1] ?? "")).href;
if (isDirectRun) {
  const run = DRY ? dry() : live();
  run.catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
