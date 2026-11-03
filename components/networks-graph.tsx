"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  YEAR_MIN_DEFAULT,
  cohortYearNow,
  countFoundersByYear,
  founderVisibleAtYear,
  type Poster,
  type PosterHub,
  type PosterCampusLabel,
} from "@/components/networks-poster-types";
import { NetworksTimeline } from "@/components/networks-timeline";
import dynamic from "next/dynamic";
import { NETWORK_ZOOM_PRESETS, closestNetworkZoomPreset, type NetworkZoomPreset } from "@/lib/domain/network-zoom-presets";

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

const YC_EDGE_CAP = 0.1;

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

function curvedPath(x1: number, y1: number, x2: number, y2: number, bendScale = 1) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const bend = Math.min(36, len * 0.2) * bendScale;
  return { cx: mx - (dy / len) * bend, cy: my + (dx / len) * bend };
}

function smoothstep(t: number) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  if (h.length === 3) {
    return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
  }
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Simple quadtree for deep-zoom card culling. */
class QuadTree {
  x: number; y: number; w: number; h: number; items: { i: number; x: number; y: number }[]; kids: QuadTree[] | null;
  constructor(x: number, y: number, w: number, h: number) {
    this.x = x; this.y = y; this.w = w; this.h = h; this.items = []; this.kids = null;
  }
  insert(it: { i: number; x: number; y: number }) {
    if (it.x < this.x || it.y < this.y || it.x > this.x + this.w || it.y > this.y + this.h) return;
    if (this.items.length < 8 && !this.kids) { this.items.push(it); return; }
    if (!this.kids) {
      const hw = this.w / 2, hh = this.h / 2;
      this.kids = [
        new QuadTree(this.x, this.y, hw, hh),
        new QuadTree(this.x + hw, this.y, hw, hh),
        new QuadTree(this.x, this.y + hh, hw, hh),
        new QuadTree(this.x + hw, this.y + hh, hw, hh),
      ];
      for (const old of this.items) for (const k of this.kids) k.insert(old);
      this.items = [];
    }
    for (const k of this.kids) k.insert(it);
  }
  query(x: number, y: number, w: number, h: number, out: { i: number; x: number; y: number }[]) {
    if (x + w < this.x || y + h < this.y || x > this.x + this.w || y > this.y + this.h) return;
    for (const it of this.items) {
      if (it.x >= x && it.y >= y && it.x <= x + w && it.y <= y + h) out.push(it);
    }
    if (this.kids) for (const k of this.kids) k.query(x, y, w, h, out);
  }
}

