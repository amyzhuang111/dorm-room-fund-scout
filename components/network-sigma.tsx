"use client";

import Graph from "graphology";
import { useEffect, useRef } from "react";
import Sigma from "sigma";
import { featuredNationalKey } from "@/lib/domain/featured-national";
import type { MapEdgeType, MapGraph, MapNodeType } from "@/lib/domain/network-map";
import { NodeCircleCrispProgram, NodeDiamondProgram, NodeHexProgram, NodeSquareLightProgram, NodeTriangleProgram, drawHaloLabel, drawLightHover } from "./network-shapes";
import { signalTooltip } from "@/lib/domain/network-signal-size";
import { DIM_NODE, EDGE_DIM, EDGE_GREY, EDGE_HOVER_PX, EDGE_PX, FAN_DEGREE, LABEL_CAMPUS, LABEL_CLUB, LABEL_HUB, LABEL_LEAD, LABEL_NODE, MEGA_DEGREE, NODE_SHAPE, campusHubDegreeFloor, campusSwatches, emphasizeColor, hoverLabelBox, labelDegreeFloor, nodeColor, nodeInk, readableInk, restingLabelIds, screenSize, selectVisibleLabels, truncateMapLabel, type CampusDisc, type LabelOffset, type ScreenLabel } from "./network-style";

export interface NetworkSigmaHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
}

type NodeAttr = {
  x: number;
  y: number;
  size: number;
  label: string;
  fullLabel: string;
  color: string;
  type: string;
  kind: MapNodeType;
  anchor: boolean;
  marker?: boolean;
  regionId?: string;
  zIndex: number;
  signalTip?: string;
  tint?: string;
  linkColor: string;
  labelPx?: number;
  labelColor?: string;
  labelDx?: number;
  labelDy?: number;
  highlighted?: boolean;
};

type EdgeAttr = {
  kind: MapEdgeType;
  color: string;
  size: number;
  /** Spoke of a rim hub. Drawn only while a person or startup on that spoke is active. */
  defer: boolean;
  /** One line per program-campus pair. Width follows how many people sit on it. */
  bundle?: boolean;
  hoverColor?: string;
};

const QUIET_EDGE = new Set<MapEdgeType>(["studied_at", "at_campus"]);

const Z: Record<MapNodeType, number> = {
  person: 0,
  startup: 1,
  program: 1,
  organization: 2,
  investor: 2,
  campus: 3,
};

