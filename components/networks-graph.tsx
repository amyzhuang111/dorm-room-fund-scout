"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

type PosterCampus = { id: string; label: string; color: string; n: number };
type PosterHub = { id: string; label: string; kind: string; i: number; founders: number };
type PosterCallout = { text: string; ax: number; ay: number; lx: number; ly: number; side: string };
type Poster = {
  v: number;
  w: number;
  h: number;
  totals: {
    founders: number;
    companies: number;
    links: number;
    companyTotal: number;
    corpusCompanies: number;
    founderLinks: number;
    networks: number;
    foundersLinked: number;
  };
  campuses: PosterCampus[];
  hubs: PosterHub[];
  x: number[];
  y: number[];
  r: number[];
  kind: number[];
  campus: number[];
  deg: number[];
  e0: number[];
  e1: number[];
  ek: number[];
  callouts: PosterCallout[];
  insights: string[];
  featuredId: string | null;
  investorHubs: { id: string; label: string; founders: number; companies: number }[];
  foIds: string[];
  coIds: string[];
};

type Deal = {
  founderName: string;
  companyName: string | null;
  companyId: string | null;
  stage: string | null;
  networks: string[];
  investors: string[];
  hasTopFund: boolean;
};

type HoverState = {
  index: number;
  kind: number;
  label: string;
  deal?: Deal | null;
  hub?: PosterHub;
};

type Props = {
  investorHubs?: { id: string; label: string; founderCount: number; companyCount?: number }[];
  onSelectCompany?: (id: string) => void;
  onSelectNetwork?: (id: string) => void;
};

const YC_EDGE_CAP = 0.06; // at rest, draw only a thin YC sample; full on hover/select

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

function curvedPath(x1: number, y1: number, x2: number, y2: number): { cx: number; cy: number } {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const bend = Math.min(28, len * 0.18);
  return { cx: mx - (dy / len) * bend, cy: my + (dx / len) * bend };
}

