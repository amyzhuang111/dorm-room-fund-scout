import fs from "node:fs";
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from "d3-force";
import { databasePath, getDb } from "../db/client";
import { CAMPUSES } from "./campuses";
import { publicLink } from "./company-link";
import { sectorLabel } from "./sectors";
import { enrollmentBadge } from "./founder-status";
import { layoutZonedCampus, type LayoutGuide } from "./network-layout";
import { campusOrgCards, campusOrgStamp, orgMatchesLabel, orgsForCampus, zoneWord, type CampusOrg, type OrgZone } from "./network-zones";
import { bestPersonLink } from "./person-link";
import { unverifiedLinkedInByPerson } from "./queries";

export type NodeType = "university" | "community" | "person" | "project";

export interface NetworkGuide extends LayoutGuide {}

export interface NetworkNode {
  id: string;
  type: NodeType;
  label: string;
  sublabel?: string;
  zone?: OrgZone;
  tier?: string;
  x: number;
  y: number;
  /** A URL found on a source page: LinkedIn for a person, website for a company. */
  linkUrl?: string;
  linkLabel?: string;
  linkKind?: string;
}

export interface NetworkEdge {
  source: string;
  target: string;
  relationshipType: string;
  verificationState: string;
  excerpt?: string;
  sourceUrl?: string;
}

export interface NetworkGraph {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  omittedCount: number;
  totalPeople: number;
  legend: { type: NodeType; label: string }[];
  guides?: NetworkGuide[];
}

const MAX_NODES = 140;

interface RawNode {
  id: string;
  type: NodeType;
  label: string;
  sublabel?: string;
  priority: number;
  linkUrl?: string;
  linkLabel?: string;
  linkKind?: string;
  zone?: OrgZone;
  tier?: string;
  /** Kept when a single-campus graph is capped, so clubs stay in the picture. */
  pinned?: boolean;
}

// Evidence-backed neighborhood. Edges come from `relationships`, affiliations,
// and person_project_roles — co-attendance alone never creates a person-to-person
// edge. "Who built with whom" is a path through a shared project node.
export function buildUniversityNetwork(universityId: string): NetworkGraph {
  return buildScoutNetwork(universityId);
}

const networkMemo = new Map<string, { stamp: string; graph: NetworkGraph }>();

export function buildScoutNetwork(universityId?: string, opts?: { sector?: string; excludeIds?: string[]; enrollment?: string[] }): NetworkGraph {
  let stamp = "missing";
  try {
    const st = fs.statSync(databasePath());
    stamp = `${st.mtimeMs}:${st.size}:${campusOrgStamp()}`;
  } catch {
    stamp = `missing:${campusOrgStamp()}`;
  }
  const key = `${universityId ?? ""}|${opts?.sector ?? ""}|${(opts?.enrollment ?? []).join(",")}|${(opts?.excludeIds ?? []).join(",")}`;
  const hit = networkMemo.get(key);
  if (hit?.stamp === stamp) return hit.graph;
  const graph = assembleScoutNetwork(universityId, opts);
  networkMemo.set(key, { stamp, graph });
  return graph;
}