export function NetworkSigma({
  graph,
  hidden,
  edgeTypes,
  selected,
  flyToken,
  flyId,
  onSelect,
  onReady,
}: {
  graph: MapGraph;
  hidden: Set<string>;
  edgeTypes: Set<MapEdgeType>;
  selected: string | null;
  flyToken: number;
  flyId: string | null;
  onSelect: (id: string | null) => void;
  onReady: (api: NetworkSigmaHandle | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<Sigma<NodeAttr, EdgeAttr> | null>(null);
  const stateRef = useRef({
    hidden,
    edgeTypes,
    selected,
    hovered: null as string | null,
  });
  const onSelectRef = useRef(onSelect);
  const onReadyRef = useRef(onReady);
  const hiddenRef = useRef(hidden);
  const recomputeLabelsRef = useRef<() => void>(() => {});

  useEffect(() => {
    onSelectRef.current = onSelect;
    onReadyRef.current = onReady;
  }, [onSelect, onReady]);

  useEffect(() => {
    const hiddenChanged = hiddenRef.current !== hidden;
    hiddenRef.current = hidden;
    stateRef.current.hidden = hidden;
    stateRef.current.edgeTypes = edgeTypes;
    stateRef.current.selected = selected;
    const renderer = rendererRef.current;
    if (!renderer) return;
    recomputeLabelsRef.current();
    renderer.refresh();
    if (hiddenChanged) frameVisible(renderer, hidden);
  }, [hidden, edgeTypes, selected]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const g = new Graph<NodeAttr, EdgeAttr>({ type: "undirected", multi: true });
    const neighbors = new Map<string, Set<string>>();
    const link = (a: string, b: string) => {
      const set = neighbors.get(a);
      if (set) set.add(b);
      else neighbors.set(a, new Set([b]));
    };

    const suppressed = restingLabelIds(graph.nodes).suppress;
    const featured = new Set<string>();
    const featuredNames = new Set<string>();
    for (const node of graph.nodes
      .filter((node) => node.rimBand === "outer")
      .sort((a, b) => (a.rimTier === "S+" ? 0 : a.rimTier === "S" ? 1 : 2) - (b.rimTier === "S+" ? 0 : b.rimTier === "S" ? 1 : 2) || b.degree - a.degree || a.id.localeCompare(b.id))) {
      const name = node.label.trim().toLowerCase();
      if (!name || featuredNames.has(name)) continue;
      featuredNames.add(name);
      featured.add(node.id);
    }
    const namedIds = new Set<string>();
    const namedBest = new Map<string, (typeof graph.nodes)[number]>();
    const namedPool = graph.nodes.filter((node) => featuredNationalKey(node.label));
    namedPool.sort(
      (a, b) =>
        (a.rimTier === "S+" ? 0 : a.rimTier === "S" ? 1 : a.rimBand === "outer" ? 2 : 3) - (b.rimTier === "S+" ? 0 : b.rimTier === "S" ? 1 : b.rimBand === "outer" ? 2 : 3) ||
        b.degree - a.degree ||
        a.id.localeCompare(b.id),
    );
    for (const node of namedPool) {
      const key = featuredNationalKey(node.label);
      if (!key || namedBest.has(key)) continue;
      namedBest.set(key, node);
    }
    for (const node of namedBest.values()) namedIds.add(node.id);
    const layoutRadius = new Map<string, number>();
    for (const campus of graph.nodes) {
      if (campus.type !== "campus") continue;
      const campusId = campus.campus || campus.id;
      const distances: number[] = [];
      for (const node of graph.nodes) {
        if ((node.type !== "person" && node.type !== "startup") || node.campus !== campusId) continue;
        const dist = Math.hypot(node.x - campus.x, node.y - campus.y);
        if (dist < 60) distances.push(dist);
      }
      distances.sort((a, b) => a - b);
      const radius = distances.length ? distances[Math.min(distances.length - 1, Math.floor(distances.length * 0.94))] : 8;
      layoutRadius.set(campus.id, Math.max(8, radius));
    }
    const measureCanvas = document.createElement("canvas");
    const measureCtx = measureCanvas.getContext("2d");
    const measure = (text: string, fontSize: number) => {
      if (!measureCtx) return text.length * fontSize * 0.56;
      measureCtx.font = `500 ${fontSize}px Satoshi, Arial, sans-serif`;
      return measureCtx.measureText(text).width;
    };
    const placed: { offsets: Map<string, LabelOffset> } = { offsets: new Map() };
    const labelMeta: { id: string; tier: number; degree: number; text: string; fullText: string; marker: boolean; anchor: boolean; fontSize: number; tracking: number; campusHub: boolean; named: boolean; discId?: string }[] = [];
    for (const node of graph.nodes) {
      const campus = node.type === "campus";
      const named = namedIds.has(node.id);
      const hub = featured.has(node.id) || named;
      const lead = (named && featuredNationalKey(node.label) === "thiel") || (hub && node.rimTier === "S+");
      const strong = !lead && (named || (hub && node.rimTier === "S"));
      const campusHub = Boolean(node.homeCampus) && !campus;
      const anchor = campus || hub;
      const fontSize = campus ? LABEL_CAMPUS : lead ? LABEL_LEAD : strong || campusHub || named ? LABEL_HUB : hub ? 10 : LABEL_NODE;
      labelMeta.push({
        id: node.id,
        tier: campus ? 5 : lead ? 6 : strong ? 4 : campusHub ? 3 : hub ? 2 : 1,
        degree: node.degree,
        text: truncateMapLabel(node.label, false, anchor),
        fullText: node.label,
        marker: false,
        anchor,
        fontSize,
        tracking: 0,
        campusHub,
        named,
        discId: campus ? node.campus || node.id : node.homeCampus || undefined,
      });
    }
    const colors = new Map(campusSwatches(graph.nodes).map((swatch) => [swatch.id, swatch.color]));
    for (const node of graph.nodes) {
      const campus = node.type === "campus";
      const named = namedIds.has(node.id);
      const hub = featured.has(node.id) || named;
      const lead = (named && featuredNationalKey(node.label) === "thiel") || (hub && node.rimTier === "S+");
      const strong = !lead && (named || (hub && node.rimTier === "S"));
      const campusHub = Boolean(node.homeCampus) && !campus;
      const color = nodeColor(node, colors);
      g.addNode(node.id, {
        x: node.x,
        y: node.y,
        size: screenSize(node),
        label: node.label,
        fullLabel: node.label,
        color,
        type: NODE_SHAPE[node.type],
        kind: node.type,
        anchor: campus || hub,
        zIndex: lead ? 4 : strong ? 3 : Z[node.type],
        signalTip: signalTooltip(node),
        linkColor: emphasizeColor(color),
        labelPx: campus ? LABEL_CAMPUS : lead ? LABEL_LEAD : strong || campusHub || named ? LABEL_HUB : hub ? 10 : LABEL_NODE,
        ...(node.homeCampus ? { labelColor: readableInk(colors.get(node.homeCampus) ?? "#374151") } : {}),
      });
    }
    // Region titles stay off the canvas. The legend carries the colors.
    const regionCampuses = new Map<string, string[]>();
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const node of graph.nodes) {
      minX = Math.min(minX, node.x);
      maxX = Math.max(maxX, node.x);
      minY = Math.min(minY, node.y);
      maxY = Math.max(maxY, node.y);
    }
    const span = Math.max(maxX - minX, maxY - minY, 1);
    const at = new Map(graph.nodes.map((node) => [node.id, node]));
    for (const edge of graph.edges) {
      if (edge.source === edge.target || !g.hasNode(edge.source) || !g.hasNode(edge.target)) continue;
      const key = `${edge.source}|${edge.target}|${edge.type}`;
      if (g.hasEdge(key)) continue;
      const source = at.get(edge.source);
      const target = at.get(edge.target);
      const fraction = source && target ? Math.hypot(source.x - target.x, source.y - target.y) / span : 0;
      g.addEdgeWithKey(key, edge.source, edge.target, {
        kind: edge.type,
        color: EDGE_GREY,
        size: EDGE_PX,
        defer: fraction > 0.1,
      });
      link(edge.source, edge.target);
      link(edge.target, edge.source);
    }
    const structural = new Set<MapNodeType>(["organization", "investor", "program"]);
    const fanOf = (id: string) => {
      if (!g.hasNode(id) || g.getNodeAttribute(id, "marker")) return false;
      const kind = g.getNodeAttribute(id, "kind");
      if (!structural.has(kind)) return false;
      return (neighbors.get(id)?.size ?? 0) >= FAN_DEGREE;
    };
    const megaOf = (id: string) => {
      if (!fanOf(id)) return false;
      return (neighbors.get(id)?.size ?? 0) >= MEGA_DEGREE;
    };
    g.forEachEdge((_edge, attrs, source, target) => {
      const fan = fanOf(source) || fanOf(target);
      attrs.defer = megaOf(source) || megaOf(target) || (fan && attrs.defer);
    });
    const campusOf = new Map<string, string>();
    for (const node of graph.nodes) {
      if ((node.type === "person" || node.type === "startup") && node.campus) campusOf.set(node.id, node.campus);
    }
    for (const edge of graph.edges) {
      if (edge.type !== "studied_at") continue;
      const person = at.get(edge.source);
      const campus = at.get(edge.target);
      if (person?.type === "person" && campus?.type === "campus") campusOf.set(person.id, campus.id);
    }
    const bundles = new Map<string, { program: string; campus: string; count: number }>();
    const addBundle = (programId: string, campusId: string, count: number) => {
      if (!g.hasNode(programId) || !g.hasNode(campusId) || programId === campusId || count <= 0) return;
      const key = `${programId}|${campusId}`;
      const row = bundles.get(key) ?? { program: programId, campus: campusId, count: 0 };
      row.count += count;
      bundles.set(key, row);
    };
    for (const edge of graph.edges) {
      if (edge.type !== "member_of" && edge.type !== "invested_in") continue;
      const source = at.get(edge.source);
      const target = at.get(edge.target);
      if (!source || !target) continue;
      const program = structural.has(source.type) ? source : structural.has(target.type) ? target : null;
      const other = program === source ? target : program === target ? source : null;
      if (!program || !other || (other.type !== "person" && other.type !== "startup")) continue;
      const campusId = campusOf.get(other.id);
      if (campusId) addBundle(program.id, campusId, 1);
    }
    for (const bundle of bundles.values()) {
      if (bundle.count < 2) continue;
      const program = at.get(bundle.program);
      const ink = lineInk(program ? nodeInk(program, colors) : "#4b5563");
      const tint = edgeTint(ink, 0.72);
      const key = `bundle|${bundle.program}|${bundle.campus}`;
      if (g.hasEdge(key)) continue;
      g.addEdgeWithKey(key, bundle.program, bundle.campus, {
        kind: "member_of",
        color: tint,
        hoverColor: edgeTint(ink, 0.9),
        size: Math.min(2.8, 1.75 + Math.log2(bundle.count + 1) * 0.2),
        defer: false,
        bundle: true,
      });
    }

    const renderer = new Sigma<NodeAttr, EdgeAttr>(g, container, {
      allowInvalidContainer: true,
      enableCameraRotation: false,
      defaultEdgeType: "line",
      hideEdgesOnMove: false,
      hideLabelsOnMove: false,
      itemSizesReference: "screen",
      // Identity keeps hairlines at EDGE_PX while zooming. The default sqrt grows them.
      zoomToSizeRatioFunction: () => 1,
      zIndex: true,
      labelFont: "Satoshi, Arial, sans-serif",
      labelSize: LABEL_NODE,
      labelWeight: "500",
      labelColor: { color: "#111111" },
      labelDensity: 0.7,
      labelGridCellSize: 120,
      labelRenderedSizeThreshold: 0,
      minEdgeThickness: EDGE_PX,
      antiAliasingFeather: 0.85,
      stagePadding: 108,
      minCameraRatio: 0.02,
      maxCameraRatio: 1.4,
      defaultDrawNodeLabel: drawHaloLabel as never,
      defaultDrawNodeHover: drawLightHover as never,
      nodeProgramClasses: {
        circle: NodeCircleCrispProgram,
        square: NodeSquareLightProgram,
        diamond: NodeDiamondProgram,
        hex: NodeHexProgram,
        triangle: NodeTriangleProgram,
      } as never,
      nodeReducer: (node, data) => {
        const state = stateRef.current;
        const nudge = placed.offsets.get(node);
        const showLabel = (extra: Partial<NodeAttr> = {}) => {
          const offset = nudge ?? { dx: 0, dy: 0 };
          return { ...data, ...extra, forceLabel: true, labelDx: offset.dx, labelDy: offset.dy };
        };
        if (data.marker) {
          const campuses = regionCampuses.get(node) ?? [];
          if (campuses.length > 0 && campuses.every((id) => state.hidden.has(id))) return { ...data, hidden: true };
          if (!nudge) return { ...data, label: undefined, forceLabel: false, zIndex: 6 };
          return showLabel({ label: data.label, zIndex: 6 });
        }
        if (state.hidden.has(node)) return { ...data, hidden: true };
        const active = state.hovered ?? state.selected;
        if (node === active && state.hovered === node) return { ...data, label: undefined, forceLabel: false, highlighted: true, zIndex: 5 };
        if (!nudge) return { ...data, label: undefined, forceLabel: false };
        if (node === active) return showLabel({ label: data.fullLabel, highlighted: true, zIndex: 5 });
        if (!active) return showLabel({ label: data.label });
        const near = neighbors.get(active);
        if (data.kind === "campus" || near?.has(node)) return showLabel({ label: data.label, zIndex: 4 });
        return { ...data, color: DIM_NODE, label: undefined, forceLabel: false, zIndex: 0 };
      },
      edgeReducer: (edge, data) => {
        const state = stateRef.current;
        const source = g.source(edge);
        const target = g.target(edge);
        if (state.hidden.has(source) || state.hidden.has(target) || !state.edgeTypes.has(data.kind)) return { ...data, hidden: true };
        const active = state.hovered ?? state.selected;
        const quiet = QUIET_EDGE.has(data.kind) || data.defer;
        if (active && (source === active || target === active)) {
          const activeKind = g.getNodeAttribute(active, "kind");
          const structuralActive = activeKind === "organization" || activeKind === "program" || activeKind === "investor";
          if (data.bundle) return { ...data, color: data.hoverColor ?? data.color, size: Math.min(3.2, data.size + 0.45), hidden: false };
          // A program keeps its bundled campus lines. Individual spokes would cover the cloud.
          if (structuralActive && (data.defer || QUIET_EDGE.has(data.kind))) return { ...data, hidden: true };
          return { ...data, color: g.getNodeAttribute(active, "linkColor"), size: EDGE_HOVER_PX, hidden: false };
        }
        if (data.bundle) return data;
        if (quiet) return { ...data, hidden: true };
        if (!active) return data;
        return { ...data, color: EDGE_DIM, size: EDGE_PX };
      },
    });

    const recomputeLabels = () => {
      const { hidden, hovered, selected } = stateRef.current;
      const active = hovered ?? selected;
      const ratio = renderer.getCamera().ratio;
      const floor = labelDegreeFloor(ratio);
      const dims = renderer.getDimensions();
      const margin = 96;
      const screen: ScreenLabel[] = [];
      const reserved = [];
      const near = active ? neighbors.get(active) : undefined;
      for (const meta of labelMeta) {
        if (meta.marker) {
          const campuses = regionCampuses.get(meta.id) ?? [];
          if (campuses.length > 0 && campuses.every((id) => hidden.has(id))) continue;
        } else if (hidden.has(meta.id)) continue;
        if (suppressed.has(meta.id) && meta.id !== active && !meta.named) continue;
        const display = renderer.getNodeDisplayData(meta.id);
        if (!display || display.hidden) continue;
        const at = renderer.framedGraphToViewport(display);
        const nodeSize = renderer.scaleSize(display.size);
        if (meta.id === active && hovered) {
          reserved.push(hoverLabelBox(at.x, at.y, nodeSize, measure(meta.fullText, 11), 11));
          continue;
        }
        if (meta.campusHub) {
          if (meta.degree < campusHubDegreeFloor(ratio) && meta.id !== active) continue;
        } else if (meta.tier === 1 && meta.degree < floor && meta.id !== active) continue;
        if (active && meta.tier === 1 && meta.id !== active && !near?.has(meta.id)) continue;
        if (at.x < -margin || at.y < -margin || at.x > dims.width + margin || at.y > dims.height + margin) continue;
        const selectedLabel = meta.id === active;
        screen.push({
          id: meta.id,
          tier: selectedLabel ? 4 : meta.tier,
          degree: meta.degree,
          text: meta.text,
          x: at.x,
          y: at.y,
          nodeSize,
          marker: meta.marker,
          anchor: meta.anchor,
          fontSize: meta.fontSize,
          tracking: meta.tracking,
          discId: meta.discId,
        });
      }
      const search = document.querySelector('input[aria-label="Search the network"]');
      if (search) {
        const box = search.getBoundingClientRect();
        const stage = container.getBoundingClientRect();
        reserved.push({
          left: box.left - stage.left - 6,
          top: box.top - stage.top - 6,
          right: box.right - stage.left + 6,
          bottom: box.bottom - stage.top + 6,
        });
      }
      const discs: CampusDisc[] = [];
      for (const campus of graph.nodes) {
        if (campus.type !== "campus" || hidden.has(campus.id)) continue;
        const radius = layoutRadius.get(campus.id);
        if (!radius) continue;
        const center = renderer.graphToViewport({ x: campus.x, y: campus.y });
        const edge = renderer.graphToViewport({ x: campus.x + radius, y: campus.y });
        discs.push({ id: campus.campus || campus.id, x: center.x, y: center.y, r: Math.hypot(edge.x - center.x, edge.y - center.y) });
      }
      const next = selectVisibleLabels(screen, measure, reserved, discs);
      let same = next.size === placed.offsets.size;
      if (same) {
        for (const [id, offset] of next) {
          const prev = placed.offsets.get(id);
          if (!prev || prev.dx !== offset.dx || prev.dy !== offset.dy) {
            same = false;
            break;
          }
        }
      }
      if (same) return;
      placed.offsets = next;
      renderer.refresh();
    };
    recomputeLabelsRef.current = recomputeLabels;
    let labelFrame = 0;
    const scheduleLabels = () => {
      if (labelFrame) return;
      labelFrame = requestAnimationFrame(() => {
        labelFrame = 0;
        recomputeLabels();
      });
    };
    renderer.getCamera().on("updated", scheduleLabels);
    void document.fonts?.ready.then(() => {
      if (rendererRef.current === renderer) scheduleLabels();
    });
    renderer.on("enterNode", ({ node }) => {
      stateRef.current.hovered = node;
      container.style.cursor = "pointer";
      scheduleLabels();
    });
    renderer.on("leaveNode", ({ node }) => {
      if (stateRef.current.hovered === node) stateRef.current.hovered = null;
      container.style.cursor = "grab";
      scheduleLabels();
    });
    renderer.on("clickNode", ({ node }) => {
      if (g.getNodeAttribute(node, "marker")) return;
      onSelectRef.current(node);
    });
    renderer.on("clickStage", () => onSelectRef.current(null));

    rendererRef.current = renderer;
    container.style.cursor = "grab";
    const api: NetworkSigmaHandle = {
      zoomIn: () => void renderer.getCamera().animatedZoom({ duration: 180 }),
      zoomOut: () => void renderer.getCamera().animatedUnzoom({ duration: 180 }),
      fit: () => frameVisible(renderer, stateRef.current.hidden),
    };
    onReadyRef.current(api);
    const frame = requestAnimationFrame(() => {
      renderer.resize();
      frameVisible(renderer, stateRef.current.hidden);
    });

    return () => {
      cancelAnimationFrame(frame);
      if (labelFrame) cancelAnimationFrame(labelFrame);
      renderer.getCamera().removeListener("updated", scheduleLabels);
      recomputeLabelsRef.current = () => {};
      onReadyRef.current(null);
      renderer.kill();
      rendererRef.current = null;
    };
  }, [graph]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !flyId || !renderer.getGraph().hasNode(flyId)) return;
    const at = framedPosition(renderer, flyId);
    if (!at) return;
    const camera = renderer.getCamera();
    void camera.animate({ x: at.x, y: at.y, ratio: Math.min(camera.ratio, 0.16) }, { duration: 520 });
  }, [flyToken, flyId]);

  return <div ref={containerRef} className="absolute inset-0 bg-white" role="application" aria-label="Founder and startup network graph" />;
}

