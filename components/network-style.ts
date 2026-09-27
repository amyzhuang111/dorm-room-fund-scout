import { CAMPUSES } from "@/lib/domain/campuses";
import type { MapEdgeType, MapNode, MapNodeType } from "@/lib/domain/network-map";
import { REGIONS, campusShade, regionDef, regionForCampus, regionInk } from "@/lib/domain/network-regions";

/** Neutral ink for shapes that are not colored by campus. */
export const NODE_FILL: Record<MapNodeType, string> = {
  person: "#3a3a3a",
  startup: "#3a3a3a",
  investor: "#242424",
  campus: "#3a3a3a",
  program: "#2c2c2c",
  organization: "#242424",
};

export interface CampusSwatch {
  id: string;
  label: string;
  color: string;
  regionId: string;
  regionLabel: string;
}

/** Shades of one color family per region. Campuses in a wedge stay related and still distinct. */
export function assignCampusColors(campuses: { id: string; label?: string }[]): Map<string, string> {
  const list = campuses.map((campus) => ({ id: campus.id, label: campus.label ?? campus.id }));
  return new Map(list.map((campus) => [campus.id, campusShade(campus.id, campus.label, list)]));
}

export function campusSwatches(nodes: { id: string; type: string; label: string; x: number; y: number; campus: string | null }[]): CampusSwatch[] {
  const campuses = nodes.filter((node) => node.type === "campus" && node.campus);
  const colors = assignCampusColors(campuses.map((node) => ({ id: node.campus as string, label: node.label })));
  return campuses
    .map((node) => {
      const region = regionDef(regionForCampus(node.campus as string, node.label));
      return { id: node.campus as string, label: node.label, color: colors.get(node.campus as string) ?? NODE_FILL.campus, regionId: region.id, regionLabel: region.fullLabel };
    })
    .sort((a, b) => regionIndex(a.regionId) - regionIndex(b.regionId) || a.label.localeCompare(b.label, "en", { sensitivity: "base" }) || a.id.localeCompare(b.id));
}

export interface SwatchGroup {
  id: string;
  label: string;
  color: string;
  swatches: CampusSwatch[];
}

/** Legend sections, in region order. Empty regions are omitted. */
export function groupCampusSwatches(swatches: CampusSwatch[]): SwatchGroup[] {
  const groups: SwatchGroup[] = [];
  for (const swatch of swatches) {
    const last = groups[groups.length - 1];
    if (!last || last.id !== swatch.regionId) {
      const region = regionDef(swatch.regionId);
      groups.push({ id: region.id, label: region.fullLabel, color: regionInk(region.id), swatches: [swatch] });
    } else last.swatches.push(swatch);
  }
  return groups;
}

function regionIndex(id: string): number {
  const index = REGIONS.findIndex((region) => region.id === id);
  return index < 0 ? REGIONS.length : index;
}