function assembleScoutNetwork(universityId?: string, opts?: { sector?: string; excludeIds?: string[]; enrollment?: string[] }): NetworkGraph {
  const db = getDb();
  const exclude = new Set(opts?.excludeIds ?? []);
  const sector = opts?.sector;
  const enrollment = opts?.enrollment;
  const enrollmentClause =
    enrollment && enrollment.length > 0 && enrollment.length < 4
      ? `AND COALESCE(pe.enrollment_status, 'unknown') IN (${enrollment.map(() => "?").join(",")})`
      : enrollment && enrollment.length === 0
        ? "AND 1=0"
        : "";
  const tagged = new Set<string>();
  if (sector) {
    const tagRows = db.prepare(`SELECT project_id, tag FROM project_sector_tags`).all() as { project_id: string; tag: string }[];
    for (const row of tagRows) {
      if (row.tag === sector || sectorLabel(row.tag) === sector) tagged.add(row.project_id);
    }
  }
  const sectorOk = (id: string, kind: string) => !sector || (kind === "company" && tagged.has(id));
  const ids = universityId
    ? [universityId]
    : (db.prepare(`SELECT id FROM universities ORDER BY name`).all() as { id: string }[]).map((row) => row.id);

  const rawNodes = new Map<string, RawNode>();
  const rawEdges: NetworkEdge[] = [];
  const unverified = unverifiedLinkedInByPerson(db);
  let totalPeople = 0;

  const perCampusPeople = Math.max(24, Math.floor(90 / ids.length));

  for (const id of ids) {
    const university = db.prepare(`SELECT id, name FROM universities WHERE id = ?`).get(id) as { id: string; name: string } | undefined;
    if (!university) continue;
    const short = CAMPUSES.find((c) => c.id === id)?.shortLabel ?? university.name;
    rawNodes.set(university.id, { id: university.id, type: "university", label: short, sublabel: university.name, priority: 100 });

    const programs = db
      .prepare(
        `SELECT p.id, p.name, p.kind, p.website_url, p.primary_link, p.primary_link_kind FROM relationships r
         JOIN projects p ON p.id = r.source_entity_id AND r.source_entity_type = 'project'
         WHERE r.target_entity_type = 'university' AND r.target_entity_id = ? AND r.relationship_type = 'affiliated_with'`
      )
      .all(id) as { id: string; name: string; kind: string; website_url: string | null; primary_link: string | null; primary_link_kind: string | null }[];

    for (const prog of programs) {
      if (exclude.has(prog.id) || !sectorOk(prog.id, prog.kind)) continue;
      const type: NodeType = prog.kind === "company" ? "project" : "community";
      // Directory-only companies sit below named people so a long accelerator
      // list cannot push founders out of the capped graph.
      if (!rawNodes.has(prog.id)) {
        const link = publicLink(prog.website_url, prog.primary_link, prog.primary_link_kind);
        const site = link ? { linkUrl: link.url, linkLabel: link.kind === "official" ? "Website" : link.label } : undefined;
        rawNodes.set(prog.id, {
          id: prog.id,
          type,
          label: prog.name,
          priority: type === "project" ? 45 : 70,
          linkUrl: site?.linkUrl,
          linkLabel: site?.linkLabel,
          linkKind: link?.kind,
        });
      }
      rawEdges.push({
        source: prog.id,
        target: university.id,
        relationshipType: "affiliated_with",
        verificationState: "affiliation_only",
        ...edgeEvidence(db, prog.id, university.id, "affiliated_with"),
      });
    }

    const people = db
      .prepare(
        `SELECT pe.id, pe.name, pe.aliases_json, pe.enrollment_status, pe.enrollment_label,
            MAX(CASE
              WHEN ppr.role LIKE '%founder%' AND pr.kind = 'company' THEN 90
              WHEN lower(ppr.role) LIKE '%lead%' OR lower(ppr.role) LIKE '%president%' OR lower(ppr.role) LIKE '%director%' THEN 72
              WHEN ppr.role IS NOT NULL AND lower(ppr.role) NOT IN ('team_member','member','contributor','unknown','alumnus') THEN 58
              ELSE 0
            END) + CASE pe.enrollment_status WHEN 'current_student' THEN 8 WHEN 'recent_grad' THEN 4 ELSE 0 END AS pri
         FROM affiliations a
         JOIN people pe ON pe.id = a.person_id
         LEFT JOIN person_project_roles ppr ON ppr.person_id = pe.id
         LEFT JOIN projects pr ON pr.id = ppr.project_id
         WHERE a.university_id = ? ${enrollmentClause}
         GROUP BY pe.id
         ORDER BY pri DESC, pe.name`
      )
      .all(id, ...(enrollmentClause.startsWith("AND COALESCE") ? enrollment! : [])) as {
      id: string;
      name: string;
      aliases_json: string;
      enrollment_status: string | null;
      enrollment_label: string | null;
      pri: number;
    }[];

    totalPeople += people.length;
    const chosen = people.filter((p) => p.pri > 0).slice(0, perCampusPeople);

    for (const person of chosen) {
      if (exclude.has(person.id)) continue;
      if (!rawNodes.has(person.id)) {
        const personLink = bestPersonLink({
          aliasesJson: person.aliases_json,
          linkedinCandidates: unverified.get(person.id) ?? [],
        });
        rawNodes.set(person.id, {
          id: person.id,
          type: "person",
          label: person.name,
          sublabel: enrollmentBadge(person.enrollment_status, person.enrollment_label),
          priority: person.pri,
          linkUrl: personLink?.url,
          linkLabel: personLink?.label,
          linkKind: personLink?.kind,
        });
      }
      const affEvidence = db
        .prepare(
          `SELECT c.excerpt, c.source_url FROM affiliations a
           JOIN claims c ON c.id = a.claim_id
           WHERE a.person_id = ? AND a.university_id = ? AND c.excerpt IS NOT NULL
           LIMIT 1`
        )
        .get(person.id, id) as { excerpt: string; source_url: string } | undefined;
      rawEdges.push({
        source: person.id,
        target: university.id,
        relationshipType: "studied_at",
        verificationState: "affiliation_only",
        excerpt: affEvidence?.excerpt,
        sourceUrl: affEvidence?.source_url,
      });

      const roles = db
        .prepare(
          `SELECT pr.id, pr.name, pr.kind, ppr.role, c.excerpt, c.source_url
           FROM person_project_roles ppr
           JOIN projects pr ON pr.id = ppr.project_id
           LEFT JOIN claims c ON c.id = ppr.claim_id
           WHERE ppr.person_id = ?`
        )
        .all(person.id) as { id: string; name: string; kind: string; role: string; excerpt: string | null; source_url: string | null }[];

      for (const role of roles) {
        if (exclude.has(role.id) || !sectorOk(role.id, role.kind)) continue;
        if (rawNodes.size >= MAX_NODES && !rawNodes.has(role.id)) continue;
        const isOrg = role.kind !== "company" && programs.some((p) => p.id === role.id && p.kind !== "company");
        const linkPriority = role.role.toLowerCase().includes("founder") && role.kind === "company" ? 85 : role.kind === "company" ? 60 : 40;
        const existing = rawNodes.get(role.id);
        if (!existing) {
          const siteRow = db.prepare(`SELECT website_url, primary_link, primary_link_kind FROM projects WHERE id = ?`).get(role.id) as {
            website_url: string | null;
            primary_link: string | null;
            primary_link_kind: string | null;
          } | undefined;
          const link = siteRow ? publicLink(siteRow.website_url, siteRow.primary_link, siteRow.primary_link_kind) : null;
          const site = link ? { linkUrl: link.url, linkLabel: link.kind === "official" ? "Website" : link.label } : undefined;
          rawNodes.set(role.id, {
            id: role.id,
            type: isOrg ? "community" : "project",
            label: role.name,
            priority: linkPriority,
            linkUrl: site?.linkUrl,
            linkLabel: site?.linkLabel,
            linkKind: link?.kind,
          });
        } else if (linkPriority > existing.priority) {
          existing.priority = linkPriority;
        }
        const relationshipType = role.role.toLowerCase().includes("founder") ? "founded" : "contributed_to";
        rawEdges.push({
          source: person.id,
          target: role.id,
          relationshipType,
          verificationState: "affiliation_only",
          excerpt: role.excerpt ?? undefined,
          sourceUrl: role.source_url ?? undefined,
        });
      }
    }

    if (ids.length === 1) {
      seedCampusHubs(db, id, rawNodes, rawEdges, unverified, enrollment, exclude, sectorOk);
    }
  }

  if (enrollment && enrollment.length < 4) {
    const peopleIds = new Set([...rawNodes.values()].filter((node) => node.type === "person").map((node) => node.id));
    const linkedToPerson = new Set<string>();
    for (const edge of rawEdges) {
      if (peopleIds.has(edge.source)) linkedToPerson.add(edge.target);
      if (peopleIds.has(edge.target)) linkedToPerson.add(edge.source);
    }
    for (const [id, node] of rawNodes) {
      if (node.type === "university" || node.type === "person") continue;
      if (!linkedToPerson.has(id)) rawNodes.delete(id);
    }
  }

  if (sector) {
    const companyIds = new Set(
      [...rawNodes.values()].filter((n) => n.type === "project" && tagged.has(n.id)).map((n) => n.id)
    );
    const peopleOnSector = new Set<string>();
    for (const edge of rawEdges) {
      if (companyIds.has(edge.target) && rawNodes.get(edge.source)?.type === "person") peopleOnSector.add(edge.source);
      if (companyIds.has(edge.source) && rawNodes.get(edge.target)?.type === "person") peopleOnSector.add(edge.target);
    }
    for (const [id, node] of rawNodes) {
      if (node.type === "person" && !peopleOnSector.has(id)) rawNodes.delete(id);
    }
  }

  // Drop lowest-priority nodes if we blew past the cap, but never drop universities.
  // A single campus keeps every club and program, in two tiered zones.
  const singleCampus = ids.length === 1 && rawNodes.has(ids[0]);
  if (singleCampus) applyDirectoryOrgs(db, ids[0], rawNodes, rawEdges);
  let nodesArr = Array.from(rawNodes.values());
  if (singleCampus) {
    nodesArr = capSingleCampus(nodesArr, rawEdges);
  } else if (nodesArr.length > MAX_NODES) {
    const protectedIds = new Set(nodesArr.filter((n) => n.type === "university").map((n) => n.id));
    const ranked = nodesArr
      .filter((n) => !protectedIds.has(n.id))
      .sort((a, b) => b.priority - a.priority || a.label.localeCompare(b.label));
    const keep = new Set<string>([...protectedIds, ...ranked.slice(0, MAX_NODES - protectedIds.size).map((n) => n.id)]);
    nodesArr = nodesArr.filter((n) => keep.has(n.id));
  }
  const keepIds = new Set(nodesArr.map((n) => n.id));
  const edges = rawEdges.filter((e) => keepIds.has(e.source) && keepIds.has(e.target));
  // De-duplicate parallel edges of the same type.
  const edgeKey = new Set<string>();
  const uniqueEdges = edges.filter((e) => {
    const k = `${e.source}|${e.target}|${e.relationshipType}`;
    if (edgeKey.has(k)) return false;
    edgeKey.add(k);
    return true;
  });

  if (singleCampus) {
    const placed = layoutZonedCampus(
      nodesArr.map((node) => ({ id: node.id, type: node.type, label: node.label, zone: node.zone, tier: node.tier })),
      uniqueEdges,
    );
    const nodes: NetworkNode[] = nodesArr.map((node) => {
      const point = placed.positions.get(node.id) ?? { x: 0, y: 0 };
      return {
        id: node.id,
        type: node.type,
        label: node.label,
        sublabel: node.sublabel,
        zone: node.zone,
        tier: node.tier,
        x: point.x,
        y: point.y,
        linkUrl: node.linkUrl,
        linkLabel: node.linkLabel,
        linkKind: node.linkKind,
      };
    });
    const peopleShown = nodes.filter((node) => node.type === "person").length;
    return {
      nodes,
      edges: uniqueEdges,
      omittedCount: Math.max(0, totalPeople - peopleShown),
      totalPeople,
      guides: placed.guides,
      legend: [
        { type: "university", label: "Campus" },
        { type: "community", label: "Organization" },
        { type: "person", label: "Person" },
        { type: "project", label: "Project / company" },
      ],
    };
  }

  const width = 960;
  const height = 640;
  const simNodes = nodesArr.map((n) => ({ ...n, x: width / 2, y: height / 2 }));
  const idIndex = new Map(simNodes.map((n, i) => [n.id, i]));
  const universities = simNodes.filter((n) => n.type === "university");
  universities.forEach((n, i) => {
    (n as { fx?: number; fy?: number }).fx = width * ((i + 1) / (universities.length + 1));
    (n as { fy?: number }).fy = height * 0.46;
  });

  const simLinks = uniqueEdges
    .filter((e) => idIndex.has(e.source) && idIndex.has(e.target))
    .map((e) => ({ source: e.source, target: e.target }));

  const sim = forceSimulation(simNodes as never[])
    .force(
      "link",
      forceLink(simLinks)
        .id((d) => (d as { id: string }).id)
        .distance(78)
        .strength(0.45)
    )
    .force("charge", forceManyBody().strength(-160))
    .force("center", forceCenter(width / 2, height / 2))
    .force("collide", forceCollide(22))
    .stop();
  for (let i = 0; i < 280; i++) sim.tick();

  const nodes: NetworkNode[] = simNodes.map((n) => ({
    id: n.id,
    type: n.type,
    label: n.label,
    sublabel: n.sublabel,
    x: Math.max(28, Math.min(width - 28, n.x)),
    y: Math.max(28, Math.min(height - 28, n.y)),
    linkUrl: n.linkUrl,
    linkLabel: n.linkLabel,
    linkKind: n.linkKind,
  }));

  const peopleShown = nodes.filter((n) => n.type === "person").length;
  return {
    nodes,
    edges: uniqueEdges,
    omittedCount: Math.max(0, totalPeople - peopleShown),
    totalPeople,
    legend: [
      { type: "university", label: "University" },
      { type: "community", label: "Program / community" },
      { type: "person", label: "Person" },
      { type: "project", label: "Project / company" },
    ],
  };
}

