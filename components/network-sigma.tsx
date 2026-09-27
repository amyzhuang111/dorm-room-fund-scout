"use client";

import Graph from "graphology";
import { useEffect, useRef } from "react";
import Sigma from "sigma";
import type { SigmaNodeEventPayload, SigmaStageEventPayload, WheelCoords } from "sigma/types";
import { featuredNationalKey } from "@/lib/domain/featured-national";
import type { MapEdgeType, MapGraph, MapNodeType } from "@/lib/domain/network-map";
import { NodeCircleCrispProgram, NodeDiamondProgram, NodeHexProgram, NodeSquareLightProgram, NodeTriangleProgram, drawHaloLabel, drawLightHover } from "./network-shapes";
import { signalTooltip } from "@/lib/domain/network-signal-size";
import { CAMPUS_LABEL_MIN_MEMBERS, DIM_NODE, EDGE_DIM, EDGE_GREY, EDGE_HOVER_PX, EDGE_PX, FAN_DEGREE, LABEL_CAMPUS, LABEL_HUB, LABEL_LEAD, LABEL_NODE, MEGA_DEGREE, NODE_SHAPE, PROGRAM_LINE, PROGRAM_LINE_ACTIVE, PROGRAM_LINE_DIM, bundleWidth, campusHubDegreeFloor, campusSwatches, emphasizeColor, hoverLabelBox, labelDegreeFloor, labelScreenPx, neighborhoodView, nodeColor, openingCameraRatio, readableInk, restingLabelIds, screenSize, selectVisibleLabels, truncateMapLabel, zoomSizeFactor, type CampusDisc, type FramePoint, type LabelOffset, type ScreenLabel } from "./network-style";

