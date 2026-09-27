// Radial layout for one campus. The campus sits in the middle, clubs and
// programs sit on a ring around it, and people and startups sit further out
// next to the hub they belong to. Coordinates are unitless; the canvas fits
// its viewBox to the result.

export type LayoutNodeType = "university" | "community" | "person" | "project";

export interface LayoutNode {
  id: string;
  type: LayoutNodeType | string;
  label: string;
}

export interface LayoutEdge {
  source: string;
  target: string;
  relationshipType?: string;
}

interface Point {
  id: string;
  x: number;
  y: number;
  lock?: boolean;
}

const LABEL_CHORD = 176;
const MIN_SEP = 34;

export function layoutCampusGraph(nodes: LayoutNode[], edges: LayoutEdge[]): Map<string, { x: number; y: number }> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const pos = new Map<string, Point>();
  const university = nodes.find((node) => node.type === "university");
  if (!university) {
    nodes.forEach((node, index) => {
      const angle = (index / Math.max(nodes.length, 1)) * Math.PI * 2;
      pos.set(node.id, { id: node.id, x: Math.cos(angle) * 220, y: Math.sin(angle) * 220 });
    });
    return rounded(pos);
  }

  pos.set(university.id, { id: university.id, x: 0, y: 0, lock: true });

  const adj = new Map<string, { id: string; rel: string }[]>();
  for (const edge of edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) continue;
    const rel = edge.relationshipType ?? "";
    const left = adj.get(edge.source) ?? [];
    left.push({ id: edge.target, rel });
    adj.set(edge.source, left);
    const right = adj.get(edge.target) ?? [];
    right.push({ id: edge.source, rel });
    adj.set(edge.target, right);
  }
  const neighbors = (id: string) => adj.get(id) ?? [];

  const byLabel = (a: LayoutNode, b: LayoutNode) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id);
  const communities = nodes.filter((node) => node.type === "community").sort(byLabel);
  const people = nodes.filter((node) => node.type === "person").sort(byLabel);
  const projects = nodes.filter((node) => node.type === "project").sort(byLabel);

  const communityLoad = new Map(communities.map((node) => [node.id, 0]));
  const personHome = new Map<string, string>();
  for (const person of people) {
    const homes = neighbors(person.id)
      .map((link) => byId.get(link.id))
      .filter((node): node is LayoutNode => node?.type === "community")
      .sort((a, b) => (communityLoad.get(a.id) ?? 0) - (communityLoad.get(b.id) ?? 0) || byLabel(a, b));
    const home = homes[0];
    if (!home) continue;
    personHome.set(person.id, home.id);
    communityLoad.set(home.id, (communityLoad.get(home.id) ?? 0) + 1);
  }

  const count = communities.length;
  const hubRadius = count <= 1 ? 320 : Math.max(320, LABEL_CHORD / (2 * Math.sin(Math.PI / count)));
  const communityAngle = new Map<string, number>();
  const communityTarget = new Map<string, { x: number; y: number }>();
  communities.forEach((node, index) => {
    const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
    communityAngle.set(node.id, angle);
    const point = { x: Math.cos(angle) * hubRadius, y: Math.sin(angle) * hubRadius };
    pos.set(node.id, { id: node.id, ...point });
    communityTarget.set(node.id, point);
  });

  for (const community of communities) {
    const angle = communityAngle.get(community.id) ?? 0;
    const members = people.filter((person) => personHome.get(person.id) === community.id);
    const wedge = count <= 1 ? Math.PI * 0.7 : ((Math.PI * 2) / count) * 0.58;
    const orbit = hubRadius + 118;
    members.forEach((member, index) => {
      const t = members.length === 1 ? 0 : index / (members.length - 1) - 0.5;
      const at = angle + t * wedge;
      pos.set(member.id, { id: member.id, x: Math.cos(at) * orbit, y: Math.sin(at) * orbit });
    });
  }

  const anchored = new Map<string, LayoutNode[]>();
  for (const project of projects) {
    const peopleNear = neighbors(project.id)
      .filter((link) => byId.get(link.id)?.type === "person")
      .sort((a, b) => {
        const rank = (rel: string) => (rel === "founded" ? 0 : 1);
        return rank(a.rel) - rank(b.rel) || (byId.get(a.id)?.label ?? "").localeCompare(byId.get(b.id)?.label ?? "");
      });
    const homeAnchor = peopleNear.find((link) => personHome.has(link.id));
    if (!homeAnchor || !pos.has(homeAnchor.id)) continue;
    const list = anchored.get(homeAnchor.id) ?? [];
    list.push(project);
    anchored.set(homeAnchor.id, list);
  }

  for (const [anchorId, list] of anchored) {
    const anchor = pos.get(anchorId);
    if (!anchor) continue;
    const angle = Math.atan2(anchor.y, anchor.x);
    const base = Math.hypot(anchor.x, anchor.y) + 72;
    list.forEach((project, index) => {
      const shift = list.length === 1 ? 0 : (index - (list.length - 1) / 2) * 0.2;
      const at = angle + shift;
      pos.set(project.id, { id: project.id, x: Math.cos(at) * base, y: Math.sin(at) * base });
      const cofounders = neighbors(project.id)
        .map((link) => byId.get(link.id))
        .filter((node): node is LayoutNode => node?.type === "person" && !personHome.has(node.id) && !pos.has(node.id));
      cofounders.forEach((person, personIndex) => {
        const side = angle + shift + 0.16 * (personIndex + 1);
        pos.set(person.id, { id: person.id, x: Math.cos(side) * (base - 36), y: Math.sin(side) * (base - 36) });
      });
    });
  }

  const groups: string[][] = [];
  const grouped = new Set<string>();
  for (const project of projects) {
    if (pos.has(project.id)) continue;
    const mates = neighbors(project.id)
      .map((link) => link.id)
      .filter((id) => byId.get(id)?.type === "person" && !pos.has(id) && !grouped.has(id));
    groups.push([project.id, ...mates]);
    grouped.add(project.id);
    for (const id of mates) grouped.add(id);
  }
  for (const person of people) {
    if (!pos.has(person.id) && !grouped.has(person.id)) groups.push([person.id]);
  }

  const outer = hubRadius + 268;
  groups.forEach((group, index) => {
    const angle = -Math.PI / 2 + ((index + 0.5) / Math.max(groups.length, 1)) * Math.PI * 2;
    const cx = Math.cos(angle) * outer;
    const cy = Math.sin(angle) * outer;
    const tx = -Math.sin(angle);
    const ty = Math.cos(angle);
    const span = (group.length - 1) * 38;
    group.forEach((id, slot) => {
      const offset = group.length === 1 ? 0 : -span / 2 + slot * 38;
      const radial = byId.get(id)?.type === "project" ? 26 : 0;
      pos.set(id, {
        id,
        x: cx + tx * offset + Math.cos(angle) * radial,
        y: cy + ty * offset + Math.sin(angle) * radial,
      });
    });
  });

  let spare = 0;
  for (const node of nodes) {
    if (pos.has(node.id)) continue;
    const angle = spare++ * 0.9;
    pos.set(node.id, { id: node.id, x: Math.cos(angle) * (outer + 90), y: Math.sin(angle) * (outer + 90) });
  }

  separate(pos, communityTarget);
  // Landscape screens are wider than they are tall, so give labels horizontal room.
  for (const point of pos.values()) {
    if (!point.lock) point.x *= 1.28;
  }
  return rounded(pos);
}