export function NetworksGraph2D({ investorHubs: investorHubsProp, onSelectCompany, onSelectNetwork }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [poster, setPoster] = useState<Poster | null>(null);
  const [deals, setDeals] = useState<Record<string, Deal>>({});
  const [size, setSize] = useState({ w: 1200, h: 640 });
  const [hover, setHover] = useState<HoverState | null>(null);
  const [selectedHub, setSelectedHub] = useState<string | null>(null);
  const [legendOtherOpen, setLegendOtherOpen] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  const yearMax = cohortYearNow();
  const yearMin = YEAR_MIN_DEFAULT;
  const [scrubYear, setScrubYear] = useState(yearMax);
  const [playing, setPlaying] = useState(false);
  const scrubRef = useRef(yearMax);
  const playRef = useRef(false);
  const playAccRef = useRef(0);
  const camRef = useRef({ x: 0, y: 0, scale: 1 });
  const dragRef = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const hoverRef = useRef<HoverState | null>(null);
  const selectedRef = useRef<string | null>(null);
  const rafRef = useRef(0);
  const t0Ref = useRef(0);
  const fadeRef = useRef(0);
  const reducedRef = useRef(false);
  const glowSpriteRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const grainRef = useRef<HTMLCanvasElement | null>(null);
  const trailRef = useRef<Map<number, { x: number; y: number }[]>>(new Map());
  const popRef = useRef<Map<number, number>>(new Map());
  const velRef = useRef({ vx: 0, vy: 0, vScale: 0 });
  const nodeOffRef = useRef<Float32Array | null>(null); // dx,dy pairs
  const nodeVelRef = useRef<Float32Array | null>(null);
  const dragNodeRef = useRef<number | null>(null);
  const assembleRef = useRef(0); // 0..1 cluster assemble
  const pulseRef = useRef(0);
  const zoomTierRef = useRef(0); // 0 out, 1 mid, 2 deep for data attr
  const [, bump] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/data/founder-networks-poster.json")
      .then((r) => r.json())
      .then((data: Poster) => { if (!cancelled) setPoster(data); })
      .catch(() => {});
    fetch("/data/founder-networks-deals.json")
      .then((r) => r.json())
      .then((data: { deals?: Record<string, Deal> }) => { if (!cancelled) setDeals(data.deals ?? {}); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const apply = (width: number, height: number) => {
      setSize({ w: Math.max(280, Math.floor(width)), h: Math.max(280, Math.floor(height)) });
    };
    apply(el.clientWidth, el.clientHeight);
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      apply(rect.width, rect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [poster]);

  useEffect(() => {
    reducedRef.current = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  }, []);

  useEffect(() => { hoverRef.current = hover; }, [hover]);
  useEffect(() => { selectedRef.current = selectedHub; }, [selectedHub]);
  useEffect(() => { scrubRef.current = scrubYear; }, [scrubYear]);
  useEffect(() => { playRef.current = playing; }, [playing]);

  const founderCount = poster?.foIds.length ?? 0;

  useEffect(() => {
    if (poster) {
      const n = poster.x.length;
      nodeOffRef.current = new Float32Array(n * 2);
      nodeVelRef.current = new Float32Array(n * 2);
      assembleRef.current = reducedRef.current ? 1 : 0;
      fadeRef.current = 0;
      t0Ref.current = 0;
    }
  }, [poster]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (poster) (window as unknown as { __NETWORKS_POSTER__?: Poster }).__NETWORKS_POSTER__ = poster;
    const w = window as unknown as {
      __NETWORKS_POSTER__?: Poster;
      __NETWORKS_SET_SCALE__?: (scale: number) => void;
    };
    w.__NETWORKS_SET_SCALE__ = (scale: number) => {
      camRef.current.scale = Math.max(0.7, Math.min(5.5, scale));
      velRef.current.vScale = 0;
      bump((n) => n + 1);
    };
    const pending = (w as typeof w & { __NETWORKS_PENDING_SCALE__?: number }).__NETWORKS_PENDING_SCALE__;
    if (typeof pending === "number") {
      w.__NETWORKS_SET_SCALE__(pending);
      delete (w as typeof w & { __NETWORKS_PENDING_SCALE__?: number }).__NETWORKS_PENDING_SCALE__;
    }
    (w as typeof w & { __NETWORKS_RESET_VIEW__?: () => void }).__NETWORKS_RESET_VIEW__ = () => {
      camRef.current = { x: 0, y: 0, scale: NETWORK_ZOOM_PRESETS[0].scale };
      velRef.current = { vx: 0, vy: 0, vScale: 0 };
      dragRef.current = null;
      setSelectedHub(null);
      setZoomScale(NETWORK_ZOOM_PRESETS[0].scale);
      bump((n) => n + 1);
    };
    return () => {
      delete w.__NETWORKS_POSTER__;
      delete w.__NETWORKS_SET_SCALE__;
      delete (w as typeof w & { __NETWORKS_RESET_VIEW__?: () => void }).__NETWORKS_RESET_VIEW__;
    };
  }, [poster]);

  const worldToScreen = useCallback(
    (wx: number, wy: number) => {
      if (!poster) return { x: 0, y: 0, s: 1 };
      const cam = camRef.current;
      const fit = Math.min(size.w / poster.w, size.h / poster.h);
      const s = fit * cam.scale;
      const ox = (size.w - poster.w * fit) / 2 + cam.x + (poster.w * (fit - s)) / 2;
      const oy = (size.h - poster.h * fit) / 2 + cam.y + (poster.h * (fit - s)) / 2;
      return { x: wx * s + ox, y: wy * s + oy, s };
    },
    [poster, size],
  );

  const getGlowSprite = (color: string, soft = true) => {
    const key = soft ? color + ":s2" : color + ":h";
    const cached = glowSpriteRef.current.get(key);
    if (cached) return cached;
    const c = document.createElement("canvas");
    c.width = 96; c.height = 96;
    const g = c.getContext("2d")!;
    const rgb = hexToRgb(color);
    const grd = g.createRadialGradient(48, 48, 0, 48, 48, 46);
    if (soft) {
      grd.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.85)`);
      grd.addColorStop(0.25, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.45)`);
      grd.addColorStop(0.55, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.16)`);
      grd.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
    } else {
      grd.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.95)`);
      grd.addColorStop(0.4, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.5)`);
      grd.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
    }
    g.fillStyle = grd;
    g.fillRect(0, 0, 96, 96);
    glowSpriteRef.current.set(key, c);
    return c;
  };

  const ensureGrain = () => {
    if (grainRef.current) return grainRef.current;
    const c = document.createElement("canvas");
    c.width = 128; c.height = 128;
    const g = c.getContext("2d")!;
    const img = g.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 220 + Math.floor(Math.random() * 35);
      img.data[i] = v; img.data[i + 1] = v - 2; img.data[i + 2] = v - 6; img.data[i + 3] = 18;
    }
    g.putImageData(img, 0, 0);
    grainRef.current = c;
    return c;
  };

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

    const reduced = reducedRef.current;
    if (!t0Ref.current) t0Ref.current = performance.now();
    const now = performance.now();
    const t = (now - t0Ref.current) / 1000;
    if (!reduced) fadeRef.current = Math.min(1, fadeRef.current + 0.045);
    else fadeRef.current = 1;
    const fade = fadeRef.current;
    if (wrapRef.current) {
      wrapRef.current.setAttribute("data-networks-fade", fade >= 0.99 ? "1" : "0");
      (window as unknown as { __NETWORKS_FADE__?: number }).__NETWORKS_FADE__ = fade;
    }

    // Warm off-white base
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#fbfaf7";
    ctx.fillRect(0, 0, w, h);

    const cam = camRef.current;
    const fit = Math.min(w / p.w, h / p.h);
    const s = fit * cam.scale;
    const ox = (w - p.w * fit) / 2 + cam.x + (p.w * (fit - s)) / 2;
    const oy = (h - p.h * fit) / 2 + cam.y + (p.h * (fit - s)) / 2;
    const assemble = assembleRef.current;
    const assembleEase = 1 - Math.pow(1 - assemble, 3);
    const off = nodeOffRef.current;
    const toS = (wx: number, wy: number, i = -1) => {
      let dx = 0, dy = 0;
      // Assemble: nodes start near campus centroid and bloom out
      let ax = wx, ay = wy;
      if (i >= 0 && assembleEase < 0.999 && p.kind[i] !== 2) {
        const ci = p.campus[i];
        if (ci >= 0 && p.campusLabels) {
          const lab = p.campusLabels.find((l) => l.id === p.campuses[ci]?.id);
          if (lab) {
            ax = lab.x + (wx - lab.x) * assembleEase;
            ay = lab.y + (wy - lab.y) * assembleEase;
          }
        }
      }
      if (!reduced && i >= 0) {
        const seed = hash01(String(i));
        dx = Math.sin(t * 0.35 + seed * 12.5) * (1.15 + seed);
        dy = Math.cos(t * 0.28 + seed * 9.1) * (0.95 + seed * 0.85);
        if (off) {
          dx += off[i * 2];
          dy += off[i * 2 + 1];
        }
      }
      return { x: ax * s + ox + dx, y: ay * s + oy + dy };
    };

    const sel = selectedRef.current;
    const hv = hoverRef.current;
    const focusHub = sel || (hv?.hub?.id ?? null);
    const focusNode = hv?.index ?? -1;
    const scrub = scrubRef.current;
    const ymax = yearMax;
    const years = p.year;
    const isFoOn = (i: number) => {
      if (p.kind[i] !== 0) return true;
      if (!years) return true;
      return founderVisibleAtYear(years[i], scrub, ymax);
    };

    // Timeline play (~1 year / 0.9s at 60fps)
    if (playRef.current) {
      playAccRef.current += 1;
      if (playAccRef.current > 54) {
        playAccRef.current = 0;
        const next = scrub >= ymax ? yearMin : scrub + 1;
        scrubRef.current = next;
        queueMicrotask(() => setScrubYear(next));
        if (next >= ymax) {
          playRef.current = false;
          queueMicrotask(() => setPlaying(false));
        }
      }
    }

    // Three distinct zoom tiers with smooth crossfades
    // out: scale ~0.7-1.35 | mid: ~1.35-2.6 | deep: ~2.6+
    const bloom = reduced ? 0 : smoothstep((cam.scale - 1.2) / 0.9) * (1 - smoothstep((cam.scale - 2.55) / 0.55));
    const deep = reduced ? 0 : smoothstep((cam.scale - 2.45) / 0.7);
    const crisp = Math.max(0, 1 - bloom - deep * 0.85);
    const calloutFade = crisp; // margin callouts only when zoomed out
    const tier = deep > 0.55 ? 2 : bloom > 0.4 ? 1 : 0;
    if (zoomTierRef.current !== tier) {
      zoomTierRef.current = tier;
      queueMicrotask(() => setZoomScale(cam.scale));
    }
    if (wrapRef.current) {
      wrapRef.current.setAttribute("data-networks-zoom", String(tier));
    }

    // Campus haze clouds (readable at rest; bloom amplifies)
    for (let ci = 0; ci < p.campuses.length; ci++) {
      let sx = 0, sy = 0, n = 0;
      for (let i = 0; i < p.x.length; i++) {
        if (p.kind[i] !== 0 || p.campus[i] !== ci) continue;
        sx += p.x[i]; sy += p.y[i]; n += 1;
      }
      if (!n) continue;
      const home = toS(sx / n, sy / n);
      const breathe = reduced ? 1 : 1 + Math.sin(t * 0.4 + ci) * 0.05;
      const rad = (42 + Math.sqrt(n) * 5.8) * s * breathe * (1.05 + bloom * 0.9);
      const sprite = getGlowSprite(p.campuses[ci].color, true);
      ctx.globalAlpha = (0.32 + bloom * 0.38) * fade;
      ctx.drawImage(sprite, home.x - rad, home.y - rad, rad * 2, rad * 2);
      ctx.globalAlpha = 1;
    }

    // Edges: visible fine web in source campus color; inter-campus strands a bit stronger
    ctx.lineCap = "round";
    const nE = p.e0.length;
    const memberFos = new Set<number>();
    if (focusHub) {
      const hub = p.hubs.find((hh) => hh.id === focusHub);
      if (hub) {
        for (let i = 0; i < nE; i++) {
          if (p.ek[i] !== 1) continue;
          const a = p.e0[i], b = p.e1[i];
          if (a === hub.i) memberFos.add(b);
          if (b === hub.i) memberFos.add(a);
        }
      }
    }
    for (let i = 0; i < nE; i++) {
      const a = p.e0[i], b = p.e1[i], k = p.ek[i];
      if ((p.kind[a] === 0 && !isFoOn(a)) || (p.kind[b] === 0 && !isFoOn(b))) continue;
      const hubA = p.kind[a] === 2, hubB = p.kind[b] === 2;
      const hubIdx = hubA ? a : hubB ? b : -1;
      const hubId = hubIdx >= 0 ? p.hubs.find((hh) => hh.i === hubIdx)?.id : null;
      if (hubId === "yc" && !focusHub) {
        if (hash01(`yc:${a}:${b}`) > YC_EDGE_CAP) continue;
      } else if (hubId === "yc" && focusHub && focusHub !== "yc") continue;
      if (focusHub && hubId && hubId !== focusHub && k === 1) continue;

      const pa = toS(p.x[a], p.y[a], a);
      const pb = toS(p.x[b], p.y[b], b);
      const { cx, cy } = curvedPath(pa.x, pa.y, pb.x, pb.y, 0.95 + bloom * 0.5);
      let color = "#94a3b8";
      const campI = p.campus[p.kind[a] === 0 ? a : p.kind[b] === 0 ? b : a];
      if (campI >= 0 && p.campuses[campI]) color = p.campuses[campI].color;
      const rgb = hexToRgb(color);
      const campA = p.campus[a], campB = p.campus[b];
      const crossCamp = campA >= 0 && campB >= 0 && campA !== campB;
      // Target visible web ~0.08-0.15 at rest after fade
      let alpha = k === 2 ? 0.13 : k === 1 ? 0.1 : k === 3 ? 0.09 : crossCamp ? 0.14 : 0.11;
      let lineW = k === 2 ? 0.85 : crossCamp ? 0.75 : 0.65;
      if (hubId === "yc" && !focusHub) { alpha = 0.07; lineW = 0.55; }
      if (hubId && focusHub === hubId) { alpha = 0.32; lineW = 1.05; }
      else if (focusNode === a || focusNode === b) { alpha = Math.min(0.4, alpha * 2.8); lineW = 1.0; }
      // Soft shimmer
      if (!reduced) {
        const sh = 0.85 + 0.15 * Math.sin(t * 1.7 + i * 0.13);
        alpha *= sh;
      }
      alpha *= fade * (0.55 + 0.45 * assembleEase);
      ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha * crisp + alpha * 0.35 * bloom})`;
      ctx.lineWidth = lineW;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.quadraticCurveTo(cx, cy, pb.x, pb.y);
      ctx.stroke();

      // Occasional pulse traveling hub -> founder
      if (!reduced && k === 1 && hubIdx >= 0 && hash01(`pulse:${i}`) < 0.08) {
        const u = (pulseRef.current + hash01(`pu:${i}`)) % 1;
        const px = (1 - u) * (1 - u) * pa.x + 2 * (1 - u) * u * cx + u * u * pb.x;
        const py = (1 - u) * (1 - u) * pa.y + 2 * (1 - u) * u * cy + u * u * pb.y;
        ctx.beginPath();
        ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${0.55 * fade * crisp})`;
        ctx.arc(px, py, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Bundled inter-campus strands (centroid-to-centroid, source color)
    if (p.campusLabels && p.campusLabels.length >= 2) {
      const labs = p.campusLabels.slice(0, 10);
      for (let i = 0; i < labs.length; i++) {
        for (let j = i + 1; j < labs.length; j++) {
          if (hash01(`bundle:${labs[i].id}:${labs[j].id}`) > 0.42) continue;
          const a = toS(labs[i].x, labs[i].y);
          const b = toS(labs[j].x, labs[j].y);
          const { cx, cy } = curvedPath(a.x, a.y, b.x, b.y, 1.6);
          const col = p.campuses.find((c) => c.id === labs[i].id)?.color ?? "#94a3b8";
          const rgb = hexToRgb(col);
          ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${0.12 * fade})`;
          ctx.lineWidth = 1.15;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.quadraticCurveTo(cx, cy, b.x, b.y);
          ctx.stroke();
        }
      }
    }

    // Mid-zoom dashed arcs between major campus labels (bloom-box style)
    if (bloom > 0.05 && p.campusLabels) {
      const labs = p.campusLabels.slice(0, 8);
      ctx.setLineDash([4, 6]);
      ctx.lineWidth = 1.1;
      for (let i = 0; i < labs.length; i++) {
        for (let j = i + 1; j < Math.min(labs.length, i + 4); j++) {
          const a = toS(labs[i].x, labs[i].y);
          const b = toS(labs[j].x, labs[j].y);
          const { cx, cy } = curvedPath(a.x, a.y, b.x, b.y, 1.55);
          ctx.strokeStyle = `rgba(30,41,59,${(0.22 + bloom * 0.25) * fade})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.quadraticCurveTo(cx, cy, b.x, b.y);
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);
    }

    // Nodes
    for (let i = 0; i < p.x.length; i++) {
      if (p.kind[i] === 0 && !isFoOn(i)) continue;
      const pt = toS(p.x[i], p.y[i], i);
      if (pt.x < -40 || pt.y < -40 || pt.x > w + 40 || pt.y > h + 40) continue;
      // Floor to ~2-3.5 CSS px at 1440 so dots survive fit scaling
      const baseR = Math.max(2.0, Math.min(3.5, p.r[i] * Math.max(s, 0.85)));
      const bloomR = baseR * (1 + bloom * (10 + hash01(String(i)) * 16));

      if (p.kind[i] === 2) {
        if (!reduced && bloom > 0.2) {
          const trail = trailRef.current.get(i) ?? [];
          trail.push({ x: pt.x, y: pt.y });
          if (trail.length > 8) trail.shift();
          trailRef.current.set(i, trail);
          for (let ti = 1; ti < trail.length; ti++) {
            const a0 = trail[ti - 1], a1 = trail[ti];
            ctx.strokeStyle = `rgba(15,23,42,${0.12 * bloom * (ti / trail.length) * fade})`;
            ctx.lineWidth = 0.8 * (ti / trail.length);
            ctx.beginPath(); ctx.moveTo(a0.x, a0.y); ctx.lineTo(a1.x, a1.y); ctx.stroke();
          }
        }
        ctx.beginPath();
        ctx.fillStyle = `rgba(15,23,42,${0.9 * fade})`;
        ctx.arc(pt.x, pt.y, Math.max(2.6, baseR), 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      const ci = p.campus[i];
      const col = ci >= 0 && p.campuses[ci] ? p.campuses[ci].color : "#94a3b8";
      const rgb = hexToRgb(col);

      // Soft glow under every founder/company at rest
      {
        const sprite = getGlowSprite(col, true);
        const glowRad = baseR * (2.8 + bloom * 8);
        ctx.globalAlpha = (0.35 + crisp * 0.2 + bloom * 0.45) * fade * (p.kind[i] === 0 ? 1 : 0.8);
        ctx.drawImage(sprite, pt.x - glowRad, pt.y - glowRad, glowRad * 2, glowRad * 2);
        ctx.globalAlpha = 1;
      }

      // Mid-zoom watercolor blob (bigger, more saturated)
      if (bloom > 0.02) {
        const sprite = getGlowSprite(col, true);
        const rad = bloomR;
        ctx.globalAlpha = (0.28 + bloom * 0.55) * fade * (p.kind[i] === 0 ? 1 : 0.75);
        ctx.drawImage(sprite, pt.x - rad, pt.y - rad, rad * 2, rad * 2);
        ctx.globalAlpha = 1;
      }

      // Crisp saturated pastel dot
      const dotR = Math.max(2.0, Math.min(3.5, baseR));
      const dotA = (0.55 + crisp * 0.3) * fade; // 0.55-0.85 at rest
      ctx.beginPath();
      ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${dotA})`;
      ctx.arc(pt.x, pt.y, dotR * (p.kind[i] === 0 ? 1 : 0.9), 0, Math.PI * 2);
      ctx.fill();
      if (crisp > 0.35) {
        ctx.beginPath();
        ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${0.22 * crisp * fade})`;
        ctx.arc(pt.x, pt.y, dotR * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Mid-zoom tracking boxes + monospace x/y labels (bloom-box ref)
    if (bloom > 0.08 && p.campusLabels) {
      ctx.save();
      ctx.font = "9px ui-monospace, SFMono-Regular, Menlo, monospace";
      for (const lab of p.campusLabels.slice(0, 12)) {
        const pt = toS(lab.x, lab.y);
        const box = Math.max(36, lab.r * s * 0.42) * (0.9 + bloom * 0.55);
        ctx.globalAlpha = (0.65 + bloom * 0.25) * fade;
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 1;
        ctx.strokeRect(pt.x - box / 2, pt.y - box / 2, box, box);
        // Inner nested box for a few larger hubs
        if (lab.n >= 80) {
          const inner = box * 0.55;
          ctx.globalAlpha = 0.4 * bloom * fade;
          ctx.strokeRect(pt.x - inner / 2, pt.y - inner / 2, inner, inner);
        }
        ctx.globalAlpha = 0.9 * bloom * fade;
        ctx.fillStyle = "#0f172a";
        ctx.fillText(`${lab.label} · ${lab.n.toLocaleString("en-US")}`, pt.x - box / 2, pt.y - box / 2 - 5);
        const xLab = Math.round(lab.x);
        const yLab = Math.round(lab.y);
        ctx.fillText(`x: ${xLab} y: ${yLab}`, pt.x - box / 2, pt.y + box / 2 + 11);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      // Extra small tracking boxes on a sample of founders near bloom
      let boxed = 0;
      for (let i = 0; i < p.x.length && boxed < 28; i++) {
        if (p.kind[i] !== 0) continue;
        if (!isFoOn(i)) continue;
        if (hash01(`box:${i}`) > 0.035) continue;
        const pt = toS(p.x[i], p.y[i], i);
        if (pt.x < 20 || pt.y < 20 || pt.x > w - 20 || pt.y > h - 20) continue;
        const bw = 14 + hash01(`bw:${i}`) * 18;
        const bh = 12 + hash01(`bh:${i}`) * 14;
        ctx.globalAlpha = 0.45 * bloom * fade;
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 0.7;
        ctx.strokeRect(pt.x - bw / 2, pt.y - bh / 2, bw, bh);
        if (hash01(`xy:${i}`) < 0.4) {
          ctx.globalAlpha = 0.7 * bloom * fade;
          ctx.fillStyle = "#0f172a";
          ctx.fillText(`x: ${Math.round(p.x[i])} y: ${Math.round(p.y[i])}`, pt.x - bw / 2, pt.y - bh / 2 - 3);
        }
        boxed += 1;
      }
      ctx.restore();
    }

    // Deep zoom: pop-in founder/company cards along arcs (quadtree cull)
    if (deep > 0.05) {
      const qt = new QuadTree(-200, -200, p.w + 400, p.h + 400);
      for (let i = 0; i < p.x.length; i++) {
        if (p.kind[i] === 2) continue;
        if (p.kind[i] === 0 && !isFoOn(i)) continue;
        qt.insert({ i, x: p.x[i], y: p.y[i] });
      }
      // Visible world AABB
      const invS = 1 / s;
      const wx0 = (0 - ox) * invS, wy0 = (0 - oy) * invS;
      const wx1 = (w - ox) * invS, wy1 = (h - oy) * invS;
      const hits: { i: number; x: number; y: number }[] = [];
      qt.query(wx0, wy0, wx1 - wx0, wy1 - wy0, hits);
      // Prefer higher degree; cap cards
      hits.sort((a, b) => p.deg[b.i] - p.deg[a.i]);
      const maxCards = 22;
      const cardPts: { x: number; y: number; i: number }[] = [];
      ctx.save();
      for (let hi = 0; hi < Math.min(maxCards, hits.length); hi++) {
        const hit = hits[hi];
        const pt = toS(hit.x, hit.y, hit.i);
        let pop = popRef.current.get(hit.i) ?? 0;
        if (!reduced) pop = Math.min(1, pop + 0.1);
        else pop = 1;
        popRef.current.set(hit.i, pop);
        const ease = 1 - Math.pow(1 - pop, 3);
        // slight overshoot spring 0.9 -> 1.04 -> 1
        const spring = ease < 0.7 ? (0.9 + (ease / 0.7) * 0.14) : (1.04 - ((ease - 0.7) / 0.3) * 0.04);
        let title = "Founder";
        let school = "";
        let company = "";
        let investor = "";
        if (p.kind[hit.i] === 0) {
          const fid = p.foIds[hit.i];
          const deal = fid ? deals[fid] : null;
          title = deal?.founderName ?? "Founder";
          company = deal?.companyName ?? "";
          investor = deal?.investors?.[0] ?? "";
          const ci = p.campus[hit.i];
          school = ci >= 0 && p.campuses[ci] ? p.campuses[ci].label : "";
        } else {
          const cid = p.coIds[hit.i - founderCount];
          const dealKey = Object.keys(deals).find((k) => deals[k].companyId === cid);
          const deal = dealKey ? deals[dealKey] : null;
          title = deal?.companyName ?? "Company";
          company = deal?.stage ?? "";
          investor = deal?.investors?.[0] ?? "";
          const ci = p.campus[hit.i];
          school = ci >= 0 && p.campuses[ci] ? p.campuses[ci].label : "";
        }
        const bw = 148 * spring, bh = 54 * spring;
        ctx.globalAlpha = deep * ease * fade;
        ctx.fillStyle = "rgba(255,255,255,0.94)";
        ctx.strokeStyle = "rgba(15,23,42,0.4)";
        ctx.lineWidth = 0.9;
        ctx.fillRect(pt.x + 10, pt.y - bh / 2, bw, bh);
        ctx.strokeRect(pt.x + 10, pt.y - bh / 2, bw, bh);
        ctx.fillStyle = "#0f172a";
        ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillText(title.slice(0, 20), pt.x + 16, pt.y - 12);
        ctx.fillStyle = "#64748b";
        if (school) ctx.fillText(school.slice(0, 20), pt.x + 16, pt.y + 2);
        if (company) ctx.fillText(company.slice(0, 20), pt.x + 16, pt.y + 14);
        if (investor) ctx.fillText(investor.slice(0, 20), pt.x + 16, pt.y + 26);
        cardPts.push({ x: pt.x + 10 + bw / 2, y: pt.y, i: hit.i });
      }
      // Thin gray web between nearby cards
      ctx.strokeStyle = "rgba(100,116,139,0.35)";
      ctx.lineWidth = 0.7;
      for (let i = 0; i < cardPts.length; i++) {
        for (let j = i + 1; j < cardPts.length; j++) {
          const a = cardPts[i], b = cardPts[j];
          if (Math.hypot(a.x - b.x, a.y - b.y) > 280) continue;
          if (hash01(`cardedge:${a.i}:${b.i}`) > 0.45) continue;
          ctx.globalAlpha = deep * fade * 0.7;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // Hover focus ring
    if (focusNode >= 0) {
      const pt = toS(p.x[focusNode], p.y[focusNode], focusNode);
      const radius = Math.max(2.0, Math.min(8, p.r[focusNode] * s));
      ctx.beginPath();
      ctx.fillStyle = "rgba(37,99,235,0.16)";
      ctx.arc(pt.x, pt.y, radius * 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = "#1d4ed8";
      ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Faint grain overlay (warm film)
    if (!reduced) {
      const grain = ensureGrain();
      ctx.globalAlpha = 0.35 * fade;
      const pat = ctx.createPattern(grain, "repeat");
      if (pat) { ctx.fillStyle = pat; ctx.fillRect(0, 0, w, h); }
      ctx.globalAlpha = 1;
    }
  }, [poster, size, yearMax, yearMin, deals, founderCount]);

  // Continuous RAF: fade, drift, inertia, pulses. Do not cancel on hover.
  useEffect(() => {
    let alive = true;
    const loop = () => {
      if (!alive) return;
      // Inertial pan / zoom
      const vel = velRef.current;
      const cam = camRef.current;
      if (!reducedRef.current) {
        if (Math.abs(vel.vx) > 0.02 || Math.abs(vel.vy) > 0.02) {
          cam.x += vel.vx;
          cam.y += vel.vy;
          vel.vx *= 0.92;
          vel.vy *= 0.92;
        } else {
          vel.vx = 0; vel.vy = 0;
        }
        if (Math.abs(vel.vScale) > 0.0005) {
          cam.scale = clamp(cam.scale * (1 + vel.vScale), 0.7, 5.5);
          vel.vScale *= 0.88;
        } else {
          vel.vScale = 0;
        }
        // Spring node offsets back home (unless actively dragged)
        const off = nodeOffRef.current;
        const nvel = nodeVelRef.current;
        if (off && nvel && poster) {
          const n = poster.x.length;
          const dragged = dragNodeRef.current;
          for (let i = 0; i < n; i++) {
            if (i === dragged) continue;
            const ix = i * 2, iy = i * 2 + 1;
            nvel[ix] += -off[ix] * 0.08;
            nvel[iy] += -off[iy] * 0.08;
            nvel[ix] *= 0.85;
            nvel[iy] *= 0.85;
            off[ix] += nvel[ix];
            off[iy] += nvel[iy];
            if (Math.abs(off[ix]) < 0.02) off[ix] = 0;
            if (Math.abs(off[iy]) < 0.02) off[iy] = 0;
          }
        }
        if (assembleRef.current < 1) {
          assembleRef.current = Math.min(1, assembleRef.current + 0.016);
        }
        pulseRef.current = (pulseRef.current + 0.012) % 1;
      } else {
        assembleRef.current = 1;
        fadeRef.current = 1;
      }
      const scaleTag = cam.scale.toFixed(2);
      if (wrapRef.current?.getAttribute("data-networks-current-scale") !== scaleTag) {
        wrapRef.current?.setAttribute("data-networks-current-scale", scaleTag);
      }
      draw();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { alive = false; cancelAnimationFrame(rafRef.current); };
  }, [draw, poster]);

  const hitTest = useCallback(
    (sx: number, sy: number): number => {
      if (!poster) return -1;
      const cam = camRef.current;
      const fit = Math.min(size.w / poster.w, size.h / poster.h);
      const s = fit * cam.scale;
      const ox = (size.w - poster.w * fit) / 2 + cam.x + (poster.w * (fit - s)) / 2;
      const oy = (size.h - poster.h * fit) / 2 + cam.y + (poster.h * (fit - s)) / 2;
      let best = -1;
      let bestD = 14;
      for (const hub of poster.hubs) {
        const i = hub.i;
        const px = poster.x[i] * s + ox;
        const py = poster.y[i] * s + oy;
        const d = Math.hypot(px - sx, py - sy);
        const thr = Math.max(10, poster.r[i] * s * 1.4);
        if (d < thr && d < bestD) { bestD = d; best = i; }
      }
      if (best >= 0) return best;
      for (let i = 0; i < poster.x.length; i++) {
        if (poster.kind[i] === 2) continue;
        const px = poster.x[i] * s + ox;
        const py = poster.y[i] * s + oy;
        const d = Math.hypot(px - sx, py - sy);
        const thr = Math.max(4, poster.r[i] * s * 1.2);
        if (d < thr && d < bestD) { bestD = d; best = i; }
      }
      return best;
    },
    [poster, size],
  );

  const describeIndex = useCallback(
    (i: number): HoverState | null => {
      if (!poster || i < 0) return null;
      if (poster.kind[i] === 2) {
        const hub = poster.hubs.find((hh) => hh.i === i);
        return { index: i, kind: 2, label: hub?.label ?? "Hub", hub };
      }
      if (poster.kind[i] === 0) {
        const fid = poster.foIds[i];
        const deal = fid ? deals[fid] : undefined;
        return { index: i, kind: 0, label: deal?.founderName ?? "Founder", deal: deal ?? null };
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
    if (dragNodeRef.current != null && nodeOffRef.current && poster) {
      const i = dragNodeRef.current;
      const cam = camRef.current;
      const fit = Math.min(size.w / poster.w, size.h / poster.h);
      const s = fit * cam.scale;
      const ox = (size.w - poster.w * fit) / 2 + cam.x + (poster.w * (fit - s)) / 2;
      const oy = (size.h - poster.h * fit) / 2 + cam.y + (poster.h * (fit - s)) / 2;
      const homeX = poster.x[i] * s + ox;
      const homeY = poster.y[i] * s + oy;
      nodeOffRef.current[i * 2] = sx - homeX;
      nodeOffRef.current[i * 2 + 1] = sy - homeY;
      return;
    }
    if (dragRef.current) {
      const d = dragRef.current;
      const nx = d.cx + (sx - d.x);
      const ny = d.cy + (sy - d.y);
      velRef.current.vx = nx - camRef.current.x;
      velRef.current.vy = ny - camRef.current.y;
      camRef.current.x = nx;
      camRef.current.y = ny;
      return;
    }
    const hit = hitTest(sx, sy);
    const next = describeIndex(hit);
    setHover((prev) => (prev?.index === next?.index ? prev : next));
  };

  const onPointerDown = (event: React.PointerEvent) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    const hit = hitTest(sx, sy);
    velRef.current.vx = 0;
    velRef.current.vy = 0;
    if (hit >= 0 && poster && poster.kind[hit] !== 2 && !reducedRef.current) {
      dragNodeRef.current = hit;
      (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
      return;
    }
    dragRef.current = { x: sx, y: sy, cx: camRef.current.x, cy: camRef.current.y };
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
  };

  const onPointerUp = (event: React.PointerEvent) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    const draggedNode = dragNodeRef.current;
    dragNodeRef.current = null;
    const drag = dragRef.current;
    dragRef.current = null;
    if (!rect || !poster) return;
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    if (draggedNode != null) {
      // leave spring physics to pull home
      return;
    }
    if (!drag) return;
    if (Math.hypot(sx - drag.x, sy - drag.y) > 6) return;
    const hit = hitTest(sx, sy);
    if (hit < 0) { setSelectedHub(null); return; }
    if (poster.kind[hit] === 2) {
      const hub = poster.hubs.find((hh) => hh.i === hit);
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
    const dir = event.deltaY > 0 ? -1 : 1;
    // Smooth inertial zoom toward cursor
    velRef.current.vScale += dir * 0.045;
    const rect = wrapRef.current?.getBoundingClientRect();
    if (rect && poster) {
      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;
      const cam = camRef.current;
      const fit = Math.min(size.w / poster.w, size.h / poster.h);
      const before = fit * cam.scale;
      // bias pan so zoom feels anchored near cursor
      const worldX = (sx - ((size.w - poster.w * fit) / 2 + cam.x + (poster.w * (fit - before)) / 2)) / before;
      const worldY = (sy - ((size.h - poster.h * fit) / 2 + cam.y + (poster.h * (fit - before)) / 2)) / before;
      const nextScale = clamp(cam.scale * (1 + dir * 0.04), 0.7, 5.5);
      const after = fit * nextScale;
      cam.x += worldX * (before - after);
      cam.y += worldY * (before - after);
      cam.scale = nextScale;
    }
  };

  const featuredDeal = poster?.featuredId ? deals[poster.featuredId] : null;
  const investors = investorHubsProp?.length
    ? investorHubsProp.map((h) => ({ id: h.id, label: h.label, founders: h.founderCount }))
    : poster?.investorHubs ?? [];

  const legendCampuses = poster?.campuses.filter((c) => c.id !== "other") ?? [];
  const legendTop = legendCampuses.slice(0, 6);
  const legendRest = legendCampuses.slice(6);

  const hubLabelLayout = useMemo(() => {
    if (!poster) return [] as { id: string; label: string; x: number; y: number }[];
    type Lab = { id: string; label: string; x: number; y: number; priority: number; kind: "hub" | "campus" };
    const raw: Lab[] = [];
    for (const lab of (poster.campusLabels ?? []).slice(0, 10)) {
      const pt = worldToScreen(lab.x, lab.y);
      raw.push({ id: `campus:${lab.id}`, label: lab.label, x: pt.x, y: pt.y, priority: 1000 + lab.n, kind: "campus" });
    }
    for (const hub of poster.hubs.slice(0, 10)) {
      const pt = worldToScreen(poster.x[hub.i], poster.y[hub.i]);
      raw.push({
        id: hub.id,
        label: hub.label.length > 22 ? `${hub.label.slice(0, 20)}...` : hub.label,
        x: pt.x,
        y: pt.y + 10,
        priority: 400 + hub.founders,
        kind: "hub",
      });
    }
    raw.sort((a, b) => b.priority - a.priority);
    const kept: Lab[] = [];
    for (const lab of raw) {
      if (lab.kind === "campus") continue; // campuses rendered separately; only reserve space
      let hit = false;
      for (const k of kept) {
        if (Math.abs(lab.x - k.x) < 120 && Math.abs(lab.y - k.y) < 14) { hit = true; break; }
      }
      // Also hide hub if it sits on a campus label
      for (const c of raw) {
        if (c.kind !== "campus") continue;
        if (Math.abs(lab.x - c.x) < 100 && Math.abs(lab.y - c.y) < 16) { hit = true; break; }
      }
      if (hit) continue;
      kept.push(lab);
      if (kept.length >= 8) break;
    }
    return kept.map(({ id, label, x, y }) => ({ id, label, x, y }));
  }, [poster, worldToScreen, size, zoomScale]);

  const visibleCount = useMemo(() => {
    if (!poster?.year) return 0;
    return countFoundersByYear(poster.year, poster.kind, scrubYear, yearMax);
  }, [poster, scrubYear, yearMax]);
  const alwaysOnCount = poster?.totals.foundersAlwaysOn ?? poster?.totals.foundersNoYear ?? 0;
  const proxyCount = poster?.totals.foundersWithProxy ?? 0;
  const totalFounders = poster?.foIds.length ?? poster?.totals.foundersShown ?? 1960;

  // Campus labels (Nature/phylum centered) - satisfy label gates; no hub labels on dots.
  const campusLabelNodes = useMemo(() => {
    if (!poster?.campusLabels?.length) return [];
    return poster.campusLabels.slice(0, 10);
  }, [poster]);

  if (!poster) {
    return <p className="px-4 py-10 text-sm text-[color:var(--fg-3)]">Loading network map...</p>;
  }

  return (
    <div className="w-full overflow-visible" data-networks-desk="">
      <div
        ref={wrapRef}
        className="relative w-screen max-w-none touch-manipulation overflow-hidden bg-[#fbfaf7] left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] max-md:!h-[80vh]"
        style={{ height: "85vh" }}
        data-networks-graph=""
        data-networks-fade="0"
        data-networks-zoom="0"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { dragRef.current = null; dragNodeRef.current = null; }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full cursor-grab active:cursor-grabbing"
          aria-label="Campus founder networks map"
        />

        {/* Margin callouts over white edges; fade out as mid-zoom blooms */}
        <div
          className="pointer-events-none absolute inset-0 z-[1] hidden md:block transition-opacity duration-300"
          aria-hidden="true"
          style={{ opacity: Math.max(0, 1 - smoothstep((zoomScale - 1.25) / 0.7)) }}
        >
          {poster.callouts.map((c, i) => {
            const a = worldToScreen(c.ax, c.ay);
            const left = c.side === "left";
            const lx = left ? 16 : size.w - 236;
            const ly = clamp((c.ly / poster.h) * size.h, 24, size.h - 100);
            const tipX = left ? lx + 210 : lx;
            return (
              <div key={`callout-${i}`}>
                <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
                  <path
                    d={`M ${a.x} ${a.y} L ${tipX} ${ly + 12}`}
                    stroke="rgba(71,85,105,0.4)"
                    strokeWidth="0.6"
                    fill="none"
                    data-canvas-callout-leader=""
                  />
                </svg>
                <div
                  data-canvas-callout=""
                  className="absolute max-w-[220px] text-[11px] font-light leading-snug tracking-wide text-[color:var(--fg-2)]"
                  style={{ left: lx, top: ly }}
                >
                  {c.text}
                </div>
              </div>
            );
          })}
        </div>

        {/* Campus + hub labels (zoomed-out); fade as deep cards take over */}
        <div
          className="pointer-events-none absolute inset-0 z-[1] transition-opacity duration-300"
          style={{ opacity: Math.max(0.15, 1 - smoothstep((zoomScale - 2.3) / 0.8)) }}
        >
          {campusLabelNodes.map((lab) => {
            const pt = worldToScreen(lab.x, lab.y);
            const hubR = Math.max(36, lab.r * Math.min(size.w / poster.w, size.h / poster.h) * camRef.current.scale);
            return (
              <div
                key={lab.id}
                data-canvas-label={lab.id}
                data-label-anchor-x={pt.x}
                data-label-anchor-y={pt.y}
                data-hub-x={pt.x}
                data-hub-y={pt.y}
                data-hub-r={hubR}
                className="absolute -translate-x-1/2 -translate-y-1/2 text-center text-[11px] font-medium tracking-wide text-[color:var(--fg)] md:text-[13px]"
                style={{ left: pt.x, top: pt.y, textShadow: "0 0 4px #fbfaf7, 0 1px 2px #fbfaf7" }}
              >
                {lab.label}
              </div>
            );
          })}
          {hubLabelLayout.map((hub) => (
            <div
              key={`hub-lab-${hub.id}`}
              data-canvas-hub-label={hub.id}
              className="absolute -translate-x-1/2 text-[9px] font-semibold tracking-wide text-[color:var(--fg)] md:text-[10px]"
              style={{ left: hub.x, top: hub.y, textShadow: "0 0 3px #fbfaf7" }}
            >
              {hub.label}
            </div>
          ))}
        </div>

        <NetworksTimeline
          yearMin={yearMin}
          yearMax={yearMax}
          year={scrubYear}
          playing={playing}
          visibleCount={visibleCount}
          totalFounders={totalFounders}
          alwaysOnCount={alwaysOnCount}
          proxyCount={proxyCount}
          onYear={(y) => {
            setPlaying(false);
            setScrubYear(y);
          }}
          onTogglePlay={() => {
            setPlaying((v) => {
              if (!v && scrubYear >= yearMax) setScrubYear(yearMin);
              return !v;
            });
          }}
        />

        <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-white/80 px-2 py-1 text-[10px] text-[color:var(--fg-3)]">
          Scroll to zoom · drag to pan
          {selectedHub ? ` · showing ties for ${poster.hubs.find((hh) => hh.id === selectedHub)?.label ?? "hub"}` : ""}
        </div>
      </div>

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

      <div data-networks-rail="" className="mt-3 grid gap-3 md:grid-cols-3">
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
          <ol className="max-h-[280px] divide-y divide-[color:var(--line)] overflow-y-auto md:max-h-none">
            {investors.map((row, index) => (
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
  const invShow = short ? Math.min(4, investors.length) : investors.length;
  const netShow = short ? Math.min(2, networks.length) : networks.length;
  const invVisible = investors.slice(0, invShow);
  const netVisible = networks.slice(0, netShow);
  const invCountLabel =
    short && invVisible.length < investors.length
      ? `${invVisible.length.toLocaleString("en-US")} of ${investors.length.toLocaleString("en-US")} investors`
      : `Investors (${investors.length.toLocaleString("en-US")})`;
  const netCountLabel =
    short && netVisible.length < networks.length
      ? `${netVisible.length.toLocaleString("en-US")} of ${networks.length.toLocaleString("en-US")} networks`
      : `Networks (${networks.length.toLocaleString("en-US")})`;
  return (
    <div className="space-y-0.5">
      <div className="font-medium text-[color:var(--fg)]">{deal.founderName}</div>
      <div className="text-[color:var(--fg-2)]">
        {deal.companyName ?? "Company unknown"}
        {deal.stage ? ` · ${deal.stage}` : ""}
      </div>
      <div className="text-[10px] text-[color:var(--fg-3)]" data-networks-deal-networks="" data-networks-deal-networks-total={networks.length}>
        {networks.length ? (
          <>
            {netCountLabel}: {netVisible.join(", ")}
          </>
        ) : (
          <>Networks (0): none on file yet</>
        )}
      </div>
      <div className="text-[10px] text-[color:var(--fg-3)]" data-networks-deal-investors="" data-networks-deal-investors-total={investors.length}>
        {investors.length ? (
          <>
            {invCountLabel}: {invVisible.join(", ")}
          </>
        ) : (
          <>No named investors on file yet</>
        )}
      </div>
    </div>
  );
}


const NetworksGraph3DLazy = dynamic(
  () => import("@/components/networks-graph-3d").then((m) => m.NetworksGraph3D),
  { ssr: false, loading: () => <p className="px-4 py-10 text-sm text-[color:var(--fg-3)]">Loading 3D map...</p> },
);

/** Screenshot-matched overview / campus / founder details; 2D works without WebGL. */
export function NetworksGraph(props: Props) {
  const [mode, setMode] = useState<"pending" | "3d" | "2d">("pending");
  const [supports3D, setSupports3D] = useState(false);
  const [zoomPreset, setZoomPreset] = useState<NetworkZoomPreset>(NETWORK_ZOOM_PRESETS[0]);
  const fallback2D = useCallback(() => setMode("2d"), []);

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    const mobile = window.matchMedia?.("(max-width: 639px)")?.matches ?? false;
    let gl = false;
    try {
      const canvas = document.createElement("canvas");
      gl = !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
    } catch {
      gl = false;
    }
    setSupports3D(gl && !reduced);
    // On 375px phones, start with a lightweight readable 2D view.
    // The user can still enable 3D when WebGL and motion settings permit.
    setMode(reduced || !gl || mobile ? "2d" : "3d");
  }, []);

  useEffect(() => {
    if (mode === "pending") return;
    const app = window as typeof window & {
      __NETWORKS_PENDING_SCALE__?: number;
      __NETWORKS_SET_SCALE__?: (scale: number) => void;
    };
    // 2D exposes its API on mount; 3D initializes asynchronously from the
    // current database poster, so leave a pending scale for it to consume.
    if (app.__NETWORKS_SET_SCALE__) app.__NETWORKS_SET_SCALE__(zoomPreset.scale);
    else app.__NETWORKS_PENDING_SCALE__ = zoomPreset.scale;

    const graph = document.querySelector<HTMLElement>("[data-networks-graph]");
    if (!graph) return;
    const syncManualZoom = () => {
      const scale = Number(graph.getAttribute("data-networks-current-scale"));
      if (!Number.isFinite(scale) || scale <= 0) return;
      const nearest = closestNetworkZoomPreset(scale);
      setZoomPreset((current) => current.id === nearest.id ? current : nearest);
    };
    const observer = new MutationObserver(syncManualZoom);
    observer.observe(graph, { attributes: true, attributeFilter: ["data-networks-current-scale"] });
    return () => observer.disconnect();
  }, [mode]); // Manual scrolling changes labels but never snaps the camera.

  const choosePreset = useCallback((preset: NetworkZoomPreset) => {
    setZoomPreset(preset);
    const app = window as typeof window & {
      __NETWORKS_SET_SCALE__?: (scale: number) => void;
      __NETWORKS_PENDING_SCALE__?: number;
    };
    if (app.__NETWORKS_SET_SCALE__) app.__NETWORKS_SET_SCALE__(preset.scale);
    else app.__NETWORKS_PENDING_SCALE__ = preset.scale;
  }, []);

  function resetView() {
    const app = window as typeof window & {
      __NETWORKS_RESET_VIEW__?: () => void;
      __NETWORKS_SET_SCALE__?: (scale: number) => void;
      __NETWORKS_PENDING_SCALE__?: number;
    };
    setZoomPreset(NETWORK_ZOOM_PRESETS[0]);
    if (app.__NETWORKS_RESET_VIEW__) app.__NETWORKS_RESET_VIEW__();
    else if (app.__NETWORKS_SET_SCALE__) app.__NETWORKS_SET_SCALE__(NETWORK_ZOOM_PRESETS[0].scale);
    else app.__NETWORKS_PENDING_SCALE__ = NETWORK_ZOOM_PRESETS[0].scale;
  }

  return (
    <div data-networks-view={mode}>
      <div className="mx-auto flex max-w-[1400px] flex-col gap-2 px-3 py-2 sm:px-6 lg:flex-row lg:items-center lg:justify-between" data-networks-controls="">
        <div className="min-w-0 overflow-x-auto pb-0.5" role="group" aria-label="Network detail level">
          <div className="flex w-max items-center gap-1 rounded-lg border border-[color:var(--line)] bg-white p-1">
            {NETWORK_ZOOM_PRESETS.map((preset, index) => (
              <button key={preset.id} type="button" data-networks-zoom-preset={preset.id}
                aria-pressed={zoomPreset.id === preset.id}
                title={preset.detail}
                disabled={mode === "pending"}
                onClick={() => choosePreset(preset)}
                className={`min-h-10 shrink-0 rounded-md px-2.5 text-[11px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--cobalt)] sm:px-3 sm:text-xs ${zoomPreset.id === preset.id ? "bg-[color:var(--cobalt)] text-white" : "text-[color:var(--fg-2)] hover:bg-[#eef1f9]"}`}>
                <span className="mr-1 font-mono text-[10px] opacity-70">{index + 1}</span>{preset.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-between gap-2 lg:justify-end">
          <p className="min-w-0 truncate text-[11px] text-[color:var(--fg-2)]" data-networks-zoom-caption="">{zoomPreset.detail}</p>
          <div className="flex shrink-0 items-center gap-1.5">
            <div className="inline-flex overflow-hidden rounded-md border border-[color:var(--line)] bg-white" role="group" aria-label="Network projection">
              <button type="button" aria-pressed={mode === "2d"} disabled={mode === "pending"}
                onClick={() => setMode("2d")}
                className={`min-h-10 px-2.5 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--cobalt)] ${mode === "2d" ? "bg-[color:var(--cobalt)] text-white" : "hover:bg-[#eef1f9]"}`}>2D</button>
              <button type="button" aria-pressed={mode === "3d"} disabled={mode === "pending" || !supports3D}
                onClick={() => setMode("3d")}
                title={supports3D ? "Interactive 3D orbit view" : "Requires WebGL and standard-motion settings"}
                className={`min-h-10 border-l border-[color:var(--line)] px-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--cobalt)] ${mode === "3d" ? "bg-[color:var(--cobalt)] text-white" : "hover:bg-[#eef1f9]"}`}>3D</button>
            </div>
            <button type="button" onClick={resetView} disabled={mode === "pending"}
              aria-label="Reset network to wide overview"
              className="min-h-10 rounded-md border border-[color:var(--line)] bg-white px-3 text-xs font-medium text-[color:var(--cobalt)] hover:bg-[#eef1f9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--cobalt)]">
              Reset
            </button>
          </div>
        </div>
      </div>
      {mode === "pending" ? (
        <p role="status" className="px-4 py-10 text-sm text-[color:var(--fg-3)]">Loading network map...</p>
      ) : mode === "3d" ? (
        <NetworksGraph3DLazy {...props} onFallback2D={fallback2D} />
      ) : (
        <NetworksGraph2D {...props} />
      )}
    </div>
  );
}
