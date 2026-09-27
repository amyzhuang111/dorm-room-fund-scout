import { CAMPUSES } from "@/lib/domain/campuses";
import type { MapEdgeType, MapNode, MapNodeType } from "@/lib/domain/network-map";
import { REGIONS, campusShade, regionDef, regionForCampus, regionInk } from "@/lib/domain/network-regions";

/** Mid grey for shapes that are not colored by campus. Never pure black. */
export const NODE_FILL: Record<MapNodeType, string> = {
  person: "#9aa3b2",
  startup: "#9aa3b2",
  investor: "#9ca3af",
  campus: "#8b95a8",
  program: "#9ca3af",
  organization: "#9ca3af",
};

/** People and startups sit in this opacity so overlapping dots blend instead of stacking ink. */
export const FILL_ALPHA = 0.82;

export interface CampusSwatch {
  id: string;
  label: string;
  color: string;
  regionId: string;
  regionLabel: string;
}

/** Shades of one color family per region. Campuses in a neighborhood stay related and still distinct. */
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
  if (node.id && (node.id.startsWith("user_") || node.id.startsWith("ufounder_") || node.id.startsWith("ucampus_"))) return withAlpha("#6b7280", 0.9);
  if (node.type === "investor" || node.type === "organization" || node.type === "program") return withAlpha(NODE_FILL[node.type], 0.9);
  const id = node.campus ?? (node.type === "campus" ? node.id : null);
  if (id && colors.get(id)) return withAlpha(colors.get(id) as string, FILL_ALPHA);
  return withAlpha(NODE_FILL[node.type], FILL_ALPHA);
}

/** The hovered node's neighborhood. Same hue, darker and more opaque than the resting hairline. */
export function emphasizeColor(color: string): string {
  const match = color.match(/rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*[\d.]+\s*\)/);
  if (!match) return "rgba(55, 65, 81, 0.55)";
  const channel = (value: string) => Math.round(Number(value) * 0.8);
  return `rgba(${channel(match[1])}, ${channel(match[2])}, ${channel(match[3])}, 0.58)`;
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

export const DIM_NODE = "#e5e7eb";
/** Hairline at the fitted camera. Thickness is in screen pixels and does not grow with zoom. */
export const EDGE_PX = 0.5;
export const EDGE_GREY = "rgba(120, 124, 130, 0.09)";
export const EDGE_DIM = "rgba(170, 170, 170, 0.045)";
export const EDGE_HOVER_PX = 1.05;
/** Structural nodes at or above this degree hide their spokes until hover. */
export const FAN_DEGREE = 12;
/** A rim hub this connected draws none of its edges until hover. */
export const MEGA_DEGREE = 34;
/** Labels kept on the fitted view, besides campuses. */
export const TOP_HUB_LABELS = 8;
export const LABEL_CAMPUS = 12;
export const LABEL_HUB = 11;
export const LABEL_REGION = 10;
export const LABEL_NODE = 11;
/** Extra pixels between uppercase region letters. */
export const REGION_TRACKING = 1.55;

export const EDGE_COLOR: Record<MapEdgeType, string> = {
  founded: EDGE_GREY,
  co_founder: EDGE_GREY,
  studied_at: EDGE_GREY,
  invested_in: EDGE_GREY,
  member_of: EDGE_GREY,
  at_campus: EDGE_GREY,
  works_at: EDGE_GREY,
};

/**
 * Screen pixels at every zoom. `signalScore` is already a 0–1 sqrt of the
 * per-capita ratio (or of the node's own connection count). People are ~2px
 * dots. Startups stay small squares. Only campuses grow, and they are capped
 * so one node cannot dominate the cloud.
 */