const TIER_PRIORITY: Record<string, number> = { "S+": 96, S: 94, A: 90, B: 84, C: 78, D: 72 };

function applyDirectoryOrgs(
  db: ReturnType<typeof getDb>,
  universityId: string,
  rawNodes: Map<string, RawNode>,
  rawEdges: NetworkEdge[],
) {
  const signals = db
    .prepare(
      `SELECT DISTINCT s.signal_type FROM program_signals s
       JOIN affiliations a ON a.person_id = s.person_id
       WHERE a.university_id = ?`,
    )
    .all(universityId) as { signal_type: string }[];
  const orgs = orgsForCampus(
    universityId,
    campusOrgCards(),
    signals.map((row) => row.signal_type),
  );
  const claimed = new Set<string>();
  for (const org of orgs) {
    let node = [...rawNodes.values()].find((item) => item.type === "community" && orgMatchesLabel(org, item.label) && !claimed.has(item.id));
    if (!node) {
      const id = `org_${universityId}_${org.key.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 72)}`;
      node = {
        id,
        type: "community",
        label: org.label,
        priority: TIER_PRIORITY[org.tier] ?? 70,
        linkUrl: org.url,
        linkLabel: org.url ? "Website" : undefined,
        linkKind: org.url ? "official" : undefined,
      };
      rawNodes.set(id, node);
    } else {
      node.priority = Math.max(node.priority, TIER_PRIORITY[org.tier] ?? 70);
      if (!node.linkUrl && org.url) {
        node.linkUrl = org.url;
        node.linkLabel = "Website";
        node.linkKind = "official";
      }
    }
    claimed.add(node.id);
    node.type = "community";
    node.pinned = true;
    node.zone = org.zone;
    node.tier = org.tier;
    node.sublabel = `${zoneWord(org.zone)} · ${org.tier}`;
    const linked = rawEdges.some(
      (edge) =>
        (edge.source === node!.id && edge.target === universityId) || (edge.target === node!.id && edge.source === universityId),
    );
    if (!linked) {
      rawEdges.push({
        source: node.id,
        target: universityId,
        relationshipType: "affiliated_with",
        verificationState: "directory",
        sourceUrl: org.url,
      });
    }
  }

  for (const node of rawNodes.values()) {
    if (node.type !== "community" || node.zone) continue;
    node.type = "project";
    node.pinned = false;
  }

  const orgById = new Map<string, CampusOrg>();
  for (const org of orgs) {
    const node = [...rawNodes.values()].find((item) => item.zone && orgMatchesLabel(org, item.label));
    if (node) orgById.set(node.id, org);
  }
  if (signals.length === 0 || orgById.size === 0) return;
  const people = db
    .prepare(
      `SELECT s.person_id, s.signal_type FROM program_signals s
       JOIN affiliations a ON a.person_id = s.person_id
       WHERE a.university_id = ?`,
    )
    .all(universityId) as { person_id: string; signal_type: string }[];
  const needles: Record<string, string> = {
    z_fellows: "z fellow",
    south_park_commons: "south park commons",
    emergent_ventures: "emergent ventures",
    contrary_venture_partners: "contrary venture",
    kleiner_perkins_fellows: "kleiner perkins",
    founders_inc: "founders inc",
    hf0: "hf0",
    the_residency: "the residency",
    agi_house: "agi house",
    frontier_tower: "frontier tower",
    yale_hacker_house: "yale hacker house",
    farmhouse: "farmhouse",
    gatech_hacker_house: "georgia tech hacker house",
    rice_residency: "rice residency",
    foundher_house: "foundher",
    playa_house: "playa house",
    harvard_st_commons: "harvard st",
    medici_1517: "1517",
    pioneer: "pioneer",
    afore_fir_u: "afore",
    buildspace: "buildspace",
  };
  const perOrg = new Map<string, number>();
  const seen = new Set(rawEdges.map((edge) => `${edge.source}|${edge.target}|${edge.relationshipType}`));
  for (const row of people) {
    const needle = needles[row.signal_type];
    if (!needle) continue;
    const person = rawNodes.get(row.person_id);
    if (!person || person.type !== "person") continue;
    for (const [orgId, org] of orgById) {
      if (!org.key.includes(needle) && !org.label.toLowerCase().includes(needle)) continue;
      if ((perOrg.get(orgId) ?? 0) >= 3) continue;
      const key = `${person.id}|${orgId}|contributed_to`;
      if (seen.has(key)) continue;
      seen.add(key);
      perOrg.set(orgId, (perOrg.get(orgId) ?? 0) + 1);
      person.pinned = true;
      rawEdges.push({
        source: person.id,
        target: orgId,
        relationshipType: "contributed_to",
        verificationState: "program_signal",
      });
    }
  }
}

