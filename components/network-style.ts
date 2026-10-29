import { CAMPUSES } from "@/lib/domain/campuses";
import { featuredNationalKey } from "@/lib/domain/featured-national";
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
export const FILL_ALPHA = 0.88;

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

type InkNode = { type: MapNodeType; campus: string | null; id?: string; homeCampus?: string | null; rimBand?: "outer" | "inward" | null; rimTier?: "S+" | "S" | "A" | "B" | "C" | "D" | null };

/** Solid color behind a node, before opacity. Program-to-campus lines use this. */
export function nodeInk(node: InkNode, colors: Map<string, string>): string {
  if (node.id && (node.id.startsWith("user_") || node.id.startsWith("ufounder_") || node.id.startsWith("ucampus_"))) return "#6b7280";
  const home = node.homeCampus && colors.get(node.homeCampus);
  if (home && (node.type === "investor" || node.type === "organization" || node.type === "program")) return home;
  if (node.rimBand === "inward" && (node.type === "investor" || node.type === "organization" || node.type === "program")) return "#c4c9d1";
  if (node.rimBand === "outer" && node.rimTier === "S+" && (node.type === "investor" || node.type === "organization" || node.type === "program")) return "#374151";
  if (node.rimBand === "outer" && node.rimTier === "S" && (node.type === "investor" || node.type === "organization" || node.type === "program")) return "#4b5563";
  if (node.rimBand === "outer" && (node.type === "investor" || node.type === "organization" || node.type === "program")) return "#9ca3af";
  if (node.type === "investor" || node.type === "organization" || node.type === "program") return NODE_FILL[node.type];
  const id = node.campus ?? (node.type === "campus" ? node.id : null);
  if (id && colors.get(id)) return colors.get(id) as string;
  return NODE_FILL[node.type];
}

export function nodeColor(node: InkNode, colors: Map<string, string>): string {
  const ink = nodeInk(node, colors);
  if (node.id && (node.id.startsWith("user_") || node.id.startsWith("ufounder_") || node.id.startsWith("ucampus_"))) return withAlpha(ink, 0.9);
  const home = node.homeCampus && colors.get(node.homeCampus);
  if (home && (node.type === "investor" || node.type === "organization" || node.type === "program")) return withAlpha(ink, FILL_ALPHA);
  if (node.rimBand === "inward" && (node.type === "investor" || node.type === "organization" || node.type === "program")) return "rgba(196, 201, 209, 0.42)";
  if (node.rimBand === "outer" && node.rimTier === "S+" && (node.type === "investor" || node.type === "organization" || node.type === "program")) return withAlpha(ink, 0.96);
  if (node.rimBand === "outer" && node.rimTier === "S" && (node.type === "investor" || node.type === "organization" || node.type === "program")) return withAlpha(ink, 0.96);
  if (node.rimBand === "outer" && (node.type === "investor" || node.type === "organization" || node.type === "program")) return withAlpha(ink, 0.82);
  if (node.type === "investor" || node.type === "organization" || node.type === "program") return withAlpha(ink, 0.9);
  return withAlpha(ink, FILL_ALPHA);
}

