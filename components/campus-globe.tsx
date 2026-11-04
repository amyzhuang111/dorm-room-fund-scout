"use client";

import { useEffect, useRef, useState } from "react";
import { GLOBE_MAP_SAMPLES, GLOBE_PHI, GLOBE_THETA, markerSize, projectCampus } from "@/lib/domain/globe-projection";

export interface GlobeCampus {
  id: string;
  name: string;
  lat: number;
  lon: number;
  founders: number;
  signals: number;
}

// Dark cobe sphere: lit gray dot land, warm rim, orange markers.
const LAND: [number, number, number] = [0.45, 0.47, 0.5];
const POINT: [number, number, number] = [1, 0.4, 0];
const HOT: [number, number, number] = [1, 0.72, 0.35];
const GLOW: [number, number, number] = [0.42, 0.2, 0.08];

function nearestCampus(campuses: GlobeCampus[], phi: number, theta: number, size: number, x: number, y: number): GlobeCampus | null {
  let best: GlobeCampus | null = null;
  let bestDistance = 22;
  for (const campus of campuses) {
    const point = projectCampus(campus.lat, campus.lon, phi, theta, size);
    if (!point.front) continue;
    const distance = Math.hypot(point.x - x, point.y - y);
    if (distance < bestDistance) {
      best = campus;
      bestDistance = distance;
    }
  }
  return best;
}

