import fs from "node:fs";
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from "d3-force";
import { databasePath, getDb } from "../db/client";
import { CAMPUSES } from "./campuses";
import { publicLink } from "./company-link";
import { sectorLabel } from "./sectors";
import { enrollmentBadge } from "./founder-status";
import { bestPersonLink } from "./person-link";
import { unverifiedLinkedInByPerson } from "./queries";

export type NodeType = "university" | "community" | "person" | "project";

export interface NetworkNode {
  id: string;
  type: NodeType;
  label: string;
  sublabel?: string;
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
    stamp = `${st.mtimeMs}:${st.size}`;
  } catch {
    stamp = "missing";
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
  let nodesArr = Array.from(rawNodes.values());
  if (nodesArr.length > MAX_NODES) {
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
