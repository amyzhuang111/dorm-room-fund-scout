import { getDb } from "../db/client";
import { loadFounderNetworkLinks } from "./founder-networks";
import { bestPersonLink, confirmedLinkedIn } from "./person-link";
import centers from "@/data/company-city-centers.json";
import campusEvidence from "@/data/campus-country-evidence.json";
import {
  safeAtlasUrl,
  type AtlasData,
  type AtlasNode,
  type AtlasPlace,
  type AtlasGroup,
} from "./network-atlas";

const regions: Record<string, string> = {};
for (const [continent, codes] of Object.entries({
  "North America": "US CA MX GT BZ HN SV NI CR PA CU JM HT DO BS BB TT",
  "South America": "BR AR CL CO PE EC VE UY PY BO GY SR GF",
  Europe:
    "GB IE FR DE ES PT IT NL BE LU CH AT DK SE NO FI IS PL CZ SK HU RO BG GR EE LV LT UA BY MD AL RS BA HR SI ME MK MT CY",
  Asia: "CN HK MO TW JP KR KP IN PK BD LK NP BT SG MY ID TH VN KH LA MM PH BN TL AF IR IQ IL PS JO LB SY SA AE QA KW BH OM YE TR GE AM AZ KZ UZ TM KG TJ MN RU",
  Africa:
    "ZA NG KE GH EG MA TN DZ ET UG TZ RW SN CI CM ZM ZW BW NA MZ AO CD CG SD SS LY SO MG MU MW NE ML BF BJ TG SL LR GN GM CV MR ER DJ BI GA GQ SZ LS SC KM ST TD CF",
  Oceania: "AU NZ FJ PG WS TO VU SB KI FM PW MH NR TV",
}))
  for (const code of codes.split(" ")) regions[code] = continent;
const names = new Intl.DisplayNames(["en"], { type: "region" });
const countries = new Map(
  Object.keys(regions).flatMap((code) => [
    [code, code],
    [names.of(code)!, code],
  ]),
);
countries.set("United States of America", "US");
countries.set("UK", "GB");
countries.set("Hong Kong", "HK");
countries.set("South Korea", "KR");
countries.set("Taiwan", "TW");
function countryPlace(
  country: string,
  campus = "",
  basis: AtlasPlace["basis"] = "campus",
  source?: string,
): AtlasPlace {
  const code = countries.get(country);
  return {
    campus,
    country: code ? names.of(code)! : country,
    continent: code ? regions[code] : "Location not yet verified",
    basis,
    source,
  };
}