function frameVisible(renderer: Sigma<NodeAttr, EdgeAttr>, hidden: Set<string>) {
  const frame = graphFrame(renderer);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let count = 0;
  renderer.getGraph().forEachNode((id, attrs) => {
    if (hidden.has(id)) return;
    const at = frame.toFrame(attrs.x, attrs.y);
    minX = Math.min(minX, at.x);
    minY = Math.min(minY, at.y);
    maxX = Math.max(maxX, at.x);
    maxY = Math.max(maxY, at.y);
    count += 1;
  });
  if (!count) {
    void renderer.getCamera().animatedReset({ duration: 280 });
    return;
  }
  const width = maxX - minX;
  const height = maxY - minY;
  // High layout Y is the top of the screen. Pad that side for the search box and filters, and the low side for the Ask bar and legend.
  const span0 = Math.max(width, height, 0.04);
  const paddedMaxY = maxY + span0 * 0.07;
  const paddedMinY = minY - span0 * 0.08;
  const paddedMinX = minX - span0 * 0.03;
  const paddedMaxX = maxX + span0 * 0.05;
  const span = Math.max(paddedMaxX - paddedMinX, paddedMaxY - paddedMinY, 0.04);
  const ratio = Math.min(1.22, Math.max(0.04, span * 1.04));
  void renderer.getCamera().animate({ x: (paddedMinX + paddedMaxX) / 2, y: (paddedMinY + paddedMaxY) / 2, ratio }, { duration: 360 });
}

