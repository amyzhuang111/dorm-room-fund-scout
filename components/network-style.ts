import type { MapEdgeType, MapNode, MapNodeType } from "@/lib/domain/network-map";

/** Muted type colors on white. Clusters read from position, not from a campus tint. */
export const NODE_FILL: Record<MapNodeType, string> = {
  person: "#5c6570",
  startup: "#2f5f82",
  investor: "#7a5b32",
  campus: "#1f5c54",
  program: "#4a4560",
  organization: "#5c3d86",
};

export function nodeColor(node: { type: MapNodeType }): string {
  return NODE_FILL[node.type];
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
export const EDGE_GREY = "rgba(120, 120, 120, 0.28)";
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
  if (node.type === "campus") return clamp(2.15 + hub * 0.022, 2.15, 3.15);
  if (node.type === "investor") return clamp(1.35 + hub * 0.09, 1.35, 2.45);
  if (node.type === "program") return clamp(1.4 + hub * 0.07, 1.4, 2.35);
  if (node.type === "startup") return clamp(1.15 + hub * 0.09, 1.15, 2.15);
  return clamp(1.02 + hub * 0.1, 1.02, 2.05);
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
