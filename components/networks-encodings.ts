/**
 * Data-driven visual encodings for /networks.
 * One shared total: poster founder count (kind===0). Every color/size/sat maps to campus stats.
 */
import type { Deal, Poster, PosterCampus } from "@/components/networks-poster-types";

/** Crowded pathways + major funds — mirrors lib/domain/founder-networks TOP_FUND_LABELS. */
export const TOP_FUND_LABELS = new Set(
  [
    "Y Combinator",
    "a16z Speedrun",
    "Andreessen Horowitz",
    "Sequoia Capital",
    "General Catalyst",
    "Founders Fund",
    "CRV",
    "Accel",
    "Accel Partners",
    "Benchmark",
    "First Round Capital",
    "Kleiner Perkins",
    "Khosla Ventures",
    "Index Ventures",
    "Bessemer Venture Partners",
    "Thrive Capital",
    "Felicis",
    "Lux Capital",
    "Redpoint",
    "SignalFire",
    "SV Angel",
    "Pear VC",
    "South Park Commons",
    "Uncork Capital",
    "Foundation Capital",
    "BoxGroup",
    "Bain Capital Ventures",
    "ICONIQ Capital",
  ].map((s) => s.toLowerCase()),
);

const TOP_SUBSTR = [
  "sequoia",
  "a16z",
  "andreessen",
  "general catalyst",
  "benchmark",
  "accel",
  "founders fund",
  "kleiner",
  "khosla",
  "bessemer",
  "felicis",
];

export function founderIsTopBacked(deal: Deal | undefined | null): boolean {
  if (!deal) return false;
  if (deal.hasTopFund) return true;
  for (const n of deal.networks ?? []) {
    if (TOP_FUND_LABELS.has(n.trim().toLowerCase())) return true;
  }
  for (const inv of deal.investors ?? []) {
    const name = typeof inv === "string" ? inv : String((inv as { name?: string }).name ?? "");
    const low = name.trim().toLowerCase();
    if (!low) continue;
    if (TOP_FUND_LABELS.has(low)) return true;
    if (TOP_SUBSTR.some((t) => low.includes(t))) return true;
  }
  return false;
}

