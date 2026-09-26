import type { MapEdgeType, MapNode, MapNodeType } from "@/lib/domain/network-map";

export const NODE_FILL: Record<MapNodeType, string> = {
  person: "#111111",
  startup: "#1d4ed8",
  investor: "#3f3f46",
  campus: "#0f766e",
  program: "#6d28d9",
};

/** Soft campus tints. Clusters read by color; type stays in the shape. */
export const CAMPUS_COLOR: Record<string, string> = {
  univ_penn: "#1d4ed8",
  univ_berkeley: "#b45309",
  univ_mit: "#be123c",
  univ_stanford: "#047857",
  univ_waterloo: "#6d28d9",
  univ_harvard: "#9f1239",
  univ_columbia: "#0e7490",
  univ_gatech: "#c2410c",
  univ_michigan: "#1e3a8a",
  univ_princeton: "#a16207",
  univ_cmu: "#4338ca",
};

export function nodeColor(node: { type: MapNodeType; campus: string | null }): string {
  if (node.type === "investor") return NODE_FILL.investor;
  if (node.campus && CAMPUS_COLOR[node.campus]) return CAMPUS_COLOR[node.campus];
  return NODE_FILL[node.type];
}

export const NODE_SHAPE: Record<MapNodeType, "circle" | "square" | "diamond" | "hex"> = {
  person: "circle",
  startup: "square",
  investor: "diamond",
  campus: "circle",
  program: "hex",
};

export const DIM_NODE = "#e4e4e4";
export const EDGE_GREY = "rgba(82, 82, 82, 0.22)";
export const EDGE_CROSS = "rgba(180, 83, 9, 0.38)";
export const EDGE_HOVER = "#171717";
export const EDGE_HOVER_CROSS = "#9a3412";

export const EDGE_COLOR: Record<MapEdgeType, string> = {
  founded: EDGE_GREY,
  co_founder: EDGE_GREY,
  studied_at: "rgba(82, 82, 82, 0.14)",
  invested_in: EDGE_GREY,
  member_of: EDGE_GREY,
  at_campus: "rgba(82, 82, 82, 0.16)",
};

/** Screen pixels at the fitted camera. Hubs are only a little larger than leaves. */
export function screenSize(node: MapNode): number {
  const hub = Math.sqrt(Math.max(node.degree, 1));
  if (node.type === "campus") return clamp(3.1 + hub * 0.04, 3.1, 5.2);
  if (node.type === "investor") return clamp(1.45 + hub * 0.16, 1.45, 3.2);
  if (node.type === "program") return clamp(1.55 + hub * 0.12, 1.55, 3);
  if (node.type === "startup") return clamp(1.3 + hub * 0.08, 1.3, 2.8);
  return clamp(1.05 + hub * 0.1, 1.05, 2.4);
}

export function campusKey(node: { campus: string | null; campuses?: string[] }): string {
  const ids = node.campuses?.length ? node.campuses : node.campus ? [node.campus] : [];
  return [...ids].sort().join(",");
}

export function crossesCampus(a: string, b: string): boolean {
  if (!a || !b) return false;
  const other = new Set(b.split(","));
  return !a.split(",").some((id) => other.has(id));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
