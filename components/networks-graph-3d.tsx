"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  YEAR_MIN_DEFAULT,
  cohortYearNow,
  countFoundersByYear,
  founderVisibleAtYear,
  type Deal,
  type Poster,
  type PosterCampusLabel,
  type PosterHub,
} from "@/components/networks-poster-types";
import { NetworksTimeline } from "@/components/networks-timeline";

type Props = {
  investorHubs?: { id: string; label: string; founderCount: number; companyCount?: number }[];
  onSelectCompany?: (id: string) => void;
  onSelectNetwork?: (id: string) => void;
  onFallback2D?: () => void;
};

type OverlayLabel = {
  id: string;
  label: string;
  x: number;
  y: number;
  priority: number;
  kind: "campus" | "hub";
  n?: number;
};

type TrackBox = { id: string; label: string; x: number; y: number; box: number; n: number };
type ArcSeg = { x1: number; y1: number; x2: number; y2: number; cx: number; cy: number };
type Card = {
  key: string;
  x: number;
  y: number;
  dotX: number;
  dotY: number;
  title: string;
  school: string;
  company: string;
};
type MediaCard = {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  hue: string;
  pop: number;
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}
function smoothstep(t: number) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/** Zoom stage weights (crossfade). White bg at every stage. */
/** /networks canvas fill — single CSS var so cream/white can flip later. */
function networksBgHex(el?: HTMLElement | null): number {
  const raw = (el ? getComputedStyle(el).getPropertyValue("--networks-bg") : "").trim() || "#ece9e4";
  const h = raw.replace("#", "");
  if (h.length === 3) {
    return parseInt(h[0] + h[0] + h[1] + h[1] + h[2] + h[2], 16);
  }
  if (h.length >= 6) return parseInt(h.slice(0, 6), 16);
  return 0xece9e4;
}

function stageWeights(scale: number) {
  const outW = 1 - smoothstep((scale - 1.05) / 0.55);
  const midW = smoothstep((scale - 1.05) / 0.5) * (1 - smoothstep((scale - 2.15) / 0.5));
  const cardW = smoothstep((scale - 2.05) / 0.45) * (1 - smoothstep((scale - 3.05) / 0.45));
  const deepW = smoothstep((scale - 2.9) / 0.5);
  const tier = deepW > 0.55 ? 3 : cardW > 0.4 ? 2 : midW > 0.35 ? 1 : 0;
  return { outW, midW, cardW, deepW, tier };
}
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  if (h.length === 3) {
    return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
  }
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}
function distToScale(dist: number): number {
  const t = clamp((1100 - dist) / 900, 0, 1);
  return 0.7 + t * 4.8;
}
function scaleToDist(scale: number): number {
  const t = clamp((scale - 0.7) / 4.8, 0, 1);
  return 1100 - t * 900;
}
function curved(x1: number, y1: number, x2: number, y2: number, bendScale = 1.4) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const bend = Math.min(40, len * 0.22) * bendScale;
  return { cx: mx - (dy / len) * bend, cy: my + (dx / len) * bend };
}

