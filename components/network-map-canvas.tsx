"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MapEdge, MapEdgeType, MapGraph, MapNode, MapNodeType } from "@/lib/domain/network-map";
import { buildPersonLinkedInLookup } from "@/lib/domain/map-linkedin";
import type { LinkedInAction } from "@/lib/domain/person-link";
import { LinkedInMark } from "./person-link";

const FILL: Record<MapNodeType, string> = {
  person: "#5c516e",
  startup: "#5840a0",
  campus: "#9378ee",
  investor: "#2a2148",
  program: "#7d68c9",
};

const EDGE_STYLE: Record<MapEdgeType, { color: string; width: number; dash: number[] }> = {
  founded: { color: "#5840a0", width: 1.15, dash: [] },
  co_founder: { color: "#9378ee", width: 1, dash: [4, 3] },
  studied_at: { color: "#cfc9da", width: 0.7, dash: [] },
  invested_in: { color: "#1c1525", width: 1.2, dash: [6, 3] },
  member_of: { color: "#b8a4f0", width: 1, dash: [] },
  at_campus: { color: "#d9d5df", width: 0.8, dash: [2, 3] },
};

interface Camera {
  x: number;
  y: number;
  k: number;
}

export function NetworkMapCanvas({
  graph,
  hidden,
  edgeTypes,
  selected,
  flyToken,
  flyId,
  onSelect,
}: {
  graph: MapGraph;
  hidden: Set<string>;
  edgeTypes: Set<MapEdgeType>;
  selected: string | null;
  flyToken: number;
  flyId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const graphRef = useRef(graph);
  const hiddenRef = useRef(hidden);
  const edgesRef = useRef(edgeTypes);
  const selectedRef = useRef(selected);
  const onSelectRef = useRef(onSelect);
  graphRef.current = graph;
  hiddenRef.current = hidden;
  edgesRef.current = edgeTypes;
  selectedRef.current = selected;
  onSelectRef.current = onSelect;

  const positions = useRef(new Map<string, { x: number; y: number }>());
  const camera = useRef<Camera>({ x: 0, y: 0, k: 0.2 });
  const hover = useRef<string | null>(null);
  const alpha = useRef(new Map<string, number>());
  const fitted = useRef(false);
  const kick = useRef<() => void>(() => {});
  const linkedinFor = useMemo(() => buildPersonLinkedInLookup(graph), [graph]);
  const linkedinRef = useRef(linkedinFor);
  linkedinRef.current = linkedinFor;
  const [tip, setTip] = useState<{ x: number; y: number; name: string; school: string | null; status: LinkedInAction["status"] } | null>(null);

  useEffect(() => {
    const next = new Map<string, { x: number; y: number }>();
    for (const node of graph.nodes) {
      const prev = positions.current.get(node.id);
      next.set(node.id, prev ?? { x: node.x, y: node.y });
      if (!alpha.current.has(node.id)) alpha.current.set(node.id, 1);
    }
    positions.current = next;
  }, [graph]);

  useEffect(() => {
    if (!flyId) return;
    const at = positions.current.get(flyId);
    if (!at) return;
    const from = { ...camera.current };
    const to = { x: at.x, y: at.y, k: Math.max(camera.current.k, 2.6) };
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 520);
      const e = 1 - Math.pow(1 - t, 3);
      camera.current = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, k: from.k + (to.k - from.k) * e };
      kick.current();
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [flyToken, flyId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let running = true;
    let raf = 0;
    const drag = { mode: "none" as "none" | "pan" | "node" | "link", id: null as string | null, sx: 0, sy: 0, ox: 0, oy: 0, moved: false };
    let openedAt = 0;

    const neighbors = new Map<string, Set<string>>();
    for (const edge of graph.edges) {
      if (!neighbors.has(edge.source)) neighbors.set(edge.source, new Set());
      if (!neighbors.has(edge.target)) neighbors.set(edge.target, new Set());
      neighbors.get(edge.source)!.add(edge.target);
      neighbors.get(edge.target)!.add(edge.source);
    }

    const draw = () => {
      if (!running) return;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!fitted.current && width > 40 && height > 40) {
        camera.current = fitCamera(graphRef.current.nodes, width, height);
        fitted.current = true;
      }
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#fbfbfe";
      ctx.fillRect(0, 0, width, height);

      const cam = camera.current;
      const nodes = graphRef.current.nodes;
      const byId = new Map(nodes.map((node) => [node.id, node]));
      let moving = false;
      for (const node of nodes) {
        const target = hiddenRef.current.has(node.id) ? 0 : 1;
        const current = alpha.current.get(node.id) ?? 1;
        const next = current + (target - current) * 0.22;
        const settled = Math.abs(next - target) < 0.02 ? target : next;
        if (settled !== target) moving = true;
        alpha.current.set(node.id, settled);
      }

      const active = drag.mode === "node" ? drag.id : hover.current ?? selectedRef.current;
      const near = active ? neighbors.get(active) : null;

      const project = (x: number, y: number) => ({
        x: (x - cam.x) * cam.k + width / 2,
        y: (y - cam.y) * cam.k + height / 2,
      });

      const groups = new Map<MapEdgeType, MapEdge[]>();
      for (const edge of graphRef.current.edges) {
        if (!edgesRef.current.has(edge.type)) continue;
        const list = groups.get(edge.type) ?? [];
        list.push(edge);
        groups.set(edge.type, list);
      }

      const drawEdges = (dim: boolean) => {
        for (const [type, list] of groups) {
          const style = EDGE_STYLE[type];
          ctx.beginPath();
          ctx.setLineDash(style.dash);
          ctx.lineWidth = style.width;
          ctx.strokeStyle = style.color;
          let any = false;
          for (const edge of list) {
            const a = alpha.current.get(edge.source) ?? 0;
            const b = alpha.current.get(edge.target) ?? 0;
            if (a < 0.08 || b < 0.08) continue;
            const inNeighborhood = active != null && (edge.source === active || edge.target === active);
            if (dim !== inNeighborhood) continue;
            const ps = positions.current.get(edge.source);
            const pt = positions.current.get(edge.target);
            if (!ps || !pt) continue;
            const s = project(ps.x, ps.y);
            const t = project(pt.x, pt.y);
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(t.x, t.y);
            any = true;
          }
          if (!any) continue;
          ctx.globalAlpha = !active ? (type === "studied_at" ? 0.4 : 0.72) : dim ? 0.95 : 0.05;
          ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      };
      drawEdges(false);
      if (active) drawEdges(true);

      const labels: { node: MapNode; sx: number; sy: number; sr: number }[] = [];
      for (const node of nodes) {
        const fade = alpha.current.get(node.id) ?? 0;
        if (fade < 0.04) continue;
        const at = positions.current.get(node.id);
        if (!at) continue;
        const p = project(at.x, at.y);
        const sr = Math.max(node.type === "person" ? 1.3 : 2.2, node.r * cam.k);
        if (p.x < -40 || p.y < -40 || p.x > width + 40 || p.y > height + 40) continue;
        const lit = !active || node.id === active || near?.has(node.id);
        ctx.globalAlpha = fade * (lit ? 1 : 0.12);
        ctx.fillStyle = node.id === selectedRef.current ? "#1c1525" : FILL[node.type];
        drawShape(ctx, node.type, p.x, p.y, sr);
        if (node.id === hover.current || node.id === selectedRef.current) {
          ctx.strokeStyle = "#1c1525";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        labels.push({ node, sx: p.x, sy: p.y, sr });
      }
      ctx.globalAlpha = 1;

      ctx.font = "500 11px Satoshi, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const labeled = labels
        .filter(({ node, sr }) => {
          if (node.id === hover.current || node.id === selectedRef.current) return true;
          if (node.type === "campus") return cam.k > 0.12;
          if (node.type === "investor") return cam.k > 0.28 || sr > 10;
          if (node.type === "program") return cam.k > 0.55;
          if (node.type === "startup") return cam.k > 0.85 || sr > 9;
          return cam.k > 1.45 || sr > 8;
        })
        .sort((a, b) => b.sr - a.sr)
        .slice(0, 90);
      for (const item of labeled) {
        const fade = alpha.current.get(item.node.id) ?? 0;
        ctx.globalAlpha = fade;
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#fbfbfe";
        ctx.strokeText(item.node.label, item.sx, item.sy + item.sr + 2);
        ctx.fillStyle = "#1c1525";
        ctx.fillText(item.node.label, item.sx, item.sy + item.sr + 2);
      }
      ctx.globalAlpha = 1;

      if (moving || drag.mode !== "none") raf = requestAnimationFrame(draw);
      else raf = 0;
    };

    const ensure = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };
    kick.current = ensure;
    ensure();

    const hit = (sx: number, sy: number): MapNode | null => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const cam = camera.current;
      const worldX = (sx - width / 2) / cam.k + cam.x;
      const worldY = (sy - height / 2) / cam.k + cam.y;
      let best: MapNode | null = null;
      let bestDist = Infinity;
      const slop = 8 / cam.k;
      for (const node of graphRef.current.nodes) {
        if ((alpha.current.get(node.id) ?? 0) < 0.5) continue;
        const at = positions.current.get(node.id);
        if (!at) continue;
        const dist = Math.hypot(at.x - worldX, at.y - worldY);
        if (dist <= node.r + slop && dist < bestDist) {
          best = node;
          bestDist = dist;
        }
      }
      return best;
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;
      const cam = camera.current;
      const world = { x: (sx - rect.width / 2) / cam.k + cam.x, y: (sy - rect.height / 2) / cam.k + cam.y };
      const nextK = Math.min(4.5, Math.max(0.08, cam.k * (event.deltaY > 0 ? 0.9 : 1.11)));
      camera.current = { k: nextK, x: world.x - (sx - rect.width / 2) / nextK, y: world.y - (sy - rect.height / 2) / nextK };
      ensure();
    };
    const onDown = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;
      const node = hit(sx, sy);
      drag.sx = sx;
      drag.sy = sy;
      drag.moved = false;
      setTip(null);
      if (node?.type === "person" && (event.metaKey || event.ctrlKey)) {
        drag.mode = "link";
        drag.id = node.id;
        event.preventDefault();
        canvas.setPointerCapture(event.pointerId);
        return;
      }
      if (node) {
        const at = positions.current.get(node.id)!;
        drag.mode = "node";
        drag.id = node.id;
        drag.ox = at.x;
        drag.oy = at.y;
      } else {
        drag.mode = "pan";
        drag.id = null;
        drag.ox = camera.current.x;
        drag.oy = camera.current.y;
      }
      canvas.setPointerCapture(event.pointerId);
      ensure();
    };
    const onMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;
      if (drag.mode === "pan") {
        if (Math.hypot(sx - drag.sx, sy - drag.sy) <= 4) return;
        drag.moved = true;
        camera.current = {
          ...camera.current,
          x: drag.ox - (sx - drag.sx) / camera.current.k,
          y: drag.oy - (sy - drag.sy) / camera.current.k,
        };
        ensure();
        return;
      }
      if (drag.mode === "link") {
        drag.moved = Math.hypot(sx - drag.sx, sy - drag.sy) > 4;
        return;
      }
      if (drag.mode === "node" && drag.id) {
        const dist = Math.hypot(sx - drag.sx, sy - drag.sy);
        if (dist <= 4) return;
        drag.moved = true;
        const at = positions.current.get(drag.id);
        if (at) {
          at.x = drag.ox + (sx - drag.sx) / camera.current.k;
          at.y = drag.oy + (sy - drag.sy) / camera.current.k;
        }
        ensure();
        return;
      }
      const node = hit(sx, sy);
      const next = node?.id ?? null;
      if (next !== hover.current) {
        hover.current = next;
        canvas.style.cursor = next ? "pointer" : "grab";
        if (node?.type === "person") {
          const ids = node.campuses?.length ? node.campuses : node.campus ? [node.campus] : [];
          const labels = new Map(graphRef.current.nodes.map((item) => [item.id, item.label]));
          const school = ids.map((id) => labels.get(id)).filter((item): item is string => !!item).join(" · ");
          setTip({ x: sx, y: sy, name: node.label, school: school || null, status: linkedinRef.current(node).status });
        } else {
          setTip(null);
        }
        ensure();
      }
    };
    const openLinkedIn = (node: MapNode) => {
      if (node.type !== "person") return;
      const now = performance.now();
      if (now - openedAt < 500) return;
      openedAt = now;
      const action = linkedinRef.current(node);
      window.open(action.url, "_blank", "noopener,noreferrer");
    };
    const onUp = () => {
      if (drag.id && !drag.moved && (drag.mode === "node" || drag.mode === "link")) {
        if (drag.mode === "link") {
          const node = graphRef.current.nodes.find((item) => item.id === drag.id);
          if (node) openLinkedIn(node);
        }
        onSelectRef.current(drag.id);
      } else if (drag.mode === "pan" && !drag.moved) onSelectRef.current(null);
      drag.mode = "none";
      drag.id = null;
      ensure();
    };
    const onDblClick = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const node = hit(event.clientX - rect.left, event.clientY - rect.top);
      if (!node || node.type !== "person") return;
      event.preventDefault();
      openLinkedIn(node);
      onSelectRef.current(node.id);
    };
    const onContext = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const node = hit(event.clientX - rect.left, event.clientY - rect.top);
      if (!node || node.type !== "person") return;
      event.preventDefault();
      openLinkedIn(node);
      onSelectRef.current(node.id);
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("dblclick", onDblClick);
    canvas.addEventListener("contextmenu", onContext);
    const observer = new ResizeObserver(() => ensure());
    observer.observe(canvas);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      kick.current = () => {};
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("dblclick", onDblClick);
      canvas.removeEventListener("contextmenu", onContext);
      observer.disconnect();
    };
  }, [graph]);

  useEffect(() => {
    kick.current();
  }, [hidden, edgeTypes, selected, flyToken]);

  return (
    <div className="absolute inset-0">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" aria-label="Founder and startup network map" />
      {tip && (
        <div
          className="pointer-events-none absolute z-10 max-w-56 rounded-md border border-border-c bg-white px-2 py-1.5 text-xs shadow-sm"
          style={{ left: Math.min(tip.x + 14, (canvasRef.current?.clientWidth ?? 320) - 180), top: tip.y + 16 }}
        >
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-foreground">{tip.name}</span>
            <LinkedInMark status={tip.status} />
          </div>
          {tip.school && <div className="mt-0.5 text-muted">{tip.school}</div>}
        </div>
      )}
    </div>
  );
}

function fitCamera(nodes: MapNode[], width: number, height: number): Camera {
  if (!nodes.length) return { x: 0, y: 0, k: 0.2 };
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
  const k = Math.min(width / (maxX - minX + 160), height / (maxY - minY + 160));
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, k: Math.max(0.08, Math.min(1, k)) };
}

function drawShape(ctx: CanvasRenderingContext2D, type: MapNodeType, x: number, y: number, r: number) {
  ctx.beginPath();
  if (type === "person") {
    ctx.arc(x, y, r, 0, Math.PI * 2);
  } else if (type === "startup") {
    roundRect(ctx, x - r, y - r, r * 2, r * 2, Math.min(3, r * 0.4));
  } else if (type === "campus") {
    roundRect(ctx, x - r, y - r * 0.72, r * 2, r * 1.44, 4);
  } else if (type === "investor") {
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
  } else {
    const a = (Math.PI * 2) / 6;
    for (let i = 0; i < 6; i++) {
      const px = x + Math.cos(a * i - Math.PI / 2) * r;
      const py = y + Math.sin(a * i - Math.PI / 2) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
  ctx.fill();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
