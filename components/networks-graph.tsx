"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { assignFounderNetworkCampusColors, readableInk } from "@/components/network-style";
import type { GraphCluster, GraphFounderDeal, GraphNode, GraphPayload, NetworkKind } from "@/lib/domain/founder-networks-model";

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
  const maxLabels = viewW < 600 ? 6 : viewW < 900 ? 12 : ranked.length;
  const candidates = ranked.filter((c) => c.rank <= maxLabels || c.id === hoverId);
  const legendH = 52;
  const topPad = 8;
  const bottomLimit = viewH - legendH - 6;
  const placed: LabelBox[] = [];

  const hubs: HubScreen[] = candidates.map((cluster) => {
    const center = toScreen(cluster.cx, cluster.cy);
    const cloudR = Math.max(8, (cluster.labelR ?? cluster.r * 0.72) * scale);
    return { id: cluster.id, x: center.x, y: center.y, r: cloudR };
  });

  const insideOtherHub = (midX: number, midY: number, selfId: string) => {
    for (const hub of hubs) {
      if (hub.id === selfId) continue;
      // Keep labels out of foreign cluster disks (Velocity off NYU, YC off Thiel/Neo).
      if (Math.hypot(midX - hub.x, midY - hub.y) < hub.r * 0.92) return true;
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
    const text = cluster.label;
    const fontPx = 11;
    const maxW = Math.min(170, Math.max(88, Math.min(viewW * 0.16, text.length > 22 ? 160 : 130)));
    const { w, h } = wrapLabelMetrics(text, maxW, fontPx);
    const baseAng = Math.atan2(center.y - viewH / 2, center.x - viewW / 2);
    // Prefer angles that stay clear of neighboring hubs.
    const angleScores: { ang: number; score: number }[] = [];
    for (let k = 0; k < 24; k++) {
      const sign = k % 2 === 0 ? 1 : -1;
      const step = Math.floor(k / 2) * 0.26;
      const ang = baseAng + sign * step;
      const probeX = center.x + Math.cos(ang) * (anchorR + 20);
      const probeY = center.y + Math.sin(ang) * (anchorR + 20);
      let nearest = Infinity;
      for (const hub of hubs) {
        if (hub.id === cluster.id) continue;
        nearest = Math.min(nearest, Math.hypot(probeX - hub.x, probeY - hub.y) - hub.r);
      }
      angleScores.push({ ang, score: nearest });
    }
    angleScores.sort((a, b) => b.score - a.score);
    const offsets = angleScores.map((row) => row.ang);

    let chosen: LabelBox | null = null;
    let bestScore = -1e9;
    for (const ang of offsets) {
      for (const gap of [8, 12, 18, 26, 34]) {
        const rimX = center.x + Math.cos(ang) * anchorR;
        const rimY = center.y + Math.sin(ang) * anchorR;
        const lx = rimX + Math.cos(ang) * gap;
        const ly = rimY + Math.sin(ang) * (gap * 0.8);
        const x = clamp(lx - w / 2, 4, viewW - w - 4);
        const y = clamp(ly - h / 2, topPad, bottomLimit - h);
        const box: LabelBox = { id: cluster.id, text, x, y, w, h, rimX, rimY, color: "#374151", hubX, hubY, hubR };
        const midX = x + w / 2;
        const midY = y + h / 2;
        // Anchor + label must stay on this hub's disk.
        if (Math.hypot(rimX - center.x, rimY - center.y) > cloudR * 1.02) continue;
        if (Math.hypot(midX - center.x, midY - center.y) > cloudR + 36) continue;
        if (Math.hypot(midX - rimX, midY - rimY) > 58) continue;
        if (insideOtherHub(midX, midY, cluster.id)) continue;
        if (insideOtherHub(rimX, rimY, cluster.id)) continue;
        if (placed.some((other) => boxesHit(box, other, 5))) continue;
        const clear = Math.min(
          ...hubs.filter((hub) => hub.id !== cluster.id).map((hub) => Math.hypot(midX - hub.x, midY - hub.y) - hub.r)
        );
        const score = clear + (gap < 20 ? 8 : 0);
        if (score > bestScore) {
          bestScore = score;
          chosen = box;
        }
      }
      if (chosen && bestScore > 12) break;
    }
    if (!chosen) {
      // Fallback: park beside hub along free angle, still inside own disk.
      for (const ang of offsets) {
        const rimX = center.x + Math.cos(ang) * anchorR;
        const rimY = center.y + Math.sin(ang) * anchorR;
        const x = clamp(rimX + Math.cos(ang) * 14 - w / 2, 4, viewW - w - 4);
        let y = clamp(rimY - h / 2, topPad, bottomLimit - h);
        for (let nudge = 0; nudge < 16; nudge++) {
          const box: LabelBox = { id: cluster.id, text, x, y, w, h, rimX, rimY, color: "#374151", hubX, hubY, hubR };
          const midX = x + w / 2;
          const midY = y + h / 2;
          if (
            Math.hypot(midX - center.x, midY - center.y) <= cloudR + 40 &&
            !insideOtherHub(midX, midY, cluster.id) &&
            !placed.some((other) => boxesHit(box, other, 5))
          ) {
            chosen = box;
            break;
          }
          y = clamp(y + 11, topPad, bottomLimit - h);
        }
        if (chosen) break;
      }
    }
    if (!chosen) {
      const rimX = center.x + anchorR;
      const rimY = center.y;
      chosen = {
        id: cluster.id,
        text,
        x: clamp(center.x + anchorR + 10 - w / 2, 4, viewW - w - 4),
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
  const legendH = 52;
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
  const [labels, setLabels] = useState<LabelBox[]>([]);
  const [callouts, setCallouts] = useState<CalloutBox[]>([]);
  const [uncrowdedOnly, setUncrowdedOnly] = useState(false);
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
      .slice(0, 8)
      .map(([id, row]) => ({ id, label: row.label, color: colors.get(id) || "#9aa3b2" }));
  }, [graph]);

  const fitView = useCallback(() => {
    // Target ~85% frame fill (Nature-poster density); leave room for legend + callouts.
    const padX = Math.max(12, size.w * 0.05);
    const padY = Math.max(10, size.h * 0.045);
    const legendH = 48;
    const spanX = Math.max(1, bounds.maxX - bounds.minX);
    const spanY = Math.max(1, bounds.maxY - bounds.minY);
    const usableW = Math.max(120, size.w - padX * 2);
    const usableH = Math.max(120, size.h - padY * 2 - legendH * 0.25);
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
        const grd = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * (0.95 + glow * 0.2));
        grd.addColorStop(0, `rgba(90,110,160,${0.07 * glow})`);
        grd.addColorStop(0.6, `rgba(90,110,160,${0.035 * glow})`);
        grd.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.ellipse(cx, cy, r * (1.05 + glow * 0.15), r * (0.88 + glow * 0.12), 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Thin translucent curved membership ties for every cluster; cofounders a touch stronger.
    const byId = byIdRef.current;
    const maxSpan = Math.min(size.w, size.h) * (0.72 + glow * 0.35);
    ctx.lineCap = "round";
    for (const edge of g.edges) {
      if (edge.type === "founder_company" && editorial > 0.55) continue;
      // Keep most network_tie hairlines; thin randomly only when very zoomed out.
      if (edge.type === "network_tie" && editorial > 0.85 && hash01(edge.source + edge.target) > 0.7) continue;
      const a = byId.get(edge.source);
      const b = byId.get(edge.target);
      if (!a || !b) continue;
      const pa = worldToScreen(a.x, a.y);
      const pb = worldToScreen(b.x, b.y);
      const span = Math.hypot(pb.x - pa.x, pb.y - pa.y);
      if (span < 0.5) continue;
      // Membership spokes stay visible even when long; cross-graph spans fade, not vanish.
      const isMembership = edge.type === "network_founder" || edge.type === "network_tie";
      if (!isMembership && span > maxSpan) continue;
      const mx = (pa.x + pb.x) / 2;
      const my = (pa.y + pb.y) / 2;
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const bend = edge.type === "cofounder" ? 0.18 : 0.12;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.quadraticCurveTo(mx - dy * bend, my + dx * bend, pb.x, pb.y);
      const campus = a.campusId || b.campusId;
      const ink = campus && colors.get(campus) ? colors.get(campus)! : "#64748b";
      let alpha = 0.18;
      if (edge.type === "cofounder") alpha = 0.32 * editorial + 0.26 * glow;
      else if (edge.type === "network_founder") alpha = 0.22 * editorial + 0.28 * glow;
      else if (edge.type === "network_tie") alpha = 0.14 * editorial + 0.18 * glow;
      else alpha = 0.1;
      if (span > maxSpan * 0.85) alpha *= 0.6;
      ctx.lineWidth = edge.type === "cofounder" ? 0.9 : 0.65;
      ctx.strokeStyle = hexAlpha(ink, Math.min(0.5, alpha));
      ctx.stroke();
    }

    // Founder + company dots (campus color on founders).
    const members = g.nodes.filter((n) => n.type === "company" || n.type === "founder");
    for (const node of members) {
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
      const nextCallouts = placeCallouts(clusters, nextLabels, size.w, size.h);
      const sig = `${nextLabels.map((l) => `${l.id}:${l.x|0},${l.y|0}`).join("|")}#${nextCallouts.map((c) => `${c.id}:${c.x|0}`).join("|")}`;
      if (sig !== labelsSigRef.current) {
        labelsSigRef.current = sig;
        setLabels(nextLabels);
        setCallouts(nextCallouts);
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
    viewDirtyRef.current = true;
    if (reduceMotionRef.current) draw();
  }, [uncrowdedOnly, draw]);

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
            onSelectNetwork(label.id);
          }}
        >
          <span className="block whitespace-normal break-words">{label.text}</span>
        </button>
      ))}

      {callouts.map((box) => (
        <div
          key={`insight-${box.id}`}
          data-canvas-callout={box.id}
          className="pointer-events-none absolute z-[2] rounded border border-[color:var(--line)] bg-white/95 px-2 py-1.5 text-[10px] leading-snug text-[color:var(--fg-2)] shadow-sm"
          style={{ left: box.x, top: box.y, width: box.w, minHeight: box.h }}
        >
          {box.text}
        </div>
      ))}

      {hover ? (
        <div className="pointer-events-none absolute left-3 top-3 z-[3] max-w-[300px] rounded border border-[color:var(--line)] bg-white px-2.5 py-1.5 text-xs text-[color:var(--fg)] shadow-sm">
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
          {hover.sourceUrl ? <div className="mt-0.5 truncate text-[10px] text-[color:var(--cobalt)]">{hover.sourceUrl}</div> : null}
        </div>
      ) : null}

      <div className="absolute bottom-3 left-3 right-3 z-[2] flex flex-wrap items-center gap-2 rounded border border-[color:var(--line)] bg-white/95 px-3 py-2 text-[11px] text-[color:var(--fg-2)]">
        {campusLegend.map((item) => (
          <span key={item.id} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
            <span style={{ color: readableInk(item.color) }}>{item.label}</span>
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-[#4b5563]" /> Hub
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
        <span className="ml-auto max-w-[22rem] text-right tabular-nums">
          {(graph.uncrowdedCompanyIds?.length ?? 0).toLocaleString("en-US")} uncrowded · scroll to zoom
        </span>
      </div>
    </div>
  );
}
