import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from "d3-force";
import { getDb } from "../db/client";

export type NodeType = "university" | "community" | "person" | "project";

export interface NetworkNode {
  id: string;
  type: NodeType;
  label: string;
  sublabel?: string;
  x: number;
  y: number;
}

export interface NetworkEdge {
  source: string;
  target: string;
  relationshipType: string;
  verificationState: string;
}

export interface NetworkGraph {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  omittedCount: number;
  legend: { type: NodeType; label: string }[];
}

const MAX_NODES = 60;

// Builds the evidence-backed neighborhood for a single university: university -> community/program
// nodes -> people -> project/company nodes. Only edges with rows in `relationships` are drawn —
// nothing here is inferred purely from co-membership beyond what that table already represents.
export function buildUniversityNetwork(universityId: string): NetworkGraph {
  const db = getDb();

  const university = db.prepare(`SELECT id, name FROM universities WHERE id = ?`).get(universityId) as { id: string; name: string } | undefined;
  if (!university) return { nodes: [], edges: [], omittedCount: 0, legend: [] };

  type RawNode = { id: string; type: NodeType; label: string; sublabel?: string };
  const rawNodes = new Map<string, RawNode>();
  const rawEdges: { source: string; target: string; relationshipType: string; verificationState: string }[] = [];

  rawNodes.set(university.id, { id: university.id, type: "university", label: university.name });

  // community/program nodes affiliated with this university
  const programs = db
    .prepare(
      `SELECT p.id, p.name FROM relationships r
       JOIN projects p ON p.id = r.source_entity_id AND r.source_entity_type = 'project'
       WHERE r.target_entity_type = 'university' AND r.target_entity_id = ? AND r.relationship_type = 'affiliated_with'`
    )
    .all(universityId) as { id: string; name: string }[];

  for (const prog of programs) {
    rawNodes.set(prog.id, { id: prog.id, type: "community", label: prog.name });
    rawEdges.push({ source: prog.id, target: university.id, relationshipType: "affiliated_with", verificationState: "affiliation_only" });
  }

  // people affiliated with this university (dated evidence via `affiliations`)
  const people = db
    .prepare(
      `SELECT DISTINCT pe.id, pe.name, a.status FROM affiliations a JOIN people pe ON pe.id = a.person_id WHERE a.university_id = ?`
    )
    .all(universityId) as { id: string; name: string; status: string }[];

  const truncatedPeople = people.slice(0, MAX_NODES); // cap applied before we also add project nodes
  for (const person of truncatedPeople) {
    rawNodes.set(person.id, { id: person.id, type: "person", label: person.name, sublabel: person.status.replace("_", " ") });
    rawEdges.push({ source: person.id, target: university.id, relationshipType: "enrolled_at", verificationState: "affiliation_only" });
  }

  // projects/companies those people are linked to, via person_project_roles + relationships
  for (const person of truncatedPeople) {
    if (rawNodes.size >= MAX_NODES) break;
    const roles = db
      .prepare(
        `SELECT DISTINCT pr.id, pr.name, pr.kind, ppr.role FROM person_project_roles ppr JOIN projects pr ON pr.id = ppr.project_id WHERE ppr.person_id = ?`
      )
      .all(person.id) as { id: string; name: string; kind: string; role: string }[];
    for (const role of roles) {
      if (rawNodes.size >= MAX_NODES) break;
      if (!rawNodes.has(role.id)) {
        rawNodes.set(role.id, { id: role.id, type: role.kind === "project" && programs.some((p) => p.id === role.id) ? "community" : "project", label: role.name });
      }
      rawEdges.push({
        source: person.id,
        target: role.id,
        relationshipType: role.role.toLowerCase().includes("founder") ? "founded" : "contributed_to_project",
        verificationState: "affiliation_only",
      });
    }
  }

  const omittedCount = Math.max(0, people.length - truncatedPeople.length);

  // Layout via d3-force, run synchronously to completion (no animation, no client JS needed).
  const nodeList = Array.from(rawNodes.values());
  const simNodes = nodeList.map((n) => ({ ...n, x: 0, y: 0 }));
  const idIndex = new Map(simNodes.map((n, i) => [n.id, i]));
  const simLinks = rawEdges
    .filter((e) => idIndex.has(e.source) && idIndex.has(e.target))
    .map((e) => ({ source: e.source, target: e.target }));

  const width = 720;
  const height = 560;
  const sim = forceSimulation(simNodes as any)
    .force("link", forceLink(simLinks as any).id((d: any) => d.id).distance(70).strength(0.6))
    .force("charge", forceManyBody().strength(-140))
    .force("center", forceCenter(width / 2, height / 2))
    .force("collide", forceCollide(26))
    .stop();

  for (let i = 0; i < 220; i++) sim.tick();

  const nodes: NetworkNode[] = simNodes.map((n: any) => ({
    id: n.id,
    type: n.type,
    label: n.label,
    sublabel: n.sublabel,
    x: Math.max(24, Math.min(width - 24, n.x)),
    y: Math.max(24, Math.min(height - 24, n.y)),
  }));

  return {
    nodes,
    edges: rawEdges,
    omittedCount,
    legend: [
      { type: "university", label: "University" },
      { type: "community", label: "Lab / program / community" },
      { type: "person", label: "Person" },
      { type: "project", label: "Project / company" },
    ],
  };
}