export function NetworksGraph({ investorHubs: investorHubsProp, onSelectCompany, onSelectNetwork }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [poster, setPoster] = useState<Poster | null>(null);
  const [deals, setDeals] = useState<Record<string, Deal>>({});
  const [size, setSize] = useState({ w: 1200, h: 640 });
  const [hover, setHover] = useState<HoverState | null>(null);
  const [selectedHub, setSelectedHub] = useState<string | null>(null);
  const [legendOtherOpen, setLegendOtherOpen] = useState(false);
  const camRef = useRef({ x: 0, y: 0, scale: 1 });
  const dragRef = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const hoverRef = useRef<HoverState | null>(null);
  const selectedRef = useRef<string | null>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/data/founder-networks-poster.json")
      .then((r) => r.json())
      .then((data: Poster) => {
        if (!cancelled) setPoster(data);
      })
      .catch(() => {});
    fetch("/data/founder-networks-deals.json")
      .then((r) => r.json())
      .then((data: { deals?: Record<string, Deal> }) => {
        if (!cancelled) setDeals(data.deals ?? {});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      setSize({ w: Math.max(280, Math.floor(rect.width)), h: Math.max(280, Math.floor(rect.height)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    hoverRef.current = hover;
  }, [hover]);
  useEffect(() => {
    selectedRef.current = selectedHub;
  }, [selectedHub]);

  const founderCount = poster?.foIds.length ?? 0;

  const worldToScreen = useCallback(
    (wx: number, wy: number) => {
      if (!poster) return { x: 0, y: 0 };
      const cam = camRef.current;
      const fit = Math.min(size.w / poster.w, size.h / poster.h);
      const s = fit * cam.scale;
      const ox = (size.w - poster.w * fit) / 2 + cam.x;
      const oy = (size.h - poster.h * fit) / 2 + cam.y;
      return { x: wx * s + ox + (poster.w * (fit - s)) / 2, y: wy * s + oy + (poster.h * (fit - s)) / 2, s };
    },
    [poster, size],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const p = poster;
    if (!canvas || !p) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = size.w;
    const h = size.h;
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);

    const cam = camRef.current;
    const fit = Math.min(w / p.w, h / p.h);
    const s = fit * cam.scale;
    const ox = (w - p.w * fit) / 2 + cam.x + (p.w * (fit - s)) / 2;
    const oy = (h - p.h * fit) / 2 + cam.y + (p.h * (fit - s)) / 2;
    const toS = (wx: number, wy: number) => ({ x: wx * s + ox, y: wy * s + oy });

    const sel = selectedRef.current;
    const hv = hoverRef.current;
    const focusHub = sel || (hv?.hub?.id ?? null);
    const focusNode = hv?.index ?? -1;
    const glow = cam.scale > 1.15 || !!focusHub || focusNode >= 0;

    // Edges — tinted haze between clusters (Nature-style)
    ctx.lineCap = "round";
    const nE = p.e0.length;
    const memberFos = new Set<number>();
    if (focusHub) {
      const hub = p.hubs.find((h) => h.id === focusHub);
      if (hub) {
        for (let i = 0; i < nE; i++) {
          if (p.ek[i] !== 1) continue;
          const a = p.e0[i];
          const b = p.e1[i];
          if (a === hub.i) memberFos.add(b);
          if (b === hub.i) memberFos.add(a);
        }
      }
    }
    for (let i = 0; i < nE; i++) {
      const a = p.e0[i];
      const b = p.e1[i];
      const k = p.ek[i];
      const hubA = p.kind[a] === 2;
      const hubB = p.kind[b] === 2;
      const hubIdx = hubA ? a : hubB ? b : -1;
      const hubId = hubIdx >= 0 ? p.hubs.find((h) => h.i === hubIdx)?.id : null;

      // YC at rest: fade hard + subsample; full on hover/select
      if (hubId === "yc" && !focusHub) {
        if (hash01(`yc:${a}:${b}`) > YC_EDGE_CAP) continue;
      } else if (hubId === "yc" && focusHub && focusHub !== "yc") {
        continue;
      }
      if (focusHub && hubId && hubId !== focusHub && k === 1) continue;

      const pa = toS(p.x[a], p.y[a]);
      const pb = toS(p.x[b], p.y[b]);
      const { cx, cy } = curvedPath(pa.x, pa.y, pb.x, pb.y);

      let color = "#94a3b8";
      const campI = p.campus[p.kind[a] === 0 ? a : p.kind[b] === 0 ? b : a];
      if (campI >= 0 && p.campuses[campI]) color = p.campuses[campI].color;
      const rgb = hexToRgb(color);

      let alpha = k === 2 ? 0.12 : k === 1 ? 0.08 : 0.13;
      let lineW = k === 2 ? 1.05 : 0.9;
      if (hubId === "yc" && !focusHub) {
        alpha = 0.05;
        lineW = 0.55;
      }
      if (hubId && focusHub === hubId) {
        alpha = 0.32;
        lineW = 1.15;
        ctx.strokeStyle = "rgba(15,23,42,0.38)";
      } else if (focusHub && k === 0) {
        const fo = p.kind[a] === 0 ? a : p.kind[b] === 0 ? b : -1;
        if (fo >= 0 && memberFos.has(fo)) {
          alpha = 0.28;
          lineW = 1.1;
          ctx.strokeStyle = "rgba(37,99,235,0.32)";
        } else if (fo >= 0) {
          alpha = 0.04;
          ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
        } else {
          ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${glow ? Math.min(0.2, alpha * 1.25) : alpha})`;
        }
      } else {
        ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${glow ? Math.min(0.2, alpha * 1.25) : alpha})`;
      }
      ctx.lineWidth = lineW;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.quadraticCurveTo(cx, cy, pb.x, pb.y);
      ctx.stroke();
    }

    // Nodes — saturated campus bubbles with thin white stroke; hubs dark like Industry
    for (let i = 0; i < p.x.length; i++) {
      const pt = toS(p.x[i], p.y[i]);
      // world r is already ~3–14px; scale with fit so 1440 matches target
      const radius = Math.max(2.2, p.r[i] * s);
      if (pt.x < -24 || pt.y < -24 || pt.x > w + 24 || pt.y > h + 24) continue;
      if (p.kind[i] === 2) {
        ctx.beginPath();
        ctx.fillStyle = "#0f172a";
        ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 1;
        ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      const ci = p.campus[i];
      const col = ci >= 0 && p.campuses[ci] ? p.campuses[ci].color : "#94a3b8";
      const rgb = hexToRgb(col);
      const isFo = p.kind[i] === 0;
      const alpha = isFo ? 0.92 : 0.85;
      ctx.beginPath();
      ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
      ctx.arc(pt.x, pt.y, radius * (isFo ? 1 : 0.92), 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.lineWidth = Math.max(0.6, Math.min(1.2, radius * 0.12));
      ctx.arc(pt.x, pt.y, radius * (isFo ? 1 : 0.92), 0, Math.PI * 2);
      ctx.stroke();
    }

    // Inline bold hub labels (Nature Industry style: IBM / Pfizer / Merck)
    ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const hubLabelSeen = new Set<string>();
    for (const hub of p.hubs) {
      if (hubLabelSeen.has(hub.id)) continue;
      hubLabelSeen.add(hub.id);
      const i = hub.i;
      const pt = toS(p.x[i], p.y[i]);
      const radius = Math.max(2.2, p.r[i] * s);
      const short =
        hub.label.length > 22
          ? hub.label.replace(/Y Combinator/i, "YC").replace(/Penn Venture Lab\s+/i, "").slice(0, 20)
          : hub.label;
      const tx = pt.x + radius + 4;
      const ty = pt.y;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillRect(tx - 2, ty - 7, Math.min(150, short.length * 6.2 + 6), 14);
      ctx.fillStyle = "#0f172a";
      ctx.fillText(short, tx, ty);
    }

    // Soft glow on hovered node
    if (focusNode >= 0) {
      const pt = toS(p.x[focusNode], p.y[focusNode]);
      const radius = Math.max(2.5, p.r[focusNode] * s);
      ctx.beginPath();
      ctx.fillStyle = "rgba(37,99,235,0.16)";
      ctx.arc(pt.x, pt.y, radius * 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = "#1d4ed8";
      ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }, [poster, size]);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(draw);
  }, [draw, hover, selectedHub]);

  const hitTest = useCallback(
    (sx: number, sy: number): number => {
      if (!poster) return -1;
      const cam = camRef.current;
      const fit = Math.min(size.w / poster.w, size.h / poster.h);
      const s = fit * cam.scale;
      const ox = (size.w - poster.w * fit) / 2 + cam.x + (poster.w * (fit - s)) / 2;
      const oy = (size.h - poster.h * fit) / 2 + cam.y + (poster.h * (fit - s)) / 2;
      let best = -1;
      let bestD = 12;
      // Prefer hubs
      for (const hub of poster.hubs) {
        const i = hub.i;
        const px = poster.x[i] * s + ox;
        const py = poster.y[i] * s + oy;
        const d = Math.hypot(px - sx, py - sy);
        const thr = Math.max(12, poster.r[i] * s * 1.05);
        if (d < thr && d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best >= 0) return best;
      for (let i = 0; i < poster.x.length; i++) {
        if (poster.kind[i] === 2) continue;
        const px = poster.x[i] * s + ox;
        const py = poster.y[i] * s + oy;
        const d = Math.hypot(px - sx, py - sy);
        const thr = Math.max(5, poster.r[i] * s * 0.7);
        if (d < thr && d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return best;
    },
    [poster, size],
  );

  const describeIndex = useCallback(
    (i: number): HoverState | null => {
      if (!poster || i < 0) return null;
      if (poster.kind[i] === 2) {
        const hub = poster.hubs.find((h) => h.i === i);
        return { index: i, kind: 2, label: hub?.label ?? "Hub", hub };
      }
      if (poster.kind[i] === 0) {
        const foPos = i; // founders are first 0..foIds.length-1
        const fid = poster.foIds[foPos];
        const deal = fid ? deals[fid] : undefined;
        return {
          index: i,
          kind: 0,
          label: deal?.founderName ?? "Founder",
          deal: deal ?? null,
        };
      }
      const coPos = i - founderCount;
      const cid = poster.coIds[coPos];
      return { index: i, kind: 1, label: "Company", deal: cid ? { founderName: "", companyName: null, companyId: cid, stage: null, networks: [], investors: [], hasTopFund: false } : null };
    },
    [poster, deals, founderCount],
  );

  const onPointerMove = (event: React.PointerEvent) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    if (dragRef.current) {
      const d = dragRef.current;
      camRef.current.x = d.cx + (sx - d.x);
      camRef.current.y = d.cy + (sy - d.y);
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(draw);
      return;
    }
    const hit = hitTest(sx, sy);
    const next = describeIndex(hit);
    setHover((prev) => {
      if (prev?.index === next?.index) return prev;
      return next;
    });
  };

  const onPointerDown = (event: React.PointerEvent) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    dragRef.current = { x: sx, y: sy, cx: camRef.current.x, cy: camRef.current.y };
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
  };

  const onPointerUp = (event: React.PointerEvent) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    const drag = dragRef.current;
    dragRef.current = null;
    if (!rect || !drag || !poster) return;
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    if (Math.hypot(sx - drag.x, sy - drag.y) > 6) return;
    const hit = hitTest(sx, sy);
    if (hit < 0) {
      setSelectedHub(null);
      return;
    }
    if (poster.kind[hit] === 2) {
      const hub = poster.hubs.find((h) => h.i === hit);
      if (hub) {
        setSelectedHub((cur) => (cur === hub.id ? null : hub.id));
        onSelectNetwork?.(hub.id);
      }
      return;
    }
    if (poster.kind[hit] === 0) {
      const fid = poster.foIds[hit];
      const deal = fid ? deals[fid] : null;
      if (deal?.companyId) onSelectCompany?.(deal.companyId);
    } else if (poster.kind[hit] === 1) {
      const cid = poster.coIds[hit - founderCount];
      if (cid) onSelectCompany?.(cid);
    }
  };

  const onWheel = (event: React.WheelEvent) => {
    event.preventDefault();
    const cam = camRef.current;
    const factor = event.deltaY > 0 ? 0.92 : 1.08;
    cam.scale = clamp(cam.scale * factor, 0.7, 4.5);
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(draw);
  };

  const featuredDeal = poster?.featuredId ? deals[poster.featuredId] : null;
  const investors = investorHubsProp?.length
    ? investorHubsProp.map((h) => ({ id: h.id, label: h.label, founders: h.founderCount }))
    : poster?.investorHubs ?? [];

  const legendCampuses = poster?.campuses.filter((c) => c.id !== "other") ?? [];
  const legendTop = legendCampuses.slice(0, 6);
  const legendRest = legendCampuses.slice(6);

  // Mobile hub labels: top 6 hubs by founders
  const mobileHubLabels = useMemo(() => {
    if (!poster) return [];
    return [...poster.hubs].sort((a, b) => b.founders - a.founders).slice(0, 6);
  }, [poster]);

  if (!poster) {
    return <p className="px-4 py-10 text-sm text-[color:var(--fg-3)]">Loading network map…</p>;
  }

  return (
    <div className="w-full" data-networks-desk="">
      <div
        ref={wrapRef}
        className="relative w-full touch-manipulation overflow-hidden bg-white max-md:!h-[52vh]"
        style={{ height: "min(85vh, calc(100dvh - 24rem))" }}
        data-networks-graph=""
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full cursor-grab active:cursor-grabbing"
          aria-label="Campus founder networks map"
        />

        {/* Nature-style callouts: desktop margins via HTML leaders; mobile listed below */}
        <div className="pointer-events-none absolute inset-0 z-[1] hidden md:block" aria-hidden="true">
          {poster.callouts.map((c, i) => {
            const a = worldToScreen(c.ax, c.ay);
            const label = worldToScreen(c.lx, c.ly);
            const left = c.side === "left";
            // Keep near the cluster; clamp only enough to stay on-canvas
            const lx = clamp(label.x, 8, size.w - 228);
            const ly = clamp(label.y, 16, size.h - 88);
            const tipX = left ? lx + 210 : lx;
            return (
              <div key={`callout-${i}`}>
                <svg className="absolute inset-0 h-full w-full overflow-visible">
                  <path
                    d={`M ${a.x} ${a.y} L ${tipX} ${ly + 14}`}
                    stroke="rgba(71,85,105,0.55)"
                    strokeWidth="0.7"
                    fill="none"
                    data-canvas-callout-leader=""
                  />
                </svg>
                <div
                  data-canvas-callout=""
                  className="absolute max-w-[210px] rounded-sm bg-white/80 px-1.5 py-1 text-[11px] leading-snug text-[color:var(--fg-2)]"
                  style={{ left: lx, top: ly }}
                >
                  {c.text}
                </div>
              </div>
            );
          })}
        </div>

        {/* Mobile: labeled hubs on graph (≥6) */}
        <div className="pointer-events-none absolute inset-0 z-[1] md:hidden">
          {mobileHubLabels.map((hub) => {
            const pt = worldToScreen(poster.x[hub.i], poster.y[hub.i]);
            const hubR = Math.max(18, poster.r[hub.i] * Math.min(size.w / poster.w, size.h / poster.h) * 2.4);
            return (
              <button
                key={hub.id}
                type="button"
                data-canvas-label={hub.id}
                data-label-anchor-x={pt.x}
                data-label-anchor-y={pt.y}
                data-hub-x={pt.x}
                data-hub-y={pt.y}
                data-hub-r={hubR}
                className="pointer-events-auto absolute z-[2] -translate-x-1/2 -translate-y-full rounded bg-white/90 px-1 py-0.5 text-left text-[10px] font-semibold leading-tight text-[color:var(--fg)] shadow-sm"
                style={{ left: pt.x, top: Math.max(14, pt.y - 6), maxWidth: 140 }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedHub((cur) => (cur === hub.id ? null : hub.id));
                  onSelectNetwork?.(hub.id);
                }}
              >
                <span className="block whitespace-normal break-words">
                  {hub.label} · {hub.founders.toLocaleString("en-US")}
                </span>
              </button>
            );
          })}
        </div>

        {/* Desktop hub labels (top hubs) — collision-avoided */}
        <div className="pointer-events-none absolute inset-0 z-[1] hidden md:block">
          {(() => {
            const placed: { l: number; t: number; r: number; b: number }[] = [];
            const out: Array<React.ReactNode> = [];
            const fit = Math.min(size.w / poster.w, size.h / poster.h);
            for (const hub of mobileHubLabels.slice(0, 10)) {
              const pt = worldToScreen(poster.x[hub.i], poster.y[hub.i]);
              const hubR = Math.max(28, poster.r[hub.i] * fit * 3.2);
              const shortLabel =
                hub.label.length > 26 ? hub.label.replace(/Penn Venture Lab\s+/i, "Penn ").slice(0, 32) : hub.label;
              const approxW = Math.min(170, Math.max(86, shortLabel.length * 6.6 + 36));
              const approxH = 38; // labels wrap; reserve two lines
              let top = Math.max(18, pt.y - 12);
              let left = pt.x;
              let ok = false;
              // Prefer upward offsets so labels sit above dense clusters
              for (const dy of [0, -28, -48, -68, 28, 48, -88, 68]) {
                const candT = clamp(top + dy, 16, size.h - 36);
                const box = { l: left - approxW / 2, t: candT - approxH, r: left + approxW / 2, b: candT + 4 };
                const hit = placed.some(
                  (p0) => !(box.r < p0.l + 8 || box.l > p0.r - 8 || box.b < p0.t + 6 || box.t > p0.b - 6),
                );
                if (!hit) {
                  top = candT;
                  placed.push(box);
                  ok = true;
                  break;
                }
              }
              if (!ok) continue;
              out.push(
                <button
                  key={`d-${hub.id}`}
                  type="button"
                  data-canvas-label={hub.id}
                  data-label-anchor-x={pt.x}
                  data-label-anchor-y={pt.y}
                  data-hub-x={pt.x}
                  data-hub-y={pt.y}
                  data-hub-r={hubR}
                  className="pointer-events-auto absolute z-[2] -translate-x-1/2 -translate-y-full text-left text-[11px] font-semibold leading-snug text-[color:var(--fg)]"
                  style={{
                    left,
                    top,
                    maxWidth: 160,
                    textShadow: "0 0 3px #fff, 0 1px 2px #fff",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedHub((cur) => (cur === hub.id ? null : hub.id));
                    onSelectNetwork?.(hub.id);
                  }}
                >
                  <span className="block whitespace-normal break-words">
                    {shortLabel} · {hub.founders.toLocaleString("en-US")}
                  </span>
                </button>,
              );
            }
            return out;
          })()}
        </div>

        <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-white/80 px-2 py-1 text-[10px] text-[color:var(--fg-3)]">
          Scroll to zoom · drag to pan
          {selectedHub ? ` · showing ties for ${poster.hubs.find((h) => h.id === selectedHub)?.label ?? "hub"}` : ""}
        </div>
      </div>

      {/* Legend under the map */}
      <div
        data-networks-legend-frame=""
        data-networks-legend=""
        className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px] text-[color:var(--fg-2)]"
      >
        {legendTop.map((c) => (
          <span key={c.id} className="inline-flex items-center gap-1.5" data-legend-swatch={c.color} data-legend-campus={c.id}>
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
            {c.label}
          </span>
        ))}
        {legendRest.length ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded border border-[color:var(--line)] px-1.5 py-0.5 text-[10px]"
            data-legend-other=""
            aria-expanded={legendOtherOpen}
            onClick={() => setLegendOtherOpen((o) => !o)}
          >
            Other campuses ({legendRest.length.toLocaleString("en-US")})
          </button>
        ) : null}
        {legendOtherOpen
          ? legendRest.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1.5" data-legend-swatch={c.color} data-legend-campus={c.id}>
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                {c.label}
              </span>
            ))
          : legendRest.map((c) => (
              <span
                key={`h-${c.id}`}
                className="absolute h-px w-px overflow-hidden"
                style={{ clip: "rect(0,0,0,0)" }}
                data-legend-swatch={c.color}
                data-legend-campus={c.id}
                data-legend-grouped="other"
              >
                {c.label}
              </span>
            ))}
        <span className="inline-flex items-center gap-1.5" data-legend-swatch="#94a3b8" data-legend-kind="company">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#94a3b8]" /> Company
        </span>
        <span className="inline-flex items-center gap-1.5" data-legend-swatch="#1e293b" data-legend-kind="hub">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#1e293b]" /> Hub
        </span>
      </div>

      {/* Full-width row of 3 cards below map — also tagged as rail for gates */}
      <div
        data-networks-rail=""
        className="mt-3 grid gap-3 md:grid-cols-3"
      >
        <div
          data-networks-detail=""
          {...(featuredDeal || hover?.deal ? { "data-networks-featured": "" } : {})}
          className="order-2 rounded-lg border border-[color:var(--line)] bg-white px-3 py-2.5 text-xs md:order-none"
        >
          <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.06em] text-[color:var(--fg-3)]" data-panel-header="">
            {hover?.deal ? "Founder" : "Featured founder"}
          </div>
          {hover?.deal ? (
            <DealCard deal={hover.deal} short />
          ) : featuredDeal ? (
            <DealCard deal={featuredDeal} short />
          ) : hover?.hub ? (
            <>
              <div className="font-medium">{hover.hub.label}</div>
              <div className="text-[color:var(--fg-2)]">{hover.hub.founders.toLocaleString("en-US")} founders on this desk</div>
            </>
          ) : (
            <p className="text-[color:var(--fg-3)]">Hover a founder on the map.</p>
          )}
        </div>

        <div data-networks-insights="" className="order-3 rounded-lg border border-[color:var(--line)] bg-white px-3 py-2.5 text-xs md:order-none">
          <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.06em] text-[color:var(--fg-3)]" data-panel-header="">
            Insights
          </div>
          <ul className="space-y-1.5 text-[11px] leading-snug text-[color:var(--fg-2)]">
            {(poster.insights.length ? poster.insights : poster.callouts.slice(0, 3).map((c) => c.text)).map((t, i) => (
              <li key={`ins-${i}`}>{t}</li>
            ))}
          </ul>
        </div>

        <div data-networks-investor-rail="" className="order-1 rounded-lg border border-[color:var(--line)] bg-white px-3 py-2.5 text-xs md:order-none">
          <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.06em] text-[color:var(--fg-3)]" data-panel-header="">
            Investor hubs
          </div>
          <ol className="divide-y divide-[color:var(--line)]">
            {investors.slice(0, 6).map((row, index) => (
              <li key={row.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 py-1 text-left hover:bg-[#f7f8fc]"
                  onClick={() => {
                    setSelectedHub(row.id);
                    onSelectNetwork?.(row.id);
                  }}
                >
                  <span className="w-4 text-[10px] tabular-nums text-[color:var(--fg-3)]">{String(index + 1).padStart(2, "0")}</span>
                  <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{row.label}</span>
                  <span className="tabular-nums text-[color:var(--fg-2)]">{row.founders.toLocaleString("en-US")}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Mobile callouts after cards so investor rows stay near the fold */}
      <ol className="mt-3 space-y-2 px-1 md:hidden" data-networks-mobile-callouts="">
        {poster.callouts.map((c, i) => (
          <li key={`mc-${i}`} className="text-[12px] leading-snug text-[color:var(--fg-2)]">
            <span className="mr-1.5 font-semibold text-[color:var(--fg)]">{String(i + 1).padStart(2, "0")}</span>
            {c.text}
          </li>
        ))}
      </ol>
    </div>
  );
}

function DealCard({ deal, short }: { deal: Deal; short?: boolean }) {
  const investors = deal.investors ?? [];
  const networks = (deal.networks ?? []).filter((n) => !investors.some((i) => i.toLowerCase() === n.toLowerCase()));
  return (
    <div className="space-y-0.5">
      <div className="font-medium text-[color:var(--fg)]">{deal.founderName}</div>
      <div className="text-[color:var(--fg-2)]">
        {deal.companyName ?? "Company unknown"}
        {deal.stage ? ` · ${deal.stage}` : ""}
      </div>
      <div className="text-[10px] text-[color:var(--fg-3)]" data-networks-deal-networks="">
        Networks ({networks.length.toLocaleString("en-US")}):{" "}
        {networks.length ? networks.slice(0, short ? 2 : 8).join(", ") : "—"}
      </div>
      <div className="text-[10px] text-[color:var(--fg-3)]" data-networks-deal-investors="">
        {investors.length ? (
          <>
            Investors ({investors.length.toLocaleString("en-US")}): {investors.slice(0, short ? 4 : 8).join(", ")}
            {deal.hasTopFund ? "" : ""}
          </>
        ) : (
          <>No named investors on file yet</>
        )}
      </div>
    </div>
  );
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  if (h.length === 3) {
    return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
  }
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