/** Label ink for a campus shade. Same hue, darkened until it clears 4.5:1 on white. */
export function readableInk(hex: string): string {
  const parsed = parseHex(hex);
  if (!parsed) return "#374151";
  let [red, green, blue] = parsed;
  if (contrastOnWhite(red, green, blue) >= 4.5) return toHex(red, green, blue);
  const { h, s, l: startL } = rgbToHsl(red, green, blue);
  let l = startL;
  for (let step = 0; step < 28 && contrastOnWhite(red, green, blue) < 4.5; step++) {
    l = Math.max(12, l - 3);
    [red, green, blue] = hslToRgb(h, s, l);
    if (l <= 12) break;
  }
  return toHex(red, green, blue);
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
/** Hairline at the fitted camera. Thickness then grows with zoom, in step with the nodes. */
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
/** Campus clubs and hubs. Medium weight, at least 11px, so the colored ink stays readable. */
export const LABEL_CLUB = 11;
/** Thiel Fellowship, the one program label that stays on at every zoom. */
export const LABEL_LEAD = 13;
export const LABEL_REGION = 10;
export const LABEL_NODE = 11;
/** A tucked hub at least this connected is a main campus hub and may be labeled on the fitted view. */
export const MAIN_CAMPUS_HUB_DEGREE = 8;
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
  if (node.type === "campus") return Math.min(9.5, 8 + score * 1.5);
  if (node.type === "organization" || node.type === "program" || node.type === "investor") {
    if (node.rimBand === "outer" && node.rimTier === "S+") return 6.2;
    if (featuredNationalKey(node.label)) return 6;
    if (node.rimBand === "outer" && node.rimTier === "S") return Math.min(5.4, 4.8 + score * 0.5);
    if (node.rimBand === "outer") return Math.min(3.65, 3.1 + score * 0.4);
    if (node.rimBand === "inward") return Math.min(2.15, 1.65 + score * 0.35);
    return Math.min(4.2, 2.7 + score * 1.25);
  }
  if (node.type === "startup") return 2.35 + score * 0.55;
  return 1.15 + score * 0.25;
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
 * The fitted view (ratio near 0.8 after the tight frame) stays sparse.
 * Zooming in (smaller ratio) lowers the bar, and the collision pass still
 * drops anything that would overlap.
 */
export function labelDegreeFloor(cameraRatio: number): number {
  if (cameraRatio >= 0.55) return 1_000_000;
  if (cameraRatio >= 0.34) return 24;
  if (cameraRatio >= 0.18) return 8;
  if (cameraRatio >= 0.09) return 3;
  return 1;
}

/**
 * Camera ratio for Fit. The span already includes a little padding; multiplying
 * under 1 keeps the whole cloud on screen.
 */
export function openingCameraRatio(span: number): number {
  return Math.min(0.96, Math.max(0.18, span * 0.9));
}

/**
 * First view, closer than Fit. Campus and hub labels stay readable and the
 * cloud fills the canvas. Fit still uses `openingCameraRatio`.
 */
export function openingZoomRatio(fitRatio: number): number {
  return Math.max(0.18, Math.min(0.46, fitRatio * 0.52));
}

/**
 * Sigma divides node and edge sizes by this factor. `1` at the fitted view
 * keeps the designed pixel sizes. Zooming in (smaller ratio) returns a
 * smaller factor, so nodes and lines grow by the same amount.
 * Growth stops at 10× so a deep zoom stays readable.
 */
export function zoomSizeFactor(cameraRatio: number, fitRatio: number): number {
  const fit = Math.max(fitRatio, 0.04);
  const linear = Math.max(cameraRatio, 0.02) / fit;
  return Math.max(linear, 0.1);
}

/**
 * On-screen label size. Geometry scales by `zoom = fitRatio / cameraRatio`.
 * A font that followed the geometry would be `basePx * zoom`. Dividing by
 * that same zoom puts the glyphs back at a readable screen size.
 */
export function labelScreenPx(basePx: number, cameraRatio: number, fitRatio: number): number {
  const zoom = Math.max(fitRatio, 0.04) / Math.max(cameraRatio, 0.02);
  const screen = (basePx * zoom) / zoom;
  return Math.round(clamp(screen, 11, 15));
}

export interface FramePoint {
  x: number;
  y: number;
}

/** Camera state that frames a campus or program neighborhood, never wider than the fitted cloud. */
export function neighborhoodView(points: FramePoint[], fitRatio: number): { x: number; y: number; ratio: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  if (!Number.isFinite(minX)) return { x: 0.5, y: 0.5, ratio: fitRatio };
  const width = Math.max(maxX - minX, 0.012);
  const height = Math.max(maxY - minY, 0.012);
  const pad = Math.max(width, height) * 0.32;
  const left = minX - pad;
  const right = maxX + pad;
  const top = minY - pad;
  const bottom = maxY + pad;
  const span = Math.max(right - left, bottom - top, 0.02);
  const ratio = Math.min(fitRatio, Math.max(0.05, span * 1.08));
  return { x: (left + right) / 2, y: (top + bottom) / 2, ratio };
}

/**
 * Main campus hubs stay eligible on the fitted view. Zooming in (smaller ratio)
 * admits the smaller clubs. Collision still drops any label that would overlap.
 */
export function campusHubDegreeFloor(cameraRatio: number): number {
  if (cameraRatio >= 0.48) return MAIN_CAMPUS_HUB_DEGREE;
  if (cameraRatio >= 0.28) return 4;
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
  dx?: number;
  dy?: number;
  /** Campus disc this label may sit on. Other discs still block it when strictDiscs is set. */
  discId?: string;
  /** Drop the label rather than covering another campus. Used for Thiel. */
  strictDiscs?: boolean;
  /** A campus disc large enough that its name stays on the fitted view. */
  required?: boolean;
}

export interface LabelOffset {
  dx: number;
  dy: number;
}

export interface CampusDisc {
  id: string;
  x: number;
  y: number;
  r: number;
}

/** Slots stay within a few pixels of the node. A label that cannot sit there is omitted. */
const ANCHOR_OFFSETS: LabelOffset[] = [
  { dx: 0, dy: 0 },
  { dx: 16, dy: 0 },
  { dx: -16, dy: 0 },
  { dx: 0, dy: 14 },
  { dx: 12, dy: 10 },
  { dx: -12, dy: 10 },
  { dx: 0, dy: -10 },
  { dx: 14, dy: -8 },
  { dx: -14, dy: -8 },
];

/** Extra room so two neighboring campus names, including Queen's and Cambridge, can sit on opposite sides. */
const REQUIRED_OFFSETS: LabelOffset[] = [
  ...ANCHOR_OFFSETS,
  { dx: 0, dy: -24 },
  { dx: 0, dy: 22 },
  { dx: 30, dy: 0 },
  { dx: -30, dy: 0 },
  { dx: 24, dy: -16 },
  { dx: -24, dy: -16 },
  { dx: 24, dy: 16 },
  { dx: -24, dy: 16 },
  { dx: 42, dy: 0 },
  { dx: -42, dy: 0 },
  { dx: 0, dy: -40 },
  { dx: 0, dy: 36 },
  { dx: 36, dy: -22 },
  { dx: -36, dy: -22 },
  { dx: 36, dy: 20 },
  { dx: -36, dy: 20 },
];

/** Fitted-view guarantee. Dartmouth is the smallest of the major discs that must keep a name. */
export const CAMPUS_LABEL_MIN_MEMBERS = 10;

/** Hover card drawn to the right of the active node. Other labels must stay clear of it. */
export function hoverLabelBox(x: number, y: number, nodeSize: number, textWidth: number, fontSize: number): LabelBox {
  const left = x + nodeSize + 8;
  const top = y - fontSize / 2 - 8;
  // Title, connection count, and the signal line share this card.
  return { left: left - 2, top: top - 2, right: left + textWidth + 18, bottom: top + fontSize + 40 };
}

/**
 * Greedy screen-space placement. Required campus names go first, then higher
 * tiers (Thiel, other campuses, programs, clubs). A club or hub that would
 * touch a campus name is omitted. A required campus name is kept on the
 * nearest free side of its disc.
 */
export function selectVisibleLabels(
  labels: ScreenLabel[],
  measure: (text: string, fontSize: number) => number,
  reserved: LabelBox[] = [],
  discs: CampusDisc[] = [],
): Map<string, LabelOffset> {
  const rank = (label: ScreenLabel) => (label.required ? 8 : label.tier);
  const ranked = [...labels].sort((a, b) => rank(b) - rank(a) || b.tier - a.tier || b.degree - a.degree || a.id.localeCompare(b.id));
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
  const hitsDisc = (box: LabelBox, discId?: string) => discs.some((disc) => disc.id !== discId && boxHitsDisc(box, disc));
  const overlapScore = (box: LabelBox): number => {
    const seen = new Set<LabelBox>();
    let score = 0;
    const x0 = Math.floor(box.left / cell);
    const x1 = Math.floor(box.right / cell);
    const y0 = Math.floor(box.top / cell);
    const y1 = Math.floor(box.bottom / cell);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const list = grid.get(`${x}:${y}`);
        if (!list) continue;
        for (const other of list) {
          if (seen.has(other)) continue;
          seen.add(other);
          if (!boxesOverlap(other, box)) continue;
          const width = Math.min(other.right, box.right) - Math.max(other.left, box.left);
          const height = Math.min(other.bottom, box.bottom) - Math.max(other.top, box.top);
          score += Math.max(0, width) * Math.max(0, height);
        }
      }
    }
    return score;
  };
  for (const box of reserved) index(box);
  const show = new Map<string, LabelOffset>();
  const campusAnchors: { x: number; y: number; r: number }[] = [];
  for (const label of ranked) {
    const slots = label.required ? REQUIRED_OFFSETS : label.anchor ? ANCHOR_OFFSETS : [{ dx: 0, dy: 0 }];
    const limit = label.required ? 48 : 22;
    let chosen: { offset: LabelOffset; box: LabelBox } | null = null;
    let closest: { offset: LabelOffset; box: LabelBox; score: number } | null = null;
    for (const offset of slots) {
      if (Math.hypot(offset.dx, offset.dy) > limit) continue;
      const box = screenLabelBox({ ...label, dx: offset.dx, dy: offset.dy }, measure);
      const padded = { left: box.left - 4, top: box.top - 3, right: box.right + 4, bottom: box.bottom + 3 };
      if (label.anchor && boxHitsCircle(box, label.x, label.y, label.nodeSize * 0.8)) continue;
      if (!label.required && campusAnchors.some((campus) => boxHitsCircle(box, campus.x, campus.y, campus.r))) continue;
      if (label.strictDiscs && hitsDisc(box, label.discId)) continue;
      const score = overlapScore(padded);
      if (score === 0) {
        chosen = { offset, box: padded };
        break;
      }
      if (label.required && (!closest || score < closest.score)) closest = { offset, box: padded, score };
    }
    if (!chosen && closest) chosen = { offset: closest.offset, box: closest.box };
    if (!chosen) continue;
    index(chosen.box);
    if (label.required) campusAnchors.push({ x: label.x, y: label.y, r: Math.max(22, label.nodeSize * 2.4) });
    show.set(label.id, chosen.offset);
  }
  return show;
}

