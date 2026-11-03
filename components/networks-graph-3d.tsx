"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  YEAR_MIN_DEFAULT,
  cohortYearNow,
  countFoundersByYear,
  founderVisibleAtYear,
  type Deal,
  type Poster,
  type PosterHub,
} from "@/components/networks-poster-types";
import { NetworksTimeline } from "@/components/networks-timeline";

type Props = {
  investorHubs?: { id: string; label: string; founderCount: number; companyCount?: number }[];
  onSelectCompany?: (id: string) => void;
  onSelectNetwork?: (id: string) => void;
  onFallback2D?: () => void;
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  if (h.length === 3) {
    return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
  }
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function distToScale(dist: number): number {
  // Map camera distance to legacy 2D scale (0.7-5.5) for zoom-tier gates/shots.
  const t = clamp((1100 - dist) / 900, 0, 1);
  return 0.7 + t * 4.8;
}

function scaleToDist(scale: number): number {
  const t = clamp((scale - 0.7) / 4.8, 0, 1);
  return 1100 - t * 900;
}

export function NetworksGraph3D({ investorHubs, onSelectNetwork, onFallback2D }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const [poster, setPoster] = useState<Poster | null>(null);
  const [deals, setDeals] = useState<Record<string, Deal>>({});
  const [legendOtherOpen, setLegendOtherOpen] = useState(false);
  const [webglOk, setWebglOk] = useState(true);
  const yearMax = cohortYearNow();
  const yearMin = YEAR_MIN_DEFAULT;
  const [scrubYear, setScrubYear] = useState(yearMax);
  const [playing, setPlaying] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  const scrubRef = useRef(scrubYear);
  const playRef = useRef(false);
  const idleRef = useRef(0);
  const tierRef = useRef(0);

  useEffect(() => {
    scrubRef.current = scrubYear;
  }, [scrubYear]);
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
        if (!cancelled) onFallback2D?.();
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
  const noYearCount = poster?.totals.foundersNoYear ?? 0;
  const visibleCount = useMemo(() => {
    if (!poster?.year) return 0;
    return countFoundersByYear(poster.year, poster.kind, scrubYear, yearMax);
  }, [poster, scrubYear, yearMax]);

  // Hub label collision offsets in screen space (recomputed each frame into state lightly).
  const [hubLabelPos, setHubLabelPos] = useState<{ id: string; label: string; x: number; y: number }[]>([]);

  useEffect(() => {
    if (!poster || !mountRef.current || !webglOk) return;
    let disposed = false;
    let raf = 0;
    let renderer: import("three").WebGLRenderer | null = null;
    let controls: { dispose: () => void; update: () => void; autoRotate: boolean; target: import("three").Vector3; enableDamping: boolean } | null = null;

    (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      if (disposed || !mountRef.current) return;

      const p = poster;
      const el = mountRef.current;
      const w0 = el.clientWidth || 800;
      const h0 = el.clientHeight || 600;

      let glOk = true;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance", preserveDrawingBuffer: true });
      } catch {
        glOk = false;
      }
      if (!glOk || !renderer) {
        setWebglOk(false);
        onFallback2D?.();
        return;
      }

      renderer.setClearColor(0xfbfaf7, 1);
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(w0, h0, false);
      el.appendChild(renderer.domElement);
      renderer.domElement.style.display = "block";
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.cursor = "grab";

      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0xfbfaf7, 0.00115);

      const camera = new THREE.PerspectiveCamera(42, w0 / h0, 1, 5000);
      const cx = p.w / 2;
      const cy = p.h / 2;
      camera.position.set(cx, cy - 40, 780);
      camera.up.set(0, 0, 1);

      const ctrl = new OrbitControls(camera, renderer.domElement);
      ctrl.target.set(cx, cy, 0);
      ctrl.enableDamping = true;
      ctrl.dampingFactor = 0.08;
      ctrl.autoRotate = true;
      ctrl.autoRotateSpeed = 0.35;
      ctrl.minDistance = 180;
      ctrl.maxDistance = 1400;
      ctrl.maxPolarAngle = Math.PI * 0.92;
      ctrl.minPolarAngle = 0.08;
      controls = ctrl;

      // Soft ambient + hemisphere for white glow feel
      scene.add(new THREE.AmbientLight(0xffffff, 0.85));
      const hemi = new THREE.HemisphereLight(0xffffff, 0xe8e4dc, 0.55);
      scene.add(hemi);

      const zArr = p.z ?? p.x.map(() => 0);
      const yearArr = p.year ?? p.x.map(() => 0);

      // Founder + company points
      const n = p.x.length;
      const positions = new Float32Array(n * 3);
      const colors = new Float32Array(n * 3);
      const sizes = new Float32Array(n);
      const baseAlpha = new Float32Array(n);

      for (let i = 0; i < n; i++) {
        positions[i * 3] = p.x[i];
        positions[i * 3 + 1] = p.y[i];
        positions[i * 3 + 2] = zArr[i];
        let rgb: [number, number, number] = [148, 163, 184];
        if (p.kind[i] === 0) {
          const ci = p.campus[i];
          const col = ci >= 0 && p.campuses[ci] ? p.campuses[ci].color : "#94a3b8";
          rgb = hexToRgb(col);
          sizes[i] = Math.max(2.2, Math.min(5.5, p.r[i] * 1.15));
          baseAlpha[i] = 0.82;
        } else if (p.kind[i] === 1) {
          rgb = [148, 163, 184];
          sizes[i] = Math.max(1.6, Math.min(3.2, p.r[i]));
          baseAlpha[i] = 0.55;
        } else {
          rgb = [30, 41, 59];
          sizes[i] = Math.max(4, Math.min(9, p.r[i] * 1.4));
          baseAlpha[i] = 0.95;
        }
        colors[i * 3] = rgb[0] / 255;
        colors[i * 3 + 1] = rgb[1] / 255;
        colors[i * 3 + 2] = rgb[2] / 255;
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      geo.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

      const mat = new THREE.PointsMaterial({
        size: 3.2,
        vertexColors: true,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.88,
        depthWrite: false,
      });
      const points = new THREE.Points(geo, mat);
      scene.add(points);

      // Soft campus island discs (glow on white)
      const islandGroup = new THREE.Group();
      if (p.campusLabels) {
        for (const lab of p.campusLabels.slice(0, 10)) {
          const ci = p.campuses.findIndex((c) => c.id === lab.id);
          const col = ci >= 0 ? hexToRgb(p.campuses[ci].color) : [180, 190, 210];
          const discGeo = new THREE.CircleGeometry(Math.max(40, lab.r * 0.95), 48);
          const discMat = new THREE.MeshBasicMaterial({
            color: new THREE.Color(col[0] / 255, col[1] / 255, col[2] / 255),
            transparent: true,
            opacity: 0.14,
            depthWrite: false,
          });
          const disc = new THREE.Mesh(discGeo, discMat);
          disc.position.set(lab.x, lab.y, -6);
          islandGroup.add(disc);
          // Outer soft ring
          const ringGeo = new THREE.RingGeometry(Math.max(42, lab.r * 0.95), Math.max(56, lab.r * 1.25), 48);
          const ringMat = new THREE.MeshBasicMaterial({
            color: new THREE.Color(col[0] / 255, col[1] / 255, col[2] / 255),
            transparent: true,
            opacity: 0.08,
            depthWrite: false,
            side: THREE.DoubleSide,
          });
          const ring = new THREE.Mesh(ringGeo, ringMat);
          ring.position.set(lab.x, lab.y, -5);
          islandGroup.add(ring);
        }
      }
      scene.add(islandGroup);

      // Edges as line segments
      const maxE = p.e0.length;
      const edgePos = new Float32Array(maxE * 6);
      const edgeCol = new Float32Array(maxE * 6);
      for (let i = 0; i < maxE; i++) {
        const a = p.e0[i];
        const b = p.e1[i];
        edgePos[i * 6] = p.x[a];
        edgePos[i * 6 + 1] = p.y[a];
        edgePos[i * 6 + 2] = zArr[a];
        edgePos[i * 6 + 3] = p.x[b];
        edgePos[i * 6 + 4] = p.y[b];
        edgePos[i * 6 + 5] = zArr[b];
        const gray = 0.45;
        for (let k = 0; k < 6; k++) edgeCol[i * 6 + k] = gray;
      }
      const edgeGeo = new THREE.BufferGeometry();
      edgeGeo.setAttribute("position", new THREE.BufferAttribute(edgePos, 3));
      edgeGeo.setAttribute("color", new THREE.BufferAttribute(edgeCol, 3));
      const edgeMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
      });
      const edges = new THREE.LineSegments(edgeGeo, edgeMat);
      scene.add(edges);

      // Visibility buffers for year scrub
      const nodeVisible = new Uint8Array(n);
      const applyYearVisibility = (scrub: number) => {
        const ymax = yearMax;
        for (let i = 0; i < n; i++) {
          if (p.kind[i] === 0) {
            nodeVisible[i] = founderVisibleAtYear(yearArr[i], scrub, ymax) ? 1 : 0;
          } else if (p.kind[i] === 2) {
            nodeVisible[i] = 1;
          } else {
            // company: visible if any linked founder visible (approx: always soft)
            nodeVisible[i] = 1;
          }
        }
        // Hide founders without year and those not yet grown in by shrinking size via color alpha trick:
        // PointsMaterial has global opacity; instead zero-out size by pushing far or dimming color.
        const colAttr = geo.getAttribute("color") as import("three").BufferAttribute;
        const sizeAttr = geo.getAttribute("size") as import("three").BufferAttribute | undefined;
        for (let i = 0; i < n; i++) {
          const on = nodeVisible[i] === 1;
          if (p.kind[i] === 0) {
            const fade = on ? 1 : 0.02;
            colAttr.setXYZ(
              i,
              colors[i * 3] * fade,
              colors[i * 3 + 1] * fade,
              colors[i * 3 + 2] * fade,
            );
            if (sizeAttr) sizeAttr.setX(i, on ? sizes[i] : 0.01);
          }
        }
        colAttr.needsUpdate = true;
        if (sizeAttr) sizeAttr.needsUpdate = true;

        // Edge opacity by endpoints
        const ec = edgeGeo.getAttribute("color") as import("three").BufferAttribute;
        for (let i = 0; i < maxE; i++) {
          const a = p.e0[i];
          const b = p.e1[i];
          const aOk = p.kind[a] === 0 ? nodeVisible[a] : 1;
          const bOk = p.kind[b] === 0 ? nodeVisible[b] : 1;
          const v = aOk && bOk ? 0.42 : 0.02;
          ec.setXYZ(i * 2, v, v, v);
          ec.setXYZ(i * 2 + 1, v, v, v);
        }
        ec.needsUpdate = true;
      };
      applyYearVisibility(scrubRef.current);

      // Idle tracking
      const markActive = () => {
        idleRef.current = 0;
        ctrl.autoRotate = false;
      };
      renderer.domElement.addEventListener("pointerdown", markActive);
      renderer.domElement.addEventListener("wheel", markActive, { passive: true });

      // __NETWORKS_SET_SCALE__ bridge for screenshots
      const w = window as unknown as {
        __NETWORKS_POSTER__?: Poster;
        __NETWORKS_SET_SCALE__?: (scale: number) => void;
        __NETWORKS_FADE__?: number;
        __NETWORKS_SET_YEAR__?: (y: number) => void;
      };
      w.__NETWORKS_POSTER__ = p;
      w.__NETWORKS_FADE__ = 1;
      w.__NETWORKS_SET_SCALE__ = (scale: number) => {
        const dist = scaleToDist(scale);
        const dir = camera.position.clone().sub(ctrl.target).normalize();
        camera.position.copy(ctrl.target).add(dir.multiplyScalar(dist));
        ctrl.update();
      };
      w.__NETWORKS_SET_YEAR__ = (y: number) => {
        setScrubYear(clamp(y, yearMin, yearMax));
      };

      const ro = new ResizeObserver(() => {
        if (!mountRef.current || !renderer) return;
        const ww = mountRef.current.clientWidth;
        const hh = mountRef.current.clientHeight;
        camera.aspect = ww / Math.max(1, hh);
        camera.updateProjectionMatrix();
        renderer.setSize(ww, hh, false);
      });
      if (wrapRef.current) ro.observe(wrapRef.current);

      let lastPlayTick = 0;
      const tmp = new THREE.Vector3();
      const projectHubLabels = () => {
        const wrap = wrapRef.current;
        if (!wrap) return;
        const ww = wrap.clientWidth;
        const hh = wrap.clientHeight;
        const fit = Math.min(ww / p.w, hh / p.h);
        const ox = (ww - p.w * fit) / 2;
        const oy = (hh - p.h * fit) / 2;
        // Scale overlay with camera distance so zoom tiers still feel linked
        const dist = camera.position.distanceTo(ctrl.target);
        const sc = Math.max(0.85, Math.min(1.35, 900 / Math.max(200, dist)));
        const cx = ww / 2;
        const cy = hh / 2;
        const raw: { id: string; label: string; x: number; y: number }[] = [];
        for (const hub of p.hubs.slice(0, 10)) {
          let sx = ox + p.x[hub.i] * fit;
          let sy = oy + p.y[hub.i] * fit;
          sx = cx + (sx - cx) * sc;
          sy = cy + (sy - cy) * sc;
          raw.push({
            id: hub.id,
            label: hub.label.length > 22 ? `${hub.label.slice(0, 20)}...` : hub.label,
            x: sx,
            y: sy + 10,
          });
        }
        raw.sort((a, b) => a.y - b.y || a.x - b.x);
        for (let i = 0; i < raw.length; i++) {
          for (let j = 0; j < i; j++) {
            if (Math.abs(raw[i].x - raw[j].x) < 130 && Math.abs(raw[i].y - raw[j].y) < 14) {
              raw[i].y = raw[j].y + 14;
            }
          }
        }
        setHubLabelPos(raw);
      };

      let labelTick = 0;
      const tick = (t: number) => {
        if (disposed) return;
        raf = requestAnimationFrame(tick);

        // Play timeline
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
        } else {
          applyYearVisibility(scrubRef.current);
        }

        idleRef.current += 1;
        if (idleRef.current > 180) ctrl.autoRotate = true;

        ctrl.update();
        renderer!.render(scene, camera);

        const dist = camera.position.distanceTo(ctrl.target);
        const scale = distToScale(dist);
        const bloom = clamp((scale - 1.2) / 0.9, 0, 1) * (1 - clamp((scale - 2.55) / 0.55, 0, 1));
        const deep = clamp((scale - 2.45) / 0.7, 0, 1);
        const tier = deep > 0.55 ? 2 : bloom > 0.4 ? 1 : 0;
        if (tierRef.current !== tier) {
          tierRef.current = tier;
          setZoomScale(scale);
          wrapRef.current?.setAttribute("data-networks-zoom", String(tier));
        }
        wrapRef.current?.setAttribute("data-networks-fade", "1");

        // Mid zoom: strengthen island glow
        islandGroup.visible = true;
        islandGroup.traverse((obj) => {
          if ((obj as import("three").Mesh).isMesh) {
            const m = (obj as import("three").Mesh).material as import("three").MeshBasicMaterial;
            if (m && "opacity" in m) {
              m.opacity = tier === 0 ? 0.1 : tier === 1 ? 0.22 : 0.06;
            }
          }
        });
        edgeMat.opacity = tier === 2 ? 0.06 : 0.12;
        mat.opacity = tier === 2 ? 0.7 : 0.88;

        labelTick += 1;
        if (labelTick % 4 === 0) projectHubLabels();
      };
      raf = requestAnimationFrame(tick);

      // Initial fade attribute
      wrapRef.current?.setAttribute("data-networks-fade", "1");
      wrapRef.current?.setAttribute("data-networks-zoom", "0");

      return () => {
        renderer?.domElement.removeEventListener("pointerdown", markActive);
        renderer?.domElement.removeEventListener("wheel", markActive);
      };
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      controls?.dispose();
      if (renderer) {
        renderer.dispose();
        if (renderer.domElement.parentElement) renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
      const w = window as unknown as { __NETWORKS_SET_SCALE__?: unknown; __NETWORKS_SET_YEAR__?: unknown };
      delete w.__NETWORKS_SET_SCALE__;
      delete w.__NETWORKS_SET_YEAR__;
    };
  }, [poster, webglOk, onFallback2D, yearMax, yearMin]);

  // Campus labels (2D overlay projected approx via poster fit - use simple world mapping for out/mid)
  const campusLabels = poster?.campusLabels?.slice(0, 10) ?? [];

  const legendCampuses = poster?.campuses.filter((c) => c.id !== "other") ?? [];
  const legendTop = legendCampuses.slice(0, 6);
  const legendRest = legendCampuses.slice(6);
  const featuredDeal = poster?.featuredId ? deals[poster.featuredId] ?? null : null;
  const investors = investorHubs?.length
    ? investorHubs.map((h) => ({ id: h.id, label: h.label, founders: h.founderCount }))
    : poster?.investorHubs ?? [];

  if (!poster) {
    return <p className="px-4 py-10 text-sm text-[color:var(--fg-3)]">Loading network map...</p>;
  }

  return (
    <div className="w-full overflow-visible" data-networks-desk="" data-networks-dim="4d">
      <div
        ref={wrapRef}
        className="relative w-screen max-w-none touch-manipulation overflow-hidden bg-[#fbfaf7] left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] max-md:!h-[80vh]"
        style={{ height: "85vh" }}
        data-networks-graph=""
        data-networks-fade="0"
        data-networks-zoom="0"
        data-networks-engine="webgl"
      >
        <div ref={mountRef} className="absolute inset-0 h-full w-full" />

        {/* Campus labels */}
        <div
          className="pointer-events-none absolute inset-0 z-[1]"
          style={{ opacity: Math.max(0.15, 1 - Math.max(0, (zoomScale - 2.3) / 0.8)) }}
        >
          {campusLabels.map((lab) => {
            // Approximate with normalized poster coords into wrap
            const wrap = wrapRef.current;
            const ww = wrap?.clientWidth ?? 1200;
            const hh = wrap?.clientHeight ?? 800;
            const fit = Math.min(ww / poster.w, hh / poster.h);
            const ox = (ww - poster.w * fit) / 2;
            const oy = (hh - poster.h * fit) / 2;
            const lx = ox + lab.x * fit;
            const ly = oy + lab.y * fit;
            return (
              <div
                key={lab.id}
                data-canvas-label={lab.id}
                data-label-anchor-x={lx}
                data-label-anchor-y={ly}
                data-hub-x={lx}
                data-hub-y={ly}
                data-hub-r={Math.max(36, lab.r * fit)}
                className="absolute -translate-x-1/2 -translate-y-1/2 text-center text-[11px] font-medium tracking-wide text-[color:var(--fg)] md:text-[13px]"
                style={{ left: lx, top: ly, textShadow: "0 0 4px #fbfaf7, 0 1px 2px #fbfaf7" }}
              >
                {lab.label}
              </div>
            );
          })}
          {hubLabelPos.map((hub) => (
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
          noYearCount={noYearCount}
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
          Drag to orbit · scroll to zoom · idle auto-rotates
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
              <div className="text-[10px] text-[color:var(--fg-3)]" data-networks-deal-networks="" data-networks-deal-networks-total={(featuredDeal.networks ?? []).length}>
                Networks ({(featuredDeal.networks ?? []).length.toLocaleString("en-US")}): {(featuredDeal.networks ?? []).slice(0, 2).join(", ") || "none on file yet"}
              </div>
              <div className="text-[10px] text-[color:var(--fg-3)]" data-networks-deal-investors="" data-networks-deal-investors-total={(featuredDeal.investors ?? []).length}>
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
          <ol className="divide-y divide-[color:var(--line)]">
            {investors.slice(0, 6).map((row, index) => (
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
