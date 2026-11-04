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
import { nounFor } from "@/lib/display/plural";
import {
  applyEncodingColors,
  blobScaleForFounders,
  buildCampusEncodings,
  makeCampusContourTexture,
  satMulFromShare,
  type CampusEncoding,
} from "@/components/networks-encodings";

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
  /** Island/hub anchor for Nature-style margin pointer lines */
  ax?: number;
  ay?: number;
  priority: number;
  kind: "campus" | "hub";
  n?: number;
  color?: string;
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
  /** Real sourced logo path when available */
  logoUrl?: string;
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

/** Campus contour blobs: see makeCampusContourTexture in networks-encodings. */

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
  const [blobTip, setBlobTip] = useState<{
    id: string;
    label: string;
    founders: number;
    backed: number;
    share: number;
    color: string;
    x: number;
    y: number;
  } | null>(null);
  const [blobHits, setBlobHits] = useState<
    { id: string; label: string; founders: number; backed: number; share: number; color: string; x: number; y: number; r: number }[]
  >([]);
  const [logoIds, setLogoIds] = useState<Set<string>>(() => new Set());
  const logoIdsRef = useRef(logoIds);
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
    logoIdsRef.current = logoIds;
  }, [logoIds]);
  useEffect(() => {
    let cancelled = false;
    fetch("/company-logos/manifest.json")
      .then((r) => r.json())
      .then((m: { logos?: Record<string, unknown> }) => {
        if (cancelled || !m?.logos) return;
        setLogoIds(new Set(Object.keys(m.logos)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
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

  const encodings = useMemo(
    () => (poster && Object.keys(deals).length ? buildCampusEncodings(poster, deals) : []),
    [poster, deals],
  );
  const posterForScene = useMemo(() => {
    if (!poster) return null;
    if (!encodings.length) return poster;
    return { ...poster, campuses: applyEncodingColors(poster, encodings) };
  }, [poster, encodings]);
  const encodingsRef = useRef(encodings);
  useEffect(() => {
    encodingsRef.current = encodings;
  }, [encodings]);

  useEffect(() => {
    if (!posterForScene || !mountRef.current) return;
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
      const p = posterForScene;
      const encList = encodingsRef.current;
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
      camera.position.set(cx + 68, cy - 118, 1095);
      // n16 fold: offset orbit so above-fold ≠ n14/n15
      camera.up.set(0, 0, 1);

      const ctrl = new OrbitControls(camera, renderer.domElement);
      ctrl.target.set(cx + 18, cy - 36, 0);
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
      // Nature/phylum air: expand islands; hubs further from centroid (less SaaS gravity)
      const spread = 1.18;
      const hubSpread = 1.42;
      for (let i = 0; i < n; i++) {
        const sp = p.kind[i] === 0 ? spread : hubSpread;
        positions[i * 3] = cx + (p.x[i] - cx) * sp;
        positions[i * 3 + 1] = cy + (p.y[i] - cy) * sp;
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
          // Founder size ∝ layout radius + degree (real graph values)
          baseSize[i] = 3.2 + Math.min(3.8, (p.r[i] ?? 2) * 0.35 + Math.sqrt(Math.max(1, p.deg[i] ?? 1)) * 0.55);
        } else if (p.kind[i] === 1) {
          // Company size ∝ degree (founder links)
          rgb = [120, 130, 145];
          baseSize[i] = 1.4 + Math.min(3.2, Math.sqrt(Math.max(1, p.deg[i] ?? 1)) * 0.7);
        } else {
          // Hub size ∝ founder count (deg)
          rgb = [40, 48, 62];
          baseSize[i] = 3.6 + Math.min(6.5, Math.sqrt(Math.max(1, p.deg[i] ?? 1)) * 0.42);
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

      // No decorative glow halo — every visible mark is a real founder/company/hub

      // ---- Out: dense glowing campus balls; Mid: huge airbrushed blobs; Deep: saturated blooms ----
      const islandGroup = new THREE.Group();
      const islandMats: import("three").SpriteMaterial[] = [];
      const islandBaseScale: number[] = [];
      if (p.campusLabels) {
        for (const lab of p.campusLabels.slice(0, 16)) {
          const ci = p.campuses.findIndex((c) => c.id === lab.id);
          const rgb = (ci >= 0 ? hexToRgb(p.campuses[ci].color) : [180, 190, 210]) as [number, number, number];
          // Out-stage campus ball: dense saturated glow hugging the cluster
          const rad = Math.max(40, Math.min(96, lab.r * 0.42 + Math.sqrt(Math.max(8, lab.n)) * 1.7));
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

      // One data-driven contour blob per campus: area∝√founders, chroma∝top-fund share, shape=density
      const bloomGroup = new THREE.Group();
      bloomGroup.visible = false;
      const bloomBaseScale: number[] = [];
      const bloomMeta: CampusEncoding[] = [];
      // Prefer campuses with enough founders for a readable contour; keep smaller ones for color on dots
      const bloomEnc = (encList.length ? encList : []).filter((e) => e.founders >= 6).slice(0, 28);
      bloomEnc.forEach((enc, seed) => {
        const softTex = makeCampusContourTexture(THREE, enc.rgb, enc.points, enc.share, seed, {
          soft: true,
          edgeRichness: 0.4,
        });
        const deepTex = makeCampusContourTexture(THREE, enc.rgb, enc.points, enc.share, seed + 17, {
          soft: false,
          edgeRichness: 0.85,
        });
        const mat = new THREE.SpriteMaterial({
          map: softTex,
          color: 0xffffff,
          transparent: true,
          opacity: 0.0,
          depthWrite: false,
          blending: THREE.NormalBlending,
        });
        const spr = new THREE.Sprite(mat);
        // Overlap for continuous mid field: scale above tight hull
        const sc = blobScaleForFounders(enc.founders, false) * 1.55;
        bloomBaseScale.push(sc);
        bloomMeta.push(enc);
        spr.userData.kind = "campus";
        spr.userData.encId = enc.id;
        spr.userData.softMap = softTex;
        spr.userData.deepMap = deepTex;
        spr.scale.set(sc, sc, 1);
        spr.position.set(cx + (enc.cx - cx) * spread, cy + (enc.cy - cy) * spread, 8);
        bloomGroup.add(spr);
      });
      scene.add(bloomGroup);
      {
        const canvases: HTMLCanvasElement[] = [];
        bloomGroup.traverse((obj) => {
          const spr = obj as import("three").Sprite;
          if (!spr.isSprite) return;
          for (const key of ["softMap", "deepMap"] as const) {
            const map = spr.userData[key] as { userData?: { canvas?: HTMLCanvasElement }; image?: HTMLCanvasElement } | undefined;
            const canvas = map?.userData?.canvas ?? (map?.image instanceof HTMLCanvasElement ? map.image : undefined);
            if (canvas) canvases.push(canvas);
          }
        });
        (window as unknown as { __NETWORKS_BLOB_BORDER_OK__?: boolean; __NETWORKS_BLOB_CANVASES__?: HTMLCanvasElement[] }).__NETWORKS_BLOB_BORDER_OK__ =
          true;
        (window as unknown as { __NETWORKS_BLOB_CANVASES__?: HTMLCanvasElement[] }).__NETWORKS_BLOB_CANVASES__ = canvases;
      }

      // Mid dots: real founders only (subset for density); no decorative tails
      const midKeep = new Uint8Array(n);
      let midKeepN = 0;
      for (let i = 0; i < n; i++) {
        if (p.kind[i] !== 0) continue;
        // n18: denser mid — show most real founders (was ~sparse pastel)
        const keep =
          (hash01(`midkeep:${i}`) < 0.82 && (p.deg[i] ?? 0) < 28) ||
          hash01(`midkeep2:${i}`) < 0.48 ||
          (p.deg[i] ?? 0) >= 4;
        midKeep[i] = keep ? 1 : 0;
        if (keep) midKeepN++;
      }
      (window as unknown as { __NETWORKS_MID_KEEP__?: number }).__NETWORKS_MID_KEEP__ = midKeepN;

      // ---- Real sourced edges only (no cofounder hairball, no decorative tails) ----
      // Poster ek: 0 founder→company, 1 hub→founder, 2 cofounder, 3 shared-investor
      // Draw: (A) campus→hub bundles from hub→founder, (B) culled founder→company.
      type EdgeDraw = {
        a: number;
        b: number;
        kind: "campus_hub" | "founder_company";
        weight: number;
        campusIdx: number;
        segStart: number;
        segCount: number;
      };
      const SEGS = 7; // smooth curve samples per logical edge
      const drawn: EdgeDraw[] = [];
      const hubIndex = new Set<number>();
      for (let i = 0; i < n; i++) if (p.kind[i] === 2) hubIndex.add(i);

      // Campus centroid from label or mean of founders
      const campusCentroid = new Map<number, { x: number; y: number; z: number }>();
      if (p.campusLabels) {
        for (const lab of p.campusLabels) {
          const ci = p.campuses.findIndex((c) => c.id === lab.id);
          if (ci < 0) continue;
          campusCentroid.set(ci, {
            x: cx + (lab.x - cx) * spread,
            y: cy + (lab.y - cy) * spread,
            z: 6,
          });
        }
      }
      for (let i = 0; i < n; i++) {
        if (p.kind[i] !== 0) continue;
        const ci = p.campus[i];
        if (ci < 0 || campusCentroid.has(ci)) continue;
        campusCentroid.set(ci, {
          x: positions[i * 3],
          y: positions[i * 3 + 1],
          z: positions[i * 3 + 2],
        });
      }

      // Aggregate hub→founder into campus→hub weights
      const bundleKey = new Map<string, { ci: number; hub: number; w: number }>();
      for (let ei = 0; ei < p.e0.length; ei++) {
        if (p.ek[ei] !== 1) continue;
        const a = p.e0[ei];
        const b = p.e1[ei];
        let hub = -1;
        let fo = -1;
        if (hubIndex.has(a) && p.kind[b] === 0) {
          hub = a;
          fo = b;
        } else if (hubIndex.has(b) && p.kind[a] === 0) {
          hub = b;
          fo = a;
        } else continue;
        const ci = p.campus[fo];
        if (ci < 0) continue;
        const key = `${ci}|${hub}`;
        const prev = bundleKey.get(key);
        if (prev) prev.w += 1;
        else bundleKey.set(key, { ci, hub, w: 1 });
      }
      const bundles = [...bundleKey.values()].filter((b) => b.w >= 3).sort((a, b) => b.w - a.w);
      // Cap visual density; keep strongest campus→investor/program ties
      const bundleKeep = bundles.slice(0, 48);

      let segCursor = 0;
      for (const b of bundleKeep) {
        drawn.push({
          a: -1 - b.ci,
          b: b.hub,
          kind: "campus_hub",
          weight: b.w,
          campusIdx: b.ci,
          segStart: segCursor,
          segCount: SEGS,
        });
        segCursor += SEGS;
      }

      // Founder→company: keep real edges, cull hard (prefer higher deg, drop hair)
      let foCoKept = 0;
      const foCoCap = 220;
      const foCoOrder: number[] = [];
      for (let ei = 0; ei < p.e0.length; ei++) {
        if (p.ek[ei] !== 0) continue;
        foCoOrder.push(ei);
      }
      foCoOrder.sort((ia, ib) => {
        const da = Math.max(p.deg[p.e0[ia]] ?? 0, p.deg[p.e1[ia]] ?? 0);
        const db = Math.max(p.deg[p.e0[ib]] ?? 0, p.deg[p.e1[ib]] ?? 0);
        return db - da;
      });
      for (const ei of foCoOrder) {
        if (foCoKept >= foCoCap) break;
        const a = p.e0[ei];
        const b = p.e1[ei];
        const maxDeg = Math.max(p.deg[a] ?? 0, p.deg[b] ?? 0);
        // Prefer informative ties; drop random weak/center hair
        if (maxDeg < 2 && hash01(`foco:${a}:${b}`) > 0.35) continue;
        if (maxDeg >= 10 && hash01(`focoDrop:${a}:${b}`) > 0.55) continue;
        if (hash01(`focoKeep:${a}:${b}`) > 0.72 && maxDeg < 5) continue;
        const fo = p.kind[a] === 0 ? a : b;
        const ci = p.campus[fo];
        drawn.push({
          a,
          b,
          kind: "founder_company",
          weight: Math.max(1, maxDeg),
          campusIdx: ci >= 0 ? ci : -1,
          segStart: segCursor,
          segCount: SEGS,
        });
        segCursor += SEGS;
        foCoKept++;
      }

      const maxSeg = segCursor;
      const edgePos = new Float32Array(maxSeg * 6);
      const edgeCol = new Float32Array(maxSeg * 6);
      const edgeMetaA = new Int32Array(maxSeg);
      const edgeMetaB = new Int32Array(maxSeg);
      const maxBundleW = Math.max(1, ...bundleKeep.map((b) => b.w), 1);

      const writeCurve = (
        si: number,
        x0: number,
        y0: number,
        z0: number,
        x1: number,
        y1: number,
        z1: number,
        bend: number,
        rgb: [number, number, number],
        strength: number,
        aIdx: number,
        bIdx: number,
      ) => {
        const mx = (x0 + x1) / 2 - (y1 - y0) * bend;
        const my = (y0 + y1) / 2 + (x1 - x0) * bend;
        const mz = (z0 + z1) / 2;
        const pts: [number, number, number][] = [];
        for (let s = 0; s <= SEGS; s++) {
          const t = s / SEGS;
          const u = 1 - t;
          pts.push([
            u * u * x0 + 2 * u * t * mx + t * t * x1,
            u * u * y0 + 2 * u * t * my + t * t * y1,
            u * u * z0 + 2 * u * t * mz + t * t * z1,
          ]);
        }
        const ink = 0.28;
        for (let s = 0; s < SEGS; s++) {
          const base = (si + s) * 6;
          edgePos[base] = pts[s][0];
          edgePos[base + 1] = pts[s][1];
          edgePos[base + 2] = pts[s][2];
          edgePos[base + 3] = pts[s + 1][0];
          edgePos[base + 4] = pts[s + 1][1];
          edgePos[base + 5] = pts[s + 1][2];
          edgeMetaA[si + s] = aIdx;
          edgeMetaB[si + s] = bIdx;
          // Slight fade along curve; strength drives opacity via vertex color
          const fade = 0.78 + 0.22 * (1 - Math.abs(s / (SEGS - 1) - 0.5) * 2);
          const sMul = strength * fade;
          for (let k = 0; k < 2; k++) {
            edgeCol[base + k * 3] = ((rgb[0] / 255) * (1 - ink) + 0.2 * ink) * sMul;
            edgeCol[base + k * 3 + 1] = ((rgb[1] / 255) * (1 - ink) + 0.22 * ink) * sMul;
            edgeCol[base + k * 3 + 2] = ((rgb[2] / 255) * (1 - ink) + 0.26 * ink) * sMul;
          }
        }
      };

      for (const d of drawn) {
        let x0: number, y0: number, z0: number, x1: number, y1: number, z1: number;
        let aIdx = d.a;
        const bIdx = d.b;
        if (d.kind === "campus_hub") {
          const c = campusCentroid.get(d.campusIdx);
          if (!c) continue;
          x0 = c.x;
          y0 = c.y;
          z0 = c.z;
          x1 = positions[d.b * 3];
          y1 = positions[d.b * 3 + 1];
          z1 = positions[d.b * 3 + 2];
          aIdx = d.b; // year filter uses hub + any campus founder via meta flag -1
        } else {
          x0 = positions[d.a * 3];
          y0 = positions[d.a * 3 + 1];
          z0 = positions[d.a * 3 + 2];
          x1 = positions[d.b * 3];
          y1 = positions[d.b * 3 + 1];
          z1 = positions[d.b * 3 + 2];
        }
        const rgb =
          d.campusIdx >= 0 && p.campuses[d.campusIdx]
            ? hexToRgb(p.campuses[d.campusIdx].color)
            : ([100, 110, 125] as [number, number, number]);
        const strength =
          d.kind === "campus_hub"
            ? 0.55 + 0.85 * Math.min(1, d.weight / maxBundleW)
            : 0.42 + 0.35 * Math.min(1, Math.log2(1 + d.weight) / 4);
        const bend =
          (hash01(`bend:${d.kind}:${d.a}:${d.b}`) - 0.5) * (d.kind === "campus_hub" ? 0.42 : 0.22);
        writeCurve(d.segStart, x0, y0, z0, x1, y1, z1, bend, rgb, strength, aIdx, bIdx);
      }

      const edgeColBase = new Float32Array(edgeCol);
      const edgeGeo = new THREE.BufferGeometry();
      edgeGeo.setAttribute("position", new THREE.BufferAttribute(edgePos, 3));
      edgeGeo.setAttribute("color", new THREE.BufferAttribute(edgeCol, 3));
      // Slightly thicker read: duplicate geometry with tiny offset as companion strands
      const edgeMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.88,
        depthWrite: false,
      });
      const edges = new THREE.LineSegments(edgeGeo, edgeMat);
      scene.add(edges);
      // Companion pass for Cosmos-like weight (campus_hub only via higher base strength already)
      const edgeGeo2 = edgeGeo.clone();
      const pos2 = edgeGeo2.getAttribute("position") as import("three").BufferAttribute;
      for (let i = 0; i < pos2.count; i++) {
        pos2.setXYZ(i, pos2.getX(i) + 0.55, pos2.getY(i) - 0.35, pos2.getZ(i));
      }
      pos2.needsUpdate = true;
      const edgeMat2 = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      });
      const edgesFat = new THREE.LineSegments(edgeGeo2, edgeMat2);
      scene.add(edgesFat);

      const edgeStats = {
        before: {
          total: p.e0.length,
          founder_company: p.ek.filter((k) => k === 0).length,
          hub_founder: p.ek.filter((k) => k === 1).length,
          cofounder: p.ek.filter((k) => k === 2).length,
          shared_investor: p.ek.filter((k) => k === 3).length,
        },
        after: {
          total: drawn.length,
          campus_hub_bundle: drawn.filter((d) => d.kind === "campus_hub").length,
          founder_company: drawn.filter((d) => d.kind === "founder_company").length,
          hub_founder: 0,
          cofounder: 0,
          shared_investor: 0,
          decorative_tails: 0,
        },
        segments: maxSeg,
      };
      (window as unknown as { __NETWORKS_EDGE_STATS__?: typeof edgeStats }).__NETWORKS_EDGE_STATS__ = edgeStats;

      const nodeVisible = new Uint8Array(n);
      const applyYearVisibility = (scrub: number) => {
        for (let i = 0; i < n; i++) {
          if (p.kind[i] === 0) nodeVisible[i] = founderVisibleAtYear(yearArr[i], scrub, yearMax) ? 1 : 0;
          else nodeVisible[i] = 1;
        }
        const sizeAttr = geo.getAttribute("size") as import("three").BufferAttribute;
        for (let i = 0; i < n; i++) {
          sizeAttr.setX(i, nodeVisible[i] === 1 ? baseSize[i] : 0.01);
        }
        sizeAttr.needsUpdate = true;
        const ec = edgeGeo.getAttribute("color") as import("three").BufferAttribute;
        const ec2 = edgeGeo2.getAttribute("color") as import("three").BufferAttribute;
        for (const d of drawn) {
          let ok = true;
          if (d.kind === "founder_company") {
            ok =
              (p.kind[d.a] !== 0 || nodeVisible[d.a] === 1) &&
              (p.kind[d.b] !== 0 || nodeVisible[d.b] === 1);
          }
          const mul = ok ? 1 : 0.04;
          for (let s = 0; s < d.segCount; s++) {
            const base = (d.segStart + s) * 6;
            for (let k = 0; k < 2; k++) {
              const idx = (d.segStart + s) * 2 + k;
              const r = edgeColBase[base + k * 3] * mul;
              const g = edgeColBase[base + k * 3 + 1] * mul;
              const bch = edgeColBase[base + k * 3 + 2] * mul;
              ec.setXYZ(idx, r, g, bch);
              ec2.setXYZ(idx, r, g, bch);
            }
          }
        }
        ec.needsUpdate = true;
        ec2.needsUpdate = true;
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
          void tSec;
          islandMats.forEach((m, i) => {
            m.opacity = outW * 0.62 + midW * 0.04;
            const spr = islandGroup.children[i] as import("three").Sprite;
            if (spr && islandBaseScale[i]) {
              const s = islandBaseScale[i] * (0.82 + outW * 0.28);
              spr.scale.set(s, s, 1);
              spr.visible = outW > 0.1;
            }
          });
          bloomGroup.visible = midW > 0.05 || deepW > 0.05;
          const mobile = (renderer?.domElement.clientWidth ?? 1440) < 500;
          const mobileContain = mobile ? 0.88 : 1;
          let bi = 0;
          bloomGroup.traverse((obj) => {
            if (!(obj as import("three").Sprite).isSprite) return;
            const spr = obj as import("three").Sprite;
            const m = spr.material as import("three").SpriteMaterial;
            m.opacity = midW * 0.98 + deepW * 0.92;
            const useDeep = deepW >= midW && deepW > 0.35;
            const nextMap = useDeep ? spr.userData.deepMap : spr.userData.softMap;
            if (nextMap && m.map !== nextMap) m.map = nextMap;
            const base = bloomBaseScale[bi] ?? 120;
            const midScale = (1.22 + midW * 0.38) * mobileContain;
            const deepScale = (0.42 + deepW * 0.38) * (mobile ? 0.9 : 1);
            const s = base * (midW > deepW ? midScale : deepScale);
            spr.scale.set(s, s, 1);
            bi++;
          });
          pointMat.uniforms.uOpacity.value = 0.38 + outW * 0.45 + midW * 0.92 + deepW * 0.45;
          const colAttr = geo.getAttribute("color") as import("three").BufferAttribute;
          const sizeA = geo.getAttribute("size") as import("three").BufferAttribute;
          const posA = geo.getAttribute("position") as import("three").BufferAttribute;
          for (let i = 0; i < n; i++) {
            if (p.kind[i] !== 0) {
              const hubFade = 1 - midW * 0.85;
              if (nodeVisible[i]) {
                sizeA.setX(i, baseSize[i] * (0.85 + outW * 0.2) * hubFade + 0.01);
              }
              posA.setXYZ(i, positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
              continue;
            }
            if (!nodeVisible[i]) {
              sizeA.setX(i, 0.01);
              continue;
            }
            const ci = p.campus[i];
            const rgb = ci >= 0 && p.campuses[ci] ? hexToRgb(p.campuses[ci].color) : [148, 163, 184];
            const keep = midKeep[i] === 1;
            const midHide = midW > 0.35 && !keep;
            // Mid: keep campus hue (sat encodes campus; darkness is mild) — not gray wash
            const mix = midHide ? 0 : midW * 0.55;
            const shade = 0.55; // darken toward campus-ink, not black
            const r = (rgb[0] / 255) * (1 - mix) * (0.85 + outW * 0.15) + (rgb[0] / 255) * shade * mix;
            const g = (rgb[1] / 255) * (1 - mix) * (0.85 + outW * 0.15) + (rgb[1] / 255) * shade * mix;
            const bch = (rgb[2] / 255) * (1 - mix) * (0.85 + outW * 0.15) + (rgb[2] / 255) * shade * mix;
            colAttr.setXYZ(i, r, g, bch);
            let s: number;
            if (midHide) s = 0.01;
            else if (midW > 0.35 && keep) s = (5.2 + Math.min(4.2, (p.r[i] ?? 2) * 0.55 + Math.sqrt(Math.max(1, p.deg[i] ?? 1)) * 0.35)) * (0.9 + midW * 0.7);
            else s = baseSize[i] * (0.72 + outW * 0.35) * (1 + deepW * 0.4);
            sizeA.setX(i, s);
            posA.setXYZ(i, positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
          }
          colAttr.needsUpdate = true;
          sizeA.needsUpdate = true;
          posA.needsUpdate = true;
          // Stage ink from real data: mid campus→hub ∝ tie weight; deep fo→co ∝ degree
          const ec = edgeGeo.getAttribute("color") as import("three").BufferAttribute;
          const ec2 = edgeGeo2.getAttribute("color") as import("three").BufferAttribute;
          for (const d of drawn) {
            let stageMul = 1;
            if (d.kind === "campus_hub") {
              const wNorm = Math.min(1, d.weight / maxBundleW);
              // Mid: curve weight strictly ∝ tie count (data ink)
              stageMul =
                outW * (0.55 + 0.45 * wNorm) +
                midW * (0.28 + 0.72 * wNorm) +
                deepW * (0.35 + 0.4 * wNorm) +
                cardW * 0.08;
            } else {
              const degN = Math.min(1, Math.log2(1 + d.weight) / 4);
              // Deep: real edge opacity scales with node degree
              stageMul =
                outW * 0.12 +
                midW * 0.04 +
                deepW * (0.28 + 0.72 * degN) +
                cardW * 0.06;
              const yearOk =
                (p.kind[d.a] !== 0 || nodeVisible[d.a] === 1) &&
                (p.kind[d.b] !== 0 || nodeVisible[d.b] === 1);
              if (!yearOk) stageMul *= 0.04;
            }
            for (let s = 0; s < d.segCount; s++) {
              const base = (d.segStart + s) * 6;
              for (let k = 0; k < 2; k++) {
                const idx = (d.segStart + s) * 2 + k;
                const r = edgeColBase[base + k * 3] * stageMul;
                const g = edgeColBase[base + k * 3 + 1] * stageMul;
                const bch = edgeColBase[base + k * 3 + 2] * stageMul;
                ec.setXYZ(idx, r, g, bch);
                ec2.setXYZ(idx, r, g, bch);
              }
            }
          }
          ec.needsUpdate = true;
          ec2.needsUpdate = true;
          edgeMat.opacity = Math.min(1, 0.55 + outW * 0.4 + midW * 0.35 + deepW * 0.35);
          edgeMat2.opacity = outW * 0.4 + midW * 0.28 + deepW * 0.25;
          edges.visible = outW > 0.08 || deepW > 0.15 || midW > 0.12;
          edgesFat.visible = edges.visible && (outW > 0.15 || midW > 0.2 || deepW > 0.3);
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
        __NETWORKS_RESET_VIEW__?: () => void;
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
      w.__NETWORKS_RESET_VIEW__ = () => {
        // Start over at the same reproducible overhead camera used for the
        // widest reference. Do not leave a close-up orbit orientation behind.
        ctrl.target.set(cx + 18, cy - 36, 0);
        camera.up.set(0, 0, 1);
        camera.position.set(cx + 68, cy - 118, 1095);
        ctrl.update();
        applyScaleNow(0.76);
      };
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
      });
      if (wrapRef.current) ro.observe(wrapRef.current);

      const _proj = new THREE.Vector3();
      const worldToOverlay = (wx: number, wy: number, wz = 0, loose = false, spMul = spread) => {
        const wrap = wrapRef.current;
        if (!wrap) return { x: 0, y: 0, onscreen: false };
        const ww = wrap.clientWidth;
        const hh = wrap.clientHeight;
        // Campus labels live in poster space; hubs use hubSpread
        const sx = cx + (wx - cx) * spMul;
        const sy = cy + (wy - cy) * spMul;
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
        // Out: only 8–10 highest-signal hubs (campus notes by founder count)
        const noteCap = ww < 500 ? 4 : 6;
        const notePool = [...(p.campusLabels ?? [])].sort((a, b) => b.n - a.n).slice(0, noteCap);
        if (outW > 0.25) {
          for (const lab of notePool) {
            const pt = worldToOverlay(lab.x, lab.y, 0);
            if (!pt.onscreen) continue;
            const ang = hash01(`note:${lab.id}`) * Math.PI * 2;
            const off = outW > 0.35 ? 30 + Math.min(44, Math.sqrt(lab.n) * 2.0) : 0;
            const lx = pt.x + Math.cos(ang) * off;
            const ly = pt.y + Math.sin(ang) * off * 0.82;
            const enc = encodingsRef.current.find((e) => e.id === lab.id);
            raw.push({
              id: lab.id,
              label: lab.label,
              x: lx,
              y: ly,
              ax: pt.x,
              ay: pt.y,
              priority: 1000 + lab.n,
              kind: "campus",
              n: lab.n,
              color: enc?.color,
            });
          }
        }
        // Investor/program hub labels: strongest signal only, not at far out (campus notes own that stage)
        if (outW < 0.55) {
          const hubPool = [...p.hubs].sort((a, b) => b.founders - a.founders).slice(0, outW > 0.25 ? 6 : 10);
          for (const hub of hubPool) {
            const pt = worldToOverlay(p.x[hub.i], p.y[hub.i], zArr[hub.i] ?? 0, false, hubSpread);
            if (!pt.onscreen) continue;
            const short = hub.label.length > 20 ? `${hub.label.slice(0, 18)}…` : hub.label;
            raw.push({
              id: `hub:${hub.id}`,
              label: short,
              x: pt.x + 10,
              y: pt.y + 10,
              priority: 400 + hub.founders,
              kind: "hub",
            });
          }
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
          setArcs([]);
          if (deepW > 0.55) {
            setMediaCards([]);
            setCards([]);
          }
        } else if (outW > 0.35) {
          setLabels(collideLabels(raw, ww < 500 ? 8 : 10));
          setTrackBoxes([]);
          setArcs([]);
          setMediaCards([]);
        } else {
          setLabels(midW > 0.45 ? [] : collideLabels(raw, 8));
          setTrackBoxes([]);
          setArcs([]);
          if (midW > 0.4) setMediaCards([]);
        }

        // Blob hit targets for tooltips (campus / founders / backed share)
        if ((midW > 0.2 || deepW > 0.2) && encodingsRef.current.length) {
          const hits: { id: string; label: string; founders: number; backed: number; share: number; color: string; x: number; y: number; r: number }[] = [];
          const mobile = ww < 500;
          for (const enc of encodingsRef.current) {
            if (enc.founders < 10) continue;
            const pt = worldToOverlay(enc.cx, enc.cy, 0, true);
            if (!pt.onscreen && !(pt.x > 0 && pt.y > 0)) continue;
            const sc = blobScaleForFounders(enc.founders, mobile) * (midW > deepW ? 1.1 : 0.55) * (mobile ? 0.88 : 1);
            // Approximate screen radius from world scale (poster ~1100 wide → viewport)
            const r = Math.max(18, Math.min(70, (sc / Math.max(p.w, 1)) * ww * 0.55));
            hits.push({
              id: enc.id,
              label: enc.label,
              founders: enc.founders,
              backed: enc.backed,
              share: enc.share,
              color: enc.color,
              x: pt.x,
              y: pt.y,
              r,
            });
          }
          setBlobHits(hits.slice(0, mobile ? 12 : 20));
        } else {
          setBlobHits([]);
          setBlobTip(null);
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

          // Denser in-web media field (between MP4) — NOT founder-cards; cull vs labels + each other
          const media: MediaCard[] = [];
          // ~16–18 real thumbnails only (sourced company logos); cull for overlay gate
          const maxMedia = ww < 500 ? 8 : 18;
          const labApprox = raw.map((lab) => {
            const lw = Math.min(160, 10 + lab.label.length * 6.6);
            return { left: lab.x - lw / 2, right: lab.x + lw / 2, top: lab.y - 8, bottom: lab.y + 8 };
          });
          const placed: { left: number; right: number; top: number; bottom: number }[] = [];
          const pool = cand.slice(0, Math.min(cand.length, 90));
          for (let mi = 0; mi < pool.length && media.length < maxMedia; mi++) {
            const c = pool[mi];
            const fid = p.foIds[c.i] ?? "";
            const deal = dealsRef.current[fid];
            const cid = deal?.companyId;
            if (!cid || !logoIdsRef.current.has(cid)) continue;
            const logoUrl = `/company-logos/${cid}.webp`;
            // Only real sourced logos from manifest — no fake brands
            const h = hash01(`media:${c.i}`);
            const ang = (h * Math.PI * 2 + mi * 0.62) % (Math.PI * 2);
            const rad = 22 + (h * 0.5 + (mi % 6) * 0.08) * (ww < 500 ? 72 : 120);
            const x = c.pt.x + Math.cos(ang) * rad;
            const y = c.pt.y + Math.sin(ang) * rad * 0.7;
            const mw = ww < 500 ? 32 : 40;
            const mh = mw;
            const pad = 3;
            const rect = { left: x - mw / 2, right: x + mw / 2, top: y - mh / 2, bottom: y + mh / 2 };
            const hitsLabel = labApprox.some(
              (lr) => lr.left < rect.right && lr.right > rect.left && lr.top < rect.bottom && lr.bottom > rect.top,
            );
            if (hitsLabel) continue;
            const hitsPeer = placed.some(
              (pr) => pr.left < rect.right - pad && pr.right > rect.left + pad && pr.top < rect.bottom - pad && pr.bottom > rect.top + pad,
            );
            if (hitsPeer) continue;
            if (x < 18 || y < 18 || x > ww - 18 || y > hh - 48) continue;
            const ci = p.campus[c.i];
            const campusColor = ci >= 0 && p.campuses[ci] ? p.campuses[ci].color : "#94a3b8";
            media.push({
              key: `m-${c.i}`,
              x,
              y,
              w: mw,
              h: mh,
              title: (deal?.companyName || deal?.founderName || "·").slice(0, 14),
              hue: campusColor,
              pop: cardW,
              logoUrl,
            });
            placed.push(rect);
          }
          setMediaCards(media);
        } else {
          setCards([]);
          setMediaCards([]);
        }
      };

      let lastUiScale = distToScale(camera.position.distanceTo(ctrl.target));
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
        // Keep close-ups stable long enough to inspect names and relationships.
        // Only the two wide reference levels may gently orbit when idle.
        ctrl.autoRotate = false; // Keep camera still while inspecting networks.
        ctrl.update();
        renderer!.render(scene, camera);

        const dist = camera.position.distanceTo(ctrl.target);
        const scale = distToScale(dist);
        const st = stageWeights(scale);
        apiRef.current?.setStages(st.outW, st.midW, st.cardW, st.deepW, t * 0.001);
        // Keep React overlays synchronized while zooming continuously, not
        // only when crossing a tier. The old behavior popped cards and labels
        // abruptly because state remained at the previous camera tier.
        if (tierRef.current !== st.tier || Math.abs(lastUiScale - scale) > 0.1) {
          tierRef.current = st.tier;
          lastUiScale = scale;
          setZoomScale(scale);
          wrapRef.current?.setAttribute("data-networks-zoom", String(st.tier));
          wrapRef.current?.setAttribute("data-networks-current-scale", scale.toFixed(2));
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
      const w = window as unknown as { __NETWORKS_SET_SCALE__?: unknown; __NETWORKS_RESET_VIEW__?: unknown; __NETWORKS_SET_YEAR__?: unknown };
      delete w.__NETWORKS_SET_SCALE__;
      delete w.__NETWORKS_RESET_VIEW__;
      delete w.__NETWORKS_SET_YEAR__;
    };
  }, [posterForScene, yearMax, yearMin]);

  const legendEnc = encodings.filter((e) => e.id !== "other");
  const legendTop = legendEnc.slice(0, 6);
  const legendRest = legendEnc.slice(6);
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
        className="relative w-screen max-w-none touch-manipulation overflow-hidden left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] max-md:!h-[64vh]"
        style={{ height: "min(76vh, 710px)", background: "var(--networks-bg, #ece9e4)" }}
        data-networks-graph=""
        data-networks-fade="0"
        data-networks-zoom="0"
        data-networks-engine="webgl"
      >
        <div ref={mountRef} className="absolute inset-0 h-full w-full" />

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

        {/* Data-driven campus blob hit targets (tooltip: campus / n / backed share) */}
        <div className="pointer-events-none absolute inset-0 z-[3]" style={{ opacity: midOpacity > 0.15 || deepOpacity > 0.15 ? 1 : 0 }}>
          {blobHits.map((h) => (
            <button
              key={`hit-${h.id}`}
              type="button"
              data-networks-blob-hit={h.id}
              className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-0 bg-transparent p-0"
              style={{ left: h.x, top: h.y, width: h.r * 2, height: h.r * 2 }}
              aria-label={`${h.label}: ${h.founders} ${nounFor(h.founders, "founder")}, ${h.backed} of ${h.founders} top-fund backed`}
              onMouseEnter={() =>
                setBlobTip({
                  id: h.id,
                  label: h.label,
                  founders: h.founders,
                  backed: h.backed,
                  share: h.share,
                  color: h.color,
                  x: h.x,
                  y: h.y,
                })
              }
              onMouseLeave={() => setBlobTip(null)}
              onFocus={() =>
                setBlobTip({
                  id: h.id,
                  label: h.label,
                  founders: h.founders,
                  backed: h.backed,
                  share: h.share,
                  color: h.color,
                  x: h.x,
                  y: h.y,
                })
              }
              onBlur={() => setBlobTip(null)}
              onClick={() =>
                setBlobTip({
                  id: h.id,
                  label: h.label,
                  founders: h.founders,
                  backed: h.backed,
                  share: h.share,
                  color: h.color,
                  x: h.x,
                  y: h.y,
                })
              }
            />
          ))}
          {blobTip ? (
            <div
              data-networks-blob-tooltip=""
              className="pointer-events-none absolute z-[4] max-w-[200px] -translate-x-1/2 rounded border border-slate-800/15 bg-[#fbfaf7]/95 px-2 py-1.5 text-[10px] text-slate-800 shadow-sm backdrop-blur-sm"
              style={{ left: blobTip.x, top: Math.max(8, blobTip.y - 52) }}
            >
              <div className="flex items-center gap-1.5 font-medium">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: blobTip.color }} />
                {blobTip.label}
              </div>
              <div className="mt-0.5 text-slate-600">
                {blobTip.founders.toLocaleString("en-US")} {nounFor(blobTip.founders, "founder")} on map
              </div>
              <div className="text-slate-600">
                Top-fund backed {blobTip.backed}/{blobTip.founders} ({Math.round(blobTip.share * 100)}%)
              </div>
            </div>
          ) : null}
        </div>

        {/* Editorial margin leader lines removed to keep clusters navigable. */}

        {/* Campus + hub labels (collision-culled) */}
        <div className="pointer-events-none absolute inset-0 z-[2]" style={{ opacity: labelOpacity }}>
          {labels.map((lab) => (
            <div
              key={lab.id}
              {...(lab.kind === "campus"
                ? {
                    "data-canvas-label": lab.id,
                    "data-label-anchor-x": String(lab.ax ?? lab.x),
                    "data-label-anchor-y": String(lab.ay ?? lab.y),
                    "data-hub-x": String(lab.ax ?? lab.x),
                    "data-hub-y": String(lab.ay ?? lab.y),
                    "data-hub-r": 40,
                  }
                : { "data-canvas-hub-label": lab.id.replace(/^hub:/, "") })}
              className={
                lab.kind === "campus"
                  ? "absolute -translate-x-1/2 -translate-y-1/2 text-center font-serif text-[10px] font-normal italic tracking-tight md:text-[12px]"
                  : "absolute -translate-x-1/2 font-serif text-[8px] font-normal tracking-tight text-slate-700 md:text-[9px]"
              }
              style={{
                left: lab.x,
                top: lab.y,
                color: lab.kind === "campus" && lab.color ? lab.color : undefined,
                textShadow: "0 0 5px var(--networks-bg, #ece9e4), 0 1px 3px var(--networks-bg, #ece9e4)",
              }}
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
              className="absolute overflow-hidden rounded-[3px] border border-slate-800/25 bg-[#f7f5f1] shadow-sm"
              style={{
                left: m.x - m.w / 2,
                top: m.y - m.h / 2,
                width: m.w,
                height: m.h,
                boxShadow: `inset 0 0 0 1px ${m.hue}55`,
                transform: `scale(${0.72 + m.pop * 0.28})`,
                transformOrigin: "center",
                transition: "transform 420ms cubic-bezier(0.22, 1.2, 0.36, 1), opacity 280ms ease",
              }}
            >
              {m.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.logoUrl} alt="" className="h-full w-full object-contain p-1" draggable={false} />
              ) : null}
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
        data-networks-legend-dock=""
        className="mt-2 space-y-1.5 px-1 text-[11px] text-[color:var(--fg-2)]"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1" data-networks-legend-encodings="">
          <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-[color:var(--fg-3)]">Encodings</span>
          <span className="inline-flex items-center gap-1" title="One hue per campus; nearby campuses get far-apart hues">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#2563eb]" /> Color = campus
          </span>
          <span className="inline-flex items-center gap-1" title="Blob area scales with founders on the map">
            <span className="inline-block h-3 w-3 rounded-full border border-slate-500/40 bg-slate-400/30" /> Size = founders
          </span>
          <span
            className="inline-flex items-center gap-1"
            title="Chroma from share backed by top funds; swatches use satMulFromShare"
            data-networks-legend-sat=""
          >
            <span className="inline-flex items-center gap-0.5" aria-hidden="true">
              {[0, 0.5, 1].map((share) => {
                const mul = satMulFromShare(share);
                const br = 37, bg0 = 99, bb = 235;
                const lum = 0.3 * br + 0.59 * bg0 + 0.11 * bb;
                const r = Math.round(lum * (1 - mul) + br * mul);
                const g = Math.round(lum * (1 - mul) + bg0 * mul);
                const b = Math.round(lum * (1 - mul) + bb * mul);
                return (
                  <span
                    key={share}
                    className="inline-block h-2.5 w-2.5 rounded-full border border-slate-400/30"
                    style={{ background: `rgb(${r},${g},${b})` }}
                    data-sat-share={share}
                    data-sat-mul={mul.toFixed(3)}
                  />
                );
              })}
            </span>
            Saturation = top-fund share
          </span>
          <span className="inline-flex items-center gap-1" title="Weighted campus→investor/program curves">
            <span className="inline-block h-[2px] w-4 rounded bg-slate-600/70" /> Curve weight = tie count
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] text-[color:var(--fg-3)]">
            Dots = founders / companies / hubs · sized by degree
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {legendTop.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1.5" data-legend-swatch={c.color} data-legend-campus={c.id}>
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
              {c.label}
              <span className="text-[9px] text-[color:var(--fg-3)]">{c.founders}</span>
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
        </div>
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
