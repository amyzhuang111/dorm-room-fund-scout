/**
 * Convert a pointer/touch event into MapLibre CSS-pixel coordinates.
 * Always re-reads getBoundingClientRect (stale rect after Clear/scroll is a
 * common miss). Corrects for CSS transform scale (rect vs clientWidth) and
 * never multiplies by devicePixelRatio (MapLibre points are CSS pixels).
 */
export function mapPointFromPointer(
  container: { getBoundingClientRect: () => DOMRect; clientWidth: number; clientHeight: number },
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const rect = container.getBoundingClientRect();
  const layoutW = Math.max(1, container.clientWidth);
  const layoutH = Math.max(1, container.clientHeight);
  const scaleX = rect.width / layoutW;
  const scaleY = rect.height / layoutH;
  return {
    x: (clientX - rect.left) / (scaleX || 1),
    y: (clientY - rect.top) / (scaleY || 1),
  };
}

export function clientPointFromEvent(event: Event | undefined | null): { clientX: number; clientY: number } | null {
  if (!event) return null;
  if ("changedTouches" in event) {
    const t = (event as TouchEvent).changedTouches?.[0] ?? (event as TouchEvent).touches?.[0];
    if (t) return { clientX: t.clientX, clientY: t.clientY };
  }
  if ("clientX" in event && typeof (event as MouseEvent).clientX === "number") {
    return { clientX: (event as MouseEvent).clientX, clientY: (event as MouseEvent).clientY };
  }
  return null;
}

export type ProjectedMarker = {
  id: string;
  name: string;
  founders: number;
  signals: number;
  country: string;
  x: number;
  y: number;
  dist: number;
};

/** Nearest projected campus to a map-local CSS point. */
export function nearestProjectedMarker(
  point: { x: number; y: number },
  markers: { id: string; name: string; founders: number; signals: number; country: string; x: number; y: number }[],
  maxDist: number,
): ProjectedMarker | null {
  let best: ProjectedMarker | null = null;
  for (const m of markers) {
    const dist = Math.hypot(m.x - point.x, m.y - point.y);
    if (dist > maxDist) continue;
    if (!best || dist < best.dist) best = { ...m, dist };
  }
  return best;
}

/** Format miss diagnostics: computed point vs nearest markers. */
export function formatMapHitMiss(
  point: { x: number; y: number },
  nearest: { id: string; name: string; x: number; y: number; dist: number }[],
): string {
  const near = nearest
    .slice(0, 5)
    .map((m) => `${m.id}@(${m.x.toFixed(1)},${m.y.toFixed(1)}) d=${m.dist.toFixed(1)}`)
    .join("; ");
  return `miss point=(${point.x.toFixed(1)},${point.y.toFixed(1)}) nearest=[${near}]`;
}
