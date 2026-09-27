import type { MapEdgeType, MapNode, MapNodeType } from "@/lib/domain/network-map";

/** Neutral ink for shapes that are not colored by campus. */
export const NODE_FILL: Record<MapNodeType, string> = {
  person: "#3a3a3a",
  startup: "#3a3a3a",
  investor: "#242424",
  campus: "#3a3a3a",
  program: "#2c2c2c",
  organization: "#242424",
};

/**
 * Saturated categorical colors, spaced around the hue wheel (a Glasbey-style
 * set). Lightness stays low enough that a 2px dot still reads on white.
 * Hue is used to keep neighboring clusters far apart.
 */
const CAMPUS_PALETTE: { hex: string; hue: number }[] = [
  { hex: "#d70909", hue: 0 },
  { hex: "#d74e09", hue: 20 },
  { hex: "#d79909", hue: 42 },
  { hex: "#aeba08", hue: 64 },
  { hex: "#67ba08", hue: 88 },
  { hex: "#25d709", hue: 112 },
  { hex: "#09d740", hue: 136 },
  { hex: "#09d793", hue: 160 },
  { hex: "#08b4ba", hue: 182 },
  { hex: "#0985d7", hue: 204 },
  { hex: "#0939d7", hue: 226 },
  { hex: "#2509d7", hue: 248 },
  { hex: "#7009d7", hue: 270 },
  { hex: "#bc09d7", hue: 292 },
  { hex: "#d709a7", hue: 314 },
  { hex: "#d7095c", hue: 336 },
];

export interface CampusSwatch {
  id: string;
  label: string;
  color: string;
}

/** One color per campus. Closer clusters receive hues that are farther apart. */
export function assignCampusColors(campuses: { id: string; x: number; y: number }[]): Map<string, string> {
  const unique = new Map<string, { id: string; x: number; y: number }>();
  for (const campus of campuses) if (!unique.has(campus.id)) unique.set(campus.id, campus);
  const list = [...unique.values()];
  const assigned = new Map<string, number>();
  const nearest = new Map<string, string[]>();
  for (const campus of list) {
    nearest.set(
      campus.id,
      list
        .filter((other) => other.id !== campus.id)
        .sort((a, b) => Math.hypot(a.x - campus.x, a.y - campus.y) - Math.hypot(b.x - campus.x, b.y - campus.y) || a.id.localeCompare(b.id))
        .slice(0, 3)
        .map((other) => other.id),
    );
  }
  const gapOf = (id: string) => {
    const hue = CAMPUS_PALETTE[assigned.get(id) ?? 0].hue;
    const neighbors = nearest.get(id) ?? [];
    if (!neighbors.length) return 180;
    return Math.min(...neighbors.map((other) => hueGap(hue, CAMPUS_PALETTE[assigned.get(other) ?? 0].hue)));
  };
  const remaining = [...list].sort((a, b) => a.x - b.x || a.y - b.y || a.id.localeCompare(b.id));
  for (const campus of remaining) {
    const used = new Set(assigned.values());
    let bestIndex = 0;
    let bestScore = -1;
    for (let i = 0; i < CAMPUS_PALETTE.length; i++) {
      if (used.has(i)) continue;
      assigned.set(campus.id, i);
      const score = gapOf(campus.id) * 1000 + Math.min(...(nearest.get(campus.id) ?? []).map((other) => (assigned.has(other) ? gapOf(other) : 180)));
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    assigned.set(campus.id, bestIndex);
  }
  const worstGap = () => Math.min(...list.map((campus) => gapOf(campus.id)));
  for (let pass = 0; pass < 24; pass++) {
    let changed = false;
    const ordered = [...list].sort((a, b) => gapOf(a.id) - gapOf(b.id) || a.id.localeCompare(b.id));
    for (const campus of ordered) {
      const owned = assigned.get(campus.id) ?? 0;
      const before = worstGap();
      const used = new Set(assigned.values());
      let bestIndex = owned;
      let bestScore = before;
      for (let i = 0; i < CAMPUS_PALETTE.length; i++) {
        if (i !== owned && used.has(i)) continue;
        assigned.set(campus.id, i);
        const score = worstGap();
        if (score > bestScore) {
          bestScore = score;
          bestIndex = i;
        }
      }
      assigned.set(campus.id, bestIndex);
      if (bestIndex !== owned) changed = true;
    }
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i].id;
        const b = list[j].id;
        const before = worstGap();
        const ia = assigned.get(a) ?? 0;
        const ib = assigned.get(b) ?? 0;
        assigned.set(a, ib);
        assigned.set(b, ia);
        if (worstGap() > before) changed = true;
        else {
          assigned.set(a, ia);
          assigned.set(b, ib);
        }
      }
    }
    if (!changed) break;
  }
  return new Map([...assigned].map(([id, index]) => [id, CAMPUS_PALETTE[index].hex]));
}

