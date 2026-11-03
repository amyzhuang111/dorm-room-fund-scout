"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GraphCluster, GraphEdge, GraphNode, GraphPayload, NetworkKind } from "@/lib/domain/founder-networks-model";

type Point = { x: number; y: number };

const HUES = [
  { ink: "#3c42d4", soft: "rgba(60,66,212,0.16)", glow: "rgba(60,66,212,0.42)", dot: "#6a70e0", label: "#2a30a8" },
  { ink: "#7b6bb5", soft: "rgba(123,107,181,0.15)", glow: "rgba(123,107,181,0.38)", dot: "#9a8bc8", label: "#5a4d8a" },
  { ink: "#4a9bc7", soft: "rgba(74,155,199,0.15)", glow: "rgba(74,155,199,0.38)", dot: "#6bb0d4", label: "#2f6f92" },
  { ink: "#c9a84a", soft: "rgba(201,168,74,0.16)", glow: "rgba(201,168,74,0.36)", dot: "#d4b85e", label: "#8a7028" },
  { ink: "#d4846a", soft: "rgba(212,132,106,0.15)", glow: "rgba(212,132,106,0.36)", dot: "#e09a82", label: "#9a5238" },
  { ink: "#5da88a", soft: "rgba(93,168,138,0.15)", glow: "rgba(93,168,138,0.36)", dot: "#78bba0", label: "#3a7a60" },
  { ink: "#8a7ab0", soft: "rgba(138,122,176,0.15)", glow: "rgba(138,122,176,0.36)", dot: "#a494c4", label: "#5e5080" },
  { ink: "#6a7a9a", soft: "rgba(106,122,154,0.13)", glow: "rgba(106,122,154,0.32)", dot: "#8494b0", label: "#44506a" },
];

const KIND_LEGEND: { kind: NetworkKind; label: string; color: string }[] = [
  { kind: "accelerator", label: "Accelerator", color: HUES[0].ink },
  { kind: "program", label: "Program", color: HUES[1].ink },
  { kind: "lab", label: "Lab", color: HUES[7].ink },
  { kind: "investor", label: "Investor", color: HUES[6].ink },
];

function loadGraph(): Promise<GraphPayload> {
  return fetch("/data/founder-networks-graph.json").then((res) => {
    if (!res.ok) throw new Error("graph missing");
    return res.json();
  });
}

function hueOf(index: number) {
  return HUES[((index % HUES.length) + HUES.length) % HUES.length];
}

