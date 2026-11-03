"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { assignFounderNetworkCampusColors } from "@/components/network-style";
import type { GraphCluster, GraphFounderDeal, GraphNode, GraphPayload, NetworkKind, NetworkSummary } from "@/lib/domain/founder-networks-model";

type Point = { x: number; y: number };

const HUB_INK: Record<NetworkKind, string> = {
  accelerator: "#4b5563",
  program: "#6b7280",
  lab: "#7c8798",
  investor: "#374151",
};

function loadGraph(): Promise<GraphPayload> {
  return fetch("/data/founder-networks-graph.json").then((res) => {
    if (!res.ok) throw new Error("graph missing");
    return res.json();
  });
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

function hexAlpha(hex: string, alpha: number): string {
  const raw = hex.replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  const n = Number.parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${clamp(alpha, 0, 1)})`;
}

function measureText(text: string, fontPx = 11): number {
  return Math.ceil(text.length * fontPx * 0.62) + 12;
}

type LabelBox = {
  id: string;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rimX: number;
  rimY: number;
  color: string;
  hubX: number;
  hubY: number;
  hubR: number;
};

type CalloutBox = {
  id: string;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

function boxesHit(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }, pad = 4) {
  return !(a.x + a.w + pad <= b.x || b.x + b.w + pad <= a.x || a.y + a.h + pad <= b.y || b.y + b.h + pad <= a.y);
}

/** Word-aware wrap metrics so long Penn names break cleanly. */
function wrapLabelMetrics(text: string, maxW: number, fontPx = 11): { w: number; h: number } {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const trial = cur ? `${cur} ${word}` : word;
    if (cur && measureText(trial, fontPx) > maxW) {
      lines.push(cur);
      cur = word;
    } else {
      cur = trial;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length === 0) lines.push(text);
  const w = Math.min(maxW, Math.max(64, ...lines.map((line) => measureText(line, fontPx))));
  const h = 4 + lines.length * 14;
  return { w, h };
}

type HubScreen = { id: string; x: number; y: number; r: number };

/** Labels sit next to each cluster with short leaders (not far gutters). */
function placeLabels(
  clusters: GraphCluster[],
  toScreen: (x: number, y: number) => Point,
  scale: number,
  viewW: number,
  viewH: number,
  hoverId: string | null
): LabelBox[] {
  const ranked = [...clusters].sort((a, b) => a.rank - b.rank);
  // Cap labels so dense clusters (a16z Speedrun neighborhood) stay readable; hover reveals the rest.
  const maxLabels = viewW < 600 ? 6 : viewW < 900 ? 10 : 12;
  const candidates = ranked.filter((c) => c.rank <= maxLabels || c.id === hoverId);
  // Reserve the in-frame campus legend strip (taller on narrow viewports; keep Uncrowded off-canvas).
  const legendH = viewW < 600 ? 40 : 46;
  const topPad = 8;
  const bottomLimit = viewH - legendH - 6;
  const placed: LabelBox[] = [];
  const hitPad = viewW < 900 ? 12 : 14;

  const hubs: HubScreen[] = candidates.map((cluster) => {
    const center = toScreen(cluster.cx, cluster.cy);
    const cloudR = Math.max(8, (cluster.labelR ?? cluster.r * 0.72) * scale);
    return { id: cluster.id, x: center.x, y: center.y, r: cloudR };
  });

  const insideOtherHub = (midX: number, midY: number, selfId: string) => {
    for (const hub of hubs) {
      if (hub.id === selfId) continue;
      // Keep labels out of foreign cluster disks (Velocity off NYU, YC off Thiel/Neo).
      if (Math.hypot(midX - hub.x, midY - hub.y) < hub.r * 0.95) return true;
    }
    return false;
  };

  for (const cluster of candidates) {
    const center = toScreen(cluster.cx, cluster.cy);
    const cloudR = Math.max(8, (cluster.labelR ?? cluster.r * 0.72) * scale);
    const hubX = center.x;
    const hubY = center.y;
    const hubR = cloudR;
    // Giant clouds (YC) must anchor near the hub, not on the outer fringe next to neighbors.
    const anchorR = Math.min(cloudR, Math.max(18, Math.min(48, cloudR * 0.38)));
    const count = cluster.totalFounders || cluster.founderCount || 0;
    const text = `${cluster.label} · ${count.toLocaleString("en-US")}`;
    const fontPx = 11;
    const maxW = Math.min(190, Math.max(96, Math.min(viewW * 0.2, text.length > 26 ? 180 : 140)));
    const { w, h } = wrapLabelMetrics(text, maxW, fontPx);
    // Dense right-side / upper-right clusters: prefer outward angles; skip more aggressively.
    const rightSide = center.x > viewW * 0.52;
    const upperRight = rightSide && center.y < viewH * 0.48;
    const baseAng = rightSide
      ? Math.atan2(center.y - viewH / 2, Math.max(24, viewW - center.x))
      : Math.atan2(center.y - viewH / 2, center.x - viewW / 2);
    const angleScores: { ang: number; score: number }[] = [];
    for (let k = 0; k < 36; k++) {
      const sign = k % 2 === 0 ? 1 : -1;
      const step = Math.floor(k / 2) * 0.22;
      const ang = baseAng + sign * step;
      const probeX = center.x + Math.cos(ang) * (anchorR + 22);
      const probeY = center.y + Math.sin(ang) * (anchorR + 22);
      let nearest = Infinity;
      for (const hub of hubs) {
        if (hub.id === cluster.id) continue;
        nearest = Math.min(nearest, Math.hypot(probeX - hub.x, probeY - hub.y) - hub.r);
      }
      let score = nearest;
      if (rightSide && Math.cos(ang) > 0.15) score += 18;
      if (rightSide && Math.cos(ang) < -0.2) score -= 12;
      angleScores.push({ ang, score });
    }
    angleScores.sort((a, b) => b.score - a.score);
    const offsets = angleScores.map((row) => row.ang);

    let chosen: LabelBox | null = null;
    let bestScore = -1e9;
    for (const ang of offsets) {
      for (const gap of [6, 10, 14, 20, 28, 36]) {
        const rimX = center.x + Math.cos(ang) * anchorR;
        const rimY = center.y + Math.sin(ang) * anchorR;
        const lx = rimX + Math.cos(ang) * gap;
        const ly = rimY + Math.sin(ang) * (gap * 0.75);
        const x = clamp(lx - w / 2, 4, viewW - w - 4);
        const y = clamp(ly - h / 2, topPad, bottomLimit - h);
        const box: LabelBox = { id: cluster.id, text, x, y, w, h, rimX, rimY, color: "#374151", hubX, hubY, hubR };
        const midX = x + w / 2;
        const midY = y + h / 2;
        // Anchor + label must stay on this hub's disk.
        if (Math.hypot(rimX - center.x, rimY - center.y) > cloudR * 1.02) continue;
        if (Math.hypot(midX - center.x, midY - center.y) > cloudR + 34) continue;
        if (Math.hypot(midX - rimX, midY - rimY) > 56) continue;
        if (insideOtherHub(midX, midY, cluster.id)) continue;
        if (insideOtherHub(rimX, rimY, cluster.id)) continue;
        if (placed.some((other) => boxesHit(box, other, hitPad))) continue;
        const clear = Math.min(
          ...hubs.filter((hub) => hub.id !== cluster.id).map((hub) => Math.hypot(midX - hub.x, midY - hub.y) - hub.r)
        );
        const score = clear + (gap < 18 ? 10 : 0) + (rightSide && Math.cos(ang) > 0 ? 6 : 0);
        if (score > bestScore) {
          bestScore = score;
          chosen = box;
        }
      }
      if (chosen && bestScore > 14) break;
    }
    if (!chosen) {
      // Fallback: park beside hub along free angle, still inside own disk.
      for (const ang of offsets) {
        const rimX = center.x + Math.cos(ang) * anchorR;
        const rimY = center.y + Math.sin(ang) * anchorR;
        const x = clamp(rimX + Math.cos(ang) * 14 - w / 2, 4, viewW - w - 4);
        let y = clamp(rimY - h / 2, topPad, bottomLimit - h);
        for (let nudge = 0; nudge < 18; nudge++) {
          const box: LabelBox = { id: cluster.id, text, x, y, w, h, rimX, rimY, color: "#374151", hubX, hubY, hubR };
          const midX = x + w / 2;
          const midY = y + h / 2;
          if (
            Math.hypot(midX - center.x, midY - center.y) <= cloudR + 36 &&
            !insideOtherHub(midX, midY, cluster.id) &&
            !placed.some((other) => boxesHit(box, other, hitPad))
          ) {
            chosen = box;
            break;
          }
          y = clamp(y + 10, topPad, bottomLimit - h);
        }
        if (chosen) break;
      }
    }
    // Skip colliding / minor labels in dense zones (esp. a16z upper-right); hover still forces a label.
    if (!chosen) {
      const denseId = /speedrun|a16z|thiel|neo|yc/i.test(cluster.id);
      if (
        (cluster.rank > 5 || (upperRight && cluster.rank > 3) || (denseId && cluster.rank > 4)) &&
        cluster.id !== hoverId
      ) {
        continue;
      }
      const rimX = center.x + (rightSide ? anchorR : -anchorR * 0.2);
      const rimY = center.y;
      const trial: LabelBox = {
        id: cluster.id,
        text,
        x: clamp(center.x + (rightSide ? anchorR + 8 : -w / 2) - (rightSide ? w / 2 : 0), 4, viewW - w - 4),
        y: clamp(center.y - h / 2, topPad, bottomLimit - h),
        w,
        h,
        rimX,
        rimY,
        color: "#374151",
        hubX,
        hubY,
        hubR,
      };
      if (placed.some((other) => boxesHit(trial, other, hitPad))) continue;
      chosen = trial;
    }
    placed.push(chosen);
  }
  return placed;
}

function estimateCalloutSize(text: string, viewW: number): { w: number; h: number } {
  const w = Math.min(200, Math.max(150, Math.ceil(Math.min(text.length * 3.6, viewW * 0.22))));
  const charsPerLine = Math.max(18, Math.floor((w - 16) / 5.4));
  const nLines = Math.max(2, Math.ceil(text.length / charsPerLine));
  const h = 10 + nLines * 13;
  return { w, h };
}

function placeCallouts(
  clusters: GraphCluster[],
  labels: LabelBox[],
  viewW: number,
  viewH: number
): CalloutBox[] {
  const insights = clusters.filter((c) => c.callout && c.rank <= 3).sort((a, b) => a.rank - b.rank);
  // Callouts render in the rail; keep placement helper for text extraction only.
  const legendH = 8;
  const placed: CalloutBox[] = [];
  for (let i = 0; i < insights.length; i++) {
    const cluster = insights[i];
    const text = cluster.callout || "";
    const { w, h } = estimateCalloutSize(text, viewW);
    const marginSlots: Point[] = [
      { x: 8, y: 8 },
      { x: viewW - w - 8, y: 8 },
      { x: 8, y: viewH - legendH - h - 8 },
      { x: viewW - w - 8, y: viewH - legendH - h - 8 },
      { x: 8, y: Math.max(8, viewH * 0.28) },
      { x: viewW - w - 8, y: Math.max(8, viewH * 0.28) },
      { x: 8, y: Math.max(8, viewH * 0.55 - h) },
      { x: viewW - w - 8, y: Math.max(8, viewH * 0.55 - h) },
      { x: Math.max(8, viewW * 0.5 - w / 2), y: 8 },
      { x: Math.max(8, viewW * 0.5 - w / 2), y: viewH - legendH - h - 8 },
    ];
    let chosen: CalloutBox | null = null;
    let bestScore = -1e9;
    for (const slot of marginSlots) {
      const box: CalloutBox = {
        id: cluster.id,
        text,
        x: clamp(slot.x, 4, viewW - w - 4),
        y: clamp(slot.y, 4, viewH - legendH - h - 4),
        w,
        h,
      };
      if (labels.some((label) => boxesHit(box, label, 10))) continue;
      if (placed.some((other) => boxesHit(box, other, 8))) continue;
      const own = labels.find((l) => l.id === cluster.id);
      let score = 0;
      if (own) {
        const dx = box.x + box.w / 2 - (own.x + own.w / 2);
        const dy = box.y + box.h / 2 - (own.y + own.h / 2);
        score += Math.hypot(dx, dy);
      }
      if (box.y < 40 || box.y > viewH - legendH - h - 40) score += 40;
      if (score > bestScore) {
        bestScore = score;
        chosen = box;
      }
    }
    if (!chosen) continue;
    placed.push(chosen);
  }
  return placed;
}

function fitScaleApprox(bounds: { minX: number; maxX: number; minY: number; maxY: number }, size: { w: number; h: number }) {
  const padX = Math.max(12, size.w * 0.05);
  const padY = Math.max(10, size.h * 0.045);
  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanY = Math.max(1, bounds.maxY - bounds.minY);
  return Math.min((size.w - padX * 2) / spanX, (size.h - padY * 2) / spanY, 2.8);
}

export function NetworksGraph({
  onSelectCompany,
  onSelectNetwork,
  investorHubs = [],
}: {
  onSelectCompany: (id: string) => void;
  onSelectNetwork: (id: string) => void;
  investorHubs?: NetworkSummary[];
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
  const [labels, setLabels] = useState<LabelBox[]>([]);
  const [uncrowdedOnly, setUncrowdedOnly] = useState(false);
  const [highlightNet, setHighlightNet] = useState<string | null>(null);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [railInvestorsOpen, setRailInvestorsOpen] = useState(false);
  /** YC spokes start collapsed so the center is readable; click the hub to expand. */
  const [ycExpanded, setYcExpanded] = useState(false);
  const ycExpandedRef = useRef(false);
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
  const highlightNetRef = useRef<string | null>(null);
  const degreeRef = useRef<Map<string, number>>(new Map());
  const byIdRef = useRef<Map<string, GraphNode>>(new Map());
  const labelsSigRef = useRef("");
  const viewDirtyRef = useRef(true);
  const uncrowdedRef = useRef<Set<string>>(new Set());
  const dealsRef = useRef<Record<string, GraphFounderDeal>>({});
  const uncrowdedOnlyRef = useRef(false);
  const campusColorRef = useRef<Map<string, string>>(new Map());

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
        const campuses = new Map<string, string>();
        for (const node of payload.nodes) {
          if (node.campusId) campuses.set(node.campusId, node.campusLabel || node.campusId);
        }
        campusColorRef.current = assignFounderNetworkCampusColors(
          [...campuses.entries()].map(([id, label]) => ({ id, label }))
        );
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
      const rr = Math.max(c.labelR || 0, c.r * 0.7);
      minX = Math.min(minX, c.cx - rr);
      maxX = Math.max(maxX, c.cx + rr);
      minY = Math.min(minY, c.cy - rr);
      maxY = Math.max(maxY, c.cy + rr);
    }
    if (!Number.isFinite(minX)) return { minX: -200, maxX: 200, minY: -140, maxY: 140 };
    return { minX, maxX, minY, maxY };
  }, [graph]);

  const campusLegend = useMemo(() => {
    if (!graph) return [] as { id: string; label: string; color: string }[];
    const counts = new Map<string, { label: string; n: number }>();
    for (const node of graph.nodes) {
      if (node.type !== "founder" || !node.campusId) continue;
      const prev = counts.get(node.campusId) ?? { label: node.campusLabel || node.campusId, n: 0 };
      prev.n += 1;
      counts.set(node.campusId, prev);
    }
    const colors = campusColorRef.current;
    return [...counts.entries()]
      .sort((a, b) => b[1].n - a[1].n)
      .map(([id, row]) => ({ id, label: row.label, color: colors.get(id) || "#9aa3b2" }));
  }, [graph]);

  const fitView = useCallback(() => {
    // Target ~85% frame fill; chrome is off-canvas in the rail.
    const padX = Math.max(12, size.w * 0.05);
    const padY = Math.max(10, size.h * 0.04);
    const spanX = Math.max(1, bounds.maxX - bounds.minX);
    const spanY = Math.max(1, bounds.maxY - bounds.minY);
    const usableW = Math.max(120, size.w - padX * 2);
    const usableH = Math.max(120, size.h - padY * 2);
    const finalScale = Math.min(usableW / spanX, usableH / spanY, 2.8);
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    viewRef.current = {
      scale: finalScale,
      tx: size.w / 2 - cx * finalScale,
      ty: size.h / 2 - cy * finalScale - 10,
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
    const editorial = clamp(1 - (scale / fitScaleApprox(bounds, size) - 0.85) / 1.6, 0, 1);
    const glow = 1 - editorial;
    const t = timeRef.current;
    const clusters = g.clusters;
    const networks = g.nodes.filter((n) => n.type === "network");
    const colors = campusColorRef.current;

    // Soft ambient glow only (no flat filled disks).
    for (const cluster of clusters) {
      const c = worldToScreen(cluster.cx, cluster.cy);
      const r = cluster.r * scale;
      const drift = reduceMotionRef.current ? 0 : Math.sin(t * 0.0007 + cluster.rank) * 1.1 * glow;
      const cx = c.x + drift;
      const cy = c.y + Math.cos(t * 0.0005 + cluster.rank) * 1.0 * glow;
      if (glow > 0.05) {
        const isYc = cluster.id === "yc" && !ycExpandedRef.current;
        const core = isYc ? 0.035 : 0.07;
        const mid = isYc ? 0.016 : 0.035;
        const grd = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * (0.95 + glow * 0.2));
        grd.addColorStop(0, `rgba(90,110,160,${core * glow})`);
        grd.addColorStop(0.6, `rgba(90,110,160,${mid * glow})`);
        grd.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.ellipse(cx, cy, r * (1.05 + glow * 0.15), r * (0.88 + glow * 0.12), 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Thin translucent curved membership ties; cap fan density; keep founder→company paths on hub drill.
    const byId = byIdRef.current;
    const maxSpan = Math.min(size.w, size.h) * (0.72 + glow * 0.35);
    const ycOpen = ycExpandedRef.current;
    const focusNet = hoverNetRef.current || highlightNetRef.current;
    const EDGE_CAP_PER_HUB = 14;
    const hubEdgeShown = new Map<string, number>();
    ctx.lineCap = "round";
    for (const edge of g.edges) {
      const touchesFocus =
        !!focusNet &&
        (edge.source === `net:${focusNet}` ||
          edge.target === `net:${focusNet}` ||
          byId.get(edge.source)?.parentNetworkId === focusNet ||
          byId.get(edge.target)?.parentNetworkId === focusNet ||
          byId.get(edge.source)?.networkId === focusNet ||
          byId.get(edge.target)?.networkId === focusNet);
      // Founder→company paths: hidden at rest; keep visible when the hub is drilled/hovered.
      if (edge.type === "founder_company") {
        if (!touchesFocus) continue;
      } else if (edge.type === "network_tie" && editorial > 0.85 && hash01(edge.source + edge.target) > 0.7) {
        continue;
      }
      const touchesYc = edge.source === "net:yc" || edge.target === "net:yc";
      const isMembership = edge.type === "network_founder" || edge.type === "network_tie";
      // Collapsed YC: lighter fade + tiny sample; hover/expand reveals the rest.
      let ycBundlePreview = false;
      if (touchesYc && !ycOpen && isMembership && !touchesFocus) {
        if (hash01(`yc-bundle:${edge.source}:${edge.target}`) > 0.018) continue;
        ycBundlePreview = true;
      }
      // Cap visible membership edges per hub; overflow waits for hover on that hub.
      if (isMembership && !touchesFocus && !ycBundlePreview) {
        const hubId = edge.source.startsWith("net:") ? edge.source : edge.target.startsWith("net:") ? edge.target : null;
        if (hubId) {
          const n = hubEdgeShown.get(hubId) ?? 0;
          if (n >= EDGE_CAP_PER_HUB) continue;
          hubEdgeShown.set(hubId, n + 1);
        }
      }
      const a = byId.get(edge.source);
      const b = byId.get(edge.target);
      if (!a || !b) continue;
      const pa = worldToScreen(a.x, a.y);
      const pb = worldToScreen(b.x, b.y);
      const span = Math.hypot(pb.x - pa.x, pb.y - pa.y);
      if (span < 0.5) continue;
      // Membership spokes stay visible even when long; cross-graph spans fade, not vanish.
      if (!isMembership && span > maxSpan) continue;
      const mx = (pa.x + pb.x) / 2;
      const my = (pa.y + pb.y) / 2;
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      ctx.beginPath();
      if (ycBundlePreview) {
        // Route collapsed YC spokes through shared angular lanes so the hub is not a hairball.
        const hubPt = edge.source === "net:yc" ? pa : pb;
        const leafPt = edge.source === "net:yc" ? pb : pa;
        const ang = Math.atan2(leafPt.y - hubPt.y, leafPt.x - hubPt.x);
        const lanes = 8;
        const lane = Math.floor((((ang + Math.PI) / (Math.PI * 2)) * lanes) % lanes);
        const laneAng = -Math.PI + ((lane + 0.5) / lanes) * Math.PI * 2;
        const bx = hubPt.x + Math.cos(laneAng) * 42;
        const by = hubPt.y + Math.sin(laneAng) * 42;
        ctx.moveTo(leafPt.x, leafPt.y);
        ctx.quadraticCurveTo(bx, by, hubPt.x, hubPt.y);
      } else {
        const bend = edge.type === "cofounder" ? 0.18 : 0.12;
        ctx.moveTo(pa.x, pa.y);
        ctx.quadraticCurveTo(mx - dy * bend, my + dx * bend, pb.x, pb.y);
      }
      const campus = a.campusId || b.campusId;
      const ink = campus && colors.get(campus) ? colors.get(campus)! : "#64748b";
      let alpha = 0.18;
      if (edge.type === "cofounder") alpha = 0.32 * editorial + 0.26 * glow;
      else if (edge.type === "network_founder") alpha = 0.22 * editorial + 0.28 * glow;
      else if (edge.type === "network_tie") alpha = 0.14 * editorial + 0.18 * glow;
      else alpha = 0.1;
      if (ycBundlePreview) alpha = Math.min(alpha, 0.05) * 0.4;
      if (span > maxSpan * 0.85) alpha *= 0.6;
      if (edge.type === "founder_company" && touchesFocus) alpha = Math.max(alpha, 0.55);
      ctx.lineWidth = edge.type === "founder_company" && touchesFocus ? 1.35 : ycBundlePreview ? 0.35 : edge.type === "cofounder" ? 0.9 : 0.65;
      ctx.strokeStyle = hexAlpha(ink, Math.min(0.5, alpha));
      ctx.stroke();
    }

    // Founder + company dots (campus color on founders).
    const members = g.nodes.filter((n) => n.type === "company" || n.type === "founder");
    for (const node of members) {
      // Collapsed YC: keep a light sample of the cloud so the hub still reads as dense.
      if (!ycOpen && node.parentNetworkId === "yc" && !(focusNet === "yc") && hash01(node.id) > 0.12) continue;
      let x = node.x;
      let y = node.y;
      if (!reduceMotionRef.current && glow > 0.05) {
        const h = hash01(node.id);
        x += Math.sin(t * 0.0009 + h * 12) * 1.3 * glow;
        y += Math.cos(t * 0.0008 + h * 9) * 1.3 * glow;
      }
      const p = worldToScreen(x, y);
      const companyId =
        node.type === "company" ? node.companyId : node.type === "founder" ? dealsRef.current[node.founderId ?? ""]?.companyId ?? null : null;
      const isUncrowded = companyId ? uncrowdedRef.current.has(companyId) : false;
      const dim = uncrowdedOnlyRef.current && !isUncrowded;
      const r =
        node.type === "founder"
          ? Math.max(1.35, node.size * (0.55 + scale * 0.4))
          : Math.max(0.85, node.size * (0.42 + scale * 0.3));
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      if (node.type === "founder") {
        const ink = node.campusId && colors.get(node.campusId) ? colors.get(node.campusId)! : "#9aa3b2";
        ctx.fillStyle = hexAlpha(ink, dim ? 0.14 : 0.82);
      } else {
        ctx.fillStyle = `rgba(148,163,184,${dim ? 0.1 : 0.35 + 0.2 * editorial})`;
      }
      ctx.fill();
    }

    // Program / investor hubs: small anchors only (never a flat disk).
    for (const node of networks) {
      const p = worldToScreen(node.x, node.y);
      const r = Math.min(5.5, Math.max(2.4, 2.2 + Math.sqrt(Math.max(1, node.size)) * 0.55));
      const ink = HUB_INK[(node.kind as NetworkKind) || "program"] || "#6b7280";
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = hexAlpha(ink, 0.72 + 0.18 * editorial);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    if (viewDirtyRef.current) {
      const nextLabels = placeLabels(clusters, worldToScreen, scale, size.w, size.h, hoverNetRef.current);
      const sig = nextLabels.map((l) => `${l.id}:${l.x | 0},${l.y | 0}`).join("|");
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
      if (!reduceMotionRef.current) rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [draw]);

  useEffect(() => {
    if (reduceMotionRef.current) draw();
  }, [draw, size]);

  useEffect(() => {
    uncrowdedOnlyRef.current = uncrowdedOnly;
    highlightNetRef.current = highlightNet;
    if (highlightNet) {
      hoverNetRef.current = highlightNet;
    }
    viewDirtyRef.current = true;
    if (reduceMotionRef.current) draw();
  }, [uncrowdedOnly, highlightNet, draw]);

  const hitTest = useCallback(
    (sx: number, sy: number): GraphNode | GraphCluster | null => {
      const g = graphRef.current;
      if (!g) return null;
      const world = screenToWorld(sx, sy);
      const scale = viewRef.current.scale;
      if (scale > 1.05) {
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
        const g = graphRef.current;
        let sourceUrl: string | null = null;
        if (g) {
          const edge = g.edges.find((item) => (item.source === hit.id || item.target === hit.id) && item.sourceUrl);
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

  const insightTexts = useMemo(() => {
    return (graph?.clusters ?? [])
      .filter((c) => c.callout && c.rank <= 3)
      .sort((a, b) => a.rank - b.rank)
      .map((c) => ({ id: c.id, text: c.callout || "" }));
  }, [graph]);

  /** Desktop rail default: real featured founder or top pathway — never an empty hover stub. */
  const featuredDefault = useMemo(() => {
    if (!graph) return null;
    const deals = Object.values(graph.founderDeals ?? {});
    const scored = deals
      .filter((d) => d.companyName && d.networks.length > 0)
      .map((d) => {
        let score = d.networks.length;
        if (d.stage) score += 4;
        if (d.investors.length) score += 2;
        if (!d.hasTopFund) score += 3;
        return { d, score };
      })
      .sort((a, b) => b.score - a.score || a.d.founderName.localeCompare(b.d.founderName));
    if (scored[0]) {
      return { kind: "founder" as const, deal: scored[0].d };
    }
    const pathway = [...(graph.clusters ?? [])].sort((a, b) => a.rank - b.rank)[0];
    if (pathway) {
      return {
        kind: "pathway" as const,
        label: pathway.label,
        founders: pathway.totalFounders || pathway.founderCount || 0,
        companies: pathway.companyCount || 0,
        callout: pathway.callout,
      };
    }
    return null;
  }, [graph]);

  const pinHub = useCallback(
    (networkId: string) => {
      setHighlightNet(networkId);
      hoverNetRef.current = networkId;
      if (networkId === "yc") {
        setYcExpanded((open) => {
          const next = !open;
          ycExpandedRef.current = next;
          return next;
        });
      }
      viewDirtyRef.current = true;
      onSelectNetwork(networkId);
      if (reduceMotionRef.current) draw();
    },
    [draw, onSelectNetwork],
  );

  useEffect(() => {
    ycExpandedRef.current = ycExpanded;
    viewDirtyRef.current = true;
    if (reduceMotionRef.current) draw();
  }, [ycExpanded, draw]);

  if (error) {
    return <p className="px-4 py-8 text-sm text-[color:var(--fg-2)]">{error}</p>;
  }
  if (!graph) {
    return <p className="px-4 py-8 text-sm text-[color:var(--fg-2)]">Loading network graph...</p>;
  }

  const renderDealBody = (deal: GraphFounderDeal, opts?: { featured?: boolean }) => {
    const investors = (deal.investors ?? []).filter(Boolean);
    return (
      <>
        <div className="text-[color:var(--fg-2)]">
          {deal.companyName ?? "Company unknown"}
          {deal.stage ? ` · ${deal.stage}` : null}
        </div>
        <div className="mt-0.5 text-[10px] text-[color:var(--fg-3)]">
          Networks: {deal.networks.length ? deal.networks.join(", ") : "unknown"}
        </div>
        <div className="text-[10px] text-[color:var(--fg-3)]">
          {investors.length ? (
            <>
              Investors: {investors.join(", ")}
              {deal.hasTopFund ? " · top fund on file" : " · not yet backed by a top fund"}
            </>
          ) : (
            <>{deal.hasTopFund ? "Top fund on file" : "No named investors on file yet"}</>
          )}
        </div>
      </>
    );
  };

  const renderDetailCard = (mobile: boolean) => {
    const showingFeatured = !hover && featuredDefault?.kind === "founder";
    return (
      <div
        data-networks-detail=""
        {...(showingFeatured ? { "data-networks-featured": "" } : {})}
        className="rounded border border-[color:var(--line)] bg-white px-2.5 py-2 text-xs text-[color:var(--fg)]"
      >
        {hover ? (
          <>
            <div className="font-medium">{hover.deal?.founderName ?? hover.label}</div>
            {hover.deal ? (
              renderDealBody(hover.deal)
            ) : (
              <>
                <div className="text-[color:var(--fg-2)]">
                  {hover.ties.toLocaleString("en-US")} {hover.kind === "company" || hover.kind === "founder" ? "ties" : "founder links"}
                </div>
                {hover.shownOfTotal ? <div className="text-[color:var(--fg-3)]">{hover.shownOfTotal}</div> : null}
              </>
            )}
            {hover.sourceUrl ? (
              <a
                href={hover.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-[10px] font-medium text-[color:var(--cobalt)] hover:underline"
              >
                Source
              </a>
            ) : null}
          </>
        ) : featuredDefault?.kind === "founder" ? (
          <>
            <div className="mb-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-[color:var(--fg-3)]">
              Featured founder
            </div>
            <div className="font-medium">{featuredDefault.deal.founderName}</div>
            {renderDealBody(featuredDefault.deal, { featured: true })}
          </>
        ) : featuredDefault?.kind === "pathway" ? (
          <>
            <div className="mb-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-[color:var(--fg-3)]">Top pathway</div>
            <div className="font-medium">{featuredDefault.label}</div>
            <div className="text-[color:var(--fg-2)]">
              {featuredDefault.founders.toLocaleString("en-US")} founders · {featuredDefault.companies.toLocaleString("en-US")} companies
            </div>
            {featuredDefault.callout ? (
              <div className="mt-0.5 text-[10px] text-[color:var(--fg-3)]">{featuredDefault.callout}</div>
            ) : null}
          </>
        ) : (
          <div className="text-[color:var(--fg-3)]">Hover a founder or hub for deal detail.</div>
        )}
      </div>
    );
  };

  const chromeControls = (
    <div
      data-networks-legend=""
      className="flex flex-nowrap items-center gap-x-2.5 gap-y-1 overflow-x-auto whitespace-nowrap text-[10px] text-[color:var(--fg-2)]"
    >
      <span className="inline-flex shrink-0 items-center gap-1">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#4b5563]" /> Hub
      </span>
      <label className="inline-flex shrink-0 cursor-pointer items-center gap-1 text-[color:var(--fg)]">
        <input
          type="checkbox"
          className="accent-[color:var(--cobalt)]"
          checked={uncrowdedOnly}
          onChange={(event) => setUncrowdedOnly(event.target.checked)}
        />
        Uncrowded
      </label>
      <span className="shrink-0 tabular-nums text-[color:var(--fg-3)]">
        {(graph.uncrowdedCompanyIds?.length ?? 0).toLocaleString("en-US")} · scroll to zoom
      </span>
      <span className="shrink-0 text-[color:var(--fg-3)] sm:hidden">
        {!ycExpanded ? "YC collapsed" : "YC expanded"}
      </span>
    </div>
  );

  const railInvestorLimit = 6;
  const renderInvestorList = () => {
    const rows = railInvestorsOpen ? investorHubs : investorHubs.slice(0, railInvestorLimit);
    return (
      <div data-networks-investor-rail="">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[color:var(--fg-3)]">Investor hubs</div>
        {investorHubs.length === 0 ? (
          <p className="text-[11px] text-[color:var(--fg-3)]">No investor hubs on file.</p>
        ) : (
          <ol className="divide-y divide-[color:var(--line)] rounded border border-[color:var(--line)]">
            {rows.map((row, index) => {
              const active = highlightNet === row.id;
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-[11px] ${active ? "bg-[color:var(--cobalt-haze)]" : "hover:bg-[#f7f8fc]"}`}
                    onClick={() => pinHub(row.id)}
                  >
                    <span className="w-4 shrink-0 tabular-nums text-[color:var(--fg-3)]">{String(index + 1).padStart(2, "0")}</span>
                    <span className="min-w-0 flex-1 truncate font-medium text-[color:var(--fg)]">{row.label}</span>
                    <span className="shrink-0 tabular-nums text-[color:var(--fg-2)]">
                      {row.founderCount.toLocaleString("en-US")}
                    </span>
                  </button>
                </li>
              );
            })}
            {investorHubs.length > railInvestorLimit ? (
              <li>
                <button
                  type="button"
                  className="w-full px-2 py-1.5 text-left text-[11px] font-medium text-[color:var(--cobalt)]"
                  data-networks-investors-more=""
                  aria-expanded={railInvestorsOpen}
                  onClick={() => setRailInvestorsOpen((open) => !open)}
                >
                  {railInvestorsOpen
                    ? "Show fewer"
                    : `More (${(investorHubs.length - railInvestorLimit).toLocaleString("en-US")})`}
                </button>
              </li>
            ) : null}
          </ol>
        )}
      </div>
    );
  };

  const renderInsights = () =>
    insightTexts.length ? (
      <div data-networks-insights="" className="space-y-1">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 text-left"
          data-networks-insights-toggle=""
          aria-expanded={insightsOpen}
          onClick={() => setInsightsOpen((open) => !open)}
        >
          <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[color:var(--fg-3)]">Insights</span>
          <span className="text-[10px] font-medium text-[color:var(--cobalt)]">{insightsOpen ? "Hide" : "Show"}</span>
        </button>
        {insightsOpen ? (
          insightTexts.map((box) => (
            <div
              key={box.id}
              data-canvas-callout={box.id}
              className="rounded border border-[color:var(--line)] bg-white px-2 py-1.5 text-[11px] leading-snug text-[color:var(--fg-2)]"
            >
              {box.text}
            </div>
          ))
        ) : (
          <div
            data-canvas-callout={insightTexts[0].id}
            className="rounded border border-[color:var(--line)] bg-white px-2 py-1.5 text-[11px] leading-snug text-[color:var(--fg-2)]"
          >
            {insightTexts[0].text}
          </div>
        )}
      </div>
    ) : null;

  return (
    <div className="w-full" data-networks-desk="">
      {/* n3 right-rail desk: graph + side chrome in the first viewport. */}
      <div className="md:grid md:grid-cols-[minmax(0,1fr)_14rem] md:items-stretch">
        <div
          ref={wrapRef}
          className="relative h-[300px] w-full touch-manipulation overflow-hidden bg-white sm:h-[420px] md:h-[560px]"
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

          <svg className="pointer-events-none absolute inset-0 z-[1] h-full w-full" width={size.w} height={size.h} aria-hidden="true">
            {labels.map((label) => {
              const lx = label.x + label.w / 2;
              const ly = label.y + label.h / 2;
              return (
                <path
                  key={`lead-${label.id}`}
                  d={`M ${label.rimX} ${label.rimY} L ${lx} ${ly}`}
                  stroke="rgba(70,80,110,0.4)"
                  strokeWidth="0.7"
                  fill="none"
                />
              );
            })}
          </svg>

          {labels.map((label) => (
            <button
              key={label.id}
              type="button"
              data-canvas-label={label.id}
              className="absolute z-[1] box-border bg-transparent px-0.5 py-0 text-left text-[11px] font-semibold leading-snug"
              data-label-anchor-x={Math.round(label.rimX)}
              data-label-anchor-y={Math.round(label.rimY)}
              data-hub-x={Math.round(label.hubX)}
              data-hub-y={Math.round(label.hubY)}
              data-hub-r={Math.round(label.hubR)}
              style={{
                left: label.x,
                top: label.y,
                width: label.w,
                color: label.color,
                textShadow: "0 0 3px rgba(255,255,255,0.95), 0 1px 2px rgba(255,255,255,0.9)",
              }}
              onClick={(event) => {
                event.stopPropagation();
                pinHub(label.id);
              }}
            >
              <span className="block whitespace-normal break-words">{label.text}</span>
            </button>
          ))}

          {/* In-frame campus legend only — Uncrowded lives in the rail / mobile chrome below the map. */}
          <div
            data-networks-legend-frame=""
            className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] flex flex-wrap items-center gap-x-1.5 gap-y-0.5 bg-gradient-to-t from-white via-white/95 to-transparent px-2 pb-1.5 pt-5 text-[9px] text-[color:var(--fg-2)]"
          >
            {campusLegend.map((item) => (
              <span key={item.id} className="inline-flex items-center gap-1" data-legend-swatch={item.color} data-legend-campus={item.id}>
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: item.color }} />
                <span className="hidden max-w-[4.5rem] truncate sm:inline">{item.label}</span>
              </span>
            ))}
            <span className="inline-flex items-center gap-1" data-legend-swatch="#94a3b8" data-legend-kind="company">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#94a3b8]" />
              <span className="hidden sm:inline">Company</span>
            </span>
            <span className="inline-flex items-center gap-1" data-legend-swatch="#4b5563" data-legend-kind="hub">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#4b5563]" />
              <span className="hidden sm:inline">Hub</span>
            </span>
            <span className="ml-auto hidden text-[9px] text-[color:var(--fg-3)] sm:inline">
              {!ycExpanded ? "YC collapsed · click hub to expand" : "YC expanded · click hub to collapse"}
            </span>
          </div>
        </div>

        {/* Desktop side rail: featured, insights, ranked investors — in the first viewport beside the graph. */}
        <aside
          data-networks-rail=""
          className="hidden flex-col gap-3 border-l border-[color:var(--line)] bg-[#fafbfe] p-3 md:flex"
        >
          {renderDetailCard(false)}
          {renderInsights()}
          {renderInvestorList()}
          <div className="mt-auto border-t border-[color:var(--line)] pt-2">{chromeControls}</div>
        </aside>
      </div>

      {/* Mobile: Uncrowded control only under the graph — hubs/investors follow in the page fold. */}
      <div className="border-t border-[color:var(--line)] px-3 py-1.5 md:hidden" data-networks-mobile-chrome="">
        {chromeControls}
      </div>
    </div>
  );
}