function capSingleCampus(nodes: RawNode[], edges: NetworkEdge[]): RawNode[] {
  const byPriority = (a: RawNode, b: RawNode) => b.priority - a.priority || a.label.localeCompare(b.label);
  let must = nodes.filter((node) => node.type === "university" || node.type === "community");
  if (must.length > MAX_NODES) {
    const universities = must.filter((node) => node.type === "university");
    const communities = must.filter((node) => node.type === "community").sort(byPriority);
    must = [...universities, ...communities.slice(0, Math.max(0, MAX_NODES - universities.length))];
  }
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const mustIds = new Set(must.map((node) => node.id));
  const keep = new Set<string>(mustIds);
  const pinned = nodes.filter((node) => node.pinned && !mustIds.has(node.id)).sort(byPriority);
  for (const node of pinned) {
    if (keep.size >= MAX_NODES) break;
    keep.add(node.id);
  }
  const startupsOf = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.relationshipType !== "founded") continue;
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    const personId = source?.type === "person" ? edge.source : target?.type === "person" ? edge.target : null;
    const projectId = source?.type === "project" ? edge.source : target?.type === "project" ? edge.target : null;
    if (!personId || !projectId) continue;
    const list = startupsOf.get(personId) ?? [];
    if (!list.includes(projectId)) list.push(projectId);
    startupsOf.set(personId, list);
  }
  const rankedPeople = nodes.filter((node) => node.type === "person" && !keep.has(node.id)).sort(byPriority);
  for (const person of rankedPeople) {
    if (keep.size >= MAX_NODES) break;
    keep.add(person.id);
    const startupId = (startupsOf.get(person.id) ?? []).find((id) => byId.has(id) && !keep.has(id));
    if (startupId && keep.size < MAX_NODES) keep.add(startupId);
  }
  if (keep.size < MAX_NODES) {
    for (const node of nodes.filter((item) => !keep.has(item.id)).sort(byPriority)) {
      if (keep.size >= MAX_NODES) break;
      keep.add(node.id);
    }
  }
  return nodes.filter((node) => keep.has(node.id));
}

