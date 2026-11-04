"use client";

import { useEffect } from "react";
import type { Map as LibreMap } from "maplibre-gl";

/** Degrees of longitude per millisecond. About 8 degrees a second, one turn in 45 seconds. */
const DEGREES_PER_MS = 0.008;
const RESUME_MS = 900;

/** A slow orbit at globe scale. Drag and zoom pause it. A resting pointer does not. */
export function useGlobeRotation(map: LibreMap | null, enabled: boolean) {
  useEffect(() => {
    if (!map || !enabled) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let previous = 0;
    let gesturing = false;
    let pauseUntil = 0;
    const pause = () => {
      gesturing = true;
    };
    const resume = () => {
      gesturing = false;
      pauseUntil = performance.now() + RESUME_MS;
    };
    map.on("dragstart", pause);
    map.on("dragend", resume);
    map.on("zoomstart", pause);
    map.on("zoomend", resume);
    const wheel = () => {
      pauseUntil = performance.now() + RESUME_MS;
    };
    map.on("wheel", wheel);
    const tick = (time: number) => {
      const delta = previous ? Math.min(time - previous, 50) : 0;
      previous = time;
      const idle = !gesturing && time >= pauseUntil;
      if (!motion.matches && !document.hidden && idle && map.getZoom() < 4 && !map.isMoving()) {
        const center = map.getCenter();
        map.jumpTo({ center: [center.lng - delta * DEGREES_PER_MS, center.lat] });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      map.off("dragstart", pause);
      map.off("dragend", resume);
      map.off("zoomstart", pause);
      map.off("zoomend", resume);
      map.off("wheel", wheel);
    };
  }, [map, enabled]);
}
