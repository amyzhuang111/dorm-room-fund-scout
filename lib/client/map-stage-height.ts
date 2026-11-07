/**
 * Stage height for the home globe.
 * On a phone the disk is sized from the shorter side. A stage much taller than
 * that disk paints the style background as a blank band across the top.
 */
export function mapStageHeight(viewportWidth: number, viewportHeight: number): number {
  const wide = viewportWidth >= 1024;
  if (wide) return Math.max(520, Math.min(720, Math.round(viewportHeight * 0.7)));
  const side = Math.min(viewportWidth, Math.round(viewportHeight * 0.62));
  return Math.max(280, side);
}

/** Vertical pixels of stage that are not the globe disk. globeView uses 0.96 of the shorter side. */
export function globeVerticalSlack(viewportWidth: number, viewportHeight: number): number {
  const stage = mapStageHeight(viewportWidth, viewportHeight);
  const diameter = Math.min(viewportWidth, stage) * 0.96;
  return stage - diameter;
}
