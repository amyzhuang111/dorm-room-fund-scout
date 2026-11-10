/**
 * When the basemap may leave the loading state.
 * A vector-tile event plus settled requests is the ready signal.
 * The first canvas render, an idle frame, or a short timer is not.
 * Ready means the vector source reported tile content. It is not a pixel sample.
 */
export const GLOBE_TILE_WAIT_MS = 12000;

export function globeLoadDecision(input: {
  vectorTileArrived: boolean;
  tilesSettled: boolean;
  timedOut: boolean;
}): "loading" | "ready" | "error" {
  if (input.vectorTileArrived && input.tilesSettled) return "ready";
  if (input.timedOut && input.vectorTileArrived) return "ready";
  if (input.timedOut) return "error";
  return "loading";
}