export function CampusGlobe({
  campuses,
  height,
  selectedId,
  onSelect,
}: {
  campuses: GlobeCampus[];
  height: number;
  selectedId?: string | null;
  onSelect: (id: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const frame = useRef({
    phi: GLOBE_PHI,
    theta: GLOBE_THETA,
    dragging: false,
    moved: 0,
    lastX: 0,
    lastY: 0,
    velPhi: 0,
    velTheta: 0,
    hoverId: null as string | null,
    reduce: false,
  });
  const [size, setSize] = useState(height);
  const campusesRef = useRef(campuses);
  const selectedRef = useRef(selectedId);
  useEffect(() => {
    campusesRef.current = campuses;
    selectedRef.current = selectedId;
  });
  const [hover, setHover] = useState<{ campus: GlobeCampus; x: number; y: number } | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () => {
      const next = Math.round(wrap.clientWidth);
      if (next > 0) setSize(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size < 2) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => {
      frame.current.reduce = motion.matches;
    };
    syncMotion();
    motion.addEventListener("change", syncMotion);

    let destroyed = false;
    let globe: { destroy: () => void } | null = null;
    const pixelRatio = 2;

    void import("cobe").then(({ default: createGlobe }) => {
      if (destroyed || !canvasRef.current) return;
      const view = canvasRef.current;
      globe = createGlobe(view, {
        devicePixelRatio: pixelRatio,
        width: size * pixelRatio,
        height: size * pixelRatio,
        phi: frame.current.phi,
        theta: frame.current.theta,
        dark: 1,
        diffuse: 1.8,
        mapSamples: GLOBE_MAP_SAMPLES,
        mapBrightness: 6,
        mapBaseBrightness: 0,
        baseColor: LAND,
        markerColor: POINT,
        glowColor: GLOW,
        markers: [],
        opacity: 1,
        onRender: (state: Record<string, unknown>) => {
          const current = frame.current;
          if (!current.dragging) {
            const spinning = Math.abs(current.velPhi) > 0.00008 || Math.abs(current.velTheta) > 0.00008;
            if (spinning) {
              current.phi += current.velPhi;
              current.theta = Math.max(-0.35, Math.min(0.6, current.theta + current.velTheta));
              current.velPhi *= 0.94;
              current.velTheta *= 0.94;
            } else if (!current.reduce && !current.hoverId) {
              current.phi += 0.0036;
            }
          }
          const list = campusesRef.current;
          const peak = Math.max(1, ...list.map((campus) => campus.signals));
          state.phi = current.phi;
          state.theta = current.theta;
          state.width = size * pixelRatio;
          state.height = size * pixelRatio;
          state.markers = list.map((campus) => {
            const hot = campus.id === current.hoverId || campus.id === selectedRef.current;
            return {
              location: [campus.lat, campus.lon] as [number, number],
              size: markerSize(campus.signals, peak) * (hot ? 1.35 : 1),
              color: hot ? HOT : POINT,
            };
          });
        },
      });
    });

    return () => {
      destroyed = true;
      motion.removeEventListener("change", syncMotion);
      globe?.destroy();
    };
  }, [size]);

  function pointer(event: React.PointerEvent<HTMLCanvasElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top, view: bounds.width };
  }

  function trackHover(x: number, y: number, view: number) {
    const campus = nearestCampus(campusesRef.current, frame.current.phi, frame.current.theta, view, x, y);
    frame.current.hoverId = campus?.id ?? null;
    if (!campus) {
      setHover(null);
      return;
    }
    const point = projectCampus(campus.lat, campus.lon, frame.current.phi, frame.current.theta, view);
    setHover({ campus, x: point.x, y: point.y });
  }

  return (
    <div ref={wrapRef} className="relative mx-auto aspect-square w-full" style={{ maxWidth: height }}>
      <canvas
        ref={canvasRef}
        aria-label="Campus globe"
        className="h-full w-full cursor-grab active:cursor-grabbing"
        style={{ touchAction: "none" }}
        onPointerDown={(event) => {
          const point = pointer(event);
          frame.current.dragging = true;
          frame.current.moved = 0;
          frame.current.velPhi = 0;
          frame.current.velTheta = 0;
          frame.current.lastX = point.x;
          frame.current.lastY = point.y;
          frame.current.hoverId = null;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const point = pointer(event);
          if (frame.current.dragging) {
            const dx = point.x - frame.current.lastX;
            const dy = point.y - frame.current.lastY;
            frame.current.lastX = point.x;
            frame.current.lastY = point.y;
            const dPhi = dx / 280;
            const dTheta = dy / 400;
            frame.current.moved += Math.hypot(dx, dy);
            frame.current.phi += dPhi;
            frame.current.theta = Math.max(-0.35, Math.min(0.6, frame.current.theta + dTheta));
            frame.current.velPhi = dPhi;
            frame.current.velTheta = dTheta;
            setHover(null);
            return;
          }
          trackHover(point.x, point.y, point.view);
        }}
        onPointerUp={(event) => {
          const point = pointer(event);
          const dragged = frame.current.moved > 6;
          frame.current.dragging = false;
          if (!dragged) {
            frame.current.velPhi = 0;
            frame.current.velTheta = 0;
            const campus = nearestCampus(campusesRef.current, frame.current.phi, frame.current.theta, point.view, point.x, point.y);
            if (campus) onSelect(campus.id);
          }
          trackHover(point.x, point.y, point.view);
        }}
        onPointerLeave={() => {
          frame.current.dragging = false;
          frame.current.hoverId = null;
          setHover(null);
        }}
      />
      {hover ? (
        <div
          className="pointer-events-none absolute z-10 w-max max-w-[240px] -translate-x-1/2 -translate-y-full rounded border border-line bg-raised px-2.5 py-1.5 text-left shadow-[0_8px_24px_rgba(0,0,0,0.28)]"
          style={{ left: hover.x, top: Math.max(8, hover.y - 10) }}
          role="status"
        >
          <p className="text-[13px] font-medium leading-4 text-fg">{hover.campus.name}</p>
          <p className="mt-0.5 text-[12px] leading-4 text-fg-2">
            <span className="num text-fg">{hover.campus.founders.toLocaleString("en-US")}</span> founders
            {" · "}
            <span className="num text-fg">{hover.campus.signals.toLocaleString("en-US")}</span> signals
          </p>
        </div>
      ) : null}
      <ul className="sr-only">
        {campuses.map((campus) => (
          <li key={campus.id}>
            <button type="button" onClick={() => onSelect(campus.id)}>
              {campus.name}, {campus.founders.toLocaleString("en-US")} founders, {campus.signals.toLocaleString("en-US")} signals
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