function separate(pos: Map<string, Point>, communityTarget: Map<string, { x: number; y: number }>) {
  const ids = [...pos.keys()];
  for (let iter = 0; iter < 48; iter++) {
    for (let i = 0; i < ids.length; i++) {
      const a = pos.get(ids[i])!;
      for (let j = i + 1; j < ids.length; j++) {
        const b = pos.get(ids[j])!;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);
        if (dist < 0.01) {
          dx = 0.2 + i * 0.01;
          dy = 0.2 + j * 0.01;
          dist = Math.hypot(dx, dy);
        }
        if (dist >= MIN_SEP) continue;
        const push = (MIN_SEP - dist) / 2;
        const ux = dx / dist;
        const uy = dy / dist;
        if (!a.lock) {
          a.x -= ux * push;
          a.y -= uy * push;
        }
        if (!b.lock) {
          b.x += ux * push;
          b.y += uy * push;
        }
      }
    }
    for (const id of ids) {
      const point = pos.get(id)!;
      if (point.lock) continue;
      const hub = Math.hypot(point.x, point.y) || 1;
      if (hub < 96) {
        point.x *= 96 / hub;
        point.y *= 96 / hub;
      }
      const target = communityTarget.get(id);
      if (target) {
        point.x = point.x * 0.5 + target.x * 0.5;
        point.y = point.y * 0.5 + target.y * 0.5;
      }
    }
  }
}

function rounded(pos: Map<string, Point>): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  for (const [id, point] of pos) out.set(id, { x: Math.round(point.x * 10) / 10, y: Math.round(point.y * 10) / 10 });
  return out;
}

export interface LabelCandidate {
  id: string;
  text: string;
  /** Screen-pixel x of the label anchor (node center). */
  x: number;
  /** Screen-pixel y of the top of the label. */
  y: number;
  /** Higher wins a slot when two labels would overlap. */
  priority: number;
}

/** Greedy label placement. Later, lower-priority labels yield instead of stacking. */
export function selectNonOverlappingLabels(items: LabelCandidate[], fontPx = 12): string[] {
  const sorted = [...items].sort((a, b) => b.priority - a.priority || a.text.localeCompare(b.text) || a.id.localeCompare(b.id));
  const placed: { left: number; right: number; top: number; bottom: number }[] = [];
  const shown: string[] = [];
  for (const item of sorted) {
    const text = item.text.length > 28 ? item.text.slice(0, 27) + "…" : item.text;
    const width = text.length * fontPx * 0.56 + 8;
    const height = fontPx + 4;
    const box = { left: item.x - width / 2, right: item.x + width / 2, top: item.y, bottom: item.y + height };
    const hit = placed.some((other) => other.left < box.right + 4 && other.right > box.left - 4 && other.top < box.bottom + 3 && other.bottom > box.top - 3);
    if (hit) continue;
    placed.push(box);
    shown.push(item.id);
  }
  return shown;
}
