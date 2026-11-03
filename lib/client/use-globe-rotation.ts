"use client";

import { useEffect } from "react";
import type { Map as LibreMap } from "maplibre-gl";

/** A slow orbit at globe scale. User input always wins over animation. */
export function useGlobeRotation(map: LibreMap | null, enabled: boolean) {
  useEffect(() => {
    if (!map || !enabled) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const canvas = map.getCanvas();
    let frame = 0;
    let previous = 0;
    let pointerOver = false;
    let pauseUntil = 0;
    const enter = () => { pointerOver = true; };
    const leave = () => { pointerOver = false; pauseUntil = performance.now() + 1500; };
    const hold = () => { pauseUntil = performance.now() + 8000; };
    const tick = (time: number) => {
      const delta = previous ? Math.min(time - previous, 50) : 0;
      previous = time;
      if (!motion.matches && !document.hidden && !pointerOver && time >= pauseUntil && map.getZoom() < 4 && !map.isMoving()) {
        const center = map.getCenter();
        map.jumpTo({center: [center.lng - delta * 0.003, center.lat]});
      }
      frame = requestAnimationFrame(tick);
    };
    canvas.addEventListener("pointerenter", enter);
    canvas.addEventListener("pointerleave", leave);
    canvas.addEventListener("pointerdown", hold);
    canvas.addEventListener("wheel", hold, {passive: true});
    canvas.addEventListener("keydown", hold);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      canvas.removeEventListener("pointerenter", enter);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("pointerdown", hold);
      canvas.removeEventListener("wheel", hold);
      canvas.removeEventListener("keydown", hold);
    };
  }, [map, enabled]);
}
