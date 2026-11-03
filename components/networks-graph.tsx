"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

type PosterCampus = { id: string; label: string; color: string; n: number };
type PosterHub = { id: string; label: string; kind: string; i: number; founders: number };
type PosterCampusLabel = { id: string; label: string; n: number; x: number; y: number; r: number };
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
    foundersShown?: number;
    companiesShown?: number;
  };
  campuses: PosterCampus[];
  hubs: PosterHub[];
  campusLabels?: PosterCampusLabel[];
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
  const t0Ref = useRef(0);
  const fadeRef = useRef(0);
  const reducedRef = useRef(false);
  const glowSpriteRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const grainRef = useRef<HTMLCanvasElement | null>(null);
  const trailRef = useRef<Map<number, { x: number; y: number }[]>>(new Map());
  const popRef = useRef<Map<number, number>>(new Map());
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
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      setSize({ w: Math.max(280, Math.floor(rect.width)), h: Math.max(280, Math.floor(rect.height)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    reducedRef.current = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  }, []);

  useEffect(() => { hoverRef.current = hover; }, [hover]);
  useEffect(() => { selectedRef.current = selectedHub; }, [selectedHub]);

  const founderCount = poster?.foIds.length ?? 0;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (poster) (window as unknown as { __NETWORKS_POSTER__?: Poster }).__NETWORKS_POSTER__ = poster;
    return () => { delete (window as unknown as { __NETWORKS_POSTER__?: Poster }).__NETWORKS_POSTER__; };
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
    const key = soft ? color + ":s" : color;
    const cached = glowSpriteRef.current.get(key);
    if (cached) return cached;
    const c = document.createElement("canvas");
    c.width = 64; c.height = 64;
    const g = c.getContext("2d")!;
    const rgb = hexToRgb(color);
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 30);
    if (soft) {
      grd.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.55)`);
      grd.addColorStop(0.35, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.22)`);
      grd.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
    } else {
      grd.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.9)`);
      grd.addColorStop(0.5, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.35)`);
      grd.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
    }
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
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
    if (!reduced) fadeRef.current = Math.min(1, fadeRef.current + 0.018);
    else fadeRef.current = 1;
    const fade = fadeRef.current;

    // Warm off-white base
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#fbfaf7";
    ctx.fillRect(0, 0, w, h);

    const cam = camRef.current;
    const fit = Math.min(w / p.w, h / p.h);
    const s = fit * cam.scale;
    const ox = (w - p.w * fit) / 2 + cam.x + (p.w * (fit - s)) / 2;
    const oy = (h - p.h * fit) / 2 + cam.y + (p.h * (fit - s)) / 2;
    const toS = (wx: number, wy: number, i = -1) => {
      let dx = 0, dy = 0;
      if (!reduced && i >= 0) {
        const seed = hash01(String(i));
        dx = Math.sin(t * 0.35 + seed * 12.5) * (1.1 + seed);
        dy = Math.cos(t * 0.28 + seed * 9.1) * (0.9 + seed * 0.8);
      }
      return { x: wx * s + ox + dx, y: wy * s + oy + dy };
    };

    const sel = selectedRef.current;
    const hv = hoverRef.current;
    const focusHub = sel || (hv?.hub?.id ?? null);
    const focusNode = hv?.index ?? -1;

    // Zoom tiers: crisp (out) -> bloom (mid) -> cards (deep)
    const bloom = reduced ? 0 : smoothstep((cam.scale - 1.25) / 1.1);
    const deep = reduced ? 0 : smoothstep((cam.scale - 2.4) / 1.2);
    const crisp = 1 - bloom;

    // Nebula campus clouds (always faint; stronger as bloom rises)
    for (let ci = 0; ci < p.campuses.length; ci++) {
      let sx = 0, sy = 0, n = 0;
      for (let i = 0; i < p.x.length; i++) {
        if (p.kind[i] !== 0 || p.campus[i] !== ci) continue;
        sx += p.x[i]; sy += p.y[i]; n += 1;
      }
      if (!n) continue;
      const home = toS(sx / n, sy / n);
      const breathe = reduced ? 1 : 1 + Math.sin(t * 0.4 + ci) * 0.04;
      const rad = (28 + Math.sqrt(n) * 4.2) * s * breathe * (0.85 + bloom * 0.55);
      const sprite = getGlowSprite(p.campuses[ci].color, true);
      ctx.globalAlpha = (0.1 + bloom * 0.28) * fade;
      ctx.drawImage(sprite, home.x - rad, home.y - rad, rad * 2, rad * 2);
      ctx.globalAlpha = 1;
    }

    // Edges: fine web, campus-colored, brighten on hover
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
      const hubA = p.kind[a] === 2, hubB = p.kind[b] === 2;
      const hubIdx = hubA ? a : hubB ? b : -1;
      const hubId = hubIdx >= 0 ? p.hubs.find((hh) => hh.i === hubIdx)?.id : null;
      if (hubId === "yc" && !focusHub) {
        if (hash01(`yc:${a}:${b}`) > YC_EDGE_CAP) continue;
      } else if (hubId === "yc" && focusHub && focusHub !== "yc") continue;
      if (focusHub && hubId && hubId !== focusHub && k === 1) continue;

      const pa = toS(p.x[a], p.y[a], a);
      const pb = toS(p.x[b], p.y[b], b);
      const { cx, cy } = curvedPath(pa.x, pa.y, pb.x, pb.y, 0.9 + bloom * 0.4);
      let color = "#94a3b8";
      const campI = p.campus[p.kind[a] === 0 ? a : p.kind[b] === 0 ? b : a];
      if (campI >= 0 && p.campuses[campI]) color = p.campuses[campI].color;
      const rgb = hexToRgb(color);
      const campA = p.campus[a], campB = p.campus[b];
      const crossCamp = campA >= 0 && campB >= 0 && campA !== campB;
      let alpha = k === 2 ? 0.1 : k === 1 ? 0.07 : k === 3 ? 0.05 : crossCamp ? 0.11 : 0.08;
      let lineW = k === 2 ? 0.7 : 0.55;
      if (hubId === "yc" && !focusHub) { alpha = 0.035; lineW = 0.4; }
      if (hubId && focusHub === hubId) { alpha = 0.28; lineW = 0.95; }
      else if (focusNode === a || focusNode === b) { alpha = Math.min(0.35, alpha * 3.2); lineW = 0.95; }
      alpha *= (0.55 + crisp * 0.45) * fade;
      ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
      ctx.lineWidth = lineW;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.quadraticCurveTo(cx, cy, pb.x, pb.y);
      ctx.stroke();
    }

    // Mid-zoom dashed arcs between major campus labels
    if (bloom > 0.05 && p.campusLabels) {
      const labs = p.campusLabels.slice(0, 8);
      ctx.setLineDash([3, 5]);
      ctx.lineWidth = 0.7;
      for (let i = 0; i < labs.length; i++) {
        for (let j = i + 1; j < Math.min(labs.length, i + 3); j++) {
          const a = toS(labs[i].x, labs[i].y);
          const b = toS(labs[j].x, labs[j].y);
          const { cx, cy } = curvedPath(a.x, a.y, b.x, b.y, 1.4);
          ctx.strokeStyle = `rgba(30,41,59,${0.12 * bloom * fade})`;
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
      const pt = toS(p.x[i], p.y[i], i);
      if (pt.x < -40 || pt.y < -40 || pt.x > w + 40 || pt.y > h + 40) continue;
      const baseR = Math.max(1.2, Math.min(5.5, p.r[i] * s));
      const bloomR = baseR * (1 + bloom * (6 + hash01(String(i)) * 10));

      if (p.kind[i] === 2) {
        // Hub: dark seed + short tapering trail
        if (!reduced && bloom > 0.2) {
          const trail = trailRef.current.get(i) ?? [];
          trail.push({ x: pt.x, y: pt.y });
          if (trail.length > 8) trail.shift();
          trailRef.current.set(i, trail);
          for (let ti = 1; ti < trail.length; ti++) {
            const a0 = trail[ti - 1], a1 = trail[ti];
            ctx.strokeStyle = `rgba(15,23,42,${0.08 * bloom * (ti / trail.length) * fade})`;
            ctx.lineWidth = 0.6 * (ti / trail.length);
            ctx.beginPath(); ctx.moveTo(a0.x, a0.y); ctx.lineTo(a1.x, a1.y); ctx.stroke();
          }
        }
        ctx.beginPath();
        ctx.fillStyle = `rgba(15,23,42,${0.88 * fade})`;
        ctx.arc(pt.x, pt.y, Math.max(2.2, baseR), 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      const ci = p.campus[i];
      const col = ci >= 0 && p.campuses[ci] ? p.campuses[ci].color : "#94a3b8";
      const rgb = hexToRgb(col);

      // Bloom watercolor blob via pre-rendered radial sprite
      if (bloom > 0.02) {
        const sprite = getGlowSprite(col, true);
        const rad = bloomR;
        ctx.globalAlpha = (0.18 + bloom * 0.45) * fade * (p.kind[i] === 0 ? 1 : 0.75);
        ctx.drawImage(sprite, pt.x - rad, pt.y - rad, rad * 2, rad * 2);
        ctx.globalAlpha = 1;
      }

      // Crisp tiny translucent dot
      const dotR = Math.max(1.1, Math.min(3.2, baseR));
      ctx.beginPath();
      ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${(0.55 + crisp * 0.3) * fade})`;
      ctx.arc(pt.x, pt.y, dotR * (p.kind[i] === 0 ? 1 : 0.9), 0, Math.PI * 2);
      ctx.fill();
      if (crisp > 0.4) {
        ctx.beginPath();
        ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${0.18 * crisp * fade})`;
        ctx.arc(pt.x, pt.y, dotR * 2.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Mid-zoom tracking boxes + monospace labels on campus clusters
    if (bloom > 0.08 && p.campusLabels) {
      ctx.save();
      ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
      for (const lab of p.campusLabels.slice(0, 12)) {
        const pt = toS(lab.x, lab.y);
        const box = Math.max(28, lab.r * s * 0.55) * (0.85 + bloom * 0.35);
        ctx.globalAlpha = 0.55 * bloom * fade;
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 0.8;
        ctx.strokeRect(pt.x - box / 2, pt.y - box / 2, box, box);
        ctx.globalAlpha = 0.75 * bloom * fade;
        ctx.fillStyle = "#0f172a";
        const text = `${lab.label} · ${lab.n.toLocaleString("en-US")}`;
        ctx.fillText(text, pt.x - box / 2, pt.y - box / 2 - 4);
        ctx.beginPath();
        ctx.fillStyle = "#0f172a";
        ctx.arc(pt.x, pt.y, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Deep zoom: pop-in founder/company cards along arcs (quadtree cull)
    if (deep > 0.05) {
      const qt = new QuadTree(-200, -200, p.w + 400, p.h + 400);
      for (let i = 0; i < p.x.length; i++) {
        if (p.kind[i] === 2) continue;
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
      const maxCards = 18;
      ctx.save();
      for (let hi = 0; hi < Math.min(maxCards, hits.length); hi++) {
        const hit = hits[hi];
        const pt = toS(hit.x, hit.y, hit.i);
        let pop = popRef.current.get(hit.i) ?? 0;
        if (!reduced) pop = Math.min(1, pop + 0.08);
        else pop = 1;
        popRef.current.set(hit.i, pop);
        // slight spring ease
        const ease = 1 - Math.pow(1 - pop, 3);
        const scalePop = 0.9 + 0.1 * ease;
        let title = "Founder";
        let sub = "";
        if (p.kind[hit.i] === 0) {
          const fid = p.foIds[hit.i];
          const deal = fid ? deals[fid] : null;
          title = deal?.founderName ?? "Founder";
          sub = deal?.companyName ?? "";
        } else {
          const cid = p.coIds[hit.i - founderCount];
          title = cid ? (deals[Object.keys(deals).find((k) => deals[k].companyId === cid) || ""]?.companyName ?? "Company") : "Company";
        }
        const bw = 118 * scalePop, bh = 36 * scalePop;
        ctx.globalAlpha = deep * ease * fade;
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.strokeStyle = "rgba(15,23,42,0.35)";
        ctx.lineWidth = 0.8;
        ctx.fillRect(pt.x + 8, pt.y - bh / 2, bw, bh);
        ctx.strokeRect(pt.x + 8, pt.y - bh / 2, bw, bh);
        ctx.fillStyle = "#0f172a";
        ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillText(title.slice(0, 18), pt.x + 14, pt.y - 2);
        if (sub) {
          ctx.fillStyle = "#64748b";
          ctx.fillText(sub.slice(0, 18), pt.x + 14, pt.y + 11);
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
  }, [poster, size, deals, founderCount]);

  // Ambient animation loop
  useEffect(() => {
    let alive = true;
    const loop = () => {
      if (!alive) return;
      draw();
      if (!reducedRef.current) rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { alive = false; cancelAnimationFrame(rafRef.current); };
  }, [draw]);

  useEffect(() => {
    // redraw on hover/select even under reduced motion
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
    if (dragRef.current) {
      const d = dragRef.current;
      camRef.current.x = d.cx + (sx - d.x);
      camRef.current.y = d.cy + (sy - d.y);
      bump((n) => n + 1);
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
    const cam = camRef.current;
    const factor = event.deltaY > 0 ? 0.92 : 1.08;
    cam.scale = clamp(cam.scale * factor, 0.7, 5.5);
    bump((n) => n + 1);
  };

  const featuredDeal = poster?.featuredId ? deals[poster.featuredId] : null;
  const investors = investorHubsProp?.length
    ? investorHubsProp.map((h) => ({ id: h.id, label: h.label, founders: h.founderCount }))
    : poster?.investorHubs ?? [];

  const legendCampuses = poster?.campuses.filter((c) => c.id !== "other") ?? [];
  const legendTop = legendCampuses.slice(0, 6);
  const legendRest = legendCampuses.slice(6);

  // Campus labels (Nature/phylum centered) — satisfy label gates; no hub labels on dots.
  const campusLabelNodes = useMemo(() => {
    if (!poster?.campusLabels?.length) return [];
    return poster.campusLabels.slice(0, 10);
  }, [poster]);

  if (!poster) {
    return <p className="px-4 py-10 text-sm text-[color:var(--fg-3)]">Loading network map...</p>;
  }

  return (
    <div className="w-full" data-networks-desk="">
      <div
        ref={wrapRef}
        className="relative w-full touch-manipulation overflow-hidden bg-[#fbfaf7] max-md:!h-[52vh]"
        style={{ height: "min(85vh, calc(100dvh - 24rem))" }}
        data-networks-graph=""
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { dragRef.current = null; }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full cursor-grab active:cursor-grabbing"
          aria-label="Campus founder networks map"
        />

        {/* Margin callouts with light airy type */}
        <div className="pointer-events-none absolute inset-0 z-[1] hidden md:block" aria-hidden="true">
          {poster.callouts.map((c, i) => {
            const a = worldToScreen(c.ax, c.ay);
            const left = c.side === "left";
            const lx = left ? 10 : size.w - 226;
            const ly = clamp((c.ly / poster.h) * size.h, 18, size.h - 92);
            const tipX = left ? lx + 206 : lx;
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
                  className="absolute max-w-[210px] text-[11px] font-light leading-snug tracking-wide text-[color:var(--fg-2)]"
                  style={{ left: lx, top: ly }}
                >
                  {c.text}
                </div>
              </div>
            );
          })}
        </div>

        {/* Campus labels centered on clusters (no hub labels on dots) */}
        <div className="pointer-events-none absolute inset-0 z-[1]">
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
                className="absolute -translate-x-1/2 -translate-y-1/2 text-center text-[11px] font-medium tracking-wide text-[color:var(--fg)] md:text-[12px]"
                style={{ left: pt.x, top: pt.y, textShadow: "0 0 4px #fbfaf7, 0 1px 2px #fbfaf7" }}
              >
                {lab.label}
              </div>
            );
          })}
        </div>

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
