// Detail payload for a node on the network map. Every link is an id already
// in the map, or a stored profile URL. Investor names come from company_facts
// or a confirmed DRF portfolio match.

import { getDb } from "../db/client";
import { CAMPUSES } from "./campuses";
import { ownWebsite, publicLink } from "./company-link";
import { assembleCompanyProfile, displayedFunding, type CompanyFactRecord } from "./company-profile";
import { enrollmentBadge } from "./founder-status";
import { directoryLabel, hotspotGroupByMapId, hotspotGroups, personIdsForPlace, projectIdsForPlace, relatedHotspotsForPerson, relatedHotspotsForProject } from "./hotspots";
import { bestCard, hotspotHref, samePlace, SECTION_SHORT, tierBandLabel } from "./hotspot-model";
import { bestPersonLink, linkedinAction, type LinkedInAction, type PersonLinkTarget } from "./person-link";
import { assembleProfileLinks, type ProfileIconLink } from "./profile-links";

export interface FocusLink {
  id: string;
  name: string;
  role: string | null;
  round: string | null;
  sourceUrl: string | null;
  pageHref?: string | null;
  linkedin?: LinkedInAction | null;
}

export interface NetworkFocus {
  id: string;
  kind: "person" | "startup" | "campus" | "investor" | "program" | "organization";
  name: string;
  subtitle: string | null;
  href: string | null;
  hrefLabel: string | null;
  website: { url: string; label: string } | null;
  link: PersonLinkTarget | null;
  linkedin: LinkedInAction | null;
  profileLinks: ProfileIconLink[];
  facts: { label: string; value: string; sourceUrl: string | null; excerpt: string | null }[];
  links: { heading: string; items: FocusLink[] }[];
  hotspotHref?: string | null;
  hotspotLabel?: string | null;
}

const DRF_ID = "inv_dorm_room_fund";