const HUB_REPS = 3;

function seedCampusHubs(
  db: ReturnType<typeof getDb>,
  universityId: string,
  rawNodes: Map<string, RawNode>,
  rawEdges: NetworkEdge[],
  unverified: ReturnType<typeof unverifiedLinkedInByPerson>,
  enrollment: string[] | undefined,
  exclude: Set<string>,
  sectorOk: (id: string, kind: string) => boolean,
) {
  const university = rawNodes.get(universityId);
  if (university) university.pinned = true;
  const communities = [...rawNodes.values()].filter((node) => node.type === "community");
  for (const community of communities) community.pinned = true;
  if (communities.length === 0) return;

  const enrollmentSql =
    enrollment && enrollment.length > 0 && enrollment.length < 4
      ? `AND COALESCE(pe.enrollment_status, 'unknown') IN (${enrollment.map(() => "?").join(",")})`
      : enrollment && enrollment.length === 0
        ? "AND 1=0"
        : "";
  const enrollmentParams = enrollmentSql.startsWith("AND COALESCE") ? enrollment! : [];
  const edgeSeen = new Set(rawEdges.map((edge) => `${edge.source}|${edge.target}|${edge.relationshipType}`));
  const pushEdge = (edge: NetworkEdge) => {
    const key = `${edge.source}|${edge.target}|${edge.relationshipType}`;
    if (edgeSeen.has(key)) return;
    edgeSeen.add(key);
    rawEdges.push(edge);
  };

  const repStmt = db.prepare(
    `SELECT pe.id, pe.name, pe.aliases_json, pe.enrollment_status, pe.enrollment_label,
        MAX(CASE WHEN lower(ppr.role) LIKE '%founder%' THEN 1 ELSE 0 END) AS is_founder,
        MAX(CASE
          WHEN lower(ppr.role) LIKE '%president%' OR lower(ppr.role) LIKE '%director%' OR lower(ppr.role) LIKE '%lead%' THEN 3
          WHEN lower(ppr.role) LIKE '%founder%' THEN 2
          WHEN lower(ppr.role) NOT IN ('team_member','member','contributor','unknown','alumnus') THEN 1
          ELSE 0
        END) AS rank
     FROM person_project_roles ppr
     JOIN people pe ON pe.id = ppr.person_id
     JOIN affiliations a ON a.person_id = pe.id AND a.university_id = ?
     WHERE ppr.project_id = ? ${enrollmentSql}
     GROUP BY pe.id
     ORDER BY rank DESC, pe.name
     LIMIT ${HUB_REPS}`,
  );
  const startupStmt = db.prepare(
    `SELECT pr.id, pr.name, pr.kind, pr.website_url, pr.primary_link, pr.primary_link_kind
     FROM person_project_roles ppr
     JOIN projects pr ON pr.id = ppr.project_id
     WHERE ppr.person_id = ? AND pr.kind = 'company' AND lower(ppr.role) LIKE '%founder%'
     ORDER BY pr.name
     LIMIT 1`,
  );
  const affStmt = db.prepare(
    `SELECT c.excerpt, c.source_url FROM affiliations a
     JOIN claims c ON c.id = a.claim_id
     WHERE a.person_id = ? AND a.university_id = ? AND c.excerpt IS NOT NULL
     LIMIT 1`,
  );

  for (const community of communities) {
    const reps = repStmt.all(universityId, community.id, ...enrollmentParams) as {
      id: string;
      name: string;
      aliases_json: string;
      enrollment_status: string | null;
      enrollment_label: string | null;
      is_founder: number;
      rank: number;
    }[];
    for (const rep of reps) {
      if (exclude.has(rep.id)) continue;
      const personLink = bestPersonLink({
        aliasesJson: rep.aliases_json,
        linkedinCandidates: unverified.get(rep.id) ?? [],
      });
      const existing = rawNodes.get(rep.id);
      if (existing) {
        existing.pinned = true;
        existing.priority = Math.max(existing.priority, 84 + (rep.rank ?? 0));
      } else {
        rawNodes.set(rep.id, {
          id: rep.id,
          type: "person",
          label: rep.name,
          sublabel: enrollmentBadge(rep.enrollment_status, rep.enrollment_label),
          priority: 84 + (rep.rank ?? 0),
          pinned: true,
          linkUrl: personLink?.url,
          linkLabel: personLink?.label,
          linkKind: personLink?.kind,
        });
      }
      pushEdge({
        source: rep.id,
        target: community.id,
        relationshipType: rep.is_founder ? "founded" : "contributed_to",
        verificationState: "affiliation_only",
      });
      const affEvidence = affStmt.get(rep.id, universityId) as { excerpt: string; source_url: string } | undefined;
      pushEdge({
        source: rep.id,
        target: universityId,
        relationshipType: "studied_at",
        verificationState: "affiliation_only",
        excerpt: affEvidence?.excerpt,
        sourceUrl: affEvidence?.source_url,
      });

      const startup = startupStmt.get(rep.id) as
        | { id: string; name: string; kind: string; website_url: string | null; primary_link: string | null; primary_link_kind: string | null }
        | undefined;
      if (!startup || exclude.has(startup.id) || !sectorOk(startup.id, startup.kind)) continue;
      const site = publicLink(startup.website_url, startup.primary_link, startup.primary_link_kind);
      const have = rawNodes.get(startup.id);
      if (have) {
        have.pinned = true;
        have.priority = Math.max(have.priority, 82);
      } else {
        rawNodes.set(startup.id, {
          id: startup.id,
          type: "project",
          label: startup.name,
          priority: 82,
          pinned: true,
          linkUrl: site?.url,
          linkLabel: site ? (site.kind === "official" ? "Website" : site.label) : undefined,
          linkKind: site?.kind,
        });
      }
      pushEdge({
        source: rep.id,
        target: startup.id,
        relationshipType: "founded",
        verificationState: "affiliation_only",
      });
    }
  }
}

function edgeEvidence(
  db: ReturnType<typeof getDb>,
  sourceId: string,
  targetId: string,
  relationshipType: string
): { excerpt?: string; sourceUrl?: string } {
  const rel = db
    .prepare(
      `SELECT evidence_claim_ids_json FROM relationships
       WHERE source_entity_id = ? AND target_entity_id = ? AND relationship_type = ? LIMIT 1`
    )
    .get(sourceId, targetId, relationshipType) as { evidence_claim_ids_json: string } | undefined;
  if (!rel) return {};
  let ids: string[] = [];
  try {
    ids = JSON.parse(rel.evidence_claim_ids_json) as string[];
  } catch {
    return {};
  }
  if (!ids.length) return {};
  const claim = db.prepare(`SELECT excerpt, source_url FROM claims WHERE id = ?`).get(ids[0]) as
    | { excerpt: string; source_url: string }
    | undefined;
  if (!claim) return {};
  return { excerpt: claim.excerpt, sourceUrl: claim.source_url };
}
