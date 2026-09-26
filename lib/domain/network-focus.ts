// Detail payload for a node on the network map. Every link is an id already
// in the map, or a stored profile URL. Investor names come from company_facts
// or a confirmed DRF portfolio match.

import { getDb } from "../db/client";
import { CAMPUSES } from "./campuses";
import { ownWebsite, publicLink } from "./company-link";
import { assembleCompanyProfile, type CompanyFactRecord } from "./company-profile";
import { enrollmentBadge } from "./founder-status";
import { bestPersonLink, type PersonLinkTarget } from "./person-link";
import { assembleProfileLinks, type ProfileIconLink } from "./profile-links";

export interface FocusLink {
  id: string;
  name: string;
  role: string | null;
  round: string | null;
  sourceUrl: string | null;
}

export interface NetworkFocus {
  id: string;
  kind: "person" | "startup" | "campus" | "investor" | "program";
  name: string;
  subtitle: string | null;
  href: string | null;
  hrefLabel: string | null;
  website: { url: string; label: string } | null;
  link: PersonLinkTarget | null;
  profileLinks: ProfileIconLink[];
  facts: { label: string; value: string; sourceUrl: string | null; excerpt: string | null }[];
  links: { heading: string; items: FocusLink[] }[];
}

const DRF_ID = "inv_dorm_room_fund";

function roleLabel(role: string | null): string | null {
  if (!role) return null;
  return role.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function personHref(id: string, potential: boolean): string {
  const params = new URLSearchParams({
    founder: id,
    enroll: "current_student,recent_grad,older_alumni,unknown",
  });
  if (potential) params.set("pool", "potential");
  return `/founder/discover?${params.toString()}`;
}

function investorId(name: string): string {
  return `inv_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
}

export function getNetworkFocus(id: string): NetworkFocus | null {
  const db = getDb();
  if (id.startsWith("univ_")) return campusFocus(db, id);
  if (id.startsWith("inv_")) return investorFocus(db, id);
  const person = db
    .prepare(`SELECT id, name, aliases_json, founder_status, enrollment_status, enrollment_label FROM people WHERE id = ?`)
    .get(id) as
    | { id: string; name: string; aliases_json: string; founder_status: string | null; enrollment_status: string | null; enrollment_label: string | null }
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
  person: { id: string; name: string; aliases_json: string; founder_status: string | null; enrollment_status: string | null; enrollment_label: string | null }
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
  return {
    id: person.id,
    kind: "person",
    name: person.name,
    subtitle: [roleLabel(founderRole?.role ?? roles[0]?.role ?? null), school?.name, enrollmentBadge(person.enrollment_status, person.enrollment_label)]
      .filter(Boolean)
      .join(" · "),
    href: personHref(person.id, person.founder_status === "potential"),
    hrefLabel: "Open person",
    website: null,
    link: bestPersonLink({ aliasesJson: person.aliases_json, linkedinCandidates }),
    profileLinks: assembleProfileLinks(person.aliases_json, profileClaims).profileLinks,
    facts: [],
    links: [
      { heading: "Companies", items: companies },
      { heading: "Programs", items: programs },
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
  if (profile.funding) shown.push({ label: "Funding", value: profile.funding.text, sourceUrl: profile.funding.sourceUrl, excerpt: profile.funding.excerpt });
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
  ).map((row) => ({ id: row.id, name: row.name, role: roleLabel(row.role), round: null, sourceUrl: bestPersonLink({ aliasesJson: row.aliases_json })?.url ?? null }));
  const investors: FocusLink[] = profile.investors.map((investor) => ({
    id: investorId(investor.name),
    name: investor.round ? `${investor.name} · ${investor.round}${investor.kind === "lead" ? " · led the round" : ""}` : investor.name,
    role: null,
    round: investor.round,
    sourceUrl: investor.sourceUrl,
  }));
  const site = publicLink(project.website_url, project.primary_link, project.primary_link_kind);
  const official = ownWebsite(project.website_url);
  return {
    id: project.id,
    kind: "startup",
    name: project.name,
    subtitle: profile.description?.text ?? project.description,
    href: `/startup/${project.id}`,
    hrefLabel: "Open company",
    website: site ? { url: site.url, label: official ? "Visit website" : site.label } : null,
    link: null,
    profileLinks: [],
    facts: shown,
    links: [
      { heading: "Founders", items: founders },
      { heading: "Investors", items: investors },
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
  return {
    id: project.id,
    kind: "program",
    name: project.name,
    subtitle: campus?.name ?? null,
    href: campus ? `/founder/discover?university=${campus.id}` : null,
    hrefLabel: campus ? "Open campus founders" : null,
    website: null,
    link: null,
    profileLinks: [],
    facts: [],
    links: [
      { heading: "Members", items: members.map((item) => ({ id: item.id, name: item.name, role: roleLabel(item.role), round: null, sourceUrl: null })) },
    ],
  };
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
    return {
      id,
      kind: "investor",
      name: "Dorm Room Fund",
      subtitle: "Confirmed matches from the public portfolio directory",
      href: "https://www.dormroomfund.com/portfolio",
      hrefLabel: "Portfolio directory",
      website: null,
      link: null,
      profileLinks: [],
      facts: [],
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
  return {
    id,
    kind: "investor",
    name,
    subtitle: `${rows.length} sourced portfolio ${rows.length === 1 ? "company" : "companies"}`,
    href: null,
    hrefLabel: null,
    website: null,
    link: null,
    profileLinks: [],
    facts: [],
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