function roleLabel(role: string | null): string | null {
  if (!role) return null;
  return role.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function enrollmentLine(status: string | null, label: string | null, basis: string | null): string | null {
  const badge = enrollmentBadge(status, label);
  if (badge === "Unknown") return null;
  return basis === "inferred" ? `${badge} est.` : badge;
}

function personHref(id: string, potential: boolean): string {
  const params = new URLSearchParams({
    founder: id,
    enroll: "current_student,recent_grad,older_alumni",
  });
  if (potential) params.set("pool", "potential");
  return `/founder/discover?${params.toString()}`;
}

function linkedinByPerson(
  db: ReturnType<typeof getDb>,
  people: { id: string; name: string; aliases_json: string }[],
  company: string
): Map<string, LinkedInAction> {
  const out = new Map<string, LinkedInAction>();
  if (!people.length) return out;
  const ids = people.map((person) => person.id);
  const marks = ids.map(() => "?").join(",");
  const schools = db
    .prepare(
      `SELECT a.person_id, u.name FROM affiliations a
       JOIN universities u ON u.id = a.university_id
       WHERE a.person_id IN (${marks})`
    )
    .all(...ids) as { person_id: string; name: string }[];
  const schoolBy = new Map<string, string>();
  for (const row of schools) if (!schoolBy.has(row.person_id)) schoolBy.set(row.person_id, row.name);
  const claims = db
    .prepare(
      `SELECT entity_id, value_json FROM claims
       WHERE entity_type = 'person' AND claim_type = 'linkedin_candidate' AND verification_state = 'unverified'
         AND entity_id IN (${marks})`
    )
    .all(...ids) as { entity_id: string; value_json: string }[];
  const candidateBy = new Map<string, string>();
  for (const row of claims) {
    if (candidateBy.has(row.entity_id)) continue;
    try {
      const value = JSON.parse(row.value_json) as { linkedin?: unknown };
      if (typeof value.linkedin === "string" && value.linkedin.includes("linkedin.com/in/")) candidateBy.set(row.entity_id, value.linkedin);
    } catch {
      // skip
    }
  }
  for (const person of people) {
    out.set(
      person.id,
      linkedinAction({
        name: person.name,
        aliasesJson: person.aliases_json,
        candidateUrl: candidateBy.get(person.id) ?? null,
        school: schoolBy.get(person.id) ?? null,
        company,
      })
    );
  }
  return out;
}

function investorId(name: string): string {
  return `inv_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
}

export function getNetworkFocus(id: string): NetworkFocus | null {
  const db = getDb();
  if (id.startsWith("hsn_")) return hotspotFocus(id);
  if (id.startsWith("univ_")) return campusFocus(db, id);
  if (id.startsWith("inv_")) return investorFocus(db, id);
  const basisSql = (db.prepare(`PRAGMA table_info(people)`).all() as { name: string }[]).some((column) => column.name === "enrollment_basis")
    ? "enrollment_basis"
    : "NULL AS enrollment_basis";
  const person = db
    .prepare(`SELECT id, name, aliases_json, founder_status, enrollment_status, enrollment_label, ${basisSql} FROM people WHERE id = ?`)
    .get(id) as
    | { id: string; name: string; aliases_json: string; founder_status: string | null; enrollment_status: string | null; enrollment_label: string | null; enrollment_basis: string | null }
    | undefined;
  if (person) return personFocus(db, person);
  const project = db
    .prepare(`SELECT id, name, kind, description, website_url, primary_link, primary_link_kind, is_investable_candidate FROM projects WHERE id = ?`)
    .get(id) as
    | {
        id: string;
        name: string;
        kind: string;
        description: string | null;
        website_url: string | null;
        primary_link: string | null;
        primary_link_kind: string | null;
        is_investable_candidate: number;
      }
    | undefined;
  if (!project) return null;
  if (project.kind === "company" && project.is_investable_candidate === 1) return startupFocus(db, project);
  return programFocus(db, project);
}

function personFocus(
  db: ReturnType<typeof getDb>,
  person: { id: string; name: string; aliases_json: string; founder_status: string | null; enrollment_status: string | null; enrollment_label: string | null; enrollment_basis: string | null }
): NetworkFocus {
  const school = db
    .prepare(
      `SELECT u.name FROM affiliations a JOIN universities u ON u.id = a.university_id WHERE a.person_id = ? LIMIT 1`
    )
    .get(person.id) as { name: string } | undefined;
  const candidates = db
    .prepare(
      `SELECT value_json FROM claims
       WHERE entity_type = 'person' AND entity_id = ? AND claim_type = 'linkedin_candidate' AND verification_state = 'unverified'`
    )
    .all(person.id) as { value_json: string }[];
  const linkedinCandidates: { url: string }[] = [];
  for (const row of candidates) {
    try {
      const value = JSON.parse(row.value_json) as { linkedin?: string };
      if (value.linkedin?.includes("linkedin.com/in/")) linkedinCandidates.push({ url: value.linkedin });
    } catch {
      // skip
    }
  }
  const profileClaims = (
    db
      .prepare(`SELECT value_json, excerpt, source_url FROM claims WHERE entity_type = 'person' AND entity_id = ? AND claim_type = 'profile_link'`)
      .all(person.id) as { value_json: string; excerpt: string; source_url: string | null }[]
  ).map((row) => ({ valueJson: row.value_json, excerpt: row.excerpt, sourceUrl: row.source_url }));
  const roles = db
    .prepare(
      `SELECT p.id, p.name, p.kind, p.is_investable_candidate, ppr.role
       FROM person_project_roles ppr JOIN projects p ON p.id = ppr.project_id
       WHERE ppr.person_id = ?
       ORDER BY CASE WHEN ppr.role LIKE '%founder%' THEN 0 ELSE 1 END, p.name`
    )
    .all(person.id) as { id: string; name: string; kind: string; is_investable_candidate: number; role: string }[];
  const founderRole = roles.find((role) => role.role.toLowerCase().includes("founder"));
  const companies = roles
    .filter((role) => role.kind === "company" && role.is_investable_candidate === 1)
    .map((role) => ({ id: role.id, name: role.name, role: roleLabel(role.role), round: null, sourceUrl: null }));
  const programIds = new Set(
    (
      db
        .prepare(
          `SELECT p.id FROM projects p
           WHERE p.kind = 'project' AND (
             p.id IN (
               SELECT source_entity_id FROM relationships
               WHERE relationship_type = 'affiliated_with' AND source_entity_type = 'project' AND target_entity_type = 'university'
             )
             OR p.id IN (SELECT project_id FROM person_project_roles GROUP BY project_id HAVING COUNT(DISTINCT person_id) >= 8)
           )`
        )
        .all() as { id: string }[]
    ).map((row) => row.id)
  );
  const programs = roles
    .filter((role) => programIds.has(role.id))
    .map((role) => ({ id: role.id, name: role.name, role: roleLabel(role.role), round: null, sourceUrl: null }));
  const hotspots = relatedHotspotsForPerson(person.id).map((item) => ({
    id: item.mapNodeId,
    name: item.place,
    role: item.campus,
    round: null,
    sourceUrl: null,
    pageHref: item.href,
  }));
  return {
    id: person.id,
    kind: "person",
    name: person.name,
    subtitle: [roleLabel(founderRole?.role ?? roles[0]?.role ?? null), school?.name, enrollmentLine(person.enrollment_status, person.enrollment_label, person.enrollment_basis)]
      .filter(Boolean)
      .join(" · "),
    href: personHref(person.id, person.founder_status === "potential"),
    hrefLabel: "Open person",
    website: null,
    link: bestPersonLink({ aliasesJson: person.aliases_json, linkedinCandidates }),
    linkedin: linkedinAction({
      name: person.name,
      aliasesJson: person.aliases_json,
      candidateUrl: linkedinCandidates[0]?.url ?? null,
      school: school?.name ?? null,
      company: companies[0]?.name ?? null,
    }),
    profileLinks: assembleProfileLinks(person.aliases_json, profileClaims).profileLinks,
    facts: [],
    links: [
      { heading: "Companies", items: companies },
      { heading: "Programs", items: programs },
      { heading: "Hotspots", items: hotspots },
    ].filter((group) => group.items.length > 0),
  };
}

function startupFocus(
  db: ReturnType<typeof getDb>,
  project: { id: string; name: string; description: string | null; website_url: string | null; primary_link: string | null; primary_link_kind: string | null }
): NetworkFocus {
  const facts = db
    .prepare(
      `SELECT fact_key, value_text, amount_usd, amount_status, detail_json, source_url, excerpt, origin
       FROM company_facts WHERE project_id = ?`
    )
    .all(project.id) as {
    fact_key: string;
    value_text: string;
    amount_usd: number | null;
    amount_status: string | null;
    detail_json: string;
    source_url: string;
    excerpt: string;
    origin: string;
  }[];
  const profile = assembleCompanyProfile(
    facts.map(
      (row): CompanyFactRecord => ({
        factKey: row.fact_key,
        valueText: row.value_text,
        amountUsd: row.amount_usd,
        amountStatus: row.amount_status,
        detailJson: row.detail_json,
        sourceUrl: row.source_url,
        excerpt: row.excerpt,
        origin: row.origin,
      })
    )
  );
  const shown: NetworkFocus["facts"] = [];
  if (profile.foundedYear) shown.push({ label: "Founded", value: profile.foundedYear.text, sourceUrl: profile.foundedYear.sourceUrl, excerpt: profile.foundedYear.excerpt });
  const funding = displayedFunding(profile);
  if (funding) shown.push({ label: "Funding", value: funding.text, sourceUrl: funding.sourceUrl, excerpt: funding.excerpt });
  const round = profile.rounds[0];
  if (round) {
    const text = [round.stage, round.amountText, round.date, round.leads.length ? `led by ${round.leads.join(", ")}` : null].filter(Boolean).join(" · ");
    if (text) shown.push({ label: "Latest round", value: text, sourceUrl: round.sourceUrl, excerpt: round.excerpt });
  }
  if (profile.hq) shown.push({ label: "HQ", value: profile.hq.text, sourceUrl: profile.hq.sourceUrl, excerpt: profile.hq.excerpt });
  const founders = (
    db
      .prepare(
        `SELECT pe.id, pe.name, pe.aliases_json, ppr.role FROM person_project_roles ppr
         JOIN people pe ON pe.id = ppr.person_id
         WHERE ppr.project_id = ? AND ppr.role LIKE '%founder%'
         ORDER BY pe.name`
      )
      .all(project.id) as { id: string; name: string; aliases_json: string; role: string }[]
  ).map((row) => ({ id: row.id, name: row.name, aliases_json: row.aliases_json, role: roleLabel(row.role) }));
  const founderLinkedIn = linkedinByPerson(db, founders, project.name);
  const investors: FocusLink[] = profile.investors.map((investor) => ({
    id: investorId(investor.name),
    name: investor.round ? `${investor.name} · ${investor.round}${investor.kind === "lead" ? " · led the round" : ""}` : investor.name,
    role: null,
    round: investor.round,
    sourceUrl: investor.sourceUrl,
  }));
  const site = publicLink(project.website_url, project.primary_link, project.primary_link_kind);
  const official = ownWebsite(project.website_url);
  const hotspots = relatedHotspotsForProject(project.id).map((item) => ({
    id: item.mapNodeId,
    name: item.place,
    role: item.campus,
    round: null,
    sourceUrl: null,
    pageHref: item.href,
  }));
  return {
    id: project.id,
    kind: "startup",
    name: project.name,
    subtitle: profile.description?.text ?? project.description,
    href: `/startup/${project.id}`,
    hrefLabel: "Open company",
    website: site ? { url: site.url, label: official ? "Visit website" : site.label } : null,
    link: null,
    linkedin: null,
    profileLinks: [],
    facts: shown,
    links: [
      {
        heading: "Founders",
        items: founders.map((row) => ({
          id: row.id,
          name: row.name,
          role: row.role,
          round: null,
          sourceUrl: null,
          linkedin: founderLinkedIn.get(row.id) ?? null,
        })),
      },
      { heading: "Investors", items: investors },
      { heading: "Hotspots", items: hotspots },
    ].filter((group) => group.items.length > 0),
  };
}

function campusFocus(db: ReturnType<typeof getDb>, id: string): NetworkFocus | null {
  const uni = db.prepare(`SELECT id, name FROM universities WHERE id = ?`).get(id) as { id: string; name: string } | undefined;
  if (!uni) return null;
  const people = db.prepare(`SELECT COUNT(DISTINCT person_id) AS n FROM affiliations WHERE university_id = ?`).get(id) as { n: number };
  const programs = db
    .prepare(
      `SELECT DISTINCT p.id, p.name FROM relationships r
       JOIN projects p ON p.id = r.source_entity_id AND p.kind = 'project'
       WHERE r.relationship_type = 'affiliated_with' AND r.target_entity_id = ?
       ORDER BY p.name`
    )
    .all(id) as { id: string; name: string }[];
  const startups = db
    .prepare(
      `SELECT p.id, p.name FROM relationships r
       JOIN projects p ON p.id = r.source_entity_id
       WHERE r.relationship_type = 'affiliated_with' AND r.target_entity_id = ?
         AND p.kind = 'company' AND p.is_investable_candidate = 1
       ORDER BY CASE p.signal_tier WHEN 'S' THEN 0 WHEN 'A' THEN 1 WHEN 'B' THEN 2 ELSE 3 END, p.name
       LIMIT 24`
    )
    .all(id) as { id: string; name: string }[];
  const short = CAMPUSES.find((campus) => campus.id === id)?.shortLabel ?? uni.name;
  return {
    id,
    kind: "campus",
    name: uni.name,
    subtitle: `${people.n.toLocaleString()} affiliated people`,
    href: `/founder/discover?university=${id}`,
    hrefLabel: `Open ${short} founders`,
    website: null,
    link: null,
    linkedin: null,
    profileLinks: [],
    facts: [],
    links: [
      { heading: "Programs", items: programs.map((item) => ({ id: item.id, name: item.name, role: null, round: null, sourceUrl: null })) },
      { heading: "Startups", items: startups.map((item) => ({ id: item.id, name: item.name, role: null, round: null, sourceUrl: null })) },
    ].filter((group) => group.items.length > 0),
  };
}

function programFocus(db: ReturnType<typeof getDb>, project: { id: string; name: string }): NetworkFocus {
  const campus = db
    .prepare(
      `SELECT u.id, u.name FROM relationships r JOIN universities u ON u.id = r.target_entity_id
       WHERE r.source_entity_id = ? AND r.relationship_type = 'affiliated_with' AND r.target_entity_type = 'university' LIMIT 1`
    )
    .get(project.id) as { id: string; name: string } | undefined;
  const members = db
    .prepare(
      `SELECT pe.id, pe.name, ppr.role FROM person_project_roles ppr
       JOIN people pe ON pe.id = ppr.person_id
       WHERE ppr.project_id = ?
       ORDER BY pe.name LIMIT 40`
    )
    .all(project.id) as { id: string; name: string; role: string }[];
  const directory = directoryLink(project.id, project.name);
  return {
    id: project.id,
    kind: "program",
    name: project.name,
    subtitle: campus?.name ?? null,
    href: campus ? `/founder/discover?university=${campus.id}` : null,
    hrefLabel: campus ? "Open campus founders" : null,
    website: null,
    link: null,
    linkedin: null,
    profileLinks: [],
    facts: [],
    hotspotHref: directory?.href ?? null,
    hotspotLabel: directory ? "Open hotspot" : null,
    links: [
      { heading: "Members", items: members.map((item) => ({ id: item.id, name: item.name, role: roleLabel(item.role), round: null, sourceUrl: null })) },
    ],
  };
}

function hotspotFocus(id: string): NetworkFocus | null {
  const group = hotspotGroupByMapId(id);
  if (!group) return null;
  const card = bestCard(group.cards);
  const ranked = relatedPeople(group.placeKey);
  const startups = relatedStartups(group.placeKey);
  const sections = [...new Set(group.cards.map((item) => item.section))];
  return {
    id,
    kind: "organization",
    name: directoryLabel(group.cards),
    subtitle: card.type || null,
    href: hotspotHref(card),
    hrefLabel: "Open hotspot",
    website: card.url ? { url: card.url, label: "Directory link" } : null,
    link: null,
    linkedin: null,
    profileLinks: [],
    hotspotHref: hotspotHref(card),
    hotspotLabel: "Open hotspot",
    facts: [
      { label: "Tier", value: tierBandLabel(card.tier), sourceUrl: card.url || null, excerpt: card.whatYoullFind },
      { label: "Category", value: sections.map((section) => SECTION_SHORT[section]).join(" · "), sourceUrl: null, excerpt: null },
      { label: "Campus", value: [...new Set(group.cards.map((item) => item.campus))].join(" · "), sourceUrl: null, excerpt: null },
    ].filter((fact) => fact.value),
    links: [
      { heading: "Founders", items: ranked.founders },
      { heading: "Potential founders", items: ranked.potential },
      { heading: "Startups", items: startups },
    ].filter((item) => item.items.length > 0),
  };
}

function directoryLink(id: string, name: string): { href: string } | null {
  const group = hotspotGroupByMapId(id) ?? hotspotGroups().find((item) => samePlace(item.label, name) || item.cards.some((card) => samePlace(card.place, name)));
  if (!group) return null;
  return { href: hotspotHref(bestCard(group.cards)) };
}

function relatedPeople(placeKey: string): { founders: FocusLink[]; potential: FocusLink[] } {
  const db = getDb();
  const ids = personIdsForPlace(placeKey);
  if (!ids.length) return { founders: [], potential: [] };
  const rows = db
    .prepare(
      `SELECT pe.id, pe.name, pe.founder_status,
         EXISTS (
           SELECT 1 FROM person_project_roles ppr
           JOIN projects p ON p.id = ppr.project_id
           WHERE ppr.person_id = pe.id AND p.kind = 'company' AND p.is_investable_candidate = 1 AND ppr.role LIKE '%founder%'
         ) AS has_startup
       FROM people pe WHERE pe.id IN (${ids.map(() => "?").join(",")})`
    )
    .all(...ids) as { id: string; name: string; founder_status: string | null; has_startup: number }[];
  const founders: FocusLink[] = [];
  const potential: FocusLink[] = [];
  const ranked = [...rows].sort((a, b) => a.name.localeCompare(b.name));
  for (const row of ranked) {
    const link = { id: row.id, name: row.name, role: null, round: null, sourceUrl: null };
    if (row.has_startup === 1) founders.push({ ...link, role: "Founder" });
    else if (row.founder_status === "potential") potential.push({ ...link, role: "Potential founder" });
  }
  return { founders: founders.slice(0, 40), potential: potential.slice(0, 40) };
}

function relatedStartups(placeKey: string): FocusLink[] {
  const db = getDb();
  const ids = projectIdsForPlace(placeKey).slice(0, 24);
  if (!ids.length) return [];
  const rows = db.prepare(`SELECT id, name FROM projects WHERE id IN (${ids.map(() => "?").join(",")}) AND kind = 'company' ORDER BY name`).all(...ids) as { id: string; name: string }[];
  return rows.map((row) => ({ id: row.id, name: row.name, role: null, round: null, sourceUrl: null }));
}

function investorFocus(db: ReturnType<typeof getDb>, id: string): NetworkFocus | null {
  if (id === DRF_ID) {
    const rows = db
      .prepare(
        `SELECT p.id, p.name, m.matched_name, m.source_url FROM portfolio_memberships m
         JOIN projects p ON p.id = m.project_id
         WHERE m.match_status = 'confirmed' AND p.kind = 'company' AND p.is_investable_candidate = 1
         ORDER BY p.name`
      )
      .all() as { id: string; name: string; matched_name: string; source_url: string }[];
    const directory = directoryLink(id, "Dorm Room Fund");
    return {
      id,
      kind: "investor",
      name: "Dorm Room Fund",
      subtitle: "Confirmed matches from the public portfolio directory",
      href: "https://www.dormroomfund.com/portfolio",
      hrefLabel: "Portfolio directory",
      website: null,
      link: null,
      linkedin: null,
      profileLinks: [],
      facts: [],
      hotspotHref: directory?.href ?? null,
      hotspotLabel: directory ? "Open hotspot" : null,
      links: [
        {
          heading: "Startups",
          items: rows.map((row) => ({
            id: row.id,
            name: row.name,
            role: null,
            round: null,
            sourceUrl: "https://www.dormroomfund.com/portfolio",
          })),
        },
      ],
    };
  }
  const names = db.prepare(`SELECT DISTINCT value_text FROM company_facts WHERE fact_key = 'investor'`).all() as { value_text: string }[];
  const name = names.map((row) => row.value_text.replace(/\s+/g, " ").trim()).find((value) => investorId(value) === id);
  if (!name) return null;
  const rows = db
    .prepare(
      `SELECT p.id, p.name, f.detail_json, f.source_url FROM company_facts f
       JOIN projects p ON p.id = f.project_id
       WHERE f.fact_key = 'investor' AND f.value_text = ? AND p.kind = 'company' AND p.is_investable_candidate = 1
       ORDER BY p.name`
    )
    .all(name) as { id: string; name: string; detail_json: string; source_url: string }[];
  const directory = directoryLink(id, name);
  return {
    id,
    kind: "investor",
    name,
    subtitle: `${rows.length} sourced portfolio ${rows.length === 1 ? "company" : "companies"}`,
    href: directory?.href ?? null,
    hrefLabel: directory ? "Open hotspot" : null,
    website: null,
    link: null,
    linkedin: null,
    profileLinks: [],
    facts: [],
    hotspotHref: directory?.href ?? null,
    hotspotLabel: directory ? "Open hotspot" : null,
    links: [
      {
        heading: "Startups",
        items: rows.map((row) => {
          let round: string | null = null;
          try {
            const detail = JSON.parse(row.detail_json || "{}") as { round?: unknown };
            if (typeof detail.round === "string" && detail.round.trim()) round = detail.round.trim();
          } catch {
            round = null;
          }
          return { id: row.id, name: row.name, role: round, round, sourceUrl: row.source_url };
        }),
      },
    ],
  };
}