function makeGlowTexture(THREE: typeof import("three"), color: [number, number, number], soft = true) {
  const size = soft ? 128 : 64;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  const [r, gch, b] = color;
  if (soft) {
    grd.addColorStop(0, `rgba(${r},${gch},${b},1)`);
    grd.addColorStop(0.25, `rgba(${r},${gch},${b},0.55)`);
    grd.addColorStop(0.55, `rgba(${r},${gch},${b},0.18)`);
    grd.addColorStop(1, `rgba(${r},${gch},${b},0)`);
  } else {
    grd.addColorStop(0, `rgba(${r},${gch},${b},1)`);
    grd.addColorStop(0.45, `rgba(${r},${gch},${b},0.85)`);
    grd.addColorStop(0.7, `rgba(${r},${gch},${b},0.25)`);
    grd.addColorStop(1, `rgba(${r},${gch},${b},0)`);
  }
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function collideLabels(raw: OverlayLabel[], maxShow = 18): OverlayLabel[] {
  // Campuses first (higher priority already), then hubs; hide lower-priority on AABB overlap.
  const sorted = [...raw].sort((a, b) => b.priority - a.priority || a.label.localeCompare(b.label));
  const kept: OverlayLabel[] = [];
  const approxW = (lab: OverlayLabel) => Math.min(180, 10 + lab.label.length * (lab.kind === "campus" ? 7.8 : 6.6));
  const approxH = (lab: OverlayLabel) => (lab.kind === "campus" ? 20 : 15);
  for (const lab of sorted) {
    const lw = approxW(lab);
    const lh = approxH(lab);
    const l = lab.x - lw / 2;
    const r = lab.x + lw / 2;
    const top = lab.y - lh / 2;
    const bot = lab.y + lh / 2;
    let hit = false;
    for (const k of kept) {
      const kw = approxW(k);
      const kh = approxH(k);
      const kl = k.x - kw / 2;
      const kr = k.x + kw / 2;
      const kt = k.y - kh / 2;
      const kb = k.y + kh / 2;
      if (l < kr + 10 && r > kl - 10 && top < kb + 8 && bot > kt - 8) {
        hit = true;
        break;
      }
    }
    if (hit) continue;
    kept.push(lab);
    if (kept.length >= maxShow) break;
  }
  return kept;
}

function collideTrackBoxes(boxes: TrackBox[], maxShow = 6): TrackBox[] {
  const sorted = [...boxes].sort((a, b) => b.n - a.n);
  const kept: TrackBox[] = [];
  for (const b of sorted) {
    const half = b.box / 2 + 18; // include monospace label above
    const hit = kept.some((k) => {
      const kh = k.box / 2 + 18;
      return Math.abs(b.x - k.x) < half + kh && Math.abs(b.y - k.y) < half + kh;
    });
    if (hit) continue;
    kept.push(b);
    if (kept.length >= maxShow) break;
  }
  return kept;
}

export function NetworksGraph3D({ investorHubs, onSelectNetwork, onFallback2D }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const [poster, setPoster] = useState<Poster | null>(null);
  const [deals, setDeals] = useState<Record<string, Deal>>({});
  const [legendOtherOpen, setLegendOtherOpen] = useState(false);
  const yearMax = cohortYearNow();
  const yearMin = YEAR_MIN_DEFAULT;
  const [scrubYear, setScrubYear] = useState(yearMax);
  const [playing, setPlaying] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  const [labels, setLabels] = useState<OverlayLabel[]>([]);
  const [trackBoxes, setTrackBoxes] = useState<TrackBox[]>([]);
  const [arcs, setArcs] = useState<ArcSeg[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [mediaCards, setMediaCards] = useState<MediaCard[]>([]);
  const scrubRef = useRef(scrubYear);
  const dealsRef = useRef(deals);
  const fallbackRef = useRef(onFallback2D);
  const playRef = useRef(false);
  const idleRef = useRef(0);
  const tierRef = useRef(0);
  const apiRef = useRef<{
    applyYear: (y: number) => void;
    setBloom: (b: number) => void;
    setDeep: (d: number) => void;
    setStages: (outW: number, midW: number, cardW: number, deepW: number, tSec: number) => void;
  } | null>(null);

  useEffect(() => {
    scrubRef.current = scrubYear;
    apiRef.current?.applyYear(scrubYear);
  }, [scrubYear]);
  useEffect(() => {
    dealsRef.current = deals;
  }, [deals]);
  useEffect(() => {
    fallbackRef.current = onFallback2D;
  }, [onFallback2D]);
  useEffect(() => {
    playRef.current = playing;
  }, [playing]);

  useEffect(() => {
    let cancelled = false;
    fetch("/data/founder-networks-poster.json")
      .then((r) => {
        if (!r.ok) throw new Error("poster missing");
        return r.json();
      })
      .then((p: Poster) => {
        if (!cancelled) setPoster(p);
      })
      .catch(() => {
        if (!cancelled) fallbackRef.current?.();
      });
    fetch("/data/founder-networks-deals.json")
      .then((r) => r.json())
      .then((data: { deals?: Record<string, Deal> }) => {
        if (!cancelled) setDeals(data.deals ?? {});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [onFallback2D]);

  const totalFounders = poster?.foIds.length ?? poster?.totals.foundersShown ?? 1960;
  const alwaysOnCount = poster?.totals.foundersAlwaysOn ?? poster?.totals.foundersNoYear ?? 0;
  const proxyCount = poster?.totals.foundersWithProxy ?? 0;
  const visibleCount = useMemo(() => {
    if (!poster?.year) return totalFounders;
    return countFoundersByYear(poster.year, poster.kind, scrubYear, yearMax);
  }, [poster, scrubYear, yearMax, totalFounders]);

  useEffect(() => {
    if (!poster || !mountRef.current) return;
    let disposed = false;
    let raf = 0;
    let renderer: import("three").WebGLRenderer | null = null;
    let controls: {
      dispose: () => void;
      update: () => void;
      autoRotate: boolean;
      target: import("three").Vector3;
      enableDamping: boolean;
    } | null = null;

    (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      if (disposed || !mountRef.current) return;
      const p = poster;
      const el = mountRef.current;

      try {
        renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
          preserveDrawingBuffer: true,
        });
      } catch {
        fallbackRef.current?.();
        return;
      }

      const w0 = el.clientWidth || 800;
      const h0 = el.clientHeight || 600;
      const bgHex = networksBgHex(wrapRef.current);
      renderer.setClearColor(bgHex, 1);
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(w0, h0, false);
      el.appendChild(renderer.domElement);
      Object.assign(renderer.domElement.style, { display: "block", width: "100%", height: "100%", cursor: "grab", touchAction: "none" });

      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(bgHex, 0.00014);
      scene.background = new THREE.Color(bgHex);

      const camera = new THREE.PerspectiveCamera(42, w0 / h0, 1, 5000);
      const cx = p.w / 2;
      const cy = p.h / 2;
      camera.position.set(cx, cy - 40, 1180);
      camera.up.set(0, 0, 1);

      const ctrl = new OrbitControls(camera, renderer.domElement);
      ctrl.target.set(cx, cy, 0);
      ctrl.enableDamping = true;
      ctrl.dampingFactor = 0.07;
      ctrl.enablePan = false;
      ctrl.enableRotate = true;
      ctrl.enableZoom = true;
      ctrl.autoRotate = false;
      ctrl.autoRotateSpeed = 0.22; // gentle idle drift
      ctrl.minDistance = 160;
      ctrl.maxDistance = 1600;
      ctrl.rotateSpeed = 0.55;
      ctrl.zoomSpeed = 0.85;
      // Desktop drag = orbit; mobile one-finger orbit, pinch zoom
      // TOUCH enums: 0=ROTATE, 1=PAN, 2=DOLLY_PAN, 3=DOLLY_ROTATE
      ctrl.touches.ONE = 0 as unknown as typeof ctrl.touches.ONE;
      ctrl.touches.TWO = 2 as unknown as typeof ctrl.touches.TWO;
      controls = ctrl;

      scene.add(new THREE.AmbientLight(0xffffff, 0.95));
      scene.add(new THREE.HemisphereLight(0xffffff, 0xe8e4dc, 0.4));

      const zArr = p.z ?? p.x.map(() => 0);
      const yearArr = p.year ?? p.x.map(() => 0);
      const n = p.x.length;

      // ---- Additive colored founder/company/hub points ----
      const positions = new Float32Array(n * 3);
      const colors = new Float32Array(n * 3);
      const sizes = new Float32Array(n);
      const baseSize = new Float32Array(n);
      // Nature/phylum air: gently expand islands from centroid + deepen Z for orbit
      const spread = 1.12;
      for (let i = 0; i < n; i++) {
        positions[i * 3] = cx + (p.x[i] - cx) * spread;
        positions[i * 3 + 1] = cy + (p.y[i] - cy) * spread;
        positions[i * 3 + 2] = (zArr[i] || 0) * 1.55;
        let rgb: [number, number, number] = [148, 163, 184];
        if (p.kind[i] === 0) {
          const ci = p.campus[i];
          rgb = ci >= 0 && p.campuses[ci] ? hexToRgb(p.campuses[ci].color) : [148, 163, 184];
          const mx = Math.max(rgb[0], rgb[1], rgb[2]) || 1;
          rgb = [
            Math.min(255, Math.round(rgb[0] + (rgb[0] / mx) * 28 + 8)),
            Math.min(255, Math.round(rgb[1] + (rgb[1] / mx) * 28 + 8)),
            Math.min(255, Math.round(rgb[2] + (rgb[2] / mx) * 28 + 8)),
          ];
          // Spec from mid/Nature refs: small soft dots (~3–5px runs)
          baseSize[i] = 3.8 + Math.min(2.6, p.r[i] * 0.4);
        } else if (p.kind[i] === 1) {
          rgb = [120, 130, 145];
          baseSize[i] = 1.6;
        } else {
          rgb = [40, 48, 62];
          baseSize[i] = 4.2;
        }
        sizes[i] = baseSize[i];
        colors[i * 3] = rgb[0] / 255;
        colors[i * 3 + 1] = rgb[1] / 255;
        colors[i * 3 + 2] = rgb[2] / 255;
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      geo.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

      const glowTex = makeGlowTexture(THREE, [255, 255, 255], true);
      const pointMat = new THREE.ShaderMaterial({
        uniforms: {
          uTexture: { value: glowTex },
          uOpacity: { value: 0.78 },
          uScale: { value: 240 },
          uPixelRatio: { value: renderer.getPixelRatio() },
        },
        vertexShader: `
          attribute float size;
          attribute vec3 color;
          varying vec3 vColor;
          varying float vAlpha;
          uniform float uScale;
          uniform float uPixelRatio;
          void main() {
            vColor = color;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            float dist = max(40.0, -mv.z);
            // Target ~3-6 CSS px on screen at resting distance
            gl_PointSize = clamp(size * uScale / dist, 5.0, 20.0) * uPixelRatio;
            vAlpha = size < 0.05 ? 0.0 : 1.0;
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: `
          uniform sampler2D uTexture;
          uniform float uOpacity;
          varying vec3 vColor;
          varying float vAlpha;
          void main() {
            vec4 tex = texture2D(uTexture, gl_PointCoord);
            float a = tex.a * uOpacity * vAlpha;
            if (a < 0.02) discard;
            // Keep campus hue; use texture only for soft alpha falloff
            gl_FragColor = vec4(vColor, a);
          }
        `,
        transparent: true,
        depthWrite: false,
        // Normal on cream bg keeps campus hue; additive would wash to white
        blending: THREE.NormalBlending,
      });
      const points = new THREE.Points(geo, pointMat);
      scene.add(points);

      // Soft glow halo (same campus color via vertex colors; slightly larger)
      const glowSizes = new Float32Array(n);
      for (let i = 0; i < n; i++) glowSizes[i] = baseSize[i] * (p.kind[i] === 0 ? 2.35 : 1.55);
      const glowGeo = geo.clone();
      glowGeo.setAttribute("size", new THREE.BufferAttribute(glowSizes, 1));
      const glowMat = pointMat.clone();
      glowMat.blending = THREE.NormalBlending;
      glowMat.uniforms = {
        uTexture: { value: glowTex },
        uOpacity: { value: 0.42 },
        uScale: { value: 300 },
        uPixelRatio: { value: renderer.getPixelRatio() },
      };
      const glowPoints = new THREE.Points(glowGeo, glowMat);
      scene.add(glowPoints);

      // ---- Out: dense glowing campus balls; Mid: huge airbrushed blobs; Deep: saturated blooms ----
      const islandGroup = new THREE.Group();
      const islandMats: import("three").SpriteMaterial[] = [];
      const islandBaseScale: number[] = [];
      if (p.campusLabels) {
        for (const lab of p.campusLabels.slice(0, 16)) {
          const ci = p.campuses.findIndex((c) => c.id === lab.id);
          const rgb = (ci >= 0 ? hexToRgb(p.campuses[ci].color) : [180, 190, 210]) as [number, number, number];
          // Out-stage campus ball: dense saturated glow hugging the cluster
          const rad = Math.max(48, Math.min(118, lab.r * 0.52 + Math.sqrt(Math.max(8, lab.n)) * 2.05));
          const tex = makeGlowTexture(THREE, rgb, true);
          const discMat = new THREE.SpriteMaterial({
            map: tex,
            color: 0xffffff,
            transparent: true,
            opacity: 0.48,
            depthWrite: false,
            blending: THREE.NormalBlending,
          });
          islandMats.push(discMat);
          islandBaseScale.push(rad * 2);
          const disc = new THREE.Sprite(discMat);
          disc.scale.set(rad * 2, rad * 2, 1);
          disc.position.set(cx + (lab.x - cx) * spread, cy + (lab.y - cy) * spread, -6);
          islandGroup.add(disc);
        }
      }
      scene.add(islandGroup);

      // Mid airbrush blobs (huge soft, saturated) + deep blooms — match mid MP4
      const bloomGroup = new THREE.Group();
      bloomGroup.visible = false;
      const bloomBaseScale: number[] = [];
      const bloomBoost = (rgb: [number, number, number]): [number, number, number] => {
        // Push toward mid-ref saturated magentas/cyans/yellows while keeping campus hue family
        const [r, g, b] = rgb;
        const max = Math.max(r, g, b) || 1;
        const sat = 1.55;
        return [
          Math.min(255, Math.round(((r - max) * sat + max) * 1.08)),
          Math.min(255, Math.round(((g - max) * sat + max) * 1.05)),
          Math.min(255, Math.round(((b - max) * sat + max) * 1.1)),
        ];
      };
      if (p.campusLabels) {
        for (const lab of p.campusLabels.slice(0, 14)) {
          const ci = p.campuses.findIndex((c) => c.id === lab.id);
          const base = (ci >= 0 ? hexToRgb(p.campuses[ci].color) : [180, 190, 210]) as [number, number, number];
          const rgb = bloomBoost(base);
          const tex = makeGlowTexture(THREE, rgb, true);
          const mat = new THREE.SpriteMaterial({
            map: tex,
            color: 0xffffff,
            transparent: true,
            opacity: 0.0,
            depthWrite: false,
            blending: THREE.NormalBlending,
          });
          const spr = new THREE.Sprite(mat);
          const sc = Math.max(200, Math.min(420, lab.r * 2.6 + 100));
          bloomBaseScale.push(sc);
          spr.scale.set(sc, sc, 1);
          // Scatter blooms slightly off centroid so mid is not one central mass
          const jx = (hash01(`bjx:${lab.id}`) - 0.5) * lab.r * 0.9;
          const jy = (hash01(`bjy:${lab.id}`) - 0.5) * lab.r * 0.9;
          spr.position.set(cx + (lab.x - cx) * spread + jx, cy + (lab.y - cy) * spread + jy, 8);
          bloomGroup.add(spr);
          // Second softer satellite bloom for airbrush overlap
          if (lab.n > 25) {
            const rgb2 = bloomBoost([
              Math.min(255, base[0] + 40),
              Math.min(255, base[1] + 20),
              Math.min(255, base[2] + 55),
            ]);
            const tex2 = makeGlowTexture(THREE, rgb2, true);
            const mat2 = new THREE.SpriteMaterial({
              map: tex2,
              color: 0xffffff,
              transparent: true,
              opacity: 0.0,
              depthWrite: false,
              blending: THREE.NormalBlending,
            });
            const spr2 = new THREE.Sprite(mat2);
            const sc2 = sc * (0.55 + hash01(`bsc2:${lab.id}`) * 0.35);
            bloomBaseScale.push(sc2);
            spr2.scale.set(sc2, sc2, 1);
            const ox = (hash01(`box:${lab.id}`) - 0.5) * lab.r * 1.4;
            const oy = (hash01(`boy:${lab.id}`) - 0.5) * lab.r * 1.4;
            spr2.position.set(cx + (lab.x - cx) * spread + ox, cy + (lab.y - cy) * spread + oy, 6);
            bloomGroup.add(spr2);
          }
        }
      }
      scene.add(bloomGroup);

      // Mid-stage organic curved tails (2 segments each → soft taper), sparse like mid MP4
      const maxTails = Math.min(280, Math.floor(n * 0.35));
      const segsPer = 2;
      const tailPos = new Float32Array(maxTails * segsPer * 6);
      const tailCol = new Float32Array(maxTails * segsPer * 6);
      const midKeep = new Uint8Array(n); // which founders stay as dark mid dots
      let tIdx = 0;
      for (let i = 0; i < n; i++) {
        if (p.kind[i] !== 0) continue;
        // Keep ~18% scattered founders as dark mid dots (avoid central hairball density)
        const keep = (hash01(`midkeep:${i}`) < 0.32 && (p.deg[i] ?? 0) < 14) || (hash01(`midkeep2:${i}`) < 0.08);
        midKeep[i] = keep ? 1 : 0;
        if (!keep || tIdx >= maxTails) continue;
        const ang = hash01(`tail:${i}`) * Math.PI * 2;
        const bend = (hash01(`tbend:${i}`) - 0.5) * 1.2;
        const tx = positions[i * 3];
        const ty = positions[i * 3 + 1];
        const tz = positions[i * 3 + 2];
        const tlen = 22 + hash01(`taill:${i}`) * 48;
        // Quadratic-ish: tip → mid → fade end
        const mx = tx - Math.cos(ang + bend * 0.35) * tlen * 0.45;
        const my = ty - Math.sin(ang + bend * 0.35) * tlen * 0.45;
        const ex = tx - Math.cos(ang) * tlen;
        const ey = ty - Math.sin(ang) * tlen;
        const pts = [
          [tx, ty, tz],
          [mx, my, tz],
          [ex, ey, tz],
        ];
        for (let s = 0; s < segsPer; s++) {
          const base = (tIdx * segsPer + s) * 6;
          tailPos[base] = pts[s][0];
          tailPos[base + 1] = pts[s][1];
          tailPos[base + 2] = pts[s][2];
          tailPos[base + 3] = pts[s + 1][0];
          tailPos[base + 4] = pts[s + 1][1];
          tailPos[base + 5] = pts[s + 1][2];
          const a0 = s === 0 ? 0.72 : 0.28;
          const a1 = s === 0 ? 0.28 : 0.02;
          for (let k = 0; k < 2; k++) {
            const a = k === 0 ? a0 : a1;
            // slate ink ~#3f4550 on cream
            tailCol[base + k * 3] = 0.16 * a;
            tailCol[base + k * 3 + 1] = 0.18 * a;
            tailCol[base + k * 3 + 2] = 0.22 * a;
          }
        }
        tIdx++;
      }
      const tailGeo = new THREE.BufferGeometry();
      tailGeo.setAttribute("position", new THREE.BufferAttribute(tailPos, 3));
      tailGeo.setAttribute("color", new THREE.BufferAttribute(tailCol, 3));
      const tailMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const tails = new THREE.LineSegments(tailGeo, tailMat);
      scene.add(tails);

      // ---- Colored edges ----
      const maxE = p.e0.length;
      const edgePos = new Float32Array(maxE * 6);
      const edgeCol = new Float32Array(maxE * 6);
      // Bundle visually by thinning high-degree / Stanford–Other center hairball
      const campusIdOf = (i: number) => {
        const ci = p.campus[i];
        return ci >= 0 && p.campuses[ci] ? p.campuses[ci].id : "other";
      };
      for (let i = 0; i < maxE; i++) {
        const a = p.e0[i];
        const b = p.e1[i];
        edgePos[i * 6] = positions[a * 3];
        edgePos[i * 6 + 1] = positions[a * 3 + 1];
        edgePos[i * 6 + 2] = positions[a * 3 + 2];
        edgePos[i * 6 + 3] = positions[b * 3];
        edgePos[i * 6 + 4] = positions[b * 3 + 1];
        edgePos[i * 6 + 5] = positions[b * 3 + 2];
        const fo = p.kind[a] === 0 ? a : p.kind[b] === 0 ? b : a;
        const ci = p.campus[fo];
        const rgb = ci >= 0 && p.campuses[ci] ? hexToRgb(p.campuses[ci].color) : [148, 163, 184];
        const degA = p.deg[a] ?? 1;
        const degB = p.deg[b] ?? 1;
        const maxDeg = Math.max(degA, degB);
        let s = 0.7 / (1 + Math.max(0, maxDeg - 5) * 0.11);
        const ca = campusIdOf(a);
        const cb = campusIdOf(b);
        const hair =
          (ca === "stanford" || ca === "other" || cb === "stanford" || cb === "other") &&
          maxDeg >= 6;
        // Airier Cosmos lattice: thin, darker on cream, aggressive center cull
        if (hair) s *= 0.32;
        else if (maxDeg >= 14) s *= 0.48;
        else if (maxDeg >= 9) s *= 0.68;
        s = Math.min(1.0, s * 1.05);
        if (hair && hash01(`drop:${a}:${b}`) > 0.48) s *= 0.12;
        else if (maxDeg >= 14 && hash01(`drop2:${a}:${b}`) > 0.58) s *= 0.18;
        else if (hash01(`drop3:${a}:${b}`) > 0.82) s *= 0.35;
        for (let k = 0; k < 2; k++) {
          // Mix campus hue toward slate ink so lines read on cream
          const ink = 0.22;
          edgeCol[i * 6 + k * 3] = ((rgb[0] / 255) * (1 - ink) + 0.22 * ink) * s;
          edgeCol[i * 6 + k * 3 + 1] = ((rgb[1] / 255) * (1 - ink) + 0.24 * ink) * s;
          edgeCol[i * 6 + k * 3 + 2] = ((rgb[2] / 255) * (1 - ink) + 0.28 * ink) * s;
        }
      }
      const edgeGeo = new THREE.BufferGeometry();
      edgeGeo.setAttribute("position", new THREE.BufferAttribute(edgePos, 3));
      edgeGeo.setAttribute("color", new THREE.BufferAttribute(edgeCol, 3));
      const edgeMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
      });
      // Gray web for card stage — sampled ~#949496 @0.5 on cream → slate-600 @0.5
      const webMat = new THREE.LineBasicMaterial({
        color: 0x64748b,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const webEdges = new THREE.LineSegments(edgeGeo.clone(), webMat);
      scene.add(webEdges);
      const edges = new THREE.LineSegments(edgeGeo, edgeMat);
      scene.add(edges);

      const nodeVisible = new Uint8Array(n);
      const applyYearVisibility = (scrub: number) => {
        for (let i = 0; i < n; i++) {
          if (p.kind[i] === 0) nodeVisible[i] = founderVisibleAtYear(yearArr[i], scrub, yearMax) ? 1 : 0;
          else nodeVisible[i] = 1;
        }
        const sizeAttr = geo.getAttribute("size") as import("three").BufferAttribute;
        const glowSizeAttr = glowGeo.getAttribute("size") as import("three").BufferAttribute;
        for (let i = 0; i < n; i++) {
          const on = nodeVisible[i] === 1;
          sizeAttr.setX(i, on ? baseSize[i] : 0.01);
          glowSizeAttr.setX(i, on ? baseSize[i] * (p.kind[i] === 0 ? 2.4 : 1.6) : 0.01);
        }
        sizeAttr.needsUpdate = true;
        glowSizeAttr.needsUpdate = true;
        const ec = edgeGeo.getAttribute("color") as import("three").BufferAttribute;
        for (let i = 0; i < maxE; i++) {
          const a = p.e0[i];
          const b = p.e1[i];
          const ok =
            (p.kind[a] !== 0 || nodeVisible[a]) && (p.kind[b] !== 0 || nodeVisible[b]);
          const fo = p.kind[a] === 0 ? a : p.kind[b] === 0 ? b : a;
          const ci = p.campus[fo];
          const rgb = ci >= 0 && p.campuses[ci] ? hexToRgb(p.campuses[ci].color) : [148, 163, 184];
          const maxDeg = Math.max(p.deg[a] ?? 1, p.deg[b] ?? 1);
          let s = ok ? 0.85 / (1 + Math.max(0, maxDeg - 5) * 0.08) : 0.02;
          if (ok) {
            const ca = ci >= 0 && p.campuses[ci] ? p.campuses[ci].id : "other";
            if ((ca === "stanford" || ca === "other") && maxDeg >= 6) s *= 0.48;
            else if (maxDeg >= 14) s *= 0.65;
            else if (maxDeg >= 9) s *= 0.8;
            s = Math.min(1.2, s * 1.2);
          }
          const ink = 0.22;
          for (let k = 0; k < 2; k++) {
            ec.setXYZ(
              i * 2 + k,
              ((rgb[0] / 255) * (1 - ink) + 0.22 * ink) * s,
              ((rgb[1] / 255) * (1 - ink) + 0.24 * ink) * s,
              ((rgb[2] / 255) * (1 - ink) + 0.28 * ink) * s,
            );
          }
        }
        ec.needsUpdate = true;
      };
      applyYearVisibility(scrubRef.current);

      apiRef.current = {
        applyYear: applyYearVisibility,
        setBloom: (b: number) => {
          // legacy hook: treat as mid weight
          bloomGroup.visible = b > 0.05;
        },
        setDeep: (d: number) => {
          // legacy
          void d;
        },
        setStages: (outW: number, midW: number, cardW: number, deepW: number, tSec: number) => {
          const breath = 1 + Math.sin(tSec * 0.75) * 0.12 * midW + Math.sin(tSec * 0.28) * 0.05 * midW;
          // Islands: soft Nature-like campus balls at out; fade fast into mid airbrush
          islandMats.forEach((m, i) => {
            m.opacity = outW * 0.62 + midW * 0.04;
            const spr = islandGroup.children[i] as import("three").Sprite;
            if (spr && islandBaseScale[i]) {
              const s = islandBaseScale[i] * (0.82 + outW * 0.28);
              spr.scale.set(s, s, 1);
              spr.visible = outW > 0.1;
            }
          });
          // Mid: huge breathing airbrush; Deep: tighter saturated blooms
          bloomGroup.visible = midW > 0.05 || deepW > 0.05;
          let bi = 0;
          bloomGroup.traverse((obj) => {
            if (!(obj as import("three").Sprite).isSprite) return;
            const m = (obj as import("three").Sprite).material as import("three").SpriteMaterial;
            m.opacity = midW * 0.62 + deepW * 0.95;
            const base = bloomBaseScale[bi] ?? 200;
            const midScale = breath * (0.95 + midW * 0.45);
            const deepScale = 0.62 + deepW * 0.85;
            const s = base * (midW > deepW ? midScale : deepScale);
            (obj as import("three").Sprite).scale.set(s, s, 1);
            // gentle drift
            const ox = Math.sin(tSec * 0.4 + bi * 0.7) * 6 * midW;
            const oy = Math.cos(tSec * 0.33 + bi * 0.5) * 5 * midW;
            obj.position.x += (ox - (obj.userData.dx || 0));
            obj.position.y += (oy - (obj.userData.dy || 0));
            obj.userData.dx = ox;
            obj.userData.dy = oy;
            bi++;
          });
          // Points: colored out (smaller); sparse dark mid dots; soft deep
          pointMat.uniforms.uOpacity.value = 0.38 + outW * 0.45 + midW * 0.92 + deepW * 0.45;
          glowMat.uniforms.uOpacity.value = outW * 0.42 + midW * 0.04 + deepW * 0.45;
          const colAttr = geo.getAttribute("color") as import("three").BufferAttribute;
          const sizeA = geo.getAttribute("size") as import("three").BufferAttribute;
          const glowSizeA = glowGeo.getAttribute("size") as import("three").BufferAttribute;
          const posA = geo.getAttribute("position") as import("three").BufferAttribute;
          for (let i = 0; i < n; i++) {
            if (p.kind[i] !== 0) {
              // hubs slightly quieter at mid
              const hubFade = 1 - midW * 0.85;
              if (nodeVisible[i]) {
                sizeA.setX(i, baseSize[i] * (0.85 + outW * 0.2) * hubFade + 0.01);
                glowSizeA.setX(i, baseSize[i] * 1.4 * hubFade + 0.01);
              }
              continue;
            }
            if (!nodeVisible[i]) {
              sizeA.setX(i, 0.01);
              glowSizeA.setX(i, 0.01);
              continue;
            }
            const ci = p.campus[i];
            const rgb = ci >= 0 && p.campuses[ci] ? hexToRgb(p.campuses[ci].color) : [148, 163, 184];
            const keep = midKeep[i] === 1;
            // Mid: hide most founders → scattered dark dots only
            const midHide = midW > 0.35 && !keep;
            const dark = 0.06;
            const mix = midHide ? 0 : midW;
            const r = (rgb[0] / 255) * (1 - mix) * (0.85 + outW * 0.15) + dark * mix;
            const g = (rgb[1] / 255) * (1 - mix) * (0.85 + outW * 0.15) + dark * mix;
            const bch = (rgb[2] / 255) * (1 - mix) * (0.85 + outW * 0.15) + dark * mix;
            colAttr.setXYZ(i, r, g, bch);
            let s: number;
            if (midHide) s = 0.01;
            else if (midW > 0.35 && keep) s = (6.5 + Math.min(4.5, (p.r[i] ?? 2) * 0.65)) * (0.85 + midW * 0.85);
            else s = baseSize[i] * (0.72 + outW * 0.35) * (1 + deepW * 0.4);
            sizeA.setX(i, s);
            glowSizeA.setX(i, midHide ? 0.01 : s * (midW > 0.35 ? 1.25 : 1.55));
            // Micro-drift for mid dark dots
            if (midW > 0.2 && keep) {
              const dx = Math.sin(tSec * 0.55 + i * 0.13) * 1.8 * midW;
              const dy = Math.cos(tSec * 0.47 + i * 0.11) * 1.6 * midW;
              posA.setXYZ(i, positions[i * 3] + dx, positions[i * 3 + 1] + dy, positions[i * 3 + 2]);
            } else {
              posA.setXYZ(i, positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
            }
          }
          colAttr.needsUpdate = true;
          sizeA.needsUpdate = true;
          glowSizeA.needsUpdate = true;
          posA.needsUpdate = true;
          // Edges: airy out strands; nearly gone at mid (tails carry the read); faint deep
          edgeMat.opacity = outW * 0.52 + midW * 0.04 + deepW * 0.14 + cardW * 0.04;
          edges.visible = outW > 0.08 || (deepW > 0.25 && cardW < 0.2);
          webMat.opacity = cardW * 0.42;
          webEdges.visible = cardW > 0.08;
          tails.visible = midW > 0.08;
          tailMat.opacity = midW * 0.95;
        },
      };

      const markActive = () => {
        idleRef.current = 0;
        ctrl.autoRotate = false;
      };
      renderer.domElement.addEventListener("pointerdown", markActive);
      renderer.domElement.addEventListener("wheel", markActive, { passive: true });

      const w = window as unknown as {
        __NETWORKS_POSTER__?: Poster;
        __NETWORKS_SET_SCALE__?: (scale: number) => void;
        __NETWORKS_FADE__?: number;
        __NETWORKS_SET_YEAR__?: (y: number) => void;
      };
      w.__NETWORKS_POSTER__ = p;
      w.__NETWORKS_FADE__ = 1;
      const applyScaleNow = (scale: number) => {
        const dist = scaleToDist(scale);
        idleRef.current = 0;
        ctrl.autoRotate = false;
        const offset = new THREE.Vector3().copy(camera.position).sub(ctrl.target);
        if (offset.lengthSq() < 1e-6) offset.set(0, -0.3, 1);
        offset.setLength(dist);
        camera.position.copy(ctrl.target).add(offset);
        camera.lookAt(ctrl.target);
        // Sync OrbitControls internal spherical by reading the new offset on next update.
        ctrl.update();
        const mapped = distToScale(camera.position.distanceTo(ctrl.target));
        const st = stageWeights(mapped);
        tierRef.current = st.tier;
        wrapRef.current?.setAttribute("data-networks-zoom", String(st.tier));
        setZoomScale(mapped);
        apiRef.current?.setStages(st.outW, st.midW, st.cardW, st.deepW, 0);
        ctrl.autoRotate = false;
        idleRef.current = 0;
      };
      w.__NETWORKS_SET_SCALE__ = applyScaleNow;
      (w as unknown as { __NETWORKS_GET_DIST__?: () => number }).__NETWORKS_GET_DIST__ = () =>
        camera.position.distanceTo(ctrl.target);
      // Pending scale from shots if set before mount finished
      const pending = (w as unknown as { __NETWORKS_PENDING_SCALE__?: number }).__NETWORKS_PENDING_SCALE__;
      if (typeof pending === "number") {
        applyScaleNow(pending);
        delete (w as unknown as { __NETWORKS_PENDING_SCALE__?: number }).__NETWORKS_PENDING_SCALE__;
      }
      w.__NETWORKS_SET_YEAR__ = (y: number) => setScrubYear(clamp(y, yearMin, yearMax));

      const ro = new ResizeObserver(() => {
        if (!mountRef.current || !renderer) return;
        const ww = mountRef.current.clientWidth;
        const hh = mountRef.current.clientHeight;
        camera.aspect = ww / Math.max(1, hh);
        camera.updateProjectionMatrix();
        renderer.setSize(ww, hh, false);
        pointMat.uniforms.uPixelRatio.value = renderer.getPixelRatio();
        glowMat.uniforms.uPixelRatio.value = renderer.getPixelRatio();
      });
      if (wrapRef.current) ro.observe(wrapRef.current);

      const _proj = new THREE.Vector3();
      const worldToOverlay = (wx: number, wy: number, wz = 0, loose = false) => {
        const wrap = wrapRef.current;
        if (!wrap) return { x: 0, y: 0, onscreen: false };
        const ww = wrap.clientWidth;
        const hh = wrap.clientHeight;
        // Campus labels live in poster space; map through same spread as points
        const sx = cx + (wx - cx) * spread;
        const sy = cy + (wy - cy) * spread;
        const sz = wz * 1.55;
        _proj.set(sx, sy, sz);
        _proj.project(camera);
        const x = (_proj.x * 0.5 + 0.5) * ww;
        const y = (-_proj.y * 0.5 + 0.5) * hh;
        const pad = loose ? -20 : 28;
        const lim = loose ? 1.25 : 1.05;
        const onscreen =
          _proj.z <= 1 &&
          Math.abs(_proj.x) <= lim &&
          Math.abs(_proj.y) <= lim &&
          x > pad &&
          y > pad &&
          x < ww - pad &&
          y < hh - pad;
        return { x, y, onscreen };
      };

      let lastPlayTick = 0;
      let overlayTick = 0;
      const updateOverlays = (scale: number, outW: number, midW: number, cardW: number, deepW: number) => {
        const wrap = wrapRef.current;
        const ww = wrap?.clientWidth ?? 0;
        const hh = wrap?.clientHeight ?? 0;
        const raw: OverlayLabel[] = [];
        void scale;
        void midW;
        for (const lab of (p.campusLabels ?? []).slice(0, 14)) {
          const pt = worldToOverlay(lab.x, lab.y, 0);
          if (!pt.onscreen) continue;
          raw.push({
            id: lab.id,
            label: lab.label,
            x: pt.x,
            y: pt.y,
            priority: 1000 + lab.n,
            kind: "campus",
            n: lab.n,
          });
        }
        for (const hub of p.hubs.slice(0, 12)) {
          const pt = worldToOverlay(p.x[hub.i], p.y[hub.i], zArr[hub.i] ?? 0);
          if (!pt.onscreen) continue;
          raw.push({
            id: `hub:${hub.id}`,
            label: hub.label.length > 22 ? `${hub.label.slice(0, 20)}...` : hub.label,
            x: pt.x,
            y: pt.y + 12,
            priority: 400 + hub.founders,
            kind: "hub",
          });
        }
        // Deep: tracking boxes + dashed arcs — never cover hub labels
        if (deepW > 0.12 && p.campusLabels) {
          const hubPts = raw.filter((l) => l.kind === "hub");
          const boxes: TrackBox[] = [];
          for (const lab of p.campusLabels.slice(0, 10)) {
            const pt = worldToOverlay(lab.x, lab.y, 0, true);
            if (!pt.onscreen) {
              // Clamp top campuses into frame (desktop + mobile) so deep always has boxes
              if (lab.n < (ww < 500 ? 40 : 55)) continue;
              pt.x = Math.min(ww - 56, Math.max(56, pt.x));
              pt.y = Math.min(hh - 88, Math.max(56, pt.y));
            }
            const box = Math.max(ww < 500 ? 36 : 34, Math.min(ww < 500 ? 48 : 68, 24 + Math.sqrt(lab.n) * (ww < 500 ? 2.2 : 2.6)));
            const captionW = 8 + (lab.label.length + String(lab.n).length) * 5;
            const bl = pt.x - box / 2 - 4;
            const br = pt.x + Math.max(box / 2, captionW);
            const bt = pt.y - box / 2 - 22;
            const bb = pt.y + box / 2 + 4;
            // On mobile, keep top campuses even if near hubs — hubs lose the collision instead.
            const hitsHub = hubPts.some((h) => {
              const lw = Math.min(160, 10 + h.label.length * 6.6);
              const lh = 14;
              const hl = h.x - lw / 2;
              const hr = h.x + lw / 2;
              const ht = h.y - lh / 2;
              const hb = h.y + lh / 2;
              return hl < br && hr > bl && ht < bb && hb > bt;
            });
            if (hitsHub && ww >= 500) continue;
            boxes.push({ id: lab.id, label: lab.label, x: pt.x, y: pt.y, box, n: lab.n });
          }
          const keptBoxes = collideTrackBoxes(boxes, ww < 500 ? (deepW > 0.5 ? 3 : 2) : deepW > 0.45 ? 6 : 4);
          setTrackBoxes(keptBoxes);
          const boxIds = new Set(keptBoxes.map((b) => b.id));
          const labelRaw = raw.filter((lab) => {
            if (lab.kind === "campus" && boxIds.has(lab.id)) return false;
            const lw = Math.min(180, 10 + lab.label.length * 6.6);
            const lh = 15;
            const l = lab.x - lw / 2;
            const r = lab.x + lw / 2;
            const top = lab.y - lh / 2;
            const bot = lab.y + lh / 2;
            for (const b of keptBoxes) {
              const bl = b.x - b.box / 2 - 4;
              const br = b.x + Math.max(b.box / 2, 8 + (b.label.length + String(b.n).length) * 5);
              const bt = b.y - b.box / 2 - 22;
              const bb = b.y + b.box / 2 + 4;
              if (l < br && r > bl && top < bb && bot > bt) return false;
            }
            return true;
          });
          setLabels(collideLabels(labelRaw, ww < 500 ? 5 : 8));
          const segs: ArcSeg[] = [];
          for (let i = 0; i < keptBoxes.length; i++) {
            for (let j = i + 1; j < keptBoxes.length; j++) {
              if (j - i > 2 && i > 1) continue;
              const a = keptBoxes[i];
              const b = keptBoxes[j];
              const { cx: acx, cy: acy } = curved(a.x, a.y, b.x, b.y, 1.55);
              segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, cx: acx, cy: acy });
            }
          }
          setArcs(segs.slice(0, ww < 500 ? 3 : 10));
          if (deepW > 0.55) {
            setMediaCards([]);
            setCards([]);
          }
        } else if (outW > 0.35) {
          setLabels(collideLabels(raw, 16));
          setTrackBoxes([]);
          setArcs([]);
          setMediaCards([]);
        } else {
          setLabels(midW > 0.45 ? [] : collideLabels(raw, 8));
          setTrackBoxes([]);
          setArcs([]);
          if (midW > 0.4) setMediaCards([]);
        }

        // Card stage: nearest-to-center founders for the OUTSIDE dock (never over the graph)
        if (cardW > 0.12 && deepW < 0.55) {
          const cx = ww / 2;
          const cy = hh / 2;
          const cand: { i: number; score: number; dist: number; pt: { x: number; y: number } }[] = [];
          for (let i = 0; i < n; i++) {
            if (p.kind[i] !== 0) continue;
            if (!founderVisibleAtYear(yearArr[i], scrubRef.current, yearMax)) continue;
            const pt = worldToOverlay(p.x[i], p.y[i], zArr[i] ?? 0);
            if (!pt.onscreen) continue;
            const dist = Math.hypot(pt.x - cx, pt.y - cy);
            const fid = p.foIds[i] ?? "";
            const deal = dealsRef.current[fid];
            const score = (deal ? 30 : 0) + p.deg[i] * 0.4 - dist * 0.08 + hash01(`card:${i}`) * 3;
            cand.push({ i, score, dist, pt });
          }
          cand.sort((a, b) => b.score - a.score || a.dist - b.dist);
          const maxCards = ww < 500 ? 4 : 6;
          const out: Card[] = [];
          for (const c of cand) {
            if (out.length >= maxCards) break;
            const fid = p.foIds[c.i] ?? "";
            const deal = dealsRef.current[fid];
            const ci = p.campus[c.i];
            out.push({
              key: `c-${c.i}`,
              x: c.pt.x,
              y: c.pt.y,
              dotX: c.pt.x,
              dotY: c.pt.y,
              title: deal?.founderName ?? "Founder",
              school: ci >= 0 && p.campuses[ci] ? p.campuses[ci].label : "",
              company: deal?.companyName ?? "",
            });
          }
          setCards(out);

          // Sparse in-web media cards along arcs (between MP4) — NOT founder-cards (overlay gate)
          const media: MediaCard[] = [];
          const maxMedia = ww < 500 ? 3 : 7;
          const labApprox = raw.map((lab) => {
            const lw = Math.min(160, 10 + lab.label.length * 6.6);
            return { left: lab.x - lw / 2, right: lab.x + lw / 2, top: lab.y - 7, bottom: lab.y + 7 };
          });
          for (let mi = 0; mi < cand.length && media.length < maxMedia; mi++) {
            const c = cand[Math.min(cand.length - 1, mi + 2)];
            if (!c) break;
            const h = hash01(`media:${c.i}`);
            if (h > 0.72) continue;
            const ang = h * Math.PI * 2;
            const rad = 55 + h * 120;
            const x = c.pt.x + Math.cos(ang) * rad;
            const y = c.pt.y + Math.sin(ang) * rad * 0.65;
            const mw = ww < 500 ? 42 : 54;
            const mh = mw;
            const hitsLabel = labApprox.some(
              (lr) => lr.left < x + mw / 2 && lr.right > x - mw / 2 && lr.top < y + mh / 2 && lr.bottom > y - mh / 2,
            );
            if (hitsLabel) continue;
            if (x < 28 || y < 28 || x > ww - 28 || y > hh - 56) continue;
            const fid = p.foIds[c.i] ?? "";
            const deal = dealsRef.current[fid];
            const hues = ["#c4b5fd", "#67e8f9", "#fde047", "#fda4af", "#86efac", "#e9d5ff"];
            media.push({
              key: `m-${c.i}`,
              x,
              y,
              w: mw,
              h: mh,
              title: (deal?.companyName || deal?.founderName || "·").slice(0, 16),
              hue: hues[Math.floor(h * hues.length) % hues.length],
              pop: cardW,
            });
          }
          setMediaCards(media);
        } else {
          setCards([]);
          setMediaCards([]);
        }
      };

      const tick = (t: number) => {
        if (disposed) return;
        raf = requestAnimationFrame(tick);
        if (playRef.current) {
          if (t - lastPlayTick > 900) {
            lastPlayTick = t;
            const next = scrubRef.current >= yearMax ? yearMin : scrubRef.current + 1;
            scrubRef.current = next;
            setScrubYear(next);
            applyYearVisibility(next);
            if (next >= yearMax) {
              playRef.current = false;
              setPlaying(false);
            }
          }
        }
        idleRef.current += 1;
        if (idleRef.current > 120) ctrl.autoRotate = true;
        ctrl.update();
        renderer!.render(scene, camera);

        const dist = camera.position.distanceTo(ctrl.target);
        const scale = distToScale(dist);
        const st = stageWeights(scale);
        apiRef.current?.setStages(st.outW, st.midW, st.cardW, st.deepW, t * 0.001);
        if (tierRef.current !== st.tier) {
          tierRef.current = st.tier;
          setZoomScale(scale);
          wrapRef.current?.setAttribute("data-networks-zoom", String(st.tier));
        }
        wrapRef.current?.setAttribute("data-networks-fade", "1");

        overlayTick += 1;
        if (overlayTick % 3 === 0) updateOverlays(scale, st.outW, st.midW, st.cardW, st.deepW);
      };
      raf = requestAnimationFrame(tick);
      wrapRef.current?.setAttribute("data-networks-fade", "1");
      wrapRef.current?.setAttribute("data-networks-zoom", "0");
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      controls?.dispose();
      if (renderer) {
        renderer.dispose();
        renderer.domElement.parentElement?.removeChild(renderer.domElement);
      }
      apiRef.current = null;
      const w = window as unknown as { __NETWORKS_SET_SCALE__?: unknown; __NETWORKS_SET_YEAR__?: unknown };
      delete w.__NETWORKS_SET_SCALE__;
      delete w.__NETWORKS_SET_YEAR__;
    };
  }, [poster, yearMax, yearMin]);

  const legendCampuses = poster?.campuses.filter((c) => c.id !== "other") ?? [];
  const legendTop = legendCampuses.slice(0, 6);
  const legendRest = legendCampuses.slice(6);
  const featuredDeal = poster?.featuredId ? deals[poster.featuredId] ?? null : null;
  const investors = investorHubs?.length
    ? investorHubs.map((h) => ({ id: h.id, label: h.label, founders: h.founderCount }))
    : poster?.investorHubs ?? [];

  const stages = stageWeights(zoomScale);
  const deepOpacity = stages.deepW;
  const cardOpacity = stages.cardW;
  const outOpacity = stages.outW;
  const midOpacity = stages.midW;
  const labelOpacity = Math.max(0.05, outOpacity * 0.95 + stages.deepW * 0.35);

  if (!poster) {
    return <p className="px-4 py-10 text-sm text-[color:var(--fg-3)]">Loading network map...</p>;
  }

  return (
    <div className="w-full overflow-visible" data-networks-desk="" data-networks-dim="4d">
      <div
        ref={wrapRef}
        className="relative w-screen max-w-none touch-manipulation overflow-hidden left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] max-md:!h-[80vh]"
        style={{ height: "85vh", background: "var(--networks-bg, #ece9e4)" }}
        data-networks-graph=""
        data-networks-fade="0"
        data-networks-zoom="0"
        data-networks-engine="webgl"
      >
        <div ref={mountRef} className="absolute inset-0 h-full w-full" />

        {/* Mid film grain (airbrush MP4) */}
        <div
          className="pointer-events-none absolute inset-0 z-[1] mix-blend-multiply"
          aria-hidden="true"
          data-networks-grain=""
          style={{
            opacity: midOpacity * 0.42 + deepOpacity * 0.12,
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(15,23,42,0.09) 0.55px, transparent 0.7px), radial-gradient(circle at 2px 3px, rgba(15,23,42,0.06) 0.45px, transparent 0.65px)",
            backgroundSize: "3px 3px, 5px 5px",
          }}
        />

        {/* Deep dashed arcs */}
        <svg
          className="pointer-events-none absolute inset-0 z-[1] h-full w-full overflow-visible"
          aria-hidden="true"
          style={{ opacity: deepOpacity }}
        >
          {arcs.map((a, i) => (
            <path
              key={`arc-${i}`}
              d={`M ${a.x1} ${a.y1} Q ${a.cx} ${a.cy} ${a.x2} ${a.y2}`}
              fill="none"
              stroke="rgba(15,23,42,0.35)"
              strokeWidth="1.1"
              strokeDasharray="4 6"
              data-networks-arc=""
            />
          ))}
        </svg>

        {/* Deep tracking boxes — thin craft, monospace */}
        <div className="pointer-events-none absolute inset-0 z-[1]" style={{ opacity: deepOpacity }}>
          {trackBoxes.map((b) => (
            <div
              key={`box-${b.id}`}
              data-networks-track-box={b.id}
              className="absolute overflow-visible border border-slate-900/80"
              style={{
                left: b.x - b.box / 2,
                top: b.y - b.box / 2,
                width: b.box,
                height: b.box,
                boxShadow: "0 0 0 0.5px rgba(15,23,42,0.15)",
              }}
            >
              <div className="absolute -top-[15px] left-0 whitespace-nowrap font-mono text-[8px] tracking-[0.04em] text-slate-900 md:text-[9px]">
                {b.label.toUpperCase()} · {b.n.toLocaleString("en-US")}
              </div>
              <div
                className="absolute border border-slate-900/35"
                style={{ left: 3, top: 3, right: 3, bottom: 3 }}
              />
              <div className="absolute left-0 top-0 h-1.5 w-1.5 border-l border-t border-slate-900/90" />
              <div className="absolute right-0 top-0 h-1.5 w-1.5 border-r border-t border-slate-900/90" />
              <div className="absolute bottom-0 left-0 h-1.5 w-1.5 border-b border-l border-slate-900/90" />
              <div className="absolute bottom-0 right-0 h-1.5 w-1.5 border-b border-r border-slate-900/90" />
            </div>
          ))}
        </div>

        {/* Campus + hub labels (collision-culled) */}
        <div className="pointer-events-none absolute inset-0 z-[2]" style={{ opacity: labelOpacity }}>
          {labels.map((lab) => (
            <div
              key={lab.id}
              {...(lab.kind === "campus"
                ? {
                    "data-canvas-label": lab.id,
                    "data-label-anchor-x": lab.x,
                    "data-label-anchor-y": lab.y,
                    "data-hub-x": lab.x,
                    "data-hub-y": lab.y,
                    "data-hub-r": 40,
                  }
                : { "data-canvas-hub-label": lab.id.replace(/^hub:/, "") })}
              className={
                lab.kind === "campus"
                  ? "absolute -translate-x-1/2 -translate-y-1/2 text-center text-[11px] font-medium tracking-wide text-[color:var(--fg)] md:text-[13px]"
                  : "absolute -translate-x-1/2 text-[9px] font-semibold tracking-wide text-[color:var(--fg)] md:text-[10px]"
              }
              style={{ left: lab.x, top: lab.y, textShadow: "0 0 5px var(--networks-bg, #ece9e4), 0 1px 3px var(--networks-bg, #ece9e4)" }}
            >
              {lab.label}
            </div>
          ))}
        </div>

        {/* Between: sparse in-web media cards (spring pop) — not founder-cards */}
        <div className="pointer-events-none absolute inset-0 z-[2]" style={{ opacity: cardOpacity }}>
          {mediaCards.map((m) => (
            <div
              key={m.key}
              data-networks-media-card={m.key}
              className="absolute overflow-hidden rounded-[3px] border border-slate-800/25 shadow-sm"
              style={{
                left: m.x - m.w / 2,
                top: m.y - m.h / 2,
                width: m.w,
                height: m.h,
                background: `linear-gradient(145deg, ${m.hue}cc, #f5f3ef 70%)`,
                transform: `scale(${0.72 + m.pop * 0.28})`,
                transformOrigin: "center",
                transition: "transform 420ms cubic-bezier(0.22, 1.2, 0.36, 1), opacity 280ms ease",
              }}
            >
              <div className="absolute inset-x-0 bottom-0 truncate bg-slate-900/55 px-1 py-[1px] text-[7px] font-medium tracking-wide text-white">
                {m.title}
              </div>
            </div>
          ))}
        </div>

        {/* Card-stage focus rings on map (cards themselves dock outside the graph) */}
        <svg
          className="pointer-events-none absolute inset-0 z-[2] h-full w-full overflow-visible"
          aria-hidden="true"
          style={{ opacity: cardOpacity }}
        >
          {cards.map((c) => (
            <g key={`focus-${c.key}`} data-networks-card-focus="">
              <circle cx={c.dotX} cy={c.dotY} r={7} fill="none" stroke="rgba(15,23,42,0.55)" strokeWidth="1.2" />
              <circle cx={c.dotX} cy={c.dotY} r={2.2} fill="rgba(15,23,42,0.7)" />
            </g>
          ))}
        </svg>

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

        <div className="pointer-events-none absolute bottom-3 right-3 hidden rounded bg-white/80 px-2 py-1 text-[10px] text-[color:var(--fg-3)] md:block">
          Drag to orbit · scroll to zoom
        </div>
      </div>

      {/* Card stage: docked founder cards outside the map (bottom strip on mobile) */}
      <div
        data-networks-card-dock=""
        className="mt-2 overflow-hidden rounded-lg border border-[color:var(--line)] bg-white"
        style={{
          opacity: cardOpacity > 0.08 ? Math.min(1, cardOpacity * 1.2) : 0,
          maxHeight: cardOpacity > 0.08 ? 220 : 0,
          pointerEvents: cardOpacity > 0.08 ? "auto" : "none",
          transition: "opacity 280ms ease, max-height 320ms ease",
        }}
        aria-hidden={cardOpacity <= 0.08}
      >
        <div className="flex items-center justify-between border-b border-[color:var(--line)] px-3 py-1.5">
          <div className="text-[9px] font-semibold uppercase tracking-[0.06em] text-[color:var(--fg-3)]">Founders in view</div>
          <div className="text-[10px] text-[color:var(--fg-3)]">Nearest to center · thin web on map</div>
        </div>
        <div className="flex gap-2 overflow-x-auto px-2 py-2 md:grid md:grid-cols-3 md:overflow-visible lg:grid-cols-4">
          {cards.map((c) => (
            <div
              key={c.key}
              data-networks-founder-card=""
              className="min-w-[148px] flex-shrink-0 rounded border border-slate-800/20 bg-[#fbfaf7] px-2 py-1.5 md:min-w-0"
              style={{ transform: `scale(${0.92 + cardOpacity * 0.08})`, transformOrigin: "left center" }}
            >
              <div className="truncate text-[11px] font-semibold text-slate-900">{c.title}</div>
              {c.school ? <div className="truncate text-[10px] text-slate-500">{c.school}</div> : null}
              {c.company ? <div className="truncate text-[10px] text-slate-600">{c.company}</div> : null}
            </div>
          ))}
          {cards.length === 0 && cardOpacity > 0.2 ? (
            <div className="px-2 py-3 text-[11px] text-[color:var(--fg-3)]">Orbit to bring founders near center.</div>
          ) : null}
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
                style={{ clip: "rect(0, 0, 0, 0)" }}
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
          {...(featuredDeal ? { "data-networks-featured": "" } : {})}
          className="order-2 rounded-lg border border-[color:var(--line)] bg-white px-3 py-2.5 text-xs md:order-none"
        >
          <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.06em] text-[color:var(--fg-3)]" data-panel-header="">
            Featured founder
          </div>
          {featuredDeal ? (
            <div className="space-y-0.5">
              <div className="font-medium text-[color:var(--fg)]">{featuredDeal.founderName}</div>
              <div className="text-[color:var(--fg-2)]">
                {featuredDeal.companyName ?? "Company unknown"}
                {featuredDeal.stage ? ` · ${featuredDeal.stage}` : ""}
              </div>
              <div
                className="text-[10px] text-[color:var(--fg-3)]"
                data-networks-deal-networks=""
                data-networks-deal-networks-total={(featuredDeal.networks ?? []).length}
              >
                Networks ({(featuredDeal.networks ?? []).length.toLocaleString("en-US")}):{" "}
                {(featuredDeal.networks ?? []).slice(0, 2).join(", ") || "none on file yet"}
              </div>
              <div
                className="text-[10px] text-[color:var(--fg-3)]"
                data-networks-deal-investors=""
                data-networks-deal-investors-total={(featuredDeal.investors ?? []).length}
              >
                {(featuredDeal.investors ?? []).length
                  ? `${Math.min(4, featuredDeal.investors.length).toLocaleString("en-US")} of ${featuredDeal.investors.length.toLocaleString("en-US")} investors: ${featuredDeal.investors.slice(0, 4).join(", ")}`
                  : "No named investors on file yet"}
              </div>
            </div>
          ) : (
            <p className="text-[color:var(--fg-3)]">Orbit the map to explore founders.</p>
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
                  onClick={() => onSelectNetwork?.(row.id)}
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
    </div>
  );
}
