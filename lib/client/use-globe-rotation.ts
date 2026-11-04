"use client";

import { useEffect } from "react";
import type { Map as LibreMap } from "maplibre-gl";

/** Degrees of longitude per millisecond. About 8 degrees a second, one turn in 45 seconds. */
const DEGREES_PER_MS = 0.008;

type CenterTransform = { setCenter: (center: { lng: number; lat: number }) => void };

/** A slow orbit at every zoom. Drag pauses it. Zoom does not. */
export function useGlobeRotation(map: LibreMap | null, enabled: boolean) {
  useEffect(() => {
    if (!map || !enabled) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let previous = 0;
    let dragging = false;
    const pause = () => {
      dragging = true;
    };
    const resume = () => {
      dragging = false;
    };
    map.on("dragstart", pause);
    map.on("dragend", resume);
    const tick = (time: number) => {
      const delta = previous ? Math.min(time - previous, 50) : 0;
      previous = time;
      if (!motion.matches && !document.hidden && !dragging && delta > 0) {
        const center = map.getCenter();
        const next = { lng: center.lng - delta * DEGREES_PER_MS, lat: center.lat };
        const zooming = map.isZooming() || Boolean((map as LibreMap & { isEasing?: () => boolean }).isEasing?.());
        if (zooming) {
          // jumpTo aborts the gesture. The live transform accepts a center without stopping the zoom.
          const transform = (map as unknown as { transform?: CenterTransform }).transform;
          transform?.setCenter(next);
          map.triggerRepaint();
        } else {
          map.jumpTo({ center: [next.lng, next.lat] });
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      map.off("dragstart", pause);
      map.off("dragend", resume);
    };
  }, [map, enabled]);
}