export type CampusEncoding = {
  id: string;
  label: string;
  color: string;
  rgb: [number, number, number];
  founders: number;
  backed: number;
  /** backed / founders — drives chroma (faint = open lane) */
  share: number;
  cx: number;
  cy: number;
  /** Local founder positions (poster space) for density contour */
  points: { x: number; y: number }[];
};

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  if (h.length === 3) {
    return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
  }
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * c);
  };
  return `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function hueDist(a: number, b: number) {
  const d = Math.abs(a - b) % 1;
  return Math.min(d, 1 - d);
}

/**
 * Spatially-aware distinct hues: nearby campus centroids get far-apart hues.
 * Runtime recompute from poster positions so encodings stay on the one shared total.
 */
function assignSpatialColors(
  rows: { id: string; x: number; y: number; n: number }[],
): Record<string, string> {
  const N = rows.length;
  if (!N) return {};
  const cx = rows.reduce((s, r) => s + r.x, 0) / N;
  const cy = rows.reduce((s, r) => s + r.y, 0) / N;
  const ordered = [...rows].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx),
  );
  const hues = ordered.map((_, i) => i / N);
  const assigned: Record<number, number> = {};
  const avail = [...hues];
  const order = [...ordered.keys()].sort((i, j) => ordered[j].n - ordered[i].n);
  const dist = (i: number, k: number) =>
    Math.hypot(ordered[i].x - ordered[k].x, ordered[i].y - ordered[k].y);
  for (const i of order) {
    let best = avail[0];
    let bestScore = -1;
    let bestJ = 0;
    for (let j = 0; j < avail.length; j++) {
      const h = avail[j];
      const near = Object.keys(assigned)
        .map(Number)
        .filter((k) => dist(i, k) < 220);
      let score = 1;
      if (near.length) score = Math.min(...near.map((k) => hueDist(h, assigned[k])));
      const vals = Object.values(assigned);
      if (vals.length) score = 0.65 * score + 0.35 * Math.min(...vals.map((hh) => hueDist(h, hh)));
      if (score > bestScore) {
        bestScore = score;
        best = h;
        bestJ = j;
      }
    }
    assigned[i] = best;
    avail.splice(bestJ, 1);
  }
  const out: Record<string, string> = {};
  for (let i = 0; i < ordered.length; i++) {
    out[ordered[i].id] = hslToHex(assigned[i] ?? i / N, 0.7, 0.4);
  }
  return out;
}

export function buildCampusEncodings(
  poster: Poster,
  deals: Record<string, Deal>,
): CampusEncoding[] {
  const campuses = poster.campuses;
  const labels = new Map((poster.campusLabels ?? []).map((l) => [l.id, l]));
  const acc = new Map<
    string,
    { n: number; backed: number; xs: number[]; ys: number[]; label: string }
  >();
  for (const c of campuses) {
    acc.set(c.id, { n: 0, backed: 0, xs: [], ys: [], label: c.label });
  }
  for (let i = 0; i < poster.foIds.length; i++) {
    if (poster.kind[i] !== 0) continue;
    const ci = poster.campus[i];
    if (ci < 0 || ci >= campuses.length) continue;
    const c = campuses[ci];
    const row = acc.get(c.id)!;
    row.n += 1;
    row.xs.push(poster.x[i]);
    row.ys.push(poster.y[i]);
    if (founderIsTopBacked(deals[poster.foIds[i] ?? ""])) row.backed += 1;
  }
  const spatialIn: { id: string; x: number; y: number; n: number }[] = [];
  for (const [id, row] of acc) {
    if (row.n === 0) continue;
    const lab = labels.get(id);
    const x = lab ? lab.x : row.xs.reduce((a, b) => a + b, 0) / row.xs.length;
    const y = lab ? lab.y : row.ys.reduce((a, b) => a + b, 0) / row.ys.length;
    spatialIn.push({ id, x, y, n: row.n });
  }
  const colors = assignSpatialColors(spatialIn);
  const out: CampusEncoding[] = [];
  for (const [id, row] of acc) {
    if (row.n === 0) continue;
    const lab = labels.get(id);
    const cx = lab ? lab.x : row.xs.reduce((a, b) => a + b, 0) / row.xs.length;
    const cy = lab ? lab.y : row.ys.reduce((a, b) => a + b, 0) / row.ys.length;
    const color = colors[id] ?? "#64748b";
    const points = row.xs.map((x, i) => ({ x: x - cx, y: row.ys[i] - cy }));
    out.push({
      id,
      label: row.label,
      color,
      rgb: hexToRgb(color),
      founders: row.n,
      backed: row.backed,
      share: row.n ? row.backed / row.n : 0,
      cx,
      cy,
      points,
    });
  }
  out.sort((a, b) => b.founders - a.founders);
  return out;
}

/** Patch poster campus colors in-place so dots/labels/legend share one palette. */
export function applyEncodingColors(poster: Poster, encodings: CampusEncoding[]): PosterCampus[] {
  const map = new Map(encodings.map((e) => [e.id, e.color]));
  return poster.campuses.map((c) => ({ ...c, color: map.get(c.id) ?? c.color }));
}

/**
 * Saturation multiplier from top-fund backed share.
 * Monotonic in [floor, 1]. Floor raised so open-lane campuses still read on cream
 * while high-share campuses stay fully chroma. Legend swatches MUST call this.
 */
export function satMulFromShare(share: number): number {
  const s = Math.max(0, Math.min(1, share));
  // n19: target mid sat ~28–32 (ops sat_mask); floor raised, still monotonic.
  return 0.82 + 0.18 * s;
}

/**
 * Density-contour watercolor texture from real campus dot offsets.
 * Area of the sprite is set separately (∝ √founders); saturation follows backed share.
 */
/** Sample outer border of a canvas; every alpha must be 0 (no hard sprite clip). */
export function assertBlobTextureBorderClear(
  canvas: HTMLCanvasElement,
  label = "blob",
  borderPx = 2,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(`${label}: no 2d context`);
  const { width: w, height: h } = canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const hits: string[] = [];
  const check = (x: number, y: number) => {
    const a = d[(y * w + x) * 4 + 3];
    if (a !== 0) hits.push(`${x},${y}=${a}`);
  };
  for (let y = 0; y < h; y++) {
    for (let b = 0; b < borderPx; b++) {
      check(b, y);
      check(w - 1 - b, y);
    }
  }
  for (let x = borderPx; x < w - borderPx; x++) {
    for (let b = 0; b < borderPx; b++) {
      check(x, b);
      check(x, h - 1 - b);
    }
  }
  if (hits.length) {
    throw new Error(
      `${label}: blob texture border alpha must be 0 (sprite clip); samples: ${hits.slice(0, 12).join("; ")}${hits.length > 12 ? ` (+${hits.length - 12})` : ""}`,
    );
  }
}

export function makeCampusContourTexture(
  THREE: typeof import("three"),
  rgb: [number, number, number],
  localPts: { x: number; y: number }[],
  backedShare: number,
  seed = 0,
  opts: { soft?: boolean; edgeRichness?: number } = {},
) {
  const soft = opts.soft !== false; // mid: soft overlap into continuous field
  const edgeRichness = opts.edgeRichness ?? 0.35;
  // Larger grid + pad so density falls to 0 before the sprite edge (no hard rect clip)
  const size = 256;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  const data = img.data;

  // Bounding radius of points → normalize into padded texture interior
  let maxR = 1;
  for (const p of localPts) maxR = Math.max(maxR, Math.hypot(p.x, p.y));
  maxR = Math.max(maxR, 1) * 1.12;
  const sigma = Math.max(soft ? 0.22 : 0.1, Math.min(soft ? 0.48 : 0.22, (soft ? 1.35 : 0.55) / Math.sqrt(Math.max(6, localPts.length))));
  // Extend world extent past cluster so soft kernels die before the texture rim
  const padFrac = soft ? 0.24 : 0.14; // n19: wider soft margin so denser mid never clips
  const worldHalf = maxR / (1 - 2 * padFrac);
  const twoSig2 = 2 * sigma * sigma;

  // Light edge noise (watercolor feel only — not a second encoding)
  let s = (Math.imul(seed + 31, 2654435761) >>> 0) || 1;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const N = 8;
  const grid = new Float32Array((N + 1) * (N + 1));
  for (let i = 0; i < grid.length; i++) grid[i] = rnd();
  const noise = (u: number, v: number) => {
    const gx = Math.min(N - 1e-6, Math.max(0, u * N));
    const gy = Math.min(N - 1e-6, Math.max(0, v * N));
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = gx - x0;
    const fy = gy - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const i = (x: number, y: number) => grid[x + y * (N + 1)];
    const a = i(x0, y0) * (1 - sx) + i(x0 + 1, y0) * sx;
    const b = i(x0, y0 + 1) * (1 - sx) + i(x0 + 1, y0 + 1) * sx;
    return a * (1 - sy) + b * sy;
  };

  // Saturation encoding: faint chroma when mostly unbacked (open lane)
  const satMul = satMulFromShare(backedShare);
  const [br, bg, bb] = rgb;
  // Desaturate toward luminance (not white) so low-share campuses stay readable chroma
  const lum = 0.3 * br + 0.59 * bg + 0.11 * bb;
  // Partial desat toward luminance (keeps more hue at every share; legend uses same satMul)
  const desat = (1 - satMul) * 0.65;
  const cr = Math.round(lum * desat + br * (1 - desat));
  const cg = Math.round(lum * desat + bg * (1 - desat));
  const cb = Math.round(lum * desat + bb * (1 - desat));

  // Density field
  const dens = new Float32Array(size * size);
  let dMax = 0;
  const step = localPts.length > 120 ? 2 : 1;
  for (let y = 0; y < size; y += step) {
    for (let x = 0; x < size; x += step) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      const px = (u - 0.5) * 2 * worldHalf;
      const py = (v - 0.5) * 2 * worldHalf;
      let d = 0;
      for (const pt of localPts) {
        const dx = (px - pt.x) / maxR;
        const dy = (py - pt.y) / maxR;
        d += Math.exp(-(dx * dx + dy * dy) / twoSig2);
      }
      dens[y * size + x] = d;
      if (d > dMax) dMax = d;
      if (step === 2 && x + 1 < size && y + 1 < size) {
        dens[y * size + x + 1] = d;
        dens[(y + 1) * size + x] = d;
        dens[(y + 1) * size + x + 1] = d;
      }
    }
  }
  const thresh = dMax * (soft ? 0.022 : 0.1);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      let d = dens[y * size + x];
      // Contour edge + light watercolor noise (richer when edgeRichness high)
      const n1 = noise(u, v);
      const n2 = noise(u * 1.7 + 0.3, v * 1.5 + 0.6);
      const warp = (n1 - 0.5) * (0.12 + edgeRichness * 0.28) + (n2 - 0.5) * edgeRichness * 0.2;
      d *= 0.9 + warp;
      const fall = soft ? 0.5 : 0.5;
      let a = d <= thresh ? 0 : Math.min(1, (d - thresh) / (dMax * fall + 1e-6));
      a = Math.pow(a, soft ? 0.5 : 0.9);
      // Paint-splotch scallops on the rim
      if (a > 0.08 && a < 0.55) {
        a *= 0.85 + edgeRichness * (n2 - 0.35);
      }
      if (a < 0.03) a = 0;
      a *= 0.88 + 0.12 * satMul; // denser continuous mid; chroma still via satMul RGB
      // Fade alpha to exactly 0 before each texture edge (kills hard rect clip)
      const edgeDist = Math.min(u, v, 1 - u, 1 - v);
      const fadeStart = padFrac * 0.85;
      if (edgeDist < fadeStart) {
        const tEdge = Math.max(0, edgeDist / fadeStart);
        a *= tEdge * tEdge * (3 - 2 * tEdge); // smoothstep
      }
      if (edgeDist < 1.5 / size) a = 0;
      const i = (y * size + x) * 4;
      data[i] = cr;
      data[i + 1] = cg;
      data[i + 2] = cb;
      data[i + 3] = Math.round(a * 255);
    }
  }
  // Guarantee outer pixels are fully clear (sprite clamp / bilinear safety)
  const borderClear = 2;
  for (let y = 0; y < size; y++) {
    for (let b = 0; b < borderClear; b++) {
      for (const x of [b, size - 1 - b]) {
        const i = (y * size + x) * 4 + 3;
        data[i] = 0;
      }
    }
  }
  for (let x = borderClear; x < size - borderClear; x++) {
    for (let b = 0; b < borderClear; b++) {
      for (const y of [b, size - 1 - b]) {
        const i = (y * size + x) * 4 + 3;
        data[i] = 0;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  assertBlobTextureBorderClear(c, "campus-contour", borderClear);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  // Clamp edges so sampling never wraps opaque rim
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  (tex as unknown as { userData: { canvas?: HTMLCanvasElement } }).userData = { canvas: c };
  return tex;
}

/** World scale so sprite area tracks founder count (radius ∝ √n). */
export function blobScaleForFounders(n: number, mobile = false): number {
  // n19: continuous mid field — larger overlap still ∝ √founders (padFrac keeps unclipped)
  const base = 40 + Math.sqrt(Math.max(1, n)) * (mobile ? 12.5 : 16);
  return Math.max(mobile ? 72 : 96, Math.min(mobile ? 250 : 360, base));
}
