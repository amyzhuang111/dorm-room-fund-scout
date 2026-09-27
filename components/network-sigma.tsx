"use client";

import Graph from "graphology";
import { useEffect, useRef } from "react";
import Sigma from "sigma";
import type { MapEdgeType, MapGraph, MapNodeType } from "@/lib/domain/network-map";
import { NodeCircleCrispProgram, NodeDiamondProgram, NodeHexProgram, NodeSquareLightProgram, NodeTriangleProgram, drawHaloLabel, drawLightHover } from "./network-shapes";
import { DIM_NODE, EDGE_CROSS, EDGE_DIM, EDGE_HOVER, EDGE_HOVER_PX, EDGE_PX, NODE_SHAPE, campusKey, campusSwatches, crossesCampus, edgeTint, fadeLongEdge, hoverLabelBox, labelDegreeFloor, nodeColor, restingLabelIds, screenLabelTier, screenSize, selectVisibleLabels, truncateMapLabel, type ScreenLabel } from "./network-style";

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
};

type EdgeAttr = {
  kind: MapEdgeType;
  color: string;
  size: number;
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
    const measureCanvas = document.createElement("canvas");
    const measureCtx = measureCanvas.getContext("2d");
    const measure = (text: string, fontSize: number) => {
      if (!measureCtx) return text.length * fontSize * 0.56;
      measureCtx.font = `500 ${fontSize}px Satoshi, Arial, sans-serif`;
      return measureCtx.measureText(text).width;
    };
    const placed = { ids: new Set<string>() };
    const labelMeta: { id: string; tier: number; degree: number; text: string; fullText: string; marker: boolean; anchor: boolean; fontSize: number }[] = [];
    for (const node of graph.nodes) {
      const anchor = node.anchor === true;
      labelMeta.push({
        id: node.id,
        tier: screenLabelTier(false, anchor, node.type),
        degree: node.degree,
        text: truncateMapLabel(node.label, false, anchor),
        fullText: node.label,
        marker: false,
        anchor,
        fontSize: anchor ? 12 : 11,
      });
    }
    const colors = new Map(campusSwatches(graph.nodes).map((swatch) => [swatch.id, swatch.color]));
    const campusOf = new Map(graph.nodes.map((node) => [node.id, campusKey(node)]));
    const primaryCampus = new Map(graph.nodes.map((node) => [node.id, node.campus]));
    for (const node of graph.nodes) {
      g.addNode(node.id, {
        x: node.x,
        y: node.y,
        size: screenSize(node),
        label: node.label,
        fullLabel: node.label,
        color: nodeColor(node, colors),
        type: NODE_SHAPE[node.type],
        kind: node.type,
        anchor: node.anchor === true,
        zIndex: Z[node.type],
      });
    }
    const regionCampuses = new Map<string, string[]>();
    for (const region of graph.regions ?? []) {
      const id = `region:${region.id}`;
      regionCampuses.set(id, region.campusIds);
      g.addNode(id, {
        x: region.x,
        y: region.y,
        size: 2.4,
        label: region.label,
        fullLabel: region.fullLabel,
        color: region.color,
        type: "circle",
        kind: "campus",
        anchor: true,
        marker: true,
        regionId: region.id,
        zIndex: 4,
      });
      labelMeta.push({
        id,
        tier: screenLabelTier(true, true, "campus"),
        degree: 0,
        text: truncateMapLabel(region.label, true, true),
        fullText: region.fullLabel,
        marker: true,
        anchor: true,
        fontSize: 13,
      });
    }
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
      const cross = crossesCampus(campusOf.get(edge.source) ?? "", campusOf.get(edge.target) ?? "");
      const source = at.get(edge.source);
      const target = at.get(edge.target);
      const fraction = source && target ? Math.hypot(source.x - target.x, source.y - target.y) / span : 0;
      const base = cross ? EDGE_CROSS : edgeTint(primaryCampus.get(edge.source) ?? null, colors);
      g.addEdgeWithKey(key, edge.source, edge.target, {
        kind: edge.type,
        color: fadeLongEdge(base, fraction),
        size: EDGE_PX,
      });
      link(edge.source, edge.target);
      link(edge.target, edge.source);
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
      labelSize: 11,
      labelWeight: "500",
      labelColor: { color: "#141414" },
      labelDensity: 0.7,
      labelGridCellSize: 120,
      labelRenderedSizeThreshold: 0,
      minEdgeThickness: EDGE_PX,
      antiAliasingFeather: 0.55,
      stagePadding: 56,
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
        if (data.marker) {
          const campuses = regionCampuses.get(node) ?? [];
          if (campuses.length > 0 && campuses.every((id) => state.hidden.has(id))) return { ...data, hidden: true };
          if (!placed.ids.has(node)) return { ...data, label: undefined, forceLabel: false, zIndex: 6 };
          return { ...data, forceLabel: true, label: data.label, zIndex: 6 };
        }
        if (state.hidden.has(node)) return { ...data, hidden: true };
        const active = state.hovered ?? state.selected;
        if (node === active && state.hovered === node) return { ...data, label: undefined, forceLabel: false, highlighted: true, zIndex: 5 };
        if (!placed.ids.has(node)) return { ...data, label: undefined, forceLabel: false };
        if (node === active) return { ...data, label: data.fullLabel, forceLabel: true, highlighted: true, zIndex: 5 };
        if (!active) return { ...data, forceLabel: true, label: data.label };
        const near = neighbors.get(active);
        if (data.kind === "campus" || near?.has(node)) return { ...data, forceLabel: true, label: data.label, zIndex: 4 };
        return { ...data, color: DIM_NODE, label: undefined, forceLabel: false, zIndex: 0 };
      },
      edgeReducer: (edge, data) => {
        const state = stateRef.current;
        const source = g.source(edge);
        const target = g.target(edge);
        if (state.hidden.has(source) || state.hidden.has(target) || !state.edgeTypes.has(data.kind)) return { ...data, hidden: true };
        const active = state.hovered ?? state.selected;
        const quiet = QUIET_EDGE.has(data.kind);
        if (!active) return quiet ? { ...data, hidden: true } : data;
        if (source !== active && target !== active) {
          if (quiet) return { ...data, hidden: true };
          return { ...data, color: EDGE_DIM, size: EDGE_PX };
        }
        return { ...data, color: EDGE_HOVER, size: EDGE_HOVER_PX, hidden: false };
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
        if (suppressed.has(meta.id) && meta.id !== active) continue;
        const display = renderer.getNodeDisplayData(meta.id);
        if (!display || display.hidden) continue;
        const at = renderer.framedGraphToViewport(display);
        const nodeSize = renderer.scaleSize(display.size);
        if (meta.id === active && hovered) {
          reserved.push(hoverLabelBox(at.x, at.y, nodeSize, measure(meta.fullText, 11), 11));
          continue;
        }
        if (meta.tier === 1 && meta.degree < floor && meta.id !== active) continue;
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
        });
      }
      const next = selectVisibleLabels(screen, measure, reserved);
      if (next.size === placed.ids.size && [...next].every((id) => placed.ids.has(id))) return;
      placed.ids = next;
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
  const span = Math.max(maxX - minX, maxY - minY, 0.04);
  const ratio = Math.min(1, Math.max(0.04, span));
  void renderer.getCamera().animate({ x: (minX + maxX) / 2, y: (minY + maxY) / 2, ratio }, { duration: 360 });
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