export function nodeColor(node: { type: MapNodeType; campus: string | null; id?: string }, colors: Map<string, string>): string {
  if (node.id && (node.id.startsWith("user_") || node.id.startsWith("ufounder_") || node.id.startsWith("ucampus_"))) return "#111111";
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

export interface RestingLabels {
  /** Labels drawn on the fitted view. Collisions already removed the lower-priority ones. */
  show: Set<string>;
  /** Same entity as a shown label. Hidden at every zoom except when that node is hovered. */
  suppress: Set<string>;
}

type LabelCandidate = {
  id: string;
  label: string;
  type: string;
  degree: number;
  anchor?: boolean;
  x: number;
  y: number;
};

/**
 * One label per entity (exact name, or the same name with a campus prefix such
 * as "MIT delta v" and "delta v"). Campus anchors outrank organization anchors,
 * which outrank the other default labels. Overlapping boxes keep the higher
 * priority label.
 */
export function restingLabelIds(nodes: LabelCandidate[]): RestingLabels {
  const prefixes = campusPrefixes(nodes);
  const known = new Set(
    nodes
      .filter((node) => node.type !== "person" && node.type !== "startup")
      .map((node) => normalizeLabel(node.label))
      .filter((key) => key.length > 0),
  );
  const grouped = new Map<string, LabelCandidate[]>();
  for (const node of nodes) {
    const normalized = normalizeLabel(node.label);
    const shared = node.type !== "person" && node.type !== "startup";
    const key = shared && normalized ? entityKey(normalized, prefixes, known) : `${node.type}:${node.id}`;
    const list = grouped.get(key) ?? [];
    list.push(node);
    grouped.set(key, list);
  }
  const suppress = new Set<string>();
  const winners: LabelCandidate[] = [];
  for (const group of grouped.values()) {
    const ranked = [...group].sort(byLabelPriority);
    winners.push(ranked[0]);
    if (group.length < 2) continue;
    for (const loser of ranked.slice(1)) suppress.add(loser.id);
  }
  const prominent = topIds(winners, suppress);
  const resting = winners.filter((node) => node.anchor || prominent.has(node.id));
  resting.sort(byLabelPriority);
  const show = new Set<string>();
  const boxes: LabelBox[] = [];
  const frame = labelFrame(nodes);
  for (const node of resting) {
    if (suppress.has(node.id)) continue;
    const box = labelBox(node, frame);
    if (boxes.some((kept) => boxesOverlap(kept, box))) continue;
    boxes.push(box);
    show.add(node.id);
  }
  return { show, suppress };
}

function topIds(nodes: LabelCandidate[], suppress: Set<string>): Set<string> {
  return new Set(
    nodes
      .filter((node) => !node.anchor && !suppress.has(node.id))
      .sort((a, b) => b.degree - a.degree || a.id.localeCompare(b.id))
      .slice(0, 15)
      .map((node) => node.id),
  );
}

function byLabelPriority(a: LabelCandidate, b: LabelCandidate): number {
  return labelTier(b) - labelTier(a) || b.degree - a.degree || a.id.localeCompare(b.id);
}

function labelTier(node: LabelCandidate): number {
  if (node.anchor && node.type === "campus") return 3;
  if (node.anchor) return 2;
  return 1;
}

function campusPrefixes(nodes: { type: string; label: string }[]): string[] {
  const prefixes = new Set<string>();
  const add = (value: string) => {
    const key = normalizeLabel(value);
    if (key.length >= 3) prefixes.add(key);
  };
  for (const campus of CAMPUSES) {
    add(campus.shortLabel);
    add(campus.name);
    for (const alias of campus.aliases) add(alias);
  }
  for (const node of nodes) if (node.type === "campus") add(node.label);
  return [...prefixes].sort((a, b) => b.length - a.length);
}

function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Prefer the unprefixed name when both "delta v" and "mit delta v" exist. */
function entityKey(key: string, prefixes: string[], known: Set<string>): string {
  for (const prefix of prefixes) {
    if (!key.startsWith(`${prefix} `)) continue;
    const rest = key.slice(prefix.length + 1);
    if (rest.length >= 3 && known.has(rest)) return rest;
  }
  return key;
}

type LabelBox = { left: number; top: number; right: number; bottom: number };

function labelFrame(nodes: { x: number; y: number }[]): { minX: number; minY: number; scale: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x);
    maxY = Math.max(maxY, node.y);
  }
  const span = Math.max(maxX - minX, maxY - minY, 1);
  return { minX, minY, scale: 740 / span };
}

function labelBox(node: LabelCandidate, frame: { minX: number; minY: number; scale: number }): LabelBox {
  const anchor = Boolean(node.anchor);
  const limit = anchor ? 22 : 28;
  const chars = Math.min(limit, Math.max(node.label.length, 1));
  const width = chars * (anchor ? 7.1 : 6.5) + 8;
  const height = 18;
  const x = (node.x - frame.minX) * frame.scale;
  const y = (node.y - frame.minY) * frame.scale;
  if (anchor) return { left: x - width / 2, top: y - height - 8, right: x + width / 2, bottom: y - 2 };
  return { left: x - width / 2, top: y + 2, right: x + width / 2, bottom: y + height + 4 };
}

function boxesOverlap(a: LabelBox, b: LabelBox): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
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

function hexToRgba(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