export function campusSwatches(nodes: { id: string; type: string; label: string; x: number; y: number; campus: string | null }[]): CampusSwatch[] {
  const campuses = nodes.filter((node) => node.type === "campus" && node.campus);
  const colors = assignCampusColors(campuses.map((node) => ({ id: node.campus as string, x: node.x, y: node.y })));
  return campuses
    .map((node) => ({ id: node.campus as string, label: node.label, color: colors.get(node.campus as string) ?? NODE_FILL.campus }))
    .sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }) || a.id.localeCompare(b.id));
}

export function nodeColor(node: { type: MapNodeType; campus: string | null; id?: string }, colors: Map<string, string>): string {
  if (node.type === "investor" || node.type === "organization" || node.type === "program") return NODE_FILL[node.type];
  const id = node.campus ?? (node.type === "campus" ? node.id : null);
  if (id && colors.get(id)) return colors.get(id) as string;
  return NODE_FILL[node.type];
}

/** Faint tint of a campus color for an edge that stays inside that campus. */
export function edgeTint(campusId: string | null, colors: Map<string, string>): string {
  const hex = campusId ? colors.get(campusId) : undefined;
  if (!hex) return "rgba(30, 30, 30, 0.45)";
  return hexToRgba(hex, 0.72);
}

export function campusKey(node: { campus: string | null; campuses?: string[] }): string {
  const ids = node.campuses?.length ? [...node.campuses] : node.campus ? [node.campus] : [];
  ids.sort();
  return ids.join("|");
}

/** An edge crosses campuses when both ends name a campus and those sets differ. */
export function crossesCampus(sourceKey: string, targetKey: string): boolean {
  return sourceKey !== "" && targetKey !== "" && sourceKey !== targetKey;
}

export const NODE_SHAPE: Record<MapNodeType, "circle" | "square" | "diamond" | "hex" | "triangle"> = {
  person: "circle",
  startup: "square",
  investor: "diamond",
  campus: "circle",
  program: "hex",
  organization: "triangle",
};

export const DIM_NODE = "#d5d5d5";
/** Hairline at the fitted camera. Thickness is in screen pixels and does not grow with zoom. */
export const EDGE_PX = 0.4;
export const EDGE_GREY = "rgba(80, 80, 80, 0.46)";
/** Faint amber for an edge whose ends sit on different campuses. */
export const EDGE_CROSS = "rgba(176, 96, 24, 0.68)";
export const EDGE_DIM = "rgba(170, 170, 170, 0.14)";
/** Colored only while a node is hovered or selected. */
export const EDGE_HOVER = "#1e4b8a";
export const EDGE_HOVER_PX = 0.95;

export const EDGE_COLOR: Record<MapEdgeType, string> = {
  founded: EDGE_GREY,
  co_founder: EDGE_GREY,
  studied_at: EDGE_GREY,
  invested_in: EDGE_GREY,
  member_of: EDGE_GREY,
  at_campus: EDGE_GREY,
};

const ORG_PX: Record<string, number> = { S: 2.35, A: 2.05, B: 1.7, C: 1.45, D: 1.25 };

/** Screen pixels at every zoom. Hubs are only a little larger than leaves. Organizations stay small triangles. */
export function screenSize(node: MapNode): number {
  const hub = Math.sqrt(Math.max(node.degree, 1));
  if (node.type === "organization") return clamp((ORG_PX[node.orgTier ?? ""] ?? 1.55) + Math.min(1.05, hub * 0.032), 1.25, 3.45);
  if (node.type === "campus") return clamp(2.4 + hub * 0.012, 2.4, 3.2);
  if (node.type === "investor") return clamp(1.35 + hub * 0.09, 1.35, 2.45);
  if (node.type === "program") return clamp(1.4 + hub * 0.07, 1.4, 2.35);
  if (node.type === "startup") return clamp(1.35 + hub * 0.09, 1.35, 2.4);
  return clamp(1.28 + hub * 0.1, 1.28, 2.35);
}

/** Lowest node size that may keep a label at this camera ratio. 1 is the fitted view; smaller ratios are zoomed in. */
export function labelMinSize(cameraRatio: number): number {
  if (cameraRatio >= 0.7) return 2.85;
  if (cameraRatio >= 0.36) return 2.0;
  if (cameraRatio >= 0.16) return 1.48;
  return 1.12;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hueGap(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return Math.min(diff, 360 - diff);
}

function hexToRgba(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
