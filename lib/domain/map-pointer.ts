/**
 * Convert a pointer/touch event into MapLibre CSS-pixel coordinates.
 * Corrects for CSS transform scale on the map container (getBoundingClientRect
 * vs clientWidth) and never multiplies by devicePixelRatio (MapLibre points
 * are CSS pixels, not device pixels).
 */
export function mapPointFromPointer(
  container: { getBoundingClientRect: () => DOMRect; clientWidth: number; clientHeight: number },
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const rect = container.getBoundingClientRect();
  const layoutW = Math.max(1, container.clientWidth);
  const layoutH = Math.max(1, container.clientHeight);
  // Visual size / layout size — 1 when unscaled; ≠1 under CSS transform: scale(...)
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