export function screenSize(node: MapNode): number {
  const score = clamp(node.signalScore ?? 0, 0, 1);
  if (node.type === "campus") return Math.min(9.5, 6.2 + score * 3.3);
  if (node.type === "organization" || node.type === "program" || node.type === "investor") return Math.min(4.1, 2.35 + score * 1.35);
  if (node.type === "startup") return 2.2 + score * 0.5;
  return 1.85 + score * 0.3;
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
 * which outrank the other default labels. The fitted-view boxes here are only
 * a fallback. The map itself places labels in screen pixels on every camera
 * change, so nothing overlaps at any zoom.
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
      .slice(0, TOP_HUB_LABELS)
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

/** 4 = region, 3 = campus, 2 = rim hub, 1 = every other node (ordered by degree). */
export function screenLabelTier(marker: boolean, anchor: boolean, type: string): number {
  if (marker) return 4;
  if (anchor && type === "campus") return 3;
  if (anchor) return 2;
  return 1;
}

/** Same truncation drawHaloLabel uses, so the collision box matches the glyphs. */
export function truncateMapLabel(text: string, marker: boolean, anchor: boolean): string {
  const limit = marker ? 32 : anchor ? 26 : 28;
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1)}…`;
}

/**
 * How connected a non-campus node must be before its label may compete.
 * The fitted view (ratio near 1) stays sparse. Zooming in (smaller ratio)
 * lowers the bar, and the collision pass still drops anything that would overlap.
 */
export function labelDegreeFloor(cameraRatio: number): number {
  if (cameraRatio >= 0.78) return 1_000_000;
  if (cameraRatio >= 0.48) return 30;
  if (cameraRatio >= 0.28) return 12;
  if (cameraRatio >= 0.14) return 4;
  return 1;
}

export interface ScreenLabel {
  id: string;
  tier: number;
  degree: number;
  text: string;
  x: number;
  y: number;
  nodeSize: number;
  marker: boolean;
  anchor: boolean;
  fontSize: number;
  tracking?: number;
}

/** Hover card drawn to the right of the active node. Other labels must stay clear of it. */
export function hoverLabelBox(x: number, y: number, nodeSize: number, textWidth: number, fontSize: number): LabelBox {
  const left = x + nodeSize + 8;
  const top = y - fontSize / 2 - 4;
  return { left: left - 2, top: top - 2, right: left + textWidth + 14, bottom: top + fontSize + 10 };
}

/**
 * Greedy screen-space placement. Higher tiers win (regions, then campuses,
 * then high-degree nodes). A label that would touch one already kept is omitted.
 */
export function selectVisibleLabels(labels: ScreenLabel[], measure: (text: string, fontSize: number) => number, reserved: LabelBox[] = []): Set<string> {
  const ranked = [...labels].sort((a, b) => b.tier - a.tier || b.degree - a.degree || a.id.localeCompare(b.id));
  const cell = 72;
  const grid = new Map<string, LabelBox[]>();
  const index = (box: LabelBox) => {
    const x0 = Math.floor(box.left / cell);
    const x1 = Math.floor(box.right / cell);
    const y0 = Math.floor(box.top / cell);
    const y1 = Math.floor(box.bottom / cell);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const key = `${x}:${y}`;
        const list = grid.get(key);
        if (list) list.push(box);
        else grid.set(key, [box]);
      }
    }
  };
  const hits = (box: LabelBox): boolean => {
    const x0 = Math.floor(box.left / cell);
    const x1 = Math.floor(box.right / cell);
    const y0 = Math.floor(box.top / cell);
    const y1 = Math.floor(box.bottom / cell);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const list = grid.get(`${x}:${y}`);
        if (!list) continue;
        for (const other of list) if (boxesOverlap(other, box)) return true;
      }
    }
    return false;
  };
  for (const box of reserved) index(box);
  const show = new Set<string>();
  for (const label of ranked) {
    const box = screenLabelBox(label, measure);
    if (hits(box)) continue;
    index(box);
    show.add(label.id);
  }
  return show;
}

function screenLabelBox(label: ScreenLabel, measure: (text: string, fontSize: number) => number): LabelBox {
  const tracking = label.tracking ?? 0;
  const width = Math.max(8, measure(label.text, label.fontSize) + Math.max(0, label.text.length - 1) * tracking) + (label.marker ? 16 : 12);
  const height = label.fontSize + 10;
  const x = label.x;
  const y = label.marker ? label.y : label.anchor ? label.y - label.nodeSize - 2 : label.y + label.nodeSize + 2;
  if (label.marker) return { left: x - width / 2, top: y - height / 2, right: x + width / 2, bottom: y + height / 2 };
  if (label.anchor) return { left: x - width / 2, top: y - height, right: x + width / 2, bottom: y + 2 };
  return { left: x - width / 2, top: y - 2, right: x + width / 2, bottom: y + height };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function withAlpha(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