export function buildNetworkAtlas(): AtlasData {
  const db = getDb();
  const nodes: AtlasNode[] = [];
  const index = new Map<string, number>();
  const add = (node: AtlasNode) => {
    index.set(node.id, nodes.length);
    nodes.push(node);
  };
  const profileLinks = (aliases: string) => {
    const out: AtlasNode["links"] = [];
    const li = safeAtlasUrl(confirmedLinkedIn(aliases));
    if (li) out.push({ label: "LinkedIn", url: li });
    const best = bestPersonLink({ aliasesJson: aliases });
    if (best && safeAtlasUrl(best.url) && !out.some((l) => l.url === best.url))
      out.push({ label: best.label, url: best.url });
    try {
      const values: unknown = JSON.parse(aliases);
      if (Array.isArray(values)) for (const a of values) {
        if (typeof a !== "string") continue;
        const match = a.match(/^(site|github|devpost|linkedin):(https?:\/\/.+)$/);
        const url = safeAtlasUrl(match?.[2]);
        if (match && url && !out.some(l=>l.url===url)) out.push({label:match[1]==="site"?"Website":match[1],url});
      }
    } catch { /* malformed aliases must not break the full map */ }
    return out;
  };
  for (const r of db
    .prepare(
      `SELECT DISTINCT p.id,p.name,p.aliases_json FROM people p WHERE COALESCE(p.founder_status,'') != 'removed' AND (p.founder_status IN ('founder','confirmed') OR EXISTS (SELECT 1 FROM person_project_roles r WHERE r.person_id=p.id AND lower(r.role) LIKE '%founder%')) ORDER BY p.id`,
    )
    .all() as { id: string; name: string; aliases_json: string }[]) {
    add({
      id: r.id,
      name: r.name,
      kind: "founder",
      places: [],
      links: profileLinks(r.aliases_json),
    });
  }
  for (const r of db
    .prepare(
      "SELECT id,name,website_url,primary_link,description FROM projects WHERE kind='company' ORDER BY id",
    )
    .all() as {
    id: string;
    name: string;
    website_url: string;
    primary_link: string;
    description: string;
  }[]) {
    const links: AtlasNode["links"] = [];
    for (const [label, value] of [
      ["Website", r.website_url],
      ["Public profile", r.primary_link],
    ]) {
      const url = safeAtlasUrl(value);
      if (url && !links.some((l) => l.url === url)) links.push({ label, url });
    }
    add({
      id: r.id,
      name: r.name,
      kind: "startup",
      places: [],
      links,
      description: r.description || undefined,
    });
  }
  for (const r of db
    .prepare(
      `SELECT DISTINCT a.person_id,u.name,u.country,u.coord_source FROM affiliations a JOIN universities u ON u.id=a.university_id ORDER BY a.person_id,u.id`,
    )
    .all() as {
    person_id: string;
    name: string;
    country: string | null;
    coord_source: string | null;
  }[]) {
    const i = index.get(r.person_id);
    if (i === undefined) continue;
    const evidence = (
      campusEvidence as Record<string, { country: string; source: string }>
    )[r.name];
    const place = countryPlace(
      r.country || evidence?.country || "Location not yet verified",
      r.name,
      "campus",
      r.coord_source || evidence?.source,
    );
    if (!nodes[i].places.some((p) => p.campus === place.campus))
      nodes[i].places.push(place);
  }
  for (const r of db.prepare(`SELECT entity_id,claim_type,value_json,verification_state FROM claims WHERE entity_type='person' AND claim_type IN ('profile_link','linkedin_candidate') AND verification_state != 'disputed'`).all() as {entity_id:string;claim_type:string;value_json:string;verification_state:string}[]) {
    const i=index.get(r.entity_id);if(i===undefined)continue;
    try {
      const value=JSON.parse(r.value_json) as {url?:string;linkedin?:string;type?:string;status?:string};
      const url=safeAtlasUrl(value.url||value.linkedin);if(!url||nodes[i].links.some(l=>l.url===url))continue;
      const verified=value.status==="confirmed"||r.verification_state==="corroborated";
      const label=r.claim_type==="linkedin_candidate"?"LinkedIn":value.type==="website"?"Website":"Public profile";
      nodes[i].links.push({label:`${label}${verified?"":" (unverified)"}`,url});
    } catch { /* ignore invalid claims, not the record */ }
  }
  const companies: AtlasData["companies"] = [];
  const companyKeys = new Set<string>();
  for (const r of db
    .prepare(
      `SELECT DISTINCT r.source_entity_id AS id,u.name,u.country,u.coord_source FROM relationships r JOIN universities u ON u.id=r.target_entity_id WHERE r.source_entity_type IN ('project','person') AND r.target_entity_type='university' AND r.relationship_type IN ('affiliated_with','enrolled_at','graduated_from') AND r.owner IS NULL`,
    )
    .all() as {
    id: string;
    name: string;
    country: string | null;
    coord_source: string | null;
  }[]) {
    const i = index.get(r.id);
    if (i === undefined) continue;
    const evidence = (
      campusEvidence as Record<string, { country: string; source: string }>
    )[r.name];
    const p = countryPlace(
      r.country || evidence?.country || "Location not yet verified",
      r.name,
      "campus",
      r.coord_source || evidence?.source,
    );
    if (!nodes[i].places.some((q) => q.campus === p.campus))
      nodes[i].places.push(p);
  }
  for (const r of db
    .prepare(
      "SELECT person_id,project_id FROM person_project_roles WHERE lower(role) LIKE '%founder%'",
    )
    .all() as { person_id: string; project_id: string }[]) {
    const a = index.get(r.person_id),
      b = index.get(r.project_id);
    if (a === undefined || b === undefined || companyKeys.has(`${a}:${b}`))
      continue;
    companies.push([a, b]);
    companyKeys.add(`${a}:${b}`);
    for (const p of nodes[a].places)
      if (!nodes[b].places.some((q) => q.campus === p.campus))
        nodes[b].places.push(p);
  }
  const cityLookup = new Map(centers.cities.map((c) => [c.storedLabel, c]));
  for (const r of db
    .prepare(
      "SELECT project_id,fact_key,value_text,source_url FROM company_facts WHERE fact_key IN ('hq','company_linkedin','website') ORDER BY rowid",
    )
    .all() as {
    project_id: string;
    fact_key: string;
    value_text: string;
    source_url: string;
  }[]) {
    const i = index.get(r.project_id);
    if (i === undefined) continue;
    if (r.fact_key === "hq") {
      const c = cityLookup.get(r.value_text.trim());
      if (c && !nodes[i].places.some((p) => p.basis === "headquarters"))
        nodes[i].places.push(
          countryPlace(c.country, "", "headquarters", r.source_url),
        );
    } else {
      const url = safeAtlasUrl(r.value_text);
      if (url && !nodes[i].links.some((l) => l.url === url))
        nodes[i].links.push({
          label:
            r.fact_key === "company_linkedin" ? "Company LinkedIn" : "Website",
          url,
        });
    }
  }
  const groups = new Map<string, AtlasGroup>();
  for (const [a, b] of companies)
    for (const p of nodes[b].places.filter((p) => p.basis === "headquarters")) {
      if (
        !nodes[a].places.some(
          (q) => q.basis === "headquarters" && q.country === p.country,
        )
      )
        nodes[a].places.push(p);
    }
  for (const l of loadFounderNetworkLinks().links) {
    const g: AtlasGroup = groups.get(l.networkId) ?? {
      id: l.networkId,
      name: l.label,
      kind: l.kind,
      members: [],
      evidenceByMember: {},
    };
    for (const id of [l.founderId, l.companyId]) {
      const i = index.get(id);
      if (i !== undefined && !g.members.includes(i)) g.members.push(i);
      if (i !== undefined && l.sourceUrl) {
        g.evidenceByMember ??= {};
        g.evidenceByMember[i] = l.sourceUrl;
      }
    }
    groups.set(g.id, g);
  }
  // Keep explicit program/club memberships even when the founder has no investable company.
  const explicit = db
    .prepare(
      `SELECT r.source_entity_id AS member,p.id,p.name,p.primary_link FROM relationships r JOIN projects p ON p.id=r.target_entity_id WHERE r.relationship_type IN ('part_of_program','participated_in_program') AND r.owner IS NULL ORDER BY p.id`,
    )
    .all() as {
    member: string;
    id: string;
    name: string;
    primary_link: string | null;
  }[];
  for (const r of explicit) {
    const i = index.get(r.member);
    if (i === undefined) continue;
    const existing = [...groups.values()].find(
      (g) => g.name.toLowerCase() === r.name.toLowerCase(),
    );
    const g = existing ?? {
      id: `program:${r.id}`,
      name: r.name,
      kind: /penn labs|electric racing|aerial robotics/i.test(r.name)
        ? "club / team"
        : "program",
      members: [],
      source: safeAtlasUrl(r.primary_link) || undefined,
    };
    if (!g.members.includes(i)) g.members.push(i);
    groups.set(g.id, g);
  }
  return {
    nodes,
    companies,
    groups: [...groups.values()],
    generatedAt: new Date().toISOString(),
  };
}
