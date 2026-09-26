import type { MapEdgeType, MapNode, MapNodeType } from "@/lib/domain/network-map";

export const NODE_FILL: Record<MapNodeType, string> = {
  person: "#111111",
  startup: "#1d4ed8",
  investor: "#c2410c",
  campus: "#0f766e",
  program: "#6d28d9",
};

export const NODE_SHAPE: Record<MapNodeType, "circle" | "square" | "diamond" | "hex"> = {
  person: "circle",
  startup: "square",
  investor: "diamond",
  campus: "circle",
  program: "hex",
};

export const DIM_NODE = "#d4d4d4";

export const EDGE_COLOR: Record<MapEdgeType, string> = {
  founded: "rgba(29, 78, 216, 0.45)",
  co_founder: "rgba(109, 40, 217, 0.35)",
  studied_at: "rgba(15, 118, 110, 0.22)",
  invested_in: "rgba(194, 65, 12, 0.4)",
  member_of: "rgba(109, 40, 217, 0.3)",
  at_campus: "rgba(15, 118, 110, 0.28)",
};

/** Screen-pixel size at the fitted camera. Larger when the node has more links or funding (`r`). */
export function screenSize(node: MapNode): number {
  if (node.type === "campus") return 18;
  if (node.type === "program") return clamp(7 + Math.sqrt(node.degree) * 0.55, 7, 13);
  if (node.type === "investor") return clamp(5.5 + Math.sqrt(node.degree) * 0.7, 5.5, 16);
  if (node.type === "startup") return clamp(3.6 + node.r * 0.42, 3.6, 13);
  return clamp(2.15 + Math.sqrt(node.degree) * 0.42, 2.15, 7);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