/** Light program ink disappears on white. Pull it toward the same grey family until the line can be seen. */
function lineInk(color: string): string {
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return "#4b5563";
  const value = Number.parseInt(match[1], 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  if (0.2126 * red + 0.7152 * green + 0.0722 * blue < 130) return color;
  const mix = (channel: number, target: number) => Math.round(channel * 0.45 + target * 0.55);
  const hex = (channel: number) => channel.toString(16).padStart(2, "0");
  return `#${hex(mix(red, 75))}${hex(mix(green, 85))}${hex(mix(blue, 99))}`;
}

function edgeTint(color: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return `rgba(107, 114, 128, ${alpha})`;
  const value = Number.parseInt(match[1], 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

/** Sigma's camera lives in the normalized frame (center 0.5), not raw layout coordinates. */
function graphFrame(renderer: Sigma<NodeAttr, EdgeAttr>) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  renderer.getGraph().forEachNode((_id, attrs) => {
    minX = Math.min(minX, attrs.x);
    minY = Math.min(minY, attrs.y);
    maxX = Math.max(maxX, attrs.x);
    maxY = Math.max(maxY, attrs.y);
  });
  const ratio = Math.max(maxX - minX, maxY - minY) || 1;
  const dX = (maxX + minX) / 2;
  const dY = (maxY + minY) / 2;
  return {
    toFrame(x: number, y: number) {
      return { x: 0.5 + (x - dX) / ratio, y: 0.5 + (y - dY) / ratio };
    },
  };
}

function framedPosition(renderer: Sigma<NodeAttr, EdgeAttr>, id: string) {
  const attrs = renderer.getGraph().getNodeAttributes(id);
  if (!Number.isFinite(attrs.x) || !Number.isFinite(attrs.y)) return null;
  return graphFrame(renderer).toFrame(attrs.x, attrs.y);
}