function boxHitsCircle(box: LabelBox, x: number, y: number, radius: number): boolean {
  const cx = Math.max(box.left, Math.min(x, box.right));
  const cy = Math.max(box.top, Math.min(y, box.bottom));
  const dx = cx - x;
  const dy = cy - y;
  return dx * dx + dy * dy < radius * radius;
}

function boxHitsDisc(box: LabelBox, disc: CampusDisc): boolean {
  const x = Math.max(box.left, Math.min(disc.x, box.right));
  const y = Math.max(box.top, Math.min(disc.y, box.bottom));
  const dx = x - disc.x;
  const dy = y - disc.y;
  const reach = disc.r + 4;
  return dx * dx + dy * dy < reach * reach;
}

function screenLabelBox(label: ScreenLabel, measure: (text: string, fontSize: number) => number): LabelBox {
  const tracking = label.tracking ?? 0;
  const width = Math.max(8, measure(label.text, label.fontSize) + Math.max(0, label.text.length - 1) * tracking) + (label.marker ? 16 : 12);
  const height = label.fontSize + 10;
  const x = label.x + (label.dx ?? 0);
  const y = (label.marker ? label.y : label.anchor ? label.y - label.nodeSize - 2 : label.y + label.nodeSize + 2) + (label.dy ?? 0);
  if (label.marker) return { left: x - width / 2, top: y - height / 2, right: x + width / 2, bottom: y + height / 2 };
  if (label.anchor) return { left: x - width / 2, top: y - height, right: x + width / 2, bottom: y + 2 };
  return { left: x - width / 2, top: y - 2, right: x + width / 2, bottom: y + height };
}

