"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GraphCluster, GraphFounderDeal, GraphNode, GraphPayload, NetworkKind } from "@/lib/domain/founder-networks-model";

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

function measureText(text: string, fontPx = 11): number {
  return Math.ceil(text.length * fontPx * 0.62) + 12;
}

type LabelBox = {
  id: string;
  text: string;
  sub: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  anchorX: number;
  anchorY: number;
  rimX: number;
  rimY: number;
  color: string;
  side: "left" | "right";
};

/** Nature-style margin callouts: full labels in side gutters with thin leader lines. Never on bubbles. */
function placeLabels(
  clusters: GraphCluster[],
  toScreen: (x: number, y: number) => Point,
  scale: number,
  viewW: number,
  viewH: number,
  hoverId: string | null,
  marginL: number,
  marginR: number
): LabelBox[] {
  const ranked = [...clusters].sort((a, b) => a.rank - b.rank);
  // Desktop: every network once. Narrow: top ranks only so the cloud stays readable.
  const maxLabels = viewW < 600 ? 6 : viewW < 900 ? 10 : ranked.length;
  const candidates = ranked.filter((c) => c.rank <= maxLabels || c.id === hoverId);
  const legendH = 48;
  const topPad = 10;
  const bottomLimit = viewH - legendH - 8;
  const gutterW = Math.max(118, Math.min(marginL, marginR) - 12);
  const leftColX = 8;
  const rightColX = viewW - gutterW - 8;

  type Tentative = {
    cluster: GraphCluster;
    center: Point;
    rim: Point;
    side: "left" | "right";
    text: string;
    sub: string | null;
    w: number;
    h: number;
    preferY: number;
  };

  const tentatives: Tentative[] = [];
  for (const cluster of candidates) {
    const center = toScreen(cluster.cx, cluster.cy);
    const rPx = Math.max(8, cluster.r * scale);
    // Prefer the side farther from the cloud center (screen mid).
    const side: "left" | "right" = center.x < viewW * 0.5 ? "left" : "right";
    const ang = side === "left" ? Math.PI : 0;
    const rim: Point = {
      x: center.x + Math.cos(ang) * rPx * 0.92,
      y: center.y + Math.sin(ang) * rPx * 0.15,
    };
    const text = cluster.label; // full, never truncated
    const sub = null; // insights rendered as separate margin callouts (avoid label collisions)
    const needed = measureText(text, 11);
    const w = Math.max(64, Math.min(gutterW, Math.max(needed, 64)));
    const lines = Math.max(1, Math.ceil(needed / Math.max(1, w - 4)));
    const h = 18 * lines + 6;
    tentatives.push({
      cluster,
      center,
      rim,
      side,
      text,
      sub,
      w,
      h,
      preferY: clamp(center.y - h / 2, topPad, bottomLimit - h),
    });
  }

  // Resolve vertical collisions per side independently (stable stack).
  const placed: LabelBox[] = [];
  for (const side of ["left", "right"] as const) {
    const group = tentatives.filter((t) => t.side === side).sort((a, b) => a.preferY - b.preferY || a.cluster.rank - b.cluster.rank);
    const colX = side === "left" ? leftColX : rightColX;
    let cursor = topPad;
    const slots: { t: Tentative; y: number }[] = [];
    for (const t of group) {
      let y = Math.max(t.preferY, cursor);
      if (y + t.h > bottomLimit) {
        // Pack upward from the bottom for overflow.
        y = Math.max(topPad, bottomLimit - t.h);
      }
      slots.push({ t, y });
      cursor = y + t.h + 10;
    }
    // If we overflowed the bottom, compress from the top evenly.
    if (slots.length) {
      const last = slots[slots.length - 1];
      if (last.y + last.t.h > bottomLimit) {
        const totalH = slots.reduce((s, sl) => s + sl.t.h, 0) + Math.max(0, slots.length - 1) * 5;
        let y = Math.max(topPad, Math.min(topPad, bottomLimit - totalH));
        if (totalH < bottomLimit - topPad) {
          // Redistribute with original preference bias.
          const span = bottomLimit - topPad - totalH;
          // keep max(prefer, sequential)
          y = topPad;
        }
        // Force sequential pack into available height.
        const gap = slots.length > 1 ? Math.max(2, (bottomLimit - topPad - slots.reduce((s, sl) => s + sl.t.h, 0)) / (slots.length - 1)) : 0;
        y = topPad;
        for (const sl of slots) {
          sl.y = y;
          y += sl.t.h + gap;
        }
      }
    }

    for (const sl of slots) {
      const { t, y } = sl;
      const hue = hueOf(t.cluster.hue);
      // Emphasize hover slightly by ensuring its slot stays (already included).
      void hoverId;
      placed.push({
        id: t.cluster.id,
        text: t.text,
        sub: t.sub,
        x: colX,
        y,
        w: t.w,
        h: t.h,
        anchorX: t.center.x,
        anchorY: t.center.y,
        rimX: t.rim.x,
        rimY: t.rim.y,
        color: hue.label,
        side,
      });
    }
  }
  // Final per-side stack: force strictly increasing y so DOM boxes cannot overlap.
  const pad = 4;
  const stackSide = (side: "left" | "right") => {
    const group = placed.filter((label) => label.side === side).sort((a, b) => a.y - b.y || a.text.localeCompare(b.text));
    let y = topPad;
    for (const label of group) {
      label.y = Math.max(label.y, y);
      y = label.y + label.h + pad;
    }
    if (group.length) {
      const last = group[group.length - 1];
      if (last.y + last.h > bottomLimit) {
        const totalH = group.reduce((s, label) => s + label.h, 0);
        const gaps = Math.max(0, group.length - 1);
        const gap = gaps ? Math.max(2, (bottomLimit - topPad - totalH) / gaps) : 0;
        let cursor = topPad;
        for (const label of group) {
          label.y = cursor;
          cursor += label.h + gap;
        }
      }
    }
  };
  stackSide("left");
  stackSide("right");
  // Cross-side: if a left box still intersects a right box, push the lower one down.
  for (let pass = 0; pass < 8; pass++) {
    let moved = false;
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i];
        const b = placed[j];
        const hit = !(a.x + a.w + pad <= b.x || b.x + b.w + pad <= a.x || a.y + a.h + pad <= b.y || b.y + b.h + pad <= a.y);
        if (!hit) continue;
        const lower = a.y >= b.y ? a : b;
        const upper = lower === a ? b : a;
        lower.y = upper.y + upper.h + pad;
        if (lower.y + lower.h > bottomLimit) lower.y = Math.max(topPad, bottomLimit - lower.h);
        moved = true;
      }
    }
    if (!moved) break;
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
    deal: GraphFounderDeal | null;
  } | null>(null);
  const [uncrowdedOnly, setUncrowdedOnly] = useState(false);
  const uncrowdedRef = useRef<Set<string>>(new Set());
  const dealsRef = useRef<Record<string, GraphFounderDeal>>({});
  const uncrowdedOnlyRef = useRef(false);
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
        dealsRef.current = payload.founderDeals ?? {};
        uncrowdedRef.current = new Set(payload.uncrowdedCompanyIds ?? []);
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
  }, [graph]);

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

  const margins = useMemo(() => {
    // Wide gutters for full Nature-style callouts; cloud fills the middle band.
    const marginL = size.w >= 900 ? 200 : size.w >= 600 ? 140 : 4;
    const marginR = size.w >= 900 ? 200 : size.w >= 600 ? 140 : 4;
    const marginT = 14;
    const marginB = 56;
    return { marginL, marginR, marginT, marginB };
  }, [size.w]);

  const fitView = useCallback(() => {
    const { marginL, marginR, marginT, marginB } = margins;
    const spanX = Math.max(1, bounds.maxX - bounds.minX);
    const spanY = Math.max(1, bounds.maxY - bounds.minY);
    const usableW = Math.max(120, size.w - marginL - marginR);
    const usableH = Math.max(120, size.h - marginT - marginB);
    // Prefer filling width: allow slight vertical letterbox so the cloud spans the frame.
    // Prefer filling the usable width so the cloud spans the frame.
    const scaleW = usableW / spanX;
    const scaleH = usableH / spanY;
    const finalScale = Math.min(scaleW, scaleH * 1.12, 1.75);
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    viewRef.current = {
      scale: finalScale,
      tx: marginL + usableW / 2 - cx * finalScale,
      ty: marginT + usableH / 2 - cy * finalScale,
    };
    viewDirtyRef.current = true;
  }, [bounds, size, margins]);

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

    // Thin translucent curved edges  -  dense hairline web (Nature / pink co-authorship)
    const edgeAlpha = 0.34 * editorial + 0.32 * glow;
    const byId = byIdRef.current;
    if (edgeAlpha > 0.02) {
      ctx.lineWidth = 0.7;
      ctx.lineCap = "round";
      for (const edge of g.edges) {
        // Keep almost all edges visible when zoomed out; only lightly thin the densest hub spokes.
        if (edge.type === "network_founder" && editorial > 0.8 && hash01(edge.target) > 0.82) continue;
        if (edge.type === "network_tie" && editorial > 0.85 && hash01(edge.source + edge.target) > 0.88) continue;
        const a = byId.get(edge.source);
        const b = byId.get(edge.target);
        if (!a || !b) continue;
        const pa = worldToScreen(a.x, a.y);
        const pb = worldToScreen(b.x, b.y);
        const mx = (pa.x + pb.x) / 2;
        const my = (pa.y + pb.y) / 2;
        const dx = pb.x - pa.x;
        const dy = pb.y - pa.y;
        const bend = edge.type === "cofounder" ? 0.18 : 0.14;
        const nx = -dy * bend;
        const ny = dx * bend;
        const hueIdx = a.hue ?? b.hue ?? 0;
        const hue = hueOf(hueIdx);
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.quadraticCurveTo(mx + nx, my + ny, pb.x, pb.y);
        const aMul = edge.type === "cofounder" ? 1.15 : edge.type === "founder_company" ? 1.05 : 1;
        ctx.strokeStyle = hexAlpha(hue.ink, edgeAlpha * aMul);
        ctx.stroke();
      }
    }

    // Company + founder dots (many small nodes)
    const members = g.nodes.filter((n) => n.type === "company" || n.type === "founder");
    for (const node of members) {
      const hue = hueOf(node.hue);
      let x = node.x;
      let y = node.y;
      if (!reduceMotionRef.current && glow > 0.05) {
        const h = hash01(node.id);
        x += Math.sin(t * 0.0009 + h * 12) * 1.4 * glow;
        y += Math.cos(t * 0.0008 + h * 9) * 1.4 * glow;
      }
      const p = worldToScreen(x, y);
      const base = node.type === "founder" ? 0.42 : 0.55;
      const r = Math.max(node.type === "founder" ? 0.9 : 1.15, node.size * (base + scale * 0.32));
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      const companyId = node.type === "company" ? node.companyId : node.type === "founder" ? dealsRef.current[node.founderId ?? ""]?.companyId ?? null : null;
      const isUncrowded = companyId ? uncrowdedRef.current.has(companyId) : false;
      const dim = uncrowdedOnlyRef.current && !isUncrowded;
      if (editorial > 0.5) {
        const base = node.type === "founder" ? 0.45 + 0.2 * editorial : 0.58 + 0.25 * editorial;
        ctx.fillStyle = hexAlpha(hue.dot, dim ? base * 0.18 : base);
      } else {
        ctx.fillStyle = `rgba(28,36,56,${dim ? 0.12 : 0.5 + 0.35 * glow})`;
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
      const nextLabels = placeLabels(
        clusters,
        worldToScreen,
        scale,
        size.w,
        size.h,
        hoverNetRef.current,
        margins.marginL,
        margins.marginR
      );
      const sig = nextLabels.map((label) => `${label.id}:${label.x|0},${label.y|0},${label.text}`).join("|");
      if (sig !== labelsSigRef.current) {
        labelsSigRef.current = sig;
        setLabels(nextLabels);
      }
      viewDirtyRef.current = false;
    }
  }, [bounds, size, worldToScreen, margins]);

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

  useEffect(() => {
    uncrowdedOnlyRef.current = uncrowdedOnly;
    viewDirtyRef.current = true;
    if (reduceMotionRef.current) draw();
  }, [uncrowdedOnly, draw]);

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
          if (node.type !== "company" && node.type !== "founder") continue;
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
          deal: null,
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
        const deal =
          hit.type === "founder" && hit.founderId
            ? dealsRef.current[hit.founderId] ?? null
            : hit.type === "company" && hit.companyId
              ? Object.values(dealsRef.current).find((d) => d.companyId === hit.companyId) ?? null
              : null;
        setHover({
          id: hit.id,
          label: hit.label,
          ties: degreeRef.current.get(hit.id) ?? 0,
          kind: hit.type,
          sourceUrl,
          shownOfTotal: cluster
            ? `${(cluster.shownFounders ?? 0).toLocaleString("en-US")} shown of ${(cluster.totalFounders ?? 0).toLocaleString("en-US")} founders`
            : null,
          deal,
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

      {/* Thin leader lines from cluster rim to margin labels */}
      <svg className="pointer-events-none absolute inset-0 z-[1] h-full w-full" width={size.w} height={size.h} aria-hidden="true">
        {labels.map((label) => {
          const lx = label.side === "left" ? label.x + label.w : label.x;
          const ly = label.y + (label.sub ? 8 : label.h / 2);
          const midX = (label.rimX + lx) / 2;
          const midY = (label.rimY + ly) / 2;
          return (
            <path
              key={`lead-${label.id}`}
              d={`M ${label.rimX} ${label.rimY} Q ${midX} ${midY} ${lx} ${ly}`}
              stroke="rgba(70,80,120,0.45)"
              strokeWidth="0.75"
              fill="none"
            />
          );
        })}
      </svg>

      {/* Full margin labels  -  one per network, never truncated, never on bubbles */}
      {labels.map((label) => (
        <button
          key={label.id}
          type="button"
          data-canvas-label={label.id}
          className="absolute z-[1] box-border bg-white/95 px-1.5 py-0.5 text-left text-[11px] font-medium leading-snug hover:bg-white"
          style={{ left: label.x, top: label.y, width: label.w, color: label.color, maxWidth: label.w }}
          onClick={(event) => {
            event.stopPropagation();
            onSelectNetwork(label.id);
          }}
        >
          <span className="block whitespace-normal break-words">{label.text}</span>
        </button>
      ))}

      {/* Investor insight callouts (not data-canvas-label  -  names already labeled once) */}
      {(graph.clusters || [])
        .filter((cluster) => cluster.callout && cluster.rank <= 3)
        .map((cluster, index) => {
          const boxW = Math.min(210, Math.max(160, margins.marginL - 16));
          const left = index === 1 ? size.w - boxW - 8 : 8;
          const topPos = index === 2 ? size.h - 118 : 10 + index * 58;
          return (
            <div
              key={`insight-${cluster.id}`}
              className="pointer-events-none absolute z-[1] rounded border border-[color:var(--line)] bg-white/95 px-2 py-1.5 text-[10px] leading-snug text-[color:var(--fg-2)] shadow-sm"
              style={{ left: index === 2 ? 8 : left, top: topPos, width: boxW }}
            >
              {cluster.callout}
            </div>
          );
        })}

      {hover ? (
        <div className="pointer-events-none absolute left-3 top-3 z-[2] max-w-[300px] rounded border border-[color:var(--line)] bg-white px-2.5 py-1.5 text-xs text-[color:var(--fg)] shadow-sm">
          <div className="font-medium">{hover.deal?.founderName ?? hover.label}</div>
          {hover.deal ? (
            <>
              <div className="text-[color:var(--fg-2)]">
                {hover.deal.companyName ?? "Company unknown"}
                {" · "}
                {hover.deal.stage ?? "Stage unknown"}
              </div>
              <div className="mt-0.5 text-[10px] text-[color:var(--fg-3)]">
                Networks: {hover.deal.networks.length ? hover.deal.networks.join(", ") : "unknown"}
              </div>
              <div className="text-[10px] text-[color:var(--fg-3)]">
                Investors: {hover.deal.investors.length ? hover.deal.investors.join(", ") : "unknown"}
                {hover.deal.hasTopFund ? " · top fund on file" : " · not yet backed by a top fund"}
              </div>
            </>
          ) : (
            <>
              <div className="text-[color:var(--fg-2)]">
                {hover.ties.toLocaleString("en-US")} {hover.kind === "company" || hover.kind === "founder" ? "ties" : "founder links"}
              </div>
              {hover.shownOfTotal ? <div className="text-[color:var(--fg-3)]">{hover.shownOfTotal}</div> : null}
            </>
          )}
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
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-[color:var(--fg)]">
          <input
            type="checkbox"
            className="accent-[color:var(--cobalt)]"
            checked={uncrowdedOnly}
            onChange={(event) => setUncrowdedOnly(event.target.checked)}
          />
          Not yet backed by a top fund
        </label>
        <span className="ml-auto max-w-[24rem] text-right tabular-nums">
          {(graph.uncrowdedCompanyIds?.length ?? 0).toLocaleString("en-US")} uncrowded companies in sample · scroll to zoom
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
  const marginL = size.w >= 900 ? 200 : size.w >= 600 ? 140 : 4;
  const marginR = size.w >= 900 ? 200 : size.w >= 600 ? 140 : 4;
  const marginT = 14;
  const marginB = 56;
  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanY = Math.max(1, bounds.maxY - bounds.minY);
  const usableW = Math.max(120, size.w - marginL - marginR);
  const usableH = Math.max(120, size.h - marginT - marginB);
  return Math.min(usableW / spanX, usableH / spanY, 1.55);
}