function hash01(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function shortLabel(label: string, max = 18) {
  if (label.length <= max) return label;
  return `${label.slice(0, max - 1)}.`;
}

type LabelBox = {
  id: string;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  anchorX: number;
  anchorY: number;
  color: string;
  callout: string | null;
};

function placeLabels(
  clusters: GraphCluster[],
  toScreen: (x: number, y: number) => Point,
  scale: number,
  viewW: number,
  viewH: number,
  hoverId: string | null
): LabelBox[] {
  const ranked = [...clusters].sort((a, b) => a.rank - b.rank);
  const always = ranked.filter((c) => c.rank <= 8);
  const extras = hoverId ? ranked.filter((c) => c.id === hoverId && c.rank > 8) : [];
  const candidates = [...always, ...extras];
  const placed: LabelBox[] = [];
  const pad = 6;

  for (const cluster of candidates) {
    const hue = hueOf(cluster.hue);
    const center = toScreen(cluster.cx, cluster.cy);
    const text = shortLabel(cluster.label, scale < 1.15 ? 16 : 22);
    const w = Math.max(52, text.length * 6.2 + 10);
    const h = 18;
    const ring = cluster.r * scale + 10;
    const offsets: Point[] = [
      { x: 0, y: ring + 8 },
      { x: 0, y: -ring - 14 },
      { x: ring + 8, y: 0 },
      { x: -ring - 8, y: 0 },
      { x: ring * 0.7, y: ring * 0.7 },
      { x: -ring * 0.7, y: ring * 0.7 },
      { x: ring * 0.7, y: -ring * 0.7 },
      { x: -ring * 0.7, y: -ring * 0.7 },
    ];
    let chosen: LabelBox | null = null;
    for (const off of offsets) {
      let x = center.x + off.x - w / 2;
      let y = center.y + off.y - h / 2;
      x = clamp(x, 4, viewW - w - 4);
      y = clamp(y, 4, viewH - h - 36);
      const box: LabelBox = {
        id: cluster.id,
        text,
        x,
        y,
        w,
        h,
        anchorX: center.x,
        anchorY: center.y,
        color: hue.label,
        callout: cluster.rank <= 3 ? cluster.callout : null,
      };
      const hits = placed.some(
        (other) =>
          !(box.x + box.w + pad < other.x || other.x + other.w + pad < box.x || box.y + box.h + pad < other.y || other.y + other.h + pad < box.y)
      );
      if (!hits) {
        chosen = box;
        break;
      }
    }
    if (!chosen) {
      // Last resort: nudge down the stack on the right edge.
      const y = clamp(32 + placed.length * 20, 4, viewH - h - 36);
      chosen = {
        id: cluster.id,
        text,
        x: viewW - w - 8,
        y,
        w,
        h,
        anchorX: center.x,
        anchorY: center.y,
        color: hue.label,
        callout: null,
      };
    }
    placed.push(chosen);
  }
  return placed;
}

export function NetworksGraph({
  onSelectCompany,
  onSelectNetwork,
}: {
  onSelectCompany: (id: string) => void;
  onSelectNetwork: (id: string) => void;
}) {
  const [graph, setGraph] = useState<GraphPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<{
    id: string;
    label: string;
    ties: number;
    kind: string;
    sourceUrl: string | null;
    shownOfTotal: string | null;
  } | null>(null);
  const [labels, setLabels] = useState<LabelBox[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 720, h: 420 });
  const viewRef = useRef({ scale: 1, tx: 0, ty: 0 });
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const rafRef = useRef<number>(0);
  const timeRef = useRef(0);
  const reduceMotionRef = useRef(false);
  const graphRef = useRef<GraphPayload | null>(null);
  const hoverNetRef = useRef<string | null>(null);
  const degreeRef = useRef<Map<string, number>>(new Map());
  const byIdRef = useRef<Map<string, GraphNode>>(new Map());
  const labelsSigRef = useRef("");
  const viewDirtyRef = useRef(true);

  useEffect(() => {
    let cancelled = false;
    loadGraph()
      .then((payload) => {
        if (cancelled) return;
        setGraph(payload);
        graphRef.current = payload;
        byIdRef.current = new Map(payload.nodes.map((node) => [node.id, node]));
        const degree = new Map<string, number>();
        for (const edge of payload.edges) {
          degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
          degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
        }
        degreeRef.current = degree;
        viewDirtyRef.current = true;
      })
      .catch(() => {
        if (!cancelled) setError("Graph data could not be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduceMotionRef.current = mq.matches;
    const onChange = () => {
      reduceMotionRef.current = mq.matches;
    };
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setSize({ w: Math.max(320, Math.floor(rect.width)), h: Math.max(320, Math.floor(rect.height)) });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const bounds = useMemo(() => {
    if (!graph) return { minX: -200, maxX: 200, minY: -140, maxY: 140 };
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const c of graph.clusters) {
      minX = Math.min(minX, c.cx - c.r);
      maxX = Math.max(maxX, c.cx + c.r);
      minY = Math.min(minY, c.cy - c.r);
      maxY = Math.max(maxY, c.cy + c.r);
    }
    if (!Number.isFinite(minX)) return { minX: -200, maxX: 200, minY: -140, maxY: 140 };
    return { minX, maxX, minY, maxY };
  }, [graph]);

  const fitView = useCallback(() => {
    const pad = 36;
    const spanX = Math.max(1, bounds.maxX - bounds.minX);
    const spanY = Math.max(1, bounds.maxY - bounds.minY);
    const scale = Math.min((size.w - pad * 2) / spanX, (size.h - pad * 2) / spanY, 1.35);
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    viewRef.current = {
      scale,
      tx: size.w / 2 - cx * scale,
      ty: size.h / 2 - cy * scale,
    };
    viewDirtyRef.current = true;
  }, [bounds, size]);

  useEffect(() => {
    fitView();
  }, [fitView]);

  const worldToScreen = useCallback((x: number, y: number): Point => {
    const v = viewRef.current;
    return { x: x * v.scale + v.tx, y: y * v.scale + v.ty };
  }, []);

  const screenToWorld = useCallback((x: number, y: number): Point => {
    const v = viewRef.current;
    return { x: (x - v.tx) / v.scale, y: (y - v.ty) / v.scale };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const g = graphRef.current;
    if (!canvas || !g) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.floor(size.w * dpr) || canvas.height !== Math.floor(size.h * dpr)) {
      canvas.width = Math.floor(size.w * dpr);
      canvas.height = Math.floor(size.h * dpr);
      canvas.style.width = `${size.w}px`;
      canvas.style.height = `${size.h}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size.w, size.h);

    const v = viewRef.current;
    const scale = v.scale;
    // editorialFactor: 1 zoomed out, 0 zoomed in
    const editorial = clamp(1 - (scale / fitScaleApprox(bounds, size) - 0.85) / 1.6, 0, 1);
    const glow = 1 - editorial;
    const t = timeRef.current;

    const clusters = g.clusters;
    const companies = g.nodes.filter((n) => n.type === "company");
    const networks = g.nodes.filter((n) => n.type === "network");

    // Soft hulls / glows
    for (const cluster of clusters) {
      const hue = hueOf(cluster.hue);
      const c = worldToScreen(cluster.cx, cluster.cy);
      const r = cluster.r * scale;
      const drift = reduceMotionRef.current ? 0 : Math.sin(t * 0.0007 + cluster.rank) * 1.2 * glow;
      const cx = c.x + drift;
      const cy = c.y + Math.cos(t * 0.0005 + cluster.rank) * 1.1 * glow;

      if (glow > 0.02) {
        const grd = ctx.createRadialGradient(cx, cy, r * 0.05, cx, cy, r * (1.15 + glow * 0.35));
        grd.addColorStop(0, hue.glow.replace(/[\d.]+\)$/, `${0.55 * glow})`));
        grd.addColorStop(0.45, hue.glow.replace(/[\d.]+\)$/, `${0.28 * glow})`));
        grd.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(cx, cy, r * (1.2 + glow * 0.4), 0, Math.PI * 2);
        ctx.fill();
      }
      if (editorial > 0.02) {
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.98, 0, Math.PI * 2);
        ctx.fillStyle = hue.soft.replace(/[\d.]+\)$/, `${0.55 * editorial + 0.08})`);
        ctx.fill();
        ctx.strokeStyle = hexAlpha(hue.ink, 0.18 * editorial + 0.04);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Thin curved edges (hairlines), more visible when zoomed in
    const edgeAlpha = 0.14 * editorial + 0.20 * glow;
    const byId = byIdRef.current;
    if (edgeAlpha > 0.02) {
      ctx.lineWidth = 0.7;
      for (const edge of g.edges) {
        // Zoomed-out Nature cloud: keep many translucent curved ties; thin them when dense.
        if (edge.type === "network_tie" && editorial > 0.75 && hash01(edge.source + edge.target) > 0.45) continue;
        if (edge.type === "network_founder" && editorial > 0.7 && hash01(edge.target) > 0.55) continue;
        const a = byId.get(edge.source);
        const b = byId.get(edge.target);
        if (!a || !b) continue;
        const pa = worldToScreen(a.x, a.y);
        const pb = worldToScreen(b.x, b.y);
        const mx = (pa.x + pb.x) / 2;
        const my = (pa.y + pb.y) / 2;
        const dx = pb.x - pa.x;
        const dy = pb.y - pa.y;
        const nx = -dy * 0.12;
        const ny = dx * 0.12;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.quadraticCurveTo(mx + nx, my + ny, pb.x, pb.y);
        ctx.strokeStyle =
          edge.type === "cofounder" ? `rgba(140,120,180,${edgeAlpha + 0.06})` : `rgba(90,100,160,${edgeAlpha})`;
        ctx.stroke();
      }
    }

    // Company dots
    for (const node of companies) {
      const hue = hueOf(node.hue);
      let x = node.x;
      let y = node.y;
      if (!reduceMotionRef.current && glow > 0.05) {
        const h = hash01(node.id);
        x += Math.sin(t * 0.0009 + h * 12) * 1.4 * glow;
        y += Math.cos(t * 0.0008 + h * 9) * 1.4 * glow;
      }
      const p = worldToScreen(x, y);
      const r = Math.max(1.2, node.size * (0.55 + scale * 0.35));
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      if (editorial > 0.5) {
        ctx.fillStyle = hexAlpha(hue.dot, 0.55 + 0.25 * editorial);
      } else {
        ctx.fillStyle = `rgba(28,36,56,${0.55 + 0.35 * glow})`;
      }
      ctx.fill();
    }

    // Network cores (editorial packed bubble centers)
    for (const node of networks) {
      const hue = hueOf(node.hue);
      const p = worldToScreen(node.x, node.y);
      const r = Math.max(4, node.size * (0.7 + editorial * 0.5));
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = hexAlpha(hue.ink, 0.35 + 0.45 * editorial);
      ctx.fill();
      ctx.strokeStyle = hexAlpha("#ffffff", 0.7);
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Update HTML labels only when the camera or hover target moved.
    if (viewDirtyRef.current) {
      const nextLabels = placeLabels(clusters, worldToScreen, scale, size.w, size.h, hoverNetRef.current);
      const sig = nextLabels.map((label) => `${label.id}:${label.x|0},${label.y|0},${label.text}`).join("|");
      if (sig !== labelsSigRef.current) {
        labelsSigRef.current = sig;
        setLabels(nextLabels);
      }
      viewDirtyRef.current = false;
    }
  }, [bounds, size, worldToScreen]);

  useEffect(() => {
    let alive = true;
    const loop = (ts: number) => {
      if (!alive) return;
      timeRef.current = ts;
      draw();
      if (!reduceMotionRef.current) {
        rafRef.current = requestAnimationFrame(loop);
      }
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [draw]);

  // Redraw on size/view changes when reduced motion
  useEffect(() => {
    if (reduceMotionRef.current) draw();
  }, [draw, size]);

  const hitTest = useCallback(
    (sx: number, sy: number): GraphNode | GraphCluster | null => {
      const g = graphRef.current;
      if (!g) return null;
      const world = screenToWorld(sx, sy);
      // companies first when zoomed in
      const scale = viewRef.current.scale;
      if (scale > 1.1) {
        let best: GraphNode | null = null;
        let bestD = 12 / scale;
        for (const node of g.nodes) {
          if (node.type !== "company") continue;
          const d = Math.hypot(node.x - world.x, node.y - world.y);
          if (d < bestD) {
            bestD = d;
            best = node;
          }
        }
        if (best) return best;
      }
      for (const cluster of g.clusters) {
        if (Math.hypot(cluster.cx - world.x, cluster.cy - world.y) <= cluster.r * 1.05) return cluster;
      }
      for (const node of g.nodes) {
        if (node.type !== "network") continue;
        if (Math.hypot(node.x - world.x, node.y - world.y) <= node.size + 6) return node;
      }
      return null;
    },
    [screenToWorld]
  );

  const onWheel = (event: React.WheelEvent) => {
    event.preventDefault();
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    const before = screenToWorld(sx, sy);
    const factor = event.deltaY < 0 ? 1.08 : 0.92;
    const next = clamp(viewRef.current.scale * factor, 0.55, 4.2);
    viewRef.current.scale = next;
    viewRef.current.tx = sx - before.x * next;
    viewRef.current.ty = sy - before.y * next;
    viewDirtyRef.current = true;
    if (reduceMotionRef.current) draw();
  };

  const onPointerDown = (event: React.PointerEvent) => {
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, tx: viewRef.current.tx, ty: viewRef.current.ty };
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (rect) {
      const hit = hitTest(event.clientX - rect.left, event.clientY - rect.top);
      if (hit && "companyCount" in hit) {
        if (hoverNetRef.current !== hit.id) viewDirtyRef.current = true;
        hoverNetRef.current = hit.id;
        const shown = hit.shownFounders ?? hit.companyCount;
        const total = hit.totalFounders ?? hit.founderCount;
        setHover({
          id: hit.id,
          label: hit.label,
          ties: hit.founderCount,
          kind: hit.kind,
          sourceUrl: null,
          shownOfTotal: `${shown.toLocaleString("en-US")} shown of ${total.toLocaleString("en-US")} founders`,
        });
      } else if (hit && "type" in hit) {
        const net = hit.networkId ?? hit.parentNetworkId;
        if (hoverNetRef.current !== net) viewDirtyRef.current = true;
        hoverNetRef.current = net;
        // Prefer a connected edge URL for evidence on hover.
        const g = graphRef.current;
        let sourceUrl: string | null = null;
        if (g) {
          const edge = g.edges.find(
            (item) => (item.source === hit.id || item.target === hit.id) && item.sourceUrl
          );
          sourceUrl = edge?.sourceUrl ?? null;
        }
        const cluster = g?.clusters.find((c) => c.id === net);
        setHover({
          id: hit.id,
          label: hit.label,
          ties: degreeRef.current.get(hit.id) ?? 0,
          kind: hit.type,
          sourceUrl,
          shownOfTotal: cluster
            ? `${(cluster.shownFounders ?? 0).toLocaleString("en-US")} shown of ${(cluster.totalFounders ?? 0).toLocaleString("en-US")} founders`
            : null,
        });
      } else {
        if (hoverNetRef.current !== null) viewDirtyRef.current = true;
        hoverNetRef.current = null;
        setHover(null);
      }
    }
    if (!dragRef.current) return;
    viewRef.current.tx = dragRef.current.tx + (event.clientX - dragRef.current.x);
    viewRef.current.ty = dragRef.current.ty + (event.clientY - dragRef.current.y);
    viewDirtyRef.current = true;
    if (reduceMotionRef.current) draw();
  };
  const onPointerUp = (event: React.PointerEvent) => {
    const dragged =
      dragRef.current && (Math.abs(event.clientX - dragRef.current.x) > 4 || Math.abs(event.clientY - dragRef.current.y) > 4);
    dragRef.current = null;
    if (dragged) return;
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const hit = hitTest(event.clientX - rect.left, event.clientY - rect.top);
    if (!hit) return;
    if ("companyId" in hit && hit.companyId) onSelectCompany(hit.companyId);
    else if ("networkId" in hit && hit.networkId) onSelectNetwork(hit.networkId);
    else if ("id" in hit && !("type" in hit)) onSelectNetwork(hit.id);
  };

  if (error) {
    return <p className="px-4 py-8 text-sm text-[color:var(--fg-2)]">{error}</p>;
  }
  if (!graph) {
    return <p className="px-4 py-8 text-sm text-[color:var(--fg-2)]">Loading network graph...</p>;
  }

  return (
    <div
      ref={wrapRef}
      className="relative h-[440px] w-full touch-manipulation overflow-hidden bg-white md:h-[560px]"
      data-networks-graph=""
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        dragRef.current = null;
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full cursor-grab active:cursor-grabbing" aria-label="Founder networks graph" />

      {/* Leader lines */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" width={size.w} height={size.h} aria-hidden="true">
        {labels.map((label) => {
          const lx = label.x + label.w / 2;
          const ly = label.y + label.h / 2;
          const dx = lx - label.anchorX;
          const dy = ly - label.anchorY;
          const needsLeader = Math.hypot(dx, dy) > 28;
          if (!needsLeader) return null;
          return (
            <path
              key={`lead-${label.id}`}
              d={`M ${label.anchorX} ${label.anchorY} Q ${(label.anchorX + lx) / 2} ${(label.anchorY + ly) / 2 - 12} ${lx} ${ly}`}
              stroke="rgba(90,100,140,0.35)"
              strokeWidth="0.8"
              fill="none"
            />
          );
        })}
      </svg>

      {/* Crisp HTML labels for collision checker */}
      {labels.map((label) => (
        <button
          key={label.id}
          type="button"
          data-canvas-label={label.id}
          className="absolute z-[1] rounded-full border border-[color:var(--line)] bg-white/95 px-2 py-0.5 text-left text-[10px] font-medium shadow-sm hover:border-[color:var(--cobalt)]"
          style={{ left: label.x, top: label.y, width: label.w, color: label.color }}
          onClick={(event) => {
            event.stopPropagation();
            onSelectNetwork(label.id);
          }}
        >
          {label.text}
        </button>
      ))}

      {/* Nature-style editorial callouts parked in the margins with leader lines */}
      {(graph.clusters || [])
        .filter((cluster) => cluster.callout && cluster.rank <= 3)
        .slice(0, 3)
        .map((cluster, index) => {
          const anchor = worldToScreen(cluster.cx, cluster.cy);
          const boxW = 190;
          const left = index === 0 ? 10 : index === 1 ? size.w - boxW - 10 : 10;
          const top = index === 2 ? size.h - 120 : 56 + index * 18;
          const lx = left + (index === 1 ? 0 : boxW);
          const ly = top + 18;
          return (
            <div key={`callout-${cluster.id}`}>
              <svg className="pointer-events-none absolute inset-0 z-[1] h-full w-full" width={size.w} height={size.h} aria-hidden="true">
                <path
                  d={`M ${anchor.x} ${anchor.y} L ${lx} ${ly}`}
                  stroke="rgba(90,100,140,0.4)"
                  strokeWidth="0.9"
                  fill="none"
                />
              </svg>
              <div
                data-canvas-label={`callout-${cluster.id}`}
                className="pointer-events-none absolute z-[1] rounded border border-[color:var(--line)] bg-white/95 px-2 py-1.5 text-[10px] leading-snug text-[color:var(--fg-2)] shadow-sm"
                style={{ left, top, width: boxW }}
              >
                <div className="font-medium text-[color:var(--fg)]">{shortLabel(cluster.label, 22)}</div>
                <div>{cluster.callout}</div>
              </div>
            </div>
          );
        })}

      {hover ? (
        <div className="pointer-events-none absolute left-3 top-3 z-[2] max-w-[280px] rounded border border-[color:var(--line)] bg-white px-2.5 py-1.5 text-xs text-[color:var(--fg)] shadow-sm">
          <div className="font-medium">{hover.label}</div>
          <div className="text-[color:var(--fg-2)]">
            {hover.ties.toLocaleString("en-US")} {hover.kind === "company" || hover.kind === "founder" ? "ties" : "founder links"}
          </div>
          {hover.shownOfTotal ? <div className="text-[color:var(--fg-3)]">{hover.shownOfTotal}</div> : null}
          {hover.sourceUrl ? (
            <div className="mt-0.5 truncate text-[10px] text-[color:var(--cobalt)]">{hover.sourceUrl}</div>
          ) : null}
        </div>
      ) : null}

      <div className="absolute bottom-3 left-3 right-3 z-[2] flex flex-wrap items-center gap-3 rounded border border-[color:var(--line)] bg-white/95 px-3 py-2 text-[11px] text-[color:var(--fg-2)]">
        {KIND_LEGEND.map((item) => (
          <span key={item.kind} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: item.color }} /> {item.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#6a70e0]" /> Company
        </span>
        <span className="ml-auto max-w-[28rem] text-right tabular-nums">
          Sampled graph · {(graph.edgeCounts.network_tie ?? 0).toLocaleString("en-US")} network ties ·{" "}
          {(graph.edgeCounts.cofounder ?? 0).toLocaleString("en-US")} co-founder links · scroll to zoom
        </span>
      </div>
    </div>
  );
}

function hexAlpha(hex: string, alpha: number): string {
  const raw = hex.replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  const n = Number.parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${clamp(alpha, 0, 1)})`;
}

function fitScaleApprox(bounds: { minX: number; maxX: number; minY: number; maxY: number }, size: { w: number; h: number }) {
  const pad = 36;
  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanY = Math.max(1, bounds.maxY - bounds.minY);
  return Math.min((size.w - pad * 2) / spanX, (size.h - pad * 2) / spanY, 1.35);
}