const PROGRAM_LINE_HEX: Record<string, string> = {
  thiel: "#0f766e",
  yc: "#ea580c",
  founders_inc: "#7c3aed",
  z_fellows: "#db2777",
  emergent: "#ca8a04",
  spc: "#0284c7",
  neo: "#16a34a",
  hf0: "#9333ea",
  contrary: "#e11d48",
  pear: "#65a30d",
  speedrun: "#d97706",
  human_capital: "#0891b2",
  kp: "#4f46e5",
};

/** Distinct hue for a program's campus lines. Not the grey used for the node ink. */
export function programLineColor(label: string, id = ""): string {
  const key = featuredNationalKey(label);
  if (key && PROGRAM_LINE_HEX[key]) return PROGRAM_LINE_HEX[key];
  const seed = `${label}:${id}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 33 + seed.charCodeAt(i)) >>> 0;
  const [red, green, blue] = hslToRgb(hash % 360, 62, 46);
  return toHex(red, green, blue);
}

/** Dark-gray accelerator links on the white map. A strong cohort uses this; weaker ones fade. */
export const PROGRAM_LINE = "rgba(32, 34, 38, 0.62)";
export const PROGRAM_LINE_ACTIVE = "#111111";
export const PROGRAM_LINE_DIM = "rgba(180, 180, 180, 0.1)";

/**
 * Fitted-view pixels. Half the previous weight: a handful of members stays a
 * readable stroke, and a large cohort no longer covers the map. Zoom scales
 * this with the nodes.
 */
export function bundleWidth(count: number): number {
  return Math.min(3.25, 0.925 + Math.log2(Math.max(count, 1)) * 0.275);
}

/**
 * How dark a program link is. A single member stays a light stroke; a large
 * cohort approaches a dark gray, still short of solid black. Thickness and
 * this opacity move together.
 */
export function bundleOpacity(count: number): number {
  const t = Math.min(1, Math.log2(Math.max(count, 1)) / 6);
  return Math.round((0.34 + t * 0.48) * 1000) / 1000;
}

/** Weighted program ink. Dark gray, opacity from `bundleOpacity`. */
export function bundleInk(count: number): string {
  return `rgba(32, 34, 38, ${bundleOpacity(count).toFixed(3)})`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseHex(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex(red: number, green: number, blue: number): string {
  const channel = (value: number) => Math.round(value).toString(16).padStart(2, "0");
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

function linearChannel(value: number): number {
  const channel = value / 255;
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function contrastOnWhite(red: number, green: number, blue: number): number {
  const luminance = 0.2126 * linearChannel(red) + 0.7152 * linearChannel(green) + 0.0722 * linearChannel(blue);
  return 1.05 / (luminance + 0.05);
}

function rgbToHsl(red: number, green: number, blue: number): { h: number; s: number; l: number } {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { h: 0, s: 0, l: l * 100 };
  const s = delta / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  return { h: (h * 60 + 360) % 360, s: s * 100, l: l * 100 };
}

function hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
  const sat = saturation / 100;
  const light = lightness / 100;
  const chroma = (1 - Math.abs(2 * light - 1)) * sat;
  const hp = hue / 60;
  const x = chroma * (1 - Math.abs((hp % 2) - 1));
  let red = 0;
  let green = 0;
  let blue = 0;
  if (hp < 1) [red, green, blue] = [chroma, x, 0];
  else if (hp < 2) [red, green, blue] = [x, chroma, 0];
  else if (hp < 3) [red, green, blue] = [0, chroma, x];
  else if (hp < 4) [red, green, blue] = [0, x, chroma];
  else if (hp < 5) [red, green, blue] = [x, 0, chroma];
  else [red, green, blue] = [chroma, 0, x];
  const match = light - chroma / 2;
  const channel = (value: number) => Math.round((value + match) * 255);
  return [channel(red), channel(green), channel(blue)];
}

function withAlpha(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
