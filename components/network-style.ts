import type { MapEdgeType, MapNode, MapNodeType } from "@/lib/domain/network-map";

/** Muted campus tints. Investors and organizations keep a type color so shape and color agree. */
export const NODE_FILL: Record<MapNodeType, string> = {
  person: "#5c6570",
  startup: "#3d5c73",
  investor: "#7a5b32",
  campus: "#3d5c56",
  program: "#4a4560",
  organization: "#5c3d86",
};

const CAMPUS_COLOR: Record<string, string> = {
  univ_penn: "#4a6fa5",
  univ_berkeley: "#a67c4e",
  univ_mit: "#a85a6a",
  univ_stanford: "#4f8a72",
  univ_waterloo: "#7a6a9a",
  univ_harvard: "#9a5a62",
  univ_columbia: "#4e8494",
  univ_gatech: "#b07a4a",
  univ_michigan: "#4a5f8a",
  univ_princeton: "#a89050",
  univ_cmu: "#6a62a0",
};

export function nodeColor(node: { type: MapNodeType; campus: string | null }): string {
  if (node.type === "investor" || node.type === "organization") return NODE_FILL[node.type];
  if (node.campus && CAMPUS_COLOR[node.campus]) return CAMPUS_COLOR[node.campus];
  return NODE_FILL[node.type];
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