export interface NetworkSigmaHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  /** Screen position of a laid-out node, relative to the graph container. */
  pointOf: (id: string) => { x: number; y: number } | null;
  /** Fires when the camera moves. The listener also runs once on subscribe. */
  subscribe: (listener: () => void) => () => void;
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
  /** Designed screen size at the fitted view. Drawn size is the inverse of the zoom. */
  labelBase?: number;
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
  count?: number;
  /** A named accelerator. Drawn in near-black at rest, solid black while it is the focus. */
  accent?: boolean;
  /** Count is under 2 and this is not a named accelerator. Drawn only while its program is hovered or selected. */
  sparse?: boolean;
  zIndex?: number;
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
    focusNode: null as string | null,
    focus: 0,
    focusFrame: 0,
    fitRatio: 1,
  });
  const onSelectRef = useRef(onSelect);
  const onReadyRef = useRef(onReady);
  const hiddenRef = useRef(hidden);
  const recomputeLabelsRef = useRef<() => void>(() => {});
  const focusNeighborhoodRef = useRef<(id: string) => void>(() => {});

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
    if (selected) {
      stateRef.current.focusNode = selected;
      stateRef.current.focus = 1;
    } else if (!stateRef.current.hovered) {
      stateRef.current.focusNode = null;
      stateRef.current.focus = 0;
    }
    const renderer = rendererRef.current;
    if (!renderer) return;
    recomputeLabelsRef.current();
    renderer.refresh();
    if (hiddenChanged) stateRef.current.fitRatio = frameVisible(renderer, hidden);
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
    const memberCount = new Map<string, number>();
    for (const node of graph.nodes) {
      if ((node.type !== "person" && node.type !== "startup") || !node.campus) continue;
      memberCount.set(node.campus, (memberCount.get(node.campus) ?? 0) + 1);
    }
    const labelMeta: { id: string; tier: number; degree: number; text: string; fullText: string; marker: boolean; anchor: boolean; fontSize: number; tracking: number; campusHub: boolean; named: boolean; discId?: string; strictDiscs: boolean; required: boolean; grayHub: boolean }[] = [];
    for (const node of graph.nodes) {
      const campus = node.type === "campus";
      const named = namedIds.has(node.id);
      const hub = featured.has(node.id) || named;
      const lead = (named && featuredNationalKey(node.label) === "thiel") || (hub && node.rimTier === "S+");
      const strong = !lead && (named || (hub && node.rimTier === "S"));
      const campusHub = Boolean(node.homeCampus) && !campus;
      const anchor = campus || hub;
      const fontSize = campus ? LABEL_CAMPUS : lead ? LABEL_LEAD : strong || campusHub || named ? LABEL_HUB : hub ? 11 : LABEL_NODE;
      const campusId = node.campus || node.id;
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
        discId: campus ? campusId : node.homeCampus || undefined,
        strictDiscs: !campus && named && featuredNationalKey(node.label) === "thiel",
        required: campus && (memberCount.get(campusId) ?? 0) >= CAMPUS_LABEL_MIN_MEMBERS,
        grayHub: !campus && !node.homeCampus && (node.type === "organization" || node.type === "program" || node.type === "investor"),
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
        zIndex: (lead ? 4 : strong ? 3 : Z[node.type]) + 1,
        signalTip: signalTooltip(node),
        linkColor: emphasizeColor(color),
        labelBase: campus ? LABEL_CAMPUS : lead ? LABEL_LEAD : strong || campusHub || named ? LABEL_HUB : hub ? 11 : LABEL_NODE,
        ...(campus ? { labelColor: "#111111" } : node.homeCampus ? { labelColor: readableInk(colors.get(node.homeCampus) ?? "#374151") } : {}),
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
      const program = at.get(programId);
      const keyName = featuredNationalKey(program?.label ?? "") ?? programId;
      const key = `${keyName}|${campusId}`;
      const row = bundles.get(key) ?? { program: programId, campus: campusId, count: 0 };
      row.count += count;
      if (namedIds.has(programId) || program?.rimBand === "outer") row.program = programId;
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
      if (bundle.count < 1) continue;
      const program = at.get(bundle.program);
      const accent = Boolean(featuredNationalKey(program?.label ?? ""));
      const key = `bundle|${bundle.program}|${bundle.campus}`;
      if (g.hasEdge(key)) continue;
      g.addEdgeWithKey(key, bundle.program, bundle.campus, {
        kind: "member_of",
        color: accent ? PROGRAM_LINE : EDGE_GREY,
        hoverColor: PROGRAM_LINE_ACTIVE,
        size: accent ? bundleWidth(bundle.count) : Math.min(1.15, bundleWidth(bundle.count) * 0.35),
        defer: false,
        bundle: true,
        accent,
        count: bundle.count,
        sparse: !accent && bundle.count < 2,
        zIndex: accent ? 3 : 0,
      });
      link(bundle.program, bundle.campus);
      link(bundle.campus, bundle.program);
    }

    const renderer = new Sigma<NodeAttr, EdgeAttr>(g, container, {
      allowInvalidContainer: true,
      enableCameraRotation: false,
      defaultEdgeType: "line",
      hideEdgesOnMove: false,
      hideLabelsOnMove: false,
      enableCameraZooming: true,
      enableCameraPanning: true,
      zoomingRatio: 1.18,
      zoomDuration: 160,
      doubleClickZoomingRatio: 1.45,
      doubleClickZoomingDuration: 280,
      inertiaDuration: 320,
      inertiaRatio: 0.22,
      itemSizesReference: "screen",
      // Nodes and lines share one scale, so a closer view magnifies both. Labels do not use this.
      zoomToSizeRatioFunction: (ratio) => zoomSizeFactor(ratio, stateRef.current.fitRatio),
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
      stagePadding: 12,
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
        const cameraRatio = rendererRef.current?.getCamera().ratio ?? 1;
        const labelPx = labelScreenPx(data.labelBase ?? LABEL_NODE, cameraRatio, stateRef.current.fitRatio || 1);
        const showLabel = (extra: Partial<NodeAttr> = {}) => {
          const offset = nudge ?? { dx: 0, dy: 0 };
          return { ...data, ...extra, labelPx, forceLabel: true, labelDx: offset.dx, labelDy: offset.dy };
        };
        if (data.marker) {
          const campuses = regionCampuses.get(node) ?? [];
          if (campuses.length > 0 && campuses.every((id) => state.hidden.has(id))) return { ...data, hidden: true };
          if (!nudge) return { ...data, label: undefined, forceLabel: false, zIndex: 6 };
          return showLabel({ label: data.label, zIndex: 6 });
        }
        if (state.hidden.has(node)) return { ...data, hidden: true };
        const active = state.hovered ?? state.selected ?? (state.focus > 0.04 ? state.focusNode : null);
        const focus = active ? state.focus : 0;
        if (node === active && state.hovered === node) return { ...data, label: undefined, forceLabel: false, highlighted: true, zIndex: 5 };
        const grayHub = (data.kind === "organization" || data.kind === "program" || data.kind === "investor") && !data.labelColor;
        if (!nudge && grayHub) return { ...data, hidden: true, label: undefined, forceLabel: false };
        if (!nudge) return { ...data, label: undefined, forceLabel: false };
        if (node === active) return showLabel({ label: data.fullLabel, highlighted: true, zIndex: 5 });
        if (!active || focus < 0.04) return showLabel({ label: data.label });
        const near = neighbors.get(active);
        if (data.kind === "campus" || near?.has(node)) return showLabel({ label: data.label, zIndex: 4 });
        return { ...data, color: mixPaint(data.color, DIM_NODE, focus), label: undefined, forceLabel: false, zIndex: 1 };
      },
      edgeReducer: (edge, data) => {
        const state = stateRef.current;
        const source = g.source(edge);
        const target = g.target(edge);
        if (state.hidden.has(source) || state.hidden.has(target) || !state.edgeTypes.has(data.kind)) return { ...data, hidden: true };
        const active = state.hovered ?? state.selected ?? (state.focus > 0.04 ? state.focusNode : null);
        const focus = active ? state.focus : 0;
        const quiet = QUIET_EDGE.has(data.kind) || data.defer;
        if (active && (source === active || target === active)) {
          const activeKind = g.getNodeAttribute(active, "kind");
          const structuralActive = activeKind === "organization" || activeKind === "program" || activeKind === "investor";
          if (data.bundle) {
            if (data.sparse && !structuralActive) return { ...data, hidden: true, zIndex: 0 };
            const hot = structuralActive ? PROGRAM_LINE_ACTIVE : (data.hoverColor ?? data.color);
            return {
              ...data,
              color: mixPaint(data.color, hot, Math.max(focus, 0.35)),
              size: structuralActive ? Math.max(data.size + 0.65, 2.15) : data.size + 0.15,
              hidden: false,
              zIndex: 4,
            };
          }
          // A program keeps its bundled campus lines. Individual spokes would cover the cloud.
          if (structuralActive && (data.defer || QUIET_EDGE.has(data.kind))) return { ...data, hidden: true };
          return { ...data, color: g.getNodeAttribute(active, "linkColor"), size: EDGE_HOVER_PX, hidden: false };
        }
        if (data.bundle) {
          if (!data.accent || data.sparse) return { ...data, hidden: true };
          if (!active || focus < 0.04) return data;
          return { ...data, color: mixPaint(data.color, PROGRAM_LINE_DIM, focus), size: Math.max(EDGE_PX, data.size * (1 - focus * 0.65)), zIndex: 0 };
        }
        if (quiet) return { ...data, hidden: true };
        if (!active) return data;
        return { ...data, color: EDGE_DIM, size: EDGE_PX };
      },
    });

    const recomputeLabels = () => {
      const { hidden, hovered, selected, fitRatio } = stateRef.current;
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
        if (!display) continue;
        // Gray hubs are hidden only after they lose the label pass. Skipping them here would keep Thiel unlabeled.
        if (display.hidden && !meta.grayHub) continue;
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
          fontSize: labelScreenPx(meta.fontSize, ratio, fitRatio || ratio),
          tracking: meta.tracking,
          discId: meta.discId,
          strictDiscs: meta.strictDiscs,
          required: meta.required,
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
    const viewListeners = new Set<() => void>();
    const notifyView = () => {
      for (const listener of viewListeners) listener();
    };
    renderer.getCamera().on("updated", scheduleLabels);
    renderer.getCamera().on("updated", notifyView);
    void document.fonts?.ready.then(() => {
      if (rendererRef.current === renderer) scheduleLabels();
    });
    const glideFocus = (target: number) => {
      const tick = () => {
        const current = stateRef.current.focus;
        const next = Math.abs(target - current) < 0.04 ? target : current + (target - current) * 0.42;
        stateRef.current.focus = next;
        if (next === 0 && !stateRef.current.hovered && !stateRef.current.selected) stateRef.current.focusNode = null;
        renderer.refresh();
        scheduleLabels();
        if (next !== target && rendererRef.current === renderer) stateRef.current.focusFrame = requestAnimationFrame(tick);
      };
      cancelAnimationFrame(stateRef.current.focusFrame);
      stateRef.current.focusFrame = requestAnimationFrame(tick);
    };
    renderer.on("enterNode", ({ node }) => {
      stateRef.current.hovered = node;
      stateRef.current.focusNode = node;
      container.style.cursor = "pointer";
      glideFocus(1);
    });
    renderer.on("leaveNode", ({ node }) => {
      if (stateRef.current.hovered === node) stateRef.current.hovered = null;
      container.style.cursor = "grab";
      if (stateRef.current.selected) stateRef.current.focusNode = stateRef.current.selected;
      glideFocus(stateRef.current.selected ? 1 : 0);
    });
    const layoutSpan = span;
    const focusNeighborhood = (id: string) => {
      if (!g.hasNode(id) || g.getNodeAttribute(id, "marker")) return;
      const kind = g.getNodeAttribute(id, "kind");
      if (kind !== "campus" && kind !== "program" && kind !== "organization") return;
      const origin = g.getNodeAttributes(id);
      const frame = graphFrame(renderer);
      const points: FramePoint[] = [frame.toFrame(origin.x, origin.y)];
      const hiddenNow = stateRef.current.hidden;
      if (kind === "campus") {
        const radius = Math.max(12, (layoutRadius.get(id) ?? 12) * 1.4);
        g.forEachNode((nid, attrs) => {
          if (nid === id || hiddenNow.has(nid)) return;
          if (Math.hypot(attrs.x - origin.x, attrs.y - origin.y) <= radius) points.push(frame.toFrame(attrs.x, attrs.y));
        });
      } else {
        const reach = Math.max(18, layoutSpan * 0.14);
        const ranked: { d: number; x: number; y: number }[] = [];
        g.forEachNode((nid, attrs) => {
          if (nid === id || hiddenNow.has(nid) || attrs.marker) return;
          ranked.push({ d: Math.hypot(attrs.x - origin.x, attrs.y - origin.y), x: attrs.x, y: attrs.y });
        });
        ranked.sort((a, b) => a.d - b.d);
        const limit = Math.max(reach, ranked[14]?.d ?? reach);
        for (const node of ranked) {
          if (node.d > limit * 1.15) break;
          points.push(frame.toFrame(node.x, node.y));
          if (points.length >= 40) break;
        }
      }
      const view = neighborhoodView(points, stateRef.current.fitRatio || renderer.getCamera().ratio);
      const dims = renderer.getDimensions();
      const frameWidth = view.ratio * (dims.width / Math.max(Math.min(dims.width, dims.height), 1));
      const shift = frameWidth * (Math.min(340, dims.width * 0.3) / Math.max(dims.width, 1)) * 0.5;
      void renderer.getCamera().animate({ x: view.x + shift, y: view.y, ratio: view.ratio }, { duration: 520, easing: "quadraticInOut" });
    };
    focusNeighborhoodRef.current = focusNeighborhood;
    const onWheel = (payload: SigmaStageEventPayload | SigmaNodeEventPayload) => {
      payload.preventSigmaDefault();
      const wheel = payload.event as WheelCoords;
      const delta = Math.max(-2.2, Math.min(2.2, wheel.delta || 0));
      if (!delta) return;
      const camera = renderer.getCamera();
      const factor = Math.exp(-delta * 0.42);
      const ratio = camera.getBoundedRatio(camera.getState().ratio * factor);
      const next = renderer.getViewportZoomedState({ x: wheel.x, y: wheel.y }, ratio);
      void camera.animate(next, { duration: 150, easing: "quadraticOut" });
    };
    renderer.on("wheelStage", onWheel);
    renderer.on("wheelNode", onWheel);
    renderer.on("downStage", () => {
      container.style.cursor = "grabbing";
    });
    renderer.on("downNode", () => {
      container.style.cursor = "grabbing";
    });
    renderer.on("upStage", () => {
      container.style.cursor = "grab";
    });
    renderer.on("upNode", () => {
      container.style.cursor = "grab";
    });
    renderer.on("clickNode", ({ node }) => {
      if (g.getNodeAttribute(node, "marker")) return;
      onSelectRef.current(node);
      focusNeighborhood(node);
    });
    renderer.on("clickStage", () => onSelectRef.current(null));

    rendererRef.current = renderer;
    container.style.cursor = "grab";
    const api: NetworkSigmaHandle = {
      zoomIn: () => void renderer.getCamera().animatedZoom({ duration: 240, factor: 1.4 }),
      zoomOut: () => void renderer.getCamera().animatedUnzoom({ duration: 240, factor: 1.4 }),
      fit: () => {
        stateRef.current.fitRatio = frameVisible(renderer, stateRef.current.hidden);
      },
      pointOf(id: string) {
        if (!renderer.getGraph().hasNode(id)) return null;
        const attrs = renderer.getGraph().getNodeAttributes(id);
        if (!Number.isFinite(attrs.x) || !Number.isFinite(attrs.y)) return null;
        const at = renderer.graphToViewport({ x: attrs.x, y: attrs.y });
        if (!Number.isFinite(at.x) || !Number.isFinite(at.y)) return null;
        return { x: at.x, y: at.y };
      },
      subscribe(listener: () => void) {
        viewListeners.add(listener);
        const frame = requestAnimationFrame(() => listener());
        return () => {
          cancelAnimationFrame(frame);
          viewListeners.delete(listener);
        };
      },
    };
    onReadyRef.current(api);
    const frame = requestAnimationFrame(() => {
      renderer.resize();
      stateRef.current.fitRatio = frameVisible(renderer, stateRef.current.hidden);
    });

    const focusState = stateRef.current;
    return () => {
      cancelAnimationFrame(frame);
      if (labelFrame) cancelAnimationFrame(labelFrame);
      cancelAnimationFrame(focusState.focusFrame);
      renderer.getCamera().removeListener("updated", scheduleLabels);
      renderer.getCamera().removeListener("updated", notifyView);
      viewListeners.clear();
      renderer.off("wheelStage", onWheel);
      renderer.off("wheelNode", onWheel);
      focusNeighborhoodRef.current = () => {};
      recomputeLabelsRef.current = () => {};
      onReadyRef.current(null);
      renderer.kill();
      rendererRef.current = null;
    };
  }, [graph]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !flyId || !renderer.getGraph().hasNode(flyId)) return;
    const kind = renderer.getGraph().getNodeAttribute(flyId, "kind");
    if (kind === "campus" || kind === "program" || kind === "organization") {
      focusNeighborhoodRef.current(flyId);
      return;
    }
    const at = framedPosition(renderer, flyId);
    if (!at) return;
    const camera = renderer.getCamera();
    void camera.animate({ x: at.x, y: at.y, ratio: Math.min(camera.ratio, 0.16) }, { duration: 520, easing: "quadraticInOut" });
  }, [flyToken, flyId]);

  return <div ref={containerRef} className="absolute inset-0 bg-white" role="application" aria-label="Founder and startup network graph" />;
}

function frameVisible(renderer: Sigma<NodeAttr, EdgeAttr>, hidden: Set<string>): number {
  const frame = graphFrame(renderer);
  const xs: number[] = [];
  const ys: number[] = [];
  const push = (onlyMembers: boolean) => {
    xs.length = 0;
    ys.length = 0;
    renderer.getGraph().forEachNode((id, attrs) => {
      if (hidden.has(id) || attrs.marker) return;
      if (onlyMembers && attrs.kind !== "campus" && attrs.kind !== "person" && attrs.kind !== "startup") return;
      const at = frame.toFrame(attrs.x, attrs.y);
      xs.push(at.x);
      ys.push(at.y);
    });
  };
  push(true);
  if (xs.length < 8) push(false);
  if (!xs.length) {
    void renderer.getCamera().animatedReset({ duration: 280 });
    return 1;
  }
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  const atQuantile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))] ?? 0.5;
  // Trim the sparse rim so a few outlying programs do not shrink the cloud.
  const minX = atQuantile(xs, 0.012);
  const maxX = atQuantile(xs, 0.988);
  const minY = atQuantile(ys, 0.012);
  const maxY = atQuantile(ys, 0.988);
  const width = maxX - minX;
  const height = maxY - minY;
  // High layout Y is the top of the screen. A short pad clears the search box; the low side clears the legend and Ask bar.
  const span0 = Math.max(width, height, 0.04);
  const paddedMaxY = maxY + span0 * 0.035;
  const paddedMinY = minY - span0 * 0.07;
  const paddedMinX = minX - span0 * 0.04;
  const paddedMaxX = maxX + span0 * 0.04;
  const span = Math.max(paddedMaxX - paddedMinX, paddedMaxY - paddedMinY, 0.04);
  const ratio = openingCameraRatio(span);
  void renderer.getCamera().animate({ x: (paddedMinX + paddedMaxX) / 2, y: (paddedMinY + paddedMaxY) / 2, ratio }, { duration: 420, easing: "quadraticInOut" });
  return ratio;
}

/** Blend two css colors. Used while focus eases in and out. */
function mixPaint(from: string, to: string, t: number): string {
  const amount = Math.max(0, Math.min(1, t));
  if (amount <= 0.02) return from;
  if (amount >= 0.98) return to;
  const a = paintChannels(from);
  const b = paintChannels(to);
  const channel = (index: number) => Math.round(a[index] + (b[index] - a[index]) * amount);
  const alpha = a[3] + (b[3] - a[3]) * amount;
  return `rgba(${channel(0)}, ${channel(1)}, ${channel(2)}, ${alpha.toFixed(3)})`;
}

function paintChannels(color: string): [number, number, number, number] {
  const rgba = color.match(/rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/i);
  if (rgba) return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3]), Number(rgba[4])];
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!hex) return [17, 17, 17, 1];
  const value = Number.parseInt(hex[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255, 1];
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
